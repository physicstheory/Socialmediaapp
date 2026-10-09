import express from 'express';
import { requireAuth } from '../auth.js';
import { isAdmin, addToLibrary } from '../library.js';
import { youtubeStatus, ensureShorts } from '../youtube.js';
import { rateLimit } from '../auth.js';

const router = express.Router();

// Paste many TikTok links at once into the Discover library (admins only: ADMIN_USERNAMES env var).
router.post('/admin/library', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admins only.' });
  const urls = String(req.body?.urls || '').match(/https?:\/\/\S+/g) || [];
  if (!urls.length) return res.status(400).json({ error: 'Paste at least one TikTok link.' });
  const result = { added: 0, duplicates: 0, failed: [] };
  for (const url of urls.slice(0, 100)) {
    const r = await addToLibrary({ url, category: req.body.category, rating: req.body.rating });
    if (r.error) result.failed.push(`${url} — ${r.error}`);
    else if (r.duplicate) result.duplicates++;
    else result.added++;
  }
  res.json(result);
});

// YouTube Shorts status for the Settings page, so setup problems are visible instead of silent.
router.get('/youtube/status', requireAuth, (req, res) => res.json(youtubeStatus()));

router.post('/youtube/refresh', requireAuth, rateLimit({ windowMs: 60e3, max: 3, key: (req) => req.user.id }), async (req, res) => {
  await ensureShorts(req.user.settings.interests, { more: true, force: true, waitMs: 9000 });
  res.json(youtubeStatus());
});

export default router;
