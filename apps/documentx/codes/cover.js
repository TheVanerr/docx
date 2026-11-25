/* Kapak sayfası — A4 üzerinde cm koordinatlarıyla mutlak konumlu tasarım.
   96 dpi kabulüyle 1cm = 37.7953px (A4 = 21cm×29.7cm = 794px×1123px).
   Firma rengi ve logosu: brands.js.
   Standart kapak B'dir: düzen sabit, makineye göre yalnız çizim, model adı ve makine tipi değişir
   (kapak.sag_ust: dil | qr | yok; seri kılavuzda kapak.kapsam). project.yaml > kapak.tasarim yalnız
   istisna içindir: A = tipografik, KLASIK = eski düzen. A/B ölçüleri doc-content.css'te (mm). */

const DEFAULT_COVER_DESIGN = 'B';
const CM_PX = 37.7953;
const cm = (n) => (n * CM_PX).toFixed(2) + 'px';

const COVER_LOGO_BOX = { left: 4.8, top: 14.48, width: 9.04, height: 5.67 };
const COVER_INFO_LINE_CM = 0.74;

/* Belge içinde dile göre değişen sabit metinler. {BY} boşsa o satır kapağa yazılmaz. */
const DOC_I18N = {
  tr: {
    coverTitle: '{MODEL} SERİSİ KULLANIM KILAVUZU',
    coverTitlePlain: '{MODEL} KULLANIM KILAVUZU',
    coverInfo: ['Rev.{REV}', 'Hazırlanma Tarihi : {DATE}', 'Hazırlayan : {BY}'],
    coverDoc: 'Kullanım Kılavuzu',
    coverLabels: { serial: 'Seri No', rev: 'Revizyon', date: 'Tarih', lang: 'Talimat dili', by: 'Hazırlayan' },
    coverLangName: 'Türkçe',
    coverOriginal: 'Orijinal talimatlar',
    coverTranslation: 'Orijinal talimatların çevirisi',
    toc: 'İÇİNDEKİLER',
    index: 'DİZİN',
    revHistory: 'REVİZYON GEÇMİŞİ',
    revCols: ['Rev.', 'Tarih', 'Açıklama', 'Hazırlayan'],
    figList: 'ŞEKİL LİSTESİ',
    tblList: 'TABLO LİSTESİ',
    fig: 'Şekil',
    tbl: 'Tablo',
    continued: 'devam',
    pageRef: 's.',
    tableCaption: /^(?:Tablo)\s*:\s*/
  },
  en: {
    coverTitle: '{MODEL} SERIES USER MANUAL',
    coverTitlePlain: '{MODEL} USER MANUAL',
    coverInfo: ['Rev.{REV}', 'Date of Preparation : {DATE}', 'Prepared by : {BY}'],
    coverDoc: 'User Manual',
    coverLabels: { serial: 'Serial No', rev: 'Revision', date: 'Date', lang: 'Language', by: 'Prepared by' },
    coverLangName: 'English',
    coverOriginal: 'Original instructions',
    coverTranslation: 'Translation of the original instructions',
    toc: 'CONTENTS',
    index: 'INDEX',
    revHistory: 'REVISION HISTORY',
    revCols: ['Rev.', 'Date', 'Description', 'Prepared by'],
    figList: 'LIST OF FIGURES',
    tblList: 'LIST OF TABLES',
    fig: 'Figure',
    tbl: 'Table',
    continued: 'continued',
    pageRef: 'p.',
    tableCaption: /^(?:Table)\s*:\s*/
  },
  de: {
    coverTitle: '{MODEL} SERIE BEDIENUNGSANLEITUNG',
    coverTitlePlain: '{MODEL} BEDIENUNGSANLEITUNG',
    coverInfo: ['Rev.{REV}', 'Erstellungsdatum : {DATE}', 'Erstellt von : {BY}'],
    coverDoc: 'Betriebsanleitung',
    coverLabels: { serial: 'Serien-Nr.', rev: 'Revision', date: 'Datum', lang: 'Sprache', by: 'Erstellt von' },
    coverLangName: 'Deutsch',
    coverOriginal: 'Originalbetriebsanleitung',
    coverTranslation: 'Übersetzung der Originalbetriebsanleitung',
    toc: 'INHALTSVERZEICHNIS',
    index: 'STICHWORTVERZEICHNIS',
    revHistory: 'REVISIONSVERLAUF',
    revCols: ['Rev.', 'Datum', 'Beschreibung', 'Erstellt von'],
    figList: 'ABBILDUNGSVERZEICHNIS',
    tblList: 'TABELLENVERZEICHNIS',
    fig: 'Abbildung',
    tbl: 'Tabelle',
    continued: 'Fortsetzung',
    pageRef: 'S.',
    tableCaption: /^(?:Tabelle)\s*:\s*/
  }
};

function tDoc(lang) {
  return DOC_I18N[String(lang || '').toLowerCase()] || DOC_I18N.tr;
}

function coverDocumentTitle(model, lang, opts) {
  const i18n = tDoc(lang);
  const tpl = (opts && opts.series === false) ? i18n.coverTitlePlain : i18n.coverTitle;
  return tpl.replace('{MODEL}', (model || '').toUpperCase());
}

function formatCoverDate(iso) {
  if (!iso) return 'xx.xx.xxxx';
  const p = String(iso).split('-');
  if (p.length !== 3) return iso;
  return `${p[2]}.${p[1]}.${p[0]}`;
}

function coverInfoLines({ rev, date, by, lang }) {
  const i18n = tDoc(lang);
  const revText = (rev && String(rev).trim()) ? String(rev).trim() : 'xx';
  const author = String(by || '').trim();
  return (Array.isArray(i18n.coverInfo) ? i18n.coverInfo : [i18n.coverInfo])
    .filter(line => author || !line.includes('{BY}'))
    .map(line => line
      .replace('{REV}', revText)
      .replace('{DATE}', formatCoverDate(date))
      .replace('{BY}', author));
}

/* DATA [PROJE] değeri; boş veya [EKSİK] ise ''. */
function coverDataValue(key) {
  const r = resolveDataValue('PROJE', key);
  if (!r.ok || r.value === DATA_EMPTY || /\[EKS[İI]K[^\]]*\]/iu.test(r.value)) return '';
  return r.value.trim();
}

/* Makine tipi: yaml kapak.makine_tipi (metin veya { tr, en, de }); yoksa TR kılavuzda
   DATA "Makine ticari adı": baştaki model adı atılır; ad yalnız model koduysa ("makine"
   kelimesi yoksa) satır çıkmaz. DATA Türkçe olduğu için diğer dillerde yedek kullanılmaz. */
function coverMachineType(spec, modelName, lang) {
  if (spec && typeof spec === 'object') return String(spec[lang] || '').trim();
  if (spec) return String(spec).trim();
  if (lang !== 'tr') return '';
  const name = coverDataValue('Makine ticari adı');
  const prefix = String(modelName || '').toLocaleUpperCase('tr-TR');
  const rest = prefix && name.toLocaleUpperCase('tr-TR').startsWith(prefix + ' ') ? name.slice(prefix.length).trim() : name;
  return rest.toLocaleLowerCase('tr-TR').includes('makine') ? rest : '';
}

function coverEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function coverLogo(coverBrand, variant) {
  const img = coverEl('img', 'k-logo');
  img.src = coverBrand.logo ? assetUrl(coverBrand.logo) : '';
  img.alt = variant || DEFAULT_BRAND;
  return img;
}

/* Sağ üst öğe: dil etiketi (varsayılan) veya QR; firmanın QR'ı yoksa dil etiketi. */
function coverCorner(corner, coverBrand, lang) {
  const kind = String(corner || 'dil').toLowerCase();
  if (kind === 'yok') return null;
  if (kind === 'qr' && coverBrand.qr) {
    const qr = coverEl('img', 'k-qr');
    qr.src = assetUrl(coverBrand.qr);
    qr.alt = (coverBrand.company && coverBrand.company.web) || 'QR';
    if (!coverBrand.company || !coverBrand.company.web) return qr;
    const link = coverEl('a', 'k-link');
    link.href = coverBrand.company.web;
    link.appendChild(qr);
    return link;
  }
  return coverEl('div', 'k-dil', String(lang || 'tr').toUpperCase());
}

function coverPanel(opts, coverBrand) {
  const panel = coverEl('div', 'k-panel');
  panel.appendChild(coverLogo(coverBrand, opts.variant));
  const corner = coverCorner(opts.corner, coverBrand, opts.lang);
  if (corner) panel.appendChild(corner);
  if (opts.drawing) {
    const box = coverEl('div', 'k-cizim-kutu');
    const img = coverEl('img', 'k-cizim');
    if (String(opts.drawingStyle || '').toLowerCase() === 'izometrik') img.classList.add('izometrik');
    img.src = assetUrl(opts.drawing);
    img.alt = opts.modelName;
    box.appendChild(img);
    panel.appendChild(box);
  } else {
    const label = opts.modelName || opts.modelCode;
    const fallback = coverEl('div', 'k-cizim-yok', label);
    if (label.length > 15) fallback.classList.add('cok-uzun');
    else if (label.length > 9) fallback.classList.add('uzun');
    panel.appendChild(fallback);
  }
  return panel;
}

function coverHeading(opts, i18n, withDivider) {
  const head = coverEl('div', 'k-baslik');
  if (opts.machineType) head.appendChild(coverEl('div', 'k-tur', opts.machineType));
  const model = coverEl('div', 'k-model', opts.modelName);
  if (opts.modelName.length > 14) model.classList.add('uzun');
  head.appendChild(model);
  if (withDivider) head.appendChild(coverEl('div', 'k-ayrac'));
  head.appendChild(coverEl('div', 'k-belge', i18n.coverDoc));
  if (opts.scope) head.appendChild(coverEl('div', 'k-kapsam', String(opts.scope)));
  return head;
}

/* Bilgi satırı: seri no ve hazırlayan boşsa sütun çıkmaz (model kılavuzu dört sütun). */
function coverInfoRow(opts, i18n) {
  const labels = i18n.coverLabels;
  const isOriginal = String(opts.lang || '').toLowerCase() === String(opts.originalLang || 'tr').toLowerCase();
  const rows = [
    [labels.serial, opts.serial],
    [labels.rev, String(opts.rev || '').trim() || 'xx'],
    [labels.date, formatCoverDate(opts.date)],
    [labels.lang, i18n.coverLangName, isOriginal ? i18n.coverOriginal : i18n.coverTranslation],
    [labels.by, String(opts.by || '').trim()]
  ];
  const info = coverEl('div', 'k-bilgi');
  rows.filter(r => r[1]).forEach(([label, value, note]) => {
    const cell = coverEl('div');
    cell.appendChild(coverEl('div', 'k-bilgi-ad', label));
    const val = coverEl('div', 'k-bilgi-deger', value);
    if (note) val.appendChild(coverEl('small', '', note));
    cell.appendChild(val);
    info.appendChild(cell);
  });
  return info;
}

/* Alt bilgi: firma, adres, web. kapak.web: yok → web yazılmaz (üretici web'inin gösterilmediği müşteri kılavuzları). */
function coverCompany(brand, coverBrand, opts) {
  const company = coverBrand.company || { name: brand.footer };
  const footer = coverEl('div', 'k-alt');
  const name = coverEl('span');
  name.appendChild(coverEl('b', '', company.name || ''));
  footer.appendChild(name);
  footer.appendChild(coverEl('span', '', company.address || ''));
  if (String(opts.footerWeb || '').toLowerCase() !== 'yok') {
    const web = coverEl('span');
    if (company.web) {
      const link = coverEl('a', 'k-link', company.web);
      link.href = company.web;
      web.appendChild(link);
    }
    footer.appendChild(web);
  }
  return footer;
}

function buildDesignCover(raw, design) {
  const brand = getBrand(raw.variant);
  const coverBrand = brand.cover || {};
  const i18n = tDoc(raw.lang);
  const modelName = String(raw.modelName || raw.model || '').trim();
  const opts = {
    ...raw,
    modelName,
    machineType: coverMachineType(raw.machineType, modelName, String(raw.lang || 'tr').toLowerCase()),
    serial: String(raw.serial || '').trim() || coverDataValue('Makine seri numarası')
  };

  const page = coverEl('div', `a4-page cover-page kapak-${design.toLowerCase()}`);
  if (raw.variant) page.dataset.variant = raw.variant;
  page.style.setProperty('--cover-accent', coverBrand.accent || brand.color);

  if (design === 'B') {
    page.appendChild(coverPanel(opts, coverBrand));
    page.appendChild(coverEl('div', 'k-serit'));
    page.appendChild(coverHeading(opts, i18n, true));
  } else {
    page.appendChild(coverEl('div', 'k-sol-serit'));
    page.appendChild(coverLogo(coverBrand, raw.variant));
    page.appendChild(coverHeading(opts, i18n, false));
  }
  page.appendChild(coverInfoRow(opts, i18n));
  page.appendChild(coverCompany(brand, coverBrand, opts));
  return page;
}

function buildCoverPage(opts) {
  const design = String(opts.design || DEFAULT_COVER_DESIGN).toUpperCase();
  if (design !== 'KLASIK') return buildDesignCover(opts, design === 'A' ? 'A' : 'B');

  const { model, rev, date, variant, lang, series, by } = opts;
  const brand = getBrand(variant);
  const coverBrand = brand.cover || {};

  const page = document.createElement('div');
  page.className = 'a4-page cover-page';
  if (variant) page.dataset.variant = variant;
  page.style.setProperty('--cover-accent', brand.color);

  const rect = document.createElement('div');
  rect.className = 'cover-rect';
  rect.style.left = cm(2.1);
  rect.style.top = cm(2.1);
  rect.style.width = cm(1.48);
  rect.style.height = cm(25.5);
  page.appendChild(rect);

  const title = document.createElement('div');
  title.className = 'cover-title';
  title.style.left = cm(4.8);
  title.style.top = cm(9.63);
  title.style.width = cm(11.34);
  title.style.height = cm(0.93);
  title.textContent = coverDocumentTitle(model, lang, { series });
  page.appendChild(title);

  const info = document.createElement('div');
  info.className = 'cover-info';
  info.style.left = cm(4.8);
  info.style.top = cm(12.19);
  info.style.width = cm(14.1);
  const infoLines = coverInfoLines({ rev, date, by, lang });
  infoLines.forEach((text) => {
    const row = document.createElement('div');
    row.className = 'cover-info-line';
    row.textContent = text;
    info.appendChild(row);
  });
  page.appendChild(info);

  const logoBox = { ...(coverBrand.logoBox || COVER_LOGO_BOX) };
  logoBox.top += Math.max(0, infoLines.length - 1) * COVER_INFO_LINE_CM;

  const img = document.createElement('img');
  img.className = 'cover-image';
  img.src = coverBrand.logo ? assetUrl(coverBrand.logo) : '';
  img.alt = variant || DEFAULT_BRAND;
  img.style.left = cm(logoBox.left);
  img.style.top = cm(logoBox.top);
  img.style.width = cm(logoBox.width);
  img.style.height = cm(logoBox.height);
  page.appendChild(img);

  return page;
}

/* Arka kapak — numarasız son sayfa: ortada logo, altta firma adı ve belge kimliği. */
function buildBackCoverPage({ model, rev, date, variant, lang, series }) {
  const brand = getBrand(variant);
  const coverBrand = brand.cover || {};

  const page = document.createElement('div');
  page.className = 'a4-page cover-page back-cover-page';
  page.style.setProperty('--cover-accent', brand.color);

  const img = document.createElement('img');
  img.className = 'back-cover-logo';
  img.src = coverBrand.logo ? assetUrl(coverBrand.logo) : '';
  img.alt = variant || DEFAULT_BRAND;
  page.appendChild(img);

  const docId = document.createElement('div');
  docId.className = 'back-cover-doc';
  docId.textContent = coverDocumentTitle(model, lang, { series });
  page.appendChild(docId);

  const meta = document.createElement('div');
  meta.className = 'back-cover-meta';
  meta.textContent = coverInfoLines({ rev, date, by: '', lang }).join('  ·  ');
  page.appendChild(meta);

  const company = document.createElement('div');
  company.className = 'back-cover-company';
  company.textContent = brand.footer || '';
  page.appendChild(company);

  const band = document.createElement('div');
  band.className = 'back-cover-band';
  page.appendChild(band);

  return page;
}
