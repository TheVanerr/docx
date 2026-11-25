# SoftwareX

PLC/HMI yazılım dokümanlarını gösteren görüntüleyici. Belgeleri yapay zekâ, SOFTWAREX klasöründeki Python
betikleriyle üretir (`_dokuman_araclari/`); SoftwareX yalnız gösterir. DocumentX gibi: yazım uygulamanın dışında,
görme uygulamada.

| Sekme | Dosya | Okuyucu |
|---|---|---|
| Teknik doküman | `Yazılım Dokümantasyonu.html` | Teknik ve adresli: sizin için |
| Servis | `Servis.html` | Kurulum ve servis personeli (servis şifrelerini içerir) |
| Kullanım bilgileri | `KKOut.html` | Müşteri: kullanım kılavuzunun PLC bölümü |
| Denetim raporu | `Rapor.html` | PLC yazılımcısı (detaylı) ve işletme (sade) |

## Kullanım

- DOCX'te **SoftwareX**'e girin (ya da `index.html`'i Chrome / Edge ile açın), **SOFTWAREX klasörünü seç** deyin.
  Klasör yalnız bu bilgisayarda okunur, hiçbir yere yüklenmez. Sonraki açılışlarda klasör hatırlanır.
- Üstteki sekmeler dört belge arasında geçer; her belge açık kalır. Belgelerin kendi üst menüsündeki bağlantılar
  da sekme değiştirir ve açık makineyi (`#makine1`) diğer belgeye taşır.
- Belgedeki bağlantı klasördeki başka bir HTML'e gidiyorsa o dosya aynı sekmede açılır; bulunamazsa üstte kısa uyarı çıkar.
- Sağ üstteki seçimden o sekmede başka bir HTML açılabilir (klasördeki ve iki alt klasör düzeyindeki tüm `.html`).
- Yapay zekâ belgeyi yeniden ürettiyse **Yenile**: klasör ve açık belge diskteki son hâliyle yeniden okunur.
- Web adresinde (DOCX içinde) ve dosyadan açılışta (`index.html`'e çift tık) aynı çalışır.

## Nasıl çalışır

Belge klasörden okunur ve çerçevede blob adresinden açılır; dosya belleğe kopyalanmaz. Blob adresinde belgenin göreli
bağlantıları (`Servis.html#makine1`) açılamaz ve dosyadan açılışta tarayıcı SoftwareX'in çerçeveye erişmesine izin
vermez. Bu yüzden belgenin sonuna küçük bir **köprü** betiği eklenir (`softwarex.js` > `kopru`, yalnız ASCII):

- belge → SoftwareX: açık adres, başlık, menü bağlantıları; başka belgeye giden bağlantıya tıklama
- dosyadan açılışta belge kendi `#…` adresini değiştiremez (tarayıcı yok sayar): `#…` tıklamaları da SoftwareX'e gider,
  adresi SoftwareX verir (çerçevenin adresinde yalnız `#…` değişir, belge yeniden yüklenmez)

Belgeyi üreten betiklerde değişiklik gerekmez.

## Dosyalar

| Dosya | İş |
|---|---|
| `index.html`, `softwarex.css` | Sayfa (ortak tema: `../../ortak/tema.css`) |
| `sx-cekirdek.js` | Belgeler, dosya adı eşleştirme, belgeler arası bağlantı, göreli yol, makine adresi (tarayıcıya bağlı değil) |
| `softwarex.js` | Klasör (File System Access API, IndexedDB'de hatırlanır), sekmeler, belge çerçeveleri, köprü |
| `test/sx.test.js` | Çekirdek testleri: `npm test` |

Belgeler müşteri verisidir (Servis şifre içerir): bu depoya ve yayına girmez, yalnız bilgisayardaki klasörden okunur.
