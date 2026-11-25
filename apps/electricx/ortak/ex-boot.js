/* ELECTRICX açılışı: veritabanı bağlantısı ve programlarla kabuk arasındaki haberleşme.
   Programlar kabuğun (index.html) içinde iframe olarak çalışır, sekme değişince durumlarını kaybetmez.
   Depoyla yalnız kabuk eşitler; gömülü program aynı tarayıcı veritabanına yazar ve kabuğa haber verir.
   Program doğrudan açılırsa (kabuksuz) kendi eşitlemesini yapar. Sayfalar çift tıkla açılır, sunucu gerekmez. */

(function () {
  'use strict';

  const SETTINGS_KEY = 'electricx_ayarlar';
  const DB_NAME = 'electricx-veri';
  const FOREGROUND_SYNC_MS = 5 * 60 * 1000;
  const FOCUS_SYNC_GAP_MS = 60 * 1000;
  const FIRST_SYNC_WAIT_MS = 3000;
  // Arşiv PDF'leri büyüyebilir: her cihaz bütün arşivi indirmesin, açıldığında insin.
  // ES/ geçmiş müşteri şemalarıdır (yalnız veri deposunda); programlar okumaz, hiçbir cihaza kendiliğinden inmez.
  const lazy = (path) => /^(SEMA\/dosyalar|ES)\//.test(path);

  const ortak = new URL('.', document.currentScript.src);
  const anaUrl = new URL('../index.html', ortak).href;
  const kabuk = !!window.EX_KABUK;
  const gomulu = !kabuk && window.parent !== window;

  let db = null;
  let readyPromise = null;
  const degisenler = new Set();
  const gorunurler = new Set();

  function settings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveSettings(value) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
  }

  function afterDom(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  /* ─── Durum yazısı ──────────────────────────────────────── */

  function chipText(s) {
    if (s.mode === 'local') return { text: 'Yerel mod: veriler yalnız bu tarayıcıda', cls: 'warn yerel' };
    if (s.state === 'error') return { text: `Depoya gönderilemedi, bu cihazda kayıtlı. ${s.error}`, cls: 'err' };
    if (s.state === 'offline') return { text: `Çevrimdışı: ${s.pending} dosya bu cihazda bekliyor`, cls: 'warn' };
    if (s.state === 'syncing') return { text: 'Eşitleniyor…', cls: '' };
    if (s.pending) return { text: `Bu cihazda kayıtlı, ${s.pending} dosya depoya gönderilecek`, cls: '' };
    const time = s.lastSync ? new Date(s.lastSync).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
    return { text: `Depoda kayıtlı${time ? ` · ${time}` : ''}`, cls: '' };
  }

  /** Program kabuksuz açıldığında köşedeki durum yazısı */
  function renderChip(status) {
    afterDom(() => {
      let chip = document.getElementById('exChip');
      if (!chip) {
        chip = document.createElement('a');
        chip.id = 'exChip';
        chip.href = anaUrl;
        chip.title = 'Ana ekran: veritabanı ve yedek';
        chip.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:900;padding:5px 10px;border-radius:6px;font:12px 'Segoe UI',system-ui,sans-serif;background:#23272f;color:#c6cbd5;border:1px solid #2f343e;box-shadow:0 4px 14px rgba(0,0,0,.35);max-width:460px;text-decoration:none";
        document.body.appendChild(chip);
      }
      const { text, cls } = chipText(status);
      chip.textContent = text;
      chip.style.color = cls.includes('err') ? '#ff8585' : cls.includes('warn') ? '#ffd479' : '#c6cbd5';
    });
  }

  /* ─── Bağlantı ──────────────────────────────────────────── */

  async function lockFn() {
    // Sekmeler aynı anda göndermesin; tarayıcı bu dosya için kilit vermezse kilitsiz devam edilir
    try {
      await navigator.locks.query();
      return (fn) => navigator.locks.request('electricx-sync', fn);
    } catch {
      return (fn) => fn();
    }
  }

  function watchPage() {
    let lastFocusSync = Date.now();
    const syncIfDue = () => {
      if (Date.now() - lastFocusSync < FOCUS_SYNC_GAP_MS) return;
      lastFocusSync = Date.now();
      db.sync();
    };
    document.addEventListener('visibilitychange', () => {
      // Sayfa kapanırken gönderim yarım kalsa da kayıt cihazda bekler, sonraki açılışta gider
      if (document.visibilityState === 'hidden') db.flush();
      else syncIfDue();
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') syncIfDue();
    }, FOREGROUND_SYNC_MS);
    window.addEventListener('online', () => db.sync());
  }

  async function connect() {
    const { mode, repo, token } = settings();
    const remote = mode === 'github' ? ExGitHub.createRemote({ repo, token }) : null;
    const local = ExDb.indexedDbLocal(DB_NAME);

    if (gomulu) {
      // Depoya kabuk gönderir; bu sayfa yalnız baytı inmemiş dosyaları okumak için depoya bakar
      db = ExDb.createDb({
        local,
        remote: null,
        blobSource: remote,
        lazy,
        onWrite: () => window.parent.postMessage({ ex: 'yazildi' }, '*')
      });
      return db;
    }

    db = ExDb.createDb({ local, remote, lazy, merge: ExDb.mergeTermShards, lock: await lockFn() });
    db.onStatus((s) => {
      if (!kabuk) renderChip(s);
      if (s.state === 'ok' && s.changed && s.changed.length) for (const fn of degisenler) fn(s.changed);
    });
    if (!kabuk) renderChip(db.status());
    await db.refreshPending();
    if (remote) {
      // Yerel veri varsa açılış ağa takılmaz; yoksa ilk alma bitmeden gösterilecek bir şey yok
      const first = db.sync();
      if (ExAktar.hasProgramData(await db.list())) await Promise.race([first, new Promise((r) => setTimeout(r, FIRST_SYNC_WAIT_MS))]);
      else await first;
      watchPage();
    }
    return db;
  }

  /* ─── Kurulum (ana ekrandan) ────────────────────────────── */

  /** Depoyu dener; açık depoya müşteri verisi yazılmasın diye yalnız özel depo kabul edilir */
  async function connectGitHub(repo, token) {
    const remote = ExGitHub.createRemote({ repo, token });
    const info = await remote.info();
    if (!info.private) throw new Error('Bu depo herkese açık. Müşteri verileri için özel (Private) depo gerekir.');
    saveSettings({ mode: 'github', repo: remote.id, token });
  }

  /* ─── Kabukla haberleşme ────────────────────────────────── */

  if (gomulu) {
    window.addEventListener('message', (e) => {
      if (e.source !== window.parent || !e.data) return;
      if (e.data.ex === 'degisti') for (const fn of degisenler) fn(e.data.paths || []);
      if (e.data.ex === 'gorunur') for (const fn of gorunurler) fn();
    });
    afterDom(() => {
      const send = () => window.parent.postMessage({ ex: 'baslik', baslik: document.title }, '*');
      send();
      const title = document.querySelector('title');
      if (title) new MutationObserver(send).observe(title, { childList: true, characterData: true, subtree: true });
    });
  }

  const api = {
    ready() {
      if (!readyPromise) readyPromise = connect();
      return readyPromise;
    },
    db: () => db,
    settings,
    connectGitHub,
    useLocal: () => saveSettings({ mode: 'yerel' }),
    /** Anahtar silinir, veriler bu cihazda kalır */
    disconnect: () => saveSettings({ mode: 'yerel' }),
    /** Başka cihazdan ya da başka çerçeveden değişen yollar. fn(paths) */
    onChanged: (fn) => {
      degisenler.add(fn);
      return () => degisenler.delete(fn);
    },
    /** Kullanıcı bu programın sekmesine döndü */
    onVisible: (fn) => {
      gorunurler.add(fn);
      return () => gorunurler.delete(fn);
    },
    /** Kabuğun başka sekmesini açar; kabuksuz sayfada ana ekrana gider */
    git: (program) => {
      if (gomulu) window.parent.postMessage({ ex: 'git', program }, '*');
      else location.href = program === 'ana' ? anaUrl : `${anaUrl}#${program}`;
    },
    chipText,
    gomulu,
    kabuk,
    anaUrl
  };
  window.ExBoot = api;

  // Kurulum yapılmamışsa programlar veri yerini bilemez, ana ekrana dönülür
  if (!kabuk && !settings().mode && !window.claude) location.replace(anaUrl);
})();
