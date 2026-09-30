namespace Keuangan.Data.Entities;

// Validasi pembayaran (maker-checker) & rekonsiliasi bank (2026-09-30) - port dari Akuntansi
// (apps/finance/models.py PaymentAllocationProposal / KeringananProposal / BankStatementLine).
// Status & role memakai STRING (nilai persis seperti Akuntansi) supaya frontend hasil port
// membandingkan literal yang sama.

// Usulan "pakai saldo siswa ini utk melunasi tagihan itu" - ada jeda usul -> validasi sebelum saldo
// BENAR2 terpakai. Saat divalidasi dibuat Payment(method=Saldo) - BUKAN uang baru, jadi tanpa
// transaksi/jurnal baru (uangnya sudah dijurnal saat diterima).
public class PaymentAllocationProposal
{
    public int Id { get; set; }
    public int StudentId { get; set; }
    public Student Student { get; set; } = null!;
    public string Status { get; set; } = "PENDING"; // PENDING | VALIDATED | REJECTED
    public string Note { get; set; } = "";
    public string ProposedByRole { get; set; } = "";
    public string? ValidatedByRole { get; set; }
    public DateTime? ValidatedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<PaymentAllocationProposalItem> Items { get; set; } = new List<PaymentAllocationProposalItem>();
}

public class PaymentAllocationProposalItem
{
    public int Id { get; set; }
    public int ProposalId { get; set; }
    public PaymentAllocationProposal Proposal { get; set; } = null!;
    public int TagihanId { get; set; }
    public Tagihan Tagihan { get; set; } = null!;
    public decimal Amount { get; set; }
}

// Usulan pembebasan (keringanan) tagihan bulanan - mis. "bonus 1 bulan gratis karena lunas 1 tahun
// di muka". HANYA AdminManager yang boleh menyetujui (melepas kewajiban bayar = keputusan kebijakan).
// Saat disetujui dibuat Payment(method=Keringanan) - BUKAN uang, dikecualikan dari hitungan saldo.
public class KeringananProposal
{
    public int Id { get; set; }
    public int StudentId { get; set; }
    public Student Student { get; set; } = null!;
    public int FeeTypeId { get; set; }
    public FeeType FeeType { get; set; } = null!;
    public string Reason { get; set; } = "";
    public string Status { get; set; } = "PENDING"; // PENDING | APPROVED | REJECTED
    public string ProposedByRole { get; set; } = "";
    public string? DecidedByRole { get; set; }
    public DateTime? DecidedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<KeringananProposalItem> Items { get; set; } = new List<KeringananProposalItem>();
}

public class KeringananProposalItem
{
    public int Id { get; set; }
    public int ProposalId { get; set; }
    public KeringananProposal Proposal { get; set; } = null!;
    public int TagihanId { get; set; }
    public Tagihan Tagihan { get; set; } = null!;
}

// Mutasi rekening koran yang dicatat manual, lalu dicocokkan ke transaksi transfer masuk.
public class BankStatementLine
{
    public int Id { get; set; }
    public DateOnly BankDate { get; set; }
    public required string Description { get; set; }
    public decimal Amount { get; set; }
    public required string PeriodKey { get; set; } // "YYYY-MM"

    // Satu transaksi hanya boleh dicocokkan ke SATU baris mutasi (indeks unik).
    public int? MatchedTransactionId { get; set; }
    public FinancialTransaction? MatchedTransaction { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
