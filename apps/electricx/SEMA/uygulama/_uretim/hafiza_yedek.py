# -*- coding: utf-8 -*-
"""Artifact veritabanındaki çeviri hafızasını repodaki yedek dosyasına yazar.

    python uygulama/_uretim/hafiza_yedek.py <hafiza belgelerinin klasörü> [yedek dosyası]

Girdi: hafiza koleksiyonunun belgeleri, belge başına bir JSON dosyası (Claude Code'un ArtifactData
`list` + `out_dir` çıktısı: <klasör>/hafiza/q00.json ...). Her dosya {"terimler": {...}} veya
{"data": {"terimler": {...}}} biçiminde olabilir. Eski düzenin p0..pf belgeleri de okunur.
Çıktı: uygulamadaki "Dışa aktar" ile aynı biçim (yedek/ceviri-hafizasi.json); Terimler > İçe aktar ile geri yüklenir.
Değişiklik yoksa dosyaya dokunulmaz (çıkış kodu 0, "değişmedi" yazar).
"""
import json
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent.parent
DIL = lambda k: len(k) == 2 and k.isupper() and k.isalpha()


def ozu(k):
    o = {"tur": k.get("tur"), "kaynak": k.get("kaynak"), "tarih": k.get("tarih")}
    if k.get("kim"):
        o["kim"] = k["kim"]
    for d in sorted(x for x in k if DIL(x)):
        o[d] = k[d]
    if k.get("onaysiz"):
        o["onaysiz"] = k["onaysiz"]
    return o


def main():
    klasor = Path(sys.argv[1])
    hedef = Path(sys.argv[2]) if len(sys.argv) > 2 else KOK / "yedek" / "ceviri-hafizasi.json"
    dosyalar = sorted(klasor.rglob("*.json"))
    if not dosyalar:
        sys.exit(f"{klasor} içinde belge yok")
    kayit = {}
    for f in dosyalar:
        j = json.loads(f.read_text(encoding="utf-8"))
        g = j.get("data", j)
        for k in (g.get("terimler") or {}).values():
            if k and k.get("sablon") and not k.get("silindi") and k.get("tur") in ("cevir", "sabit"):
                kayit[k["sablon"]] = ozu(k)
    adlar = sorted(kayit, key=lambda s: s.casefold())
    satir = [f"    {json.dumps(a, ensure_ascii=False)}: {json.dumps(kayit[a], ensure_ascii=False)}" for a in adlar]
    metin = ('{\n  "aciklama": "Şema Motoru çeviri hafızası. tur: cevir veya sabit. {0} gibi yer tutucular kod ve numaraların yeridir. onaysiz: onay bekleyen diller.",\n'
             '  "terimler": {\n' + ",\n".join(satir) + "\n  }\n}\n")
    if hedef.exists() and hedef.read_text(encoding="utf-8") == metin:
        print("değişmedi", len(kayit), "terim")
        return
    hedef.parent.mkdir(parents=True, exist_ok=True)
    hedef.write_text(metin, encoding="utf-8")
    print("yazıldı", hedef, len(kayit), "terim")


if __name__ == "__main__":
    main()
