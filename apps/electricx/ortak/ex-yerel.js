/* Bilgisayar klasörü köprüsü. Tarayıcı, dosyadan açılan sayfada iframe içinden klasör seçtirmez.
   Bu yüzden gömülü program klasör işlerini kabuğa yaptırır: seçim penceresi ve izinler kabukta açılır,
   gerçek tutamaçlar kabukta durur, program aynı arayüzü sunan vekil nesnelerle çalışır.
   Etiket programının "Bu bilgisayar" kodu böylece değişmeden çalışır. */

(function () {
  'use strict';

  const gomulu = window.parent !== window && !window.EX_KABUK;

  function domError(data) {
    const e = new Error((data && data.message) || 'Klasör işlemi başarısız');
    e.name = (data && data.name) || 'Error';
    return e;
  }

  /* ─── Kabuk tarafı ──────────────────────────────────────── */

  function sunucuKur() {
    const tutamaclar = new Map();
    let sira = 0;

    const kaydet = (handle) => {
      const hid = `h${++sira}`;
      tutamaclar.set(hid, handle);
      return { hid, name: handle.name, kind: handle.kind };
    };
    const al = (hid) => {
      const handle = tutamaclar.get(hid);
      if (!handle) throw Object.assign(new Error('Klasör bağlantısı kapandı, yeniden seçin'), { name: 'NotFoundError' });
      return handle;
    };

    /* Son seçilen klasör: gerçek tutamaç tarayıcı veritabanında saklanabilir */
    const kv = () => new Promise((resolve, reject) => {
      const req = indexedDB.open('electricx-yerel', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const kvYaz = async (k, v) => {
      const db = await kv();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(v, k);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    };
    const kvOku = async (k) => {
      const db = await kv();
      return new Promise((resolve, reject) => {
        const q = db.transaction('kv').objectStore('kv').get(k);
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      });
    };

    const islemler = {
      async klasorSec(a) {
        const handle = await window.showDirectoryPicker(a.secenek);
        try { await kvYaz('dir', handle); } catch { /* hatırlanmazsa bir sonraki açılışta yeniden sorulur */ }
        return kaydet(handle);
      },
      async sonKlasor() {
        const handle = await kvOku('dir');
        return handle ? kaydet(handle) : null;
      },
      async dosyaSec(a) {
        const list = await window.showOpenFilePicker(a.secenek);
        return list.map(kaydet);
      },
      izinSor: (a) => al(a.hid).queryPermission({ mode: a.mode }),
      izinIste: (a) => al(a.hid).requestPermission({ mode: a.mode }),
      ayniMi: (a) => al(a.a).isSameEntry(al(a.b)),
      async dosyaAl(a) { return kaydet(await al(a.hid).getFileHandle(a.ad, { create: a.create })); },
      async klasorAl(a) { return kaydet(await al(a.hid).getDirectoryHandle(a.ad, { create: a.create })); },
      async sil(a) { await al(a.hid).removeEntry(a.ad); },
      async liste(a) {
        const out = [];
        for await (const [, handle] of al(a.hid).entries()) out.push(kaydet(handle));
        return out;
      },
      async dosyaOku(a) {
        const f = await al(a.hid).getFile();
        return { veri: f, ad: f.name, zaman: f.lastModified, tur: f.type };
      },
      async dosyaYaz(a) {
        const w = await al(a.hid).createWritable();
        await w.write(a.veri);
        await w.close();
      }
    };

    window.addEventListener('message', async (e) => {
      const m = e.data;
      if (!m || m.ex !== 'fs' || !islemler[m.op]) return;
      const yanit = { ex: 'fs-yanit', id: m.id };
      try {
        yanit.sonuc = await islemler[m.op](m.args || {});
        yanit.ok = true;
      } catch (err) {
        yanit.ok = false;
        yanit.hata = { name: err && err.name, message: err && err.message };
      }
      e.source.postMessage(yanit, '*');
    });
  }

  /* ─── Gömülü program tarafı ─────────────────────────────── */

  const bekleyen = new Map();
  let istekNo = 0;

  function rpc(op, args) {
    return new Promise((resolve, reject) => {
      const id = ++istekNo;
      bekleyen.set(id, { resolve, reject });
      window.parent.postMessage({ ex: 'fs', id, op, args }, '*');
    });
  }

  function izinler(h) {
    return {
      queryPermission: (o) => rpc('izinSor', { hid: h.hid, mode: o && o.mode }),
      requestPermission: (o) => rpc('izinIste', { hid: h.hid, mode: o && o.mode }),
      isSameEntry: (other) => (other && other.vekilHid ? rpc('ayniMi', { a: h.hid, b: other.vekilHid }) : Promise.resolve(false))
    };
  }

  function dosyaVekil(h) {
    return Object.assign({
      kind: 'file',
      name: h.name,
      vekilHid: h.hid,
      async getFile() {
        const r = await rpc('dosyaOku', { hid: h.hid });
        return new File([r.veri], r.ad, { lastModified: r.zaman, type: r.tur });
      },
      async createWritable() {
        const parcalar = [];
        return {
          write: async (data) => { parcalar.push(data && data.type === 'write' ? data.data : data); },
          close: () => rpc('dosyaYaz', { hid: h.hid, veri: new Blob(parcalar) }),
          abort: async () => { parcalar.length = 0; }
        };
      }
    }, izinler(h));
  }

  function klasorVekil(h) {
    const self = Object.assign({
      kind: 'directory',
      name: h.name,
      vekilHid: h.hid,
      getFileHandle: (ad, o) => rpc('dosyaAl', { hid: h.hid, ad, create: !!(o && o.create) }).then(dosyaVekil),
      getDirectoryHandle: (ad, o) => rpc('klasorAl', { hid: h.hid, ad, create: !!(o && o.create) }).then(klasorVekil),
      removeEntry: (ad) => rpc('sil', { hid: h.hid, ad }),
      async *entries() {
        for (const e of await rpc('liste', { hid: h.hid })) yield [e.name, e.kind === 'file' ? dosyaVekil(e) : klasorVekil(e)];
      }
    }, izinler(h));
    self[Symbol.asyncIterator] = self.entries;
    return self;
  }

  if (gomulu) {
    window.addEventListener('message', (e) => {
      const m = e.data;
      if (e.source !== window.parent || !m || m.ex !== 'fs-yanit' || !bekleyen.has(m.id)) return;
      const { resolve, reject } = bekleyen.get(m.id);
      bekleyen.delete(m.id);
      if (m.ok) resolve(m.sonuc);
      else reject(domError(m.hata));
    });
    window.showDirectoryPicker = (secenek) => rpc('klasorSec', { secenek }).then(klasorVekil);
    window.showOpenFilePicker = (secenek) => rpc('dosyaSec', { secenek }).then((list) => list.map(dosyaVekil));
  }

  window.ExYerel = {
    gomulu,
    sunucuKur,
    /** Daha önce seçilen klasör: program yeniden açıldığında kabuktan alınır */
    sonKlasor: () => rpc('sonKlasor', {}).then((h) => (h ? klasorVekil(h) : null))
  };
})();
