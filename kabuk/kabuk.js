/* DOCX kabuğu: bütün uygulamalar tek pencerede. Solda uygulama çubuğu, sağda uygulamalar.
   Her uygulama kendi çerçevesinde (iframe) açılır ve açık kalır: uygulamalar arasında geçince durum kaybolmaz.
   Adres: #<uygulama> (ör. #bomx); #ana ya da boş: ana ekran; #makine: makine kartları, #makine/<seri>: makinenin
   belgeleri (kabuk/makine.js). Geri / ileri tuşları çalışır.
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
      yol: 'apps/ppx/index.html', web: '/P-PX/', simge: 'kabuk/simgeler/ppx.svg' },
    { id: 'layoutx', ad: 'LAYOUTX', kisa: 'Layout', grup: 'Mühendislik', aciklama: 'STEP modelinden makine yerleşim paftası.',
      yol: 'apps/layoutx/index.html', simge: 'apps/layoutx/app/icons/icon.svg' },
    { id: 'bomx', ad: 'BOMX', kisa: 'BOM', grup: 'Mühendislik', aciklama: 'Malzeme listesi: komponent kütüphanesi, projeler, revizyonlar.',
      yol: 'apps/bomx/index.html', simge: 'apps/bomx/assets/simge/simge-192.png' },
    { id: 'warrantyx', ad: 'WARRANTYX', kisa: 'Garanti', grup: 'Belge', aciklama: 'Garanti belgesi ve CE uygunluk beyanı.',
      yol: 'apps/warrantyx/index.html', simge: 'apps/warrantyx/assets/simge/simge-192.png' }
  ];
  const BUL = new Map(UYGULAMALAR.map((u) => [u.id, u]));
  const GRUPLAR = ['Doküman', 'Mühendislik', 'Belge'];
  // Makine sayfası uygulama değildir (çerçevesi yok): çubuğun en üstünde, belgeleri seri numarasına göre gösterir
  const MAKINE = { id: 'makine', ad: 'Makineler', kisa: 'Makine', aciklama: 'Makine kartları: seri numarasına göre bütün belgeler (BOM, P&ID, pnömatik, risk analizi, pano, garanti…).',
    simge: 'kabuk/simgeler/makine.svg' };

  const cerceveler = new Map(); // uygulama id → iframe
  const ayriAcilanlar = new Set(); // dosyadan açılışta "burada aç" denilenler
  const bekleyenAdres = new Map(); // uygulama id → çerçevesi açılınca gidilecek belge adresi (makine sayfasından)
  let acik = 'ana';

  const tamAdres = (yol) => new URL(yol, location.href).href;

  /* GitHub Pages'te (github.io) web adresi ayrı olan uygulama oradan açılır: P&PX'in web sürümü kendi sitesindedir
     (giriş ekranı programı kendi deposunun kökünden indirir; program sayfası github.io'da doğrudan açılmaz, bkz.
     apps/ppx/ortak/ppx-boot.js). Bilgisayarda (dosyadan) ve başka sunucularda depodaki kopya açılır. */
  const GITHUB_PAGES = /\.github\.io$/i.test(location.hostname);
  const adresi = (u) => (GITHUB_PAGES && u.web) || u.yol;

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
    for (const u of [MAKINE, ...UYGULAMALAR]) {
      const a = document.createElement('a');
      a.className = u === MAKINE ? 'ray-ogesi ray-makine' : 'ray-ogesi';
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

  function kart(u) {
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
    return a;
  }

  function anaEkraniCiz() {
    const kap = $('gruplar');
    for (const [grup, liste] of [['Makine', [MAKINE]], ...GRUPLAR.map((g) => [g, UYGULAMALAR.filter((x) => x.grup === g)])]) {
      const h = document.createElement('h2');
      h.textContent = grup;
      kap.appendChild(h);
      const izgara = document.createElement('div');
      izgara.className = 'kartlar';
      for (const u of liste) izgara.appendChild(kart(u));
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
      f.src = bekleyenAdres.get(u.id) || adresi(u);
      bekleyenAdres.delete(u.id);
      f.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen');
      $('sahne').appendChild(f);
      cerceveler.set(u.id, f);
    }
    return f;
  }

  /** id: uygulama, 'makine' ya da 'ana'. alt: makine sayfasında seri numarası */
  function ac(id, alt) {
    const makine = id === MAKINE.id;
    const u = makine ? null : BUL.get(id) || null;
    const onceki = acik;
    acik = makine ? MAKINE.id : u ? u.id : 'ana';
    const klasorUyarisi = !!(u && u.klasor && DOSYADAN && !ayriAcilanlar.has(u.id));

    $('ana').hidden = !!u || makine;
    $('makine').hidden = !makine;
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
    // Makine sayfasında yenile düğmesi belgeleri yeniden okur
    const yenileMetni = makine ? 'Makineleri ve belgeleri yeniden oku' : 'Açık uygulamayı yeniden yükle';
    $('yenile').title = yenileMetni;
    $('yenile').setAttribute('aria-label', yenileMetni);
    $('yenile').disabled = !makine && (!u || klasorUyarisi);
    $('ayri').disabled = !u;
    document.title = u ? `${u.ad} · DOCX` : 'DOCX';
    try { localStorage.setItem(SON_ANAHTARI, acik); } catch { /* yok sayılır */ }

    if (makine) window.DocxMakine.goster(alt || '', onceki !== MAKINE.id);
    const f = u ? cerceveler.get(u.id) : null;
    if (f && !klasorUyarisi) { try { f.focus(); } catch { /* odak verilemedi */ } }
  }

  function rota() {
    let id = '';
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { /* bozuk adres */ }
    const [bas, ...kalan] = id.split('/');
    if (bas === MAKINE.id) ac(MAKINE.id, kalan.join('/'));
    else ac(BUL.has(id) ? id : 'ana');
  }

  /* ─── Makine sayfasından belge açma ─────────────────────── */

  function ayniSayfa(f, adres) {
    try {
      const simdi = f.contentWindow.location.href.split('#')[0];
      return simdi === new URL(adres, location.href).href.split('#')[0];
    } catch {
      return false; // başka köken (dosyadan açılış): çerçeve yeniden yönlendirilir
    }
  }

  /** DocumentX açıksa kılavuz yerinde seçilir; seçilemezse (klasör bağlı değil, liste yok) false */
  function kilavuzSec(f, deger) {
    try {
      const sel = f.contentDocument && f.contentDocument.getElementById('modelSelect');
      if (!sel || ![...sel.options].some((o) => o.value === deger)) return false;
      if (sel.value !== deger) {
        sel.value = deger;
        sel.dispatchEvent(new Event('change'));
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Uygulama belgenin adresine gider ve öne gelir. hedef (kabuk/makine-cekirdek.js > KURALLAR):
      arama: adrese eklenen sorgu (?…; sayfa yeniden yüklenir) · hash: adres parçası (#…; uygulama kendi içinde geçer)
      dx: DocumentX kılavuzu (makine.js son kılavuz olarak yazdı: çerçeve yoksa ya da yeniden yüklenirse o açılır) */
  function belgeAc(id, hedef) {
    const u = BUL.get(id);
    if (!u) return;
    const h = hedef || {};
    const adres = adresi(u) + (h.arama || '') + (h.hash || '');
    const f = cerceveler.get(id);
    if (!f) bekleyenAdres.set(id, adres);
    else if (h.dx) { if (!kilavuzSec(f, h.dx)) f.src = adres; }
    else if (h.hash && !h.arama && ayniSayfa(f, adres)) f.contentWindow.location.hash = h.hash;
    else f.src = adres;
    if (location.hash === `#${id}`) ac(id);
    else location.hash = `#${id}`;
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
    return tamAdres(bekleyenAdres.get(u.id) || adresi(u));
  }

  function ayriPenceredeAc(u) {
    window.open(acikAdres(u), '_blank', 'noopener');
  }

  function yenile() {
    if (acik === MAKINE.id) {
      window.DocxMakine.yenile();
      return;
    }
    const f = cerceveler.get(acik);
    if (!f) return;
    try { f.contentWindow.location.reload(); } catch { f.src = adresi(BUL.get(acik)); }
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
  window.DocxMakine.kur({
    uygulamalar: new Map(UYGULAMALAR.map((u) => [u.id, { ad: u.ad, simge: u.simge }])),
    belgeAc
  });
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
  window.DocxKabuk = { UYGULAMALAR, ac, cerceveler, belgeAc };
})();
