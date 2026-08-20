const CACHE_PREFIX = 'volume-calculator-';
const CACHE_NAME = CACHE_PREFIX + 'v1.0.2';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json'
];
const OPTIONAL_ASSETS = ['./bg-light2.jpg', './bg-dark1.jpg'];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async function(cache) {
      await cache.addAll(CORE_ASSETS);
      await Promise.all(OPTIONAL_ASSETS.map(function(asset) {
        return fetch(asset).then(function(response) {
          if (response.ok) return cache.put(asset, response);
        }).catch(function(){});
      }));
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        if (key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME) return caches.delete(key);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request).then(function(response) {
        if (event.request.url.indexOf(self.location.origin) === 0 && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        }
        return response;
      }).catch(function() {
        return caches.match('./index.html');
      });
    })
  );
});
