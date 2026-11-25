// Tasarımlar sekmesi: kapak, Safety Regulations ve Cable Color Coding için üçer tasarım. Seçim hesapta saklanır.
(function () {
  "use strict";
  const { $, el, hal, olay } = U;
  const g = { dil: "EN", kurulu: false };

  function dilDugmeleri() {
    const k = $("galeriDil");
    k.textContent = "";
    for (const d of U.secilebilir()) k.appendChild(el("button", { type: "button", dataset: { dil: d }, "aria-pressed": d === g.dil ? "true" : "false", metin: d, title: U.dilAdi(d) }));
  }
  $("galeriDil").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-dil]");
    if (!b) return;
    g.dil = b.dataset.dil;
    dilDugmeleri();
    ciz();
  });

  function kur() {
    if (g.kurulu) return;
    g.kurulu = true;
    const kap = $("galeri");
    for (const tip of Tasarim.TIPLER) {
      const kartlar = el("div", { class: "kartlar" });
      for (const kod of Tasarim.KODLAR) {
        const t = Tasarim.BILGI[kod];
        kartlar.appendChild(el("article", { class: "kart", dataset: { kod } },
          el("canvas", { role: "img", "aria-label": `${tip.ad}, ${t.ad}` }),
          el("div", { class: "kart-alt" }, el("div", {}, el("b", { metin: `${kod}. ${t.ad}` }), el("small", { metin: t.aciklama })), el("button", { class: "dugme kullan", type: "button" }))));
      }
      kap.appendChild(el("div", { class: "tasarim-bolum", dataset: { tip: tip.kod } }, el("h3", { metin: tip.ad }), kartlar));
    }
    kap.addEventListener("click", (e) => {
      const b = e.target.closest(".kullan");
      if (!b) return;
      sec({ [b.closest(".tasarim-bolum").dataset.tip]: b.closest(".kart").dataset.kod });
    });
  }

  function ciz() {
    if (hal.sekme !== "tasarimlar") return;
    kur();
    if (!U.secilebilir().includes(g.dil)) g.dil = "EN";
    dilDugmeleri();
    const secim = Tasarim.secimOku();
    document.querySelectorAll("#galeri .tasarim-bolum").forEach((s) => {
      s.querySelectorAll(".kart").forEach((k) => {
        const tuval = k.querySelector("canvas");
        const gen = tuval.clientWidth || 300;
        const dpr = Math.max(2, Math.min(window.devicePixelRatio || 1, 3));
        const w = Math.round(gen * dpr), h = Math.round((w * Tasarim.H) / Tasarim.W);
        if (tuval.width !== w || tuval.height !== h) { tuval.width = w; tuval.height = h; }
        const ctx = tuval.getContext("2d");
        ctx.setTransform(w / Tasarim.W, 0, 0, w / Tasarim.W, 0, 0);
        Cizim.cizCanvas(ctx, Tasarim.sayfa(s.dataset.tip, k.dataset.kod, { dil: g.dil, ad: $("ad").value || "1234567-FİRMA-LYM 1150", tarih: $("tarih").value || U.bugun() }));
        const secili = secim[s.dataset.tip] === k.dataset.kod;
        k.classList.toggle("secili", secili);
        const b = k.querySelector(".kullan");
        b.textContent = secili ? "Kullanılıyor" : "Bu tasarımı kullan";
        b.className = "dugme kullan " + (secili ? "secildi" : "ana");
      });
    });
    const ad = (kod) => Tasarim.BILGI[kod].ad;
    $("tasarimOzet").textContent = `Kullanılan: Kapak ${ad(secim.kapak)} · Safety ${ad(secim.guvenlik)} · Cable ${ad(secim.kablo)}`;
  }

  function sec(degisim) {
    const once = JSON.stringify(Tasarim.secimOku());
    const s = Tasarim.secimYaz(degisim);
    if (JSON.stringify(s) === once) return;
    Ayarlar.tasarimYaz(s);
    ciz();
    olay.emit("tasarim");
  }

  olay.on("sekme", (s) => { if (s === "tasarimlar") ciz(); });
  olay.on("ayarlar", () => { if (hal.sekme === "tasarimlar") ciz(); });
  let z = null;
  window.addEventListener("resize", () => { clearTimeout(z); z = setTimeout(ciz, 250); });
  U.galeri = { ciz };
})();
