/* ELECTRICX ortak veritabanı: önce bu cihaza yazar, sonra Git deposuna gönderir.
   Her kayıt anında tarayıcı veritabanına (IndexedDB) girer, internet kesilse de çalışma kaybolmaz.
   Depo tarafı yalnız commit bilir: değişen dosyalar toplanır, tek commit olarak gönderilir.
   Eşitleme üç yönlü karşılaştırmadır: bu cihazdaki hâl, depodaki hâl, ikisinin son ortak hâli (base).
   Dosya baytları kayıt bilgisinden ayrı durur: büyük paftalar ve PDF'ler listelemeyi yavaşlatmaz.
   Bu dosya tarayıcıya bağlı değildir; Node testleri aynı kodu çalıştırır. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ExDb = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_FLUSH_MS = 60000;
  const RETRY_MS = 60000;
  const SYNC_ATTEMPTS = 4;
  // GitHub saatte en çok 500 içerik isteği kabul eder; büyük aktarmalar birkaç tura bölünür
  const MAX_BLOBS_PER_PUSH = 50;
  const MAX_BYTES_PER_PUSH = 200 * 1024 * 1024;

  /** Git'in dosya kimliği: aynı içerik her yerde aynı değeri verir, değişen dosya böyle anlaşılır */
  async function gitBlobSha(bytes) {
    const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
    const all = new Uint8Array(header.length + bytes.length);
    all.set(header);
    all.set(bytes, header.length);
    const digest = await crypto.subtle.digest('SHA-1', all);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function stamp(ms) {
    return new Date(ms).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function base64ToBytes(text) {
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }

  /** Görünüm büyük bir tamponun parçasıysa IndexedDB bütün tamponu saklardı; yalnız bu parça kopyalanır */
  function exact(bytes) {
    return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
  }

  /** Çeviri hafızası parçası: iki cihaz aynı parçaya farklı terim eklerse ikisi de kalır, aynı terimde yeni tarih kazanır */
  function mergeTermShards(path, mine, theirs) {
    if (!/^SEMA\/hafiza\/q[0-9a-f]{2}\.json$/.test(path)) return null;
    try {
      const decode = (b) => JSON.parse(new TextDecoder().decode(b));
      const a = decode(mine).terimler || {};
      const b = decode(theirs).terimler || {};
      const out = Object.assign({}, b);
      for (const [id, term] of Object.entries(a)) {
        if (!out[id] || String(term.tarih || '') >= String(out[id].tarih || '')) out[id] = term;
      }
      return new TextEncoder().encode(`${JSON.stringify({ terimler: out }, null, 1)}\n`);
    } catch {
      return null;
    }
  }

  /* ─── Yerel depo: testler için bellekte, tarayıcıda IndexedDB ──
     put(kayıt, bayt): bayt verilmezse eskisi korunur, null ise silinir. all() bayt getirmez. */

  function memoryLocal() {
    const files = new Map();
    const data = new Map();
    const meta = new Map();
    return {
      get: async (path) => files.get(path) || null,
      bytes: async (path) => (data.has(path) ? data.get(path) : null),
      put: async (record, bytes) => {
        files.set(record.path, record);
        if (bytes === null) data.delete(record.path);
        else if (bytes !== undefined) data.set(record.path, bytes);
      },
      remove: async (path) => {
        files.delete(path);
        data.delete(path);
      },
      all: async () => [...files.values()],
      getMeta: async (key) => (meta.has(key) ? meta.get(key) : null),
      setMeta: async (key, value) => { meta.set(key, value); }
    };
  }

  function indexedDbLocal(name) {
    let opening = null;
    const open = () => {
      if (!opening) {
        opening = new Promise((resolve, reject) => {
          const req = indexedDB.open(name, 1);
          req.onupgradeneeded = () => {
            req.result.createObjectStore('files', { keyPath: 'path' });
            req.result.createObjectStore('bytes');
            req.result.createObjectStore('meta');
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      return opening;
    };
    const transact = async (stores, mode, action) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        const req = action(tx);
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    };
    return {
      get: async (path) => (await transact('files', 'readonly', (tx) => tx.objectStore('files').get(path))) || null,
      bytes: async (path) => {
        const value = await transact('bytes', 'readonly', (tx) => tx.objectStore('bytes').get(path));
        return value === undefined ? null : value;
      },
      put: (record, bytes) => transact(['files', 'bytes'], 'readwrite', (tx) => {
        tx.objectStore('files').put(record);
        if (bytes === null) tx.objectStore('bytes').delete(record.path);
        else if (bytes !== undefined) tx.objectStore('bytes').put(bytes, record.path);
        return null;
      }),
      remove: (path) => transact(['files', 'bytes'], 'readwrite', (tx) => {
        tx.objectStore('files').delete(path);
        tx.objectStore('bytes').delete(path);
        return null;
      }),
      all: () => transact('files', 'readonly', (tx) => tx.objectStore('files').getAll()),
      getMeta: async (key) => {
        const value = await transact('meta', 'readonly', (tx) => tx.objectStore('meta').get(key));
        return value === undefined ? null : value;
      },
      setMeta: (key, value) => transact('meta', 'readwrite', (tx) => tx.objectStore('meta').put(value, key))
    };
  }

  /* ─── Veritabanı ─────────────────────────────────────────── */

  /** Kayıt alanları: dirty = depoya gönderilecek, base = depoda bilinen son hâl (yoksa null),
      lazy = baytlar henüz indirilmedi, ilk okumada depodan gelir.
      remote yoksa yerel modda çalışır; kayıtlar sonradan depoya bağlanınca gönderilmek üzere bekler.
      options.blobSource: remote'suz sayfanın tembel dosyaları okuyacağı kaynak.
      options.lazy(path): baytları ilk okumada indirilecek yollar. options.merge: iki taraf değiştirdiğinde birleştirme.
      options.onWrite(): bu sayfa yazınca çağrılır (kabuk gönderimi planlasın diye). */
  function createDb(options) {
    const { local, remote = null } = options;
    const now = options.now || Date.now;
    const lock = options.lock || ((fn) => fn());
    const flushMs = options.flushMs === undefined ? DEFAULT_FLUSH_MS : options.flushMs;
    const lazy = options.lazy || (() => false);
    const merge = options.merge || (() => null);
    const source = options.blobSource || remote;
    const onWrite = options.onWrite || (() => {});
    const listeners = new Set();
    const status = {
      mode: remote ? 'cloud' : 'local',
      state: remote ? 'idle' : 'ok',
      pending: 0,
      lastSync: null,
      error: '',
      changed: []
    };
    let timer = null;

    function emit(patch) {
      Object.assign(status, patch);
      for (const fn of listeners) fn(Object.assign({}, status));
    }

    async function refreshPending() {
      if (!remote) return;
      emit({ pending: (await local.all()).filter((r) => r.dirty).length });
    }

    /** Sürekli çalışırken de gönderim gecikmesin: bekleyen zamanlayıcı yeni yazmayla ertelenmez */
    function schedule(delay) {
      if (!remote) return;
      if (timer) {
        if (delay === undefined) return;
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        sync().catch(() => {});
      }, delay === undefined ? flushMs : delay);
      if (timer && timer.unref) timer.unref();
    }

    async function write(path, input, opts) {
      const bytes = exact(input);
      const hash = await gitBlobSha(bytes);
      const current = await local.get(path);
      // Aynı içerik yeniden yazılmaz: commit yalnız gerçek değişiklikten oluşur
      if (current && current.kind === 'file' && current.hash === hash) return false;
      await local.put({
        path,
        kind: 'file',
        size: bytes.length,
        hash,
        at: (opts && opts.at) || now(),
        dirty: true,
        base: current ? current.base : null
      }, bytes);
      if (!current || !current.dirty) await refreshPending();
      schedule();
      onWrite();
      return true;
    }

    async function mkdir(path) {
      const current = await local.get(path);
      if (current && current.kind !== 'deleted') return;
      await local.put({ path, kind: 'dir', size: 0, hash: 'dir', at: now(), dirty: true, base: current ? current.base : null }, null);
      await refreshPending();
      schedule();
      onWrite();
    }

    /** Depoda olan kayıt silindi diye işaretlenir ki commit'e girsin; hiç gönderilmemişse doğrudan silinir */
    async function remove(path) {
      const prefix = `${path}/`;
      const targets = (await local.all()).filter((r) => (r.path === path || r.path.startsWith(prefix)) && r.kind !== 'deleted');
      for (const record of targets) {
        if (record.base === null) {
          await local.remove(record.path);
          continue;
        }
        await local.put({
          path: record.path,
          kind: 'deleted',
          was: record.kind,
          size: 0,
          hash: 'deleted',
          at: now(),
          dirty: true,
          base: record.base
        }, null);
      }
      await refreshPending();
      schedule();
      onWrite();
      return targets.length;
    }

    async function fetchLazy(record) {
      if (!source) throw Object.assign(new Error('Dosya bu cihazda yok ve depoya bağlantı yok'), { offline: true });
      const bytes = await source.blob(record.hash);
      if ((await gitBlobSha(bytes)) !== record.hash) throw new Error('Depodan gelen dosya bozuk, yeniden denenecek');
      const latest = await local.get(record.path);
      if (latest && latest.hash === record.hash) {
        await local.put(Object.assign({}, latest, { lazy: false, size: bytes.length }), bytes);
      }
      return bytes;
    }

    async function read(path) {
      const record = await local.get(path);
      if (!record || record.kind === 'deleted') return null;
      if (record.kind !== 'file') return Object.assign({}, record, { bytes: null });
      let bytes = await local.bytes(path);
      if (bytes === null && record.lazy) bytes = await fetchLazy(record);
      return Object.assign({}, record, { bytes: bytes || new Uint8Array(0) });
    }

    /** Baytsız kayıt bilgisi; silinmişse null */
    async function meta(path) {
      const record = await local.get(path);
      return record && record.kind !== 'deleted' ? record : null;
    }

    async function list(prefix) {
      const rows = (await local.all()).filter((r) => r.kind !== 'deleted');
      return prefix ? rows.filter((r) => r.path.startsWith(prefix)) : rows;
    }

    async function readText(path) {
      const record = await read(path);
      return record && record.kind === 'file' ? new TextDecoder().decode(record.bytes) : null;
    }

    async function readJson(path) {
      const text = await readText(path);
      if (text === null) return null;
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }

    const writeText = (path, text, opts) => write(path, new TextEncoder().encode(text), opts);
    const writeJson = (path, value) => writeText(path, `${JSON.stringify(value, null, 1)}\n`);

    /* ── Depodan alma ── */

    /** Başka depoya bağlanılınca buradaki her şey o depoya gönderilmek üzere işaretlenir */
    async function adopt() {
      if ((await local.getMeta('repo')) === remote.id) return;
      for (const record of await local.all()) {
        // Baytı inmemiş kayıt yeni depoya gönderilemez; asıl dosya eski depoda duruyor
        if (record.kind === 'deleted' || record.lazy) await local.remove(record.path);
        else await local.put(Object.assign({}, record, { dirty: true, base: null }));
      }
      await local.setMeta('head', null);
      await local.setMeta('repo', remote.id);
    }

    /** Depo ağacı: boş klasörü tutan .gitkeep dosyası klasör kaydına çevrilir */
    function normalizeTree(tree) {
      const out = new Map();
      for (const [path, sha] of tree) {
        if (path === '.gitkeep') continue;
        if (path.endsWith('/.gitkeep')) out.set(path.slice(0, -'/.gitkeep'.length), 'dir');
        else out.set(path, sha);
      }
      out.sizes = tree.sizes || new Map();
      return out;
    }

    /** @returns güncel commit; depo boşsa null */
    async function pull(changed) {
      const sha = await remote.headSha();
      if (!sha) return null;
      const known = await local.getMeta('head');
      if (known && known.sha === sha) return known;
      const head = await remote.commitInfo(sha);
      // Sunucu kısa süreliğine eski commit'i döndürebilir; eski hâl yeni çalışmanın üstüne yazılmaz
      if (known && head.at < known.at) return known;

      const theirs = normalizeTree(await remote.tree(head.treeSha));
      const blobs = new Map();
      const blob = async (id) => {
        if (!blobs.has(id)) {
          const bytes = await remote.blob(id);
          if ((await gitBlobSha(bytes)) !== id) throw new Error('Depodan gelen dosya bozuk, yeniden denenecek');
          blobs.set(id, bytes);
        }
        return blobs.get(id);
      };
      const apply = async (path, id) => {
        if (id === 'dir') {
          await local.put({ path, kind: 'dir', size: 0, hash: id, at: head.at, dirty: false, base: id }, null);
        } else if (lazy(path)) {
          await local.put({ path, kind: 'file', size: theirs.sizes.get(path) || 0, hash: id, at: head.at, dirty: false, base: id, lazy: true }, null);
        } else {
          const bytes = await blob(id);
          await local.put({ path, kind: 'file', size: bytes.length, hash: id, at: head.at, dirty: false, base: id }, bytes);
        }
        changed.push(path);
      };

      const paths = new Set([...theirs.keys(), ...(await local.all()).map((r) => r.path)]);
      for (const path of paths) {
        const id = theirs.has(path) ? theirs.get(path) : null;
        // Her yol o anki hâliyle okunur: başka çerçevede az önce yazılan kayıt ezilmez
        const record = await local.get(path);
        if (!record) {
          if (id !== null) await apply(path, id);
          continue;
        }
        const value = record.kind === 'deleted' ? null : record.hash;
        if (value === id) {
          if (id === null) await local.remove(path);
          else if (record.dirty || record.base !== id) await local.put(Object.assign({}, record, { dirty: false, base: id }));
          continue;
        }
        if (!record.dirty) {
          if (id === null) {
            await local.remove(path);
            changed.push(path);
          } else {
            await apply(path, id);
          }
          continue;
        }
        if (record.base === id) continue; // Yalnız burada değişmiş, gönderilecek

        // İki taraf da değiştirmiş. Silme ile düzenleme karşılaşırsa düzenleme kazanır, içerik kaybolmaz.
        if (id === null) {
          await local.put(Object.assign({}, record, { base: null }));
          continue;
        }
        if (record.kind !== 'file' || id === 'dir') {
          await apply(path, id);
          continue;
        }
        const mine = (await local.bytes(path)) || new Uint8Array(0);
        const merged = merge(path, mine, await blob(id));
        if (merged) {
          const hash = await gitBlobSha(merged);
          await local.put(Object.assign({}, record, { hash, size: merged.length, at: now(), dirty: hash !== id, base: id }), merged);
          changed.push(path);
          continue;
        }
        // İki sürüm: yenisi asıl dosya olur, eskisi silinmeden yanına kopyalanır
        const theirsIsNewer = head.at > record.at;
        const loser = theirsIsNewer
          ? { bytes: mine, hash: record.hash, at: record.at }
          : { bytes: await blob(id), hash: id, at: head.at };
        const copy = `${path}.catisma-${stamp(loser.at)}`;
        await local.put({ path: copy, kind: 'file', size: loser.bytes.length, hash: loser.hash, at: loser.at, dirty: true, base: null }, loser.bytes);
        changed.push(copy);
        if (theirsIsNewer) await apply(path, id);
        else await local.put(Object.assign({}, record, { base: id }));
      }
      await local.setMeta('head', head);
      return head;
    }

    /* ── Depoya gönderme ── */

    function toEntry({ record, bytes }) {
      if (record.kind === 'dir') return { path: `${record.path}/.gitkeep`, bytes: new Uint8Array(0) };
      if (record.kind === 'deleted') return { path: record.was === 'dir' ? `${record.path}/.gitkeep` : record.path, remove: true };
      return { path: record.path, bytes };
    }

    /** Değişenler tek commit olur; o sırada başka cihaz göndermişse depo reddeder (conflict), yeniden alınır */
    async function push(head) {
      const batch = [];
      let blobs = 0;
      let total = 0;
      const all = await local.all();
      const live = all.filter((r) => r.kind !== 'deleted').map((r) => r.path);
      for (const record of all.filter((r) => r.dirty)) {
        if (record.kind === 'deleted' && record.base === null) {
          await local.remove(record.path);
          continue;
        }
        // İçinde dosya olan klasör zaten depoda görünür; yalnız gerçekten boş klasör .gitkeep ister
        if (record.kind === 'dir' && record.base === null && live.some((p) => p.startsWith(`${record.path}/`))) {
          await local.remove(record.path);
          continue;
        }
        let bytes = null;
        if (record.kind === 'file') {
          bytes = (await local.bytes(record.path)) || new Uint8Array(0);
          if (!remote.canInline(bytes)) {
            if (blobs >= MAX_BLOBS_PER_PUSH || (blobs && total + bytes.length > MAX_BYTES_PER_PUSH)) continue;
            blobs += 1;
            total += bytes.length;
          }
        }
        batch.push({ record, bytes });
      }
      if (!batch.length) return;
      const first = batch[0].record.path.split('/').pop();
      const message = batch.length === 1 ? `Kayıt: ${first}` : `Kayıt: ${first} ve ${batch.length - 1} dosya`;
      const next = await remote.commit(head, batch.map(toEntry), message);
      await local.setMeta('head', next);
      for (const { record } of batch) {
        const latest = await local.get(record.path);
        if (!latest) continue;
        if (latest.hash !== record.hash) {
          // Gönderim sürerken yeniden değişti: yeni hâl sonraki turda gider
          await local.put(Object.assign({}, latest, { base: record.kind === 'deleted' ? null : record.hash }));
        } else if (record.kind === 'deleted') {
          await local.remove(record.path);
        } else {
          await local.put(Object.assign({}, latest, { dirty: false, base: record.hash }));
        }
      }
    }

    async function exchange(changed) {
      await adopt();
      for (let attempt = 0; attempt < SYNC_ATTEMPTS; attempt += 1) {
        const head = await pull(changed);
        if (!head) {
          await remote.init();
          continue;
        }
        try {
          await push(head);
          return;
        } catch (e) {
          if (!e || !e.conflict) throw e;
        }
      }
      throw new Error('Depo o sırada değişiyordu, yeniden denenecek');
    }

    let syncing = null;
    function sync() {
      if (!remote) return Promise.resolve(Object.assign({}, status));
      if (syncing) return syncing;
      clearTimeout(timer);
      timer = null;
      syncing = (async () => {
        emit({ state: 'syncing', error: '' });
        const changed = [];
        try {
          await lock(() => exchange(changed));
          const pending = (await local.all()).filter((r) => r.dirty).length;
          emit({ state: 'ok', pending, lastSync: now(), error: '', changed });
          if (pending) schedule();
        } catch (e) {
          await refreshPending();
          emit({ state: e && e.offline ? 'offline' : 'error', error: (e && e.message) || 'Eşitleme hatası', changed });
          schedule(Math.max(RETRY_MS, (e && e.retryAfterMs) || 0));
        }
        return Object.assign({}, status);
      })().finally(() => { syncing = null; });
      return syncing;
    }

    /** Başka çerçeve yazdı: bekleyen sayısı yenilenir, gönderim planlanır */
    async function touch() {
      await refreshPending();
      schedule();
    }

    /* ── Yedek ── */

    /** Baytı inmemiş dosyalar indirilir; inemeyen skipped listesinde döner */
    async function exportBackup() {
      const files = [];
      const skipped = [];
      for (const r of await list()) {
        if (r.kind !== 'file') {
          files.push({ path: r.path, kind: r.kind, at: r.at, b64: null });
          continue;
        }
        try {
          const full = await read(r.path);
          files.push({ path: r.path, kind: r.kind, at: r.at, b64: bytesToBase64(full.bytes) });
        } catch {
          skipped.push(r.path);
        }
      }
      return { format: 'electricx-yedek', version: 1, createdAt: new Date(now()).toISOString(), files, skipped };
    }

    /** Var olan dosyalar overwrite istenmedikçe korunur */
    async function importBackup(backup, opts) {
      if (!backup || backup.format !== 'electricx-yedek' || !Array.isArray(backup.files)) throw new Error('Bu dosya ELECTRICX yedeği değil');
      let written = 0;
      let kept = 0;
      for (const file of backup.files) {
        if (file.kind === 'dir') {
          await mkdir(file.path);
          continue;
        }
        if (!(opts && opts.overwrite) && (await meta(file.path))) {
          kept += 1;
          continue;
        }
        if (await write(file.path, base64ToBytes(file.b64 || ''))) written += 1;
      }
      return { written, kept };
    }

    return {
      read,
      meta,
      write,
      mkdir,
      remove,
      list,
      readText,
      readJson,
      writeText,
      writeJson,
      sync,
      touch,
      exportBackup,
      importBackup,
      flush: () => (remote ? sync() : Promise.resolve(Object.assign({}, status))),
      status: () => Object.assign({}, status),
      onStatus: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      refreshPending
    };
  }

  return { createDb, memoryLocal, indexedDbLocal, gitBlobSha, bytesToBase64, base64ToBytes, mergeTermShards };
});
