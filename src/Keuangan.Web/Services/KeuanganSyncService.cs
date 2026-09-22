using System.Text.Json;
using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Keuangan.Web.Services;

// Sinkron identitas siswa dari Webview-App backend - ARAH PULL (KEBALIKAN
// dari pola HubApiSyncService.cs milik DataMaster.exe yang PUSH). Alasan
// (arahan user, 2026-09-22): "data di keuangan sama persis dengan data
// master, baru deh keuangan tinggal tambahin rincian2 biaya" - Keuangan
// konsumen identitas, bukan sumbernya. Lihat D:\Webview-App\backend\src\routes\keuanganSync.js
// utk sisi server-nya.
//
// Alur tiap siklus (RunAsync, dipanggil KeuanganSyncHostedService tiap 1
// menit, port interval sama persis DataMaster):
//   1. Belum py token (SystemSetting "keuangan_sync_token" kosong)? ->
//      POST /api/keuangan/register, simpan token yg dibalas (BELUM AKTIF
//      sampai Admin IT approve - lihat langkah 2).
//   2. Py token? -> GET /api/keuangan/students pakai token itu. Kalau 401
//      (belum di-approve/token salah) -> catat status, JANGAN retry
//      register lagi (token yg sudah ada tetap dipertahankan, nunggu
//      approve, bukan minta token baru berulang2 - itu bikin Admin IT
//      lihat banyak baris duplikat di panel approve).
//   3. Sukses -> upsert ke tabel Students LOKAL berdasar HubId (kunci
//      pencocokan), SyncedAt diisi waktu sekarang. Siswa yg TIDAK ADA lagi
//      di hasil pull (mis. sudah pindah unit) SENGAJA TIDAK dihapus
//      otomatis - siswa itu mungkin masih py riwayat Tagihan/Payment lokal
//      yg harus tetap ada, cukup jadi "tidak ke-refresh lagi", Admin
//      Keuangan yang putuskan manual kalau perlu diarsipkan.
public class KeuanganSyncService(KeuanganDbContext db, HttpClient http, IOptions<AppOptions> options, ILogger<KeuanganSyncService> logger)
{
    // SnakeCaseLower (BUKAN PropertyNameCaseInsensitive) - respons GET
    // /api/keuangan/students balikin key snake_case (hub_id, dst, lihat
    // routes/keuanganSync.js) - case-insensitive SAJA tidak cukup krn beda
    // KARAKTER (underscore), bukan cuma beda huruf besar/kecil. Port pola
    // sama persis HubApiSyncService.cs milik DataMaster.exe.
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    public async Task RunAsync(CancellationToken ct = default)
    {
        var baseUrl = (options.Value.WebviewApiUrl ?? "").Trim().TrimEnd('/');
        if (baseUrl == "")
        {
            logger.LogInformation("Sync Webview-App dilewati: AppSettings:WebviewApiUrl belum diisi.");
            return;
        }

        var token = await BacaSettingAsync("keuangan_sync_token", ct);
        if (string.IsNullOrEmpty(token))
        {
            token = await DaftarInstalasiAsync(baseUrl, ct);
            if (token is null) return; // gagal daftar - coba lagi siklus berikutnya
        }

        await TarikSiswaAsync(baseUrl, token, ct);
    }

    // Langkah 1 - "sinyal" daftar instalasi baru, HANYA dipanggil kalau
    // belum pernah py token sama sekali (token yg SUDAH ada, walau masih
    // menunggu approve, tidak pernah diganti/didaftar ulang otomatis).
    private async Task<string?> DaftarInstalasiAsync(string baseUrl, CancellationToken ct)
    {
        try
        {
            var label = Environment.MachineName;
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/api/keuangan/register")
            {
                Content = JsonContent.Create(new { label }),
            };
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(15));
            using var resp = await http.SendAsync(req, cts.Token);
            if (!resp.IsSuccessStatusCode)
            {
                logger.LogWarning("Daftar instalasi Keuangan: GAGAL HTTP {Status}", (int)resp.StatusCode);
                return null;
            }
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            var token = doc.RootElement.GetProperty("data").GetProperty("token").GetString();
            if (string.IsNullOrEmpty(token)) return null;

            await SimpanSettingAsync("keuangan_sync_token", token, ct);
            logger.LogInformation("Instalasi Keuangan terdaftar - menunggu persetujuan Admin IT.");
            return token;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Daftar instalasi Keuangan: GAGAL koneksi - {Message}", ex.Message);
            return null;
        }
    }

    // Langkah 2 - tarik identitas siswa, upsert berdasar HubId.
    private async Task TarikSiswaAsync(string baseUrl, string token, CancellationToken ct)
    {
        List<SiswaRemote> items;
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/api/keuangan/students");
            req.Headers.Add("X-Keuangan-Token", token);
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(30));
            using var resp = await http.SendAsync(req, cts.Token);

            if (resp.StatusCode == System.Net.HttpStatusCode.Unauthorized)
            {
                await SimpanSettingAsync("keuangan_sync_unauthorized_at", DateTime.UtcNow.ToString("O"), ct);
                logger.LogInformation("Sync Webview-App: instalasi belum/tidak disetujui Admin IT.");
                return;
            }
            if (!resp.IsSuccessStatusCode)
            {
                logger.LogWarning("Tarik siswa: GAGAL HTTP {Status}", (int)resp.StatusCode);
                return;
            }

            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            items = doc.RootElement.GetProperty("data").Deserialize<List<SiswaRemote>>(JsonOpts) ?? [];
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Tarik siswa: GAGAL koneksi - {Message}", ex.Message);
            return;
        }

        var now = DateTime.UtcNow;
        foreach (var item in items)
        {
            var existing = await db.Students.FirstOrDefaultAsync(s => s.HubId == item.HubId, ct);
            var status = string.Equals(item.Status, "lulus", StringComparison.OrdinalIgnoreCase) ? StudentStatus.Lulus : StudentStatus.Aktif;

            if (existing is null)
            {
                db.Students.Add(new Student
                {
                    // StudentCode nomor internal Keuangan sendiri - "STD-" + HubId
                    // supaya deterministik & tidak pernah tabrakan (bukan random).
                    StudentCode = $"STD-{item.HubId}",
                    HubId = item.HubId,
                    Nis = item.Nis,
                    Name = item.Nama,
                    ClassName = item.Kelas,
                    Tingkat = item.Tingkat,
                    Status = status,
                    SyncedAt = now,
                });
            }
            else
            {
                // Identitas TIMPA dari sumber (Nis/Name/Kelas/Tingkat/Status) -
                // field khusus Keuangan (BankAccountNo, tarif, VA, dll) TIDAK
                // PERNAH disentuh di sini, aman dari kehilangan data lokal.
                existing.Nis = item.Nis;
                existing.Name = item.Nama;
                existing.ClassName = item.Kelas;
                existing.Tingkat = item.Tingkat;
                existing.Status = status;
                existing.SyncedAt = now;
            }
        }

        await db.SaveChangesAsync(ct);
        await SimpanSettingAsync("keuangan_sync_ok_at", now.ToString("O"), ct);
        logger.LogInformation("Sync Webview-App selesai - {Count} siswa diperbarui.", items.Count);
    }

    private async Task<string?> BacaSettingAsync(string key, CancellationToken ct)
        => (await db.SystemSettings.FindAsync([key], ct))?.SettingValue;

    private async Task SimpanSettingAsync(string key, string value, CancellationToken ct)
    {
        var existing = await db.SystemSettings.FindAsync([key], ct);
        if (existing is null) db.SystemSettings.Add(new SystemSetting { SettingKey = key, SettingValue = value, UpdatedAt = DateTime.UtcNow });
        else { existing.SettingValue = value; existing.UpdatedAt = DateTime.UtcNow; }
        await db.SaveChangesAsync(ct);
    }

    private record SiswaRemote(int HubId, string Nama, string Nis, string? Kelas, string? Tingkat, string? Status);
}
