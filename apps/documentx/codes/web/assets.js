/* ── Görseller (tarayıcı) ──
   Çalışma klasöründeki görsellerin tarayıcıda bir adresi yoktur; kılavuz
   yüklenirken proje assets/, kök assets/{labels,logos,iso7010} ve model kapak
   çizimleri için blob: adresleri üretilir (dosya okunmaz, File tembel başvurudur).
   Adresin sonuna "#<göreli yol>" eklenir: uzantıya bakan kod (.svg) ve işaret
   anahtarı (markKey) çalışmaya devam eder; blob yüklemesinde parça yok sayılır.
   Ayrıca: görsel boyutu (başlıktan), çıktı için küçültme (canvas), data URI. */
const DXAssets = (() => {
  const IMG = /\.(png|jpe?g|webp|gif|svg|bmp)$/i;
  const OPT_MAX_SIDE = 2000;
  const OPT_MIN_BYTES = 600 * 1024;
  const entries = new Map();     // rel → { url, mtime, size }
  const lower = new Map();       // küçük harf rel → rel (Windows'taki büyük/küçük harf toleransı)
  const optCache = new Map();    // "rel|mtime|size" → Blob | null

  const encodeRel = (rel) => rel.split('/').map(encodeURIComponent).join('/');

  async function scanDirs(dirs, extra) {
    const seen = new Set();
    const lists = await Promise.all(dirs.map(d => DXFS.walk(d, { filter: n => IMG.test(n) }).catch(() => [])));
    const rels = [...new Set(lists.flat().concat((extra || []).filter(Boolean)))];
    const b = DXFS.backend();
    if (b && typeof b.assetUrl === 'function') {
      // Önizleme paketi: görseller sayfanın yanında yayınlı, doğrudan adresleri kullanılır.
      rels.forEach((rel) => {
        const url = b.assetUrl(rel);
        if (!url) return;
        const st = b.assetStat(rel) || {};
        seen.add(rel);
        entries.set(rel, { url: url + '#' + encodeRel(rel), mtime: st.mtime || 0, size: st.size || 0 });
      });
      return seen;
    }
    await Promise.all(rels.map(async (rel) => {
      const f = await DXFS.file(rel).catch(() => null);
      if (!f) return;
      seen.add(rel);
      const old = entries.get(rel);
      if (old && old.mtime === f.lastModified && old.size === f.size) return;
      if (old) URL.revokeObjectURL(old.url.split('#')[0]);
      entries.set(rel, { url: URL.createObjectURL(f) + '#' + encodeRel(rel), mtime: f.lastModified, size: f.size });
    }));
    return seen;
  }

  /* Kılavuz yanıtı (getGuide) için gereken tüm görsel adresleri hazırlar.
     Döner: önceki taramaya göre değişen/eklenen/silinen görsel var mı. */
  async function prepare(res) {
    const before = new Map([...entries].map(([k, v]) => [k, v.url]));
    const dirs = ['assets/labels', 'assets/logos', 'assets/iso7010'];
    if (res && res.projectRel) dirs.push(res.projectRel + '/assets');
    if (res && res.model) dirs.push('projects/' + String(res.model).toLowerCase() + '/assets/kapak');
    const seen = await scanDirs(dirs, [res && res.kapakCizim]);
    for (const [rel, e] of [...entries]) {
      if (!seen.has(rel)) { URL.revokeObjectURL(e.url.split('#')[0]); entries.delete(rel); }
    }
    lower.clear();
    entries.forEach((_, rel) => lower.set(rel.toLowerCase(), rel));
    let changed = before.size !== entries.size;
    if (!changed) for (const [k, url] of before) if (!entries.has(k) || entries.get(k).url !== url) { changed = true; break; }
    return changed;
  }

  function urlFor(rel) {
    let r = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
    let e = entries.get(r);
    if (!e) {
      try { r = decodeURIComponent(r); } catch (err) { /* olduğu gibi */ }
      try { r = DXFS.norm(r); } catch (err) { return ''; }
      e = entries.get(r) || entries.get(lower.get(r.toLowerCase()));
    }
    return e ? e.url : '';
  }

  /* <img src> → çalışma klasörüne göre yol ('' bulunamazsa) */
  function relFromSrc(src) {
    let s = String(src || '').replace(/&amp;/g, '&');
    const hash = s.indexOf('#');
    if (/^blob:/i.test(s)) {
      if (hash < 0) return '';
      s = s.slice(hash + 1);
    } else if (hash >= 0 && s.slice(hash + 1).includes('/')) {
      s = s.slice(hash + 1);                      // önizleme: "media/…#<göreli yol>"
    } else if (/^(data|https?):/i.test(s)) {
      return '';
    }
    try { s = decodeURIComponent(s); } catch (e) { /* olduğu gibi */ }
    s = s.replace(/\\/g, '/').replace(/^(\.\.\/)+/, '');
    try { return DXFS.norm(s); } catch (e) { return ''; }
  }

  /* ── Görsel boyutu (dosya başlığından; büyük fotoğrafı açmadan) ── */
  async function imageSize(file) {
    try {
      const head = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
      const dv = new DataView(head.buffer);
      const asc = (o, n) => String.fromCharCode(...head.subarray(o, o + n));
      if (head[0] === 0x89 && asc(1, 3) === 'PNG') return { w: dv.getUint32(16), h: dv.getUint32(20) };
      if (asc(0, 4) === 'GIF8') return { w: dv.getUint16(6, true), h: dv.getUint16(8, true) };
      if (asc(0, 4) === 'RIFF' && asc(8, 4) === 'WEBP') {
        const kind = asc(12, 4);
        if (kind === 'VP8 ') return { w: dv.getUint16(26, true) & 0x3fff, h: dv.getUint16(28, true) & 0x3fff };
        if (kind === 'VP8L') {
          const b = dv.getUint32(21, true);
          return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
        }
        if (kind === 'VP8X') {
          return { w: 1 + (head[24] | head[25] << 8 | head[26] << 16), h: 1 + (head[27] | head[28] << 8 | head[29] << 16) };
        }
      }
      if (head[0] === 0xff && head[1] === 0xd8) {
        let p = 2;
        while (p + 9 < head.length) {
          if (head[p] !== 0xff) { p++; continue; }
          const marker = head[p + 1];
          if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) { p += marker === 0xff ? 1 : 2; continue; }
          const len = dv.getUint16(p + 2);
          if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { w: dv.getUint16(p + 7), h: dv.getUint16(p + 5) };
          }
          p += 2 + len;
        }
      }
    } catch (e) { /* okunamadı */ }
    if (typeof createImageBitmap === 'function' && !/svg/i.test(file.type || '')) {
      try {
        const bmp = await createImageBitmap(file);
        const r = { w: bmp.width, h: bmp.height };
        bmp.close();
        return r;
      } catch (e) { /* çözülemedi */ }
    }
    return null;
  }

  function mimeOf(name, blob) {
    const ext = String(name || '').split('.').pop().toLowerCase();
    return (blob && blob.type) || { svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }[ext] || 'application/octet-stream';
  }

  function blobToDataUri(blob, name) {
    return new Promise((resolve, reject) => {
      const typed = blob.type ? blob : new Blob([blob], { type: mimeOf(name) });
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(typed);
    });
  }

  /* Çıktı için küçültülmüş kopya: uzun kenar > 2000 px veya > 600 KB; küçülmüyorsa null. */
  async function optimized(rel) {
    if (!rel || /\.(svg|gif)$/i.test(rel)) return null;
    const f = await DXFS.file(rel);
    if (!f) return null;
    const key = `${rel}|${f.lastModified}|${f.size}`;
    if (optCache.has(key)) return optCache.get(key);
    let out = null;
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
      const big = Math.max(bmp.width, bmp.height) > OPT_MAX_SIDE;
      if (big || f.size > OPT_MIN_BYTES) {
        const k = big ? OPT_MAX_SIDE / Math.max(bmp.width, bmp.height) : 1;
        const w = Math.max(1, Math.round(bmp.width * k));
        const h = Math.max(1, Math.round(bmp.height * k));
        const png = /\.png$/i.test(rel);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (!png) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(bmp, 0, 0, w, h);
        const blob = await new Promise(r => canvas.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.85));
        if (blob && blob.size < f.size * 0.9) out = blob;
      }
      bmp.close();
    } catch (e) {
      out = null;
    }
    optCache.set(key, out);
    return out;
  }

  /* Renderer'daki görsel adresi → data URI (opts.optimize: küçültülmüş kopya). Bulunamazsa null. */
  async function dataUriForSrc(src, opts = {}) {
    try {
      if (/^data:/i.test(src)) return src;
      const rel = relFromSrc(src);
      if (rel) {
        const small = opts.optimize ? await optimized(rel) : null;
        if (small) return blobToDataUri(small, rel);
        const f = await DXFS.file(rel);
        if (f) return blobToDataUri(f, rel);
      }
      if (/^blob:/i.test(src)) {
        const blob = await (await fetch(src.split('#')[0])).blob();
        return blobToDataUri(blob, rel);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /* HTML metnindeki <img src> → data URI (bulunamayan olduğu gibi kalır). */
  async function inlineImages(html, opts = {}) {
    const srcs = new Set();
    String(html).replace(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi, (tag, src) => { if (!/^data:/i.test(src)) srcs.add(src); return tag; });
    const map = new Map();
    await Promise.all([...srcs].map(async (src) => map.set(src, await dataUriForSrc(src.replace(/&amp;/g, '&'), opts))));
    return String(html).replace(/(<img\b[^>]*\bsrc=")([^"]+)("[^>]*>)/gi, (tag, a, src, b) => {
      const uri = map.get(src);
      return uri ? a + uri + b : tag;
    });
  }

  /* PDF öncesi: görsel adresi → küçültülmüş kopyanın blob adresi (yazdırma için) */
  const printUrls = [];
  async function optimizeForPrint(srcs) {
    printUrls.splice(0).forEach(u => URL.revokeObjectURL(u));
    const map = {};
    for (const src of Array.isArray(srcs) ? srcs : []) {
      const rel = relFromSrc(src);
      const small = rel && await optimized(rel);
      if (!small) continue;
      const u = URL.createObjectURL(small);
      printUrls.push(u);
      map[src] = u + '#' + encodeRel(rel);
    }
    return map;
  }

  function reset() {
    entries.forEach(e => URL.revokeObjectURL(e.url.split('#')[0]));
    entries.clear();
    lower.clear();
    optCache.clear();
  }

  return { prepare, urlFor, relFromSrc, imageSize, blobToDataUri, optimized, dataUriForSrc, inlineImages, optimizeForPrint, reset };
})();

/* state.js > assetUrl ve images.js > markKey bu iki işlevi kullanır. */
function dxAssetUrl(rel) {
  return DXAssets.urlFor(rel);
}

function dxAssetRel(src) {
  return DXAssets.relFromSrc(src);
}
