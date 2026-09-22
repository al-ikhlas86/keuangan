namespace Keuangan.Data.Entities;

// Port 1:1 dari Akuntansi (apps/finance/models.py ChartOfAccount).
public class ChartOfAccount
{
    public int Id { get; set; }
    public required string Code { get; set; }
    public required string Name { get; set; }
    public AccountType AccountType { get; set; }
    public NormalBalance NormalBalance { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ICollection<JournalLine> JournalLines { get; set; } = new List<JournalLine>();
}
