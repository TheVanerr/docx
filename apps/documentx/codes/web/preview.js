/* ── Önizleme modu ──
   scripts/build-preview.js bir kılavuzu, uygulamanın kendisiyle birlikte statik bir sayfa
   olarak paketler (window.DX_PREVIEW = metin dosyaları + görsel adresleri + git farkları).
   Bu sayfa açılınca klasör sorulmaz: paket salt okunur bağlanır, kılavuz değişiklik
   çubuklarıyla (taban: pakette seçilen commit) açılır. Belge ayarları yalnız bu oturumda
   uygulanır; düzenleme ve çıktı alma kendi klasörünüzde açılan uygulamada yapılır. */
(function () {
  const P = window.DX_PREVIEW;
  if (!P) return;
  document.documentElement.classList.add('dx-preview');

  const pref = (key) => { try { return localStorage.getItem('dx.' + key); } catch (e) { return null; } };
  const setPref = (key, v) => { try { localStorage.setItem('dx.' + key, JSON.stringify(v)); } catch (e) { /* yok say */ } };
  setPref('lastGuide', P.guide);
  if (window.innerWidth < 860) {
    // Telefon: akış (HTML) görünümü ve kapalı kenar çubuğu, kullanıcı başka seçmediyse.
    if (pref('view') == null) setPref('view', 'html');
    if (pref('sidebar') == null) setPref('sidebar', false);
  }

  DXConnect.mount(new DXFS.BundleBackend(P)).catch(e => console.error('Önizleme paketi bağlanamadı:', e));

  const git = P.git || { head: '', commits: [], changed: {} };
  const READONLY = 'Önizleme salt okunur: düzenleme ve çıktı için uygulamayı kendi DocumentX klasörünüzde açın.';
  const NO_OUTPUT = { success: false, error: 'Önizlemede çıktı alınmaz: PDF ve HTML uygulamadan alınır.' };

  // Belge ayarları (yalnız bu oturum): değişiklik çubukları varsayılan açık, taban pakette seçilen.
  const session = { cikti: {}, kapak: {}, revizyonlar: undefined };
  if (git.base) session.cikti = { degisiklik_cubugu: true, degisiklik_tabani: git.base };
  const mergeInto = (target, patch) => {
    Object.entries(patch || {}).forEach(([k, v]) => { target[k] = v; });
    return target;
  };

  const api = window.dxApi;
  const getGuide = api.getGuide;
  api.getGuide = async (guideId, lang) => {
    const r = await getGuide(guideId, lang);
    if (r && r.ok) {
      r.cikti = mergeInto({ ...(r.cikti || {}) }, session.cikti);
      Object.keys(r.cikti).forEach(k => { if (r.cikti[k] === null) delete r.cikti[k]; });
      r.kapak = mergeInto({ ...(r.kapak || {}) }, session.kapak);
      if (session.revizyonlar !== undefined) r.revizyonlar = session.revizyonlar || [];
    }
    return r;
  };
  api.saveGuideMeta = async (guideId, patch) => {
    if (patch && patch.cikti) session.cikti = { ...patch.cikti };
    if (patch && patch.kapak) mergeInto(session.kapak, patch.kapak);
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'revizyonlar')) session.revizyonlar = patch.revizyonlar;
    return { ok: true, changed: true, session: true };
  };
  api.gitLog = async () => (git.commits && git.commits.length ? { ok: true, head: git.head, commits: git.commits } : { ok: false, error: 'git bilgisi yok' });
  api.changedLines = async (guideId, ref) => {
    const r = String(ref || '');
    const key = Object.prototype.hasOwnProperty.call(git.changed, r) ? r
      : Object.keys(git.changed).find(k => r.length >= 4 && k.startsWith(r));
    return key ? { ok: true, files: git.changed[key] } : { ok: false, error: 'Bu taban için fark önizleme paketinde yok' };
  };
  api.translationStatus = async () => ({ ok: true, translator: false, files: [] });
  api.writeFile = async () => ({ ok: false, error: READONLY });
  api.createProject = async () => ({ ok: false, error: READONLY });
  api.chooseWorkspace = async () => ({ ok: false, error: READONLY });
  ['printPdf', 'exportHtml', 'exportWeb'].forEach(k => { api[k] = async () => NO_OUTPUT; });
  api.openExports = async () => ({ ok: false, error: NO_OUTPUT.error });

  // Dar ekran: HTML görünümündeki kapak (794 × 1123 px tasarım) kabın genişliğine küçültülür.
  const fitCovers = () => {
    document.querySelectorAll('#pagesContainer .html-cover-section').forEach((sec) => {
      const host = sec.parentElement;
      const k = host ? Math.min(1, host.clientWidth / 794) : 1;
      sec.style.zoom = k < 0.999 ? String(Math.round(k * 1000) / 1000) : '';
    });
  };
  let fitTimer = null;
  const scheduleFit = () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitCovers, 60); };
  const pages = document.getElementById('pagesContainer');
  if (pages && typeof MutationObserver === 'function') new MutationObserver(scheduleFit).observe(pages, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleFit);

  const stamp = (ms) => {
    const d = new Date(ms || Date.now());
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const appInfo = api.appInfo;
  api.appInfo = async () => ({
    ...(await appInfo()),
    readonly: true,
    workspaceLabel: `Önizleme · ${stamp(P.builtAt)}` + (git.base ? ` · fark tabanı ${git.base === 'HEAD' ? 'son commit' : git.base.slice(0, 7)}` : '')
  });
})();
