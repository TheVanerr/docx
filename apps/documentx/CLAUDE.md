# DocumentX — Claude çalışma notları

Endüstriyel makine **kullanım kılavuzu** (EN ISO 20607 / ISO 12100) üreten repo. Kılavuzlar Markdown (TR/EN/DE); `codes/` altındaki tarayıcı uygulaması (Node/Electron yok) bunları A4 / PDF / HTML'e çevirir. Çalışma dili Türkçe.

## Okuma kuralı (token tasarrufu — zorunlu)

- **Yalnızca kullanıcının mesajda adını verdiği proje, bölüm veya dosyayı oku.** Projeyi, klasör ağaçlarını veya "bağlam için" başka projeleri tarama.
- Konu belirsizse okumadan önce sor; tahminle geniş arama yapma.
- Dosyanın tamamı gerekmiyorsa `grep -n` ile yeri bul, yalnızca o satır aralığını oku (ör. DATA'da `grep -n '^\[' "<DATA>"` → ilgili `[BLOK]`).
- `projects/` altında başka bir projeyi "örnek" diye açma; kullanıcı açıkça isterse aç.
- Kesin yasak (`.claude/settings.json` engeller): `node_modules/`, `codes/dist/`, `exports/`, `_drive_photos/`, `fotoğraflar/`, `*.xlsm`, `.env`, büyük dışa aktarım HTML'leri.
- İstenmedikçe açma: `EN ISO 20607 2019.pdf` (yalnız norm sorusunda), `CURSOR USER MANUEL TEMPLATE.md`, `.cursor/`, `projects/*/assets/` görselleri, `codes/test/`.

## Klasör haritası

- `projects/<proje>/` — her kılavuz kendi klasöründe tam içerik. Yazım kuralları: **`projects/CLAUDE.md`** (o klasörde çalışınca otomatik yüklenir).
- `codes/` — tarayıcı uygulaması (`codes/index.html`; başlatıcı: kökteki **DocumentX** simgesi → `DocumentX.vbs`; simgeyi VBS oluşturur, git'e girmez). Geliştirme notları: **`codes/CLAUDE.md`** (otomatik yüklenir).
- `templates/` — boş proje iskeleti; `base.yaml` bölüm sırası, `DATA` veri şablonu, `sozluk.yaml` ortak terim sözlüğü.
- `scripts/` — yardımcı betikler (komutlar `projects/CLAUDE.md`'de).
- `assets/logos/` — Dolfin logosu; `assets/iso7010/` — ISO 7010 işaretleri.
- **Veri klasörü ayrıdır** (`Desktop\DOCX\DocumentX`, gizli `DocumentX` deposu; başlatıcı yolu `veri-klasoru.txt`'den okur): `projects/`, müşteri firma logoları ve tanımları (`assets/logos/firmalar.json`, bkz. `codes/brands.js`), projeye özel bakım betikleri, mevcut önizleme adresleri (veri klasörünün CLAUDE.md'si). Bu klasör herkese açık DOCX deposundadır: müşteri ya da proje adı buraya yazılmaz.

## Önizleme (her değişiklikten sonra)

- Bir kılavuzda veya uygulamada değişiklik yaptıktan sonra önizlemeyi yeniden üret ve yayınla; kullanıcı tarayıcıda bu bağlantıdan bakar:
  `node scripts/build-preview.js "<proje>" --projects "<veri klasörü>\projects" --out <scratchpad>/preview [--base <commit>]` (taban varsayılanı: son değişiklikten önceki commit; kaydedilmemiş değişiklik varsa HEAD). Şablonlar, logolar ve `firmalar.json` veri klasöründen alınır.
- Yayın: Claude Artifact, sayfa `index.html`, `root` = çıktı klasörü, `files` = `publish-files.json`. Proje için önizleme adresi varsa **aynı adrese** (`url`) güncelle; önceki sürümde olup yenisinde olmayan yollar `null` ile kaldırılır. Mevcut önizleme adresleri veri klasörünün CLAUDE.md'sindedir.
- Önizleme salt okunurdur (düzenleme, çıktı, yazdırma yok); kullanıcı bunlar için uygulamayı kendi klasöründe açar (`DocumentX.vbs`).

## Git

- Program (bu klasör) DOCX deposundadır: commit mesajı kök CLAUDE.md'deki gibi (`documentx: <ne değişti>`). Kılavuz commit'leri veri klasörünün kendi deposuna gider (biçimi oradaki CLAUDE.md'de).
- `.env` ve `scripts/.translation-state.json` asla commit edilmez.
