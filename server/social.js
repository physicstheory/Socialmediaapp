// Relationship helpers + realtime (Server-Sent Events) push.
import { db } from './db.js';

export const pairKey = (a, b) => [a, b].sort().join(':');

export function areFriends(a, b) {
  const k = pairKey(a, b);
  return db.friendships.some((f) => f.key === k);
}

export function friendIds(userId) {
  const out = [];
  for (const f of db.friendships) {
    if (f.a === userId) out.push(f.b);
    else if (f.b === userId) out.push(f.a);
  }
  return out;
}

export function isBlocked(a, b) {
  return db.blocks.some((x) => (x.by === a && x.target === b) || (x.by === b && x.target === a));
}

export function mutualCount(a, b) {
  const fa = new Set(friendIds(a));
  return friendIds(b).filter((id) => fa.has(id)).length;
}

export const getUser = (id) => db.users.find((u) => u.id === id);

// ---- realtime ----
const streams = new Map(); // userId -> Set<res>

export function addStream(userId, res) {
  if (!streams.has(userId)) streams.set(userId, new Set());
  streams.get(userId).add(res);
  return () => streams.get(userId)?.delete(res);
}

export function push(userId, type, data = {}) {
  const set = streams.get(userId);
  if (!set) return;
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
}
