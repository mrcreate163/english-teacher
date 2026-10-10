/* Работа без интернета: закрепляем файлы приложения в кэше. Запросы к серверу синхронизации (/api/) в кэш не попадают. */
const CACHE = 'moi-uroki-__VERSION__';
const CORE = ['./', 'index.html', 'css/style.css', 'js/util.js', 'js/store.js', 'js/components.js', 'js/sync.js', 'js/forms.js', 'js/views.js', 'js/main.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Сначала сеть, чтобы обновления приложения приходили сразу; без сети — кэш.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
