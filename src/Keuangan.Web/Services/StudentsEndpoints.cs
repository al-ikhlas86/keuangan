using Keuangan.Data;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

// Identitas (Nis/Name/ClassName/Tingkat/Status) READ-ONLY dari sini - datang
// dari KeuanganSyncService (pull Webview-App), TIDAK BISA diedit manual (lihat
// catatan panjang di Entities/Student.cs). Endpoint di sini HANYA boleh ubah
// field KHUSUS Keuangan (BankAccountNo, tarif legacy, Angkatan, VaNumber).
public static class StudentsEndpoints
{
    public static void MapStudentsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/students").RequireAuthorization();

        group.MapGet("/", async (string? q, KeuanganDbContext db) =>
        {
            var query = db.Students.AsQueryable();
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                query = query.Where(s => s.Name.Contains(term) || s.Nis.Contains(term));
            }
            var students = await query.OrderBy(s => s.Name)
                .Select(s => new
                {
                    s.Id, s.StudentCode, s.HubId, s.Nis, s.Name, s.ClassName, s.Tingkat,
                    Status = s.Status.ToString(), s.SyncedAt, s.BankAccountNo, s.Angkatan, s.VaNumber,
                })
                .ToListAsync();
            return Results.Ok(new { success = true, data = students });
        });

        group.MapGet("/{id:int}", async (int id, KeuanganDbContext db) =>
        {
            var s = await db.Students
                .Include(x => x.VirtualAccounts)
                .Include(x => x.TagihanList.OrderByDescending(t => t.CreatedAt).Take(20))
                .FirstOrDefaultAsync(x => x.Id == id);
            if (s is null) return Results.NotFound(new { success = false, message = "Siswa tidak ditemukan." });

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    s.Id, s.StudentCode, s.HubId, s.Nis, s.Name, s.ClassName, s.Tingkat,
                    Status = s.Status.ToString(), s.SyncedAt, s.BankAccountNo, s.Angkatan, s.VaNumber,
                    VirtualAccounts = s.VirtualAccounts.Select(v => new { v.Id, v.VaNumber, v.Label, v.IsActive }),
                    TagihanTerbaru = s.TagihanList.Select(t => new
                    {
                        t.Id, t.TagihanCode, t.PeriodLabel, t.Amount, t.PaidAmount, Status = t.Status.ToString(), t.DueDate,
                    }),
                },
            });
        });

        // HANYA field khusus Keuangan - lihat catatan di puncak file.
        group.MapPatch("/{id:int}/rincian-keuangan", async (int id, UpdateStudentFinanceRequest req, KeuanganDbContext db) =>
        {
            var s = await db.Students.FindAsync(id);
            if (s is null) return Results.NotFound(new { success = false, message = "Siswa tidak ditemukan." });

            if (req.BankAccountNo is not null) s.BankAccountNo = req.BankAccountNo.Trim();
            if (req.Angkatan is not null) s.Angkatan = req.Angkatan.Trim();
            if (req.VaNumber is not null) s.VaNumber = req.VaNumber.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, message = "Rincian keuangan siswa diperbarui." });
        });
    }
}

public record UpdateStudentFinanceRequest(string? BankAccountNo, string? Angkatan, string? VaNumber);
