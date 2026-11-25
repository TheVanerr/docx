# Uygulama geliştirme notları (codes/)

> Bu dosya yalnızca `codes/` altında çalışırken yüklenir. Yalnızca istenen özelliğin modülünü aç; tüm dosyaları okuma. Kod haritası ve yerleşim ayarları: `layout-rules.md` (gerektiğinde ilgili bölümünü oku).

Uygulama **saf tarayıcı** uygulamasıdır (Node / Electron yok). `index.html` Chrome veya Edge'de açılır (`file://` de olur); ilk açılışta DocumentX klasörü seçilir (File System Access API, okuma + yazma). Diğer tarayıcılarda klasör salt okunur yüklenir.

## Modüller (hangisini açacağını buradan seç)

- **tarayıcı arka ucu (`web/`)** — eski Electron main sürecinin yerini alır, `window.dxApi` aynı yöntem adlarıyla:
  `fs.js` (çalışma klasörü: tutamaç, IndexedDB'de saklama, salt okunur yedek), `connect.js` (klasör bağlama ekranı), `backend.js` (kılavuz listesi/derleme, ORTAK, DATA, sözlük, düzenleyici okuma/yazma, project.yaml, yeni proje, pano, görsel raporu, çeviri eskime), `git.js` (.git doğrudan okunur: log, değişen satırlar — git diff ile birebir), `assets.js` (görsellerin blob adresleri, boyut, küçültme, data URI), `watch.js` (canlı yenileme, yoklama), `exporters.js` (HTML / Web → `exports/`, PDF baskısı + pdf-lib son işlem: yer imleri, meta, PDF/A), `api.js` (`dxApi`), `preview.js` + `preview.css` (önizleme modu: `window.DX_PREVIEW` paketiyle klasörsüz, salt okunur açılış), `data-file.js`, `yaml-edit.js`, `web-export.js` (birleşik HTML, web kılavuzu), `vendor/` (js-yaml, pdf-lib — bkz. `vendor/README.md`).
- **belge motoru:** `md-parser.js` (md→blok), `data-resolve.js` (DATA yer tutucuları), `iso7010.js`, `figures.js`, `paginator.js` (A4 sayfalama), `document.js` (içindekiler, belge kurulumu), `glossary.js` (sözlük/dizin), `changes.js` (değişiklik çubukları), `cover.js`, `header.js`, `brands.js` (firma tanımları).
- **arayüz:** `renderer.js` (akış, kısayollar, ayarlar), `sidebar.js`, `search.js`, `qc.js` (+ `iso20607.js`), `compare.js`, `export.js`, `editor.js`, `dashboard.js`, `images.js`, `state.js` (paylaşılan durum; `assetUrl` → `web/assets.js`).
- **stiller:** `style.css` (A4 sayfa), `doc-content.css` (belge bileşenleri, HTML çıktısında da), `html-export.css`, `ui.css` (arayüz).

## Komutlar

- Çalıştır: kökteki **DocumentX** simgesi (`DocumentX.lnk`, görseli `codes/icon/documentx.ico`; `DocumentX.vbs` her açılışta yeniden yazar, `.gitignore`'da) veya doğrudan `DocumentX.vbs`. İlk açılışta DocumentX klasörü bir kez seçilir (ekran seçilecek yolu gösterir); sonraki açılışlarda tek tıkla bağlanılır. Canlı yenileme açık (dosyalar 2 sn'de bir yoklanır).
- Başlatıcıya PowerShell veya arka plan yardımcısı eklenmez: bu bilgisayardaki Trend Micro, gizli PowerShell başlatan VBS'i kötü amaçlı sayıp siliyor (2026-11-06'da denendi).
- Test (yalnız geliştirme; Node + Playwright): `npm test` = birim (`test/unit`) + tarayıcı (`test/web/run.js`: render, arayüz, çıktılar, file:// + git). İlk kurulum: `npm i` ve `npx playwright install chromium`. Testler `test/fixtures/projects` kullanır; **projects/ okunmaz**. Linux'ta `LANG` tanımsızsa koşucu `C.UTF-8` verir (yoksa Chromium Ü'lü dosya adlarını açamaz).
- Ekran görüntüleri / örnek PDF: `npm run test:shots`.
- Önizleme paketi (Artifact): `node scripts/build-preview.js "<proje>" --out <klasör>` — kök CLAUDE.md > Önizleme.
- Çıktı: tek giriş **Toplu çıktı** düğmesi (Ctrl+P). Dil ve biçim seçilir; her biçim için tek dosya: `exports/<proje>/<proje>_<DİLLER>_Rev<xx>.<uzantı>`; HTML ve web İndirilenler'e de iner, PDF tarayıcının indirme listesinde tek kayıt olarak görünür. PDF ve HTML'de diller art arda (`export.js > assemblePdfPages`, `web-export.js > buildMergedHtml`), web kılavuzunda dil seçiciyle. Word yoktur.
- PDF: `DocumentX.vbs` tarayıcıyı ayrı profilde (`%LocalAppData%\DocumentX\BrowserProfile`) `--kiosk-printing` ve `?dxprint=direct` ile açar; PDF pencere açılmadan, son dosya adıyla `exports/.pdf-spool/` altına basılır (Edge bunu indirme listesine ekler); yer imleri aynı dosyanın üzerine yazılır, kopyası `exports/<proje>/` altına; ayrıca indirme yapılmaz. Bağlantılar tarayıcının PDF'inde korunur. Deneme sayfası basılmaz; spool'daki dosya hemen silinmez (Edge'in indirme kaydı bozulmasın), 30 günden eskiler temizlenir. `index.html` başka yolla açılırsa PDF seçeneği kapalıdır ve DocumentX.vbs önerilir; yazdırma penceresi hiçbir yolla açılmaz.
- Makine çevirisi ve proje iskeleti komut satırında kalır: `scripts/translate-lang.js`, `scripts/new-project.js` (Node).
