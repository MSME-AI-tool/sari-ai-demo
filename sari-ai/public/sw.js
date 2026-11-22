/* global clients */
const CACHE = 'sari-ai-shell-v2';
const OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('sari-ai-shell-') && key !== CACHE)
      .map((key) => caches.delete(key))
  )).then(() => clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate' && new URL(event.request.url).origin === self.location.origin) {
    event.respondWith(fetch(event.request).catch(async () => (
      (await caches.match(OFFLINE)) ?? new Response('Reconnect to open Your Store.', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    )));
  }
});
