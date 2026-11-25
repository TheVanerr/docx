/* ── Canlı yenileme (tarayıcı) ──
   Electron'daki chokidar izleyicisinin yerini alır: açık kılavuzun dosyaları
   (md, project.yaml, DATA, sözlük, işaretler, ORTAK parçalar) iki saniyede bir
   değişiklik zamanına bakılarak yoklanır; görseller birkaç turda bir taranır.
   Uygulamanın kendi yazdığı dosyalar (noteWrite) yenileme tetiklemez.
   Sekme arka plandayken yoklama durur. */
const DXWatch = (() => {
  const INTERVAL = 2000;
  const ASSET_EVERY = 4;           // görsel taraması: her 4 turda bir
  const listeners = [];
  let guideId = '';
  let paths = new Set();
  let stamps = new Map();
  let assetRes = null;
  let timer = null;
  let busy = false;
  let turn = 0;

  async function stampOf(rel) {
    try {
      const f = await DXFS.file(rel);
      return f ? f.lastModified + ':' + f.size : '-';
    } catch (e) {
      return '-';
    }
  }

  /* getGuide yanıtı: aynı kılavuz için yollar birleşir (ör. karşılaştırma dili). */
  async function track(res) {
    if (!res || !res.ok) return;
    if (res.id !== guideId) {
      guideId = res.id;
      paths = new Set();
      stamps = new Map();
    }
    assetRes = res;
    const fresh = (res.watch || []).filter(p => !stamps.has(p));
    fresh.forEach(p => paths.add(p));
    await Promise.all((res.watch || []).map(async p => stamps.set(p, await stampOf(p))));
    if (!timer) timer = setInterval(tick, INTERVAL);
  }

  async function tick() {
    if (busy || !guideId || (typeof document !== 'undefined' && document.hidden) || !DXFS.isMounted()) return;
    busy = true;
    try {
      const changed = [];
      await Promise.all([...paths].map(async (p) => {
        const s = await stampOf(p);
        if (s === stamps.get(p)) return;
        stamps.set(p, s);
        changed.push(p);
      }));
      if (assetRes && ++turn % ASSET_EVERY === 0) {
        if (await DXAssets.prepare(assetRes)) changed.push(assetRes.projectRel + '/assets/');
      }
      if (changed.length) listeners.forEach(cb => { try { cb({ paths: changed }); } catch (e) { console.error(e); } });
    } finally {
      busy = false;
    }
  }

  /* Uygulamanın yazdığı dosya: yeni damgası kaydedilir, değişiklik sayılmaz. */
  async function noteWrite(rel) {
    if (rel && paths.has(rel)) stamps.set(rel, await stampOf(rel));
  }

  function onChange(cb) {
    if (typeof cb === 'function') listeners.push(cb);
  }

  return { track, noteWrite, onChange, tick };
})();
