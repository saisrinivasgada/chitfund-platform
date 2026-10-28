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

async function deliverSavedPayments(backgroundSync) {
  const deadline = Date.now() + 25_000;
  let outcome;
  let previousRemaining = Infinity;
  for (let batch = 0; batch < 10; batch++) {
    outcome = await syncSavedPayments({ deadline });
    if (!outcome.retryNeeded) return;
    // Drain another bounded batch while this worker is already awake. Avoid
    // waiting for a browser-controlled wake-up just for entry 26, and stop on
    // backoff, no progress or the overall event budget.
    if (outcome.nextAttemptAt > Date.now() || outcome.remaining >= previousRemaining || Date.now() >= deadline) break;
    previousRemaining = outcome.remaining;
  }
  if (!outcome.retryNeeded) return;
  // An immediately deliverable remainder (batch/time budget) needs another
  // event. Re-register while firing so the browser retains this tag.
  if (outcome.nextAttemptAt <= Date.now() && self.registration.sync) {
    await self.registration.sync.register('chitwise-payments');
    return;
  }
  // Do not turn a transport failure into a successful Background Sync event.
  // Reject so the browser applies its retry/backoff policy. Auth/review-only
  // work is excluded from retryNeeded and cannot create a retry loop.
  if (backgroundSync) throw new Error('Saved collections need another background sync attempt');
  if (self.registration.sync) await self.registration.sync.register('chitwise-payments');
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'chitwise-payments') event.waitUntil(deliverSavedPayments(true));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SYNC_SAVED_PAYMENTS') event.waitUntil(deliverSavedPayments(false));
});
