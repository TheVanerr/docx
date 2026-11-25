// PDF birleştirme: her dil için kapak, safety, cable sayfalarını çizer ve şema sayfalarını ekler.
// Tümü tarayıcıda çalışır; dosya hiçbir yere gönderilmez.
(function () {
  "use strict";
  const P = window.PDFLib;
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString, PDFRef, PDFPage } = P;
  // Temel diller her zaman bu sırada; ayarlardan eklenen diller (FR, ES, ...) arkalarından gelir
  const TEMEL_DILLER = ["TR", "EN", "DE"];
  const EK_DILLER = ["FR", "ES", "IT", "PT", "NL", "PL", "CS", "SK", "HU", "RO", "SV", "DA", "NO", "FI", "SL", "HR"];
  const tumDiller = () => TEMEL_DILLER.concat(EK_DILLER.filter((d) => window.ICERIK && window.ICERIK[d]));
  const sirala = (liste) => tumDiller().filter((d) => liste.includes(d));
  const TIPLER = ["kapak", "guvenlik", "kablo"];
  const ad = (s) => PDFName.of(s);

  // ---------------------------------------------------------------- kaynak PDF
  /**
   * Kaynağı açar ve sayfa içi linkleri plana alır. EPLAN her linkte önce hedef sayfaya gider,
   * ardından highlight(sayfa, kutu) ile hedef sembolü yanıp söndürür. pdf-lib sayfayı kopyalarken
   * hedef sayfaları da kopyalayıp linkleri öksüz bırakacağı için bu linkler sayfadan çıkarılır
   * ve her dil kopyası için kendi sayfalarına yönlendirilerek yeniden yazılır.
   */
  async function kaynakAc(bayt) {
    let doc;
    try {
      doc = await PDFDocument.load(bayt, { updateMetadata: false });
    } catch (e) {
      if (/encrypt/i.test(e.message || "")) throw new Error("Bu PDF parola korumalı. Parolasız hâlini repoya ekleyin.");
      throw new Error("PDF açılamadı. Dosya bozuk olabilir veya henüz kopyalanıyor olabilir.");
    }
    const sayfalar = doc.getPages();
    if (!sayfalar.length) throw new Error("PDF içinde sayfa yok.");
    const noHarita = new Map(sayfalar.map((s, i) => [s.ref, i]));
    const plan = sayfalar.map((s) => {
      const liste = [];
      const dizi = s.node.lookupMaybe(ad("Annots"), PDFArray);
      if (!dizi) return liste;
      const kalan = [];
      for (let i = 0; i < dizi.size(); i++) {
        const ham = dizi.get(i);
        const d = dizi.lookupMaybe(i, PDFDict);
        const lnk = d && linkCoz(d, noHarita, doc);
        if (lnk) liste.push(lnk);
        else kalan.push(ham);
      }
      if (kalan.length) s.node.set(ad("Annots"), doc.context.obj(kalan));
      else s.node.delete(ad("Annots"));
      return liste;
    });
    const r0 = sayfalar[0].getSize();
    return { doc, plan, sayi: sayfalar.length, g: r0.width, y: r0.height };
  }

  function linkCoz(d, noHarita, doc) {
    const alt = d.lookupMaybe(ad("Subtype"), PDFName);
    if (!alt || alt !== ad("Link")) return null;
    const kutu = d.lookupMaybe(ad("Rect"), PDFArray);
    if (!kutu) return null;
    let hedef = null, js = null;
    const eylem = d.lookupMaybe(ad("A"), PDFDict);
    const hedefCoz = (x) => {
      if (!(x instanceof PDFArray) || x.size() < 1) return null;
      const r = x.get(0);
      if (!(r instanceof PDFRef) || !noHarita.has(r)) return null;
      const kuyruk = [];
      for (let i = 1; i < x.size(); i++) kuyruk.push(x.get(i));
      return { sayfa: noHarita.get(r), kuyruk };
    };
    if (eylem) {
      if (eylem.lookupMaybe(ad("S"), PDFName) !== ad("GoTo")) return null;
      hedef = hedefCoz(eylem.lookup(ad("D")));
      const sonraki = eylem.lookupMaybe(ad("Next"), PDFDict);
      if (sonraki && sonraki.lookupMaybe(ad("S"), PDFName) === ad("JavaScript")) {
        const k = sonraki.lookup(ad("JS"));
        if (k instanceof PDFString) js = { ham: k.asString(), hex: false };
        else if (k instanceof PDFHexString) js = { ham: k.decodeText(), hex: true };
      }
    } else {
      hedef = hedefCoz(d.lookup(ad("Dest")));
    }
    if (!hedef) return null;
    return { kutu: kutu.asArray().map((n) => n.asNumber()), hedef, js };
  }

  function linkleriYaz(cikti, yeniSayfalar, plan, ofset) {
    const baglam = cikti.context;
    plan.forEach((liste, i) => {
      for (const l of liste) {
        const eylem = {
          Type: "Action", S: "GoTo",
          D: baglam.obj([yeniSayfalar[l.hedef.sayfa].ref, ...l.hedef.kuyruk]),
        };
        if (l.js) {
          // highlight(n, ...) içindeki sayfa numarası bu kopyanın konumuna kaydırılır
          const kod = l.js.ham.replace(/(highlight\\?\(\s*)(\d+)(\s*,)/g, (_, a, n, c) => a + (parseInt(n, 10) + ofset) + c);
          eylem.Next = { Type: "Action", S: "JavaScript", JS: l.js.hex ? PDFHexString.fromText(kod) : PDFString.of(kod) };
        }
        const x = baglam.register(baglam.obj({ Type: "Annot", Subtype: "Link", Rect: l.kutu, F: 4, Border: [0, 0, 0], A: eylem }));
        yeniSayfalar[i].node.addAnnot(x);
      }
    });
  }

  /** EPLAN'ın belge düzeyindeki vurgulama scriptini taşır. */
  function belgeScripti(kaynak, cikti) {
    const adlar = kaynak.catalog.lookupMaybe(ad("Names"), PDFDict);
    const js = adlar && adlar.lookupMaybe(ad("JavaScript"), PDFDict);
    if (!js) return;
    const kopya = P.PDFObjectCopier.for(kaynak.context, cikti.context).copy(js);
    const ref = cikti.context.register(kopya);
    cikti.catalog.set(ad("Names"), cikti.context.obj({ JavaScript: ref }));
  }

  // ---------------------------------------------------------------- yer imleri
  function yerImleri(cikti, agac) {
    const b = cikti.context;
    const kok = b.nextRef();
    function yaz(ogeler, ust) {
      const refler = ogeler.map(() => b.nextRef());
      let toplam = 0;
      ogeler.forEach((o, i) => {
        const d = { Title: PDFHexString.fromText(o.ad), Parent: ust, Dest: b.obj([o.sayfa, ad("Fit")]) };
        if (i > 0) d.Prev = refler[i - 1];
        if (i < ogeler.length - 1) d.Next = refler[i + 1];
        toplam += 1;
        if (o.alt && o.alt.length) {
          const a = yaz(o.alt, refler[i]);
          d.First = a.ilk; d.Last = a.son; d.Count = a.toplam;
          toplam += a.toplam;
        }
        b.assign(refler[i], b.obj(d));
      });
      return { ilk: refler[0], son: refler[refler.length - 1], toplam };
    }
    const a = yaz(agac, kok);
    b.assign(kok, b.obj({ Type: "Outlines", First: a.ilk, Last: a.son, Count: a.toplam }));
    cikti.catalog.set(ad("Outlines"), kok);
    cikti.catalog.set(ad("PageMode"), ad("UseOutlines"));
  }

  // ---------------------------------------------------------------- şema sayfaları
  /** Kaynak dil Türkçedir: TR kopyası olduğu gibi kalır, diğer dillerde etiketler çevrilir. */
  const KAYNAK_DIL = "TR";
  const cevrilecekMi = (sec, dil) => dil !== KAYNAK_DIL && sec.cevir !== false && window.Ceviri && window.Hafiza;

  /**
   * Dil kopyasının sayfalarına çeviriyi uygular. Sayfa düğümleri kendi içerik akışını alır; özgün akış
   * değişmediği için diğer dil kopyaları etkilenmez. Dönüş: o dilin özet sayıları.
   */
  const nefes = () => new Promise((r) => setTimeout(r));
  async function semaCevir(sec, dil, sayfalar, pf, cikti) {
    const P_ = Ceviri.plan(sec.kaynak, dil);
    const T = sec.kaynak.tarama;
    let degisen = 0;
    for (let i = 0; i < sayfalar.length; i++) {
      if (Ceviri.sayfayaUygula(sayfalar[i], T.sayfalar[i], P_.sayfalar[i], pf, cikti, sec.kutuGoster, T)) degisen++;
      if (i % 10 === 9) await nefes(); // uzun belgelerde arayüz donmasın
    }
    return { dil, degisen, say: P_.say, plan: P_ };
  }

  // ---------------------------------------------------------------- birleştirme
  /**
   * sec: { kaynak (kaynakAc sonucu), diller, ad, tarih, tasarim: {kapak,guvenlik,kablo}, cevir?, kutuGoster? }
   * Dönüş: { bayt, sayfa, bolumler, baslik, uyari, ceviri: [{dil, degisen, say, plan}],
   *          sayfalar: [{dil, tur: "on"|"sema", kaynakSayfa?, imza}] — önizleme değişmeyen sayfaları yeniden çizmez }
   */
  async function olustur(sec) {
    const diller = sirala(sec.diller).filter((d) => window.ICERIK[d]);
    if (!diller.length) throw new Error("En az bir dil seçin.");
    const cikti = await PDFDocument.create();
    cikti.registerFontkit(window.fontkit);

    // Önce listeler: hangi fontlar gerçekten kullanılıyor belli olur, yalnızca onlar gömülür
    const listeler = {};
    const kullanilan = new Set();
    const uyari = [];
    for (const dil of diller) {
      listeler[dil] = TIPLER.map((tip) => {
        const L = Tasarim.sayfa(tip, sec.tasarim[tip], { dil, ad: sec.ad, tarih: sec.tarih });
        L.fontlar.forEach((f) => kullanilan.add(f));
        L.uyari.forEach((u) => uyari.push(`${dil} ${tip}: ${u}`));
        return L;
      });
    }
    const pdfFontlar = {};
    for (const k of kullanilan) {
      pdfFontlar[k] = await cikti.embedFont(Cizim.font(k).bayt, { subset: true, features: Cizim.OZELLIK });
    }
    // Çeviri gereken dil varsa kaynak bir kez taranır ve şema fontu gömülür
    const cevrilen = diller.filter((d) => cevrilecekMi(sec, d));
    let semaFont = null;
    if (cevrilen.length) {
      await Ceviri.hazirla(sec.kaynak);
      semaFont = await cikti.embedFont(Cizim.font(Ceviri.FONT).bayt, { subset: true, features: Cizim.OZELLIK });
    }
    const ceviri = [];

    // Ön sayfalar şemayla aynı kâğıt boyutunda ve yatay olur
    const boyut = [Math.max(sec.kaynak.g, sec.kaynak.y), Math.min(sec.kaynak.g, sec.kaynak.y)];

    const bolumler = [], agac = [], sayfaBilgi = [];
    const icerikSurum = window.Ayarlar ? Ayarlar.surum() : 0;
    let ilkKopya = null, temelNot = null, temelIcerik = null;
    for (const dil of diller) {
      const bas = cikti.getPageCount();
      const onSayfalar = listeler[dil].map((L) => {
        const s = cikti.addPage(boyut);
        Cizim.cizPdf(s, L, pdfFontlar);
        return s;
      });
      const kaynak = sec.kaynak;
      let yeni;
      if (!ilkKopya) {
        yeni = await cikti.copyPages(kaynak.doc, kaynak.doc.getPageIndices());
        yeni.forEach((s) => cikti.addPage(s));
        ilkKopya = yeni;
        // URI gibi diğer notlar ve özgün içerik: sonraki dil kopyalarına da aynen geçer
        temelNot = yeni.map((s) => {
          const d = s.node.lookupMaybe(ad("Annots"), PDFArray);
          return d ? d.asArray().slice() : [];
        });
        temelIcerik = yeni.map((s) => [s.node.get(ad("Contents")), s.node.get(ad("Resources"))]);
        belgeScripti(kaynak.doc, cikti);
      } else {
        // Sonraki dillerde içerik ve fontlar ortak kalır, yalnızca sayfa kaydı ve linkler ayrılır: dosya şişmez
        yeni = ilkKopya.map((s, i) => {
          const dugum = s.node.clone();
          dugum.delete(ad("Annots"));
          if (temelNot[i].length) dugum.set(ad("Annots"), cikti.context.obj(temelNot[i]));
          // İlk kopya çevrilmiş olabilir: özgün içerik geri konur
          if (temelIcerik[i][0]) dugum.set(ad("Contents"), temelIcerik[i][0]);
          if (temelIcerik[i][1]) dugum.set(ad("Resources"), temelIcerik[i][1]);
          const sayfa = PDFPage.of(dugum, cikti.context.register(dugum), cikti);
          cikti.addPage(sayfa);
          return sayfa;
        });
      }
      let cv = null;
      if (cevrilecekMi(sec, dil)) { cv = await semaCevir(sec, dil, yeni, semaFont, cikti); ceviri.push(cv); }
      await nefes();
      TIPLER.forEach((tip, i) => sayfaBilgi.push({ dil, tur: "on", tip, imza: `on|${dil}|${tip}|${sec.tasarim[tip]}|${sec.ad}|${sec.tarih}|${icerikSurum}` }));
      yeni.forEach((_, i) => sayfaBilgi.push({ dil, tur: "sema", kaynakSayfa: i + 1, imza: `sema|${dil}|${i}|${cv ? cv.plan.sayfalar[i].imza : "ozgun"}|${sec.kutuGoster ? 1 : 0}` }));
      linkleriYaz(cikti, yeni, kaynak.plan, cikti.getPages().indexOf(yeni[0]));
      const b = I_bolum(dil);
      const altlar = [
        { ad: b.kapak, sayfa: onSayfalar[0].ref }, { ad: b.guvenlik, sayfa: onSayfalar[1].ref },
        { ad: b.kablo, sayfa: onSayfalar[2].ref }, { ad: b.sema, sayfa: yeni[0].ref },
      ];
      if (diller.length === 1) agac.push(...altlar);
      else agac.push({ ad: `${dil} - ${window.ICERIK[dil].ad}`, sayfa: onSayfalar[0].ref, alt: altlar });
      bolumler.push({ dil, baslik: Tasarim.veri(dil, sec.ad, sec.tarih).baslik, ilk_sayfa: bas + 1, on_sayfa: 3, sema_sayfa: yeni.length });
    }
    yerImleri(cikti, agac);
    const baslik = bolumler[0].baslik;
    cikti.setTitle(baslik);
    cikti.setAuthor(window.ICERIK.hazirlayan);
    cikti.setCreator(window.ICERIK.sirket);
    cikti.setProducer(window.ICERIK.sirket);
    const bayt = await cikti.save({ useObjectStreams: true, addDefaultPage: false });
    return { bayt, sayfa: cikti.getPageCount(), bolumler, baslik, uyari, ceviri, sayfalar: sayfaBilgi };
  }

  const I_bolum = (dil) => window.ICERIK[dil].bolum;

  window.Motor = {
    kaynakAc, olustur, TIPLER, KAYNAK_DIL, TEMEL_DILLER, EK_DILLER, sirala,
    get DILLER() { return tumDiller(); },
  };
})();
