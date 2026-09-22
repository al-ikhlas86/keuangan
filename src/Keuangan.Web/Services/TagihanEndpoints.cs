using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

public static class TagihanEndpoints
{
    public static void MapTagihanEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/tagihan").RequireAuthorization();

        group.MapGet("/", async (int? studentId, TagihanStatus? status, KeuanganDbContext db) =>
        {
            var query = db.TagihanList.Include(t => t.Student).Include(t => t.FeeType).AsQueryable();
            if (studentId is not null) query = query.Where(t => t.StudentId == studentId);
            if (status is not null) query = query.Where(t => t.Status == status);

            var data = await query.OrderByDescending(t => t.CreatedAt).Take(500)
                .Select(t => new
                {
                    t.Id, t.TagihanCode, StudentName = t.Student.Name, FeeTypeName = t.FeeType.Name,
                    t.PeriodLabel, t.Amount, t.PaidAmount, Status = t.Status.ToString(), t.DueDate, t.CicilanKe, t.CicilanDari,
                })
                .ToListAsync();
            return Results.Ok(new { success = true, data });
        });

        // Tambah tagihan MANUAL - khusus FeeType Opsional+Sekali (Wajib+Bulanan
        // dibuat OTOMATIS oleh generator tagihan bulanan, lihat catatan
        // RecurringBillingRun di Entities/PeriodClosing.cs - generator itu
        // sendiri Fase 2, Fase 1 baru endpoint manual ini).
        group.MapPost("/", async (CreateTagihanRequest req, KeuanganDbContext db, DocumentNumberService docNum) =>
        {
            var feeType = await db.FeeTypes.FindAsync(req.FeeTypeId);
            if (feeType is null) return Results.NotFound(new { success = false, message = "Jenis pembayaran tidak ditemukan." });
            if (!await db.Students.AnyAsync(s => s.Id == req.StudentId))
                return Results.NotFound(new { success = false, message = "Siswa tidak ditemukan." });
            if (req.Amount <= 0) return Results.BadRequest(new { success = false, message = "Nominal harus lebih dari 0." });

            var tagihanCode = await docNum.NextAsync(DocType.TAG, DateOnly.FromDateTime(DateTime.UtcNow));
            var tagihan = new Tagihan
            {
                TagihanCode = tagihanCode,
                StudentId = req.StudentId,
                FeeTypeId = req.FeeTypeId,
                PeriodLabel = req.PeriodLabel.Trim(),
                Amount = req.Amount,
                DueDate = req.DueDate,
            };
            db.TagihanList.Add(tagihan);
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { tagihan.Id, tagihan.TagihanCode } });
        });

        group.MapPatch("/{id:int}", async (int id, UpdateTagihanRequest req, KeuanganDbContext db) =>
        {
            var t = await db.TagihanList.FindAsync(id);
            if (t is null) return Results.NotFound(new { success = false, message = "Tagihan tidak ditemukan." });
            if (t.PaidAmount > 0)
                return Results.Conflict(new { success = false, message = "Tagihan yang sudah ada pembayarannya tidak bisa diedit nominalnya - batalkan pembayarannya dulu." });

            if (req.Amount is not null) t.Amount = req.Amount.Value;
            if (req.DueDate is not null) t.DueDate = req.DueDate;
            t.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, message = "Tagihan diperbarui." });
        });

        group.MapDelete("/{id:int}", async (int id, KeuanganDbContext db) =>
        {
            var t = await db.TagihanList.FindAsync(id);
            if (t is null) return Results.NotFound(new { success = false, message = "Tagihan tidak ditemukan." });
            if (t.PaidAmount > 0)
                return Results.Conflict(new { success = false, message = "Tagihan yang sudah ada pembayarannya tidak bisa dihapus." });
            db.TagihanList.Remove(t);
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, message = "Tagihan dihapus." });
        }).RequireAuthorization(policy => policy.RequireRole(UserRole.AdminManager.ToString(), UserRole.Staff.ToString()));
    }
}

public record CreateTagihanRequest(int StudentId, int FeeTypeId, string PeriodLabel, decimal Amount, DateOnly? DueDate);
public record UpdateTagihanRequest(decimal? Amount, DateOnly? DueDate);
