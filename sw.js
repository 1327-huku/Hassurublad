const CACHE_NAME = 'hassurublad-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/IMG_4213.jpeg?v=2'
];

// 新しいバージョンを待機させず即座に有効化
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 古いアイコンの記憶（キャッシュ）をすべて自動削除
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 常にネットから最新版を取得し、電波がない時だけキャッシュを使う
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
