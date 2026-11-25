/* web/git.js — tarayıcıdaki git okuyucusu ve satır farkı.
   1) Satır farkı: beklenen değerler `git diff --no-index -U0` ile üretildi (değişiklik çubukları
      Electron sürümündeki git diff çıktısıyla aynı satırları işaretlemeli).
   2) Depo: bu klasör bir git deposuysa ve git kuruluysa, .git doğrudan okunarak elde edilen
      geçmiş ve değişen satırlar git komutunun çıktısıyla karşılaştırılır (codes/ altında). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');

/* Node fs üzerinde DXFS (yalnız okuma); File dilimleri tembel okunur. */
globalThis.DXFS = {
  isMounted: () => true,
  async readText(rel) { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return null; } },
  async readBytes(rel) { try { return new Uint8Array(fs.readFileSync(path.join(ROOT, rel))); } catch (e) { return null; } },
  async file(rel) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
    const fd = fs.openSync(p, 'r');
    const mk = (a, b) => ({
      size: b - a,
      slice: (x, y) => mk(a + x, a + Math.min(y, b - a)),
      arrayBuffer: async () => {
        const buf = Buffer.alloc(b - a);
        fs.readSync(fd, buf, 0, b - a, a);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
      }
    });
    return mk(0, fs.fstatSync(fd).size);
  },
  async list(rel) {
    try { return fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }).map(e => ({ name: e.name, kind: e.isDirectory() ? 'directory' : 'file' })); } catch (e) { return []; }
  },
  async walk(rel, opts = {}) {
    const out = [];
    const f = opts.filter || (() => true);
    const s = opts.skipDir || (() => false);
    const v = (d) => {
      for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const p = d + '/' + e.name;
        if (e.isDirectory()) { if (!s(e.name, p)) v(p); } else if (f(e.name, p)) out.push(p);
      }
    };
    v(rel);
    return out.sort();
  }
};
const G = require('../../web/git.js');

const CASES = [
  ['paragraf + boş satır silme', '# Başlık\n\nA paragrafı.\n\n**UYARI — X:** silinecek.\n\nB paragrafı.\n\n**UYARI — Y:** silinecek.\n\nC paragrafı.\n',
    '# Başlık\n\nA paragrafı.\n\nB paragrafı.\n\nC paragrafı.\n', [4, 6]],
  ['uyarı bloğu tek satıra indi', 'Giriş.\n\n**UYARI — 1:** a.\n\n**UYARI — 2:** b.\n\nTablo: X\n\n| a | b |\n',
    'Giriş.\n\nSıcak yüzey uyarıları Bkz. Bölüm 2.2.3.\n\nTablo: X\n\n| a | b |\n', [3]],
  ['başa ekleme', 'bir\niki\nüç\n', 'sıfır\nbir\niki\nüç\n', [1]],
  ['liste maddesi değişti ve madde eklendi', '1. Aç.\n2. Kapat.\n3. Bekle.\n4. Kontrol et.\n',
    "1. Aç.\n2. Kapağı kapatın.\n3. Bekle.\n4. LOTO'yu kaldırın.\n5. Kontrol et.\n", [2, 4, 5]],
  ['dosya sonunda satır sonu kalktı', 'a\nb\nc\n', 'a\nb\nc', [3]],
  ['BOM eklendi', '# Başlık\nmetin\n', '﻿# Başlık\nmetin\n', [1]],
  ['tekrarlı boş satırlar arasında ekleme', 'x\n\n\ny\n\n\nz\n', 'x\n\n\ny\n\nyeni\n\n\nz\n', [6, 7]],
  ['yalnız satır sonu farkı (CRLF) değişiklik sayılmaz', 'a\nb\n', 'a\r\nb\r\n', []]
];

test('satır farkı git diff -U0 ile aynı satırları işaretler', () => {
  for (const [name, a, b, lines] of CASES) {
    assert.deepStrictEqual([...G.diffChangedLines(a, b)].sort((x, y) => x - y), lines, name);
  }
});

const git = (...args) => execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
let hasGit = false;
try { hasGit = fs.existsSync(path.join(ROOT, '.git', 'HEAD')) && git('rev-parse', 'HEAD').trim().length === 40; } catch (e) { hasGit = false; }

test('depo: HEAD, kısa ref ve geçmiş git ile aynı', { skip: !hasGit && 'git deposu yok' }, async () => {
  assert.strictEqual(await G.headCommit(), git('rev-parse', 'HEAD').trim());
  const log = await G.logForPath('codes', 20);
  const ref = git('log', '-20', '--format=%H%x09%ct%x09%s', '--', 'codes').trim().split('\n').map(l => l.split('\t'));
  assert.deepStrictEqual(log.map(c => [c.hash, String(c.ts), c.subject]), ref);
  if (ref.length > 1) assert.strictEqual(await G.resolveRef(ref[1][0].slice(0, 7)), ref[1][0]);
});

test('depo: değişen satırlar git diff ile aynı (codes/ altındaki md)', { skip: !hasGit && 'git deposu yok' }, async () => {
  const refs = git('log', '-6', '--format=%H', '--', 'codes').trim().split('\n').filter(Boolean).slice(1);
  for (const r of refs) {
    const mine = await G.changedLines(r, 'codes');
    const exp = new Map();
    let cur = null;
    git('diff', '-U0', '--no-color', '--no-ext-diff', r, '--', 'codes').split('\n').forEach(line => {
      if (line.startsWith('+++ ')) {
        let p = line.slice(4).trim();
        if (p.startsWith('"')) p = JSON.parse(p);
        cur = p === '/dev/null' ? null : p.replace(/^b\//, '');
        if (cur && !exp.has(cur)) exp.set(cur, new Set());
        return;
      }
      const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (!h || !cur) return;
      const s = +h[1];
      const c = h[2] == null ? 1 : +h[2];
      if (c === 0) exp.get(cur).add(Math.max(1, s));
      for (let i = 0; i < c; i++) exp.get(cur).add(s + i);
    });
    git('ls-files', '--others', '--exclude-standard', '--', 'codes').split('\n').filter(Boolean).forEach(p => {
      exp.set(p, new Set(Array.from({ length: fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r?\n$/, '').split(/\r?\n/).length }, (_, i) => i + 1)));
    });
    for (const k of [...exp.keys()]) if (!/\.md$/i.test(k) || /\/(assets|backup)\//i.test(k) || !exp.get(k).size) exp.delete(k);
    const norm = (m) => [...m].map(([k, v]) => [k, [...v].sort((x, y) => x - y)]).sort((a, b) => a[0].localeCompare(b[0]));
    assert.deepStrictEqual(norm(mine), norm(exp), 'ref ' + r.slice(0, 7));
  }
});
