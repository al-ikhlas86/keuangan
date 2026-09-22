using System.Security.Claims;
using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

public static class PeriodsEndpoints
{
    public static void MapPeriodsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/periods").RequireAuthorization();

        group.MapGet("/", async (KeuanganDbContext db) =>
        {
            var data = await db.PeriodClosings.OrderByDescending(p => p.PeriodKey)
                .Select(p => new { p.Id, p.PeriodKey, p.ClosedAt, ClosedByRole = p.ClosedByRole.ToString(), p.TotalIncome, p.TotalExpense })
                .ToListAsync();
            return Results.Ok(new { success = true, data });
        });

        // Tutup periode - HANYA admin/akuntansi, 1x per PeriodKey (tidak bisa
        // ditutup ulang, mencegah duplikasi/manipulasi histori).
        group.MapPost("/close", async (ClosePeriodRequest req, KeuanganDbContext db, DocumentNumberService docNum, ClaimsPrincipal user) =>
        {
            if (await db.PeriodClosings.AnyAsync(p => p.PeriodKey == req.PeriodKey))
                return Results.Conflict(new { success = false, message = $"Periode {req.PeriodKey} sudah ditutup sebelumnya." });

            if (!TryParsePeriodKey(req.PeriodKey, out var fromDate, out var toDate))
                return Results.BadRequest(new { success = false, message = "Format periode harus YYYY-MM." });

            var totalIncome = await db.FinancialTransactions
                .Where(t => t.TxDate >= fromDate && t.TxDate <= toDate && t.TxType == TxType.Masuk)
                .SumAsync(t => (decimal?)t.Amount) ?? 0;
            var totalExpense = await db.FinancialTransactions
                .Where(t => t.TxDate >= fromDate && t.TxDate <= toDate && t.TxType == TxType.Keluar)
                .SumAsync(t => (decimal?)t.Amount) ?? 0;

            JournalEntry? closingEntry = null;
            if (req.JournalLines is { Count: > 0 })
            {
                var totalDebit = req.JournalLines.Sum(l => l.Debit);
                var totalCredit = req.JournalLines.Sum(l => l.Credit);
                if (totalDebit != totalCredit)
                    return Results.BadRequest(new { success = false, message = $"Jurnal penutup tidak seimbang - debit ({totalDebit}) != kredit ({totalCredit})." });

                var entryNo = await docNum.NextAsync(DocType.JE, toDate);
                closingEntry = new JournalEntry { EntryNo = entryNo, EntryDate = toDate, Memo = $"Jurnal penutup periode {req.PeriodKey}" };
                foreach (var line in req.JournalLines)
                    closingEntry.Lines.Add(new JournalLine { AccountId = line.AccountId, Debit = line.Debit, Credit = line.Credit, Description = line.Description });
                db.JournalEntries.Add(closingEntry);
                await db.SaveChangesAsync();
            }

            var role = Enum.TryParse<UserRole>(user.FindFirstValue(ClaimTypes.Role), out var r) ? r : UserRole.AdminManager;
            var closing = new PeriodClosing
            {
                PeriodKey = req.PeriodKey,
                ClosedByRole = role,
                TotalIncome = totalIncome,
                TotalExpense = totalExpense,
                JournalEntryId = closingEntry?.Id,
            };
            db.PeriodClosings.Add(closing);
            await db.SaveChangesAsync();

            return Results.Ok(new { success = true, message = $"Periode {req.PeriodKey} ditutup - pemasukan Rp{totalIncome:N0}, pengeluaran Rp{totalExpense:N0}." });
        }).RequireAuthorization(policy => policy.RequireRole(UserRole.AdminManager.ToString(), UserRole.Akuntansi.ToString()));
    }

    private static bool TryParsePeriodKey(string periodKey, out DateOnly fromDate, out DateOnly toDate)
    {
        fromDate = toDate = default;
        var parts = periodKey.Split('-');
        if (parts.Length != 2 || !int.TryParse(parts[0], out var year) || !int.TryParse(parts[1], out var month) || month is < 1 or > 12)
            return false;
        fromDate = new DateOnly(year, month, 1);
        toDate = fromDate.AddMonths(1).AddDays(-1);
        return true;
    }
}

public record ClosePeriodRequest(string PeriodKey, List<JournalLineInput>? JournalLines);
