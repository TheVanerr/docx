# DOCX

Dolfin makine dokümantasyonu uygulamaları tek depoda ve tek pencerede. Solda uygulama çubuğu, sağda uygulamalar;
açık uygulamalar yerinde kalır, aralarında geçince durum kaybolmaz.

- Web: **https://thevanerr.github.io/docx/** (uygulama olarak kurulabilir). Her şey tek pencerede çalışır.
- Bilgisayarda: `index.html`'e çift tık. Tarayıcı, dosyadan açılan pencerede çerçevedeki programların klasör seçmesine
  izin vermez; bu yüzden klasörle çalışan DocumentX ve SoftwareX dosyadan açılışta ayrı pencerede açılır.

| Klasör | Uygulama |
|---|---|
| `apps/documentx` | Kullanım kılavuzu (kılavuzları yapay zekâ yazar, uygulama gösterir ve basar) |
| `apps/softwarex` | PLC/HMI yazılım dokümanları: teknik doküman, servis, kullanım bilgileri, denetim raporu (görüntüleyici) |
| `apps/rax` | Risk analizi ve LVD test raporu |
| `apps/electricx` | Pano malzeme listesi, pano etiketi, şema çeviri |
| `apps/ppx` | P&ID ve pnömatik (web sürümü şimdilik kendi adresinde: https://thevanerr.github.io/P-PX/; kabuk orayı açar) |
| `apps/layoutx` | Layout (STEP'ten pafta) |
| `apps/bomx` | Malzeme listesi (BOM) |
| `apps/warrantyx` | Garanti belgesi ve CE uygunluk beyanı |

Her uygulama kendi klasöründe de tek başına çalışır (kendi README ve CLAUDE.md dosyası yanındadır).

| Kök | İçerik |
|---|---|
| `index.html`, `kabuk/` | DOCX kabuğu: uygulama çubuğu, ana ekran, uygulama çerçeveleri |
| `ortak/` | Ortak tema (`tema.css`) ve Dolfin logosu |
| `manifest.webmanifest`, `sw.js` | DOCX'in uygulama olarak kurulması, çevrimdışı açılış |
| `araclar/site-hazirla.mjs` | Yayın sitesi |

## DocumentX ve SoftwareX: yerel klasörle çalışan uygulamalar

Bu iki uygulamada belgeleri yapay zekâ (Cursor) yazar; uygulama gösterir. Belgeler müşteri verisidir: depoya ve yayına
girmez, bilgisayardaki klasörden okunur (Chrome / Edge, File System Access API). Klasör bir kez seçilir, sonra hatırlanır.

- **DocumentX:** kılavuzlar `Desktop\DOCX\DocumentX` klasöründe (içinde `projects/`). PDF çıktısı için
  `apps/documentx/DocumentX.vbs` ile açın (ayrı tarayıcı profili, doğrudan PDF). Başlatıcı veri klasörünü
  `apps/documentx/veri-klasoru.txt` dosyasından okur; yoksa bir kez sorar. Deneme: `cscript //nologo DocumentX.vbs /kuru`.
- **SoftwareX:** belgeler `Desktop\DOCX\SOFTWAREX` klasöründe (`Yazılım Dokümantasyonu.html`, `Servis.html`,
  `KKOut.html`, `Rapor.html`). Ayrıntı: `apps/softwarex/README.md`.

## Yayın

`main`'e her gönderimde `.github/workflows/yayin.yml` bütün testleri çalıştırır; hepsi geçerse site
`araclar/site-hazirla.mjs` ile hazırlanıp GitHub Pages'e çıkar. Yerelde denemek için: `node araclar/site-hazirla.mjs _site`.

- Site deponun düzenindedir: kabuk `…/docx/`, uygulamalar `…/docx/apps/<uygulama>/`.
- `apps/*/.github` klasörleri eski depolardan kaldı; GitHub yalnız kökteki iş akışını çalıştırır
  (BOMX testi kendi `pages.yml` dosyasını okuduğu için silinmedi).

## Depolar

- `TheVanerr/docx` (bu depo, herkese açık): yalnız program kodu. GitHub Pages: https://thevanerr.github.io/docx/
- `TheVanerr/docx-veri` (gizli): veriler.
- `TheVanerr/docx-arsiv` (gizli): STEP, PLC yedeği gibi büyük dosyalar (Release olarak).

Müşteri verisi, erişim anahtarı ve büyük dosya bu depoya eklenmez.
