/*
 * sw.js — Service Worker: cached die App-Hülle (HTML/CSS/JS/Icons) für
 * den Offline-Start. Die eigentlichen Klassenbuch-Daten werden NICHT hier,
 * sondern von Firestores eigenem Offline-Cache verwaltet (siehe
 * firebaseSync.js). Externe Skripte (Firebase-SDK von gstatic.com)
 * werden bewusst nicht vorab gecacht, damit immer eine aktuelle,
 * sichere Version geladen wird, sobald Internet verfügbar ist.
 */

const CACHE_NAME = 'klassenbuch-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/store.js',
  './js/firebaseSync.js',
  './js/parser.js',
  './js/stats.js',
  './js/warnings.js',
  './js/exportImport.js',
  './js/speech.js',
  './js/app.js',
  './js/vendor/xlsx.full.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Nur eigene Origin cachen/bedienen (Firebase/Firestore-Requests unangetastet lassen).
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
