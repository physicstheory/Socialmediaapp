import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-yt-'));
process.env.DATA_DIR = dir;
process.env.YOUTUBE_API_KEY = 'test-key';
const { db, flush } = await import('../server/db.js');
const { fetchCategory, ensureShorts, youtubeStatus } = await import('../server/youtube.js');
after(() => { flush(); fs.rmSync(dir, { recursive: true, force: true }); });

const video = (id, title, extra = {}) => ({
  id, snippet: { title, channelTitle: 'Chan', thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hq.jpg` } } },
  status: { embeddable: true, privacyStatus: 'public', madeForKids: false, ...extra.status },
  contentDetails: { duration: extra.duration || 'PT35S' },
});

let calls = [];
globalThis.fetch = async (url) => {
  calls.push(url);
  const u = new URL(url);
  assert.equal(u.searchParams.get('key'), 'test-key');
  if (u.pathname.endsWith('/search')) {
    assert.equal(u.searchParams.get('safeSearch'), 'strict');
    return new Response(JSON.stringify({ items: ['a1', 'b2', 'c3', 'd4'].map((videoId) => ({ id: { videoId } })), nextPageToken: 'NEXT' }));
  }
  return new Response(JSON.stringify({ items: [
    video('a1', 'Puppy learns to sit #dogs', { status: { madeForKids: true } }),
    video('b2', 'Try the blackout challenge'), // severe → skipped
    video('c3', 'Long video', { duration: 'PT10M' }), // not a Short → skipped
    video('d4', 'Cat vs cucumber'),
  ] }));
};

test('fetches safe Shorts and rates them', async () => {
  const added = await fetchCategory('animals');
  assert.equal(added, 2);
  const yt = db.posts.filter((p) => p.source === 'youtube');
  assert.deepEqual(yt.map((p) => p.videoId).sort(), ['a1', 'd4']);
  assert.equal(yt.find((p) => p.videoId === 'a1').rating, 'everyone');
  assert.equal(yt.find((p) => p.videoId === 'd4').rating, 'teen');
  assert.ok(yt.every((p) => p.category === 'animals'));
});

test('ensureShorts respects the cool-down and fetches new topics', async () => {
  calls = [];
  await ensureShorts(['animals']);
  assert.equal(calls.length, 0); // fetched moments ago
  await ensureShorts(['music']);
  assert.ok(calls.some((c) => c.includes('/search')));
});

test('explains YouTube errors so setup problems are visible', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 403, message: 'Requests from referer <empty> are blocked.', errors: [{ reason: 'forbidden' }], status: 'PERMISSION_DENIED', details: [{ reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }] } }), { status: 403 });
  assert.equal(await fetchCategory('art'), 0);
  assert.match(youtubeStatus().lastError, /restricted to websites/);
  globalThis.fetch = async () => new Response('{"error":{"message":"YouTube Data API v3 has not been used in project 123 before or it is disabled.","status":"PERMISSION_DENIED"}}', { status: 403 });
  await ensureShorts(['tech'], { force: true });
  assert.match(youtubeStatus().lastError, /not turned on/);
  globalThis.fetch = realFetch;
});
