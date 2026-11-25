/* Firma tanımları. Firma seçici, kapak (cover.js), antet ve alt bilgi (header.js) buradan beslenir.
   Kodda yalnız DOLFIN vardır. Diğer firmalar (kılavuzu kendi markasıyla basılan müşteriler) çalışma
   klasöründe tanımlanır: assets/logos/firmalar.json → { "FIRMA": { color, footer, header, cover } };
   logolar aynı klasörde. Uygulama açılışta okur (loadBrands); dosya yoksa yalnız DOLFIN kullanılır.
   Yeni firma = firmalar.json'a bir kayıt + assets/logos/ altına logo (uygulama yeniden açılınca görünür).

   color   : kapak şeridi, antet çizgisi, sayfa numarası, alt bilgi rengi
   footer  : numaralı sayfaların sol alt köşesindeki firma adı
   header  : { type: 'text', name, sub } veya { type: 'logo', logo, logoHeight?, logoMaxWidth?, sub? }; sub metin veya { tr, en, de }
   cover   : { logo, logoBox?, accent?, qr?, company? } — logoBox cm cinsinden (left, top, width, height).
             accent, qr (QR görseli) ve company ({ name, address, web }) yalnız Kapak A/B'de kullanılır;
             qr yoksa sağ üstte dil etiketi çıkar, company yoksa alt bilgide footer adı yazılır.
             address içindeki \n kapakta satır sonudur.
   Logo yolları çalışma klasörüne göredir (assetUrl ile çözülür). */
const BRANDS = {
  DOLFIN: {
    color: '#ff0000',
    footer: 'CNK ELEKTRONİK MAKİNE SANAYİ AŞ',
    header: { type: 'text', name: 'DOLFIN', sub: { tr: 'Makine Sanayi', en: 'Machinery Industry', de: 'Maschinenbau' } },
    cover: {
      logo: 'assets/logos/dolfin.png',
      accent: '#F60000',
      qr: 'assets/logos/qr-dolfintr.svg',
      company: {
        name: 'CNK ELEKTRONİK MAKİNE SANAYİ AŞ',
        address: '1.Organize Sanayi Bölgesi Prof. Orhan Işık Caddesi No:8\nSincan / Ankara / Türkiye',
        web: 'https://dolfintr.com'
      }
    }
  }
};

const DEFAULT_BRAND = 'DOLFIN';

function getBrand(variant) {
  return BRANDS[String(variant || '').toUpperCase()] || BRANDS[DEFAULT_BRAND];
}

/** Çalışma klasöründeki firma tanımlarını (assets/logos/firmalar.json) BRANDS'e ekler. DOLFIN değiştirilemez. */
async function loadBrands() {
  let r = null;
  try { r = await window.dxApi.readBrands(); } catch (e) { r = null; }
  Object.keys(BRANDS).forEach(k => { if (k !== DEFAULT_BRAND) delete BRANDS[k]; });
  if (!r) return;
  if (r.error) console.warn(r.error);
  Object.entries(r.brands || {}).forEach(([key, b]) => {
    const k = String(key).trim().toUpperCase();
    if (k && k !== DEFAULT_BRAND && b && typeof b === 'object' && !Array.isArray(b)) BRANDS[k] = b;
  });
}
