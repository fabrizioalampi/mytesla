/* In viaggio: service worker. Tiene in cache solo i file di /in-viaggio/, così l'app
   funziona anche quando la connessione cade durante il viaggio. Nessuna richiesta esterna. */
'use strict';
const VERSION = 'in-viaggio-v2';
const FILES = [
  './', 'index.html', 'app.css', 'app.js', 'giochi.js', 'suoni.js', 'diario.js',
  'citta.js', 'italia.js', 'icone.js', 'quiz-domande.js', 'qrcode.js', 'icon.svg', 'font/nunito-latin.woff2'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('in-viaggio-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* rete prima (per avere sempre l'ultima versione), cache se la rete non c'è */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith('/in-viaggio/')) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, {ignoreSearch:true}).then(r => r || caches.match('./')))
  );
});
