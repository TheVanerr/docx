/* GitHub Pages sitesi (https://thevanerr.github.io/docx/). Site deponun düzenindedir: kabuk kökte (index.html),
   uygulamalar apps/<uygulama>/ altında. Aynı göreli yollar hem bilgisayarda (index.html'e çift tık) hem web adresinde çalışır.
   Kullanım:  node araclar/site-hazirla.mjs [_site]      (.github/workflows/yayin.yml her gönderimde çalıştırır)

   Yalnız git'te izlenen dosyalar yayına girer; bilgisayardaki veri (projects/, veri/, .veri.git …) girmez.
   Uygulamaların kendi yayın kuralları korunur:
   - kabuk:     index.html, manifest, sw.js (dosya listesi ve sürüm burada yazılır), kabuk/, ortak/
   - bomx:      apps/bomx/.github/workflows/pages.yml içindeki dosya listesi
   - warrantyx: apps/warrantyx/tools/yayin-hazirla.js
   - rax:       app/ klasörü (araclar/, *.md, kisayol-olustur.* hariç), sw.js sürüm damgası
   - layoutx:   apps/layoutx/tools/build_site.py
   - electricx: program dosyaları (.md, .py, .url ve nokta ile başlayanlar hariç)
   - ppx:       program dosyaları; kural P&PX kabuğunun kendi kuralıdır (apps/ppx/pwa/ppx-kabuk.js > isProgramFile)
   - documentx: codes/ (testler ve belgeler hariç); kılavuzlar bilgisayardaki DocumentX klasöründen açılır
   - softwarex: görüntüleyici (testler ve belgeler hariç); belgeler bilgisayardaki SOFTWAREX klasöründen açılır */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, '_site'));
const PYTHON = process.env.PYTHON || 'python';
const SURUM = (process.env.GITHUB_SHA || git(['rev-parse', 'HEAD'])).trim().slice(0, 12);
const ppxProgramDosyasi = createRequire(import.meta.url)(path.join(ROOT, 'apps/ppx/pwa/ppx-kabuk.js')).isProgramFile;

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

/** Önekin altındaki izlenen dosyalar (önek çıkarılmış yollar); önek '' ise depo kökü */
function izlenen(onek) {
  return git(['-c', 'core.quotepath=false', 'ls-files', '-z', '--', onek || '.'])
    .split('\0').filter(Boolean).map((p) => (onek ? p.slice(onek.length + 1) : p));
}

const yayinda = []; // sw.js listesi için kopyalanan kabuk / DocumentX / SoftwareX dosyaları

function kopyala(onek, hedef, alinsin) {
  let n = 0;
  for (const yol of izlenen(onek)) {
    if (!alinsin(yol)) continue;
    const to = path.join(OUT, hedef, yol);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(ROOT, onek, yol), to);
    yayinda.push(path.posix.join(hedef, yol));
    n += 1;
  }
  if (!n) throw new Error(`${onek || 'kök'}: yayına giren dosya yok`);
  return n;
}

const noktali = (yol) => yol.split('/').some((p) => p.startsWith('.'));
const belgeMi = (yol) => /\.md$/i.test(yol) || /(^|\/)package(-lock)?\.json$/.test(yol);

function calistir(komut, args, cwd) {
  execFileSync(komut, args, { cwd: path.join(ROOT, cwd), stdio: ['ignore', 'ignore', 'inherit'] });
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ── Kabuk ──
kopyala('', '', (y) => ['index.html', 'manifest.webmanifest'].includes(y) || y.startsWith('kabuk/') || y.startsWith('ortak/'));

// ── DocumentX: yalnız tarayıcı uygulaması (codes/) ──
kopyala('apps/documentx', 'apps/documentx', (y) => y.startsWith('codes/') && !y.startsWith('codes/test/') && !belgeMi(y));

// ── SoftwareX ──
kopyala('apps/softwarex', 'apps/softwarex', (y) => !y.startsWith('test/') && !belgeMi(y));

const kabukDosyalari = yayinda.slice(); // sw.js bunları çevrimdışı saklar

// ── BOMX: pages.yml'deki liste ──
const BOMX = ['index.html', 'manifest.webmanifest', 'sw.js'];
const BOMX_KLASOR = ['codes/', 'ortak/', 'assets/logos/', 'assets/simge/'];
kopyala('apps/bomx', 'apps/bomx', (y) => BOMX.includes(y) || BOMX_KLASOR.some((k) => y.startsWith(k)));

// ── WarrantyX: kendi yayın betiği ──
calistir('node', ['tools/yayin-hazirla.js', path.join(OUT, 'apps/warrantyx')], 'apps/warrantyx');

// ── R&AX: app/ klasörü + sürüm damgası; kökteki index.html app/'e yönlendirir ──
kopyala('apps/rax', 'apps/rax', (y) => y === 'index.html');
kopyala('apps/rax/app', 'apps/rax/app', (y) => !y.startsWith('araclar/') && !y.endsWith('.md') && !/(^|\/)kisayol-olustur\./.test(y));
const raxSw = path.join(OUT, 'apps/rax/app/sw.js');
fs.writeFileSync(raxSw, fs.readFileSync(raxSw, 'utf8').replaceAll('__SURUM__', SURUM));

// ── LayoutX: kendi site üreticisi ──
calistir(PYTHON, ['tools/build_site.py', path.join(OUT, 'apps/layoutx'), `--version=${SURUM}`], 'apps/layoutx');

// ── ELECTRICX ──
kopyala('apps/electricx', 'apps/electricx', (y) => !noktali(y) && !/\.(md|py|url)$/i.test(y));

// ── P&PX: kabuğun program dosyası kuralı ──
kopyala('apps/ppx', 'apps/ppx', (y) => ppxProgramDosyasi(y));

// ── Kabuğun service worker'ı: sürüm ve çevrimdışı dosya listesi ──
const swKaynak = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const swSurum = /^const SURUM = '[^']*';$/m;
const swListe = /^const DOSYALAR = \[[^\]]*\];$/m;
if (!swSurum.test(swKaynak) || !swListe.test(swKaynak)) throw new Error('sw.js: SURUM ya da DOSYALAR satırı bulunamadı');
fs.writeFileSync(path.join(OUT, 'sw.js'), swKaynak
  .replace(swSurum, `const SURUM = '${SURUM}';`)
  .replace(swListe, `const DOSYALAR = ${JSON.stringify(kabukDosyalari)};`));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

// ── Denetim: yayında veri ya da büyük dosya olmamalı ──
const hepsi = [];
(function gez(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) gez(p);
    else hepsi.push({ yol: path.relative(OUT, p).split(path.sep).join('/'), boyut: fs.statSync(p).size });
  }
})(OUT);
const sorun = hepsi.filter((f) => /(^|\/)(projects|projeler|models|veri|ES|kayitlar|lvd)\//.test(f.yol)
  || /\.(step|stp|brep|npy|xlsx|xlsm|pdf|zip|md|py|vbs|bat|cmd|ps1|lnk)$/i.test(f.yol) || f.boyut > 25 * 1024 * 1024);
if (sorun.length) {
  console.error('Yayına girmemesi gereken dosyalar:\n' + sorun.map((f) => '  ' + f.yol).join('\n'));
  process.exit(1);
}

const ozet = {};
for (const f of hepsi) {
  const p = f.yol.split('/');
  const k = p[0] === 'apps' ? `apps/${p[1]}` : p.length > 1 ? p[0] : '(kök)';
  ozet[k] = ozet[k] || { dosya: 0, mb: 0 };
  ozet[k].dosya += 1;
  ozet[k].mb += f.boyut / 1048576;
}
for (const [k, v] of Object.entries(ozet).sort()) console.log(`${k.padEnd(16)} ${String(v.dosya).padStart(4)} dosya  ${v.mb.toFixed(1).padStart(6)} MB`);
console.log(`Site hazır: ${OUT} (sürüm ${SURUM}, kabuk çevrimdışı listesi ${kabukDosyalari.length} dosya)`);
