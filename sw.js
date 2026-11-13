// SUPR KLICKER — offline cache. Bump the version number when you upload a new game version.
const CACHE = 'klicker-v1';
const MUSIC = 'klicker-music-v1';        // music is kept separately and survives game updates
const FILES = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const TRACKS = ['music1.mp3', 'music2.mp3', 'music3.mp3', 'music4.mp3', 'music5.mp3'];
const ROOT = new URL('./', self.location).pathname;       // the folder this game lives in

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('klicker-v') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The music player asks for a file in pieces (Range) — cut the piece out of the saved track
async function music(request, name) {
  const cache = await caches.open(MUSIC);
  const hit = await cache.match(name);
  if (!hit) return fetch(request);
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  if (!range) return hit;
  const buf = await hit.arrayBuffer(), size = buf.byteLength;
  let start = range[1] ? +range[1] : 0, end = range[2] ? +range[2] : size - 1;
  if (!range[1] && range[2]) { start = Math.max(0, size - +range[2]); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(ROOT)) return;
  const name = url.pathname.slice(ROOT.length) || 'index.html';
  if (TRACKS.includes(name)) { e.respondWith(music(e.request, name)); return; }
  if (!FILES.includes(name)) return;
  if (name === 'index.html') {
    // the game itself: network first (so updates arrive), cache when offline
    e.respondWith(
      fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); return r; })
        .catch(() => caches.match('index.html'))
    );
  } else {
    e.respondWith(caches.match(name).then(r => r || fetch(e.request)));
  }
});
