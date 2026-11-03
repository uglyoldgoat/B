// Offline support for the hosted app: once opened, it starts without a connection.
// The build (vite.config.ts) fills in the version and the list of app files to save on install.
// Pages are fetched network-first (so updates arrive); built files and fonts are cache-first
// (their names change when their content does).
const CACHE = 'coachbook-eaaed56e7a';
const PRECACHE = ["./","assets/Photos-9AfODJUi.js","assets/Welcome-HcRO67Yi.js","assets/client-BzPcANb9.js","assets/clients-DWSbWUYW.js","assets/coach-DjmuTIxD.js","assets/index-BbwR8UZR.css","assets/index-o1JW_4ZI.js","assets/rolldown-runtime-W7wSyTde.js","assets/ui-DmHCFKcE.js","manifest.webmanifest","icon.svg","icon-192.png","apple-touch-icon.png"];
// Some servers send `Vary: Origin`; a saved file is the same file whoever asks for it.
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function keep(request, response) {
  if (response.ok || response.type === 'opaque') {
    const copy = response.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !fonts) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => keep(req, res))
        .catch(() => caches.match(req, MATCH).then((hit) => hit || caches.match('./', MATCH))),
    );
    return;
  }
  event.respondWith(
    caches.match(req, MATCH).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => keep(req, res))
          // Offline before the fonts were ever saved: carry on with the system fonts.
          .catch((err) => (url.hostname === 'fonts.googleapis.com' ? new Response('', { headers: { 'Content-Type': 'text/css' } }) : Promise.reject(err))),
    ),
  );
});
