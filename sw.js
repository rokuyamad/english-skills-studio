const CACHE = 'imitation-player-v2';

const SHELL = [
  './',
  './index.html',
  './slash.html',
  './css/style.css',
  './css/slash.css',
  './js/app.js',
  './js/player.js',
  './js/state.js',
  './js/ui.js',
  './js/slash-app.js',
  './js/slash-state.js',
  './js/slash-ui.js',
  './data.json',
  './slash-data.json',
  './manifest.json',
  './icons/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Range request は SW をスキップ（音声ストリーミング用）
  if (e.request.headers.get('range')) return;

  const url = new URL(e.request.url);

  // 音声ファイル: Cache First（一度再生したらオフラインでも使える）
  if (url.pathname.includes('/audio/')) {
    e.respondWith(
      caches.open(CACHE).then(c =>
        c.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(res => {
            if (res.ok) c.put(e.request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // App Shell・その他: Network First、失敗時はキャッシュにフォールバック
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(e.request);
        if (cached) return cached;
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return Response.error();
      })
  );
});
