/* ── Git okuyucu (salt okunur, tarayıcı) ──
   Electron sürümündeki `git log` / `git diff` / `git status` çağrılarının yerini alır:
   çalışma klasöründeki .git dizini doğrudan okunur (loose nesneler + pack/idx v2).
   Pack dosyası belleğe alınmaz; nesne idx'teki konumundan dilimlenir ve
   DecompressionStream ile açılır, delta zinciri burada uygulanır.
   Git yoksa veya okunamıyorsa fonksiyonlar boş sonuç döner (özellik sessizce kapanır).
   Yollar çalışma klasörüne göre "/" ayraçlı göreli yoldur. */
const DXGit = (() => {
  const GIT_DIR = '.git';
  const TYPES = { commit: 1, tree: 2, blob: 3, tag: 4 };
  const td = new TextDecoder();
  const tdRaw = new TextDecoder('utf-8', { ignoreBOM: true });   // satır farkında BOM da fark sayılır (git gibi)
  const te = new TextEncoder();
  // Tarayıcıda DXFS üst düzey const (global nesnede değil); Node testlerinde globalThis.DXFS.
  const fsApi = () => (typeof DXFS !== 'undefined' ? DXFS : globalThis.DXFS);
  const nfc = (s) => String(s).normalize('NFC');

  let repo = null;          // { packs, packedRefs }
  let repoPromise = null;
  const objCache = new Map();
  const commitCache = new Map();
  const treeCache = new Map();

  function hex(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return s;
  }
  function unhex(s) {
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
    return out;
  }

  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function cachePut(map, key, val, limit) {
    if (map.size >= limit) {
      let n = 0;
      for (const k of map.keys()) { map.delete(k); if (++n >= limit / 2) break; }
    }
    map.set(key, val);
  }

  /* ── idx v2 ── */
  function parseIdx(buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (buf.length < 1032 || dv.getUint32(0) !== 0xff744f63 || dv.getUint32(4) !== 2) return null;
    const n = dv.getUint32(8 + 255 * 4);
    const shaOff = 8 + 1024;
    const ofsOff = shaOff + n * 24;            // sha (20) + crc (4)
    const bigOff = ofsOff + n * 4;
    const offsets = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let o = dv.getUint32(ofsOff + i * 4);
      if (o & 0x80000000) {
        const k = o & 0x7fffffff;
        o = dv.getUint32(bigOff + k * 8) * 4294967296 + dv.getUint32(bigOff + k * 8 + 4);
      }
      offsets[i] = o;
    }
    const sorted = Float64Array.from(offsets).sort();
    return { n, buf, dv, shaOff, offsets, sorted };
  }

  function idxFanout(idx, b) {
    return b < 0 ? 0 : idx.dv.getUint32(8 + b * 4);
  }

  function idxCompare(idx, i, sha) {
    const base = idx.shaOff + i * 20;
    for (let j = 0; j < 20; j++) {
      const d = idx.buf[base + j] - sha[j];
      if (d) return d;
    }
    return 0;
  }

  function idxFind(idx, sha) {
    let lo = idxFanout(idx, sha[0] - 1);
    let hi = idxFanout(idx, sha[0]);
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const c = idxCompare(idx, mid, sha);
      if (!c) return mid;
      if (c < 0) lo = mid + 1; else hi = mid;
    }
    return -1;
  }

  function entryEnd(pack, offset) {
    const s = pack.idx.sorted;
    let lo = 0;
    let hi = s.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (s[mid] === offset) return mid + 1 < s.length ? s[mid + 1] : pack.file.size - 20;
      if (s[mid] < offset) lo = mid + 1; else hi = mid - 1;
    }
    return pack.file.size - 20;
  }

  /* ── Depo ── */
  async function openRepo() {
    const fs = fsApi();
    if (!fs || !fs.isMounted()) return null;
    const head = await fs.readText(GIT_DIR + '/HEAD');
    if (!head) return null;
    const packs = [];
    const entries = await fs.list(GIT_DIR + '/objects/pack');
    for (const e of entries) {
      if (e.kind !== 'file' || !/\.idx$/i.test(e.name)) continue;
      const base = GIT_DIR + '/objects/pack/' + e.name.replace(/\.idx$/i, '');
      const [idxBytes, file] = await Promise.all([fs.readBytes(base + '.idx'), fs.file(base + '.pack')]);
      const idx = idxBytes && parseIdx(idxBytes);
      if (idx && file) packs.push({ idx, file, name: e.name });
    }
    const packedRefs = new Map();
    const pr = await fs.readText(GIT_DIR + '/packed-refs');
    (pr || '').split(/\r?\n/).forEach(line => {
      const m = line.match(/^([0-9a-f]{40}) (\S+)$/);
      if (m) packedRefs.set(m[2], m[1]);
    });
    return { packs, packedRefs };
  }

  async function getRepo() {
    if (repo) return repo;
    if (!repoPromise) repoPromise = openRepo().catch(() => null);
    repo = await repoPromise;
    repoPromise = null;
    return repo;
  }

  function reset() {
    repo = null;
    repoPromise = null;
    objCache.clear();
    commitCache.clear();
    treeCache.clear();
  }

  function applyDelta(base, delta) {
    let p = 0;
    const varint = () => {
      let v = 0;
      let shift = 0;
      let c;
      do { c = delta[p++]; v += (c & 0x7f) * Math.pow(2, shift); shift += 7; } while (c & 0x80);
      return v;
    };
    const baseSize = varint();
    if (baseSize !== base.length) throw new Error('delta taban boyutu uyuşmuyor');
    const out = new Uint8Array(varint());
    let o = 0;
    while (p < delta.length) {
      const op = delta[p++];
      if (op & 0x80) {
        let off = 0;
        let size = 0;
        if (op & 1) off |= delta[p++];
        if (op & 2) off |= delta[p++] << 8;
        if (op & 4) off |= delta[p++] << 16;
        if (op & 8) off = off + delta[p++] * 16777216;
        if (op & 16) size |= delta[p++];
        if (op & 32) size |= delta[p++] << 8;
        if (op & 64) size |= delta[p++] << 16;
        if (!size) size = 0x10000;
        out.set(base.subarray(off, off + size), o);
        o += size;
      } else if (op) {
        out.set(delta.subarray(p, p + op), o);
        o += op;
        p += op;
      } else {
        throw new Error('geçersiz delta komutu');
      }
    }
    return out;
  }

  async function readPackEntry(pack, offset) {
    const key = pack.name + ':' + offset;
    if (objCache.has(key)) return objCache.get(key);
    const end = entryEnd(pack, offset);
    const raw = new Uint8Array(await pack.file.slice(offset, end).arrayBuffer());
    let p = 0;
    let c = raw[p++];
    const type = (c >> 4) & 7;
    while (c & 0x80) c = raw[p++];
    let result;
    if (type === 6) {
      c = raw[p++];
      let ofs = c & 0x7f;
      while (c & 0x80) { c = raw[p++]; ofs = (ofs + 1) * 128 + (c & 0x7f); }
      const base = await readPackEntry(pack, offset - ofs);
      result = { type: base.type, data: applyDelta(base.data, await inflate(raw.subarray(p))) };
    } else if (type === 7) {
      const baseSha = hex(raw.subarray(p, p + 20));
      p += 20;
      const base = await readObject(baseSha);
      if (!base) throw new Error('delta tabanı yok: ' + baseSha);
      result = { type: base.type, data: applyDelta(base.data, await inflate(raw.subarray(p))) };
    } else {
      result = { type, data: await inflate(raw.subarray(p)) };
    }
    cachePut(objCache, key, result, 3000);
    return result;
  }

  async function readObject(sha) {
    const r = await getRepo();
    if (!r || !/^[0-9a-f]{40}$/.test(sha)) return null;
    const bin = unhex(sha);
    for (const pack of r.packs) {
      const i = idxFind(pack.idx, bin);
      if (i >= 0) return readPackEntry(pack, pack.idx.offsets[i]);
    }
    const loose = await fsApi().readBytes(`${GIT_DIR}/objects/${sha.slice(0, 2)}/${sha.slice(2)}`);
    if (!loose) return null;
    const raw = await inflate(loose);
    const z = raw.indexOf(0);
    const kind = td.decode(raw.subarray(0, z)).split(' ')[0];
    return { type: TYPES[kind] || 0, data: raw.subarray(z + 1) };
  }

  /* ── Nesneler ── */
  async function readCommit(sha) {
    if (!sha) return null;
    if (commitCache.has(sha)) return commitCache.get(sha);
    const o = await readObject(sha);
    if (!o || o.type !== TYPES.commit) return null;
    const text = td.decode(o.data);
    const cut = text.indexOf('\n\n');
    const head = cut < 0 ? text : text.slice(0, cut);
    const msg = cut < 0 ? '' : text.slice(cut + 2);
    const c = { sha, tree: '', parents: [], ct: 0, subject: '' };
    head.split('\n').forEach(line => {
      if (line.startsWith('tree ')) c.tree = line.slice(5).trim();
      else if (line.startsWith('parent ')) c.parents.push(line.slice(7).trim());
      else if (line.startsWith('committer ')) {
        const m = line.match(/ (\d+) [+-]\d{4}$/);
        if (m) c.ct = Number(m[1]);
      }
    });
    c.subject = (msg.split(/\n[ \t]*\n/)[0] || '').replace(/\s*\n\s*/g, ' ').trim();
    cachePut(commitCache, sha, c, 5000);
    return c;
  }

  async function readTree(sha) {
    if (!sha) return null;
    if (treeCache.has(sha)) return treeCache.get(sha);
    const o = await readObject(sha);
    if (!o || o.type !== TYPES.tree) return null;
    const d = o.data;
    const map = new Map();
    let i = 0;
    while (i < d.length) {
      const sp = d.indexOf(0x20, i);
      const nul = d.indexOf(0, sp);
      const mode = td.decode(d.subarray(i, sp));
      const name = nfc(td.decode(d.subarray(sp + 1, nul)));
      map.set(name, { mode, sha: hex(d.subarray(nul + 1, nul + 21)), isTree: mode === '40000' || mode === '040000' });
      i = nul + 21;
    }
    cachePut(treeCache, sha, map, 5000);
    return map;
  }

  /* tree içinde yolun nesnesi: { sha, isTree } | null ('' → kök ağacın kendisi) */
  async function entryAtPath(treeSha, rel) {
    let cur = { sha: treeSha, isTree: true };
    for (const part of nfc(rel).split('/').filter(Boolean)) {
      if (!cur.isTree) return null;
      const t = await readTree(cur.sha);
      const e = t && t.get(part);
      if (!e) return null;
      cur = e;
    }
    return cur;
  }

  /* Ağaçtaki tüm dosyalar: Map(göreli yol → blob sha) */
  async function listTree(treeSha, prefix, out = new Map()) {
    const t = await readTree(treeSha);
    if (!t) return out;
    for (const [name, e] of t) {
      const p = prefix ? prefix + '/' + name : name;
      if (e.isTree) await listTree(e.sha, p, out);
      else if (!/^160000$/.test(e.mode)) out.set(p, e.sha);
    }
    return out;
  }

  /* Değişen dosya yolları (yeni ↔ eski ağaç), alt ağaçlara yalnız sha farklıysa inilir. */
  async function diffTrees(newSha, oldSha, prefix, out) {
    if (newSha === oldSha) return out;
    const a = newSha ? (await readTree(newSha)) || new Map() : new Map();
    const b = oldSha ? (await readTree(oldSha)) || new Map() : new Map();
    for (const [name, ea] of a) {
      const eb = b.get(name);
      if (eb && eb.sha === ea.sha && eb.mode === ea.mode) continue;
      const p = prefix ? prefix + '/' + name : name;
      if (ea.isTree || (eb && eb.isTree)) {
        await diffTrees(ea.isTree ? ea.sha : null, eb && eb.isTree ? eb.sha : null, p, out);
        if (!ea.isTree || (eb && !eb.isTree)) out.add(p);
      } else {
        out.add(p);
      }
    }
    for (const [name, eb] of b) {
      if (a.has(name)) continue;
      const p = prefix ? prefix + '/' + name : name;
      if (eb.isTree) await diffTrees(null, eb.sha, p, out);
      else out.add(p);
    }
    return out;
  }

  /* ── Ref çözümleme ── */
  async function resolveName(name, depth = 0) {
    if (depth > 8) return null;
    const t = await fsApi().readText(GIT_DIR + '/' + name);
    if (t != null) {
      const s = t.trim();
      return s.startsWith('ref: ') ? resolveName(s.slice(5).trim(), depth + 1) : (/^[0-9a-f]{40}$/.test(s) ? s : null);
    }
    const r = await getRepo();
    return (r && r.packedRefs.get(name)) || null;
  }

  async function expandPrefix(prefix) {
    const r = await getRepo();
    if (!r) return null;
    const p = prefix.toLowerCase();
    const hits = new Set();
    const first = parseInt(p.slice(0, 2), 16);
    for (const pack of r.packs) {
      for (let i = idxFanout(pack.idx, first - 1); i < idxFanout(pack.idx, first); i++) {
        const h = hex(pack.idx.buf.subarray(pack.idx.shaOff + i * 20, pack.idx.shaOff + i * 20 + 20));
        if (h.startsWith(p)) hits.add(h);
      }
    }
    for (const e of await fsApi().list(`${GIT_DIR}/objects/${p.slice(0, 2)}`)) {
      const h = p.slice(0, 2) + e.name;
      if (h.startsWith(p)) hits.add(h);
    }
    return hits.size === 1 ? [...hits][0] : null;
  }

  async function resolveRef(ref) {
    let s = String(ref || '').trim();
    const tilde = s.match(/^(.+?)~(\d+)$/);
    if (tilde) {
      let sha = await resolveRef(tilde[1]);
      for (let i = 0; i < Number(tilde[2]) && sha; i++) {
        const c = await readCommit(sha);
        sha = c && c.parents[0];
      }
      return sha || null;
    }
    if (/^[0-9a-f]{40}$/i.test(s)) return s.toLowerCase();
    if (s === 'HEAD') return resolveName('HEAD');
    if (/^[0-9a-f]{4,39}$/i.test(s)) {
      const full = await expandPrefix(s);
      if (full) return full;
    }
    if (!s.startsWith('refs/')) {
      for (const cand of ['refs/heads/' + s, 'refs/tags/' + s, 'refs/remotes/' + s]) {
        const sha = await resolveName(cand);
        if (sha) return sha;
      }
      return null;
    }
    return resolveName(s);
  }

  /* ── Geçmiş ──
   `git log -- <yol>` gibi: tarih sırasıyla yürür; birleştirmede yolu aynı
   bırakan (TREESAME) ebeveyn varsa yalnız o izlenir ve birleştirme gösterilmez. */
  async function walkPathHistory(dirRel, onCommit) {
    const head = await resolveRef('HEAD');
    const start = head && await readCommit(head);
    if (!start) return;
    const pathSha = async (c) => {
      const e = c ? await entryAtPath(c.tree, dirRel) : null;
      return e ? e.sha : null;
    };
    const seen = new Set([head]);
    const queue = [start];
    while (queue.length) {
      queue.sort((a, b) => b.ct - a.ct);
      const c = queue.shift();
      const mine = await pathSha(c);
      const parents = (await Promise.all(c.parents.map(readCommit))).filter(Boolean);
      let follow = parents;
      let show;
      if (!parents.length) {
        show = !!mine;
      } else {
        const shas = await Promise.all(parents.map(pathSha));
        const same = parents.find((p, i) => shas[i] === mine);
        show = !same && (!!mine || shas.some(Boolean));
        if (same) follow = [same];
      }
      if (show && (await onCommit(c, parents)) === false) return;
      for (const p of follow) {
        if (!seen.has(p.sha)) { seen.add(p.sha); queue.push(p); }
      }
    }
  }

  async function available() {
    try { return !!(await getRepo()) && !!(await resolveRef('HEAD')); } catch (e) { return false; }
  }

  async function headCommit() {
    try { return (await resolveRef('HEAD')) || ''; } catch (e) { return ''; }
  }

  /* dirRel'e dokunan son n commit — [{ hash, short, ts, subject }] */
  async function logForPath(dirRel, n = 40) {
    const out = [];
    await walkPathHistory(dirRel, (c) => {
      out.push({ hash: c.sha, short: c.sha.slice(0, 7), ts: c.ct, subject: c.subject });
      return out.length < n;
    });
    return out;
  }

  /* dirRel altındaki her dosyanın son commit zamanı (sn) — Map(rel → ts).
     Birleştirme commit'leri sayılmaz (git log --name-only gibi). */
  async function lastCommitTimes(dirRel) {
    const map = new Map();
    const base = nfc(dirRel);
    await walkPathHistory(dirRel, async (c, parents) => {
      if (parents.length > 1) return true;
      const [mine, prev] = await Promise.all([
        entryAtPath(c.tree, base),
        parents[0] ? entryAtPath(parents[0].tree, base) : null
      ]);
      const changed = await diffTrees(mine && mine.isTree ? mine.sha : null, prev && prev.isTree ? prev.sha : null, base, new Set());
      changed.forEach(p => { if (!map.has(p)) map.set(p, c.ct); });
      return true;
    });
    return map;
  }

  async function blobSha(bytes) {
    const head = te.encode(`blob ${bytes.length}\0`);
    const all = new Uint8Array(head.length + bytes.length);
    all.set(head);
    all.set(bytes, head.length);
    return hex(new Uint8Array(await crypto.subtle.digest('SHA-1', all)));
  }

  /* HEAD'den farklı veya izlenmeyen dosyalar (yalnız verilen yollar) — Set(rel) */
  async function dirtyFiles(rels) {
    const set = new Set();
    const head = await resolveRef('HEAD');
    const c = head && await readCommit(head);
    for (const rel of rels) {
      const bytes = await fsApi().readBytes(rel);
      if (!bytes) continue;
      const e = c ? await entryAtPath(c.tree, rel) : null;
      if (!e || e.isTree || e.sha !== await blobSha(bytes)) set.add(rel);
    }
    return set;
  }

  /* ── Satır farkı (Myers) ──
     Yeni dosyada değişen satırlar (1 tabanlı), `git diff -U0` hunk'larıyla aynı kural:
     eklenen/değişen satırlar; yalnız silme varsa silinen yerin hemen üstündeki satır. */
  function splitLines(text) {
    const lines = String(text).split(/\r?\n/);
    const eol = lines.length > 1 && lines[lines.length - 1] === '';
    if (eol) lines.pop();
    return { lines, eol };
  }

  /* git xdiff'in Myers uygulaması (xdl_recs_cmp + xdl_split): iki yönlü orta yılan,
     böl ve yönet; maliyet sınırı aşılınca git'in sezgisel bölmesi. Böylece
     değişen satırlar `git diff` ile aynı çıkar. ha1/ha2: satır sınıf numaraları,
     r1/r2: azaltılmış dizinin dosyadaki satır no'su, c1/c2: değişiklik bayrakları. */
  const SNAKE_CNT = 20;
  const K_HEUR = 4;
  const LINE_MAX = Number.MAX_SAFE_INTEGER;

  function xdlSplit(ha1, off1, lim1, ha2, off2, lim2, kvdf, kvdb, kf, kb, needMin, spl, env) {
    const dmin = off1 - lim2;
    const dmax = lim1 - off2;
    const fmid = off1 - off2;
    const bmid = lim1 - lim2;
    const odd = (fmid - bmid) & 1;
    let fmin = fmid;
    let fmax = fmid;
    let bmin = bmid;
    let bmax = bmid;
    kvdf[kf + fmid] = off1;
    kvdb[kb + bmid] = lim1;
    for (let ec = 1; ; ec++) {
      let gotSnake = false;
      if (fmin > dmin) kvdf[kf + --fmin - 1] = -1; else ++fmin;
      if (fmax < dmax) kvdf[kf + ++fmax + 1] = -1; else --fmax;
      for (let d = fmax; d >= fmin; d -= 2) {
        let i1 = kvdf[kf + d - 1] >= kvdf[kf + d + 1] ? kvdf[kf + d - 1] + 1 : kvdf[kf + d + 1];
        const prev1 = i1;
        let i2 = i1 - d;
        for (; i1 < lim1 && i2 < lim2 && ha1[i1] === ha2[i2]; i1++, i2++);
        if (i1 - prev1 > SNAKE_CNT) gotSnake = true;
        kvdf[kf + d] = i1;
        if (odd && bmin <= d && d <= bmax && kvdb[kb + d] <= i1) {
          spl.i1 = i1; spl.i2 = i2; spl.minLo = spl.minHi = true;
          return;
        }
      }
      if (bmin > dmin) kvdb[kb + --bmin - 1] = LINE_MAX; else ++bmin;
      if (bmax < dmax) kvdb[kb + ++bmax + 1] = LINE_MAX; else --bmax;
      for (let d = bmax; d >= bmin; d -= 2) {
        let i1 = kvdb[kb + d - 1] < kvdb[kb + d + 1] ? kvdb[kb + d - 1] : kvdb[kb + d + 1] - 1;
        const prev1 = i1;
        let i2 = i1 - d;
        for (; i1 > off1 && i2 > off2 && ha1[i1 - 1] === ha2[i2 - 1]; i1--, i2--);
        if (prev1 - i1 > SNAKE_CNT) gotSnake = true;
        kvdb[kb + d] = i1;
        if (!odd && fmin <= d && d <= fmax && i1 <= kvdf[kf + d]) {
          spl.i1 = i1; spl.i2 = i2; spl.minLo = spl.minHi = true;
          return;
        }
      }
      if (needMin) continue;
      if (gotSnake && ec > env.heurMin) {
        let best = 0;
        for (let d = fmax; d >= fmin; d -= 2) {
          const dd = d > fmid ? d - fmid : fmid - d;
          const i1 = kvdf[kf + d];
          const i2 = i1 - d;
          const v = (i1 - off1) + (i2 - off2) - dd;
          if (v > K_HEUR * ec && v > best && off1 + SNAKE_CNT <= i1 && i1 < lim1 && off2 + SNAKE_CNT <= i2 && i2 < lim2) {
            for (let k = 1; ha1[i1 - k] === ha2[i2 - k]; k++) {
              if (k === SNAKE_CNT) { best = v; spl.i1 = i1; spl.i2 = i2; break; }
            }
          }
        }
        if (best > 0) { spl.minLo = true; spl.minHi = false; return; }
        best = 0;
        for (let d = bmax; d >= bmin; d -= 2) {
          const dd = d > bmid ? d - bmid : bmid - d;
          const i1 = kvdb[kb + d];
          const i2 = i1 - d;
          const v = (lim1 - i1) + (lim2 - i2) - dd;
          if (v > K_HEUR * ec && v > best && off1 < i1 && i1 <= lim1 - SNAKE_CNT && off2 < i2 && i2 <= lim2 - SNAKE_CNT) {
            for (let k = 0; ha1[i1 + k] === ha2[i2 + k]; k++) {
              if (k === SNAKE_CNT - 1) { best = v; spl.i1 = i1; spl.i2 = i2; break; }
            }
          }
        }
        if (best > 0) { spl.minLo = false; spl.minHi = true; return; }
      }
      if (ec >= env.mxcost) {
        let fbest = -1;
        let fbest1 = -1;
        for (let d = fmax; d >= fmin; d -= 2) {
          let i1 = Math.min(kvdf[kf + d], lim1);
          let i2 = i1 - d;
          if (lim2 < i2) { i1 = lim2 + d; i2 = lim2; }
          if (fbest < i1 + i2) { fbest = i1 + i2; fbest1 = i1; }
        }
        let bbest = LINE_MAX;
        let bbest1 = LINE_MAX;
        for (let d = bmax; d >= bmin; d -= 2) {
          let i1 = Math.max(off1, kvdb[kb + d]);
          let i2 = i1 - d;
          if (i2 < off2) { i1 = off2 + d; i2 = off2; }
          if (i1 + i2 < bbest) { bbest = i1 + i2; bbest1 = i1; }
        }
        if ((lim1 + lim2) - bbest < fbest - (off1 + off2)) {
          spl.i1 = fbest1; spl.i2 = fbest - fbest1; spl.minLo = true; spl.minHi = false;
        } else {
          spl.i1 = bbest1; spl.i2 = bbest - bbest1; spl.minLo = false; spl.minHi = true;
        }
        return;
      }
    }
  }

  function xdlRecsCmp(X, off1, lim1, off2, lim2, needMin) {
    const { ha1, ha2 } = X;
    for (; off1 < lim1 && off2 < lim2 && ha1[off1] === ha2[off2]; off1++, off2++);
    for (; off1 < lim1 && off2 < lim2 && ha1[lim1 - 1] === ha2[lim2 - 1]; lim1--, lim2--);
    if (off1 === lim1) {
      for (; off2 < lim2; off2++) X.c2[X.r2[off2] + 1] = 1;
    } else if (off2 === lim2) {
      for (; off1 < lim1; off1++) X.c1[X.r1[off1] + 1] = 1;
    } else {
      const spl = { i1: 0, i2: 0, minLo: false, minHi: false };
      xdlSplit(ha1, off1, lim1, ha2, off2, lim2, X.kvdf, X.kvdb, X.kf, X.kb, needMin, spl, X.env);
      xdlRecsCmp(X, off1, spl.i1, off2, spl.i2, spl.minLo);
      xdlRecsCmp(X, spl.i1, lim1, spl.i2, lim2, spl.minHi);
    }
  }

  /* git xdiff'in hunk sıkıştırması (xdl_change_compact) ve girinti sezgisi
     (diff.indentHeuristic, varsayılan açık): eşit satırlar üzerinde kaydırılabilen
     değişiklik grupları birleştirilir ve git'in seçtiği konuma yerleştirilir.
     chg dizilerinde satır i → chg[i + 1]; chg[0] ve chg[n + 1] daima 0 (sınır). */
  const MAX_INDENT = 200;
  const MAX_BLANKS = 20;
  const MAX_SLIDING = 100;

  function getIndent(s) {
    let ret = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === ' ') ret += 1;
      else if (c === '\t') ret += 8 - (ret % 8);
      else if (c !== '\n' && c !== '\r' && c !== '\v' && c !== '\f') return ret;
      if (ret >= MAX_INDENT) return MAX_INDENT;
    }
    return -1;
  }

  function measureSplit(recs, split) {
    const n = recs.length;
    const m = { eof: split >= n, indent: split >= n ? -1 : getIndent(recs[split]), preBlank: 0, preIndent: -1, postBlank: 0, postIndent: -1 };
    for (let i = split - 1; i >= 0; i--) {
      m.preIndent = getIndent(recs[i]);
      if (m.preIndent !== -1) break;
      if (++m.preBlank === MAX_BLANKS) { m.preIndent = 0; break; }
    }
    for (let i = split + 1; i < n; i++) {
      m.postIndent = getIndent(recs[i]);
      if (m.postIndent !== -1) break;
      if (++m.postBlank === MAX_BLANKS) { m.postIndent = 0; break; }
    }
    return m;
  }

  function scoreAddSplit(m, s) {
    if (m.preIndent === -1 && m.preBlank === 0) s.pen += 1;          // dosya başı
    if (m.eof) s.pen += 21;                                         // dosya sonu
    const postBlank = m.indent === -1 ? 1 + m.postBlank : 0;
    const totalBlank = m.preBlank + postBlank;
    s.pen += -30 * totalBlank + 6 * postBlank;
    const indent = m.indent !== -1 ? m.indent : m.postIndent;
    const anyBlanks = totalBlank !== 0;
    s.ei += indent;
    if (indent === -1 || m.preIndent === -1) return;
    if (indent > m.preIndent) s.pen += anyBlanks ? 10 : -4;
    else if (indent < m.preIndent) {
      if (m.postIndent !== -1 && m.postIndent > indent) s.pen += anyBlanks ? 17 : 24;
      else s.pen += anyBlanks ? 17 : 23;
    }
  }

  function scoreCmp(a, b) {
    return 60 * ((a.ei > b.ei) - (a.ei < b.ei)) + (a.pen - b.pen);
  }

  function compact(recs, chg, ochg, on) {
    const n = recs.length;
    const g = { start: 0, end: 0 };
    const go = { start: 0, end: 0 };
    const init = (ch, gg) => { gg.start = gg.end = 0; while (ch[gg.end + 1]) gg.end++; };
    const next = (ch, gg, N) => {
      if (gg.end === N) return true;
      gg.start = gg.end + 1;
      gg.end = gg.start;
      while (ch[gg.end + 1]) gg.end++;
      return false;
    };
    const prev = (ch, gg) => {
      if (gg.start === 0) return true;
      gg.end = gg.start - 1;
      gg.start = gg.end;
      while (ch[gg.start]) gg.start--;
      return false;
    };
    const slideDown = () => {
      if (g.end < n && recs[g.start] === recs[g.end]) {
        chg[g.start + 1] = 0; g.start++;
        chg[g.end + 1] = 1; g.end++;
        while (chg[g.end + 1]) g.end++;
        return false;
      }
      return true;
    };
    const slideUp = () => {
      if (g.start > 0 && recs[g.start - 1] === recs[g.end - 1]) {
        g.start--; chg[g.start + 1] = 1;
        g.end--; chg[g.end + 1] = 0;
        while (chg[g.start]) g.start--;
        return false;
      }
      return true;
    };
    const sync = (broken) => { if (broken) throw new Error('diff grup eşlemesi bozuldu'); };

    init(chg, g);
    init(ochg, go);
    for (;;) {
      if (g.end !== g.start) {
        let groupsize;
        let earliestEnd;
        let endMatchingOther;
        do {
          groupsize = g.end - g.start;
          endMatchingOther = -1;
          while (!slideUp()) sync(prev(ochg, go));
          earliestEnd = g.end;
          if (go.end > go.start) endMatchingOther = g.end;
          for (;;) {
            if (slideDown()) break;
            sync(next(ochg, go, on));
            if (go.end > go.start) endMatchingOther = g.end;
          }
        } while (groupsize !== g.end - g.start);

        if (g.end === earliestEnd) {
          /* kaydırılamaz */
        } else if (endMatchingOther !== -1) {
          while (go.end === go.start) { sync(slideUp()); sync(prev(ochg, go)); }
        } else {
          let shift = Math.max(earliestEnd, g.end - groupsize - 1, g.end - MAX_SLIDING);
          let bestShift = -1;
          let best = null;
          for (; shift <= g.end; shift++) {
            const score = { ei: 0, pen: 0 };
            scoreAddSplit(measureSplit(recs, shift), score);
            scoreAddSplit(measureSplit(recs, shift - groupsize), score);
            if (bestShift === -1 || scoreCmp(score, best) <= 0) { best = score; bestShift = shift; }
          }
          while (g.end > bestShift) { sync(slideUp()); sync(prev(ochg, go)); }
        }
      }
      if (next(chg, g, n)) break;
      sync(next(ochg, go, on));
    }
  }

  /* xdiff ön temizliği (xdl_cleanup_records): diğer dosyada hiç geçmeyen satırlar
     doğrudan değişmiş sayılır; çok sık geçen satırlar (boş satır gibi) eşleşmesiz
     satırların ortasındaysa karşılaştırmadan çıkarılır. */
  function bogosqrt(n) {
    let i = 1;
    for (; n > 0; n = Math.floor(n / 4)) i *= 2;
    return i;
  }

  function cleanMmatch(dis, i, s, e) {
    if (i - s > 100) s = i - 100;
    if (e - i > 100) e = i + 100;
    let rdis0 = 0;
    let rpdis0 = 1;
    for (let r = 1; i - r >= s; r++) {
      if (!dis[i - r]) rdis0++;
      else if (dis[i - r] === 2) rpdis0++;
      else break;
    }
    if (!rdis0) return false;
    let rdis1 = 0;
    let rpdis1 = 1;
    for (let r = 1; i + r <= e; r++) {
      if (!dis[i + r]) rdis1++;
      else if (dis[i + r] === 2) rpdis1++;
      else break;
    }
    if (!rdis1) return false;
    rdis1 += rdis0;
    rpdis1 += rpdis0;
    return rpdis1 * 4 < rpdis1 + rdis1;
  }

  function keptLines(lines, s, e, otherCount, chg) {
    const mlim = Math.min(bogosqrt(lines.length), 1024);
    const dis = new Uint8Array(lines.length + 1);
    for (let i = s; i <= e; i++) {
      const nm = otherCount.get(lines[i]) || 0;
      dis[i] = nm === 0 ? 0 : (nm >= mlim ? 2 : 1);
    }
    const keep = [];
    for (let i = s; i <= e; i++) {
      if (dis[i] === 1 || (dis[i] === 2 && !cleanMmatch(dis, i, s, e))) keep.push(i);
      else chg[i + 1] = 1;
    }
    return keep;
  }

  /* Satır dizileri → değişiklik bayrakları (ön temizlik + xdiff Myers + sıkıştırma) */
  function diffFlags(a, b) {
    const n = a.length;
    const m = b.length;
    const ca = new Uint8Array(n + 2);
    const cb = new Uint8Array(m + 2);
    let pre = 0;
    while (pre < n && pre < m && a[pre] === b[pre]) pre++;
    let suf = 0;
    while (suf < n - pre && suf < m - pre && a[n - 1 - suf] === b[m - 1 - suf]) suf++;
    const count = (lines) => {
      const c = new Map();
      lines.forEach(l => c.set(l, (c.get(l) || 0) + 1));
      return c;
    };
    const k1 = keptLines(a, pre, n - suf - 1, count(b), ca);
    const k2 = keptLines(b, pre, m - suf - 1, count(a), cb);
    const ids = new Map();
    const id = (l) => { let v = ids.get(l); if (v === undefined) { v = ids.size; ids.set(l, v); } return v; };
    const ha1 = Int32Array.from(k1, i => id(a[i]));
    const ha2 = Int32Array.from(k2, j => id(b[j]));
    const ndiags = ha1.length + ha2.length + 3;
    const kvd = new Float64Array(2 * ndiags + 2);
    const env = { mxcost: Math.max(bogosqrt(ndiags), 256), heurMin: 256 };
    xdlRecsCmp({ ha1, ha2, r1: k1, r2: k2, c1: ca, c2: cb, kvdf: kvd, kvdb: kvd, kf: ha2.length + 1, kb: ndiags + ha2.length + 1, env },
      0, ha1.length, 0, ha2.length, false);
    compact(a, ca, cb, m);
    compact(b, cb, ca, n);
    return { ca, cb };
  }

  /* Yeni dosyada değişen satırlar (1 tabanlı), `git diff -U0` hunk'larıyla aynı kural:
     eklenen/değişen satırlar; yalnız silme varsa silinen yerin hemen üstündeki satır. */
  function diffChangedLines(oldText, newText) {
    const A = splitLines(oldText);
    const B = splitLines(newText);
    const a = A.lines;
    const b = B.lines;
    // Son satırdaki "satır sonu yok" farkı git'te o satırı değişmiş sayar.
    if (A.eol !== B.eol && a.length && b.length) a[a.length - 1] += '\u0000';
    const { ca, cb } = diffFlags(a, b);
    const changed = new Set();
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
      if (!ca[i + 1] && !cb[j + 1]) { i++; j++; continue; }
      const j0 = j;
      while (i < a.length && ca[i + 1]) i++;
      while (j < b.length && cb[j + 1]) j++;
      if (j > j0) for (let k = j0; k < j; k++) changed.add(k + 1);
      else changed.add(Math.max(1, j0));
    }
    return changed;
  }

  /* ref ile çalışma ağacı arasındaki değişen satırlar — Map(rel → Set(satır no)).
     Ref'te olmayan (yeni) metin dosyalarında tüm satırlar değişmiş sayılır. */
  async function changedLines(ref, dirRel) {
    const sha = await resolveRef(ref);
    const c = sha && await readCommit(sha);
    if (!c) return null;
    const base = nfc(dirRel);
    const dir = await entryAtPath(c.tree, base);
    const old = dir && dir.isTree ? await listTree(dir.sha, base) : new Map();
    const fs = fsApi();
    const work = await fs.walk(dirRel, {
      filter: (name) => /\.md$/i.test(name) || /(^|\s)DATA$/.test(name),
      skipDir: (name) => /^(assets|backup)$/i.test(name) || name.startsWith('.')
    });
    const map = new Map();
    for (const rel of work) {
      const bytes = await fs.readBytes(rel);
      if (!bytes) continue;
      const text = tdRaw.decode(bytes);
      const oldSha = old.get(nfc(rel));
      if (!oldSha) {
        const n = splitLines(text).lines.length;
        map.set(rel, new Set(Array.from({ length: n }, (_, i) => i + 1)));
        continue;
      }
      if (oldSha === await blobSha(bytes)) continue;
      const o = await readObject(oldSha);
      if (!o) continue;
      const lines = diffChangedLines(tdRaw.decode(o.data), text);
      if (lines.size) map.set(rel, lines);
    }
    return map;
  }

  /* Okuma hatasında (ör. git gc ile pack değişti) önbelleği tazeleyip bir kez yeniden dener. */
  function guarded(fn, fallback) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        reset();
        try { return await fn(...args); } catch (e2) { console.warn('git:', e2.message); return fallback; }
      }
    };
  }

  const api = {
    reset,
    available,
    headCommit,
    resolveRef: guarded(resolveRef, null),
    logForPath: guarded(logForPath, []),
    lastCommitTimes: guarded(lastCommitTimes, new Map()),
    dirtyFiles: guarded(dirtyFiles, new Set()),
    changedLines: guarded(changedLines, null),
    readBlobAt: guarded(async (ref, rel) => {
      const sha = await resolveRef(ref);
      const c = sha && await readCommit(sha);
      const e = c && await entryAtPath(c.tree, rel);
      const o = e && !e.isTree ? await readObject(e.sha) : null;
      return o ? o.data : null;
    }, null),
    blobSha,
    diffChangedLines
  };
  return api;
})();

if (typeof module === 'object' && module.exports) module.exports = DXGit;
