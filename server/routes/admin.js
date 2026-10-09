import express from 'express';
import { requireAuth } from '../auth.js';
import { isAdmin, addToLibrary } from '../library.js';

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

export default router;
