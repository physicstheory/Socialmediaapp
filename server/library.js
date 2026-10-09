// The Discover library: TikTok videos curated for everyone's Discover tab.
// Loaded from discover-library.json at startup (so it survives restarts on hosts without a disk),
// plus links admins paste in-app (Settings → Discover library).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, save } from './db.js';
import { analyzeText, rateFlags, categorize, RATINGS, CATEGORIES } from './moderation.js';
import { parseTikTokUrl, fetchOEmbed } from './tiktok.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY_FILE = process.env.LIBRARY_FILE || path.join(ROOT, 'discover-library.json');
const PICKS_USERNAME = 'ember.picks';

export function isAdmin(user) {
  const admins = (process.env.ADMIN_USERNAMES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(user.username);
}

export function picksAccount() {
  let u = db.users.find((x) => x.username === PICKS_USERNAME);
  if (!u) {
    u = {
      id: crypto.randomUUID(), username: PICKS_USERNAME, displayName: 'Ember Picks', passwordHash: null,
      birthdate: '1990-01-01', avatarColor: '#FF3B2F', friendCode: 'EMB-PICKS0', bio: 'Trending videos picked for Discover',
      settings: { privateAccount: false, friendRequests: 'code', filters: {}, interests: [], blockedWords: [], onboarded: true },
      pinHash: null, createdAt: Date.now(), system: true,
    };
    db.users.push(u);
  }
  return u;
}

/** Adds one TikTok link to the library. Returns { ok } or { error }. */
export async function addToLibrary({ url, category, rating }) {
  const parsed = parseTikTokUrl(url);
  if (!parsed) return { error: 'Not a TikTok link' };
  const known = db.posts.find((p) => p.source === 'tiktok' && (p.tiktokUrl === parsed.url || (parsed.videoId && p.videoId === parsed.videoId)));
  if (known) return { ok: true, duplicate: true };
  const oembed = await fetchOEmbed(parsed.url);
  const videoId = oembed?.videoId || parsed.videoId;
  if (!videoId) return { error: 'Could not read video' };
  if (db.posts.some((p) => p.source === 'tiktok' && p.videoId === videoId)) return { ok: true, duplicate: true };
  const title = oembed?.title?.slice(0, 300) || '';
  const { flags, severe } = analyzeText(title);
  if (severe.length) return { error: 'Blocked by safety filter' };
  const label = RATINGS.includes(rating) ? rating : 'teen'; // unknown pixels → don't assume kid-safe
  db.posts.push({
    id: crypto.randomUUID(), authorId: picksAccount().id, source: 'tiktok', videoId, tiktokUrl: parsed.url,
    thumbnailUrl: oembed?.thumbnailUrl || null, tiktokTitle: title, tiktokAuthor: oembed?.authorName || '', caption: '',
    category: CATEGORIES[category] ? category : categorize(title), flags, rating: rateFlags(flags, label),
    hidden: false, reports: [], library: true, createdAt: Date.now(),
  });
  save();
  return { ok: true };
}

export async function loadLibraryFile() {
  let entries = [];
  try {
    entries = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8')).videos || [];
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('discover-library.json is not valid JSON:', e.message);
    return;
  }
  let added = 0;
  for (const entry of entries) {
    const r = await addToLibrary(entry);
    if (r.ok && !r.duplicate) added++;
  }
  if (added) console.log(`Discover library: added ${added} video(s)`);
}
