const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { numberProject } = require('../../../scripts/eksik-numarala.js');

const YAML = `proje_adi: T
bolumler:
  - id: "01-a"
    dosya: "a"
    alt_bolumler:
      - id: "01-b"
        dosya: "b"
  - id: "02-kapali"
    dosya: "k"
    aktif: false
`;

const DATA = [
  '[GENEL]',
  'Dolu: 5',
  'Bos:',
  'Kullanilmayan:',
  '[TABLO1]',
  '# Her satır: Özellik | 1350 | 1500',
  'Agirlik:  | 900',
  'Yukseklik:  | ',
  ''
].join('\r\n');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dx-eksik-'));
  const dir = path.join(root, 'projects', 'T');
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  fs.mkdirSync(path.join(root, 'templates', 'ortak'), { recursive: true });
  write('T.yaml', YAML);
  write('T DATA', DATA);
  write('01-a/a.tr.md', 'Bir: [EKSİK]\r\n<!-- yorum [EKSİK] -->\r\nDeger {{GENEL:Bos}} ve {{GENEL:Dolu}}\r\n');
  write('01-a/01-b/b.tr.md', '{{TABLO:TABLO1}}\n| x | [EKSİK] | [EKSİK: not] |\nTekrar {{GENEL:Bos}}\n');
  write('02-kapali/k.tr.md', '[EKSİK]\n');
  return { root, dir, read: (rel) => fs.readFileSync(path.join(dir, rel), 'utf8') };
}

test('belge sırasıyla numaralar; aynı DATA değeri aynı numarayı alır', () => {
  const f = fixture();
  const r = numberProject(f.dir, { root: f.root });
  assert.strictEqual(f.read('01-a/a.tr.md'), 'Bir: [EKSİK E1]\r\n<!-- yorum [EKSİK] -->\r\nDeger {{GENEL:Bos}} ve {{GENEL:Dolu}}\r\n');
  assert.strictEqual(f.read('01-a/01-b/b.tr.md'), '{{TABLO:TABLO1}}\n| x | [EKSİK E6] | [EKSİK E7: not] |\nTekrar {{GENEL:Bos}}\n');
  assert.strictEqual(f.read('T DATA'), [
    '[GENEL]',
    'Dolu: 5',
    'Bos: [EKSİK E2]',
    'Kullanilmayan:',
    '[TABLO1]',
    '# Her satır: Özellik | 1350 | 1500',
    'Agirlik: [EKSİK E3] | 900',
    'Yukseklik: [EKSİK E4] | [EKSİK E5]',
    ''
  ].join('\r\n'));
  assert.strictEqual(r.total, 7);
  assert.strictEqual(f.read('02-kapali/k.tr.md'), '[EKSİK]\n', 'kapalı bölüm değişmez');
});

test('ikinci çalıştırma hiçbir şey değiştirmez', () => {
  const f = fixture();
  numberProject(f.dir, { root: f.root });
  const before = [f.read('01-a/a.tr.md'), f.read('T DATA')];
  const r = numberProject(f.dir, { root: f.root });
  assert.deepStrictEqual(r.assigned, []);
  assert.deepStrictEqual([f.read('01-a/a.tr.md'), f.read('T DATA')], before);
});

test('dolan eksikler numara kaydırmaz, yeni eksik sıradaki numarayı alır', () => {
  const f = fixture();
  numberProject(f.dir, { root: f.root });
  const a = path.join(f.dir, '01-a/a.tr.md');
  fs.writeFileSync(a, fs.readFileSync(a, 'utf8').replace('[EKSİK E1]', '42') + 'Yeni [EKSİK]\r\n');
  const r = numberProject(f.dir, { root: f.root });
  assert.deepStrictEqual(r.assigned.map(x => x.no), ['E8']);
  assert.match(f.read('01-a/01-b/b.tr.md'), /\[EKSİK E6\]/, 'kalan numara yerinde');
});

test('ortak metin dosyası değişmez, içindeki boş DATA değeri numaralanır', () => {
  const f = fixture();
  const shared = path.join(f.root, 'templates', 'ortak', 'o.tr.md');
  fs.writeFileSync(shared, 'Ortak {{GENEL:Kullanilmayan}} [EKSİK]\n');
  fs.appendFileSync(path.join(f.dir, '01-a/a.tr.md'), '{{ORTAK:o}}\n');
  numberProject(f.dir, { root: f.root });
  assert.strictEqual(fs.readFileSync(shared, 'utf8'), 'Ortak {{GENEL:Kullanilmayan}} [EKSİK]\n');
  assert.match(f.read('T DATA'), /Kullanilmayan: \[EKSİK E\d+\]/);
});
