import crypto from 'node:crypto';
import { db, save } from './db.js';
import { userAge, userAgeGroup, publicLocks } from './policy.js';

const COOKIE = 'ember_session';
const SESSION_DAYS = 30;

export function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(secret), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifySecret(secret, stored) {
  if (!stored) return false;
  const [, salt, hash] = stored.split('$');
  const test = crypto.scryptSync(String(secret), salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({ id: sha(token), userId, expiresAt: Date.now() + SESSION_DAYS * 864e5 });
  save();
  res.setHeader('Set-Cookie', cookieString(req, token, SESSION_DAYS * 86400));
}

export function destroySession(req, res) {
  const token = parseCookies(req)[COOKIE];
  if (token) {
    const id = sha(token);
    db.sessions = db.sessions.filter((s) => s.id !== id);
    save();
  }
  res.setHeader('Set-Cookie', cookieString(req, '', 0));
}

function cookieString(req, value, maxAge) {
  const secure = req.secure ? '; Secure' : ''; // HTTPS (directly or behind a proxy like Render/Fly)
  return `${COOKIE}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function userFromRequest(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const id = sha(token);
  const session = db.sessions.find((s) => s.id === id);
  if (!session || session.expiresAt < Date.now()) return null;
  return db.users.find((u) => u.id === session.userId) || null;
}

export function requireAuth(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Please sign in.' });
  req.user = user;
  next();
}

/** Minimal public view of a user (what other people may see). */
export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, displayName: u.displayName, avatarColor: u.avatarColor, bio: u.bio || '' };
}

/** What the signed-in user sees about themselves. */
export function selfUser(u) {
  return {
    ...publicUser(u),
    age: userAge(u),
    ageGroup: userAgeGroup(u),
    friendCode: u.friendCode,
    settings: u.settings,
    locks: publicLocks(userAge(u)),
    hasPin: Boolean(u.pinHash),
    createdAt: u.createdAt,
  };
}

/** Simple in-memory rate limiter. */
export function rateLimit({ windowMs, max, key = (req) => req.ip }) {
  const hits = new Map();
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Too many attempts. Please wait a bit and try again.' });
    arr.push(now);
    hits.set(k, arr);
    next();
  };
}

export function checkPin(user, pin) {
  if (!user.pinHash) return true;
  return typeof pin === 'string' && verifySecret(pin, user.pinHash);
}
