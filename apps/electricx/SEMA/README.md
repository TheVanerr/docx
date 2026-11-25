# Şema Çeviri

Türkçe EPLAN şema PDF'lerine seçilen dillerde kapak, Safety Regulations ve Cable Color Coding sayfalarını ekler ve şema sayfalarındaki etiketleri çevirir. ELECTRICX'in **Şema Çeviri** sekmesidir. Her şey tarayıcıda çalışır; PDF sunucuya yüklenmez, yalnız arşiv açıksa ELECTRICX veritabanına (özel GitHub deposu) gider.

Çeviri **kütüphaneden** yapılır; dış bir çeviri hizmetine bağlanılmaz. Kütüphane, ES klasöründeki geçmiş elektrik şemalarından çıkarılan Türkçe terimlerin İngilizce ve Almanca karşılıklarıdır (`uygulama/sozluk.js`, yaklaşık 290 terim ve 85 çevrilmeyen kod/marka) ve daha önce teslim edilen çevirilerle tutarlıdır. Kütüphanede karşılığı olmayan terimler sağdaki **Eksik** listesine düşer; orada yazdığınız karşılık kütüphaneye eklenir ve bundan sonraki bütün şemalarda kullanılır.

Eklenen terimler, ayarlar ve arşiv ELECTRICX veritabanındadır: her cihazdan aynısı görünür, her değişiklik depo geçmişinde durur. Eklenen terim programla gelen karşılığın yerine geçer.

## Kullanım

1. PDF'i pencereye sürükleyip bırakın veya `PDF aç` ile seçin. Birden çok PDF bırakırsanız **Toplu** sekmesinde birlikte işlenir.
2. Dil düğmelerinden istediklerinizi seçin (TR, EN, DE ve Ayarlar'da eklediğiniz diller). Her dil için `kapak → Safety Regulations → Cable Color Coding → şema` sırasıyla birleştirilir.
3. Çeviri dili seçiliyse şema etiketleri taranır ve kütüphanedeki karşılıklarıyla çevrilir.
4. **Eksik terimler.** Kütüphanede karşılığı olmayan terimler önizlemede kırmızı çerçeveyle işaretlenir ve sağdaki **Eksik** listesinde bir kez (kaç yerde geçtiği ve şema sayfalarıyla) listelenir; liste PDF açılınca kendiliğinden açılır. Bir terime tıklayınca şemadaki yerine gidilir ve terim düzenleyici açılır: her dilin karşılığını yazın, `Kaydet ve sonraki` ile sıradaki eksik terime geçin (Enter da aynı işi yapar). Düzenleyici, kütüphanede aynı sözcükleri taşıyan terimleri örnek olarak gösterir; `Kutulara yaz` ile birini başlangıç alıp düzeltebilirsiniz. Marka, kişi adı veya kısaltma ise türü **Sabit** yapın, çevrilmez. Yazdığınız karşılık hemen kütüphaneye eklenir ve PDF yenilenir.
5. Kapak adını yazın, tarihi seçin. Hazırlayan Ayarlar'dan değişir (varsayılan Murat KALAZ).
6. `Kaydet`. Dosya adı kapak adı + `ELECTRICAL SCHEMATIC` olur (`LYM ELECTRICAL SCHEMATIC.pdf`). Onay bekleyen veya eksik terim varsa önce sorulur. `▾` menüsünden "Her dil ayrı PDF" seçilirse dil başına bir dosya tek zip içinde verilir; "Arşive ekle" açıksa çıktı ve kaynak PDF arşive yüklenir.

## Önizleme ve Eksik paneli

| İşaret | Anlamı |
| --- | --- |
| Kırmızı | Çevrilmedi: kütüphanede karşılığı yok, kaynak dilde kaldı |
| Mavi kesikli | Onay bekliyor: eski hafızadan gelen, henüz onaylanmamış çeviri |
| Turuncu | Küçültüldü: dar alana sığması için yazı küçültüldü |
| Mor | Fontta yok: çevirideki bir harf gömülü fontta yok |
| Yeşil (isteğe bağlı) | Basılan bütün çeviriler |

Panelin başında eksik terimler, altında **Diğer kontroller** (küçültülen, fontta olmayan, onay bekleyen, sığmayan ön sayfa metinleri) sayfa sayfa durur. Üstteki çiplerle tek türe süzülür; `Gizle` ile kapatılan panel masanın sağ üstündeki `Eksik (N)` düğmesiyle açılır.

Yakınlaştırma (%100–%300) küçük etiketleri incelemek içindir. Uzun PDF'lerde yalnızca ekrandaki sayfalar çizilir; bir terim değişince yalnızca o terimin geçtiği sayfalar yeniden hesaplanır.

## Terimler sekmesi

Sekme açılınca **Kütüphane** görünür: bütün terimler Türkçe, İngilizce ve Almanca karşılıklarıyla alfabetik sırada (çevrilmeyen kod ve markalar en sonda). **Bu belge**, **Eksikler** ve **Onay bekleyenler** açık PDF'e göre süzer; **Silinenler** silinen terimleri gösterir. Her satırda dil başına karşılıkları, onay durumu, kaynağı (Kütüphane, Elle, İçe aktarma, Claude (eski)) ve kaç kez geçtiği. Kutuda yazılan ya da düzeltilen karşılık kütüphaneye eklenir ve onaylı sayılır; PDF kendiliğinden yenilenir. **Eksikler** filtresi belgedeki eksik terimleri tabloda topluca yazmak içindir. `sabit` türü çevrilmez (marka, kişi, kısaltma). `{0}` gibi yer tutucular cihaz kodu ve numaraların yeridir (`YIKAMA POMPASI {0}` → `Washing pump {0}`), çeviride aynen kalmalıdır.

- **Çıktı al**: kütüphaneyi Türkçe – İngilizce – Almanca olarak **yazdırır** (A4, harf harf gruplu, sayfa numaralı; yazıcı olarak "PDF olarak kaydet" seçilirse PDF olur) ya da **Excel** olarak indirir. Diller seçilebilir; istenirse çevrilmeyen kod ve markalar ayrı liste olarak eklenir; yalnız listede görünenler (sekme ve arama kutusuna göre) de alınabilir.
- **Onay bekleyenler** filtresi ve "Listedeki N terimi onayla".
- **Düzenle**: terimin geçmişi (son 5 sürüm, kimin değiştirdiği), geri alma, kütüphanede benzer terimler.
- **Silme ve geri alma**: Tablodan terim silinmez. Düzenle penceresinde, sizin eklediğiniz bir terim onayla silinebilir; programla gelen bir terimde yalnız **Kütüphanedeki karşılığa dön** vardır. Her değişiklik (düzeltme, silme, onay, içe aktarma) **↶ Geri al** düğmesiyle ya da **Ctrl+Z** ile geri alınır; bir kutuya yazarken Ctrl+Z o kutudaki yazıyı geri alır. Silinen terimler **Silinenler**'de durur, **Geri getir** ile döner (sayfa yenilense de).
- **CSV indir**: listede görünen terimleri (sekme ve aramaya göre; çevrilmeyen kod ve markalar hariç) `Türkçe (TR);English (EN);Deutsch (DE);Yorum / Comment / Kommentar` sütunlarıyla indirir. Müşteriye kontrol için gönderilir; düzeltilmiş dosya **İçe aktar** ile geri alınır, başlıklar kendiliğinden tanınır. **Bu belge** seçiliyken dosya adı PDF'in adını taşır.
- **İçe aktar**: JSON (uygulamanın yedeği), CSV veya Excel (.xlsx, .xls, .ods). Tabloda her sütunun dilini seçersiniz; başlıklar (Türkçe, English, Deutsch...) tanınır. İçe aktarılan terimler onaylı sayılır.
- **Dışa aktar**: sizin eklediğiniz terimler JSON (geri yüklenebilir yedek) veya CSV olarak; bütün kütüphane için Çıktı al.

İki cihaz aynı anda farklı terim eklerse ikisi de kütüphanede kalır; aynı terim iki yerde değişirse yeni tarihli olan geçerlidir.

## Toplu sekmesi

Birden çok PDF birlikte taranır ve kütüphaneyle çevrilir; üstte bütün PDF'lerdeki eksik terim sayısı (aynı terim bir kez) görünür. Eksikleri yazmak için PDF'i `Önizlemede aç` ile açıp Eksik listesini kullanın. Kapak adı dosya başına değiştirilebilir; dil, tarih ve kaydetme biçimi üst şeritten gelir. Hepsi tek zip olarak kaydedilir.

## Arşiv sekmesi

Kaydedilen her PDF, kaynağıyla birlikte saklanır (dosya başına en çok 20 MB; aynı kaynak bir kez saklanır). Arşivden yeniden indirilebilir veya **Kaynağı aç** ile güncel kütüphaneyle yeniden üretilebilir. Arşiv PDF'leri her cihaza inmez, ilk açıldıklarında depodan iner.

## Ayarlar sekmesi

- **Diller**: FR, ES, IT, PT, NL, PL, CS, SK, HU, RO, SV, DA, NO, FI, SL, HR eklenebilir. Ön sayfa metinlerini o dile çevirip kaydedince dil etkinleşir. Kütüphane EN ve DE içindir; ek dilde bütün şema terimleri Eksik listesine düşer ve oradan yazılır. Kiril alfabeli diller (Rusça) gömülü fontlarda olmadığı için eklenemez.
- **Ön sayfa metinleri**: Kapak etiketleri, güvenlik kuralları, kablo tablosu metinleri (her dil için), şirket adı, web adresi, hazırlayan ve kablo satırları (kod, kesit, renkler). Kablo tablosu 7 satırdır; üç tasarım bu sayıya göre çizilir. `uygulama/icerik.js` varsayılandır; burada yapılan değişiklikler veritabanında saklanır ve "Varsayılana dön" ile geri alınır.
- **Kütüphane ve yedek** (eklenen terimleri JSON olarak indirme), **Sürüm**.

## Tasarımlar sekmesi

Kapak, Safety Regulations ve Cable Color Coding için üçer tasarım: Kırmızı Panel, Teknik Pafta, Kurumsal Bant. Galeride görülen sayfa PDF'e basılanla birebir aynıdır.

## Çeviri nasıl yapılır

`uygulama/ceviri.js` sayfanın içerik akışını okur, yazıları satır ve etiketlere ayırır (çok satırlı etiketler birleştirilir), cihaz kodlarını yer tutucuya çevirir ve kütüphanedeki karşılığı bulur. Eşleşmede büyük/küçük harf ve 6 harften uzun sözcüklerde Türkçe karakter farkı (I/İ, Ş/S…) önemsenmez; şemadaki etiket büyük harfliyse çeviri de büyük harfle basılır. Özgün yazı silinir; çeviri çizgilere ve diğer yazılara değmeyecek boş alana (yazılardan en az bir boşluk, çizgilerden 1,2 pt uzakta) aynı boyutta, gerekirse küçültülerek veya alt satıra bölünerek Open Sans ile basılır. Kodlar, sayılar ve çapraz referanslar olduğu gibi kalır. Her dil kopyası kendi içerik akışını alır; TR kopyası özgün kalır.

Yazıları form nesnesi içinde olan PDF'ler (yazdırılarak veya dönüştürülerek üretilmiş) de çevrilir, form belgede bir kez kullanılıyorsa: formun bir kopyası değiştirilir. EPLAN PDF'lerindeki çapraz referans linkleri ve hedef sembolü yanıp söndüren script korunur.

## Klasörler

| Yol | İçerik |
| --- | --- |
| `index.html` | Sayfa iskeleti ve stiller |
| `uygulama/arayuz/` | Arayüz modülleri: ortak parçalar, önizleme, terim düzenleyici, terimler, toplu, arşiv, galeri, ayarlar, ana akış |
| `uygulama/yerel-yetenek.js` | Veritabanı, arşiv deposu ve kullanıcı kimliği |
| `uygulama/ceviri.js` | Etiket tarama, yerleştirme ve PDF'e yazma |
| `uygulama/hafiza.js` | Kütüphane katmanları: programla gelen + eklenen terimler (onay, geçmiş, çok dil) |
| `uygulama/ayarlar.js` | Ek diller, ön sayfa metinleri, tasarım seçimi |
| `uygulama/bulut.js` | Yetenekler (veritabanı, dosya, kullanıcı) |
| `uygulama/birlestir.js` | PDF birleştirme |
| `uygulama/zip.js`, `uygulama/tablo.js` | Zip yazıcı, CSV/Excel okuma |
| `uygulama/sozluk.js` | Kütüphane: geçmiş şemalardan çıkarılan TR → EN, DE karşılıklar ve çevrilmeyen kodlar/markalar. Elle de düzenlenebilir: `"TR": ["EN", "DE"]` |
| `uygulama/icerik.js` | Ön sayfaların varsayılan metinleri (TR, EN, DE), şirket, kablo tablosu |
| `uygulama/tasarimlar.js`, `uygulama/cizim.js` | Üç tasarım ailesi ve ortak çizim katmanı |
| `uygulama/logo.js`, `uygulama/fontlar.js`, `uygulama/font-sema.js` | Vektör logo ve gömülü yazı tipleri (`_uretim/` üretir) |
| `uygulama/pdf.min.js`, `pdf.worker.min.js` | pdf.js 3.11.174 (Apache 2.0), önizleme |
| `uygulama/pdf-lib.min.js`, `fontkit.umd.min.js` | PDF yazma ve yazı tipi gömme |
| `uygulama/xlsx.core.min.js` | SheetJS 0.18.5 (Apache 2.0), Excel okuma; yalnızca ilk Excel dosyasında yüklenir |
| `uygulama/_uretim/` | Varlık üretimi ve claude.ai yayın hazırlığı betikleri (Python) |
| `ornekler/` | Örnek şema PDF'leri (müşteri şemaları; yalnız bilgisayarda, depoya girmez. Aynıları veri deposunda `ES/` altında) |

## claude.ai'deki eski uygulama

Eski Şema Motoru claude.ai'de ayrı bir Artifact olarak durmaya devam eder (`Şema Motoru (claude.ai).url`). Hafızası ve arşivi ELECTRICX'e taşındı; o hafızadaki onaylanmamış Claude çevirileri kütüphanedeki karşılığın yerine geçmez; bundan sonra yapılan değişiklikler iki tarafta kendiliğinden eşitlenmez. Bu sayfa gerekirse `python uygulama/_uretim/artifact_hazirla.py <çıkış klasörü>` ile yeniden yayın biçimine getirilebilir; yayın sayfası ELECTRICX'in ortak katmanını taşımaz, claude.ai'nin kendi yeteneklerini kullanır.
