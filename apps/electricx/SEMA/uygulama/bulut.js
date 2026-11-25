// Yetenekler: veritabanı (kütüphane, ayarlar, arşiv kaydı), dosya deposu (arşiv) ve kullanıcı kimliği.
// ELECTRICX içinde yerel-yetenek.js sağlar; claude.ai'de açılırsa oranın kendi yetenekleri kullanılır.
(function () {
  "use strict";
  const yetenek = (ad) => {
    try {
      return window.claude && typeof window.claude.use === "function" ? window.claude.use(ad).catch(() => null) : Promise.resolve(null);
    } catch (e) { return Promise.resolve(null); }
  };
  const hazir = Promise.all(["db", "downloads", "assets", "user"].map(yetenek))
    .then(([db, downloads, assets, user]) => ({ db, downloads, assets, user }));

  const kullanici = hazir.then(async ({ user }) => {
    if (!user) return { id: null, sahip: false, duzenleyebilir: false };
    const me = await user.me();
    return { id: me.id, sahip: me.isOwner, duzenleyebilir: me.canEdit };
  });

  /** Kişi adları (geçmişte kimin değiştirdiği). Ad saklanmaz, her gösterimde yeniden çözülür. */
  async function adlar(idler) {
    const { user } = await hazir;
    if (!user || !idler.length) return {};
    try {
      const p = await user.profiles(idler);
      const o = {};
      for (const id of idler) o[id] = (p[id] && p[id].name) || "";
      return o;
    } catch (e) { return {}; }
  }

  const TUR = { pdf: "application/pdf", zip: "application/zip", json: "application/json", csv: "text/csv", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };

  /** Dosyayı kaydettirir: claude.ai'de indirme onayı, yerelde tarayıcı indirmesi. data: Uint8Array | Blob | string */
  async function kaydet(dosya, data) {
    const uzanti = (dosya.match(/\.([a-z0-9]+)$/i) || [])[1] || "";
    const blob = data instanceof Blob ? data : new Blob([data], { type: TUR[uzanti.toLowerCase()] || "application/octet-stream" });
    const { downloads } = await hazir;
    if (downloads) {
      await downloads.save({ filename: dosya, data: blob });
      return "claude";
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = dosya; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return "tarayici";
  }

  /** Arşivdeki dosyanın baytları. */
  async function dosyaAl(id) {
    const { assets } = await hazir;
    if (assets && assets.oku) return assets.oku(id);
    const r = await fetch("/_blob/" + id);
    if (!r.ok) throw new Error("dosya arşivde bulunamadı");
    return new Uint8Array(await r.arrayBuffer());
  }

  window.Bulut = { hazir, kullanici, adlar, kaydet, dosyaAl };
})();
