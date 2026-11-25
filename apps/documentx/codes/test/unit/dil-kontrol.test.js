const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkProject, shape, numbersOf } = require('../../../scripts/dil-kontrol');

const SRC = [
  '# 3.4 Kumanda',
  '',
  '**UYARI — Sıcak sıvı:** Basınç {{TEKNIK:Basınç}} bar, 1,5 m uzakta durun (**Bkz. Bölüm 2.3**).',
  '',
  'Tablo: Örnek',
  '',
  '| No | Ad |',
  '|:---:|---|',
  '| 1 | [EKSİK E7] |',
  '',
  '1. **WASCHEN** butonuna basın.'
].join('\n');

const GOOD = [
  '# 3.4 Controls',
  '',
  '**WARNING — Hot liquid:** Pressure {{TEKNIK:Basınç}} bar, stay 1.5 m away (**See Chapter 2.3**).',
  '',
  'Table: Example',
  '',
  '| No. | Name |',
  '|:---:|---|',
  '| 1 | [EKSİK E7] |',
  '',
  '1. Press the **WASCHEN** button.'
].join('\n');

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dil-kontrol-'));
  fs.writeFileSync(path.join(dir, 'project.yaml'), 'proje_adi: test\ndiller: [tr, en]\n');
  Object.entries(files).forEach(([name, text]) => {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  });
  return dir;
}

test('ondalık virgül ve nokta aynı sayı sayılır, yer tutucu ve eksik numarası sayı değildir', () => {
  assert.deepStrictEqual(numbersOf('1,5 m ve 1.5 m'), ['1.5', '1.5']);
  assert.deepStrictEqual(numbersOf('{{A:B 12}} [EKSİK E7] 3'), ['3']);
});

test('satır imzası metinden bağımsızdır', () => {
  assert.strictEqual(shape('## 3.4.1 Kumanda paneli'), shape('## 3.4.1 Control panel'));
  assert.strictEqual(shape('**UYARI — Sıcak:** x'), shape('**WARNING — Hot:** y'));
  assert.notStrictEqual(shape('**UYARI — Sıcak:** x'), shape('**NOTE:** y'));
  assert.strictEqual(shape('Tablo: A'), shape('Table: B'));
  assert.notStrictEqual(shape('| a | b |'), shape('| a | b | c |'));
});

test('doğru çeviride sorun çıkmaz', () => {
  const dir = project({ 'a/x.tr.md': SRC, 'a/x.en.md': GOOD });
  assert.deepStrictEqual(checkProject(dir).issues, []);
});

test('eksik dosya, kayıp yer tutucu, yanlış sayı ve Türkçe harf bulunur', () => {
  const missing = project({ 'a/x.tr.md': SRC });
  assert.match(checkProject(missing).issues[0], /dosya yok/);

  const bad = GOOD
    .replace('{{TEKNIK:Basınç}}', '2')
    .replace('1.5 m', '2.5 m')
    .replace('Example', 'Örneği için');
  const dir = project({ 'a/x.tr.md': SRC, 'a/x.en.md': bad });
  const text = checkProject(dir).issues.join('\n');
  assert.match(text, /yer tutucu kayıp/);
  assert.match(text, /sayılar farklı/);
  assert.match(text, /sızıntı olabilir: "için"/);
});

test('DATA: çevrilmemiş yazı ve farklı sayı bulunur, sayısal değer çevrilmeden kalabilir', () => {
  const data = [
    '[TEKNIK]',
    'Basınç (bar): 1,5',
    '@en Pressure (bar):',
    'Sayı: 4 adet',
    '@en Number: 5 pcs',
    'Tip: Elektrikli',
    '@en Type:',
    'Marka: DOLFIN'
  ].join('\n');
  const dir = project({ 'DATA': data, 'a/x.tr.md': SRC, 'a/x.en.md': GOOD });
  const text = checkProject(dir).issues.join('\n');
  assert.doesNotMatch(text, /Basınç/);
  assert.match(text, /Sayı\s+@en sayılar farklı/);
  assert.match(text, /Tip\s+@en değeri çevrilmemiş/);
  assert.match(text, /Marka\s+@en satırı yok/);
});
