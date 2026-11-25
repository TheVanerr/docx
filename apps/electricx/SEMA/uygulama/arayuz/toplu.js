// Toplu işlem: birkaç PDF birlikte taranır, kütüphanedeki karşılıklarla çevrilir ve hepsi tek zip olarak
// kaydedilir (isteğe bağlı her dil ayrı dosya). Kapak adı dosya başına, dil ve tarih üst şeritten gelir.
// Kütüphanede olmayan terimler Önizlemede açılan PDF'in Eksik listesinden yazılır.
(function () {
  "use strict";
  const { $, el, hal, olay, depo } = U;
  const kok = $("toplu");
  const ogeler = [];
  let sayac = 0, calisiyor = null;

  const giris = el("input", { type: "file", accept: "application/pdf,.pdf", multiple: true, hidden: true });
  const ozet = el("div", { class: "ozetler" });
  const uretDugme = el("button", { class: "dugme ana", type: "button", disabled: true, onclick: () => hepsiniUret() });
  const durdurDugme = el("button", { class: "dugme", type: "button", hidden: true, metin: "Durdur", onclick: () => { if (calisiyor) calisiyor.abort(); } });
  const temizleDugme = el("button", { class: "dugme sade", type: "button", hidden: true, metin: "Listeyi temizle", onclick: () => { ogeler.length = 0; yaz(); } });
  const liste = el("div", { class: "liste", hidden: true });
  const birak = el("div", { class: "birakma-kutu" },
    el("p", { style: { margin: "0 0 10px" }, metin: "Birden fazla şema PDF'ini bu pencereye bırakın veya seçin. Dil, tarih ve kaydetme biçimi üst şeritten alınır." }),
    el("button", { class: "dugme ana", type: "button", metin: "PDF'leri seç", onclick: () => giris.click() }));
  kok.append(
    el("div", { class: "panel-ust" }, el("h2", { metin: "Toplu işlem" }), ozet, el("span", { class: "bosluk" }), temizleDugme, durdurDugme, uretDugme),
    birak, liste, giris,
    el("p", { class: "not", metin: "Her PDF için kapak adı dosya adından gelir; kutudan değiştirebilirsiniz. Kaydetmede dosya adları kapak adı + ELECTRICAL SCHEMATIC olur ve hepsi tek zip içinde verilir." }));
  giris.addEventListener("change", (e) => { ekle([...e.target.files]); e.target.value = ""; });

  /** PDF'leri listeye ekler ve sırayla tarar. */
  async function ekle(dosyalar) {
    const yeni = [];
    for (const f of dosyalar) {
      if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") continue;
      if (ogeler.some((o) => o.dosya.name === f.name && o.dosya.size === f.size)) continue;
      const kayit = depo.oku("sema:pdf:" + f.name, null);
      const o = { id: ++sayac, dosya: f, ad: kayit && kayit.ad != null ? kayit.ad : f.name.replace(/\.pdf$/i, ""), durum: "bekliyor", kaynak: null, bayt: null, hata: null, cikti: null };
      ogeler.push(o);
      yeni.push(o);
    }
    yaz();
    for (const o of yeni) {
      o.durum = "taraniyor";
      yaz();
      try {
        o.bayt = new Uint8Array(await o.dosya.arrayBuffer());
        o.kaynak = await Motor.kaynakAc(o.bayt.slice());
        await Ceviri.hazirla(o.kaynak);
        o.durum = "hazir";
      } catch (e) {
        o.durum = "hata";
        o.hata = e.message || String(e);
      }
      yaz();
    }
  }

  const hazirOgeler = () => ogeler.filter((o) => o.durum === "hazir" || o.durum === "uretildi");

  /** Bütün PDF'lerdeki eksik terimler, birleştirilmiş (aynı terim bir kez sayılır). */
  function tumEksikler() {
    const diller = U.cevrilenDiller();
    if (!diller.length) return [];
    const m = new Map();
    for (const o of hazirOgeler()) {
      for (const e of Ceviri.eksikler(o.kaynak, diller)) {
        const k = Hafiza.anahtar(e.sablon);
        if (!m.has(k)) m.set(k, Object.assign({}, e, { diller: e.diller.slice() }));
        else { const x = m.get(k); x.diller = [...new Set(x.diller.concat(e.diller))]; }
      }
    }
    return [...m.values()];
  }

  async function hepsiniUret() {
    const sec = hazirOgeler();
    if (!sec.length || calisiyor) return;
    if (!U.seciliDiller().length) { U.durum("Üst şeritten en az bir dil seçin.", "hata"); return; }
    const eks = tumEksikler().length;
    const onaysiz = U.cevrilenDiller().length ? new Set(sec.flatMap((o) => Ceviri.onaysizlar(o.kaynak, U.cevrilenDiller()).map((t) => Hafiza.anahtar(t.sablon)))).size : 0;
    if (eks || onaysiz) {
      const parca = [];
      if (eks) parca.push(`${eks} terimin kütüphanede karşılığı yok; kaynak dilde kalır`);
      if (onaysiz) parca.push(`${onaysiz} terimin çevirisi onay bekliyor`);
      const ipucu = eks ? " Eksikleri yazmak için PDF'i Önizlemede açın; sağdaki Eksik listesinden yazdıklarınız kütüphaneye eklenir." : "";
      const c = await U.soru({ baslik: "Devam edilsin mi?", metin: parca.join(", ") + "." + ipucu, dugmeler: [{ yazi: "Vazgeç", deger: false }, { yazi: "Yine de üret", deger: true, ana: true }] });
      if (!c) return;
    }
    const ctl = new AbortController();
    calisiyor = ctl;
    yaz();
    const dosyalar = [];
    let i = 0;
    try {
      for (const o of sec) {
        if (ctl.signal.aborted) throw { code: "cancelled" };
        i++;
        U.durum(`Üretiliyor ${i}/${sec.length}: ${o.dosya.name}`, "", { donen: true });
        depo.yaz("sema:pdf:" + o.dosya.name, { ad: o.ad, tarih: $("tarih").value });
        const c = await U.ciktiUret({ kaynak: o.kaynak, ad: o.ad, yedekAd: o.dosya.name.replace(/\.pdf$/i, "") });
        dosyalar.push(...c.dosyalar);
        o.durum = "uretildi";
        o.cikti = c;
        if (U.arsiv && U.arsiv.etkin() && $("arsiveEkle").checked) {
          await U.arsiv.ekle({ kaynakDosya: o.dosya, kaynakBayt: o.bayt, ad: o.ad, cikti: c }).catch((e) => console.warn("Arşiv", e));
        }
        yaz();
        await new Promise((r) => setTimeout(r));
      }
      const zip = Zip.olustur(dosyalar);
      const ad = sec.length === 1 ? U.dosyaAdi(sec[0].ad, sec[0].dosya.name.replace(/\.pdf$/i, "")) + ".zip" : `Elektrik şemaları ${U.bugun()} (${sec.length} PDF).zip`;
      await Bulut.kaydet(ad, zip);
      U.durum(`Kaydedildi: ${ad} (${dosyalar.length} dosya, ${U.boyutYaz(zip.length)})`, "tamam");
    } catch (e) {
      if (e && e.code === "cancelled") U.durum("Toplu üretim durduruldu.");
      else if (e && e.code === "declined") U.durum("Kaydetme iptal edildi.");
      else U.durum("Toplu üretim tamamlanamadı: " + ((e && e.message) || e), "hata");
    } finally {
      calisiyor = null;
      yaz();
    }
  }

  function yaz() {
    $("topluRozet").hidden = !ogeler.length;
    $("topluRozet").textContent = ogeler.length;
    const hazir = hazirOgeler();
    const diller = U.cevrilenDiller();
    const eks = hazir.length ? tumEksikler().length : 0;
    ozet.textContent = "";
    if (ogeler.length) {
      ozet.append(el("span", {}, el("b", { metin: ogeler.length }), " PDF"), el("span", {}, el("b", { metin: hazir.reduce((a, o) => a + o.kaynak.sayi, 0) }), " şema sayfası"));
      if (diller.length) ozet.appendChild(el("span", {}, el("b", { metin: eks }), " eksik terim"));
      ozet.appendChild(el("span", { metin: `Diller: ${U.seciliDiller().join(", ") || "seçilmedi"}` }));
    }
    durdurDugme.hidden = !calisiyor;
    uretDugme.disabled = !hazir.length || !!calisiyor;
    uretDugme.textContent = hazir.length ? `${hazir.length} PDF'i üret ve zip olarak kaydet` : "Üret ve kaydet";
    temizleDugme.hidden = !ogeler.length || !!calisiyor;
    liste.hidden = !ogeler.length;
    liste.textContent = "";
    for (const o of ogeler) {
      const adGiris = el("input", { type: "text", value: o.ad, "aria-label": `${o.dosya.name} kapak adı`, spellcheck: "false", autocomplete: "off" });
      adGiris.addEventListener("input", () => { o.ad = adGiris.value; });
      let durum = "";
      if (o.durum === "taraniyor") durum = "Taranıyor…";
      else if (o.durum === "bekliyor") durum = "Sırada";
      else if (o.durum === "hata") durum = "Açılamadı: " + o.hata;
      else {
        const e = diller.length ? Ceviri.eksikler(o.kaynak, diller).length : 0;
        const b = diller.length ? Ceviri.onaysizlar(o.kaynak, diller).length : 0;
        durum = [`${o.kaynak.sayi} sayfa`, diller.length ? (e ? `${e} eksik` : "eksik yok") : null, b ? `${b} onay bekliyor` : null, o.durum === "uretildi" ? "üretildi" : null].filter(Boolean).join(" · ");
      }
      liste.appendChild(el("div", { class: "liste-satir" },
        el("div", { class: "ad" }, o.dosya.name, el("small", { metin: U.boyutYaz(o.dosya.size) })),
        el("label", { class: "alan" }, el("span", { class: "etiket", metin: "Kapak adı" }), adGiris),
        el("div", { style: { color: o.durum === "hata" ? "var(--kirmizi-k)" : "var(--soluk)", fontSize: "13px" }, metin: durum }),
        el("div", { class: "islem" },
          el("button", { class: "dugme kucuk", type: "button", disabled: !o.kaynak, metin: "Önizlemede aç", onclick: () => U.belgeAc(o.dosya, { bayt: o.bayt, ad: o.ad }) }),
          el("button", { class: "dugme kucuk sade", type: "button", disabled: !!calisiyor, metin: "Kaldır", onclick: () => { ogeler.splice(ogeler.indexOf(o), 1); yaz(); } }))));
    }
  }

  olay.on("sekme", (s) => { if (s === "toplu") yaz(); });
  olay.on("hafiza", () => { if (hal.sekme === "toplu" && !(document.activeElement && kok.contains(document.activeElement) && document.activeElement.tagName === "INPUT")) yaz(); });
  olay.on("diller", () => { if (hal.sekme === "toplu") yaz(); });
  yaz();
  U.toplu = { ekle, yaz };
})();
