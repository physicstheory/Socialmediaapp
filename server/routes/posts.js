import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { db, save, UPLOAD_DIR } from '../db.js';
import { requireAuth, publicUser, rateLimit } from '../auth.js';
import { userAgeGroup } from '../policy.js';
import {
  analyzeText, rateFlags, categorize, severeReason, maskProfanity, containsAny, RATINGS, CATEGORIES, FILTER_KEYS,
} from '../moderation.js';
import { parseTikTokUrl, fetchOEmbed } from '../tiktok.js';
import { areFriends, friendIds, isBlocked, getUser } from '../social.js';
import { requestBlockedReason } from './friends.js';

const router = express.Router();
router.use(requireAuth);

const HIDE_AT_REPORTS = 3;
const postLimiter = rateLimit({ windowMs: 60 * 60e3, max: 30, key: (req) => req.user.id });

const postText = (p) => [p.caption, p.tiktokTitle, p.tiktokAuthor].filter(Boolean).join(' ');

/** Can this viewer see this post? This is where the "filtered algorithm" happens. */
export function canSee(viewer, post) {
  if (post.authorId === viewer.id) return true;
  if (post.hidden) return false;
  const author = getUser(post.authorId);
  if (!author || isBlocked(viewer.id, author.id)) return false;
  if (author.settings.privateAccount && !areFriends(viewer.id, author.id)) return false;
  // Adults never see minors' posts unless they are friends (e.g. family added by friend code).
  if (userAgeGroup(author) !== 'adult' && userAgeGroup(viewer) === 'adult' && !areFriends(viewer.id, author.id)) return false;
  const s = viewer.settings;
  if (RATINGS.indexOf(post.rating) > RATINGS.indexOf(s.maxRating)) return false;
  if (post.flags.some((f) => FILTER_KEYS.includes(f) && s.filters[f])) return false;
  if (s.blockedWords.length && containsAny(postText(post), s.blockedWords)) return false;
  if (db.notInterested.some((n) => n.userId === viewer.id && n.postId === post.id)) return false;
  return true;
}

export function serializePost(post, viewer) {
  const author = getUser(post.authorId);
  const mask = viewer.settings.filters.profanity ? maskProfanity : (x) => x;
  return {
    id: post.id,
    author: publicUser(author),
    source: post.source,
    videoId: post.videoId || null,
    tiktokUrl: post.tiktokUrl || null,
    videoUrl: post.videoUrl || null,
    thumbnailUrl: post.thumbnailUrl || null,
    caption: mask(post.caption || ''),
    tiktokTitle: mask(post.tiktokTitle || ''),
    tiktokAuthor: post.tiktokAuthor || '',
    category: post.category,
    rating: post.rating,
    createdAt: post.createdAt,
    likes: db.likes.filter((l) => l.postId === post.id).length,
    liked: db.likes.some((l) => l.postId === post.id && l.userId === viewer.id),
    saved: db.saves.some((l) => l.postId === post.id && l.userId === viewer.id),
    comments: db.comments.filter((c) => c.postId === post.id).length,
    isFriend: author ? areFriends(viewer.id, author.id) : false,
    canAdd: Boolean(author) && author.id !== viewer.id && !requestBlockedReason(viewer, author, false)
      && !db.friendRequests.some((r) => r.status === 'pending' && r.from === viewer.id && r.to === author.id),
    mine: post.authorId === viewer.id,
  };
}

// Stable per-viewer shuffle that changes every few hours, so Discover feels fresh without breaking paging.
function jitter(viewerId, postId) {
  const bucket = Math.floor(Date.now() / (3 * 36e5));
  return (crypto.createHash('sha1').update(`${viewerId}:${postId}:${bucket}`).digest()[0] / 255) * 3;
}

function discoverScore(post, viewer, interestBoost) {
  const likes = db.likes.filter((l) => l.postId === post.id).length;
  const ageHours = (Date.now() - post.createdAt) / 36e5;
  let score = Math.log2(likes + 1) * 1.5 - ageHours / 48;
  if (viewer.settings.interests.includes(post.category)) score += 4;
  score += interestBoost[post.category] || 0;
  return score + jitter(viewer.id, post.id);
}

router.get('/feed', (req, res) => {
  const viewer = req.user;
  const tab = req.query.tab === 'discover' ? 'discover' : 'following';
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const limit = 10;

  if (tab === 'following') {
    const friends = new Set(friendIds(viewer.id));
    const items = db.posts
      .filter((p) => friends.has(p.authorId) && canSee(viewer, p))
      .sort((a, b) => b.createdAt - a.createdAt);
    return res.json({ items: items.slice(offset, offset + limit).map((p) => serializePost(p, viewer)), nextOffset: offset + limit < items.length ? offset + limit : null });
  }

  if (!viewer.settings.discoverEnabled) return res.json({ items: [], nextOffset: null, disabled: true });

  // Personalize lightly from what the viewer liked (only within their allowed content).
  const boost = {};
  for (const l of db.likes) {
    if (l.userId !== viewer.id) continue;
    const p = db.posts.find((x) => x.id === l.postId);
    if (p) boost[p.category] = Math.min(3, (boost[p.category] || 0) + 0.5);
  }
  for (const n of db.notInterested) {
    if (n.userId !== viewer.id) continue;
    const p = db.posts.find((x) => x.id === n.postId);
    if (p) boost[p.category] = (boost[p.category] || 0) - 1;
  }
  const s = viewer.settings;
  const items = db.posts
    .filter((p) => p.authorId !== viewer.id && canSee(viewer, p))
    .filter((p) => !s.onlyInterests || !s.interests.length || s.interests.includes(p.category))
    .map((p) => [p, discoverScore(p, viewer, boost)])
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);
  res.json({ items: items.slice(offset, offset + limit).map((p) => serializePost(p, viewer)), nextOffset: offset + limit < items.length ? offset + limit : null });
});

function moderateNewPost({ caption, tiktokTitle, selfLabel }) {
  const text = [caption, tiktokTitle].filter(Boolean).join(' ');
  const { flags, severe } = analyzeText(text);
  if (severe.length) return { error: severeReason(severe) };
  const label = RATINGS.includes(selfLabel) ? selfLabel : 'everyone';
  return { flags, rating: rateFlags(flags, label) };
}

function finishPost(req, res, post) {
  const author = req.user;
  // Posts from under-13 accounts are capped to friends only via private account; ratings above
  // "everyone" can't be posted by kids at all.
  if (userAgeGroup(author) === 'kid' && post.rating !== 'everyone') {
    return res.status(400).json({ error: "This post doesn't meet Ember's kids content rules." });
  }
  db.posts.push(post);
  save();
  res.json({ post: serializePost(post, author), notice: post.rating !== 'everyone' ? `Rated ${post.rating === 'teen' ? 'Teen (13+)' : 'Mature (18+)'} — it will only be shown to people whose settings allow it.` : null });
}

router.post('/posts', postLimiter, async (req, res) => {
  const { url, caption = '', category, selfLabel } = req.body || {};
  const parsed = parseTikTokUrl(url);
  if (!parsed) return res.status(400).json({ error: 'Paste a TikTok video link (https://www.tiktok.com/@user/video/…).' });
  const oembed = await fetchOEmbed(parsed.url);
  const videoId = oembed?.videoId || parsed.videoId;
  if (!videoId) return res.status(400).json({ error: "Couldn't read that TikTok link. Use the full video link from TikTok's Share → Copy link." });
  const cap = String(caption).slice(0, 300);
  const mod = moderateNewPost({ caption: cap, tiktokTitle: oembed?.title, selfLabel });
  if (mod.error) return res.status(400).json({ error: mod.error });
  finishPost(req, res, {
    id: crypto.randomUUID(),
    authorId: req.user.id,
    source: 'tiktok',
    videoId,
    tiktokUrl: parsed.url,
    thumbnailUrl: oembed?.thumbnailUrl || null,
    tiktokTitle: oembed?.title?.slice(0, 300) || '',
    tiktokAuthor: oembed?.authorName || '',
    caption: cap,
    category: categorize(`${cap} ${oembed?.title || ''}`, category),
    flags: mod.flags,
    rating: mod.rating,
    hidden: false,
    reports: [],
    createdAt: Date.now(),
  });
});

const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
function looksLikeVideo(buf) {
  if (buf.length < 12) return false;
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return true; // mp4 / mov
  return buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3; // webm
}

router.post('/posts/upload', postLimiter, express.raw({ type: Object.keys(VIDEO_TYPES), limit: '60mb' }), (req, res) => {
  const ext = VIDEO_TYPES[req.headers['content-type']];
  if (!ext || !Buffer.isBuffer(req.body) || !looksLikeVideo(req.body)) {
    return res.status(400).json({ error: 'Upload an MP4, MOV or WebM video (max 60 MB).' });
  }
  const caption = String(req.query.caption || '').slice(0, 300);
  const mod = moderateNewPost({ caption, selfLabel: req.query.selfLabel });
  if (mod.error) return res.status(400).json({ error: mod.error });
  const file = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, 'videos', file), req.body);
  finishPost(req, res, {
    id: crypto.randomUUID(),
    authorId: req.user.id,
    source: 'upload',
    videoUrl: `/media/videos/${file}`,
    caption,
    category: categorize(caption, req.query.category),
    flags: mod.flags,
    rating: mod.rating,
    hidden: false,
    reports: [],
    createdAt: Date.now(),
  });
});

function findVisiblePost(req, res) {
  const post = db.posts.find((p) => p.id === req.params.id);
  if (!post || !canSee(req.user, post)) {
    res.status(404).json({ error: 'Post not found.' });
    return null;
  }
  return post;
}

router.get('/posts/:id', (req, res) => {
  const post = findVisiblePost(req, res);
  if (post) res.json({ post: serializePost(post, req.user) });
});

function toggle(collection) {
  return (req, res) => {
    const post = findVisiblePost(req, res);
    if (!post) return;
    const i = db[collection].findIndex((l) => l.postId === post.id && l.userId === req.user.id);
    if (i >= 0) db[collection].splice(i, 1);
    else db[collection].push({ postId: post.id, userId: req.user.id, createdAt: Date.now() });
    save();
    res.json({ post: serializePost(post, req.user) });
  };
}
router.post('/posts/:id/like', toggle('likes'));
router.post('/posts/:id/save', toggle('saves'));

router.post('/posts/:id/not-interested', (req, res) => {
  const post = db.posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  db.notInterested.push({ userId: req.user.id, postId: post.id });
  save();
  res.json({ ok: true });
});

router.post('/posts/:id/report', (req, res) => {
  const post = db.posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const reason = String(req.body?.reason || 'other').slice(0, 60);
  if (!post.reports.includes(req.user.id)) post.reports.push(req.user.id);
  db.reports.push({ id: crypto.randomUUID(), type: 'post', targetId: post.id, by: req.user.id, reason, createdAt: Date.now() });
  db.notInterested.push({ userId: req.user.id, postId: post.id });
  if (post.reports.length >= HIDE_AT_REPORTS) post.hidden = true;
  save();
  res.json({ ok: true });
});

router.delete('/posts/:id', (req, res) => {
  const post = db.posts.find((p) => p.id === req.params.id && p.authorId === req.user.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  db.posts = db.posts.filter((p) => p !== post);
  db.comments = db.comments.filter((c) => c.postId !== post.id);
  if (post.source === 'upload') fs.rm(path.join(UPLOAD_DIR, 'videos', path.basename(post.videoUrl)), () => {});
  save();
  res.json({ ok: true });
});

function canComment(user, post) {
  const author = getUser(post.authorId);
  if (author.id === user.id) return true;
  // Only friends may comment on posts by under-18s, and kids may only comment on friends' posts.
  if (userAgeGroup(author) !== 'adult' || userAgeGroup(user) === 'kid') return areFriends(user.id, author.id);
  return true;
}

router.get('/posts/:id/comments', (req, res) => {
  const post = findVisiblePost(req, res);
  if (!post) return;
  const mask = req.user.settings.filters.profanity ? maskProfanity : (x) => x;
  const items = db.comments
    .filter((c) => c.postId === post.id && !isBlocked(req.user.id, c.authorId))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((c) => ({ id: c.id, text: mask(c.text), createdAt: c.createdAt, author: publicUser(getUser(c.authorId)) }));
  res.json({ items, canComment: canComment(req.user, post) });
});

router.post('/posts/:id/comments', rateLimit({ windowMs: 60e3, max: 10, key: (req) => req.user.id }), (req, res) => {
  const post = findVisiblePost(req, res);
  if (!post) return;
  if (!canComment(req.user, post)) return res.status(403).json({ error: 'Only friends can comment on this post.' });
  const text = String(req.body?.text || '').trim().slice(0, 300);
  if (!text) return res.status(400).json({ error: 'Write something first.' });
  const { severe, flags } = analyzeText(text);
  if (severe.length || flags.includes('bullying')) {
    return res.status(400).json({ error: severe.length ? severeReason(severe) : "Let's keep it kind — that comment wasn't posted." });
  }
  const c = { id: crypto.randomUUID(), postId: post.id, authorId: req.user.id, text, createdAt: Date.now() };
  db.comments.push(c);
  save();
  res.json({ comment: { id: c.id, text: c.text, createdAt: c.createdAt, author: publicUser(req.user) } });
});

router.get('/users/:username', (req, res) => {
  const user = db.users.find((u) => u.username === String(req.params.username).toLowerCase());
  if (!user || isBlocked(req.user.id, user.id)) return res.status(404).json({ error: 'User not found.' });
  const viewerAdult = userAgeGroup(req.user) === 'adult';
  const isFriend = areFriends(req.user.id, user.id);
  if (viewerAdult && userAgeGroup(user) !== 'adult' && !isFriend) return res.status(404).json({ error: 'User not found.' });
  const posts = db.posts
    .filter((p) => p.authorId === user.id && canSee(req.user, p))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((p) => serializePost(p, req.user));
  const pending = db.friendRequests.find((r) => r.status === 'pending' && ((r.from === req.user.id && r.to === user.id) || (r.from === user.id && r.to === req.user.id)));
  res.json({
    user: publicUser(user),
    me: user.id === req.user.id,
    isFriend,
    pending: pending ? (pending.from === req.user.id ? 'sent' : 'received') : null,
    privateLocked: user.id !== req.user.id && user.settings.privateAccount && !isFriend,
    friendCount: friendIds(user.id).length,
    likeCount: db.likes.filter((l) => db.posts.some((p) => p.id === l.postId && p.authorId === user.id)).length,
    posts,
  });
});

router.get('/saved', (req, res) => {
  const ids = new Set(db.saves.filter((s) => s.userId === req.user.id).map((s) => s.postId));
  res.json({ items: db.posts.filter((p) => ids.has(p.id) && canSee(req.user, p)).map((p) => serializePost(p, req.user)) });
});

router.get('/categories', (req, res) => res.json({ categories: Object.keys(CATEGORIES) }));

export default router;
