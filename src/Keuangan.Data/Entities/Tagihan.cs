namespace Keuangan.Data.Entities;

// Port dari Akuntansi (apps/finance/models.py Tagihan) - jantung sistem penagihan
// siswa. PaidAmount TIDAK PERNAH diset manual - selalu dihitung ulang oleh
// TagihanService.RecomputeStatus() (port dari recurring_billing.py::recompute_tagihan_status),
// Status auto: 0->BelumDibayar, 0<paid<amount->Sebagian, paid>=amount->Lunas.
public class Tagihan
{
    public int Id { get; set; }
    public required string TagihanCode { get; set; } // auto-generate via DocumentSequence "TAG"

    public int StudentId { get; set; }
    public Student Student { get; set; } = null!;

    public int FeeTypeId { get; set; }
    public FeeType FeeType { get; set; } = null!;

    public required string PeriodLabel { get; set; }
    public decimal Amount { get; set; }
    public decimal PaidAmount { get; set; }
    public DateOnly? DueDate { get; set; }
    public TagihanStatus Status { get; set; } = TagihanStatus.BelumDibayar;

    // Hanya terisi utk baris hasil rencana cicilan (generate_cicilan_plan).
    public int? CicilanKe { get; set; }
    public int? CicilanDari { get; set; }

    // Pointer ke payment TERAKHIR saja (bukan sumber kebenaran - sumber
    // kebenaran ada di Payment.TagihanId / relasi balik PaymentsApplied).
    public int? LastPaymentId { get; set; }
    public Payment? LastPayment { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ICollection<Payment> PaymentsApplied { get; set; } = new List<Payment>();
}
