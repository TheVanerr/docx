// Kapak, güvenlik ve kablo sayfalarının tüm metinleri burada.
// Metin değiştirirken çift tırnakları koruyun ve satır sonlarındaki virgüllere dikkat edin.
// Değiştirdikten sonra sayfayı yenilemeniz yeterlidir.
window.ICERIK = {
  "hazirlayan": "Murat KALAZ",
  "sirket": "CNK ELEKTRONİK MAKİNE SANAYİ A.Ş.",
  "web": "www.cnk.com.tr",
  "sonek_kaliplari": [
    "ELECTRICAL SCHEMATIC", "ELECTRICAL SHEMATIC", "ELECTRICAL SCHEMATICS",
    "ELEKTRISCHER SCHALTPLAN", "ELEKTRİK ŞEMASI"
  ],
  "kablo_satirlari": [
    { "kod": "BK",   "kesit": "2,5 mm²", "mm2": 2.5, "renk": ["#17181A"] },
    { "kod": "BU",   "kesit": "2,5 mm²", "mm2": 2.5, "renk": ["#1E6FD9"] },
    { "kod": "GNYE", "kesit": "2,5 mm²", "mm2": 2.5, "renk": ["#F5C800", "#1C9A4B"] },
    { "kod": "RD",   "kesit": "1,0 mm²", "mm2": 1.0, "renk": ["#D90B1C"] },
    { "kod": "BU",   "kesit": "1,0 mm²", "mm2": 1.0, "renk": ["#1E6FD9"] },
    { "kod": "BU",   "kesit": "0,5 mm²", "mm2": 0.5, "renk": ["#123A7A"] },
    { "kod": "BUWH", "kesit": "0,5 mm²", "mm2": 0.5, "renk": ["#7CC6F4"] }
  ],
  "TR": {
    "ad": "Türkçe",
    "sema": "ELEKTRİK ŞEMASI",
    "kapak": { "tarih": "Yayın Tarihi", "hazirlayan": "Hazırlayan", "uretici": "Üretici", "belge": "Doküman" },
    "bolum": { "kapak": "Kapak", "guvenlik": "Güvenlik Kuralları", "kablo": "Kablo Renk Kodları", "sema": "Elektrik Şeması" },
    "guvenlik": {
      "baslik": "GÜVENLİK KURALLARI",
      "alt_baslik": "GENEL GÜVENLİK KURALLARI",
      "tehlike": "TEHLİKE!",
      "kritik": [
        "Sistem çalışırken bazı bileşenler tehlikeli elektrik gerilimi altındadır!",
        "Güvenlik talimatlarına uyulmaması ölüme, ağır yaralanmalara veya ciddi maddi hasara yol açabilir!",
        "Sistemin taşınması, kurulumu, devreye alınması ve bakımı yalnızca gerekli eğitimi almış, yetkili ve kalifiye personel tarafından yapılmalıdır!",
        "Tüm çalışmalar sırasında geçerli ulusal ve uluslararası standartlara ve tesise özgü iş kazası önleme kurallarına kesinlikle uyulmalıdır!"
      ],
      "kurallar": [
        "Sistemin montajı, devreye alınması, onarımı ve arıza tespiti yalnızca ilgili kullanım kılavuzlarını bilen, yetkili ve kalifiye personel tarafından yapılmalıdır.",
        "Tüm ekipman, geçerli ulusal/uluslararası standartlara, yasal düzenlemelere ve yerel mevzuata uygun olarak kurulmalıdır.",
        "Sistemin ve operatörlerin güvenliği için topraklama, kablo kesiti boyutlandırması ve kısa devre koruma sistemleri eksiksiz ve standartlara uygun şekilde yapılmalıdır.",
        "Bakım, onarım ve güvenlik testlerinden önce sisteme gelen tüm enerji beslemeleri kesilmeli, yetkisiz olarak yeniden enerji verilmesini önlemek için kilitlenmeli ve uygun uyarı levhaları asılmalıdır (Kilitleme/Etiketleme prosedürü).",
        "Elektriksel ölçümlerde yalnızca teknik olarak kusursuz, kalibre edilmiş ve ilgili ölçüm kategorisine uygun test cihazları kullanılmalıdır.",
        "Cihazların kullanım kılavuzlarında yer alan tehlike, uyarı ve güvenlik talimatlarına kesinlikle uyulmalıdır.",
        "Sistem çalışırken elektrik panosu kapakları, koruyucu muhafazalar ve makine kapıları her zaman kapalı tutulmalıdır.",
        "Sisteme entegre pano soğutma ünitelerinin veya fanların düzgün çalışması sağlanmalıdır; buna filtrelerin düzenli aralıklarla temizlenmesi ve değiştirilmesi de dahildir."
      ]
    },
    "kablo": {
      "baslik": "Kablo Renk Kodları",
      "sutunlar": ["Açıklama", "Renk", "IEC 757", "Minimum Kesit"],
      "dipnot": "Renk kodları IEC 757'ye göre verilmiştir.",
      "aciklama": [
        "L1-L2-L3 (Ana Fazlar)",
        "N (Nötr)",
        "PE (Toprak / Koruma İletkeni)",
        "Kumanda devresi 24-220VAC",
        "Kumanda devresi 24-220VAC nötr",
        "Kumanda devresi 24VDC (+)",
        "Kumanda devresi 24VDC (-)"
      ],
      "renk": ["Siyah", "Mavi", "Sarı-Yeşil", "Kırmızı", "Mavi", "Koyu Mavi", "Açık Mavi"]
    }
  },
  "EN": {
    "ad": "English",
    "sema": "ELECTRICAL SCHEMATIC",
    "kapak": { "tarih": "Issue Date", "hazirlayan": "Prepared by", "uretici": "Manufacturer", "belge": "Document" },
    "bolum": { "kapak": "Cover", "guvenlik": "Safety Regulations", "kablo": "Cable Color Coding", "sema": "Electrical Schematic" },
    "guvenlik": {
      "baslik": "SAFETY REGULATIONS",
      "alt_baslik": "GENERAL SAFETY REGULATIONS",
      "tehlike": "DANGER!",
      "kritik": [
        "During the operation of the system, certain components are under dangerous electrical voltage!",
        "Failure to observe the safety instructions may result in death, severe bodily injury, or serious property damage!",
        "Transportation, installation, commissioning, and maintenance of the system must be carried out exclusively by authorized and qualified personnel with the necessary training!",
        "It is mandatory to strictly comply with the applicable national and international standards, as well as site-specific accident prevention regulations during all work!"
      ],
      "kurallar": [
        "Assembly, commissioning, repair, and troubleshooting of the system must be performed exclusively by authorized and qualified personnel who are familiar with the relevant operating manuals.",
        "All equipment must be installed in accordance with the applicable national/international standards, legal frameworks, and local regulations.",
        "To ensure the safety of the system and the operators; grounding, cable cross-section dimensioning, and short-circuit protection systems must be installed completely and in compliance with standards.",
        "Prior to maintenance, repair, and safety tests; all power supplies to the system must be disconnected, locked out to prevent unauthorized re-energization, and appropriate warning signs must be affixed (Lockout/Tagout procedure).",
        "Only technically flawless, calibrated test equipment appropriate for the relevant measurement category may be used for electrical measurements.",
        "The danger, warning, and safety instructions provided in the operating manuals of the devices must be strictly adhered to.",
        "During the operation of the system, electrical panel covers, protective guards, and machine doors must be kept closed at all times.",
        "The proper functioning of panel cooling units or fans integrated into the system must be ensured; this includes cleaning and replacing the filters at regular intervals."
      ]
    },
    "kablo": {
      "baslik": "Cable Color Coding",
      "sutunlar": ["Description", "Color", "IEC 757", "Minimum Cross-Section"],
      "dipnot": "Color codes according to IEC 757.",
      "aciklama": [
        "L1-L2-L3 (Main Phases)",
        "N (Neutral)",
        "PE (Earth / Ground)",
        "Control circuit 24-220VAC",
        "Control circuit 24-220VAC neutral",
        "Control circuit 24VDC (+)",
        "Control circuit 24VDC (-)"
      ],
      "renk": ["Black", "Blue", "Yellow-Green", "Red", "Blue", "Dark Blue", "Light Blue"]
    }
  },
  "DE": {
    "ad": "Deutsch",
    "sema": "ELEKTRISCHER SCHALTPLAN",
    "kapak": { "tarih": "Ausgabedatum", "hazirlayan": "Erstellt von", "uretici": "Hersteller", "belge": "Dokument" },
    "bolum": { "kapak": "Deckblatt", "guvenlik": "Sicherheitsvorschriften", "kablo": "Kabelfarbcodierung", "sema": "Elektrischer Schaltplan" },
    "guvenlik": {
      "baslik": "SICHERHEITSVORSCHRIFTEN",
      "alt_baslik": "ALLGEMEINE SICHERHEITSVORSCHRIFTEN",
      "tehlike": "GEFAHR!",
      "kritik": [
        "Während des Betriebs der Anlage stehen bestimmte Komponenten unter gefährlicher elektrischer Spannung!",
        "Die Nichtbeachtung der Sicherheitshinweise kann zu Tod, schweren Körperverletzungen oder erheblichen Sachschäden führen!",
        "Transport, Montage, Inbetriebnahme und Instandhaltung der Anlage dürfen ausschließlich von entsprechend geschultem, autorisiertem und qualifiziertem Fachpersonal durchgeführt werden!",
        "Während aller Arbeiten sind die geltenden nationalen und internationalen Normen sowie die anlagenspezifischen Unfallverhütungsvorschriften zwingend zu beachten!"
      ],
      "kurallar": [
        "Montage, Inbetriebnahme, Reparatur und Fehlersuche an der Anlage dürfen ausschließlich von qualifiziertem Fachpersonal durchgeführt werden, das mit den entsprechenden Betriebsanleitungen vertraut ist.",
        "Alle Geräte müssen gemäß den geltenden nationalen/internationalen Normen sowie den gesetzlichen und örtlichen Vorschriften installiert werden.",
        "Um die Sicherheit der Anlage und des Bedienpersonals zu gewährleisten, sind Erdung, Leitungsdimensionierung und Kurzschlussschutzsysteme vollständig und normgerecht auszuführen.",
        "Vor Wartungs-, Reparatur- und Sicherheitsprüfungen müssen alle Stromversorgungen zur Anlage abgeschaltet, gegen unbefugtes Wiedereinschalten gesichert und mit entsprechenden Warnschildern versehen werden (Lockout-Tagout-Verfahren / Freischalten).",
        "Für elektrische Messungen dürfen nur technisch einwandfreie, kalibrierte und für die jeweilige Messkategorie geeignete Prüfgeräte verwendet werden.",
        "Die in den Betriebsanleitungen der Geräte enthaltenen Gefahren-, Warn- und Sicherheitshinweise sind strikt zu befolgen.",
        "Während des Betriebs der Anlage müssen Schaltschranktüren, Schutzabdeckungen und Maschinentüren stets geschlossen bleiben.",
        "Die einwandfreie Funktion der in das System integrierten Schaltschrank-Kühlgeräte oder Lüfter ist sicherzustellen; dies schließt die regelmäßige Reinigung und den Austausch der vorhandenen Filter ein."
      ]
    },
    "kablo": {
      "baslik": "Kabelfarbcodierung",
      "sutunlar": ["Beschreibung", "Farbe", "IEC 757", "Mindestquerschnitt"],
      "dipnot": "Farbcodes nach IEC 757.",
      "aciklama": [
        "L1-L2-L3 (Hauptphasen)",
        "N (Neutralleiter)",
        "PE (Erde / Schutzleiter)",
        "Steuerstromkreis 24-220VAC",
        "Steuerstromkreis 24-220VAC neutral",
        "Steuerstromkreis 24VDC (+)",
        "Steuerstromkreis 24VDC (-)"
      ],
      "renk": ["Schwarz", "Blau", "Gelb-Grün", "Rot", "Blau", "Dunkelblau", "Hellblau"]
    }
  }
};
