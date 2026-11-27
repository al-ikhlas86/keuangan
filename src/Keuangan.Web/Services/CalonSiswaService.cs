using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

/// <summary>Calon siswa dari PSB (GET /api/keuangan/calon-siswa di webview). Status: diterima | mundur.</summary>
public sealed record CalonRemote(int PsbId, string Nomor, string Nama, string Status, string? Gelombang, string? TahunAjaran, string? Katalog, string? KelasTujuan);

/// <summary>
/// Calon siswa dari PSB di Keuangan (2026-11-28). Pendaftar yang DITERIMA ditarik dari webview, dicatat sebagai Student ber-Status Calon (HubId negatif, lihat Student.PsbId),
/// dan dibuatkan tagihan AWAL satu kali dari jenis pembayaran Wajib yang bertanda "tagih saat daftar". Nominal per tahun ajaran gelombangnya (Angkatan). Kasir menerima
/// pembayaran lewat alur biasa; status lunas dikirim balik lewat push (KeuanganPushService) ke webview lalu Data Master. Calon yang mundur ditandai Keluar (riwayat utuh).
/// </summary>
public class CalonSiswaService(KeuanganDbContext db, DocumentNumberService docNum, ILogger<CalonSiswaService> logger)
{
    public const string KeySeedBop = "seed_bop_awal";

    public sealed record Hasil(int Baru, int TagihanBaru, int Batal);

    public async Task<Hasil> TerapkanAsync(IReadOnlyList<CalonRemote> items, CancellationToken ct = default)
    {
        int baru = 0, tagihanBaru = 0, batal = 0;
        if (items.Any(i => i.Status == "diterima")) await PastikanBiayaContohAsync(ct);

        var lokal = await db.Students.Where(s => s.PsbId != null).ToDictionaryAsync(s => s.PsbId!.Value, ct);
        var jenisAwal = await db.FeeTypes.Include(f => f.Rates).Where(f => f.IsActive && f.Kategori == FeeKategori.Wajib && f.AutoTagihSaatDaftar).ToListAsync(ct);
        var hari = DateOnly.FromDateTime(DateTime.Now);
        var sekarang = DateTime.UtcNow;

        foreach (var it in items)
        {
            lokal.TryGetValue(it.PsbId, out var s);
            if (it.Status == "mundur")
            {
                // Hanya yang masih Calon: calon yang sudah jadi siswa (Aktif) urusannya Data Master.
                if (s is { Status: StudentStatus.Calon }) { s.Status = StudentStatus.Keluar; batal++; }
                continue;
            }
            if (it.Status != "diterima") continue;

            if (s is null)
            {
                s = new Student
                {
                    StudentCode = $"CAL-{it.PsbId}", HubId = -it.PsbId, PsbId = it.PsbId, Nis = it.Nomor, Name = it.Nama,
                    ClassName = it.KelasTujuan, Katalog = it.Katalog, Angkatan = it.TahunAjaran, Status = StudentStatus.Calon, SyncedAt = sekarang,
                };
                db.Students.Add(s);
                lokal[it.PsbId] = s;
                baru++;
            }
            else if (s.Status == StudentStatus.Calon)
            {
                // Selama masih calon, identitas mengikuti PSB; setelah jadi siswa sungguhan identitas mengikuti Data Master (TarikSiswaAsync).
                s.Name = it.Nama; s.Nis = it.Nomor; s.ClassName = it.KelasTujuan; s.Katalog = it.Katalog; s.Angkatan = it.TahunAjaran; s.SyncedAt = sekarang;
            }

            if (s.Status != StudentStatus.Calon || s.AwalDibuatAt is not null) continue;
            var label = CalonSiswaLogika.LabelPeriodeAwal(s.Angkatan);
            var dibuat = 0;
            foreach (var f in jenisAwal)
            {
                var tarif = CalonSiswaLogika.TarifAwal(f, s.Angkatan, hari);
                if (tarif is null) { logger.LogWarning("Tagihan awal {Fee} untuk {Nama}: nominal/tarif angkatan {Angkatan} belum diatur - dilewati.", f.Name, s.Name, s.Angkatan); continue; }
                if (s.Id != 0 && await db.TagihanList.AnyAsync(t => t.StudentId == s.Id && t.FeeTypeId == f.Id && t.PeriodLabel == label, ct)) continue;
                var kode = await docNum.NextAsync(DocType.TAG, hari, ct);
                db.TagihanList.Add(new Tagihan { TagihanCode = kode, Student = s, FeeTypeId = f.Id, PeriodLabel = label, Amount = tarif.Value });
                dibuat++;
            }
            // Tanpa satu pun jenis awal yang bisa ditagihkan: JANGAN dicap selesai, dicoba lagi begitu staf mengatur jenis pembayaran awal.
            if (dibuat > 0) { s.AwalDibuatAt = sekarang; tagihanBaru += dibuat; }
        }

        await db.SaveChangesAsync(ct);
        if (baru + tagihanBaru + batal > 0) logger.LogInformation("Sync calon siswa: {Baru} calon baru, {Tagihan} tagihan awal dibuat, {Batal} mundur.", baru, tagihanBaru, batal);
        return new Hasil(baru, tagihanBaru, batal);
    }

    /// <summary>
    /// Jenis pembayaran awal CONTOH ("BOP", Rp 5.000.000, wajib, sekali) dibuat SEKALI saat calon pertama datang bila belum ada jenis yang bertanda tagih-saat-daftar,
    /// supaya alurnya langsung terlihat. Nama dan nominal diubah staf di menu Jenis Pembayaran; tidak dibuat ulang bila dihapus (penanda seed_bop_awal).
    /// </summary>
    private async Task PastikanBiayaContohAsync(CancellationToken ct)
    {
        if (await db.SystemSettings.FindAsync([KeySeedBop], ct) is not null) return;
        if (!await db.FeeTypes.AnyAsync(f => f.AutoTagihSaatDaftar, ct))
        {
            db.FeeTypes.Add(new FeeType
            {
                FeeCode = "FEE-BOP", Name = "BOP", Description = "Biaya awal siswa baru (CONTOH): ubah nama dan nominal di menu Jenis Pembayaran.",
                DefaultAmount = 5_000_000m, Kategori = FeeKategori.Wajib, Frekuensi = FeeFrekuensi.Sekali, AutoTagihSaatDaftar = true, IsActive = true,
            });
            logger.LogInformation("Jenis pembayaran awal contoh \"BOP\" (Rp 5.000.000) dibuat; staf dapat mengubahnya.");
        }
        db.SystemSettings.Add(new SystemSetting { SettingKey = KeySeedBop, SettingValue = "1", UpdatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync(ct);
    }
}
