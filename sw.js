const CACHE_NAME = 'sanskrit-karaoke-v1.4.0-cleanup-1';
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
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
