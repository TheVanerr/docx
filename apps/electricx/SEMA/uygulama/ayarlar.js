// Ayarlar: ek diller, ön sayfa metinleri (icerik.js üzerine yazmalar) ve tasarım seçimi.
// ELECTRICX veritabanında (ayarlar koleksiyonu) saklanır, bir kopyası bu tarayıcıda da durur.
// icerik.js varsayılan olarak kalır; üzerine yazılan alanlar window.ICERIK'e yerinde uygulanır.
(function () {
  "use strict";
  const YEREL = "sema:ayarlar";
  const I = window.ICERIK;
  const kopya = (o) => JSON.parse(JSON.stringify(o));
  const VARSAYILAN = kopya(I);
  const TEMEL = ["TR", "EN", "DE"];
  const ORTAK_ALANLAR = ["hazirlayan", "sirket", "web", "kablo_satirlari"];

  /** Eklenebilecek diller: adları ve büyük harfe çevirme yereli. Tümü Latin alfabeli (gömülü fontlar bunları kapsar). */
  const DIL_ADLARI = {
    FR: "Français", ES: "Español", IT: "Italiano", PT: "Português", NL: "Nederlands", PL: "Polski", CS: "Čeština",
    SK: "Slovenčina", HU: "Magyar", RO: "Română", SV: "Svenska", DA: "Dansk", NO: "Norsk", FI: "Suomi", SL: "Slovenščina", HR: "Hrvatski",
  };
  const DIL_TR = {
    TR: "Türkçe", EN: "İngilizce", DE: "Almanca", FR: "Fransızca", ES: "İspanyolca", IT: "İtalyanca", PT: "Portekizce", NL: "Felemenkçe",
    PL: "Lehçe", CS: "Çekçe", SK: "Slovakça", HU: "Macarca", RO: "Rumence", SV: "İsveççe", DA: "Danca", NO: "Norveççe", FI: "Fince",
    SL: "Slovence", HR: "Hırvatça",
  };

  let surum = 1;
  let db = null;
  let genel = { kurallar: "", ekDiller: [] };
  let icerik = { ortak: {}, diller: {} };
  let tasarim = null;
  const dinleyiciler = new Set();
  const yazma = { genel: Promise.resolve(), icerik: Promise.resolve(), tasarim: Promise.resolve() };

  const haberVer = () => { surum++; for (const f of dinleyiciler) { try { f(); } catch (e) { console.error(e); } } };

  // ---------------------------------------------------------------- şekil denetimi
  /** aday, ornek ile aynı şekilde mi: aynı anahtarlar, aynı uzunlukta diziler, boş olmayan metinler. Dönüş: hata listesi. */
  function sekilHatalari(ornek, aday, yol) {
    yol = yol || "";
    const h = [];
    if (typeof ornek === "string") {
      if (typeof aday !== "string" || !aday.trim()) h.push(`${yol || "metin"} boş`);
    } else if (typeof ornek === "number") {
      if (typeof aday !== "number" || !isFinite(aday)) h.push(`${yol} sayı olmalı`);
    } else if (Array.isArray(ornek)) {
      if (!Array.isArray(aday) || aday.length !== ornek.length) h.push(`${yol} ${ornek.length} öğe olmalı`);
      else ornek.forEach((o, i) => h.push(...sekilHatalari(o, aday[i], `${yol}[${i + 1}]`)));
    } else if (ornek && typeof ornek === "object") {
      if (!aday || typeof aday !== "object") h.push(`${yol} eksik`);
      else for (const k of Object.keys(ornek)) h.push(...sekilHatalari(ornek[k], aday[k], yol ? `${yol}.${k}` : k));
    }
    return h;
  }
  const dilSablonu = () => VARSAYILAN.EN;

  // ---------------------------------------------------------------- uygulama
  /** Üzerine yazmaları window.ICERIK'e yerinde uygular (tasarimlar.js aynı nesneyi tutar). */
  function uygula() {
    for (const k of ORTAK_ALANLAR) I[k] = kopya(icerik.ortak[k] != null ? icerik.ortak[k] : VARSAYILAN[k]);
    // Kablo satırlarının sayısı tasarımlarda sabittir (7); farklı uzunluktaki kayıt kullanılmaz
    if (!Array.isArray(I.kablo_satirlari) || I.kablo_satirlari.length !== VARSAYILAN.kablo_satirlari.length) I.kablo_satirlari = kopya(VARSAYILAN.kablo_satirlari);
    // Diller: varsayılan TR/EN/DE, üstüne kayıtlı alanlar; ek diller yalnızca kayıtlı ve tam ise
    for (const d of Object.keys(I)) if (/^[A-Z]{2}$/.test(d) && !TEMEL.includes(d)) delete I[d];
    for (const d of TEMEL) I[d] = birlestir(kopya(VARSAYILAN[d]), icerik.diller[d] || {});
    for (const d of genel.ekDiller || []) {
      const o = icerik.diller[d];
      if (o && !sekilHatalari(dilSablonu(), o).length) I[d] = kopya(o);
    }
    const sonek = new Set(VARSAYILAN.sonek_kaliplari);
    for (const d of Object.keys(I)) if (/^[A-Z]{2}$/.test(d) && I[d].sema) sonek.add(I[d].sema);
    I.sonek_kaliplari = [...sonek];
  }
  function birlestir(hedef, kaynak) {
    for (const [k, v] of Object.entries(kaynak)) {
      if (v && typeof v === "object" && !Array.isArray(v) && hedef[k] && typeof hedef[k] === "object") birlestir(hedef[k], v);
      else if (v != null) hedef[k] = kopya(v);
    }
    return hedef;
  }

  // ---------------------------------------------------------------- depolama
  function yerelOku() {
    try {
      const j = JSON.parse(localStorage.getItem(YEREL)) || {};
      if (j.genel) genel = Object.assign({ kurallar: "", ekDiller: [] }, j.genel);
      if (j.icerik) icerik = Object.assign({ ortak: {}, diller: {} }, j.icerik);
    } catch (e) { /* ilk açılış */ }
  }
  function yerelYaz() {
    try { localStorage.setItem(YEREL, JSON.stringify({ genel, icerik })); } catch (e) { /* depolama kapalı */ }
  }
  function sira(ad, is) {
    yazma[ad] = yazma[ad].then(is).catch((e) => { console.warn("Ayar yazılamadı", e); throw e; });
    return yazma[ad];
  }

  /** Veritabanına bağlanır. Veritabanında kayıt yoksa bu tarayıcıdaki ayarlar oraya taşınır. */
  function baglan(veritabani) {
    db = veritabani;
    return new Promise((tamam) => {
      let kalan = 3;
      const bitti = () => { if (--kalan === 0) tamam(); };
      const izle = (yol, uygulaFn, tasi) => {
        let ilk = true;
        db.doc(yol).onSnapshot((s) => {
          if (s.exists) uygulaFn(s.data());
          else if (ilk && !s.metadata.fromCache && tasi) tasi();
          if (ilk && !s.metadata.fromCache) { ilk = false; bitti(); }
        }, () => { if (ilk) { ilk = false; bitti(); } });
      };
      izle("ayarlar/genel", (v) => { genel = Object.assign({ kurallar: "", ekDiller: [] }, v); uygula(); yerelYaz(); haberVer(); },
        () => { if (genel.kurallar || (genel.ekDiller || []).length) sira("genel", () => db.doc("ayarlar/genel").set(genel)); });
      izle("ayarlar/icerik", (v) => { icerik = { ortak: v.ortak || {}, diller: v.diller || {} }; uygula(); yerelYaz(); haberVer(); },
        () => { if (Object.keys(icerik.ortak).length || Object.keys(icerik.diller).length) sira("icerik", () => db.doc("ayarlar/icerik").set(icerik)); });
      izle("ayarlar/tasarim", (v) => { tasarim = v; if (window.Tasarim) Tasarim.secimYaz(v); haberVer(); }, null);
      setTimeout(() => { while (kalan > 0) bitti(); }, 10000);
    });
  }

  function genelYaz(degisim) {
    genel = Object.assign({}, genel, degisim);
    genel.ekDiller = [...new Set((genel.ekDiller || []).filter((d) => DIL_ADLARI[d]))];
    uygula(); yerelYaz(); haberVer();
    const v = kopya(genel);
    return db ? sira("genel", () => db.doc("ayarlar/genel").set(v)) : Promise.resolve();
  }

  /**
   * Ön sayfa metnini kaydeder. bolum: "ortak" veya dil kodu. deger: o bölümün tam nesnesi; null = varsayılana dön.
   * Dil nesnesi EN ile aynı şekilde olmalıdır (ek diller için zorunlu; temel dillerde eksik alan varsayılandan gelir).
   */
  function icerikYaz(bolum, deger) {
    const y = kopya(icerik);
    if (bolum === "ortak") {
      if (deger == null) y.ortak = {};
      else for (const k of ORTAK_ALANLAR) if (deger[k] != null && JSON.stringify(deger[k]) !== JSON.stringify(VARSAYILAN[k])) y.ortak[k] = kopya(deger[k]); else delete y.ortak[k];
    } else {
      if (deger == null) delete y.diller[bolum];
      else {
        const h = sekilHatalari(dilSablonu(), deger);
        if (h.length) return Promise.reject(new Error("Eksik alanlar: " + h.slice(0, 4).join(", ")));
        if (TEMEL.includes(bolum) && JSON.stringify(deger) === JSON.stringify(VARSAYILAN[bolum])) delete y.diller[bolum];
        else y.diller[bolum] = kopya(deger);
      }
    }
    icerik = y;
    uygula(); yerelYaz(); haberVer();
    const v = kopya(icerik);
    return db ? sira("icerik", () => db.doc("ayarlar/icerik").set(v)) : Promise.resolve();
  }

  function tasarimYaz(secim) {
    tasarim = secim;
    return db ? sira("tasarim", () => db.doc("ayarlar/tasarim").set(kopya(secim))) : Promise.resolve();
  }

  /** Ek dili etkinleştirir. Ön sayfa metinleri hazır değilse önce taslağı kaydedilmelidir. */
  function dilEkle(dil) { return genelYaz({ ekDiller: (genel.ekDiller || []).concat(dil) }); }
  function dilKaldir(dil) { return genelYaz({ ekDiller: (genel.ekDiller || []).filter((d) => d !== dil) }); }

  yerelOku();
  uygula();

  window.Ayarlar = {
    DIL_ADLARI, DIL_TR, TEMEL, VARSAYILAN, ORTAK_ALANLAR,
    baglan, genelYaz, icerikYaz, tasarimYaz, dilEkle, dilKaldir, sekilHatalari,
    genel: () => kopya(genel),
    kurallar: () => genel.kurallar || "",
    ekDiller: () => (genel.ekDiller || []).slice(),
    hazirDiller: () => (genel.ekDiller || []).filter((d) => I[d]),
    icerikKaydi: (bolum) => kopya(bolum === "ortak" ? icerik.ortak : icerik.diller[bolum] || null),
    degistirildiMi: (bolum) => bolum === "ortak" ? Object.keys(icerik.ortak).length > 0 : !!icerik.diller[bolum],
    dilSablonu: () => kopya(dilSablonu()),
    surum: () => surum,
    dinle: (f) => { dinleyiciler.add(f); return () => dinleyiciler.delete(f); },
  };
})();
