# -*- coding: utf-8 -*-
"""uygulama/logo.js ve uygulama/fontlar.js dosyalarını üretir. Yalnızca logo veya font değişince çalıştırılır.

    python varlik_uret.py <TTF kök klasörü>

TTF kök klasörü, npm ile kurulan @expo-google-fonts paketlerinin bulunduğu klasördür:
    npm install @expo-google-fonts/inter @expo-google-fonts/barlow-condensed @expo-google-fonts/mulish

Logo: "Dolfin" harfleri düşük çözünürlüklü PNG'den ölçülerek doğru ve yaylarla yeniden çizilmiştir
(fark %1'in altında). Slogan ve TM aynı PNG'deki konumlarına Mulish ile dizilir, el yazısı konturlanır.
"""
import base64
import io
import json
import sys
from pathlib import Path

import numpy as np
from fontTools import subset
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image
from scipy.ndimage import gaussian_filter
from skimage import measure

BURASI = Path(__file__).resolve().parent
UYGULAMA = BURASI.parent
KOK = UYGULAMA.parent.parent  # RESEARCH
PNG_YAZILI = KOK / "KURUTMA PERFORMANSI" / "_kaynak" / "logo" / "a_p1_x223.png"
K = 0.5522847

# Kelime logosunun ölçüleri (PNG pikseli)
TABAN, XY = 88.52, 35.78  # taban çizgisi ve x yüksekliği, tüm harflerde ortak
OX, OY = 0.77, 0.77       # sol üst köşe sıfıra çekilir


def n(v):
    return f"{v:.3f}".rstrip("0").rstrip(".")


class Yol:
    def __init__(self):
        self.p = []

    def M(self, x, y):
        self.p.append(f"M{n(x - OX)} {n(y - OY)}")
        return self

    def L(self, x, y):
        self.p.append(f"L{n(x - OX)} {n(y - OY)}")
        return self

    def C(self, a, b, c):
        self.p.append(f"C{n(a[0] - OX)} {n(a[1] - OY)} {n(b[0] - OX)} {n(b[1] - OY)} {n(c[0] - OX)} {n(c[1] - OY)}")
        return self

    def Z(self):
        self.p.append("Z")
        return self

    def yay(self, cx, cy, rx, ry, a0, a1, k=K):
        """Eksen hizalı çeyrek yaylar; açı ekran koordinatında (0=sağ, 90=alt)."""
        adim = 90 if a1 > a0 else -90
        a = a0
        while a != a1:
            b = a + adim
            t0, t1 = np.radians(a), np.radians(b)
            s = np.sign(adim)
            p0 = np.array([cx + rx * np.cos(t0), cy + ry * np.sin(t0)])
            p1 = np.array([cx + rx * np.cos(t1), cy + ry * np.sin(t1)])
            d0 = np.array([-rx * np.sin(t0), ry * np.cos(t0)]) * s
            d1 = np.array([-rx * np.sin(t1), ry * np.cos(t1)]) * s
            self.C(p0 + d0 * k, p1 - d1 * k, p1)
            a = b
        return self

    def metin(self):
        return "".join(self.p)


def kutu(x0, x1, y0, y1):
    return Yol().M(x0, y0).L(x1, y0).L(x1, y1).L(x0, y1).Z()


def kelime_yolu():
    # D
    xl, xs, xci, xo, yt, yct, ycb = 0.77, 20.89, 47.94, 68.67, 10.85, 28.01, 71.30
    D = Yol()
    r = (TABAN - yt) / 2
    D.M(xl, yt).L(xo - r, yt).yay(xo - r, (yt + TABAN) / 2, r, r, -90, 90).L(xl, TABAN).Z()
    rc = (ycb - yct) / 2
    D.M(xs, yct).L(xci - rc, yct).yay(xci - rc, (yct + ycb) / 2, rc, rc, -90, 90).L(xs, ycb).Z()
    # o
    O = Yol()
    cx, cy = 105.05, 62.05
    O.M(cx + 31.66, cy).yay(cx, cy, 31.66, 28.35, 0, 360, 0.59).Z()
    O.M(cx + 12.02, cy).yay(cx, cy, 12.02, 12.02, 0, 360).Z()
    # l
    L = kutu(143.31, 162.04, 3.0, TABAN)
    # f: kanca ucu i sapının üstünde düz biter
    s0, s1, cl, cr, c1, e0, e1, ye, ytop, itop = 172.40, 191.05, 165.85, 201.86, 51.14, 208.84, 227.40, 28.18, 0.77, 16.41
    F = Yol()
    rxd, ryd = (e1 - s0) / 2, ye - ytop
    rxi = (e0 - s1) / 2
    yci = itop + rxi
    F.M(s0, TABAN).L(s0, c1).L(cl, c1).L(cl, XY).L(s0, XY).L(s0, ye)
    F.yay((s0 + e1) / 2, ye, rxd, ryd, 180, 360)
    F.L(e0, ye).L(e0, yci)
    F.yay((s1 + e0) / 2, yci, rxi, rxi, 360, 180)
    F.L(s1, XY).L(cr, XY).L(cr, c1).L(s1, c1).L(s1, TABAN).Z()
    # i
    I = kutu(208.84, 227.40, XY, TABAN)
    # n
    a0, a1, b0, b1, yj, tx, ty, sy, ic = 235.95, 254.61, 273.01, 291.73, 43.06, 272.47, 34.42, 53.52, 49.27
    N = Yol()
    rr = (b0 - a1) / 2
    N.M(a0, TABAN).L(a0, XY).L(a1, XY).L(a1, yj)
    N.C((a1 + (tx - a1) * 0.2, yj - (yj - ty) * 0.77), (tx - (tx - a1) * 0.45, ty), (tx, ty))
    N.yay(tx, sy, b1 - tx, sy - ty, -90, 0)
    N.L(b1, TABAN).L(b0, TABAN).L(b0, ic + rr)
    N.yay(a1 + rr, ic + rr, rr, rr, 0, -180)
    N.L(a1, TABAN).Z()
    return "".join(y.metin() for y in (D, O, L, F, I, N))


def metin_yolu(font, metin, boyut, x0, x1, taban):
    """Metni x0..x1 aralığına, ilk ve son harfin mürekkebi kenarlara oturacak biçimde yayar."""
    gs, cm, up = font.getGlyphSet(), font.getBestCmap(), font["head"].unitsPerEm
    k = boyut / up
    glif = [cm[ord(c)] for c in metin]
    gen = [gs[g].width * k for g in glif]
    glyf = font["glyf"]
    sol = glyf[glif[0]].xMin * k
    sag = (gs[glif[-1]].width - glyf[glif[-1]].xMax) * k
    ls = ((x1 - x0) - (sum(gen) - sol - sag)) / (len(metin) - 1) if len(metin) > 1 else 0
    pen = SVGPathPen(gs, ntos=lambda v: n(v))
    x = x0 - sol
    for g, w in zip(glif, gen):
        gs[g].draw(TransformPen(pen, (k, 0, 0, -k, x - OX, taban - OY)))
        x += w + ls
    return pen.getCommands()


def slogan_ve_tm(mulish):
    f = TTFont(mulish)
    cap = f["OS/2"].sCapHeight / f["head"].unitsPerEm
    boyut = 9.75 / cap
    taban = 102.35
    # Sözcük konumları PNG'den ölçülmüştür
    genislik = 289.9
    s = lambda v: 1.0 + genislik * v / 2000
    parca = [("INDUSTRIAL", 0, 585), ("PARTS", 635, 940), ("WASHING", 985, 1445), ("MACHINES", 1495, 2000)]
    slogan = "".join(metin_yolu(f, m, boyut, s(a), s(b), taban) for m, a, b in parca)
    tm = metin_yolu(f, "TM", 7.4 / cap, 286.6, 299.6, 31.8)
    return slogan, tm


def yazi_yolu():
    """'Washing Systems...' el yazısı: konturlanmış vektör, kelime logosuna göre konumlu."""
    a = np.asarray(Image.open(PNG_YAZILI).convert("RGBA").getchannel("A"), np.float32) / 255
    # kelime logosunun bu PNG'deki genişliği yerleşim ölçeğini verir
    sutun = np.where(a[60:100].max(0) > 0.5)[0]
    oran = 291.0 / (sutun[-1] - sutun[0] + 1)
    b = a.copy()
    b[:120, :] = 0
    h, w = b.shape
    c = 8
    buyuk = np.asarray(Image.fromarray((b * 255).astype(np.uint8)).resize((w * c, h * c), Image.BICUBIC), np.float32) / 255
    buyuk = np.pad(gaussian_filter(buyuk, 1.6), 2)
    parcalar, xs, ys = [], [], []
    for kontur in measure.find_contours(buyuk, 0.5):
        if len(kontur) < 8:
            continue
        p = measure.approximate_polygon(kontur, 0.5)
        y, x = (p[:, 0] - 2) / c, (p[:, 1] - 2) / c
        alan = 0.5 * abs(np.dot(x[:-1], y[1:]) - np.dot(x[1:], y[:-1])) * c * c
        if alan < 30:
            continue
        parcalar.append((x, y))
        xs.append(x)
        ys.append(y)
    x0, y0 = min(v.min() for v in xs), min(v.min() for v in ys)
    x1, y1 = max(v.max() for v in xs), max(v.max() for v in ys)
    d = "".join("M" + "L".join(f"{n(a_ - x0)} {n(b_ - y0)}" for a_, b_ in zip(x, y)) + "Z" for x, y in parcalar)
    merkez_kelime = (sutun[0] + sutun[-1] + 1) / 2
    return {
        "d": d, "g": round(float(x1 - x0), 2), "y": round(float(y1 - y0), 2), "o": round(float(oran), 4),
        # kelime merkezine göre yatay konum, slogan altına düşey konum (kelime birimi)
        "x0": round(float((x0 - merkez_kelime) * oran + 145.5), 2),
        "y0": 110.0,
    }


def font_alt_kume(yol):
    f = TTFont(yol)
    sec = subset.Options()
    sec.layout_features = ["kern"]
    sec.hinting = False
    sec.notdef_outline = True
    sec.glyph_names = False
    sec.name_IDs = [1, 2, 3, 4, 6]
    sec.drop_tables += ["DSIG", "MVAR", "STAT", "fvar", "gvar", "avar", "HVAR"]
    kod = list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026]
    s = subset.Subsetter(sec)
    s.populate(unicodes=kod)
    s.subset(f)
    b = io.BytesIO()
    f.save(b)
    return b.getvalue()


def main():
    kok = Path(sys.argv[1])
    mulish = kok / "mulish/400Regular/Mulish_400Regular.ttf"
    slogan, tm = slogan_ve_tm(mulish)
    logo = {"kelime": {"d": kelime_yolu(), "g": 290.96, "y": 87.75}, "slogan": {"d": slogan, "alt": 101.6},
            "tm": {"d": tm}, "yazi": yazi_yolu()}
    (UYGULAMA / "logo.js").write_text(
        "// _uretim/varlik_uret.py tarafından üretilir: Dolfin logosunun vektör parçaları.\nwindow.LOGO = "
        + json.dumps(logo, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print("logo.js", (UYGULAMA / "logo.js").stat().st_size // 1024, "KB")
    fontlar = {
        "r": "inter/400Regular/Inter_400Regular.ttf", "m": "inter/500Medium/Inter_500Medium.ttf",
        "s": "inter/600SemiBold/Inter_600SemiBold.ttf", "b": "inter/700Bold/Inter_700Bold.ttf",
        "x": "inter/800ExtraBold/Inter_800ExtraBold.ttf",
        "ds": "barlow-condensed/600SemiBold/BarlowCondensed_600SemiBold.ttf",
        "db": "barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf",
    }
    cikti = {}
    for k, y in fontlar.items():
        veri = font_alt_kume(kok / y)
        cikti[k] = base64.b64encode(veri).decode()
        print(k, len(veri) // 1024, "KB")
    (UYGULAMA / "fontlar.js").write_text(
        "// _uretim/varlik_uret.py tarafından üretilir: Inter ve Barlow Condensed (SIL OFL), Türkçe ve Almanca karakterli alt küme.\n"
        "window.FONTLAR = " + json.dumps(cikti, separators=(",", ":")) + ";\n", encoding="utf-8")
    print("fontlar.js", (UYGULAMA / "fontlar.js").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
