/* DOCX kabuğu (service worker): kabuk, ortak tema, DocumentX ve SoftwareX dosyaları internet yokken de açılır.
   Yalnız DOSYALAR listesindekilere karışır (önce ağ, yoksa saklanan); uygulamaların kendi service worker'ları
   kendi klasörlerini yönetir. Yayında liste ve sürüm araclar/site-hazirla.mjs ile yazılır. */
const SURUM = 'gelistirme';
const ONEK = 'docx-kabuk-';
const ONBELLEK = ONEK + SURUM;
const DOSYALAR = ['index.html', 'manifest.webmanifest', 'ortak/tema.css', 'ortak/dolfin.png', 'kabuk/kabuk.css', 'kabuk/kabuk.js', 'kabuk/simge.svg'];
const LISTE = new Set(DOSYALAR);
const KAPSAM = new URL(self.registration.scope).pathname;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(ONBELLEK);
    await Promise.all(DOSYALAR.map((f) => c.add(new Request(f, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Yalnız DOCX kabuğunun eski önbellekleri silinir; aynı sitedeki diğer uygulamalarınkine dokunulmaz
    for (const ad of await caches.keys()) if (ad.startsWith(ONEK) && ad !== ONBELLEK) await caches.delete(ad);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || !u.pathname.startsWith(KAPSAM)) return;
  let yol = u.pathname.slice(KAPSAM.length);
  try { yol = decodeURIComponent(yol); } catch { return; }
  if (yol === '' || yol.endsWith('/')) yol += 'index.html';
  if (!LISTE.has(yol)) return;
  e.respondWith((async () => {
    const c = await caches.open(ONBELLEK);
    try {
      const yanit = await fetch(r);
      if (yanit.ok) await c.put(yol, yanit.clone());
      return yanit;
    } catch {
      return (await c.match(yol)) || Response.error();
    }
  })());
});
