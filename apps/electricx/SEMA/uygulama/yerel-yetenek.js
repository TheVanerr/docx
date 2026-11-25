// Yetenekler ELECTRICX içinde. Uygulama dosyadan açılır, window.claude yoktur; aynı arayüz burada kurulur:
//   db: hafıza, ayarlar ve arşiv kayıtları ELECTRICX veritabanında JSON dosyası olarak (SEMA/<koleksiyon>/<kimlik>.json)
//   assets: arşiv PDF'leri veritabanında (SEMA/dosyalar/)
//   user: GitHub hesabı (çeviri geçmişinde kimin değiştirdiği)
// claude.ai'de açılırsa window.claude zaten vardır, bu dosya devreye girmez.
(function () {
  "use strict";
  if (window.claude || !window.ExBoot) return;

  const KOK = "SEMA/";
  const kopya = (o) => JSON.parse(JSON.stringify(o));
  const yolBelge = (yol) => `${KOK}${yol}.json`;
  const yolKoleksiyon = (kol) => `${KOK}${kol}/`;
  const hazir = () => ExBoot.ready();

  function rastgele(uzunluk) {
    const b = crypto.getRandomValues(new Uint8Array(Math.ceil(uzunluk / 2)));
    return [...b].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, uzunluk);
  }

  // ---------------------------------------------------------------- belge veritabanı
  const dinleyenler = new Set();

  const belgeSnap = (id, veri) => ({
    id,
    exists: veri != null,
    data: () => (veri == null ? undefined : kopya(veri)),
    metadata: { fromCache: false, hasPendingWrites: false },
  });

  /** Dinleyiciye güncel hâli verir; arada yeni okuma başladıysa eskisi atılır. */
  async function tetikle(d) {
    const no = ++d.no;
    try {
      const s = await d.al();
      if (no === d.no && dinleyenler.has(d)) d.f(s);
    } catch (e) {
      if (d.hata) d.hata(e);
    }
  }

  function dinle(d) {
    d.no = 0;
    dinleyenler.add(d);
    tetikle(d);
    return () => dinleyenler.delete(d);
  }

  // Hafıza bir kayıtta birkaç parça yazar: dinleyiciler topluca bir kez uyarılır
  let bekleyenYol = [], yayZaman = null;
  function yay(yollar) {
    bekleyenYol.push(...yollar);
    if (yayZaman) return;
    yayZaman = setTimeout(() => {
      const liste = bekleyenYol;
      bekleyenYol = [];
      yayZaman = null;
      for (const d of dinleyenler) if (liste.some(d.ilgili)) tetikle(d);
    }, 60);
  }

  function belge(yol) {
    const dosya = yolBelge(yol);
    const id = yol.split("/").pop();
    const oku = async () => belgeSnap(id, await (await hazir()).readJson(dosya));
    return {
      id,
      path: yol,
      get: oku,
      async set(v) {
        await (await hazir()).writeJson(dosya, kopya(v));
        yay([dosya]);
      },
      async update(v) {
        const d = await hazir();
        await d.writeJson(dosya, Object.assign({}, (await d.readJson(dosya)) || {}, kopya(v)));
        yay([dosya]);
      },
      async delete() {
        await (await hazir()).remove(dosya);
        yay([dosya]);
      },
      onSnapshot(f, hata) {
        return dinle({ al: oku, f, hata, ilgili: (p) => p === dosya || p === KOK });
      },
    };
  }

  function sorgu(kol, sec) {
    sec = sec || {};
    const onek = yolKoleksiyon(kol);
    const al = async () => {
      const d = await hazir();
      // Çakışma kopyaları (.catisma-...) belge sayılmaz
      const rows = (await d.list(onek)).filter((r) => r.kind === "file" && /^[^/]+\.json$/.test(r.path.slice(onek.length)));
      let docs = [];
      for (const r of rows) {
        const veri = await d.readJson(r.path);
        if (veri != null) docs.push(belgeSnap(r.path.slice(onek.length, -5), veri));
      }
      if (sec.alan) {
        const yon = sec.yon === "desc" ? -1 : 1;
        docs.sort((a, b) => {
          const x = a.data()[sec.alan], y = b.data()[sec.alan];
          return (x < y ? -1 : x > y ? 1 : 0) * yon;
        });
      }
      if (sec.sinir) docs = docs.slice(0, sec.sinir);
      return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false }, docChanges: () => [] };
    };
    return {
      orderBy: (alan, yon) => sorgu(kol, Object.assign({}, sec, { alan, yon })),
      limit: (sinir) => sorgu(kol, Object.assign({}, sec, { sinir })),
      get: al,
      onSnapshot(f, hata) {
        return dinle({ al, f, hata, ilgili: (p) => p.startsWith(onek) || p === KOK });
      },
      doc: (id) => belge(`${kol}/${id || rastgele(20)}`),
      async add(v) {
        const b = belge(`${kol}/${rastgele(20)}`);
        await b.set(v);
        return b;
      },
    };
  }

  const db = { doc: belge, collection: (kol) => sorgu(kol) };

  // Başka cihazdan gelen değişiklik, açık ekranlara yansır
  ExBoot.onChanged((yollar) => {
    const benim = yollar.filter((p) => p.startsWith(KOK));
    if (benim.length) yay(benim);
  });

  // ---------------------------------------------------------------- dosya deposu (arşiv)
  const DOSYA = `${KOK}dosyalar/`;
  const UZANTI = { "application/pdf": "pdf" };
  const AZAMI_DEPO = 1024 * 1024 * 1024; // GitHub'ın önerdiği depo boyutu

  async function dosyaBul(id) {
    const d = await hazir();
    return { d, kayit: (await d.list(DOSYA)).find((r) => r.path.slice(DOSYA.length).split(".")[0] === id) || null };
  }

  const assets = {
    async upload(blob, op) {
      const d = await hazir();
      const tur = (op && op.type) || blob.type || "application/octet-stream";
      const id = rastgele(32);
      const bayt = new Uint8Array(await blob.arrayBuffer());
      await d.write(`${DOSYA}${id}.${UZANTI[tur] || "bin"}`, bayt);
      return { id, url: `/_blob/${id}`, sizeBytes: bayt.length, contentType: tur };
    },
    async list() {
      const rows = (await (await hazir()).list(DOSYA)).filter((r) => r.kind === "file");
      const bytes = rows.reduce((n, r) => n + (r.size || 0), 0);
      return {
        assets: rows.map((r) => ({ id: r.path.slice(DOSYA.length).split(".")[0], url: `/_blob/${r.path.slice(DOSYA.length)}`, sizeBytes: r.size || 0 })),
        usage: { files: rows.length, bytes, maxFiles: 5000, maxBytes: AZAMI_DEPO },
      };
    },
    async delete(id) {
      const { d, kayit } = await dosyaBul(id);
      return { deleted: kayit ? (await d.remove(kayit.path)) > 0 : false };
    },
    /** Dosyanın baytları; bu cihaza inmemişse depodan indirilir. */
    async oku(id) {
      const { d, kayit } = await dosyaBul(id);
      if (!kayit) throw new Error("dosya arşivde bulunamadı");
      return (await d.read(kayit.path)).bytes;
    },
  };

  // ---------------------------------------------------------------- kullanıcı
  const KIM_ANAHTAR = "electricx_kim";

  async function kim() {
    const { mode, repo, token } = ExBoot.settings();
    if (mode !== "github") return null;
    try {
      const k = JSON.parse(localStorage.getItem(KIM_ANAHTAR));
      if (k && k.login) return k;
    } catch (e) { /* ilk açılış */ }
    // Açılış ağa takılmasın: GitHub geç cevap verirse kimlik sonraki açılışta öğrenilir
    const bulunan = await Promise.race([
      ExGitHub.createRemote({ repo, token }).whoami(),
      new Promise((r) => setTimeout(() => r(null), 2500)),
    ]);
    if (bulunan && bulunan.login) {
      try { localStorage.setItem(KIM_ANAHTAR, JSON.stringify(bulunan)); } catch (e) { /* depolama kapalı */ }
    }
    return bulunan;
  }

  const user = {
    async me() {
      const k = await kim();
      return { id: k ? k.login : null, name: k ? k.name : "", isOwner: true, canEdit: true };
    },
    async profiles(idler) {
      const o = {};
      // u_ ile başlayan kimlikler claude.ai'den taşınan kayıtlardır, adları burada bilinmez
      for (const id of [].concat(idler)) o[id] = { id, name: /^u_/.test(id) ? "" : id };
      return o;
    },
    async id() {
      const k = await kim();
      return k ? k.login : null;
    },
  };

  // ---------------------------------------------------------------- bulut.js'in beklediği arayüz
  const yetenekler = { db, assets, user };
  window.claude = { use: async (ad) => yetenekler[ad] || null };
})();
