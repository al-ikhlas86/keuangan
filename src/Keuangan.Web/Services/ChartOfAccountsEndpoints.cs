using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

public static class ChartOfAccountsEndpoints
{
    public static void MapChartOfAccountsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/chart-of-accounts").RequireAuthorization();

        group.MapGet("/", async (KeuanganDbContext db) =>
        {
            var accounts = await db.ChartOfAccounts.OrderBy(a => a.Code)
                .Select(a => new { a.Id, a.Code, a.Name, AccountType = a.AccountType.ToString(), NormalBalance = a.NormalBalance.ToString(), a.IsActive })
                .ToListAsync();
            return Results.Ok(new { success = true, data = accounts });
        });

        // Admin/Akuntansi saja yang boleh kelola bagan akun (perubahan di sini
        // berdampak ke SELURUH pembukuan, bukan operasional harian biasa).
        group.MapPost("/", async (CreateAccountRequest req, KeuanganDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
                return Results.BadRequest(new { success = false, message = "Kode dan nama akun wajib diisi." });
            if (await db.ChartOfAccounts.AnyAsync(a => a.Code == req.Code))
                return Results.Conflict(new { success = false, message = "Kode akun sudah dipakai." });

            var account = new ChartOfAccount { Code = req.Code.Trim(), Name = req.Name.Trim(), AccountType = req.AccountType, NormalBalance = req.NormalBalance };
            db.ChartOfAccounts.Add(account);
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { account.Id } });
        }).RequireAuthorization(policy => policy.RequireRole(UserRole.AdminManager.ToString(), UserRole.Akuntansi.ToString()));

        group.MapPatch("/{id:int}", async (int id, UpdateAccountRequest req, KeuanganDbContext db) =>
        {
            var account = await db.ChartOfAccounts.FindAsync(id);
            if (account is null) return Results.NotFound(new { success = false, message = "Akun tidak ditemukan." });
            if (req.Name is not null) account.Name = req.Name.Trim();
            if (req.IsActive is not null) account.IsActive = req.IsActive.Value;
            account.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, message = "Akun diperbarui." });
        }).RequireAuthorization(policy => policy.RequireRole(UserRole.AdminManager.ToString(), UserRole.Akuntansi.ToString()));
    }
}

public record CreateAccountRequest(string Code, string Name, AccountType AccountType, NormalBalance NormalBalance);
public record UpdateAccountRequest(string? Name, bool? IsActive);
