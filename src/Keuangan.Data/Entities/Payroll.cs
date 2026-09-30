namespace Keuangan.Data.Entities;

// Penggajian pegawai (2026-09-30) - port dari Akuntansi lama (apps/finance/models.py
// Payroll*/SalarySlip/PayslipTemplate*). Identitas pegawai (Employee) datang dari Data Master
// (read-only); yang dikelola Keuangan di sini: komponen gaji, isian gaji per periode, pembayaran
// (jadi transaksi kas + jurnal), nomor slip, dan template tampilan slip.
//
// SENGAJA memakai STRING (bukan enum C#) utk kolom kategori/mode/bagian slip, dgn nilai persis
// sama seperti Akuntansi ("EARNING", "AUTO_HARI", "TIDAK_TETAP", dst) - frontend hasil port
// membandingkan literal yang sama, tanpa lapisan pemetaan enum. Divalidasi di PayrollEndpoints.
public static class PayrollValues
{
    public static readonly string[] Categories = ["EARNING", "DEDUCTION"];
    public static readonly string[] CalcModes = ["MANUAL", "AUTO_HARI", "AUTO_OWN"];
    public static readonly string[] SlipSections = ["TETAP", "TIDAK_TETAP"];
    public static readonly string[] EditRoles = ["ALL", "SUPERVISOR"];
    public static readonly string[] Kelompok = ["", "PAJAK", "BPJS_TK", "BPJS_K"];
    public static readonly string[] ListKelompok = ["", "REGULAR", "PAJAK_BPJS", "PAJAK", "BPJS_TK", "BPJS_K"];
    public static readonly string[] RowTypes = ["HEADING", "COMPONENT_LIST", "DATA", "TOTAL"];
    public static readonly string[] EducationLevels = ["SMA", "D3", "S1", "S2", "S3"];
    public static readonly string[] EmployeeTypes = ["Tetap", "Honorer", "Kontrak"];
}

public class PayrollComponentGroup
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public string Category { get; set; } = "EARNING";
    public int Urutan { get; set; }
    public bool IsActive { get; set; } = true;
}

public class PayrollComponentType
{
    public int Id { get; set; }
    public required string Code { get; set; }
    public required string Name { get; set; }
    public string Category { get; set; } = "EARNING";

    public int? GroupId { get; set; }
    public PayrollComponentGroup? Group { get; set; }

    public string CalcMode { get; set; } = "MANUAL";   // MANUAL | AUTO_HARI (hari masuk x tarif) | AUTO_OWN (qty sendiri x tarif)
    public string QtyLabel { get; set; } = "";
    public decimal DefaultRate { get; set; }
    public string ShortLabel { get; set; } = "";
    public string SlipSection { get; set; } = "TIDAK_TETAP";
    public string EditRole { get; set; } = "ALL";      // SUPERVISOR = hanya AdminManager yg boleh mengisi
    public string KelompokPajakBpjs { get; set; } = ""; // "", PAJAK, BPJS_TK, BPJS_K
    public int Urutan { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<PayrollComponentRate> Rates { get; set; } = new List<PayrollComponentRate>();
}

// Tarif komponen per jenjang pendidikan pegawai (mis. Kelebihan Jam Mengajar S1 vs S2).
public class PayrollComponentRate
{
    public int Id { get; set; }
    public int ComponentTypeId { get; set; }
    public PayrollComponentType ComponentType { get; set; } = null!;
    public required string EducationLevel { get; set; }
    public decimal Rate { get; set; }
}

public class PayrollPeriod
{
    public int Id { get; set; }
    public required string PeriodKey { get; set; } // "YYYY-MM"
    public string Status { get; set; } = "DRAFT";  // DRAFT | PAID
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class PayrollItem
{
    public int Id { get; set; }
    public int PayrollPeriodId { get; set; }
    public PayrollPeriod PayrollPeriod { get; set; } = null!;
    public int EmployeeId { get; set; }
    public Employee Employee { get; set; } = null!;

    // Terisi = gaji sudah dibayar (transaksi kas + jurnal sudah dibuat) -> item terkunci.
    public int? TransactionId { get; set; }
    public FinancialTransaction? Transaction { get; set; }

    public int? HariMasuk { get; set; }
    public string Keterangan { get; set; } = "";
    // Hanya boleh diisi AdminManager (Supervisor) - disimpan utk keperluan Pajak; belum dipakai rumus mana pun.
    public decimal? BiayaJabatan { get; set; }
    public decimal? PtkpWajibPajak { get; set; }
    public decimal? PajakDitanggungPemerintah { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<PayrollItemLine> Lines { get; set; } = new List<PayrollItemLine>();
    public SalarySlip? Slip { get; set; }
}

public class PayrollItemLine
{
    public int Id { get; set; }
    public int PayrollItemId { get; set; }
    public PayrollItem PayrollItem { get; set; } = null!;
    public int ComponentTypeId { get; set; }
    public PayrollComponentType ComponentType { get; set; } = null!;
    public decimal Amount { get; set; }
    public decimal? Quantity { get; set; }
    public bool IsManualOverride { get; set; }
}

// Nomor slip resmi - 1:1 dgn PayrollItem; cetak pertama menerbitkan nomor, cetak ulang memakai nomor yang sama.
public class SalarySlip
{
    public int Id { get; set; }
    public int PayrollItemId { get; set; }
    public PayrollItem PayrollItem { get; set; } = null!;
    public required string SlipNo { get; set; }
    public DateTime IssuedAt { get; set; } = DateTime.UtcNow;
}

// Template TAMPILAN slip (menu Kelola Slip Gaji). Hanya mengatur tata letak - nominal yang dibayar
// SELALU dihitung dari PayrollItemLine, template tidak pernah menyentuhnya.
public class PayslipTemplateLine
{
    public int Id { get; set; }
    public string RowType { get; set; } = "HEADING"; // HEADING | COMPONENT_LIST | DATA | TOTAL
    public string Label { get; set; } = "";
    public int Urutan { get; set; }
    public bool Bold { get; set; }
    public bool Indent { get; set; }
    public string ListCategory { get; set; } = "";
    public string ListSlipSection { get; set; } = "";
    public string ListKelompokPajakBpjs { get; set; } = "";
    public bool IsActive { get; set; } = true;

    public ICollection<PayslipTemplateComponentBinding> ComponentBindings { get; set; } = new List<PayslipTemplateComponentBinding>();
    public ICollection<PayslipTemplateSumBinding> SumBindings { get; set; } = new List<PayslipTemplateSumBinding>();
}

// Baris DATA menjumlah komponen tertentu (1 komponen hanya boleh di 1 baris DATA aktif).
public class PayslipTemplateComponentBinding
{
    public int Id { get; set; }
    public int LineId { get; set; }
    public PayslipTemplateLine Line { get; set; } = null!;
    public int ComponentTypeId { get; set; }
    public PayrollComponentType ComponentType { get; set; } = null!;
}

// Baris TOTAL menjumlah baris lain di atasnya dengan tanda +1 / -1.
public class PayslipTemplateSumBinding
{
    public int Id { get; set; }
    public int LineId { get; set; }
    public PayslipTemplateLine Line { get; set; } = null!;
    public int SourceLineId { get; set; }
    public PayslipTemplateLine SourceLine { get; set; } = null!;
    public int Sign { get; set; } = 1;
}
