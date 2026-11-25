'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SX = require('../sx-cekirdek.js');

test('dört belge, üst menüdeki sırayla', () => {
  assert.deepEqual(SX.BELGELER.map((b) => b.dosya), ['Yazılım Dokümantasyonu.html', 'Servis.html', 'KKOut.html', 'Rapor.html']);
  assert.deepEqual(SX.BELGELER.map((b) => b.ad), ['Teknik doküman', 'Servis', 'Kullanım bilgileri', 'Denetim raporu']);
});

test('dosya adı eşleştirme: büyük/küçük harf ve Unicode biçimi önemsiz', () => {
  assert.equal(SX.belgeTuru('KKOut.html').id, 'kullanim');
  assert.equal(SX.belgeTuru('kkout.HTML').id, 'kullanim');
  assert.equal(SX.belgeTuru('Yazılım Dokümantasyonu.html').id, 'teknik');
  assert.equal(SX.belgeTuru('Yazılım Dokümantasyonu.html'.normalize('NFD')).id, 'teknik', 'NFD (ayrık) yazılmış ad');
  assert.equal(SX.belgeTuru('Rapor.htm'), null);
  assert.equal(SX.belgeTuru('Program_Analizi.html'), null);
});

test('belgeler arası bağlantı: hedef belge ve makine adresi', () => {
  assert.deepEqual(SX.hedef('Servis.html#makine1'), { id: 'servis', hash: '#makine1' });
  assert.deepEqual(SX.hedef('Rapor.html'), { id: 'rapor', hash: '' });
  assert.deepEqual(SX.hedef('./KKOut.html#makine2-alarmlar'), { id: 'kullanim', hash: '#makine2-alarmlar' });
  assert.deepEqual(SX.hedef('Yazılım Dokümantasyonu.html#makine3'), { id: 'teknik', hash: '#makine3' });
  assert.deepEqual(SX.hedef('Yaz%C4%B1l%C4%B1m%20Dok%C3%BCmantasyonu.html#makine4'), { id: 'teknik', hash: '#makine4' });
  assert.deepEqual(SX.hedef('../SOFTWAREX/Servis.html?x=1#makine5'), { id: 'servis', hash: '#makine5' });
  assert.deepEqual(SX.hedef('Servis.html#'), { id: 'servis', hash: '' });
});

test('belgeler arası olmayan bağlantılar yakalanmaz', () => {
  for (const href of ['#makine1', '', null, 'https://example.com/Servis.html', 'blob:null/abc', 'mailto:a@b.c', 'diger.html', 'Servis.pdf', 'javascript:void 0']) {
    assert.equal(SX.hedef(href), null, String(href));
  }
});

test('makine adresi taşıma: bölüm ve ana sayfa atılır', () => {
  assert.equal(SX.makineAdresi('#makine1'), '#makine1');
  assert.equal(SX.makineAdresi('#makine1-alarmlar'), '#makine1');
  assert.equal(SX.makineAdresi('makine6'), '#makine6');
  assert.equal(SX.makineAdresi('#home'), '');
  assert.equal(SX.makineAdresi('#'), '');
  assert.equal(SX.makineAdresi(''), '');
  assert.equal(SX.makineAdresi('#shot=makine1:10&re=1'), '', 'parametreli adres taşınmaz');
});

test('tarama sonucu: kökteki dört belge ana, gerisi diğer HTML', () => {
  const g = (yol) => ({ yol, ad: yol.split('/').pop() });
  const r = SX.ayir([g('Servis.html'), g('KKOut.html'), g('Makine 1/Program_Analizi.html'), g('Eski/Rapor.html'), g('notlar.html')]);
  assert.deepEqual([...r.ana.keys()].sort(), ['kullanim', 'servis']);
  assert.deepEqual(r.digerleri.map((x) => x.yol), ['Eski/Rapor.html', 'Makine 1/Program_Analizi.html', 'notlar.html']);
});

test('boyut ve tarih yazımı', () => {
  assert.equal(SX.boyutYaz(38551378), '36,8 MB');
  assert.equal(SX.boyutYaz(29417), '29 KB');
  assert.equal(SX.boyutYaz(10), '1 KB');
  assert.match(SX.tarihYaz(Date.UTC(2026, 10, 23, 11, 5)), /^\d{2}\.11\.2026 \d{2}:\d{2}$/);
});

test('göreli yol: belgedeki bağlantının klasördeki yeri', () => {
  assert.equal(SX.goreliYol('Yazılım Dokümantasyonu.html', 'Makine 1/Program_Analizi.html#x'), 'Makine 1/Program_Analizi.html');
  assert.equal(SX.goreliYol('Servis.html', 'Makine%201/Program_Analizi.html'), 'Makine 1/Program_Analizi.html');
  assert.equal(SX.goreliYol('Makine 1/a.html', 'b.html'), 'Makine 1/b.html');
  assert.equal(SX.goreliYol('Makine 1/a.html', '../Servis.html?x=1'), 'Servis.html');
  assert.equal(SX.goreliYol('Makine 1/a.html', './alt/c.html'), 'Makine 1/alt/c.html');
  assert.equal(SX.goreliYol('Servis.html', String.raw`Makine 1\b.html`), 'Makine 1/b.html', 'ters bölü');
  assert.equal(SX.goreliYol('Servis.html', '../disari.html'), '', 'kökün dışı');
  for (const href of ['', '#a', '/C:/x.html', 'https://example.com/a.html', 'file:///C:/a.html', null]) {
    assert.equal(SX.goreliYol('Servis.html', href), '', String(href));
  }
  assert.equal(SX.yolAnahtari('Makine 1/PROGRAM.html'), SX.yolAnahtari('makine 1/program.html'));
  assert.equal(SX.yolAnahtari('Yazılım Dokümantasyonu.html'.normalize('NFD')), SX.yolAnahtari('YAZILIM DOKÜMANTASYONU.HTML'));
});

test('belge köprüsü yalnız ASCII ve kendi içinde kapalı (belgenin kodlamasını bozmaz)', () => {
  const kaynak = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'softwarex.js'), 'utf8');
  const m = /\n {2}function kopru\(\) \{[\s\S]*?\n {2}\}\n/.exec(kaynak);
  assert.ok(m, 'kopru işlevi bulunamadı');
  assert.match(m[0], /^[\x00-\x7f]*$/, 'ASCII dışı karakter');
  assert.doesNotMatch(m[0], /<\/script/i);
  assert.doesNotMatch(m[0], /\bSX\.|\bd\.|\$\(/, 'dış değişken kullanılmamalı');
});
