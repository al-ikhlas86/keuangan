using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Keuangan.Web.Services;

// Status sinkron ke Webview-App utk banner di UI - dicatat KeuanganSyncService
// di SystemSettings (state/error/ok_at). Read-only.
public static class SyncEndpoints
{
    public static void MapSyncEndpoints(this WebApplication app)
    {
        app.MapGet("/api/sync/status", async (KeuanganDbContext db, IOptions<AppOptions> options) =>
        {
            var keys = new[]
            {
                KeuanganSyncService.KeyState, KeuanganSyncService.KeyStateAt, KeuanganSyncService.KeyOkAt,
                KeuanganSyncService.KeyError, KeuanganSyncService.KeyUnauthorizedAt,
            };
            var s = await db.SystemSettings.Where(x => keys.Contains(x.SettingKey))
                .ToDictionaryAsync(x => x.SettingKey, x => x.SettingValue);
            string? Get(string k) => s.TryGetValue(k, out var v) && !string.IsNullOrEmpty(v) ? v : null;

            var katalog = (await db.Students.Where(x => x.Katalog != null).Select(x => x.Katalog!).Distinct().ToListAsync())
                .Concat(await db.Employees.Where(x => x.Katalog != null).Select(x => x.Katalog!).Distinct().ToListAsync())
                .Distinct().OrderBy(x => x).ToList();

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    // belum_mulai = siklus pertama belum jalan; selain itu: menunggu_persetujuan | tersambung | error
                    State = Get(KeuanganSyncService.KeyState) ?? "belum_mulai",
                    StateAt = Get(KeuanganSyncService.KeyStateAt),
                    LastOkAt = Get(KeuanganSyncService.KeyOkAt),
                    Error = Get(KeuanganSyncService.KeyError),
                    Label = options.Value.EffectiveInstallationLabel,
                    Katalog = katalog,
                    Students = await db.Students.CountAsync(x => x.Status == StudentStatus.Aktif),
                    Employees = await db.Employees.CountAsync(x => x.Status == EmployeeStatus.Aktif),
                },
            });
        }).RequireAuthorization();
    }
}
