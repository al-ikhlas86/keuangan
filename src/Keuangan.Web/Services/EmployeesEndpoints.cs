using Keuangan.Data;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

// Pegawai READ-ONLY - identitas datang dari KeuanganSyncService (pull
// Webview-App), TIDAK ADA endpoint tambah/ubah/hapus (sama seperti siswa:
// sumber data = Data Master). Komponen gaji/slip gaji menyusul di fase
// berikutnya sebagai tabel terpisah yang menunjuk ke Employee.Id.
public static class EmployeesEndpoints
{
    public static void MapEmployeesEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/employees").RequireAuthorization();

        group.MapGet("/", async (string? q, KeuanganDbContext db) =>
        {
            var query = db.Employees.AsQueryable();
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                query = query.Where(e => e.Name.Contains(term) || (e.Nip != null && e.Nip.Contains(term)));
            }
            var employees = await query.OrderBy(e => e.Name)
                .Select(e => new
                {
                    e.Id, e.HubId, e.Name, e.Nip, e.Jabatan, e.IsKepalaSekolah, e.Tipe, e.Pendidikan,
                    Status = e.Status.ToString(), e.StatusKeluar, e.Katalog, e.SyncedAt,
                })
                .ToListAsync();
            return Results.Ok(new { success = true, data = employees });
        });
    }
}
