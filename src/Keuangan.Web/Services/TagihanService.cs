using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

// Port dari Akuntansi (apps/finance/recurring_billing.py::recompute_tagihan_status).
// PaidAmount TIDAK PERNAH diset manual di mana pun - SELALU dihitung ulang
// di sini dari SUM(Payment.Amount) yg TagihanId-nya menunjuk baris ini
// (sumber kebenaran alokasi ada di Payment.TagihanId, BUKAN
// Tagihan.LastPaymentId yg cuma pointer tampilan - lihat catatan panjang
// di Entities/Tagihan.cs & KeuanganDbContext.cs).
public class TagihanService(KeuanganDbContext db)
{
    public async Task RecomputeStatusAsync(int tagihanId, CancellationToken ct = default)
    {
        var tagihan = await db.TagihanList.FindAsync([tagihanId], ct);
        if (tagihan is null) return;

        var paid = await db.Payments.Where(p => p.TagihanId == tagihanId).SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;
        tagihan.PaidAmount = paid;
        tagihan.Status = paid <= 0 ? TagihanStatus.BelumDibayar
            : paid >= tagihan.Amount ? TagihanStatus.Lunas
            : TagihanStatus.Sebagian;
        tagihan.UpdatedAt = DateTime.UtcNow;

        var lastPayment = await db.Payments
            .Where(p => p.TagihanId == tagihanId)
            .OrderByDescending(p => p.PaymentDate).ThenByDescending(p => p.Id)
            .FirstOrDefaultAsync(ct);
        tagihan.LastPaymentId = lastPayment?.Id;

        await db.SaveChangesAsync(ct);
    }
}
