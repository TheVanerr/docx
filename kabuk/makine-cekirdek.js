/* DOCX Makine sayfasının çekirdeği: uygulamaların veri yollarından seri numarasını ve belge türünü çıkarır, belgeleri
   makineye göre toplar. Tarayıcıya bağlı değildir; Node testi aynı kodu çalıştırır (araclar/makine-test.js).
   Makine = 7 haneli seri numarası. Uygulamalar proje klasörünü "<seri>-<FİRMA>-<MODEL>" diye adlandırır; seri yalnız
   dosya adındaysa (garanti, CE, makine kodları) model ve firma dosyanın içinden okunur (yalnız bu cihazdaki kopyadan).
   Yeni belge türü: TURLER + KURALLAR. Açılış biçimi (ac) kabuk/kabuk.js > belgeAc'ta uygulanır:
     arama: uygulama adresine eklenen sorgu (?…) · hash: eklenen adres parçası (#…)
     dx: DocumentX kılavuzu (son açılan kılavuz olarak yazılır) · pdf: dosya yeni sekmede açılır */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.DocxMakineCekirdek = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ─── Belge türleri: makine sayfasında bu gruplarla, bu sırayla ── */

  const GRUPLAR = ['Mühendislik', 'Doküman', 'Belge'];
  const TURLER = [
    { id: 'layout', ad: 'Layout paftası', kisa: 'Layout', uygulama: 'layoutx', grup: 'Mühendislik' },
    { id: 'pid', ad: 'P&ID diyagramı', kisa: 'P&ID', uygulama: 'ppx', grup: 'Mühendislik' },
    { id: 'pnomatik', ad: 'Pnömatik diyagram', kisa: 'Pnömatik', uygulama: 'ppx', grup: 'Mühendislik' },
    { id: 'kodlar', ad: 'Makine kodları', kisa: 'Kodlar', uygulama: 'ppx', grup: 'Mühendislik' },
    { id: 'bom', ad: 'Malzeme listesi (BOM)', kisa: 'BOM', uygulama: 'bomx', grup: 'Mühendislik' },
    { id: 'pano', ad: 'Pano malzeme listesi', kisa: 'Pano', uygulama: 'electricx', grup: 'Mühendislik' },
    { id: 'etiket', ad: 'Pano etiketi', kisa: 'Etiket', uygulama: 'electricx', grup: 'Mühendislik' },
    { id: 'sema', ad: 'Elektrik şeması', kisa: 'Şema', uygulama: 'electricx', grup: 'Mühendislik' },
    { id: 'risk', ad: 'Risk analizi', kisa: 'Risk', uygulama: 'rax', grup: 'Doküman' },
    { id: 'lvd', ad: 'LVD test raporu', kisa: 'LVD', uygulama: 'rax', grup: 'Doküman' },
    { id: 'kilavuz', ad: 'Kullanım kılavuzu', kisa: 'Kılavuz', uygulama: 'documentx', grup: 'Doküman' },
    { id: 'garanti', ad: 'Garanti belgesi', kisa: 'Garanti', uygulama: 'warrantyx', grup: 'Belge' },
    { id: 'ce', ad: 'CE uygunluk beyanı', kisa: 'CE', uygulama: 'warrantyx', grup: 'Belge' }
  ];
  const TUR = new Map(TURLER.map((t, i) => [t.id, Object.assign({ sira: i }, t)]));

  /* ─── Yol kuralları: uygulamanın veri deposundaki yol → belge ──
     desen: ilk grup belgenin adı (klasör ya da dosya adı). coz: farklı biçim (anahtar ≠ ad).
     adYok: adda yalnız seri var, makinenin adı (model, firma) bu belgeden okunmaz.
     icerik: dosyanın içinde model ve firma yazar (bu cihazdaki kopyadan okunur).
     sonEk: klasör adının sonundaki sıra eki (-01) model değildir. */

  const enc = encodeURIComponent;
  const KURALLAR = [
    { uygulama: 'bomx', tur: 'bom', desen: /^BOM\/projeler\/([^/]+)\/proje\.json$/,
      ac: (ad) => ({ arama: `?proje=${enc(ad)}` }) },
    // P&PX giriş ekranı adres parçasındaki #ac=… ile programa geçer (apps/ppx/ortak/ppx-boot.js; web sürümünde de)
    { uygulama: 'ppx', tur: 'pid', desen: /^P&ID\/projects\/([^/]+)\/pid\/cizim\.json$/,
      ac: (ad) => ({ hash: `#ac=pid&proje=${enc(ad)}` }) },
    { uygulama: 'ppx', tur: 'pnomatik', desen: /^PNOMATIK\/projects\/([^/]+)\/pnomatik\/cizim\.json$/,
      ac: (ad) => ({ hash: `#ac=pnomatik&proje=${enc(ad)}` }) },
    { uygulama: 'ppx', tur: 'kodlar', desen: /^ML\/kayitlar\/([^/]+)\.json$/, adYok: true, icerik: true,
      ac: () => ({ hash: '#ac=pid' }) },
    { uygulama: 'rax', tur: 'risk', desen: /^projects\/([^/_.][^/]*)\/[^/]+\.md$/i,
      ac: (ad) => ({ arama: `?ac=${enc(`projects/${ad}`)}` }) },
    // Model şablonundan üretilen rapor: models/<aile>/<model>/raporlar/<rapor>/ (aile alt modelsizse models/<aile>/raporlar/)
    { uygulama: 'rax', tur: 'risk', desen: /^(models\/(?:[^/]+\/){1,2}raporlar\/([^/_.][^/]*))\/[^/]+\.md$/i,
      coz: (m) => ({ ad: m[2], anahtar: m[1] }), ac: (ad, anahtar) => ({ arama: `?ac=${enc(anahtar)}` }) },
    { uygulama: 'rax', tur: 'lvd', desen: /^lvd\/([^/_.][^/]*)\/lvd\.md$/, sonEk: true,
      ac: (ad) => ({ arama: `?lvd=${enc(`lvd/${ad}`)}` }) },
    { uygulama: 'warrantyx', tur: 'garanti', desen: /^belgeler\/([^/]+)\.json$/, adYok: true, icerik: true,
      ac: (ad) => ({ hash: `#/belge/${enc(ad)}` }) },
    { uygulama: 'warrantyx', tur: 'ce', desen: /^ce\/([^/]+)\.json$/, adYok: true, icerik: true,
      ac: (ad) => ({ hash: `#/ce/${enc(ad)}` }) },
    // Pano: proje klasöründeki herhangi bir dosya (proje.json olmayabilir)
    { uygulama: 'electricx', tur: 'pano', desen: /^KUTU\/projeler\/([^/]+)\/.+$/,
      ac: (ad) => ({ hash: `#kutu/p/${enc(ad)}` }) },
    { uygulama: 'electricx', tur: 'etiket', desen: /^ETIKET\/projeler\/([^/]+)\.json$/,
      ac: () => ({ hash: '#etiket' }) },
    // Geçmiş elektrik şemaları: dosya adı serbest, seri adın herhangi bir yerinde
    { uygulama: 'electricx', tur: 'sema', desen: /^ES\/([^/]+\.pdf)$/i, adYok: true,
      ac: () => ({ pdf: true }) },
    { uygulama: 'layoutx', tur: 'layout', desen: /^projects\/([^/]+)\/[^/]*-layout-veri\.json$/,
      ac: (ad) => ({ arama: `?p=${enc(ad)}` }) },
    // DocumentX: bilgisayardaki klasörün projects/ altındaki proje klasörleri (makine sayfası "projects/<ad>/" yazar)
    { uygulama: 'documentx', tur: 'kilavuz', desen: /^projects\/([^/_.][^/]*)\/$/,
      ac: (ad) => ({ dx: `proje:${ad}` }) }
  ];
  const UYGULAMA_KURALLARI = new Map();
  for (const k of KURALLAR) {
    if (!UYGULAMA_KURALLARI.has(k.uygulama)) UYGULAMA_KURALLARI.set(k.uygulama, []);
    UYGULAMA_KURALLARI.get(k.uygulama).push(k);
  }

  /* ─── Ad çözme ─────────────────────────────────────────── */

  /** Addaki 7 haneli seri numarası (başka rakama bitişik olmayan); yoksa null */
  function seriBul(ad) {
    const m = String(ad || '').match(/(?:^|[^0-9])([0-9]{7})(?![0-9])/);
    return m ? m[1] : null;
  }

  const bosluk = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  /** "<seri>-<FİRMA>-<MODEL>" → { firma, model }; biçim farklıysa boş */
  function adCoz(ad, sonEk) {
    const m = String(ad || '').match(/^\s*[0-9]{7}\s*-\s*([^-]+?)\s*-\s*(.+?)\s*$/);
    if (!m) return { firma: '', model: '' };
    let model = m[2];
    if (sonEk) model = model.replace(/\s*-\s*[0-9]{1,2}$/, '');
    return { firma: bosluk(m[1]), model: bosluk(model) };
  }

  /** Belge dosyasının içi (garanti, CE, makine kodları) → { firma, model } */
  function icerikCoz(veri) {
    if (!veri || typeof veri !== 'object') return null;
    const metin = (v) => (typeof v === 'string' ? bosluk(v) : '');
    const model = metin(veri.model);
    const firma = metin(veri.musteri) || metin(veri.firma);
    return model || firma ? { model, firma } : null;
  }

  /** Uygulamanın yolu bir belgeyse { tur, ad, anahtar, seri, firma, model, adYok, icerik, ac }; değilse null */
  function eslestir(uygulama, yol) {
    const kurallar = UYGULAMA_KURALLARI.get(uygulama);
    if (!kurallar || typeof yol !== 'string') return null;
    for (const k of kurallar) {
      const m = yol.match(k.desen);
      if (!m) continue;
      const c = k.coz ? k.coz(m) : { ad: m[1], anahtar: m[1] };
      const seri = seriBul(c.ad);
      if (!seri) return null;
      const isim = k.adYok ? { firma: '', model: '' } : adCoz(c.ad, k.sonEk);
      return {
        uygulama,
        tur: k.tur,
        ad: c.ad,
        anahtar: c.anahtar,
        seri,
        firma: isim.firma,
        model: isim.model,
        adYok: !!k.adYok,
        icerik: !!k.icerik,
        ac: k.ac(c.ad, c.anahtar)
      };
    }
    return null;
  }

  /** Yolun içeriği makine adı için okunmalı mı (yalnız küçük kayıt dosyaları) */
  function icerikOkunur(uygulama, yol) {
    const e = eslestir(uygulama, yol);
    return !!(e && e.icerik);
  }

  /* ─── Yerel + depo birleştirme ──────────────────────────── */

  /**
   * Bir uygulamanın bu cihazdaki (IndexedDB / klasör) ve depodaki (GitHub) dosyalarını birleştirir.
   * yerel: Map yol → { silindi, bekliyor, tabanli, zaman, icerik } | null
   *   silindi: bu cihazda silindi, silme henüz gönderilmedi · bekliyor: bu cihazdaki değişiklik gönderilmedi
   *   tabanli: dosya depoyla en az bir kez eşitlendi
   * uzak: Map yol → { sha, boyut } | null (null: depo okunmadı)
   * Depo okunduysa: eşitlenmiş, değişmemiş ama depoda artık olmayan dosya başka cihazda silinmiştir, gösterilmez.
   */
  function birlestir(uygulama, yerel, uzak) {
    const out = [];
    const yollar = new Set([...(yerel ? yerel.keys() : []), ...(uzak ? uzak.keys() : [])]);
    for (const yol of yollar) {
      const y = yerel ? yerel.get(yol) : null;
      const u = uzak ? uzak.get(yol) : null;
      if (y && y.silindi) continue;
      if (y && uzak && !u && y.tabanli && !y.bekliyor) continue;
      out.push({
        uygulama,
        yol,
        yerel: !!y,
        uzak: !!u,
        bekliyor: !!(y && y.bekliyor),
        zaman: (y && y.zaman) || 0,
        icerik: (y && y.icerik) || null,
        sha: u ? u.sha : null,
        boyut: u ? u.boyut || 0 : 0
      });
    }
    return out;
  }

  /* ─── Makineler ─────────────────────────────────────────── */

  // Makine adı oylamasında eşitlikte öne geçen belgeler (klasör adı en özenli yazılanlar önce)
  const AD_ONCELIGI = ['bom', 'risk', 'pano', 'lvd', 'layout', 'kilavuz', 'pid', 'pnomatik', 'etiket', 'garanti', 'ce', 'kodlar', 'sema'];
  const oncelik = (tur) => {
    const i = AD_ONCELIGI.indexOf(tur);
    return i < 0 ? AD_ONCELIGI.length : i;
  };

  /** En çok yazılan değer; eşitlikte önce gelen. Büyük/küçük harf ve boşluk farkı aynı sayılır. */
  function oyla(degerler) {
    const say = new Map();
    degerler.forEach((d, i) => {
      const v = bosluk(d);
      if (!v) return;
      const k = v.toLocaleUpperCase('tr');
      const o = say.get(k) || { v, n: 0, i };
      o.n += 1;
      say.set(k, o);
    });
    let en = null;
    for (const o of say.values()) if (!en || o.n > en.n || (o.n === en.n && o.i < en.i)) en = o;
    return en ? en.v : '';
  }

  function belgeSirasi(a, b) {
    return TUR.get(a.tur).sira - TUR.get(b.tur).sira || a.ad.localeCompare(b.ad, 'tr', { numeric: true });
  }

  /**
   * kayitlar (birlestir çıktısı, bütün uygulamalar) → makineler
   * @returns [{ seri, model, firma, belgeler: [belge], turler: [tur id], son }]
   *   belge: { id, uygulama, tur, ad, anahtar, seri, ac, yerel, uzak, bekliyor, zaman, dosyalar: [{ yol, sha, boyut }] }
   */
  function topla(kayitlar) {
    const belgeler = new Map();
    for (const k of kayitlar) {
      const e = eslestir(k.uygulama, k.yol);
      if (!e) continue;
      const id = `${k.uygulama}|${e.tur}|${e.anahtar}`;
      let b = belgeler.get(id);
      if (!b) {
        b = Object.assign({}, e, { id, dosyalar: [], yerel: false, uzak: false, bekliyor: false, zaman: 0, icerikAd: null });
        belgeler.set(id, b);
      }
      b.dosyalar.push({ yol: k.yol, sha: k.sha || null, boyut: k.boyut || 0 });
      b.yerel = b.yerel || !!k.yerel;
      b.uzak = b.uzak || !!k.uzak;
      b.bekliyor = b.bekliyor || !!k.bekliyor;
      b.zaman = Math.max(b.zaman, k.zaman || 0);
      if (k.icerik) b.icerikAd = icerikCoz(k.icerik) || b.icerikAd;
    }

    const makineler = new Map();
    for (const b of belgeler.values()) {
      if (!makineler.has(b.seri)) makineler.set(b.seri, { seri: b.seri, belgeler: [] });
      makineler.get(b.seri).belgeler.push(b);
    }

    const out = [];
    for (const m of makineler.values()) {
      m.belgeler.sort(belgeSirasi);
      const adlar = m.belgeler.slice().sort((a, b) => oncelik(a.tur) - oncelik(b.tur));
      const modeller = [];
      const firmalar = [];
      for (const b of adlar) {
        if (b.model) modeller.push(b.model);
        if (b.firma) firmalar.push(b.firma);
      }
      // Dosya içinden okunan ad yalnız klasör adı hiç yoksa kullanılır (biçimi klasör adlarından farklı olabilir)
      for (const b of adlar) {
        if (!b.icerikAd) continue;
        if (!modeller.length && b.icerikAd.model) modeller.push(b.icerikAd.model);
        if (!firmalar.length && b.icerikAd.firma) firmalar.push(b.icerikAd.firma);
      }
      const turler = [...new Set(m.belgeler.map((b) => b.tur))];
      out.push({
        seri: m.seri,
        model: oyla(modeller),
        firma: oyla(firmalar),
        belgeler: m.belgeler,
        turler,
        bekleyen: m.belgeler.filter((b) => b.bekliyor).length,
        son: m.belgeler.reduce((n, b) => Math.max(n, b.zaman || 0), 0)
      });
    }
    return out;
  }

  /** Sıralama: 'son' (son değişen önce; zamanı bilinmeyenler seri numarasıyla sonda) ya da 'seri' */
  function sirala(makineler, bicim) {
    const seri = (a, b) => b.seri.localeCompare(a.seri);
    return makineler.slice().sort(bicim === 'seri' ? seri : (a, b) => (b.son || 0) - (a.son || 0) || seri(a, b));
  }

  /** Arama: seri, model, firma ve belge adlarında; boşlukla ayrılan her parça geçmeli */
  function ara(makineler, metin) {
    const parcalar = bosluk(metin).toLocaleUpperCase('tr').split(' ').filter(Boolean);
    if (!parcalar.length) return makineler;
    return makineler.filter((m) => {
      const yazi = [m.seri, m.model, m.firma, ...m.belgeler.map((b) => `${b.ad} ${TUR.get(b.tur).ad}`)].join(' ').toLocaleUpperCase('tr');
      return parcalar.every((p) => yazi.includes(p));
    });
  }

  return { GRUPLAR, TURLER, TUR, KURALLAR, seriBul, adCoz, icerikCoz, eslestir, icerikOkunur, birlestir, topla, sirala, ara, oyla };
});
