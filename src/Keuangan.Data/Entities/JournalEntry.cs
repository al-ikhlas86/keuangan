namespace Keuangan.Data.Entities;

// Port dari Akuntansi (apps/finance/models.py JournalEntry + JournalLine).
public class JournalEntry
{
    public int Id { get; set; }
    public required string EntryNo { get; set; } // auto-generate via DocumentSequence "JE"
    public DateOnly EntryDate { get; set; }
    public string? Memo { get; set; }

    public int? SourceTransactionId { get; set; }
    public FinancialTransaction? SourceTransaction { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ICollection<JournalLine> Lines { get; set; } = new List<JournalLine>();
}

public class JournalLine
{
    public int Id { get; set; }

    public int JournalEntryId { get; set; }
    public JournalEntry JournalEntry { get; set; } = null!;

    public int AccountId { get; set; }
    public ChartOfAccount Account { get; set; } = null!;

    public string? Description { get; set; }
    public decimal Debit { get; set; }
    public decimal Credit { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}
