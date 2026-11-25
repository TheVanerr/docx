#!/usr/bin/env node
/* Dil eşitliği kontrolü — EN/DE dosyaları TR kaynakla aynı mı?

   node scripts/dil-kontrol.js "<proje klasörü>" [--dil en,de] [--dosya <yol parçası>] [--projects <klasör>]

   Her .tr.md için hedef dosyada aranır:
   - satır yapısı: başlık (numarasıyla), tablo (sütun sayısı, hizalama, satır), liste, görsel, uyarı seviyesi, "---";
   - birebir kalması gerekenler: {{DATA}} yer tutucuları, [EKSİK E12], görsel dosyaları, panel etiketleri;
   - sayılar: TR "1,5" = EN "1.5" = DE "1,5" (satır satır; alfabetik sıralı tablolarda dosya genelinde);
   - dil sızıntısı: hedef dilde Türkçe harf veya sık Türkçe sözcük, EN'de Almanca, DE'de İngilizce sözcük.
   Ayrıca tarih: TR çeviriden yeniyse uygulama "çevirisi eskimiş" uyarısı verir.
   DATA: her anahtarda @en/@de satırı; yazı içeren değerde çeviri; çeviride aynı sayılar.
   Sorun yoksa çıkış kodu 0. */
const fs = require('fs');
const path = require('path');
const { findProjectYaml } = require('./project-core');
const { parseData, pickDataFile } = require('../codes/web/data-file.js');
const yaml = require('../codes/web/vendor/js-yaml.min.js');

const ROOT = path.resolve(__dirname, '..');

const SIGNALS = {
  danger: ['TEHLİKE', 'DANGER', 'GEFAHR'],
  warning: ['UYARI', 'WARNING', 'WARNUNG'],
  caution: ['DİKKAT', 'CAUTION', 'VORSICHT', 'ACHTUNG'],
  notice: ['ÖNEMLİ', 'NOTICE', 'IMPORTANT', 'WICHTIG'],
  note: ['NOT', 'BİLGİ', 'NOTE', 'HINWEIS']
};
const SIGNAL_OF = Object.fromEntries(Object.entries(SIGNALS).flatMap(([lvl, ws]) => ws.map(w => [w, lvl])));
/* Kılavuzda çevrilmeden geçen panel etiketleri. */
const PANEL_LABELS = ['WASCHEN', 'ZURÜCKSETZEN', 'WASSERMANGEL', 'PUMPENSTÖRUNG', 'HEIZUNG', 'THERMOSTAT', 'ZEIT', 'BETRIEBSBEREIT', 'ÖLABSCHEIDER', 'ENERJİ', 'EMERGENCY STOP'];
const CAPTION = /^(?:Tablo|Table|Tabelle)\s*:/;
const SORTED_FILE = /glossary|indexes/;
const LEAK = {
  en: /(?:^|[^\p{L}])(ve|veya|için|ile|bir|olan|edin|değil|gibi|kadar|sonra|önce|und|der|die|das|mit|Sie)(?=[^\p{L}]|$)/gu,
  de: /(?:^|[^\p{L}])(ve|veya|için|ile|bir|olan|edin|değil|gibi|kadar|sonra|önce|the|and|with|press|from|this)(?=[^\p{L}]|$)/gu
};
const TR_LETTERS = /[ğĞşŞıİ]/u;
/* Hedef dilde Türkçe harfle kalabilecek özel adlar. */
const KEEP_TR = /CNK ELEKTRONİK MAKİNE SANAYİ AŞ|CNK ELEKTRONİK MAKİNE SAN\. A\.Ş\.|Orhan Işık|Organize San(?:ayi|\.) B(?:ölgesi|öl\.)|ENERJİ|Türkiye|ETB30F06-2Ç/gu;

function strip(line) {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\{\{[^{}]+\}\}/g, ' ')
    .replace(/\[EKS[İI]K[^\]]*\]/giu, ' ')
    .replace(/https?:\/\/\S+|\S+@\S+/g, ' ');
}

function numbersOf(line) {
  return (strip(line).match(/\d+(?:[.,]\d+)*/g) || []).map(n => n.replace(/,/g, '.'));
}

function signalLevel(line) {
  const m = line.match(/^\*\*([^*:—–-]+?)\s*(?:[—–-][^*]*)?:\*\*/u);
  return m ? SIGNAL_OF[m[1].trim().toLocaleUpperCase('tr-TR')] || SIGNAL_OF[m[1].trim().toUpperCase()] || null : null;
}

/* Satırın yapı imzası: metinden bağımsız. */
function shape(line) {
  const s = line.trim();
  const h = s.match(/^(#{1,6})\s+(\d+(?:\.\d+)*)?/);
  if (h) return `H${h[1].length} ${h[2] || ''}`.trim();
  if (/^-{3,}$/.test(s)) return 'HR';
  if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(s) && s.includes('|')) return `TSEP ${s.replace(/\s+/g, '').replace(/-+/g, '-')}`;
  if (s.startsWith('|')) return `TR ${s.replace(/\\\|/g, '').split('|').length - 2}`;
  if (s.startsWith('![')) return 'IMG';
  if (CAPTION.test(s)) return 'CAP';
  if (/^\{\{(?:TABLO|ORTAK):/i.test(s)) return s;
  const indent = line.match(/^\s*/)[0].length;
  const ol = s.match(/^(\d+)\.\s/);
  if (ol) return `OL${indent} ${ol[1]}`;
  const al = s.match(/^([a-z])\.\s/);
  if (al) return `AL${indent} ${al[1]}`;
  if (/^[-*]\s/.test(s)) return `UL${indent}`;
  const lvl = signalLevel(s);
  if (lvl) return `SIG ${lvl}`;
  if (/^\*\*[^*]+\*\*$/.test(s)) return 'BOLD';
  return 'P';
}

function count(list) {
  const m = new Map();
  list.forEach(x => m.set(x, (m.get(x) || 0) + 1));
  return m;
}

function diffCounts(a, b) {
  const ca = count(a);
  const cb = count(b);
  const out = { eksik: [], fazla: [] };
  ca.forEach((n, k) => { for (let i = 0; i < n - (cb.get(k) || 0); i++) out.eksik.push(k); });
  cb.forEach((n, k) => { for (let i = 0; i < n - (ca.get(k) || 0); i++) out.fazla.push(k); });
  return out;
}

function tokens(text, rx) {
  return text.match(rx) || [];
}

function imageNames(text) {
  return [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => path.posix.basename(m[1]).replace(/\.(?:en|de)\.(\w+)$/, '.$1'));
}

function panelLabels(text) {
  const out = [];
  PANEL_LABELS.forEach((w) => {
    const rx = new RegExp(`(?<![\\p{L}])${w}(?![\\p{L}])`, 'gu');
    (text.match(rx) || []).forEach(() => out.push(w));
  });
  return out;
}

function nonEmpty(text) {
  return text.split(/\r?\n/).map((line, i) => ({ line, no: i + 1 })).filter(l => l.line.trim() && !/^<!--.*-->$/.test(l.line.trim()));
}

function checkFile(srcAbs, lang, rel, issues) {
  const dest = srcAbs.replace(/\.tr\.md$/, `.${lang}.md`);
  const name = `${rel.replace(/\.tr\.md$/, `.${lang}.md`)}`;
  const add = (no, msg) => issues.push(`${name}${no ? ':' + no : ''}  ${msg}`);
  if (!fs.existsSync(dest)) { add(0, 'dosya yok'); return; }
  const src = fs.readFileSync(srcAbs, 'utf8');
  const txt = fs.readFileSync(dest, 'utf8');
  if (/ÇEVİRİ GEREKLİ/.test(txt)) add(0, 'çeviri başlığı duruyor');
  // Uygulamanın "çevirisi eskimiş" kuralı: TR, çeviriden 60 sn'den daha yeni. Metin zaten aynıysa dosyanın tarihi güncellenir.
  if (fs.statSync(srcAbs).mtimeMs - fs.statSync(dest).mtimeMs > 60000) add(0, 'TR çeviriden yeni: uygulama "eskimiş" uyarısı verir');

  const a = nonEmpty(src);
  const b = nonEmpty(txt);
  if (a.length !== b.length) add(0, `satır sayısı farklı: TR ${a.length}, ${lang.toUpperCase()} ${b.length}`);
  let shapeBad = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const sa = shape(a[i].line);
    const sb = shape(b[i].line);
    if (sa !== sb) {
      if (shapeBad++ < 3) add(b[i].no, `yapı farklı: TR "${sa}" (satır ${a[i].no}), hedef "${sb}"`);
    }
  }
  if (shapeBad > 3) add(0, `… ${shapeBad - 3} yapı farkı daha`);

  const same = [
    ['yer tutucu', /\{\{[^{}]+\}\}/g],
    ['eksik işareti', /\[EKS[İI]K[^\]]*\]/giu]
  ];
  same.forEach(([label, rx]) => {
    const d = diffCounts(tokens(src, rx), tokens(txt, rx));
    if (d.eksik.length) add(0, `${label} kayıp: ${d.eksik.join(' ; ')}`);
    if (d.fazla.length) add(0, `${label} fazla: ${d.fazla.join(' ; ')}`);
  });
  const img = diffCounts(imageNames(src), imageNames(txt));
  if (img.eksik.length || img.fazla.length) add(0, `görsel farklı: -${img.eksik.join(',')} +${img.fazla.join(',')}`);
  const lab = diffCounts(panelLabels(src), panelLabels(txt));
  if (lab.eksik.length || lab.fazla.length) add(0, `panel etiketi farklı: -${lab.eksik.join(',')} +${lab.fazla.join(',')}`);

  if (SORTED_FILE.test(rel) || a.length !== b.length) {
    const d = diffCounts(a.flatMap(l => numbersOf(l.line)), b.flatMap(l => numbersOf(l.line)));
    if (d.eksik.length || d.fazla.length) add(0, `sayılar farklı: -${d.eksik.join(',')} +${d.fazla.join(',')}`);
  } else {
    a.forEach((l, i) => {
      const d = diffCounts(numbersOf(l.line), numbersOf(b[i].line));
      if (d.eksik.length || d.fazla.length) add(b[i].no, `sayılar farklı: -${d.eksik.join(',')} +${d.fazla.join(',')}`);
    });
  }

  b.forEach(({ line, no }) => {
    const s = strip(line).replace(KEEP_TR, ' ');
    if (TR_LETTERS.test(s)) add(no, `Türkçe harf: ${s.match(/\S*[ğĞşŞıİ]\S*/u)[0]}`);
    for (const m of s.matchAll(LEAK[lang] || /$^/gu)) add(no, `sızıntı olabilir: "${m[1]}"`);
  });
}

function checkData(projectDir, langs, issues) {
  const name = pickDataFile(fs.readdirSync(projectDir));
  if (!name) return;
  const data = parseData(fs.readFileSync(path.join(projectDir, name), 'utf8'));
  const textual = (v) => /\p{Ll}{2,}/u.test(v.replace(/https?:\/\/\S+|\S+@\S+/g, ' ').replace(/\b(?:mm|cm|kg|kW|bar|Hz|dB)\b/g, ' '));
  Object.values(data.blocks).forEach((block) => {
    block.entries.forEach((e) => {
      langs.forEach((lang) => {
        const where = `DATA:${e.line} [${block.name}] ${e.key}`;
        const t = e.i18n && e.i18n[lang];
        if (!t) { issues.push(`${where}  @${lang} satırı yok`); return; }
        if (!t.value && textual(e.value)) issues.push(`${where}  @${lang} değeri çevrilmemiş: ${e.value}`);
        if (t.value) {
          const d = diffCounts(numbersOf(e.value), numbersOf(t.value));
          if (d.eksik.length || d.fazla.length) issues.push(`${where}  @${lang} sayılar farklı: -${d.eksik.join(',')} +${d.fazla.join(',')}`);
        }
      });
    });
  });
}

function trFiles(dir, out = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    if (e.isDirectory()) {
      if (e.name !== 'assets') trFiles(path.join(dir, e.name), out);
    } else if (/\.tr\.md$/.test(e.name)) out.push(path.join(dir, e.name));
  });
  return out;
}

function checkProject(projectDir, { langs, only } = {}) {
  const doc = yaml.load(fs.readFileSync(findProjectYaml(projectDir), 'utf8')) || {};
  const targets = langs && langs.length ? langs : (doc.diller || []).filter(l => l !== 'tr');
  const issues = [];
  trFiles(projectDir).forEach((abs) => {
    const rel = path.relative(projectDir, abs).split(path.sep).join('/');
    if (only && !rel.includes(only)) return;
    targets.forEach(lang => checkFile(abs, lang, rel, issues));
  });
  if (!only) checkData(projectDir, targets, issues);
  return { issues, targets };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const take = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args.splice(i, 2)[1] : null;
  };
  const langs = (take('--dil') || '').split(',').map(s => s.trim()).filter(Boolean);
  const only = take('--dosya');
  const projects = path.resolve(take('--projects') || path.join(ROOT, 'projects'));
  if (!args[0]) {
    console.error('Kullanım: node scripts/dil-kontrol.js "<proje klasörü>" [--dil en,de] [--dosya <yol parçası>]');
    process.exit(1);
  }
  const dir = path.join(projects, args[0]);
  if (!findProjectYaml(dir)) {
    console.error(`Proje bulunamadı: ${dir}`);
    process.exit(1);
  }
  const { issues, targets } = checkProject(dir, { langs, only });
  issues.forEach(i => console.log(i));
  console.log(`${issues.length} sorun (${targets.join(', ') || 'hedef dil yok'}).`);
  process.exit(issues.length ? 1 : 0);
}

module.exports = { checkProject, shape, numbersOf };
