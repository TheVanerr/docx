/* Uygulama durumu — tüm renderer modülleri (md-parser, document, paginator,
   ui …) bu global değişkenleri paylaşır. İlk yüklenen betik budur. */
let currentGuideId = '';
let currentProjectRel = '';
let currentModel = '';
let currentLang = 'tr';
let currentDiller = ['tr'];
let currentRev = '';
let currentDate = '';
let currentFirma = 'DOLFIN';
let currentCoverName = '';
let currentCoverSeries = false;
let currentPreparedBy = '';       // kapak.hazirlayan (yaml) — boşsa ayarlardaki varsayılan
let currentCoverDesign = {};      // kapak tasarımı (yaml): design, corner, modelName, machineType, scope, footerWeb, serial, drawing, drawingStyle, originalLang
let defaultPreparedBy = '';       // uygulama ayarı (tüm kılavuzlar)
let currentRevisions = [];        // yaml revizyonlar listesi
let currentOutput = {};           // yaml cikti: { sekil_numara, bolum_basligi, arka_kapak }
let currentData = null;           // projenin DATA dosyası (SSOT): { file, blocks, order }
let currentMarks = {};            // görsel işaretleri: { 'projects/X/assets/a.png': [{ x, y, n }] }
let currentSymbols = {};          // assets/iso7010/ içindeki resmi işaret dosyaları: { W012: 'assets/iso7010/W012.svg' }
let currentGlossary = [];         // terim sözlüğü: [{ tr, en, de, yasak: { tr: [] … }, dizin }]
let viewMode = 'pdf';             // pdf | html | compare
let lastGuideCache = null;

/* Çalışma klasöründeki dosyaların adresi: bağlı klasördeki görsellerin blob:
   adresleri web/assets.js'te tutulur (dxAssetUrl); bulunamayan yol codes/'a göre
   göreli adrese düşer ('../' — uygulama DocumentX/codes/ içinden açıldığında çalışır). */
let assetBase = '../';

function assetUrl(rel) {
  const r = String(rel || '').replace(/^\/+/, '');
  const mapped = typeof dxAssetUrl === 'function' ? dxAssetUrl(r) : '';
  return mapped || assetBase + r;
}

/* <img src> → çalışma klasörüne göre yol ('projects/X/assets/a.png'). */
function assetRelFromUrl(src) {
  if (typeof dxAssetRel === 'function') {
    const rel = dxAssetRel(src);
    if (rel) return rel;
  }
  let s = String(src || '');
  if (assetBase !== '../' && s.startsWith(assetBase)) s = s.slice(assetBase.length);
  try { s = decodeURIComponent(s); } catch (e) { /* olduğu gibi */ }
  return s.replace(/^(\.\.\/)+/, '').replace(/\\/g, '/');
}

/* Son çizimin sonuçları — kenar çubuğu, arama ve kalite kontrol kullanır. */
let lastRender = { entries: [], figures: [], tables: [], xrefs: [], tree: [] };

/* ── Oturum hafızası (localStorage — yalnızca bu bilgisayar) ── */
function prefGet(key, fallback) {
  try {
    const v = localStorage.getItem('dx.' + key);
    return v == null ? fallback : JSON.parse(v);
  } catch (e) { return fallback; }
}

function prefSet(key, value) {
  try { localStorage.setItem('dx.' + key, JSON.stringify(value)); } catch (e) { /* yok say */ }
}

function outputOption(key) {
  const defaults = { sekil_numara: false, bolum_basligi: true, arka_kapak: false, dizin: true, gorsel_optimize: true };
  const v = currentOutput && Object.prototype.hasOwnProperty.call(currentOutput, key)
    ? currentOutput[key] : defaults[key];
  return v === true;
}

/* Sayfa boyutu: project.yaml > cikti.sayfa (A4 | A5 | Letter) */
function paperSize() {
  const p = String((currentOutput && currentOutput.sayfa) || 'A4');
  return ['A4', 'A5', 'Letter'].includes(p) ? p : 'A4';
}

/* Gövde sınıfı + @page kuralı; ölçüm sayfası da aynı değişkenleri kullanır. */
function applyPaperSize() {
  const p = paperSize();
  document.body.classList.toggle('paper-a5', p === 'A5');
  document.body.classList.toggle('paper-letter', p === 'Letter');
  let tag = document.getElementById('dx-page-size');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'dx-page-size';
    document.head.appendChild(tag);
  }
  tag.textContent = `@page { size: ${p === 'Letter' ? 'letter' : p}; margin: 0; }`;
}

function preparedBy() {
  return String(currentPreparedBy || defaultPreparedBy || '').trim();
}
