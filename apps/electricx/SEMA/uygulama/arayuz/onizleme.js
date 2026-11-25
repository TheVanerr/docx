// Önizleme: pdf.js ile sayfaları çizer, şema sayfalarının üstüne sorun işaretlerini koyar. Sağdaki panelin başında
// kütüphanede karşılığı olmayan terimler (Eksik) durur: tıklanınca terim düzenleyici açılır, yazılan karşılık kütüphaneye
// eklenir. Altında diğer kontroller (küçültülen, fontta olmayan, onay bekleyen) sayfa sayfa listelenir.
// Değişmeyen sayfaların tuvali yeniden kullanılır (imza aynıysa yeniden çizilmez); ekrandan uzak sayfaların tuvali
// bellekte tutulmaz, böylece 100+ sayfalık PDF'ler de rahat gezilir.
(function () {
  "use strict";
  const { $, el, hal, olay, depo } = U;
  const pdfjs = window.pdfjsLib;
  if (pdfjs) pdfjs.GlobalWorkerOptions.workerSrc = "uygulama/pdf.worker.min.js";

  const TURLER = {
    eksik: { ad: "Çevrilmedi", aciklama: "Kütüphanede karşılığı yok; kaynak dilde kaldı" },
    onaysiz: { ad: "Onay bekliyor", aciklama: "Eski çeviri, henüz onaylanmadı" },
    kucuk: { ad: "Küçültüldü", aciklama: "Dar alana sığması için yazı küçültüldü" },
    fontYok: { ad: "Fontta yok", aciklama: "Çevirideki bir harf fontta yok" },
    on: { ad: "Ön sayfa", aciklama: "Ön sayfa metni kutusuna sığmadı" },
    cevrildi: { ad: "Tüm çeviriler", aciklama: "Bu PDF'e basılan bütün çeviriler" },
  };
  const SORUN = ["eksik", "onaysiz", "kucuk", "fontYok", "on"];

  const on = {
    belge: null, no: 0, sayfalar: [], vp: [], tuvaller: new Map(), cizilen: new Set(), gozcu: null, uzak: null,
    yakinlik: depo.oku("sema:yakinlik", 1), filtre: null, panelKapali: depo.oku("sema:panel-kapali", false), sorunlar: [],
  };
  const YAKINLIK = [1, 1.5, 2, 3];

  // ---------------------------------------------------------------- yerleşim
  const masa = $("masa");
  let sonGenislik = 1100;
  const temelGenislik = () => {
    if (masa.clientWidth > 0) sonGenislik = masa.clientWidth;
    return Math.max(220, Math.min(sonGenislik - 40, 1500));
  };
  const genislik = () => Math.round(temelGenislik() * on.yakinlik);

  // Yakınlaştırma ve kontrol düğmesi: masanın sağ üstünde, sayfaların üstünde yüzer
  const arac = el("div", { style: { position: "sticky", top: "0", zIndex: 5, height: "0", display: "flex", justifyContent: "flex-end", pointerEvents: "none" } });
  const grup = el("div", { class: "satir", style: { gap: "4px", padding: "4px", background: "var(--masa-yuzey)", borderRadius: "6px", boxShadow: "0 2px 10px rgba(0,0,0,.35)", pointerEvents: "auto", marginTop: "-12px" } });
  const yakinlikYaz = el("span", { style: { color: "var(--masa-metin)", fontSize: "12.5px", minWidth: "44px", textAlign: "center", fontVariantNumeric: "tabular-nums" } });
  const kontrolDugme = el("button", { class: "dugme kucuk", type: "button", onclick: () => panelAc(true) });
  for (const b of [
    el("button", { class: "dugme kucuk", type: "button", title: "Uzaklaştır", "aria-label": "Uzaklaştır", onclick: () => yakinlastir(-1), metin: "−" }),
    yakinlikYaz,
    el("button", { class: "dugme kucuk", type: "button", title: "Yakınlaştır", "aria-label": "Yakınlaştır", onclick: () => yakinlastir(1), metin: "+" }),
    kontrolDugme,
  ]) grup.appendChild(b);
  arac.appendChild(grup);
  arac.hidden = true;
  masa.insertBefore(arac, masa.firstChild);

  function yakinlastir(yon) {
    const i = Math.max(0, Math.min(YAKINLIK.length - 1, YAKINLIK.indexOf(on.yakinlik) + yon));
    if (YAKINLIK[i] === on.yakinlik) return;
    const oran = masa.scrollTop / Math.max(1, masa.scrollHeight);
    on.yakinlik = YAKINLIK[i];
    depo.yaz("sema:yakinlik", on.yakinlik);
    boyutlandir();
    masa.scrollTop = oran * masa.scrollHeight;
  }
  function boyutlandir() {
    yakinlikYaz.textContent = `%${Math.round(on.yakinlik * 100)}`;
    const g = genislik();
    document.querySelectorAll("#paftalar .pafta").forEach((p) => { p.style.width = g + "px"; });
    on.cizilen = new Set();
    on.tuvaller = new Map();
    yenidenGozle();
  }

  // ---------------------------------------------------------------- gösterim
  /** bayt: gösterilecek PDF; bilgi: Motor.olustur sonucu sayfa bilgileri (kaynak PDF için null). */
  async function goster(bayt, bilgi) {
    const no = ++on.no;
    let belge;
    try {
      belge = await pdfjs.getDocument({ data: bayt.slice(), isEvalSupported: false }).promise;
    } catch (e) {
      U.durum("Önizleme açılamadı: " + (e.message || e), "hata");
      return;
    }
    if (no !== on.no) { belge.destroy(); return; }
    const vpler = [];
    for (let i = 1; i <= belge.numPages; i++) vpler.push((await belge.getPage(i)).getViewport({ scale: 1 }));
    if (no !== on.no) { belge.destroy(); return; }
    const eski = on.belge;
    const eskiTuval = on.tuvaller;
    on.belge = belge;
    on.vp = vpler;
    on.bilgi = bilgi || vpler.map(() => null);
    on.cizilen = new Set();
    on.tuvaller = new Map();
    const g = genislik();
    const kap = $("paftalar");
    const yeni = vpler.map((v, i) => {
      const b = on.bilgi[i];
      const d = el("div", { class: "pafta", dataset: { no: i + 1 }, style: { width: g + "px", aspectRatio: `${v.width} / ${v.height}` } },
        el("span", { class: "pafta-no", metin: etiketYaz(i, b, vpler.length) }),
        el("div", { class: "katman" }));
      // Aynı imzalı sayfa daha önce bu genişlikte çizildiyse tuvali taşınır
      const t = b && eskiTuval.get(b.imza);
      if (t && t.dataset.gen === String(g)) {
        d.insertBefore(t, d.firstChild);
        on.cizilen.add(i + 1);
        on.tuvaller.set(b.imza, t);
      }
      return d;
    });
    kap.replaceChildren(...yeni);
    kap.hidden = false;
    $("bos").hidden = true;
    arac.hidden = false;
    yakinlikYaz.textContent = `%${Math.round(on.yakinlik * 100)}`;
    if (eski) eski.destroy();
    yenidenGozle();
    isaretleriYaz();
  }

  function etiketYaz(i, b, toplam) {
    const n = `${i + 1} / ${toplam}`;
    if (!b) return n;
    if (b.tur === "on") return `${n} · ${b.dil} · ${{ kapak: "Kapak", guvenlik: "Safety", kablo: "Cable" }[b.tip]}`;
    return `${n} · ${b.dil} · şema ${b.kaynakSayfa}`;
  }

  function yenidenGozle() {
    if (on.gozcu) on.gozcu.disconnect();
    if (on.uzak) on.uzak.disconnect();
    on.gozcu = new IntersectionObserver((g) => g.forEach((x) => { if (x.isIntersecting) paftaCiz(x.target); }), { root: masa, rootMargin: "800px 0px" });
    // Çok uzaktaki sayfaların tuvali bırakılır
    on.uzak = new IntersectionObserver((g) => g.forEach((x) => { if (!x.isIntersecting) birak(x.target); }), { root: masa, rootMargin: "4000px 0px" });
    document.querySelectorAll("#paftalar .pafta").forEach((p) => { on.gozcu.observe(p); on.uzak.observe(p); });
  }

  function birak(d) {
    const no = +d.dataset.no;
    const t = d.querySelector("canvas");
    if (!t) return;
    t.width = t.height = 0;
    t.remove();
    on.cizilen.delete(no);
    const b = on.bilgi[no - 1];
    if (b && on.tuvaller.get(b.imza) === t) on.tuvaller.delete(b.imza);
  }

  async function paftaCiz(d) {
    const no = +d.dataset.no;
    if (!on.belge || on.cizilen.has(no)) return;
    const belge = on.belge;
    on.cizilen.add(no);
    try {
      const s = await belge.getPage(no);
      const v1 = s.getViewport({ scale: 1 });
      const olcek = Math.min(4, (d.clientWidth / v1.width) * Math.min(window.devicePixelRatio || 1, 2) * 1.15);
      const v = s.getViewport({ scale: olcek });
      const t = document.createElement("canvas");
      t.width = Math.round(v.width); t.height = Math.round(v.height);
      t.dataset.gen = d.style.width.replace("px", "");
      await s.render({ canvasContext: t.getContext("2d"), viewport: v }).promise;
      if (belge !== on.belge || !d.isConnected) return;
      const eski = d.querySelector("canvas");
      if (eski) eski.replaceWith(t); else d.insertBefore(t, d.firstChild);
      const b = on.bilgi[no - 1];
      if (b) on.tuvaller.set(b.imza, t);
    } catch (e) {
      if (belge === on.belge) on.cizilen.delete(no);
    }
  }

  window.addEventListener("resize", () => {
    clearTimeout(on.boyutZaman);
    on.boyutZaman = setTimeout(() => { if (on.belge) boyutlandir(); }, 250);
  });

  // ---------------------------------------------------------------- işaretler
  /** Çıktı sayfasının işaretleri, görüntü türüyle: [{gorunum, kategoriler, isaret}] */
  function sayfaIsaretleri(i) {
    const b = on.bilgi[i];
    const s = hal.sonuc;
    if (!b || b.tur !== "sema" || !s) return [];
    const cv = s.ceviri.find((c) => c.dil === b.dil);
    if (!cv) return [];
    const P_ = cv.plan.sayfalar[b.kaynakSayfa - 1];
    if (!P_) return [];
    return P_.isaretler.map((x) => {
      const kat = [];
      if (x.tur === "eksik") kat.push("eksik");
      if (x.tur === "fontYok") kat.push("fontYok");
      if (x.tur === "cevrildi" || x.tur === "kucuk") {
        kat.push("cevrildi");
        const k = Hafiza.bul(x.sablon);
        if (k && !Hafiza.onayli(k, b.dil)) kat.push("onaysiz");
        if (x.tur === "kucuk") kat.push("kucuk");
      }
      const gorunum = ["eksik", "fontYok", "onaysiz", "kucuk", "cevrildi"].find((k) => kat.includes(k));
      return { gorunum, kat, x, dil: b.dil, kaynakSayfa: b.kaynakSayfa };
    });
  }

  function isaretleriYaz() {
    const goster = $("isaretGoster").checked, tumu = $("tumunuGoster").checked;
    document.querySelectorAll("#paftalar .pafta").forEach((d) => {
      const i = +d.dataset.no - 1;
      const katman = d.querySelector(".katman");
      katman.textContent = "";
      if (!goster && !tumu) return;
      const vp = on.vp[i];
      for (const m of sayfaIsaretleri(i)) {
        const sorun = m.kat.some((k) => SORUN.includes(k));
        if (!(sorun && goster) && !tumu) continue;
        if (on.filtre && !m.kat.includes(on.filtre)) continue;
        const r = vp.convertToViewportRectangle([m.x.kutu[0] - 1.2, m.x.kutu[1] - 1.2, m.x.kutu[2] + 1.2, m.x.kutu[3] + 1.2]);
        const x0 = Math.min(r[0], r[2]), y0 = Math.min(r[1], r[3]), x1 = Math.max(r[0], r[2]), y1 = Math.max(r[1], r[3]);
        const b = el("button", {
          class: "isaret " + m.gorunum, type: "button",
          title: `${TURLER[m.gorunum].ad}: ${m.x.sablon}${m.x.hedef ? " → " + m.x.hedef : ""}`,
          style: { left: (x0 / vp.width) * 100 + "%", top: (y0 / vp.height) * 100 + "%", width: ((x1 - x0) / vp.width) * 100 + "%", height: ((y1 - y0) / vp.height) * 100 + "%" },
          onclick: () => U.duzenle(m.x.sablon, { dil: m.dil, isaret: m.x, kaynakSayfa: m.kaynakSayfa }),
        });
        b.setAttribute("aria-label", b.title);
        katman.appendChild(b);
      }
    });
    panelYaz();
  }

  // ---------------------------------------------------------------- kontrol paneli
  function tumSorunlar() {
    const o = [];
    on.bilgi.forEach((b, i) => {
      for (const m of sayfaIsaretleri(i)) o.push(Object.assign({ sayfa: i + 1 }, m));
    });
    const s = hal.sonuc;
    if (s && s.uyari) {
      for (const u of s.uyari) {
        const [dil, tip] = u.split(" ");
        const i = on.bilgi.findIndex((b) => b && b.tur === "on" && b.dil === dil && b.tip === tip.replace(":", ""));
        o.push({ sayfa: i + 1, kat: ["on"], gorunum: "on", x: { sablon: u.replace(/^\S+ \S+ /, ""), metin: "" }, dil, on: true });
      }
    }
    return o;
  }

  /** Kütüphanede karşılığı olmayan terimler, benzersiz ve şemadaki ilk görünüş sırasıyla:
   *  [{sablon, diller (eksik diller), adet, sayfalar (şema sayfaları), m (önizlemedeki ilk işaret ya da null)}] */
  function eksikTerimler(hepsi) {
    const diller = U.cevrilenDiller();
    if (!hal.kaynak || !hal.kaynak.tarama || !diller.length) return [];
    const ilk = new Map();
    for (const m of hepsi) {
      if (!m.kat.includes("eksik")) continue;
      const a = Hafiza.anahtar(m.x.sablon);
      if (!ilk.has(a)) ilk.set(a, m);
    }
    return Ceviri.eksikler(hal.kaynak, diller)
      .map((e) => ({ sablon: e.sablon, diller: e.diller, adet: e.terim.adet, sayfalar: [...e.terim.sayfalar].sort((a, b) => a - b), m: ilk.get(Hafiza.anahtar(e.sablon)) || null }))
      .sort((a, b) => (a.sayfalar[0] || 0) - (b.sayfalar[0] || 0) || a.sablon.localeCompare(b.sablon, "tr"));
  }

  function panelYaz() {
    const panel = $("sorunlar");
    const liste = $("sorunListe");
    const cip = $("sorunCip");
    if (!hal.sonuc || !hal.sonuc.ceviri.length) {
      panel.classList.add("kapali");
      kontrolDugme.hidden = true;
      return;
    }
    const hepsi = tumSorunlar();
    const eksik = eksikTerimler(hepsi);
    const say = {};
    for (const k of Object.keys(TURLER)) say[k] = 0;
    hepsi.forEach((m) => m.kat.forEach((k) => { say[k]++; }));
    const diger = hepsi.filter((m) => !m.kat.includes("eksik") && m.kat.some((k) => SORUN.includes(k)));
    const rozet = $("eksikBaslikSay");
    rozet.textContent = eksik.length;
    rozet.className = "rozet" + (eksik.length ? "" : " sakin");
    kontrolDugme.hidden = !on.panelKapali;
    kontrolDugme.textContent = eksik.length ? `Eksik (${eksik.length})` : diger.length ? `Kontrol (${diger.length})` : "Eksik";
    panel.classList.toggle("kapali", on.panelKapali);
    cip.textContent = "";
    for (const k of Object.keys(TURLER)) {
      if (!say[k] && k !== on.filtre && k !== "eksik") continue;
      cip.appendChild(el("button", {
        class: "cip " + k, type: "button", "aria-pressed": on.filtre === k ? "true" : "false", title: TURLER[k].aciklama,
        onclick: () => { on.filtre = on.filtre === k ? null : k; isaretleriYaz(); },
      }, el("i", { "aria-hidden": "true" }), TURLER[k].ad, el("b", { metin: say[k] })));
    }
    // Eylemler
    const ey = $("sorunEylem");
    ey.textContent = "";
    if (eksik.length) ey.appendChild(el("button", { class: "dugme kucuk ana", type: "button", onclick: () => eksikAc(eksik[0], eksik), metin: "Eksikleri sırayla yaz" }));
    if (say.onaysiz) ey.appendChild(el("button", { class: "dugme kucuk", type: "button", onclick: () => olay.emit("onaylariGoster"), metin: "Onay bekleyenleri gözden geçir" }));
    liste.textContent = "";

    // Eksik terimler: aynı terim bir kez
    if (!on.filtre || on.filtre === "eksik") {
      if (!eksik.length) liste.appendChild(el("li", { class: "sorun-bos", metin: "Eksik terim yok: şemadaki bütün terimlerin karşılığı kütüphanede." }));
      for (const e of eksik.slice(0, 400)) {
        const ss = e.sayfalar;
        liste.appendChild(el("li", {}, el("button", { type: "button", class: "eksik-terim", title: "Karşılığını yaz", onclick: () => eksikAc(e, eksik) },
          el("span", { class: "sno", metin: `${e.adet}×` }),
          el("span", { class: "sm", metin: e.sablon }),
          el("span", { class: "sh", metin: `${e.diller.join(", ")} yok · şema s. ${ss.slice(0, 6).join(", ")}${ss.length > 6 ? "…" : ""}` }))));
      }
      if (eksik.length > 400) liste.appendChild(el("li", { class: "sorun-bos", metin: `İlk 400 terim gösteriliyor (toplam ${eksik.length}).` }));
      if (on.filtre === "eksik") return;
    }

    // Diğer kontroller: seçili tür veya eksik dışındaki bütün sorunlar, sayfa sayfa
    const gorunen = on.filtre ? hepsi.filter((m) => m.kat.includes(on.filtre)) : diger;
    if (!on.filtre && gorunen.length) liste.appendChild(el("li", { class: "grup ayrac", metin: "Diğer kontroller" }));
    if (on.filtre && !gorunen.length) {
      liste.appendChild(el("li", { class: "sorun-bos", metin: "Bu türde işaret yok." }));
      return;
    }
    let sonSayfa = 0;
    for (const m of gorunen.slice(0, 600)) {
      if (m.sayfa !== sonSayfa) {
        sonSayfa = m.sayfa;
        const b = on.bilgi[m.sayfa - 1];
        liste.appendChild(el("li", { class: "grup", metin: b ? (b.tur === "on" ? `Sayfa ${m.sayfa} · ${b.dil} ön sayfa` : `Sayfa ${m.sayfa} · ${b.dil} · şema ${b.kaynakSayfa}`) : `Sayfa ${m.sayfa}` }));
      }
      const hedef = m.x.hedef ? `→ ${m.x.hedef}` : m.on ? "Ayarlar > Ön sayfa metinlerinden kısaltın" : TURLER[m.gorunum].aciklama;
      liste.appendChild(el("li", {}, el("button", { type: "button", onclick: () => git(m) },
        el("span", { class: "sno", metin: TURLER[m.gorunum].ad.split(" ")[0] }),
        el("span", { class: "sm", metin: m.on ? m.x.sablon : m.x.metin || m.x.sablon }),
        el("span", { class: "sh", metin: hedef }))));
    }
    if (gorunen.length > 600) liste.appendChild(el("li", { class: "sorun-bos", metin: `İlk 600 işaret gösteriliyor (toplam ${gorunen.length}).` }));
  }

  /**
   * Eksik terimin düzenleyicisini açar ve şemadaki ilk yerine gider. "Kaydet ve sonraki" listede sıradaki, hâlâ
   * eksik terimi açar (kaydedilen terim kütüphaneye girdiği için listeden düşer).
   */
  function eksikAc(e, liste) {
    const sira = liste.map((x) => Hafiza.anahtar(x.sablon));
    const bu = Hafiza.anahtar(e.sablon);
    const sonraki = () => {
      const guncel = eksikTerimler(tumSorunlar());
      const harita = new Map(guncel.map((x) => [Hafiza.anahtar(x.sablon), x]));
      const n = sira.slice(sira.indexOf(bu) + 1).map((a) => harita.get(a)).find(Boolean) || guncel.find((x) => Hafiza.anahtar(x.sablon) !== bu);
      if (!n) { U.durum("Eksik terim kalmadı: bütün terimlerin karşılığı kütüphanede.", "tamam"); return; }
      eksikAc(n, guncel);
    };
    const kalan = liste.filter((x) => Hafiza.anahtar(x.sablon) !== bu).length;
    const ek = { dil: e.diller[0], sonraki: kalan ? sonraki : null, kalan };
    if (e.m) git(e.m, ek);
    else U.duzenle(e.sablon, ek);
  }

  /** İşaretin sayfasına gider, işareti parlatır ve düzenleyiciyi açar. ek: düzenleyiciye ek seçenekler. */
  function git(m, ek) {
    const d = document.querySelector(`#paftalar .pafta[data-no="${m.sayfa}"]`);
    if (!d) return;
    U.sekmeAc("onizleme");
    if (m.on) { d.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
    const vp = on.vp[m.sayfa - 1];
    const r = vp.convertToViewportRectangle(m.x.kutu);
    const yOran = Math.min(r[1], r[3]) / vp.height;
    const xOran = Math.min(r[0], r[2]) / vp.width;
    masa.scrollTo({ top: d.offsetTop + yOran * d.clientHeight - masa.clientHeight / 2, left: Math.max(0, d.offsetLeft + xOran * d.clientWidth - masa.clientWidth / 2), behavior: "smooth" });
    setTimeout(() => {
      for (const b of d.querySelectorAll(".isaret")) {
        if (b.title.includes(m.x.sablon)) { b.classList.add("parla"); setTimeout(() => b.classList.remove("parla"), 2600); }
      }
    }, 350);
    U.duzenle(m.x.sablon, Object.assign({ dil: m.dil, isaret: m.x, kaynakSayfa: m.kaynakSayfa }, ek || {}));
  }

  function panelAc(acik) {
    on.panelKapali = !acik;
    depo.yaz("sema:panel-kapali", on.panelKapali);
    panelYaz();
  }
  $("sorunKapat").addEventListener("click", () => panelAc(false));
  $("isaretGoster").addEventListener("change", isaretleriYaz);
  $("tumunuGoster").addEventListener("change", isaretleriYaz);

  function temizle() {
    on.no++;
    if (on.belge) { on.belge.destroy(); on.belge = null; }
    on.bilgi = [];
    $("paftalar").textContent = "";
    $("paftalar").hidden = true;
    $("bos").hidden = false;
    arac.hidden = true;
    panelYaz();
  }

  olay.on("hafiza", () => { if (on.belge) isaretleriYaz(); });
  // Belge başka sekmedeyken açıldıysa genişlik o an ölçülemedi: görünür olunca düzeltilir
  olay.on("sekme", (ad) => {
    if (ad !== "onizleme" || !on.belge) return;
    requestAnimationFrame(() => {
      const ilk = document.querySelector("#paftalar .pafta");
      if (ilk && ilk.style.width !== genislik() + "px") boyutlandir();
      else yenidenGozle();
    });
  });
  U.onizleme = { goster, isaretleriYaz, temizle, panelAc, TURLER };
})();
