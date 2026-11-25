/* ELECTRICX service worker: uygulama kurulunca (PWA) program dosyalarını saklar, internet yokken de açılır.
   Yalnız http(s) üzerinden açılınca çalışır (GitHub Pages); dosyadan (çift tık) açılışta kaydedilmez.
   Ağ önce gelir: internet varken her dosya sunucudan taze alınır ve saklanan kopya yenilenir,
   internet yoksa saklanan kopya verilir. Böylece yeni sürüm için sürüm numarası değiştirmek gerekmez.
   Veritabanı (GitHub API) ve başka adresler buraya uğramaz; veri zaten tarayıcı veritabanında durur. */

'use strict';

const ONBELLEK = 'electricx-program-1';

// Kurulumda hemen saklananlar: kabuk ve üç programın kodu. Geri kalanı (fotoğraflar vb.) ilk açılışta saklanır.
const CEKIRDEK = [
  './',
  'index.html',
  'manifest.webmanifest',
  'ortak/tema.css',
  'ortak/ex-db.js',
  'ortak/ex-github.js',
  'ortak/ex-aktar.js',
  'ortak/ex-boot.js',
  'ortak/ex-yerel.js',
  'ortak/varliklar/dolfin.png',
  'ortak/varliklar/ikon.svg',
  'ortak/varliklar/ikon-32.png',
  'ortak/varliklar/ikon-192.png',
  'KUTU/index.html',
  'KUTU/kutu.css',
  'KUTU/kutu.js',
  'KUTU/kurallar/modeller.js',
  'KUTU/kurallar/kurallar.html',
  'KUTU/kurallar/panolar.html',
  'ETIKET/index.html',
  'SEMA/index.html',
  'SEMA/uygulama/arayuz/ana.js',
  'SEMA/uygulama/arayuz/arsiv.js',
  'SEMA/uygulama/arayuz/ayarlar.js',
  'SEMA/uygulama/arayuz/duzenleyici.js',
  'SEMA/uygulama/arayuz/galeri.js',
  'SEMA/uygulama/arayuz/onizleme.js',
  'SEMA/uygulama/arayuz/temel.js',
  'SEMA/uygulama/arayuz/terimler.js',
  'SEMA/uygulama/arayuz/toplu.js',
  'SEMA/uygulama/ayarlar.js',
  'SEMA/uygulama/birlestir.js',
  'SEMA/uygulama/bulut.js',
  'SEMA/uygulama/ceviri.js',
  'SEMA/uygulama/cizim.js',
  'SEMA/uygulama/font-sema.js',
  'SEMA/uygulama/fontkit.umd.min.js',
  'SEMA/uygulama/fontlar.js',
  'SEMA/uygulama/hafiza.js',
  'SEMA/uygulama/icerik.js',
  'SEMA/uygulama/logo.js',
  'SEMA/uygulama/pdf-lib.min.js',
  'SEMA/uygulama/pdf.min.js',
  'SEMA/uygulama/pdf.worker.min.js',
  'SEMA/uygulama/sozluk.js',
  'SEMA/uygulama/surum.js',
  'SEMA/uygulama/tablo.js',
  'SEMA/uygulama/tasarimlar.js',
  'SEMA/uygulama/xlsx.core.min.js',
  'SEMA/uygulama/yerel-yetenek.js',
  'SEMA/uygulama/zip.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(ONBELLEK);
    // Tek dosya gelmezse kurulum düşmesin; o dosya ilk açılışta saklanır
    await Promise.all(CEKIRDEK.map((yol) => cache.add(new Request(yol, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const ad of await caches.keys()) if (ad.startsWith('electricx-') && ad !== ONBELLEK) await caches.delete(ad);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const istek = event.request;
  if (istek.method !== 'GET' || istek.headers.has('range')) return;
  if (new URL(istek.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(ONBELLEK);
    try {
      const yanit = await fetch(istek);
      if (yanit.ok && yanit.type === 'basic') cache.put(istek, yanit.clone()).catch(() => {});
      return yanit;
    } catch (hata) {
      const saklanan = (await cache.match(istek)) || (await cache.match(istek, { ignoreSearch: true }));
      if (saklanan) return saklanan;
      if (istek.mode === 'navigate') {
        const kabuk = await cache.match('index.html');
        if (kabuk) return kabuk;
      }
      throw hata;
    }
  })());
});
