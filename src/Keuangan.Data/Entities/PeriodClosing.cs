namespace Keuangan.Data.Entities;

// Port dari Akuntansi (apps/finance/models.py PeriodClosing + RecurringBillingRun).
public class PeriodClosing
{
    public int Id { get; set; }
    public required string PeriodKey { get; set; } // format YYYY-MM
    public DateTime ClosedAt { get; set; } = DateTime.UtcNow;
    public UserRole ClosedByRole { get; set; }
    public decimal TotalIncome { get; set; }
    public decimal TotalExpense { get; set; }

    public int? JournalEntryId { get; set; }
    public JournalEntry? JournalEntry { get; set; }
}

// Cooldown generator tagihan bulanan TERSIMPAN DI DB (bukan in-memory) supaya
// konsisten lintas restart/worker - port pola sama persis.
public class RecurringBillingRun
{
    public int Id { get; set; }
    public required string PeriodLabel { get; set; }
    public DateTime LastRunAt { get; set; } = DateTime.UtcNow;
    public int CreatedCount { get; set; }
    public int SkippedCount { get; set; }
}
