/* DOCX Makine sayfası çekirdeğinin testi (kabuk/makine-cekirdek.js). Çalıştırma: node araclar/makine-test.js
   Örnek adlar geneldir (depo herkese açık): ORNEK, FIRMA, makine modelleri. */
'use strict';

const assert = require('assert');
const path = require('path');
const C = require(path.join(__dirname, '..', 'kabuk', 'makine-cekirdek.js'));

let gecen = 0;
const testler = [];
const test = (ad, fn) => testler.push([ad, fn]);

test('seri numarası: 7 hane, başka rakama bitişik olmayan', () => {
  assert.strictEqual(C.seriBul('1234567-ORNEK-KBN 2B 1650'), '1234567');
  assert.strictEqual(C.seriBul('SEMA KBN 1B 1500-ORNEK-7654321.pdf'), '7654321');
  assert.strictEqual(C.seriBul('2345678 KBN1B ELEKTRIK.pdf'), '2345678');
  assert.strictEqual(C.seriBul('KBN 2B 1650'), null);
  assert.strictEqual(C.seriBul('20260101-120000'), null, '8 haneli tarih seri değildir');
  assert.strictEqual(C.seriBul('123456'), null);
});

test('klasör adı: firma ve model; LVD sıra eki modelden atılır', () => {
  assert.deepStrictEqual(C.adCoz('1234567-ORNEK-KBN 2B 1650'), { firma: 'ORNEK', model: 'KBN 2B 1650' });
  assert.deepStrictEqual(C.adCoz('1234567-ORNEK-KBN 2B 1650-01', true), { firma: 'ORNEK', model: 'KBN 2B 1650' });
  assert.deepStrictEqual(C.adCoz('1234567-ORNEK-KBN 2B 1650-01'), { firma: 'ORNEK', model: 'KBN 2B 1650-01' });
  assert.deepStrictEqual(C.adCoz('1234567.json'), { firma: '', model: '' });
});

test('yol kuralları: her uygulamanın belgesi ve açılış adresi', () => {
  const e = (u, y) => C.eslestir(u, y);
  const bom = e('bomx', 'BOM/projeler/1234567-ORNEK-KBN 2B 1650/proje.json');
  assert.strictEqual(bom.tur, 'bom');
  assert.strictEqual(bom.seri, '1234567');
  assert.deepStrictEqual(bom.ac, { arama: '?proje=1234567-ORNEK-KBN%202B%201650' });

  assert.strictEqual(e('ppx', 'P&ID/projects/1234567-ORNEK-KBN 2B 1650/pid/cizim.json').tur, 'pid');
  assert.deepStrictEqual(e('ppx', 'PNOMATIK/projects/1234567-ORNEK-KBN 2B 1650/pnomatik/cizim.json').ac,
    { hash: '#ac=pnomatik&proje=1234567-ORNEK-KBN%202B%201650' });
  assert.strictEqual(new URLSearchParams(e('ppx', 'P&ID/projects/1234567-ORNEK & CO-KBN/pid/cizim.json').ac.hash.slice(1)).get('proje'),
    '1234567-ORNEK & CO-KBN', 'adres parçasından aynen geri okunur');
  assert.strictEqual(e('ppx', 'P&ID/projects/1234567-ORNEK-KBN 2B 1650/proje.json'), null, 'çizimsiz proje belge değildir');
  assert.strictEqual(e('ppx', 'ML/kayitlar/1234567.json').tur, 'kodlar');
  assert.strictEqual(e('ppx', 'ML/kayitlar/kodlar.json'), null);

  const risk = e('rax', 'projects/1234567-ORNEK-KBN 2B 1650/00-proje.md');
  assert.strictEqual(risk.tur, 'risk');
  assert.deepStrictEqual(risk.ac, { arama: `?ac=${encodeURIComponent('projects/1234567-ORNEK-KBN 2B 1650')}` });
  assert.strictEqual(e('rax', 'projects/_sablon-1234567/00-proje.md'), null, '_ ile başlayan klasör proje değildir');
  assert.strictEqual(e('rax', 'projects/1234567-ORNEK-KBN 2B 1650/foto/a.md'), null);
  const birim = e('rax', 'models/KBN/KBN 2B/raporlar/1234567-ORNEK/00-proje.md');
  assert.strictEqual(birim.tur, 'risk');
  assert.strictEqual(birim.anahtar, 'models/KBN/KBN 2B/raporlar/1234567-ORNEK');
  assert.deepStrictEqual(birim.ac, { arama: `?ac=${encodeURIComponent('models/KBN/KBN 2B/raporlar/1234567-ORNEK')}` });
  const lvd = e('rax', 'lvd/1234567-ORNEK-KBN 2B 1650-01/lvd.md');
  assert.strictEqual(lvd.model, 'KBN 2B 1650');
  assert.deepStrictEqual(lvd.ac, { arama: `?lvd=${encodeURIComponent('lvd/1234567-ORNEK-KBN 2B 1650-01')}` });

  assert.deepStrictEqual(e('warrantyx', 'belgeler/1234567.json').ac, { hash: '#/belge/1234567' });
  assert.deepStrictEqual(e('warrantyx', 'ce/1234567.json').ac, { hash: '#/ce/1234567' });
  assert.strictEqual(e('warrantyx', 'imzalar/1234567.png'), null);

  const pano = e('electricx', 'KUTU/projeler/1234567-ORNEK-KBN 2B 1650/1234567.html');
  assert.strictEqual(pano.tur, 'pano');
  assert.deepStrictEqual(pano.ac, { hash: '#kutu/p/1234567-ORNEK-KBN%202B%201650' });
  assert.strictEqual(e('electricx', 'ETIKET/projeler/Yedekler/1234567__20260101-120000.json'), null, 'yedekler belge değildir');
  const sema = e('electricx', 'ES/SEMA KBN 1B 1500-ORNEK-1234567.pdf');
  assert.strictEqual(sema.tur, 'sema');
  assert.strictEqual(sema.model, '', 'şema dosyasının adı makine adı vermez');
  assert.deepStrictEqual(sema.ac, { pdf: true });
  assert.strictEqual(e('electricx', 'SEMA/dosyalar/abc.pdf'), null);

  assert.deepStrictEqual(e('layoutx', 'projects/1234567-ORNEK-KBN 2B 1650/1234567-ornek-kbn-2b-1650-layout-veri.json').ac,
    { arama: '?p=1234567-ORNEK-KBN%202B%201650' });
  assert.strictEqual(e('layoutx', 'projects/KBN 2B 1650/kbn-2b-1650-layout-veri.json'), null, 'şablonun serisi yok');
  assert.strictEqual(e('layoutx', 'projects/1234567-ORNEK-KBN 2B 1650/x-layout-veri.json.catisma-20260101-120000'), null);

  assert.deepStrictEqual(e('documentx', 'projects/1234567-ORNEK-KBN 2B 1650/').ac, { dx: 'proje:1234567-ORNEK-KBN 2B 1650' });
  assert.strictEqual(e('bilinmeyen', 'projects/1234567/'), null);
});

test('birleştirme: yerelde silinen ve başka cihazda silinen dosya görünmez', () => {
  const yerel = new Map([
    ['a', { tabanli: true }],
    ['b', { silindi: true, tabanli: true }],
    ['c', { tabanli: true }],
    ['d', { bekliyor: true }],
    ['e', { tabanli: true, bekliyor: true }]
  ]);
  const uzak = new Map([['a', { sha: '1' }], ['b', { sha: '2' }], ['f', { sha: '3', boyut: 9 }]]);
  const r = C.birlestir('bomx', yerel, uzak);
  const yollar = r.map((x) => x.yol).sort();
  // c: eşitlenmiş, değişmemiş ama depoda yok → başka cihazda silindi · e: depoda yok ama bu cihazda değişti → kalır
  assert.deepStrictEqual(yollar, ['a', 'd', 'e', 'f']);
  assert.strictEqual(r.find((x) => x.yol === 'f').boyut, 9);
  assert.strictEqual(r.find((x) => x.yol === 'd').bekliyor, true);
  // Depo okunamadıysa yalnız yerel silme düşer
  assert.deepStrictEqual(C.birlestir('bomx', yerel, null).map((x) => x.yol).sort(), ['a', 'c', 'd', 'e']);
});

test('toplama: belgeler seriye göre makineye, makine adı oylamayla', () => {
  const k = (uygulama, yol, ek) => Object.assign({ uygulama, yol, uzak: true }, ek || {});
  const makineler = C.topla([
    k('bomx', 'BOM/projeler/1234567-ORNEK-KBN 2B 1650/proje.json', { zaman: 100 }),
    k('ppx', 'P&ID/projects/1234567-ORNEK-KBN 2B PS DS OTO 1650/pid/cizim.json'),
    k('ppx', 'PNOMATIK/projects/1234567-ORNEK-KBN 2B 1650/pnomatik/cizim.json', { yerel: true, uzak: false, bekliyor: true, zaman: 300 }),
    k('rax', 'projects/1234567-ORNEK-KBN 2B 1650/00-proje.md'),
    k('rax', 'projects/1234567-ORNEK-KBN 2B 1650/01-bolum.md'),
    k('electricx', 'KUTU/projeler/1234567-ORNEKM-KBN 2B 1650/proje.json'),
    k('electricx', 'KUTU/projeler/1234567-ORNEKM-KBN 2B 1650/1234567.html'),
    k('warrantyx', 'belgeler/7654321.json', { yerel: true, icerik: { model: 'LYM 1150', musteri: 'FIRMA A.Ş.' } }),
    k('electricx', 'ES/7654321 LYM ELEKTRIK.pdf'),
    k('bomx', 'BOM/kutuphane/x.json')
  ]);
  assert.strictEqual(makineler.length, 2);
  const m = makineler.find((x) => x.seri === '1234567');
  assert.strictEqual(m.model, 'KBN 2B 1650', 'çoğunluğun yazdığı model');
  assert.strictEqual(m.firma, 'ORNEK');
  assert.deepStrictEqual(m.belgeler.map((b) => b.tur), ['pid', 'pnomatik', 'bom', 'pano', 'risk'], 'tür sırası');
  assert.strictEqual(m.belgeler.find((b) => b.tur === 'risk').dosyalar.length, 2, 'aynı klasörün dosyaları tek belge');
  assert.strictEqual(m.belgeler.find((b) => b.tur === 'pano').dosyalar.length, 2);
  assert.strictEqual(m.bekleyen, 1);
  assert.strictEqual(m.son, 300);
  const w = makineler.find((x) => x.seri === '7654321');
  assert.strictEqual(w.model, 'LYM 1150', 'klasör adı yoksa dosyanın içinden');
  assert.strictEqual(w.firma, 'FIRMA A.Ş.');
  assert.deepStrictEqual(w.turler, ['sema', 'garanti']);
});

test('sıralama ve arama', () => {
  const ms = [
    { seri: '1000001', model: 'KBN 1B', firma: 'ORNEK', belgeler: [], son: 0 },
    { seri: '2000002', model: 'LYM 1150', firma: 'FIRMA', belgeler: [], son: 50 },
    { seri: '3000003', model: 'KBN 2B', firma: 'ORNEK', belgeler: [{ ad: 'x', tur: 'bom' }], son: 0 }
  ];
  assert.deepStrictEqual(C.sirala(ms, 'son').map((m) => m.seri), ['2000002', '3000003', '1000001']);
  assert.deepStrictEqual(C.sirala(ms, 'seri').map((m) => m.seri), ['3000003', '2000002', '1000001']);
  assert.deepStrictEqual(C.ara(ms, 'kbn ornek').map((m) => m.seri), ['1000001', '3000003']);
  assert.deepStrictEqual(C.ara(ms, '20000').map((m) => m.seri), ['2000002']);
  assert.deepStrictEqual(C.ara(ms, 'malzeme').map((m) => m.seri), ['3000003'], 'belge türü adıyla');
  assert.strictEqual(C.ara(ms, '  ').length, 3);
});

test('içerik: garanti/CE müşteri, makine kodu firma alanı', () => {
  assert.deepStrictEqual(C.icerikCoz({ model: ' KBN  2B ', musteri: 'ORNEK' }), { model: 'KBN 2B', firma: 'ORNEK' });
  assert.deepStrictEqual(C.icerikCoz({ model: '', firma: 'FIRMA' }), { model: '', firma: 'FIRMA' });
  assert.strictEqual(C.icerikCoz({ kodlar: [] }), null);
  assert.strictEqual(C.icerikCoz(null), null);
  assert.ok(C.icerikOkunur('warrantyx', 'ce/1234567.json'));
  assert.ok(!C.icerikOkunur('bomx', 'BOM/projeler/1234567-ORNEK-KBN/proje.json'));
});

test('her kural bilinen bir türe, her tür bir uygulamaya bağlı', () => {
  for (const k of C.KURALLAR) assert.ok(C.TUR.has(k.tur), k.tur);
  for (const t of C.TURLER) {
    assert.ok(C.GRUPLAR.includes(t.grup), t.id);
    assert.ok(C.KURALLAR.some((k) => k.tur === t.id && k.uygulama === t.uygulama), `${t.id} kuralı yok`);
  }
});

for (const [ad, fn] of testler) {
  try {
    fn();
    gecen += 1;
    console.log(`TAMAM  ${ad}`);
  } catch (e) {
    console.error(`HATA   ${ad}\n${e.stack}`);
    process.exitCode = 1;
  }
}
console.log(`${gecen}/${testler.length} test geçti`);
