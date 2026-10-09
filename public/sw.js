// Ember service worker: caches the app shell so it opens instantly and works as an installed app.
// API calls and videos always go to the network (never cached) so feeds and chats stay fresh & private.
const CACHE = 'ember-v1';
const SHELL = [
  '/', '/index.html', '/css/styles.css', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png',
  '/js/app.js', '/js/api.js', '/js/ui.js',
  '/js/views/auth.js', '/js/views/onboarding.js', '/js/views/settingsForm.js', '/js/views/feed.js', '/js/views/friends.js',
  '/js/views/create.js', '/js/views/inbox.js', '/js/views/chat.js', '/js/views/profile.js', '/js/views/settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return;
  // Network first (so updates ship immediately), fall back to cache when offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html'))),
  );
});
