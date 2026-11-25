/* GitHub Pages sitesi: her uygulama kendi alt klasöründe (https://thevanerr.github.io/docx/<uygulama>/).
   Kullanım:  node araclar/site-hazirla.mjs [_site]      (.github/workflows/yayin.yml her gönderimde çalıştırır)

   Yalnız git'te izlenen dosyalar yayına girer; bilgisayardaki proje/müşteri klasörleri girmez.
   Uygulamaların kendi yayın kuralları korunur:
   - bomx:      apps/bomx/.github/workflows/pages.yml içindeki dosya listesi
   - warrantyx: apps/warrantyx/tools/yayin-hazirla.js
   - rax:       app/ klasörü (araclar/, *.md, kisayol-olustur.* hariç), sw.js sürüm damgası
   - layoutx:   apps/layoutx/tools/build_site.py
   - electricx: program dosyaları (.md, .py, .url ve nokta ile başlayanlar hariç)
   - controlx:  program dosyaları (test/, package.json, belgeler hariç)
   P&PX (giriş kabuğu programı eski depodan indiriyor) ve DocumentX (masaüstü) bu adımda yayına girmez. */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, '_site'));
const PYTHON = process.env.PYTHON || 'python';
const SURUM = (process.env.GITHUB_SHA || git(['rev-parse', 'HEAD'])).trim().slice(0, 12);

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

/** Önekin altındaki izlenen dosyalar (önek çıkarılmış yollar) */
function izlenen(onek) {
  return git(['-c', 'core.quotepath=false', 'ls-files', '-z', '--', onek])
    .split('\0').filter(Boolean).map((p) => p.slice(onek.length + 1));
}

function kopyala(onek, hedef, alinsin) {
  let n = 0;
  for (const yol of izlenen(onek)) {
    if (!alinsin(yol)) continue;
    const to = path.join(hedef, yol);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(ROOT, onek, yol), to);
    n += 1;
  }
  return n;
}

const noktali = (yol) => yol.split('/').some((p) => p.startsWith('.'));

function calistir(komut, args, cwd) {
  execFileSync(komut, args, { cwd: path.join(ROOT, cwd), stdio: ['ignore', 'ignore', 'inherit'] });
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// BOMX: pages.yml'deki liste
const BOMX = ['index.html', 'manifest.webmanifest', 'sw.js'];
const BOMX_KLASOR = ['codes/', 'ortak/', 'assets/logos/', 'assets/simge/'];
kopyala('apps/bomx', path.join(OUT, 'bomx'), (y) => BOMX.includes(y) || BOMX_KLASOR.some((k) => y.startsWith(k)));

// WarrantyX: kendi yayın betiği
calistir('node', ['tools/yayin-hazirla.js', path.join(OUT, 'warrantyx')], 'apps/warrantyx');

// R&AX: app/ klasörü + sürüm damgası
kopyala('apps/rax/app', path.join(OUT, 'rax'), (y) => !y.startsWith('araclar/') && !y.endsWith('.md') && !/(^|\/)kisayol-olustur\./.test(y));
const raxSw = path.join(OUT, 'rax', 'sw.js');
fs.writeFileSync(raxSw, fs.readFileSync(raxSw, 'utf8').replaceAll('__SURUM__', SURUM));

// LayoutX: kendi site üreticisi
calistir(PYTHON, ['tools/build_site.py', path.join(OUT, 'layoutx'), `--version=${SURUM}`], 'apps/layoutx');

// ELECTRICX
kopyala('apps/electricx', path.join(OUT, 'electricx'), (y) => !noktali(y) && !/\.(md|py|url)$/i.test(y));

// ControlX
kopyala('apps/controlx', path.join(OUT, 'controlx'), (y) => !noktali(y) && !y.startsWith('test/') && !['package.json', 'README.md'].includes(y));

// Açılış sayfası
fs.copyFileSync(path.join(ROOT, 'araclar', 'acilis.html'), path.join(OUT, 'index.html'));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

// Denetim: yayında veri ya da büyük dosya olmamalı
const hepsi = [];
(function gez(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) gez(p);
    else hepsi.push({ yol: path.relative(OUT, p).split(path.sep).join('/'), boyut: fs.statSync(p).size });
  }
})(OUT);
const sorun = hepsi.filter((f) => /(^|\/)(projects|projeler|models|veri|ES|kayitlar)\//.test(f.yol)
  || /\.(step|stp|brep|npy|xlsx|xlsm|pdf|zip|md|py)$/i.test(f.yol) || f.boyut > 25 * 1024 * 1024);
if (sorun.length) {
  console.error('Yayına girmemesi gereken dosyalar:\n' + sorun.map((f) => '  ' + f.yol).join('\n'));
  process.exit(1);
}

const ozet = {};
for (const f of hepsi) {
  const k = f.yol.includes('/') ? f.yol.split('/')[0] : '(kök)';
  ozet[k] = ozet[k] || { dosya: 0, mb: 0 };
  ozet[k].dosya += 1;
  ozet[k].mb += f.boyut / 1048576;
}
for (const [k, v] of Object.entries(ozet)) console.log(`${k.padEnd(10)} ${String(v.dosya).padStart(4)} dosya  ${v.mb.toFixed(1).padStart(6)} MB`);
console.log(`Site hazır: ${OUT} (sürüm ${SURUM})`);
