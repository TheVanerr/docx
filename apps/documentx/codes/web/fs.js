/* ── Çalışma klasörü erişimi (tarayıcı) ──
   Electron'daki Node fs'nin yerini alır. Kullanıcının seçtiği DocumentX klasörü
   (içinde projects/, templates/, assets/ olan klasör):
   - Chrome / Edge: File System Access API → okuma + yazma; tutamaç IndexedDB'de
     saklanır, sonraki açılışta tek tıkla yeniden bağlanılır.
   - Diğer tarayıcılar: <input webkitdirectory> → salt okunur anlık görüntü.
   Tüm yollar çalışma klasörüne göre "/" ayraçlı göreli yoldur
   (ör. "projects/X/project.yaml"); ".." ile klasör dışına çıkılamaz. */
const DXFS = (() => {
  let backend = null;

  function norm(rel) {
    const out = [];
    for (const seg of String(rel == null ? '' : rel).replace(/\\/g, '/').split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') {
        if (!out.length) throw new Error('Çalışma klasörü dışına çıkılamaz: ' + rel);
        out.pop();
        continue;
      }
      out.push(seg);
    }
    return out.join('/');
  }

  const join = (...parts) => norm(parts.filter(p => p != null && p !== '').join('/'));
  const dirname = (rel) => { const r = norm(rel); const i = r.lastIndexOf('/'); return i < 0 ? '' : r.slice(0, i); };
  const basename = (rel) => norm(rel).split('/').pop() || '';
  const isMissing = (e) => e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError' || e instanceof TypeError);

  /* File System Access API tutamacı (okuma + yazma) */
  class HandleBackend {
    constructor(root) {
      this.kind = 'handle';
      this.root = root;
      this.name = root.name;
      this.writable = true;
      this.dirs = new Map([['', root]]);
    }

    forget(prefix) {
      for (const k of [...this.dirs.keys()]) {
        if (k && (k === prefix || k.startsWith(prefix + '/'))) this.dirs.delete(k);
      }
    }

    async dir(rel, create) {
      if (this.dirs.has(rel)) return this.dirs.get(rel);
      const i = rel.lastIndexOf('/');
      const parent = await this.dir(i < 0 ? '' : rel.slice(0, i), create);
      if (!parent) return null;
      try {
        const h = await parent.getDirectoryHandle(rel.slice(i + 1), { create: !!create });
        this.dirs.set(rel, h);
        return h;
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    }

    async fileHandle(rel, create, retried) {
      const i = rel.lastIndexOf('/');
      const parentRel = i < 0 ? '' : rel.slice(0, i);
      const parent = await this.dir(parentRel, create);
      if (!parent) return null;
      try {
        return await parent.getFileHandle(rel.slice(i + 1), { create: !!create });
      } catch (e) {
        // Önbellekteki klasör tutamacı silinip yeniden oluşturulmuş olabilir: bir kez tazele.
        if (e && e.name === 'NotFoundError' && parentRel && !retried) {
          this.forget(parentRel);
          return this.fileHandle(rel, create, true);
        }
        if (isMissing(e)) return null;
        throw e;
      }
    }

    async file(rel) {
      if (!rel) return null;
      const h = await this.fileHandle(rel, false);
      if (!h) return null;
      try { return await h.getFile(); } catch (e) {
        if (isMissing(e)) { this.forget(dirname(rel)); return null; }
        throw e;
      }
    }

    async isDir(rel) {
      return !!(await this.dir(rel, false));
    }

    async list(rel) {
      const d = await this.dir(rel, false);
      if (!d) return [];
      const out = [];
      try {
        for await (const [name, h] of d.entries()) out.push({ name, kind: h.kind });
      } catch (e) {
        if (isMissing(e)) { this.forget(rel); return []; }
        throw e;
      }
      return out;
    }

    async write(rel, data) {
      const h = await this.fileHandle(rel, true);
      const w = await h.createWritable();
      try {
        await w.write(data);
      } catch (e) {
        try { await w.abort(); } catch (ignore) { /* yok say */ }
        throw e;
      }
      await w.close();
      return h.getFile();
    }

    async mkdir(rel) {
      await this.dir(rel, true);
    }

    async remove(rel) {
      const i = rel.lastIndexOf('/');
      const parent = await this.dir(i < 0 ? '' : rel.slice(0, i), false);
      if (!parent) return false;
      try {
        await parent.removeEntry(rel.slice(i + 1), { recursive: true });
        this.forget(rel);
        return true;
      } catch (e) {
        if (isMissing(e)) return false;
        throw e;
      }
    }

    /* Önce okuma + yazma; kullanıcı yalnız görüntülemeye izin verdiyse salt okunur bağlanır. */
    async permission(request) {
      if (!this.root.queryPermission) return 'granted';
      const rw = { mode: 'readwrite' };
      let state = await this.root.queryPermission(rw);
      if (state !== 'granted' && request) state = await this.root.requestPermission(rw);
      if (state === 'granted') { this.writable = true; return state; }
      let read = await this.root.queryPermission({ mode: 'read' });
      if (read !== 'granted' && request) read = await this.root.requestPermission({ mode: 'read' });
      if (read === 'granted') { this.writable = false; return read; }
      return state;
    }
  }

  /* <input webkitdirectory> ile yüklenen dosya listesi (salt okunur) */
  class ListBackend {
    constructor(fileList) {
      this.kind = 'list';
      this.writable = false;
      this.files = new Map();
      this.children = new Map([['', new Map()]]);
      let rootName = '';
      for (const f of fileList) {
        const parts = String(f.webkitRelativePath || f.name).split('/');
        if (parts.length > 1) rootName = parts.shift();
        let cur = '';
        parts.forEach((p, i) => {
          const isLast = i === parts.length - 1;
          const childRel = cur ? cur + '/' + p : p;
          if (!this.children.has(cur)) this.children.set(cur, new Map());
          this.children.get(cur).set(p, isLast ? 'file' : 'directory');
          if (!isLast && !this.children.has(childRel)) this.children.set(childRel, new Map());
          cur = childRel;
        });
        this.files.set(parts.join('/'), f);
      }
      this.name = rootName || 'DocumentX';
    }

    async file(rel) { return this.files.get(rel) || null; }
    async isDir(rel) { return this.children.has(rel); }
    async list(rel) {
      const m = this.children.get(rel);
      return m ? [...m].map(([name, kind]) => ({ name, kind })) : [];
    }
    readonly() { throw new Error('Klasör salt okunur açıldı (bu tarayıcı dosya yazmayı desteklemiyor). Chrome veya Edge ile açın.'); }
    async write() { this.readonly(); }
    async mkdir() { this.readonly(); }
    async remove() { this.readonly(); }
    async permission() { return 'granted'; }
    forget() {}
  }

  /* Önizleme paketi (scripts/build-preview.js → window.DX_PREVIEW), salt okunur:
     metin dosyaları pakette, görseller sayfanın yanında yayınlanan dosyalar (assetUrl). */
  class BundleBackend {
    constructor(bundle) {
      this.kind = 'bundle';
      this.writable = false;
      this.name = bundle.name || 'Önizleme';
      this.mtime = bundle.builtAt || Date.now();
      this.texts = new Map(Object.entries(bundle.files || {}));
      this.assets = new Map(Object.entries(bundle.assets || {}));
      this.blobs = new Map();
      this.children = new Map([['', new Map()]]);
      [...this.texts.keys(), ...this.assets.keys()].forEach((rel) => {
        const parts = rel.split('/');
        let cur = '';
        parts.forEach((p, i) => {
          const isLast = i === parts.length - 1;
          const childRel = cur ? cur + '/' + p : p;
          if (!this.children.has(cur)) this.children.set(cur, new Map());
          this.children.get(cur).set(p, isLast ? 'file' : 'directory');
          if (!isLast && !this.children.has(childRel)) this.children.set(childRel, new Map());
          cur = childRel;
        });
      });
    }

    async file(rel) {
      if (this.texts.has(rel)) {
        return new File([this.texts.get(rel)], basename(rel), { lastModified: this.mtime, type: 'text/plain' });
      }
      const a = this.assets.get(rel);
      if (!a) return null;
      if (!this.blobs.has(rel)) {
        this.blobs.set(rel, fetch(a.url)
          .then(r => (r.ok ? r.blob() : null))
          .then(b => (b ? new File([b], basename(rel), { lastModified: a.mtime || this.mtime, type: b.type }) : null))
          .catch(() => null));
      }
      return this.blobs.get(rel);
    }

    assetUrl(rel) {
      const a = this.assets.get(rel);
      return a ? a.url : '';
    }

    assetStat(rel) {
      const a = this.assets.get(rel);
      return a ? { size: a.size || 0, mtime: a.mtime || this.mtime } : null;
    }

    async isDir(rel) { return this.children.has(rel); }
    async list(rel) {
      const m = this.children.get(rel);
      return m ? [...m].map(([name, kind]) => ({ name, kind })) : [];
    }
    readonly() { throw new Error('Önizleme salt okunur: değişiklik için uygulamayı kendi DocumentX klasörünüzde açın.'); }
    async write() { this.readonly(); }
    async mkdir() { this.readonly(); }
    async remove() { this.readonly(); }
    async permission() { return 'granted'; }
    forget() {}
  }

  function need() {
    if (!backend) throw new Error('Çalışma klasörü bağlı değil');
    return backend;
  }

  async function file(rel) {
    return need().file(norm(rel));
  }

  async function stat(rel) {
    const r = norm(rel);
    const b = need();
    if (!r) return { kind: 'directory' };
    const f = await b.file(r);
    if (f) return { kind: 'file', size: f.size, mtime: f.lastModified };
    return (await b.isDir(r)) ? { kind: 'directory' } : null;
  }

  async function readText(rel) {
    const f = await file(rel);
    return f ? f.text() : null;
  }

  async function readBytes(rel) {
    const f = await file(rel);
    return f ? new Uint8Array(await f.arrayBuffer()) : null;
  }

  async function readJson(rel) {
    const t = await readText(rel);
    if (t == null) return null;
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  async function list(rel) {
    return need().list(norm(rel));
  }

  /* Klasör ağacındaki dosyalar (göreli yollar). skipDir(name, rel) → true ise o klasöre inilmez. */
  async function walk(rel, opts = {}) {
    const start = norm(rel);
    const filter = opts.filter || (() => true);
    const skipDir = opts.skipDir || (() => false);
    const out = [];
    const visit = async (dir) => {
      const entries = await list(dir);
      const sub = [];
      for (const e of entries) {
        const p = dir ? dir + '/' + e.name : e.name;
        if (e.kind === 'directory') { if (!skipDir(e.name, p)) sub.push(p); }
        else if (filter(e.name, p)) out.push(p);
      }
      await Promise.all(sub.map(visit));
    };
    await visit(start);
    return out.sort();
  }

  async function writeText(rel, text) {
    const f = await need().write(norm(rel), String(text));
    return { mtime: f.lastModified, size: f.size };
  }

  async function writeBytes(rel, data) {
    const f = await need().write(norm(rel), data);
    return { mtime: f.lastModified, size: f.size };
  }

  async function mkdirp(rel) {
    await need().mkdir(norm(rel));
  }

  async function copyFile(src, dest) {
    const f = await file(src);
    if (!f) throw new Error('Dosya yok: ' + src);
    return writeBytes(dest, f);
  }

  async function remove(rel) {
    return need().remove(norm(rel));
  }

  /* Bir alt klasörün tutamacı (kaydetme diyaloğunu oraya açmak için); yoksa null. */
  async function dirHandle(rel, create) {
    const b = need();
    return b.kind === 'handle' ? b.dir(norm(rel), !!create) : null;
  }

  /* ── Tutamacın kalıcı saklanması (IndexedDB) ── */
  const DB = 'documentx';
  const STORE = 'handles';
  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbDo(mode, fn) {
    const db = await idb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
  async function saveHandle(handle) {
    try { await idbDo('readwrite', s => s.put(handle, 'workspace')); } catch (e) { /* özel pencere vb. */ }
  }
  async function loadHandle() {
    try { return (await idbDo('readonly', s => s.get('workspace'))) || null; } catch (e) { return null; }
  }
  async function clearHandle() {
    try { await idbDo('readwrite', s => s.delete('workspace')); } catch (e) { /* yok say */ }
  }

  return {
    norm, join, dirname, basename,
    HandleBackend, ListBackend, BundleBackend,
    mount(b) { backend = b; },
    unmount() { backend = null; },
    isMounted: () => !!backend,
    backend: () => backend,
    name: () => (backend ? backend.name : ''),
    writable: () => !!(backend && backend.writable),
    kind: () => (backend ? backend.kind : ''),
    supportsHandles: () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function',
    file, stat, readText, readBytes, readJson, list, walk,
    exists: async (rel) => !!(await stat(rel)),
    isDir: async (rel) => !!(await need().isDir(norm(rel))),
    writeText, writeBytes, mkdirp, copyFile, remove, dirHandle,
    saveHandle, loadHandle, clearHandle
  };
})();
