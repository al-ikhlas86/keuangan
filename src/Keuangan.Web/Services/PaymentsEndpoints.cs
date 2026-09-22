using System.Security.Claims;
using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

public static class PaymentsEndpoints
{
    public static void MapPaymentsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/payments").RequireAuthorization();

        // Terima pembayaran MANUAL - kasir/staf pilih sendiri tagihan mana
        // yang mau dibayar & berapa (boleh sebagian/cicilan). Port konsep dari
        // TerimaPembayaran.tsx mode "Manual" di Akuntansi.
        group.MapPost("/receive", async (ReceivePaymentRequest req, KeuanganDbContext db, DocumentNumberService docNum, TagihanService tagihanService, ClaimsPrincipal user) =>
        {
            var result = await ProsesPembayaranAsync(req.StudentId, req.PaymentDate, req.Method, req.Allocations, req.JournalLines, req.Description, db, docNum, tagihanService, user);
            return result;
        });

        // Alokasi OTOMATIS (waterfall) - 1 nominal dibagi ke tagihan TERBUKA
        // siswa ybs, urut prioritas FeeType lalu jatuh tempo terdekat. Port
        // konsep dari TerimaPembayaran.tsx mode "Otomatis".
        group.MapPost("/auto-allocate", async (AutoAllocateRequest req, KeuanganDbContext db, DocumentNumberService docNum, TagihanService tagihanService, ClaimsPrincipal user) =>
        {
            if (req.Amount <= 0) return Results.BadRequest(new { success = false, message = "Nominal harus lebih dari 0." });

            var openTagihan = await db.TagihanList
                .Include(t => t.FeeType)
                .Where(t => t.StudentId == req.StudentId && t.Status != TagihanStatus.Lunas)
                .OrderBy(t => t.FeeType.Prioritas).ThenBy(t => t.DueDate ?? DateOnly.MaxValue).ThenBy(t => t.CreatedAt)
                .ToListAsync();

            var sisa = req.Amount;
            var allocations = new List<ReceivePaymentAllocation>();
            foreach (var t in openTagihan)
            {
                if (sisa <= 0) break;
                var kekurangan = t.Amount - t.PaidAmount;
                if (kekurangan <= 0) continue;
                var alokasi = Math.Min(kekurangan, sisa);
                allocations.Add(new ReceivePaymentAllocation(t.Id, alokasi));
                sisa -= alokasi;
            }

            if (allocations.Count == 0)
                return Results.BadRequest(new { success = false, message = "Tidak ada tagihan terbuka untuk siswa ini." });
            // Sisa yg TIDAK teralokasi (uang lebih dari total tagihan terbuka)
            // SENGAJA ditolak drpd "hilang diam2" tanpa tercatat ke mana pun -
            // lebih aman user tahu & urus manual drpd sebagian uang tidak jelas.
            if (sisa > 0)
                return Results.BadRequest(new { success = false, message = $"Nominal melebihi total tagihan terbuka - sisa Rp{sisa:N0} tidak teralokasi. Kurangi nominal atau alokasikan manual per tagihan." });

            return await ProsesPembayaranAsync(req.StudentId, req.PaymentDate, req.Method, allocations, req.JournalLines, req.Description, db, docNum, tagihanService, user);
        });
    }

    private static async Task<IResult> ProsesPembayaranAsync(
        int studentId, DateOnly paymentDate, PaymentReceiveMethod method, List<ReceivePaymentAllocation> allocations,
        List<JournalLineInput>? journalLines, string? description,
        KeuanganDbContext db, DocumentNumberService docNum, TagihanService tagihanService, ClaimsPrincipal user)
    {
        if (allocations is null || allocations.Count == 0)
            return Results.BadRequest(new { success = false, message = "Minimal 1 tagihan harus dipilih." });

        var totalAmount = allocations.Sum(a => a.Amount);
        if (totalAmount <= 0) return Results.BadRequest(new { success = false, message = "Nominal harus lebih dari 0." });

        var tagihanIds = allocations.Select(a => a.TagihanId).ToList();
        var tagihanList = await db.TagihanList.Where(t => tagihanIds.Contains(t.Id)).ToListAsync();
        if (tagihanList.Count != tagihanIds.Distinct().Count())
            return Results.BadRequest(new { success = false, message = "Ada tagihan yang tidak ditemukan." });
        if (tagihanList.Any(t => t.StudentId != studentId))
            return Results.BadRequest(new { success = false, message = "Ada tagihan yang bukan milik siswa ini." });

        // "Saldo"/"Keringanan" BUKAN uang sungguhan - TIDAK PERNAH membuat
        // FinancialTransaction/JournalEntry (lihat catatan panjang di
        // Entities/Payment.cs). Cash/Transfer WAJIB py baris jurnal seimbang.
        var isRealMoney = method is PaymentReceiveMethod.Cash or PaymentReceiveMethod.Transfer;
        FinancialTransaction? transaction = null;

        if (isRealMoney)
        {
            if (journalLines is null || journalLines.Count == 0)
                return Results.BadRequest(new { success = false, message = "Baris jurnal (debit/kredit) wajib diisi utk pembayaran Cash/Transfer." });
            var totalDebit = journalLines.Sum(l => l.Debit);
            var totalCredit = journalLines.Sum(l => l.Credit);
            if (totalDebit != totalCredit)
                return Results.BadRequest(new { success = false, message = $"Jurnal tidak seimbang - total debit ({totalDebit}) harus sama dgn total kredit ({totalCredit})." });
            if (totalDebit != totalAmount)
                return Results.BadRequest(new { success = false, message = $"Total jurnal ({totalDebit}) harus sama dgn total nominal pembayaran ({totalAmount})." });

            var accountIds = journalLines.Select(l => l.AccountId).Distinct().ToList();
            if (await db.ChartOfAccounts.CountAsync(a => accountIds.Contains(a.Id)) != accountIds.Count)
                return Results.BadRequest(new { success = false, message = "Ada akun di baris jurnal yang tidak ditemukan." });

            var txCode = await docNum.NextAsync(DocType.TRX, paymentDate);
            var userId0 = int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var uid0) ? uid0 : (int?)null;
            if (userId0 == 0) userId0 = null;

            transaction = new FinancialTransaction
            {
                TxCode = txCode,
                TxDate = paymentDate,
                Description = description?.Trim() is { Length: > 0 } d ? d : "Penerimaan pembayaran siswa",
                TxType = TxType.Masuk,
                PaymentMethod = method == PaymentReceiveMethod.Transfer ? PaymentMethod.Transfer : PaymentMethod.Cash,
                Amount = totalAmount,
                StudentId = studentId,
                CreatedByUserId = userId0,
            };
            db.FinancialTransactions.Add(transaction);
            await db.SaveChangesAsync();

            var entryNo = await docNum.NextAsync(DocType.JE, paymentDate);
            var journalEntry = new JournalEntry { EntryNo = entryNo, EntryDate = paymentDate, Memo = transaction.Description, SourceTransactionId = transaction.Id };
            foreach (var line in journalLines)
                journalEntry.Lines.Add(new JournalLine { AccountId = line.AccountId, Debit = line.Debit, Credit = line.Credit, Description = line.Description });
            db.JournalEntries.Add(journalEntry);
            await db.SaveChangesAsync();
        }

        var paymentCodes = new List<string>();
        foreach (var alloc in allocations)
        {
            var tagihan = tagihanList.First(t => t.Id == alloc.TagihanId);
            var paymentCode = await docNum.NextAsync(DocType.PAY, paymentDate);
            db.Payments.Add(new Payment
            {
                PaymentCode = paymentCode,
                StudentId = studentId,
                FeeTypeId = tagihan.FeeTypeId,
                TransactionId = transaction?.Id,
                PaymentDate = paymentDate,
                PeriodLabel = tagihan.PeriodLabel,
                Method = method,
                Amount = alloc.Amount,
                TagihanId = tagihan.Id,
                Description = description,
            });
            paymentCodes.Add(paymentCode);
        }
        await db.SaveChangesAsync();

        foreach (var id in tagihanIds.Distinct())
            await tagihanService.RecomputeStatusAsync(id);

        return Results.Ok(new { success = true, data = new { paymentCodes, transactionCode = transaction?.TxCode } });
    }
}

public record ReceivePaymentAllocation(int TagihanId, decimal Amount);
public record ReceivePaymentRequest(int StudentId, DateOnly PaymentDate, PaymentReceiveMethod Method, List<ReceivePaymentAllocation> Allocations, List<JournalLineInput>? JournalLines, string? Description);
public record AutoAllocateRequest(int StudentId, DateOnly PaymentDate, PaymentReceiveMethod Method, decimal Amount, List<JournalLineInput>? JournalLines, string? Description);
