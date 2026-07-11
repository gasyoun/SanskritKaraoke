const CACHE_NAME = 'sanskrit-karaoke-v1.4.8-html-network-first';
const ASSETS = [
  'catalogue.html',
  'student.html',
  'progress.html',
  'index.html',
  'src/style.css',
  'src/scripts/app.js',
  'src/scripts/srs.js',
  'src/scripts/quizzes.js',
  'src/scripts/strings.js',
  'verses/index.json',
  'manifest.json'
];
const HTML_ASSETS = new Set(['', 'catalogue.html', 'student.html', 'progress.html', 'index.html']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Prune old caches — only keep the current CACHE_NAME
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const pathName = url.pathname.split('/').pop() || '';
  const isAppHtml =
    url.origin === self.location.origin &&
    (event.request.mode === 'navigate' || HTML_ASSETS.has(pathName));

  if (isAppHtml) {
    event.respondWith(
      fetch(event.request, { cache: 'reload' })
        .then((response) => {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
          return response;
        })
        .catch(() => caches.match(event.request).then((response) => response || caches.match(pathName || 'index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
