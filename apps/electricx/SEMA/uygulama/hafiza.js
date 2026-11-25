// Çeviri kütüphanesi. Üç katman birleşir: programla gelen kütüphane (sozluk.js), kullanıcının eklediği kalıcı kayıtlar
// ve henüz kalıcı depoya yazılamamış bekleyenler. Kalıcı depo ELECTRICX veritabanıdır (her cihazdan aynı kütüphane);
// veritabanına bağlanılamazsa bu tarayıcının deposudur. Eklenen kayıt programla gelenin yerine geçer.
//
// Kayıt: { sablon, tur: "cevir"|"sabit", EN, DE, FR, ... (dil kodları), kaynak, tarih, kim,
//          onaysiz: ["EN", ...] (onay bekleyen diller; "tur" = sabit kararı onay bekliyor),
//          gecmis: [önceki sürümler, en yenisi başta, en çok 5] }
// Silinen terim iz bırakır: { sablon, silindi: true, tarih, onceki? } (Silinenler listesinden geri getirilir).
// { sablon, kaldir: true } yazılmayı bekleyen "kaydı tümden kaldır" işaretidir; programla gelen karşılık geri döner.
// Her değişiklik geri alınabilir (Ctrl+Z): değişen kayıtların önceki hâli oturum boyunca saklanır.
(function () {
  "use strict";
  const YEREL = "sema:hafiza";
  const BEKLEYEN = "sema:hafiza-bekleyen";
  const KOLEKSIYON = "hafiza";
  const PARCA = 64;          // kayıtlar 64 belgeye dağıtılır (belge başına 256 KiB sınırı)
  const GECMIS = 5;
  const DIL = /^[A-Z]{2}$/;

  let surum = 1;
  let kayitlar = {};   // kimlik → kayıt (kalıcı depodan)
  let bekleyen = {};   // kimlik → kayıt (yazılmayı bekleyen)
  let tablo = new Map(), duz = new Map();
  let db = null, kim = null;
  let parcalar = {};   // parça adı → {terimler}
  let durum = { depo: "yerel", hazir: true, hata: null };
  const dinleyiciler = new Set();

  // İ, I, ı ve i ayrı sayılmaz; büyük-küçük harf fark etmez
  const anahtar = (s) => String(s).normalize("NFC").toUpperCase().replace(/İ/g, "I").replace(/\s+/g, " ").trim();
  const DUZ = { "Ç": "C", "Ş": "S", "Ğ": "G", "Ö": "O", "Ü": "U" };
  const duzAnahtar = (a) => a.replace(/[ÇŞĞÖÜ]/g, (c) => DUZ[c]);
  const harfSayisi = (a) => a.replace(/[^\p{L}]/gu, "").length;
  const bugun = () => new Date().toISOString().slice(0, 10);
  const dilleri = (k) => Object.keys(k || {}).filter((a) => DIL.test(a));

  /** Anahtardan veritabanında geçerli kısa kimlik (FNV-1a, iki tur). */
  function kimlik(sablon) {
    const a = anahtar(sablon);
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ a.length;
    for (const c of a) {
      const k = c.codePointAt(0);
      h1 = Math.imul(h1 ^ k, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (k * 31 + 7), 0x01000193) >>> 0;
    }
    return "t" + h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
  }
  const parcaAdi = (id) => "q" + (parseInt(id.slice(1, 3), 16) % PARCA).toString(16).padStart(2, "0");

  function haberVer() {
    for (const f of dinleyiciler) { try { f(); } catch (e) { console.error(e); } }
  }

  function sozlukKayitlari() {
    const S = window.SOZLUK || { cevir: {}, sabit: [] };
    const o = [];
    for (const [tr, c] of Object.entries(S.cevir)) {
      const k = { sablon: tr, tur: "cevir", kaynak: "sozluk" };
      if (Array.isArray(c)) { k.EN = c[0]; k.DE = c[1]; } else Object.assign(k, c);
      o.push(k);
    }
    for (const tr of S.sabit) o.push({ sablon: tr, tur: "sabit", kaynak: "sozluk" });
    return o;
  }

  function kur() {
    const yeni = new Map();
    const koy = (k) => yeni.set(anahtar(k.sablon), k);
    for (const k of sozlukKayitlari()) koy(k);
    // Bekleyen kayıt kalıcı olanın yerine geçer; silinen kayıt sözlükteki karşılığı da kaldırır
    for (const k of Object.values(Object.assign({}, kayitlar, bekleyen))) {
      if (!k || !k.sablon || k.kaldir) continue;
      if (k.silindi) yeni.delete(anahtar(k.sablon));
      // Eski Claude önerisi onaylanmadıysa kütüphanedeki karşılığın yerine geçmez
      else if (k.kaynak === "claude" && k.onaysiz && k.onaysiz.length && yeni.has(anahtar(k.sablon)) && yeni.get(anahtar(k.sablon)).kaynak === "sozluk") continue;
      else koy(k);
    }
    tablo = yeni;
    duz = new Map();
    for (const [a, k] of yeni) if (harfSayisi(a) >= 6) duz.set(duzAnahtar(a), k);
    surum++;
    haberVer();
  }

  /** Şablona karşılık gelen kayıt. Uzun ifadelerde Türkçe harf eksikleri (KAPAK AC, REDUKTOR) de eşleşir. */
  function bul(sablon) {
    const a = anahtar(sablon);
    const k = tablo.get(a);
    if (k) return k;
    return harfSayisi(a) >= 6 ? duz.get(duzAnahtar(a)) || null : null;
  }

  /** Kaydın o dildeki karşılığı onaylı mı. Sözlük, elle ve içe aktarılan kayıtlar onaylıdır. */
  function onayli(k, dil) {
    if (!k) return false;
    const o = k.onaysiz || [];
    if (o.includes("tur")) return false;
    return dil ? !o.includes(dil) : !o.length;
  }

  // ---------------------------------------------------------------- yerel depo
  const oku = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
  const yaz = (k, v) => {
    try {
      if (Object.keys(v).length) localStorage.setItem(k, JSON.stringify(v));
      else localStorage.removeItem(k);
    } catch (e) { /* depolama kapalı olabilir */ }
  };

  let sozlukHarita = null;
  /** Programla gelen kütüphanedeki kayıt (kullanıcı değişikliği olmadan) ya da null. */
  function sozlukKaydi(sablon) {
    if (!sozlukHarita) sozlukHarita = new Map(sozlukKayitlari().map((k) => [anahtar(k.sablon), k]));
    return sozlukHarita.get(anahtar(sablon)) || null;
  }
  const sozlukteMi = (sablon) => !!sozlukKaydi(sablon);

  // ---------------------------------------------------------------- veritabanı
  /** Bekleyenleri parça parça veritabanına yazar. Aynı belgeye aynı anda tek yazma yapılır. */
  let yaziyor = null;
  function bosalt() {
    if (!db || yaziyor) return yaziyor;
    yaziyor = (async () => {
      try {
        while (Object.keys(bekleyen).length) {
          const grup = {};
          for (const [id, k] of Object.entries(bekleyen)) (grup[parcaAdi(id)] = grup[parcaAdi(id)] || {})[id] = k;
          for (const [p, ekler] of Object.entries(grup)) {
            const terimler = Object.assign({}, (parcalar[p] && parcalar[p].terimler) || {}, ekler);
            // "kaldır" işareti kaydı tümden siler; silinen terimin izi kalır (geri getirilebilsin)
            for (const [id, k] of Object.entries(terimler)) if (k && k.kaldir) delete terimler[id];
            await db.doc(`${KOLEKSIYON}/${p}`).set({ terimler });
            parcalar[p] = { terimler };
            for (const [id, k] of Object.entries(ekler)) {
              if (k.kaldir) delete kayitlar[id]; else kayitlar[id] = k;
              if (bekleyen[id] === k) delete bekleyen[id];
            }
          }
          yaz(BEKLEYEN, bekleyen);
        }
        durum.hata = null;
      } catch (e) {
        durum.hata = e && e.code === "quota_exceeded" ? "Veritabanı dolu: kullanılmayan terimleri silin." : "Hafıza veritabanına yazılamadı. Değişiklikler bu tarayıcıda bekliyor ve bir sonraki değişiklikte yeniden denenecek.";
      } finally {
        yaziyor = null;
        kur();
      }
    })();
    return yaziyor;
  }

  /** Eski düzen (p0..pf, 16 parça) kayıtlarını yeni düzene taşır. Claude kayıtları onay bekler hâle gelir. */
  async function eskiyiTasi(eskiler) {
    for (const g of eskiler) {
      for (const [id, k] of Object.entries(g.terimler || {})) {
        if (!k || !k.sablon || kayitlar[id] || bekleyen[id]) continue;
        const y = Object.assign({}, k);
        if (y.kaynak === "claude" && !y.onaysiz) y.onaysiz = y.tur === "sabit" ? ["tur"] : dilleri(y);
        bekleyen[id] = y;
      }
    }
    yaz(BEKLEYEN, bekleyen);
    kur();
    await bosalt();
    if (Object.keys(bekleyen).length) return; // yazılamadıysa eski belgeler silinmez
    for (const g of eskiler) { try { await db.doc(`${KOLEKSIYON}/${g.id}`).delete(); } catch (e) { /* bir sonraki açılışta yeniden denenir */ } }
  }

  /**
   * Veritabanına bağlanır. Bağlanınca bu tarayıcıda kalmış yerel kayıtlar da veritabanına
   * taşınır. kullanici: değişikliklerde kimin yaptığını kaydetmek için kullanıcı kimliği (null olabilir).
   */
  function baglan(veritabani, kullanici) {
    db = veritabani;
    kim = kullanici || null;
    durum = { depo: "bulut", hazir: false, hata: null };
    kur();
    return new Promise((tamam) => {
      let ilk = true;
      const sure = setTimeout(() => {
        if (ilk) { durum.hata = "Hafıza veritabanına henüz ulaşılamadı; bağlantı gelince kendiliğinden yüklenecek."; kur(); }
      }, 10000);
      db.collection(KOLEKSIYON).onSnapshot((snap) => {
        parcalar = {};
        const yeni = {}, eskiler = [];
        for (const d of snap.docs) {
          const g = d.data() || {};
          if (/^p[0-9a-f]$/.test(d.id)) { eskiler.push({ id: d.id, terimler: g.terimler || {} }); continue; }
          parcalar[d.id] = { terimler: g.terimler || {} };
          Object.assign(yeni, g.terimler || {});
        }
        kayitlar = yeni;
        if (!snap.metadata.fromCache) {
          clearTimeout(sure);
          durum.hazir = true;
          durum.hata = null;
          if (ilk) {
            ilk = false;
            const yerel = oku(YEREL);
            for (const [id, k] of Object.entries(yerel)) if (!kayitlar[id] && !bekleyen[id]) bekleyen[id] = k;
            yaz(YEREL, {});
            tamam();
            if (eskiler.length) eskiyiTasi(eskiler);
            else if (Object.keys(bekleyen).length) bosalt();
          }
        }
        kur();
      }, () => {
        clearTimeout(sure);
        durum.hata = "Hafıza veritabanı bağlantısı kesildi; değişiklikler bu tarayıcıda saklanıyor. Sayfayı yenileyin.";
        db = null;
        durum.depo = "yerel";
        durum.hazir = true;
        kur();
        if (ilk) { ilk = false; tamam(); }
      });
    });
  }

  // ---------------------------------------------------------------- değişiklik
  const ozu = (k) => {
    const o = { tur: k.tur, kaynak: k.kaynak, tarih: k.tarih };
    if (k.kim) o.kim = k.kim;
    for (const d of dilleri(k)) o[d] = k[d];
    if (k.onaysiz && k.onaysiz.length) o.onaysiz = k.onaysiz.slice();
    return o;
  };
  const ayni = (a, b) => JSON.stringify(Object.assign(ozu(a), { tarih: 0, kim: 0, kaynak: 0, onaysiz: 0 })) === JSON.stringify(Object.assign(ozu(b), { tarih: 0, kim: 0, kaynak: 0, onaysiz: 0 }));

  function yerlestir(id, k) {
    if (db) bekleyen[id] = k;
    else if (k.kaldir) delete kayitlar[id];
    else kayitlar[id] = k;
  }

  // ---------------------------------------------------------------- geri alma
  const GERI_SINIR = 100;
  const geriYigin = [];   // [{ad, izler: [[kimlik, sablon, önceki ham kayıt | null]]}]
  /** Kullanıcı katmanındaki ham kayıt (programla gelen değil); yoksa null. */
  const ham = (id) => {
    const k = bekleyen[id] || kayitlar[id];
    return k && !k.kaldir ? JSON.parse(JSON.stringify(k)) : null;
  };
  /** Değişmek üzere olan kayıtların şimdiki hâlini saklar. */
  function izle(ad, sablonlar) {
    const goruldu = new Set();
    const izler = [];
    for (const sb of sablonlar) {
      const id = kimlik(sb);
      if (goruldu.has(id)) continue;
      goruldu.add(id);
      izler.push([id, sb, ham(id)]);
    }
    if (!izler.length) return;
    geriYigin.push({ ad, izler });
    if (geriYigin.length > GERI_SINIR) geriYigin.shift();
  }
  /** Son kütüphane değişikliğini geri alır. Dönüş: geri alınan işlemin adı ya da null. */
  function islemGeriAl() {
    const g = geriYigin.pop();
    if (!g) return Promise.resolve(null);
    for (const [id, sablon, onceki] of g.izler) yerlestir(id, onceki || { sablon, kaldir: true });
    return kaydetBitir().then(() => g.ad);
  }
  function kaydetBitir() {
    if (db) { yaz(BEKLEYEN, bekleyen); kur(); return bosalt() || Promise.resolve(); }
    yaz(YEREL, kayitlar);
    kur();
    return Promise.resolve();
  }

  /**
   * Terimleri hafızaya ekler veya değiştirir; önceki sürüm geçmişe yazılır.
   * liste: [{sablon, tur, EN?, DE?, ...}]  kaynak: "claude" | "elle" | "ice-aktarma"
   * sec.birlestir: true ise yalnızca verilen diller eklenir/değişir, diğer diller korunur (eksik dil doldururken).
   * Eski Claude kayıtları onay bekler; elle yazılan ve içe aktarılanlar onaylıdır.
   */
  function ekle(liste, kaynak, sec) {
    sec = sec || {};
    if (!sec.izsiz) izle(liste.length === 1 ? `${liste[0].sablon} kaydedildi` : `${liste.length} terim kaydedildi`, liste.map((t) => t.sablon));
    const tarih = bugun();
    for (const t of liste) {
      const id = kimlik(t.sablon);
      const eski = bul(t.sablon);
      const k = { sablon: eski && anahtar(eski.sablon) === anahtar(t.sablon) ? eski.sablon : t.sablon, tur: t.tur, kaynak: kaynak || t.kaynak || "elle", tarih: t.tarih || tarih };
      if (kim) k.kim = kim;
      const verilen = dilleri(t);
      if (t.tur === "cevir") {
        if (sec.birlestir && eski && eski.tur === "cevir") for (const d of dilleri(eski)) k[d] = eski[d];
        for (const d of verilen) k[d] = String(t[d] || "").trim();
      }
      // Onay: Claude yazdıysa yazdığı diller onay bekler; elle yazılan diller onaylanmış sayılır
      // Birleştirmede eski kaydın onay bekleyen dilleri (verilmeyenler) korunur
      let onaysiz = sec.birlestir && eski && eski.tur === k.tur ? (eski.onaysiz || []).filter((d) => d !== "tur" && !verilen.includes(d) && k[d]) : [];
      if (sec.onaysiz) onaysiz = sec.onaysiz.filter((d) => d === "tur" ? k.tur === "sabit" : !!k[d]);
      else if (k.kaynak === "claude") onaysiz = k.tur === "sabit" ? ["tur"] : [...new Set(onaysiz.concat(verilen))];
      if (onaysiz.length) k.onaysiz = onaysiz;
      // Geçmiş: değişmişse eski sürüm başa eklenir
      const gecmis = (eski && eski.gecmis) || [];
      if (eski && eski.kaynak !== "sozluk" && !ayni(eski, k)) k.gecmis = [ozu(eski)].concat(gecmis).slice(0, GECMIS);
      else if (eski && eski.kaynak === "sozluk" && !ayni(eski, k)) k.gecmis = [ozu(eski)];
      else if (gecmis.length) k.gecmis = gecmis;
      yerlestir(id, k);
    }
    return kaydetBitir();
  }

  /** Terimlerin verilen dillerdeki (verilmezse tümü) karşılıklarını onaylar. */
  function onayla(sablonlar, diller) {
    const bekleyenler = sablonlar.filter((x) => { const k = bul(x); return k && k.onaysiz && k.onaysiz.length; });
    izle(bekleyenler.length === 1 ? `${bekleyenler[0]} onaylandı` : `${bekleyenler.length} terim onaylandı`, bekleyenler.map((x) => bul(x).sablon));
    let degisti = false;
    for (const s of sablonlar) {
      const k = bul(s);
      if (!k || !k.onaysiz || !k.onaysiz.length) continue;
      const kalan = diller ? k.onaysiz.filter((d) => d !== "tur" && !diller.includes(d)) : [];
      const y = Object.assign({}, k, { tarih: bugun() });
      if (kim) y.kim = kim;
      if (kalan.length) y.onaysiz = kalan; else delete y.onaysiz;
      yerlestir(kimlik(k.sablon), y);
      degisti = true;
    }
    return degisti ? kaydetBitir() : Promise.resolve();
  }

  /** Bir önceki sürüme döner; o sürüm geçmişten çıkar. */
  function geriAl(sablon) {
    const k = bul(sablon);
    if (!k || !k.gecmis || !k.gecmis.length) return Promise.resolve(false);
    izle(`${k.sablon} önceki sürüme döndü`, [k.sablon]);
    const [onceki, ...kalan] = k.gecmis;
    const y = Object.assign({ sablon: k.sablon }, onceki, { tarih: bugun() });
    if (kim) y.kim = kim;
    if (kalan.length) y.gecmis = kalan;
    yerlestir(kimlik(k.sablon), y);
    return kaydetBitir().then(() => true);
  }

  /**
   * Terimi kaldırır; sözlükteki bir terimse onun karşılığı da devre dışı kalır. İz kalır: Silinenler listesinden
   * ya da Ctrl+Z ile geri getirilir. Kullanıcının yazdığı karşılık izde saklanır.
   */
  function sil(sablon) {
    const eski = bul(sablon);
    const ad = eski && anahtar(eski.sablon) === anahtar(sablon) ? eski.sablon : sablon;
    izle(`${ad} silindi`, [ad]);
    const k = { sablon: ad, silindi: true, tarih: bugun() };
    if (kim) k.kim = kim;
    if (eski && eski.kaynak !== "sozluk" && anahtar(eski.sablon) === anahtar(sablon)) {
      k.onceki = ozu(eski);
      if (eski.gecmis) k.onceki.gecmis = eski.gecmis;
    }
    yerlestir(kimlik(ad), k);
    return kaydetBitir();
  }

  /** Silinen terimler: [{sablon, tarih, kim, onceki (kullanıcının karşılığı), sozluk (programla gelen kayıt)}] */
  function silinenler() {
    const o = [];
    for (const k of Object.values(Object.assign({}, kayitlar, bekleyen))) {
      if (!k || !k.silindi || !k.sablon || tablo.has(anahtar(k.sablon))) continue;
      o.push({ sablon: k.sablon, tarih: k.tarih, kim: k.kim || null, onceki: k.onceki || null, sozluk: sozlukKaydi(k.sablon) });
    }
    return o.sort((a, b) => (b.tarih || "").localeCompare(a.tarih || "") || a.sablon.localeCompare(b.sablon, "tr"));
  }

  /** Silinen terimi geri getirir: kullanıcının karşılığı varsa o, yoksa programla gelen karşılık döner. */
  function geriGetir(sablon) {
    const id = kimlik(sablon);
    const t = ham(id);
    if (!t || !t.silindi) return Promise.resolve(false);
    izle(`${t.sablon} geri getirildi`, [t.sablon]);
    if (t.onceki) {
      const y = Object.assign({ sablon: t.sablon }, t.onceki, { tarih: bugun() });
      if (kim) y.kim = kim;
      yerlestir(id, y);
    } else yerlestir(id, { sablon: t.sablon, kaldir: true });
    return kaydetBitir().then(() => true);
  }

  /** Kullanıcının değişikliğini kaldırır; programla gelen kütüphane karşılığı geri döner. */
  function sozlugeDon(sablon) {
    const k = bul(sablon);
    const ad = k ? k.sablon : sablon;
    const id = kimlik(ad);
    if (!ham(id) || !sozlukteMi(ad)) return Promise.resolve(false);
    izle(`${ad} kütüphanedeki karşılığına döndü`, [ad]);
    yerlestir(id, { sablon: ad, kaldir: true });
    return kaydetBitir().then(() => true);
  }

  function hepsi() {
    return [...tablo.values()].sort((a, b) => a.sablon.localeCompare(b.sablon, "tr"));
  }

  /** ceviri-hafizasi.json biçiminde dışa aktarım (yedek veya başka hesaba taşıma için). Geçmiş dahil edilmez. */
  function disaAktar() {
    const terimler = {};
    for (const k of hepsi()) {
      if (k.kaynak === "sozluk") continue;
      terimler[k.sablon] = ozu(k);
    }
    const satir = Object.keys(terimler).map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(terimler[k])}`);
    return `{\n  "aciklama": "Şema Motoru çeviri hafızası. tur: cevir veya sabit. {0} gibi yer tutucular kod ve numaraların yeridir. onaysiz: onay bekleyen diller.",\n  "terimler": {\n${satir.join(",\n")}\n  }\n}\n`;
  }

  /** Dışa aktarılmış dosyayı (veya eski ceviri-hafizasi.json'u) okur: [{sablon, tur, EN, ...}] */
  function dosyaOku(metin) {
    const j = JSON.parse(metin);
    const t = j.terimler || j;
    const liste = [];
    for (const [sablon, k] of Object.entries(t)) {
      if (!k || (k.tur !== "cevir" && k.tur !== "sabit")) continue;
      if (k.tur === "cevir" && !dilleri(k).some((d) => k[d])) continue;
      liste.push(Object.assign({ sablon }, k));
    }
    return liste;
  }

  /**
   * Terim listesini içe alır. sec.uzerineYaz false ise hafızada olan terimlere dokunulmaz (yalnızca eksik diller eklenir).
   * Dönüş: {eklenen, guncellenen, atlanan}
   */
  async function iceAktar(liste, sec) {
    sec = sec || {};
    izle(`İçe aktarma (${liste.length} terim)`, liste.map((t) => (bul(t.sablon) || t).sablon));
    const say = { eklenen: 0, guncellenen: 0, atlanan: 0 };
    const yeni = [], birlesen = [];
    for (const t of liste) {
      const eski = bul(t.sablon);
      if (!eski) { yeni.push(t); say.eklenen++; continue; }
      if (sec.uzerineYaz) { yeni.push(t); say.guncellenen++; continue; }
      // Yalnızca hafızada olmayan dilleri ekle
      if (t.tur !== "cevir" || eski.tur !== "cevir") { say.atlanan++; continue; }
      const ek = { sablon: t.sablon, tur: "cevir" };
      for (const d of dilleri(t)) if (t[d] && !eski[d]) ek[d] = t[d];
      if (dilleri(ek).length) { birlesen.push(ek); say.guncellenen++; } else say.atlanan++;
    }
    // Dosyada onay bekleyen olarak işaretli olanlar öyle kalır, diğerleri onaylı gelir
    const gruplar = new Map();
    for (const t of yeni) {
      const anah = (t.onaysiz || []).join(",");
      if (!gruplar.has(anah)) gruplar.set(anah, []);
      gruplar.get(anah).push(t);
    }
    for (const [anah, g] of gruplar) await ekle(g, "ice-aktarma", { onaysiz: anah ? anah.split(",") : [], izsiz: true });
    if (birlesen.length) await ekle(birlesen, "ice-aktarma", { birlestir: true, izsiz: true });
    return say;
  }

  bekleyen = oku(BEKLEYEN);
  kayitlar = oku(YEREL);
  kur();

  window.Hafiza = {
    anahtar, kimlik, bul, onayli, ekle, onayla, geriAl, sil, hepsi, baglan, disaAktar, dosyaOku, iceAktar, dilleri,
    silinenler, geriGetir, sozlugeDon, sozlukKaydi, islemGeriAl,
    /** Geri alınabilecek son işlemin adı ya da null. */
    sonIslem: () => (geriYigin.length ? geriYigin[geriYigin.length - 1].ad : null),
    surum: () => surum,
    durum: () => Object.assign({ bekleyen: Object.keys(bekleyen).length, sayi: tablo.size, onaysiz: [...tablo.values()].filter((k) => k.onaysiz && k.onaysiz.length).length }, durum),
    dinle: (f) => { dinleyiciler.add(f); return () => dinleyiciler.delete(f); },
  };
})();
