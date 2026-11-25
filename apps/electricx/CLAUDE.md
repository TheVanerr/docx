# ELECTRICX

Elektrik kutusu malzeme listesi (`KUTU/`), pano etiketi (`ETIKET/`) ve şema çevirisi (`SEMA/`) tek uygulamada. Kabuk `index.html`, ortak katman `ortak/`. Program verisi `electricx-veri` adlı özel GitHub deposundadır; tanıtım ve yapı için [README.md](README.md).

Uygulama saf HTML'dir: sunucu, derleme, Node veya paket kurulumu yoktur, sayfalar dosyadan açılır. GitHub Pages'ten PWA olarak da kurulur (`manifest.webmanifest`, `sw.js`, ikonlar `ortak/varliklar/ikon*`). Projeye modül eklenmez. Veri GitHub deposunda durur.

## Depolar ve müşteri verisi

- `ELECTRICX` herkese açık depodur, yalnız program kodu taşır. `veri/`, `ES/` ve `SEMA/ornekler/` `.gitignore`'dadır: bilgisayarda kalır, ELECTRICX'e commit edilmez, `git add -f` ile de eklenmez.
- Müşteri verisi yalnız gizli `electricx-veri` deposundadır: `veri/` içeriği depo düzeninde (`KUTU/projeler/...`), `ES/` aynı adla. Programlar `ES/`'i okumaz; eşitlemede hiçbir cihaza kendiliğinden inmez (`ortak/ex-boot.js` → `lazy`).
- `sw.js` içindeki `CEKIRDEK` listesi program dosyalarıdır; program dosyası eklenir, taşınır ya da silinirse listeyi de güncelle.

## Elektrik panosu malzeme listesi

Kullanıcı «elektrik panosu malzeme listesi hazırla», «elektrik kutusu yap», «elektrik kutusu hazırlayalım» veya benzerini dediğinde ya da uygulamanın «Yeni proje» penceresinden kopyalanan isteği yapıştırdığında, önce [KUTU/kurallar/KURALLAR.md](KUTU/kurallar/KURALLAR.md) dosyasını baştan sona oku ve kuralların tamamına uy.

- Bölüm 1'deki soruları (makine modeli ve opsiyonlar, pano ölçüsü, TMŞ/Pako, IOF) cevap gelmeden geçme. İstekte verilen cevapları yeniden sorma.
- Malzeme yalnız KURALLAR.md'deki stoktan; ad + stok kodu birlikte. Kod uydurma.
- Çıktıda hangi kurala dayandığın tartışılırsa kural numarasıyla (R5.4 gibi) belirt.
- «Açık sorular» bölümündeki sorulardan biri işe dokunuyorsa kullanıcıya sor.
- Pafta tek HTML dosyasıdır (fotoğraflar gömülü, R10.3). En yeni örnek `veri/KUTU/projeler/<seri>-<FİRMA>-<MODEL>/<seri>.html` biçimindedir. Stok fotoğrafları `KUTU/photos/temiz/` altındadır.
- Çıktı `veri/KUTU/projeler/<seri>-<firma>-<model>/<seri>.html` yoluna yazılır. Kullanıcı uygulamada projeyi açıp **Pafta yükle** ile veritabanına alır; yeni klasörler ana ekrandaki **Klasörden aktar** ile de gelir. `veri/` klasörü silinmişse aynı yolu yeniden oluştur.

## Kuralları değiştirme

- Tek kaynak `KUTU/kurallar/KURALLAR.md`. `KUTU/.cursor/rules/elektrik-malzeme.mdc` eski kaynaktır, güncellenmez.
- Kural ekleyince/değiştirince numaralandırmayı koru (yeni kural bölümün sonuna, sıradaki numara).
- Her değişiklikten sonra ikisini de çalıştır: `python KUTU/kurallar/build_html.py` (→ `kurallar.html`, tüm kurallar) ve `python KUTU/kurallar/build_panolar.py` (→ `panolar.html` model sayfaları, `modeller.js` yeni proje penceresi).
- Model yapısı (etiket yerleşimi, olmazsa olmazlar, opsiyonlar, modele ait kural listesi) `KUTU/kurallar/build_panolar.py` içindeki `MODELS`'tadır. Bir kural modele özel bir şeyi değiştiriyorsa orayı da güncelle. Malzeme adları ve kural metinleri KURALLAR.md'den okunur; kodu/kuralı bulunamazsa betik hata verir.
- Karara bağlanan açık soru (Qn) ilgili kurala işlenir ve «Açık sorular» bölümünden silinir.

## Şema çeviri kütüphanesi

- Şema çevirisi yalnız kütüphaneden yapılır: `SEMA/uygulama/sozluk.js` (`"TR": ["EN", "DE"]`, çevrilmeyenler `sabit`). Claude/API ile çeviri yoktur, geri eklenmez.
- `ES/` geçmiş elektrik şemalarıdır (müşteri PDF'leri; bilgisayarda ve gizli `electricx-veri` deposunda durur, ELECTRICX'e girmez). Kütüphane bunlardan ve teslim edilmiş EN/DE çıktılardan çıkarıldı. Yeni terim eklerken aynı terminolojiye uy (YIKAMA = Washing / Wasch-, TERMİK = Thermal relay / Thermorelais, ACİL STOP = Emergency stop / Not-Halt, ARIZA = fault / Störung), `{0}` yer tutucularını koru.
- Kullanıcının uygulamada **Eksik** listesinden yazdığı karşılıklar veritabanındadır (`SEMA/hafiza/`) ve sözlükteki karşılığın yerine geçer.
