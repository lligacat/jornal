// Xarxa primer, memòria cau com a recanvi: l'app s'obre sense cobertura després de la primera visita.
const CAU = 'jornal-v6';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // També es guarda la llibreria que llegeix les nòmines en PDF, perquè funcioni sense cobertura.
  const propi = url.origin === self.location.origin || url.hostname === 'cdnjs.cloudflare.com';
  if (e.request.method !== 'GET' || !propi) return;
  e.respondWith(
    fetch(e.request)
      .then(resposta => {
        const copia = resposta.clone();
        caches.open(CAU).then(c => c.put(e.request, copia));
        return resposta;
      })
      .catch(() => caches.match(e.request))
  );
});
