using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Keuangan.Web.Services;

// Kirim DATA KEUANGAN ke Webview-App backend supaya tampil di mobile-app &
// webview (tagihan, pembayaran, saldo, slip gaji) - ARAH PUSH, kebalikan dari
// KeuanganSyncService (pull identitas). Keputusan user (2026-10-01):
// Keuangan = SUMBER KEBENARAN data keuangan, VPS cuma salinan tampilan yang
// tidak pernah mengubah balik; kalau PC Keuangan offline, perubahan menunggu
// dan terkirim sendiri begitu internet tersambung. Sisi server:
// D:\Webview-App\backend\src\routes\keuanganPush.js.
//
// Cara kerja = sinkron BERBASIS KEADAAN (bukan antrean event yang harus
// di-hook di tiap endpoint): tiap siklus (dipanggil KeuanganSyncHostedService
// tepat setelah pull identitas), hitung snapshot "apa yang seharusnya tampil"
// dari database, bandingkan hash isinya dgn tabel PushStates (apa yang sudah
// terkirim), lalu kirim hanya selisihnya. Konsekuensinya:
//  - tidak ada data yang bisa terlewat / hilang walau PC mati di tengah jalan
//    atau internet putus berhari-hari (siklus berikutnya menyusul sendiri),
//  - aman dikirim ulang (server idempoten lewat `version` monoton),
//  - perubahan dari endpoint mana pun (termasuk yang ditambah kelak) ikut
//    terkirim tanpa perlu menyentuh kode ini.
// Baris yang menghilang dari snapshot (tagihan/pembayaran dihapus) dikirim
// sebagai tombstone (deleted:true). Slip gaji HANYA yang sudah dibayar
// (PayrollItem.TransactionId terisi) - draft tidak pernah keluar. Field
// khusus Supervisor (BiayaJabatan/PTKP/pajak) TIDAK PERNAH ikut dikirim.
public class KeuanganPushService(KeuanganDbContext db, HttpClient http, IOptions<AppOptions> options, ILogger<KeuanganPushService> logger)
{
    public const string KeyState = "keuangan_push_state";       // tersambung | offline | menunggu_persetujuan | belum_ada_katalog | error
    public const string KeyOkAt = "keuangan_push_ok_at";
    public const string KeyError = "keuangan_push_error";
    public const string KeyPending = "keuangan_push_pending";   // jumlah item yang belum terkirim

    private const int UkuranBatch = 100;
    private static readonly TimeSpan JedaUlangDitolak = TimeSpan.FromHours(1);

    private record Item(string Kind, string ExternalId, string OwnerType, int OwnerHubId, string? Period, object Data, string Hash);
    private record Kirim(string Kind, string ExternalId, string OwnerType, int OwnerHubId, string? Period, long Version, bool Deleted, object Data, string NewHash);
    public sealed class StateRow
    {
        public string Kind { get; set; } = "";
        public string ExternalId { get; set; } = "";
        public string OwnerType { get; set; } = "";
        public long OwnerHubId { get; set; }
        public string ContentHash { get; set; } = "";
        public long Version { get; set; }
        public long Deleted { get; set; }
        public long Synced { get; set; }
        public string? RetryAfter { get; set; }
    }

    public async Task RunAsync(CancellationToken ct = default)
    {
        var token = (await db.SystemSettings.FindAsync([KeuanganSyncService.KeyToken], ct))?.SettingValue;
        if (string.IsNullOrEmpty(token)) return; // belum terdaftar - urusan KeuanganSyncService

        var baseUrl = options.Value.EffectiveWebviewApiUrl;
        if (!await PingAsync(baseUrl, token, ct)) return;

        await PastikanTabelAsync(ct);
        var rencana = await HitungRencanaKirimAsync(ct);
        await SimpanSettingAsync(KeyPending, rencana.Count.ToString(), ct);
        if (rencana.Count == 0)
        {
            await CatatAsync("tersambung", null, ct);
            return;
        }

        var terkirim = 0;
        foreach (var batch in rencana.Chunk(UkuranBatch))
        {
            var ok = await KirimBatchAsync(baseUrl, token, batch, ct);
            if (!ok) break; // gagal di tengah (offline/error) - sisanya menyusul siklus berikutnya
            terkirim += batch.Length;
            await SimpanSettingAsync(KeyPending, (rencana.Count - terkirim).ToString(), ct);
        }
        if (terkirim == rencana.Count)
        {
            await CatatAsync("tersambung", null, ct);
            await SimpanSettingAsync(KeyOkAt, DateTime.UtcNow.ToString("O"), ct);
            logger.LogInformation("Push keuangan ke Webview-App selesai - {N} item terkirim.", terkirim);
        }
    }

    // Cek token + koneksi + enkripsi server SEBELUM repot menghitung snapshot.
    // Offline itu keadaan NORMAL (bukan error) - cukup dicatat, tanpa log berisik.
    private async Task<bool> PingAsync(string baseUrl, string token, CancellationToken ct)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/api/keuangan/push/ping");
            req.Headers.Add("X-Keuangan-Token", token);
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(15));
            using var resp = await http.SendAsync(req, cts.Token);
            switch ((int)resp.StatusCode)
            {
                case 200: return true;
                case 401: await CatatAsync("menunggu_persetujuan", null, ct); return false;
                case 409: await CatatAsync("belum_ada_katalog", "Admin IT belum memilihkan katalog untuk instalasi ini.", ct); return false;
                default:
                    await CatatAsync("error", $"Server membalas HTTP {(int)resp.StatusCode}.", ct);
                    return false;
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or OperationCanceledException && !ct.IsCancellationRequested)
        {
            await CatatAsync("offline", null, ct);
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Snapshot & diff
    // ------------------------------------------------------------------
    private async Task<List<Kirim>> HitungRencanaKirimAsync(CancellationToken ct)
    {
        var snapshot = await BangunSnapshotAsync(ct);
        var states = (await db.Database.SqlQueryRaw<StateRow>(
            "SELECT Kind, ExternalId, OwnerType, OwnerHubId, ContentHash, Version, Deleted, Synced, RetryAfter FROM PushStates").ToListAsync(ct))
            .ToDictionary(s => (s.Kind, s.ExternalId));

        var sekarang = DateTime.UtcNow;
        var nowMs = new DateTimeOffset(sekarang).ToUnixTimeMilliseconds();
        long VersiBaru(StateRow? s) => Math.Max((s?.Version ?? 0) + 1, nowMs);

        var rencana = new List<Kirim>();
        var ada = new HashSet<(string, string)>();
        foreach (var it in snapshot)
        {
            var key = (it.Kind, it.ExternalId);
            ada.Add(key);
            states.TryGetValue(key, out var st);
            if (st is null || st.Deleted == 1 || st.ContentHash != it.Hash)
            {
                rencana.Add(new Kirim(it.Kind, it.ExternalId, it.OwnerType, it.OwnerHubId, it.Period, VersiBaru(st), false, it.Data, it.Hash));
            }
            else if (st.Synced == 0 && (st.RetryAfter is null || DateTime.Parse(st.RetryAfter, null, System.Globalization.DateTimeStyles.RoundtripKind) <= sekarang))
            {
                // Pernah ditolak/gagal, hash sama - coba lagi (mis. Admin IT baru menambah katalog).
                rencana.Add(new Kirim(it.Kind, it.ExternalId, it.OwnerType, it.OwnerHubId, it.Period, st.Version, false, it.Data, it.Hash));
            }
        }

        // Tombstone: pernah terkirim, sekarang tidak ada lagi di database.
        foreach (var (key, st) in states)
        {
            if (ada.Contains(key) || st.Deleted == 1) continue;
            rencana.Add(new Kirim(st.Kind, st.ExternalId, st.OwnerType, (int)st.OwnerHubId, null, VersiBaru(st), true, new { }, ""));
        }
        return rencana;
    }

    private async Task<List<Item>> BangunSnapshotAsync(CancellationToken ct)
    {
        var hasil = new List<Item>();

        // --- Tagihan (pemilik: siswa) ---
        var tagihan = await db.TagihanList.AsNoTracking()
            .Select(t => new { t.TagihanCode, Jenis = t.FeeType.Name, t.PeriodLabel, t.Amount, t.PaidAmount, t.DueDate, t.Status, t.CicilanKe, t.CicilanDari, HubId = t.Student.HubId })
            .ToListAsync(ct);
        foreach (var t in tagihan)
        {
            hasil.Add(Buat("tagihan", t.TagihanCode, "siswa", t.HubId, t.PeriodLabel, new
            {
                kode = t.TagihanCode, jenis = t.Jenis, periode = t.PeriodLabel,
                jumlah = t.Amount, terbayar = t.PaidAmount, sisa = Math.Max(0m, t.Amount - t.PaidAmount),
                jatuh_tempo = t.DueDate?.ToString("yyyy-MM-dd"), status = t.Status.ToString(),
                cicilan_ke = t.CicilanKe, cicilan_dari = t.CicilanDari,
            }));
        }

        // --- Pembayaran (pemilik: siswa) ---
        var bayar = await db.Payments.AsNoTracking()
            .Select(p => new
            {
                p.PaymentCode, Jenis = p.FeeType.Name, p.PeriodLabel, p.PaymentDate, p.Method, p.Amount, p.Description,
                TagihanKode = p.Tagihan != null ? p.Tagihan.TagihanCode : null, HubId = p.Student.HubId,
            })
            .ToListAsync(ct);
        foreach (var p in bayar)
        {
            hasil.Add(Buat("pembayaran", p.PaymentCode, "siswa", p.HubId, p.PeriodLabel, new
            {
                kode = p.PaymentCode, jenis = p.Jenis, periode = p.PeriodLabel,
                tanggal = p.PaymentDate.ToString("yyyy-MM-dd"), metode = p.Method.ToString(), jumlah = p.Amount,
                tagihan_kode = p.TagihanKode, keterangan = p.Description,
            }));
        }

        // --- Saldo (pemilik: siswa) - rumus SAMA dgn ValidationEndpoints.SaldoAsync
        // (setoran masuk atas nama siswa dikurangi pembayaran selain Keringanan),
        // dihitung massal di memori (hindari 2 query per siswa tiap menit).
        var siswaHub = await db.Students.AsNoTracking().Select(s => new { s.Id, s.HubId }).ToDictionaryAsync(s => s.Id, s => s.HubId, ct);
        var masuk = (await db.FinancialTransactions.AsNoTracking()
                .Where(t => t.StudentId != null && t.TxType == TxType.Masuk).Select(t => new { Id = t.StudentId!.Value, t.Amount }).ToListAsync(ct))
            .GroupBy(x => x.Id).ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));
        var alokasi = (await db.Payments.AsNoTracking()
                .Where(p => p.Method != PaymentReceiveMethod.Keringanan).Select(p => new { Id = p.StudentId, p.Amount }).ToListAsync(ct))
            .GroupBy(x => x.Id).ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));
        foreach (var studentId in masuk.Keys.Union(alokasi.Keys))
        {
            if (!siswaHub.TryGetValue(studentId, out var hubId)) continue;
            var saldo = masuk.GetValueOrDefault(studentId) - alokasi.GetValueOrDefault(studentId);
            hasil.Add(Buat("saldo", $"SALDO-{hubId}", "siswa", hubId, null, new { saldo }));
        }

        // --- Slip gaji (pemilik: pegawai) - HANYA yang sudah dibayar ---
        var slips = await db.PayrollItems.AsNoTracking()
            .Where(i => i.TransactionId != null)
            .Include(i => i.PayrollPeriod).Include(i => i.Employee).Include(i => i.Slip).Include(i => i.Transaction)
            .Include(i => i.Lines).ThenInclude(l => l.ComponentType)
            .ToListAsync(ct);
        foreach (var i in slips)
        {
            var baris = i.Lines.Where(l => l.Amount != 0).OrderBy(l => l.ComponentType.Urutan).ThenBy(l => l.ComponentType.Id).ToList();
            object Proyeksi(IEnumerable<PayrollItemLine> ls) => ls.Select(l => new { nama = l.ComponentType.Name, bagian = l.ComponentType.SlipSection, jumlah = l.Amount, qty = l.Quantity }).ToList();
            var pendapatan = baris.Where(l => l.ComponentType.Category == "EARNING").ToList();
            var potongan = baris.Where(l => l.ComponentType.Category == "DEDUCTION").ToList();
            var totalP = pendapatan.Sum(l => l.Amount);
            var totalD = potongan.Sum(l => l.Amount);
            hasil.Add(Buat("slip_gaji", $"ITEM-{i.Id}", "pegawai", i.Employee.HubId, i.PayrollPeriod.PeriodKey, new
            {
                periode = i.PayrollPeriod.PeriodKey, nomor_slip = i.Slip?.SlipNo, hari_masuk = i.HariMasuk,
                tanggal_bayar = i.Transaction?.TxDate.ToString("yyyy-MM-dd"),
                pendapatan = Proyeksi(pendapatan), potongan = Proyeksi(potongan),
                total_pendapatan = totalP, total_potongan = totalD, gaji_bersih = totalP - totalD,
            }));
        }
        return hasil;
    }

    private static Item Buat(string kind, string externalId, string ownerType, int ownerHubId, string? period, object data)
    {
        var json = JsonSerializer.Serialize(data);
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{ownerType}:{ownerHubId}:{period}:{json}")));
        return new Item(kind, externalId, ownerType, ownerHubId, period, data, hash);
    }

    // ------------------------------------------------------------------
    // Kirim
    // ------------------------------------------------------------------
    private async Task<bool> KirimBatchAsync(string baseUrl, string token, Kirim[] batch, CancellationToken ct)
    {
        try
        {
            var body = new
            {
                items = batch.Select(k => new
                {
                    kind = k.Kind, external_id = k.ExternalId, owner_type = k.OwnerType, owner_hub_id = k.OwnerHubId,
                    period = k.Period, version = k.Version, deleted = k.Deleted, data = k.Data,
                }),
            };
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/api/keuangan/push") { Content = JsonContent.Create(body) };
            req.Headers.Add("X-Keuangan-Token", token);
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(60));
            using var resp = await http.SendAsync(req, cts.Token);
            var teks = await resp.Content.ReadAsStringAsync(ct);
            if (!resp.IsSuccessStatusCode)
            {
                string? pesan = null;
                try { pesan = JsonDocument.Parse(teks).RootElement.GetProperty("message").GetString(); } catch { }
                logger.LogWarning("Push keuangan: GAGAL HTTP {Status} {Pesan}", (int)resp.StatusCode, pesan);
                await CatatAsync("error", pesan ?? $"Server membalas HTTP {(int)resp.StatusCode}.", ct);
                return false;
            }

            using var doc = JsonDocument.Parse(teks);
            var hasil = doc.RootElement.GetProperty("data").GetProperty("hasil");
            var peta = batch.ToDictionary(k => (k.Kind, k.ExternalId));
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var ditolak = 0;
            foreach (var h in hasil.EnumerateArray())
            {
                var kind = h.GetProperty("kind").GetString();
                var ext = h.GetProperty("external_id").GetString();
                if (kind is null || ext is null || !peta.TryGetValue((kind, ext), out var k)) continue;
                var status = h.GetProperty("status").GetString();
                if (status == "ditolak")
                {
                    ditolak++;
                    var alasan = h.TryGetProperty("alasan", out var a) ? a.GetString() : null;
                    await SimpanStateAsync(k, synced: false, retryAfter: DateTime.UtcNow.Add(JedaUlangDitolak), error: alasan, ct);
                }
                else
                {
                    // diterima / diabaikan (server sudah punya versi sama atau lebih baru) - keduanya = beres.
                    await SimpanStateAsync(k, synced: true, retryAfter: null, error: null, ct);
                }
            }
            await tx.CommitAsync(ct);
            if (ditolak > 0) logger.LogWarning("Push keuangan: {N} item ditolak server (dicoba lagi tiap jam) - biasanya pemilik belum ada di katalog instalasi.", ditolak);
            return true;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or OperationCanceledException && !ct.IsCancellationRequested)
        {
            await CatatAsync("offline", null, ct);
            return false;
        }
    }

    private Task SimpanStateAsync(Kirim k, bool synced, DateTime? retryAfter, string? error, CancellationToken ct)
        => db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO PushStates (Kind, ExternalId, OwnerType, OwnerHubId, ContentHash, Version, Deleted, Synced, RetryAfter, LastError)
              VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}, {9})
              ON CONFLICT(Kind, ExternalId) DO UPDATE SET OwnerType = excluded.OwnerType, OwnerHubId = excluded.OwnerHubId,
                ContentHash = excluded.ContentHash, Version = excluded.Version, Deleted = excluded.Deleted,
                Synced = excluded.Synced, RetryAfter = excluded.RetryAfter, LastError = excluded.LastError",
            [k.Kind, k.ExternalId, k.OwnerType, k.OwnerHubId, k.NewHash, k.Version, k.Deleted ? 1 : 0, synced ? 1 : 0,
             retryAfter?.ToString("O") ?? (object)DBNull.Value, error ?? (object)DBNull.Value], ct);

    // Tabel catatan "sudah terkirim apa" dibuat langsung lewat SQL (bukan migrasi
    // EF) - murni tabel bantu sinkron, tidak masuk model domain; CREATE IF NOT
    // EXISTS aman dijalankan tiap siklus & tidak mengganggu migrasi yang ada.
    private async Task PastikanTabelAsync(CancellationToken ct)
        => await db.Database.ExecuteSqlRawAsync(
            @"CREATE TABLE IF NOT EXISTS PushStates (
                Kind TEXT NOT NULL, ExternalId TEXT NOT NULL, OwnerType TEXT NOT NULL, OwnerHubId INTEGER NOT NULL,
                ContentHash TEXT NOT NULL, Version INTEGER NOT NULL, Deleted INTEGER NOT NULL DEFAULT 0,
                Synced INTEGER NOT NULL DEFAULT 0, RetryAfter TEXT NULL, LastError TEXT NULL,
                PRIMARY KEY (Kind, ExternalId))", ct);

    private async Task CatatAsync(string state, string? error, CancellationToken ct)
    {
        await SimpanSettingAsync(KeyState, state, ct);
        await SimpanSettingAsync(KeyError, error ?? "", ct);
    }

    private async Task SimpanSettingAsync(string key, string value, CancellationToken ct)
    {
        var existing = await db.SystemSettings.FindAsync([key], ct);
        if (existing is null) db.SystemSettings.Add(new SystemSetting { SettingKey = key, SettingValue = value, UpdatedAt = DateTime.UtcNow });
        else { existing.SettingValue = value; existing.UpdatedAt = DateTime.UtcNow; }
        await db.SaveChangesAsync(ct);
    }
}
