/* ── Dışa aktarım (tarayıcı) ──
   Hedef: exports/<proje>/<proje>_<DİLLER>_Rev<xx>.<uzantı> — çalışma klasörüne doğrudan
   yazılır; HTML / Web ayrıca indirilir, PDF tarayıcının baskısıyla indirme listesine girer.
   - HTML / Web: görseller data URI olarak gömülür (isteğe bağlı küçültme). Birden çok dil
     tek dosyada birleşir, ortak görsel bir kez gömülür (web-export.js).
   - PDF: yalnız DocumentX.vbs ile açılınca (?dxprint=direct). Tarayıcı --kiosk-printing ile
     penceresiz, son dosya adıyla exports/.pdf-spool/ altına basar ve bunu indirme listesine
     ekler; yer imleri (bölüm başlıkları ve sayfaları), meta veri ve isteğe bağlı PDF/A-2b
     eklentileri pdf-lib ile aynı dosyanın üzerine yazılır, kopyası exports/<proje>/ altına.
     Ayrıca indirme yapılmaz. Seçilen diller tek baskıda birleşir; belge içi bağlantılar
     tarayıcının PDF'inde korunur.
   - Yazdırma penceresi hiçbir zaman açılmaz. */
const DXExport = (() => {
  const DEFAULT_LANG = 'tr';
  const safeFileName = (s) => String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim();
  const escapeHtmlText = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function target(opts, ext) {
    const dir = safeFileName(DXBackend.guideDirName(opts && opts.guideId)) || 'klavuz';
    const lang = String((opts && opts.lang) || DEFAULT_LANG).toUpperCase();
    const rev = safeFileName(opts && opts.rev) || 'xx';
    return { dir: 'exports/' + dir, name: `${dir}_${lang}_Rev${rev}.${ext}` };
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  async function save(opts, ext, blob) {
    const t = target(opts, ext);
    if (DXFS.writable()) {
      const rel = t.dir + '/' + t.name;
      await DXFS.writeBytes(rel, blob);
      if (opts && opts.download) download(blob, t.name);
      return { success: true, filePath: rel };
    }
    download(blob, t.name);
    return { success: true, filePath: t.name, downloaded: true };
  }

  const scripts = new Map();
  function loadScript(src) {
    if (!scripts.has(src)) {
      scripts.set(src, new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => { scripts.delete(src); reject(new Error(src + ' yüklenemedi')); };
        document.head.appendChild(s);
      }));
    }
    return scripts.get(src);
  }

  /* Çıktı stilleri: uygulamanın html-export.css + doc-content.css dosyaları.
     http(s) üzerinden fetch; file:// açılışta çalışma klasöründeki codes/ kopyası. */
  function cssFromSheets(name) {
    const out = [];
    const visit = (sheet) => {
      try {
        if (sheet.href && sheet.href.split(/[?#]/)[0].endsWith('/' + name)) {
          out.push([...sheet.cssRules].map(r => r.cssText).join('\n'));
          return;
        }
        [...sheet.cssRules].forEach(r => { if (r.styleSheet) visit(r.styleSheet); });
      } catch (e) { /* erişilemeyen sayfa stili */ }
    };
    [...document.styleSheets].forEach(visit);
    return out.join('\n');
  }

  async function exportCss() {
    const parts = [];
    for (const f of ['html-export.css', 'doc-content.css']) {
      let text = null;
      try {
        if (/^https?:/i.test(location.protocol)) {
          const r = await fetch(new URL(f, document.baseURI));
          if (r.ok) text = await r.text();
        }
      } catch (e) { /* aşağıdaki yedek */ }
      if (text == null) text = await DXFS.readText('codes/' + f).catch(() => null);
      if (text == null) text = cssFromSheets(f);
      if (text) parts.push(text);
    }
    return parts.join('\n');
  }

  /* <img src> → data URI: görseller önceden bir kez çözülür. */
  async function resolveImages(htmls, optimize) {
    const srcs = new Set();
    htmls.forEach(h => String(h).replace(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi, (tag, src) => {
      if (!/^data:/i.test(src)) srcs.add(src);
      return tag;
    }));
    const map = new Map();
    await Promise.all([...srcs].map(async (src) =>
      map.set(src, await DXAssets.dataUriForSrc(src.replace(/&amp;/g, '&'), { optimize }))));
    return (src) => map.get(src) || null;
  }

  /* payload.parts: [{ lang, title, html }]. Tek dil: görseller yerinde gömülür.
     Birden çok dil: art arda bölümler, ortak görsel bir kez (DXWebExport.buildMergedHtml). */
  async function exportHtml(payload = {}) {
    try {
      const css = await exportCss();
      const parts = payload.parts || [];
      const optimize = payload.optimize !== false;
      let html;
      if (parts.length > 1) {
        const toDataUri = await resolveImages(parts.map(p => p.html), optimize);
        html = DXWebExport.buildMergedHtml({ parts, css, toDataUri });
      } else {
        const part = parts[0] || { lang: DEFAULT_LANG, title: '', html: '' };
        const inlined = await DXAssets.inlineImages(part.html, { optimize });
        html = `<!DOCTYPE html>
<html lang="${safeFileName(part.lang).toLowerCase()}" class="html-export">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtmlText(part.title || 'Kullanım Kılavuzu')}</title>
  <style>${css}</style>
</head>
<body class="html-export">
${inlined}
<script>${DXWebExport.GOTO_JS}</script>
</body>
</html>`;
      }
      return save(payload, 'html', new Blob([html], { type: 'text/html;charset=utf-8' }));
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /* Etkileşimli web kılavuzu: payload { guideId, rev, langs: [{ lang, title, html }], defaultLang, brandColor, optimize, download } */
  async function exportWeb(payload = {}) {
    try {
      const css = await exportCss();
      const toDataUri = await resolveImages((payload.langs || []).map(l => l.html), payload.optimize !== false);
      const html = DXWebExport.buildWebManual({
        langs: payload.langs || [],
        defaultLang: payload.defaultLang || DEFAULT_LANG,
        brandColor: payload.brandColor,
        css,
        toDataUri
      });
      return save({ ...payload, lang: 'WEB' }, 'html', new Blob([html], { type: 'text/html;charset=utf-8' }));
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /* ── PDF ── */
  /* Sayfalı görünümdeki bölüm başlıkları → [{ title, level, page }] (page 0 tabanlı) */
  function collectOutline() {
    const pages = [...document.querySelectorAll('#pagesContainer > .a4-page')];
    const items = [];
    pages.forEach((page, i) => {
      page.querySelectorAll('.sec-h').forEach(h => {
        const level = Number((h.className.match(/sec-h(\d)/) || [])[1] || 2);
        const title = h.textContent.replace(/\s+/g, ' ').trim();
        if (level <= 3 && title) items.push({ title, level, page: i });
      });
    });
    return { items, pageCount: pages.length };
  }

  /* Doğrudan kayıt: yalnız başlatıcı tarayıcıyı kiosk baskı ayarlarıyla açtıysa.
     Kiosk ayarı yokken window.print() normal pencereyi açar; bu yüzden adres işareti şart.
     Edge sessiz baskıyla kaydettiği PDF'i indirme listesine ekler. Bu yüzden baskı doğrudan son
     dosya adıyla alınır, yer imleri aynı dosyanın üzerine yazılır ve ayrıca indirme yapılmaz:
     listede yalnız asıl PDF görünür (aynı ad varsa Edge "ad (1).pdf" der). */
  const SPOOL_DIR = 'exports/.pdf-spool';
  const SPOOL_TIMEOUT_MS = 300000;
  const SPOOL_POLL_MS = 400;
  const SPOOL_KEEP_MS = 30 * 24 * 3600 * 1000;
  let directBusy = false;

  function directPdfEnabled() {
    return DXFS.kind() === 'handle' && DXFS.writable()
      && new URLSearchParams(window.location.search).get('dxprint') === 'direct';
  }

  /* Eski sürümün ham dosyaları (dxpdf_*) ve 30 günden eski baskılar silinir. */
  async function cleanSpool() {
    const now = Date.now();
    for (const e of await DXFS.list(SPOOL_DIR)) {
      if (e.kind !== 'file') continue;
      const rel = `${SPOOL_DIR}/${e.name}`;
      try {
        if (e.name.startsWith('dxpdf_')) { await DXFS.remove(rel); continue; }
        const f = await DXFS.file(rel);
        if (f && now - f.lastModified > SPOOL_KEEP_MS) await DXFS.remove(rel);
      } catch (err) { /* açık dosya: sonraki sefere */ }
    }
  }

  /* Baskıdan sonra klasörde beliren yeni PDF; tarayıcı yazmayı bitirmiş olmalı (boyut iki
     yoklamada aynı, dosya sonu işareti var). → { name, bytes } */
  async function waitForNewPdf(before, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    const last = new Map();
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, SPOOL_POLL_MS));
      let names = [];
      try {
        names = (await DXFS.list(SPOOL_DIR)).filter(e => e.kind === 'file' && /\.pdf$/i.test(e.name) && !before.has(e.name)).map(e => e.name);
      } catch (e) {
        continue;
      }
      for (const name of names) {
        try {
          const f = await DXFS.file(`${SPOOL_DIR}/${name}`);
          const size = f ? f.size : -1;
          if (size > 0 && size === last.get(name)) {
            const bytes = new Uint8Array(await f.arrayBuffer());
            const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 32)));
            if (tail.includes('%%EOF')) return { name, bytes };
          }
          last.set(name, size);
        } catch (e) {
          last.delete(name);   // tarayıcı dosyayı hâlâ yazıyor
        }
      }
    }
    return null;
  }

  /* Tarayıcı indirmeyi kapatırken dosya kısa süre meşgul olabilir: birkaç kez denenir. */
  async function writeWithRetry(rel, blob) {
    for (let i = 0; ; i++) {
      try {
        return await DXFS.writeBytes(rel, blob);
      } catch (e) {
        if (i >= 4 || !(e && e.name === 'NoModificationAllowedError')) throw e;
        await new Promise(r => setTimeout(r, 800));
      }
    }
  }

  async function printPdfDirect(t, info) {
    if (directBusy) return { success: false, error: 'Önceki PDF çıktısı henüz bitmedi' };
    directBusy = true;
    const prevTitle = document.title;
    try {
      await DXFS.mkdirp(SPOOL_DIR);
      await cleanSpool();
      const before = new Set((await DXFS.list(SPOOL_DIR)).map(e => e.name));
      document.title = t.name.replace(/\.pdf$/i, '');   // tarayıcı dosya adını başlıktan alır
      window.print();
      const timeoutMs = Math.max(SPOOL_TIMEOUT_MS, ((info.outline && info.outline.pageCount) || 0) * 2000);
      const got = await waitForNewPdf(before, timeoutMs);
      if (!got) return { success: false, error: `PDF ${Math.round(timeoutMs / 60000)} dakikada oluşmadı. DocumentX.vbs ile yeniden açıp deneyin` };

      let bytes = got.bytes;
      let warning = '';
      try {
        await loadScript('web/vendor/pdf-lib.min.js');
        const out = await postProcessPdf(got.bytes, info.meta, { pdfa: info.pdfa, outline: info.outline, labels: info.labels });
        bytes = out.bytes;
        warning = out.warning;
      } catch (e) {
        warning = 'yer imleri ve belge bilgileri eklenemedi: ' + e.message;
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      // İndirme listesindeki dosya ham baskıdır: son hali üzerine yazılır.
      try {
        await writeWithRetry(`${SPOOL_DIR}/${got.name}`, blob);
      } catch (e) {
        warning = [warning, 'indirme listesindeki kopya güncellenemedi, son hali exports/ klasöründe'].filter(Boolean).join('; ');
      }
      const rel = `${t.dir}/${t.name}`;
      try {
        await DXFS.writeBytes(rel, blob);
      } catch (e) {
        if (e && e.name === 'NoModificationAllowedError') return { success: false, error: `${t.name} başka bir programda açık; kapatıp yeniden deneyin` };
        throw e;
      }
      return { success: true, filePath: rel, warning, listed: got.name };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      document.title = prevTitle;
      directBusy = false;
    }
  }

  /* Kiosk ayarı olmadan window.print() yazdırma penceresini açar; o yüzden burada durulur. */
  async function printPdf(opts = {}) {
    if (!directPdfEnabled()) return { success: false, error: 'PDF için uygulamayı DocumentX.vbs ile açın' };
    const t = target(opts, 'pdf');
    return printPdfDirect(t, { meta: opts.meta || {}, pdfa: !!opts.pdfa, outline: opts.outline || collectOutline(), labels: opts.labels });
  }

  /* sRGB IEC61966-2.1 ICC v2 profili (PDF/A çıktı amacı için; burada üretilir). */
  function srgbIcc() {
    const s15 = (v) => Math.round(v * 65536);
    const tags = [];
    const ascii = (s) => [...s].map(c => c.charCodeAt(0));
    const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    const u16 = (v) => [(v >>> 8) & 255, v & 255];
    const xyz = (x, y, z) => [...ascii('XYZ '), 0, 0, 0, 0, ...u32(s15(x) >>> 0), ...u32(s15(y) >>> 0), ...u32(s15(z) >>> 0)];
    const descText = 'sRGB IEC61966-2.1';
    const desc = [...ascii('desc'), 0, 0, 0, 0, ...u32(descText.length + 1), ...ascii(descText), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...new Array(67).fill(0)];
    const cprt = [...ascii('text'), 0, 0, 0, 0, ...ascii('No copyright, use freely'), 0];
    const n = 1024;
    const curve = [...ascii('curv'), 0, 0, 0, 0, ...u32(n)];
    for (let i = 0; i < n; i++) {
      const c = i / (n - 1);
      const lin = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      curve.push(...u16(Math.round(lin * 65535)));
    }
    tags.push(['desc', desc], ['cprt', cprt], ['wtpt', xyz(0.9642, 1.0, 0.8249)],
      ['rXYZ', xyz(0.4360747, 0.2225045, 0.0139322)], ['gXYZ', xyz(0.3850649, 0.7168786, 0.0971045)],
      ['bXYZ', xyz(0.1430804, 0.0606169, 0.7141733)], ['rTRC', curve], ['gTRC', 'rTRC'], ['bTRC', 'rTRC']);
    const tableSize = 4 + tags.length * 12;
    let offset = 128 + tableSize;
    const placed = {};
    const data = [];
    const table = [...u32(tags.length)];
    tags.forEach(([sig, bytes]) => {
      if (typeof bytes === 'string') {
        const p = placed[bytes];
        table.push(...ascii(sig), ...u32(p.offset), ...u32(p.size));
        return;
      }
      while (offset % 4) { data.push(0); offset++; }
      placed[sig] = { offset, size: bytes.length };
      table.push(...ascii(sig), ...u32(offset), ...u32(bytes.length));
      data.push(...bytes);
      offset += bytes.length;
    });
    while (offset % 4) { data.push(0); offset++; }
    const header = new Array(128).fill(0);
    const put = (at, arr) => arr.forEach((b, i) => { header[at + i] = b; });
    put(0, u32(offset));
    put(8, [0x02, 0x10, 0, 0]);
    put(12, ascii('mntr'));
    put(16, ascii('RGB '));
    put(20, ascii('XYZ '));
    put(24, [...u16(2024), ...u16(1), ...u16(1), 0, 0, 0, 0, 0, 0]);
    put(36, ascii('acsp'));
    put(68, [...u32(s15(0.9642)), ...u32(s15(1.0)), ...u32(s15(0.8249))]);
    return new Uint8Array([...header, ...table, ...data]);
  }

  function xmlEscape(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function xmpDate(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`;
  }

  function buildXmp(meta, now) {
    const lang = meta.lang || 'x-default';
    return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
    xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(meta.title)}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>${xmlEscape(meta.author || 'DocumentX')}</rdf:li></rdf:Seq></dc:creator>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(meta.subject)}</rdf:li></rdf:Alt></dc:description>
   <dc:language><rdf:Bag><rdf:li>${xmlEscape(lang)}</rdf:li></rdf:Bag></dc:language>
   <xmp:CreatorTool>DocumentX</xmp:CreatorTool>
   <xmp:CreateDate>${xmpDate(now)}</xmp:CreateDate>
   <xmp:ModifyDate>${xmpDate(now)}</xmp:ModifyDate>
   <xmp:MetadataDate>${xmpDate(now)}</xmp:MetadataDate>
   <pdf:Producer>DocumentX</pdf:Producer>
   <pdf:Keywords>${xmlEscape((meta.keywords || []).join(', '))}</pdf:Keywords>
   <pdfaid:part>2</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  }

  /* Bölüm başlıklarından PDF yer imleri (/Outlines) — seviye 1-3, sayfaya bağlı. */
  function addOutline(pdf, items) {
    const { PDFName, PDFHexString, PDFNumber, PDFNull } = PDFLib;
    const ctx = pdf.context;
    const pages = pdf.getPages();
    const root = { children: [], ref: ctx.nextRef() };
    const stack = [{ level: 0, node: root }];
    items.forEach(it => {
      if (!pages[it.page]) return;
      while (stack.length > 1 && stack[stack.length - 1].level >= it.level) stack.pop();
      const node = { ...it, children: [], ref: ctx.nextRef(), parent: stack[stack.length - 1].node };
      node.parent.children.push(node);
      stack.push({ level: it.level, node });
    });
    const count = (n) => n.children.reduce((s, c) => s + 1 + (c.level < 2 ? count(c) : 0), 0);
    const write = (n) => {
      n.children.forEach((c, i) => {
        const dict = {
          Title: PDFHexString.fromText(c.title),
          Parent: n.ref,
          Dest: ctx.obj([pages[c.page].ref, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull])
        };
        if (i > 0) dict.Prev = n.children[i - 1].ref;
        if (i < n.children.length - 1) dict.Next = n.children[i + 1].ref;
        if (c.children.length) {
          dict.First = c.children[0].ref;
          dict.Last = c.children[c.children.length - 1].ref;
          // 1. seviye açık, alt seviyeler kapalı (negatif sayı)
          dict.Count = PDFNumber.of(c.level < 2 ? count(c) : -c.children.length);
        }
        ctx.assign(c.ref, ctx.obj(dict));
        write(c);
      });
    };
    if (!root.children.length) return false;
    write(root);
    ctx.assign(root.ref, ctx.obj({
      Type: PDFName.of('Outlines'),
      First: root.children[0].ref,
      Last: root.children[root.children.length - 1].ref,
      Count: PDFNumber.of(count(root))
    }));
    pdf.catalog.set(PDFName.of('Outlines'), root.ref);
    pdf.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
    return true;
  }

  /* Görüntüleyicide sayfa adları: [{ start, prefix, numbered }] (start 0 tabanlı). */
  function addPageLabels(pdf, labels) {
    const { PDFName, PDFString, PDFNumber } = PDFLib;
    const ctx = pdf.context;
    const nums = [];
    labels.forEach((l) => {
      const dict = { P: PDFString.of(l.prefix) };   // önekler yalnız ASCII
      if (l.numbered) {
        dict.S = PDFName.of('D');
        dict.St = PDFNumber.of(1);
      }
      nums.push(PDFNumber.of(l.start), ctx.obj(dict));
    });
    pdf.catalog.set(PDFName.of('PageLabels'), ctx.obj({ Nums: nums }));
  }

  /* meta: { title, author, subject, keywords: [], lang }  opts: { pdfa, outline, labels } */
  async function postProcessPdf(input, meta = {}, opts = {}) {
    const { PDFDocument, PDFName, PDFHexString, PDFNumber, PDFDict, PDFArray, ParseSpeeds } = PDFLib;
    // Zamanlayıcıyla adım adım çalışmasın: pencere arka plandayken tarayıcı zamanlayıcıları
    // saniyede bire indirir ve büyük PDF'te bu aşama bitmez. İlerleme perdesi zaten açık.
    const pdf = await PDFDocument.load(input, { updateMetadata: false, parseSpeed: ParseSpeeds.Fastest });
    const now = new Date();
    pdf.setTitle(meta.title || '', { showInWindowTitleBar: true });
    if (meta.author) pdf.setAuthor(meta.author);
    if (meta.subject) pdf.setSubject(meta.subject);
    if (meta.keywords && meta.keywords.length) pdf.setKeywords(meta.keywords.filter(Boolean));
    pdf.setCreator('DocumentX');
    pdf.setProducer('DocumentX');
    pdf.setCreationDate(now);
    pdf.setModificationDate(now);
    if (meta.lang) pdf.setLanguage(meta.lang);

    let warning = '';
    const outline = opts.outline || { items: [], pageCount: 0 };
    if (outline.items && outline.items.length) {
      if (outline.pageCount && pdf.getPageCount() !== outline.pageCount) {
        warning = `PDF ${pdf.getPageCount()} sayfa, kılavuz ${outline.pageCount} sayfa; yer imleri eklenmedi (yazdırırken kenar boşluğu "Yok", ölçek "Varsayılan" seçin)`;
      } else {
        addOutline(pdf, outline.items);
      }
    }

    if (opts.labels && opts.labels.length) addPageLabels(pdf, opts.labels);

    let pdfa = false;
    if (opts.pdfa) {
      const ctx = pdf.context;
      const catalog = pdf.catalog;
      const xmp = ctx.stream(buildXmp(meta, now), { Type: 'Metadata', Subtype: 'XML' });
      catalog.set(PDFName.of('Metadata'), ctx.register(xmp));
      const iccStream = ctx.flateStream(srgbIcc(), { N: 3 });
      const intent = ctx.obj({
        Type: 'OutputIntent',
        S: 'GTS_PDFA1',
        OutputConditionIdentifier: PDFHexString.fromText('sRGB IEC61966-2.1'),
        Info: PDFHexString.fromText('sRGB IEC61966-2.1'),
        DestOutputProfile: ctx.register(iccStream)
      });
      catalog.set(PDFName.of('OutputIntents'), ctx.obj([ctx.register(intent)]));
      // Bağlantı notları yazdırılabilir olmalı (/F 4)
      pdf.getPages().forEach(page => {
        const annots = page.node.lookup(PDFName.of('Annots'));
        if (!(annots instanceof PDFArray)) return;
        for (let i = 0; i < annots.size(); i++) {
          const a = annots.lookup(i);
          if (a instanceof PDFDict) a.set(PDFName.of('F'), PDFNumber.of(4));
        }
      });
      const idBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(meta.title) + now.toISOString()))).slice(0, 16);
      const id = [...idBytes].map(b => b.toString(16).padStart(2, '0')).join('');
      ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(id), PDFHexString.of(id)]);
      pdfa = true;
    }
    const bytes = await pdf.save({ useObjectStreams: !pdfa, objectsPerTick: Infinity });
    return { bytes, pdfa, warning };
  }

  /* ── Çıktı klasörü: tarayıcı Gezgin açamaz; dosyalar listelenir, tıklayınca açılır. ── */
  async function openExports(guideId) {
    const dir = 'exports/' + (DXBackend.guideDirName(guideId) || '');
    const files = (await DXFS.list(dir)).filter(e => e.kind === 'file').map(e => e.name).sort();
    let ov = document.getElementById('dxExportsOverlay');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.className = 'np-overlay';
    ov.id = 'dxExportsOverlay';
    ov.style.display = 'flex';
    ov.innerHTML = `<div class="np-modal"><div class="np-head"><div class="np-title"></div><button class="np-close" title="Kapat">✕</button></div><div class="np-body"><div class="dx-export-list"></div><p class="np-hint"></p></div></div>`;
    ov.querySelector('.np-title').textContent = dir + '/';
    ov.querySelector('.np-close').onclick = () => ov.remove();
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.querySelector('.np-hint').textContent = `Dosyalar çalışma klasöründe (${DXFS.name()}/${dir}/) durur; tarayıcı Gezgin'i açamaz, tıklayınca dosya yeni sekmede açılır.`;
    const list = ov.querySelector('.dx-export-list');
    if (!files.length) list.textContent = 'Henüz çıktı yok.';
    files.forEach(name => {
      const b = document.createElement('button');
      b.className = 'qc-item';
      b.textContent = name;
      b.onclick = async () => {
        const f = await DXFS.file(dir + '/' + name);
        if (f) window.open(URL.createObjectURL(f), '_blank');
      };
      list.appendChild(b);
    });
    document.body.appendChild(ov);
    return { ok: true, dir };
  }

  return { exportHtml, exportWeb, printPdf, directPdfEnabled, postProcessPdf, openExports, srgbIcc, collectOutline, loadScript, target };
})();
