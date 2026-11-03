// GorivoLog Service Worker — aplikacija se otvara i radi i bez interneta
// (nakon što je bar jednom učitana dok je bilo signala).
// v4: čuva i Firebase biblioteku (ranije nije, pa se bez interneta nije mogla ni pokrenuti),
//     a stranica se bez odgovora mreže za 3 sekunde odmah otvara iz sačuvane kopije.
const CACHE_NAME = 'gorivolog-v4';
const FB_VER = '10.14.1';
const APP_SHELL = [
  './gorivo-log-v17.html',
  './manifest.json',
  './logo.png',
  `https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`,
  `https://www.gstatic.com/firebasejs/${FB_VER}/firebase-auth.js`,
  `https://www.gstatic.com/firebasejs/${FB_VER}/firebase-firestore.js`,
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

self.addEventListener('install', event => {
  // Svaki fajl posebno - ako jedan ne uspije, ostali se ipak sačuvaju
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    Promise.allSettled(APP_SHELL.map(url => cache.add(url).catch(err => console.warn('SW: ne mogu sačuvati', url, err))))
  ));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => caches.open(CACHE_NAME).then(cache => Promise.allSettled(APP_SHELL.map(url => cache.add(url).catch(()=>{})))))
  );
  self.clients.claim();
});

function sacuvaj(req, resp){
  if(resp && (resp.ok || resp.type === 'opaque')){
    const kopija = resp.clone();
    caches.open(CACHE_NAME).then(c => c.put(req, kopija)).catch(()=>{});
  }
  return resp;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firebase BIBLIOTEKA (fiksna verzija, ne mijenja se) - iz sačuvane kopije, mreža samo ako je nema
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(caches.match(req).then(c => c || fetch(req).then(r => sacuvaj(req, r))));
    return;
  }
  // Firebase/Google PODACI i prijava - nikad ne diraj (Firestore ima svoje offline čuvanje)
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('google.com') || url.hostname.includes('gstatic.com') ||
      url.hostname.includes('firebaseapp.com')) {
    return;
  }

  // Sama stranica: mreža prvo (da stigne nova verzija), ali ako mreža ne odgovori za 3s - sačuvana kopija
  const jeStranica = req.mode === 'navigate' || url.pathname.endsWith('.html');
  if (jeStranica) {
    event.respondWith(new Promise(resolve => {
      let gotovo = false;
      const izKesa = () => caches.match(req, {ignoreSearch:true}).then(c => c || caches.match('./gorivo-log-v17.html', {ignoreSearch:true}));
      const t = setTimeout(() => { izKesa().then(c => { if (c && !gotovo) { gotovo = true; resolve(c); } }); }, 3000);
      fetch(req).then(r => { sacuvaj(req, r); if (!gotovo) { gotovo = true; clearTimeout(t); resolve(r); } })
        .catch(() => izKesa().then(c => { if (!gotovo) { gotovo = true; clearTimeout(t); resolve(c || Response.error()); } }));
    }));
    return;
  }

  // Ostalo (biblioteke, logo): mreža prvo, bez mreže sačuvana kopija
  event.respondWith(fetch(req).then(r => sacuvaj(req, r)).catch(() => caches.match(req, {ignoreSearch:true})));
});
