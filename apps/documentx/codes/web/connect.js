/* ── Çalışma klasörüne bağlanma ──
   Uygulama açılınca DocumentX klasörü (içinde projects/ olan klasör) istenir.
   Chrome / Edge: klasör tutamacı IndexedDB'de saklanır; izin hâlâ geçerliyse
   ekran gösterilmeden bağlanılır, değilse tek tıkla yeniden izin istenir.
   Diğer tarayıcılar: klasör salt okunur yüklenir. Hiçbir dosya ağa gönderilmez. */
const DXConnect = (() => {
  let readyResolve;
  const ready = new Promise(r => { readyResolve = r; });
  let overlay = null;
  let attempt = 0;          // bağlanma denemesi sayacı: süresi dolan deneme geç dönse de bağlamaz
  const SILENT_MS = 5000;   // açılışta saklı klasöre sessiz bağlanma için üst süre
  const REQUEST_MS = 30000; // "… klasörüne bağlan" izin isteği için üst süre
  const STALE_MSG = 'Kayıtlı klasör bağlantısı yanıt vermiyor (tarayıcı güncellemesinden sonra olabiliyor). Klasörü bir kez yeniden seçin; sonraki açılışlarda sorulmaz.';

  /* Klasörü denetler; uygunsa bağlar. current() false ise (deneme geçersiz) bağlamaz. */
  async function validate(backend, current = () => true) {
    if (await backend.isDir('projects')) {
      if (!current()) return 'Bağlanma denemesi zaman aşımına uğradı.';
      DXFS.mount(backend);
      return '';
    }
    const entries = await backend.list('');
    const looksLikeProjects = entries.some(e => e.kind === 'directory' && /^\d{7}-|^(knv|vdl|kbn|lym|mst|pyt|rts|ult)$/i.test(e.name));
    if (looksLikeProjects) return 'Bu klasör projects/ klasörünün kendisi görünüyor. Bir üstteki DocumentX klasörünü seçin.';
    const programFolder = entries.some(e => e.kind === 'directory' && e.name === 'codes') && entries.some(e => /^DocumentX\.vbs$/i.test(e.name));
    if (programFolder) return 'Bu, DocumentX\'in program klasörü (docx\\apps\\documentx); kılavuzlar burada değil. Kılavuzların durduğu veri klasörünü seçin (ör. Masaüstü\\DOCX\\DocumentX, içinde projects/ var).';
    return 'Seçilen klasörde projects/ yok. Kılavuzların durduğu DocumentX veri klasörünü seçin (içinde projects/, templates/ ve assets/ var; ör. Masaüstü\\DOCX\\DocumentX).';
  }

  /* Üst klasör seçildiyse (ör. Masaüstü\DOCX) içindeki veri klasörü kullanılır: projects/ içeren alt klasör;
     birden çoksa adı DocumentX olan. Bulunamazsa seçilen klasör olduğu gibi döner (denetim nedenini yazar). */
  async function dataFolder(handle) {
    try { await handle.getDirectoryHandle('projects'); return handle; } catch (e) { /* kökte yok */ }
    const found = [];
    try {
      for await (const [name, h] of handle.entries()) {
        if (h.kind !== 'directory' || name.startsWith('.')) continue;
        try { await h.getDirectoryHandle('projects'); found.push(h); } catch (e) { /* veri klasörü değil */ }
      }
    } catch (e) { return handle; }
    if (found.length === 1) return found[0];
    return found.find(h => /^documentx$/i.test(h.name)) || handle;
  }

  async function mountHandle(handle, request) {
    const my = ++attempt;
    const current = () => my === attempt;
    let backend = new DXFS.HandleBackend(handle);
    const state = await backend.permission(request);
    if (!current()) return 'Bağlanma denemesi zaman aşımına uğradı.';
    if (state !== 'granted') return 'Klasöre erişim izni verilmedi.';
    const data = await dataFolder(handle);
    if (data !== handle) { handle = data; backend = new DXFS.HandleBackend(data); }
    const err = await validate(backend, current);
    if (err) return err;
    await DXFS.saveHandle(handle);
    return '';
  }

  /* Edge 158'de IndexedDB'den gelen eski tutamaçta izin sorgusu hiç dönmüyor: süre dolunca
     deneme bırakılır (geç dönerse bağlamaz) ve { timeout: true } döner. */
  async function mountWithin(handle, request, ms) {
    let timer;
    const late = new Promise(resolve => { timer = setTimeout(() => resolve(null), ms); });
    try {
      const res = await Promise.race([mountHandle(handle, request), late]);
      if (res === null) { attempt++; return { timeout: true }; }
      return { err: res };
    } finally {
      clearTimeout(timer);
    }
  }

  function done() {
    if (overlay) { overlay.remove(); overlay = null; }
    document.body.classList.toggle('dx-readonly', !DXFS.writable());
    readyResolve();
  }

  /* Seçilecek DocumentX klasörü. Başlatıcı (DocumentX.vbs) veri klasörünü adreste verir (?kok=...): program kodu
     DOCX deposundan, kılavuzlar ayrı veri klasöründen açılır. Verilmemişse file:// adresinden codes/ klasörünün üstü;
     DOCX deposundaki program klasörü (apps/documentx) veri klasörü değildir, onu önermez. */
  function ownRoot() {
    const kok = new URLSearchParams(location.search).get('kok');
    if (kok) return kok;
    if (location.protocol !== 'file:') return '';
    const m = decodeURIComponent(location.pathname).replace(/^\/(?=[A-Za-z]:)/, '').match(/^(.*)\/codes\/index\.html$/i);
    if (!m || /\/apps\/documentx$/i.test(m[1])) return '';
    return m[1].replace(/\//g, '\\');
  }

  function el(tag, attrs, text) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v));
    if (text != null) e.textContent = text;
    return e;
  }

  function show(opts = {}) {
    if (overlay) overlay.remove();
    overlay = el('div', { class: 'np-overlay dx-connect', id: 'dxConnect' });
    overlay.style.display = 'flex';
    const modal = el('div', { class: 'np-modal dx-connect-modal' });
    const head = el('div', { class: 'np-head' });
    head.appendChild(el('div', { class: 'np-title' }, 'DocumentX çalışma klasörü'));
    if (opts.cancel) {
      const x = el('button', { class: 'np-close', title: 'Kapat' }, '✕');
      x.onclick = () => { overlay.remove(); overlay = null; };
      head.appendChild(x);
    }
    const body = el('div', { class: 'np-body' });
    body.appendChild(el('p', { class: 'dx-connect-lead' },
      'Kılavuzların bulunduğu DocumentX veri klasörünü seçin (içinde projects/, templates/ ve assets/ olan klasör; ör. Masaüstü\\DOCX\\DocumentX). Bir üst klasörü seçerseniz içindeki DocumentX klasörü kullanılır.'));
    const root = ownRoot();
    if (root) {
      const p = el('p', { class: 'dx-connect-path' }, 'Seçilecek klasör: ');
      p.appendChild(el('b', {}, root));
      body.appendChild(p);
    }
    body.appendChild(el('p', { class: 'np-hint' },
      'Dosyalar yalnızca bu bilgisayarda okunur ve yazılır; hiçbir yere yüklenmez. Tarayıcı izin sorduğunda "Her ziyarette izin ver" seçeneği varsa onu seçin; sonraki açılışlarda sorulmaz.'));
    const actions = el('div', { class: 'dx-connect-actions' });
    const status = el('div', { class: 'np-status err dx-connect-status' });
    const fail = (msg) => { status.textContent = msg || ''; };

    if (DXFS.supportsHandles()) {
      if (opts.stored) {
        const again = el('button', { class: 'np-go' }, `“${opts.stored.name}” klasörüne bağlan`);
        again.onclick = async () => {
          try {
            const r = await mountWithin(opts.stored, true, REQUEST_MS);
            if (r.timeout) fail(STALE_MSG + ' ("Başka klasör seç…")');
            else if (r.err) fail(r.err);
            else done();
          } catch (e) { fail(e.message); }
        };
        actions.appendChild(again);
      }
      const pick = el('button', { class: opts.stored ? 'np-cancel' : 'np-go' }, opts.stored ? 'Başka klasör seç…' : 'Klasör seç…');
      pick.onclick = async () => {
        try {
          const handle = await window.showDirectoryPicker({ id: 'documentx', mode: 'readwrite' });
          const err = await mountHandle(handle, true);
          if (err) fail(err);
          else if (opts.reloadOnPick) location.reload();
          else done();
        } catch (e) {
          if (e && e.name !== 'AbortError') fail(e.message);
        }
      };
      actions.appendChild(pick);
    } else {
      const input = el('input', { type: 'file', webkitdirectory: '', multiple: '', style: 'display:none' });
      input.onchange = async () => {
        if (!input.files || !input.files.length) return;
        const err = await validate(new DXFS.ListBackend(input.files));
        if (err) fail(err); else done();
      };
      const pick = el('button', { class: 'np-go' }, 'Klasörü aç (salt okunur)…');
      pick.onclick = () => input.click();
      actions.appendChild(pick);
      actions.appendChild(input);
      body.appendChild(el('p', { class: 'np-hint' },
        'Bu tarayıcı klasöre yazmayı desteklemiyor: kılavuzlar görüntülenir, çıktılar indirilir; düzenleme ve exports/ klasörüne kayıt için Chrome veya Edge kullanın.'));
    }
    if (opts.stale) fail(STALE_MSG);
    body.appendChild(actions);
    body.appendChild(status);
    modal.appendChild(head);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  /* Açılışta: saklı klasör izni geçerliyse sessizce bağlan, değilse ekranı göster. */
  async function start() {
    if (DXFS.isMounted()) { done(); return ready; }
    let stored = null;
    let stale = false;
    if (DXFS.supportsHandles()) {
      stored = await DXFS.loadHandle();
      if (stored) {
        try {
          const r = await mountWithin(stored, false, SILENT_MS);
          if (!r.timeout && !r.err) { done(); return ready; }
          stale = !!r.timeout;
        } catch (e) { /* izin sorulacak */ }
      }
    }
    /* Yanıt vermeyen tutamaçla "bağlan" düğmesi de takılır: yalnız klasör seçimi gösterilir. */
    show({ stored: stale ? null : stored, stale });
    return ready;
  }

  let started = null;
  return {
    ensure() {
      if (!started) started = start();
      return ready;
    },
    /* Araçlar > Çalışma klasörü… : başka klasör seçilince sayfa yeniden yüklenir. */
    choose() {
      show({ cancel: true, reloadOnPick: true });
    },
    /* Testler, önizleme paketi ve gömülü kullanım: hazır bir arka ucu ya da klasör tutamacını bağlar. */
    async mount(handle) {
      const isBackend = [DXFS.HandleBackend, DXFS.ListBackend, DXFS.BundleBackend].some(C => handle instanceof C);
      const err = await validate(isBackend ? handle : new DXFS.HandleBackend(await dataFolder(handle)));
      if (err) throw new Error(err);
      started = Promise.resolve();
      done();
    },
    ready
  };
})();
