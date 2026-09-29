using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using Keuangan.Data;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

// Info versi utk halaman Pengaturan - supaya admin bisa memastikan sendiri apakah
// update BENAR2 sudah terpasang (bukan cuma percaya "sudah update"): versi server yang
// sedang berjalan + kapan server dinyalakan (bukti service sudah restart setelah update)
// + versi database + rilis terbaru di GitHub (dicek dari server, di-cache 10 menit).
public static class VersionEndpoints
{
    private const string LatestReleaseUrl = "https://api.github.com/repos/al-ikhlas86/keuangan/releases/latest";
    private static readonly HttpClient Http = CreateHttp();
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static (DateTime At, object Result)? _cache;

    // Versi assembly server ini (CI menyuntik -p:Version=<tag> ke Launcher DAN Web, jadi sama).
    public static string ServerVersion { get; } = FormatVersion(Assembly.GetEntryAssembly()?.GetName().Version);

    private static readonly DateTime StartedUtc = Process.GetCurrentProcess().StartTime.ToUniversalTime();

    public static void MapVersionEndpoints(this WebApplication app)
    {
        app.MapGet("/api/version", async (bool? force, KeuanganDbContext db, CancellationToken ct) =>
        {
            var migrations = (await db.Database.GetAppliedMigrationsAsync(ct)).ToList();
            var migrasiTerakhir = migrations.LastOrDefault();
            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    Version = ServerVersion,
                    StartedAt = StartedUtc.ToString("O"),
                    DatabaseMigration = migrasiTerakhir is null ? null : migrasiTerakhir[(migrasiTerakhir.IndexOf('_') + 1)..],
                    MigrationCount = migrations.Count,
                    Latest = await CekRilisTerbaruAsync(force == true, ct),
                },
            });
        }).RequireAuthorization();
    }

    private static HttpClient CreateHttp()
    {
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(6) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd("Keuangan-AlIkhlas86-VersionCheck");
        http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        return http;
    }

    private static string FormatVersion(Version? v) => v is null ? "?" : $"{v.Major}.{v.Minor}.{Math.Max(v.Build, 0)}";

    // status: terbaru | ada_update | tidak_bisa_dicek (offline/GitHub tidak terjangkau).
    private static async Task<object> CekRilisTerbaruAsync(bool paksa, CancellationToken ct)
    {
        await Gate.WaitAsync(ct);
        try
        {
            if (!paksa && _cache is { } c && DateTime.UtcNow - c.At < TimeSpan.FromMinutes(10)) return c.Result;

            object hasil;
            var berhasil = false;
            try
            {
                using var doc = JsonDocument.Parse(await Http.GetStringAsync(LatestReleaseUrl, ct));
                var tag = doc.RootElement.GetProperty("tag_name").GetString() ?? "";
                var remote = Version.TryParse(tag.TrimStart('v', 'V'), out var rv) ? rv : null;
                var lokal = Version.TryParse(ServerVersion, out var lv) ? lv : null;
                var status = remote is null || lokal is null ? "tidak_bisa_dicek" : remote > lokal ? "ada_update" : "terbaru";
                hasil = new { Status = status, Tag = tag, CheckedAt = DateTime.UtcNow.ToString("O") };
                berhasil = status != "tidak_bisa_dicek";
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
            {
                // Offline itu wajar (Keuangan harus tetap bisa dipakai tanpa internet) - bukan error.
                hasil = new { Status = "tidak_bisa_dicek", Tag = (string?)null, CheckedAt = DateTime.UtcNow.ToString("O") };
            }
            // Hasil gagal jangan di-cache lama - coba lagi lebih cepat begitu internet kembali.
            if (berhasil) _cache = (DateTime.UtcNow, hasil);
            return hasil;
        }
        finally { Gate.Release(); }
    }
}
