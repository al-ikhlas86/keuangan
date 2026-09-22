namespace Keuangan.Data.Entities;

// Port dari Akuntansi (apps/finance/models.py FinancialTransaction), field lampiran
// bukti (Cloudinary receipt_*) DITUNDA ke Fase 2 (lihat plan - Fase 1 transaksi
// tanpa lampiran foto dulu). CreatedByUserId - BARU (Akuntansi lama pakai
// source_role string bebas dari header, sekarang akun login sungguhan yg
// bertanggung jawab, lihat Entities/User.cs).
public class FinancialTransaction
{
    public int Id { get; set; }
    public required string TxCode { get; set; } // auto-generate via DocumentSequence "TRX"
    public DateOnly TxDate { get; set; }
    public required string Description { get; set; }
    public TxType TxType { get; set; }
    public PaymentMethod PaymentMethod { get; set; }
    public decimal Amount { get; set; }

    public int? StudentId { get; set; }
    public Student? Student { get; set; }

    public int? FeeTypeId { get; set; }
    public FeeType? FeeType { get; set; }

    public string? SenderNote { get; set; }

    public int? CreatedByUserId { get; set; }
    public User? CreatedByUser { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<JournalEntry> JournalEntries { get; set; } = new List<JournalEntry>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
}
