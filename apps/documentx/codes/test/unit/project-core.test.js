const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createProject } = require('../../../scripts/project-core');

function write(root, rel, text = 'x') {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
}

test('yeni projeye yalnız kılavuz içeriği ve DATA geçer', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dx-core-'));
  try {
    write(root, 'projects/demo/demo.yaml', 'proje_adi: DEMO\nmodel: demo\nsablon: true\ndiller: [tr]\n');
    write(root, 'projects/demo/DEMO DATA', '[PROJE]\nModel: DEMO\n');
    write(root, 'projects/demo/EKSIK-SORULAR.md');
    write(root, 'projects/demo/DEMO STEP.STEP');
    write(root, 'projects/demo/DEMO LAYOUT.pdf');
    write(root, 'projects/demo/urun-agaci-bom.html');
    write(root, 'projects/demo/photos/ham.jpeg');
    write(root, 'projects/demo/0326066-RISK ANALYSIS/rapor.pdf');
    write(root, 'projects/demo/01-introduction/introduction.tr.md', '# 1. GİRİŞ\n');
    write(root, 'projects/demo/assets/kapak/kapak-cizimi.png');

    const r = createProject(root, '1730000-XYZ-DEMO 40', 'demo', 'tr');
    assert.strictEqual(r.ok, true, r.error);
    assert.deepStrictEqual([...r.files].sort(), [
      '01-introduction/introduction.tr.md',
      '1730000-XYZ-DEMO 40 DATA',
      'assets/kapak/kapak-cizimi.png'
    ]);
    const dir = path.join(root, 'projects', r.slug);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), [
      '01-introduction', '1730000-XYZ-DEMO 40 DATA', 'assets', 'project.yaml'
    ]);
    assert.match(fs.readFileSync(path.join(dir, '1730000-XYZ-DEMO 40 DATA'), 'utf8'), /Model: DEMO/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
