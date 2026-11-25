const test = require('node:test');
const assert = require('node:assert');
const { parseData } = require('../../web/data-file');

const SAMPLE = `# ====
# MAKİNE VERİ DOSYASI
# ====

[ELEKTRIK]
Besleme gerilimi (V): 400
Ana şalter tipi / In (A): 3P / 63 A
Ana şalter marka:

[MOTOR_SURUCU_LISTESI]
# Her satır: Ad | Güç (kW) | Devir (rpm) | Marka | Model
Konveyör Redüktörü motoru: 0,75 | 1400 | SEW | R37
`;

test('bloklar, anahtarlar ve satır numaraları okunur', () => {
  const d = parseData(SAMPLE);
  assert.deepStrictEqual(d.order, ['ELEKTRIK', 'MOTOR_SURUCU_LISTESI']);
  const e = d.blocks.ELEKTRIK.entries;
  assert.strictEqual(e[0].key, 'Besleme gerilimi (V)');
  assert.strictEqual(e[0].value, '400');
  assert.strictEqual(e[0].line, 6);
  assert.strictEqual(e[1].key, 'Ana şalter tipi / In (A)', 'anahtar ilk ":" işaretine kadar');
  assert.strictEqual(e[1].value, '3P / 63 A');
  assert.strictEqual(e[2].value, '', 'boş değer');
});

test('"|" değerleri sütunlara, "# Her satır" yorumu başlıklara ayrılır', () => {
  const b = parseData(SAMPLE).blocks.MOTOR_SURUCU_LISTESI;
  assert.deepStrictEqual(b.columns, ['Ad', 'Güç (kW)', 'Devir (rpm)', 'Marka', 'Model']);
  assert.deepStrictEqual(b.entries[0].cells, ['0,75', '1400', 'SEW', 'R37']);
});

test('@en ve @de satırları önceki anahtarın çevirisidir, anahtar sayısı değişmez', () => {
  const { blocks } = parseData([
    '[TANK]',
    'Ön filtre sayısı: 4 adet',
    '@en Number of pre-filters: 4 pcs',
    '@de Anzahl der Vorfilter: 4 Stück',
    '# ara yorum',
    'Tank kapasitesi (L): 250',
    '@en Tank capacity (L):'
  ].join('\n'));
  const [filter, tank] = blocks.TANK.entries;
  assert.strictEqual(blocks.TANK.entries.length, 2);
  assert.strictEqual(filter.value, '4 adet');
  assert.deepStrictEqual(filter.i18n.en, { key: 'Number of pre-filters', value: '4 pcs', cells: null, line: 3 });
  assert.strictEqual(filter.i18n.de.key, 'Anzahl der Vorfilter');
  assert.strictEqual(tank.i18n.en.value, '');
  assert.strictEqual(tank.i18n.de, undefined);
});

test('@ satırı çok sütunlu değeri ve sütun başlığını da çevirir', () => {
  const { blocks } = parseData([
    '[MOTOR]',
    '# Her satır: Ad | Güç (kW) | Adet',
    '# Her satır @en: Name | Power (kW) | Qty',
    'Pompa: 2,2 | 1',
    '@en Pump: 2.2 | 1'
  ].join('\n'));
  assert.deepStrictEqual(blocks.MOTOR.columns, ['Ad', 'Güç (kW)', 'Adet']);
  assert.deepStrictEqual(blocks.MOTOR.columnsI18n.en, ['Name', 'Power (kW)', 'Qty']);
  assert.deepStrictEqual(blocks.MOTOR.entries[0].i18n.en.cells, ['2.2', '1']);
});

test('bloktan önceki @ satırı yok sayılır', () => {
  const { blocks, order } = parseData('@en Orphan: x\n[A]\n@en Orphan: y\nAnahtar: 1');
  assert.deepStrictEqual(order, ['A']);
  assert.strictEqual(blocks.A.entries.length, 1);
  assert.strictEqual(blocks.A.entries[0].i18n, undefined);
});
