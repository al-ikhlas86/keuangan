using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Keuangan.Web.Services;

// Data CONTOH untuk SANDBOX mode developer (2026-10-01). Sandbox = database
// kosong terpisah dari data asli, dan mode developer tidak menarik siswa/
// pegawai dari VPS - jadi tanpa data contoh, menu tagihan/pembayaran/penggajian
// tidak bisa dicoba sama sekali. Endpoint ini HANYA aktif di mode developer
// (selain itu 404), isinya data PALSU (HubId dicadangkan di rentang 9.000.000+
// supaya tidak pernah bentrok dgn id sungguhan) dan aman dipanggil berulang.
public static class DevSampleDataEndpoints
{
    private const int HubIdSiswaAwal = 9_000_001;
    private const int HubIdPegawaiAwal = 9_100_001;

    private static readonly (string Kelas, string Tingkat)[] KelasContoh =
        [("1A", "1"), ("1B", "1"), ("2A", "2"), ("3A", "3"), ("4A", "4"), ("5A", "5"), ("6A", "6")];

    public static void MapDevSampleDataEndpoints(this WebApplication app)
    {
        app.MapPost("/api/dev/sample-data", async (KeuanganDbContext db, IOptions<AppOptions> options) =>
        {
            if (!options.Value.IsDeveloperMode) return Results.NotFound();

            var hubSiswaAda = (await db.Students.Where(s => s.HubId >= HubIdSiswaAwal).Select(s => s.HubId).ToListAsync()).ToHashSet();
            var siswaBaru = 0;
            for (var i = 0; i < 14; i++)
            {
                var hubId = HubIdSiswaAwal + i;
                if (hubSiswaAda.Contains(hubId)) continue;
                var (kelas, tingkat) = KelasContoh[i % KelasContoh.Length];
                db.Students.Add(new Student
                {
                    StudentCode = $"STD-{hubId}", HubId = hubId, Nis = $"UJI{i + 1:000}", Name = $"Siswa Uji {i + 1:00}",
                    ClassName = kelas, Tingkat = tingkat, Katalog = "SD", Status = StudentStatus.Aktif, SyncedAt = DateTime.UtcNow,
                });
                siswaBaru++;
            }

            var hubPegawaiAda = (await db.Employees.Where(e => e.HubId >= HubIdPegawaiAwal).Select(e => e.HubId).ToListAsync()).ToHashSet();
            var pegawaiBaru = 0;
            for (var i = 0; i < 5; i++)
            {
                var hubId = HubIdPegawaiAwal + i;
                if (hubPegawaiAda.Contains(hubId)) continue;
                db.Employees.Add(new Employee
                {
                    HubId = hubId, Name = $"Guru Uji {i + 1}", Nip = $"9999{i + 1:00}", Jabatan = i == 0 ? "Kepala Sekolah" : "Guru",
                    IsKepalaSekolah = i == 0, Katalog = "SD", Status = EmployeeStatus.Aktif, SyncedAt = DateTime.UtcNow,
                    Tipe = i % 2 == 0 ? "Tetap" : "Honorer", Pendidikan = i % 2 == 0 ? "S1" : "S2",
                });
                pegawaiBaru++;
            }

            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { siswaBaru, pegawaiBaru }, message = siswaBaru + pegawaiBaru == 0 ? "Data contoh sudah ada." : "Data contoh ditambahkan." });
        }).RequireAuthorization();
    }
}
