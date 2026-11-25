// Arşiv: kaydedilen her çıktı ve kaynak PDF dosya deposuna yüklenir, kaydı veritabanında tutulur.
// Kaynak PDF aynıysa bir kez saklanır (SHA-256). Dosyalar başka cihaza ilk açılışta iner.
(function () {
  "use strict";
  const { $, el, hal, olay } = U;
  const kok = $("arsiv");
  const AZAMI = 20 * 1024 * 1024;
  const a = { kayitlar: [], hazir: false, kullanim: null, ara: "" };

  const ozet = el("div", { class: "ozetler" });
  const olcer = el("div", { class: "olcer", title: "Dosya deposu kullanımı" }, el("i", { style: { width: "0%" } }));
  const ara = el("input", { type: "search", placeholder: "Dosya veya kapak adı ara", autocomplete: "off", "aria-label": "Arşivde ara" });
  ara.addEventListener("input", () => { a.ara = ara.value; yaz(); });
  const liste = el("div", { class: "liste" });
  const bilgi = el("p", { class: "not" });
  kok.append(
    el("div", { class: "panel-ust" }, el("h2", { metin: "Arşiv" }), ozet, el("span", { class: "bosluk" }), olcer),
    el("div", { class: "filtre" }, ara),
    liste, bilgi);

  const etkin = () => !!(hal.db && hal.assets);

  async function sha256(bayt) {
    const h = await crypto.subtle.digest("SHA-256", bayt);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Çıktıyı arşive ekler. sec: {kaynakDosya: File, kaynakBayt, ad, cikti: U.ciktiUret sonucu}
   */
  async function ekle(sec) {
    if (!etkin()) return null;
    const { db, assets } = { db: hal.db, assets: hal.assets };
    const ciktilar = [];
    for (const d of sec.cikti.dosyalar) {
      if (d.bayt.length > AZAMI) { ciktilar.push({ ad: d.ad, id: null, boyut: d.bayt.length, buyuk: true }); continue; }
      const r = await assets.upload(new Blob([d.bayt], { type: "application/pdf" }), { type: "application/pdf" });
      ciktilar.push({ ad: d.ad, id: r.id, boyut: r.sizeBytes });
    }
    let kaynakSha = null, kaynakId = null;
    if (sec.kaynakBayt && sec.kaynakBayt.length <= AZAMI) {
      kaynakSha = await sha256(sec.kaynakBayt);
      const k = await db.doc(`kaynaklar/${kaynakSha}`).get();
      if (k.exists && k.data().id) kaynakId = k.data().id;
      else {
        const r = await assets.upload(new Blob([sec.kaynakBayt], { type: "application/pdf" }), { type: "application/pdf" });
        kaynakId = r.id;
        await db.doc(`kaynaklar/${kaynakSha}`).set({ id: r.id, ad: sec.kaynakDosya.name, boyut: r.sizeBytes });
      }
    }
    const kayit = {
      olusturma: new Date().toISOString(), kaynakAdi: sec.kaynakDosya.name, kaynakSha, kaynakId, ad: sec.ad || "", tarih: $("tarih").value,
      diller: sec.cikti.diller, sayfa: sec.cikti.sayfa, ciktilar, tasarim: Tasarim.secimOku(),
    };
    if (hal.kullanici && hal.kullanici.id) kayit.kim = hal.kullanici.id;
    await db.collection("arsiv").add(kayit);
    kullanimYenile();
    return kayit;
  }

  async function indir(k) {
    const var_ = k.ciktilar.filter((c) => c.id);
    if (!var_.length) { U.durum("Bu kaydın çıktısı arşivde yok (20 MB'den büyüktü).", "uyari"); return; }
    U.durum("İndiriliyor", "", { donen: true });
    try {
      const dosyalar = [];
      for (const c of var_) {
        dosyalar.push({ ad: c.ad, bayt: await Bulut.dosyaAl(c.id) });
      }
      if (dosyalar.length === 1) await Bulut.kaydet(dosyalar[0].ad, dosyalar[0].bayt);
      else await Bulut.kaydet(dosyalar[0].ad.replace(/ \([A-Z]{2}\)\.pdf$/i, ".zip").replace(/\.pdf$/i, ".zip"), Zip.olustur(dosyalar));
      U.durum("İndirildi.", "tamam");
    } catch (e) {
      if (e && e.code === "declined") U.durum("İndirme iptal edildi.");
      else U.durum("İndirilemedi: " + ((e && e.message) || e), "hata");
    }
  }

  async function kaynagiAc(k) {
    if (!k.kaynakId) { U.durum("Bu kaydın kaynak PDF'i arşivde yok.", "uyari"); return; }
    U.durum("Kaynak PDF açılıyor", "", { donen: true });
    try {
      const bayt = await Bulut.dosyaAl(k.kaynakId);
      const f = new File([bayt], k.kaynakAdi, { type: "application/pdf" });
      if (k.tasarim) { Tasarim.secimYaz(k.tasarim); Ayarlar.tasarimYaz(Tasarim.secimOku()); }
      await U.belgeAc(f, { bayt, ad: k.ad, tarih: k.tarih, diller: k.diller });
      U.sekmeAc("onizleme");
    } catch (e) {
      U.durum("Kaynak açılamadı: " + ((e && e.message) || e), "hata");
    }
  }

  async function sil(k) {
    const c = await U.soru({ baslik: "Arşiv kaydını sil", metin: `${k.ciktilar.map((x) => x.ad).join(", ")} arşivden kalıcı olarak silinsin mi? Bu geri alınamaz.`, dugmeler: [{ yazi: "Vazgeç", deger: false }, { yazi: "Sil", deger: true, ana: true }] });
    if (!c) return;
    try {
      for (const x of k.ciktilar) if (x.id) await hal.assets.delete(x.id);
      await hal.db.doc(`arsiv/${k.belgeId}`).delete();
      // Kaynağı başka kayıt kullanmıyorsa o da silinir
      if (k.kaynakSha && !a.kayitlar.some((y) => y.belgeId !== k.belgeId && y.kaynakSha === k.kaynakSha)) {
        if (k.kaynakId) await hal.assets.delete(k.kaynakId);
        await hal.db.doc(`kaynaklar/${k.kaynakSha}`).delete();
      }
      U.durum("Arşiv kaydı silindi.", "tamam");
      kullanimYenile();
    } catch (e) {
      U.durum("Silinemedi: " + ((e && e.message) || e.code || e), "hata");
    }
  }

  async function kullanimYenile() {
    if (!hal.assets) return;
    try {
      const r = await hal.assets.list();
      a.kullanim = r.usage;
      yaz();
    } catch (e) { /* ölçer boş kalır */ }
  }

  let yazNo = 0;
  async function yaz() {
    if (hal.sekme !== "arsiv") return;
    const no = ++yazNo;
    ozet.textContent = "";
    liste.textContent = "";
    if (!etkin()) {
      olcer.hidden = true;
      liste.hidden = true;
      bilgi.textContent = "Arşiv için veritabanı bağlantısı gerekir: ana ekrandan bağlanın.";
      return;
    }
    liste.hidden = false;
    bilgi.textContent = "Kaydet ile üretilen her PDF ve kaynağı burada saklanır (dosya başına en çok 20 MB). Kaynağı aç ile PDF güncel hafızayla yeniden üretilebilir.";
    const u = a.kullanim;
    olcer.hidden = !u;
    if (u && u.maxBytes) {
      olcer.firstChild.style.width = Math.min(100, (u.bytes / u.maxBytes) * 100) + "%";
      olcer.title = `Dosya deposu: ${U.boyutYaz(u.bytes)} / ${U.boyutYaz(u.maxBytes)}, ${u.files} dosya`;
    }
    const q = Hafiza.anahtar(a.ara || "");
    const gorunen = a.kayitlar.filter((k) => !q || Hafiza.anahtar([k.kaynakAdi, k.ad, ...k.ciktilar.map((c) => c.ad)].join(" ")).includes(q));
    ozet.append(el("span", {}, el("b", { metin: a.kayitlar.length }), " kayıt"));
    if (u) ozet.append(el("span", { metin: `${U.boyutYaz(u.bytes)} kullanılıyor` }));
    if (!a.hazir) { liste.appendChild(el("div", { class: "bos-satir", metin: "Arşiv yükleniyor…" })); return; }
    if (!gorunen.length) { liste.appendChild(el("div", { class: "bos-satir", metin: a.kayitlar.length ? "Eşleşen kayıt yok." : "Arşiv boş. Kaydet ile ürettiğiniz PDF'ler burada birikir." })); return; }
    const adlar = await Bulut.adlar([...new Set(gorunen.map((k) => k.kim).filter(Boolean))]);
    if (no !== yazNo) return; // bu arada daha yeni bir çizim başladı
    for (const k of gorunen.slice(0, 300)) {
      const boyut = k.ciktilar.reduce((s, c) => s + (c.boyut || 0), 0);
      liste.appendChild(el("div", { class: "liste-satir" },
        el("div", { class: "ad" }, k.ciktilar.length === 1 ? k.ciktilar[0].ad : `${k.ciktilar.length} dosya: ${k.ciktilar.map((c) => c.ad).join(", ")}`, el("small", { metin: `Kaynak: ${k.kaynakAdi}` })),
        el("div", { style: { fontSize: "13px" } }, U.tarihYaz(k.olusturma), el("small", { metin: [k.kim ? adlar[k.kim] || "" : "", (k.diller || []).join(", ")].filter(Boolean).join(" · ") })),
        el("div", { style: { fontSize: "13px", color: "var(--soluk)" }, metin: `${k.sayfa || "?"} sayfa · ${U.boyutYaz(boyut)}` }),
        el("div", { class: "islem" },
          el("button", { class: "dugme kucuk", type: "button", metin: "İndir", onclick: () => indir(k) }),
          el("button", { class: "dugme kucuk", type: "button", disabled: !k.kaynakId, metin: "Kaynağı aç", onclick: () => kaynagiAc(k) }),
          el("button", { class: "dugme kucuk sade tehlike", type: "button", metin: "Sil", onclick: () => sil(k) }))));
    }
  }

  /** Veritabanı hazır olunca arşiv dinlenir. */
  function baglan() {
    if (!hal.db) return;
    hal.db.collection("arsiv").orderBy("olusturma", "desc").limit(300).onSnapshot((s) => {
      a.kayitlar = s.docs.map((d) => Object.assign({ belgeId: d.id }, d.data()));
      if (!s.metadata.fromCache) a.hazir = true;
      yaz();
    }, () => { a.hazir = true; yaz(); });
  }

  function secimiYansit() {
    const e = etkin();
    $("arsiveEkle").disabled = !e;
    $("arsivSecim").style.opacity = e ? "" : ".55";
    $("arsivNot").textContent = e ? "Çıktı ve kaynak PDF, Arşiv sekmesinden yeniden indirilebilir" : "Arşiv için veritabanı bağlantısı gerekir";
  }

  olay.on("sekme", (s) => { if (s === "arsiv") { yaz(); kullanimYenile(); } });
  olay.on("bulut", () => { secimiYansit(); baglan(); });
  secimiYansit();
  U.arsiv = { etkin, ekle, yaz };
})();
