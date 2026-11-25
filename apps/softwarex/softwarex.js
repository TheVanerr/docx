/* SoftwareX: SOFTWAREX klasöründeki dört belgeyi gösteren görüntüleyici (belgeleri yapay zekâ üretir, burada yalnız okunur).
   Klasör yalnız bu bilgisayarda okunur (File System Access API); hiçbir dosya bir yere yüklenmez.
   Her sekme kendi çerçevesinde açık kalır. Belgelerin üst menüsündeki bağlantılar sekme değiştirir ve açık makineyi
   (#makine1) taşır (belgeye eklenen köprüyle; bkz. kopru). Sekme başına hangi HTML'in açılacağı seçilebilir;
   Yenile klasörü ve açık belgeyi yeniden okur. Web adresinde ve dosyadan açılışta aynı çalışır. */
(function () {
  'use strict';

  const SX = window.SxCekirdek;
  const VT_AD = 'softwarex';
  const VT_DEPO = 'ayar';
  const KLASOR_ANAHTARI = 'klasor';
  const DURUM_ANAHTARI = 'softwarex_durum';
  const DERINLIK = 2; // kök + iki alt klasör düzeyi taranır
  const $ = (id) => document.getElementById(id);

  const d = {
    klasor: null, // FileSystemDirectoryHandle
    girdiler: [], // { yol, ad, h }
    ana: new Map(), // belge id → girdi (kökteki aynı adlı dosya)
    digerleri: [],
    aktif: SX.BELGELER[0].id,
    secim: {}, // belge id → yol (ana belgeden başka bir HTML seçildiyse)
    gorunum: new Map(), // belge id → { cerceve, url, yol, tarih, boyut }
    sira: 0 // eşzamanlı açılışlarda yalnız sonuncusu ekrana gelir
  };

  /* ─── Kalıcı durum (bu tarayıcıda) ─────────────────────── */

  function durumOku() {
    try {
      const s = JSON.parse(localStorage.getItem(DURUM_ANAHTARI) || '{}');
      if (SX.belge(s.aktif)) d.aktif = s.aktif;
      if (s.secim && typeof s.secim === 'object') d.secim = s.secim;
    } catch { /* bozuk ya da erişilemiyor: varsayılanlar */ }
  }

  function durumYaz() {
    try { localStorage.setItem(DURUM_ANAHTARI, JSON.stringify({ aktif: d.aktif, secim: d.secim })); } catch { /* yok sayılır */ }
  }

  /* ─── Klasör tutamacı (IndexedDB) ──────────────────────── */

  function vt() {
    return new Promise((ok, red) => {
      const r = indexedDB.open(VT_AD, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(VT_DEPO);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => red(r.error);
    });
  }

  async function vtOku(k) {
    const db = await vt();
    try {
      return await new Promise((ok, red) => {
        const r = db.transaction(VT_DEPO, 'readonly').objectStore(VT_DEPO).get(k);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => red(r.error);
      });
    } finally { db.close(); }
  }

  async function vtYaz(k, v) {
    const db = await vt();
    try {
      await new Promise((ok, red) => {
        const t = db.transaction(VT_DEPO, 'readwrite');
        t.objectStore(VT_DEPO).put(v, k);
        t.oncomplete = () => ok();
        t.onerror = () => red(t.error);
      });
    } finally { db.close(); }
  }

  /* ─── Ekranlar ─────────────────────────────────────────── */

  function ekranGoster(ad, baslik, metin, secenekler) {
    $('ekranBagla').hidden = ad !== 'bagla';
    $('ekranIzin').hidden = ad !== 'izin';
    $('ekranMesaj').hidden = ad !== 'mesaj';
    for (const [k, v] of d.gorunum) v.cerceve.classList.toggle('acik', ad === 'gorunum' && k === d.aktif);
    if (ad === 'mesaj') {
      $('mesajBaslik').textContent = baslik || '';
      $('mesajMetin').textContent = metin || '';
      const liste = $('mesajListe');
      liste.textContent = '';
      for (const g of secenekler || []) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm';
        b.textContent = g.yol;
        b.addEventListener('click', () => { d.secim[d.aktif] = g.yol; durumYaz(); goster(d.aktif, ''); });
        liste.appendChild(b);
      }
      liste.hidden = !liste.childElementCount;
    }
  }

  function arayuzuGuncelle() {
    const bagli = !!d.klasor;
    for (const s of $('sekmeler').children) {
      s.setAttribute('aria-selected', String(s.dataset.belge === d.aktif));
      s.disabled = !bagli;
    }
    $('klasorDegistir').hidden = !bagli;
    $('yenile').hidden = !bagli;
    if (d.klasor) $('klasorAdi').textContent = d.klasor.name;
    secimiCiz();
  }

  function sekmeleriKur() {
    const nav = $('sekmeler');
    for (const b of SX.BELGELER) {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'sekme';
      s.setAttribute('role', 'tab');
      s.dataset.belge = b.id;
      s.textContent = b.ad;
      s.title = `${b.dosya}: ${b.okuyucu}`;
      s.addEventListener('click', () => goster(b.id));
      nav.appendChild(s);
    }
  }

  /** Bu sekmede açılacak HTML: seçilmiş başka bir dosya varsa o, yoksa kökteki ana belge */
  function seciliGirdi(id) {
    const yol = d.secim[id];
    if (yol) {
      const g = d.girdiler.find((x) => x.yol === yol);
      if (g) return g;
    }
    return d.ana.get(id) || null;
  }

  function secimiCiz() {
    const sel = $('dosyaSec');
    sel.textContent = '';
    if (!d.klasor || !d.girdiler.length) { sel.hidden = true; return; }
    const b = SX.belge(d.aktif);
    const ana = d.ana.get(d.aktif);
    const ekle = (ust, g) => {
      const o = document.createElement('option');
      o.value = g.yol;
      o.textContent = g.yol;
      ust.appendChild(o);
    };
    if (ana) ekle(sel, ana);
    else {
      const o = document.createElement('option');
      o.value = '';
      o.disabled = true;
      o.textContent = `${b.dosya} yok`;
      sel.appendChild(o);
    }
    if (d.digerleri.length) {
      const og = document.createElement('optgroup');
      og.label = 'Klasördeki diğer HTML\'ler';
      d.digerleri.forEach((g) => ekle(og, g));
      sel.appendChild(og);
    }
    const secili = seciliGirdi(d.aktif);
    sel.value = secili ? secili.yol : '';
    sel.hidden = false;
  }

  let uyariZamani = 0;

  function bilgiYaz(v) {
    clearTimeout(uyariZamani);
    const c = $('bilgi');
    c.classList.remove('uyari');
    if (!v) { c.hidden = true; return; }
    c.textContent = `${SX.boyutYaz(v.boyut)} · ${SX.tarihYaz(v.tarih)}`;
    c.title = `${v.yol}\nBoyut: ${SX.boyutYaz(v.boyut)}\nSon değişiklik: ${SX.tarihYaz(v.tarih)}`;
    c.hidden = false;
  }

  /** Kısa uyarı (bilgi alanında birkaç saniye) */
  function uyar(metin) {
    const c = $('bilgi');
    bilgiYaz(null);
    c.textContent = metin;
    c.title = metin;
    c.classList.add('uyari');
    c.hidden = false;
    uyariZamani = setTimeout(() => {
      const v = d.gorunum.get(d.aktif);
      bilgiYaz(v && v.cerceve.classList.contains('acik') ? v : null);
    }, 6000);
  }

  /* ─── Klasör ───────────────────────────────────────────── */

  async function tara(kok) {
    const girdiler = [];
    async function gez(klasor, onek, derinlik) {
      for await (const [ad, h] of klasor.entries()) {
        if (h.kind === 'file') {
          if (SX.htmlMi(ad)) girdiler.push({ yol: onek + ad, ad, h });
        } else if (derinlik < DERINLIK && !/^[._]/.test(ad) && ad !== 'node_modules') {
          await gez(h, `${onek}${ad}/`, derinlik + 1);
        }
      }
    }
    await gez(kok, '', 0);
    return girdiler;
  }

  /** Klasörü tarar; HTML varsa true */
  async function klasoruOku() {
    ekranGoster('mesaj', 'Klasör okunuyor…', d.klasor.name);
    d.girdiler = await tara(d.klasor);
    const r = SX.ayir(d.girdiler);
    d.ana = r.ana;
    d.digerleri = r.digerleri;
    // Artık bulunmayan dosyaya ait seçim unutulur
    for (const id of Object.keys(d.secim)) if (!d.girdiler.some((g) => g.yol === d.secim[id])) delete d.secim[id];
    durumYaz();
    arayuzuGuncelle();
    if (!d.girdiler.length) {
      bilgiYaz(null);
      ekranGoster('mesaj', 'Bu klasörde belge yok',
        `"${d.klasor.name}" klasöründe HTML bulunamadı. Belgelerin durduğu SOFTWAREX klasörünü seçin (Yazılım Dokümantasyonu.html, Servis.html, KKOut.html, Rapor.html).`);
      return false;
    }
    return true;
  }

  function cerceveleriKapat() {
    for (const v of d.gorunum.values()) { v.cerceve.remove(); URL.revokeObjectURL(v.url); }
    d.gorunum.clear();
  }

  /** Klasörü okur ve açık sekmeyi gösterir (hash: açılacak adres); okunamazsa nedenini yazar */
  async function klasoruAc(hash) {
    try {
      if (await klasoruOku()) await goster(d.aktif, hash || '');
    } catch (e) {
      bilgiYaz(null);
      arayuzuGuncelle();
      ekranGoster('mesaj', 'Klasör okunamadı', `${d.klasor.name}: ${(e && e.message) || e}. Klasör taşınmış ya da silinmiş olabilir; sağ üstteki klasör düğmesiyle yeniden seçin.`);
    }
  }

  /** Bir klasöre bağlanır (Klasör seç ya da testler) */
  async function baglan(h) {
    cerceveleriKapat();
    d.klasor = h;
    await klasoruAc('');
  }

  async function klasorSec() {
    if (!('showDirectoryPicker' in window)) {
      ekranGoster('mesaj', 'Klasör seçilemiyor', 'Bu tarayıcı klasör okumayı desteklemiyor. SoftwareX\'i Chrome ya da Edge ile açın.');
      return;
    }
    let h;
    try {
      h = await window.showDirectoryPicker({ id: 'softwarex', mode: 'read' });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      ekranGoster('mesaj', 'Klasör seçilemedi', e && e.name === 'SecurityError'
        ? 'Tarayıcı bu çerçevede klasör seçtirmiyor (DOCX dosyadan açıldığında olur). SoftwareX\'i ayrı pencerede açın ya da DOCX\'i web adresinden kullanın.'
        : String((e && e.message) || e));
      return;
    }
    try { await vtYaz(KLASOR_ANAHTARI, h); } catch { /* hatırlanamadı: sonraki açılışta yeniden sorulur */ }
    await baglan(h);
  }

  async function izinVer() {
    let r = 'denied';
    try { r = await d.klasor.requestPermission({ mode: 'read' }); } catch { /* izin yok */ }
    if (r === 'granted') {
      $('izinDurum').hidden = true;
      await klasoruAc('');
    } else {
      $('izinDurum').textContent = 'İzin verilmedi. Belgeleri göstermek için klasörü okuma izni gerekiyor: yeniden deneyin ya da başka bir klasör seçin.';
      $('izinDurum').hidden = false;
    }
  }

  /* ─── Belgeler ─────────────────────────────────────────── */

  /* Belgeye eklenen köprü. Belge blob adresinden açılır: içindeki göreli bağlantılar (Servis.html#makine1) orada
     açılamaz, ve dosyadan (file://) açılışta SoftwareX çerçevenin içine erişemez. Bu yüzden haberleşme her durumda
     postMessage ile yapılır:
       belge → SoftwareX  { tur: 'durum', hash, baslik, baglantilar, kimlik }  açılışta ve adres değişince
                          { tur: 'git', href }                               göreli .html bağlantısına tıklanınca
                          { tur: 'adres-iste', hash }                        dosyadan açılışta #… bağlantısına tıklanınca
     Dosyadan açılışta (köken "null") tarayıcı, belgenin kendi #… gezintisini yok sayar (gerçek tıklamada da);
     çerçevenin adresini üst pencere değiştirebilir. Bu yüzden orada #… bağlantıları SoftwareX'e iletilir (adresVer).
     Köprü belgenin sonuna eklenir (dosya kopyalanmaz) ve yalnız ASCII'dir: belgenin karakter kodlaması ne olursa
     olsun bozulmaz. Bu işlevin gövdesi belgeye metin olarak kopyalanır; içinde dış değişken kullanılmaz. */
  function kopru() {
    var P = window.parent;
    if (!P || P === window) return;
    var kimlik = String(Math.random()).slice(2);
    var kendiGidemez = location.origin === 'null'; // file:// (opaque origin): the document cannot change its own #hash
    function gonder(m) {
      m.softwarex = 1;
      try { P.postMessage(m, '*'); } catch (e) { /* ignore */ }
    }
    function durum() {
      var l = [];
      try {
        var a = document.querySelectorAll('nav.docnav a[href], a[data-doclink]');
        for (var i = 0; i < a.length; i++) l.push(a[i].getAttribute('href'));
      } catch (e) { /* ignore */ }
      gonder({ tur: 'durum', hash: location.hash, baslik: document.title, baglantilar: l, kimlik: kimlik });
    }
    function baglanti(e) {
      var t = e.target;
      var a = t && t.closest ? t.closest('a[href]') : null;
      return a ? (a.getAttribute('href') || '').trim() : '';
    }
    // Links to other documents (relative .html): the viewer opens them (capture: before the document's own handlers)
    function yakala(e) {
      if (e.type === 'auxclick' && e.button !== 1) return;
      var h = baglanti(e);
      if (!h || h.charAt(0) === '#' || h.indexOf('//') === 0 || /^[a-z][a-z0-9+.-]*:/i.test(h)) return;
      if (!/\.html?$/i.test(h.split('#')[0].split('?')[0])) return;
      e.preventDefault();
      e.stopPropagation();
      gonder({ tur: 'git', href: h });
    }
    // In-page links (#...) where the document cannot navigate itself: the viewer sets the address
    // (bubble phase: the document's own handlers run first and may cancel the click)
    function icBaglanti(e) {
      if (e.defaultPrevented || e.button !== 0) return;
      var h = baglanti(e);
      if (h.length < 2 || h.charAt(0) !== '#') return;
      e.preventDefault();
      gonder({ tur: 'adres-iste', hash: h });
    }
    window.addEventListener('click', yakala, true);
    window.addEventListener('auxclick', yakala, true);
    if (kendiGidemez) window.addEventListener('click', icBaglanti, false);
    window.addEventListener('hashchange', function () { setTimeout(durum, 0); });
    window.addEventListener('load', durum);
    durum();
  }
  const KOPRU = `\n<script>(${kopru.toString()})();</script>\n`;

  /** Sekmeden sekmeye geçerken taşınacak adres: kaynak belgenin kendi üst menüsündeki bağlantıdan, yoksa makine adresinden */
  function tasinacakAdres(kaynakId, hedefId) {
    const v = d.gorunum.get(kaynakId);
    if (!v) return '';
    for (const href of v.baglantilar) {
      const h = SX.hedef(href);
      if (h && h.id === hedefId) return h.hash;
    }
    return SX.makineAdresi(v.hash);
  }

  /**
   * Belgenin adresini (#makine, #bölüm) değiştirir. Adresi çerçeveye SoftwareX verir: dosyadan açılışta belge kendi
   * adresini değiştiremez, üst pencere değiştirebilir. Yalnız #… kısmı değiştiği için belge yeniden yüklenmez.
   */
  function adresVer(v, hash) {
    if (!/^#./.test(hash) || v.hash === hash) return;
    v.hash = hash;
    v.cerceve.src = v.url + hash;
  }

  /** Belgedeki göreli bağlantı: dört belgeden biriyse o sekme; klasördeki başka bir HTML ise bu sekmede o dosya */
  function baglantiyaGit(id, v, href) {
    const h = SX.hedef(href);
    if (h) { goster(h.id, h.hash); return; }
    const yol = SX.goreliYol(v.yol, href);
    const g = yol ? d.girdiler.find((x) => SX.yolAnahtari(x.yol) === SX.yolAnahtari(yol)) : null;
    if (!g) { uyar(`Bağlantı açılamadı: ${yol || href} klasörde yok (ya da iki alt klasörden derinde).`); return; }
    const ana = d.ana.get(id);
    if (ana && ana.yol === g.yol) delete d.secim[id];
    else d.secim[id] = g.yol;
    durumYaz();
    const i = href.indexOf('#');
    goster(id, i < 0 ? '' : href.slice(i));
  }

  /** Belge çerçevelerinden gelen iletiler (köprü) */
  function iletiAl(e) {
    const m = e.data;
    if (!m || m.softwarex !== 1 || !e.source) return;
    let id = null;
    let v = null;
    for (const [k, x] of d.gorunum) if (x.cerceve.contentWindow === e.source) { id = k; v = x; break; }
    if (!v) return;
    if (m.tur === 'durum') {
      v.hash = typeof m.hash === 'string' ? m.hash : '';
      v.baslik = typeof m.baslik === 'string' ? m.baslik : '';
      v.baglantilar = Array.isArray(m.baglantilar) ? m.baglantilar.filter((x) => typeof x === 'string') : [];
      v.kimlik = String(m.kimlik || '');
      v.hazir = true;
    } else if (m.tur === 'git' && typeof m.href === 'string') {
      baglantiyaGit(id, v, m.href);
    } else if (m.tur === 'adres-iste' && typeof m.hash === 'string') {
      adresVer(v, m.hash);
    }
  }

  async function cerceveKur(id, g, hash) {
    const dosya = await g.h.getFile();
    const eski = d.gorunum.get(id);
    if (eski) { eski.cerceve.remove(); URL.revokeObjectURL(eski.url); }
    // Köprü belgenin sonuna eklenir; Blob dosyaya başvurur, dosya belleğe kopyalanmaz
    const url = URL.createObjectURL(new Blob([dosya, KOPRU], { type: 'text/html' }));
    const f = document.createElement('iframe');
    f.className = 'belge';
    f.title = `${SX.belge(id).ad}: ${g.yol}`;
    f.src = url + (hash || '');
    $('sahne').appendChild(f);
    const v = { cerceve: f, url, yol: g.yol, tarih: dosya.lastModified, boyut: dosya.size,
      hash: hash || '', baslik: '', baglantilar: [], kimlik: '', hazir: false };
    d.gorunum.set(id, v);
    return v;
  }

  /**
   * Belgeyi gösterir. hash verilmezse ve sekme değişiyorsa açık makine taşınır; '' verilirse taşınmaz.
   */
  async function goster(id, hash) {
    if (!SX.belge(id) || !d.klasor) return;
    if (hash === undefined && id !== d.aktif) hash = tasinacakAdres(d.aktif, id);
    const sira = ++d.sira;
    d.aktif = id;
    durumYaz();
    arayuzuGuncelle();
    const g = seciliGirdi(id);
    if (!g) {
      bilgiYaz(null);
      ekranGoster('mesaj', `${SX.belge(id).dosya} bu klasörde yok`,
        d.digerleri.length ? 'Belge henüz üretilmemiş olabilir. Klasördeki başka bir HTML\'i açabilirsiniz:' : 'Belge henüz üretilmemiş olabilir.',
        d.digerleri);
      return;
    }
    let v = d.gorunum.get(id);
    try {
      if (!v || v.yol !== g.yol) v = await cerceveKur(id, g, hash || '');
      else if (hash) adresVer(v, hash);
    } catch (e) {
      if (sira === d.sira) {
        bilgiYaz(null);
        ekranGoster('mesaj', 'Dosya okunamadı', `${g.yol}: ${(e && e.message) || e}. Dosya taşınmış ya da silinmiş olabilir; Yenile'ye basın.`);
      }
      return;
    }
    if (sira !== d.sira) return;
    ekranGoster('gorunum');
    bilgiYaz(v);
    try { v.cerceve.focus(); } catch { /* odak verilemedi */ }
  }

  /** Klasörü yeniden tarar, açık belgeyi diskteki son hâliyle yeniden açar (yapay zekâ güncellediyse) */
  async function yenile() {
    if (!d.klasor) return;
    const v = d.gorunum.get(d.aktif);
    const hash = v ? v.hash : '';
    cerceveleriKapat();
    await klasoruAc(hash);
  }

  /* ─── Başlangıç ────────────────────────────────────────── */

  async function basla() {
    window.addEventListener('message', iletiAl);
    sekmeleriKur();
    durumOku();
    $('klasorSec').addEventListener('click', klasorSec);
    $('baskaKlasor').addEventListener('click', klasorSec);
    $('klasorDegistir').addEventListener('click', klasorSec);
    $('izinVer').addEventListener('click', izinVer);
    $('yenile').addEventListener('click', yenile);
    $('dosyaSec').addEventListener('change', (e) => {
      const yol = e.target.value;
      const ana = d.ana.get(d.aktif);
      if (ana && ana.yol === yol) delete d.secim[d.aktif];
      else d.secim[d.aktif] = yol;
      durumYaz();
      goster(d.aktif, '');
    });
    arayuzuGuncelle();

    let h = null;
    try { h = await vtOku(KLASOR_ANAHTARI); } catch { /* yok */ }
    if (!h) { ekranGoster('bagla'); return; }
    d.klasor = h;
    let izin = 'prompt';
    try { izin = await h.queryPermission({ mode: 'read' }); } catch { /* izin bilinmiyor */ }
    if (izin === 'granted') {
      try {
        if (await klasoruOku()) await goster(d.aktif, '');
      } catch {
        // Hatırlanan klasör artık okunamıyor (taşınmış ya da silinmiş): yeniden seçtirilir
        d.klasor = null;
        bilgiYaz(null);
        arayuzuGuncelle();
        ekranGoster('bagla');
      }
    } else {
      $('izinKlasor').textContent = h.name;
      arayuzuGuncelle();
      ekranGoster('izin');
    }
  }

  // Testler ve DOCX kabuğu için
  window.SoftwareX = { baglan, goster, durum: d };

  basla();
})();
