import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-test-'));
process.env.DATA_DIR = dir;
process.env.AUTH_RATE_LIMIT = '500';
const { app } = await import('../server/index.js');
const { flush } = await import('../server/db.js');
let server;
let base;

before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => { server.close(); flush(); fs.rmSync(dir, { recursive: true, force: true }); });

function client() {
  let cookie = '';
  const c = async (method, p, body) => {
    const r = await fetch(base + p, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Ember': '1', cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  c.cookie = () => cookie;
  return c;
}

const bday = (age) => `${new Date().getUTCFullYear() - age - 1}-01-01`;

async function account(name, age, settings = {}) {
  const c = client();
  const r = await c('POST', '/api/auth/signup', { username: name, password: 'password-123', birthdate: bday(age) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  if (r.body.user.ageGroup === 'kid') await c('POST', '/api/settings/pin', { pin: '1234' });
  const s = await c('PUT', '/api/settings', { settings: { interests: ['animals'], onboarded: true, ...settings } });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  c.user = s.body.user;
  return c;
}

test('CSRF header is required', async () => {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
});

test('age locks are enforced', async () => {
  const kid = await account('kid1', 9);
  assert.equal(kid.user.settings.maxRating, 'everyone');
  assert.equal(kid.user.settings.friendRequests, 'code');
  const noPin = await kid('PUT', '/api/settings', { settings: { maxRating: 'mature' } });
  assert.equal(noPin.status, 403);
  const withPin = await kid('PUT', '/api/settings', { settings: { maxRating: 'mature', filters: { violence: false } }, pin: '1234' });
  assert.equal(withPin.body.user.settings.maxRating, 'everyone');
  assert.equal(withPin.body.user.settings.filters.violence, true);
  const teen = await account('teen1', 14, { maxRating: 'mature', privateAccount: false });
  assert.equal(teen.user.settings.maxRating, 'teen');
  assert.equal(teen.user.settings.privateAccount, true);
});

test('adults cannot find or friend minors; minors add adults only by code', async () => {
  const adult = await account('adult1', 30);
  const teen = await account('teen2', 15);
  const search = await adult('GET', '/api/friends/search?q=teen');
  assert.equal(search.body.items.length, 0);
  const req = await adult('POST', '/api/friends/request', { username: 'teen2' });
  assert.equal(req.status, 403);
  const byCode = await adult('POST', '/api/friends/request', { code: teen.user.friendCode });
  assert.equal(byCode.status, 403);
  const teenByName = await teen('POST', '/api/friends/request', { username: 'adult1' });
  assert.equal(teenByName.status, 403);
  const teenByCode = await teen('POST', '/api/friends/request', { code: adult.user.friendCode });
  assert.equal(teenByCode.status, 200);
});

test('messages are friends-only and filtered', async () => {
  const a = await account('teen3', 15, { friendRequests: 'everyone' });
  const b = await account('teen4', 16, { friendRequests: 'everyone' });
  const blocked = await a('POST', `/api/chats/${b.user.id}`, { text: 'hi' });
  assert.equal(blocked.status, 403);
  await a('POST', '/api/friends/request', { username: 'teen4' });
  const { body } = await b('GET', '/api/friends/requests');
  await b('POST', `/api/friends/requests/${body.incoming[0].id}/accept`, {});
  const ok = await a('POST', `/api/chats/${b.user.id}`, { text: 'hey! call 555 123 4567' });
  assert.equal(ok.status, 200);
  assert.ok(!ok.body.message.text.includes('555'));
  const bad = await a('POST', `/api/chats/${b.user.id}`, { text: "don't tell your parents" });
  assert.equal(bad.status, 400);
  const chat = await b('GET', `/api/chats/${a.user.id}`);
  assert.equal(chat.body.items.length, 1);
});

test('feed opens on friends and respects filters', async () => {
  const p = await account('poster', 30, { privateAccount: false });
  const v = await account('viewer', 30, { maxRating: 'teen' });
  await p('POST', '/api/friends/request', { code: v.user.friendCode });
  const { body } = await v('GET', '/api/friends/requests');
  await v('POST', `/api/friends/requests/${body.incoming[0].id}/accept`, {});
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(32)]);
  const up = (caption) => fetch(`${base}/api/posts/upload?caption=${encodeURIComponent(caption)}`, {
    method: 'POST', headers: { 'Content-Type': 'video/mp4', 'X-Ember': '1', cookie: p.cookie() }, body: mp4,
  });
  assert.equal((await up('my dog is cute #dogs')).status, 200);
  assert.equal((await up('beer night with the crew')).status, 200);
  assert.equal((await up('try the tide pod challenge')).status, 400);
  const feed = await v('GET', '/api/feed?tab=following');
  assert.equal(feed.body.items.length, 1);
  assert.match(feed.body.items[0].caption, /dog/);
});

test('invite links make friends and deliver the note, with age rules', async () => {
  const a = await account('inviter', 16);
  const { body: inv } = await a('POST', '/api/invites', { note: 'hey join me here!' });
  assert.match(inv.url, /#\/invite\//);
  const info = await fetch(`${base}/api/invites/${inv.token}`).then((r) => r.json());
  assert.equal(info.from.username, 'inviter');
  const adult = await account('lurker', 40);
  assert.equal((await adult('POST', `/api/invites/${inv.token}/accept`, {})).status, 403);
  const b = await account('invitee', 15);
  const ok = await b('POST', `/api/invites/${inv.token}/accept`, {});
  assert.equal(ok.status, 200);
  const chat = await b('GET', `/api/chats/${a.user.id}`);
  assert.equal(chat.body.items[0].text, 'hey join me here!');
  assert.equal((await b('POST', `/api/invites/${inv.token}/accept`, {})).status, 404);
  const bad = await a('POST', '/api/invites', { note: "don't tell your parents" });
  assert.equal(bad.status, 400);
});

test('add friends by TikTok username before and after they join', async () => {
  const a = await account('ttadder', 15);
  const waiting = await a('POST', '/api/friends/tiktok', { handle: '@Future.Pal', note: 'found you from tiktok!' });
  assert.equal(waiting.body.status, 'waiting');
  const reqs = await a('GET', '/api/friends/requests');
  assert.equal(reqs.body.tiktokWaiting[0].handle, 'future.pal');
  const c = client();
  const r = await c('POST', '/api/auth/signup', { username: 'futurepal', password: 'password-123', birthdate: bday(16), tiktokHandle: 'future.pal' });
  assert.equal(r.status, 200);
  const inc = await c('GET', '/api/friends/requests');
  assert.equal(inc.body.incoming.length, 1);
  assert.equal(inc.body.incoming[0].viaTikTok, true);
  await c('POST', `/api/friends/requests/${inc.body.incoming[0].id}/accept`, {});
  const chat = await c('GET', `/api/chats/${a.user.id}`);
  assert.equal(chat.body.items[0].text, 'found you from tiktok!');
  // handle can't be claimed twice
  const d = client();
  const dup = await d('POST', '/api/auth/signup', { username: 'copycat', password: 'password-123', birthdate: bday(16), tiktokHandle: 'future.pal' });
  assert.equal(dup.status, 400);
  // adults adding a teen's TikTok name are blocked
  const adult = await account('ttadult', 35);
  assert.equal((await adult('POST', '/api/friends/tiktok', { handle: 'future.pal' })).status, 403);
});

test('parents page is public and account deletion removes everything', async () => {
  const page = await fetch(`${base}/parents`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /actually say yes to/);

  const a = await account('deleteme', 30, { friendRequests: 'everyone' });
  const b = await account('staysafe', 30, { friendRequests: 'everyone' });
  await a('POST', '/api/friends/request', { username: 'staysafe' });
  const { body } = await b('GET', '/api/friends/requests');
  await b('POST', `/api/friends/requests/${body.incoming[0].id}/accept`, {});
  await a('POST', `/api/chats/${b.user.id}`, { text: 'bye!' });
  assert.equal((await a('DELETE', '/api/me', { password: 'wrong-pass' })).status, 403);
  assert.equal((await a('DELETE', '/api/me', { password: 'password-123' })).status, 200);
  assert.equal((await a('GET', '/api/me')).status, 401);
  assert.equal((await b('GET', '/api/friends')).body.items.length, 0);
  const login = await client()('POST', '/api/auth/login', { username: 'deleteme', password: 'password-123' });
  assert.equal(login.status, 401);

  const kid = await account('kiddel', 9);
  assert.equal((await kid('DELETE', '/api/me', { password: 'password-123' })).status, 403);
  assert.equal((await kid('DELETE', '/api/me', { password: 'password-123', pin: '1234' })).status, 200);
});

test('admins can paste a YouTube key in the app; it is checked first and never returned', async () => {
  const good = `AIza${'k'.repeat(35)}`;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (!String(url).includes('googleapis.com')) return realFetch(url, opts);
    const key = new URL(url).searchParams.get('key');
    return key === good
      ? new Response(JSON.stringify({ items: [] }))
      : new Response('{"error":{"message":"API key not valid. Please pass a valid API key.","details":[{"reason":"API_KEY_INVALID"}]}}', { status: 400 });
  };
  try {
    process.env.ADMIN_USERNAMES = 'ytadmin';
    const admin = await account('ytadmin', 30);
    const other = await account('ytuser', 30);
    assert.equal((await other('PUT', '/api/admin/youtube-key', { key: good })).status, 403);
    const shape = await admin('PUT', '/api/admin/youtube-key', { key: '123.apps.googleusercontent.com' });
    assert.match(shape.body.error, /Client ID/);
    const bad = await admin('PUT', '/api/admin/youtube-key', { key: `AIza${'z'.repeat(35)}` });
    assert.match(bad.body.error, /not valid/);
    const ok = await admin('PUT', '/api/admin/youtube-key', { key: ` "${good}" ` });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.keySource, 'app');
    assert.ok(!JSON.stringify(ok.body).includes(good));
    const removed = await admin('DELETE', '/api/admin/youtube-key');
    assert.notEqual(removed.body.keySource, 'app');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ADMIN_USERNAMES;
  }
});
