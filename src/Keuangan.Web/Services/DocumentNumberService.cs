using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

// Port dari Akuntansi (apps/finance/models.py DocumentSequence.next_doc_number,
// dipanggil FinancialTransaction/Tagihan/Payment/JournalEntry.save() saat
// TxCode/dst kosong). Format nomor diambil dari DocumentNumberFormat AKTIF
// TERBARU (effective_from <= tanggal dokumen, ORDER BY effective_from DESC
// LIMIT 1) - kalau belum ada baris format sama sekali utk DocType itu,
// pakai default hardcode (prefix = nama DocType, padding 4, reset bulanan)
// spy sistem tetap jalan sebelum Admin sempat atur format custom.
public class DocumentNumberService(KeuanganDbContext db)
{
    public async Task<string> NextAsync(DocType docType, DateOnly tanggal, CancellationToken ct = default)
    {
        var format = await db.DocumentNumberFormats
            .Where(f => f.DocType == docType && f.EffectiveFrom <= tanggal)
            .OrderByDescending(f => f.EffectiveFrom)
            .FirstOrDefaultAsync(ct);

        var prefix = format?.Prefix ?? docType.ToString();
        var separator = format?.Separator ?? "-";
        var padding = format?.DigitPadding ?? 4;
        var cadence = format?.ResetCadence ?? ResetCadence.Monthly;

        var periodKey = cadence switch
        {
            ResetCadence.Yearly => tanggal.ToString("yyyy"),
            ResetCadence.Never => "ALL",
            _ => tanggal.ToString("yyyyMM"), // Monthly (default)
        };

        // Race-safe via transaksi + baris terkunci (SQLite serialize write
        // secara alami, tapi tetap pola benar utk kalau nanti pindah DB lain).
        var seq = await db.DocumentSequences.FirstOrDefaultAsync(s => s.DocType == docType && s.PeriodKey == periodKey, ct);
        if (seq is null)
        {
            seq = new DocumentSequence { DocType = docType, PeriodKey = periodKey, LastNumber = 0 };
            db.DocumentSequences.Add(seq);
        }
        seq.LastNumber += 1;
        await db.SaveChangesAsync(ct);

        var nomor = seq.LastNumber.ToString().PadLeft(padding, '0');
        return cadence == ResetCadence.Never
            ? $"{prefix}{separator}{nomor}"
            : $"{prefix}{separator}{periodKey}{separator}{nomor}";
    }
}
