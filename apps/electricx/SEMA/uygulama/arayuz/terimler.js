// Terimler sekmesi: kütüphanedeki ve belgedeki terimler, onay, toplu işlemler, içe/dışa aktarma (JSON, CSV, Excel)
// ve kütüphanenin çıktısı (Türkçe – İngilizce – Almanca: yazdır / PDF, Excel).
(function () {
  "use strict";
  const { $, el, hal, olay } = U;
  const kok = $("terimler");
  const t = { kapsam: "hafiza", ara: "", sinir: 600 };
  const KAYNAK_AD = { claude: "Claude (eski)", elle: "Elle", sozluk: "Kütüphane", "ice-aktarma": "İçe aktarma", otomatik: "Sabit sözcük" };
  const yt = (s) => (String(s).match(/\{\d+\}/g) || []).sort().join(",");
  /** Sıralama ve harf grupları için baştaki yer tutucu, rakam ve işaretler atlanır: "{0} BARA" → "BARA" */
  const siraAnahtari = (s) => String(s).replace(/^[^\p{L}]+/u, "") || String(s);
  const alfabetik = (a, b) => siraAnahtari(a).localeCompare(siraAnahtari(b), "tr") || a.localeCompare(b, "tr");

  // ---------------------------------------------------------------- iskelet
  const ozet = el("div", { class: "ozetler" });
  const iceSec = el("input", { type: "file", accept: ".json,.csv,.txt,.tsv,.xlsx,.xls,.xlsm,.ods,application/json,text/csv", hidden: true });
  const disaMenu = el("div", { class: "menu", hidden: true, style: { right: "0", width: "230px" } },
    el("h4", { metin: "Sizin eklediğiniz terimler" }),
    el("button", { class: "dugme kucuk", type: "button", metin: "JSON (yedek, geri yüklenebilir)", onclick: () => disaAktar("json") }),
    el("button", { class: "dugme kucuk", type: "button", metin: "CSV (Excel'de açılır)", onclick: () => disaAktar("csv") }),
    el("h4", { metin: "Bütün kütüphane" }),
    el("button", { class: "dugme kucuk", type: "button", metin: "Çıktı al: yazdır, PDF, Excel", onclick: () => { disaMenu.hidden = true; ciktiPenceresi(); } }));
  const disaDugme = el("button", { class: "dugme", type: "button", "aria-haspopup": "true", metin: "Dışa aktar ▾", onclick: (e) => { e.stopPropagation(); disaMenu.hidden = !disaMenu.hidden; } });
  document.addEventListener("click", (e) => { if (!disaMenu.hidden && !disaMenu.contains(e.target)) disaMenu.hidden = true; });

  const kapsamlar = el("div", { class: "secmeli", id: "kapsam" });
  const KAPSAM = [["hafiza", "Kütüphane"], ["belge", "Bu belge"], ["eksik", "Eksikler"], ["onay", "Onay bekleyenler"], ["silinen", "Silinenler"]];
  for (const [k, ad] of KAPSAM) kapsamlar.appendChild(el("button", { type: "button", dataset: { kapsam: k }, "aria-pressed": k === t.kapsam ? "true" : "false", metin: ad }));
  kapsamlar.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-kapsam]");
    if (!b) return;
    t.kapsam = b.dataset.kapsam;
    t.sinir = 600;
    kapsamlar.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    yaz();
  });
  const ara = el("input", { type: "search", id: "ara", placeholder: "Terim ara (Türkçe veya çeviri)", autocomplete: "off", spellcheck: "false", "aria-label": "Terim ara" });
  let araZaman = null;
  ara.addEventListener("input", () => { clearTimeout(araZaman); araZaman = setTimeout(() => { t.ara = ara.value; t.sinir = 600; yaz(); }, 150); });
  const topluOnay = el("button", { class: "dugme kucuk", type: "button", hidden: true, onclick: () => topluOnayla() });
  const geriDugme = el("button", { class: "dugme", type: "button", id: "geriAl", metin: "↶ Geri al", onclick: () => U.sonIslemiGeriAl() });
  function geriYaz() {
    const son = Hafiza.sonIslem();
    geriDugme.disabled = !son;
    geriDugme.title = son ? `Geri al (Ctrl+Z): ${son}` : "Geri alınacak değişiklik yok (Ctrl+Z)";
    const n = Hafiza.silinenler().length;
    const sb = kapsamlar.querySelector('button[data-kapsam="silinen"]');
    sb.textContent = n ? `Silinenler (${n})` : "Silinenler";
  }
  Hafiza.dinle(geriYaz);

  const thead = el("thead");
  const tbody = el("tbody", { id: "terimSatir" });
  const devami = el("div", { class: "devami", hidden: true }, el("button", { class: "dugme", type: "button", metin: "Daha fazla göster", onclick: () => { t.sinir += 400; yaz(); } }));
  kok.append(
    el("div", { class: "panel-ust" }, el("h2", { metin: "Terimler" }), ozet, el("span", { class: "bosluk" }),
      geriDugme,
      el("button", { class: "dugme", type: "button", id: "csvIndir", metin: "CSV indir", title: "Listedeki terimleri Türkçe, İngilizce, Almanca ve boş bir yorum sütunuyla CSV olarak indirir (müşteriye kontrol için)", onclick: () => csvIndir() }),
      el("button", { class: "dugme ana", type: "button", id: "ciktiAl", metin: "Çıktı al", title: "Kütüphaneyi Türkçe – İngilizce – Almanca olarak yazdırın, PDF ya da Excel olarak kaydedin", onclick: () => ciktiPenceresi() }),
      el("button", { class: "dugme", type: "button", metin: "İçe aktar", title: "JSON, CSV veya Excel", onclick: () => iceSec.click() }),
      el("div", { style: { position: "relative" } }, disaDugme, disaMenu), iceSec),
    el("div", { class: "filtre" }, kapsamlar, ara, topluOnay),
    el("div", { class: "tablo-kap" }, el("table", {}, thead, tbody)),
    devami,
    el("p", { class: "not" },
      "Bir karşılığı kutuda yazıp ya da düzeltip başka yere tıklamak yeterlidir; yazdığınız karşılık kütüphaneye eklenir ve PDF kendiliğinden yenilenir. ",
      "Her değişiklik ", el("b", { metin: "Geri al" }), " düğmesiyle ya da ", el("kbd", { metin: "Ctrl+Z" }), " ile geri alınır; silinen terimler ", el("b", { metin: "Silinenler" }), "'den geri getirilir. ",
      el("b", { metin: "Onay bekliyor" }), " işaretli eski çevirileri kontrol edip ✓ ile onaylayın. ",
      el("b", { metin: "sabit" }), " türü çevrilmez (marka, kişi, kısaltma). ", el("code", { metin: "{0}" }), " gibi yer tutucular cihaz kodu ve numaraların yeridir, çeviride aynen kalmalıdır."));

  // ---------------------------------------------------------------- satırlar
  function satirlar() {
    t.ara = ara.value; // arama gecikmeli yazılır; indirme ve çıktı kutudaki güncel aramayı kullanır
    const belge = new Map();
    if (hal.kaynak && hal.kaynak.tarama) for (const x of Ceviri.terimler(hal.kaynak)) belge.set(Hafiza.anahtar(x.sablon), x);
    let liste;
    if (t.kapsam === "hafiza") {
      liste = Hafiza.hepsi().map((k) => {
        const b = belge.get(Hafiza.anahtar(k.sablon));
        return { sablon: k.sablon, kayit: k, adet: b ? b.adet : 0, sayfalar: b ? b.sayfalar : null, terim: b || null };
      });
    } else {
      liste = [...belge.values()].map((x) => ({ sablon: x.sablon, kayit: x.kayit || Hafiza.bul(x.sablon), adet: x.adet, sayfalar: x.sayfalar, tur: x.tur, otomatik: x.otomatik, terim: x }));
    }
    const diller = U.cevrilenDiller().length ? U.cevrilenDiller() : U.tabloDilleri();
    const eksikMi = (x) => !x.kayit ? !x.otomatik : x.kayit.tur === "cevir" && diller.some((d) => !x.kayit[d]);
    const bekliyorMu = (x) => x.kayit && x.kayit.onaysiz && x.kayit.onaysiz.length > 0;
    if (t.kapsam === "eksik") liste = liste.filter(eksikMi);
    if (t.kapsam === "onay") {
      // Bu belge açıksa belgedekiler, değilse bütün hafıza
      if (!belge.size) liste = Hafiza.hepsi().map((k) => ({ sablon: k.sablon, kayit: k, adet: 0 }));
      liste = liste.filter(bekliyorMu);
    }
    const q = Hafiza.anahtar(t.ara || "");
    if (q) liste = liste.filter((x) => Hafiza.anahtar(x.sablon).includes(q) || (x.kayit && Hafiza.dilleri(x.kayit).some((d) => Hafiza.anahtar(x.kayit[d] || "").includes(q))));
    // Eksikler, onay bekleyenler, çevrilenler, en sonda çevrilmeyenler (sabit); her biri alfabetik
    const sira = (x) => (eksikMi(x) ? 0 : bekliyorMu(x) ? 1 : x.kayit && x.kayit.tur === "sabit" ? 3 : 2);
    liste.sort((a, b) => sira(a) - sira(b) || alfabetik(a.sablon, b.sablon));
    return { liste, eksikMi, bekliyorMu };
  }

  function gosterilenDiller() {
    const sec = U.cevrilenDiller();
    const tum = U.tabloDilleri();
    return [...new Set(sec.concat(tum))];
  }

  function yaz() {
    if (hal.sekme !== "terimler") return;
    geriYaz();
    $("csvIndir").disabled = t.kapsam === "silinen";
    if (t.kapsam === "silinen") { silinenleriYaz(); return; }
    const diller = gosterilenDiller();
    const { liste, eksikMi, bekliyorMu } = satirlar();
    // Özet
    ozet.textContent = "";
    const ekle = (etk, n) => ozet.appendChild(el("span", {}, el("b", { metin: n }), " " + etk));
    if (hal.kaynak && hal.kaynak.tarama) {
      const tl = Ceviri.terimler(hal.kaynak);
      ekle("terim bu belgede", tl.length);
      ekle("eksik", Ceviri.eksikler(hal.kaynak, U.cevrilenDiller()).length);
      ekle("onay bekliyor", Ceviri.onaysizlar(hal.kaynak, U.cevrilenDiller()).length);
    }
    const tum = Hafiza.hepsi();
    const cevrilen = tum.filter((k) => k.tur === "cevir").length;
    ekle("çevrilen terim", cevrilen);
    ekle("çevrilmeyen kod / marka", tum.length - cevrilen);
    // Başlık
    thead.replaceChildren(el("tr", {}, el("th", { metin: "Türkçe" }), el("th", { metin: "Tür" }), ...diller.map((d) => el("th", { metin: d, title: U.dilAdi(d) })),
      el("th", { metin: "Durum" }), el("th", { metin: "Kaynak" }), el("th", { metin: "Adet" }), el("th", {}, el("span", { class: "gorunmez", metin: "İşlem" }))));
    tbody.textContent = "";
    const bekleyen = liste.filter(bekliyorMu);
    topluOnay.hidden = !bekleyen.length;
    topluOnay.textContent = `Listedeki ${bekleyen.length} terimi onayla`;
    if (!liste.length) {
      const mesaj = !hal.kaynak && t.kapsam !== "hafiza" ? "PDF açınca belgedeki terimler burada listelenir. Kütüphanedeki bütün terimler için Kütüphane'yi seçin."
        : t.kapsam === "eksik" ? "Eksik terim yok: bu belgedeki her etiketin seçili dillerde karşılığı var."
        : t.kapsam === "onay" ? "Onay bekleyen terim yok." : "Eşleşen terim yok.";
      tbody.appendChild(el("tr", {}, el("td", { colSpan: diller.length + 6, class: "bos-satir", metin: mesaj })));
      devami.hidden = true;
      return;
    }
    const parca = document.createDocumentFragment();
    for (const x of liste.slice(0, t.sinir)) parca.appendChild(satirKur(x, diller, eksikMi(x), bekliyorMu(x)));
    tbody.appendChild(parca);
    devami.hidden = liste.length <= t.sinir;
  }

  function satirKur(x, diller, eksik, bekliyor) {
    const k = x.kayit || (x.otomatik ? { tur: "sabit", kaynak: "otomatik" } : null);
    const tr = el("tr", { dataset: { sablon: x.sablon }, class: eksik ? "eksik" : bekliyor ? "bekliyor" : "" });
    const td = (s) => { const c = el("td", { class: s || "" }); tr.appendChild(c); return c; };
    const a = td("tr");
    a.append(x.sablon);
    if (x.sayfalar && x.sayfalar.size) {
      const ss = [...x.sayfalar].sort((p, q) => p - q);
      a.appendChild(el("small", { metin: "Sayfa " + ss.slice(0, 8).join(", ") + (ss.length > 8 ? "…" : "") }));
    }
    const tur = el("select", { "aria-label": "Tür" }, el("option", { value: "cevir", metin: "çevir" }), el("option", { value: "sabit", metin: "sabit" }));
    tur.value = k && k.tur === "sabit" ? "sabit" : "cevir";
    td().appendChild(tur);
    for (const d of diller) {
      const i = el("input", { type: "text", spellcheck: "false", autocomplete: "off", "aria-label": `${x.sablon} ${d}`, dataset: { dil: d } });
      i.value = k && k.tur === "cevir" ? k[d] || "" : "";
      if (i.value) i.title = i.value;
      i.placeholder = k && k.tur === "sabit" ? "çevrilmez" : d;
      i.disabled = tur.value === "sabit";
      if (k && k.onaysiz && k.onaysiz.includes(d) && k[d]) { i.classList.add("onaysiz"); i.title = "Onay bekliyor"; }
      td("dil").appendChild(i);
    }
    const dc = td();
    dc.appendChild(el("span", { class: "etk " + (eksik ? "eksik" : bekliyor ? "bekliyor" : "onayli"), metin: eksik ? "Eksik" : bekliyor ? "Onay bekliyor" : k && k.tur === "sabit" ? "Sabit" : "Onaylı" }));
    td().appendChild(el("span", { class: "etk " + (!k ? "eksik" : k.kaynak === "claude" ? "claude" : k.kaynak === "sozluk" || k.kaynak === "otomatik" ? "sozluk" : "elle"), metin: k ? KAYNAK_AD[k.kaynak] || "Elle" : "—" }));
    td("sayi").textContent = x.adet || "";
    const is = td("islem");
    if (bekliyor) is.appendChild(el("button", { class: "ikon onay", type: "button", title: "Onayla", "aria-label": `${x.sablon} onayla`, metin: "✓", dataset: { is: "onay" } }));
    // Tablodan silinmez (yanlışlıkla silinmesin); gerekirse Düzenle penceresinden
    is.appendChild(el("button", { class: "ikon", type: "button", title: "Düzenle, geçmiş", metin: "Düzenle", dataset: { is: "duzenle" } }));
    return tr;
  }

  /** Silinen terimler: önceki karşılıklarıyla, Geri getir düğmesiyle. */
  function silinenleriYaz() {
    const diller = gosterilenDiller();
    const q = Hafiza.anahtar(t.ara || "");
    const liste = Hafiza.silinenler().filter((x) => !q || Hafiza.anahtar(x.sablon).includes(q));
    ozet.textContent = "";
    ozet.appendChild(el("span", {}, el("b", { metin: liste.length }), " silinen terim"));
    topluOnay.hidden = true;
    devami.hidden = true;
    thead.replaceChildren(el("tr", {}, el("th", { metin: "Türkçe" }), ...diller.map((d) => el("th", { metin: d, title: U.dilAdi(d) })),
      el("th", { metin: "Silindi" }), el("th", {}, el("span", { class: "gorunmez", metin: "İşlem" }))));
    tbody.textContent = "";
    if (!liste.length) {
      tbody.appendChild(el("tr", {}, el("td", { colSpan: diller.length + 3, class: "bos-satir", metin: "Silinen terim yok." })));
      return;
    }
    for (const x of liste) {
      // Geri getirilince dönecek karşılık: kullanıcının yazdığı, yoksa programla gelen
      const k = x.onceki || x.sozluk;
      const tr = el("tr", { dataset: { sablon: x.sablon } }, el("td", { class: "tr", metin: x.sablon }),
        ...diller.map((d) => el("td", { class: "dil", metin: !k ? "—" : k.tur === "sabit" ? "çevrilmez" : k[d] || "—" })),
        el("td", {}, el("span", { class: "etk eksik", metin: U.tarihYaz(x.tarih) || "silindi" })),
        el("td", { class: "islem" }, el("button", { class: "dugme kucuk ana", type: "button", metin: "Geri getir", dataset: { is: "getir" } })));
      tbody.appendChild(tr);
    }
  }

  // ---------------------------------------------------------------- düzenleme
  /** Satırdaki değer değişince kütüphaneye yazılır. Elle yazılan dil onaylı sayılır; diğer diller korunur. */
  async function satirKaydet(tr, hedef) {
    const sablon = tr.dataset.sablon;
    const tur = tr.querySelector("select");
    const girisler = [...tr.querySelectorAll("input[data-dil]")];
    girisler.forEach((i) => { i.disabled = tur.value === "sabit"; });
    if (hedef === tur) {
      if (tur.value === "sabit") { await Hafiza.ekle([{ sablon, tur: "sabit" }], "elle"); U.durum(`${sablon}: çevrilmeyecek.`, "tamam"); return; }
      // Çevir'e geçiş: dolu kutular kaydedilir; hiç yoksa kullanıcı yazınca kaydedilir
      if (!girisler.some((i) => i.value.trim())) { girisler[0] && girisler[0].focus(); return; }
    }
    const k = { sablon, tur: "cevir" };
    for (const i of girisler) {
      const v = i.value.replace(/\s+/g, " ").trim();
      if (!v) continue;
      if (yt(v) !== yt(sablon)) {
        U.durum(`"${sablon}" ${i.dataset.dil}: yer tutucular (${yt(sablon) || "yok"}) çeviride aynen olmalı.`, "hata");
        i.focus();
        return;
      }
      k[i.dataset.dil] = v;
    }
    if (!Hafiza.dilleri(k).length) return;
    const eski = Hafiza.bul(sablon);
    const dil = hedef && hedef.dataset && hedef.dataset.dil;
    // Yalnızca değişen dil elle sayılır; diğerleri olduğu gibi kalır
    if (eski && eski.tur === "cevir" && dil) {
      if ((eski[dil] || "") === (k[dil] || "")) return;
      await Hafiza.ekle([{ sablon, tur: "cevir", [dil]: k[dil] }], "elle", { birlestir: true });
    } else {
      await Hafiza.ekle([k], "elle", { birlestir: true });
    }
    U.durum(`Kaydedildi: ${sablon}`, "tamam");
  }
  tbody.addEventListener("change", (e) => { const tr = e.target.closest("tr[data-sablon]"); if (tr) satirKaydet(tr, e.target); });
  tbody.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-is]");
    if (!b) return;
    const s = b.closest("tr[data-sablon]").dataset.sablon;
    if (b.dataset.is === "onay") { await Hafiza.onayla([s]); U.durum(`Onaylandı: ${s}`, "tamam"); }
    else if (b.dataset.is === "duzenle") U.duzenle(s, { dil: U.cevrilenDiller()[0] });
    else if (b.dataset.is === "getir") {
      b.disabled = true;
      await Hafiza.geriGetir(s);
      U.durum(`Geri getirildi: ${s}`, "tamam");
      yaz();
    }
  });

  async function topluOnayla() {
    const { liste, bekliyorMu } = satirlar();
    const b = liste.filter(bekliyorMu).map((x) => x.sablon);
    if (!b.length) return;
    const c = await U.soru({ baslik: "Toplu onay", metin: `Listede görünen ${b.length} terimin bütün dillerdeki çevirisi onaylansın mı? Onaylamadan önce kutulara göz atmanızı öneririm.`, dugmeler: [{ yazi: "Vazgeç", deger: false }, { yazi: `${b.length} terimi onayla`, deger: true, ana: true }] });
    if (!c) return;
    await Hafiza.onayla(b);
    U.durum(`${b.length} terim onaylandı.`, "tamam");
  }

  // ---------------------------------------------------------------- dışa / içe aktarma
  async function disaAktar(bicim) {
    disaMenu.hidden = true;
    try {
      if (bicim === "csv") {
        const kayit = Hafiza.hepsi().filter((k) => k.kaynak !== "sozluk");
        const diller = [...new Set(U.tabloDilleri().concat(...kayit.map((k) => Hafiza.dilleri(k))))];
        await Bulut.kaydet(`ceviri-hafizasi ${U.bugun()}.csv`, Tablo.csvYaz(kayit, diller));
      } else {
        await Bulut.kaydet(`ceviri-hafizasi ${U.bugun()}.json`, Hafiza.disaAktar());
      }
      U.durum("Kütüphane dışa aktarıldı.", "tamam");
    } catch (e) {
      if (!(e && e.code === "declined")) U.durum("Dışa aktarılamadı: " + ((e && e.message) || e), "hata");
    }
  }

  // ---------------------------------------------------------------- CSV (müşteriye kontrol için)
  /** Dil adları müşterinin okuyacağı biçimde (kendi dilinde). */
  const YEREL_AD = { TR: "Türkçe", EN: "English", DE: "Deutsch" };
  const yerelAd = (d) => YEREL_AD[d] || (window.Ayarlar && Ayarlar.DIL_ADLARI[d]) || d;

  /**
   * Listede görünen terimleri (sekme ve aramaya göre) CSV olarak indirir: Türkçe, diller ve boş yorum sütunu.
   * Çevrilmeyen kod ve markalar girmez. Müşteri düzeltip gönderirse İçe aktar ile geri alınır (başlıklar tanınır).
   */
  async function csvIndir() {
    const diller = gosterilenDiller();
    const satir = satirlar().liste
      .filter((x) => !(x.kayit ? x.kayit.tur === "sabit" : x.otomatik))
      .sort((a, b) => alfabetik(a.sablon, b.sablon))
      .map((x) => [x.sablon, ...diller.map((d) => (x.kayit && x.kayit.tur === "cevir" ? x.kayit[d] || "" : "")), ""]);
    if (!satir.length) { U.durum("Listede indirilecek terim yok.", "uyari"); return; }
    const bas = [`${yerelAd("TR")} (TR)`, ...diller.map((d) => `${yerelAd(d)} (${d})`), "Yorum / Comment / Kommentar"];
    const kac = (v) => (/[";\n\r]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const metin = "\uFEFF" + [bas, ...satir].map((r) => r.map(kac).join(";")).join("\r\n") + "\r\n";
    const belgeAdi = hal.dosya ? hal.dosya.name.replace(/\.pdf$/i, "") : "";
    const ek = ["TR", ...diller].join("-");
    const ad = t.kapsam !== "hafiza" && belgeAdi ? `${belgeAdi} terimler ${ek}.csv` : `Terim kütüphanesi ${ek} ${U.bugun()}.csv`;
    try {
      await Bulut.kaydet(ad, metin);
      U.durum(`Kaydedildi: ${ad} (${satir.length} terim). Müşteri düzeltip gönderirse İçe aktar ile alabilirsiniz.`, "tamam");
    } catch (e) {
      if (!(e && e.code === "declined")) U.durum("İndirilemedi: " + ((e && e.message) || e), "hata");
    }
  }

  // ---------------------------------------------------------------- kütüphane çıktısı
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const harfi = (s) => { const h = siraAnahtari(s).charAt(0).toLocaleUpperCase("tr"); return /\p{L}/u.test(h) ? h : "#"; };

  /** Çıktıya girecek terimler. kapsam: "hepsi" (bütün kütüphane) | "liste" (Terimler listesinde görünenler). */
  function ciktiTerimleri(diller, kapsam, sabitDahil) {
    const kayitlar = kapsam === "liste" ? satirlar().liste.map((x) => x.kayit).filter(Boolean) : Hafiza.hepsi();
    const cevir = kayitlar.filter((k) => k.tur === "cevir" && diller.some((d) => k[d]))
      .sort((a, b) => alfabetik(a.sablon, b.sablon));
    const sabit = sabitDahil ? kayitlar.filter((k) => k.tur === "sabit").map((k) => k.sablon).sort(alfabetik) : [];
    return { cevir, sabit };
  }

  function ciktiPenceresi() {
    const hazirDil = U.tabloDilleri();
    const dilSec = {};
    const dilKutu = el("div", { class: "satir", style: { gap: "14px" } });
    for (const d of hazirDil) {
      dilSec[d] = el("input", { type: "checkbox", id: "cikti-" + d, checked: d === "EN" || d === "DE" });
      dilKutu.appendChild(el("label", { class: "secim" }, dilSec[d], el("span", { metin: `${U.dilAdi(d)} (${d})` })));
    }
    const listeSay = satirlar().liste.filter((x) => x.kayit).length;
    const kapsamHepsi = el("input", { type: "radio", name: "ciktiKapsam", id: "ciktiHepsi", checked: true });
    const kapsamListe = el("input", { type: "radio", name: "ciktiKapsam", id: "ciktiListe" });
    const sabitSec = el("input", { type: "checkbox", id: "ciktiSabit" });
    const bilgi = el("p", { style: { margin: 0, color: "var(--soluk)", fontSize: "13px" } });
    const hata = el("p", { style: { margin: 0, color: "var(--kirmizi-k)", fontWeight: 600 }, hidden: true });
    const secim = () => {
      const diller = hazirDil.filter((d) => dilSec[d].checked);
      return { diller, kapsam: kapsamListe.checked ? "liste" : "hepsi", sabit: sabitSec.checked };
    };
    const say = () => {
      const c = secim();
      const r = ciktiTerimleri(c.diller.length ? c.diller : ["EN"], c.kapsam, c.sabit);
      bilgi.textContent = c.diller.length
        ? `${r.cevir.length} terim, ${["Türkçe", ...c.diller.map((d) => U.dilAdi(d))].join(" – ")}${r.sabit.length ? ` ve ${r.sabit.length} çevrilmeyen kod / marka` : ""}.`
        : "En az bir dil seçin.";
    };
    for (const i of [...Object.values(dilSec), kapsamHepsi, kapsamListe, sabitSec]) i.addEventListener("change", say);
    say();
    const calistir = async (bicim) => {
      const c = secim();
      if (!c.diller.length) { hata.textContent = "En az bir dil seçin."; hata.hidden = false; return; }
      const r = ciktiTerimleri(c.diller, c.kapsam, c.sabit);
      if (!r.cevir.length && !r.sabit.length) { hata.textContent = "Çıktıya girecek terim yok."; hata.hidden = false; return; }
      p.kapat();
      try {
        if (bicim === "excel") await excelYaz(r, c.diller);
        else yazdir(r, c.diller);
      } catch (e) {
        if (!(e && e.code === "declined")) U.durum("Çıktı alınamadı: " + ((e && e.message) || e), "hata");
      }
    };
    const p = U.pencere({
      baslik: "Kütüphane çıktısı", alt: "Türkçe terimler ve karşılıkları", genis: 560,
      icerik: el("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
        el("div", { class: "alan" }, el("span", { class: "etiket", metin: "Diller" }), dilKutu),
        el("div", { class: "alan" }, el("span", { class: "etiket", metin: "Terimler" }),
          el("label", { class: "secim" }, kapsamHepsi, el("span", { metin: "Bütün kütüphane" })),
          el("label", { class: "secim" }, kapsamListe, el("span", {}, `Terimler listesinde görünenler (${listeSay})`, el("small", { metin: "Seçili sekme (Kütüphane, Bu belge, Eksikler…) ve arama kutusuna göre." })))),
        el("label", { class: "secim" }, sabitSec, el("span", {}, "Çevrilmeyen kod ve markaları da ekle", el("small", { metin: "PE, OMRON, KBN {0} gibi şemada aynen kalan yazılar; ayrı bir liste olarak en sona eklenir." }))),
        bilgi, hata),
      dugmeler: [
        el("button", { class: "dugme sol", type: "button", metin: "Vazgeç", onclick: () => p.kapat() }),
        el("button", { class: "dugme", type: "button", metin: "Excel olarak indir", onclick: () => calistir("excel") }),
        el("button", { class: "dugme ana", type: "button", metin: "Yazdır / PDF", onclick: () => calistir("yazdir") }),
      ],
    });
  }

  /** Yazdırılacak sayfa: A4, Türkçe ve seçilen diller sütun sütun, harf harf gruplu. */
  function ciktiHtml(r, diller) {
    const ytBoya = (v) => esc(v).replace(/\{\d+\}/g, (m) => `<span class="yt">${m}</span>`);
    const satir = [];
    let harf = null;
    for (const k of r.cevir) {
      const h = harfi(k.sablon);
      if (h !== harf) { harf = h; satir.push(`<tr class="harf"><td colspan="${diller.length + 1}">${esc(h)}</td></tr>`); }
      satir.push(`<tr><td class="tr">${ytBoya(k.sablon)}</td>${diller.map((d) => `<td>${k[d] ? ytBoya(k[d]) : '<span class="yok">—</span>'}</td>`).join("")}</tr>`);
    }
    const dilAd = ["Türkçe", ...diller.map((d) => U.dilAdi(d))].join(" – ");
    const genislik = Math.floor(100 / (diller.length + 1));
    return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Terim kütüphanesi ${esc(["TR", ...diller].join("-"))} ${U.bugun()}</title><style>
@page { size: A4; margin: 14mm 12mm 15mm;
  @bottom-left { content: "ELECTRICX · Şema çeviri kütüphanesi · ${esc(U.tarihYaz(U.bugun()))}"; font: 7.5pt Arial, sans-serif; color: #777; }
  @bottom-right { content: counter(page) " / " counter(pages); font: 7.5pt Arial, sans-serif; color: #777; } }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
body { margin: 0; font: 9.5pt/1.35 "Segoe UI", Arial, sans-serif; color: #111; }
h1 { font-size: 16pt; margin: 0 0 1.5mm; }
.alt { margin: 0 0 5mm; color: #555; font-size: 9pt; }
.cizgi { height: 2.2pt; background: #E30613; margin: 0 0 4mm; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
col { width: ${genislik}%; }
thead th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .05em; color: #444; padding: 0 2mm 1.6mm; border-bottom: 1.2pt solid #111; }
td { padding: 1.2mm 2mm; border-bottom: .5pt solid #ddd; vertical-align: top; overflow-wrap: anywhere; }
tr { break-inside: avoid; }
td.tr { font-weight: 600; }
tr.harf td { padding: 3.2mm 2mm 1mm; border-bottom: 1pt solid #E30613; color: #E30613; font-weight: 700; font-size: 10.5pt; }
tr.harf { break-after: avoid; }
.yt { color: #E30613; font-weight: 600; }
.yok { color: #aaa; }
h2 { font-size: 11pt; margin: 7mm 0 2mm; break-after: avoid; }
.sabit { columns: 3; column-gap: 6mm; font-size: 8.5pt; margin: 0; padding: 0; list-style: none; }
.sabit li { break-inside: avoid; padding: .4mm 0; }
.not { margin-top: 5mm; color: #555; font-size: 8pt; }
</style></head><body>
<h1>Elektrik şeması terim kütüphanesi</h1>
<p class="alt">${esc(dilAd)} · ${r.cevir.length} terim${r.sabit.length ? ` · ${r.sabit.length} çevrilmeyen kod / marka` : ""} · ${esc(U.tarihYaz(U.bugun()))}</p>
<div class="cizgi"></div>
${r.cevir.length ? `<table><colgroup>${'<col>'.repeat(diller.length + 1)}</colgroup><thead><tr><th>Türkçe</th>${diller.map((d) => `<th>${esc(U.dilAdi(d))} (${d})</th>`).join("")}</tr></thead><tbody>${satir.join("")}</tbody></table>` : ""}
${r.sabit.length ? `<h2>Çevrilmeyen kod ve markalar</h2><ul class="sabit">${r.sabit.map((x) => `<li>${ytBoya(x)}</li>`).join("")}</ul>` : ""}
<p class="not"><span class="yt">{0}</span>, <span class="yt">{1}</span>: cihaz kodu veya numaranın yeri; şemadaki kod çeviride aynen kalır. Şemada büyük harfle yazılan etiketler çeviride de büyük harfle basılır.</p>
</body></html>`;
  }

  /** Gizli bir çerçevede yazdırma penceresini açar; "PDF olarak kaydet" de buradan seçilir. */
  function yazdir(r, diller) {
    const eski = document.getElementById("ciktiCerceve");
    if (eski) eski.remove();
    const f = el("iframe", { id: "ciktiCerceve", title: "Kütüphane çıktısı", "aria-hidden": "true", style: { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", visibility: "hidden" } });
    document.body.appendChild(f);
    const d = f.contentDocument;
    d.open();
    d.write(ciktiHtml(r, diller));
    d.close();
    U.durum(`Yazdırma penceresi açıldı: ${r.cevir.length} terim. PDF için yazıcı olarak "PDF olarak kaydet"i seçin.`, "tamam");
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); }, 60);
  }

  async function excelYaz(r, diller) {
    U.durum("Excel hazırlanıyor", "", { donen: true });
    const X = await Tablo.sheetYukle();
    const wb = X.utils.book_new();
    const bas = ["Türkçe", ...diller.map((d) => `${U.dilAdi(d)} (${d})`)];
    const ws = X.utils.aoa_to_sheet([bas, ...r.cevir.map((k) => [k.sablon, ...diller.map((d) => k[d] || "")])]);
    ws["!cols"] = bas.map(() => ({ wch: 46 }));
    ws["!autofilter"] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r.cevir.length, c: diller.length } }) };
    X.utils.book_append_sheet(wb, ws, "Kütüphane");
    if (r.sabit.length) {
      const s2 = X.utils.aoa_to_sheet([["Çevrilmeyen kod ve markalar"], ...r.sabit.map((x) => [x])]);
      s2["!cols"] = [{ wch: 50 }];
      X.utils.book_append_sheet(wb, s2, "Çevrilmeyenler");
    }
    const bayt = new Uint8Array(X.write(wb, { bookType: "xlsx", type: "array" }));
    const ad = `Terim kütüphanesi ${["TR", ...diller].join("-")} ${U.bugun()}.xlsx`;
    await Bulut.kaydet(ad, bayt);
    U.durum(`Kaydedildi: ${ad} (${r.cevir.length} terim)`, "tamam");
  }

  iceSec.addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      if (/\.json$/i.test(f.name)) jsonIceAktar(Hafiza.dosyaOku(await f.text()), f.name);
      else tabloIceAktar(await Tablo.dosyaOku(f), f.name);
    } catch (h) {
      U.durum(`${f.name} okunamadı: ${h.message || "geçerli bir kütüphane, CSV veya Excel dosyası değil"}.`, "hata");
    }
  });

  function ustuneYazSecimi() {
    const i = el("input", { type: "checkbox", id: "iceUstune" });
    return { i, satir: el("label", { class: "secim" }, i, el("span", {}, "Kütüphanede olan terimlerin üzerine yaz", el("small", { metin: "İşaretli değilse kütüphanedeki karşılıklar korunur, yalnızca eksik diller eklenir." }))) };
  }

  function jsonIceAktar(liste, ad) {
    const u = ustuneYazSecimi();
    const p = U.pencere({
      baslik: "Kütüphane dosyasını içe aktar", alt: ad, genis: 520,
      icerik: el("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } }, el("p", { style: { margin: 0 }, metin: `${liste.length} terim bulundu.` }), u.satir),
      dugmeler: [el("button", { class: "dugme", type: "button", metin: "Vazgeç", onclick: () => p.kapat() }),
        el("button", { class: "dugme ana", type: "button", metin: "İçe aktar", onclick: async () => { p.kapat(); await iceAktarBitir(liste, u.i.checked); } })],
    });
  }

  function tabloIceAktar(satir, ad) {
    if (!satir.length) { U.durum(`${ad} boş.`, "hata"); return; }
    const oneri = Tablo.eslesmeOner(satir);
    const sutun = Math.max(...satir.slice(0, 50).map((r) => r.length));
    const kodlar = ["", "TR", "TUR", ...Motor.TEMEL_DILLER.filter((d) => d !== "TR"), ...Motor.EK_DILLER];
    const adlar = { "": "Kullanma", TR: "Türkçe (kaynak)", TUR: "Tür (sabit/çevir)" };
    const secimler = [];
    const basSatir = el("tr");
    for (let i = 0; i < sutun; i++) {
      const s = el("select", { "aria-label": `${i + 1}. sütun` }, ...kodlar.map((k) => el("option", { value: k, metin: adlar[k] || `${k} · ${U.dilAdi(k)}` })));
      s.value = oneri.eslesme[i] || "";
      secimler.push(s);
      basSatir.appendChild(el("th", {}, s));
    }
    const baslikSec = el("input", { type: "checkbox", id: "iceBaslik", checked: oneri.baslikVar });
    const govde = el("tbody");
    const onizle = () => {
      govde.textContent = "";
      const v = baslikSec.checked ? satir.slice(1, 7) : satir.slice(0, 6);
      for (const r of v) govde.appendChild(el("tr", {}, ...Array.from({ length: sutun }, (_, i) => el("td", { metin: r[i] || "" }))));
    };
    baslikSec.addEventListener("change", onizle);
    onizle();
    const u = ustuneYazSecimi();
    const hata = el("p", { style: { margin: 0, color: "var(--kirmizi-k)", fontWeight: 600 }, hidden: true });
    const p = U.pencere({
      baslik: "Tablodan terim aktar", alt: `${ad} · ${satir.length} satır`, genis: 900,
      icerik: el("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
        el("p", { style: { margin: 0, color: "var(--soluk)", fontSize: "13px" }, metin: "Her sütunun hangi dil olduğunu seçin. Türkçe sütunu zorunlu; boş hücreler atlanır. İçe aktarılan terimler onaylı sayılır." }),
        el("label", { class: "secim" }, baslikSec, el("span", { metin: "İlk satır başlık" })),
        el("div", { class: "tablo-kap" }, el("table", { class: "esle-tablo" }, el("thead", {}, basSatir), govde)),
        u.satir, hata),
      dugmeler: [el("button", { class: "dugme", type: "button", metin: "Vazgeç", onclick: () => p.kapat() }),
        el("button", { class: "dugme ana", type: "button", metin: "İçe aktar", onclick: async () => {
          try {
            const es = secimler.map((s) => s.value || null);
            const r = Tablo.terimlereCevir(satir, baslikSec.checked, es);
            if (!r.terimler.length) throw new Error("Aktarılacak terim yok: Türkçe ve en az bir dil sütunu seçin.");
            p.kapat();
            await iceAktarBitir(r.terimler, u.i.checked, r.atlanan);
          } catch (h) { hata.textContent = h.message; hata.hidden = false; }
        } })],
    });
  }

  async function iceAktarBitir(liste, uzerineYaz, atlanan) {
    U.durum(`${liste.length} terim içe aktarılıyor`, "", { donen: true });
    const s = await Hafiza.iceAktar(liste, { uzerineYaz });
    U.durum(`İçe aktarıldı: ${s.eklenen} yeni, ${s.guncellenen} güncellenen${s.atlanan + (atlanan || 0) ? `, ${s.atlanan + (atlanan || 0)} atlanan` : ""}.`, "tamam");
    yaz();
  }

  // ---------------------------------------------------------------- bağlantılar
  olay.on("sekme", (s) => { if (s === "terimler") yaz(); });
  olay.on("hafiza", () => {
    if (hal.sekme !== "terimler") return;
    const odak = document.activeElement;
    if (odak && kok.contains(odak) && (odak.tagName === "INPUT" || odak.tagName === "SELECT")) return;
    yaz();
  });
  olay.on("belge", () => { if (hal.sekme === "terimler") yaz(); });
  olay.on("diller", () => { if (hal.sekme === "terimler") yaz(); });
  olay.on("onaylariGoster", () => {
    t.kapsam = "onay";
    kapsamlar.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x.dataset.kapsam === "onay"));
    U.sekmeAc("terimler");
  });

  U.terimler = { yaz, ciktiHtml, ciktiTerimleri, csvIndir };
})();
