// Çizim katmanı. Sayfalar önce bir çizim listesine dökülür; aynı liste hem ekrana (Canvas) hem PDF'e
// (pdf-lib) çizilir. Böylece galeride görülen, PDF'e basılanla birebir aynıdır. Ölçüler mm, yazı boyutu pt.
(function () {
  "use strict";
  const MM_PT = 72 / 25.4;
  const PT_MM = 25.4 / 72;
  const OZELLIK = { liga: false, clig: false, calt: false, dlig: false };

  // ---------------------------------------------------------------- fontlar
  const fontlar = {};
  function font(k) {
    if (!fontlar[k]) {
      const ikili = Uint8Array.from(atob(window.FONTLAR[k]), (c) => c.charCodeAt(0));
      fontlar[k] = { bayt: ikili, f: fontkit.create(ikili), duzen: new Map(), yol: new Map() };
    }
    return fontlar[k];
  }

  /** Metni dizer: glif listesi ve kerning dahil ilerlemeler (font birimi). */
  function duzen(k, metin) {
    const F = font(k);
    let d = F.duzen.get(metin);
    if (!d) {
      const r = F.f.layout(metin, OZELLIK);
      d = {
        glif: r.glyphs,
        ilerle: r.positions.map((p) => p.xAdvance),
        taban: r.glyphs.map((g) => g.advanceWidth),
      };
      F.duzen.set(metin, d);
    }
    return d;
  }

  function olc(metin, k, pt, ls) {
    if (!metin) return 0;
    const F = font(k);
    const d = duzen(k, metin);
    let t = 0;
    for (const a of d.ilerle) t += a;
    return (t * pt * PT_MM) / F.f.unitsPerEm + (ls || 0) * (d.ilerle.length - 1);
  }

  /** Satırlara böler: boşluklardan, gerekirse kısa çizgi ve eğik çizgiden sonra. */
  function sar(metin, k, pt, gen, ls) {
    const parcalar = [];
    String(metin).split(/\s+/).filter(Boolean).forEach((soz, i) => {
      const alt = soz.split(/(?<=[-\/])/);
      alt.forEach((a, j) => parcalar.push({ m: a, bosluk: i > 0 && j === 0 }));
    });
    const satirlar = [];
    let s = "";
    for (const p of parcalar) {
      const aday = s + (p.bosluk && s ? " " : "") + p.m;
      if (!s || olc(aday, k, pt, ls) <= gen) {
        s = aday;
      } else {
        satirlar.push(s);
        s = p.m;
      }
    }
    if (s) satirlar.push(s);
    return satirlar.length ? satirlar : [""];
  }

  const buyukHarf = (k) => {
    const f = font(k).f;
    return (f.capHeight || f.unitsPerEm * 0.7) / f.unitsPerEm;
  };

  /** Metnin kutuya sığdığı en büyük boyutu bulur. */
  function sigdir(metin, k, gen, yuk, azami, asgari, satir, ls) {
    const uyar = (pt) => {
      const sat = sar(metin, k, pt, gen, ls);
      const h = (sat.length - 1) * pt * PT_MM * satir + pt * PT_MM * buyukHarf(k);
      return h <= yuk && sat.every((x) => olc(x, k, pt, ls) <= gen + 0.01);
    };
    if (uyar(azami)) return azami;
    let alt = asgari, ust = azami;
    for (let i = 0; i < 12; i++) {
      const orta = (alt + ust) / 2;
      if (uyar(orta)) alt = orta; else ust = orta;
    }
    return alt;
  }

  // ---------------------------------------------------------------- SVG yolu ayrıştırma
  const yolOnbellek = new Map();

  function yayBezier(x0, y0, rx, ry, fi, buyuk, super_, x, y) {
    // SVG yayını kübik Bezier'lere çevirir (W3C uygulama notu)
    if (rx === 0 || ry === 0) return [["L", x, y]];
    rx = Math.abs(rx); ry = Math.abs(ry);
    const f = (fi * Math.PI) / 180, cf = Math.cos(f), sf = Math.sin(f);
    const dx = (x0 - x) / 2, dy = (y0 - y) / 2;
    const xp = cf * dx + sf * dy, yp = -sf * dx + cf * dy;
    const l = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
    if (l > 1) { rx *= Math.sqrt(l); ry *= Math.sqrt(l); }
    const pay = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
    const payda = rx * rx * yp * yp + ry * ry * xp * xp;
    const k = (buyuk === super_ ? -1 : 1) * Math.sqrt(Math.max(0, pay / payda));
    const cxp = (k * rx * yp) / ry, cyp = (-k * ry * xp) / rx;
    const cx = cf * cxp - sf * cyp + (x0 + x) / 2, cy = sf * cxp + cf * cyp + (y0 + y) / 2;
    const aci = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = aci(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
    let dt = aci((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
    if (!super_ && dt > 0) dt -= 2 * Math.PI;
    if (super_ && dt < 0) dt += 2 * Math.PI;
    const n = Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9);
    const cikti = [];
    const d = dt / n, q = (4 / 3) * Math.tan(d / 4);
    let a = t1;
    for (let i = 0; i < n; i++) {
      const b = a + d;
      const c1 = [Math.cos(a) - q * Math.sin(a), Math.sin(a) + q * Math.cos(a)];
      const c2 = [Math.cos(b) + q * Math.sin(b), Math.sin(b) - q * Math.cos(b)];
      const son = [Math.cos(b), Math.sin(b)];
      const don = (p) => [cf * rx * p[0] - sf * ry * p[1] + cx, sf * rx * p[0] + cf * ry * p[1] + cy];
      const A = don(c1), B = don(c2), C = don(son);
      cikti.push(["C", A[0], A[1], B[0], B[1], C[0], C[1]]);
      a = b;
    }
    return cikti;
  }

  /** SVG yolunu mutlak M/L/C/Z komutlarına indirger. */
  function yolCoz(d) {
    let c = yolOnbellek.get(d);
    if (c) return c;
    c = [];
    const tk = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) || [];
    let i = 0, x = 0, y = 0, bx = 0, by = 0, sonC = null, sonQ = null, kmt = "";
    const sayi = () => parseFloat(tk[i++]);
    const sayiVar = () => i < tk.length && !/^[a-zA-Z]$/.test(tk[i]);
    while (i < tk.length) {
      if (/^[a-zA-Z]$/.test(tk[i])) kmt = tk[i++];
      const rel = kmt === kmt.toLowerCase();
      const K = kmt.toUpperCase();
      if (K === "Z") { c.push(["Z"]); x = bx; y = by; sonC = sonQ = null; continue; }
      do {
        if (K === "M") {
          const a = sayi() + (rel ? x : 0), b = sayi() + (rel ? y : 0);
          c.push(["M", a, b]); x = bx = a; y = by = b; kmt = rel ? "l" : "L"; sonC = sonQ = null;
          if (!sayiVar()) break;
          const a2 = sayi() + (rel ? x : 0), b2 = sayi() + (rel ? y : 0);
          c.push(["L", a2, b2]); x = a2; y = b2;
        } else if (K === "L") {
          const a = sayi() + (rel ? x : 0), b = sayi() + (rel ? y : 0);
          c.push(["L", a, b]); x = a; y = b; sonC = sonQ = null;
        } else if (K === "H") {
          x = sayi() + (rel ? x : 0); c.push(["L", x, y]); sonC = sonQ = null;
        } else if (K === "V") {
          y = sayi() + (rel ? y : 0); c.push(["L", x, y]); sonC = sonQ = null;
        } else if (K === "C" || K === "S") {
          let a1, b1;
          if (K === "C") { a1 = sayi() + (rel ? x : 0); b1 = sayi() + (rel ? y : 0); }
          else { a1 = sonC ? 2 * x - sonC[0] : x; b1 = sonC ? 2 * y - sonC[1] : y; }
          const a2 = sayi() + (rel ? x : 0), b2 = sayi() + (rel ? y : 0);
          const a = sayi() + (rel ? x : 0), b = sayi() + (rel ? y : 0);
          c.push(["C", a1, b1, a2, b2, a, b]); sonC = [a2, b2]; sonQ = null; x = a; y = b;
        } else if (K === "Q" || K === "T") {
          let qx, qy;
          if (K === "Q") { qx = sayi() + (rel ? x : 0); qy = sayi() + (rel ? y : 0); }
          else { qx = sonQ ? 2 * x - sonQ[0] : x; qy = sonQ ? 2 * y - sonQ[1] : y; }
          const a = sayi() + (rel ? x : 0), b = sayi() + (rel ? y : 0);
          c.push(["C", x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), a + (2 / 3) * (qx - a), b + (2 / 3) * (qy - b), a, b]);
          sonQ = [qx, qy]; sonC = null; x = a; y = b;
        } else if (K === "A") {
          const rx = sayi(), ry = sayi(), fi = sayi(), bu = sayi(), su = sayi();
          const a = sayi() + (rel ? x : 0), b = sayi() + (rel ? y : 0);
          c.push(...yayBezier(x, y, rx, ry, fi, bu, su, a, b)); x = a; y = b; sonC = sonQ = null;
        } else {
          i++;
        }
      } while (sayiVar());
    }
    yolOnbellek.set(d, c);
    return c;
  }

  // ---------------------------------------------------------------- çizim listesi
  class Liste {
    constructor() { this.op = []; this.uyari = []; this.fontlar = new Set(); }

    dolgu(x, y, g, h, renk) { this.op.push({ t: "kutu", x, y, g, h, dolgu: renk }); return this; }

    cerceve(x, y, g, h, renk, k) { this.op.push({ t: "kutu", x, y, g, h, cizgi: renk, k }); return this; }

    cizgi(x1, y1, x2, y2, renk, k) { this.op.push({ t: "cizgi", x1, y1, x2, y2, renk, k }); return this; }

    /** SVG yolu çizer. sec: x, y, o (ölçek), dolgu, cizgi, k, cift (çift-tek dolgu), yuvarlak */
    yol(d, sec) { this.op.push(Object.assign({ t: "yol", d, x: 0, y: 0, o: 1 }, sec)); return this; }

    daire(cx, cy, r, sec) {
      const d = `M${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}Z`;
      return this.yol(d, sec);
    }

    /** Yuvarlak köşeli dikdörtgen yolu */
    static yuvarlakYol(x, y, g, h, r) {
      return `M${x + r} ${y}H${x + g - r}A${r} ${r} 0 0 1 ${x + g} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + g - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
    }

    /** Kırpılmış çizim grubu */
    kirp(d, fn) {
      this.op.push({ t: "kirp", d });
      fn(this);
      this.op.push({ t: "kirp_son" });
      return this;
    }

    /** Tek satır yazı. y taban çizgisidir. */
    yazi(s, x, y, sec) {
      const k = sec.f || "r", pt = sec.pt || 12, ls = sec.ls || 0;
      if (s === "" || s == null) return this;
      const g = olc(s, k, pt, ls);
      const x0 = sec.hiza === "sag" ? x - g : sec.hiza === "orta" ? x - g / 2 : x;
      this.fontlar.add(k);
      this.op.push({ t: "yazi", s: String(s), f: k, pt, ls, x: x0, y, renk: sec.renk || "#000000" });
      return this;
    }

    /**
     * Kutu içinde çok satırlı yazı. Sığmazsa boyut küçülür.
     * sec: f, pt (azami), min, satir (satır aralığı katsayısı), renk, hiza, dikey (ust|orta|alt), ls
     * Düşey konum büyük harf yüksekliğine göredir: yazı kutuda optik olarak ortalanır.
     */
    blok(s, x, y, g, h, sec) {
      const k = sec.f || "r", satir = sec.satir || 1.34, ls = sec.ls || 0;
      const pt = sigdir(s, k, g, h, sec.pt, sec.min || sec.pt * 0.5, satir, ls);
      const sat = sar(s, k, pt, g, ls);
      const lh = pt * PT_MM * satir, cap = pt * PT_MM * buyukHarf(k);
      const toplam = (sat.length - 1) * lh + cap;
      if (toplam > h + 0.01 || sat.some((m) => olc(m, k, pt, ls) > g + 0.01)) {
        this.uyari.push(`Sığmadı: "${String(s).slice(0, 40)}" (${pt.toFixed(1)} pt)`);
      }
      const ust = sec.dikey === "alt" ? y + h - toplam : sec.dikey === "orta" ? y + (h - toplam) / 2 : y;
      const xa = sec.hiza === "sag" ? x + g : sec.hiza === "orta" ? x + g / 2 : x;
      sat.forEach((m, i) => this.yazi(m, xa, ust + cap + i * lh, { f: k, pt, ls, renk: sec.renk, hiza: sec.hiza }));
      return { pt, satir: sat.length, ust, alt: ust + toplam, cap };
    }
  }

  /** Grup için ortak yazı boyutu: her metin kendi kutusuna sığar. */
  function ortakBoyut(metinler, k, gen, yuk, azami, asgari, satir, ls) {
    let pt = azami;
    for (const m of metinler) pt = Math.min(pt, sigdir(m, k, gen, yuk, azami, asgari, satir || 1.34, ls));
    return pt;
  }

  // ---------------------------------------------------------------- Canvas çizici
  function cizCanvas(ctx, liste) {
    const bicimlendir = (o) => {
      if (o.dolgu) { ctx.fillStyle = o.dolgu; }
      if (o.cizgi) { ctx.strokeStyle = o.cizgi; ctx.lineWidth = o.k || 0.25; ctx.lineJoin = o.yuvarlak ? "round" : "miter"; ctx.lineCap = o.yuvarlak ? "round" : "butt"; }
    };
    for (const o of liste.op) {
      if (o.t === "kutu") {
        if (o.dolgu) { ctx.fillStyle = o.dolgu; ctx.fillRect(o.x, o.y, o.g, o.h); }
        if (o.cizgi) { ctx.strokeStyle = o.cizgi; ctx.lineWidth = o.k || 0.25; ctx.lineJoin = "miter"; ctx.strokeRect(o.x, o.y, o.g, o.h); }
      } else if (o.t === "cizgi") {
        ctx.strokeStyle = o.renk; ctx.lineWidth = o.k || 0.25; ctx.lineCap = "butt";
        ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
      } else if (o.t === "yol") {
        ctx.save();
        ctx.translate(o.x, o.y); ctx.scale(o.o, o.o);
        const p = new Path2D(o.d);
        bicimlendir(o);
        if (o.dolgu) ctx.fill(p, o.cift ? "evenodd" : "nonzero");
        if (o.cizgi) { ctx.lineWidth = (o.k || 0.25) / o.o; ctx.stroke(p); }
        ctx.restore();
      } else if (o.t === "kirp") {
        ctx.save(); ctx.clip(new Path2D(o.d));
      } else if (o.t === "kirp_son") {
        ctx.restore();
      } else if (o.t === "yazi") {
        const F = font(o.f), d = duzen(o.f, o.s), s = (o.pt * PT_MM) / F.f.unitsPerEm;
        ctx.fillStyle = o.renk;
        let x = o.x;
        d.glif.forEach((g, i) => {
          let p = F.yol.get(g.id);
          if (!p) { p = new Path2D(g.path.toSVG()); F.yol.set(g.id, p); }
          ctx.save(); ctx.translate(x, o.y); ctx.scale(s, -s); ctx.fill(p); ctx.restore();
          x += d.ilerle[i] * s + o.ls;
        });
      }
    }
  }

  // ---------------------------------------------------------------- PDF çizici
  const rgb = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  /** Listeyi pdf-lib sayfasına yazar. pdfFontlar: {anahtar: PDFFont} */
  function cizPdf(sayfa, liste, pdfFontlar) {
    const P = window.PDFLib;
    const OP = P.PDFOperator, AD = P.PDFOperatorNames;
    const { width: W, height: H } = sayfa.getSize();
    const o_ = Math.min(W / 420, H / 297);        // pt/mm
    const ox = (W - 420 * o_) / 2, oy = (H - 297 * o_) / 2;
    const X = (x) => ox + x * o_;
    const Y = (y) => H - oy - y * o_;
    const baglam = sayfa.doc.context;
    const yaz = [];
    const sayi = (v) => P.PDFNumber.of(Math.round(v * 1000) / 1000);
    const dolguR = (h) => { const c = rgb(h); yaz.push(OP.of(AD.NonStrokingColorRgb, c.map(sayi))); };
    const cizgiR = (h) => { const c = rgb(h); yaz.push(OP.of(AD.StrokingColorRgb, c.map(sayi))); };
    const yolYaz = (d, tx, ty, s) => {
      for (const c of yolCoz(d)) {
        if (c[0] === "M") yaz.push(OP.of(AD.MoveTo, [sayi(X(tx + c[1] * s)), sayi(Y(ty + c[2] * s))]));
        else if (c[0] === "L") yaz.push(OP.of(AD.LineTo, [sayi(X(tx + c[1] * s)), sayi(Y(ty + c[2] * s))]));
        else if (c[0] === "C") yaz.push(OP.of(AD.AppendBezierCurve, [sayi(X(tx + c[1] * s)), sayi(Y(ty + c[2] * s)), sayi(X(tx + c[3] * s)), sayi(Y(ty + c[4] * s)), sayi(X(tx + c[5] * s)), sayi(Y(ty + c[6] * s))]));
        else yaz.push(OP.of(AD.ClosePath));
      }
    };
    yaz.push(OP.of(AD.PushGraphicsState));
    for (const o of liste.op) {
      if (o.t === "kutu") {
        yaz.push(OP.of(AD.AppendRectangle, [sayi(X(o.x)), sayi(Y(o.y + o.h)), sayi(o.g * o_), sayi(o.h * o_)]));
        if (o.dolgu) { dolguR(o.dolgu); yaz.push(OP.of(AD.FillNonZero)); }
        else { cizgiR(o.cizgi); yaz.push(OP.of(AD.SetLineWidth, [sayi((o.k || 0.25) * o_)])); yaz.push(OP.of(AD.StrokePath)); }
      } else if (o.t === "cizgi") {
        cizgiR(o.renk);
        yaz.push(OP.of(AD.SetLineWidth, [sayi((o.k || 0.25) * o_)]), OP.of(AD.SetLineCapStyle, [sayi(0)]));
        yaz.push(OP.of(AD.MoveTo, [sayi(X(o.x1)), sayi(Y(o.y1))]), OP.of(AD.LineTo, [sayi(X(o.x2)), sayi(Y(o.y2))]), OP.of(AD.StrokePath));
      } else if (o.t === "yol") {
        yolYaz(o.d, o.x, o.y, o.o);
        if (o.dolgu) dolguR(o.dolgu);
        if (o.cizgi) {
          cizgiR(o.cizgi);
          yaz.push(OP.of(AD.SetLineWidth, [sayi((o.k || 0.25) * o_)]));
          yaz.push(OP.of(AD.SetLineCapStyle, [sayi(o.yuvarlak ? 1 : 0)]), OP.of(AD.SetLineJoinStyle, [sayi(o.yuvarlak ? 1 : 0)]));
        }
        if (o.dolgu && o.cizgi) yaz.push(OP.of(AD.FillNonZeroAndStroke));
        else if (o.dolgu) yaz.push(OP.of(o.cift ? AD.FillEvenOdd : AD.FillNonZero));
        else yaz.push(OP.of(AD.StrokePath));
      } else if (o.t === "kirp") {
        yaz.push(OP.of(AD.PushGraphicsState));
        yolYaz(o.d, 0, 0, 1);
        yaz.push(OP.of(AD.ClipNonZero), OP.of(AD.EndPath));
      } else if (o.t === "kirp_son") {
        yaz.push(OP.of(AD.PopGraphicsState));
      } else if (o.t === "yazi") {
        const pf = pdfFontlar[o.f];
        const F = font(o.f), d = duzen(o.f, o.s);
        const anahtar = sayfa.node.newFontDictionary(pf.name, pf.ref);
        const hex = pf.encodeText(o.s).asString();
        const dizi = baglam.obj([]);
        const birim = 1000 / F.f.unitsPerEm;
        const pt = o.pt * (o_ / MM_PT);        // sayfa A3 değilse yazı da ölçeklenir
        let tampon = "";
        for (let i = 0; i < d.glif.length; i++) {
          tampon += hex.slice(i * 4, i * 4 + 4);
          if (i === d.glif.length - 1) break;
          // Kerning ve harf aralığı: varsayılan ilerlemeden fark (TJ binde em cinsinden, pozitif geri çeker)
          const fark = (d.ilerle[i] - d.taban[i]) * birim + (o.ls / (o.pt * PT_MM)) * 1000;
          if (Math.abs(fark) > 0.01) {
            dizi.push(P.PDFHexString.of(tampon));
            dizi.push(P.PDFNumber.of(Math.round(-fark * 100) / 100));
            tampon = "";
          }
        }
        if (tampon) dizi.push(P.PDFHexString.of(tampon));
        dolguR(o.renk);
        yaz.push(OP.of(AD.BeginText), OP.of(AD.SetFontAndSize, [anahtar, sayi(pt)]));
        yaz.push(OP.of(AD.SetTextMatrix, [sayi(1), sayi(0), sayi(0), sayi(1), sayi(X(o.x)), sayi(Y(o.y))]));
        yaz.push(OP.of(AD.ShowTextAdjusted, [dizi]), OP.of(AD.EndText));
      }
    }
    yaz.push(OP.of(AD.PopGraphicsState));
    sayfa.pushOperators(...yaz);
  }

  window.Cizim = { Liste, cizCanvas, cizPdf, olc, sar, sigdir, ortakBoyut, font, OZELLIK, PT_MM };
})();
