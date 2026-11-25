# DOCX — Claude çalışma notları

Dolfin makine dokümantasyonu uygulamaları tek depoda (`apps/<uygulama>/`). Çalışma dili Türkçe.

- Yalnız kullanıcının adını verdiği uygulamanın klasöründe çalış; o klasörün CLAUDE.md dosyası kuralları verir. Başka uygulamaları "bağlam için" tarama.
- Bu depo HERKESE AÇIKTIR: müşteri verisi (proje klasörleri, seri numaralı belgeler, müşteri PDF'leri, fotoğraflar, müşteri ya da makine adları), erişim anahtarı ve büyük dosya (STEP vb.) asla eklenmez. Veri gizli `TheVanerr/docx-veri` deposundadır. Test ve örneklerde genel adlar kullan (`makine1`, `ornek-a`).
- Commit mesajı Türkçe, kısa: `<uygulama>: <ne değişti>` (ör. `bomx: arama düzeltildi`).
- Commit ve push yalnız kullanıcı isterse.

## Kök

- `index.html` + `kabuk/`: DOCX kabuğu. Solda uygulama çubuğu; her uygulama kendi iframe'inde açılır ve açık kalır. Uygulama listesi `kabuk/kabuk.js` > `UYGULAMALAR`.
- `ortak/tema.css`: ortak görünüm (renkler, üst çubuk, sekme, düğme). Yeni ekranlar bu değişkenleri kullanır.
- `sw.js`, `manifest.webmanifest`: kabuğun PWA'sı. `sw.js`'deki `SURUM` ve `DOSYALAR` satırlarını site üreticisi yazar; satırların biçimini bozma.
- `araclar/site-hazirla.mjs`: yayın sitesi. Site deponun düzenindedir (`…/docx/apps/<uygulama>/`); yalnız git'te izlenen dosyalar girer. Yeni uygulama: `UYGULAMALAR` + site üreticisi + `.github/workflows/yayin.yml` test adımı.
- DocumentX ve SoftwareX belgeleri bilgisayardaki klasörden okur (File System Access); belgeler depoya ve siteye girmez.
