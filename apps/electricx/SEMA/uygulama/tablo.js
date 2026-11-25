// Terim tablosu içe/dışa aktarma: CSV (virgül, noktalı virgül veya sekme; Excel'in Türkçe ayarı noktalı virgül
// kullanır) ve Excel (.xlsx, .xls). Excel dosyası SheetJS ile okunur; kütüphane yalnızca ilk Excel dosyasında yüklenir.
(function () {
  "use strict";
  const SHEETJS = "uygulama/xlsx.core.min.js"; // SheetJS 0.18.5 (Apache 2.0), uygulamayla birlikte gelir

  /** RFC 4180 CSV. Ayırıcı ilk satırdan seçilir. */
  function csvOku(metin) {
    metin = metin.replace(/^﻿/, "");
    const ilk = metin.split(/\r?\n/, 1)[0] || "";
    const say = (c) => ilk.split(c).length - 1;
    const ayirici = [";", "\t", ","].sort((a, b) => say(b) - say(a))[0];
    const satirlar = [];
    let satir = [], alan = "", tirnak = false;
    for (let i = 0; i < metin.length; i++) {
      const c = metin[i];
      if (tirnak) {
        if (c === '"') { if (metin[i + 1] === '"') { alan += '"'; i++; } else tirnak = false; }
        else alan += c;
      } else if (c === '"' && alan === "") tirnak = true;
      else if (c === ayirici) { satir.push(alan); alan = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && metin[i + 1] === "\n") i++;
        satir.push(alan); alan = "";
        satirlar.push(satir); satir = [];
      } else alan += c;
    }
    if (alan !== "" || satir.length) { satir.push(alan); satirlar.push(satir); }
    return satirlar.filter((s) => s.some((x) => x.trim() !== ""));
  }

  let sheetSozu = null;
  function sheetYukle() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!sheetSozu) {
      sheetSozu = new Promise((tamam, red) => {
        const s = document.createElement("script");
        s.src = SHEETJS;
        s.onload = () => (window.XLSX ? tamam(window.XLSX) : red(new Error("Excel okuyucu yüklenemedi.")));
        s.onerror = () => { sheetSozu = null; red(new Error("Excel okuyucu yüklenemedi. Dosyayı CSV olarak kaydedip onu seçin.")); };
        document.head.appendChild(s);
      });
    }
    return sheetSozu;
  }

  /** Dosyayı satır dizisine çevirir. Excel'de ilk dolu sayfa kullanılır. */
  async function dosyaOku(f) {
    if (/\.(xlsx|xlsm|xls|ods)$/i.test(f.name)) {
      const X = await sheetYukle();
      const wb = X.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
      for (const ad of wb.SheetNames) {
        const s = X.utils.sheet_to_json(wb.Sheets[ad], { header: 1, raw: false, defval: "" });
        const dolu = s.filter((r) => r.some((x) => String(x).trim() !== ""));
        if (dolu.length) return dolu.map((r) => r.map((x) => String(x)));
      }
      return [];
    }
    return csvOku(await f.text());
  }

  // Sütun başlıklarından dil tahmini
  const BASLIK = {
    TR: ["tr", "türkçe", "turkce", "turkish", "türkisch", "kaynak", "source", "orijinal"],
    EN: ["en", "english", "ingilizce", "englisch", "eng"],
    DE: ["de", "deutsch", "almanca", "german", "ger"],
    FR: ["fr", "français", "francais", "fransızca", "french"], ES: ["es", "español", "espanol", "ispanyolca", "spanish"],
    IT: ["it", "italiano", "italyanca", "italian"], PT: ["pt", "português", "portugues", "portekizce", "portuguese"],
    NL: ["nl", "nederlands", "felemenkçe", "hollandaca", "dutch"], PL: ["pl", "polski", "lehçe", "polish"],
    CS: ["cs", "čeština", "çekçe", "czech"], SK: ["sk", "slovenčina", "slovakça", "slovak"], HU: ["hu", "magyar", "macarca", "hungarian"],
    RO: ["ro", "română", "rumence", "romanian"], SV: ["sv", "svenska", "isveççe", "swedish"], DA: ["da", "dansk", "danca", "danish"],
    NO: ["no", "norsk", "norveççe", "norwegian"], FI: ["fi", "suomi", "fince", "finnish"], SL: ["sl", "slovenščina", "slovence", "slovenian"],
    HR: ["hr", "hrvatski", "hırvatça", "croatian"],
    TUR: ["tür", "tur", "type", "typ"],
  };
  const sade = (s) => String(s).toLocaleLowerCase("tr").replace(/[()\[\]:.]/g, " ").trim();
  function baslikTahmin(h) {
    const s = sade(h);
    for (const [k, l] of Object.entries(BASLIK)) if (l.some((x) => s === x || s.split(/\s+/).includes(x))) return k;
    return null;
  }

  /**
   * Satırlardan sütun eşleşmesi önerir. İlk satır başlık gibi görünüyorsa başlık sayılır.
   * Dönüş: {baslikVar, eslesme: [kod|null] (sütun başına)}
   */
  function eslesmeOner(satirlar) {
    const ilk = satirlar[0] || [];
    const tahmin = ilk.map(baslikTahmin);
    const baslikVar = tahmin.filter(Boolean).length >= 2 || (tahmin[0] === "TR" && tahmin.some((t, i) => i > 0 && t));
    if (baslikVar) {
      const g = new Set();
      return { baslikVar, eslesme: tahmin.map((t) => (t && !g.has(t) ? (g.add(t), t) : null)) };
    }
    // Başlık yoksa: TR, EN, DE sırası
    return { baslikVar: false, eslesme: ilk.map((_, i) => ["TR", "EN", "DE"][i] || null) };
  }

  /**
   * Satırları terim listesine çevirir. Boş Türkçe hücreli satırlar atlanır; "sabit" türü tanınır.
   * Dönüş: {terimler: [{sablon, tur, EN, ...}], atlanan}
   */
  function terimlereCevir(satirlar, baslikVar, eslesme) {
    const veri = baslikVar ? satirlar.slice(1) : satirlar;
    const trS = eslesme.indexOf("TR");
    if (trS < 0) throw new Error("Türkçe sütunu seçin.");
    const terimler = [];
    let atlanan = 0;
    const gorulen = new Set();
    for (const r of veri) {
      const tr = String(r[trS] || "").replace(/\s+/g, " ").trim();
      if (!tr) { atlanan++; continue; }
      const a = Hafiza.anahtar(tr);
      if (gorulen.has(a)) { atlanan++; continue; }
      gorulen.add(a);
      const t = { sablon: tr, tur: "cevir" };
      eslesme.forEach((k, i) => {
        if (!k || k === "TR") return;
        const v = String(r[i] || "").replace(/\s+/g, " ").trim();
        if (k === "TUR") { if (/^sabit|fixed|keep|const/i.test(v)) t.tur = "sabit"; return; }
        if (v) t[k] = v;
      });
      if (t.tur === "cevir" && !Object.keys(t).some((k) => /^[A-Z]{2}$/.test(k))) { atlanan++; continue; }
      if (t.tur === "sabit") for (const k of Object.keys(t)) if (/^[A-Z]{2}$/.test(k)) delete t[k];
      terimler.push(t);
    }
    return { terimler, atlanan };
  }

  /** Terimleri Excel'in açtığı CSV'ye yazar (UTF-8 BOM, noktalı virgül). */
  function csvYaz(kayitlar, diller) {
    const kac = (v) => (/[";\n\r]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const bas = ["TR", "Tür", ...diller, "Onay", "Kaynak", "Tarih"];
    const sat = [bas.join(";")];
    for (const k of kayitlar) {
      sat.push([k.sablon, k.tur, ...diller.map((d) => (k.tur === "cevir" ? k[d] || "" : "")),
        Hafiza.onayli(k) ? "onaylı" : "bekliyor", k.kaynak || "", k.tarih || ""].map(kac).join(";"));
    }
    return "﻿" + sat.join("\r\n") + "\r\n";
  }

  window.Tablo = { csvOku, dosyaOku, eslesmeOner, terimlereCevir, csvYaz, baslikTahmin, sheetYukle };
})();
