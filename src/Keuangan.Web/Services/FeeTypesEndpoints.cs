using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

public static class FeeTypesEndpoints
{
    public static void MapFeeTypesEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/fee-types").RequireAuthorization();

        group.MapGet("/", async (KeuanganDbContext db) =>
        {
            var feeTypes = await db.FeeTypes.OrderBy(f => f.Prioritas).ThenBy(f => f.Name)
                .Select(f => new
                {
                    f.Id, f.FeeCode, f.Name, f.Description, f.DefaultAmount,
                    Kategori = f.Kategori.ToString(), Frekuensi = f.Frekuensi.ToString(),
                    f.AutoTagihSaatDaftar, f.UsesAngkatanRate, f.CicilanJumlahBulanDefault,
                    f.CicilanMinimalPerBulan, f.Prioritas, f.IsActive,
                })
                .ToListAsync();
            return Results.Ok(new { success = true, data = feeTypes });
        });

        group.MapPost("/", async (CreateFeeTypeRequest req, KeuanganDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Name))
                return Results.BadRequest(new { success = false, message = "Nama jenis pembayaran wajib diisi." });

            var feeType = new FeeType
            {
                FeeCode = $"FEE-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}",
                Name = req.Name.Trim(),
                Description = req.Description,
                DefaultAmount = req.DefaultAmount,
                Kategori = req.Kategori,
                Frekuensi = req.Frekuensi,
                AutoTagihSaatDaftar = req.AutoTagihSaatDaftar,
                UsesAngkatanRate = req.UsesAngkatanRate,
                CicilanJumlahBulanDefault = req.CicilanJumlahBulanDefault ?? 1,
                CicilanMinimalPerBulan = req.CicilanMinimalPerBulan ?? 0,
                Prioritas = req.Prioritas ?? 0,
            };
            db.FeeTypes.Add(feeType);
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { feeType.Id, feeType.FeeCode } });
        }).RequireAuthorization(policy => policy.RequireRole(UserRole.AdminManager.ToString(), UserRole.Staff.ToString()));

        group.MapPatch("/{id:int}", async (int id, UpdateFeeTypeRequest req, KeuanganDbContext db) =>
        {
            var f = await db.FeeTypes.FindAsync(id);
            if (f is null) return Results.NotFound(new { success = false, message = "Jenis pembayaran tidak ditemukan." });

            if (req.Name is not null) f.Name = req.Name.Trim();
            if (req.Description is not null) f.Description = req.Description;
            if (req.DefaultAmount is not null) f.DefaultAmount = req.DefaultAmount.Value;
            if (req.Prioritas is not null) f.Prioritas = req.Prioritas.Value;
            if (req.IsActive is not null) f.IsActive = req.IsActive.Value;
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, message = "Jenis pembayaran diperbarui." });
        }).RequireAuthorization(policy => policy.RequireRole(UserRole.AdminManager.ToString(), UserRole.Staff.ToString()));

        // Tarif per angkatan - baris LAMA tidak pernah diedit, baris baru
        // ditambah (lihat catatan panjang di Entities/FeeType.cs::FeeTypeRate).
        group.MapGet("/{feeTypeId:int}/rates", async (int feeTypeId, KeuanganDbContext db) =>
        {
            var rates = await db.FeeTypeRates.Where(r => r.FeeTypeId == feeTypeId)
                .OrderByDescending(r => r.BerlakuMulai)
                .Select(r => new { r.Id, r.Angkatan, r.BerlakuMulai, r.Nominal })
                .ToListAsync();
            return Results.Ok(new { success = true, data = rates });
        });

        group.MapPost("/{feeTypeId:int}/rates", async (int feeTypeId, CreateFeeTypeRateRequest req, KeuanganDbContext db) =>
        {
            if (!await db.FeeTypes.AnyAsync(f => f.Id == feeTypeId))
                return Results.NotFound(new { success = false, message = "Jenis pembayaran tidak ditemukan." });

            db.FeeTypeRates.Add(new FeeTypeRate { FeeTypeId = feeTypeId, Angkatan = req.Angkatan.Trim(), BerlakuMulai = req.BerlakuMulai, Nominal = req.Nominal });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, message = "Tarif angkatan ditambahkan." });
        }).RequireAuthorization(policy => policy.RequireRole(UserRole.AdminManager.ToString(), UserRole.Staff.ToString()));
    }
}

public record CreateFeeTypeRequest(string Name, string? Description, decimal DefaultAmount, FeeKategori Kategori, FeeFrekuensi Frekuensi, bool AutoTagihSaatDaftar, bool UsesAngkatanRate, int? CicilanJumlahBulanDefault, decimal? CicilanMinimalPerBulan, int? Prioritas);
public record UpdateFeeTypeRequest(string? Name, string? Description, decimal? DefaultAmount, int? Prioritas, bool? IsActive);
public record CreateFeeTypeRateRequest(string Angkatan, DateOnly BerlakuMulai, decimal Nominal);
