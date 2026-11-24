const CACHE_NAME = 'remix-crm-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Do not cache API endpoints or non-GET requests
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/health')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache successful responses for navigation & static assets
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        try {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            const indexHtml = await caches.match('/index.html');
            if (indexHtml) return indexHtml;
          }
        } catch (e) {
          // ignore cache errors
        }
        // Always return a valid Response object to prevent "Failed to convert value to 'Response'" TypeError
        return new Response('<!DOCTYPE html><html><head><meta charset="utf-8"><title>CRM Offline</title></head><body style="font-family:sans-serif;padding:2rem;text-align:center;"><h2>Conexão temporariamente indisponível</h2><p>Verifique sua conexão ou recarregue a página.</p><button onclick="window.location.reload()" style="padding:8px 16px;border-radius:8px;background:#171717;color:white;border:none;cursor:pointer;">Recarregar</button></body></html>', {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      })
  );
});
