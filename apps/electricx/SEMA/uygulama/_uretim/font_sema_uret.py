# -*- coding: utf-8 -*-
"""uygulama/font-sema.js dosyasını üretir: şema etiketlerinde kullanılan Open Sans (SIL OFL) alt kümesi.

    python font_sema_uret.py <OpenSans_400Regular.ttf>

Kaynak PDF'ler Tahoma ile basılmıştır ve Tahoma'nın dosyası uygulamayla dağıtılamaz. Open Sans; büyük harf
yüksekliği ve harf yapısı olarak Tahoma'ya en yakın açık lisanslı seçenektir (ortalama genişlik farkı %4).
"""
import base64
import io
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

UYGULAMA = Path(__file__).resolve().parent.parent


def main():
    f = TTFont(sys.argv[1])
    sec = subset.Options()
    sec.layout_features = ["kern"]
    sec.hinting = False
    sec.notdef_outline = True
    sec.glyph_names = False
    sec.name_IDs = [1, 2, 3, 4, 6]
    sec.drop_tables += ["DSIG", "MVAR", "STAT", "fvar", "gvar", "avar", "HVAR"]
    kod = list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + [
        0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20AC, 0x2126, 0x03A9, 0x03BC, 0x2212,
    ]
    s = subset.Subsetter(sec)
    s.populate(unicodes=kod)
    s.subset(f)
    b = io.BytesIO()
    f.save(b)
    veri = b.getvalue()
    (UYGULAMA / "font-sema.js").write_text(
        "// _uretim/font_sema_uret.py tarafından üretilir: Open Sans (SIL OFL). Şema etiketlerinin çevirisi bu fontla basılır.\n"
        'window.FONTLAR.sema = "' + base64.b64encode(veri).decode() + '";\n', encoding="utf-8")
    print("font-sema.js", (UYGULAMA / "font-sema.js").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
