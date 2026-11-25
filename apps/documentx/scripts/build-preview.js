#!/usr/bin/env node
/* DocumentX önizleme paketi — bir kılavuzu, uygulamanın kendisiyle birlikte, klasör
   seçmeden açılan statik bir sayfa olarak hazırlar (Claude Artifact veya herhangi bir
   web sunucusu). Sayfa salt okunurdur: A4 / HTML görünümü, kalite kontrol, arama ve
   değişiklik çubukları (git farkı pakete gömülür) çalışır; düzenleme ve çıktı yoktur.

   node scripts/build-preview.js "<proje klasörü>" [seçenekler]
     --out <klasör>       çıktı (varsayılan: preview/<proje>/, git'e girmez)
     --base <ref>         değişiklik çubuklarının tabanı: commit / HEAD / auto / none
                          auto (varsayılan): kaydedilmemiş değişiklik varsa HEAD,
                          yoksa projeye dokunan son commit'ten önceki commit
     --title "<ad>"       sayfa başlığı (varsayılan: proje adı + " önizleme")
     --projects <klasör>  proje kökü (varsayılan: projects/; testler fixture verir)

   index.html, Artifact sayfa sözleşmesine göre <html>/<head>/<body> etiketsizdir:
   yayın sırasında bu iskelet eklenir. Görseller media/ altına ASCII adlarla kopyalanır. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CODES = path.join(ROOT, 'codes');
const MARKER = '.dx-preview';
const IMG_RX = /\.(png|jpe?g|webp|gif|svg)$/i;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else out._.push(a);
  }
  return out;
}

const posix = (p) => p.split(path.sep).join('/');

function walk(dir, skipDir = () => false, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { if (!skipDir(e.name)) walk(abs, skipDir, out); }
    else if (e.isFile()) out.push(abs);
  }
  return out;
}

/* Yalnız önceki önizleme çıktısını (işaret dosyası olan) veya boş klasörü siler. */
function prepareOut(dir) {
  if (fs.existsSync(dir)) {
    const entries = fs.readdirSync(dir);
    if (entries.length && !entries.includes(MARKER)) {
      throw new Error(`${dir} boş değil ve önizleme klasörü değil; başka bir --out verin`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MARKER), 'DocumentX önizleme çıktısı — yeniden derlemede silinir.\n');
}

function gitRunner() {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const git = (...args) => execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: top, encoding: 'utf8', maxBuffer: 1 << 28 });
    return { top: path.resolve(top), git };
  } catch (e) {
    return null;
  }
}

/* git diff -U0 <ref> -- <dir> + izlenmeyen dosyalar → { göreli yol: [satır] } (uygulamadaki kural) */
function changedLines(G, ref, repoDir, toBundle) {
  const map = {};
  let cur = null;
  G.git('diff', '-U0', '--no-color', '--no-ext-diff', ref, '--', repoDir).split('\n').forEach(line => {
    if (line.startsWith('+++ ')) {
      let p = line.slice(4).trim();
      if (p.startsWith('"')) p = JSON.parse(p);
      cur = p === '/dev/null' ? null : p.replace(/^b\//, '');
      if (cur && !map[cur]) map[cur] = new Set();
      return;
    }
    const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!h || !cur) return;
    const s = Number(h[1]);
    const c = h[2] == null ? 1 : Number(h[2]);
    if (c === 0) map[cur].add(Math.max(1, s));
    for (let i = 0; i < c; i++) map[cur].add(s + i);
  });
  G.git('ls-files', '--others', '--exclude-standard', '--', repoDir).split('\n').filter(Boolean).forEach(p => {
    const text = fs.readFileSync(path.join(G.top, p), 'utf8').replace(/\r?\n$/, '');
    map[p] = new Set(Array.from({ length: text.split(/\r?\n/).length }, (_, i) => i + 1));
  });
  const out = {};
  Object.entries(map).forEach(([p, set]) => {
    if (!set.size || !(/\.md$/i.test(p) || /(^|\s)DATA$/.test(path.posix.basename(p))) || /\/(assets|backup)\//i.test(p)) return;
    const rel = toBundle(p);
    if (rel) out[rel] = [...set].sort((a, b) => a - b);
  });
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = args._[0];
  if (!name) {
    console.error('Kullanım: node scripts/build-preview.js "<proje klasörü>" [--out <klasör>] [--base <ref>|auto|none] [--title "<ad>"]');
    process.exit(2);
  }
  const projectsDir = path.resolve(args.projects || path.join(ROOT, 'projects'));
  const projAbs = path.join(projectsDir, name);
  if (!fs.existsSync(projAbs)) throw new Error('Proje klasörü yok: ' + projAbs);
  const outDir = path.resolve(args.out || path.join(ROOT, 'preview', name.replace(/[^\w.-]+/g, '-')));
  prepareOut(outDir);

  const yaml = require(path.join(CODES, 'web', 'vendor', 'js-yaml.min.js'));
  const yamlFile = fs.existsSync(path.join(projAbs, 'project.yaml')) ? 'project.yaml'
    : fs.readdirSync(projAbs).find(f => /\.ya?ml$/i.test(f) && !/^sozluk\.ya?ml$/i.test(f));
  const doc = (yamlFile && yaml.load(fs.readFileSync(path.join(projAbs, yamlFile), 'utf8'))) || {};
  const model = String(doc.model || '').toLowerCase();
  const projRel = 'projects/' + name;

  /* ── Paket: metin dosyaları + görseller ── */
  const files = {};
  const assets = {};
  let mediaCount = 0;
  let mediaBytes = 0;
  const addText = (abs, rel) => { files[rel] = fs.readFileSync(abs, 'utf8'); };
  const addImage = (abs, rel) => {
    const ext = path.extname(abs).toLowerCase();
    const base = path.basename(abs, path.extname(abs)).normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(0, 40);
    const pub = `media/${String(++mediaCount).padStart(3, '0')}-${base}${ext}`;
    let data = fs.readFileSync(abs);
    if (ext === '.svg') {
      // Yayın, DOCTYPE / ENTITY taşıyan SVG'yi kabul etmez: iç varlıklar (ör. Illustrator'ın
      // &ns_svg;) yerine konur, ardından DOCTYPE atılır.
      let svg = data.toString('utf8');
      const dt = svg.match(/<!DOCTYPE[^>[]*(\[([^\]]*)\])?\s*>/i);
      if (dt) {
        const ents = {};
        (dt[2] || '').replace(/<!ENTITY\s+([\w.-]+)\s+(["'])([\s\S]*?)\2\s*>/g, (m, k, q, v) => { ents[k] = v; return m; });
        svg = svg.replace(dt[0], '').replace(/&([\w.-]+);/g, (m, k) => (Object.prototype.hasOwnProperty.call(ents, k) ? ents[k] : m));
      }
      data = Buffer.from(svg, 'utf8');
    }
    fs.mkdirSync(path.join(outDir, 'media'), { recursive: true });
    fs.writeFileSync(path.join(outDir, pub), data);
    const st = fs.statSync(abs);
    assets[rel] = { url: pub, size: data.length, mtime: Math.round(st.mtimeMs) };
    mediaBytes += data.length;
  };

  const skipProjectDir = (n) => /^(photos|backup|\.git)$/i.test(n) || n.startsWith('.');
  walk(projAbs, skipProjectDir).forEach(abs => {
    const relIn = posix(path.relative(projAbs, abs));
    const rel = projRel + '/' + relIn;
    const base = path.basename(abs);
    const inAssets = relIn.startsWith('assets/');
    if (inAssets && IMG_RX.test(base)) addImage(abs, rel);
    else if (inAssets && /\.marks\.json$/i.test(base)) addText(abs, rel);
    else if (!inAssets && (/\.md$/i.test(base) || /\.ya?ml$/i.test(base) || /(^|\s)DATA$/.test(base))) addText(abs, rel);
  });
  // Uygulamanın okuduğu ortak dosyalar: templates/*.yaml (sözlük, taban bölüm listesi) ve templates/ortak/ parçaları.
  const T = path.join(ROOT, 'templates');
  if (fs.existsSync(T)) fs.readdirSync(T).filter(f => /\.ya?ml$/i.test(f)).forEach(f => addText(path.join(T, f), 'templates/' + f));
  walk(path.join(T, 'ortak')).filter(a => /\.md$/i.test(a)).forEach(abs => addText(abs, 'templates/ortak/' + posix(path.relative(path.join(T, 'ortak'), abs))));
  ['labels', 'logos', 'iso7010'].forEach(d => {
    walk(path.join(ROOT, 'assets', d)).filter(a => IMG_RX.test(a)).forEach(abs => addImage(abs, 'assets/' + d + '/' + posix(path.relative(path.join(ROOT, 'assets', d), abs))));
  });
  if (model && model !== name.toLowerCase()) {
    const kapak = path.join(projectsDir, model, 'assets', 'kapak');
    walk(kapak).filter(a => IMG_RX.test(a)).forEach(abs => addImage(abs, `projects/${model}/assets/kapak/` + posix(path.relative(kapak, abs))));
  }

  /* ── git: commit listesi ve tabanlara göre değişen satırlar ── */
  const gitData = { head: '', base: '', commits: [], changed: {} };
  const G = gitRunner();
  const repoDir = G && posix(path.relative(G.top, projAbs));
  if (G && repoDir && !repoDir.startsWith('..')) {
    const toBundle = (p) => (p === repoDir || p.startsWith(repoDir + '/') ? projRel + p.slice(repoDir.length) : null);
    gitData.head = G.git('rev-parse', 'HEAD').trim();
    gitData.commits = G.git('log', '-40', '--format=%H%x09%h%x09%ct%x09%s', '--', repoDir).trim().split('\n').filter(Boolean).map(l => {
      const [hash, short, ts, ...subject] = l.split('\t');
      return { hash, short, ts: Number(ts), subject: subject.join('\t') };
    });
    const dirty = G.git('status', '--porcelain', '--untracked-files=all', '--', repoDir).trim() !== '';
    let base = String(args.base || 'auto');
    if (base === 'auto') base = dirty ? 'HEAD' : (gitData.commits[1] ? gitData.commits[1].hash : '');
    else if (base === 'none') base = '';
    else if (base !== 'HEAD') base = G.git('rev-parse', base).trim();
    gitData.base = base;
    const refs = new Set([...(dirty ? ['HEAD'] : []), ...gitData.commits.slice(0, 15).map(c => c.hash)]);
    if (base) refs.add(base);
    refs.forEach(ref => { gitData.changed[ref] = changedLines(G, ref, repoDir, toBundle); });
  }

  const builtAt = Date.now();
  const bundle = { version: 1, name: 'Önizleme', guide: 'proje:' + name, project: name, builtAt, files, assets, git: gitData };
  fs.writeFileSync(path.join(outDir, 'dx-preview-data.js'),
    '/* DocumentX önizleme paketi — scripts/build-preview.js üretir; elle düzenlemeyin. */\nwindow.DX_PREVIEW = ' + JSON.stringify(bundle) + ';\n');

  /* ── Uygulama dosyaları ── */
  const appFiles = [];
  const copyApp = (relFromCodes) => {
    const dest = path.join(outDir, relFromCodes);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (/\.js$/i.test(relFromCodes)) {
      // Yayın, ham kontrol baytı (ör. js-yaml'daki ESC) taşıyan metni kabul etmez. Bu baytlar
      // yalnız dize/regex sabitlerinin içinde olabilir; aynı değeri veren \xHH kaçışına çevrilir.
      const text = fs.readFileSync(path.join(CODES, relFromCodes), 'utf8')
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0'));
      fs.writeFileSync(dest, text);
    } else {
      fs.copyFileSync(path.join(CODES, relFromCodes), dest);
    }
    appFiles.push(relFromCodes);
  };
  fs.readdirSync(CODES).filter(f => /\.(js|css)$/i.test(f)).forEach(copyApp);
  fs.readdirSync(path.join(CODES, 'web')).filter(f => /\.js$/i.test(f)).forEach(f => copyApp('web/' + f));
  copyApp('web/vendor/js-yaml.min.js');
  if (fs.existsSync(path.join(CODES, 'flags'))) fs.readdirSync(path.join(CODES, 'flags')).forEach(f => copyApp('flags/' + f));

  /* ── index.html: Artifact iskeletine uygun gövde ── */
  const html = fs.readFileSync(path.join(CODES, 'index.html'), 'utf8');
  // Sayfadaki görseller (ör. üst çubuktaki Dolfin logosu: icon/dolfin.png)
  for (const m of html.matchAll(/<img\b[^>]*\ssrc="(?![a-z][a-z0-9+.-]*:|\/)([^"]+)"/gi)) {
    if (fs.existsSync(path.join(CODES, m[1]))) copyApp(m[1]);
  }
  const links = (html.match(/<link rel="stylesheet"[^>]*>/g) || []).join('\n');
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) throw new Error('codes/index.html gövdesi bulunamadı');
  let body = bodyMatch[1];
  const apiTag = '<script src="web/api.js"></script>';
  if (!body.includes(apiTag)) throw new Error('codes/index.html: web/api.js etiketi bulunamadı');
  body = body.replace(apiTag, apiTag + '\n  <script src="dx-preview-data.js"></script>\n  <script src="web/preview.js"></script>');
  const title = String(args.title || `${doc.proje_adi || name} önizleme`).replace(/[<>&]/g, '');
  const css = fs.readFileSync(path.join(CODES, 'web', 'preview.css'), 'utf8');
  const page = `<title>${title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
${links}
<style>
${css}
</style>
<script>document.documentElement.lang = 'tr'; document.body.classList.add('view-pdf');</script>
${body.trim()}
`;
  fs.writeFileSync(path.join(outDir, 'index.html'), page);

  // Artifact yayını için dosya listesi: { yayın yolu: kaynak } (kök: çıktı klasörü, sayfa index.html hariç).
  const publish = {};
  walk(outDir).map(a => posix(path.relative(outDir, a))).filter(f => f !== 'index.html' && f !== MARKER && f !== 'publish-files.json')
    .sort().forEach(f => { publish[f] = f; });
  fs.writeFileSync(path.join(outDir, 'publish-files.json'), JSON.stringify(publish, null, 1) + '\n');

  const textBytes = Buffer.byteLength(JSON.stringify(files));
  console.log(`Önizleme: ${outDir}`);
  console.log(`  ${Object.keys(files).length} metin dosyası (${(textBytes / 1024).toFixed(0)} KB), ${mediaCount} görsel (${(mediaBytes / 1048576).toFixed(1)} MB), ${appFiles.length} uygulama dosyası`);
  console.log(`  git: ${gitData.commits.length} commit, ${Object.keys(gitData.changed).length} taban; değişiklik çubuğu tabanı: ${gitData.base ? (gitData.base === 'HEAD' ? 'HEAD (kaydedilmemiş değişiklikler)' : gitData.base.slice(0, 7)) : 'yok'}`);
  console.log(`  yayın: index.html + ${Object.keys(publish).length} dosya (liste: publish-files.json)`);
}

try {
  main();
} catch (e) {
  console.error('Önizleme oluşturulamadı: ' + e.message);
  process.exit(1);
}
