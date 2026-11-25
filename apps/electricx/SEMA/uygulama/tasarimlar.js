// Kapak, Safety Regulations ve Cable Color Coding sayfalarının üç tasarımı. Tema: kırmızı ve beyaz.
// Sayfa A3 yatay (420 x 297 mm). Tüm yerleşim mm ızgarasına oturur.
(function () {
  "use strict";
  const { Liste } = window.Cizim;
  const I = window.ICERIK;
  const LOGO = window.LOGO;

  const W = 420, H = 297;
  const R = "#E30613";     // marka kırmızısı
  const RA = "#FDF0F0";    // açık kırmızı zemin
  const RC = "#F2BDC0";    // açık kırmızı çizgi
  const RT = "#F4656D";    // kırmızı üstünde açık çizim
  const B = "#FFFFFF";
  const M = "#1A1A1A";     // metin
  const G = "#5E6166";     // ikincil metin

  // ---------------------------------------------------------------- yardımcılar
  const normal = (s) => String(s).replace(/[İIı]/g, "i").toLowerCase().replace(/\s+/g, " ").trim();

  /** Kullanıcı soneki kendisi yazdıysa çıkarır: "LYM ELECTRICAL SCHEMATIC" -> "LYM" */
  function adTemizle(ad) {
    const s = String(ad == null ? "" : ad).trim();
    const n = normal(s);
    for (const k of I.sonek_kaliplari) {
      const kn = normal(k);
      if (n === kn) return "";
      if (n.endsWith(" " + kn)) return s.split(/\s+/).slice(0, -kn.split(" ").length).join(" ").replace(/[\s\-–—]+$/, "");
    }
    return s;
  }

  function tarihYaz(t) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(t || ""));
    return m ? `${m[3]}.${m[2]}.${m[1]}` : String(t || "");
  }

  function veri(dil, ad, tarih) {
    const t = I[dil];
    const temiz = adTemizle(ad);
    return { dil, t, ad: temiz, sonek: t.sema, baslik: (temiz ? temiz + " " : "") + t.sema, tarih: tarihYaz(tarih), hazirlayan: I.hazirlayan, sirket: I.sirket, web: I.web };
  }

  const buyuk = (s, dil) => s.toLocaleUpperCase(dil === "TR" ? "tr" : "en");

  /**
   * Dolfin logosu. g: "Dolfin" kelimesinin genişliği (mm); TM sağa taşar, slogan aynı genişliktedir.
   * Dönüş: kelime + sloganın yüksekliği (mm).
   */
  function logo(L, x, y, g, renk, sec) {
    sec = sec || {};
    const o = g / LOGO.kelime.g;
    L.yol(LOGO.kelime.d, { x, y, o, dolgu: renk, cift: true });
    L.yol(LOGO.tm.d, { x, y, o, dolgu: renk });
    L.yol(LOGO.slogan.d, { x, y, o, dolgu: renk });
    if (sec.yazi) {
      const Y = LOGO.yazi;
      L.yol(Y.d, { x: x + Y.x0 * o, y: y + (Y.y0 + (sec.yaziAralik || 0)) * o, o: o * Y.o, dolgu: renk, cift: true });
    }
    return LOGO.slogan.alt * o;
  }
  const logoYuk = (g) => (LOGO.slogan.alt * g) / LOGO.kelime.g;

  /** Elektrik tehlikesi üçgeni. zemin: üçgen rengi, simge: şimşek rengi. */
  function ucgen(L, x, y, g, zemin, simge) {
    const o = g / 120;
    L.yol("M60 7 113 99H7Z", { x, y, o, dolgu: zemin, cizgi: zemin, k: 9 * o, yuvarlak: true });
    L.yol("M67.5 31 44.5 67H58.5L51 91 77 53H62.5L72.5 31Z", { x, y, o, dolgu: simge });
    return (106 * g) / 120;
  }

  /** Çizgi simgeleri (24 birimlik ızgara) */
  const SIMGE = {
    gerilim: "M13 2 3 14h9l-1 8 10-12h-9l1-8Z",
    uyari: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4M12 17v.01",
    personel: "M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2ZM10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5M4 15v-3a6 6 0 0 1 6-6M14 6a6 6 0 0 1 6 6v3",
    belge: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2ZM14 2v6h6M9 15l2 2 4-4",
  };
  const simge = (L, ad, x, y, g, renk) => L.yol(SIMGE[ad], { x, y, o: g / 24, cizgi: renk, k: 0.42, yuvarlak: true });

  /** Kablo örneği: yuvarlak uçlu yatay çubuk; çok renkli kablo çizgili olur. */
  function kablo(L, x, y, g, h, renkler) {
    const r = h / 2;
    const d = Liste.yuvarlakYol(x, y, g, h, r);
    if (renkler.length === 1) {
      L.yol(d, { dolgu: renkler[0] });
      return;
    }
    L.kirp(d, (K) => {
      K.dolgu(x, y, g, h, renkler[0]);
      const adim = h * 2.2;
      for (let a = -h; a < g + h; a += adim) {
        K.yol(`M${x + a} ${y + h}L${x + a + adim / 2} ${y + h}L${x + a + adim / 2 + h} ${y}L${x + a + h} ${y}Z`, { dolgu: renkler[1] });
      }
    });
  }

  /** IEC gösterimli tek motor kolu: sigorta, kontaktör, termik, klemens, motor. */
  function motorKolu(L, cx, y0, yb, o, sec) {
    const r = sec.renk, k = sec.k || 0.28, ad = sec.ad || 1;
    const px = [cx - 5 * o, cx, cx + 5 * o];
    const y = (v) => y0 + v * o;
    const ust = sec.tapa || [y0, y0, y0];
    const c = (x1, y1, x2, y2) => L.cizgi(x1, y1, x2, y2, r, k);
    px.forEach((x, i) => {
      // bara bağlantısı
      if (sec.tapa) L.daire(x, ust[i], 0.75 * o, { dolgu: r });
      c(x, ust[i], x, y(12));
      // sigorta
      L.cerceve(x - 1.4 * o, y(12), 2.8 * o, 11 * o, r, k);
      c(x, y(12), x, y(40));
      // kontaktör ana kontağı
      L.yol(`M${x - 1 * o} ${y(40)}A${1 * o} ${1 * o} 0 0 0 ${x + 1 * o} ${y(40)}`, { cizgi: r, k });
      c(x - 3.4 * o, y(42), x, y(55));
      c(x, y(55), x, y(80));
      // termik röle elemanı
      c(x, y(84), x + 2.2 * o, y(84));
      c(x + 2.2 * o, y(84), x + 2.2 * o, y(89));
      c(x + 2.2 * o, y(89), x, y(89));
      c(x, y(80), x, y(84));
      c(x, y(89), x, y(120));
      // klemens
      L.daire(x, y(120), 0.95 * o, { dolgu: sec.zemin || B, cizgi: r, k });
      const dx = x - cx, Rm = 15 * o, yc = y(158);
      c(x, y(121), x, yc - Math.sqrt(Rm * Rm - dx * dx));
    });
    // kontaktör mekanik bağı (kesikli)
    for (let x = px[0] - 2.2 * o; x < px[2] - 1.5 * o; x += 2.4 * o) c(x, y(48), x + 1.3 * o, y(48));
    // termik röle kutusu
    L.cerceve(cx - 8 * o, y(80), 16 * o + 2.4 * o, 13 * o, r, k);
    // motor
    L.daire(cx, y(158), 15 * o, { cizgi: r, k });
    L.yazi("M", cx, y(157), { f: "b", pt: 17 * o * ad, renk: r, hiza: "orta" });
    L.yazi("3~", cx, y(165), { f: "s", pt: 12.5 * o * ad, renk: r, hiza: "orta" });
    // PE
    c(cx, y(173), cx, y(182));
    c(cx - 5 * o, y(182), cx + 5 * o, y(182));
    c(cx - 3.2 * o, y(184.5), cx + 3.2 * o, y(184.5));
    c(cx - 1.4 * o, y(187), cx + 1.4 * o, y(187));
    if (sec.etiket) {
      const et = (m, v) => L.yazi(m, cx + 12 * o, y(v), { f: "s", pt: 9.5 * o, renk: sec.etiket });
      et(`-F${yb}`, 19.5); et(`-K${yb}`, 49.5); et(`-T${yb}`, 88); et("-X1", 121.5);
      L.yazi(`-M${yb}`, cx + 18 * o, y(160), { f: "s", pt: 9.5 * o, renk: sec.etiket });
    }
  }

  // ================================================================ A: KIRMIZI PANEL
  const a = {
    ust(L, v) {
      L.dolgu(0, 0, W, 34, R);
      const g = 60, lh = logoYuk(g);
      logo(L, 20, (34 - lh) / 2, g, B);
      L.cizgi(92, 8, 92, 26, RT, 0.3);
      // sağ blok sayfa kenar boşluğuna (400 mm) tam oturur
      const genis = (et, de) => Math.max(Cizim.olc(et, "m", 8.5), Cizim.olc(de, "b", 12));
      const x2 = 400 - genis(v.t.kapak.hazirlayan, v.hazirlayan);
      const x1 = x2 - 12 - genis(v.t.kapak.tarih, v.tarih);
      const sutun = (x, et, de) => {
        L.yazi(et, x, 14.6, { f: "m", pt: 8.5, renk: "#FFD9DB" });
        L.yazi(de, x, 21.8, { f: "b", pt: 12, renk: B });
      };
      sutun(x1, v.t.kapak.tarih, v.tarih);
      sutun(x2, v.t.kapak.hazirlayan, v.hazirlayan);
      L.blok(v.baslik, 100, 8, x1 - 100 - 12, 18, { f: "b", pt: 17, min: 9, renk: B, dikey: "orta" });
    },
    alt(L, v) {
      L.cizgi(20, 285.2, 400, 285.2, R, 0.3);
      L.yazi(v.sirket, 20, 290.6, { f: "s", pt: 8.5, renk: M });
      L.yazi(v.web, 400, 290.6, { f: "s", pt: 8.5, renk: R, hiza: "sag" });
    },
    kapak(L, v) {
      const PG = 140;
      L.dolgu(0, 0, PG, H, R);
      // panelde tek motor kolu, açık tonda
      motorKolu(L, PG / 2, 88, 1, 0.66, { renk: "#F79298", zemin: R, k: 0.3 });
      // üç faz hattı: panelden sayfaya uzanır, alt uçta bilgi alanını ayırır
      const lg = 100;
      logo(L, 20, 26, lg, B);
      const yazG = lg * 1.0, Y = LOGO.yazi, yo = yazG / Y.g;
      L.yol(Y.d, { x: 20, y: H - 26 - Y.y * yo, o: yo, dolgu: B, cift: true });
      const x0 = PG + 28, xs = 400, gen = xs - x0;
      const adPt = 64;
      const sonuc = L.blok(v.ad, x0, 62, gen, 76, { f: "x", pt: adPt, min: 24, satir: 1.08, renk: M, dikey: "alt" });
      L.blok(v.sonek, x0, 147, gen, 14, { f: "b", pt: 26, min: 14, renk: R, dikey: "ust" });
      // ayırıcı faz çizgileri
      [172, 175.2, 178.4].forEach((y) => L.cizgi(PG, y, xs, y, R, 0.3));
      const sutun = (x, et, de) => {
        L.yazi(et, x, 195, { f: "m", pt: 10.5, renk: G });
        L.yazi(de, x, 205, { f: "b", pt: 17, renk: M });
      };
      sutun(x0, v.t.kapak.tarih, v.tarih);
      sutun(x0 + 78, v.t.kapak.hazirlayan, v.hazirlayan);
      L.yazi(v.sirket, x0, H - 32, { f: "b", pt: 11, renk: M });
      L.yazi(v.web, x0, H - 26, { f: "m", pt: 11, renk: R });
    },
    guvenlik(L, v) {
      const g = v.t.guvenlik;
      a.ust(L, v);
      L.blok(g.baslik, 20, 42, 250, 12, { f: "x", pt: 26, min: 16, dikey: "alt", renk: M });
      L.blok(g.alt_baslik, 200, 42, 200, 12, { f: "b", pt: 11, min: 8, dikey: "alt", renk: R, hiza: "sag", ls: 0.25 });
      // tehlike paneli
      const py = 60, ph = 106, pg = 112;
      L.dolgu(20, py, pg, ph, R);
      const ug = 62, ux = 20 + (pg - ug) / 2;
      ucgen(L, ux, py + 13, ug, B, R);
      L.blok(g.tehlike, 20, py + 76, pg, 18, { f: "x", pt: 36, min: 20, renk: B, hiza: "orta", dikey: "orta" });
      // dört kritik madde
      const kx = 138, kg = 400 - kx, ara = 3.5, kh = (ph - 3 * ara) / 4;
      const kpt = Cizim.ortakBoyut(g.kritik, "s", kg - 16, kh - 5, 14, 9.5, 1.34);
      g.kritik.forEach((m, i) => {
        const y = py + i * (kh + ara);
        L.dolgu(kx, y, kg, kh, RA);
        L.dolgu(kx, y, 1.5, kh, R);
        L.blok(m, kx + 8, y, kg - 16, kh, { f: "s", pt: kpt, min: kpt, satir: 1.34, renk: M, dikey: "orta" });
      });
      // sekiz kural
      const sg = 185, sy = 174, sh = 26.2, ng = 13;
      const pt = Cizim.ortakBoyut(g.kurallar, "r", sg - ng, sh - 4, 11.5, 8, 1.36);
      g.kurallar.forEach((m, i) => {
        const x = i < 4 ? 20 : 215, y = sy + (i % 4) * sh;
        L.cizgi(x, y, x + sg, y, RC, 0.25);
        L.blok(String(i + 1).padStart(2, "0"), x, y, ng, sh, { f: "x", pt: 14, renk: R, dikey: "orta" });
        L.blok(m, x + ng, y, sg - ng, sh, { f: "r", pt, min: pt, satir: 1.36, renk: M, dikey: "orta" });
      });
    },
    kablo(L, v) {
      const k = v.t.kablo;
      a.ust(L, v);
      L.blok(buyuk(k.baslik, v.dil), 20, 42, 380, 12, { f: "x", pt: 26, min: 16, dikey: "alt", renk: M });
      const x = [20, 158, 288, 338, 400], y0 = 60, bh = 12;
      L.dolgu(20, y0, 380, bh, R);
      k.sutunlar.forEach((s, i) => L.blok(s, x[i] + 6, y0, x[i + 1] - x[i] - 8, bh, { f: "b", pt: 11, min: 8, renk: B, dikey: "orta" }));
      const sy = y0 + bh, sh = (281 - sy) / 7;
      I.kablo_satirlari.forEach((s, i) => {
        const y = sy + i * sh;
        if (i % 2 === 1) L.dolgu(20, y, 380, sh, RA);
        if (i < 6) L.cizgi(20, y + sh, 400, y + sh, RC, 0.25);
        L.blok(k.aciklama[i], x[0] + 6, y, x[1] - x[0] - 10, sh, { f: "s", pt: 13.5, min: 10, renk: M, dikey: "orta" });
        kablo(L, x[1] + 6, y + (sh - 6.4) / 2, 58, 6.4, s.renk);
        L.blok(k.renk[i], x[1] + 70, y, x[2] - x[1] - 72, sh, { f: "r", pt: 12.5, min: 9, renk: M, dikey: "orta" });
        L.blok(s.kod, x[2] + 6, y, x[3] - x[2] - 8, sh, { f: "b", pt: 13.5, renk: M, dikey: "orta" });
        L.blok(s.kesit, x[3] + 6, y, x[4] - x[3] - 8, sh, { f: "b", pt: 13.5, renk: R, dikey: "orta" });
      });
    },
  };

  // ================================================================ B: TEKNİK PAFTA
  const b = {
    X0: 6, X1: 414, Y0: 6, Y1: 291, RH: 5, AH: 24, HH: 26,
    kx(i) { return b.X0 + (i * (b.X1 - b.X0)) / 10; },
    cerceve(L, v) {
      const { X0, X1, Y0, Y1, RH, AH } = b;
      L.cerceve(X0, Y0, X1 - X0, Y1 - Y0, R, 0.4);
      L.cizgi(X0, Y0 + RH, X1, Y0 + RH, R, 0.25);
      for (let i = 0; i < 10; i++) {
        if (i > 0) L.cizgi(b.kx(i), Y0, b.kx(i), Y0 + RH, R, 0.25);
        L.yazi(String(i), (b.kx(i) + b.kx(i + 1)) / 2, Y0 + 3.6, { f: "m", pt: 7, renk: R, hiza: "orta" });
      }
      // antet: hücre sınırları cetvel bölmelerine oturur
      const ya = Y1 - AH;
      L.cizgi(X0, ya, X1, ya, R, 0.4);
      [5, 6, 7].forEach((i) => L.cizgi(b.kx(i), ya, b.kx(i), Y1, R, 0.25));
      const et = (x, m) => L.yazi(m, x + 3, ya + 5, { f: "m", pt: 7.5, renk: G });
      et(b.kx(0), v.t.kapak.belge);
      et(b.kx(5), v.t.kapak.tarih);
      et(b.kx(6), v.t.kapak.hazirlayan);
      et(b.kx(7), v.t.kapak.uretici);
      L.blok(v.baslik, b.kx(0) + 3, ya + 7, b.kx(5) - b.kx(0) - 6, AH - 8.5, { f: "b", pt: 15, min: 9, renk: M, dikey: "orta" });
      L.blok(v.tarih, b.kx(5) + 3, ya + 7, 35, AH - 8.5, { f: "s", pt: 11.5, min: 9, renk: M, dikey: "orta" });
      L.blok(v.hazirlayan, b.kx(6) + 3, ya + 7, 35, AH - 8.5, { f: "s", pt: 11.5, min: 9, renk: M, dikey: "orta" });
      L.yazi(v.sirket, b.kx(7) + 3, ya + 12.5, { f: "s", pt: 10.5, renk: M });
      L.yazi(v.web, b.kx(7) + 3, ya + 18.5, { f: "m", pt: 10.5, renk: R });
    },
    ust(L, v, baslik) {
      const { X0, X1, Y0, RH, HH } = b;
      const y = Y0 + RH;
      L.cizgi(X0, y + HH, X1, y + HH, R, 0.4);
      L.cizgi(b.kx(2), y, b.kx(2), y + HH, R, 0.25);
      const g = 60, lh = logoYuk(g);
      logo(L, X0 + (b.kx(2) - X0 - g) / 2, y + (HH - lh) / 2, g, R);
      L.blok(baslik, b.kx(2) + 8, y, X1 - b.kx(2) - 16, HH, { f: "x", pt: 26, min: 14, renk: M, dikey: "orta" });
    },
    kapak(L, v) {
      const { X0, X1, Y0, Y1, RH, AH } = b;
      b.cerceve(L, v);
      logo(L, X0 + 14, Y0 + RH + 16, 104, R, { yazi: false });
      const gen = b.kx(5) - X0 - 22;
      L.blok(v.ad, X0 + 14, 110, gen, 112, { f: "x", pt: 72, min: 26, satir: 1.06, renk: M, dikey: "alt" });
      L.blok(v.sonek, X0 + 14, 231, gen, 13, { f: "b", pt: 26, min: 14, renk: R, dikey: "ust" });
      // şema çizimi: baralar ve motor kolları, cetvel bölmelerine oturur
      const xb = b.kx(5) + 6, xs = X1 - 6;
      const bara = [24, 29, 34, 39], ad = ["L1", "L2", "L3", "N"];
      bara.forEach((y, i) => {
        L.cizgi(xb + 8, y, xs - 3, y, R, 0.3);
        L.yol(`M${xs - 3} ${y - 1.1}L${xs} ${y}L${xs - 3} ${y + 1.1}Z`, { dolgu: R });
        L.yazi(ad[i], xb, y + 1.05, { f: "s", pt: 8.5, renk: R });
      });
      [b.kx(6), b.kx(7.5), b.kx(9)].forEach((cx, i) => {
        motorKolu(L, cx, 39, i + 1, 1.12, { renk: R, tapa: bara.slice(0, 3), etiket: M, k: 0.28 });
      });
    },
    guvenlik(L, v) {
      const g = v.t.guvenlik;
      const { X0, X1, Y0, Y1, RH, AH, HH } = b;
      b.cerceve(L, v);
      b.ust(L, v, g.baslik);
      const yu = Y0 + RH + HH, ya = Y1 - AH, xo = b.kx(4);
      L.cizgi(xo, yu, xo, ya, R, 0.4);
      // sol: tehlike başlığı ve kritik maddeler
      const dh = 46;
      L.dolgu(X0, yu, xo - X0, dh, R);
      const ug = 40, ugy = (dh - (106 * ug) / 120) / 2;
      ucgen(L, X0 + 12, yu + ugy, ug, B, R);
      L.blok(g.tehlike, X0 + 60, yu, xo - X0 - 66, dh, { f: "x", pt: 36, min: 20, renk: B, dikey: "orta" });
      const sh = (ya - yu - dh) / 4;
      const kpt = Cizim.ortakBoyut(g.kritik, "s", xo - X0 - 20, sh - 6, 14, 9.5, 1.34);
      g.kritik.forEach((m, i) => {
        const y = yu + dh + i * sh;
        if (i > 0) L.cizgi(X0, y, xo, y, R, 0.25);
        L.blok(m, X0 + 10, y, xo - X0 - 20, sh, { f: "s", pt: kpt, min: kpt, satir: 1.34, renk: M, dikey: "orta" });
      });
      // sağ: kurallar
      const bh = 10, ng = 14;
      L.dolgu(xo, yu, X1 - xo, bh, R);
      L.blok(g.alt_baslik, xo + ng + 7, yu, X1 - xo - ng - 14, bh, { f: "b", pt: 11, min: 8, renk: B, dikey: "orta", ls: 0.2 });
      const rh = (ya - yu - bh) / 8;
      L.cizgi(xo + ng, yu + bh, xo + ng, ya, R, 0.25);
      const pt = Cizim.ortakBoyut(g.kurallar, "r", X1 - xo - ng - 14, rh - 4, 12, 8.5, 1.34);
      g.kurallar.forEach((m, i) => {
        const y = yu + bh + i * rh;
        if (i > 0) L.cizgi(xo, y, X1, y, RC, 0.25);
        L.blok(String(i + 1), xo, y, ng, rh, { f: "b", pt: 12, renk: R, hiza: "orta", dikey: "orta" });
        L.blok(m, xo + ng + 7, y, X1 - xo - ng - 14, rh, { f: "r", pt, min: pt, satir: 1.34, renk: M, dikey: "orta" });
      });
    },
    kablo(L, v) {
      const k = v.t.kablo;
      const { X0, X1, Y0, Y1, RH, AH, HH } = b;
      b.cerceve(L, v);
      b.ust(L, v, buyuk(k.baslik, v.dil));
      const yu = Y0 + RH + HH, ya = Y1 - AH;
      const x = [X0, b.kx(4), b.kx(7), b.kx(8), X1];
      const bh = 10;
      L.dolgu(X0, yu, X1 - X0, bh, R);
      k.sutunlar.forEach((s, i) => L.blok(s, x[i] + 7, yu, x[i + 1] - x[i] - 10, bh, { f: "b", pt: 11, min: 8, renk: B, dikey: "orta" }));
      const sh = (ya - yu - bh) / 7;
      [1, 2, 3].forEach((i) => L.cizgi(x[i], yu + bh, x[i], ya, RC, 0.25));
      I.kablo_satirlari.forEach((s, i) => {
        const y = yu + bh + i * sh;
        if (i > 0) L.cizgi(X0, y, X1, y, RC, 0.25);
        L.blok(k.aciklama[i], x[0] + 7, y, x[1] - x[0] - 12, sh, { f: "s", pt: 13.5, min: 10, renk: M, dikey: "orta" });
        kablo(L, x[1] + 7, y + (sh - 4.6) / 2, 50, 4.6, s.renk);
        L.blok(k.renk[i], x[1] + 63, y, x[2] - x[1] - 65, sh, { f: "r", pt: 12.5, min: 9, renk: M, dikey: "orta" });
        L.blok(s.kod, x[2] + 7, y, x[3] - x[2] - 9, sh, { f: "b", pt: 13.5, renk: M, dikey: "orta" });
        // kesit noktası: alan, kesitle orantılı
        const rMax = Math.sqrt(2.5 / Math.PI) * 3.4, r = Math.sqrt(s.mm2 / Math.PI) * 3.4;
        L.daire(x[3] + 7 + rMax, y + sh / 2, r, { dolgu: R });
        L.blok(s.kesit, x[3] + 7 + 2 * rMax + 4, y, x[4] - x[3] - 7 - 2 * rMax - 6, sh, { f: "b", pt: 13.5, renk: M, dikey: "orta" });
      });
    },
  };

  // ================================================================ C: KURUMSAL BANT
  const c = {
    ust(L, v) {
      L.dolgu(0, 0, W, 5, R);
      const g = 60, lh = logoYuk(g);
      logo(L, 20, 5 + (30 - lh) / 2, g, R);
      L.blok(v.baslik, 120, 11, 280, 8, { f: "b", pt: 14, min: 9, renk: M, hiza: "sag", dikey: "orta" });
      const m1 = `${v.t.kapak.tarih}: ${v.tarih}`, m2 = `${v.t.kapak.hazirlayan}: ${v.hazirlayan}`;
      L.yazi(`${m1}   |   ${m2}`, 400, 26.5, { f: "m", pt: 9.5, renk: G, hiza: "sag" });
    },
    alt(L, v) {
      L.yazi(v.sirket, 20, 288, { f: "s", pt: 8.5, renk: M });
      L.yazi(v.web, 400, 288, { f: "s", pt: 8.5, renk: R, hiza: "sag" });
      L.dolgu(0, 292, W, 5, R);
    },
    kapak(L, v) {
      // üst ve alt ince bant, ortada başlık bandı
      L.dolgu(0, 0, W, 8, R);
      L.dolgu(0, 289, W, 8, R);
      const lg = 118, lh = logoYuk(lg);
      logo(L, (W - lg) / 2, 34, lg, R);
      const by = 104, bh = 90;
      L.dolgu(0, by, W, bh, R);
      const gen = 340, x0 = (W - gen) / 2;
      const ad = L.blok(v.ad, x0, by + 10, gen, 46, { f: "x", pt: 54, min: 22, satir: 1.08, renk: B, hiza: "orta", dikey: "alt" });
      L.blok(v.sonek, x0, by + 64, gen, 12, { f: "s", pt: 24, min: 14, renk: B, hiza: "orta", dikey: "ust", ls: 0.35 });
      // bilgi satırı
      const cx = W / 2, gy = 214;
      L.cizgi(cx, gy, cx, gy + 18, R, 0.3);
      L.yazi(v.t.kapak.tarih, cx - 12, gy + 6, { f: "m", pt: 10.5, renk: G, hiza: "sag" });
      L.yazi(v.tarih, cx - 12, gy + 16, { f: "b", pt: 17, renk: M, hiza: "sag" });
      L.yazi(v.t.kapak.hazirlayan, cx + 12, gy + 6, { f: "m", pt: 10.5, renk: G });
      L.yazi(v.hazirlayan, cx + 12, gy + 16, { f: "b", pt: 17, renk: M });
      L.yazi(v.sirket, cx, 268, { f: "b", pt: 11, renk: M, hiza: "orta" });
      L.yazi(v.web, cx, 274.5, { f: "m", pt: 11, renk: R, hiza: "orta" });
    },
    guvenlik(L, v) {
      const g = v.t.guvenlik;
      c.ust(L, v);
      const by = 35, bh = 46;
      L.dolgu(0, by, W, bh, R);
      const ug = 38, uh = (106 * ug) / 120;
      ucgen(L, 20, by + (bh - uh) / 2, ug, B, R);
      const t = L.blok(g.tehlike, 66, by, 92, bh, { f: "x", pt: 36, min: 20, renk: B, dikey: "orta" });
      L.cizgi(164, by + 11, 164, by + bh - 11, RT, 0.3);
      L.blok(g.baslik, 174, by + 11, 226, 12, { f: "b", pt: 26, min: 14, renk: B, dikey: "alt" });
      L.blok(g.alt_baslik, 174, by + 27, 226, 7, { f: "m", pt: 11.5, min: 8, renk: B, dikey: "ust", ls: 0.2 });
      // kartlar: dört eşit sütun
      const cy = 88, chh = 78, ara = 5, cg = (380 - 3 * ara) / 4;
      const ikon = ["gerilim", "uyari", "personel", "belge"];
      const pt = Cizim.ortakBoyut(g.kritik, "s", cg - 14, chh - 34, 14, 9.5, 1.34);
      g.kritik.forEach((m, i) => {
        const x = 20 + i * (cg + ara);
        L.dolgu(x, cy, cg, chh, RA);
        L.dolgu(x, cy, cg, 1.3, R);
        simge(L, ikon[i], x + 7, cy + 8, 14, R);
        L.blok(m, x + 7, cy + 27, cg - 14, chh - 32, { f: "s", pt, min: pt, satir: 1.34, renk: M, dikey: "ust" });
      });
      // kurallar
      const sy = 172, sh = 27, sg = 186;
      const rp = Cizim.ortakBoyut(g.kurallar, "r", sg - 8, sh - 4, 11.5, 8, 1.36);
      g.kurallar.forEach((m, i) => {
        const x = i < 4 ? 20 : 214, y = sy + (i % 4) * sh;
        if (i % 4) L.cizgi(x, y, x + sg, y, RC, 0.25);
        L.dolgu(x, y + sh / 2 - 1.2, 2.4, 2.4, R);
        L.blok(m, x + 8, y, sg - 8, sh, { f: "r", pt: rp, min: rp, satir: 1.36, renk: M, dikey: "orta" });
      });
      c.alt(L, v);
    },
    kablo(L, v) {
      const k = v.t.kablo;
      c.ust(L, v);
      L.blok(k.baslik, 20, 40, 380, 13, { f: "x", pt: 26, min: 16, renk: M, dikey: "orta" });
      const y0 = 58, ara = 5, cg = (380 - 3 * ara) / 4, chh = (282 - y0 - ara) / 2, bh = 46;
      const satirlar = I.kablo_satirlari;
      satirlar.forEach((s, i) => {
        const x = 20 + (i % 4) * (cg + ara), y = y0 + Math.floor(i / 4) * (chh + ara);
        L.dolgu(x, y, cg, chh, RA);
        // renk bandı
        if (s.renk.length === 1) L.dolgu(x, y, cg, bh, s.renk[0]);
        else L.kirp(Liste.yuvarlakYol(x, y, cg, bh, 0.01), (K) => {
          K.dolgu(x, y, cg, bh, s.renk[0]);
          const adim = bh * 1.1;
          for (let a = -bh * 1.2; a < cg + bh; a += adim) K.yol(`M${x + a} ${y + bh}L${x + a + adim / 2} ${y + bh}L${x + a + adim / 2 + bh} ${y}L${x + a + bh} ${y}Z`, { dolgu: s.renk[1] });
        });
        // kod: şeritli kabloda beyaz plaka üstünde
        const koyu = s.renk.length > 1 || s.renk[0] === "#7CC6F4";
        if (s.renk.length > 1) {
          const gnis = Cizim.olc(s.kod, "x", 25, 0) + 8;
          L.dolgu(x + 4, y + bh - 16, gnis, 12, B);
        }
        L.yazi(s.kod, x + 8, y + bh - 6.4, { f: "x", pt: 25, renk: koyu ? M : B });
        L.blok(k.aciklama[i], x + 8, y + bh + 7, cg - 16, 22, { f: "b", pt: 13.5, min: 10, satir: 1.28, renk: M, dikey: "ust" });
        const gy = y + chh - 15;
        L.yazi(k.sutunlar[1], x + 8, gy, { f: "m", pt: 8, renk: G });
        L.yazi(k.renk[i], x + 8, gy + 7.2, { f: "b", pt: 12.5, renk: M });
        L.yazi(k.sutunlar[3], x + cg / 2 - 2, gy, { f: "m", pt: 8, renk: G });
        L.yazi(s.kesit, x + cg / 2 - 2, gy + 7.2, { f: "b", pt: 12.5, renk: R });
      });
      const x = 20 + 3 * (cg + ara), y = y0 + chh + ara;
      L.dolgu(x, y, cg, chh, R);
      L.yazi(k.sutunlar[2], x + 8, y + chh / 2 - 2, { f: "x", pt: 25, renk: B });
      L.blok(k.dipnot, x + 8, y + chh / 2 + 3, cg - 16, 20, { f: "m", pt: 12, min: 9, renk: B, dikey: "ust" });
      c.alt(L, v);
    },
  };

  const AILE = { A: a, B: b, C: c };

  /** Bir sayfanın çizim listesini üretir. */
  function sayfa(tip, kod, sec) {
    const v = veri(sec.dil, sec.ad, sec.tarih);
    const L = new Liste();
    L.dolgu(0, 0, W, H, B);
    AILE[kod][tip](L, v);
    if (kod === "A" && tip !== "kapak") a.alt(L, v);
    return L;
  }

  // Seçilen tasarım tarayıcıda saklanır; iki HTML de aynı kaydı okur
  // Ayrıca veritabanına yazılır (ana ekran), böylece her cihazda aynıdır
  const SECIM_ANAHTARI = "sema:tasarim";
  let bellek = null;
  function secimOku() {
    const s = { kapak: "A", guvenlik: "A", kablo: "A" };
    let k = bellek;
    try { k = JSON.parse(localStorage.getItem(SECIM_ANAHTARI)) || bellek; } catch (e) { /* kayıt yoksa bellekteki */ }
    for (const t of Object.keys(s)) if (k && AILE[k[t]]) s[t] = k[t];
    return s;
  }
  function secimYaz(tip, kod) {
    const s = secimOku();
    if (typeof tip === "object") Object.assign(s, tip); else s[tip] = kod;
    for (const t of Object.keys(s)) if (!AILE[s[t]]) s[t] = "A";
    bellek = s;
    try { localStorage.setItem(SECIM_ANAHTARI, JSON.stringify(s)); } catch (e) { /* depolama kapalıysa bu oturumda kalır */ }
    return s;
  }

  window.Tasarim = {
    sayfa, veri, adTemizle, tarihYaz, W, H, secimOku, secimYaz, SECIM_ANAHTARI,
    KODLAR: ["A", "B", "C"],
    BILGI: {
      A: { ad: "Kırmızı Panel", aciklama: "Kırmızı panel ve üst bant, güçlü başlık" },
      B: { ad: "Teknik Pafta", aciklama: "Şema paftalarıyla aynı cetvel ve antet düzeni" },
      C: { ad: "Kurumsal Bant", aciklama: "Simetrik yerleşim, ortada kırmızı başlık bandı" },
    },
    TIPLER: [
      { kod: "kapak", ad: "Kapak" },
      { kod: "guvenlik", ad: "Safety Regulations" },
      { kod: "kablo", ad: "Cable Color Coding" },
    ],
  };
})();
