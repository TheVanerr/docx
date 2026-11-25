/* ── dxApi: uygulamanın arka uç arayüzü (tarayıcı) ──
   Eskiden Electron preload.js'in sunduğu window.electronAPI; aynı yöntem adları ve
   yanıt biçimleri korunur, böylece belge motoru ve arayüz değişmeden çalışır.
   Tüm dosya işlemleri bağlı çalışma klasöründe yapılır (web/connect.js). */
(function () {
  const VERSION = '2.0.0';
  const SETTINGS_KEY = 'dx.app.settings';
  const DEFAULT_SETTINGS = { hazirlayan: 'Fatih GÜRAL', vscodeRoot: '' };

  const ready = () => DXConnect.ensure();

  function readSettings() {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (e) { return { ...DEFAULT_SETTINGS }; }
  }

  function writeSettings(patch) {
    const s = { ...readSettings(), ...(patch || {}) };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* özel pencere */ }
    return s;
  }

  function writeGuard() {
    return DXFS.writable() ? null : { ok: false, error: 'Klasör salt okunur açık (Chrome veya Edge ile açın)' };
  }

  /* Kaynağa atlama: ayarlarda çalışma klasörünün tam yolu varsa VS Code (vscode://),
     yoksa uygulama içi düzenleyici. */
  function openSource(rel, line) {
    const ln = Math.max(1, parseInt(line, 10) || 1);
    const root = String(readSettings().vscodeRoot || '').trim().replace(/[\\/]+$/, '');
    if (root) {
      const abs = (root + '/' + String(rel || '')).replace(/\\/g, '/');
      const a = document.createElement('a');
      a.href = 'vscode://file/' + encodeURI(abs.startsWith('/') ? abs.slice(1) : abs) + ':' + ln;
      a.click();
      return { ok: true };
    }
    if (typeof openEditor === 'function' && DXBackend.editablePath(rel)) {
      openEditor(rel, ln);
      return { ok: true, fallback: true };
    }
    return { ok: false, error: 'Kaynak açılamadı (Belge ayarları > VS Code yolu)' };
  }

  window.dxApi = {
    /* pencere düğmeleri tarayıcıda yok */
    minimize() {},
    maximize() {},
    close() { window.close(); },

    async listGuides() { await ready(); return DXBackend.listGuides(); },
    async listModels() { await ready(); return DXBackend.listModels(); },
    async getGuide(guideId, lang) {
      await ready();
      const r = await DXBackend.getGuide(guideId, lang);
      if (r && r.ok) {
        await DXAssets.prepare(r);
        DXWatch.track(r);
      }
      return r;
    },
    async createProject(name, model, langs) {
      await ready();
      return writeGuard() || DXBackend.createProject(name, model, langs);
    },
    async saveGuideMeta(guideId, patch) {
      await ready();
      const guard = writeGuard();
      if (guard) return guard;
      const r = await DXBackend.saveGuideMeta(guideId, patch);
      if (r && r.rel) await DXWatch.noteWrite(r.rel);
      return r;
    },

    async getSettings() { return readSettings(); },
    async setSettings(patch) { return { ok: true, settings: writeSettings(patch) }; },
    async appInfo() {
      await ready();
      return { version: VERSION, packaged: false, web: true, workspace: DXFS.name(), readonly: !DXFS.writable(), assetBase: '../' };
    },
    async chooseWorkspace() { DXConnect.choose(); return { ok: true }; },

    async openSource(rel, line) { return openSource(rel, line); },
    async openExports(guideId) { await ready(); return DXExport.openExports(guideId); },

    async translationStatus(guideId) { await ready(); return DXBackend.translationStatus(guideId); },
    async translateFile() { return { ok: false, error: 'Makine çevirisi tarayıcıda yok: node scripts/translate-lang.js kullanın' }; },

    async gitLog(guideId) { await ready(); return DXBackend.gitLog(guideId); },
    async changedLines(guideId, ref) { await ready(); return DXBackend.changedLines(guideId, ref); },

    async readFile(rel) { await ready(); return DXBackend.readFile(rel); },
    async writeFile(rel, text, baseMtime, force) {
      await ready();
      const guard = writeGuard();
      if (guard) return guard;
      const r = await DXBackend.writeFile(rel, text, baseMtime, force);
      if (r && r.ok) await DXWatch.noteWrite(r.rel);
      return r;
    },
    async assetReport(guideId) { await ready(); return DXBackend.assetReport(guideId); },
    async optimizeImages(srcs) { return DXAssets.optimizeForPrint(srcs); },
    async readAsset(name) { await ready(); return DXBackend.readAsset(name); },
    async dashboard() { await ready(); return DXBackend.dashboard(); },

    async printPdf(opts) { return DXExport.printPdf(opts); },
    directPdfEnabled() { return DXExport.directPdfEnabled(); },
    async exportHtml(payload) { return DXExport.exportHtml(payload); },
    async exportWeb(payload) { return DXExport.exportWeb(payload); },

    onContentChanged(cb) { DXWatch.onChange(cb); }
  };
})();
