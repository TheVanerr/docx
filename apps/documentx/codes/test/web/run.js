/* Tarayıcı testleri (Playwright + Chromium) — Electron test koşucularının yerini alır.
   node test/web/run.js [--shots <klasör>]
   1) Render: test/render/harness.html (belge motoru birim/çizim testleri) + PDF son işlem
      (yer imleri, meta veri, PDF/A).
   2) Arayüz: index.html, fixture çalışma klasörü OPFS'e kopyalanıp bağlanır
      (seçilen klasörle aynı FileSystemDirectoryHandle yolu); paneller, görünümler,
      düzenleyici, project.yaml kaydı, canlı yenileme, yeni proje, toplu çıktı (PDF/HTML/Web).
   3) Web kılavuzu: üretilen tek dosyalık web çıktısının davranışı.
   projects/ klasörüne dokunulmaz; testler test/fixtures/projects kullanır. */
const fs = require('fs');
const path = require('path');
const H = require('./harness');

const shotsIdx = process.argv.indexOf('--shots');
const shotsDir = shotsIdx > 0 ? path.resolve(process.argv[shotsIdx + 1] || path.join(__dirname, 'out')) : null;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let passed = 0;
let failed = 0;
function check(name, ok, info) {
  if (ok) passed++; else failed++;
  console.log((ok ? '✔ ' : '✖ ') + name + (!ok && info !== undefined ? ' — ' + info : ''));
}
function section(title) {
  console.log('\n── ' + title);
}
function writeShot(name, data) {
  if (!shotsDir) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.writeFileSync(path.join(shotsDir, name), data);
}

function collectErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  return errors;
}

/* ── 1) Render testleri ── */
async function renderTests(browser, base) {
  section('Render (belge motoru)');
  const page = await browser.newPage({ viewport: { width: 1300, height: 1200 } });
  const errors = collectErrors(page);
  const done = new Promise((resolve) => {
    page.on('console', (m) => {
      const msg = m.text();
      if (msg.startsWith('[test] ')) console.log(msg.slice(7));
      else if (msg.startsWith('[done] ')) resolve(JSON.parse(msg.slice(7)));
    });
  });
  const paperIdx = process.argv.indexOf('--paper');
  await page.goto(base + '/codes/test/render/harness.html' + (paperIdx > 0 ? '?paper=' + process.argv[paperIdx + 1] : ''));
  const result = await Promise.race([done, wait(180000).then(() => null)]);
  if (!result) { check('render testleri zamanında bitti', false, '180 sn'); return; }
  passed += result.passed;
  failed += result.failed;

  section('PDF son işlem (yer imleri, meta veri, PDF/A)');
  await page.addScriptTag({ url: base + '/codes/web/vendor/pdf-lib.min.js' });
  await page.addScriptTag({ url: base + '/codes/web/exporters.js' });
  const raw = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, tagged: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  writeShot('fixture.pdf', raw);
  const r = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const outline = DXExport.collectOutline();
    const meta = { title: 'KNV 40 KULLANIM KILAVUZU', author: 'Test Kişi', subject: 'Rev.02', keywords: ['KNV 40', 'TR'], lang: 'tr-TR' };
    const post = await DXExport.postProcessPdf(bytes, meta, { pdfa: true, outline });
    const doc = await PDFLib.PDFDocument.load(post.bytes, { updateMetadata: false });
    const rawDoc = await PDFLib.PDFDocument.load(bytes);
    const txt = new TextDecoder('latin1').decode(post.bytes);
    const outlines = doc.catalog.lookup(PDFLib.PDFName.of('Outlines'));
    let count = 0;
    const walk = (ref) => {
      for (let n = ref && doc.context.lookup(ref); n; n = n.get(PDFLib.PDFName.of('Next')) && doc.context.lookup(n.get(PDFLib.PDFName.of('Next')))) {
        count++;
        walk(n.get(PDFLib.PDFName.of('First')));
      }
    };
    if (outlines) walk(outlines.get(PDFLib.PDFName.of('First')));
    let b64out = '';
    for (let i = 0; i < post.bytes.length; i += 0x8000) b64out += String.fromCharCode(...post.bytes.subarray(i, i + 0x8000));
    return {
      title: doc.getTitle(), author: doc.getAuthor(), lang: doc.catalog.lookup(PDFLib.PDFName.of('Lang')) ? 'var' : '',
      outlineItems: outline.items.length, outlineCount: count, pageCount: doc.getPageCount(), rawPages: rawDoc.getPageCount(),
      a4: outline.pageCount, tagged: /\/StructTreeRoot/.test(txt), pdfa: post.pdfa && /pdfaid:part>2/.test(txt) && /\/OutputIntents/.test(txt) && /\/ID\s*\[/.test(txt),
      warning: post.warning, b64: btoa(b64out)
    };
  }, Buffer.from(raw).toString('base64'));
  check('başlık / yazar meta verisi', r.title === 'KNV 40 KULLANIM KILAVUZU' && r.author === 'Test Kişi', `${r.title} / ${r.author}`);
  check('PDF sayfa sayısı = A4 sayfa sayısı', r.rawPages === r.a4, `${r.rawPages} / ${r.a4}`);
  check('yer imleri (/Outlines) bölüm başlıklarından', r.outlineItems > 3 && r.outlineCount === r.outlineItems, `${r.outlineCount} / ${r.outlineItems} ${r.warning || ''}`);
  check('etiket ağacı (/StructTreeRoot) korundu', r.tagged);
  check('PDF/A: XMP pdfaid + OutputIntent (sRGB) + /ID', r.pdfa);
  check('sayfa sayısı değişmedi', r.pageCount === r.rawPages);
  writeShot('fixture-pdfa.pdf', Buffer.from(r.b64, 'base64'));

  if (shotsDir) {
    const count = await page.evaluate(() => document.querySelectorAll('#pagesContainer > .a4-page').length);
    for (let i = 0; i < count; i++) {
      const el = (await page.$$('#pagesContainer > .a4-page'))[i];
      writeShot(`page-${String(i + 1).padStart(2, '0')}.png`, await el.screenshot());
    }
  }
  await page.close();
}

/* ── 2) Arayüz testleri ── */
async function uiTests(browser, base) {
  section('Arayüz (index.html, fixture çalışma klasörü)');
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  const js = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (name) => { if (shotsDir) writeShot(name, await page.screenshot()); };
  page.on('dialog', d => d.accept());

  await page.goto(base + '/codes/index.html');
  await page.waitForSelector('#dxConnect', { timeout: 15000 });
  check('açılışta çalışma klasörü istenir', await js(() => !!document.querySelector('#dxConnect .np-go')));
  await shot('ui-0-connect.png');
  const files = H.workspaceFiles({ 'DEMO-KNV-40': 'codes/test/fixtures/projects/DEMO-KNV-40' });
  await H.mountWorkspace(page, files);
  await page.waitForFunction(() => currentGuideId === 'proje:DEMO-KNV-40' && document.querySelectorAll('.a4-page').length > 2, null, { timeout: 30000 });
  await wait(800);
  check('bağlanınca bağlantı ekranı kapanır', await js(() => !document.getElementById('dxConnect')));
  check('kılavuz seçildi ve çizildi', await js(() => document.querySelectorAll('.a4-page').length > 2));
  check('yaml kapak değerleri kutularda', await js(() => document.getElementById('revInput').value === '01' && document.getElementById('firmaSelect').value === 'ORNEK'));
  check('firma seçici brands.js\'ten doldu', await js(() => document.querySelectorAll('#firmaSelect option').length === Object.keys(BRANDS).length));
  check('görseller blob adresinden yüklendi (logo)', await js(() => {
    const imgs = [...document.querySelectorAll('#pagesContainer img')];
    return imgs.length > 0 && imgs.every(i => /^blob:/.test(i.getAttribute('src')) && i.complete && i.naturalWidth > 0);
  }));
  await shot('ui-1-pdf.png');

  await js(() => {
    if (!document.body.classList.contains('sidebar-open')) toggleSidebar();
    if (!document.body.classList.contains('qc-open')) toggleQcPanel();
  });
  await wait(1200);
  check('kenar çubuğunda bölüm ağacı', await js(() => document.querySelectorAll('#sidebarBody .sb-row').length >= 4));
  check('kalite kontrolde [EKSİK] bulgusu', await js(() => qcIssues.some(i => i.type === 'eksik')));
  await js(() => scrollToPage(qcIssues.find(i => i.type === 'eksik').anchor, { instant: true }));
  await wait(300);
  check('görünen sayfanın bulguları panelde parlıyor', await js(() => {
    const p = qcVisiblePage();
    const rows = [...document.querySelectorAll('#qcBody .qc-item.qc-here')];
    return rows.length > 0 && rows.every(r => qcIssueElement(r.qcIssue).closest('.a4-page') === p);
  }));
  check('şerit sayfa ve bulgu sayısını yazıyor', await js(() => /^Sayfa \S+: \d+ bulgu$/.test(document.querySelector('#qcBody .qc-here-bar').textContent)),
    await js(() => document.querySelector('#qcBody .qc-here-bar').textContent));
  await js(() => scrollToPage(document.querySelector('.cover-page'), { instant: true }));
  await wait(300);
  check('bulgusuz sayfada parlama yok', await js(() => !document.querySelector('#qcBody .qc-here') && /bulgu yok$/.test(document.querySelector('#qcBody .qc-here-bar').textContent)));
  await js(() => runParityCheck());
  await wait(800);
  check('dil eşleşmesi EN tablo eksiğini buldu', await js(() => qcParity.some(i => /Tablo TR 1 \/ EN 0/.test(i.detail))),
    await js(() => JSON.stringify(qcParity.map(i => i.detail))));
  await shot('ui-2-panels.png');

  await js(() => setSidebarTab('pages'));
  await wait(1200);
  check('sayfa küçük resimleri oluştu', await js(() => document.querySelectorAll('#sidebarBody .sb-thumb-page').length > 0));
  await js(() => { openSearch(); document.getElementById('searchInput').value = 'şalter'; runSearch(); });
  await wait(400);
  check('arama "şalter" eşleşti', await js(() => searchRanges.length >= 2), await js(() => searchRanges.length));
  await shot('ui-3-search-thumbs.png');
  await js(() => { closeSearch(); setSidebarTab('outline'); });

  await js(() => setViewMode('compare'));
  await wait(1200);
  check('karşılaştırma: TR ↔ EN satırları', await js(() => document.querySelectorAll('.compare-row').length === 4));
  check('karşılaştırma: LOTO bölümünde fark işareti', await js(() => [...document.querySelectorAll('.compare-row.has-diff')].some(r => /2\.1/.test(r.textContent))));
  await shot('ui-4-compare.png');

  await js(() => setViewMode('html'));
  await wait(1200);
  check('HTML görünümü çizildi', await js(() => !!document.querySelector('.html-document .html-flow-content .md-callout')));
  await shot('ui-5-html.png');
  await js(() => setViewMode('pdf'));
  await wait(1000);

  await js(() => setLanguage('en'));
  await wait(1200);
  check('EN: sinyal kelimesi WARNING', await js(() => !!document.querySelector('.md-callout[data-signal="WARNING"]')));
  check('EN: çapraz referans "(p. N)"', await js(() => /\(p\. \d+\)/.test(document.querySelector('a.xref .xref-page').textContent)));
  await js(() => setLanguage('tr'));
  await wait(1000);
  check('dil değişince eski eşleşme sonucu "eşleşiyor" demez', await js(() => qcParityFor === '' && !document.querySelector('#qcBody .qc-item.ok')));

  await page.setViewportSize({ width: 1400, height: 900 });
  await wait(600);
  check('1400 px genişlikte navbar taşmıyor',
    await js(() => { const n = document.querySelector('.navbar'); return n.scrollWidth <= n.clientWidth + 1; }),
    await js(() => document.querySelector('.navbar').scrollWidth + ' / ' + document.querySelector('.navbar').clientWidth));
  await shot('ui-0-1400.png');

  await js(() => openDocSettings());
  await wait(300);
  await shot('ui-6-settings.png');
  await js(async () => { closeDocSettings(); await openBatchExport(); });
  await wait(200);
  await shot('ui-7-export-menu.png');
  await js(() => closeBatchExport());

  check('alt+tık kaynak bilgisi blokta', await js(() => !!document.querySelector('#pagesContainer [data-src][data-line]')));
  check('DATA yer tutucusu değere dönüştü (400)', await js(() => [...document.querySelectorAll('.data-val')].some(e => e.textContent === '400')));
  await js(() => setSidebarTab('data'));
  await wait(300);
  check('DATA sekmesi blokları listeler', await js(() => document.querySelectorAll('#sidebarBody .sb-data-block').length === 2));
  check('DATA kullanım sayısı rozeti', await js(() => !!document.querySelector('#sidebarBody .sb-data-used')));
  await js(() => setSidebarTab('outline'));

  await js(() => openDashboard());
  await wait(1500);
  check('pano DEMO kılavuzunu listeler', await js(() => [...document.querySelectorAll('.dash-table td')].some(td => /DEMO KNV 40/.test(td.textContent))));
  await shot('ui-8-dashboard.png');
  await js(() => closeDashboard());

  await js(() => openIsoReport());
  await wait(300);
  check('ISO 20607 raporu 30 konu', await js(() => document.querySelectorAll('#isoList .iso-row').length === 30));
  await js(() => closeIsoReport());

  await js(() => openAssetReport());
  await wait(1200);
  check('görsel raporu açıldı', await js(() => document.querySelectorAll('#arBody .qc-group').length === 4));
  await js(() => closeAssetReport());

  // ── Düzenleyici: okuma, canlı önizleme, kaydetme (çalışma klasörüne yazar) ──
  const rel = 'projects/DEMO-KNV-40/02-safety/01-loto/loto.tr.md';
  const original = await js((rel) => window.dxApi.readFile(rel).then(r => r.text), rel);
  await js((rel) => openEditor(rel, 3), rel);
  await wait(600);
  check('düzenleyici açıldı, önizleme dolu', await js(() => isEditorOpen() && document.querySelectorAll('#edPreview .md-callout').length === 1));
  await js(() => { const t = document.getElementById('edText'); t.value += '\n\nDüzenleyiciden eklenen satır.\n'; t.dispatchEvent(new Event('input')); });
  await wait(600);
  check('canlı önizleme güncellendi', await js(() => /Düzenleyiciden eklenen/.test(document.getElementById('edPreview').textContent)));
  await shot('ui-9-editor.png');
  await js(() => saveEditor());
  await wait(1500);
  check('kaydedilen değişiklik kılavuzda', await js(() => /Düzenleyiciden eklenen/.test(document.getElementById('pagesContainer').textContent)));
  check('kaydedilen değişiklik dosyada', /Düzenleyiciden eklenen/.test(await js((rel) => DXFS.readText(rel), rel)));
  await js(() => closeEditor(true));
  await js(([rel, text]) => window.dxApi.writeFile(rel, text, 0, true), [rel, original]);

  // ── Canlı yenileme: dosya dışarıdan değişince kılavuz yenilenir ──
  await wait(2500);
  await js((rel) => DXFS.readText(rel).then(t => DXFS.writeText(rel, t + '\n\nDışarıdan eklenen paragraf.\n')), rel);
  const live = await page.waitForFunction(() => /Dışarıdan eklenen paragraf/.test(document.getElementById('pagesContainer').textContent), null, { timeout: 12000 }).then(() => true, () => false);
  check('canlı yenileme: dışarıdan değişen dosya yeniden çizildi', live);
  await js(([rel, text]) => DXFS.writeText(rel, text), [rel, original]);
  await page.waitForFunction(() => !/Dışarıdan eklenen paragraf/.test(document.getElementById('pagesContainer').textContent), null, { timeout: 12000 }).catch(() => {});

  // ── project.yaml kaydı (yorumlar korunur) ──
  const yamlBefore = await js(() => DXFS.readText('projects/DEMO-KNV-40/project.yaml'));
  const saved = await js(() => window.dxApi.saveGuideMeta('proje:DEMO-KNV-40', { kapak: { rev: '07' } }));
  const yamlAfter = await js(() => DXFS.readText('projects/DEMO-KNV-40/project.yaml'));
  check('project.yaml: kapak.rev yazıldı, geri kalanı aynı', saved.ok && /rev: '07'/.test(yamlAfter) && yamlAfter.split('\n').length === yamlBefore.split('\n').length,
    JSON.stringify(saved));
  await js((t) => DXFS.writeText('projects/DEMO-KNV-40/project.yaml', t), yamlBefore);

  // ── Yeni proje: OPFS'te küçük bir model şablonundan ──
  await js(async () => {
    await DXFS.writeText('projects/mini/project.yaml', 'proje_adi: MINI\nmodel: mini\nsablon: true\nbolumler:\n  - id: 01-introduction\n    dosya: introduction\n');
    await DXFS.writeText('projects/mini/01-introduction/introduction.tr.md', '# 1. GİRİŞ\n\nŞablon metni.\n');
    await DXFS.writeText('projects/mini/mini DATA', '[GENEL]\nModel: MINI\n');
  });
  const np = await js(() => window.dxApi.createProject('1730000-XYZ MINI 5', 'mini', ['en']));
  const npYaml = await js(() => DXFS.readText('projects/1730000-XYZ-MINI-5/project.yaml'));
  check('yeni proje: şablon kopyalandı, yaml yazıldı, DATA proje adıyla kopyalandı',
    np.ok && np.files.length === 2 && np.files.includes('1730000-XYZ MINI 5 DATA') && /proje_adi: 1730000-XYZ MINI 5/.test(npYaml) && /- en/.test(npYaml) &&
    !(await js(() => DXFS.exists('projects/1730000-XYZ-MINI-5/mini DATA'))) &&
    await js(() => DXFS.exists('projects/1730000-XYZ-MINI-5/1730000-XYZ MINI 5 DATA')), JSON.stringify(np));
  check('yeni proje listede, şablon modeller arasında', await js(async () => {
    const g = await window.dxApi.listGuides();
    return g.some(x => x.id === 'proje:1730000-XYZ-MINI-5' && x.type === 'project') && g.some(x => x.id === 'proje:mini' && x.type === 'model');
  }));
  await js(async () => { await DXFS.remove('projects/mini'); await DXFS.remove('projects/1730000-XYZ-MINI-5'); });

  // ── Toplu çıktı: PDF, HTML, Web (exports/<proje>/ altına) ──
  section('Toplu çıktı (çalışma klasörüne)');
  const html = await js(() => runBatch([currentLang], ['html'], () => {}));
  const htmlText = html.ok ? await js((p) => DXFS.readText(p), html.files[0]) : '';
  check('HTML çıktısı exports/ altına yazıldı', html.ok && html.files[0] === 'exports/DEMO-KNV-40/DEMO-KNV-40_TR_Rev01.html', JSON.stringify(html));
  check('HTML: stiller ve görseller gömülü', /<style>[\s\S]*\.md-callout/.test(htmlText) && /src="data:image\//.test(htmlText) && !/src="blob:/.test(htmlText));
  const web = await js(() => runBatch(currentDiller, ['web'], () => {}));
  check('Web kılavuzu yazıldı', web.ok && web.files[0] === 'exports/DEMO-KNV-40/DEMO-KNV-40_WEB_Rev01.html', JSON.stringify(web));
  const webHtml = web.ok ? await js((p) => DXFS.readText(p), web.files[0]) : '';
  check('çıktı klasörü listesi', await js(async () => {
    await window.dxApi.openExports('proje:DEMO-KNV-40');
    const n = document.querySelectorAll('#dxExportsOverlay .dx-export-list .qc-item').length;
    document.getElementById('dxExportsOverlay').remove();
    return n === 2;
  }));
  const noDirect = await js(async () => {
    const orig = window.print;
    let printed = 0;
    window.print = () => { printed++; };
    const r = await runBatch([currentLang], ['pdf'], () => {});
    window.print = orig;
    await openBatchExport();
    const box = document.querySelector('#beFormats input[value="pdf"]');
    const ui = { disabled: box.disabled, checked: box.checked, hint: !document.getElementById('bePdfHint').hidden, langs: document.querySelectorAll('#beLangs input:checked').length, total: currentDiller.length };
    closeBatchExport();
    return { r, printed, ui };
  });
  check('PDF: DocumentX.vbs ile açılmadıysa yazdırma penceresi açılmaz, yönlendirme gösterilir',
    !noDirect.r.ok && /DocumentX\.vbs/.test(noDirect.r.errors[0]) && noDirect.printed === 0, JSON.stringify(noDirect));
  check('Toplu çıktı penceresi: PDF kapalı ve uyarılı, varsayılan bütün diller',
    noDirect.ui.disabled && !noDirect.ui.checked && noDirect.ui.hint && noDirect.ui.langs === noDirect.ui.total, JSON.stringify(noDirect.ui));
  check('Word seçeneği yok', await js(() => !document.querySelector('#beFormats input[value="docx"]') && typeof buildDocxHtml === 'undefined' && !window.dxApi.exportDocx));
  check('tek çıktı düğmesi: menü yok', await js(() => !document.getElementById('exportMenu') && !!document.querySelector('.export-wrap .pdf-btn')));

  // Kiosk baskının yerine: tarayıcının spool klasörüne, sayfa sayısı doğru bir PDF yazması.
  const fakePrint = `(() => {
    window.__printed = { count: 0, token: '', dom: null };
    window.print = () => {
      const token = document.title;
      const pages = [...document.querySelectorAll('#pagesContainer > .a4-page')];
      const links = [...document.querySelectorAll('#pagesContainer a[href^="#"]')].filter(a => a.getAttribute('href').length > 1);
      const ids = [...document.querySelectorAll('#pagesContainer [id]')].map(e => e.id);
      window.__printed.count++;
      window.__printed.token = token;
      window.__printed.dom = {
        count: pages.length,
        langs: [...new Set(pages.map(p => p.lang))],
        links: links.length,
        broken: links.filter(a => !document.getElementById(a.getAttribute('href').slice(1))).length,
        otherLang: links.filter(a => !a.getAttribute('href').startsWith('#l-' + a.closest('.a4-page').lang + '-')).length,
        dupIds: ids.length - new Set(ids).size
      };
      const n = pages.length;
      setTimeout(async () => {
        await DXExport.loadScript('web/vendor/pdf-lib.min.js');
        const doc = await PDFLib.PDFDocument.create();
        for (let i = 0; i < n; i++) doc.addPage([595, 842]);
        // Edge gibi: aynı ad varsa "ad (1).pdf"
        let name = token + '.pdf';
        for (let i = 1; await DXFS.exists('exports/.pdf-spool/' + name); i++) name = token + ' (' + i + ').pdf';
        await DXFS.writeBytes('exports/.pdf-spool/' + name, new Blob([await doc.save()]));
      }, 0);
    };
  })()`;
  const direct = await js(async (setup) => {
    const orig = window.print;
    const prevUrl = location.href;
    const startTitle = document.title;
    history.replaceState(null, '', location.pathname + '?dxprint=direct');
    (0, eval)(setup);
    await DXFS.writeBytes('exports/.pdf-spool/dxpdf_eski.pdf', new Blob(['eski']));
    const r = await runBatch([currentLang], ['pdf'], () => {});
    const printed = window.__printed;
    window.print = orig;
    history.replaceState(null, '', prevUrl);
    const saved = r.ok ? await DXFS.readBytes(r.files[0]) : null;
    const doc = saved ? await PDFLib.PDFDocument.load(saved, { updateMetadata: false }) : null;
    return {
      r,
      pages: doc ? doc.getPageCount() : 0,
      rawPages: printed.dom ? printed.dom.count : 0,
      outline: !!(doc && doc.catalog.lookup(PDFLib.PDFName.of('Outlines'))),
      titleMeta: doc ? doc.getTitle() : '',
      spool: (await DXFS.list('exports/.pdf-spool')).map(e => e.name).sort(),
      listedSame: saved ? String(await DXFS.readBytes('exports/.pdf-spool/DEMO-KNV-40_TR_Rev01.pdf')) === String(saved) : false,
      titleRestored: document.title === startTitle,
      printCount: printed.count,
      printTitle: printed.token,
    };
  }, fakePrint);
  check('PDF doğrudan kayıt: tek baskı, son adla; indirme listesindeki dosya son hali, eski ham dosya silinir, başlık geri gelir',
    direct.r.ok && direct.r.files[0] === 'exports/DEMO-KNV-40/DEMO-KNV-40_TR_Rev01.pdf' && !direct.r.warnings.length &&
    direct.printCount === 1 && direct.printTitle === 'DEMO-KNV-40_TR_Rev01' && direct.spool.join() === 'DEMO-KNV-40_TR_Rev01.pdf' &&
    direct.listedSame && direct.titleRestored, JSON.stringify(direct));
  check('PDF doğrudan kayıt: sayfa sayısı, yer imleri ve meta veri eklenir',
    direct.pages === direct.rawPages && direct.pages > 0 && direct.outline && !!direct.titleMeta && direct.titleMeta !== 'dxpdf', JSON.stringify(direct));
  const again = await js(async (setup) => {
    const orig = window.print;
    const prevUrl = location.href;
    history.replaceState(null, '', location.pathname + '?dxprint=direct');
    (0, eval)(setup);
    const r = await runBatch([currentLang], ['pdf'], () => {});
    window.print = orig;
    history.replaceState(null, '', prevUrl);
    return { r, spool: (await DXFS.list('exports/.pdf-spool')).map(e => e.name).sort() };
  }, fakePrint);
  check('PDF aynı adla yeniden: tarayıcının "(1)" kopyası bulunur, exports/ kopyası güncellenir',
    again.r.ok && again.spool.includes('DEMO-KNV-40_TR_Rev01 (1).pdf') && again.r.files[0] === 'exports/DEMO-KNV-40/DEMO-KNV-40_TR_Rev01.pdf', JSON.stringify(again));

  // Seçilen diller her biçimde tek dosyada: HTML görünümünden başlatılır, tek tıkta PDF + HTML.
  const merged = await js(async (setup) => {
    const orig = window.print;
    const prevUrl = location.href;
    const startLang = currentLang;
    const langs = currentDiller.slice(0, 2);
    history.replaceState(null, '', location.pathname + '?dxprint=direct');
    await setViewMode('html');
    (0, eval)(setup);
    const r = await runBatch(langs, ['pdf', 'html'], () => {});
    const dom = window.__printed.dom;
    window.print = orig;
    history.replaceState(null, '', prevUrl);
    const saved = r.ok ? await DXFS.readBytes(r.files[0]) : null;
    const doc = saved ? await PDFLib.PDFDocument.load(saved, { updateMetadata: false }) : null;
    const outlines = doc && doc.catalog.lookup(PDFLib.PDFName.of('Outlines'));
    const first = outlines && outlines.lookup(PDFLib.PDFName.of('First'));
    const view = viewMode;
    await setViewMode('pdf');
    return {
      r,
      langs,
      dom,
      pages: doc ? doc.getPageCount() : 0,
      firstBookmark: first ? first.lookup(PDFLib.PDFName.of('Title')).decodeText() : '',
      labels: !!(doc && doc.catalog.lookup(PDFLib.PDFName.of('PageLabels'))),
      view,
      lang: currentLang,
      startLang,
      prefixed: !!document.querySelector('#pagesContainer [id^="l-tr-"], #pagesContainer [id^="l-en-"]'),
      spool: (await DXFS.list('exports/.pdf-spool')).map(e => e.name),
      printCount: window.__printed.count,
      running: exportRunning,
      progress: !!document.getElementById('dxExportProgress'),
      htmlText: r.ok ? await DXFS.readText(r.files[1]) : ''
    };
  }, fakePrint);
  const mergedName = 'exports/DEMO-KNV-40/DEMO-KNV-40_' + merged.langs.join('-').toUpperCase() + '_Rev01';
  check('Çok dil PDF: tek dosya, kırık veya başka dile giden bağlantı yok, kimlikler tekil',
    merged.r.ok && merged.r.files[0] === mergedName + '.pdf' && merged.langs.length === 2 &&
    merged.dom && merged.dom.langs.join() === merged.langs.join() && merged.dom.links > 0 && merged.dom.broken === 0 && merged.dom.otherLang === 0 &&
    merged.dom.dupIds === 0 && merged.pages === merged.dom.count, JSON.stringify({ ...merged, htmlText: 0 }));
  check('Çok dil PDF: dil başına yer imi, sayfa adları; görünüm, dil ve sayfalar geri gelir',
    merged.firstBookmark === 'Türkçe' && merged.labels && merged.view === 'html' && merged.lang === merged.startLang && !merged.prefixed &&
    merged.spool.includes('DEMO-KNV-40_' + merged.langs.join('-').toUpperCase() + '_Rev01.pdf') && merged.printCount === 1 &&
    !merged.running && !merged.progress, JSON.stringify({ ...merged, htmlText: 0 }));
  check('Çok dil HTML: tek tıkta PDF ile birlikte, aynı adla', merged.r.files[1] === mergedName + '.html', JSON.stringify(merged.r));
  const mp = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const mpErrors = collectErrors(mp);
  await mp.setContent(merged.htmlText, { waitUntil: 'load' });
  await wait(600);
  const md = await mp.evaluate((langs) => {
    const parts = [...document.querySelectorAll('.dx-lang-part')];
    const imgs = [...document.querySelectorAll('img')];
    const gotos = [...document.querySelectorAll('.dx-lang-part a[data-goto]')];
    const ids = [...document.querySelectorAll('[id]')].filter(e => !e.closest('svg')).map(e => e.id);
    return {
      order: parts.map(p => p.lang).join() === langs.join(),
      covers: parts.every(p => p.querySelector('.html-cover-section')),
      tocs: parts.every(p => p.querySelector('.toc-row')),
      jump: [...document.querySelectorAll('.dx-lang-jump a')].every(a => document.getElementById(a.getAttribute('href').slice(1))),
      imgs: imgs.length > 0 && imgs.every(i => i.complete && i.naturalWidth > 0) && !document.querySelector('[data-dx-img]'),
      gotos: gotos.length,
      badGotos: gotos.filter(a => !a.closest('.dx-lang-part').querySelector(a.dataset.goto)).length,
      dupIds: ids.length - new Set(ids).size
    };
  }, merged.langs);
  check('Çok dil HTML: diller sırayla, her dilin kapağı ve içindekileri, görseller yüklü',
    md.order && md.covers && md.tocs && md.jump && md.imgs, JSON.stringify(md));
  check('Çok dil HTML: bağlantılar kendi dilinde kalır, kimlikler tekil', md.gotos > 0 && md.badGotos === 0 && md.dupIds === 0, JSON.stringify(md));
  check('Çok dil HTML: konsolda hata yok', mpErrors.length === 0, mpErrors.join(' | '));
  await mp.close();

  const real = errors.filter(m => !/favicon/.test(m));
  check('arayüz: konsolda hata yok', real.length === 0, '\n  ' + real.join('\n  '));
  await page.close();
  return webHtml;
}

/* ── 3) Web kılavuzu davranışı ── */
async function webManualTests(browser, html) {
  section('Web kılavuzu (tek dosya)');
  if (!html) { check('web kılavuzu üretildi', false); return; }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = collectErrors(page);
  await page.setContent(html, { waitUntil: 'load' });
  await wait(800);
  const js = (fn) => page.evaluate(fn);
  check('her dil ayrı bölüm', await js(() => document.querySelectorAll('.dxw-doc').length) === 2);
  check('varsayılan dil TR görünür', await js(() => !document.querySelector('.dxw-doc[data-lang="tr"]').hidden));
  check('bölüm menüsü dolu', await js(() => document.querySelectorAll('#dxwNav a').length) >= 4);
  check('etkin dilin görselleri yüklendi', await js(() => {
    const d = document.querySelector('.dxw-doc:not([hidden])');
    const imgs = [...d.querySelectorAll('img')];
    return imgs.length > 0 && !d.querySelector('[data-dx-img]') && imgs.every(i => i.complete && i.naturalWidth > 0);
  }));
  await js(() => { const s = document.getElementById('dxwSearch'); s.value = 'loto'; s.dispatchEvent(new Event('input')); });
  await wait(400);
  check('arama sonuç sayısı', /\d+/.test(await js(() => document.getElementById('dxwCount').textContent)));
  await js(() => { const s = document.getElementById('dxwLang'); s.value = 'en'; s.dispatchEvent(new Event('change')); });
  await wait(300);
  check('dil değişimi EN', await js(() => !document.querySelector('.dxw-doc[data-lang="en"]').hidden && document.documentElement.lang === 'en'));
  check('EN başlığı', /USER MANUAL/.test(await js(() => document.getElementById('dxwTitle').textContent)));
  check('görseller dillere bir kez gömülü', await js(() => Object.keys(window.DX_IMG).length) <= 4);
  if (shotsDir) writeShot('web-manual.png', await page.screenshot());
  check('web: konsolda hata yok', errors.length === 0, errors.join(' | '));
  await page.close();
}

/* ── 4) file:// açılış + gerçek klasör tutamacı + git (.git doğrudan okunur) ──
   Depo kökü CDP sürükle-bırak ile bağlanır (salt okunur); git sonuçları git komutuyla
   karşılaştırılır. Yalnız codes/ geçmişine bakılır, projects/ açılmaz. */
async function nativeGitTests(browser) {
  section('file:// açılış ve git (gerçek klasör, salt okunur)');
  const { execFileSync } = require('child_process');
  const git = (...a) => execFileSync('git', ['-c', 'core.quotepath=false', ...a], { cwd: H.ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  let refs = [];
  try { refs = git('log', '-15', '--format=%H%x09%ct%x09%s', '--', 'codes').trim().split('\n').filter(Boolean).map(l => l.split('\t')); } catch (e) { refs = []; }
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = collectErrors(page);
  await page.goto('file://' + path.join(H.ROOT, 'codes', 'index.html'));
  await page.waitForSelector('#dxConnect', { timeout: 15000 });
  check('file://: güvenli bağlam, klasör seçici, bağlantı ekranı', await page.evaluate(() => isSecureContext && typeof showDirectoryPicker === 'function' && !!document.getElementById('dxConnect')));
  if (!refs.length || !fs.existsSync(path.join(H.ROOT, '.git'))) {
    console.log('  (git deposu yok — git kontrolleri atlandı)');
    await page.close();
    return;
  }
  await H.dropFolder(page, H.ROOT);
  await page.evaluate(async () => { localStorage.setItem('dx.lastGuide', JSON.stringify('')); await DXConnect.mount(await window.__dxDrop); });
  const log = await page.evaluate(() => DXGit.logForPath('codes', 15));
  check('git log -- codes (tarayıcı) = git komutu', JSON.stringify(log.map(c => [c.hash, String(c.ts), c.subject])) === JSON.stringify(refs),
    `${log.length} / ${refs.length}`);
  const base = refs[Math.min(refs.length - 1, 3)][0];
  const mine = await page.evaluate(async (ref) => {
    const m = await DXGit.changedLines(ref, 'codes');
    return m ? Object.fromEntries([...m].map(([k, v]) => [k, [...v].sort((a, b) => a - b)])) : null;
  }, base);
  const exp = {};
  let cur = null;
  git('diff', '-U0', '--no-color', '--no-ext-diff', base, '--', 'codes').split('\n').forEach(line => {
    if (line.startsWith('+++ ')) { let p = line.slice(4).trim(); if (p.startsWith('"')) p = JSON.parse(p); cur = p === '/dev/null' ? null : p.replace(/^b\//, ''); if (cur && !exp[cur]) exp[cur] = new Set(); return; }
    const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!h || !cur) return;
    const s = +h[1];
    const c = h[2] == null ? 1 : +h[2];
    if (c === 0) exp[cur].add(Math.max(1, s));
    for (let i = 0; i < c; i++) exp[cur].add(s + i);
  });
  git('ls-files', '--others', '--exclude-standard', '--', 'codes').split('\n').filter(Boolean).forEach(p => {
    exp[p] = new Set(Array.from({ length: fs.readFileSync(path.join(H.ROOT, p), 'utf8').replace(/\r?\n$/, '').split(/\r?\n/).length }, (_, i) => i + 1));
  });
  const want = Object.fromEntries(Object.entries(exp)
    .filter(([k, v]) => /\.md$/i.test(k) && !/\/(assets|backup)\//i.test(k) && v.size)
    .map(([k, v]) => [k, [...v].sort((a, b) => a - b)]));
  const sortObj = (o) => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));
  check('değişiklik çubukları: değişen satırlar (tarayıcı) = git diff', sortObj(mine) === sortObj(want),
    `${Object.keys(mine || {}).length} / ${Object.keys(want).length} dosya`);
  check('salt okunur tutamaçta yazma kapalı', await page.evaluate(async () => {
    const r = await window.dxApi.writeFile('projects/x/y.md', 'deneme', 0, true);
    return !r.ok;
  }));
  check('file://: konsolda hata yok', errors.length === 0, errors.join(' | '));
  await page.close();
}

/* ── 5) Önizleme paketi (scripts/build-preview.js) — Artifact iskeletiyle, masaüstü + telefon ── */
async function previewTests(browser) {
  section('Önizleme paketi (klasörsüz, salt okunur)');
  const os = require('os');
  const { execFileSync } = require('child_process');
  const out = path.join(os.tmpdir(), 'dx-preview-test');
  fs.rmSync(out, { recursive: true, force: true });
  let log = '';
  try {
    log = execFileSync(process.execPath, [path.join(H.ROOT, 'scripts', 'build-preview.js'), 'DEMO-KNV-40',
      '--projects', path.join(H.ROOT, 'codes', 'test', 'fixtures', 'projects'), '--out', out, '--title', 'DEMO KNV 40 Önizleme'], { encoding: 'utf8' });
  } catch (e) {
    check('önizleme paketi üretildi', false, e.stderr || e.message);
    return;
  }
  const page0 = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  check('önizleme paketi üretildi (index.html + veri + uygulama)', /<title>DEMO KNV 40 Önizleme<\/title>/.test(page0) &&
    !/<html|<head|<body|<!doctype/i.test(page0) && fs.existsSync(path.join(out, 'dx-preview-data.js')) && fs.existsSync(path.join(out, 'web', 'preview.js')), log.trim().split('\n')[1]);
  const { server, base } = await H.serveDir(out);
  try {
    for (const [label, vp] of [['masaüstü', { width: 1440, height: 900 }], ['telefon', { width: 390, height: 844 }]]) {
      const page = await browser.newPage({ viewport: vp });
      const errors = collectErrors(page);
      await page.goto(base);
      const ok = await page.waitForFunction(() => typeof currentGuideId !== 'undefined' && currentGuideId === 'proje:DEMO-KNV-40' &&
        (document.querySelectorAll('.a4-page').length > 2 || !!document.querySelector('.html-document .html-flow-content .md-callout')), null, { timeout: 30000 }).then(() => true, () => false);
      check(`${label}: kılavuz klasör sorulmadan açıldı`, ok && await page.evaluate(() => !document.getElementById('dxConnect')));
      await wait(800);
      const r = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll('#pagesContainer img')];
        const cover = document.querySelector('#pagesContainer .html-cover-section');
        return {
          view: viewMode,
          imgs: imgs.length > 0 && imgs.every(i => i.complete && i.naturalWidth > 0),
          exportHidden: getComputedStyle(document.querySelector('.export-wrap')).display === 'none',
          overflow: document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1,
          vOverflow: document.documentElement.scrollHeight > innerHeight + 1,
          cover: cover ? { zoom: cover.style.zoom, w: cover.getBoundingClientRect().width, host: cover.parentElement.getBoundingClientRect().width } : null,
          label: document.getElementById('workspaceName').textContent
        };
      });
      check(`${label}: görseller yüklendi, çıktı menüsü gizli, sayfa yatay/dikey taşmıyor`, r.imgs && r.exportHidden && !r.overflow && !r.vOverflow, JSON.stringify(r));
      if (label === 'telefon') {
        check('telefon: HTML görünümü, kapak ekrana sığacak kadar küçültüldü', r.view === 'html' && r.cover && Number(r.cover.zoom) < 1 && r.cover.w <= r.cover.host + 1, JSON.stringify(r.cover));
      } else {
        check('masaüstü: başlıkta önizleme etiketi', /^Önizleme · /.test(r.label), r.label);
        const ed = await page.evaluate(async () => {
          await openEditor('projects/DEMO-KNV-40/02-safety/01-loto/loto.tr.md', 3);
          const t = document.getElementById('edText');
          const res = { readOnly: t.readOnly, text: t.value.length > 0 };
          closeEditor(true);
          const save = await window.dxApi.saveGuideMeta('proje:DEMO-KNV-40', { cikti: { sekil_numara: true } });
          const g = await window.dxApi.getGuide('proje:DEMO-KNV-40', 'tr');
          const w = await window.dxApi.writeFile('projects/DEMO-KNV-40/x.md', 'a', 0, true);
          const log = await window.dxApi.gitLog('proje:DEMO-KNV-40');
          return { ...res, session: save.ok && g.cikti.sekil_numara === true, write: w.ok, git: log.ok && log.commits.length > 0 };
        });
        check('masaüstü: düzenleyici salt okunur, ayarlar oturumda uygulanır, yazma kapalı, git geçmişi pakette',
          ed.readOnly && ed.text && ed.session && ed.write === false && ed.git, JSON.stringify(ed));
      }
      const real = errors.filter(m => !/favicon/.test(m));
      check(`${label}: konsolda hata yok`, real.length === 0, real.join(' | '));
      await page.close();
    }
  } finally {
    server.close();
  }
}

(async () => {
  const { server, base } = await H.serve();
  const browser = await H.launch();
  const timer = setTimeout(() => { console.error('Zaman aşımı (300 sn)'); process.exit(2); }, 300000);
  try {
    await renderTests(browser, base);
    const webHtml = await uiTests(browser, base);
    await webManualTests(browser, webHtml);
    await nativeGitTests(browser);
    await previewTests(browser);
  } catch (e) {
    check('beklenmeyen hata', false, e.stack || e.message);
  } finally {
    clearTimeout(timer);
    await browser.close();
    server.close();
  }
  if (shotsDir) console.log(`Çıktılar: ${shotsDir}`);
  console.log(`\n${passed} geçti, ${failed} kaldı`);
  process.exit(failed ? 1 : 0);
})();
