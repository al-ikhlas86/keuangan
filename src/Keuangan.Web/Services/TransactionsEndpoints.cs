using System.Security.Claims;
using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

// CATATAN DESAIN PENTING: investigasi Akuntansi lama TIDAK menemukan algoritma
// auto-mapping FeeType/TxType -> ChartOfAccount yang eksplisit/terverifikasi
// (endpoint POST /api/transactions/ di Django cuma terima field dasar, tanpa
// parameter akun) - drpd MENEBAK aturan bisnis yang tidak terverifikasi utk
// data KEUANGAN SUNGGUHAN, di sini baris jurnal (JournalLines) diminta
// EKSPLISIT dari pemanggil (org yang mencatat transaksi yang menentukan akun
// debit/kredit-nya, sesuai Chart of Account yang sudah dia kelola sendiri) -
// server HANYA validasi debit=kredit (aturan akuntansi baku, bukan tebakan),
// TIDAK PERNAH menebak sendiri akun mana yang "seharusnya" kena.
public static class TransactionsEndpoints
{
    public static void MapTransactionsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/transactions").RequireAuthorization();

        group.MapGet("/", async (DateOnly? dari, DateOnly? sampai, TxType? txType, KeuanganDbContext db) =>
        {
            var query = db.FinancialTransactions.AsQueryable();
            if (dari is not null) query = query.Where(t => t.TxDate >= dari);
            if (sampai is not null) query = query.Where(t => t.TxDate <= sampai);
            if (txType is not null) query = query.Where(t => t.TxType == txType);

            var data = await query.OrderByDescending(t => t.TxDate).ThenByDescending(t => t.Id).Take(500)
                .Select(t => new
                {
                    t.Id, t.TxCode, t.TxDate, t.Description, TxType = t.TxType.ToString(), PaymentMethod = t.PaymentMethod.ToString(),
                    t.Amount, StudentName = t.Student != null ? t.Student.Name : null, FeeTypeName = t.FeeType != null ? t.FeeType.Name : null,
                })
                .ToListAsync();
            return Results.Ok(new { success = true, data });
        });

        group.MapGet("/{id:int}", async (int id, KeuanganDbContext db) =>
        {
            var t = await db.FinancialTransactions
                .Include(x => x.JournalEntries).ThenInclude(j => j.Lines).ThenInclude(l => l.Account)
                .FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Results.NotFound(new { success = false, message = "Transaksi tidak ditemukan." });

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    t.Id, t.TxCode, t.TxDate, t.Description, TxType = t.TxType.ToString(), PaymentMethod = t.PaymentMethod.ToString(),
                    t.Amount, t.StudentId, t.FeeTypeId, t.SenderNote,
                    JournalLines = t.JournalEntries.SelectMany(j => j.Lines).Select(l => new { l.AccountId, AccountName = l.Account.Name, l.Debit, l.Credit }),
                },
            });
        });

        group.MapPost("/", async (CreateTransactionRequest req, KeuanganDbContext db, DocumentNumberService docNum, ClaimsPrincipal user) =>
        {
            if (string.IsNullOrWhiteSpace(req.Description) || req.Amount <= 0)
                return Results.BadRequest(new { success = false, message = "Deskripsi wajib diisi, nominal harus lebih dari 0." });

            var totalDebit = req.JournalLines?.Sum(l => l.Debit) ?? 0;
            var totalCredit = req.JournalLines?.Sum(l => l.Credit) ?? 0;
            if (req.JournalLines is null || req.JournalLines.Count == 0)
                return Results.BadRequest(new { success = false, message = "Baris jurnal (debit/kredit) wajib diisi minimal 2 baris." });
            if (totalDebit != totalCredit)
                return Results.BadRequest(new { success = false, message = $"Jurnal tidak seimbang - total debit ({totalDebit}) harus sama dgn total kredit ({totalCredit})." });
            if (totalDebit != req.Amount)
                return Results.BadRequest(new { success = false, message = $"Total debit/kredit jurnal ({totalDebit}) harus sama dgn nominal transaksi ({req.Amount})." });

            var accountIds = req.JournalLines.Select(l => l.AccountId).Distinct().ToList();
            var validAccountCount = await db.ChartOfAccounts.CountAsync(a => accountIds.Contains(a.Id));
            if (validAccountCount != accountIds.Count)
                return Results.BadRequest(new { success = false, message = "Ada akun di baris jurnal yang tidak ditemukan." });

            var userId = int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : (int?)null;
            // AdminManager/dev punya UserId=0 (bukan baris asli di tabel Users,
            // lihat DeveloperModeMiddleware) - JANGAN dipaksa jadi FK, biarkan
            // null spy tidak melanggar FK constraint ke tabel Users.
            if (userId == 0) userId = null;

            var txCode = await docNum.NextAsync(DocType.TRX, req.TxDate);
            var transaction = new FinancialTransaction
            {
                TxCode = txCode,
                TxDate = req.TxDate,
                Description = req.Description.Trim(),
                TxType = req.TxType,
                PaymentMethod = req.PaymentMethod,
                Amount = req.Amount,
                StudentId = req.StudentId,
                FeeTypeId = req.FeeTypeId,
                SenderNote = req.SenderNote,
                CreatedByUserId = userId,
            };
            db.FinancialTransactions.Add(transaction);
            await db.SaveChangesAsync(); // perlu Id transaksi utk JournalEntry.SourceTransactionId

            var entryNo = await docNum.NextAsync(DocType.JE, req.TxDate);
            var journalEntry = new JournalEntry
            {
                EntryNo = entryNo,
                EntryDate = req.TxDate,
                Memo = req.Description.Trim(),
                SourceTransactionId = transaction.Id,
            };
            foreach (var line in req.JournalLines)
            {
                journalEntry.Lines.Add(new JournalLine { AccountId = line.AccountId, Debit = line.Debit, Credit = line.Credit, Description = line.Description });
            }
            db.JournalEntries.Add(journalEntry);
            await db.SaveChangesAsync();

            return Results.Ok(new { success = true, data = new { transaction.Id, transaction.TxCode, journalEntry.EntryNo } });
        });
    }
}

public record JournalLineInput(int AccountId, decimal Debit, decimal Credit, string? Description);
public record CreateTransactionRequest(DateOnly TxDate, string Description, TxType TxType, PaymentMethod PaymentMethod, decimal Amount, int? StudentId, int? FeeTypeId, string? SenderNote, List<JournalLineInput>? JournalLines);
