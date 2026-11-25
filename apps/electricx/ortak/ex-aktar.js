/* Klasörden veritabanına aktarma. Seçilen klasörde veritabanı düzenindeki verileri bulur:
   ELECTRICX klasörü seçilirse içindeki veri/ klasörü, doğrudan veri/ de seçilebilir.
   Var olan kayıt üzerine yazılmaz; program kodu ve fotoğraf kaynakları aktarılmaz. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ExAktar = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const IMPORT_RULES = [
    /^KUTU\/(projeler|kaynaklar)\//,
    /^ETIKET\/projeler\//,
    /^SEMA\/(hafiza|ayarlar|arsiv|kaynaklar|dosyalar|yedek)\//
  ];
  // Pafta HTML'leri gömülü fotoğraf ve PDF'le 7 MB'yi bulur; GitHub tek dosyada 100 MB'ye izin verir
  const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
  const DATA_DIRS = [['KUTU', 'projeler'], ['KUTU', 'kaynaklar'], ['ETIKET', 'projeler'], ['SEMA', 'hafiza'], ['SEMA', 'ayarlar'], ['SEMA', 'arsiv'], ['SEMA', 'dosyalar']];

  /** Depoda yalnız README varsa veri aktarılmamış sayılır */
  const hasProgramData = (records) => records.some((r) => /^(KUTU|ETIKET|SEMA)\//.test(r.path));

  async function childDir(dir, name) {
    try {
      return await dir.getDirectoryHandle(name);
    } catch {
      return null;
    }
  }

  async function hasPath(dir, segs) {
    let current = dir;
    for (const seg of segs) {
      current = await childDir(current, seg);
      if (!current) return false;
    }
    return true;
  }

  /** Seçilen klasörde veriyi bulur: klasörün kendisi ya da bir alt klasörü (ELECTRICX/veri) olabilir */
  async function findSources(dir) {
    const isData = async (handle) => {
      for (const segs of DATA_DIRS) if (await hasPath(handle, segs)) return true;
      return false;
    };
    if (await isData(dir)) return [dir];
    const sources = [];
    for await (const [, handle] of dir.entries()) {
      if (handle.kind === 'directory' && (await isData(handle))) sources.push(handle);
    }
    return sources;
  }

  async function* walk(dir, prefix) {
    for await (const [name, handle] of dir.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') {
        if (name === '.git' || name === 'node_modules') continue;
        yield* walk(handle, path);
      } else {
        yield { path, handle };
      }
    }
  }

  /** Var olan veritabanı kaydı üzerine yazılmaz; atlananlar nedeniyle birlikte döner */
  async function importFolder(db, dir, onProgress) {
    const sources = await findSources(dir);
    if (!sources.length) return { ok: false, error: `"${dir.name}" içinde aktarılacak veri bulunamadı. ELECTRICX ya da veri klasörünü seçin.` };
    const result = { ok: true, written: 0, kept: 0, skipped: [], sources: sources.map((s) => s.name) };
    for (const source of sources) {
      for await (const { path, handle } of walk(source, '')) {
        if (!IMPORT_RULES.some((rule) => rule.test(path))) continue;
        const name = path.split('/').pop();
        if (name.endsWith('.crswap')) continue;
        if (name === '.gitkeep') {
          await db.mkdir(path.split('/').slice(0, -1).join('/'));
          continue;
        }
        const file = await handle.getFile();
        if (file.size > MAX_IMPORT_BYTES) {
          result.skipped.push(`${path} (${Math.ceil(file.size / 1024)} KB)`);
          continue;
        }
        if (await db.meta(path)) {
          result.kept += 1;
          continue;
        }
        await db.write(path, new Uint8Array(await file.arrayBuffer()), { at: file.lastModified });
        result.written += 1;
        if (onProgress) onProgress(result);
      }
    }
    return result;
  }

  return { importFolder, findSources, hasProgramData, IMPORT_RULES, MAX_IMPORT_BYTES };
});
