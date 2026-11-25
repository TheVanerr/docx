# DOCX

Dolfin makine dokümantasyonu uygulamaları tek depoda. Her uygulama kendi klasöründe, eskisi gibi çalışır
(`index.html` dosyadan açılır, kendi README ve CLAUDE.md dosyası yanındadır).

| Klasör | Uygulama |
|---|---|
| `apps/documentx` | Kullanım kılavuzu |
| `apps/rax` | Risk analizi ve LVD test raporu |
| `apps/electricx` | Pano malzeme listesi, pano etiketi, şema çeviri |
| `apps/ppx` | P&ID ve pnömatik |
| `apps/layoutx` | Layout (STEP'ten pafta) |
| `apps/bomx` | Malzeme listesi (BOM) |
| `apps/warrantyx` | Garanti belgesi ve CE uygunluk beyanı |

## Yayın

`main`'e her gönderimde `.github/workflows/yayin.yml` bütün testleri çalıştırır; hepsi geçerse site
`araclar/site-hazirla.mjs` ile hazırlanıp GitHub Pages'e çıkar. Yerelde denemek için: `node araclar/site-hazirla.mjs _site`.

- Adresler: `https://thevanerr.github.io/docx/` (açılış), `…/docx/bomx/`, `…/docx/rax/`, `…/docx/warrantyx/`,
  `…/docx/layoutx/`, `…/docx/electricx/`.
- P&PX şimdilik eski adresinde (`https://thevanerr.github.io/P-PX/`): giriş kabuğu programı eski depodan indiriyor;
  tek kabuk adımında buraya taşınacak.
- DocumentX masaüstünde klasörden açılır, yayına girmez.
- `apps/*/.github` klasörleri eski depolardan kaldı; GitHub yalnız kökteki iş akışını çalıştırır
  (BOMX testi kendi `pages.yml` dosyasını okuduğu için silinmedi).

## Depolar

- `TheVanerr/docx` (bu depo, herkese açık): yalnız program kodu. GitHub Pages: https://thevanerr.github.io/docx/
- `TheVanerr/docx-veri` (gizli): veriler.
- `TheVanerr/docx-arsiv` (gizli): STEP, PLC yedeği gibi büyük dosyalar (Release olarak).

Müşteri verisi, erişim anahtarı ve büyük dosya bu depoya eklenmez.
