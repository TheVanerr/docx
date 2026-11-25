# Kapak cizimi ureticisi: golgeli STEP gorunumlerinden saydam arka planli cizgi cizim (kapak-cizimi.png).
# Birden fazla gorunus verilirse ayni olcekle yan yana dizilir, ayaklar ayni tabana oturur.
# Golgeli gorseller icin: yerel ortalamadan koyu pikseller cizgi sayilir, duz yuzeyler ve beyaz zemin saydam kalir.
#
#   powershell -ExecutionPolicy Bypass -File scripts/kapak-cizimi.ps1 `
#     -Gorunus "projects/kbn-1b/assets/13.2/on-gorunus.jpg,projects/kbn-1b/assets/13.2/sag-yan-gorunus.jpg" `
#     -Cikti "projects/kbn-1b/assets/kapak/kapak-cizimi.png"
#
# Cikti, modelin sablonuna konursa o modelin butun projeleri kullanir; projeye konursa yalniz o proje.
# Fotograf icin uygun degildir: arka plan da cizgiye donusur. SolidWorks'ten olcusuz cikti varsa o tercih edilir.
param(
  [Parameter(Mandatory = $true)][string[]]$Gorunus,
  [Parameter(Mandatory = $true)][string]$Cikti,
  [int]$Bosluk = 190
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class KapakCizimi {
  const int Yaricap = 7;
  const double Alt = 9, Ust = 42;
  public static Bitmap Cizgi(string kaynak) {
    using (var giris = new Bitmap(kaynak))
    using (var bmp = new Bitmap(giris.Width, giris.Height, PixelFormat.Format32bppArgb)) {
      using (var gr = Graphics.FromImage(bmp)) gr.DrawImage(giris, 0, 0, giris.Width, giris.Height);
      int w = bmp.Width, h = bmp.Height;
      var kilit = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
      int st = kilit.Stride;
      var buf = new byte[st * h];
      Marshal.Copy(kilit.Scan0, buf, 0, buf.Length);
      var lum = new double[w * h];
      for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        int o = y * st + x * 4;
        lum[y * w + x] = 0.114 * buf[o] + 0.587 * buf[o + 1] + 0.299 * buf[o + 2];
      }
      var sat = new double[(w + 1) * (h + 1)];
      for (int y = 0; y < h; y++) {
        double satir = 0;
        for (int x = 0; x < w; x++) { satir += lum[y * w + x]; sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + satir; }
      }
      var a = new byte[w * h];
      for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        int x0 = Math.Max(0, x - Yaricap), x1 = Math.Min(w, x + Yaricap + 1), y0 = Math.Max(0, y - Yaricap), y1 = Math.Min(h, y + Yaricap + 1);
        double ort = (sat[y1 * (w + 1) + x1] - sat[y0 * (w + 1) + x1] - sat[y1 * (w + 1) + x0] + sat[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
        double v = (ort - lum[y * w + x] - Alt) / (Ust - Alt);
        if (v < 0) v = 0; if (v > 1) v = 1;
        a[y * w + x] = (byte)(v * 255);
      }
      var c = (byte[])a.Clone();
      for (int y = 1; y < h - 1; y++) for (int x = 1; x < w - 1; x++) {
        byte m = c[y * w + x];
        if (c[y * w + x - 1] > m) m = c[y * w + x - 1];
        if (c[y * w + x + 1] > m) m = c[y * w + x + 1];
        if (c[(y - 1) * w + x] > m) m = c[(y - 1) * w + x];
        if (c[(y + 1) * w + x] > m) m = c[(y + 1) * w + x];
        a[y * w + x] = m;
      }
      int minX = w, minY = h, maxX = -1, maxY = -1;
      for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        int o = y * st + x * 4;
        buf[o] = 50; buf[o + 1] = 44; buf[o + 2] = 40; buf[o + 3] = a[y * w + x];
        if (a[y * w + x] > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      Marshal.Copy(buf, 0, kilit.Scan0, buf.Length);
      bmp.UnlockBits(kilit);
      if (maxX < 0) throw new Exception("Cizgi bulunamadi: " + kaynak);
      return bmp.Clone(new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1), PixelFormat.Format32bppArgb);
    }
  }
}
'@
$Gorunus = @($Gorunus | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$parcalar = @($Gorunus | ForEach-Object { [KapakCizimi]::Cizgi((Resolve-Path $_).Path) })
$w = (($parcalar | Measure-Object -Property Width -Sum).Sum) + $Bosluk * ($parcalar.Count - 1)
$h = ($parcalar | Measure-Object -Property Height -Maximum).Maximum
$sonuc = New-Object System.Drawing.Bitmap ([int]$w), ([int]$h), ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($sonuc)
$x = 0
foreach ($p in $parcalar) {
  $g.DrawImageUnscaled($p, $x, [int]$h - $p.Height)
  $x += $p.Width + $Bosluk
  $p.Dispose()
}
$g.Dispose()
$tam = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Cikti)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($tam)) | Out-Null
$sonuc.Save($tam, [System.Drawing.Imaging.ImageFormat]::Png)
"Kapak cizimi: $Cikti ($($sonuc.Width) x $($sonuc.Height) px)"
$sonuc.Dispose()
