/* Malzeme Listesi programı. Projeler veritabanındadır: KUTU/projeler/<klasör>/ altında proje.json ve pafta HTML'i.
   Pafta Claude tarafından kurallar/KURALLAR.md'ye göre üretilir; program listeler, açar, sürümler ve yeni proje isteğini tutar.
   Klasörde proje.json yoksa bilgiler klasör adından (seri-firma-model) okunur. */

(() => {
  'use strict';

  const KOK = 'KUTU/projeler/';
  const KAYNAK = 'KUTU/kaynaklar/';
  const LISTE_KAPALI = 'kbn-liste-kapali';
  const $ = (id) => document.getElementById(id);

  let db = null;
  let projeler = [];
  let acik = null;
  let sayfa = 'projeler';
  /** Açık paftanın diskteki hâli: başka cihazdan değişince yeniden çizilir */
  let cizilenHash = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const boyut = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const tarih = (ms) => (ms ? new Date(ms).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
  const depoAdi = (s) => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim();

  let toastZaman = null;
  function toast(metin, hata) {
    const t = $('toast');
    t.textContent = metin;
    t.className = `toast${hata ? ' error' : ''}`;
    clearTimeout(toastZaman);
    toastZaman = setTimeout(() => t.classList.add('hidden'), hata ? 6500 : 3500);
  }

  function indir(ad, bayt, tur) {
    const url = URL.createObjectURL(new Blob([bayt], { type: tur || 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = ad;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  /* ─── Pencere ───────────────────────────────────────────── */

  function pencere(html, sinif) {
    const kok = $('modalRoot');
    kok.innerHTML = `<div class="modal-overlay"><div class="modal ${sinif || ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    const kapat = () => { kok.innerHTML = ''; };
    const ov = kok.firstElementChild;
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) kapat(); });
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') kapat(); });
    const ilk = ov.querySelector('[data-ilk]') || ov.querySelector('input, select, textarea, button');
    if (ilk) ilk.focus();
    return { kok: ov, kapat };
  }

  function onay(baslik, metin, evet) {
    return new Promise((tamam) => {
      const p = pencere(`<h2>${esc(baslik)}</h2><p>${esc(metin)}</p><div class="modal-actions"><button type="button" class="btn" data-a="0">Vazgeç</button><button type="button" class="btn btn-primary" data-a="1">${esc(evet)}</button></div>`);
      p.kok.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        p.kapat();
        tamam(b.dataset.a === '1');
      });
    });
  }

  /* ─── Projeleri okuma ───────────────────────────────────── */

  function adCoz(klasor) {
    const m = klasor.match(/^(\d{5,})-([^-]+)-(.+)$/);
    return m ? { seri: m[1], firma: m[2], model: m[3] } : { seri: '', firma: '', model: klasor };
  }

  async function yukle() {
    const rows = await db.list(KOK);
    const gruplar = new Map();
    for (const r of rows) {
      const parca = r.path.slice(KOK.length).split('/');
      if (!parca[0]) continue;
      if (!gruplar.has(parca[0])) gruplar.set(parca[0], { id: parca[0], dosyalar: [] });
      if (parca.length > 1 && r.kind === 'file') {
        gruplar.get(parca[0]).dosyalar.push({ yol: parca.slice(1).join('/'), path: r.path, size: r.size || 0, at: r.at, hash: r.hash });
      }
    }
    const liste = [];
    for (const g of gruplar.values()) {
      const meta = (await db.readJson(`${KOK}${g.id}/proje.json`)) || {};
      const ad = adCoz(g.id);
      const adlar = g.dosyalar.map((d) => d.yol);
      const pafta = meta.pafta && adlar.includes(meta.pafta)
        ? meta.pafta
        : adlar.find((y) => !y.includes('/') && /\.html?$/i.test(y)) || null;
      liste.push({
        id: g.id,
        seri: meta.seri != null ? meta.seri : ad.seri,
        firma: meta.firma != null ? meta.firma : ad.firma,
        model: meta.model || ad.model,
        pano: meta.pano || '',
        guc: meta.guc || '',
        akim: meta.akim || '',
        sira: meta.sira || 0,
        istek: meta.istek || null,
        meta,
        pafta,
        dosyalar: g.dosyalar,
        son: g.dosyalar.reduce((n, d) => Math.max(n, d.at || 0), 0)
      });
    }
    liste.sort((a, b) => b.sira - a.sira || b.son - a.son || a.id.localeCompare(b.id, 'tr'));
    projeler = liste;
    if (acik) acik = projeler.find((p) => p.id === acik.id) || null;
    kartlarCiz();
    yanCiz();
  }

  /* ─── Proje kartları ────────────────────────────────────── */

  function kartHtml(p) {
    const ust = p.seri || p.model;
    const alt = p.seri ? p.model : 'Seri no yok';
    const cipler = [];
    if (p.pano) cipler.push(`<span class="pc-chip has">Pano ${esc(p.pano)}</span>`);
    if (p.guc) cipler.push(`<span class="pc-chip">${esc(p.guc)}</span>`);
    if (p.akim) cipler.push(`<span class="pc-chip">${esc(p.akim)}</span>`);
    if (!p.pafta) cipler.push('<span class="pc-chip bekliyor">Pafta bekliyor</span>');
    return `<button type="button" class="project-card${p.pafta ? '' : ' bekliyor'}" data-id="${esc(p.id)}">
      <div class="pc-no">${esc(ust)}</div>
      <div class="pc-model">${esc(alt)}</div>
      <div class="pc-customer">${esc(p.firma || ' ')}</div>
      <div class="pc-chips">${cipler.join('')}</div>
      <div class="pc-meta">${p.son ? `Son kayıt ${tarih(p.son)}` : ''}</div>
    </button>`;
  }

  function kartlarCiz() {
    const q = $('projeAra').value.trim().toLocaleLowerCase('tr');
    const gorunen = projeler.filter((p) => !q || [p.seri, p.firma, p.model, p.id].join(' ').toLocaleLowerCase('tr').includes(q));
    $('projeSay').textContent = projeler.length || '';
    $('projeListe').innerHTML = gorunen.length
      ? gorunen.map(kartHtml).join('')
      : `<p class="home-empty">${projeler.length ? 'Eşleşen proje yok.' : 'Henüz proje yok. "+ Yeni Proje" ile başlayın ya da ana ekrandan "Klasörden aktar" ile mevcut paftaları alın.'}</p>`;
  }

  /* ─── Üst sekmeler ──────────────────────────────────────── */

  const DIS_SAYFA = { modeller: 'kurallar/panolar.html', kurallar: 'kurallar/kurallar.html' };

  function sayfaAc(ad) {
    sayfa = ad;
    for (const b of document.querySelectorAll('.home-tab')) b.classList.toggle('active', b.dataset.sayfa === ad);
    for (const k of ['projeler', 'modeller', 'kurallar', 'kaynaklar']) $(`s-${k}`).classList.toggle('hidden', k !== ad);
    if (DIS_SAYFA[ad]) {
      const kap = $(`s-${ad}`);
      if (!kap.firstElementChild) {
        const f = document.createElement('iframe');
        f.title = ad === 'modeller' ? 'Pano modelleri' : 'Kurallar';
        f.src = DIS_SAYFA[ad];
        kap.appendChild(f);
      }
      $('yeniSekme').href = DIS_SAYFA[ad];
    }
    $('yeniSekme').hidden = !DIS_SAYFA[ad];
    if (ad === 'kaynaklar') kaynaklarCiz();
  }

  /* ─── Kaynaklar ─────────────────────────────────────────── */

  async function kaynaklarCiz() {
    const rows = (await db.list(KAYNAK)).filter((r) => r.kind === 'file');
    $('kaynakSay').textContent = rows.length || '';
    if (sayfa !== 'kaynaklar') return;
    $('kaynakListe').innerHTML = rows.length
      ? rows.map((r) => `<div class="dosya-satir">
          <span class="dosya-ad" title="${esc(r.path.slice(KAYNAK.length))}">${esc(r.path.slice(KAYNAK.length))}</span>
          <span class="dosya-bilgi">${boyut(r.size || 0)} · ${tarih(r.at)}</span>
          <span class="dosya-eylem">
            <button type="button" class="btn btn-sm" data-indir="${esc(r.path)}">İndir</button>
            <button type="button" class="btn btn-sm btn-danger" data-sil="${esc(r.path)}">Sil</button>
          </span></div>`).join('')
      : '<p class="bos-yazi">Henüz kaynak dosya yok.</p>';
  }

  async function dosyaIndir(path) {
    try {
      const r = await db.read(path);
      if (!r) throw new Error('Dosya bulunamadı');
      indir(path.split('/').pop(), r.bytes);
    } catch (e) {
      toast(`İndirilemedi: ${e.message}`, true);
    }
  }

  /* ─── Pafta görünümü ────────────────────────────────────── */

  /* Pafta kâğıttır, açık renk kalır; yalnız çevresi koyu olur (baskıya etkisi yok).
     srcdoc içinde #bağlantılar ana sayfaya gideceği için sayfa içi kaydırma burada yapılır. */
  const EK_STIL = '<style>@media screen{html,body{background:#30343c !important}}</style>';
  const EK_BETIK = `<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href^="#"]');if(!a)return;e.preventDefault();var t=document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));if(t)t.scrollIntoView();});<\/script>`;

  function paftaHazirla(html) {
    const ek = EK_STIL + EK_BETIK;
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + ek) : ek + html;
  }

  function yanCiz() {
    $('yanListe').innerHTML = projeler.map((p) => `<button type="button" class="yan-oge" data-id="${esc(p.id)}"${acik && acik.id === p.id ? ' aria-current="page"' : ''}>
      <b>${esc(p.seri || p.model)}</b><span>${esc(p.seri ? [p.firma, p.model].filter(Boolean).join(' · ') : 'Seri no yok')}</span></button>`).join('');
  }

  function talimatYaz(p) {
    const i = p.istek || {};
    const satir = [
      'Elektrik panosu malzeme listesi hazırla (KUTU/kurallar/KURALLAR.md).',
      `Proje: ${p.id}`,
      p.seri ? `Seri no: ${p.seri}` : 'Seri no: yok',
      `Firma: ${p.firma || '-'}`,
      `Makine modeli: ${p.model}${i.modelTuru ? ` (${i.modelTuru})` : ''}`,
      `Pano ölçüsü: ${i.pano || p.pano || '-'} mm`
    ];
    if (i.emniyet) satir.push(`Emniyet rölesi: ${i.emniyet}`);
    if (i.opsiyonlar && i.opsiyonlar.length) satir.push(`Opsiyonlar: ${i.opsiyonlar.join(', ')}`);
    if (i.opsiyonListesi) satir.push(`Makine opsiyon listesi:\n${i.opsiyonListesi}`);
    if (i.yukler) satir.push(`Yükler:\n${i.yukler}`);
    if (i.notlar) satir.push(`Notlar:\n${i.notlar}`);
    satir.push(`Çıktı: veri/KUTU/projeler/${p.id}/${p.seri || depoAdi(p.model)}.html`);
    return satir.join('\n');
  }

  async function paftaCiz(p) {
    const alan = $('paftaAlan');
    alan.textContent = '';
    cizilenHash = null;
    if (!p.pafta) {
      alan.innerHTML = `<div class="pafta-bos"><div class="pafta-kart">
        <h2>Bu projenin paftası henüz yok</h2>
        <p>Pafta kurallara göre Claude ile hazırlanır. Aşağıdaki isteği Claude Code'a yapıştırın; Claude eksik soruları sorar ve paftayı yazar. Hazır olunca "Pafta yükle" ile buraya alın.</p>
        <pre class="talimat" id="talimat">${esc(talimatYaz(p))}</pre>
        <div class="pafta-eylem">
          <button type="button" class="btn btn-primary" id="talimatKopyala">İsteği kopyala</button>
          <button type="button" class="btn" id="paftaYukleBos">Pafta yükle</button>
        </div>
      </div></div>`;
      $('talimatKopyala').addEventListener('click', async () => {
        const metin = talimatYaz(p);
        try {
          await navigator.clipboard.writeText(metin);
          toast('İstek kopyalandı.');
        } catch {
          const ta = document.createElement('textarea');
          ta.value = metin;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          toast('İstek kopyalandı.');
        }
      });
      $('paftaYukleBos').addEventListener('click', () => $('paftaDosya').click());
      return;
    }
    try {
      const yol = `${KOK}${p.id}/${p.pafta}`;
      const kayit = await db.meta(yol);
      const html = await db.readText(yol);
      /* Her açılışta yeni iframe: geri tuşu projeler arasında dolaşır, iframe geçmişi birikmez */
      const f = document.createElement('iframe');
      f.title = p.id;
      f.setAttribute('allow', 'clipboard-read *; clipboard-write *');
      f.srcdoc = paftaHazirla(html);
      alan.appendChild(f);
      cizilenHash = kayit ? kayit.hash : null;
    } catch (e) {
      alan.innerHTML = `<div class="pafta-bos"><div class="pafta-kart"><h2>Pafta açılamadı</h2><p>${esc(e.message)}</p></div></div>`;
    }
  }

  function goster() {
    const h = decodeURIComponent(location.hash.slice(1));
    const p = h.startsWith('p/') ? projeler.find((x) => x.id === h.slice(2)) : null;
    acik = p || null;
    $('home').classList.toggle('hidden', !!p);
    $('gorunum').classList.toggle('hidden', !p);
    if (!p) {
      document.title = 'Malzeme Listesi';
      return;
    }
    $('gAd').textContent = p.seri ? `${p.seri} · ${p.model}` : p.model;
    $('gAlt').textContent = [p.firma, p.pano ? `Pano ${p.pano}` : '', p.guc, p.akim].filter(Boolean).join(' · ');
    $('gYeniSekme').disabled = !p.pafta;
    document.title = `${p.seri || p.model} · Malzeme Listesi`;
    yanCiz();
    const oge = $('yanListe').querySelector('[aria-current="page"]');
    if (oge) oge.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    paftaCiz(p);
  }

  function projeAc(id) {
    const hedef = `#${encodeURIComponent(`p/${id}`)}`;
    if (location.hash === hedef) goster();
    else location.hash = hedef;
  }

  /* ─── Dosyalar penceresi ────────────────────────────────── */

  function dosyalarAc(p) {
    const satirlar = p.dosyalar.slice().sort((a, b) => a.yol.localeCompare(b.yol, 'tr')).map((d) => `<div class="dosya-satir">
        <span class="dosya-ad" title="${esc(d.yol)}">${esc(d.yol)}${d.yol === p.pafta ? ' · pafta' : ''}</span>
        <span class="dosya-bilgi">${boyut(d.size)} · ${tarih(d.at)}</span>
        <span class="dosya-eylem">
          ${/\.html?$/i.test(d.yol) ? `<button type="button" class="btn btn-sm" data-ac="${esc(d.path)}">Aç</button>` : ''}
          <button type="button" class="btn btn-sm" data-indir="${esc(d.path)}">İndir</button>
        </span></div>`).join('');
    const w = pencere(`<h2>${esc(p.id)}</h2>
      <div class="dosya-liste">${satirlar || '<p class="bos-yazi">Dosya yok.</p>'}</div>
      <div class="pafta-eylem"><button type="button" class="btn btn-sm" id="dosyaEkle">Dosya ekle</button><input type="file" id="projeDosya" multiple hidden></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-danger" id="projeSil" style="margin-right:auto">Projeyi sil</button>
        <button type="button" class="btn" id="dosyaKapat">Kapat</button>
      </div>`, 'genis');
    w.kok.querySelector('#dosyaKapat').addEventListener('click', w.kapat);
    w.kok.querySelector('#dosyaEkle').addEventListener('click', () => w.kok.querySelector('#projeDosya').click());
    w.kok.querySelector('#projeDosya').addEventListener('change', async (e) => {
      for (const f of e.target.files) await db.write(`${KOK}${p.id}/${depoAdi(f.name)}`, new Uint8Array(await f.arrayBuffer()));
      w.kapat();
      await yukle();
      toast('Dosyalar eklendi.');
    });
    w.kok.querySelector('.dosya-liste').addEventListener('click', async (e) => {
      const i = e.target.closest('[data-indir]');
      if (i) return dosyaIndir(i.dataset.indir);
      const a = e.target.closest('[data-ac]');
      if (!a) return undefined;
      try {
        yeniSekmedeYaz(await db.readText(a.dataset.ac));
      } catch (err) {
        toast(`Açılamadı: ${err.message}`, true);
      }
      return undefined;
    });
    w.kok.querySelector('#projeSil').addEventListener('click', async () => {
      w.kapat();
      const evet = await onay('Projeyi sil', `${p.id} ve içindeki bütün dosyalar silinsin mi? Depoya gönderilmiş sürümler GitHub geçmişinde kalır.`, 'Sil');
      if (!evet) return;
      await db.remove(`${KOK}${p.id}`);
      location.hash = '';
      await yukle();
      toast('Proje silindi.');
    });
  }

  function yeniSekmedeYaz(html) {
    const w = window.open('');
    if (!w) {
      toast('Tarayıcı yeni sekmeyi engelledi. Bu sayfa için açılır pencereye izin verin.', true);
      return;
    }
    w.document.open();
    w.document.write(paftaHazirla(html));
    w.document.close();
  }

  /* ─── Pafta yükleme ─────────────────────────────────────── */

  function besleme(html) {
    const m = html.match(/<p class="supply">([^<]*)<\/p>/);
    const metin = m ? m[1].trim() : '';
    return {
      besleme: metin,
      pano: (metin.match(/Pano (\d+\s*[x×]\s*\d+(?:\s*[x×]\s*\d+)?)\s*mm/) || [])[1] || '',
      guc: (metin.match(/Tablo gücü ([\d.,]+ kW)/) || [])[1] || '',
      akim: (metin.match(/Tablo akımı ([\d.,]+ A)/) || [])[1] || ''
    };
  }

  async function paftaYukle(p, dosya) {
    const bayt = new Uint8Array(await dosya.arrayBuffer());
    const html = new TextDecoder().decode(bayt);
    if (!/<html|<!doctype/i.test(html.slice(0, 2000))) {
      toast(`${dosya.name} bir HTML paftası değil.`, true);
      return;
    }
    if (p.pafta) {
      const evet = await onay('Paftayı değiştir', `${p.pafta} yerine ${dosya.name} konulsun mu? Önceki hâl proje dosyalarında "surumler" altında kalır, depoda geçmişi de durur.`, 'Değiştir');
      if (!evet) return;
      const eski = await db.read(`${KOK}${p.id}/${p.pafta}`);
      if (eski) await db.write(`${KOK}${p.id}/surumler/${p.pafta.replace(/\.html?$/i, '')} (onceki).html`, eski.bytes);
    }
    const ad = p.pafta || depoAdi(dosya.name);
    await db.write(`${KOK}${p.id}/${ad}`, bayt);
    const meta = Object.assign({}, p.meta, { seri: p.seri, firma: p.firma, model: p.model, pafta: ad, sira: p.sira }, besleme(html));
    await db.writeJson(`${KOK}${p.id}/proje.json`, meta);
    await yukle();
    goster();
    toast('Pafta kaydedildi.');
  }

  /* ─── Yeni proje ────────────────────────────────────────── */

  /* KURALLAR.md Bölüm 1: model, pano ölçüsü ve emniyet rölesi cevaplanmadan proje açılmaz */
  function yeniProje() {
    const M = (window.KUTU_MODELLER && window.KUTU_MODELLER.models) || [];
    const w = pencere(`<h2>Yeni proje</h2>
      <form id="yeniForm" class="yeni-grid">
        <div class="field"><label for="ySeri">Seri no</label><input id="ySeri" class="field-input" placeholder="0326073" autocomplete="off" data-ilk></div>
        <div class="field"><label for="yFirma">Firma</label><input id="yFirma" class="field-input" placeholder="FİRMA" autocomplete="off"></div>
        <div class="field"><label for="yModel">Makine modeli (R1.0)</label><select id="yModel" class="field-input">${M.map((m) => `<option value="${esc(m.id)}">${esc(m.name)} · ${esc(m.tag)}</option>`).join('')}</select></div>
        <div class="field"><label for="yBoy">Makine adı</label><input id="yBoy" class="field-input" placeholder="1850" autocomplete="off"></div>
        <div class="field"><label for="yPano">Pano ölçüsü, mm (R1.1)</label><input id="yPano" class="field-input" placeholder="1000x1200" autocomplete="off" required></div>
        <div class="field"><span class="field-label">Emniyet rölesi (R1.6)</span>
          <div class="radyo-satir" style="padding:6px 0"><label><input type="radio" name="yEmn" value="Evet"> Evet</label><label><input type="radio" name="yEmn" value="Hayır"> Hayır</label></div>
        </div>
        <div class="field tam"><div class="model-bilgi" id="yBilgi"></div></div>
        <div class="field tam"><span class="field-label">Opsiyonlar</span><div class="secenekler" id="yOps"></div></div>
        <div class="field tam"><label for="yListe">Makine opsiyon listesi (R1.5)</label><textarea id="yListe" class="field-input" rows="2" placeholder="Siparişteki opsiyonlar, her biri kurallarla eşlenir"></textarea></div>
        <div class="field tam"><label for="yYuk">Yükler</label><textarea id="yYuk" class="field-input" rows="3" placeholder="1. Yıkama pompası 3 kW&#10;Sepet redüktörü 0,37 kW&#10;Isıtıcı 8 kW × 2"></textarea></div>
        <div class="field tam"><label for="yNot">Notlar</label><textarea id="yNot" class="field-input" rows="2"></textarea></div>
        <div class="field tam hata-yazi" id="yHata" role="alert" hidden></div>
        <div class="modal-actions tam"><button type="button" class="btn" id="yVazgec">Vazgeç</button><button type="submit" class="btn btn-primary">Projeyi oluştur</button></div>
      </form>`, 'genis');
    const q = (id) => w.kok.querySelector(`#${id}`);

    function modelYaz() {
      const m = M.find((x) => x.id === q('yModel').value);
      if (!m) return;
      q('yBilgi').innerHTML = m.facts.map(([k, v, r]) => `<span class="model-etiket" title="${esc(r)}">${esc(k)}: <b>${esc(v)}</b></span>`).join('');
      // Emniyet rölesi ayrıca soruluyor; her panoda açıkça cevaplanmalı
      q('yOps').innerHTML = m.options.filter((o) => o.key !== 'emn').map((o) => `<label class="secenek"><input type="checkbox" value="${esc(o.title)}">
        <span>${esc(o.title)}<small>${esc(o.desc)}</small></span><span class="kural-no">${esc(o.rule)}</span></label>`).join('')
        || '<span class="bos-yazi">Bu modelde opsiyon yok.</span>';
      q('yPano').placeholder = m.id === 'kbn1b' ? '710x710' : '1000x1200';
    }
    q('yModel').addEventListener('change', modelYaz);
    modelYaz();

    q('yVazgec').addEventListener('click', w.kapat);
    q('yeniForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const hata = (m) => {
        q('yHata').textContent = m;
        q('yHata').hidden = false;
      };
      const seri = q('ySeri').value.trim();
      const firma = q('yFirma').value.trim();
      const tur = M.find((x) => x.id === q('yModel').value);
      const model = [tur ? tur.name : '', q('yBoy').value.trim()].filter(Boolean).join(' ');
      const pano = q('yPano').value.trim().replace(/\s*[×X]\s*/g, 'x');
      const emn = w.kok.querySelector('input[name="yEmn"]:checked');
      if (!pano || !/^\d+x\d+(x\d+)?$/.test(pano)) return hata('Pano ölçüsü gerekli (R1.1), örnek: 1000x1200.');
      if (!emn) return hata('Emniyet rölesi sorusunu cevaplayın (R1.6).');
      const id = depoAdi(seri ? [seri, firma, model].filter(Boolean).join('-') : [model, firma].filter(Boolean).join(' '));
      if (projeler.some((p) => p.id === id)) return hata(`${id} adında proje zaten var.`);
      const sira = projeler.reduce((n, p) => Math.max(n, p.sira || 0), 0) + 1;
      await db.writeJson(`${KOK}${id}/proje.json`, {
        seri,
        firma,
        model,
        pano,
        sira,
        istek: {
          modelTuru: tur ? tur.name : '',
          pano,
          emniyet: emn.value,
          opsiyonlar: [...w.kok.querySelectorAll('#yOps input:checked')].map((x) => x.value),
          opsiyonListesi: q('yListe').value.trim(),
          yukler: q('yYuk').value.trim(),
          notlar: q('yNot').value.trim()
        }
      });
      w.kapat();
      await yukle();
      projeAc(id);
      return undefined;
    });
  }

  /* ─── Olaylar ───────────────────────────────────────────── */

  for (const b of document.querySelectorAll('.home-tab')) b.addEventListener('click', () => sayfaAc(b.dataset.sayfa));
  $('projeAra').addEventListener('input', kartlarCiz);
  $('projeListe').addEventListener('click', (e) => {
    const c = e.target.closest('.project-card');
    if (c) projeAc(c.dataset.id);
  });
  $('yanListe').addEventListener('click', (e) => {
    const c = e.target.closest('.yan-oge');
    if (c) projeAc(c.dataset.id);
  });
  $('geri').addEventListener('click', () => { location.hash = ''; });
  $('btnYeni').addEventListener('click', yeniProje);
  $('gDosyalar').addEventListener('click', () => { if (acik) dosyalarAc(acik); });
  $('gGuncelle').addEventListener('click', () => $('paftaDosya').click());
  $('paftaDosya').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || !acik) return;
    try {
      await paftaYukle(acik, f);
    } catch (err) {
      toast(`Kaydedilemedi: ${err.message}`, true);
    }
  });
  $('gYeniSekme').addEventListener('click', async () => {
    if (!acik || !acik.pafta) return;
    try {
      yeniSekmedeYaz(await db.readText(`${KOK}${acik.id}/${acik.pafta}`));
    } catch (e) {
      toast(`Açılamadı: ${e.message}`, true);
    }
  });
  $('kaynakEkle').addEventListener('click', () => $('kaynakDosya').click());
  $('kaynakDosya').addEventListener('change', async (e) => {
    for (const f of e.target.files) await db.write(`${KAYNAK}${depoAdi(f.name)}`, new Uint8Array(await f.arrayBuffer()));
    e.target.value = '';
    await kaynaklarCiz();
    toast('Dosyalar eklendi.');
  });
  $('kaynakListe').addEventListener('click', async (e) => {
    const i = e.target.closest('[data-indir]');
    if (i) {
      dosyaIndir(i.dataset.indir);
      return;
    }
    const s = e.target.closest('[data-sil]');
    if (!s) return;
    const ad = s.dataset.sil.slice(KAYNAK.length);
    if (await onay('Dosyayı sil', `${ad} silinsin mi? Depoya gönderilmiş sürümü GitHub geçmişinde kalır.`, 'Sil')) {
      await db.remove(s.dataset.sil);
      await kaynaklarCiz();
    }
  });

  function yanKapat(kapali) {
    document.querySelector('.gorunum-govde').classList.toggle('kapali', kapali);
    const yazi = kapali ? 'Listeyi aç' : 'Listeyi daralt';
    $('yanDugme').textContent = kapali ? '›' : '‹';
    $('yanDugme').setAttribute('aria-label', yazi);
    $('yanDugme').title = yazi;
    try { localStorage.setItem(LISTE_KAPALI, kapali ? '1' : '0'); } catch { /* depolama kapalı olabilir */ }
  }
  $('yanDugme').addEventListener('click', () => yanKapat(!document.querySelector('.gorunum-govde').classList.contains('kapali')));
  try { yanKapat(localStorage.getItem(LISTE_KAPALI) === '1'); } catch { yanKapat(false); }

  window.addEventListener('hashchange', goster);

  /* ─── Açılış ────────────────────────────────────────────── */

  (async () => {
    await ExBoot.ready();
    db = ExBoot.db();
    await yukle();
    await kaynaklarCiz();
    goster();
    ExBoot.onChanged(async (paths) => {
      if (!paths.some((p) => p.startsWith('KUTU/'))) return;
      await yukle();
      await kaynaklarCiz();
      if (!acik) return;
      // Başka cihazdan yeni pafta geldiyse yeniden çizilir; değişmediyse okunan yer kaybolmaz
      const kayit = acik.pafta ? await db.meta(`${KOK}${acik.id}/${acik.pafta}`) : null;
      if ((kayit && kayit.hash) !== cizilenHash) goster();
    });
  })().catch((e) => {
    $('projeListe').innerHTML = `<p class="home-empty">Veritabanı açılamadı: ${esc(e.message)}</p>`;
  });
})();
