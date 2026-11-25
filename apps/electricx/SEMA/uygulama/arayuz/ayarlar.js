// Ayarlar sekmesi: ek diller, ön sayfa metinleri, şirket bilgileri, kütüphane yedeği ve sürüm.
(function () {
  "use strict";
  const { $, el, hal, olay } = U;
  const kok = $("ayarlar");
  const s = { bolum: "ortak", taslak: null };

  const ETIKET = {
    ad: "Dilin adı", sema: "Belge türü (kapakta, büyük harf)",
    "kapak.tarih": "Kapak: yayın tarihi etiketi", "kapak.hazirlayan": "Kapak: hazırlayan etiketi", "kapak.uretici": "Kapak: üretici etiketi", "kapak.belge": "Kapak: doküman etiketi",
    "bolum.kapak": "Yer imi: kapak", "bolum.guvenlik": "Yer imi: güvenlik", "bolum.kablo": "Yer imi: kablo", "bolum.sema": "Yer imi: şema",
    "guvenlik.baslik": "Güvenlik: başlık", "guvenlik.alt_baslik": "Güvenlik: alt başlık", "guvenlik.tehlike": "Güvenlik: uyarı kelimesi",
    "guvenlik.kritik": "Güvenlik: kritik uyarı", "guvenlik.kurallar": "Güvenlik: kural",
    "kablo.baslik": "Kablo: başlık", "kablo.sutunlar": "Kablo: sütun", "kablo.dipnot": "Kablo: dipnot", "kablo.aciklama": "Kablo: satır açıklaması", "kablo.renk": "Kablo: renk adı",
  };
  const ALT_BASLIK = { kapak: "Kapak", bolum: "PDF yer imleri", guvenlik: "Safety Regulations sayfası", kablo: "Cable Color Coding sayfası" };

  // ---------------------------------------------------------------- iskelet
  const diller = el("div", { class: "kutu" });
  const metinler = el("div", { class: "kutu genis" });
  const yedek = el("div", { class: "kutu" });
  const surum = el("div", { class: "kutu" });
  kok.append(el("div", { class: "panel-ust" }, el("h2", { metin: "Ayarlar" }), el("div", { class: "ozetler", id: "ayarOzet" })),
    el("div", { class: "ayar-izgara" }, diller, yedek, metinler, surum));

  // ---------------------------------------------------------------- diller
  function dillerYaz() {
    diller.textContent = "";
    diller.append(el("h3", { metin: "Diller" }), el("p", { metin: "TR, EN ve DE her zaman hazırdır. Eklediğiniz dil üst şeritte seçilebilir; şema etiketleri o dile çevrilir, ön sayfa metinleri aşağıdan düzenlenir." }));
    const ek = Ayarlar.ekDiller();
    const liste = el("div");
    for (const d of ek) {
      const hazir = !!window.ICERIK[d];
      liste.appendChild(el("div", { class: "dil-satir" },
        el("div", {}, el("b", { metin: `${d} · ${Ayarlar.DIL_ADLARI[d]}` }), el("small", { style: { display: "block", color: "var(--soluk)" }, metin: hazir ? U.dilAdi(d) + ", etkin" : "Ön sayfa metinleri eksik" })),
        el("div", { class: "satir" },
          el("button", { class: "dugme kucuk", type: "button", metin: "Ön sayfa metinleri", onclick: () => { s.bolum = d; metinlerYaz(); metinler.scrollIntoView({ behavior: "smooth", block: "start" }); } }),
          el("button", { class: "dugme kucuk sade tehlike", type: "button", metin: "Kaldır", onclick: async () => {
            const c = await U.soru({ baslik: "Dili kaldır", metin: `${Ayarlar.DIL_ADLARI[d]} kaldırılsın mı? Hafızadaki ${d} çevirileri ve ön sayfa metinleri silinmez; dili yeniden eklediğinizde geri gelir.`, dugmeler: [{ yazi: "Vazgeç", deger: false }, { yazi: "Kaldır", deger: true, ana: true }] });
            if (c) { hal.diller.delete(d); await Ayarlar.dilKaldir(d); }
          } }))));
    }
    if (ek.length) diller.appendChild(liste);
    const sec = el("select", { "aria-label": "Eklenecek dil", style: { width: "auto", minWidth: "190px" } },
      ...Object.keys(Ayarlar.DIL_ADLARI).filter((d) => !ek.includes(d)).map((d) => el("option", { value: d, metin: `${d} · ${Ayarlar.DIL_ADLARI[d]} (${U.dilAdi(d)})` })));
    const ekle = el("button", { class: "dugme ana", type: "button", metin: "Ekle" });
    ekle.addEventListener("click", () => dilEkle(sec.value, ekle));
    if (sec.options.length) diller.appendChild(el("div", { class: "satir" }, sec, ekle));
    diller.appendChild(el("p", { style: { fontSize: "12px" }, metin: "Rusça gibi Kiril alfabeli diller gömülü fontlarda olmadığı için şimdilik eklenemez." }));
  }

  async function dilEkle(d, dugme) {
    if (!d) return;
    const kayitli = Ayarlar.icerikKaydi(d);
    if (kayitli && !Ayarlar.sekilHatalari(Ayarlar.dilSablonu(), kayitli).length) {
      await Ayarlar.dilEkle(d);
      U.durum(`${Ayarlar.DIL_ADLARI[d]} eklendi.`, "tamam");
      return;
    }
    s.taslak = { dil: d, deger: Object.assign(Ayarlar.dilSablonu(), { ad: Ayarlar.DIL_ADLARI[d] }) };
    s.bolum = d;
    metinlerYaz();
    metinler.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------------------------------------------------------------- ön sayfa metinleri
  function alanlarKur(ornek, deger, yol, kap) {
    for (const k of Object.keys(ornek)) {
      const y = yol ? `${yol}.${k}` : k;
      const o = ornek[k], v = deger ? deger[k] : undefined;
      if (o && typeof o === "object" && !Array.isArray(o)) {
        if (ALT_BASLIK[k]) kap.appendChild(el("h4", { class: "alt-baslik", metin: ALT_BASLIK[k] }));
        alanlarKur(o, v, y, kap);
      } else if (Array.isArray(o)) {
        o.forEach((x, i) => {
          const uzun = String(x).length > 60;
          const g = el(uzun ? "textarea" : "input", { class: uzun ? "uzun" : "", dataset: { yol: `${y}[${i}]` }, spellcheck: "true", rows: uzun ? 2 : undefined, type: uzun ? undefined : "text" });
          g.value = v && v[i] != null ? v[i] : "";
          g.placeholder = String(x);
          kap.append(el("label", { metin: `${ETIKET[y] || y} ${i + 1}` }), g);
        });
      } else {
        const g = el("input", { type: "text", dataset: { yol: y }, spellcheck: "true" });
        g.value = v != null ? v : "";
        g.placeholder = String(o);
        kap.append(el("label", { metin: ETIKET[y] || y }), g);
      }
    }
  }
  function alanlariOku(ornek, kap, yol) {
    const o = Array.isArray(ornek) ? [] : {};
    for (const k of Object.keys(ornek)) {
      const y = yol ? `${yol}.${k}` : k;
      const x = ornek[k];
      if (x && typeof x === "object" && !Array.isArray(x)) o[k] = alanlariOku(x, kap, y);
      else if (Array.isArray(x)) o[k] = x.map((_, i) => { const g = kap.querySelector(`[data-yol="${CSS.escape(`${y}[${i}]`)}"]`); return g ? g.value.trim() : ""; });
      else { const g = kap.querySelector(`[data-yol="${CSS.escape(y)}"]`); o[k] = g ? g.value.trim() : ""; }
    }
    return o;
  }

  function ortakKur(kap) {
    const I = window.ICERIK;
    for (const [k, ad] of [["hazirlayan", "Hazırlayan (kapakta ve PDF yazarında)"], ["sirket", "Şirket adı"], ["web", "Web adresi"]]) {
      const g = el("input", { type: "text", dataset: { yol: k } });
      g.value = I[k] || "";
      kap.append(el("label", { metin: ad }), g);
    }
    kap.appendChild(el("h4", { class: "alt-baslik", metin: "Kablo tablosu (7 satır; tasarımlar bu sayıya göre çizilir)" }));
    I.kablo_satirlari.forEach((r, i) => {
      const kod = el("input", { type: "text", value: r.kod, dataset: { k: "kod", i }, "aria-label": `${i + 1}. satır kod`, style: { width: "90px" } });
      const kesit = el("input", { type: "text", value: r.kesit, dataset: { k: "kesit", i }, "aria-label": `${i + 1}. satır kesit`, style: { width: "100px" } });
      const r1 = el("input", { type: "color", value: r.renk[0], dataset: { k: "renk0", i }, "aria-label": `${i + 1}. satır renk` });
      const ikiRenk = el("input", { type: "checkbox", checked: r.renk.length > 1, dataset: { k: "iki", i }, title: "İki renkli (sarı-yeşil gibi)" });
      const r2 = el("input", { type: "color", value: r.renk[1] || "#1C9A4B", dataset: { k: "renk1", i }, "aria-label": `${i + 1}. satır ikinci renk` });
      r2.hidden = !ikiRenk.checked;
      ikiRenk.addEventListener("change", () => { r2.hidden = !ikiRenk.checked; });
      kap.append(el("label", { metin: `${i + 1}. satır (${(window.ICERIK.TR.kablo.aciklama || [])[i] || ""})` }),
        el("div", { class: "renk-hucre", style: { flexWrap: "wrap" } }, kod, kesit, r1, el("label", { class: "secim", title: "İki renkli" }, ikiRenk, el("span", { metin: "iki renk" })), r2));
    });
  }
  function ortakOku(kap) {
    const o = {};
    for (const k of ["hazirlayan", "sirket", "web"]) o[k] = kap.querySelector(`[data-yol="${k}"]`).value.trim();
    o.kablo_satirlari = window.ICERIK.kablo_satirlari.map((r, i) => {
      const al = (k) => kap.querySelector(`[data-k="${k}"][data-i="${i}"]`);
      const kesit = al("kesit").value.trim();
      const mm = parseFloat(kesit.replace(",", "."));
      const renk = [al("renk0").value.toUpperCase()];
      if (al("iki").checked) renk.push(al("renk1").value.toUpperCase());
      return { kod: al("kod").value.trim(), kesit, mm2: isFinite(mm) ? mm : r.mm2, renk };
    });
    return o;
  }

  function metinlerYaz() {
    metinler.textContent = "";
    const bolumler = [["ortak", "Şirket ve kablo tablosu"], ...Motor.TEMEL_DILLER.map((d) => [d, `${d} · ${U.dilAdi(d)}`]),
      ...Ayarlar.ekDiller().map((d) => [d, `${d} · ${U.dilAdi(d)}${window.ICERIK[d] ? "" : " (taslak)"}`])];
    if (s.taslak && !bolumler.some((b) => b[0] === s.taslak.dil)) bolumler.push([s.taslak.dil, `${s.taslak.dil} · ${U.dilAdi(s.taslak.dil)} (yeni)`]);
    if (!bolumler.some((b) => b[0] === s.bolum)) s.bolum = "ortak";
    const sec = el("select", { "aria-label": "Bölüm", style: { width: "auto", minWidth: "220px" } }, ...bolumler.map(([k, ad]) => el("option", { value: k, metin: ad })));
    sec.value = s.bolum;
    sec.addEventListener("change", () => { s.bolum = sec.value; metinlerYaz(); });
    const kap = el("div", { class: "alanlar" });
    const ek = !Motor.TEMEL_DILLER.includes(s.bolum) && s.bolum !== "ortak";
    let aciklama = "Kapak, Safety Regulations ve Cable Color Coding sayfalarına basılan metinler. Değişiklik bütün yeni PDF'lere uygulanır.";
    if (s.bolum === "ortak") ortakKur(kap);
    else {
      const ornek = window.ICERIK.EN || Ayarlar.VARSAYILAN.EN;
      let deger = window.ICERIK[s.bolum] || Ayarlar.icerikKaydi(s.bolum);
      if (s.taslak && s.taslak.dil === s.bolum) { deger = s.taslak.deger; aciklama = "Metinleri bu dile çevirip kaydedin; boş alanlar kaydı engeller. Gri yazılar İngilizce örnektir. Şema terimlerinin bu dildeki karşılıkları Eksik listesinden yazılır."; }
      // Gri örnek yazılar İngilizce metindir; ek dilde boş kutu neyin çevrileceğini gösterir
      alanlarKur(ornek, deger, "", kap);
    }
    const hata = el("p", { style: { margin: 0, color: "var(--kirmizi-k)", fontWeight: 600 }, hidden: true });
    const kaydet = el("button", { class: "dugme ana", type: "button", metin: ek && !window.ICERIK[s.bolum] ? "Kaydet ve dili etkinleştir" : "Kaydet" });
    kaydet.addEventListener("click", async () => {
      hata.hidden = true;
      try {
        if (s.bolum === "ortak") await Ayarlar.icerikYaz("ortak", ortakOku(kap));
        else {
          const v = alanlariOku(Ayarlar.VARSAYILAN.EN, kap, "");
          await Ayarlar.icerikYaz(s.bolum, v);
          if (ek && !Ayarlar.ekDiller().includes(s.bolum)) await Ayarlar.dilEkle(s.bolum);
          if (s.taslak && s.taslak.dil === s.bolum) s.taslak = null;
        }
        U.durum("Ön sayfa metinleri kaydedildi.", "tamam");
        metinlerYaz();
      } catch (e) { hata.textContent = e.message; hata.hidden = false; }
    });
    const dugmeler = [kaydet];
    if (Ayarlar.degistirildiMi(s.bolum) && (s.bolum === "ortak" || Motor.TEMEL_DILLER.includes(s.bolum))) {
      dugmeler.push(el("button", { class: "dugme", type: "button", metin: "Varsayılana dön", onclick: async () => {
        const c = await U.soru({ baslik: "Varsayılana dön", metin: "Bu bölümdeki değişiklikleriniz silinip uygulamayla gelen metinler geri yüklensin mi?", dugmeler: [{ yazi: "Vazgeç", deger: false }, { yazi: "Varsayılana dön", deger: true, ana: true }] });
        if (c) { await Ayarlar.icerikYaz(s.bolum, null); metinlerYaz(); U.durum("Varsayılan metinler geri yüklendi.", "tamam"); }
      } }));
    }
    if (s.bolum !== "ortak" && window.ICERIK[s.bolum]) dugmeler.push(el("button", { class: "dugme sade", type: "button", metin: "Tasarımlarda gör", onclick: () => U.sekmeAc("tasarimlar") }));
    metinler.append(el("div", { class: "satir", style: { justifyContent: "space-between" } }, el("h3", { metin: "Ön sayfa metinleri" }), sec),
      el("p", { metin: aciklama }), kap, hata, el("div", { class: "satir" }, ...dugmeler));
  }

  // ---------------------------------------------------------------- yedek ve sürüm
  function yedekYaz() {
    yedek.textContent = "";
    const h = Hafiza.durum();
    yedek.append(el("h3", { metin: "Kütüphane ve yedek" }),
      el("p", { metin: `${h.sayi} terim kütüphanede${h.onaysiz ? `, ${h.onaysiz} terim onay bekliyor` : ""}. Kütüphane programla gelir; sizin yazdığınız karşılıklar ${h.depo === "bulut" ? "ELECTRICX veritabanına eklenir, her değişiklik GitHub deposunun geçmişinde durur" : "şimdilik yalnızca bu tarayıcıda, veritabanına bağlanınca taşınır"}.` }),
      h.hata ? el("p", { style: { color: "var(--kirmizi-k)" }, metin: h.hata }) : "",
      el("div", { class: "satir" },
        el("button", { class: "dugme", type: "button", metin: "Eklenen terimleri JSON olarak indir", onclick: async () => {
          try { await Bulut.kaydet(`ceviri-hafizasi ${U.bugun()}.json`, Hafiza.disaAktar()); U.durum("Yedek indirildi.", "tamam"); }
          catch (e) { if (!(e && e.code === "declined")) U.durum("İndirilemedi: " + ((e && e.message) || e), "hata"); }
        } }),
        el("button", { class: "dugme sade", type: "button", metin: "Terimler sekmesi", onclick: () => U.sekmeAc("terimler") })));
  }
  function surumYaz() {
    surum.textContent = "";
    const S = window.SURUM || {};
    surum.append(el("h3", { metin: "Sürüm" }),
      el("p", {}, S.commit && S.commit !== "yerel" ? `Yayın: ${S.commit.slice(0, 7)}${S.tarih ? " · " + U.tarihYaz(S.tarih) : ""}` : "ELECTRICX yerel kopyası"),
      el("p", { metin: hal.db ? "Eklenen terimler, ayarlar ve arşiv ELECTRICX veritabanında." : "Veritabanı bağlantısı yok: eklenen terimler ve ayarlar bu tarayıcıda." }));
  }

  function yaz() {
    if (hal.sekme !== "ayarlar") return;
    dillerYaz();
    metinlerYaz();
    yedekYaz();
    surumYaz();
  }

  olay.on("sekme", (x) => { if (x === "ayarlar") yaz(); });
  olay.on("ayarlar", () => {
    if (hal.sekme !== "ayarlar") return;
    const odak = document.activeElement;
    if (odak && kok.contains(odak) && /INPUT|TEXTAREA|SELECT/.test(odak.tagName)) { dillerYaz(); return; }
    yaz();
  });
  U.ayarlarSekme = { yaz };
})();
