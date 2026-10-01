using System.Text.Json;
using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Keuangan.Web.Services;

// Sinkron identitas SISWA dan PEGAWAI dari Webview-App backend - ARAH PULL
// (KEBALIKAN dari pola HubApiSyncService.cs milik DataMaster.exe yang PUSH).
// Alasan (arahan user, 2026-09-22): "data di keuangan sama persis dengan data
// master, baru deh keuangan tinggal tambahin rincian2 biaya" - Keuangan
// konsumen identitas, bukan sumbernya. Sisi server: D:\Webview-App\backend\src\routes\keuanganSync.js
//
// Alur tiap siklus (RunAsync, dipanggil KeuanganSyncHostedService tiap 1 menit):
//   1. Belum py token (SystemSetting "keuangan_sync_token" kosong)? ->
//      POST /api/keuangan/register (label = "Nama instalasi" dari wizard, atau
//      nama PC), simpan token (BELUM AKTIF sampai Admin IT approve di menu
//      Status Sinkronisasi > tab Keuangan, sekaligus memilih katalog SD/TK).
//   2. GET /students lalu GET /employees dengan token itu. 401 = belum/tidak
//      disetujui -> catat status, JANGAN daftar ulang (token lama dipertahankan,
//      supaya Admin IT tidak melihat baris duplikat).
//   3. Versi data (v0.2.0): server membalas ETag = hash isi data; siklus berikut
//      dikirim If-None-Match, 304 = tidak ada perubahan -> lewati. Begitu Data
//      Master berubah, ETag berubah dan Keuangan ikut memperbarui.
//   4. Upsert berdasar HubId. Yang HILANG dari snapshot TIDAK dihapus - siswa
//      ditandai Keluar, pegawai Nonaktif (riwayat tagihan/slip gaji harus
//      tetap ada). Kalau snapshot kosong sama sekali, rekonsiliasi dilewati
//      (kemungkinan gangguan sumber, bukan semua orang keluar sekaligus).
public class KeuanganSyncService(KeuanganDbContext db, HttpClient http, IOptions<AppOptions> options, ILogger<KeuanganSyncService> logger)
{
    // SnakeCaseLower (BUKAN PropertyNameCaseInsensitive) - respons server key
    // snake_case (hub_id, status_keluar, dst) - beda KARAKTER (underscore), bukan
    // cuma huruf besar/kecil. Port pola sama persis HubApiSyncService.cs.
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    // Kunci SystemSetting status sinkron (dibaca SyncEndpoints -> banner UI).
    public const string KeyToken = "keuangan_sync_token";
    public const string KeyState = "keuangan_sync_state";           // menunggu_persetujuan | tersambung | error
    public const string KeyStateAt = "keuangan_sync_state_at";
    public const string KeyOkAt = "keuangan_sync_ok_at";
    public const string KeyUnauthorizedAt = "keuangan_sync_unauthorized_at";
    public const string KeyError = "keuangan_sync_error";
    private const string KeyEtagStudents = "keuangan_sync_etag_students";
    private const string KeyEtagEmployees = "keuangan_sync_etag_employees";

    private enum Hasil { Ok, TidakBerubah, BelumDisetujui, Gagal }

    public async Task RunAsync(CancellationToken ct = default)
    {
        // Mode developer = sandbox terputus total dari VPS (tidak daftar, tidak menarik).
        if (!options.Value.EffectiveSyncEnabled)
        {
            await CatatKeadaanAsync("dinonaktifkan", null, ct);
            return;
        }

        var baseUrl = options.Value.EffectiveWebviewApiUrl;

        var token = await BacaSettingAsync(KeyToken, ct);
        if (string.IsNullOrEmpty(token))
        {
            token = await DaftarInstalasiAsync(baseUrl, ct);
            if (token is null) return; // gagal daftar - coba lagi siklus berikutnya
        }

        var siswa = await TarikSiswaAsync(baseUrl, token, ct);
        if (siswa == Hasil.BelumDisetujui || siswa == Hasil.Gagal) return;

        var pegawai = await TarikPegawaiAsync(baseUrl, token, ct);
        if (pegawai == Hasil.BelumDisetujui || pegawai == Hasil.Gagal) return;

        await CatatKeadaanAsync("tersambung", null, ct);
        await SimpanSettingAsync(KeyOkAt, DateTime.UtcNow.ToString("O"), ct);
    }

    // Langkah 1 - "sinyal" daftar instalasi baru, HANYA kalau belum pernah py
    // token sama sekali (token yg SUDAH ada, walau masih menunggu approve,
    // tidak pernah diganti/didaftar ulang otomatis).
    private async Task<string?> DaftarInstalasiAsync(string baseUrl, CancellationToken ct)
    {
        try
        {
            var label = options.Value.EffectiveInstallationLabel;
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
                await CatatKeadaanAsync("error", $"Gagal mendaftar ke server (HTTP {(int)resp.StatusCode}).", ct);
                return null;
            }
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            var token = doc.RootElement.GetProperty("data").GetProperty("token").GetString();
            if (string.IsNullOrEmpty(token)) return null;

            await SimpanSettingAsync(KeyToken, token, ct);
            await CatatKeadaanAsync("menunggu_persetujuan", null, ct);
            logger.LogInformation("Instalasi Keuangan terdaftar sbg \"{Label}\" - menunggu persetujuan Admin IT.", label);
            return token;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Daftar instalasi Keuangan: GAGAL koneksi - {Message}", ex.Message);
            await CatatKeadaanAsync("error", "Tidak bisa menghubungi server (cek koneksi internet).", ct);
            return null;
        }
    }

    // GET satu endpoint sinkron + If-None-Match. Balik (hasil, data, etagBaru).
    private async Task<(Hasil, List<T>, string?)> AmbilAsync<T>(string baseUrl, string path, string token, string etagKey, CancellationToken ct)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/api/keuangan/{path}");
            req.Headers.Add("X-Keuangan-Token", token);
            var etagLama = await BacaSettingAsync(etagKey, ct);
            if (!string.IsNullOrEmpty(etagLama)) req.Headers.TryAddWithoutValidation("If-None-Match", etagLama);
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(30));
            using var resp = await http.SendAsync(req, cts.Token);

            if (resp.StatusCode == System.Net.HttpStatusCode.NotModified) return (Hasil.TidakBerubah, [], null);
            if (resp.StatusCode == System.Net.HttpStatusCode.Unauthorized)
            {
                await SimpanSettingAsync(KeyUnauthorizedAt, DateTime.UtcNow.ToString("O"), ct);
                await CatatKeadaanAsync("menunggu_persetujuan", null, ct);
                logger.LogInformation("Sync Webview-App: instalasi belum/tidak disetujui Admin IT.");
                return (Hasil.BelumDisetujui, [], null);
            }
            if (!resp.IsSuccessStatusCode)
            {
                var pesan = await PesanServerAsync(resp, ct);
                logger.LogWarning("Tarik {Path}: GAGAL HTTP {Status} {Pesan}", path, (int)resp.StatusCode, pesan);
                await CatatKeadaanAsync("error", pesan ?? $"Server membalas HTTP {(int)resp.StatusCode}.", ct);
                return (Hasil.Gagal, [], null);
            }

            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            var items = doc.RootElement.GetProperty("data").Deserialize<List<T>>(JsonOpts) ?? [];
            return (Hasil.Ok, items, resp.Headers.ETag?.ToString());
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Tarik {Path}: GAGAL koneksi - {Message}", path, ex.Message);
            await CatatKeadaanAsync("error", "Tidak bisa menghubungi server (cek koneksi internet).", ct);
            return (Hasil.Gagal, [], null);
        }
    }

    private static async Task<string?> PesanServerAsync(HttpResponseMessage resp, CancellationToken ct)
    {
        try
        {
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            return doc.RootElement.TryGetProperty("message", out var m) ? m.GetString() : null;
        }
        catch { return null; }
    }

    // Langkah 2 - siswa: upsert berdasar HubId, yang hilang -> Keluar.
    private async Task<Hasil> TarikSiswaAsync(string baseUrl, string token, CancellationToken ct)
    {
        var (hasil, items, etag) = await AmbilAsync<SiswaRemote>(baseUrl, "students", token, KeyEtagStudents, ct);
        if (hasil != Hasil.Ok) return hasil;

        var now = DateTime.UtcNow;
        var existing = await db.Students.ToDictionaryAsync(s => s.HubId, ct);
        var hubIdSumber = new HashSet<int>();

        foreach (var item in items)
        {
            hubIdSumber.Add(item.HubId);
            var status = PetaStatusSiswa(item.Status);

            if (!existing.TryGetValue(item.HubId, out var s))
            {
                s = new Student
                {
                    // StudentCode nomor internal Keuangan sendiri - "STD-" + HubId
                    // (HubId unik global di students_cache, jadi tidak bentrok antar katalog).
                    StudentCode = $"STD-{item.HubId}",
                    HubId = item.HubId,
                    Nis = item.Nis,
                    Name = item.Nama,
                };
                db.Students.Add(s);
                existing[item.HubId] = s;
            }
            // Identitas TIMPA dari sumber - field khusus Keuangan (BankAccountNo,
            // tarif, VA, dll) TIDAK PERNAH disentuh di sini.
            s.Nis = item.Nis;
            s.Name = item.Nama;
            s.ClassName = item.Kelas;
            s.Tingkat = item.Tingkat;
            s.Katalog = item.Katalog;
            s.Status = status;
            s.SyncedAt = now;
        }

        var keluar = 0;
        if (items.Count > 0)
        {
            foreach (var (hubId, s) in existing)
            {
                if (hubIdSumber.Contains(hubId) || s.Status == StudentStatus.Keluar) continue;
                s.Status = StudentStatus.Keluar;
                keluar++;
            }
        }
        else if (existing.Count > 0)
        {
            logger.LogWarning("Snapshot siswa kosong padahal {N} siswa lokal - rekonsiliasi dilewati.", existing.Count);
        }

        await db.SaveChangesAsync(ct);
        if (!string.IsNullOrEmpty(etag)) await SimpanSettingAsync(KeyEtagStudents, etag, ct);
        logger.LogInformation("Sync siswa selesai - {Count} siswa diperbarui, {Keluar} ditandai Keluar.", items.Count, keluar);
        return Hasil.Ok;
    }

    // Langkah 3 - pegawai: pola sama, yang hilang/nonaktif -> Nonaktif.
    private async Task<Hasil> TarikPegawaiAsync(string baseUrl, string token, CancellationToken ct)
    {
        var (hasil, items, etag) = await AmbilAsync<PegawaiRemote>(baseUrl, "employees", token, KeyEtagEmployees, ct);
        if (hasil != Hasil.Ok) return hasil;

        var now = DateTime.UtcNow;
        var existing = await db.Employees.ToDictionaryAsync(e => e.HubId, ct);
        var hubIdSumber = new HashSet<int>();

        foreach (var item in items)
        {
            hubIdSumber.Add(item.HubId);
            if (!existing.TryGetValue(item.HubId, out var e))
            {
                e = new Employee { HubId = item.HubId, Name = item.Nama };
                db.Employees.Add(e);
                existing[item.HubId] = e;
            }
            e.Name = item.Nama;
            e.Nip = item.Nip;
            e.Jabatan = item.Jabatan;
            e.IsKepalaSekolah = item.KepalaSekolah;
            e.Status = item.Aktif ? EmployeeStatus.Aktif : EmployeeStatus.Nonaktif;
            e.StatusKeluar = item.StatusKeluar;
            // Pendidikan (2026-10-01): jenjang baku dari gelar terakhir di Data Master (server sudah memetakan
            // ke SMA|D3|S1|S2|S3). HANYA ditimpa kalau sumber memberi nilai valid - kosong/tidak dikenal TIDAK
            // menghapus isian manual di halaman Pegawai (Data Master teks bebas, tidak selalu bisa dipetakan).
            if (item.Pendidikan is { } pend && PayrollValues.EducationLevels.Contains(pend)) e.Pendidikan = pend;
            e.Katalog = item.Katalog;
            e.SyncedAt = now;
        }

        var nonaktif = 0;
        if (items.Count > 0)
        {
            foreach (var (hubId, e) in existing)
            {
                if (hubIdSumber.Contains(hubId) || e.Status == EmployeeStatus.Nonaktif) continue;
                e.Status = EmployeeStatus.Nonaktif;
                nonaktif++;
            }
        }
        else if (existing.Count > 0)
        {
            logger.LogWarning("Snapshot pegawai kosong padahal {N} pegawai lokal - rekonsiliasi dilewati.", existing.Count);
        }

        await db.SaveChangesAsync(ct);
        if (!string.IsNullOrEmpty(etag)) await SimpanSettingAsync(KeyEtagEmployees, etag, ct);
        logger.LogInformation("Sync pegawai selesai - {Count} pegawai diperbarui, {Nonaktif} ditandai Nonaktif.", items.Count, nonaktif);
        return Hasil.Ok;
    }

    // Status siswa di sumber: "lulus" -> Lulus; "keluar"/"pindah" -> Keluar; sisanya Aktif.
    private static StudentStatus PetaStatusSiswa(string? status) => (status ?? "").Trim().ToLowerInvariant() switch
    {
        "lulus" => StudentStatus.Lulus,
        "keluar" or "pindah" => StudentStatus.Keluar,
        _ => StudentStatus.Aktif,
    };

    private async Task CatatKeadaanAsync(string state, string? error, CancellationToken ct)
    {
        await SimpanSettingAsync(KeyState, state, ct);
        await SimpanSettingAsync(KeyStateAt, DateTime.UtcNow.ToString("O"), ct);
        await SimpanSettingAsync(KeyError, error ?? "", ct);
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

    private record SiswaRemote(int HubId, string Nama, string Nis, string? Kelas, string? Tingkat, string? Status, string? Katalog);

    private record PegawaiRemote(int HubId, string Nama, string? Nip, string? Jabatan, bool KepalaSekolah, bool Aktif, string? StatusKeluar, string? Pendidikan, string? Katalog);
}
