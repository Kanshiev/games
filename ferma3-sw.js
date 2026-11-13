// Ферма Антоши 3 — офлайн-кэш. При обновлении игры увеличь номер версии ниже.
const CACHE = 'ferma3-v2';
const MUSIC = 'ferma-music-v1';          // музыка лежит отдельно и при обновлении игры не стирается
const FILES = ['ferma3.html', 'ferma3.webmanifest', 'ferma3-bg.webp', 'ferma3-icon-192.png', 'ferma3-icon-512.png'];
const TRACKS = ['music1.mp3', 'music2.mp3', 'music3.mp3', 'music4.mp3'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('ferma3-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Плеер просит музыку кусками (Range) — отдаём нужный кусок из сохранённого файла
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

// Обслуживаем только файлы фермы — остальные игры в этой же папке не трогаем.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const name = url.pathname.split('/').pop();
  // музыку перехватываем только для самой фермы
  if (TRACKS.includes(name)) { if ((e.request.referrer || '').includes('ferma3.html')) e.respondWith(music(e.request, name)); return; }
  if (!FILES.includes(name)) return;
  if (name === 'ferma3.html') {
    // сама игра: сначала сеть (чтобы приходили обновления), без сети — из кэша
    e.respondWith(
      fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(name, copy)); return r; })
        .catch(() => caches.match(name))
    );
  } else {
    e.respondWith(caches.match(name).then(r => r || fetch(e.request)));
  }
});
