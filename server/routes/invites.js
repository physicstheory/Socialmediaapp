// Invite links: share a link (e.g. in a TikTok DM) with someone who isn't on Ember yet.
// When they open it and join, you become friends and your note arrives as your first Ember chat.
import crypto from 'node:crypto';
import express from 'express';
import { db, save } from '../db.js';
import { requireAuth, publicUser, rateLimit, checkPin } from '../auth.js';
import { userAgeGroup } from '../policy.js';
import { checkMessage } from '../moderation.js';
import { areFriends, pairKey, getUser, push } from '../social.js';
import { requestBlockedReason } from './friends.js';

const router = express.Router();
const INVITE_DAYS = 14;

function findInvite(token) {
  const inv = db.invites.find((i) => i.token === String(token));
  if (!inv || inv.usedBy || inv.expiresAt < Date.now()) return null;
  const from = getUser(inv.from);
  return from ? { inv, from } : null;
}

router.post('/invites', requireAuth, rateLimit({ windowMs: 864e5, max: 20, key: (req) => req.user.id }), (req, res) => {
  const me = req.user;
  let note = String(req.body?.note || '').trim().slice(0, 300);
  if (note) {
    // We don't know the invitee's age yet, so check the note with the strictest (under-18) rules.
    const checked = checkMessage(note, { ageGroup: userAgeGroup(me) }, { ageGroup: 'teen' });
    if (!checked.ok) return res.status(400).json({ error: checked.blockedReason });
    note = checked.text;
  }
  const token = crypto.randomBytes(12).toString('base64url');
  db.invites.push({ token, from: me.id, note, createdAt: Date.now(), expiresAt: Date.now() + INVITE_DAYS * 864e5, usedBy: null });
  save();
  res.json({ token, url: `${req.protocol}://${req.get('host')}/#/invite/${token}` });
});

// Public: who sent this invite (only what the sender chose to share by sending the link).
router.get('/invites/:token', (req, res) => {
  const found = findInvite(req.params.token);
  if (!found) return res.status(404).json({ error: 'This invite link has expired or was already used.' });
  res.json({ from: { displayName: found.from.displayName, username: found.from.username, avatarColor: found.from.avatarColor }, hasNote: Boolean(found.inv.note) });
});

router.post('/invites/:token/accept', requireAuth, (req, res) => {
  const me = req.user;
  const found = findInvite(req.params.token);
  if (!found) return res.status(404).json({ error: 'This invite link has expired or was already used.' });
  const { inv, from } = found;
  if (from.id === me.id) return res.status(400).json({ error: 'That’s your own invite link — send it to a friend!' });
  if (userAgeGroup(me) === 'kid' && !checkPin(me, req.body?.pin)) {
    return res.status(403).json({ error: 'Ask a parent to enter the PIN to add this friend.', needPin: true });
  }
  // Same safety rules as adding someone by friend code (adults can never add under-18s, etc).
  const reason = requestBlockedReason(me, from, true);
  if (reason && reason !== "You're already friends.") return res.status(403).json({ error: reason });
  if (!areFriends(me.id, from.id)) db.friendships.push({ key: pairKey(me.id, from.id), a: me.id, b: from.id, createdAt: Date.now() });
  inv.usedBy = me.id;
  if (inv.note) {
    db.messages.push({
      id: crypto.randomUUID(), convo: [me.id, from.id].sort().join(':'), from: from.id, to: me.id, kind: 'text',
      text: inv.note, createdAt: Date.now(), ephemeral: false, saved: false, openedAt: null,
    });
    push(me.id, 'message', { from: from.id });
  }
  save();
  push(from.id, 'friend_accept', { user: publicUser(me) });
  res.json({ ok: true, user: publicUser(from) });
});

export default router;
