// Terim düzenleyici: bir terimin bütün dillerdeki karşılığı, onayı ve geçmişi. Yazılan karşılık kütüphaneye eklenir.
// Önizlemedeki işaretten, sağdaki Eksik listesinden ve terim tablosundan açılır. Yazmayı kolaylaştırmak için
// kütüphanede aynı sözcükleri taşıyan terimler örnek olarak gösterilir.
(function () {
  "use strict";
  const { el, hal } = U;
  const yt = (s) => (String(s).match(/\{\d+\}/g) || []).sort().join(",");
  const KAYNAK_AD = { claude: "Claude (eski)", elle: "Elle", sozluk: "Kütüphane", "ice-aktarma": "İçe aktarma", otomatik: "Sabit sözcük" };

  function belgedekiTerim(sablon) {
    if (!hal.kaynak || !hal.kaynak.tarama) return null;
    const a = Hafiza.anahtar(sablon);
    return Ceviri.terimler(hal.kaynak).find((t) => Hafiza.anahtar(t.sablon) === a) || null;
  }

  /** Şablonun sözcükleri: yer tutucular ve 3 harften kısa parçalar sayılmaz. */
  const sozcukler = (s) => new Set(Hafiza.anahtar(String(s).replace(/\{\d+\}/g, " ")).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));

  /** Kütüphanede bu terimle sözcük paylaşan, çevrilmiş terimler; en çok ortak sözcüğü olan önce. */
  function benzerler(sablon, diller, adet) {
    const ana = sozcukler(sablon);
    if (!ana.size) return [];
    const a = Hafiza.anahtar(sablon);
    const o = [];
    for (const k of Hafiza.hepsi()) {
      if (k.tur !== "cevir" || Hafiza.anahtar(k.sablon) === a || !diller.some((d) => k[d])) continue;
      const kw = sozcukler(k.sablon);
      let ortak = 0;
      for (const w of kw) if (ana.has(w)) ortak++;
      if (ortak) o.push({ k, ortak, fark: Math.abs(kw.size - ana.size) });
    }
    return o.sort((x, y) => y.ortak - x.ortak || x.fark - y.fark || x.k.sablon.localeCompare(y.k.sablon, "tr")).slice(0, adet).map((x) => x.k);
  }

  /**
   * sablon: Türkçe şablon. sec: {dil (öne çıkan dil), isaret (önizlemedeki işaret: kutu), kaynakSayfa,
   * sonraki (verilirse "Kaydet ve sonraki" düğmesi: kayıttan sonra çağrılır), kalan (sırada bekleyen eksik sayısı)}
   */
  async function duzenle(sablon, sec) {
    sec = sec || {};
    const kayit = Hafiza.bul(sablon);
    const terim = belgedekiTerim(sablon);
    const diller = [...new Set(U.cevrilenDiller().concat(U.tabloDilleri(), Hafiza.dilleri(kayit)))].filter((d) => d !== "TR");
    const durumlar = {};

    // ---- tür
    const turSec = el("select", { id: "dzTur", "aria-label": "Tür" },
      el("option", { value: "cevir", metin: "Çevrilir" }), el("option", { value: "sabit", metin: "Sabit: çevrilmez (marka, kişi, kısaltma)" }));
    turSec.value = kayit && kayit.tur === "sabit" ? "sabit" : "cevir";

    // ---- dil girişleri
    const girisler = {};
    const dilKutu = el("div", { class: "dil-giris" });
    for (const d of diller) {
      const i = el("input", { type: "text", id: "dz-" + d, spellcheck: "false", autocomplete: "off", value: kayit && kayit.tur === "cevir" ? kayit[d] || "" : "", placeholder: `${U.dilAdi(d)} karşılığı` });
      girisler[d] = i;
      const bekliyor = kayit && kayit.onaysiz && kayit.onaysiz.includes(d) && kayit[d];
      durumlar[d] = bekliyor ? "bekliyor" : kayit && kayit[d] ? "onayli" : "eksik";
      const etk = el("span", { class: "etk " + durumlar[d], metin: bekliyor ? "Onay bekliyor" : kayit && kayit[d] ? "Kütüphanede" : "Eksik" });
      if (bekliyor) i.classList.add("onaysiz");
      dilKutu.append(el("b", { metin: d, title: U.dilAdi(d) }), i, etk);
    }
    // Odak: istenen dil, yoksa ilk boş kutu
    const odak = girisler[sec.dil] || Object.values(girisler).find((i) => !i.value) || Object.values(girisler)[0];
    if (odak) setTimeout(() => { odak.focus(); odak.select(); }, 30);
    const turDegisti = () => { for (const i of Object.values(girisler)) i.disabled = turSec.value === "sabit"; };
    turSec.addEventListener("change", turDegisti);
    turDegisti();

    // ---- bilgi
    const bilgi = [];
    if (terim) {
      const ss = [...terim.sayfalar].sort((a, b) => a - b);
      bilgi.push(`Bu belgede ${terim.adet} kez, şema sayfası ${ss.slice(0, 10).join(", ")}${ss.length > 10 ? "…" : ""}`);
      if (terim.ornek !== sablon) bilgi.push(`Örnek: ${terim.ornek}`);
    }
    if (kayit) bilgi.push(`Kaynak: ${KAYNAK_AD[kayit.kaynak] || kayit.kaynak || "?"}${kayit.tarih ? " · " + U.tarihYaz(kayit.tarih) : ""}`);
    else bilgi.push("Kütüphanede yok. Yazdığınız karşılık kütüphaneye eklenir ve bundan sonraki bütün şemalarda kullanılır.");
    if (/\{\d+\}/.test(sablon)) bilgi.push("{0} gibi yer tutucular cihaz kodu ve numaraların yeridir; çeviride aynen kalmalı.");

    // ---- kütüphanede benzer terimler
    const benzerKutu = el("div");
    const benzer = benzerler(sablon, diller, 6);
    if (benzer.length) {
      const ul = el("ul", { class: "gecmis benzer" });
      for (const k of benzer) {
        const deger = diller.filter((d) => k[d]).map((d) => `${d}: ${k[d]}`).join(" · ");
        ul.appendChild(el("li", {},
          el("div", {}, el("div", { metin: k.sablon }), el("span", { metin: deger })),
          el("button", { class: "dugme kucuk", type: "button", metin: "Kutulara yaz", title: "Bu terimin karşılıklarını kutulara yazar; sonra düzeltebilirsiniz", onclick: () => {
            turSec.value = "cevir"; turDegisti();
            for (const d of diller) if (k[d]) { girisler[d].value = k[d]; girisler[d].classList.remove("onaysiz"); }
            const i = girisler[sec.dil] || Object.values(girisler)[0];
            if (i) i.focus();
          } })));
      }
      benzerKutu.append(el("h4", { class: "dz-baslik", metin: "Kütüphanede benzer terimler" }), ul);
    }

    // ---- geçmiş
    const gecmisKutu = el("div");
    async function gecmisYaz() {
      const k = Hafiza.bul(sablon);
      const g = (k && k.gecmis) || [];
      gecmisKutu.textContent = "";
      if (!g.length) return;
      const adlar = await Bulut.adlar([...new Set(g.map((x) => x.kim).filter(Boolean))]);
      const ul = el("ul", { class: "gecmis" });
      g.forEach((x, i) => {
        const deger = x.tur === "sabit" ? "sabit (çevrilmez)" : diller.filter((d) => x[d]).map((d) => `${d}: ${x[d]}`).join(" · ");
        const kim = x.kim ? adlar[x.kim] || "bir kullanıcı" : "";
        ul.appendChild(el("li", {},
          el("div", {}, el("div", { metin: deger || "boş" }), el("span", { metin: [U.tarihYaz(x.tarih), (KAYNAK_AD[x.kaynak] || x.kaynak || "").toLocaleLowerCase("tr"), kim].filter(Boolean).join(" · ") })),
          el("button", { class: "dugme kucuk", type: "button", metin: i === 0 ? "Geri al" : "Bu sürüme dön", onclick: async () => {
            if (i === 0) await Hafiza.geriAl(sablon);
            else {
              const t = { sablon, tur: x.tur };
              for (const d of Hafiza.dilleri(x)) t[d] = x[d];
              await Hafiza.ekle([t], "elle", { birlestir: false });
            }
            U.durum(`Önceki sürüme dönüldü: ${sablon}`, "tamam");
            p.kapat();
          } })));
      });
      gecmisKutu.append(el("h4", { class: "dz-baslik", metin: "Geçmiş" }), ul);
    }

    // ---- kaydet / onayla / sil
    const hataYaz = el("p", { style: { margin: 0, color: "var(--kirmizi-k)", fontWeight: 600 }, hidden: true });
    /** Kütüphaneye yazar; sonrakiyeGec ise kapandıktan sonra sıradaki eksik terim açılır. */
    async function kaydet(sonrakiyeGec) {
      hataYaz.hidden = true;
      if (turSec.value === "sabit") {
        await Hafiza.ekle([{ sablon, tur: "sabit" }], "elle");
        U.durum(`Kütüphaneye eklendi: ${sablon} çevrilmeyecek.`, "tamam");
      } else {
        const t = { sablon, tur: "cevir" };
        for (const d of diller) {
          const v = girisler[d].value.replace(/\s+/g, " ").trim();
          if (!v) continue;
          if (yt(v) !== yt(sablon)) {
            hataYaz.textContent = `${d}: yer tutucular (${yt(sablon) || "yok"}) çeviride aynen olmalı.`;
            hataYaz.hidden = false;
            girisler[d].focus();
            return;
          }
          t[d] = v;
        }
        if (!Hafiza.dilleri(t).length) { hataYaz.textContent = "En az bir dilde karşılık yazın veya türü sabit yapın."; hataYaz.hidden = false; return; }
        // Elle kaydedilen her dil onaylı sayılır; diğer dillerin onay durumu korunur
        await Hafiza.ekle([t], "elle", { birlestir: true });
        U.durum(`Kütüphaneye eklendi: ${sablon}`, "tamam");
      }
      p.kapat();
      // Pencere kapanış olayı bitmeden yenisi açılmasın
      if (sonrakiyeGec && sec.sonraki) setTimeout(sec.sonraki, 60);
    }
    const dugmeler = [];
    const geriAlDugmesi = { yazi: "Geri al", is: () => U.sonIslemiGeriAl() };
    const ozgun = Hafiza.sozlukKaydi(sablon);
    if (kayit && kayit.kaynak !== "sozluk" && ozgun) {
      // Programla gelen terimde silme yok: yalnız sizin değişikliğiniz kaldırılır
      const ozgunYazi = ozgun.tur === "sabit" ? "çevrilmez" : diller.filter((d) => ozgun[d]).map((d) => `${d}: ${ozgun[d]}`).join(" · ");
      dugmeler.push(el("button", { class: "dugme sol", type: "button", metin: "Kütüphanedeki karşılığa dön", title: `Programla gelen karşılık: ${ozgunYazi}`, onclick: async () => {
        await Hafiza.sozlugeDon(kayit.sablon);
        U.durum(`Kütüphanedeki karşılığa dönüldü: ${sablon}`, "tamam", { dugme: geriAlDugmesi });
        p.kapat();
      } }));
    } else if (kayit && kayit.kaynak !== "sozluk") {
      dugmeler.push(el("button", { class: "dugme tehlike sol", type: "button", metin: "Kütüphaneden sil", onclick: async () => {
        const c = await U.soru({ baslik: "Terimi sil", metin: `"${sablon}" kütüphaneden silinsin mi? Bu belgede kaynak dilde kalır ve Eksik listesine düşer. Ctrl+Z ile ya da Terimler > Silinenler'den geri getirilir.`, dugmeler: [{ yazi: "Vazgeç", deger: false }, { yazi: "Sil", deger: true, ana: true }] });
        if (c) { await Hafiza.sil(sablon); U.durum(`Kütüphaneden silindi: ${sablon}`, "", { dugme: geriAlDugmesi }); }
      } }));
    }
    if (kayit && kayit.onaysiz && kayit.onaysiz.length) {
      dugmeler.push(el("button", { class: "dugme", type: "button", metin: "Değiştirmeden onayla", onclick: async () => {
        await Hafiza.onayla([sablon]);
        U.durum(`Onaylandı: ${sablon}`, "tamam");
        p.kapat();
      } }));
    }
    if (sec.sonraki) {
      dugmeler.push(el("button", { class: "dugme", type: "button", metin: "Kaydet", onclick: () => kaydet(false) }));
      dugmeler.push(el("button", { class: "dugme ana", type: "button", metin: `Kaydet ve sonraki${sec.kalan ? ` (${sec.kalan} kaldı)` : ""}`, onclick: () => kaydet(true) }));
    } else dugmeler.push(el("button", { class: "dugme ana", type: "button", metin: "Kaydet", onclick: () => kaydet(false) }));

    const icerik = el("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
      el("p", { style: { margin: 0, color: "var(--soluk)", fontSize: "13px" } }, ...bilgi.flatMap((b, i) => [i ? el("br") : null, b])),
      el("label", { class: "alan" }, el("span", { class: "etiket", metin: "Tür" }), turSec),
      dilKutu,
      hataYaz,
      benzerKutu,
      gecmisKutu);
    // Enter: kaydet (sıra varsa kaydedip sıradakine geç)
    icerik.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); kaydet(!!sec.sonraki); } });
    const p = U.pencere({ baslik: sablon, alt: kayit ? "Terim düzenle" : "Eksik terim: karşılığını yazın", icerik, dugmeler, genis: 680 });
    gecmisYaz();
  }

  U.duzenle = duzenle;
})();
