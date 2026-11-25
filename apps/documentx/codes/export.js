/* ── Dışa aktarım: Toplu çıktı (PDF / HTML / Web) ──
   Seçilen diller her biçimde tek dosyada birleşir. Hedef:
   exports/<proje>/<proje>_<DİLLER>_Rev<xx>.<uzantı> (web/exporters.js); dosya ayrıca indirilir. */

/* Gizli pencerede (CLI) requestAnimationFrame çalışmaz; kısa zamanlayıcıyla bekle. */
function settle(ms = 60) {
  return new Promise(r => setTimeout(r, ms));
}

/* Pencere gizli ya da başka pencerenin altındaysa tarayıcı çizmez ve img.decode() dönmez.
   Baskı görseli kendisi çözer; o yüzden çözme en fazla kısa bir süre beklenir, yükleme beklenir. */
async function waitForImages(root) {
  const imgs = [...(root || document).querySelectorAll('img')];
  await Promise.all(imgs.map(img => {
    if (img.complete) return img.decode ? Promise.race([img.decode().catch(() => {}), settle(3000)]) : null;
    return new Promise(r => { img.onload = img.onerror = r; });
  }));
}

function exportOpts(extra) {
  return { guideId: currentGuideId, lang: currentLang, rev: currentRev, ...(extra || {}) };
}

/* PDF meta verisi: başlık, yazar (hazırlayan), konu, anahtar kelimeler, dil. */
function pdfMeta() {
  const title = coverDocumentTitle(currentCoverName || currentModel, currentLang, { series: currentCoverSeries });
  return {
    title,
    author: preparedBy() || getFirmaFooter(currentFirma),
    subject: `${title} — Rev.${currentRev || 'xx'}`,
    keywords: [currentModel, currentFirma, currentLang.toUpperCase(), 'Rev.' + (currentRev || 'xx'), 'EN ISO 20607'],
    lang: { tr: 'tr-TR', en: 'en-US', de: 'de-DE' }[currentLang] || currentLang
  };
}

async function ensureView(mode) {
  if (viewMode !== mode) {
    await setViewMode(mode);
    await settle();
  }
}

/* Görünümü geçici değiştirip işi yapar, sonra eski görünüme döner. */
async function withView(mode, fn) {
  const prev = viewMode;
  if (typeof closeSearch === 'function') closeSearch();
  await ensureView(mode);
  try {
    return await fn();
  } finally {
    if (prev !== mode) await setViewMode(prev);
  }
}

/* Çıktı sürerken canlı yenileme sayfaları değiştirmez (renderer.js). Sayfalar birleştiyse
   ya da dosya değiştiyse iş bitince açık dil yeniden çizilir (runBatch). */
let exportRunning = false;
let exportRedraw = false;

function exportProgress(text) {
  let el = document.getElementById('dxExportProgress');
  if (text == null) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'dxExportProgress';
    el.className = 'dx-export-progress';
    el.innerHTML = '<div class="dx-export-progress-box"><span></span></div>';
    document.body.appendChild(el);
  }
  el.querySelector('span').textContent = text;
}

async function showExportLang(lang) {
  if (lang === currentLang) return;
  currentLang = lang;
  await onModelChange(currentGuideId);
  await settle();
}

/* Klonda kimlikler ve belge içi bağlantılar dile özel olur; böylece her dilin bağlantısı
   kendi sayfasına gider. lang: büyük harf dönüşümü sayfa diline göre çalışsın. */
function prefixForLang(root, lang) {
  const prefix = `l-${lang}-`;
  root.lang = lang;
  [root, ...root.querySelectorAll('[id]')].forEach((el) => {
    if (el.id && !el.closest('svg')) el.id = prefix + el.id;
  });
  root.querySelectorAll('a[href^="#"]').forEach((a) => {
    const href = a.getAttribute('href');
    if (href.length > 1) a.setAttribute('href', '#' + prefix + href.slice(1));
  });
  root.querySelectorAll('[data-goto^="#"]').forEach((el) => {
    el.dataset.goto = '#' + prefix + el.dataset.goto.slice(1);
  });
  return root;
}

/* ── PDF ── */
const PDF_LANG_TITLES = { tr: 'Türkçe', en: 'English', de: 'Deutsch' };
const PDF_COVER_LABELS = { tr: 'Kapak', en: 'Cover', de: 'Deckblatt' };

/* Dilleri sırayla çizer, sayfalarını tek belgede art arda dizer. Her dilin kendi kapağı,
   içindekileri ve sayfa numaraları vardır. → { meta, outline, labels } */
async function assemblePdfPages(langs, onLang) {
  const container = document.getElementById('pagesContainer');
  const pages = [];
  const items = [];
  const labels = [];
  let meta = null;
  for (let i = 0; i < langs.length; i++) {
    const lang = langs[i];
    if (onLang) onLang(lang, i);
    await showExportLang(lang);
    await waitForImages(container);
    if (!meta) meta = pdfMeta();
    const offset = pages.length;
    const outline = DXExport.collectOutline();
    items.push({ title: PDF_LANG_TITLES[lang] || lang.toUpperCase(), level: 1, page: offset });
    outline.items.forEach(it => items.push({ ...it, level: it.level + 1, page: it.page + offset }));
    // Görüntüleyicideki sayfa adı basılı numarayla aynı olsun: kapak numarasızdır, sonra 1'den başlar.
    labels.push({ start: offset, prefix: `${lang.toUpperCase()} ${PDF_COVER_LABELS[lang] || 'Cover'}` });
    labels.push({ start: offset + 1, prefix: `${lang.toUpperCase()}-`, numbered: true });
    [...container.querySelectorAll(':scope > .a4-page')].forEach(p => pages.push(prefixForLang(p.cloneNode(true), lang)));
  }
  exportRedraw = true;
  container.replaceChildren(...pages);
  await waitForImages(container);
  meta.keywords = [...new Set([...(meta.keywords || []), ...langs.map(l => l.toUpperCase())])];
  return { meta, outline: { items, pageCount: pages.length }, labels };
}

async function doExportPdf(langs) {
  return withView('pdf', async () => {
    const container = document.getElementById('pagesContainer');
    const common = { pageSize: paperSize(), pdfa: outputOption('pdfa') };
    if (langs.length === 1) {
      exportProgress(`PDF hazırlanıyor: ${langs[0].toUpperCase()}…`);
      await showExportLang(langs[0]);
      exportProgress('PDF oluşturuluyor…');
      await waitForImages(container);
      // Büyük görseller geçici olarak küçültülmüş kopyalarla değiştirilir (PDF boyutu)
      const restore = await swapOptimizedImages(container);
      try {
        return await window.dxApi.printPdf(exportOpts({ ...common, meta: pdfMeta() }));
      } finally {
        restore();
      }
    }
    const { meta, outline, labels } = await assemblePdfPages(langs, (lang, i) => exportProgress(`PDF hazırlanıyor: ${lang.toUpperCase()} (${i + 1}/${langs.length})…`));
    exportProgress(`PDF oluşturuluyor: ${outline.pageCount} sayfa…`);
    await swapOptimizedImages(container);
    return window.dxApi.printPdf(exportOpts({ ...common, lang: langs.join('-'), meta, outline, labels }));
  });
}

/* ── HTML ve web kılavuzu ── */
/* Dilleri HTML görünümünde sırayla çizer → [{ lang, title, html }] */
async function collectHtmlLangs(langs, label, toHtml) {
  const parts = [];
  await withView('html', async () => {
    const container = document.getElementById('pagesContainer');
    for (let i = 0; i < langs.length; i++) {
      const lang = langs[i];
      exportProgress(`${label} hazırlanıyor: ${lang.toUpperCase()} (${i + 1}/${langs.length})…`);
      await showExportLang(lang);
      await waitForImages(container);
      const doc = document.querySelector('.html-document.html-unified');
      if (!doc) continue;
      parts.push({
        lang,
        title: coverDocumentTitle(currentCoverName || currentModel, lang, { series: currentCoverSeries }),
        html: toHtml(doc, lang)
      });
    }
  });
  return parts;
}

async function doExportHtml(langs) {
  const merged = langs.length > 1;
  const parts = await collectHtmlLangs(langs, 'HTML', (doc, lang) => (merged ? prefixForLang(doc.cloneNode(true), lang) : doc).outerHTML);
  if (!parts.length) return { success: false, error: 'HTML içeriği bulunamadı' };
  exportProgress('HTML oluşturuluyor…');
  return window.dxApi.exportHtml(exportOpts({ lang: langs.join('-'), parts, optimize: outputOption('gorsel_optimize'), download: true }));
}

/* Web kılavuzu: seçilen diller tek dosyada, dil seçiciyle. */
async function doExportWeb(langs) {
  const startLang = currentLang;
  const parts = await collectHtmlLangs(langs, 'Web kılavuzu', doc => doc.outerHTML);
  if (!parts.length) return { success: false, error: 'İçerik bulunamadı' };
  exportProgress('Web kılavuzu oluşturuluyor…');
  return window.dxApi.exportWeb({
    guideId: currentGuideId,
    rev: currentRev,
    langs: parts,
    defaultLang: langs.includes(startLang) ? startLang : langs[0],
    brandColor: getBrand(currentFirma).color,
    optimize: outputOption('gorsel_optimize'),
    download: true
  });
}

async function openExportsFolder() {
  if (!currentGuideId) { showToast('Önce bir kılavuz seçin', 'error'); return; }
  const r = await window.dxApi.openExports(currentGuideId);
  if (!r || !r.ok) showToast('Klasör açılamadı', 'error');
}

/* ── Toplu çıktı ── */
/* Dil seçimi kılavuz başına, biçim seçimi genel hatırlanır; ilk açılışta bütün diller. */
async function openBatchExport() {
  if (window.DX_PREVIEW) { showToast((await window.dxApi.printPdf({})).error, 'error'); return; }
  if (!currentGuideId) { showToast('Önce bir kılavuz seçin', 'error'); return; }
  if (exportRunning) { showToast('Çıktı hazırlanıyor, bitmesini bekleyin', 'error'); return; }
  const saved = prefGet('exportLangs.' + currentGuideId, null);
  const picked = Array.isArray(saved) ? currentDiller.filter(l => saved.includes(l)) : [];
  const langBox = document.getElementById('beLangs');
  langBox.innerHTML = '';
  currentDiller.forEach(l => {
    const label = document.createElement('label');
    label.className = 'np-lang';
    label.innerHTML = `<input type="checkbox" value="${l}"${!picked.length || picked.includes(l) ? ' checked' : ''} /> ${l.toUpperCase()}`;
    langBox.appendChild(label);
  });
  // DocumentX.vbs ile açılmadıysa PDF seçilemez: yazdırma penceresi hiçbir yolla açılmaz.
  const direct = window.dxApi.directPdfEnabled();
  const formats = prefGet('exportFormats', ['pdf']);
  document.querySelectorAll('#beFormats input').forEach((box) => {
    const off = box.value === 'pdf' && !direct;
    box.disabled = off;
    box.checked = !off && formats.includes(box.value);
  });
  document.getElementById('bePdfHint').hidden = direct;
  document.getElementById('beLog').innerHTML = '';
  document.getElementById('beGo').disabled = false;
  document.getElementById('beTarget').textContent = `exports/${currentGuideId.replace(/^proje:/, '')}/`;
  document.getElementById('beOverlay').style.display = 'flex';
}

function closeBatchExport() {
  document.getElementById('beOverlay').style.display = 'none';
}

function batchLog(msg, cls) {
  const box = document.getElementById('beLog');
  if (!box) return;
  const row = document.createElement('div');
  row.className = cls || '';
  row.textContent = msg;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

async function submitBatchExport() {
  const langs = [...document.querySelectorAll('#beLangs input:checked')].map(i => i.value);
  const formats = [...document.querySelectorAll('#beFormats input:checked')].map(i => i.value);
  document.getElementById('beLog').innerHTML = '';
  if (!langs.length || !formats.length) {
    batchLog('En az bir dil ve bir biçim seçin.', 'row-err');
    return;
  }
  prefSet('exportLangs.' + currentGuideId, langs);
  prefSet('exportFormats', formats);
  document.getElementById('beGo').disabled = true;
  const r = await runBatch(langs, formats, batchLog);
  document.getElementById('beGo').disabled = false;
  batchLog(r.ok ? `Tamamlandı: ${r.files.length} dosya.` : `${r.errors.length} hata ile bitti.`, r.ok ? 'row-ok' : 'row-err');
}

const EXPORT_FORMATS = {
  pdf: { label: 'PDF', run: doExportPdf },
  html: { label: 'HTML', run: doExportHtml },
  web: { label: 'Web kılavuzu', run: doExportWeb }
};

/* Her biçim için tek dosya: seçilen diller o dosyada birleşir. İş bitince açık dil geri gelir. */
async function runBatch(langs, formats, log) {
  const files = [];
  const errors = [];
  const warnings = [];
  const startLang = currentLang;
  exportRunning = true;
  try {
    for (const fmt of formats) {
      const { label, run } = EXPORT_FORMATS[fmt];
      log(`… ${label}`, 'row-run');
      try {
        const res = await run(langs);
        if (res && res.success) {
          files.push(res.filePath);
          log(`✓ ${res.filePath.split(/[\\/]/).pop()}`, 'row-ok');
          if (res.warning) {
            warnings.push(res.warning);
            log(`⚠ ${label}: ${res.warning}`, 'row-err');
          }
        } else {
          errors.push(`${label}: ${(res && res.error) || 'kaydedilemedi'}`);
          log(`✗ ${errors[errors.length - 1]}`, 'row-err');
        }
      } catch (e) {
        errors.push(`${label}: ${e.message}`);
        log(`✗ ${errors[errors.length - 1]}`, 'row-err');
      }
    }
  } finally {
    if (exportRedraw || currentLang !== startLang) {
      currentLang = startLang;
      await onModelChange(currentGuideId);
    }
    exportProgress(null);
    exportRedraw = false;
    exportRunning = false;
  }
  return { ok: errors.length === 0, files, errors, warnings };
}
