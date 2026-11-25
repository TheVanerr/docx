/* DOCX kabuğu: bütün uygulamalar tek pencerede. Solda uygulama çubuğu, sağda uygulamalar.
   Her uygulama kendi çerçevesinde (iframe) açılır ve açık kalır: uygulamalar arasında geçince durum kaybolmaz.
   Adres: #<uygulama> (ör. #bomx); #ana ya da boş: ana ekran. Geri / ileri tuşları çalışır.
   Yollar depo kökünden; yayın sitesi de aynı düzendedir (araclar/site-hazirla.mjs), bu yüzden aynı dosya
   hem bilgisayarda (index.html'e çift tık) hem web adresinde çalışır.
   Dosyadan (file://) açılışta tarayıcı, çerçevedeki programların klasör seçmesine izin vermez: klasörle çalışan
   uygulamalar (DocumentX, SoftwareX) bu durumda ayrı pencerede açılır. Web adresinde bu kısıt yoktur. */
(function () {
  'use strict';

  const DOSYADAN = location.protocol === 'file:';
  const SON_ANAHTARI = 'docx_kabuk_son';
  const $ = (id) => document.getElementById(id);

  const UYGULAMALAR = [
    { id: 'documentx', ad: 'DocumentX', kisa: 'Kılavuz', grup: 'Doküman', aciklama: 'Kullanım kılavuzu. Kılavuzlar bilgisayardaki DocumentX klasöründen açılır.',
      yol: 'apps/documentx/codes/index.html', simge: 'apps/documentx/codes/icon/documentx.png', klasor: true },
    { id: 'softwarex', ad: 'SoftwareX', kisa: 'Yazılım', grup: 'Doküman', aciklama: 'PLC/HMI yazılım dokümanları: teknik doküman, servis, kullanım bilgileri, denetim raporu.',
      yol: 'apps/softwarex/index.html', simge: 'apps/softwarex/simge.svg', klasor: true },
    { id: 'rax', ad: 'R&AX', kisa: 'Risk', grup: 'Doküman', aciklama: 'Risk analizi ve LVD test raporu.',
      yol: 'apps/rax/app/index.html', simge: 'apps/rax/app/assets/ikon.png' },
    { id: 'electricx', ad: 'ELECTRICX', kisa: 'Elektrik', grup: 'Mühendislik', aciklama: 'Pano malzeme listesi, pano etiketi ve şema çevirisi.',
      yol: 'apps/electricx/index.html', simge: 'apps/electricx/ortak/varliklar/ikon.svg' },
    { id: 'ppx', ad: 'P&PX', kisa: 'P&ID', grup: 'Mühendislik', aciklama: 'P&ID ve pnömatik çizimler.',
      yol: 'apps/ppx/index.html', simge: 'kabuk/simgeler/ppx.svg' },
    { id: 'layoutx', ad: 'LAYOUTX', kisa: 'Layout', grup: 'Mühendislik', aciklama: 'STEP modelinden makine yerleşim paftası.',
      yol: 'apps/layoutx/index.html', simge: 'apps/layoutx/app/icons/icon.svg' },
    { id: 'bomx', ad: 'BOMX', kisa: 'BOM', grup: 'Mühendislik', aciklama: 'Malzeme listesi: komponent kütüphanesi, projeler, revizyonlar.',
      yol: 'apps/bomx/index.html', simge: 'apps/bomx/assets/simge/simge-192.png' },
    { id: 'warrantyx', ad: 'WARRANTYX', kisa: 'Garanti', grup: 'Belge', aciklama: 'Garanti belgesi ve CE uygunluk beyanı.',
      yol: 'apps/warrantyx/index.html', simge: 'apps/warrantyx/assets/simge/simge-192.png' }
  ];
  const BUL = new Map(UYGULAMALAR.map((u) => [u.id, u]));
  const GRUPLAR = ['Doküman', 'Mühendislik', 'Belge'];

  const cerceveler = new Map(); // uygulama id → iframe
  const ayriAcilanlar = new Set(); // dosyadan açılışta "burada aç" denilenler
  let acik = 'ana';

  const tamAdres = (yol) => new URL(yol, location.href).href;

  /* ─── Çizim ────────────────────────────────────────────── */

  function simge(u, boyut) {
    const img = document.createElement('img');
    img.src = u.simge;
    img.alt = '';
    img.width = boyut;
    img.height = boyut;
    img.decoding = 'async';
    return img;
  }

  function cubuguCiz() {
    const ray = $('ray');
    for (const u of UYGULAMALAR) {
      const a = document.createElement('a');
      a.className = 'ray-ogesi';
      a.href = `#${u.id}`;
      a.dataset.uygulama = u.id;
      a.title = `${u.ad}: ${u.aciklama}`;
      a.appendChild(simge(u, 28));
      const s = document.createElement('span');
      s.textContent = u.kisa;
      a.appendChild(s);
      ray.appendChild(a);
    }
  }

  function anaEkraniCiz() {
    const kap = $('gruplar');
    for (const grup of GRUPLAR) {
      const h = document.createElement('h2');
      h.textContent = grup;
      kap.appendChild(h);
      const izgara = document.createElement('div');
      izgara.className = 'kartlar';
      for (const u of UYGULAMALAR.filter((x) => x.grup === grup)) {
        const a = document.createElement('a');
        a.className = 'kart';
        a.href = `#${u.id}`;
        a.appendChild(simge(u, 36));
        const m = document.createElement('div');
        const b = document.createElement('strong');
        b.textContent = u.ad;
        const p = document.createElement('span');
        p.textContent = u.aciklama;
        m.append(b, p);
        if (u.klasor) {
          const e = document.createElement('em');
          e.textContent = 'Bilgisayardaki klasörle çalışır';
          m.appendChild(e);
        }
        a.appendChild(m);
        izgara.appendChild(a);
      }
      kap.appendChild(izgara);
    }
    $('dosyaNotu').hidden = !DOSYADAN;
  }

  /* ─── Açma ─────────────────────────────────────────────── */

  function cerceveAc(u) {
    let f = cerceveler.get(u.id);
    if (!f) {
      f = document.createElement('iframe');
      f.title = u.ad;
      f.src = u.yol;
      f.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen');
      $('sahne').appendChild(f);
      cerceveler.set(u.id, f);
    }
    return f;
  }

  function ac(id) {
    const u = BUL.get(id) || null;
    acik = u ? u.id : 'ana';
    const klasorUyarisi = !!(u && u.klasor && DOSYADAN && !ayriAcilanlar.has(u.id));

    $('ana').hidden = !!u;
    $('klasorPaneli').hidden = !klasorUyarisi;
    if (u && !klasorUyarisi) cerceveAc(u);
    for (const [k, f] of cerceveler) f.classList.toggle('acik', !!u && !klasorUyarisi && k === u.id);

    if (klasorUyarisi) {
      $('klasorAd').textContent = u.ad;
      $('klasorAyri').onclick = () => ayriPenceredeAc(u);
      $('klasorBurada').onclick = () => { ayriAcilanlar.add(u.id); ac(u.id); };
    }

    for (const a of $('ray').children) {
      if (a.dataset.uygulama === acik) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    $('yenile').disabled = !u || klasorUyarisi;
    $('ayri').disabled = !u;
    document.title = u ? `${u.ad} · DOCX` : 'DOCX';
    try { localStorage.setItem(SON_ANAHTARI, acik); } catch { /* yok sayılır */ }

    const f = u ? cerceveler.get(u.id) : null;
    if (f && !klasorUyarisi) { try { f.focus(); } catch { /* odak verilemedi */ } }
  }

  function rota() {
    let id = '';
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { /* bozuk adres */ }
    ac(BUL.has(id) ? id : 'ana');
  }

  /* ─── Düğmeler ─────────────────────────────────────────── */

  function acikAdres(u) {
    const f = cerceveler.get(u.id);
    if (f) {
      try {
        const href = f.contentWindow.location.href;
        if (href && href !== 'about:blank') return href;
      } catch { /* başka köken (dosyadan açılış): uygulamanın başlangıç adresi */ }
    }
    return tamAdres(u.yol);
  }

  function ayriPenceredeAc(u) {
    window.open(acikAdres(u), '_blank', 'noopener');
  }

  function yenile() {
    const f = cerceveler.get(acik);
    if (!f) return;
    try { f.contentWindow.location.reload(); } catch { f.src = BUL.get(acik).yol; }
  }

  let kurIstegi = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    kurIstegi = e;
    $('kur').hidden = false;
  });
  window.addEventListener('appinstalled', () => { $('kur').hidden = true; kurIstegi = null; });

  /* ─── Başlangıç ────────────────────────────────────────── */

  cubuguCiz();
  anaEkraniCiz();
  $('yenile').addEventListener('click', yenile);
  $('ayri').addEventListener('click', () => { const u = BUL.get(acik); if (u) ayriPenceredeAc(u); });
  $('kur').addEventListener('click', async () => {
    if (!kurIstegi) return;
    kurIstegi.prompt();
    try { await kurIstegi.userChoice; } catch { /* vazgeçildi */ }
    kurIstegi = null;
    $('kur').hidden = true;
  });
  window.addEventListener('hashchange', rota);
  rota();

  if (!DOSYADAN && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* çevrimdışı açılış olmaz, program çalışır */ });
  }

  // Testler için
  window.DocxKabuk = { UYGULAMALAR, ac, cerceveler };
})();
