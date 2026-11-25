// En küçük ZIP yazıcı: dosyalar sıkıştırılmadan (STORE) eklenir. PDF zaten sıkıştırılmış olduğu için boyut farkı
// yoktur, üretim anlıktır. Dosya adları UTF-8 (Türkçe karakterler Windows Gezgini ve 7-Zip'te doğru görünür).
(function () {
  "use strict";
  const TABLO = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = TABLO[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function dosZamani(d) {
    const zaman = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const tarih = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { zaman, tarih };
  }

  /** Aynı adı taşıyan dosyalar "ad (2).pdf" biçiminde ayrılır. */
  function benzersiz(adlar) {
    const g = new Set();
    return adlar.map((a) => {
      let y = a, n = 2;
      const nokta = a.lastIndexOf(".");
      const kok = nokta > 0 ? a.slice(0, nokta) : a, uz = nokta > 0 ? a.slice(nokta) : "";
      while (g.has(y.toLowerCase())) y = `${kok} (${n++})${uz}`;
      g.add(y.toLowerCase());
      return y;
    });
  }

  /** dosyalar: [{ad, bayt: Uint8Array}] → Uint8Array (zip) */
  function olustur(dosyalar) {
    const kod = new TextEncoder();
    const adlar = benzersiz(dosyalar.map((d) => d.ad));
    const { zaman, tarih } = dosZamani(new Date());
    const yerel = [], merkez = [];
    let ofset = 0;
    dosyalar.forEach((d, i) => {
      const ad = kod.encode(adlar[i]);
      const crc = crc32(d.bayt), boy = d.bayt.length;
      const b = new DataView(new ArrayBuffer(30));
      b.setUint32(0, 0x04034b50, true); b.setUint16(4, 20, true); b.setUint16(6, 0x0800, true); b.setUint16(8, 0, true);
      b.setUint16(10, zaman, true); b.setUint16(12, tarih, true); b.setUint32(14, crc, true);
      b.setUint32(18, boy, true); b.setUint32(22, boy, true); b.setUint16(26, ad.length, true); b.setUint16(28, 0, true);
      yerel.push(new Uint8Array(b.buffer), ad, d.bayt);
      const m = new DataView(new ArrayBuffer(46));
      m.setUint32(0, 0x02014b50, true); m.setUint16(4, 20, true); m.setUint16(6, 20, true); m.setUint16(8, 0x0800, true); m.setUint16(10, 0, true);
      m.setUint16(12, zaman, true); m.setUint16(14, tarih, true); m.setUint32(16, crc, true); m.setUint32(20, boy, true); m.setUint32(24, boy, true);
      m.setUint16(28, ad.length, true); m.setUint16(30, 0, true); m.setUint16(32, 0, true); m.setUint16(34, 0, true); m.setUint16(36, 0, true);
      m.setUint32(38, 0, true); m.setUint32(42, ofset, true);
      merkez.push(new Uint8Array(m.buffer), ad);
      ofset += 30 + ad.length + boy;
    });
    const merkezBoy = merkez.reduce((a, x) => a + x.length, 0);
    const son = new DataView(new ArrayBuffer(22));
    son.setUint32(0, 0x06054b50, true); son.setUint16(8, dosyalar.length, true); son.setUint16(10, dosyalar.length, true);
    son.setUint32(12, merkezBoy, true); son.setUint32(16, ofset, true);
    const parca = yerel.concat(merkez, [new Uint8Array(son.buffer)]);
    const cikti = new Uint8Array(parca.reduce((a, x) => a + x.length, 0));
    let o = 0;
    for (const p of parca) { cikti.set(p, o); o += p.length; }
    return cikti;
  }

  window.Zip = { olustur, crc32, benzersiz };
})();
