# DOLFIN kapak ve sayfa anteti — örnek tasarım

Bu klasör uygulamadan bağımsız tasarım çalışmalarıdır; kılavuz çıktısını doğrudan değiştirmez. Seçilen tema: **beyaz, Kapak B**. **Kapak B bütün kılavuzların standart kapağıdır** (2026-11-03); makineye göre yalnız teknik çizim, model adı ve makine tipi değişir.

| Dosya | İçerik |
|---|---|
| `onizleme.pdf` | Beş sayfa: Kapak B (QR), Kapak B (dil etiketi), çizim oranı testi, Kapak A, antetli iç sayfa |
| `kapak.html` | Aynı sayfalar, tarayıcıda açılır |
| `sayfa.html` | Antet ve alt bilgili örnek iç sayfa |
| `antet.css` | Renkler, ölçüler ve yazı stilleri (tek kaynak) |
| `ornek-makine-cizimi.png` | Kapak B için ULT M200 3B ön görünüşü (teknik resimden, saydam) |
| `ornek-makine-cizimi-yan.png` | Aynı makinenin yan görünüşü — farklı oranlı çizim testi |
| `qr-dolfintr.svg` | www.dolfintr.com QR kodu (segno ile üretildi) |
| `kbn-1b-kapak/` | KBN 1B için üç kapak seçeneği (`index.html` tarayıcıda açılır). **1 numara seçildi** ve standart oldu; 2 ve 3 kayıt için durur |

HTML dosyaları tarayıcıda açılır; yazdırma (A4, kenar boşluğu yok) PDF ile aynı sonucu verir.

**Firma bilgisi:** Bu klasördeki örnek sayfalar tasarım kaydıdır, eski adresi ve web'i taşır. Güncel bilgi: `codes/brands.js` ve DATA `[URETICI]`. QR kodu (`qr-dolfintr.svg`) hâlâ www.dolfintr.com adresini gösterir.

## Tasarım kararları

- **Renk:** Tek vurgu rengi logodaki kırmızı `#F60000`; geri kalan her şey koyu gri tonlarında.
- **Yazı tipi:** Kılavuz gövdesiyle aynı Calibri. Etiketler küçük, aralıklı büyük harf; model adı büyük ve kalın.
- **Kapak B:** Üst yarıda açık gri zemin üzerinde makine çizimi, kırmızı ayırıcı şerit, altta ortalı başlık bloğu (makine tipi → model → kısa kırmızı ayraç → KULLANIM KILAVUZU), beş sütunlu ortalı bilgi satırı; en altta üretici bilgisi. Bütün öğeler iki yanda eşit 22 mm kenar boşluğunda.
- **Kapak B, sağ üst — iki seçenek:**
  1. QR kod (www.dolfintr.com): logo yüksekliğinde (16,4 mm), logonun üst kenarıyla aynı hizada.
  2. Dil etiketi: kırmızı çerçeveli "TR" — EN/DE kılavuzlarda "EN"/"DE" olur.
- **Talimat dili:** "Orijinal talimatlar" ibaresi (Makine Direktifi 2006/42/AT, 1.7.4.1) bilgi satırında: "Talimat dili: Türkçe — Orijinal talimatlar". Çeviri kılavuzlarda "Orijinal talimatların çevirisi" yazılır.
- **Sayfa anteti:** Solda küçük logo; sağda tek satır bölüm adı "02 │ GÜVENLİK" (numara kırmızı), logonun dikey ortasında. Altta ince gri çizgi, solunda kısa kırmızı vurgu.
- **Alt bilgi:** Solda üretici, ortada belge adı ve revizyon ("LYM 1150 Kullanım Kılavuzu · Rev.00"), sağda sayfa numarası (kırmızı) ve toplam sayfa.
- **Ölçüler:** Antet çizgisi üstten 71 px, alt bilgi çizgisi alttan 99 px — uygulamadaki mevcut değerlerle aynı; aktarıldığında sayfa düzeni değişmez.

## Kapak çizimi — makineye özgü, düzen sabit

- **Sabit kutu:** Çizim 166 × 94 mm'lik sabit bir kutuya oranı korunarak sığar ve tabana oturur. Uzun ön görünüş de dar-yüksek yan görünüş de aynı kutuda durur (`onizleme.pdf` 3. sayfa: test). Düzen hiçbir makinede değişmez.
- **Kaynak sırası:** önce projedeki `assets/kapak/kapak-cizimi.png`, yoksa model şablonundaki (ör. `projects/ult/assets/kapak/kapak-cizimi.png`), o da yoksa panel yalnız logo ve QR ile boş kalır — kapak bozulmaz.
- **Model başına bir kez:** Aynı modelin bütün projeleri şablondaki çizimi kullanır; yalnız özel bir makinede projeye ayrı çizim konur.
- **Hazırlama:** En temiz yol, SolidWorks'te ön görünüşün ölçüsüz PDF/SVG olarak dışa aktarılması. Ölçülü teknik resimden de kırpılabilir (bir kılavuzda böyle yapıldı: kırp → ölçü uzantılarını sil → saydam PNG). Gölgeli STEP görünümleri varsa `scripts/kapak-cizimi.ps1` çizgi çizimi üretir (KBN 1B'de yapıldı: ön + yan görünüş).
- **Biçim:** Saydam arka planlı, koyu çizgili PNG (≥ 2000 px genişlik) veya SVG. Çizgi rengi `#282C32`, kapakta %78 opaklık.

## Uygulamaya aktarma

Kapak A ve B uygulamaya aktarıldı (ayrıntı: `codes/layout-rules.md`); varsayılan kapak B'dir, klasik ve A yalnız `kapak.tasarim` ile açıkça istenince çıkar. Aşağıdaki listeden 3. madde (sayfa anteti ve alt bilgi) henüz uygulanmadı.

1. `codes/brands.js` → DOLFIN: `color: '#F60000'`, `header: { type: 'logo', logo: 'assets/logos/dolfin.png' }`.
2. `codes/cover.js` → `buildCoverPage` Kapak B düzenine göre yeniden yazılır; makine tipi ve seri no DATA'dan (`[PROJE]`), çizim projedeki `assets/` altından, QR veya dil etiketi seçime göre.
3. `codes/header.js` + `codes/style.css` → antet tek satır bölüm adı; alt bilgiye belge adı, revizyon ve toplam sayfa eklenir.
4. Diğer firmalar (müşteri firmaları) aynı düzeni kendi logo ve rengiyle kullanır.
