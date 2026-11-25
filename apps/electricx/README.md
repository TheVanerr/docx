# ELECTRICX

Elektrik kutusu malzeme listesi, pano etiketi ve şema çevirisi tek uygulamada, tek veritabanında. Veritabanı özel bir GitHub deposudur: ücretsizdir, sunucu ve kurulum gerektirmez, her kayıt geçmişte durur.

## Başlatma

İki yol vardır, ikisi de aynı veritabanını kullanır:

- **Uygulama olarak (PWA):** <https://thevanerr.github.io/ELECTRICX/> adresini **Chrome veya Edge** ile açın, üstteki **Uygulamayı kur** düğmesine (ya da adres çubuğundaki kur simgesine) basın. ELECTRICX kendi penceresinde, kendi simgesiyle açılır; program dosyaları saklanır, internet yokken de açılır. Yeni sürüm internet varken kendiliğinden gelir.
- **Dosyadan:** `index.html` dosyasını Chrome veya Edge ile açın (çift tık). Sunucu, Node ya da kurulacak paket yoktur; her şey HTML dosyalarında çalışır.

Kurulan uygulama ile dosyadan açılan sayfa tarayıcıda ayrı yer sayılır: ikisinde de bir kez depoya bağlanılır, veriler depodan gelir.

İlk açılışta ekrandaki adımları izleyin:

1. Özel depo oluşturun (`electricx-veri`). Depo zaten varsa geçin.
2. Erişim anahtarı oluşturun. "Only select repositories" altında yalnız bu depoyu seçin.
3. Anahtarı ana ekrana yapıştırıp **Bağlan** deyin. Depoda veri varsa kendiliğinden gelir. Bilgisayardaki `veri/` klasöründe yeni paftalar varsa **Klasörden aktar** ile ELECTRICX klasörünü seçin; paftalar, etiket projeleri ve çeviri kütüphanesine eklenen terimler depoya gider.

Başka bir bilgisayarda: uygulamayı yukarıdaki adresten kurun (ya da program klasörünü kopyalayıp `index.html` dosyasını açın), aynı depo ve anahtarla bağlanın. Veriler kendiliğinden gelir. Veri ve program ayrı durur.

GitHub'a bağlanmadan denemek için ekrandaki **Şimdilik yalnız bu bilgisayarda kullan** seçilir; sonradan bağlanınca yapılanlar depoya gönderilir.

## Programlar

Üstteki sekmeler programlar arasında geçer. Programlar açık kalır: şemayı açıp etikete baksanız da PDF kapanmaz.

| Sekme | İş | Kayıt yeri |
|---|---|---|
| **Malzeme Listesi** | Elektrik kutusu paftaları, depo listesi, IO, pano iç dizilimi, kurallar, pano modelleri, kaynak dosyalar | `KUTU/projeler/`, `KUTU/kaynaklar/` |
| **Pano Etiketi** | Etiket tasarımı, ölçü, standart denetimi, gerçekçi görünüm, PDF ve SVG çıktısı | `ETIKET/projeler/` |
| **Şema Çeviri** | EPLAN şema PDF'ine kapak, Safety Regulations, Cable Color Coding ekler, etiketleri çevirir; terimler, toplu işlem, arşiv | `SEMA/` |

### Malzeme listesi hazırlama

**+ Yeni Proje** penceresi kuralların zorunlu sorularını sorar (model, pano ölçüsü, emniyet rölesi, opsiyonlar) ve projeyi açar. Pafta kurallara göre Claude ile hazırlanır: proje ekranındaki **İsteği kopyala** ile isteği Claude Code'a yapıştırın, Claude paftayı `veri/KUTU/projeler/<proje>/` altına yazar, **Pafta yükle** ile veritabanına alınır. Kurallar `KUTU/kurallar/KURALLAR.md` içindedir, Claude'un talimatı `CLAUDE.md`'dedir.

Pafta yenilenince önceki hâli proje dosyalarında `surumler/` altında kalır. Paftanın dil, PDF, depo işaretleri ve Excel'e kopyala düğmeleri paftanın içindedir.

### Pano etiketi

**Aç** ve **Kaydet** pencerelerinde iki yer vardır: **Veritabanı** ve **Bu bilgisayar** (seçilen klasör). İkisi kendiliğinden eşitlenmez; klasördeki projeler **Veritabanına aktar** ile kopyalanır. Üzerine yazılan her kaydın eski hâli **Yedekler**'de durur (proje başına son 20).

### Şema çeviri

Şema etiketleri programla gelen **kütüphaneden** çevrilir (geçmiş şemalardan çıkarılan TR → EN, DE karşılıklar); dış bir çeviri hizmeti ya da API anahtarı gerekmez. Kütüphanede karşılığı olmayan terimler önizlemenin sağındaki **Eksik** listesine düşer; tıklayıp karşılığını yazdığınız terim kütüphaneye (veritabanına) eklenir ve sonraki bütün şemalarda kullanılır. Ayrıntılar: [SEMA/README.md](SEMA/README.md).

## Klasörler

| Yol | İçerik |
|---|---|
| `index.html` | Kabuk ve ana ekran: program sekmeleri, depo bağlantısı, aktarma, yedek |
| `manifest.webmanifest`, `sw.js` | Uygulama olarak kurma (PWA): ad, simge, kısayollar; program dosyalarını saklayan service worker |
| `ortak/` | Veritabanı (`ex-db.js`), GitHub bağlantısı (`ex-github.js`), aktarma (`ex-aktar.js`), açılış (`ex-boot.js`), bilgisayar klasörü köprüsü (`ex-yerel.js`), tema (`tema.css`) |
| `KUTU/` | Malzeme Listesi programı, kurallar, pano modelleri, stok fotoğrafları |
| `ETIKET/` | Pano Etiketi programı |
| `SEMA/` | Şema Çeviri programı |
| `veri/` | Bilgisayardaki veri kopyası, depo düzeninde; Claude paftaları buraya yazar. Bu depoya girmez (`.gitignore`), güncel veri `electricx-veri`'dedir |
| `ES/` | Geçmiş müşteri şemaları (PDF). Bu depoya girmez; `electricx-veri`'de `ES/` altında durur, cihazlara kendiliğinden inmez |

## Kayıt nasıl çalışır

- Her kayıt önce bu cihazın tarayıcı veritabanına yazılır, internet kesilse de kaybolmaz.
- Değişenler en geç 1 dakikada bir, sayfadan çıkarken ve sayfa açılırken tek commit olarak depoya gönderilir. Ana ekrandaki **Şimdi eşitle** beklemeden gönderir. Programlar kabuğun içinde çalışır, depoyla yalnız kabuk konuşur; üstteki durum yazısı bekleyen dosyaları gösterir.
- Sayfa kapanırken gönderim yarım kalırsa kayıt cihazda bekler, sonraki açılışta gider. Hemen başka bilgisayara geçecekseniz önce eşitleyin.
- İki cihazda aynı dosya değişirse yeni olan asıl dosya olur, eskisi yanında `.catisma-<tarih>` adıyla saklanır. Silme ile düzenleme karşılaşırsa düzenleme kalır. Çeviri kütüphanesinde aynı parçaya eklenen farklı terimler birleşir.
- Başka cihazdan gelen değişiklik açık programa yansır; etikette kaydedilmemiş değişiklik varsa kaydederken sorulur.
- Arşiv PDF'leri her cihaza inmez, ilk açıldıklarında iner; geri kalan her şey eşitlemede gelir.
- Depoda dosyalar programdaki gibi durur (`KUTU/projeler/...`, `ETIKET/projeler/...`, `SEMA/hafiza/...`). Eski bir sürüm GitHub'daki geçmişten alınabilir. Ana ekrandaki **Yedek indir** de tüm veriyi tek dosyaya alır.

## Depo sınırları

İstek hızı en çok dakikada 3 yazma isteğidir (GitHub sınırı dakikada 80, saatte 500), ilk aktarmada ikili dosyalar turlara bölünür. Sınıra takılan kayıt cihazda bekler, sonra kendiliğinden gönderilir. Tek dosya sınırı 100 MB, aktarma 50 MB, arşiv dosya başına 20 MB. GitHub depo boyutu için 1 GB'ı önerir; Arşiv sekmesindeki ölçer bunu gösterir.

## Sınırlar

- **Şema çevirisi:** Kütüphanedeki karşılıklarla yapılır; kütüphanede olmayan terim yazılana kadar kaynak dilde (Türkçe) kalır.
- **Malzeme listesi:** Pafta program içinde hesaplanmaz, kurallara göre Claude hazırlar; program zorunlu soruları alır, isteği hazırlar, paftayı saklar ve gösterir.
- **Çıktılar:** PDF, SVG ve Excel İndirilenler'e kaydedilir.
- **Erişim anahtarları:** Yalnız bu tarayıcıda saklanır, ancak bilgisayarda açtığınız başka bir yerel HTML dosyası da onları okuyabilir; kurulan uygulamada da aynı `thevanerr.github.io` adresindeki başka GitHub Pages sayfaları okuyabilir. Bu yüzden GitHub anahtarı yalnız `electricx-veri` deposuna izinli olmalıdır; bilinmeyen HTML dosyalarını bu tarayıcıda açmayın. Süresi dolunca ana ekrandan yenilenir.
- **Özel depo zorunlu:** Veritabanı deposu (`electricx-veri`) gizli olmalıdır; herkese açık depoya bağlanılmaz, çünkü müşteri verisi içerir. Program deposu (`ELECTRICX`) herkese açıktır ve müşteri verisi taşımaz.
