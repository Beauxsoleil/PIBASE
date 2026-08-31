const CACHE_NAME = 'pibase-kiosk-v1';
const scopeUrl = path => new URL(path, self.registration.scope).href;

const APP_SHELL = [
  'display.html',
  'styles.css',
  'firebase-config.js',
  'events-ui.js',
  'kiosk-runtime.js',
  'calendar.ics',
  'angrr-seal.png'
].map(scopeUrl);

const FIREBASE_SDK = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_SHELL.map(url => cache.add(new Request(url, { cache: 'reload' }))));
    await Promise.allSettled(FIREBASE_SDK.map(url => cache.add(new Request(url, { mode: 'cors', cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('pibase-kiosk-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, timeoutMs = 4500) {
  const cache = await caches.open(CACHE_NAME);
  let timeout;
  try {
    const network = await Promise.race([
      fetch(request),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('network timeout')), timeoutMs); })
    ]);
    clearTimeout(timeout);
    if (network && network.ok) cache.put(request, network.clone()).catch(() => {});
    return network;
  } catch (error) {
    clearTimeout(timeout);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  const update = fetch(request).then(response => {
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  }).catch(() => null);
  return cached || (await update) || Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/10.12.2/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || url.pathname.endsWith('/display.html') || url.pathname.endsWith('/calendar.ics')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (/\.(?:js|css|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
