/* ============================================================
   SERVICE WORKER v3 — Siempre usa archivos frescos
   ============================================================ */

// Cambiar este número cada vez que actualices la app
const VERSION = 'levantamiento-v3';

const ARCHIVOS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

// INSTALAR — cachear archivos frescos
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(VERSION).then(function(cache) {
      return cache.addAll(ARCHIVOS);
    }).then(function() {
      // Activar inmediatamente sin esperar
      return self.skipWaiting();
    })
  );
});

// ACTIVAR — borrar cachés viejos
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== VERSION; // borrar todo excepto el actual
        }).map(function(key) {
          console.log('SW: borrando caché viejo:', key);
          return caches.delete(key);
        })
      );
    }).then(function() {
      // Tomar control de todas las pestañas abiertas inmediatamente
      return self.clients.claim();
    })
  );
});

// FETCH — Network First para archivos de la app, Cache First para externos
self.addEventListener('fetch', function(e) {
  // Solo manejar GET
  if (e.request.method !== 'GET') return;

  var url = e.request.url;

  // Para archivos de la app: intentar red primero, caché como respaldo
  if (url.includes(self.location.origin)) {
    e.respondWith(
      fetch(e.request).then(function(response) {
        // Si la respuesta es válida, actualizarla en caché
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(VERSION).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Sin red — usar caché
        return caches.match(e.request);
      })
    );
  }
  // Para recursos externos (fuentes, mapas) usar caché si está disponible
  else {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request);
      })
    );
  }
});

// MENSAJE — permite forzar actualización desde la app
self.addEventListener('message', function(e) {
  if (e.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
