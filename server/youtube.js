// YouTube Shorts for Discover, via the official YouTube Data API v3.
// Set YOUTUBE_API_KEY to turn it on. Videos are fetched lazily per interest when people open
// Discover, with SafeSearch "strict", and played in YouTube's privacy-enhanced embed player.
//
// Quota: a search costs 100 units and the free daily quota is 10,000, so we cap our own usage
// and only fetch a topic again after a cool-down. YouTube's terms say API data shouldn't be kept
// longer than 30 days without refreshing, so older Shorts are pruned automatically.
import crypto from 'node:crypto';
import { db, save } from './db.js';
import { analyzeText, rateFlags, CATEGORIES } from './moderation.js';
import { picksAccount } from './library.js';

const API = 'https://www.googleapis.com/youtube/v3';
const DAILY_UNIT_BUDGET = Number(process.env.YOUTUBE_DAILY_UNITS) || 9000;
const REFILL_BELOW = 40; // fetch more when a topic has fewer Shorts than this
const COOLDOWN_MS = 10 * 60e3; // per topic, between fetches
const MAX_AGE_MS = 30 * 864e5;
const MAX_SECONDS = 180;

export const QUERIES = {
  comedy: ['funny shorts', 'comedy skit shorts', 'try not to laugh shorts'],
  music: ['music cover shorts', 'singing shorts', 'guitar shorts'],
  dance: ['dance trend shorts', 'dance challenge shorts', 'choreography shorts'],
  sports: ['sports highlights shorts', 'football skills shorts', 'basketball shorts'],
  gaming: ['minecraft shorts', 'gaming moments shorts', 'roblox shorts'],
  animals: ['cute animals shorts', 'funny dogs shorts', 'funny cats shorts'],
  food: ['recipe shorts', 'cooking hacks shorts', 'baking shorts'],
  education: ['science facts shorts', 'space facts shorts', 'history facts shorts'],
  art: ['drawing shorts', 'diy craft shorts', 'painting shorts'],
  nature: ['nature shorts', 'travel shorts', 'ocean animals shorts'],
  tech: ['tech gadgets shorts', 'coding shorts', 'robot shorts'],
  fashion: ['outfit ideas shorts', 'sneaker shorts', 'hairstyle shorts'],
  edits: ['edit shorts', 'movie edit shorts', 'football edit shorts'],
  movies: ['movie scenes shorts', 'tv show clips shorts', 'movie trailer shorts'],
};

const state = {}; // category -> { term, pageToken, lastFetch, busy }
let usage = { day: '', units: 0 };

export const youtubeEnabled = () => Boolean(process.env.YOUTUBE_API_KEY);

function spend(units) {
  const day = new Date().toISOString().slice(0, 10);
  if (usage.day !== day) usage = { day, units: 0 };
  if (usage.units + units > DAILY_UNIT_BUDGET) return false;
  usage.units += units;
  return true;
}

function seconds(iso = '') {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : Infinity;
}

async function get(endpoint, params) {
  const qs = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${API}/${endpoint}?${qs}`, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`YouTube API ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const countFor = (cat) => db.posts.filter((p) => p.source === 'youtube' && p.category === cat).length;

/** Fetch one page of Shorts for a topic and add the safe ones as Discover posts. */
export async function fetchCategory(cat) {
  const s = (state[cat] ||= { term: 0, pageToken: '', lastFetch: 0, busy: false });
  if (s.busy || !QUERIES[cat] || !spend(101)) return 0;
  s.busy = true;
  s.lastFetch = Date.now();
  try {
    const search = await get('search', {
      part: 'id', type: 'video', videoDuration: 'short', videoEmbeddable: 'true', safeSearch: 'strict',
      maxResults: '50', relevanceLanguage: 'en', q: QUERIES[cat][s.term], ...(s.pageToken ? { pageToken: s.pageToken } : {}),
    });
    // Rotate through search terms and pages so each fetch brings new videos.
    s.pageToken = search.nextPageToken || '';
    if (!s.pageToken) s.term = (s.term + 1) % QUERIES[cat].length;
    const known = new Set(db.posts.filter((p) => p.source === 'youtube').map((p) => p.videoId));
    const ids = (search.items || []).map((i) => i.id?.videoId).filter((id) => id && !known.has(id));
    if (!ids.length) return 0;
    const details = await get('videos', { part: 'snippet,status,contentDetails', id: ids.join(',') });
    const author = picksAccount();
    let added = 0;
    for (const v of details.items || []) {
      if (!v.status?.embeddable || v.status?.privacyStatus !== 'public') continue;
      if (seconds(v.contentDetails?.duration) > MAX_SECONDS) continue;
      const title = String(v.snippet?.title || '').slice(0, 300);
      const text = `${title} ${(v.snippet?.tags || []).join(' ')}`;
      const { flags, severe } = analyzeText(text);
      if (severe.length) continue;
      // "Made for kids" videos are rated Everyone; everything else starts at Teen 13+ (we can't see the pixels).
      const rating = rateFlags(flags, v.status.madeForKids ? 'everyone' : 'teen');
      const thumbs = v.snippet?.thumbnails || {};
      db.posts.push({
        id: crypto.randomUUID(), authorId: author.id, source: 'youtube', videoId: v.id,
        youtubeUrl: `https://www.youtube.com/shorts/${v.id}`,
        thumbnailUrl: (thumbs.high || thumbs.medium || thumbs.default)?.url || null,
        tiktokTitle: title, tiktokAuthor: String(v.snippet?.channelTitle || '').slice(0, 80), caption: '',
        category: cat, flags, rating, hidden: false, reports: [], library: true, createdAt: Date.now(),
      });
      added++;
    }
    if (added) save();
    return added;
  } catch (e) {
    console.error(`[youtube] ${cat}:`, e.message);
    return 0;
  } finally {
    s.busy = false;
  }
}

/**
 * Make sure Discover has Shorts for these topics. `more` = the viewer is running out of videos,
 * so fetch the next page even if we already have plenty.
 */
export async function ensureShorts(categories, { more = false, waitMs = 4500 } = {}) {
  if (!youtubeEnabled()) return;
  const cats = (categories.length ? categories : Object.keys(QUERIES)).filter((c) => QUERIES[c] && CATEGORIES[c]);
  const due = cats.filter((c) => {
    const s = state[c];
    if (s?.busy) return false;
    if (s && Date.now() - s.lastFetch < (more ? 60e3 : COOLDOWN_MS)) return false;
    return more || countFor(c) < REFILL_BELOW;
  }).slice(0, 4);
  if (!due.length) return;
  const work = Promise.all(due.map(fetchCategory));
  // Don't keep the person waiting long: return after waitMs and let the rest finish in the background.
  await Promise.race([work, new Promise((r) => setTimeout(r, waitMs))]);
}

export function pruneShorts() {
  const before = db.posts.length;
  const cutoff = Date.now() - MAX_AGE_MS;
  db.posts = db.posts.filter((p) => !(p.source === 'youtube' && p.createdAt < cutoff));
  if (db.posts.length !== before) save();
}
