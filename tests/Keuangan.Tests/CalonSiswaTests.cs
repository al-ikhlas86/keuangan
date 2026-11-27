using Keuangan.Data;
using Keuangan.Data.Entities;
using Keuangan.Web.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Keuangan.Tests;

// Logika murni calon siswa PSB + migrasi + alur CalonSiswaService di SQLite sungguhan (file sementara).
public sealed class CalonSiswaTests : IDisposable
{
    private readonly string _berkas = Path.Combine(Path.GetTempPath(), $"keu-uji-{Guid.NewGuid():N}.db");

    private KeuanganDbContext Buka() => new(new DbContextOptionsBuilder<KeuanganDbContext>().UseSqlite($"Data Source={_berkas}").Options);

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var f in new[] { _berkas, _berkas + "-wal", _berkas + "-shm" }) { try { File.Delete(f); } catch (IOException) { } }
    }

    private static CalonSiswaService Layanan(KeuanganDbContext db) => new(db, new DocumentNumberService(db), NullLogger<CalonSiswaService>.Instance);

    private static CalonRemote Calon(int id, string nama, string status = "diterima", string? ta = "2027/2028", string? katalog = "SD")
        => new(id, $"PSB-{id:0000}", nama, status, "Gelombang 1", ta, katalog, "1A");

    // ---------- logika murni ----------
    [Fact]
    public void Status_awal_tanpa_tagihan_belum_sebagian_lunas()
    {
        Assert.Equal("tanpa_tagihan", CalonSiswaLogika.HitungStatus([]).Kode);
        Assert.Equal("belum", CalonSiswaLogika.HitungStatus([(100m, 0m)]).Kode);
        Assert.Equal("sebagian", CalonSiswaLogika.HitungStatus([(100m, 40m)]).Kode);
        Assert.Equal("lunas", CalonSiswaLogika.HitungStatus([(100m, 100m)]).Kode);
        // dua tagihan: satu lunas satu belum = sebagian; pembayaran berlebih tidak menutup tagihan lain
        var s = CalonSiswaLogika.HitungStatus([(100m, 300m), (50m, 0m)]);
        Assert.Equal("sebagian", s.Kode);
        Assert.Equal(150m, s.Total);
        Assert.Equal(100m, s.Dibayar);
    }

    [Fact]
    public void Cocokkan_hanya_bila_nama_dan_katalog_sama_dan_tunggal()
    {
        var calon = new List<(int Id, string Nama, string? Katalog)> { (1, "Budi  Santoso", "SD"), (2, "Siti", "SD"), (3, "Siti", "SD"), (4, "Ani", "TK") };
        Assert.Equal(1, CalonSiswaLogika.Cocokkan(calon, "budi santoso", "sd"));
        Assert.Null(CalonSiswaLogika.Cocokkan(calon, "Siti", "SD"));   // kembar: ragu = tidak digabung
        Assert.Null(CalonSiswaLogika.Cocokkan(calon, "Ani", "SD"));    // katalog beda
        Assert.Null(CalonSiswaLogika.Cocokkan(calon, "  ", "SD"));     // nama kosong
    }

    [Fact]
    public void Tarif_awal_hanya_jenis_aktif_wajib_bertanda_dan_bernominal()
    {
        var hari = new DateOnly(2027, 7, 1);
        FeeType F(Action<FeeType>? ubah = null) { var f = new FeeType { FeeCode = "F", Name = "BOP", DefaultAmount = 5_000_000m, Kategori = FeeKategori.Wajib, AutoTagihSaatDaftar = true, IsActive = true }; ubah?.Invoke(f); return f; }
        Assert.Equal(5_000_000m, CalonSiswaLogika.TarifAwal(F(), "2027/2028", hari));
        Assert.Null(CalonSiswaLogika.TarifAwal(F(f => f.IsActive = false), "2027/2028", hari));
        Assert.Null(CalonSiswaLogika.TarifAwal(F(f => f.AutoTagihSaatDaftar = false), "2027/2028", hari));
        Assert.Null(CalonSiswaLogika.TarifAwal(F(f => f.DefaultAmount = 0m), "2027/2028", hari));
    }

    // ---------- migrasi ----------
    [Fact]
    public void Semua_migrasi_berjalan_dan_model_sama_dengan_snapshot()
    {
        using var db = Buka();
        db.Database.Migrate();
        Assert.Empty(db.Database.GetPendingMigrations());
        Assert.False(db.Database.HasPendingModelChanges(), "Model C# berbeda dari snapshot migrasi: ada perubahan yang belum dibuatkan migrasi.");
    }

    // ---------- CalonSiswaService ----------
    [Fact]
    public async Task Calon_diterima_dibuatkan_tagihan_awal_BOP_sekali_saja()
    {
        using (var db = Buka())
        {
            db.Database.Migrate();
            var h1 = await Layanan(db).TerapkanAsync([Calon(7, "Budi")]);
            Assert.Equal(1, h1.Baru);
            Assert.Equal(1, h1.TagihanBaru);
        }
        using (var db = Buka())
        {
            // sinkron kedua (data sama): tidak ada tagihan ganda
            var h2 = await Layanan(db).TerapkanAsync([Calon(7, "Budi")]);
            Assert.Equal(0, h2.Baru);
            Assert.Equal(0, h2.TagihanBaru);
        }
        using (var db = Buka())
        {
            var s = await db.Students.SingleAsync(x => x.PsbId == 7);
            Assert.Equal(StudentStatus.Calon, s.Status);
            Assert.Equal(-7, s.HubId);
            Assert.Equal("CAL-7", s.StudentCode);
            var t = await db.TagihanList.Where(x => x.StudentId == s.Id).ToListAsync();
            Assert.Single(t);
            Assert.Equal("Awal 2027/2028", t[0].PeriodLabel);
            Assert.Equal(5_000_000m, t[0].Amount);
            Assert.NotNull(s.AwalDibuatAt);
        }
    }

    [Fact]
    public async Task Tagihan_yang_dihapus_staf_tidak_dibuat_ulang_dan_BOP_tidak_dibuat_ulang()
    {
        using var db = Buka();
        db.Database.Migrate();
        await Layanan(db).TerapkanAsync([Calon(1, "Ani")]);
        db.TagihanList.RemoveRange(db.TagihanList);
        db.FeeTypes.RemoveRange(db.FeeTypes);
        await db.SaveChangesAsync();
        var h = await Layanan(db).TerapkanAsync([Calon(1, "Ani"), Calon(2, "Beni")]);
        Assert.Equal(0, await db.FeeTypes.CountAsync()); // seed hanya sekali (penanda seed_bop_awal)
        Assert.Equal(1, h.Baru);
        Assert.Equal(0, h.TagihanBaru);
        Assert.Null((await db.Students.SingleAsync(x => x.PsbId == 2)).AwalDibuatAt); // tanpa jenis awal: belum dicap selesai, dicoba lagi nanti
    }

    [Fact]
    public async Task Calon_mundur_menjadi_Keluar_tetapi_siswa_aktif_tidak_disentuh()
    {
        using var db = Buka();
        db.Database.Migrate();
        await Layanan(db).TerapkanAsync([Calon(1, "Ani"), Calon(2, "Beni")]);
        var beni = await db.Students.SingleAsync(x => x.PsbId == 2);
        beni.Status = StudentStatus.Aktif; // sudah jadi siswa sungguhan lewat sinkron Data Master
        await db.SaveChangesAsync();

        var h = await Layanan(db).TerapkanAsync([Calon(1, "Ani", "mundur"), Calon(2, "Beni", "mundur")]);
        Assert.Equal(1, h.Batal);
        Assert.Equal(StudentStatus.Keluar, (await db.Students.SingleAsync(x => x.PsbId == 1)).Status);
        Assert.Equal(StudentStatus.Aktif, (await db.Students.SingleAsync(x => x.PsbId == 2)).Status);
    }
}
