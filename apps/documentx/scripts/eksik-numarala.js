#!/usr/bin/env node
/* Eksik numaraları — kılavuzdaki her eksiğe kalıcı numara yazar: [EKSİK] → [EKSİK E12].
   Kullanıcı kalite kontrol panelindeki numarayla cevap verir ("E12: 850 kg"); numara
   kaynakta durduğu için başka eksikler dolunca kaymaz, eski sayfaya bakılarak verilen
   cevap da yanlış alana gitmez. Doğrudan aranır: E12 → "[EKSİK E12]".

   node scripts/eksik-numarala.js "<proje klasörü>" [--projects <klasör>]

   Numaralananlar, belge sırasıyla (uygulamanın bölüm ağacı, TR):
   - .tr.md içindeki [EKSİK] işaretleri,
   - kılavuzda kullanılan boş DATA değerleri ({{BLOK:Anahtar}}, {{TABLO:BLOK}}); kılavuzda
     kullanılmayan boş anahtar (ör. müşteri projesinde dolacak seri no) boş kalır.
   Aynı DATA değeri birkaç yerde geçiyorsa numara tektir: tek cevap hepsini doldurur.
   Var olan numaralara dokunulmaz, yeniler en büyük numaradan devam eder. Ortak metinler
   (templates/ortak) başka projelerle paylaşıldığı için değiştirilmez, yalnızca içlerindeki
   DATA yer tutucuları dikkate alınır. */
const fs = require('fs');
const path = require('path');
const { findProjectYaml } = require('./project-core');
const { parseData, pickDataFile } = require('../codes/web/data-file.js');
const yaml = require('../codes/web/vendor/js-yaml.min.js');

const ROOT = path.resolve(__dirname, '..');
const NUMBERED_RX = /\[EKS[İI]K\s+E(\d+)/giu;
const TOKEN_RX = /<!--[\s\S]*?-->|\[EKS[İI]K(?!\s+E\d)[^\]]*\]|\{\{[^{}]+\}\}/giu;
const INLINE_RX = /^\{\{([^{}:|]+):([^{}#]+?)(?:#(\d+))?\}\}$/;
const TABLE_RX = /^\{\{TABLO:([^{}|]+?)(?:\|([^{}]+))?\}\}$/i;

/* codes/data-resolve.js → normDataKey ile aynı eşleşme (yer tutucu burada kaçışsızdır). */
const normKey = (s) => String(s || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').replace(/\s*:\s*$/, '').trim();

function projectFiles(items, dir, out = []) {
  (items || []).forEach((it) => {
    if (!it || it.aktif === false) return;
    const folder = path.join(dir, String(it.id));
    if (it.dosya) out.push(path.join(folder, `${it.dosya}.tr.md`));
    projectFiles(it.alt_bolumler, folder, out);
  });
  return out;
}

function sections(projectDir, root) {
  const doc = yaml.load(fs.readFileSync(findProjectYaml(projectDir), 'utf8')) || {};
  if (Array.isArray(doc.bolumler)) return doc.bolumler;
  const base = yaml.load(fs.readFileSync(path.join(root, doc.extends || 'templates/base.yaml'), 'utf8')) || {};
  return base.bolumler || [];
}

function openData(projectDir) {
  const name = pickDataFile(fs.readdirSync(projectDir));
  if (!name) return null;
  const abs = path.join(projectDir, name);
  const text = fs.readFileSync(abs, 'utf8');
  return { abs, name, text, lines: text.split('\n'), ...parseData(text) };
}

function findBlock(data, name) {
  if (!data) return null;
  const hit = Object.keys(data.blocks).find(k => normKey(k) === normKey(name));
  return hit ? data.blocks[hit] : null;
}

/* Satırın anahtar kısmı ve satır sonu korunur, yalnızca değer yeniden yazılır. */
function writeEntry(data, entry, cells) {
  const value = cells.join(' | ');
  const raw = data.lines[entry.line - 1];
  const cr = raw.endsWith('\r') ? '\r' : '';
  data.lines[entry.line - 1] = `${raw.match(/^\s*[^:]+?\s*:/)[0]} ${value}${cr}`;
  entry.value = value;
  entry.cells = cells.length > 1 ? cells : null;
}

function numberProject(projectDir, { root = ROOT } = {}) {
  const data = openData(projectDir);
  const files = projectFiles(sections(projectDir, root), projectDir).filter(f => fs.existsSync(f));
  const sources = new Map(files.map(f => [f, fs.readFileSync(f, 'utf8')]));

  let last = 0;
  [...sources.values(), data ? data.text : ''].forEach((text) => {
    for (const m of text.matchAll(NUMBERED_RX)) last = Math.max(last, Number(m[1]));
  });

  const assigned = [];
  const nextMark = (where) => {
    last += 1;
    assigned.push({ no: `E${last}`, where });
    return `[EKSİK E${last}]`;
  };
  const dataWhere = (entry) => `${data.name}:${entry.line}  ${entry.key}`;

  function stampCells(entry, width) {
    const cells = entry.cells ? entry.cells.slice() : [entry.value];
    while (cells.length < width) cells.push('');
    if (cells.every(c => c.trim())) return;
    writeEntry(data, entry, cells.map(c => (c.trim() ? c : nextMark(dataWhere(entry)))));
  }

  /* buildDataTable (codes/data-resolve.js) ile aynı satır ve sütun kuralı. */
  function visitTable(blockName, selection) {
    const block = findBlock(data, blockName);
    if (!block) return;
    let entries = block.entries;
    if (selection) {
      entries = selection.split(',').map(normKey).filter(Boolean)
        .map(w => block.entries.find(e => normKey(e.key) === w)).filter(Boolean);
    }
    const multi = entries.some(e => e.cells);
    const width = multi ? Math.max(1, ...entries.map(e => (e.cells ? e.cells.length : 1))) : 1;
    entries.forEach(e => stampCells(e, width));
  }

  function visitInline(blockName, key, col) {
    const block = findBlock(data, blockName);
    const entry = block && block.entries.find(e => normKey(e.key) === normKey(key));
    if (!entry) return;
    if (col) {
      const i = Number(col) - 1;
      const cells = entry.cells ? entry.cells.slice() : [entry.value];
      if ((cells[i] || '').trim()) return;
      while (cells.length <= i) cells.push('');
      cells[i] = nextMark(dataWhere(entry));
      writeEntry(data, entry, cells);
    } else if (!entry.value.trim()) {
      writeEntry(data, entry, [nextMark(dataWhere(entry))]);
    }
  }

  function visitPlaceholder(token) {
    const table = token.match(TABLE_RX);
    if (table) {
      visitTable(table[1].trim(), table[2]);
      return;
    }
    const m = token.match(INLINE_RX);
    if (!m) return;
    const block = m[1].trim();
    if (!/^ORTAK$/i.test(block)) {
      visitInline(block, m[2].trim(), m[3]);
      return;
    }
    const shared = path.join(root, 'templates', 'ortak', `${m[2].trim().toLowerCase()}.tr.md`);
    if (!fs.existsSync(shared)) return;
    for (const t of fs.readFileSync(shared, 'utf8').matchAll(TOKEN_RX)) {
      if (t[0].startsWith('{{')) visitPlaceholder(t[0]);
    }
  }

  for (const [file, text] of sources) {
    const rel = path.relative(projectDir, file).split(path.sep).join('/');
    const next = text.replace(TOKEN_RX, (token, offset) => {
      if (token.startsWith('<!--')) return token;
      if (token.startsWith('{{')) {
        visitPlaceholder(token);
        return token;
      }
      const line = text.slice(0, offset).split('\n').length;
      const mark = nextMark(`${rel}:${line}`);
      return mark.slice(0, -1) + token.slice('[EKSİK'.length);
    });
    if (next !== text) fs.writeFileSync(file, next);
  }
  if (data) {
    const next = data.lines.join('\n');
    if (next !== data.text) fs.writeFileSync(data.abs, next);
  }
  return { assigned, total: last };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--projects');
  const projects = at >= 0 ? path.resolve(args.splice(at, 2)[1]) : path.join(ROOT, 'projects');
  if (!args[0]) {
    console.error('Kullanım: node scripts/eksik-numarala.js "<proje klasörü>" [--projects <klasör>]');
    process.exit(1);
  }
  const dir = path.join(projects, args[0]);
  if (!findProjectYaml(dir)) {
    console.error(`Proje bulunamadı: ${dir}`);
    process.exit(1);
  }
  const { assigned, total } = numberProject(dir);
  assigned.forEach(a => console.log(`${a.no.padEnd(6)}${a.where}`));
  console.log(`${assigned.length} yeni numara; en büyük numara E${total}.`);
}

module.exports = { numberProject };
