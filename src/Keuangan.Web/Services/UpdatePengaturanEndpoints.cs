using Keuangan.Data;
using Keuangan.Data.Entities;

namespace Keuangan.Web.Services;

// Pengaturan pembaruan di sisi SERVER (2026-11-27): "boleh restart layanan kapan saja". Bawaan MATI = layanan baru dipasang di jendela malam (22:00-05:00,
// lihat ServiceAutoUpdateHostedService/AutoUpdatePolicy) supaya klien tidak terputus di jam kerja; dinyalakan = layanan dipasang begitu unduhan selesai
// (klien paling tersendat beberapa detik). Disimpan di SystemSettings supaya bisa diubah dari halaman Pengaturan tanpa menyentuh berkas konfigurasi.
// Pengaturan restart di PC klien/Launcher TERPISAH (per PC, di sisi Launcher: update_pengaturan.json).
public static class UpdatePengaturanEndpoints
{
    public const string KunciKapanSaja = "update_restart_kapan_saja";

    public static void MapUpdatePengaturanEndpoints(this WebApplication app)
    {
        app.MapGet("/api/pengaturan/update", async (KeuanganDbContext db) =>
        {
            var s = await db.SystemSettings.FindAsync(KunciKapanSaja);
            return Results.Ok(new { success = true, data = new { restartKapanSaja = s?.SettingValue == "1" } });
        }).RequireAuthorization();

        app.MapPut("/api/pengaturan/update", async (SimpanRequest req, KeuanganDbContext db) =>
        {
            var nilai = req.RestartKapanSaja ? "1" : "0";
            var s = await db.SystemSettings.FindAsync(KunciKapanSaja);
            if (s is null) db.SystemSettings.Add(new SystemSetting { SettingKey = KunciKapanSaja, SettingValue = nilai, UpdatedAt = DateTime.UtcNow });
            else { s.SettingValue = nilai; s.UpdatedAt = DateTime.UtcNow; }
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { restartKapanSaja = req.RestartKapanSaja } });
        }).RequireAuthorization(p => p.RequireRole(UserRole.AdminManager.ToString()));
    }

    public sealed record SimpanRequest(bool RestartKapanSaja);
}
