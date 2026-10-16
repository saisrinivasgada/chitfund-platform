import { syncSavedPayments } from './outbox';

const CACHE_PREFIX = 'chitwise-shell-';
const CURRENT_CACHE = CACHE_PREFIX + __CHITWISE_OFFLINE_BUILD__;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch('/offline-assets.json', { cache: 'no-store' });
    if (!response.ok) return; // Development builds do not install an app shell.
    const manifest = await response.json();
    if (manifest.version !== __CHITWISE_OFFLINE_BUILD__) throw new Error('App update is still being prepared');
    await (await caches.open(CURRENT_CACHE)).addAll(manifest.assets);
    // Existing pages choose when to activate an update; never replace running
    // payment-entry code in the middle of a financial action.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== CURRENT_CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // API business data is encrypted and scoped in IndexedDB by the app itself.
  // Never cache credentials, API responses or financial POSTs in Cache Storage.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CURRENT_CACHE);
      return await cache.match('/index.html') ?? Response.error();
    }));
  } else {
    event.respondWith((async () => {
      const cache = await caches.open(CURRENT_CACHE);
      return await cache.match(request) ?? fetch(request);
    })());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'chitwise-payments') event.waitUntil(syncSavedPayments({ deadline: Date.now() + 25_000 }));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SYNC_SAVED_PAYMENTS') event.waitUntil(syncSavedPayments({ deadline: Date.now() + 25_000 }));
});
