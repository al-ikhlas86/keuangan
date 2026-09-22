namespace Keuangan.Data.Entities;

// Port dari Akuntansi (apps/finance/models.py DocumentSequence + DocumentNumberFormat).
// Fase 1 dibatasi doc_type [TRX,PAY,TAG,JE] - "SLIP" (slip gaji) masuk Fase 2
// bareng modul Penggajian, lihat plan.
public class DocumentSequence
{
    public int Id { get; set; }
    public DocType DocType { get; set; }
    public required string PeriodKey { get; set; } // format YYYYMM (6 karakter)
    public int LastNumber { get; set; }
}

// Boleh banyak baris per DocType - histori perubahan format tanpa merusak nomor
// lama (baris lama tidak pernah diedit, baris baru ditambah utk kebijakan baru).
public class DocumentNumberFormat
{
    public int Id { get; set; }
    public DocType DocType { get; set; }
    public required string Prefix { get; set; }
    public string Separator { get; set; } = "-";
    public int DigitPadding { get; set; } = 4;
    public ResetCadence ResetCadence { get; set; } = ResetCadence.Monthly;
    public DateOnly EffectiveFrom { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public UserRole? CreatedByRole { get; set; }
}
