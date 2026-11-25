// Şema içeriği çevirisi. Sayfanın içerik akışını tarar, yazıları etiketlere ayırır, hafızadaki karşılığını bulur,
// özgün yazıyı silip çeviriyi serbest alana sığacak boyutta yeniden basar. Çizgilere ve diğer yazılara dokunmaz.
// Yazılar sayfanın kendi akışında veya belgede bir kez kullanılan form nesnelerinin içinde olabilir.
(function () {
  "use strict";
  const P = window.PDFLib;
  const { PDFName, PDFDict, PDFArray, PDFRawStream, PDFStream, PDFNumber, PDFRef, decodePDFRawStream } = P;
  const ad = (s) => PDFName.of(s);
  const BIRIM = [1, 0, 0, 1, 0, 0];
  const FONT = "sema";
  const FONT_ADI = "CeviriFont";

  /** a matrisi önce, b matrisi sonra uygulanır (PDF sırası). */
  const carp = (a, b) => [
    a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
  ];
  const yuvarla = (v) => String(Math.round(v * 10000) / 10000);

  function baytMetin(b) {
    let o = "";
    for (let i = 0; i < b.length; i += 8192) o += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return o;
  }
  function metinBayt(s) {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
    return b;
  }
  const akisBayt = (st) => (st instanceof PDFRawStream ? decodePDFRawStream(st).decode() : st.getContents());

  // ---------------------------------------------------------------- içerik akışı okuyucu
  class Kelime { constructor(k) { this.k = k; } }
  const bosMu = (c) => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
  const ayracMi = (c) => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;

  /** Akıştaki her işleci, işlenenleri ve bayt aralığıyla birlikte yap(k, args, bas, son) olarak verir. */
  function akisGez(s, yap) {
    const n = s.length;
    let i = 0;
    const atla = () => {
      while (i < n) {
        const c = s.charCodeAt(i);
        if (bosMu(c)) i++;
        else if (c === 37) { while (i < n && s.charCodeAt(i) !== 10 && s.charCodeAt(i) !== 13) i++; }
        else break;
      }
    };
    const dizge = () => {
      i++;
      let d = 1, o = "";
      while (i < n) {
        const h = s[i];
        if (h === "\\") {
          const e = s[i + 1];
          i += 2;
          if (e === "n") o += "\n";
          else if (e === "r") o += "\r";
          else if (e === "t") o += "\t";
          else if (e === "b") o += "\b";
          else if (e === "f") o += "\f";
          else if (e === "\r") { if (s[i] === "\n") i++; }
          else if (e === "\n") { /* satır devamı */ }
          else if (e >= "0" && e <= "7") {
            let v = e.charCodeAt(0) - 48, k = 0;
            while (k < 2 && s[i] >= "0" && s[i] <= "7") { v = v * 8 + s.charCodeAt(i) - 48; i++; k++; }
            o += String.fromCharCode(v & 255);
          } else if (e !== undefined) o += e;
        } else if (h === "(") { d++; o += h; i++; }
        else if (h === ")") { d--; i++; if (d === 0) break; o += h; }
        else if (h === "\r") { o += "\n"; i++; if (s[i] === "\n") i++; }
        else { o += h; i++; }
      }
      return { yazi: o };
    };
    const onaltilik = () => {
      i++;
      let h = "";
      while (i < n && s[i] !== ">") { if (!bosMu(s.charCodeAt(i))) h += s[i]; i++; }
      i++;
      if (h.length % 2) h += "0";
      let o = "";
      for (let k = 0; k < h.length; k += 2) o += String.fromCharCode(parseInt(h.substr(k, 2), 16));
      return { yazi: o };
    };
    const deger = () => {
      atla();
      if (i >= n) return undefined;
      const c = s.charCodeAt(i);
      if (c === 40) return dizge();
      if (c === 60) {
        if (s.charCodeAt(i + 1) !== 60) return onaltilik();
        i += 2;
        for (;;) {
          atla();
          if (i >= n) break;
          if (s.charCodeAt(i) === 62 && s.charCodeAt(i + 1) === 62) { i += 2; break; }
          deger();
        }
        return { sozluk: true };
      }
      if (c === 91) {
        i++;
        const d = [];
        for (;;) {
          atla();
          if (i >= n) break;
          if (s.charCodeAt(i) === 93) { i++; break; }
          const v = deger();
          if (!(v instanceof Kelime)) d.push(v);
        }
        return d;
      }
      if (c === 47) {
        let j = i + 1;
        while (j < n && !bosMu(s.charCodeAt(j)) && !ayracMi(s.charCodeAt(j))) j++;
        const a = s.slice(i, j);
        i = j;
        return a;
      }
      if (ayracMi(c)) { i++; return null; } // yersiz ayraç
      let j = i;
      while (j < n && !bosMu(s.charCodeAt(j)) && !ayracMi(s.charCodeAt(j))) j++;
      const k = s.slice(i, j);
      i = j;
      if ((c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46) {
        const v = parseFloat(k);
        if (!Number.isNaN(v)) return v;
      }
      if (k === "true") return true;
      if (k === "false") return false;
      if (k === "null") return null;
      return new Kelime(k);
    };
    let args = [], bas = -1;
    for (;;) {
      atla();
      if (i >= n) break;
      const b0 = i;
      const v = deger();
      if (v instanceof Kelime) {
        if (v.k === "BI") { // satır içi görsel: ikili veri atlanır
          for (;;) { const a = deger(); if (a === undefined || (a instanceof Kelime && a.k === "ID")) break; }
          const re = /[\x00\t\n\f\r ]EI(?=[\x00\t\n\f\r ]|$)/g;
          re.lastIndex = i;
          const m = re.exec(s);
          i = m ? m.index + 3 : n;
        } else {
          yap(v.k, args, bas < 0 ? b0 : bas, i);
        }
        args = []; bas = -1;
      } else {
        if (bas < 0) bas = b0;
        args.push(v);
      }
    }
  }

  // ---------------------------------------------------------------- font çözümleme
  function onaltilikUni(h) {
    h = h.replace(/\s/g, "");
    let o = "";
    for (let i = 0; i + 4 <= h.length; i += 4) o += String.fromCharCode(parseInt(h.substr(i, 4), 16));
    return o;
  }

  function cmapCoz(metin) {
    const h = new Map();
    for (const m of metin.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const p of m[1].matchAll(/<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]*)>/g)) h.set(parseInt(p[1].replace(/\s/g, ""), 16), onaltilikUni(p[2]));
    }
    for (const m of metin.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const p of m[1].matchAll(/<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>\s*(?:<([0-9A-Fa-f\s]*)>|\[([^\]]*)\])/g)) {
        const a = parseInt(p[1].replace(/\s/g, ""), 16), b = parseInt(p[2].replace(/\s/g, ""), 16);
        if (b - a > 65535) continue;
        if (p[4] !== undefined) {
          const liste = [...p[4].matchAll(/<([0-9A-Fa-f\s]*)>/g)].map((x) => onaltilikUni(x[1]));
          liste.forEach((u, k) => h.set(a + k, u));
        } else {
          const taban = onaltilikUni(p[3]);
          for (let c = a; c <= b; c++) {
            const son = taban.charCodeAt(taban.length - 1) + (c - a);
            h.set(c, taban.slice(0, -1) + String.fromCharCode(son));
          }
        }
      }
    }
    return h;
  }

  const GLIF_ADI = {
    space: " ", period: ".", comma: ",", hyphen: "-", minus: "-", slash: "/", colon: ":", semicolon: ";", parenleft: "(", parenright: ")",
    Scedilla: "Ş", scedilla: "ş", Gbreve: "Ğ", gbreve: "ğ", Idotaccent: "İ", Idot: "İ", dotlessi: "ı", Ccedilla: "Ç", ccedilla: "ç",
    Odieresis: "Ö", odieresis: "ö", Udieresis: "Ü", udieresis: "ü", Adieresis: "Ä", adieresis: "ä", germandbls: "ß",
    zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
    plus: "+", equal: "=", underscore: "_", ampersand: "&", percent: "%", quotesingle: "'", quotedbl: '"',
  };
  const glifAdiUni = (a) => {
    if (GLIF_ADI[a]) return GLIF_ADI[a];
    if (/^[A-Za-z]$/.test(a)) return a;
    let m = a.match(/^uni([0-9A-Fa-f]{4})/);
    if (m) return String.fromCharCode(parseInt(m[1], 16));
    m = a.match(/^u([0-9A-Fa-f]{4,6})$/);
    if (m) return String.fromCodePoint(parseInt(m[1], 16));
    return null;
  };

  /** Font sözlüğünden kod → {uni, gen} çözücüsü üretir. gen binde em cinsindendir. */
  function fontCoz(d) {
    const alt = d.lookupMaybe(ad("Subtype"), PDFName);
    let harita = null;
    const tu = d.lookupMaybe(ad("ToUnicode"), PDFStream);
    if (tu) {
      try { harita = cmapCoz(baytMetin(akisBayt(tu))); } catch (e) { harita = null; }
    }
    if (alt === ad("Type0")) {
      const kokler = d.lookupMaybe(ad("DescendantFonts"), PDFArray);
      const cid = kokler && kokler.lookupMaybe(0, PDFDict);
      const gm = new Map();
      let dw = 1000;
      if (cid) {
        const dwn = cid.lookupMaybe(ad("DW"), PDFNumber);
        if (dwn) dw = dwn.asNumber();
        const w = cid.lookupMaybe(ad("W"), PDFArray);
        if (w) {
          let i = 0;
          while (i < w.size()) {
            const c = w.lookup(i).asNumber();
            const y = w.lookup(i + 1);
            if (y instanceof PDFArray) {
              for (let k = 0; k < y.size(); k++) gm.set(c + k, y.lookup(k).asNumber());
              i += 2;
            } else {
              const v = w.lookup(i + 2).asNumber();
              for (let k = c; k <= y.asNumber(); k++) gm.set(k, v);
              i += 3;
            }
          }
        }
      }
      return {
        coz(s) {
          const o = [];
          for (let i = 0; i + 1 < s.length; i += 2) {
            const k = (s.charCodeAt(i) << 8) | s.charCodeAt(i + 1);
            o.push({ kod: k, uni: harita && harita.has(k) ? harita.get(k) : null, gen: gm.has(k) ? gm.get(k) : dw, tek: false });
          }
          return o;
        },
      };
    }
    // Basit fontlar: tek bayt
    const ilk = d.lookupMaybe(ad("FirstChar"), PDFNumber);
    const gens = d.lookupMaybe(ad("Widths"), PDFArray);
    const tanim = d.lookupMaybe(ad("FontDescriptor"), PDFDict);
    const eksik = tanim && tanim.lookupMaybe(ad("MissingWidth"), PDFNumber);
    let farklar = null, tabanAd = "WinAnsiEncoding";
    const enc = d.lookup(ad("Encoding"));
    if (enc instanceof PDFName) tabanAd = enc.decodeText();
    else if (enc instanceof PDFDict) {
      const t = enc.lookupMaybe(ad("BaseEncoding"), PDFName);
      if (t) tabanAd = t.decodeText();
      const f = enc.lookupMaybe(ad("Differences"), PDFArray);
      if (f) {
        farklar = new Map();
        let k = 0;
        for (let i = 0; i < f.size(); i++) {
          const v = f.lookup(i);
          if (v instanceof PDFNumber) k = v.asNumber();
          else { farklar.set(k, glifAdiUni(v.decodeText())); k++; }
        }
      }
    }
    let cozucu;
    try { cozucu = new TextDecoder(tabanAd === "MacRomanEncoding" ? "macintosh" : "windows-1252"); } catch (e) { cozucu = new TextDecoder("latin1"); }
    return {
      coz(s) {
        const o = [];
        for (let i = 0; i < s.length; i++) {
          const k = s.charCodeAt(i);
          let u = null;
          if (harita && harita.has(k)) u = harita.get(k);
          else if (farklar && farklar.has(k)) u = farklar.get(k);
          else if (alt !== ad("Type3") && !(tabanAd !== "WinAnsiEncoding" && farklar)) u = cozucu.decode(new Uint8Array([k]));
          let g = eksik ? eksik.asNumber() : 550;
          if (gens && ilk && k >= ilk.asNumber() && k - ilk.asNumber() < gens.size()) {
            const v = gens.lookup(k - ilk.asNumber());
            if (v instanceof PDFNumber) g = v.asNumber();
          }
          o.push({ kod: k, uni: u, gen: g, tek: true });
        }
        return o;
      },
    };
  }

  // ---------------------------------------------------------------- yorumlayıcı
  /**
   * İçerik akışını yürütür. Dönüş: yazı parçaları; boyanan çizgiler ve görseller ortama eklenir (sayfa koordinatında).
   * zincir: bu akışa sayfadan hangi form adlarıyla gelindiği ([] = sayfanın kendisi). Formun içindeki yazılar,
   * form belgede yalnızca bir kez kullanılıyorsa yeniden yazılabilir (formun bir kopyası değiştirilir).
   */
  function yorumla(ham, kaynaklar, ortam, baslangic, derinlik, zincir) {
    let G = { m: baslangic, renk: "0 g", cs: null, font: null, boyut: 0, tc: 0, tw: 0, th: 1, tl: 0, ts: 0, tr: 0 };
    const yigin = [];
    let tm = BIRIM, lm = BIRIM;
    let yol = [], px = 0, py = 0, qx = 0, qy = 0;
    const parcalar = [];
    let qDerinlik = 0;
    const akis = zincir.length ? zincir[zincir.length - 1].ref : null;
    const nx = (x, y) => x * G.m[0] + y * G.m[2] + G.m[4];
    const ny = (x, y) => x * G.m[1] + y * G.m[3] + G.m[5];
    const seg = (x, y) => { yol.push(px, py, x, y); px = x; py = y; };
    const egri = (x1, y1, x2, y2, x3, y3) => {
      const a = px, b = py;
      const adim = 6;
      for (let k = 1; k <= adim; k++) {
        const t = k / adim, u = 1 - t;
        seg(u * u * u * a + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * b + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
    };
    const boya = () => { for (let k = 0; k < yol.length; k++) ortam.cizgiler.push(yol[k]); yol = []; };
    const kapat = () => { if (px !== qx || py !== qy) seg(qx, qy); };

    function fontAl(a) {
      const fd = kaynaklar.lookupMaybe(ad("Font"), PDFDict);
      const d = fd && fd.lookupMaybe(ad(a.slice(1)), PDFDict);
      if (!d) return null;
      let f = ortam.fontlar.get(d);
      if (!f) { f = fontCoz(d); ortam.fontlar.set(d, f); }
      return f;
    }

    function goster(ogeler, on, bas, son) {
      const f = G.font, b = G.boyut, th = G.th;
      if (!f || !b) return;
      let x = 0, yazi = "", ilkX = null, sonX = 0, okunur = true;
      for (const og of ogeler) {
        if (typeof og === "number") {
          if (og < -180 && yazi && !yazi.endsWith(" ")) yazi += " ";
          x -= (og / 1000) * b * th;
        } else if (og && og.yazi != null) {
          for (const g of f.coz(og.yazi)) {
            let t = g.uni;
            if (t == null) { okunur = false; t = "\ufffd"; }
            yazi += t;
            const a = (g.gen / 1000) * b * th;
            if (t.trim() !== "") { if (ilkX === null) ilkX = x; sonX = x + a; }
            x += a + (G.tc + (g.tek && g.kod === 32 ? G.tw : 0)) * th;
          }
        }
      }
      const T = carp([1, 0, 0, 1, 0, G.ts], carp(tm, G.m));
      tm = carp([1, 0, 0, 1, x, 0], tm);
      if (ilkX === null || G.tr === 3) return;
      const sx = Math.hypot(T[0], T[1]), sy = Math.hypot(T[2], T[3]);
      if (!sx || !sy) return;
      const dx = T[0] / sx, dy = T[1] / sx;
      const ayna = dx * (T[3] / sy) - dy * (T[2] / sy) < 0;
      parcalar.push({
        metin: yazi.normalize("NFC"), ox: T[0] * ilkX + T[4], oy: T[1] * ilkX + T[5], dx, dy, ux: -dy, uy: dx,
        s: b * sy, gen: (sonX - ilkX) * sx, renk: G.renk, okunur: okunur && !ayna, bas, son,
        formda: zincir.length > 0, zincir, akis,
        // Silinen yazının yerine yazı konumunu aynı ilerleten boş bir TJ konur: sonraki yazılar kaymaz
        yerine: `${on}[${yuvarla(-(x / (b * th)) * 1000)}]TJ`,
      });
    }

    akisGez(ham, (k, a, bas, son) => {
      switch (k) {
        case "q": yigin.push(Object.assign({}, G)); qDerinlik++; break;
        case "Q": if (yigin.length) { G = yigin.pop(); qDerinlik--; } break;
        case "cm": if (a.length >= 6) G.m = carp(a, G.m); break;
        case "g": G.renk = `${a[0]} g`; break;
        case "rg": G.renk = `${a[0]} ${a[1]} ${a[2]} rg`; break;
        case "k": G.renk = `${a[0]} ${a[1]} ${a[2]} ${a[3]} k`; break;
        case "cs": G.cs = a[0]; G.renk = `${a[0]} cs`; break;
        case "sc": case "scn": G.renk = `${G.cs ? G.cs + " cs " : ""}${a.join(" ")} ${k}`; break;
        case "BT": tm = lm = BIRIM; break;
        case "Tf": G.font = fontAl(String(a[0])); G.boyut = a[1]; break;
        case "Tc": G.tc = a[0]; break;
        case "Tw": G.tw = a[0]; break;
        case "Tz": G.th = a[0] / 100; break;
        case "TL": G.tl = a[0]; break;
        case "Ts": G.ts = a[0]; break;
        case "Tr": G.tr = a[0]; break;
        case "Td": lm = carp([1, 0, 0, 1, a[0], a[1]], lm); tm = lm; break;
        case "TD": G.tl = -a[1]; lm = carp([1, 0, 0, 1, a[0], a[1]], lm); tm = lm; break;
        case "Tm": if (a.length >= 6) { lm = a.slice(0, 6); tm = lm; } break;
        case "T*": lm = carp([1, 0, 0, 1, 0, -G.tl], lm); tm = lm; break;
        case "Tj": goster([a[0]], "", bas, son); break;
        case "TJ": if (Array.isArray(a[0])) goster(a[0], "", bas, son); break;
        case "'": lm = carp([1, 0, 0, 1, 0, -G.tl], lm); tm = lm; goster([a[0]], "T* ", bas, son); break;
        case '"': G.tw = a[0]; G.tc = a[1]; lm = carp([1, 0, 0, 1, 0, -G.tl], lm); tm = lm; goster([a[2]], `${a[0]} Tw ${a[1]} Tc T* `, bas, son); break;
        case "m": px = qx = nx(a[0], a[1]); py = qy = ny(a[0], a[1]); break;
        case "l": seg(nx(a[0], a[1]), ny(a[0], a[1])); break;
        case "c": egri(nx(a[0], a[1]), ny(a[0], a[1]), nx(a[2], a[3]), ny(a[2], a[3]), nx(a[4], a[5]), ny(a[4], a[5])); break;
        case "v": egri(px, py, nx(a[0], a[1]), ny(a[0], a[1]), nx(a[2], a[3]), ny(a[2], a[3])); break;
        case "y": egri(nx(a[0], a[1]), ny(a[0], a[1]), nx(a[2], a[3]), ny(a[2], a[3]), nx(a[2], a[3]), ny(a[2], a[3])); break;
        case "h": kapat(); break;
        case "re": {
          const [x, y, w, h] = a;
          px = qx = nx(x, y); py = qy = ny(x, y);
          seg(nx(x + w, y), ny(x + w, y)); seg(nx(x + w, y + h), ny(x + w, y + h)); seg(nx(x, y + h), ny(x, y + h)); seg(qx, qy);
          break;
        }
        case "s": case "b": case "b*": kapat(); boya(); break;
        case "S": case "B": case "B*": boya(); break;
        case "f": case "F": case "f*": kapat(); boya(); break;
        case "n": yol = []; break;
        case "Do": {
          const xo = kaynaklar.lookupMaybe(ad("XObject"), PDFDict);
          const adi = String(a[0]).slice(1);
          const st = xo && xo.lookupMaybe(ad(adi), PDFStream);
          if (!st) break;
          const ref = xo.get(ad(adi));
          const tur = st.dict.lookupMaybe(ad("Subtype"), PDFName);
          if (tur === ad("Image")) {
            const x0 = nx(0, 0), y0 = ny(0, 0);
            ortam.gorseller.push([Math.min(x0, nx(1, 1)), Math.min(y0, ny(1, 1)), Math.max(x0, nx(1, 1)), Math.max(y0, ny(1, 1))]);
          } else if (tur === ad("Form") && derinlik < 6) {
            try {
              const fref = ref instanceof PDFRef ? ref : null;
              if (fref) ortam.formSay.set(fref, (ortam.formSay.get(fref) || 0) + 1);
              let fham = fref ? ortam.formHam.get(fref) : undefined;
              if (fham === undefined) { fham = baytMetin(akisBayt(st)); if (fref) ortam.formHam.set(fref, fham); }
              const mz = st.dict.lookupMaybe(ad("Matrix"), PDFArray);
              const mat = mz ? mz.asArray().map((v, i) => mz.lookup(i).asNumber()) : BIRIM;
              const r = st.dict.lookupMaybe(ad("Resources"), PDFDict) || kaynaklar;
              const ic = yorumla(fham, r, ortam, carp(mat, G.m), derinlik + 1, zincir.concat({ ad: adi, ref: fref }));
              ic.parcalar.forEach((p) => parcalar.push(p));
            } catch (e) { ortam.okunamayanForm++; }
          }
          break;
        }
        default: break;
      }
    });
    return { parcalar, derinlik: qDerinlik };
  }

  // ---------------------------------------------------------------- sınıflandırma
  const HARF = /\p{L}/u;
  const harfVar = (t) => HARF.test(t);
  const enUzunHarf = (t) => {
    let m = 0;
    for (const p of t.split(/[^\p{L}]+/u)) m = Math.max(m, p.length);
    return m;
  };
  /** Rakam içeren ve uzun sözcük barındırmayan parça koddur: K1, G9PS, 220VAC, X1:1, VFD004EL21W-1. */
  const kodParca = (t) => /\d/.test(t) && enUzunHarf(t) <= 3;
  const BIRIMLER = new Set(["W", "KW", "WATT", "V", "VAC", "VDC", "VOLT", "A", "MA", "AMPER", "HZ", "RPM", "BAR", "HP", "KVA", "MM", "CM"]);
  const ADRES = /^(https?:|www\.)|@|\.(com|net|org)(\.[a-z]{2})?$/i;

  /** Kütüphaneye bakmadan kesin kod sayılan yazılar: çevrilmez, Eksik listesine de düşmez. */
  function kesinKod(metin) {
    if (!harfVar(metin)) return true;
    const p = metin.split(" ");
    const sayi = p.some((t) => /\d/.test(t));
    return p.every((t) => !harfVar(t) || kodParca(t) || ADRES.test(t)
      || ([...t].filter((c) => HARF.test(c)).length === 1 && !/\p{Ll}\p{L}/u.test(t))
      || (sayi && BIRIMLER.has(t.toUpperCase().replace(/[.,]/g, ""))));
  }

  /** Kod parçalarını yer tutucuya çevirir: YIKAMA POMPASI 1 → YIKAMA POMPASI {0}. */
  function sablonla(metin) {
    const yerler = [];
    const sablon = metin.split(" ").map((t) => {
      if (!kodParca(t)) return t;
      yerler.push(t);
      return `{${yerler.length - 1}}`;
    }).join(" ");
    return { sablon, yerler };
  }

  function sinifla(metin) {
    const { sablon, yerler } = sablonla(metin);
    const kayit = Hafiza.bul(sablon);
    if (kayit) return { tur: kayit.tur, kayit, sablon, yerler };
    if (kesinKod(metin)) return { tur: "kod", sablon, yerler };
    const sozler = sablon.split(" ").filter((t) => !/^\{\d+\}$/.test(t) && harfVar(t));
    if (sozler.length && sozler.every((t) => { const k = Hafiza.bul(t); return k && k.tur === "sabit"; })) return { tur: "sabit", sablon, yerler, otomatik: true };
    return { tur: "eksik", sablon, yerler };
  }

  const ayniYazi = (a, b) => Hafiza.anahtar(a) === Hafiza.anahtar(b);

  /** Hafızadaki karşılıktan basılacak metni üretir. Kaynak büyük harfliyse çeviri de büyük harf olur. */
  function hedefMetin(sn, dil) {
    const taslak = sn.kayit && sn.kayit[dil];
    if (!taslak) return null;
    const buyuk = !/\p{Ll}/u.test(sn.sablon) && harfVar(sn.sablon);
    const t = buyuk ? taslak.toLocaleUpperCase(YEREL_AD[dil] || "en") : taslak;
    return t.replace(/\{(\d+)\}/g, (_, i) => (sn.yerler[+i] != null ? sn.yerler[+i] : "")).replace(/\s+/g, " ").trim();
  }
  // Büyük harfe çevirmede dile özgü kurallar (Almanca ß → SS gibi tarayıcı kurallarıyla)
  const YEREL_AD = { EN: "en", DE: "de", FR: "fr", ES: "es", IT: "it", PT: "pt", NL: "nl", PL: "pl", CS: "cs", SK: "sk", HU: "hu", RO: "ro", SV: "sv", DA: "da", FI: "fi", SL: "sl", HR: "hr", NO: "nb", TR: "tr" };

  // Fontta olmayan harfler için en yakın karşılık (Rumence virgüllü harfler çengelli biçime)
  const YEDEK_HARF = { "ș": "ş", "ț": "ţ", "Ș": "Ş", "Ț": "Ţ", "‑": "-", " ": " " };

  // ---------------------------------------------------------------- tarama: parça → satır → etiket
  const ALT_HARF = /[gjpqy,;Qçş]/;
  const altPay = (t) => (ALT_HARF.test(t) ? 0.21 : 0.03);
  const UST_PAY = 0.74;

  function satirlaraBirlestir(parcalar) {
    const satirlar = [];
    let a = null;
    for (const p of parcalar) {
      let eklendi = false;
      if (a && a.akis === p.akis && a.yazilabilir === p.yazilabilir && Math.abs(a.dx - p.dx) < 0.01 && Math.abs(a.dy - p.dy) < 0.01 && Math.abs(a.s - p.s) < a.s * 0.02 && a.renk === p.renk) {
        const u = (p.ox - a.ox) * a.dx + (p.oy - a.oy) * a.dy;
        const v = (p.ox - a.ox) * a.ux + (p.oy - a.oy) * a.uy;
        const bosluk = u - a.gen;
        if (Math.abs(v) < a.s * 0.15 && bosluk > -a.s * 0.3 && bosluk < a.s * 0.35) {
          const ara = bosluk > a.s * 0.12 && !a.metin.endsWith(" ") && !p.metin.startsWith(" ") ? " " : "";
          a.metin = a.metin.trimEnd() + ara + p.metin.trimStart();
          a.gen = u + p.gen;
          a.okunur = a.okunur && p.okunur;
          a.parcalar.push(p);
          eklendi = true;
        }
      }
      if (!eklendi) {
        a = Object.assign({}, p, { metin: p.metin.trim(), parcalar: [p] });
        satirlar.push(a);
      } else {
        a.metin = a.metin.trim();
      }
    }
    satirlar.forEach((r) => { r.metin = r.metin.replace(/\s+/g, " "); });
    return satirlar;
  }

  /** Ardışık satırları tek etikette toplar: YIKAMA + REZİSTANSI 1. Aralık boyutun 1,0-1,42 katı olmalı ve kenarlar hizalanmalı. */
  function etiketlereBirlestir(satirlar) {
    const adaylar = new Map();
    const etiketler = [];
    satirlar.forEach((r) => {
      if (!r.yazilabilir || !r.okunur || !harfVar(r.metin) || kesinKod(r.metin)) return;
      r.tu = r.ox * r.dx + r.oy * r.dy;
      r.tv = r.ox * r.ux + r.oy * r.uy;
      const k = `${r.dx.toFixed(2)},${r.dy.toFixed(2)}|${r.s.toFixed(1)}|${r.renk}`;
      if (!adaylar.has(k)) adaylar.set(k, []);
      adaylar.get(k).push(r);
    });
    for (const liste of adaylar.values()) {
      liste.sort((a, b) => b.tv - a.tv || a.tu - b.tu);
      const alindi = new Set();
      for (const r of liste) {
        if (alindi.has(r)) continue;
        alindi.add(r);
        const grup = [r];
        let hiza = null;
        for (;;) {
          const son = grup[grup.length - 1];
          let bulunan = null, bHiza = null;
          for (const n of liste) {
            if (alindi.has(n)) continue;
            const ara = son.tv - n.tv;
            if (ara < son.s * 1.0 || ara > son.s * 1.42) continue;
            const pay = son.s * 0.35;
            const h = Math.abs(n.tu - son.tu) <= pay ? "sol"
              : Math.abs(n.tu + n.gen / 2 - son.tu - son.gen / 2) <= pay ? "orta"
              : Math.abs(n.tu + n.gen - son.tu - son.gen) <= pay ? "sag" : null;
            if (!h || (hiza && h !== hiza)) continue;
            bulunan = n; bHiza = h;
            break;
          }
          if (!bulunan || grup.length >= 4) break;
          hiza = bHiza;
          alindi.add(bulunan);
          grup.push(bulunan);
        }
        etiketler.push(etiketKur(grup, hiza || "sol"));
      }
    }
    return etiketler;
  }

  function etiketKur(grup, hiza) {
    const r = grup[0];
    const yerel = grup.map((g) => ({
      u: (g.ox - r.ox) * r.dx + (g.oy - r.oy) * r.dy, v: (g.ox - r.ox) * r.ux + (g.oy - r.oy) * r.uy, gen: g.gen, metin: g.metin,
    }));
    const metin = grup.map((g) => g.metin).join(" ");
    const u0 = Math.min(...yerel.map((l) => l.u)), u1 = Math.max(...yerel.map((l) => l.u + l.gen));
    const vSon = yerel[yerel.length - 1].v;
    const e = {
      metin, satirlar: grup, n: grup.length, hiza, s: r.s, renk: r.renk,
      ox: r.ox, oy: r.oy, dx: r.dx, dy: r.dy, ux: r.ux, uy: r.uy,
      ara: grup.length > 1 ? -vSon / (grup.length - 1) : r.s * 1.2,
      u0, u1, vSon, v0: vSon - altPay(metin) * r.s, v1: UST_PAY * r.s,
    };
    e.kutu = sayfaKutusu(e, u0, u1, e.v0, e.v1);
    return e;
  }

  /** Yerel dikdörtgenin sayfadaki sınır kutusu. */
  function sayfaKutusu(e, u0, u1, v0, v1) {
    const x = [e.ox + e.dx * u0 + e.ux * v0, e.ox + e.dx * u1 + e.ux * v0, e.ox + e.dx * u0 + e.ux * v1, e.ox + e.dx * u1 + e.ux * v1];
    const y = [e.oy + e.dy * u0 + e.uy * v0, e.oy + e.dy * u1 + e.uy * v0, e.oy + e.dy * u0 + e.uy * v1, e.oy + e.dy * u1 + e.uy * v1];
    return [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)];
  }
  const yaziKutusu = (r) => { const k = sayfaKutusu(r, 0, r.gen, -altPay(r.metin) * r.s, UST_PAY * r.s); k.yazi = true; return k; };

  function sayfaIcerigi(sayfa) {
    const ic = sayfa.node.lookup(ad("Contents"));
    const baytlar = [];
    const ekle = (st) => { if (st instanceof PDFStream) baytlar.push(baytMetin(akisBayt(st))); };
    if (ic instanceof PDFArray) for (let i = 0; i < ic.size(); i++) ekle(ic.lookup(i));
    else if (ic) ekle(ic);
    return baytlar.join("\n");
  }

  /** İkinci aşama: form kullanım sayıları belli olduktan sonra satır ve etiketler kurulur. */
  function sayfaKur(H, ortam) {
    for (const p of H.parcalar) p.yazilabilir = !p.formda || p.zincir.every((z) => z.ref && ortam.formSay.get(z.ref) === 1);
    const satirlar = satirlaraBirlestir(H.parcalar);
    const etiketler = etiketlereBirlestir(satirlar);
    const etiketliSatir = new Set();
    etiketler.forEach((e) => e.satirlar.forEach((r) => etiketliSatir.add(r)));
    // Etiket olmayan yazılar yerinde kalır: çeviri için sabit engeldir
    const sabitKutu = [];
    let formYazi = 0, okunmaz = 0;
    satirlar.forEach((r) => {
      if (r.formda && !r.yazilabilir && harfVar(r.metin) && !kesinKod(r.metin)) formYazi++;
      if (!r.okunur && r.yazilabilir) okunmaz++;
      if (etiketliSatir.has(r)) return;
      sabitKutu.push(yaziKutusu(r));
    });
    H.gorseller.forEach((k) => sabitKutu.push(k));
    return {
      ham: H.ham, etiketler, cizgiler: H.cizgiler, sabitKutu, derinlik: H.derinlik, formYazi, okunmaz,
      sinir: H.sinir, yaziSayisi: satirlar.length, formluEtiket: etiketler.filter((e) => e.satirlar.some((r) => r.formda)).length,
    };
  }

  const bosSayfa = () => ({ ham: "", etiketler: [], cizgiler: [], sabitKutu: [], derinlik: 0, formYazi: 0, okunmaz: 0, sinir: [0, 0, 1, 1], yaziSayisi: 0, formluEtiket: 0, hatali: true });

  /** Kaynağı bir kez tarar. Uzun PDF'lerde arayüz donmasın diye sayfalar arasında soluklanır. ilerleme(yapilan, toplam) */
  async function hazirla(kaynak, ilerleme) {
    if (kaynak.tarama) return kaynak.tarama;
    if (kaynak.taramaSozu) return kaynak.taramaSozu;
    kaynak.taramaSozu = (async () => {
      const ortam = { fontlar: new Map(), formSay: new Map(), formHam: new Map() };
      const liste = kaynak.doc.getPages();
      const hamlar = [];
      let hata = 0;
      for (let i = 0; i < liste.length; i++) {
        try {
          const ham = sayfaIcerigi(liste[i]);
          const yerel = { cizgiler: [], gorseller: [], fontlar: ortam.fontlar, formSay: ortam.formSay, formHam: ortam.formHam, okunamayanForm: 0 };
          const kaynaklar = liste[i].node.Resources() || kaynak.doc.context.obj({});
          const y = yorumla(ham, kaynaklar, yerel, BIRIM, 0, []);
          const kut = liste[i].getCropBox();
          hamlar.push({ ham, parcalar: y.parcalar, cizgiler: yerel.cizgiler, gorseller: yerel.gorseller, derinlik: y.derinlik, sinir: [kut.x, kut.y, kut.x + kut.width, kut.y + kut.height] });
        } catch (e) {
          hata++;
          hamlar.push(null);
        }
        if (ilerleme) ilerleme(i + 1, liste.length);
        if (i % 4 === 3) await new Promise((r) => setTimeout(r));
      }
      const sayfalar = hamlar.map((H) => {
        if (!H) return bosSayfa();
        try { return sayfaKur(H, ortam); } catch (e) { hata++; return bosSayfa(); }
      });
      kaynak.tarama = { sayfalar, hata, planlar: {}, formHam: ortam.formHam };
      return kaynak.tarama;
    })();
    return kaynak.taramaSozu;
  }

  // ---------------------------------------------------------------- ölçü
  const duzenOnbellek = new Map();
  function duzen(metin) {
    let d = duzenOnbellek.get(metin);
    if (!d) {
      const F = Cizim.font(FONT);
      const r = F.f.layout(metin, Cizim.OZELLIK);
      let t = 0;
      r.positions.forEach((p) => { t += p.xAdvance; });
      d = { glif: r.glyphs, ilerle: r.positions.map((p) => p.xAdvance), taban: r.glyphs.map((g) => g.advanceWidth), toplam: t / F.f.unitsPerEm, upm: F.f.unitsPerEm };
      if (duzenOnbellek.size > 20000) duzenOnbellek.clear();
      duzenOnbellek.set(metin, d);
    }
    return d;
  }
  const genislik = (metin, pt) => duzen(metin).toplam * pt;
  const buyukHarfOrani = () => {
    const f = Cizim.font(FONT).f;
    return (f.capHeight || f.unitsPerEm * 0.714) / f.unitsPerEm;
  };

  function fonttaVar(metin) {
    const f = Cizim.font(FONT).f;
    for (const c of metin) if (!f.hasGlyphForCodePoint(c.codePointAt(0))) return false;
    return true;
  }
  /** Fontta olmayan harfleri en yakın karşılığıyla değiştirir; yine de eksik varsa null. */
  function fontaUydur(metin) {
    if (fonttaVar(metin)) return metin;
    const y = [...metin].map((c) => YEDEK_HARF[c] || c).join("");
    return fonttaVar(y) ? y : null;
  }

  /**
   * Metni sözcük ve tire sınırlarından en çok n satıra böler; en geniş satır en dar olacak biçimde.
   * En geniş satır için ikili arama, her adımda açgözlü yerleştirme: uzun metinlerde de anlık.
   */
  function satirlaraBol(metin, n, pt) {
    const parca = [];
    metin.split(" ").forEach((s, i) => s.split(/(?<=[-\/])/).forEach((a, j) => parca.push({ m: a, bosluk: i > 0 && j === 0 })));
    if (n <= 1 || parca.length <= 1) return [metin];
    if (n >= parca.length) return parca.map((p) => p.m);
    const bosluk = genislik(" ", pt);
    const gen = parca.map((p) => genislik(p.m, pt));
    const yerlestir = (azami) => {
      const satir = [];
      let bas = 0, w = 0;
      for (let k = 0; k < parca.length; k++) {
        const ek = (k > bas && parca[k].bosluk ? bosluk : 0) + gen[k];
        if (k > bas && w + ek > azami + 1e-6) { satir.push([bas, k]); bas = k; w = gen[k]; }
        else w += ek;
      }
      satir.push([bas, parca.length]);
      return satir;
    };
    let alt = Math.max(...gen), ust = gen.reduce((a, b) => a + b, 0) + bosluk * parca.length;
    for (let i = 0; i < 24 && ust - alt > 0.05; i++) {
      const orta = (alt + ust) / 2;
      if (yerlestir(orta).length <= n) ust = orta; else alt = orta;
    }
    return yerlestir(ust).map(([a, b]) => {
      let t = "";
      for (let k = a; k < b; k++) t += (k > a && parca[k].bosluk ? " " : "") + parca[k].m;
      return t;
    });
  }

  // ---------------------------------------------------------------- kutu: serbest alan ve sığdırma
  /** Sayfadaki çizgi parçaları için ızgara dizini (bir kez kurulur): bir bölgeye düşen parçalar hızla bulunur. */
  const HUCRE = 36;
  function izgara(S) {
    if (S.izgara) return S.izgara;
    const m = new Map();
    const c = S.cizgiler;
    for (let i = 0; i < c.length; i += 4) {
      const x0 = Math.floor(Math.min(c[i], c[i + 2]) / HUCRE), x1 = Math.floor(Math.max(c[i], c[i + 2]) / HUCRE);
      const y0 = Math.floor(Math.min(c[i + 1], c[i + 3]) / HUCRE), y1 = Math.floor(Math.max(c[i + 1], c[i + 3]) / HUCRE);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = x * 100003 + y;
        let l = m.get(k);
        if (!l) { l = []; m.set(k, l); }
        l.push(i);
      }
    }
    S.izgara = m;
    return m;
  }
  function bolgedekiler(S, k) {
    const m = izgara(S);
    const g = new Set();
    for (let x = Math.floor(k[0] / HUCRE); x <= Math.floor(k[2] / HUCRE); x++) {
      for (let y = Math.floor(k[1] / HUCRE); y <= Math.floor(k[3] / HUCRE); y++) {
        const l = m.get(x * 100003 + y);
        if (l) for (const i of l) g.add(i);
      }
    }
    return g;
  }

  /**
   * Etiketin yerel eksenlerinde engel listesi. Yalnızca çevirinin uzanabileceği pencere taranır: yerleşim özgün
   * yazıyla örtüşmek zorunda olduğundan, yazının en geniş hâlinden (wmax) uzaktaki engeller sonucu değiştirmez.
   */
  function yerelEngeller(e, sayfaT, kutular, wmax) {
    const pencereAlt = e.v0 - e.s * 4, pencereUst = e.v1 + e.s * 4;
    const pu0 = e.u0 - wmax - 4, pu1 = e.u1 + wmax + 4;
    const pk = sayfaKutusu(e, pu0, pu1, pencereAlt, pencereUst);
    const dogrular = [], kutuluk = [];
    const c = sayfaT.cizgiler;
    for (const i of bolgedekiler(sayfaT, pk)) {
      const ax = c[i] - e.ox, ay = c[i + 1] - e.oy, bx = c[i + 2] - e.ox, by = c[i + 3] - e.oy;
      const v0 = ax * e.ux + ay * e.uy, v1 = bx * e.ux + by * e.uy;
      if (Math.max(v0, v1) < pencereAlt || Math.min(v0, v1) > pencereUst) continue;
      if (ax === bx && ay === by) continue;
      dogrular.push({ u0: ax * e.dx + ay * e.dy, v0, u1: bx * e.dx + by * e.dy, v1, vmin: Math.min(v0, v1), vmax: Math.max(v0, v1), tol: false });
    }
    for (const k of kutular) {
      if (k[2] < pk[0] || k[0] > pk[2] || k[3] < pk[1] || k[1] > pk[3]) continue;
      const cu = [], cv = [];
      for (const [x, y] of [[k[0], k[1]], [k[2], k[1]], [k[0], k[3]], [k[2], k[3]]]) {
        cu.push((x - e.ox) * e.dx + (y - e.oy) * e.dy);
        cv.push((x - e.ox) * e.ux + (y - e.oy) * e.uy);
      }
      const v0 = Math.min(...cv), v1 = Math.max(...cv);
      if (v1 < pencereAlt || v0 > pencereUst) continue;
      kutuluk.push({ u0: Math.min(...cu), u1: Math.max(...cu), v0, v1, tol: false, yazi: !!k.yazi });
    }
    // Özgün yazıya zaten değen engeller (yanından geçen kablo, hücre çizgisi) o bant içinde sayılmaz
    const pay = 0.25;
    for (const o of dogrular) {
      const r = dogruAralik(o, e.v0 - pay, e.v1 + pay);
      if (r && r[0] < e.u1 + pay && r[1] > e.u0 - pay) o.tol = true;
    }
    for (const o of kutuluk) {
      if (o.v0 < e.v1 + pay && o.v1 > e.v0 - pay && o.u0 < e.u1 + pay && o.u1 > e.u0 - pay) o.tol = true;
    }
    // Sayfa sınırı
    const s = sayfaT.sinir;
    const ku = [], kv = [];
    for (const [x, y] of [[s[0], s[1]], [s[2], s[1]], [s[0], s[3]], [s[2], s[3]]]) {
      ku.push((x - e.ox) * e.dx + (y - e.oy) * e.dy);
      kv.push((x - e.ox) * e.ux + (y - e.oy) * e.uy);
    }
    return { dogrular, kutuluk, su0: Math.max(Math.min(...ku) + 1.5, pu0), su1: Math.min(Math.max(...ku) - 1.5, pu1), sv0: Math.min(...kv) + 1, sv1: Math.max(...kv) - 1 };
  }

  /** Doğru parçasının [vb, vt] bandına giren kısmının u aralığı. */
  function dogruAralik(o, vb, vt) {
    if (o.vmax < vb || o.vmin > vt) return null;
    if (o.v0 === o.v1) {
      if (o.v0 < vb || o.v0 > vt) return null;
      return [Math.min(o.u0, o.u1), Math.max(o.u0, o.u1)];
    }
    const t0 = (vb - o.v0) / (o.v1 - o.v0), t1 = (vt - o.v0) / (o.v1 - o.v0);
    const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
    if (lo > hi) return null;
    const a = o.u0 + lo * (o.u1 - o.u0), b = o.u0 + hi * (o.u1 - o.u0);
    return [Math.min(a, b), Math.max(a, b)];
  }

  /**
   * Verilen bantta metnin kullanabileceği boş aralıklar. Yazı engellerinden en az bir boşluk genişliği
   * (payY), çizgilerden daha az (payU) uzak durulur: çeviri komşu yazıya yapışmaz ("Prepared byHP" olmaz).
   */
  function bosAraliklar(eng, e, vb, vt, payU, payY) {
    const kapali = [];
    const ekle = (r, p) => { if (r) kapali.push([r[0] - p, r[1] + p]); };
    const pv = 0.2;
    for (const o of eng.dogrular) {
      if (!o.tol) ekle(dogruAralik(o, vb - pv, vt + pv), payU);
      else {
        // Özgün bandın dışına taşan yeni satırlar değen engeli de geçemez
        if (vb < e.v0 - 0.25) ekle(dogruAralik(o, vb, e.v0 - 0.25), payU);
        if (vt > e.v1 + 0.25) ekle(dogruAralik(o, e.v1 + 0.25, vt), payU);
      }
    }
    for (const o of eng.kutuluk) {
      const p = o.yazi ? payY : payU;
      if (!o.tol) {
        if (o.v0 < vt + pv && o.v1 > vb - pv) ekle([o.u0, o.u1], p);
      } else if ((vb < e.v0 - 0.25 && o.v0 < e.v0 - 0.25 && o.v1 > vb) || (vt > e.v1 + 0.25 && o.v1 > e.v1 + 0.25 && o.v0 < vt)) {
        ekle([o.u0, o.u1], p);
      }
    }
    kapali.sort((a, b) => a[0] - b[0]);
    const bos = [];
    let x = eng.su0;
    for (const k of kapali) {
      if (k[0] > x) bos.push([x, Math.min(k[0], eng.su1)]);
      x = Math.max(x, k[1]);
      if (x >= eng.su1) break;
    }
    if (x < eng.su1) bos.push([x, eng.su1]);
    return bos;
  }

  /** Belirli satır dizilimi ve boyut için yer arar. Özgün başlangıç noktası korunur, gerekirse boş alanda kaydırılır. */
  function yerBul(e, eng, sat, pt, n) {
    const cap = buyukHarfOrani();
    const arao = e.n > 1 ? e.ara / e.s : 1.2;
    const ara = arao * pt;
    const W = Math.max(...sat.map((m) => genislik(m, pt)));
    const H = (n - 1) * ara + cap * pt;
    const alt = (ALT_HARF.test(sat.join(" ")) ? 0.21 : 0.02) * pt;
    const ust0 = cap * e.s, alt0 = e.vSon;
    const secenekler = [];
    if (n === e.n) secenekler.push((ust0 + alt0) / 2 + H / 2 - cap * pt);        // aynı satır sayısı: özgün bloğun ortası
    else {
      secenekler.push(ust0 - cap * pt);                                           // üst kenar sabit
      secenekler.push((ust0 + alt0) / 2 + H / 2 - cap * pt);                      // orta
      secenekler.push(alt0 + (n - 1) * ara);                                      // alt kenar sabit
    }
    const payU = Math.max(1.2, 0.16 * pt);
    const payY = Math.max(payU, 0.3 * pt);
    const istenen = e.hiza === "sag" ? e.u1 - W : e.hiza === "orta" ? (e.u0 + e.u1) / 2 - W / 2 : e.u0;
    for (const v1 of secenekler) {
      const vb = v1 - (n - 1) * ara - alt, vt = v1 + cap * pt;
      if (vb < eng.sv0 || vt > eng.sv1) continue;
      let en = null;
      for (const [L, R] of bosAraliklar(eng, e, vb, vt, payU, payY)) {
        if (R - L < W) continue;
        const us = Math.min(Math.max(istenen, L), R - W);
        if (us > e.u1 || us + W < e.u0) continue;                                 // başka bir boşluğa atlanmaz
        const kayma = Math.abs(us - istenen);
        if (!en || kayma < en.kayma) en = { us, kayma, L, R };
      }
      if (en) return { sat, pt, n, ilkV: v1, ara, us: en.us, W, L: en.L, R: en.R, vb, vt, hiza: e.hiza };
    }
    return null;
  }

  /**
   * Çeviriyi serbest alana yerleştirir: önce aynı boyut ve satır, sonra küçültme veya alt satır.
   * Her satır sayısı için sığan en büyük boyut ikili aramayla bulunur.
   */
  function sigdir(e, eng, hedef) {
    const s0 = e.s;
    const parcaSayisi = hedef.split(/ |(?<=[-\/])/).length;
    const adaylar = [];
    const azami = Math.min(parcaSayisi, Math.max(e.n + 2, 2));
    const asgari = Math.max(s0 * 0.5, 4.5);
    const dene = (n, pt) => { const sat = satirlaraBol(hedef, n, pt); return yerBul(e, eng, sat, pt, sat.length); };
    for (let n = 1; n <= azami; n++) {
      let y = dene(n, s0);
      if (!y) {
        let alt = 3, ust = s0, enIyi = null;
        if (!(enIyi = dene(n, alt))) continue;
        for (let i = 0; i < 9 && ust - alt > s0 * 0.015; i++) {
          const orta = (alt + ust) / 2;
          const r = dene(n, orta);
          if (r) { enIyi = r; alt = orta; } else ust = orta;
        }
        y = enIyi;
      }
      adaylar.push(y);
      if (y.pt >= s0 && y.n === e.n) break; // özgün boyut ve satır sayısı: daha iyisi yok
    }
    if (!adaylar.length) {
      // Çok küçük bile olsa özgün yazının kapladığı alana tek satır sığar
      const pt = Math.max(2.5, (s0 * (e.u1 - e.u0)) / Math.max(genislik(hedef, s0), 1));
      return { sat: [hedef], pt, n: 1, ilkV: 0, ara: pt * 1.2, us: e.u0, W: genislik(hedef, pt), L: e.u0, R: e.u1, vb: e.v0, vt: e.v1, hiza: "sol", kucuk: true, zorla: true };
    }
    // Satır sayısı değişimi: ancak yazı belirgin biçimde büyüyorsa
    const puan = (y) => y.pt / s0 - 0.12 * Math.abs(y.n - e.n);
    adaylar.sort((a, b) => puan(b) - puan(a));
    const y = adaylar[0];
    if (y.pt < asgari) y.kucuk = true;
    return y;
  }

  // ---------------------------------------------------------------- sayfa planı
  /** Etiketin bu dildeki durumu. imza değişmedikçe sayfanın yerleşimi yeniden hesaplanmaz. */
  function hedefBilgi(e, dil) {
    const si = sinifla(e.metin);
    if (si.tur === "kod" || si.tur === "sabit") return { si, durum: "sabit", imza: "s" };
    if (si.tur === "eksik" || !si.kayit[dil]) return { si, durum: "eksik", imza: "e" };
    const ham = hedefMetin(si, dil);
    if (!ham || ayniYazi(ham, e.metin)) return { si, durum: "ayni", imza: "a" };
    const hedef = fontaUydur(ham);
    if (!hedef) return { si, durum: "fontYok", hedef: ham, imza: "f" };
    return { si, durum: "cevir", hedef, imza: "c" + hedef };
  }

  function sayfaPlani(S, sn, bilgiler, imza) {
    const degisim = new Map();          // akış (null = sayfa) → [[bas, son, yerine]]
    const zincirler = new Map();
    const yazilar = [], isaretler = [];
    const say = { etiket: 0, cevrilen: 0, ayni: 0, sabit: 0, eksik: [], kucuk: [], fontYok: [] };
    const kutular = S.sabitKutu.slice();
    // Henüz yerleşmemiş etiketlerin özgün yeri ayrılmıştır
    const ayrilan = new Map();
    S.etiketler.forEach((e) => {
      ayrilan.set(e, e.satirlar.map((r) => { const k = yaziKutusu(r); kutular.push(k); return k; }));
    });
    S.etiketler.forEach((e, i) => {
      const b = bilgiler[i];
      say.etiket++;
      if (b.durum === "sabit") { say.sabit++; return; }
      if (b.durum === "eksik") {
        say.eksik.push(b.si.sablon);
        isaretler.push({ tur: "eksik", sablon: b.si.sablon, metin: e.metin, kutu: e.kutu });
        return;
      }
      if (b.durum === "ayni") { say.ayni++; return; }
      if (b.durum === "fontYok") {
        say.fontYok.push(b.hedef);
        isaretler.push({ tur: "fontYok", sablon: b.si.sablon, metin: e.metin, hedef: b.hedef, kutu: e.kutu });
        return;
      }
      // Kendi özgün yeri engel değildir
      const kendi = new Set(ayrilan.get(e));
      const eng = yerelEngeller(e, S, kutular.filter((k) => !kendi.has(k)), genislik(b.hedef, e.s));
      const y = sigdir(e, eng, b.hedef);
      // Yerleşen yazı artık özgün yerinin yerine engel olur
      const yeniKutu = sayfaKutusu(e, y.us, y.us + y.W, y.ilkV - (y.sat.length - 1) * y.ara - 0.03 * y.pt, y.ilkV + buyukHarfOrani() * y.pt);
      yeniKutu.yazi = true;
      for (let k = kutular.length - 1; k >= 0; k--) if (kendi.has(kutular[k])) kutular.splice(k, 1);
      kutular.push(yeniKutu);
      e.satirlar.forEach((r) => r.parcalar.forEach((p) => {
        if (!degisim.has(p.akis)) { degisim.set(p.akis, []); zincirler.set(p.akis, p.zincir); }
        degisim.get(p.akis).push([p.bas, p.son, p.yerine]);
      }));
      yazilar.push({ e, y, metin: b.hedef });
      say.cevrilen++;
      if (y.kucuk) say.kucuk.push({ metin: b.hedef, sayfa: sn + 1, pt: y.pt });
      isaretler.push({ tur: y.kucuk ? "kucuk" : "cevrildi", sablon: b.si.sablon, metin: e.metin, hedef: b.hedef, kutu: yeniKutu, ozgun: e.kutu, pt: y.pt, s0: e.s, zorla: !!y.zorla });
    });
    const gruplar = [];
    for (const [akis, liste] of degisim) gruplar.push({ akis, zincir: zincirler.get(akis), liste: liste.sort((a, b) => a[0] - b[0]) });
    return { imza, gruplar, yazilar, isaretler, say, govde: null };
  }

  /**
   * Bir dil için sayfa sayfa yapılacak değişiklikler. Hafıza değiştiğinde yalnızca etiketlerinin hedef metni
   * değişen sayfalar yeniden hesaplanır.
   */
  function plan(kaynak, dil) {
    const T = kaynak.tarama;
    const surum = Hafiza.surum();
    const kayitli = T.planlar[dil];
    if (kayitli && kayitli.surum === surum) return kayitli;
    const onceki = kayitli ? kayitli.sayfalar : [];
    let yeniden = 0;
    const sayfalar = T.sayfalar.map((S, sn) => {
      const bilgiler = S.etiketler.map((e) => hedefBilgi(e, dil));
      const imza = bilgiler.map((b) => b.imza).join("\u0001");
      if (onceki[sn] && onceki[sn].imza === imza) {
        // Yerleşim aynı; eksik/sabit sınıfları ve şablon adları güncel kalsın diye işaretler yeniden bağlanır
        return onceki[sn];
      }
      yeniden++;
      return sayfaPlani(S, sn, bilgiler, imza);
    });
    const say = { etiket: 0, cevrilen: 0, ayni: 0, sabit: 0, eksik: new Map(), kucuk: [], fontYok: [] };
    sayfalar.forEach((P_, sn) => {
      say.etiket += P_.say.etiket; say.cevrilen += P_.say.cevrilen; say.ayni += P_.say.ayni; say.sabit += P_.say.sabit;
      P_.say.kucuk.forEach((k) => say.kucuk.push(k));
      P_.say.fontYok.forEach((k) => say.fontYok.push(k));
      P_.say.eksik.forEach((s) => {
        const k = Hafiza.anahtar(s);
        if (!say.eksik.has(k)) say.eksik.set(k, { sablon: s, sayfalar: new Set(), adet: 0 });
        const x = say.eksik.get(k);
        x.sayfalar.add(sn + 1);
        x.adet++;
      });
    });
    const sonuc = { surum, sayfalar, say, yeniden };
    T.planlar[dil] = sonuc;
    return sonuc;
  }

  // ---------------------------------------------------------------- terim listesi ve bağlam
  /** Etiketin aynı sayfadaki en yakın komşuları: terimin anlamına ipucu. */
  function komsular(S, e, adet) {
    const liste = [];
    for (const n of S.etiketler) {
      if (n === e) continue;
      const d = Math.hypot(n.ox - e.ox, n.oy - e.oy);
      if (d < 120) liste.push({ d, metin: n.metin });
    }
    liste.sort((a, b) => a.d - b.d);
    const o = [];
    for (const x of liste) { if (!o.includes(x.metin)) o.push(x.metin); if (o.length >= adet) break; }
    return o;
  }

  /** Belgedeki tüm etiket şablonları: arayüz listesi ve eksik sayımı için. */
  function terimler(kaynak) {
    const T = kaynak.tarama;
    if (T.terimSurum === Hafiza.surum() && T.terimListe) return T.terimListe;
    const h = new Map();
    T.sayfalar.forEach((S, sn) => {
      S.etiketler.forEach((e) => {
        const si = sinifla(e.metin);
        if (si.tur === "kod") return;
        const k = Hafiza.anahtar(si.sablon);
        if (!h.has(k)) h.set(k, { sablon: si.sablon, ornek: e.metin, tur: si.tur, kayit: si.kayit || null, otomatik: !!si.otomatik, adet: 0, sayfalar: new Set(), yerler: [] });
        const x = h.get(k);
        x.adet++;
        x.sayfalar.add(sn + 1);
        if (x.yerler.length < 3) x.yerler.push({ sayfa: sn + 1, kutu: e.kutu, kodlar: si.yerler, komsu: null, S, e });
      });
    });
    const liste = [...h.values()].sort((a, b) => a.sablon.localeCompare(b.sablon, "tr"));
    T.terimListe = liste;
    T.terimSurum = Hafiza.surum();
    return liste;
  }

  /** Terimin bağlamı: geçtiği sayfalar, cihaz kodları ve yakınındaki etiketler. */
  function baglam(t) {
    return t.yerler.slice(0, 2).map((y) => {
      if (!y.komsu) y.komsu = komsular(y.S, y.e, 6);
      return { sayfa: y.sayfa, kodlar: y.kodlar, yakin: y.komsu };
    });
  }

  /**
   * Seçilen dillerden en az birinde karşılığı olmayan terimler.
   * Dönüş: [{sablon, ornek, diller: [eksik diller], yeni: hafızada hiç yok mu, terim}]
   */
  function eksikler(kaynak, diller) {
    const o = [];
    for (const t of terimler(kaynak)) {
      if (t.tur === "kod" || (t.tur === "sabit")) continue;
      if (t.tur === "eksik") { o.push({ sablon: t.sablon, ornek: t.ornek, diller: diller.slice(), yeni: true, terim: t }); continue; }
      const eks = diller.filter((d) => !t.kayit[d]);
      if (eks.length) o.push({ sablon: t.sablon, ornek: t.ornek, diller: eks, yeni: false, terim: t });
    }
    return o;
  }

  /** Belgede kullanılan ve seçili dillerde onay bekleyen terimler. */
  function onaysizlar(kaynak, diller) {
    const o = [];
    for (const t of terimler(kaynak)) {
      if (!t.kayit) continue;
      const bek = t.kayit.onaysiz || [];
      if (bek.includes("tur") || diller.some((d) => bek.includes(d) && t.kayit[d])) o.push(t);
    }
    return o;
  }

  // ---------------------------------------------------------------- PDF'e yazma
  function degistir(ham, liste) {
    const on = [];
    let x = 0;
    for (const [bas, son, yerine] of liste) {
      if (bas < x) continue; // üst üste binen değişiklik olmaz; olursa ilk geçerli
      on.push(ham.slice(x, bas), yerine);
      x = son;
    }
    on.push(ham.slice(x));
    return on.join("");
  }

  function govdeUret(S, P_) {
    if (P_.govde) return P_.govde;
    const g = P_.gruplar.find((x) => x.akis === null);
    P_.govde = "q\n" + (g ? degistir(S.ham, g.liste) : S.ham) + "\n" + "Q\n".repeat(S.derinlik + 1);
    return P_.govde;
  }

  function yaziAkisi(P_, pf, kutuGoster) {
    let o = "";
    for (const { e, y } of P_.yazilar) {
      o += `q ${e.renk}\n`;
      y.sat.forEach((m, i) => {
        const g = genislik(m, y.pt);
        const u = y.us + (y.hiza === "sag" ? y.W - g : y.hiza === "orta" ? (y.W - g) / 2 : 0);
        const v = y.ilkV - i * y.ara;
        const x = e.ox + e.dx * u + e.ux * v, b = e.oy + e.dy * u + e.uy * v;
        const d = duzen(m);
        const hex = pf.encodeText(m).asString();
        const birim = 1000 / d.upm;
        const dizi = [];
        let tampon = "";
        for (let k = 0; k < d.glif.length; k++) {
          tampon += hex.slice(k * 4, k * 4 + 4);
          if (k === d.glif.length - 1) break;
          const fark = (d.ilerle[k] - d.taban[k]) * birim;
          if (Math.abs(fark) > 0.01) {
            dizi.push(`<${tampon}>`, yuvarla(-fark));
            tampon = "";
          }
        }
        if (tampon) dizi.push(`<${tampon}>`);
        o += `q ${yuvarla(e.dx)} ${yuvarla(e.dy)} ${yuvarla(e.ux)} ${yuvarla(e.uy)} ${yuvarla(x)} ${yuvarla(b)} cm BT /${FONT_ADI} ${yuvarla(y.pt)} Tf 0 0 Td [${dizi.join(" ")}]TJ ET Q\n`;
      });
      o += "Q\n";
      if (kutuGoster) {
        o += `q ${yuvarla(e.dx)} ${yuvarla(e.dy)} ${yuvarla(e.ux)} ${yuvarla(e.uy)} ${yuvarla(e.ox)} ${yuvarla(e.oy)} cm 0.4 w\n`;
        o += `0.95 0.45 0 RG ${yuvarla(y.L)} ${yuvarla(y.vb)} ${yuvarla(y.R - y.L)} ${yuvarla(y.vt - y.vb)} re S\n`;
        o += `0 0.65 0.2 RG ${yuvarla(y.us)} ${yuvarla(y.vb)} ${yuvarla(y.W)} ${yuvarla(y.vt - y.vb)} re S Q\n`;
      }
    }
    return o;
  }

  /**
   * Değişen formların kopyalarını yazar: her form için içeriği değiştirilmiş yeni bir akış oluşturulur ve
   * üstündeki kaynak sözlükleri (sayfadan forma kadar) kopyalanıp yeni akışa bağlanır. Özgün form değişmez.
   */
  function formlariYaz(res, gruplar, T, baglam) {
    const kok = new Map();
    for (const g of gruplar) {
      let m = kok, d = null;
      for (const z of g.zincir) {
        if (!m.has(z.ad)) m.set(z.ad, { ad: z.ad, ref: z.ref, cocuk: new Map(), liste: null });
        d = m.get(z.ad);
        m = d.cocuk;
      }
      if (d) d.liste = g.liste;
    }
    const agacYaz = (r, agac) => {
      const eski = r.lookupMaybe(ad("XObject"), PDFDict);
      if (!eski) return;
      const xo = eski.clone(baglam);
      for (const d of agac.values()) {
        const st = xo.lookupMaybe(ad(d.ad), PDFStream);
        if (!st) continue;
        const dict = st.dict.clone(baglam);
        if (d.cocuk.size) {
          const r0 = dict.lookupMaybe(ad("Resources"), PDFDict);
          if (r0) { const r1 = r0.clone(baglam); agacYaz(r1, d.cocuk); dict.set(ad("Resources"), r1); }
        }
        let yeni;
        if (d.liste && d.liste.length && T.formHam.has(d.ref)) {
          const sik = baglam.flateStream(metinBayt(degistir(T.formHam.get(d.ref), d.liste)));
          dict.set(ad("Filter"), ad("FlateDecode"));
          dict.delete(ad("DecodeParms"));
          yeni = PDFRawStream.of(dict, sik.contents);
        } else {
          yeni = PDFRawStream.of(dict, st instanceof PDFRawStream ? st.contents : st.getContents());
        }
        xo.set(ad(d.ad), baglam.register(yeni));
      }
      r.set(ad("XObject"), xo);
    };
    agacYaz(res, kok);
  }

  /**
   * Çeviriyi çıktı sayfasına uygular. Bu sayfa düğümü artık kendi içerik akışını ve kaynak sözlüğünü kullanır;
   * özgün akış değişmez, başka dil kopyaları onu kullanmaya devam eder.
   */
  function sayfayaUygula(sayfa, S, P_, pf, cikti, kutuGoster, T) {
    if (!P_.yazilar.length) return false;
    const baglam = cikti.context;
    const res = sayfa.node.Resources().clone(baglam);
    const eskiFont = res.lookupMaybe(ad("Font"), PDFDict);
    const fontlar = eskiFont ? eskiFont.clone(baglam) : baglam.obj({});
    fontlar.set(ad(FONT_ADI), pf.ref);
    res.set(ad("Font"), fontlar);
    const formGrup = P_.gruplar.filter((g) => g.akis !== null);
    if (formGrup.length && T) formlariYaz(res, formGrup, T, baglam);
    sayfa.node.set(ad("Resources"), res);
    const akis = metinBayt(govdeUret(S, P_) + yaziAkisi(P_, pf, kutuGoster));
    sayfa.node.set(ad("Contents"), baglam.register(baglam.flateStream(akis)));
    return true;
  }

  window.Ceviri = { hazirla, plan, terimler, eksikler, onaysizlar, baglam, sayfayaUygula, sinifla, kesinKod, sablonla, fontaUydur, FONT };
})();
