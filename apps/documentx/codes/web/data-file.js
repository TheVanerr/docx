/* Makine veri dosyası (SSOT) — "<proje> DATA" (uzantısız).
   Biçim: [BLOK] başlıkları, altında "Anahtar: değer" satırları, # yorum.
   Değer içinde "|" varsa sütunlara ayrılır (ör. motor listesi).
   "# Her satır: Ad | Güç (kW) | …" yorumu o bloğun sütun başlıklarıdır.
   Çeviri: anahtar satırının altına "@en Etiket: değer" / "@de Etiket: değer". Yer tutucular
   her dilde Türkçe anahtarla yazılır; değer boşsa Türkçe değer kullanılır (sayısal değerler
   böylece tek yerde kalır). Sütun başlığı çevirisi: "# Her satır @en: Name | Power (kW) | …".
   Tarayıcıda global DXDataFile, Node'da (birim testleri) module.exports. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DXDataFile = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /* Proje klasöründeki DATA dosyasının adı: "DATA" ya da "<herhangi> DATA". */
  const DATA_NAME_RX = /(^|\s)DATA$/;

  function pickDataFile(names) {
    const hit = names.filter(n => DATA_NAME_RX.test(n)).sort();
    return hit.length ? hit[0] : null;
  }

  function cellsOf(raw) {
    const value = raw.trim();
    return { value, cells: value.includes('|') ? value.split('|').map(s => s.trim()) : null };
  }

  function parseData(text) {
    const blocks = {};
    const order = [];
    let cur = null;
    String(text || '').replace(/^﻿/, '').split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (!line) return;
      const head = line.match(/^\[([^\]]+)\]\s*$/);
      if (head) {
        const name = head[1].trim();
        cur = blocks[name] || (blocks[name] = { name, line: i + 1, columns: null, entries: [] });
        if (!order.includes(name)) order.push(name);
        return;
      }
      if (line.startsWith('#')) {
        const cols = line.match(/^#\s*Her satır(?:\s+@([a-z]{2}))?\s*:\s*(.+)$/i);
        if (cur && cols && cols[2].includes('|')) {
          const names = cols[2].split('|').map(s => s.trim());
          if (cols[1]) (cur.columnsI18n || (cur.columnsI18n = {}))[cols[1].toLowerCase()] = names;
          else cur.columns = names;
        }
        return;
      }
      if (!cur) return;
      const tr = line.match(/^@([a-z]{2})\s+([^:]+?)\s*:\s?(.*)$/i);
      if (tr) {
        const last = cur.entries[cur.entries.length - 1];
        if (last) (last.i18n || (last.i18n = {}))[tr[1].toLowerCase()] = { key: tr[2].trim(), ...cellsOf(tr[3]), line: i + 1 };
        return;
      }
      const m = raw.match(/^\s*([^:]+?)\s*:\s?(.*)$/);
      if (!m) return;
      cur.entries.push({ key: m[1].trim(), ...cellsOf(m[2]), line: i + 1 });
    });
    return { blocks, order };
  }

  return { DATA_NAME_RX, pickDataFile, parseData };
});
