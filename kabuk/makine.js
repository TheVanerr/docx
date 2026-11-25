/* DOCX Makine sayfası (#makine): seri numarasına göre makine kartları; karta tıklayınca makinenin belgeleri (#makine/<seri>),
   belgeye tıklayınca uygulaması o belgede açılır. Ayrı kayıt tutulmaz, belgeler uygulamaların kendi verisinden toplanır:
   - BOMX, P&PX, ELECTRICX, LAYOUTX, WARRANTYX: bu tarayıcıdaki veritabanı (IndexedDB: uygulamanın bu cihazdaki kopyası,
     gönderilmemiş değişiklikler dahil) + uygulamanın bağlı olduğu GitHub deposu (uygulamanın kendi ayarındaki depo ve
     anahtarla, yalnız okuma: başka cihazda yapılan belgeler de görünür).
   - R&AX: GitHub deposu ya da bilgisayardaki klasör (uygulamanın seçtiği klasör; tarayıcı izin isteyebilir).
   - DocumentX: bilgisayardaki DocumentX klasörü (projects/ altındaki proje klasörleri; izin gerekebilir).
   Hiçbir uygulamanın verisine yazılmaz; var olmayan veritabanı oluşturulmaz. Yol kuralları: kabuk/makine-cekirdek.js */
(function () {
  'use strict';

  const C = window.DocxMakineCekirdek;
  const $ = (id) => document.getElementById(id);
  const DEPO_ESKIME_MS = 2 * 60 * 1000; // sayfaya dönüldüğünde depo en çok bu sıklıkla yeniden okunur
  const ZAMAN_ASIMI_MS = 30000;
  const ICERIK_SINIRI = 512 * 1024;

  const KAYNAKLAR = [
    { uygulama: 'bomx', ayar: 'bomx_ayarlar', vt: 'bomx-veri' },
    { uygulama: 'ppx', ayar: 'ppx_ayarlar', vt: 'ppx-veri' },
    { uygulama: 'rax', ayar: 'ra_ayarlar', klasor: { vt: 'risk-analizi', depo: 'kv', anahtar: 'root-handle' } },
    { uygulama: 'electricx', ayar: 'electricx_ayarlar', vt: 'electricx-veri' },
    { uygulama: 'layoutx', vt: 'layoutx-veri', metaAyar: 'db' },
    { uygulama: 'warrantyx', ayar: 'wx_ayarlar', vt: 'warrantyx-veri' },
    { uygulama: 'documentx', klasor: { vt: 'documentx', depo: 'handles', anahtar: 'workspace' } }
  ];
  const KAYNAK = new Map(KAYNAKLAR.map((k) => [k.uygulama, k]));

  const durumlar = new Map(KAYNAKLAR.map((k) => [k.uygulama, {
    yerel: null, // Map yol → { silindi, bekliyor, tabanli, zaman, icerik } (bu cihaz) · null: yok
    uzak: null, // Map yol → { sha, boyut } (depo) · null: okunmadı
    uzakDepo: '',
    uzakZaman: 0,
    depo: '', // bağlı depo (kullanici/depo)
    klasor: '', // 'var' | 'izin' | ''
    tutamak: null, // izin bekleyen klasör
    hata: '',
    okunuyor: false
  }]));

  let kabuk = null; // { uygulamalar: Map id → { ad, simge }, belgeAc(id, ac) } — kabuk.js verir
  let makineler = [];
  let taranmis = false;
  let tarama = null;
  let gorunen = null; // null: liste · '<seri>': makinenin belgeleri
  const tercih = { sira: 'son', ara: '' };
  try { tercih.sira = localStorage.getItem('docx_makine_sira') === 'seri' ? 'seri' : 'son'; } catch (e) { /* varsayılan */ }

  /* ─── Yardımcılar ──────────────────────────────────────── */

  const istek = (r) => new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

  function ayarOku(anahtar) {
    try { return JSON.parse(localStorage.getItem(anahtar)) || {}; } catch (e) { return {}; }
  }

  function el(etiket, sinif, metin) {
    const e = document.createElement(etiket);
    if (sinif) e.className = sinif;
    if (metin !== undefined && metin !== null) e.textContent = metin;
    return e;
  }

  function jsonOku(bytes) {
    try {
      if (!bytes || (bytes.byteLength || 0) > ICERIK_SINIRI) return null;
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) {
      return null;
    }
  }

  const tarihYaz = (ms) => new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  /* ─── Bu cihaz: IndexedDB ──────────────────────────────── */

  /** Uygulamanın veritabanı; yoksa null. Sürümsüz açılışta "upgradeneeded" yalnız veritabanı yoksa gelir:
      iptal edilir, uygulamanın daha sonra kuracağı veritabanı boş hâliyle oluşmaz. */
  function vtAc(ad) {
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open(ad); } catch (e) { resolve(null); return; }
      req.onupgradeneeded = () => { try { req.transaction.abort(); } catch (e) { /* zaten iptal */ } };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close(); // uygulama sürüm yükseltirken bekletilmez
        resolve(db);
      };
      req.onerror = () => resolve(null);
    });
  }

  /** Belge yolları ve durumları; yalnız kurallara uyan kayıtlar okunur (fotoğraflar, kütüphane vb. okunmaz) */
  async function yerelOku(k) {
    const db = await vtAc(k.vt);
    if (!db) return { yerel: null, meta: null };
    try {
      if (!db.objectStoreNames.contains('files')) return { yerel: null, meta: null };
      const metaVar = !!k.metaAyar && db.objectStoreNames.contains('meta');
      const tx = db.transaction(metaVar ? ['files', 'meta'] : ['files'], 'readonly');
      const metaIstegi = metaVar ? istek(tx.objectStore('meta').get(k.metaAyar)) : Promise.resolve(null);
      const files = tx.objectStore('files');
      const yollar = (await istek(files.getAllKeys())).filter((y) => typeof y === 'string' && C.eslestir(k.uygulama, y));
      const kayitlar = await Promise.all(yollar.map((y) => istek(files.get(y))));
      const meta = (await metaIstegi) || null;
      const yerel = new Map();
      // LAYOUTX: kayıtta durum alanı yok; eşitlenen hâller veritabanı ayarında (base: yol → dosya kimliği)
      const taban = meta && meta.base && typeof meta.base === 'object' ? meta.base : null;
      yollar.forEach((yol, i) => {
        const r = kayitlar[i];
        if (!r || r.kind === 'dir') return;
        const silindi = r.kind === 'deleted';
        const bilgi = {
          silindi,
          bekliyor: taban ? taban[yol] !== r.sha : !!r.dirty,
          tabanli: taban ? !!taban[yol] : !!r.base,
          zaman: Number(r.at || r.mtime) || 0,
          icerik: !silindi && C.icerikOkunur(k.uygulama, yol) ? jsonOku(r.bytes) : null
        };
        yerel.set(yol, bilgi);
      });
      if (taban) {
        // Bu cihazda silinip silmesi gönderilmemiş dosya: kaydı yok, eşitlenmiş hâli var
        for (const yol of Object.keys(taban)) if (!yerel.has(yol) && C.eslestir(k.uygulama, yol)) yerel.set(yol, { silindi: true });
      }
      return { yerel, meta };
    } catch (e) {
      return { yerel: null, meta: null, hata: e };
    } finally {
      db.close();
    }
  }

  async function yerelBayt(vtAdi, yol) {
    const db = await vtAc(vtAdi);
    if (!db) return null;
    try {
      const depo = db.objectStoreNames.contains('bytes') ? 'bytes' : 'files';
      const v = await istek(db.transaction(depo, 'readonly').objectStore(depo).get(yol));
      const b = depo === 'bytes' ? v : v && v.kind === 'file' ? v.bytes : null;
      return b && b.byteLength ? b : null;
    } catch (e) {
      return null;
    } finally {
      db.close();
    }
  }

  /* ─── Depo: GitHub (uygulamanın kendi bağlantı ayarıyla, yalnız okuma) ── */

  const yerelSunucu = (a) => (typeof a === 'string' && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(a) ? a : '');

  /** API adresi: GitHub; yalnız bu bilgisayardaki test sunucusuna (127.0.0.1) yönlendirilebilir */
  function apiAdresi(k, s) {
    let test = '';
    try {
      test = yerelSunucu(localStorage.getItem('docx-github-api')) ||
        (k.uygulama === 'layoutx' ? yerelSunucu(localStorage.getItem('layoutx-github-api')) : '');
    } catch (e) { /* tarayıcı depolaması kapalı */ }
    return test || yerelSunucu(s && s.api) || 'https://api.github.com';
  }

  function depoAyari(k, meta) {
    if (k.ayar) {
      const s = ayarOku(k.ayar);
      if (s.mode !== 'github' || !s.repo || !s.token) return null;
      return { repo: String(s.repo), token: String(s.token), api: apiAdresi(k, s) };
    }
    if (k.metaAyar && meta && meta.repo && meta.token) return { repo: String(meta.repo), token: String(meta.token), api: apiAdresi(k, null) };
    return null;
  }

  async function gh(url, token) {
    const ctrl = new AbortController();
    const zaman = setTimeout(() => ctrl.abort(), ZAMAN_ASIMI_MS);
    let res;
    try {
      res = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
        signal: ctrl.signal
      });
    } catch (e) {
      throw new Error(ctrl.signal.aborted ? 'GitHub zamanında yanıt vermedi' : 'İnternet bağlantısı yok');
    } finally {
      clearTimeout(zaman);
    }
    if (res.status === 409) return null; // boş depo
    if (!res.ok) {
      let ileti = '';
      try { ileti = (await res.json()).message || ''; } catch (e) { /* gövde JSON değil */ }
      if (res.status === 401) throw new Error('Erişim anahtarı geçersiz ya da süresi dolmuş');
      if ((res.status === 403 || res.status === 429) && /rate limit/i.test(ileti)) throw new Error('GitHub hız sınırı, biraz sonra yeniden deneyin');
      if (res.status === 403) throw new Error('Anahtarın bu depoyu okuma izni yok');
      if (res.status === 404) throw new Error('Depo bulunamadı ya da anahtarın erişimi yok');
      throw new Error(`GitHub hatası ${res.status}${ileti ? `: ${ileti}` : ''}`);
    }
    return res.json();
  }

  const depoKoku = (d) => {
    const [sahip, ad] = d.repo.split('/');
    return `${d.api}/repos/${encodeURIComponent(sahip || '')}/${encodeURIComponent(ad || '')}`;
  };

  /** Depodaki belge yolları (varsayılan dalın son hâli) */
  async function depoOku(k, d) {
    const kok = depoKoku(d);
    const bilgi = await gh(kok, d.token);
    const dal = (bilgi && bilgi.default_branch) || 'main';
    const agac = await gh(`${kok}/git/trees/${encodeURIComponent(dal)}?recursive=1`, d.token);
    const yollar = new Map();
    for (const e of (agac && agac.tree) || []) {
      if (e.type === 'blob' && C.eslestir(k.uygulama, e.path)) yollar.set(e.path, { sha: e.sha, boyut: e.size || 0 });
    }
    return yollar;
  }

  async function depoBayt(d, sha) {
    const v = await gh(`${depoKoku(d)}/git/blobs/${encodeURIComponent(sha)}`, d.token);
    const ikili = atob(String((v && v.content) || '').replace(/\s/g, ''));
    const out = new Uint8Array(ikili.length);
    for (let i = 0; i < ikili.length; i += 1) out[i] = ikili.charCodeAt(i);
    return out;
  }

  /* ─── Bilgisayardaki klasör (DocumentX, klasörle çalışan R&AX) ── */

  async function tutamakOku(kl) {
    const db = await vtAc(kl.vt);
    if (!db) return null;
    try {
      if (!db.objectStoreNames.contains(kl.depo)) return null;
      const h = await istek(db.transaction(kl.depo, 'readonly').objectStore(kl.depo).get(kl.anahtar));
      return h && typeof h.queryPermission === 'function' && h.kind === 'directory' ? h : null;
    } catch (e) {
      return null;
    } finally {
      db.close();
    }
  }

  async function alt(h, ad) {
    try { return await h.getDirectoryHandle(ad); } catch (e) { return null; }
  }

  async function icindekiler(h, tur) {
    const out = [];
    for await (const [ad, c] of h.entries()) if (c.kind === tur && !ad.startsWith('.')) out.push([ad, c]);
    return out;
  }

  /** DocumentX: seçilen klasör veri klasörü değilse içindeki (web/connect.js > dataFolder ile aynı kural);
      proje = projects/ altında .yaml dosyası olan klasör (web/backend.js > scanProjects) */
  async function documentxTara(h) {
    let kok = h;
    if (!(await alt(kok, 'projects'))) {
      const adaylar = [];
      for (const [, c] of await icindekiler(h, 'directory')) if (await alt(c, 'projects')) adaylar.push(c);
      kok = adaylar.length === 1 ? adaylar[0] : adaylar.find((c) => /^documentx$/i.test(c.name)) || null;
    }
    const projects = kok && (await alt(kok, 'projects'));
    const yerel = new Map();
    if (!projects) return yerel;
    for (const [ad, c] of await icindekiler(projects, 'directory')) {
      const yol = `projects/${ad}/`;
      if (ad.toLowerCase() === 'backup' || !C.eslestir('documentx', yol)) continue;
      const yaml = (await icindekiler(c, 'file')).some(([n]) => /\.ya?ml$/i.test(n));
      if (yaml) yerel.set(yol, { tabanli: false });
    }
    return yerel;
  }

  /** R&AX klasörü: projects/<proje>, lvd/<rapor>, models/<aile>/(<model>/)raporlar/<rapor> (app/js/app.js > scan) */
  async function raxTara(h) {
    const yerel = new Map();
    const ekle = (yol) => { if (C.eslestir('rax', yol)) yerel.set(yol, { tabanli: false }); };
    const ilkMd = async (d) => {
      const md = (await icindekiler(d, 'file')).find(([n]) => /\.md$/i.test(n));
      return md ? md[0] : null;
    };
    const projects = await alt(h, 'projects');
    if (projects) {
      for (const [ad, c] of await icindekiler(projects, 'directory')) {
        const md = await ilkMd(c);
        if (md) ekle(`projects/${ad}/${md}`);
      }
    }
    const lvd = await alt(h, 'lvd');
    if (lvd) {
      for (const [ad, c] of await icindekiler(lvd, 'directory')) {
        try { await c.getFileHandle('lvd.md'); ekle(`lvd/${ad}/lvd.md`); } catch (e) { /* rapor yok */ }
      }
    }
    const models = await alt(h, 'models');
    if (models) {
      for (const [aile, a] of await icindekiler(models, 'directory')) {
        const raporlar = [];
        for (const [ad, s] of await icindekiler(a, 'directory')) {
          if (ad === 'raporlar') raporlar.push([`models/${aile}/raporlar`, s]);
          else {
            const r = await alt(s, 'raporlar');
            if (r) raporlar.push([`models/${aile}/${ad}/raporlar`, r]);
          }
        }
        for (const [onek, r] of raporlar) {
          for (const [ad, c] of await icindekiler(r, 'directory')) {
            const md = await ilkMd(c);
            if (md) ekle(`${onek}/${ad}/${md}`);
          }
        }
      }
    }
    return yerel;
  }

  /** @returns { yerel, klasor: 'var' | 'izin' | '', tutamak, hata } */
  async function klasorTara(k, h) {
    const out = { yerel: null, klasor: '', tutamak: null, hata: '' };
    if (!h) return out;
    let izin = 'prompt';
    try { izin = await h.queryPermission({ mode: 'read' }); } catch (e) { /* desteklenmiyor */ }
    if (izin !== 'granted') return Object.assign(out, { klasor: 'izin', tutamak: h });
    try {
      out.yerel = k.uygulama === 'documentx' ? await documentxTara(h) : await raxTara(h);
      out.klasor = 'var';
    } catch (e) {
      out.hata = `Klasör okunamadı: ${e.message || e}`;
    }
    return out;
  }

  /* ─── Tarama ───────────────────────────────────────────── */

  /** Kaynağın yeni hâli önce ayrı toplanır, sonunda bir kerede yazılır: yeniden okurken belgeler ekrandan gidip gelmez */
  async function kaynakTara(k, depoda) {
    const d = durumlar.get(k.uygulama);
    d.okunuyor = true;
    ciz();
    try {
      const yeni = { yerel: null, klasor: '', tutamak: null, hata: '', hataYeri: '' };
      let meta = null;
      if (k.vt) {
        const r = await yerelOku(k);
        yeni.yerel = r.yerel;
        meta = r.meta;
        if (r.hata) Object.assign(yeni, { hata: 'Bu cihazdaki veritabanı okunamadı', hataYeri: 'yerel' });
      }
      const ayar = k.ayar ? ayarOku(k.ayar) : {};
      // R&AX klasörle çalışıyorsa (ayar: klasor) depo yerine klasör okunur
      if (k.klasor && (!k.ayar || ayar.mode === 'klasor')) {
        const r = await klasorTara(k, await tutamakOku(k.klasor));
        Object.assign(yeni, { yerel: r.yerel || yeni.yerel, klasor: r.klasor, tutamak: r.tutamak });
        if (r.hata) Object.assign(yeni, { hata: r.hata, hataYeri: 'klasor' });
      }
      const dep = depoAyari(k, meta);
      let uzak = dep && d.uzakDepo === dep.repo ? d.uzak : null;
      let uzakZaman = uzak ? d.uzakZaman : 0;
      if (dep && (depoda || !uzak || Date.now() - uzakZaman > DEPO_ESKIME_MS)) {
        try {
          uzak = await depoOku(k, dep);
          uzakZaman = Date.now();
        } catch (e) {
          Object.assign(yeni, { hata: e.message || String(e), hataYeri: 'depo' });
        }
      }
      Object.assign(d, yeni, { depo: dep ? dep.repo : '', uzak, uzakZaman, uzakDepo: dep ? dep.repo : '' });
    } finally {
      d.okunuyor = false;
      hesapla();
      ciz();
    }
  }

  function hesapla() {
    const kayitlar = [];
    for (const k of KAYNAKLAR) {
      const d = durumlar.get(k.uygulama);
      kayitlar.push(...C.birlestir(k.uygulama, d.yerel, d.uzak));
    }
    makineler = C.topla(kayitlar);
  }

  /** depoda: depolar yeniden okunur (Yenile); değilse yalnız eskimişse */
  function tara(depoda) {
    if (tarama) return tarama;
    tarama = Promise.all(KAYNAKLAR.map((k) => kaynakTara(k, depoda).catch(() => {}))).then(() => {
      taranmis = true;
      tarama = null;
      ciz();
    });
    ciz();
    return tarama;
  }

  /* ─── Çizim ────────────────────────────────────────────── */

  let cizimIstegi = 0;
  function ciz() {
    if (cizimIstegi) return;
    cizimIstegi = requestAnimationFrame(() => {
      cizimIstegi = 0;
      if (!$('makine').hidden) cizHemen();
    });
  }

  function uygulamaBilgisi(id) {
    return (kabuk && kabuk.uygulamalar.get(id)) || { ad: id, simge: '' };
  }

  function simgeImg(id, boyut) {
    const img = el('img');
    img.src = uygulamaBilgisi(id).simge;
    img.alt = '';
    img.width = boyut;
    img.height = boyut;
    img.decoding = 'async';
    return img;
  }

  function kaynaklariCiz() {
    const kap = $('mkKaynaklar');
    kap.replaceChildren();
    const sayilar = new Map();
    for (const m of makineler) for (const b of m.belgeler) sayilar.set(b.uygulama, (sayilar.get(b.uygulama) || 0) + 1);
    for (const k of KAYNAKLAR) {
      const d = durumlar.get(k.uygulama);
      const ad = uygulamaBilgisi(k.uygulama).ad;
      const kullanildi = !!(d.yerel || d.depo || d.klasor);
      const c = el(d.klasor === 'izin' ? 'button' : 'span', 'cip mk-kaynak');
      c.appendChild(simgeImg(k.uygulama, 14));
      let metin;
      const ipucu = [];
      if (d.depo) ipucu.push(`Depo: ${d.depo}`);
      if (d.yerel && k.vt) ipucu.push('Bu cihazdaki kopya');
      if (d.klasor === 'var') ipucu.push('Bilgisayardaki klasör');
      // Yeniden okurken sayı yerinde kalır (çerçeve kesikli): sayfaya her gelişte yazılar yanıp sönmez
      if (d.okunuyor) c.classList.add('okunuyor');
      if (d.okunuyor && !taranmis) {
        metin = `${ad} · okunuyor…`;
      } else if (d.klasor === 'izin') {
        metin = `${ad} · klasöre izin verin`;
        c.type = 'button';
        c.classList.add('uyari');
        ipucu.unshift('Tarayıcı bu klasörü okumak için izin istiyor. Tıklayın.');
        c.addEventListener('click', () => izinIste(k));
      } else if (!kullanildi) {
        metin = `${ad} · bu tarayıcıda kullanılmamış`;
        c.classList.add('soluk');
        ipucu.push(k.klasor && !k.vt ? 'Uygulamayı açıp klasörünü seçin.' : 'Uygulamayı açıp veritabanına bağlayın.');
      } else {
        metin = `${ad} · ${sayilar.get(k.uygulama) || 0} belge`;
        if (d.hata) {
          c.classList.add('uyari');
          metin += { depo: ' · depo okunamadı', klasor: ' · klasör okunamadı', yerel: ' · bu cihazdaki kopya okunamadı' }[d.hataYeri] || ' · okunamadı';
          ipucu.push(d.hata);
        }
      }
      if (d.hata && !kullanildi) ipucu.push(d.hata);
      c.appendChild(document.createTextNode(metin));
      c.title = ipucu.join('\n');
      kap.appendChild(c);
    }
  }

  function makineKarti(m) {
    const a = el('a', 'mk-kart');
    a.href = `#makine/${m.seri}`;
    a.dataset.seri = m.seri;
    a.appendChild(el('div', 'mk-seri', m.seri));
    a.appendChild(el('div', 'mk-model', m.model || 'Model yazılmamış'));
    if (!m.model) a.lastChild.classList.add('soluk');
    a.appendChild(el('div', 'mk-firma', m.firma || ' '));
    const turler = el('div', 'mk-turler');
    for (const t of C.TURLER) {
      if (!m.turler.includes(t.id)) continue;
      const s = el('span', 'mk-tur', t.kisa);
      s.title = t.ad;
      turler.appendChild(s);
    }
    a.appendChild(turler);
    const alt = el('div', 'mk-kart-alt', `${m.belgeler.length} belge`);
    if (m.bekleyen) alt.appendChild(el('span', 'mk-bekleyen', ` · ${m.bekleyen} gönderilmedi`));
    if (m.son) alt.appendChild(el('span', 'mk-zaman', tarihYaz(m.son)));
    a.appendChild(alt);
    return a;
  }

  function listeyiCiz() {
    const kap = $('mkListe');
    kap.replaceChildren();
    const liste = C.sirala(C.ara(makineler, tercih.ara), tercih.sira);
    $('mkSayi').textContent = makineler.length ? (tercih.ara ? `${liste.length} / ${makineler.length} makine` : `${makineler.length} makine`) : '';
    if (!liste.length) {
      const bos = el('div', 'panel mk-bos');
      if (!taranmis || tarama) {
        bos.textContent = 'Belgeler okunuyor…';
      } else if (makineler.length) {
        bos.textContent = `"${tercih.ara}" ile eşleşen makine yok.`;
      } else {
        bos.appendChild(el('strong', '', 'Henüz seri numaralı belge yok.'));
        bos.appendChild(el('p', '', 'Uygulamalarda seri numarasıyla başlayan bir proje açtığınızda (ör. "1234567-FİRMA-MODEL") makine kartı burada kendiliğinden oluşur. ' +
          'Uygulamaların bu tarayıcıda veritabanına bağlı olması gerekir; durumları yukarıda.'));
      }
      kap.appendChild(bos);
      return;
    }
    const izgara = el('div', 'mk-kartlar');
    for (const m of liste) izgara.appendChild(makineKarti(m));
    kap.appendChild(izgara);
  }

  function belgeKarti(b) {
    const t = C.TUR.get(b.tur);
    const u = uygulamaBilgisi(b.uygulama);
    const k = el('button', 'mk-belge');
    k.type = 'button';
    k.dataset.belge = b.id;
    k.appendChild(simgeImg(b.uygulama, 34));
    const m = el('div', 'mk-belge-metin');
    m.appendChild(el('strong', '', t.ad));
    m.appendChild(el('span', 'mk-belge-yer', `${u.ad} · ${b.ad}`));
    const durum = el('div', 'mk-belge-durum');
    if (b.bekliyor) {
      const c = el('em', 'cip uyari', 'Depoya gönderilmedi');
      c.title = 'Bu cihazda değişti; uygulama açıkken kendiliğinden gönderilir.';
      durum.appendChild(c);
    } else if (b.uzak && !b.yerel && KAYNAK.get(b.uygulama).vt && durumlar.get(b.uygulama).yerel) {
      const c = el('em', 'cip', 'Bu cihaza inmedi');
      c.title = 'Depoda var; uygulama açılınca bu cihaza iner.';
      durum.appendChild(c);
    }
    if (b.zaman) durum.appendChild(el('span', 'mk-zaman', tarihYaz(b.zaman)));
    if (b.ac.pdf) durum.appendChild(el('span', 'mk-ipucu', 'PDF yeni sekmede açılır'));
    if (durum.childNodes.length) m.appendChild(durum);
    k.appendChild(m);
    k.title = `${t.ad} · ${u.ad}\n${b.dosyalar.map((f) => f.yol).join('\n')}`;
    k.addEventListener('click', () => belgeyiAc(b));
    return k;
  }

  function detayiCiz(seri) {
    const kap = $('mkDetay');
    kap.replaceChildren();
    const m = makineler.find((x) => x.seri === seri);
    const geri = el('a', 'mk-geri', '← Makineler');
    geri.href = '#makine';
    kap.appendChild(geri);
    if (!m) {
      kap.appendChild(el('h1', 'mk-baslik', seri));
      kap.appendChild(el('div', 'panel mk-bos', !taranmis || tarama ? 'Belgeler okunuyor…' : 'Bu seri numarasıyla belge bulunamadı.'));
      return;
    }
    const bas = el('div', 'mk-detay-bas');
    bas.appendChild(el('h1', 'mk-baslik', m.seri));
    const alt = el('div', 'mk-detay-alt');
    alt.appendChild(el('strong', '', m.model || 'Model yazılmamış'));
    if (m.firma) alt.appendChild(el('span', '', m.firma));
    alt.appendChild(el('span', 'soluk', `${m.belgeler.length} belge`));
    bas.appendChild(alt);
    kap.appendChild(bas);
    for (const grup of C.GRUPLAR) {
      const belgeler = m.belgeler.filter((b) => C.TUR.get(b.tur).grup === grup);
      if (!belgeler.length) continue;
      kap.appendChild(el('h2', '', grup));
      const izgara = el('div', 'mk-belgeler');
      for (const b of belgeler) izgara.appendChild(belgeKarti(b));
      kap.appendChild(izgara);
    }
    const eksik = C.TURLER.filter((t) => !m.turler.includes(t.id));
    if (eksik.length) {
      const p = el('p', 'mk-eksik');
      p.appendChild(el('span', '', 'Bu makinede henüz yok: '));
      p.appendChild(document.createTextNode(eksik.map((t) => t.ad).join(' · ')));
      kap.appendChild(p);
    }
  }

  /* Liste ve belge kartları yalnız gösterilen şey değişince yeniden çizilir: yeniden okuma sürerken tıklanan kart
     elin altından gitmez. Kaynak durumları her seferinde çizilir. */
  let sonImza = '';
  function cizHemen() {
    kaynaklariCiz();
    $('mkYenile').disabled = !!tarama;
    $('mkListeAlani').hidden = gorunen !== null;
    $('mkDetay').hidden = gorunen === null;
    const m = gorunen === null ? null : makineler.find((x) => x.seri === gorunen);
    // Boş liste ve bulunamayan makinede mesaj okumanın bitip bitmediğine bağlı
    const bos = gorunen === null ? !makineler.length : !m;
    const imza = JSON.stringify([gorunen, tercih.ara, tercih.sira, bos && taranmis && !tarama,
      makineler.map((x) => [x.seri, x.model, x.firma, x.son, x.belgeler.map((b) => [b.id, b.bekliyor, b.yerel, b.uzak, b.zaman])])]);
    if (imza !== sonImza) {
      sonImza = imza;
      if (gorunen === null) listeyiCiz();
      else detayiCiz(gorunen);
    }
    document.title = gorunen === null ? 'Makine · DOCX' : `${gorunen}${m && m.model ? ` · ${m.model}` : ''} · DOCX`;
  }

  /* ─── Eylemler ─────────────────────────────────────────── */

  let bildirimZamani = 0;
  function bildir(metin) {
    const b = $('mkBildirim');
    b.textContent = metin;
    b.hidden = false;
    clearTimeout(bildirimZamani);
    bildirimZamani = setTimeout(() => { b.hidden = true; }, 6000);
  }

  async function izinIste(k) {
    const d = durumlar.get(k.uygulama);
    if (!d.tutamak) return;
    try {
      const izin = await d.tutamak.requestPermission({ mode: 'read' });
      if (izin !== 'granted') {
        bildir('İzin verilmedi: bu klasördeki belgeler listelenmez.');
        return;
      }
    } catch (e) {
      bildir(`İzin istenemedi: ${e.message || e}`);
      return;
    }
    await kaynakTara(k, false);
  }

  async function pdfAc(b) {
    // Pencere tıklama anında açılır (sonradan açılan pencereyi tarayıcı engeller); dosya inince içine yüklenir
    const w = window.open('', '_blank');
    try {
      const dosya = b.dosyalar[0];
      let bayt = await yerelBayt(KAYNAK.get(b.uygulama).vt, dosya.yol);
      if (!bayt) {
        const d = depoAyari(KAYNAK.get(b.uygulama), null);
        if (!d || !dosya.sha) throw new Error('Dosya bu cihazda yok ve depo okunamadı.');
        if (w) w.document.title = 'Dosya indiriliyor…';
        bayt = await depoBayt(d, dosya.sha);
      }
      const url = URL.createObjectURL(new Blob([bayt], { type: 'application/pdf' }));
      if (w && !w.closed) w.location.href = url;
      else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
    } catch (e) {
      if (w) w.close();
      bildir(`PDF açılamadı: ${e.message || e}`);
    }
  }

  function belgeyiAc(b) {
    if (b.ac.pdf) {
      pdfAc(b);
      return;
    }
    // DocumentX açılışta son kılavuzu açar (codes/state.js > prefGet('lastGuide'))
    if (b.ac.dx) { try { localStorage.setItem('dx.lastGuide', JSON.stringify(b.ac.dx)); } catch (e) { /* yok */ } }
    if (kabuk) kabuk.belgeAc(b.uygulama, b.ac);
  }

  /* ─── Kabuğa açılan yüz ────────────────────────────────── */

  /** giris: sayfaya başka bir yerden gelindi (uygulamadan, ana ekrandan). Liste ile makine arasında gezinmek değil. */
  function goster(seri, giris) {
    const yeni = /^[0-9]{7}$/.test(seri || '') ? seri : null;
    if (yeni !== gorunen) $('makine').scrollTop = 0;
    gorunen = yeni;
    // Sayfaya her gelişte bu cihazdaki kopyalar yeniden okunur (hızlı: uygulamada az önce yapılan belge de görünür);
    // depolar yalnız eskimişse (DEPO_ESKIME_MS)
    if (!tarama && (giris || !taranmis)) tara(false);
    cizHemen();
  }

  function kur(secenek) {
    kabuk = secenek;
    $('mkAra').value = tercih.ara;
    $('mkSira').value = tercih.sira;
    $('mkAra').addEventListener('input', () => {
      tercih.ara = $('mkAra').value;
      listeyiCiz();
    });
    $('mkSira').addEventListener('change', () => {
      tercih.sira = $('mkSira').value === 'seri' ? 'seri' : 'son';
      try { localStorage.setItem('docx_makine_sira', tercih.sira); } catch (e) { /* yok */ }
      listeyiCiz();
    });
    $('mkYenile').addEventListener('click', () => yenile());
  }

  function yenile() {
    return tara(true);
  }

  window.DocxMakine = {
    kur,
    goster,
    yenile,
    // Testler için
    durum: () => ({ makineler, durumlar, taranmis, taraniyor: !!tarama }),
    bekle: () => tarama || Promise.resolve()
  };
})();
