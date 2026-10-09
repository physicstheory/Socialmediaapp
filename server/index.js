import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { UPLOAD_DIR, initDb, closeDb } from './db.js';
import account from './routes/account.js';
import posts from './routes/posts.js';
import friends from './routes/friends.js';
import messages, { sweepEphemeral } from './routes/messages.js';
import invites from './routes/invites.js';
import { loadLibraryFile } from './library.js';
import admin from './routes/admin.js';
import { pruneShorts } from './youtube.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;

export const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    'frame-src https://www.tiktok.com https://www.youtube-nocookie.com https://www.youtube.com',
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  next();
});

// CSRF protection: state-changing API calls must come from our own JS (custom header + same origin).
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (req.get('X-Ember') !== '1') return res.status(403).json({ error: 'Bad request origin.' });
  const origin = req.get('Origin');
  if (origin) {
    let host = null;
    try { host = new URL(origin).host; } catch { /* malformed */ }
    if (host !== req.get('Host')) return res.status(403).json({ error: 'Bad request origin.' });
  }
  next();
});

app.use('/api', express.json({ limit: '100kb' }));
app.use('/api', account, invites, admin, posts, friends, messages);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Public "For parents" page (no sign-in needed). SUPPORT_EMAIL adds a contact line.
const parentsTemplate = fs.readFileSync(path.join(ROOT, 'server', 'pages', 'parents.html'), 'utf8');
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
app.get('/parents', (req, res) => {
  const email = (process.env.SUPPORT_EMAIL || '').trim();
  const contact = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(email)
    ? `<p>Questions or a safety concern? Email <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>.</p>`
    : '<p>Questions or a safety concern? Use the report buttons in the app.</p>';
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(parentsTemplate.replace('{{SUPPORT_CONTACT}}', contact));
});

app.use('/media/videos', express.static(path.join(UPLOAD_DIR, 'videos'), { maxAge: '7d', fallthrough: false }));
app.use(express.static(path.join(ROOT, 'public'), {
  setHeaders(res, file) {
    if (file.endsWith('sw.js') || file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status === 413 ? 'That file is too large.' : status < 500 ? 'Bad request.' : 'Something went wrong.' });
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await initDb();
  setInterval(sweepEphemeral, 60e3).unref();
  sweepEphemeral();
  loadLibraryFile();
  pruneShorts();
  setInterval(pruneShorts, 6 * 36e5).unref();
  app.listen(PORT, () => console.log(`🔥 Ember running at http://localhost:${PORT}`));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { closeDb().finally(() => process.exit(0)); });
}
