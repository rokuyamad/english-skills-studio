// App Shell を更新したら必ずバージョンを上げて、古いキャッシュを破棄する。
const CACHE = 'english-skills-studio-v13';

const SHELL = [
  './',
  './index.html',
  './imitation.html',
  './slash.html',
  './shadowing.html',
  './review.html',
  './settings.html',
  './auth.html',
  './css/style.css',
  './css/slash.css',
  './css/shadowing.css',
  './css/auth.css',
  './css/settings.css',
  './css/review.css',
  './js/app.js',
  './js/imitation-app.js',
  './js/auth.js',
  './js/auth-page.js',
  './js/auth-ui.js',
  './js/mobile-topbar.js',
  './js/player.js',
  './js/progress-db.js',
  './js/sidebar-sortable.js',
  './js/supabase-config.js',
  './js/state.js',
  './js/ui.js',
  './js/dashboard-ui.js',
  './js/study-metrics.js',
  './js/study-settings.js',
  './js/study-sync.js',
  './js/settings-app.js',
  './js/settings-modal.js',
  './js/review-app.js',
  './js/srs-api.js',
  './js/srs-quick-add.js',
  './js/srs-scheduler.js',
  './js/slash-app.js',
  './js/slash-state.js',
  './js/slash-ui.js',
  './js/shadowing-app.js',
  './js/shadowing-state.js',
  './js/shadowing-ui.js',
  './data/data.json',
  './data/slash-data.json',
  './data/shadowing-data.json',
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
            if (res.ok && e.request.method === 'GET') c.put(e.request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // App Shell・その他: Network First、失敗時はキャッシュにフォールバック
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      if (res.ok && e.request.method === 'GET') {
        const resForCache = res.clone();
        e.waitUntil(
          caches
            .open(CACHE)
            .then(c => c.put(e.request, resForCache))
            .catch(err => console.warn('[sw] cache put failed:', err))
        );
      }
      return res;
    } catch (_) {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      if (e.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
      return Response.error();
    }
  })());
});
