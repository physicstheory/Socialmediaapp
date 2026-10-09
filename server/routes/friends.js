import crypto from 'node:crypto';
import express from 'express';
import { db, save } from '../db.js';
import { requireAuth, publicUser, checkPin } from '../auth.js';
import { userAgeGroup } from '../policy.js';
import { areFriends, friendIds, isBlocked, mutualCount, pairKey, getUser, push } from '../social.js';

const router = express.Router();
router.use(requireAuth);

const DAILY_REQUEST_LIMIT = 25;
const DECLINE_COOLDOWN_MS = 7 * 864e5;
const RESTRICT_AT_REPORTS = 3;
const NOT_FOUND = "We couldn't find that person, or they can't be added right now.";

function isRestricted(user) {
  const reporters = new Set(db.reports.filter((r) => r.type === 'user' && r.targetId === user.id).map((r) => r.by));
  return reporters.size >= RESTRICT_AT_REPORTS;
}

/**
 * Ember's friend-safety rules. Returns null when allowed, else an error string.
 *  - Adults can never send requests to under-18s.
 *  - Under-18s can only add adults with that adult's friend code (e.g. a parent).
 *  - Under-13s can only add people by friend code, with the parent PIN.
 *  - People choose who can request them: everyone / friends-of-friends / code only.
 */
export function requestBlockedReason(from, to, viaCode) {
  if (from.id === to.id) return "That's you!";
  if (isBlocked(from.id, to.id)) return NOT_FOUND;
  if (areFriends(from.id, to.id)) return "You're already friends.";
  const fg = userAgeGroup(from);
  const tg = userAgeGroup(to);
  if (fg === 'adult' && tg !== 'adult') return NOT_FOUND;
  if (fg !== 'adult' && tg === 'adult' && !viaCode) return 'To add an adult (like a parent), enter their friend code.';
  if (fg === 'kid' && !viaCode) return 'Kids accounts add friends with a friend code.';
  if (tg === 'kid' && fg !== 'kid' && !viaCode) return NOT_FOUND;
  if (!viaCode) {
    if (to.settings.friendRequests === 'code') return 'This person only accepts requests by friend code.';
    if (to.settings.friendRequests === 'mutuals' && mutualCount(from.id, to.id) === 0) {
      return 'This person only accepts requests from friends of friends. Ask them for their friend code.';
    }
  }
  if (isRestricted(from)) return 'Your account is restricted from sending friend requests while reports are reviewed.';
  return null;
}

router.get('/friends', (req, res) => {
  const items = friendIds(req.user.id).map(getUser).filter(Boolean).map(publicUser)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  res.json({ items });
});

router.get('/friends/requests', (req, res) => {
  const me = req.user.id;
  const incoming = db.friendRequests.filter((r) => r.to === me && r.status === 'pending').map((r) => {
    const from = getUser(r.from);
    const days = Math.floor((Date.now() - from.createdAt) / 864e5);
    return { id: r.id, user: publicUser(from), mutuals: mutualCount(me, from.id), accountAgeDays: days, newAccount: days < 7, viaCode: r.viaCode, createdAt: r.createdAt };
  });
  const outgoing = db.friendRequests.filter((r) => r.from === me && r.status === 'pending')
    .map((r) => ({ id: r.id, user: publicUser(getUser(r.to)), createdAt: r.createdAt }));
  res.json({ incoming, outgoing });
});

router.get('/friends/search', (req, res) => {
  const me = req.user;
  const q = String(req.query.q || '').trim().toLowerCase().replace(/^@/, '');
  const group = userAgeGroup(me);
  if (group === 'kid') return res.json({ items: [], note: 'Kids accounts add friends with friend codes. Ask your friend for theirs!' });
  if (q.length < 2) return res.json({ items: [] });
  const items = db.users
    .filter((u) => u.id !== me.id && !isBlocked(me.id, u.id))
    .filter((u) => userAgeGroup(u) === group) // adults only find adults, teens only find teens
    .filter((u) => u.settings.friendRequests !== 'code' || u.username === q)
    .filter((u) => u.username.startsWith(q) || u.displayName.toLowerCase().includes(q))
    .slice(0, 20)
    .map((u) => {
      const pending = db.friendRequests.find((r) => r.status === 'pending' && ((r.from === me.id && r.to === u.id) || (r.from === u.id && r.to === me.id)));
      return {
        user: publicUser(u),
        mutuals: mutualCount(me.id, u.id),
        status: areFriends(me.id, u.id) ? 'friends' : pending ? (pending.from === me.id ? 'sent' : 'received') : 'none',
      };
    });
  res.json({ items });
});

router.post('/friends/request', (req, res) => {
  const me = req.user;
  const { username, code, pin } = req.body || {};
  const viaCode = Boolean(code);
  const target = viaCode
    ? db.users.find((u) => u.friendCode === String(code).trim().toUpperCase().replace(/^(?!EMB-)/, 'EMB-'))
    : db.users.find((u) => u.username === String(username || '').trim().toLowerCase().replace(/^@/, ''));
  if (!target) return res.status(404).json({ error: NOT_FOUND });

  if (userAgeGroup(me) === 'kid' && !checkPin(me, pin)) {
    return res.status(403).json({ error: 'Ask a parent to enter the PIN to add a friend.', needPin: true });
  }
  const reason = requestBlockedReason(me, target, viaCode);
  if (reason) return res.status(403).json({ error: reason });

  const dayAgo = Date.now() - 864e5;
  if (db.friendRequests.filter((r) => r.from === me.id && r.createdAt > dayAgo).length >= DAILY_REQUEST_LIMIT) {
    return res.status(429).json({ error: "You've sent a lot of requests today. Try again tomorrow." });
  }
  const existing = db.friendRequests.filter((r) => (r.from === me.id && r.to === target.id) || (r.from === target.id && r.to === me.id));
  if (existing.some((r) => r.status === 'pending' && r.from === me.id)) return res.status(409).json({ error: 'Request already sent.' });
  const reverse = existing.find((r) => r.status === 'pending' && r.from === target.id);
  if (reverse) return res.status(409).json({ error: 'They already sent you a request — check your Inbox.' });
  if (existing.some((r) => r.status === 'declined' && r.from === me.id && Date.now() - r.updatedAt < DECLINE_COOLDOWN_MS)) {
    return res.status(429).json({ error: 'You can send another request to this person later.' });
  }
  const r = { id: crypto.randomUUID(), from: me.id, to: target.id, viaCode, status: 'pending', createdAt: Date.now(), updatedAt: Date.now() };
  db.friendRequests.push(r);
  save();
  push(target.id, 'friend_request', { from: publicUser(me) });
  res.json({ ok: true, user: publicUser(target) });
});

function respond(accept) {
  return (req, res) => {
    const me = req.user;
    const r = db.friendRequests.find((x) => x.id === req.params.id && x.to === me.id && x.status === 'pending');
    if (!r) return res.status(404).json({ error: 'Request not found.' });
    if (accept && userAgeGroup(me) === 'kid' && !checkPin(me, req.body?.pin)) {
      return res.status(403).json({ error: 'Ask a parent to enter the PIN to accept.', needPin: true });
    }
    const from = getUser(r.from);
    if (accept) {
      // Re-check safety rules at accept time (ages/blocks may have changed).
      const reason = from ? requestBlockedReason(from, me, r.viaCode) : NOT_FOUND;
      if (reason && reason !== "You're already friends.") {
        r.status = 'declined';
        save();
        return res.status(403).json({ error: reason });
      }
      if (!areFriends(me.id, from.id)) db.friendships.push({ key: pairKey(me.id, from.id), a: me.id, b: from.id, createdAt: Date.now() });
      push(from.id, 'friend_accept', { user: publicUser(me) });
    }
    r.status = accept ? 'accepted' : 'declined';
    r.updatedAt = Date.now();
    save();
    res.json({ ok: true });
  };
}
router.post('/friends/requests/:id/accept', respond(true));
router.post('/friends/requests/:id/decline', respond(false));

router.delete('/friends/requests/:id', (req, res) => {
  db.friendRequests = db.friendRequests.filter((r) => !(r.id === req.params.id && r.from === req.user.id && r.status === 'pending'));
  save();
  res.json({ ok: true });
});

router.delete('/friends/:userId', (req, res) => {
  const k = pairKey(req.user.id, req.params.userId);
  db.friendships = db.friendships.filter((f) => f.key !== k);
  save();
  res.json({ ok: true });
});

router.get('/blocks', (req, res) => {
  res.json({ items: db.blocks.filter((b) => b.by === req.user.id).map((b) => publicUser(getUser(b.target))).filter(Boolean) });
});

function block(me, targetId) {
  if (!db.blocks.some((b) => b.by === me && b.target === targetId)) db.blocks.push({ by: me, target: targetId, createdAt: Date.now() });
  const k = pairKey(me, targetId);
  db.friendships = db.friendships.filter((f) => f.key !== k);
  for (const r of db.friendRequests) {
    if (r.status === 'pending' && ((r.from === me && r.to === targetId) || (r.from === targetId && r.to === me))) r.status = 'declined';
  }
}

router.post('/users/:id/block', (req, res) => {
  if (!getUser(req.params.id) || req.params.id === req.user.id) return res.status(404).json({ error: 'User not found.' });
  block(req.user.id, req.params.id);
  save();
  res.json({ ok: true });
});

router.delete('/users/:id/block', (req, res) => {
  db.blocks = db.blocks.filter((b) => !(b.by === req.user.id && b.target === req.params.id));
  save();
  res.json({ ok: true });
});

router.post('/users/:id/report', (req, res) => {
  const target = getUser(req.params.id);
  if (!target || target.id === req.user.id) return res.status(404).json({ error: 'User not found.' });
  db.reports.push({ id: crypto.randomUUID(), type: 'user', targetId: target.id, by: req.user.id, reason: String(req.body?.reason || 'other').slice(0, 60), createdAt: Date.now() });
  if (req.body?.block !== false) block(req.user.id, target.id);
  save();
  res.json({ ok: true });
});

export default router;
