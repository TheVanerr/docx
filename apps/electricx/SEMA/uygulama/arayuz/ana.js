// Ana akış: PDF açma, dil seçimi, üretim ve önizleme, kütüphanede olmayan terimlerin Eksik listesine düşmesi, kaydetme.
(function () {
  "use strict";
  const { $, el, hal, olay, depo, durum } = U;

  // ---------------------------------------------------------------- bağlantı göstergeleri
  function haplar() {
    const h = Hafiza.durum();
    const hh = $("hapHafiza");
    if (h.depo === "bulut") {
      hh.className = "hap " + (h.hazir && !h.hata ? "acik" : "bekle");
      hh.textContent = `Kütüphane · ${h.sayi} terim`;
      hh.title = h.hata || "Kütüphane programla gelir; sizin yazdığınız karşılıklar ELECTRICX veritabanına eklenir ve her cihazdan görünür.";
    } else {
      hh.className = "hap bekle";
      hh.textContent = `Kütüphane · ${h.sayi} terim`;
      hh.title = "Veritabanına bağlanılamadı: yazdığınız karşılıklar şimdilik bu tarayıcıda saklanıyor.";
    }
  }

  function rozetler() {
    const d = U.cevrilenDiller();
    const varMi = hal.kaynak && hal.kaynak.tarama && d.length;
    const n = varMi ? Ceviri.eksikler(hal.kaynak, d).length : 0;
    const b = varMi ? Ceviri.onaysizlar(hal.kaynak, d).length : 0;
    $("eksikRozet").textContent = n;
    $("eksikRozet").className = "rozet" + (n ? "" : " sakin");
    $("eksikRozet").title = n ? `${n} terimin karşılığı yok` : "Eksik terim yok";
    $("onayRozet").hidden = !b;
    $("onayRozet").textContent = b;
    $("onayRozet").title = `${b} terim onay bekliyor`;
  }

  // ---------------------------------------------------------------- dil düğmeleri
  function dilDugmeleri() {
    const k = $("diller");
    k.textContent = "";
    for (const d of U.secilebilir()) {
      k.appendChild(el("button", { type: "button", dataset: { dil: d }, "aria-pressed": hal.diller.has(d) ? "true" : "false", title: U.dilAdi(d), metin: d }));
    }
  }
  $("diller").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-dil]");
    if (!b) return;
    const d = b.dataset.dil;
    if (hal.diller.has(d)) hal.diller.delete(d); else hal.diller.add(d);
    b.setAttribute("aria-pressed", hal.diller.has(d));
    ayarSakla();
    olay.emit("diller");
    rozetler();
    gecikmeliYenile(120);
  });

  // ---------------------------------------------------------------- PDF açma
  /** Tek PDF'i önizlemeye açar. sec: {bayt, ad, tarih, diller} (arşivden veya topludan açılırken) */
  async function belgeAc(f, sec) {
    sec = sec || {};
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { durum(`${f.name} bir PDF değil.`, "hata"); return; }
    durum(`${f.name} okunuyor`, "", { donen: true });
    let bayt, kaynak;
    try {
      bayt = sec.bayt || new Uint8Array(await f.arrayBuffer());
      kaynak = await Motor.kaynakAc(bayt.slice());
    } catch (e) {
      durum(e.message || String(e), "hata");
      return;
    }
    hal.dosya = f; hal.kaynakBayt = bayt; hal.kaynak = kaynak; hal.sonuc = null; hal.uretilen = null;
    if (hal.kaynakPdf) { hal.kaynakPdf.then((d) => d.destroy()).catch(() => {}); hal.kaynakPdf = null; }
    $("dosyaAdi").textContent = f.name;
    $("dosyaAdi").title = f.name;
    $("dosyaAdi").classList.add("dolu");
    document.body.classList.add("belgeli");
    const kayit = depo.oku("sema:pdf:" + f.name, null);
    $("ad").value = sec.ad != null ? sec.ad : kayit && kayit.ad != null ? kayit.ad : U.kok();
    $("tarih").value = sec.tarih || (kayit && kayit.tarih) || U.bugun();
    if (sec.diller && sec.diller.length) {
      hal.diller = new Set(sec.diller.filter((d) => U.secilebilir().includes(d)));
      dilDugmeleri();
      olay.emit("diller");
    }
    durum("Etiketler taranıyor", "", { donen: true });
    try {
      await Ceviri.hazirla(kaynak, (y, t) => { if (t > 12 && hal.kaynak === kaynak) durum(`Etiketler taranıyor (${y}/${t})`, "", { donen: true }); });
    } catch (e) { /* tarama hatası yalnızca çeviriyi etkiler */ }
    if (hal.kaynak !== kaynak) return;
    olay.emit("belge");
    await yenile();
    // Kütüphanede karşılığı olmayan terim varsa Eksik listesi açılır
    if (U.cevrilenDiller().length && Ceviri.eksikler(kaynak, U.cevrilenDiller()).length) U.onizleme.panelAc(true);
  }

  function dosyalarGeldi(liste) {
    const pdf = [...liste].filter((x) => /\.pdf$/i.test(x.name) || x.type === "application/pdf");
    if (!pdf.length) { if (liste.length) durum(`${liste[0].name} bir PDF değil.`, "hata"); return; }
    if (pdf.length === 1) { if (hal.sekme !== "toplu") U.sekmeAc("onizleme"); belgeAc(pdf[0]); return; }
    U.sekmeAc("toplu");
    U.toplu.ekle(pdf);
  }
  $("pdfAc").addEventListener("click", () => $("dosyaSec").click());
  $("pdfAcBos").addEventListener("click", () => $("dosyaSec").click());
  $("dosyaSec").addEventListener("change", (e) => { dosyalarGeldi(e.target.files); e.target.value = ""; });
  let surukleSay = 0;
  const dosyaVar = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  window.addEventListener("dragenter", (e) => { if (!dosyaVar(e)) return; e.preventDefault(); surukleSay++; document.body.classList.add("surukle"); });
  window.addEventListener("dragleave", () => { if (--surukleSay <= 0) { surukleSay = 0; document.body.classList.remove("surukle"); } });
  window.addEventListener("dragover", (e) => { if (dosyaVar(e)) e.preventDefault(); });
  window.addEventListener("drop", (e) => {
    if (!dosyaVar(e)) return;
    e.preventDefault();
    surukleSay = 0;
    document.body.classList.remove("surukle");
    dosyalarGeldi(e.dataTransfer.files);
  });

  // ---------------------------------------------------------------- üretim
  let zamanlayici = null;
  function gecikmeliYenile(ms) { clearTimeout(zamanlayici); zamanlayici = setTimeout(yenile, ms); }

  function ayarSakla() {
    depo.yaz("sema:son", { diller: [...hal.diller] });
    if (hal.dosya) depo.yaz("sema:pdf:" + hal.dosya.name, { ad: $("ad").value, tarih: $("tarih").value });
  }

  /** Taramanın uyarıları: çevrilemeyecek yapıdaki PDF'ler. */
  function taramaUyarisi() {
    const T = hal.kaynak && hal.kaynak.tarama;
    if (!T) return "";
    const etiket = T.sayfalar.reduce((a, s) => a + s.etiketler.length, 0);
    const form = T.sayfalar.reduce((a, s) => a + s.formYazi, 0);
    const okunmaz = T.sayfalar.reduce((a, s) => a + s.okunmaz, 0);
    if (!etiket && form) return "Bu PDF'in yazıları birden çok yerde kullanılan form nesnelerinin içinde; çevrilemez. EPLAN'dan doğrudan alınan PDF'i kullanın.";
    if (!etiket && okunmaz) return "Bu PDF'in yazıları okunamıyor (fontta karakter eşlemesi yok).";
    if (!etiket) return "Bu PDF'te çevrilecek etiket bulunamadı.";
    return "";
  }

  const ortakAyar = (kaynak, diller, ad) => ({ kaynak, diller, ad, tarih: $("tarih").value, tasarim: Tasarim.secimOku() });

  async function yenile() {
    clearTimeout(zamanlayici);
    ayarSakla();
    const no = ++hal.istekNo;
    $("kaydet").disabled = true;
    rozetler();
    if (!hal.kaynak) return;
    if (!U.seciliDiller().length) {
      hal.sonuc = null; hal.uretilen = null;
      await U.onizleme.goster(hal.kaynakBayt, null);
      if (no === hal.istekNo) durum(`Kaynak PDF: ${hal.kaynak.sayi} sayfa. Kapak, ön sayfalar ve çeviri için dil seçin.`, "", { arka: true });
      return;
    }
    durum("Oluşturuluyor", "", { donen: true, arka: true });
    try {
      const bas = performance.now();
      const y = await Motor.olustur(ortakAyar(hal.kaynak, U.seciliDiller(), $("ad").value));
      if (no !== hal.istekNo) return;
      hal.sonuc = y;
      hal.uretilen = { bayt: y.bayt };
      $("kaydet").disabled = false;
      await U.onizleme.goster(y.bayt, y.sayfalar);
      if (no !== hal.istekNo) return;
      hal.sureMs = performance.now() - bas;
      sonucDurumu(y);
      olay.emit("uretildi");
    } catch (e) {
      console.error(e);
      if (no === hal.istekNo) durum("PDF üretilemedi: " + (e.message || e), "hata");
    }
  }

  function sonucDurumu(y) {
    const bolum = y.bolumler.map((b) => `${b.dil} s.${b.ilk_sayfa}`).join(", ");
    const parca = [`${y.sayfa} sayfa (${bolum}).`];
    let sinif = "tamam";
    const d = U.cevrilenDiller();
    const uy = taramaUyarisi();
    const eks = d.length ? Ceviri.eksikler(hal.kaynak, d).length : 0;
    const bek = d.length ? Ceviri.onaysizlar(hal.kaynak, d).length : 0;
    if (d.length && uy) { parca.push(uy); sinif = "uyari"; }
    else {
      for (const c of y.ceviri) parca.push(`${c.dil}: ${c.say.cevrilen} etiket.`);
      if (eks) { parca.push(`${eks} terim kütüphanede yok, kaynak dilde kaldı: sağdaki Eksik listesinden yazın.`); sinif = "uyari"; }
      if (bek) { parca.push(`${bek} terim onay bekliyor.`); if (sinif === "tamam") sinif = ""; }
    }
    if (y.uyari.length) { parca.push(`${y.uyari.length} ön sayfa metni sığmadı.`); sinif = "hata"; }
    durum(parca.join(" "), sinif === "tamam" ? "tamam" : sinif, { arka: true });
  }

  /**
   * Kaydedilecek dosyaları üretir: tek PDF veya her dil ayrı PDF. sec: {kaynak, ad, yedekAd}
   * Dönüş: {dosyalar: [{ad, bayt}], diller, sayfa, ayri}
   */
  async function ciktiUret(sec) {
    const diller = U.seciliDiller();
    const ayri = $("bicimAyri").checked && diller.length > 1;
    const dosyalar = [];
    let sayfa = 0;
    if (ayri) {
      for (const d of diller) {
        const y = await Motor.olustur(ortakAyar(sec.kaynak, [d], sec.ad));
        dosyalar.push({ ad: U.dosyaAdi(sec.ad, sec.yedekAd, `(${d})`) + ".pdf", bayt: y.bayt });
        sayfa += y.sayfa;
      }
    } else {
      const hazir = sec.kaynak === hal.kaynak && hal.sonuc && sec.ad === $("ad").value ? hal.sonuc : null;
      const y = hazir || await Motor.olustur(ortakAyar(sec.kaynak, diller, sec.ad));
      dosyalar.push({ ad: U.dosyaAdi(sec.ad, sec.yedekAd) + ".pdf", bayt: y.bayt });
      sayfa = y.sayfa;
    }
    return { dosyalar, diller, sayfa, ayri };
  }

  async function kaydet() {
    if (!hal.uretilen || !hal.kaynak) return;
    const d = U.cevrilenDiller();
    const bek = d.length ? Ceviri.onaysizlar(hal.kaynak, d) : [];
    const eks = d.length ? Ceviri.eksikler(hal.kaynak, d) : [];
    if (bek.length || eks.length) {
      const parca = [];
      if (bek.length) parca.push(`${bek.length} terimin çevirisi henüz onaylanmadı (öneri olarak basılır)`);
      if (eks.length) parca.push(`${eks.length} terimin karşılığı yok (kaynak dilde kalır)`);
      const dugmeler = [{ yazi: eks.length ? "Eksiklere bak" : "Gözden geçir", deger: "bak", sol: true }];
      if (bek.length) dugmeler.push({ yazi: "Hepsini onayla ve kaydet", deger: "onayla" });
      dugmeler.push({ yazi: "Yine de kaydet", deger: "kaydet", ana: true });
      const c = await U.soru({ baslik: "Kaydetmeden önce", metin: `Bu PDF'te ${parca.join("; ")}.`, dugmeler, genis: 560 });
      if (!c) return;
      if (c === "bak") { U.onizleme.panelAc(true); U.sekmeAc("onizleme"); return; }
      if (c === "onayla") { await Hafiza.onayla(bek.map((t) => t.sablon)); await yenile(); }
    }
    try {
      durum("Kaydediliyor", "", { donen: true });
      const c = await ciktiUret({ kaynak: hal.kaynak, ad: $("ad").value, yedekAd: U.kok() });
      let ad;
      if (c.dosyalar.length === 1) { ad = c.dosyalar[0].ad; await Bulut.kaydet(ad, c.dosyalar[0].bayt); }
      else { ad = U.dosyaAdi($("ad").value, U.kok()) + ".zip"; await Bulut.kaydet(ad, Zip.olustur(c.dosyalar)); }
      let arsiv = "";
      if (U.arsiv.etkin() && $("arsiveEkle").checked) {
        try { await U.arsiv.ekle({ kaynakDosya: hal.dosya, kaynakBayt: hal.kaynakBayt, ad: $("ad").value, cikti: c }); arsiv = " Arşive eklendi."; }
        catch (e) { arsiv = ` Arşive eklenemedi: ${(e && (e.message || e.code)) || e}.`; }
      }
      durum(`Kaydedildi: ${ad}.${arsiv}`, arsiv.includes("eklenemedi") ? "uyari" : "tamam");
    } catch (e) {
      if (e && e.code === "declined") durum("Kaydetme iptal edildi.");
      else durum("Kaydedilemedi: " + ((e && e.message) || e), "hata");
    }
  }
  $("kaydet").addEventListener("click", kaydet);

  // Kaydetme seçenekleri
  const menu = $("kaydetMenu"), menuDugme = $("kaydetMenuDugme");
  menuDugme.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; menuDugme.setAttribute("aria-expanded", !menu.hidden); });
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== menuDugme) { menu.hidden = true; menuDugme.setAttribute("aria-expanded", "false"); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { menu.hidden = true; menuDugme.focus(); } });
  const bicim = depo.oku("sema:bicim", "tek");
  $(bicim === "ayri" ? "bicimAyri" : "bicimTek").checked = true;
  $("arsiveEkle").checked = depo.oku("sema:arsivle", true);
  for (const id of ["bicimTek", "bicimAyri"]) $(id).addEventListener("change", () => depo.yaz("sema:bicim", $("bicimAyri").checked ? "ayri" : "tek"));
  $("arsiveEkle").addEventListener("change", () => depo.yaz("sema:arsivle", $("arsiveEkle").checked));

  // ---------------------------------------------------------------- geri alma (Ctrl+Z)
  // Kutuya yazarken Ctrl+Z tarayıcının kendi geri almasıdır; kutu dışında ya da kutuda henüz yazılmamışken
  // kütüphanedeki son değişiklik (kayıt, silme, onay, içe aktarma) geri alınır.
  const yaziAlani = (e) => !!e && (e.isContentEditable || e.tagName === "TEXTAREA" ||
    (e.tagName === "INPUT" && !/^(checkbox|radio|button|submit|file|range|color)$/i.test(e.type)));
  document.addEventListener("focusin", (e) => { e.target.__yazildi = false; }, true);
  document.addEventListener("input", (e) => { e.target.__yazildi = true; }, true);
  async function sonIslemiGeriAl() {
    const ad = await Hafiza.islemGeriAl();
    durum(ad ? `Geri alındı: ${ad}` : "Geri alınacak kütüphane değişikliği yok.", ad ? "tamam" : "");
    if (ad && U.terimler) U.terimler.yaz();
  }
  U.sonIslemiGeriAl = sonIslemiGeriAl;
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || String(e.key).toLowerCase() !== "z") return;
    if (document.querySelector("dialog[open]")) return;
    const a = document.activeElement;
    if (yaziAlani(a) && a.__yazildi) return;
    e.preventDefault();
    if (yaziAlani(a)) a.blur();
    sonIslemiGeriAl();
  });

  // ---------------------------------------------------------------- değişikliklere tepki
  let sonSurum = Hafiza.surum();
  Hafiza.dinle(() => {
    haplar();
    if (Hafiza.surum() === sonSurum) return;
    sonSurum = Hafiza.surum();
    olay.emit("hafiza");
    rozetler();
    if (hal.kaynak && U.cevrilenDiller().length) gecikmeliYenile(450);
  });
  Ayarlar.dinle(() => {
    // Kaldırılan dil seçimden düşer
    for (const d of [...hal.diller]) if (!U.secilebilir().includes(d)) hal.diller.delete(d);
    dilDugmeleri();
    $("hazirlayan").textContent = window.ICERIK.hazirlayan;
    olay.emit("ayarlar");
    if (hal.kaynak && hal.diller.size) gecikmeliYenile(250);
  });
  olay.on("tasarim", () => { if (hal.kaynak && hal.diller.size) gecikmeliYenile(100); });
  olay.on("sekme", (s) => { if (s === "onizleme") U.onizleme.isaretleriYaz(); });

  $("ad").addEventListener("input", () => { if (hal.kaynak && hal.diller.size) gecikmeliYenile(400); else ayarSakla(); });
  $("ad").addEventListener("keydown", (e) => { if (e.key === "Enter") yenile(); });
  $("tarih").addEventListener("change", () => { if (!$("tarih").value) $("tarih").value = U.bugun(); if (hal.kaynak) gecikmeliYenile(150); });

  // ---------------------------------------------------------------- başlangıç
  $("hazirlayan").textContent = window.ICERIK.hazirlayan;
  $("tarih").value = U.bugun();
  const son = depo.oku("sema:son", null);
  (son && son.diller ? son.diller : ["EN"]).forEach((d) => hal.diller.add(d));
  dilDugmeleri();
  haplar();
  rozetler();
  durum("PDF'i sürükleyip bırakın veya PDF aç ile seçin. Birden çok PDF Toplu sekmesinde birlikte işlenir.");

  Bulut.hazir.then(async ({ db, assets }) => {
    hal.db = db;
    hal.assets = assets;
    hal.kullanici = await Bulut.kullanici;
    haplar();
    olay.emit("bulut");
    if (db) {
      await Promise.all([Hafiza.baglan(db, hal.kullanici.id), Ayarlar.baglan(db)]);
      // Ayarlardan gelen ek diller artık seçilebilir: son seçimdeki ek diller geri yüklenir
      for (const d of (son && son.diller) || []) if (U.secilebilir().includes(d)) hal.diller.add(d);
      dilDugmeleri();
      olay.emit("diller");
    }
    rozetler();
  });

  U.belgeAc = belgeAc;
  U.ciktiUret = ciktiUret;
  U.yenile = yenile;
})();
