// GorivoLog Service Worker — omogućava da se aplikacija otvori i bez interneta
// (nakon što je bar jednom uspješno učitana dok je bilo signala).
const CACHE_NAME = 'gorivolog-v1';
const APP_SHELL = [
  './gorivo-log-v17.html',
  './manifest.json',
  './logo.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(err => console.warn('SW install cache greška (nije fatalno):', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // NIKAD ne diraj Firebase/Google pozive — moraju ići direktno na mrežu,
  // Firestore ima svoj vlastiti (bolji) offline mehanizam za podatke.
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('google.com') ||
      url.hostname.includes('gstatic.com')) {
    return;
  }
  if (event.request.method !== 'GET') return;

  // Za sve ostalo (sam HTML fajl, biblioteke, logo): probaj mrežu prvo (svježe),
  // ako nema mreže — vrati sačuvanu (keširanu) verziju.
  event.respondWith(
    fetch(event.request)
      .then(resp => {
        const respClone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, respClone)).catch(()=>{});
        return resp;
      })
      .catch(() =>
        caches.match(event.request).then(cached => cached || caches.match('./gorivo-log-v17.html'))
      )
  );
});
