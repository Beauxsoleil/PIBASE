const CACHE_NAME = 'pibase-app-v5';
const scopeUrl = path => new URL(path, self.registration.scope).href;

const APP_SHELL = [
  './',
  'index.html',
  'display.html',
  'events.html',
  'offline.html',
  'manifest.webmanifest',
  'styles.css',
  'firebase-config.js',
  'pibase-util.js',
  'events-ui.js',
  'kiosk-runtime.js',
  'pwa-runtime.js',
  'calendar.ics',
  'angrr-seal.png',
  'icons/pibase-icon.svg',
  'icons/pibase-192.png',
  'icons/pibase-512.png',
  'icons/pibase-maskable-512.png'
].map(scopeUrl);

const FIREBASE_SDK = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(url => cache.add(new Request(url, { cache: 'reload' }))));
    await Promise.allSettled(FIREBASE_SDK.map(url => cache.add(new Request(url, { mode: 'cors', cache: 'reload' }))));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => /^(?:pibase-kiosk-|pibase-app-)/.test(key) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function cacheKey(request) {
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.endsWith('/calendar.ics')) return scopeUrl('calendar.ics');
  return request;
}

async function networkFirst(request, timeoutMs = 3500) {
  const cache = await caches.open(CACHE_NAME);
  const key = cacheKey(request);
  let timeout;
  try {
    const network = await Promise.race([
      fetch(request),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('network timeout')), timeoutMs); })
    ]);
    clearTimeout(timeout);
    if (network && network.ok) cache.put(key, network.clone()).catch(() => {});
    return network;
  } catch (error) {
    clearTimeout(timeout);
    const cached = await cache.match(key, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const key = cacheKey(request);
  const cached = await cache.match(key, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) cache.put(key, response.clone()).catch(() => {});
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

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/10.12.2/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  const isAppCode = /\/(?:index\.html|display\.html|events\.html|offline\.html|firebase-config\.js|pibase-util\.js|events-ui\.js|kiosk-runtime\.js|pwa-runtime\.js)$/.test(url.pathname);
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request).catch(() => caches.match(scopeUrl('offline.html'))));
    return;
  }

  if (isAppCode || url.pathname.endsWith('/calendar.ics') || url.pathname.endsWith('/manifest.webmanifest')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (/\.(?:css|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
