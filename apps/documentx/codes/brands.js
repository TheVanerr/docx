/* Firma tanımları — tek kaynak. Firma seçici, kapak (cover.js), antet ve
   alt bilgi (header.js) buradan beslenir. Yeni firma = buraya bir kayıt +
   assets/logos/ altına logo.

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
  },
  MUSTERI1: {
    color: '#007938',
    footer: 'Musteri 1',
    header: { type: 'logo', logo: 'assets/logos/musteri1.svg' },
    cover: { logo: 'assets/logos/musteri1.svg' }
  },
  MUSTERI2: {
    color: '#C41E3A',
    footer: 'Musteri 2',
    header: { type: 'logo', logo: 'assets/logos/musteri2.png' },
    cover: { logo: 'assets/logos/musteri2.png' }
  },
  MUSTERI3: {
    color: '#1B04AE',
    footer: 'Musteri 3',
    header: { type: 'logo', logo: 'assets/logos/musteri3.png', logoHeight: 22, logoMaxWidth: 148 },
    cover: { logo: 'assets/logos/musteri3.png', logoBox: { left: 4.8, top: 14.2, width: 11.2, height: 6.5 } }
  },
  MUSTERI4: {
    color: '#1a1a1a',
    footer: 'Musteri 4',
    header: { type: 'logo', logo: 'assets/logos/musteri4.png', logoHeight: 28, logoMaxWidth: 120 },
    cover: { logo: 'assets/logos/musteri4.png', logoBox: { left: 4.8, top: 14.48, width: 9.0, height: 3.65 } }
  }
};

const DEFAULT_BRAND = 'DOLFIN';

function getBrand(variant) {
  return BRANDS[String(variant || '').toUpperCase()] || BRANDS[DEFAULT_BRAND];
}
