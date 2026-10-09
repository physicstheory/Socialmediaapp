// Creates demo accounts, friendships and videos so you can try Ember right away.
//   npm run seed            (adds demo data; keeps existing data)
//   npm run seed -- --reset (wipes the database first)
import crypto from 'node:crypto';
import { db, reset, initDb, closeDb } from './db.js';
import { hashSecret } from './auth.js';
import { defaultSettings, ageFromBirthdate } from './policy.js';
import { analyzeText, rateFlags, categorize } from './moderation.js';
import { pairKey } from './social.js';

await initDb();
if (process.argv.includes('--reset')) reset();

const yearsAgo = (n) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - n);
  return d.toISOString().slice(0, 10);
};

let codeN = 0;
function user(username, displayName, age, color, extra = {}) {
  const existing = db.users.find((u) => u.username === username);
  if (existing) return existing;
  const birthdate = yearsAgo(age);
  const settings = { ...defaultSettings(ageFromBirthdate(birthdate)), onboarded: true, interests: ['comedy', 'animals', 'nature', 'music', 'food'], ...extra.settings };
  const u = {
    id: crypto.randomUUID(), username, displayName, passwordHash: hashSecret('ember-demo-123'), birthdate,
    avatarColor: color, friendCode: `EMB-DEMO${String(++codeN).padStart(2, '0')}`, bio: extra.bio || '', settings,
    pinHash: extra.pin ? hashSecret(extra.pin) : null, createdAt: Date.now() - 90 * 864e5,
  };
  db.users.push(u);
  return u;
}

function friends(a, b) {
  const key = pairKey(a.id, b.id);
  if (!db.friendships.some((f) => f.key === key)) db.friendships.push({ key, a: a.id, b: b.id, createdAt: Date.now() });
}

function post(author, fields, hoursAgo) {
  const text = `${fields.caption || ''} ${fields.tiktokTitle || ''}`;
  const { flags } = analyzeText(text);
  db.posts.push({
    id: crypto.randomUUID(), authorId: author.id, hidden: false, reports: [],
    flags, rating: rateFlags(flags, fields.selfLabel), category: categorize(text, fields.category),
    createdAt: Date.now() - hoursAgo * 36e5, ...fields,
  });
}

// CC0 / openly licensed sample clips hosted by MDN & W3Schools, used as demo "uploads".
const FLOWER = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const BUNNY = 'https://www.w3schools.com/html/mov_bbb.mp4';

const demo = user('demo', 'Demo You', 25, '#FF3B2F', { bio: 'Trying out Ember 🔥' });
const alex = user('alex.r', 'Alex Rivera', 27, '#FF8A00', { bio: 'plants + bad puns' });
const sam = user('sam_k', 'Sam Kim', 31, '#E63946', { bio: 'weekend hiker' });
const jordan = user('jordan', 'Jordan (15)', 15, '#F77F00', { bio: 'teen demo account' });
const riley = user('riley', 'Riley (14)', 14, '#FCA311');
const kiddo = user('kiddo', 'Kiddo (10)', 10, '#FFB300', { pin: '1234' });
const pub = user('nature.daily', 'Nature Daily', 35, '#D62828', { bio: 'public creator account', settings: { privateAccount: false } });

friends(demo, alex);
friends(demo, sam);
friends(jordan, riley);
friends(kiddo, jordan);

if (!db.posts.length) {
  post(alex, { source: 'external', videoUrl: FLOWER, caption: 'My garden finally bloomed 🌸 #nature #flowers', category: 'nature' }, 2);
  post(sam, { source: 'external', videoUrl: BUNNY, caption: 'Bunny vibes for your feed 🐰 #animals #funny', category: 'animals' }, 5);
  post(sam, {
    source: 'tiktok', videoId: '6718335390845095173', tiktokUrl: 'https://www.tiktok.com/@scout2015/video/6718335390845095173',
    tiktokTitle: 'Scramble up ur name & I’ll try to guess it😍❤️ #foryoupage #petsoftiktok #aesthetic', tiktokAuthor: 'Scout, Suki & Stella',
    caption: 'This dog is a genius 😂 #pets', category: 'animals',
  }, 8);
  post(alex, { source: 'external', videoUrl: BUNNY, caption: 'Late night horror movie marathon, so creepy 👻 #scary', category: 'comedy' }, 12);
  post(sam, { source: 'external', videoUrl: FLOWER, caption: 'Friday drinks 🍻 #beer', category: 'food' }, 20);
  post(pub, { source: 'external', videoUrl: FLOWER, caption: 'Slow-motion spring 🌼 #nature #learn', category: 'nature' }, 3);
  post(pub, { source: 'external', videoUrl: BUNNY, caption: 'Meet the forest animals 🦋 #animals', category: 'animals' }, 30);
  post(jordan, { source: 'external', videoUrl: BUNNY, caption: 'my cartoon edit lol #funny', category: 'comedy' }, 4);
}

await closeDb();
console.log(`
Demo data ready. Every demo password is: ember-demo-123

  demo          adult, friends with alex.r & sam_k (Following feed has videos)
  nature.daily  adult public creator (shows up in Discover)
  jordan        15-year-old (teen protections), friends with riley & kiddo
  kiddo         10-year-old kids account, parent PIN = 1234
`);
