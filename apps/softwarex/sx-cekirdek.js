/* SoftwareX çekirdeği: dört belge, dosya adı eşleştirme, belgeler arası bağlantı ve makine adresi.
   Tarayıcıya bağlı değildir; Node testleri (test/sx.test.js) aynı kodu çalıştırır.

   Belgeler SOFTWAREX klasöründeki Python betikleriyle (yapay zekâ yazar) üretilir; SoftwareX yalnız gösterir.
   Belgelerin üst menüsü (nav.docnav) birbirine "Servis.html#makine1" gibi bağlantı verir: açık makine (#makine1)
   diğer belgede de açılır. SoftwareX bu bağlantıları kendi sekmesine çevirir. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SxCekirdek = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Sıra ve adlar belgelerin kendi üst menüsüyle aynıdır */
  const BELGELER = Object.freeze([
    Object.freeze({ id: 'teknik', dosya: 'Yazılım Dokümantasyonu.html', ad: 'Teknik doküman', okuyucu: 'Teknik ve adresli: sizin için' }),
    Object.freeze({ id: 'servis', dosya: 'Servis.html', ad: 'Servis', okuyucu: 'Kurulum ve servis personeli: servis şifrelerini içerir' }),
    Object.freeze({ id: 'kullanim', dosya: 'KKOut.html', ad: 'Kullanım bilgileri', okuyucu: 'Müşteri: kullanım kılavuzunun PLC bölümü' }),
    Object.freeze({ id: 'rapor', dosya: 'Rapor.html', ad: 'Denetim raporu', okuyucu: 'PLC yazılımcısı (detaylı) ve işletme (sade)' })
  ]);

  /** Ad ya da yol karşılaştırma anahtarı: büyük/küçük harf ve Unicode biçimi (NFC/NFD) önemsiz */
  const anahtar = (ad) => String(ad || '').normalize('NFC').toLocaleLowerCase('tr');
  const DOSYADAN = new Map(BELGELER.map((b) => [anahtar(b.dosya), b]));
  const KIMLIKTEN = new Map(BELGELER.map((b) => [b.id, b]));

  /** Dosya adı → belge (dört belgeden biri değilse null). Büyük/küçük harf ve Unicode biçimi önemsizdir. */
  function belgeTuru(dosyaAdi) {
    return DOSYADAN.get(anahtar(dosyaAdi)) || null;
  }

  const belge = (id) => KIMLIKTEN.get(id) || null;
  const htmlMi = (ad) => /\.html?$/i.test(String(ad || ''));

  /**
   * Belge içindeki bağlantının hedefi: dört belgeden birine gidiyorsa { id, hash }, değilse null.
   * "Servis.html#makine1", "./KKOut.html", "Yaz%C4%B1l%C4%B1m%20Dok%C3%BCmantasyonu.html#makine2" …
   * Aynı sayfa içi (#…), başka şemalı (http:, blob:, mailto:) ve başka adlı bağlantılar null döner.
   */
  function hedef(href) {
    const s = String(href || '').trim();
    if (!s || s.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
    const i = s.indexOf('#');
    const yol = (i < 0 ? s : s.slice(0, i)).split('?')[0];
    let ad = yol.split('/').pop();
    try { ad = decodeURIComponent(ad); } catch { /* bozuk kodlama: olduğu gibi denenir */ }
    const b = belgeTuru(ad);
    if (!b) return null;
    const hash = i < 0 ? '' : s.slice(i);
    return { id: b.id, hash: hash === '#' ? '' : hash };
  }

  /**
   * Belgedeki göreli bağlantının klasördeki yolu (kaynak: bağlantının bulunduğu belgenin yolu):
   * ("Makine 1/a.html", "b.html") → "Makine 1/b.html"; ("Makine 1/a.html", "../Servis.html") → "Servis.html".
   * Sorgu (?…) ve adres (#…) atılır. Kökün dışına çıkan, mutlak ya da başka şemalı bağlantı '' döner.
   */
  function goreliYol(kaynak, href) {
    const s = String(href || '').trim().replace(/\\/g, '/').split('#')[0].split('?')[0];
    if (!s || s.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(s)) return '';
    const parca = String(kaynak || '').split('/').slice(0, -1);
    for (let p of s.split('/')) {
      try { p = decodeURIComponent(p); } catch { /* bozuk kodlama: olduğu gibi */ }
      if (p === '' || p === '.') continue;
      if (p === '..') {
        if (!parca.length) return '';
        parca.pop();
      } else parca.push(p);
    }
    return parca.join('/');
  }

  /**
   * Başka belgeye geçerken taşınacak makine adresi: "#makine1-alarmlar" → "#makine1".
   * Ana sayfa (#home) ve parametreli adresler (#shot=…) taşınmaz.
   */
  function makineAdresi(hash) {
    let h = String(hash || '').replace(/^#/, '');
    try { h = decodeURIComponent(h); } catch { /* olduğu gibi */ }
    if (!h || /[=&]/.test(h)) return '';
    const m = /^([a-z0-9_]+)/i.exec(h);
    return m && m[1].toLowerCase() !== 'home' ? `#${m[1]}` : '';
  }

  /**
   * Taranan HTML'ler → { ana: Map(belge id → girdi), digerleri: [girdi…] }.
   * Ana belge yalnız klasörün kökündeki aynı adlı dosyadır; alt klasördeki aynı adlı dosya "diğer" sayılır.
   * girdi: { yol: 'alt/klasör/ad.html', ad: 'ad.html', … }
   */
  function ayir(girdiler) {
    const ana = new Map();
    const digerleri = [];
    for (const g of girdiler || []) {
      const b = g.yol.includes('/') ? null : belgeTuru(g.ad);
      if (b && !ana.has(b.id)) ana.set(b.id, g);
      else digerleri.push(g);
    }
    digerleri.sort((a, b) => a.yol.localeCompare(b.yol, 'tr'));
    return { ana, digerleri };
  }

  /** "36,8 MB" */
  function boyutYaz(bayt) {
    const n = Number(bayt) || 0;
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    return `${(n / 1048576).toFixed(1).replace('.', ',')} MB`;
  }

  /** "23.11.2026 14:05" (yerel saat) */
  function tarihYaz(ms) {
    const d = new Date(Number(ms) || 0);
    const p = (x) => String(x).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  return { BELGELER, belge, belgeTuru, htmlMi, hedef, goreliYol, yolAnahtari: anahtar, makineAdresi, ayir, boyutYaz, tarihYaz };
});
