/* Tarayıcı testleri için ortak yardımcılar (Playwright + Chromium).
   - Depo kökünü yerel HTTP sunucusuyla yayınlar (codes/ uygulama, fixture ve ortak dosyalar).
   - Test çalışma klasörünü tarayıcının özel dosya sistemine (OPFS) kopyalar ve
     uygulamaya bağlar: kod, kullanıcının seçtiği klasördeki ile aynı FileSystemDirectoryHandle
     yolundan geçer. projects/ klasörüne dokunulmaz. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.md': 'text/markdown; charset=utf-8', '.yaml': 'text/yaml; charset=utf-8',
  '.pdf': 'application/pdf'
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel;
      try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
      const abs = path.join(ROOT, rel);
      if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(abs).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

/* Önizleme klasörünü yayınlar; index.html, Artifact yayın iskeletiyle (doctype, charset,
   viewport-fit=cover, küçük sıfırlama) sarılır — yayındaki gibi. */
const SKELETON = (c) => '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
  '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>' +
  '</head><body>' + c + '</body></html>';

function serveDir(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel;
      try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html'; } catch (e) { res.writeHead(400); res.end(); return; }
      const abs = path.join(dir, rel);
      if (!abs.startsWith(dir) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      if (rel === 'index.html') res.end(SKELETON(fs.readFileSync(abs, 'utf8')));
      else fs.createReadStream(abs).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/` }));
  });
}

function walk(dir, out = [], base = dir) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out, base);
    else out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return out;
}

/* { hedef yol (çalışma klasöründe): kaynak yol (depoda) } */
function workspaceFiles(projects) {
  const map = {};
  const add = (srcDir, destDir) => walk(path.join(ROOT, srcDir)).forEach(f => { map[destDir + '/' + f] = srcDir + '/' + f; });
  add('templates', 'templates');
  ['labels', 'logos', 'iso7010'].forEach(d => add('assets/' + d, 'assets/' + d));
  // Test verisinin kendi çalışma klasörü dosyaları (kurgusal firma: assets/logos/firmalar.json + ornek.svg)
  add('codes/test/fixtures/assets', 'assets');
  Object.entries(projects).forEach(([name, src]) => add(src, 'projects/' + name));
  return map;
}

/* OPFS'i temizler, dosyaları kopyalar, uygulamaya bağlar. */
async function mountWorkspace(page, files) {
  await page.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory();
    const old = [];
    for await (const name of root.keys()) old.push(name);
    for (const name of old) await root.removeEntry(name, { recursive: true });
    // Klasörler sırayla (eşzamanlı create yarışı olmasın), dosyalar 16'şar paralel.
    const dirs = new Map([['', root]]);
    const dirOf = async (rel) => {
      if (dirs.has(rel)) return dirs.get(rel);
      const i = rel.lastIndexOf('/');
      const parent = await dirOf(i < 0 ? '' : rel.slice(0, i));
      const h = await parent.getDirectoryHandle(rel.slice(i + 1), { create: true });
      dirs.set(rel, h);
      return h;
    };
    const entries = Object.entries(files);
    for (const [dest] of entries) await dirOf(dest.split('/').slice(0, -1).join('/'));
    for (let i = 0; i < entries.length; i += 16) {
      await Promise.all(entries.slice(i, i + 16).map(async ([dest, src]) => {
        const r = await fetch('/' + src.split('/').map(encodeURIComponent).join('/'));
        if (!r.ok) throw new Error('fetch ' + src + ' ' + r.status);
        const blob = await r.blob();
        const fh = await dirs.get(dest.split('/').slice(0, -1).join('/')).getFileHandle(dest.split('/').pop(), { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
      }));
    }
    await DXConnect.mount(root);
  }, files);
}

/* Chromium, Linux'ta dosya adlarını yerel ayara göre çevirir; LANG tanımsızsa (C)
   ASCII dışı adlar (Ü, Ç …) açılamaz. Testlerde UTF-8 yerel ayarı zorunlu. */
function launch(opts = {}) {
  const { chromium } = require('playwright');
  const utf8 = /utf-?8/i.test(process.env.LC_ALL || process.env.LANG || '');
  const env = utf8 ? process.env : { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
  return chromium.launch({ ...opts, env });
}

/* Gerçek (yerel) klasör tutamacı: CDP sürükle-bırak ile; salt okunur (izin istemi otomasyonda yok). */
async function dropFolder(page, absDir) {
  await page.evaluate(() => {
    window.__dxDrop = null;
    const over = (e) => e.preventDefault();
    const drop = (e) => {
      e.preventDefault();
      const it = [...e.dataTransfer.items][0];
      window.__dxDrop = it && it.getAsFileSystemHandle ? it.getAsFileSystemHandle() : Promise.resolve(null);
      document.removeEventListener('dragover', over, true);
      document.removeEventListener('drop', drop, true);
    };
    document.addEventListener('dragover', over, true);
    document.addEventListener('drop', drop, true);
  });
  const cdp = await page.context().newCDPSession(page);
  const data = { items: [], files: [absDir], dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x: 200, y: 200, data });
  await page.waitForFunction(() => window.__dxDrop);
}

module.exports = { ROOT, serve, serveDir, walk, workspaceFiles, mountWorkspace, launch, dropFolder };
