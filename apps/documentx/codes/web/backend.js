/* ── DocumentX arka ucu (tarayıcı) ──
   Electron main.js'teki servislerin karşılığı: kılavuz listesi, kılavuz derleme
   (yaml bölüm ağacı, seçili dilin dosyaları, ORTAK parçalar, DATA, sözlük,
   ISO 7010 işaretleri, görsel işaretleri), düzenleyici okuma/yazma, project.yaml
   meta kaydı, yeni proje, proje panosu, görsel raporu, çeviri eskime durumu.
   Dosya erişimi DXFS (web/fs.js), git DXGit (web/git.js) üzerinden. */
const DXBackend = (() => {
  const DEFAULT_LANG = 'tr';
  const PROJECTS = 'projects';
  const TEMPLATES = 'templates';
  const EXPORTS = 'exports';
  const PROJECT_DIR_SKIP = new Set(['backup']);
  const ORTAK_RE = /^[ \t]*\{\{ORTAK:([a-z0-9_-]+)\}\}[ \t]*$/gim;
  const IMG_RX = /!\[[^\]]*\]\(([^)\s]+)/g;
  const IMG_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;
  const MISSING_RX = /\[(?:EKS[İI]K|MISSING|FEHLT)[^\]]*\]/giu;
  const BANNER = /^<!--[^>]*ÇEVİRİ GEREKLİ/m;
  const BANNER_RX = /^<!--[^>]*ÇEVİRİ GEREKLİ[\s\S]*?-->\s*/m;
  const tdRaw = new TextDecoder('utf-8', { ignoreBOM: true });

  const yaml = () => globalThis.jsyaml;
  const str = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v == null ? '' : String(v)));
  const skipContentDir = (name) => /^(assets|backup)$/i.test(name) || name.startsWith('.');

  async function readYaml(rel) {
    if (!rel) return null;
    const t = await DXFS.readText(rel);
    if (t == null) return null;
    try { return yaml().load(t); } catch (e) { return null; }
  }

  function normLangs(x) {
    return Array.isArray(x) && x.length ? x.map(s => String(s).toLowerCase()) : [DEFAULT_LANG];
  }

  function pickLang(reqLang, diller) {
    const req = String(reqLang || '').toLowerCase();
    if (diller.includes(req)) return req;
    if (diller.includes(DEFAULT_LANG)) return DEFAULT_LANG;
    return diller[0] || DEFAULT_LANG;
  }

  /* Proje kökünde project.yaml veya "<proje adı>.yaml" (scripts/project-core.js ile aynı kural). */
  async function findProjectYaml(dirRel) {
    const entries = await DXFS.list(dirRel);
    if (!entries.length) return null;
    const files = entries.filter(e => e.kind === 'file' && /\.ya?ml$/i.test(e.name)).map(e => e.name);
    if (files.includes('project.yaml')) return dirRel + '/project.yaml';
    if (!files.length) return null;
    const dirKey = DXFS.basename(dirRel).toLowerCase();
    const key = (n) => n.replace(/\s+/g, '-').replace(/\.ya?ml$/i, '').toLowerCase();
    files.sort((a, b) => {
      const da = key(a) === dirKey ? 0 : 1;
      const db = key(b) === dirKey ? 0 : 1;
      if (da !== db) return da - db;
      return a.localeCompare(b);
    });
    return dirRel + '/' + files[0];
  }

  const isTemplateDoc = (doc) => !!doc && (doc.sablon === true || doc.tip === 'sablon');

  /* projects/ altındaki klasörler: [{ dir, rel, yamlRel, doc, template }] (ada göre sıralı) */
  async function scanProjects() {
    const entries = (await DXFS.list(PROJECTS))
      .filter(e => e.kind === 'directory' && !PROJECT_DIR_SKIP.has(e.name.toLowerCase()))
      .map(e => e.name)
      .sort();
    const rows = await Promise.all(entries.map(async (dir) => {
      const rel = PROJECTS + '/' + dir;
      const yamlRel = await findProjectYaml(rel);
      if (!yamlRel) return null;
      const doc = (await readYaml(yamlRel)) || {};
      return { dir, rel, yamlRel, doc, template: isTemplateDoc(doc) };
    }));
    return rows.filter(Boolean);
  }

  /* Bir proje klasöründeki tüm .<dil>.md son ekleri. */
  async function detectLangs(projectRel) {
    const set = new Set();
    const files = await DXFS.walk(projectRel, { filter: n => /\.[a-z]{2}\.md$/i.test(n), skipDir: skipContentDir });
    files.forEach(f => set.add(f.match(/\.([a-z]{2})\.md$/i)[1].toLowerCase()));
    if (!set.size) set.add(DEFAULT_LANG);
    return [...set].sort();
  }

  async function listGuides() {
    const rows = await scanProjects();
    const out = await Promise.all(rows.map(async (r) => {
      const model = String(r.doc.model || (r.template ? r.dir : '')).toLowerCase();
      return {
        id: 'proje:' + r.dir,
        label: (r.doc.kapak && coverTitle(r.doc.kapak.baslik, DEFAULT_LANG)) || r.doc.proje_adi || (r.template ? r.dir.toUpperCase() : r.dir),
        type: r.template ? 'model' : 'project',
        model: model.toUpperCase(),
        diller: await detectLangs(r.rel)
      };
    }));
    return [...out.filter(g => g.type === 'model'), ...out.filter(g => g.type === 'project')];
  }

  async function listModels() {
    return (await scanProjects()).filter(r => r.template).map(r => r.dir.toLowerCase()).sort();
  }

  function guideDirName(guideId) {
    const id = String(guideId || '');
    if (!id.startsWith('proje:')) return '';
    return DXFS.basename(id.slice('proje:'.length));
  }

  /* kapak.baslik: metin veya { tr, en, de } */
  function coverTitle(v, lang) {
    return v && typeof v === 'object' ? str(v[lang] || v[DEFAULT_LANG] || Object.values(v)[0]) : str(v);
  }

  function normalizeKapak(k) {
    const kapak = k && typeof k === 'object' ? k : {};
    return {
      ...kapak,
      baslik: kapak.baslik && typeof kapak.baslik === 'object' ? kapak.baslik : str(kapak.baslik),
      rev: str(kapak.rev),
      tarih: str(kapak.tarih),
      firma: str(kapak.firma),
      hazirlayan: str(kapak.hazirlayan),
      seri: kapak.seri === true
    };
  }

  function normalizeRevisions(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(r => r && typeof r === 'object')
      .map(r => ({
        rev: str(r.rev),
        tarih: str(r.tarih),
        aciklama: r.aciklama && typeof r.aciklama === 'object' ? r.aciklama : str(r.aciklama),
        hazirlayan: str(r.hazirlayan),
        commit: str(r.commit)
      }));
  }

  /* guideId → { type, label, model, projectRel, yamlRel, bolumler, diller, … } */
  async function resolveGuide(guideId) {
    const dir = guideDirName(guideId);
    if (!dir) return null;
    const projectRel = PROJECTS + '/' + dir;
    const yamlRel = await findProjectYaml(projectRel);
    if (!yamlRel) return null;
    const doc = (await readYaml(yamlRel)) || {};
    let base = {};
    if (!Array.isArray(doc.bolumler)) {
      try { base = (await readYaml(DXFS.norm(doc.extends || 'templates/base.yaml'))) || {}; } catch (e) { base = {}; }
    }
    const guide = {
      type: isTemplateDoc(doc) ? 'model' : 'project',
      label: (doc.kapak && coverTitle(doc.kapak.baslik, DEFAULT_LANG)) || doc.proje_adi || dir,
      model: String(doc.model || dir).toLowerCase(),
      kapak: normalizeKapak(doc.kapak),
      revizyonlar: normalizeRevisions(doc.revizyonlar),
      cikti: doc.cikti && typeof doc.cikti === 'object' ? doc.cikti : {},
      projectRel,
      yamlRel,
      dir,
      bolumler: Array.isArray(doc.bolumler) ? doc.bolumler : (Array.isArray(base.bolumler) ? base.bolumler : []),
      diller: normLangs(doc.diller),
      varsayilanDil: str(doc.varsayilan_dil)
    };
    guide.diller = [...new Set(guide.diller.concat(await detectLangs(projectRel)))];
    return guide;
  }

  /* Kapak çizimi: yaml kapak.cizim → proje assets/kapak/kapak-cizimi → model şablonu. */
  async function resolveCoverDrawing(guide) {
    const names = ['kapak-cizimi.png', 'kapak-cizimi.svg'];
    const candidates = [];
    if (guide.kapak.cizim) {
      try { candidates.push(DXFS.join(guide.projectRel, String(guide.kapak.cizim))); } catch (e) { /* klasör dışı */ }
    }
    [guide.projectRel, PROJECTS + '/' + guide.model].forEach(dir => names.forEach(n => candidates.push(dir + '/assets/kapak/' + n)));
    for (const c of candidates) {
      if (await DXFS.file(c)) return c;
    }
    return '';
  }

  /* Terim sözlüğü: templates/sozluk.yaml (ortak) + projeye özel sozluk.yaml (proje kaydı geçerli). */
  async function readGlossary(projectRel) {
    const merged = new Map();
    for (const rel of [TEMPLATES + '/sozluk.yaml', projectRel + '/sozluk.yaml']) {
      const doc = await readYaml(rel);
      const list = doc && Array.isArray(doc.terimler) ? doc.terimler.filter(t => t && t.tr) : [];
      list.forEach(t => merged.set(String(t.tr).toLocaleLowerCase('tr-TR'), t));
    }
    return [...merged.values()].map(t => ({
      tr: str(t.tr), en: str(t.en), de: str(t.de),
      yasak: t.yasak && typeof t.yasak === 'object' ? t.yasak : {},
      dizin: t.dizin !== false
    }));
  }

  /* assets/iso7010/<KOD>.svg|png → { KOD: 'assets/iso7010/KOD.svg' } (svg öncelikli). */
  async function listIsoSymbols() {
    const out = {};
    const names = (await DXFS.list('assets/iso7010')).filter(e => e.kind === 'file').map(e => e.name).sort();
    names.sort((a, b) => (/\.svg$/i.test(a) ? 1 : 0) - (/\.svg$/i.test(b) ? 1 : 0)).forEach(name => {
      const m = name.match(/^([WPMEF]\d{3})\.(svg|png|jpe?g)$/i);
      if (m) out[m[1].toUpperCase()] = 'assets/iso7010/' + name;
    });
    return out;
  }

  /* Proje görsellerinin işaretleri: { 'projects/X/assets/a.png': [{ x, y, n }] } */
  async function readMarks(projectRel) {
    const out = {};
    const files = await DXFS.walk(projectRel + '/assets', { filter: n => /\.marks\.json$/i.test(n) });
    await Promise.all(files.map(async (rel) => {
      const doc = await DXFS.readJson(rel);
      const list = Array.isArray(doc) ? doc : (doc && Array.isArray(doc.markers) ? doc.markers : []);
      out[rel.replace(/\.marks\.json$/i, '')] = list
        .filter(m => m && Number.isFinite(+m.x) && Number.isFinite(+m.y))
        .map(m => ({ x: +m.x, y: +m.y, n: String(m.n == null ? '' : m.n) }));
    }));
    return out;
  }

  async function readData(projectRel) {
    const names = (await DXFS.list(projectRel)).filter(e => e.kind === 'file').map(e => e.name);
    const name = DXDataFile.pickDataFile(names);
    if (!name) return null;
    const rel = projectRel + '/' + name;
    const text = await DXFS.readText(rel);
    if (text == null) return null;
    return { file: rel, ...DXDataFile.parseData(text) };
  }

  /* Kendi satırındaki {{ORTAK:<ad>}} → templates/ortak/<ad>.<dil>.md */
  async function expandOrtak(text, lang, cache) {
    const names = new Set([...text.matchAll(ORTAK_RE)].map(m => m[1].toLowerCase()));
    for (const name of names) {
      const key = name + '.' + lang;
      if (!cache.has(key)) {
        const t = await DXFS.readText(`${TEMPLATES}/ortak/${name}.${lang}.md`);
        cache.set(key, t == null ? null : t.replace(/\s+$/, ''));
      }
    }
    return text.replace(ORTAK_RE, (whole, name) => {
      const t = cache.get(name.toLowerCase() + '.' + lang);
      return t == null ? whole : t;
    });
  }

  /* Kılavuz, seçili dilin dosyalarından derlenir; diller asla karışmaz. */
  async function buildTree(items, dirParts, projectRel, lang, ctx) {
    if (!Array.isArray(items)) return [];
    const nodes = await Promise.all(items.map(async (it) => {
      if (!it || it.aktif === false) return null;
      const folder = dirParts.concat(String(it.id));
      const base = it.dosya ? String(it.dosya) : '';
      let content = '';
      let file = '';
      if (base) {
        const rel = [projectRel, ...folder, `${base}.${lang}.md`].join('/');
        ctx.watch.push(rel);
        const raw = await DXFS.readText(rel);
        if (raw != null) {
          const c = await expandOrtak(raw, lang, ctx.ortak);
          if (c.trim()) { content = c; file = rel; }
        }
      }
      const children = await buildTree(it.alt_bolumler, folder, projectRel, lang, ctx);
      if (!content.trim() && !children.length) return null;
      return { id: String(it.id), dosya: base, content, file, children };
    }));
    return nodes.filter(Boolean);
  }

  async function getGuide(guideId, reqLang) {
    const guide = await resolveGuide(guideId);
    if (!guide) return { ok: false, error: 'no-guide', id: guideId };
    const lang = pickLang(reqLang, guide.diller);
    const ctx = { watch: [], ortak: new Map() };
    const [tree, kapakCizim, data, glossary, symbols, marks] = await Promise.all([
      buildTree(guide.bolumler, [], guide.projectRel, lang, ctx),
      resolveCoverDrawing(guide),
      readData(guide.projectRel),
      readGlossary(guide.projectRel),
      listIsoSymbols(),
      readMarks(guide.projectRel)
    ]);
    [...ctx.ortak.keys()].forEach(k => ctx.watch.push(`${TEMPLATES}/ortak/${k}.md`));
    ctx.watch.push(guide.yamlRel, guide.projectRel + '/sozluk.yaml', TEMPLATES + '/sozluk.yaml');
    if (data) ctx.watch.push(data.file);
    Object.keys(marks).forEach(k => ctx.watch.push(k + '.marks.json'));
    return {
      ok: true,
      id: guideId,
      label: coverTitle((guide.kapak || {}).baslik, lang) || guide.label,
      model: (guide.model || '').toUpperCase(),
      kapak: { ...(guide.kapak || {}), baslik: coverTitle((guide.kapak || {}).baslik, lang) },
      kapakCizim,
      varsayilanDil: guide.varsayilanDil,
      revizyonlar: guide.revizyonlar,
      cikti: guide.cikti,
      data,
      glossary,
      symbols,
      marks,
      type: guide.type,
      projectRel: guide.projectRel,
      diller: guide.diller,
      lang,
      tree,
      watch: [...new Set(ctx.watch)]
    };
  }

  /* Kapak meta, çıktı seçenekleri ve revizyon geçmişi project.yaml'a yazılır. */
  async function saveGuideMeta(guideId, patch) {
    try {
      const dir = guideDirName(guideId);
      const yp = dir && await findProjectYaml(PROJECTS + '/' + dir);
      if (!yp) return { ok: false, error: 'Proje yaml dosyası bulunamadı' };
      const allowed = {};
      for (const key of ['kapak', 'cikti', 'revizyonlar']) {
        if (patch && Object.prototype.hasOwnProperty.call(patch, key)) allowed[key] = patch[key];
      }
      const text = (await DXFS.readText(yp)) || '';
      const out = DXYamlEdit.applyPatch(text, allowed);
      if (out !== text) await DXFS.writeText(yp, out);
      return { ok: true, changed: out !== text, rel: yp };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /* Uygulama içi düzenleyici: yalnızca projects/ altındaki metin dosyaları. */
  function editablePath(rel) {
    let r;
    try { r = DXFS.norm(rel); } catch (e) { return null; }
    const name = DXFS.basename(r);
    const okType = /\.md$/i.test(r) || /(^|\s)DATA$/.test(name) || /sozluk\.ya?ml$/i.test(r) || /\.marks\.json$/i.test(r);
    return r.startsWith(PROJECTS + '/') && okType ? r : null;
  }

  async function readFile(rel) {
    const r = editablePath(rel);
    if (!r) return { ok: false, error: 'Bu dosya düzenlenemez' };
    const f = await DXFS.file(r);
    if (!f) return { ok: true, text: '', mtime: 0, exists: false };
    return { ok: true, text: await f.text(), mtime: f.lastModified, exists: true };
  }

  async function writeFile(rel, text, baseMtime, force) {
    const r = editablePath(rel);
    if (!r) return { ok: false, error: 'Bu dosya düzenlenemez' };
    try {
      if (!force && baseMtime) {
        const f = await DXFS.file(r);
        if (f && Math.abs(f.lastModified - baseMtime) > 1) {
          return { ok: false, conflict: true, error: 'Dosya siz düzenlerken diskte değişti' };
        }
      }
      const st = await DXFS.writeText(r, String(text));
      return { ok: true, mtime: st.mtime, rel: r };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /* ── Yeni proje: projects/<model> şablonundan kopya ──
     Yalnız kılavuzun kendisi geçer: bölüm klasörleri, assets ve DATA. Şablonun kaynak
     dosyaları (STEP, layout PDF'i, BOM HTML'i, ham fotoğraf, soru listesi) kopyalanmaz. */
  async function copyTemplateTree(fromRel, toRel, dataName, rel = '', files = []) {
    for (const e of await DXFS.list(rel ? fromRel + '/' + rel : fromRel)) {
      if (PROJECT_DIR_SKIP.has(e.name.toLowerCase())) continue;
      const relPath = rel ? rel + '/' + e.name : e.name;
      if (e.kind === 'directory') {
        if (!rel && !/^(assets|\d{2}-.+)$/i.test(e.name)) continue;
        await DXFS.mkdirp(toRel + '/' + relPath);
        await copyTemplateTree(fromRel, toRel, dataName, relPath, files);
        continue;
      }
      if (!rel) {
        if (/\sDATA$/i.test(e.name)) {
          const target = dataName + ' DATA';
          await DXFS.copyFile(fromRel + '/' + e.name, toRel + '/' + target);
          files.push(target);
        }
        continue;
      }
      if (/\.ya?ml$/i.test(e.name)) continue;
      await DXFS.copyFile(fromRel + '/' + relPath, toRel + '/' + relPath);
      files.push(relPath);
    }
    return files;
  }

  async function createProject(name, modelRaw, langsRaw) {
    try {
      const nameTrim = String(name || '').trim();
      const model = String(modelRaw || '').toLowerCase().trim();
      if (!nameTrim) return { ok: false, error: 'Proje adi bos olamaz.' };
      if (!model) return { ok: false, error: 'Model secilmedi.' };
      if (/[\\/:*?"<>|]/.test(nameTrim) || /^\.+$/.test(nameTrim)) return { ok: false, error: 'Proje adında \\ / : * ? " < > | kullanılamaz.' };
      const templateRel = PROJECTS + '/' + model;
      const templateYaml = await findProjectYaml(templateRel);
      if (!templateYaml) {
        return { ok: false, error: `Model sablonu bulunamadi: projects/${model}. Mevcut: ${(await listModels()).join(', ')}` };
      }
      const langs = (Array.isArray(langsRaw) ? langsRaw : String(langsRaw || 'tr').split(','))
        .map(s => String(s).trim().toLowerCase())
        .filter(Boolean);
      const diller = langs.length ? [...new Set(['tr', ...langs])] : ['tr'];
      const slug = nameTrim.replace(/\s+/g, '-');
      const projRel = PROJECTS + '/' + slug;
      if (await findProjectYaml(projRel)) return { ok: false, error: `Bu proje zaten var: ${slug}` };
      await DXFS.mkdirp(projRel);
      const templateDoc = (await readYaml(templateYaml)) || {};
      const doc = {
        proje_adi: nameTrim,
        model,
        tip: 'proje',
        diller,
        varsayilan_dil: diller[0] || 'tr',
        extends: templateDoc.extends || 'templates/base.yaml',
        kapak: { rev: '', tarih: '', firma: 'DOLFIN' }
      };
      await DXFS.writeText(projRel + '/project.yaml',
        '# Proje recetesi — icerik yalnizca bu klasorden okunur.\n\n' + yaml().dump(doc, { lineWidth: -1 }));
      const files = await copyTemplateTree(templateRel, projRel, nameTrim);
      if (!(await DXFS.isDir(projRel + '/assets'))) await DXFS.mkdirp(projRel + '/assets');
      return { ok: true, id: 'proje:' + slug, slug, label: nameTrim, model, diller, files };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /* ── Çeviri eskime durumu (TR kaynak → diğer diller) ──
     scripts/.translation-state.json kaydı varsa içerik özeti esas alınır; yoksa
     son değişiklik zamanı: HEAD'den farklı dosyada disk zamanı, değilse son commit. */
  async function sha16(text) {
    const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }

  async function readRaw(rel) {
    const b = await DXFS.readBytes(rel);
    return b ? tdRaw.decode(b) : null;
  }

  async function translationStatus(guide) {
    const state = (await DXFS.readJson('scripts/.translation-state.json')) || {};
    const srcs = await DXFS.walk(guide.projectRel, { filter: n => /\.tr\.md$/i.test(n), skipDir: skipContentDir });
    const langs = guide.diller.filter(l => l !== 'tr');
    const gitOk = await DXGit.available();
    let commits = null;
    let dirty = null;
    const changeTime = async (rel) => {
      if (gitOk && !commits) {
        commits = await DXGit.lastCommitTimes(guide.projectRel);
        const rels = [];
        for (const s of srcs) { rels.push(s); langs.forEach(l => rels.push(s.replace(/\.tr\.md$/i, `.${l}.md`))); }
        dirty = await DXGit.dirtyFiles(rels);
      }
      if (!gitOk || dirty.has(rel) || !commits.has(rel)) {
        const f = await DXFS.file(rel);
        return f ? Math.floor(f.lastModified / 1000) : 0;
      }
      return commits.get(rel);
    };
    const files = [];
    for (const src of srcs) {
      const srcText = await readRaw(src);
      if (!srcText || !srcText.trim()) continue;
      let trTime = null;
      for (const lang of langs) {
        const target = src.replace(/\.tr\.md$/i, `.${lang}.md`);
        const text = (await readRaw(target)) || '';
        let status;
        let tTime = 0;
        if (!text.trim()) status = 'yok';
        else if (BANNER.test(text)) status = 'placeholder';
        else if (state[target]) status = state[target] === await sha16(srcText.replace(BANNER_RX, '')) ? 'guncel' : 'eskimis';
        else {
          if (trTime == null) trTime = await changeTime(src);
          tTime = await changeTime(target);
          status = trTime > tTime + 60 ? 'eskimis' : 'guncel';
        }
        files.push({ src, target, lang, status, trTime: trTime || 0, tTime });
      }
    }
    return files;
  }

  async function translationStatusFor(guideId) {
    try {
      const guide = await resolveGuide(guideId);
      if (!guide) return { ok: false, error: 'no-guide' };
      return { ok: true, translator: false, files: await translationStatus(guide) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /* ── Proje panosu ── */
  const walkMd = (rel) => DXFS.walk(rel, { filter: n => /\.[a-z]{2}\.md$/i.test(n), skipDir: skipContentDir });

  async function dashboardRow(r, type) {
    const guide = await resolveGuide('proje:' + r.dir);
    if (!guide) return null;
    const langs = {};
    let lastEdit = 0;
    for (const rel of await walkMd(r.rel)) {
      const lang = rel.match(/\.([a-z]{2})\.md$/i)[1].toLowerCase();
      const f = await DXFS.file(rel);
      if (!f) continue;
      const text = await f.text();
      const L = langs[lang] || (langs[lang] = { files: 0, filled: 0, missing: 0 });
      L.files++;
      if (text.trim() && !/ÇEVİRİ GEREKLİ/.test(text)) L.filled++;
      L.missing += (text.match(MISSING_RX) || []).length;
      lastEdit = Math.max(lastEdit, f.lastModified);
    }
    const trFilled = (langs.tr && langs.tr.filled) || 0;
    Object.values(langs).forEach(L => { L.complete = trFilled ? Math.min(100, Math.round(L.filled / trFilled * 100)) : 0; });

    const data = await readData(r.rel);
    let dataStat = null;
    if (data) {
      const all = Object.values(data.blocks).flatMap(b => b.entries);
      dataStat = { total: all.length, filled: all.filter(e => e.value.trim() && !/EKS[İI]K/i.test(e.value)).length };
    }

    let stale = 0;
    try { stale = (await translationStatus(guide)).filter(f => f.status === 'eskimis' || f.status === 'placeholder').length; } catch (e) { /* git yok */ }

    let lastExport = 0;
    let exportCount = 0;
    for (const e of await DXFS.list(EXPORTS + '/' + r.dir)) {
      if (e.kind !== 'file') continue;
      const f = await DXFS.file(EXPORTS + '/' + r.dir + '/' + e.name);
      if (f) { exportCount++; lastExport = Math.max(lastExport, f.lastModified); }
    }

    return {
      id: 'proje:' + r.dir,
      dir: r.dir,
      type,
      label: guide.label,
      model: guide.model.toUpperCase(),
      firma: guide.kapak.firma || '',
      rev: guide.kapak.rev || '',
      tarih: guide.kapak.tarih || '',
      diller: guide.diller,
      langs,
      data: dataStat,
      stale,
      revisions: guide.revizyonlar.length,
      lastEdit: Math.round(lastEdit / 1000),
      lastExport: Math.round(lastExport / 1000),
      exportCount
    };
  }

  async function dashboard() {
    try {
      const rows = await scanProjects();
      const ordered = [...rows.filter(r => !r.template), ...rows.filter(r => r.template)];
      const out = await Promise.all(ordered.map(r => dashboardRow(r, r.template ? 'model' : 'project')));
      return { ok: true, rows: out.filter(Boolean) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /* ── Görsel raporu ── */
  /* md içindeki görsel yolu → çalışma klasöründeki dosya (renderer'daki resolveImageSrc kuralı) */
  function diskImagePath(src, projectRel) {
    let s = String(src || '').replace(/\\/g, '/');
    try { s = decodeURIComponent(s); } catch (e) { /* olduğu gibi */ }
    const m = s.match(/(?:^|\/)assets\/(.+)$/);
    try {
      if (!m) return DXFS.join(projectRel, s);
      return /^(labels|logos|iso7010)\//i.test(m[1]) ? DXFS.norm('assets/' + m[1]) : DXFS.norm(projectRel + '/assets/' + m[1]);
    } catch (e) {
      return null;
    }
  }

  async function assetReport(guideId) {
    try {
      const dir = guideDirName(guideId);
      if (!dir) return { ok: false, error: 'no-guide' };
      const projectRel = PROJECTS + '/' + dir;
      const refs = new Map();
      for (const md of await walkMd(projectRel)) {
        ((await DXFS.readText(md)) || '').split(/\r?\n/).forEach((line, i) => {
          IMG_RX.lastIndex = 0;
          let m;
          while ((m = IMG_RX.exec(line))) {
            if (/^(https?:|data:)/i.test(m[1])) continue;
            const rel = diskImagePath(m[1], projectRel);
            if (!rel) continue;
            if (!refs.has(rel)) refs.set(rel, []);
            refs.get(rel).push({ file: md, line: i + 1, src: m[1] });
          }
        });
      }
      const files = await DXFS.walk(projectRel + '/assets', { filter: n => IMG_EXT.test(n) });
      const fileSet = new Set(files);
      const exists = async (rel) => fileSet.has(rel) || !!(await DXFS.file(rel));
      const missing = [];
      for (const [rel, list] of refs) if (!(await exists(rel))) missing.push({ rel, refs: list });
      const unused = [];
      const large = [];
      for (const rel of files) {
        const f = await DXFS.file(rel);
        if (!f) continue;
        if (!refs.has(rel)) unused.push({ rel, size: f.size });
        if (/\.svg$/i.test(rel)) continue;
        const size = (await DXAssets.imageSize(f)) || { w: 0, h: 0 };
        if (f.size > 1.5 * 1024 * 1024 || Math.max(size.w, size.h) > 2500) {
          large.push({ rel, size: f.size, w: size.w, h: size.h, marks: !!(await DXFS.file(rel + '.marks.json')) });
        }
      }
      const used = [];
      for (const [rel, list] of refs) {
        if (/\.svg$/i.test(rel) || !(await exists(rel))) continue;
        used.push({ rel, refs: list.length, marks: !!(await DXFS.file(rel + '.marks.json')) });
      }
      return { ok: true, missing, unused, large, used, refCount: refs.size, fileCount: files.length };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /* git: projeye dokunan commit'ler ve ref'e göre değişen satırlar */
  async function gitLog(guideId) {
    const dir = guideDirName(guideId);
    if (!dir) return { ok: false };
    if (!(await DXGit.available())) return { ok: false, error: 'git bulunamadı' };
    return { ok: true, head: await DXGit.headCommit(), commits: await DXGit.logForPath(PROJECTS + '/' + dir) };
  }

  async function changedLines(guideId, ref) {
    const dir = guideDirName(guideId);
    if (!dir || !ref || !/^[0-9a-f]{4,40}$|^HEAD(~\d+)?$/i.test(String(ref))) return { ok: false, error: 'geçersiz ref' };
    const map = await DXGit.changedLines(String(ref), PROJECTS + '/' + dir);
    if (!map) return { ok: false, error: 'git diff başarısız' };
    const files = {};
    map.forEach((set, rel) => { files[rel] = [...set]; });
    return { ok: true, files };
  }

  /* Kök assets/ içindeki bir dosya → data URI */
  async function readAsset(name) {
    try {
      const safe = DXFS.basename(String(name));
      const f = await DXFS.file('assets/' + safe);
      if (!f) return null;
      return DXAssets.blobToDataUri(f, safe);
    } catch (e) {
      return null;
    }
  }

  return {
    DEFAULT_LANG, PROJECTS, TEMPLATES, EXPORTS,
    guideDirName, findProjectYaml, resolveGuide,
    listGuides, listModels, getGuide, saveGuideMeta, readFile, writeFile, editablePath,
    createProject, translationStatus: translationStatusFor, dashboard, assetReport,
    gitLog, changedLines, readAsset, diskImagePath
  };
})();
