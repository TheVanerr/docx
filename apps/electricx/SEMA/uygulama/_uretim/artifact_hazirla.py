# -*- coding: utf-8 -*-
"""claude.ai'de yayınlanacak sayfayı hazırlar.

    python uygulama/_uretim/artifact_hazirla.py <çıkış klasörü>

Artifact yayını sayfayı kendi <!doctype>/<head>/<body> iskeletiyle sarar; bu yüzden `index.html`
içindeki iskelet etiketleri çıkarılır, geri kalan (title, style, gövde, scriptler) aynen kalır.
ELECTRICX ortak katmanı ve yerel yetenekler claude.ai'de gerekmez, sayfadan çıkarılır.
Çıkış klasörüne ayrıca yayın sürümünü taşıyan surum.js yazılır (git commit ve tarih).
Standart çıktıya Artifact yayınındaki `files` eşlemesi (JSON) yazdırılır.
"""
import datetime
import json
import re
import subprocess
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent.parent
# Sayfada <script> ile yüklenmeyip çalışırken istenen dosyalar
EK_DOSYALAR = ["uygulama/pdf.worker.min.js", "uygulama/xlsx.core.min.js"]


def git(*arg):
    try:
        return subprocess.check_output(["git", *arg], cwd=KOK, text=True).strip()
    except Exception:
        return ""


def main():
    cikis = Path(sys.argv[1]).resolve()
    cikis.mkdir(parents=True, exist_ok=True)
    s = (KOK / "index.html").read_text(encoding="utf-8")
    s = re.sub(r'<script src="\.\./ortak/[^"]+"></script>\s*', "", s)
    s = re.sub(r'<script src="uygulama/yerel-yetenek\.js"></script>\s*', "", s)
    s = re.sub(r"(?is)^\s*<!doctype html>\s*<html[^>]*>\s*<head>\s*", "", s)
    s = re.sub(r'(?i)<meta charset="utf-8">\s*', "", s, count=1)
    s = re.sub(r'(?i)<meta name="viewport"[^>]*>\s*', "", s, count=1)
    s = re.sub(r"(?is)</head>\s*<body>\s*", "", s, count=1)
    s = re.sub(r"(?is)\s*</body>\s*</html>\s*$", "\n", s)
    (cikis / "index.html").write_text(s, encoding="utf-8")

    commit = git("rev-parse", "HEAD") or "bilinmiyor"
    if git("status", "--porcelain", "--", "index.html", "uygulama"):
        commit += "+yerel-degisiklik"
    surum = cikis / "surum.js"
    surum.write_text(
        "// Yayın sürümü (artifact_hazirla.py yazdı).\n"
        f"window.SURUM = {json.dumps({'commit': commit, 'tarih': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')})};\n",
        encoding="utf-8")

    dosyalar = {}
    for yol in re.findall(r'<script src="(uygulama/[^"]+)"', s) + EK_DOSYALAR:
        dosyalar[yol] = str(surum if yol == "uygulama/surum.js" else KOK / yol)
    eksik = [y for y, k in dosyalar.items() if not Path(k).exists()]
    if eksik:
        sys.exit("Eksik dosya: " + ", ".join(eksik))
    print(json.dumps(dosyalar, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
