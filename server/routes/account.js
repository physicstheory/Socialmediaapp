import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { db, save, UPLOAD_DIR } from '../db.js';
import {
  hashSecret, verifySecret, createSession, destroySession, requireAuth, selfUser, rateLimit, checkPin,
} from '../auth.js';
import { ageFromBirthdate, ageGroupFor, defaultSettings, sanitizeSettings, userAge } from '../policy.js';
import { analyzeText, severeReason } from '../moderation.js';
import { matchTikTokAdds, cleanHandle, TIKTOK_HANDLE_RE } from './friends.js';

function handleError(user, tt) {
  if (!tt) return null;
  if (!TIKTOK_HANDLE_RE.test(tt)) return 'That doesn’t look like a TikTok username.';
  if (db.users.some((u) => u.tiktokHandle === tt && u.id !== user?.id)) return 'That TikTok username is already linked to another Ember account. If it’s yours, report it from their profile.';
  return null;
}

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60e3, max: Number(process.env.AUTH_RATE_LIMIT) || 20 });

const AVATAR_COLORS = ['#FF3B2F', '#FF8A00', '#FF5E3A', '#FFB300', '#E63946', '#F77F00', '#D62828', '#FCA311'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newFriendCode() {
  for (;;) {
    let code = '';
    for (const b of crypto.randomBytes(6)) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
    code = `EMB-${code}`;
    if (!db.users.some((u) => u.friendCode === code)) return code;
  }
}

router.post('/auth/signup', authLimiter, (req, res) => {
  const { username, displayName, password, birthdate, tiktokHandle } = req.body || {};
  const tt = cleanHandle(tiktokHandle);
  const ttErr = handleError(null, tt);
  if (ttErr) return res.status(400).json({ error: ttErr });
  const uname = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9_.]{3,20}$/.test(uname)) {
    return res.status(400).json({ error: 'Usernames are 3–20 characters: letters, numbers, _ and .' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Passwords need at least 8 characters.' });
  }
  if (password.toLowerCase().includes(uname)) {
    return res.status(400).json({ error: "Your password can't contain your username." });
  }
  const age = ageFromBirthdate(String(birthdate || ''));
  if (age === null || age < 5 || age > 120) {
    return res.status(400).json({ error: 'Please enter a valid birthday.' });
  }
  const name = String(displayName || uname).trim().slice(0, 30) || uname;
  const check = analyzeText(`${uname.replace(/[_.]/g, ' ')} ${name}`);
  if (check.severe.length || check.flags.includes('profanity') || check.flags.includes('mature')) {
    return res.status(400).json({ error: 'Please choose a different username or display name.' });
  }
  if (db.users.some((u) => u.username === uname)) {
    return res.status(409).json({ error: 'That username is taken.' });
  }
  const user = {
    id: crypto.randomUUID(),
    username: uname,
    displayName: name,
    passwordHash: hashSecret(password),
    birthdate: String(birthdate),
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    friendCode: newFriendCode(),
    bio: '',
    tiktokHandle: tt,
    settings: defaultSettings(age),
    pinHash: null,
    createdAt: Date.now(),
  };
  db.users.push(user);
  save();
  matchTikTokAdds(user);
  createSession(req, res, user.id);
  res.json({ user: selfUser(user) });
});

router.post('/auth/login', authLimiter, (req, res) => {
  const { username, password, remember = true } = req.body || {};
  const user = db.users.find((u) => u.username === String(username || '').trim().toLowerCase());
  if (!user || !verifySecret(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  createSession(req, res, user.id, remember !== false);
  res.json({ user: selfUser(user) });
});

router.post('/auth/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: selfUser(req.user) }));

// Permanently delete your account and everything you created (required by the App Store and Google Play).
router.delete('/me', requireAuth, authLimiter, (req, res) => {
  const me = req.user;
  if (!verifySecret(req.body?.password || '', me.passwordHash)) return res.status(403).json({ error: 'Wrong password.' });
  if (ageGroupFor(userAge(me)) === 'kid' && !checkPin(me, req.body?.pin)) {
    return res.status(403).json({ error: 'Enter the parent PIN to delete this account.', needPin: true });
  }
  const id = me.id;
  const myPosts = new Set(db.posts.filter((p) => p.authorId === id).map((p) => p.id));
  for (const p of db.posts) {
    if (myPosts.has(p.id) && p.source === 'upload') fs.rm(path.join(UPLOAD_DIR, 'videos', path.basename(p.videoUrl)), () => {});
  }
  for (const m of db.messages) {
    if ((m.from === id || m.to === id) && m.kind === 'snap' && m.file) fs.rm(path.join(UPLOAD_DIR, 'snaps', m.file), () => {});
  }
  db.posts = db.posts.filter((p) => p.authorId !== id);
  for (const c of ['likes', 'saves', 'notInterested']) db[c] = db[c].filter((x) => x.userId !== id && !myPosts.has(x.postId));
  db.comments = db.comments.filter((c) => c.authorId !== id && !myPosts.has(c.postId));
  db.friendRequests = db.friendRequests.filter((r) => r.from !== id && r.to !== id);
  db.friendships = db.friendships.filter((f) => f.a !== id && f.b !== id);
  db.messages = db.messages.filter((m) => m.from !== id && m.to !== id);
  db.blocks = db.blocks.filter((b) => b.by !== id && b.target !== id);
  db.invites = db.invites.filter((i) => i.from !== id);
  db.tiktokAdds = db.tiktokAdds.filter((a) => a.from !== id);
  db.reports = db.reports.filter((r) => r.by !== id); // reports *about* this account are kept for safety review
  db.sessions = db.sessions.filter((s) => s.userId !== id);
  db.users = db.users.filter((u) => u.id !== id);
  save();
  destroySession(req, res);
  res.json({ ok: true });
});

router.put('/me/profile', requireAuth, (req, res) => {
  const { displayName, bio, tiktokHandle } = req.body || {};
  const tt = cleanHandle(tiktokHandle ?? req.user.tiktokHandle);
  const ttErr = handleError(req.user, tt);
  if (ttErr) return res.status(400).json({ error: ttErr });
  const name = String(displayName ?? req.user.displayName).trim().slice(0, 30);
  const b = String(bio ?? req.user.bio).trim().slice(0, 120);
  const check = analyzeText(`${name} ${b}`);
  if (!name || check.severe.length) {
    return res.status(400).json({ error: check.severe.length ? severeReason(check.severe) : 'Display name required.' });
  }
  req.user.displayName = name;
  req.user.bio = b;
  const changed = req.user.tiktokHandle !== tt;
  req.user.tiktokHandle = tt;
  save();
  if (changed) matchTikTokAdds(req.user);
  res.json({ user: selfUser(req.user) });
});

router.put('/settings', requireAuth, (req, res) => {
  const user = req.user;
  const age = userAge(user);
  const { settings, pin } = req.body || {};
  // Once a settings PIN exists (always for under-13s), changes need it — except during first-time setup.
  if (user.settings.onboarded && !checkPin(user, pin)) {
    return res.status(403).json({ error: 'Enter the parent/settings PIN to change these settings.', needPin: true });
  }
  const next = sanitizeSettings(user.settings, settings, age);
  if (next.onboarded && ageGroupFor(age) === 'kid' && !user.pinHash) {
    return res.status(400).json({ error: 'Accounts for under-13s need a parent PIN to finish setup.' });
  }
  if (next.onboarded && next.interests.length === 0) {
    return res.status(400).json({ error: 'Pick at least one interest.' });
  }
  user.settings = next;
  save();
  res.json({ user: selfUser(user) });
});

router.post('/settings/pin', requireAuth, (req, res) => {
  const user = req.user;
  const { pin, currentPin } = req.body || {};
  if (user.pinHash && !verifySecret(currentPin || '', user.pinHash)) {
    return res.status(403).json({ error: 'Current PIN is incorrect.' });
  }
  if (pin === null) {
    if (ageGroupFor(userAge(user)) === 'kid') return res.status(400).json({ error: 'Under-13 accounts must keep a parent PIN.' });
    user.pinHash = null;
  } else {
    if (!/^\d{4,6}$/.test(String(pin || ''))) return res.status(400).json({ error: 'PIN must be 4–6 digits.' });
    user.pinHash = hashSecret(pin);
  }
  save();
  res.json({ user: selfUser(user) });
});

export default router;
