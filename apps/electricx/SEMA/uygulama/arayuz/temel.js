// Arayüzün ortak parçaları: durum, olaylar, pencere (dialog), küçük DOM yardımcıları.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  /** el("button", {class: "dugme", onclick}, "Metin", altEleman) — metinler textContent olarak eklenir. */
  function el(etiket, ozellik, ...cocuklar) {
    const e = document.createElement(etiket);
    for (const [k, v] of Object.entries(ozellik || {})) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "metin") e.textContent = v;
      else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.assign(e.dataset, v);
      else if (k in e && typeof v !== "string") e[k] = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of cocuklar.flat()) {
      if (c == null || c === false) continue;
      e.append(c instanceof Node ? c : String(c));
    }
    return e;
  }

  // ---------------------------------------------------------------- olaylar
  const dinleyen = new Map();
  const olay = {
    on(ad, f) { if (!dinleyen.has(ad)) dinleyen.set(ad, new Set()); dinleyen.get(ad).add(f); return () => dinleyen.get(ad).delete(f); },
    emit(ad, veri) { for (const f of dinleyen.get(ad) || []) { try { f(veri); } catch (e) { console.error(e); } } },
  };

  const depo = {
    oku(k, v) { try { const x = JSON.parse(localStorage.getItem(k)); return x == null ? v : x; } catch (e) { return v; } },
    yaz(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* depolama kapalı olabilir */ } },
  };

  const iki = (n) => String(n).padStart(2, "0");
  const bugun = () => { const d = new Date(); return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`; };
  const tarihYaz = (iso) => {
    if (!iso) return "";
    const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
    if (isNaN(d)) return iso;
    const t = `${iki(d.getDate())}.${iki(d.getMonth() + 1)}.${d.getFullYear()}`;
    return iso.length <= 10 ? t : `${t} ${iki(d.getHours())}:${iki(d.getMinutes())}`;
  };
  const boyutYaz = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

  // ---------------------------------------------------------------- uygulama durumu
  const hal = {
    dosya: null, kaynak: null, kaynakBayt: null, kaynakPdf: null, diller: new Set(), uretilen: null, sonuc: null, istekNo: 0,
    sekme: "onizleme", db: null, assets: null, kullanici: null,
  };

  const dilAdi = (d) => (window.Ayarlar && Ayarlar.DIL_TR[d]) || d;
  /** Başlıkta seçilebilen diller: TR, EN, DE ve ayarlarda etkinleştirilmiş olanlar. */
  const secilebilir = () => Motor.TEMEL_DILLER.concat(Ayarlar.hazirDiller());
  const seciliDiller = () => Motor.sirala([...hal.diller]).filter((d) => secilebilir().includes(d));
  const cevrilenDiller = () => seciliDiller().filter((d) => d !== Motor.KAYNAK_DIL);
  /** Terim tablosunda gösterilen çeviri dilleri: EN, DE, ek diller (seçili olanlar önce). */
  const tabloDilleri = () => {
    const tum = Motor.TEMEL_DILLER.filter((d) => d !== "TR").concat(Ayarlar.hazirDiller());
    return tum;
  };
  const kok = () => (hal.dosya ? hal.dosya.name.replace(/\.pdf$/i, "") : "");

  /** Kayıt adı: kapak adı + ELECTRICAL SCHEMATIC. Ek zaten yazılmışsa (TR/EN/DE biçimi) çift yazılmaz. */
  function dosyaAdi(ad, yedek, ek) {
    const a = Tasarim.adTemizle(ad || "") || Tasarim.adTemizle(yedek || "") || "Sema";
    return `${a} ELECTRICAL SCHEMATIC${ek ? " " + ek : ""}`.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim();
  }

  // ---------------------------------------------------------------- durum satırı
  let durumZaman = null, sonuc = 0;
  /**
   * durum(metin, sinif, {donen, dugme: {yazi, is}, arka}) — arka: true olan kendiliğinden güncellemeler (yeniden üretim)
   * az önce gösterilen bir sonuç mesajını (kaydedildi, hata, içe aktarıldı) 7 saniye boyunca ezmez.
   */
  function durum(metin, sinif, sec) {
    sec = sec || {};
    if (sec.arka && Date.now() - sonuc < 7000) return;
    if (!sec.arka && (sinif === "tamam" || sinif === "hata" || sinif === "uyari" || sec.dugme)) sonuc = Date.now();
    clearTimeout(durumZaman);
    const d = $("durum");
    d.className = "durum " + (sinif || "");
    d.textContent = "";
    if (sec.donen) d.appendChild(el("i", { class: "donen", "aria-hidden": "true" }));
    if (metin) d.appendChild(el("span", { metin }));
    if (sec.dugme) d.appendChild(el("button", { class: "dugme kucuk", type: "button", onclick: sec.dugme.is, metin: sec.dugme.yazi }));
  }

  // ---------------------------------------------------------------- pencere
  const pen = $("pencere");
  let penKapan = null;
  /**
   * Pencere açar. sec: {baslik, alt, icerik: Node, dugmeler: Node[], genis}. Dönüş: {kapat, kok}.
   * Escape veya Kapat ile kapanınca sec.kapaninca çağrılır.
   */
  function pencere(sec) {
    if (pen.open) pen.close();
    pen.textContent = "";
    pen.style.width = sec.genis ? `min(${sec.genis}px, calc(100vw - 32px))` : "";
    const kapat = () => { if (pen.open) pen.close(); };
    const ust = el("div", { class: "pencere-ust" },
      el("h3", { id: "pencereBaslik" }, sec.baslik, sec.alt ? el("small", { metin: sec.alt }) : null),
      el("button", { class: "dugme kucuk sade kapat", type: "button", onclick: kapat, metin: "Kapat" }));
    const ic = el("div", { class: "pencere-ic" }, sec.icerik);
    const alt = sec.dugmeler && sec.dugmeler.length ? el("div", { class: "pencere-alt" }, sec.dugmeler) : null;
    pen.appendChild(el("div", { class: "pencere" }, ust, ic, alt));
    if (penKapan) pen.removeEventListener("close", penKapan);
    penKapan = () => { if (sec.kapaninca) sec.kapaninca(); };
    pen.addEventListener("close", penKapan, { once: true });
    if (typeof pen.showModal === "function") pen.showModal(); else pen.setAttribute("open", "");
    const ilk = pen.querySelector("[autofocus]") || pen.querySelector(".pencere-alt .ana");
    if (ilk) ilk.focus();
    return { kapat, kok: pen, ic };
  }

  /** Sayfa içi onay sorusu. Dönüş: seçilen düğmenin değeri veya null. */
  function soru(sec) {
    return new Promise((tamam) => {
      let sonuc = null;
      const dugmeler = sec.dugmeler.map((d) => el("button", {
        class: "dugme" + (d.ana ? " ana" : "") + (d.tehlike ? " tehlike" : "") + (d.sol ? " sol" : ""), type: "button",
        onclick: () => { sonuc = d.deger; p.kapat(); }, metin: d.yazi,
      }));
      const p = pencere({ baslik: sec.baslik, icerik: typeof sec.metin === "string" ? el("p", { style: { margin: 0 }, metin: sec.metin }) : sec.metin, dugmeler, genis: sec.genis || 520, kapaninca: () => tamam(sonuc) });
    });
  }

  // ---------------------------------------------------------------- sekmeler
  const SEKMELER = ["onizleme", "terimler", "toplu", "arsiv", "tasarimlar", "ayarlar"];
  function sekmeAc(ad) {
    if (!SEKMELER.includes(ad)) ad = "onizleme";
    hal.sekme = ad;
    for (const s of SEKMELER) {
      $("sekme-" + s).setAttribute("aria-selected", s === ad);
      $(s).hidden = s !== ad;
    }
    olay.emit("sekme", ad);
  }
  document.querySelector(".sekmeler").addEventListener("click", (e) => {
    const b = e.target.closest("button[role=tab]");
    if (b) sekmeAc(b.id.replace("sekme-", ""));
  });

  window.U = {
    $, el, olay, depo, hal, iki, bugun, tarihYaz, boyutYaz, durum, pencere, soru, sekmeAc,
    dilAdi, secilebilir, seciliDiller, cevrilenDiller, tabloDilleri, kok, dosyaAdi,
  };
})();
