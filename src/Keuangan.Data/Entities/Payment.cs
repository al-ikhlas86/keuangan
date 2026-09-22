namespace Keuangan.Data.Entities;

// Port dari Akuntansi (apps/finance/models.py Payment + PaymentReference) - kwitansi/
// bukti bayar yang mengeksekusi uang. PENTING: method "Saldo"/"Keringanan" BUKAN
// uang sungguhan yang masuk/keluar kas - dikecualikan eksplisit dari perhitungan
// kas, TIDAK PERNAH membuat FinancialTransaction (beda dari Cash/Transfer yang
// wajib py TransactionId terisi).
public class Payment
{
    public int Id { get; set; }
    public required string PaymentCode { get; set; } // auto-generate via DocumentSequence "PAY"

    public int StudentId { get; set; }
    public Student Student { get; set; } = null!;

    public int FeeTypeId { get; set; }
    public FeeType FeeType { get; set; } = null!;

    public int? TransactionId { get; set; }
    public FinancialTransaction? Transaction { get; set; }

    public DateOnly PaymentDate { get; set; }
    public required string PeriodLabel { get; set; }
    public PaymentReceiveMethod Method { get; set; }
    public decimal Amount { get; set; }

    // Banyak Payment boleh menunjuk 1 Tagihan (cicilan bertahap).
    public int? TagihanId { get; set; }
    public Tagihan? Tagihan { get; set; }

    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ICollection<PaymentReference> References { get; set; } = new List<PaymentReference>();
}

// Disiapkan utk integrasi payment gateway di masa depan - skema di-port, TIDAK
// aktif dipakai endpoint mana pun di Fase 1 (sama seperti kondisinya di Akuntansi
// lama - lihat catatan investigasi).
public class PaymentReference
{
    public int Id { get; set; }

    public int PaymentId { get; set; }
    public Payment Payment { get; set; } = null!;

    public string? ReferenceNo { get; set; }
    public string? GatewayName { get; set; }
    public string? GatewayStatus { get; set; }
    public string? RawPayloadJson { get; set; } // JSONField Django -> disimpan sbg teks JSON

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}
