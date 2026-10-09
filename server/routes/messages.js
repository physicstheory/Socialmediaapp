import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { db, save, UPLOAD_DIR } from '../db.js';
import { requireAuth, publicUser, rateLimit } from '../auth.js';
import { userAgeGroup } from '../policy.js';
import { checkMessage, maskProfanity } from '../moderation.js';
import { areFriends, friendIds, getUser, push, addStream } from '../social.js';
import { canSee, serializePost } from './posts.js';

const router = express.Router();
router.use(requireAuth);

const SNAP_DIR = path.join(UPLOAD_DIR, 'snaps');
const EPHEMERAL_MS = 24 * 36e5; // chats in "disappearing" mode vanish 24h after being opened
const msgLimiter = rateLimit({ windowMs: 60e3, max: 40, key: (req) => req.user.id });

const convo = (a, b) => [a, b].sort().join(':');

function canMessage(me, other) {
  return other && areFriends(me.id, other.id); // DMs are friends-only, always.
}

function serializeMessage(m, viewer) {
  const mask = viewer.settings.filters.profanity ? maskProfanity : (x) => x;
  const out = {
    id: m.id, from: m.from, to: m.to, kind: m.kind, createdAt: m.createdAt,
    ephemeral: m.ephemeral, saved: m.saved, openedAt: m.openedAt || null, mine: m.from === viewer.id,
  };
  if (m.kind === 'text') out.text = mask(m.text);
  if (m.kind === 'post') {
    const p = db.posts.find((x) => x.id === m.postId);
    out.post = p && canSee(viewer, p) ? serializePost(p, viewer) : null;
    out.text = m.text ? mask(m.text) : '';
  }
  if (m.kind === 'snap') out.snapAvailable = !m.openedAt && !m.snapDeleted;
  return out;
}

// --- Server-Sent Events stream for live messages & requests ---
router.get('/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('event: hello\ndata: {}\n\n');
  const off = addStream(req.user.id, res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25e3);
  req.on('close', () => { clearInterval(ping); off(); });
});

router.get('/chats', (req, res) => {
  const me = req.user.id;
  const items = friendIds(me).map(getUser).filter(Boolean).map((u) => {
    const key = convo(me, u.id);
    const msgs = db.messages.filter((m) => m.convo === key);
    const last = msgs[msgs.length - 1];
    const unread = msgs.filter((m) => m.to === me && !m.openedAt).length;
    const unopenedSnap = msgs.some((m) => m.to === me && m.kind === 'snap' && !m.openedAt);
    let status = 'none';
    if (last) {
      if (last.from === me) status = last.openedAt ? 'opened' : 'delivered';
      else status = last.openedAt ? 'received' : 'new';
    }
    return {
      user: publicUser(u),
      lastKind: last?.kind || null,
      lastAt: last?.createdAt || 0,
      lastFromMe: last ? last.from === me : false,
      status, unread, unopenedSnap,
    };
  }).sort((a, b) => b.lastAt - a.lastAt || a.user.displayName.localeCompare(b.user.displayName));
  res.json({ items, unreadTotal: items.reduce((n, c) => n + c.unread, 0) });
});

router.get('/chats/:userId', (req, res) => {
  const me = req.user;
  const other = getUser(req.params.userId);
  if (!canMessage(me, other)) return res.status(403).json({ error: 'You can only chat with friends.' });
  const key = convo(me.id, other.id);
  const now = Date.now();
  const msgs = db.messages.filter((m) => m.convo === key);
  // Opening the chat marks text/post messages as read (snaps are opened individually).
  for (const m of msgs) {
    if (m.to === me.id && !m.openedAt && m.kind !== 'snap') {
      m.openedAt = now;
      push(other.id, 'read', { by: me.id });
    }
  }
  save();
  res.json({ user: publicUser(other), items: msgs.map((m) => serializeMessage(m, me)) });
});

function deliver(req, res, msg, notices = []) {
  db.messages.push(msg);
  save();
  push(msg.to, 'message', { from: msg.from });
  res.json({ message: serializeMessage(msg, req.user), notices });
}

router.post('/chats/:userId', msgLimiter, (req, res) => {
  const me = req.user;
  const other = getUser(req.params.userId);
  if (!canMessage(me, other)) return res.status(403).json({ error: 'You can only chat with friends.' });
  const { text = '', postId, ephemeral = true } = req.body || {};
  const sender = { ageGroup: userAgeGroup(me) };
  const recipient = { ageGroup: userAgeGroup(other) };

  let checked = { ok: true, text: '', notices: [] };
  if (String(text).trim()) {
    checked = checkMessage(text, sender, recipient);
    if (!checked.ok) {
      if (checked.flagged) {
        db.reports.push({ id: crypto.randomUUID(), type: 'auto-message', targetId: me.id, by: 'system', reason: 'blocked message', excerpt: String(text).slice(0, 200), to: other.id, createdAt: Date.now() });
        save();
      }
      return res.status(400).json({ error: checked.blockedReason });
    }
  }
  const base = {
    id: crypto.randomUUID(), convo: convo(me.id, other.id), from: me.id, to: other.id,
    createdAt: Date.now(), ephemeral: Boolean(ephemeral), saved: false, openedAt: null,
  };
  if (postId) {
    const post = db.posts.find((p) => p.id === postId);
    if (!post || !canSee(me, post)) return res.status(404).json({ error: 'Post not found.' });
    return deliver(req, res, { ...base, kind: 'post', postId: post.id, text: checked.text }, checked.notices);
  }
  if (!checked.text.trim()) return res.status(400).json({ error: 'Type a message first.' });
  deliver(req, res, { ...base, kind: 'text', text: checked.text }, checked.notices);
});

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
function looksLikeImage(b) {
  if (b.length < 12) return false;
  if (b[0] === 0xff && b[1] === 0xd8) return true;
  if (b.subarray(1, 4).toString('latin1') === 'PNG') return true;
  return b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
}

router.post('/chats/:userId/snap', msgLimiter, express.raw({ type: Object.keys(IMAGE_TYPES), limit: '8mb' }), (req, res) => {
  const me = req.user;
  const other = getUser(req.params.userId);
  if (!canMessage(me, other)) return res.status(403).json({ error: 'You can only chat with friends.' });
  if (!me.settings.photoSnaps) return res.status(403).json({ error: 'Photo Snaps are turned off in your settings.' });
  if (!other.settings.photoSnaps) return res.status(403).json({ error: "This friend can't receive photo Snaps." });
  const ext = IMAGE_TYPES[req.headers['content-type']];
  if (!ext || !Buffer.isBuffer(req.body) || !looksLikeImage(req.body)) return res.status(400).json({ error: 'Send a JPG, PNG or WebP photo.' });
  const file = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(SNAP_DIR, file), req.body);
  deliver(req, res, {
    id: crypto.randomUUID(), convo: convo(me.id, other.id), from: me.id, to: other.id, kind: 'snap', file,
    mime: req.headers['content-type'], createdAt: Date.now(), ephemeral: true, saved: false, openedAt: null,
  });
});

// View a snap once. The recipient gets it one time, then the file is deleted (unless it was reported).
router.get('/snaps/:id', (req, res) => {
  const m = db.messages.find((x) => x.id === req.params.id && x.kind === 'snap');
  if (!m || m.to !== req.user.id || m.openedAt || m.snapDeleted) return res.status(404).json({ error: 'This Snap has already been opened.' });
  const file = path.join(SNAP_DIR, m.file);
  let buf;
  try { buf = fs.readFileSync(file); } catch { return res.status(404).json({ error: 'Snap not found.' }); }
  m.openedAt = Date.now();
  save();
  push(m.from, 'read', { by: req.user.id });
  res.setHeader('Content-Type', m.mime);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
  // Keep the file 10 minutes in case the viewer reports it, then delete.
  setTimeout(() => {
    if (!m.reported) { fs.rm(file, () => {}); m.snapDeleted = true; save(); }
  }, 10 * 60e3).unref();
});

router.post('/messages/:id/save', (req, res) => {
  const m = db.messages.find((x) => x.id === req.params.id && (x.from === req.user.id || x.to === req.user.id));
  if (!m || m.kind === 'snap') return res.status(404).json({ error: 'Message not found.' });
  m.saved = !m.saved;
  save();
  res.json({ message: serializeMessage(m, req.user) });
});

router.post('/messages/:id/report', (req, res) => {
  const m = db.messages.find((x) => x.id === req.params.id && x.to === req.user.id);
  if (!m) return res.status(404).json({ error: 'Message not found.' });
  m.reported = true; // reported messages are preserved as evidence, even disappearing ones
  db.reports.push({ id: crypto.randomUUID(), type: 'message', targetId: m.id, by: req.user.id, reason: String(req.body?.reason || 'other').slice(0, 60), createdAt: Date.now() });
  save();
  res.json({ ok: true });
});

/** Remove disappearing messages 24h after they were opened (unless saved or reported). */
export function sweepEphemeral() {
  const now = Date.now();
  const before = db.messages.length;
  db.messages = db.messages.filter((m) => {
    if (m.kind === 'snap' && m.openedAt && !m.snapDeleted && !m.reported && now - m.openedAt > 10 * 60e3) {
      fs.rm(path.join(SNAP_DIR, m.file), () => {});
      m.snapDeleted = true;
    }
    if (!m.ephemeral || m.saved || m.reported || !m.openedAt) return true;
    if (now - m.openedAt < EPHEMERAL_MS) return true;
    if (m.kind === 'snap' && !m.snapDeleted) fs.rm(path.join(SNAP_DIR, m.file), () => {});
    return false;
  });
  if (db.messages.length !== before) save();
}

export default router;
