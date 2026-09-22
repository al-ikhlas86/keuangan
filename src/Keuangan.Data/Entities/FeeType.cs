namespace Keuangan.Data.Entities;

// Port dari Akuntansi (apps/masterdata/models.py FeeType + FeeTypeRate +
// StudentFeeSubscription) - jenis pembayaran (SPP, Uang Pangkal, dll), kaya
// aturan penagihan.
public class FeeType
{
    public int Id { get; set; }
    public required string FeeCode { get; set; } // auto "FEE-..."
    public required string Name { get; set; }
    public string? Description { get; set; }
    public decimal DefaultAmount { get; set; }

    public FeeKategori Kategori { get; set; } = FeeKategori.Opsional;
    public FeeFrekuensi Frekuensi { get; set; } = FeeFrekuensi.Sekali;
    public bool AutoTagihSaatDaftar { get; set; }

    // Kalau true, generator tagihan cari tarif di FeeTypeRate berdasarkan
    // Student.Angkatan, bukan DefaultAmount. Hanya berlaku Wajib+Bulanan.
    public bool UsesAngkatanRate { get; set; }

    public int CicilanJumlahBulanDefault { get; set; } = 1;
    public decimal CicilanMinimalPerBulan { get; set; }

    // Urutan alokasi pembayaran otomatis (waterfall) - makin kecil makin
    // diprioritaskan.
    public int Prioritas { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<FeeTypeRate> Rates { get; set; } = new List<FeeTypeRate>();
    public ICollection<StudentFeeSubscription> Subscriptions { get; set; } = new List<StudentFeeSubscription>();
}

// Tarif per angkatan, versi-berjalan - baris lama tidak pernah diedit, baris
// baru ditambah utk kebijakan baru (mis. SPP angkatan 2027 naik, angkatan lama
// tetap tarif lama).
public class FeeTypeRate
{
    public int Id { get; set; }

    public int FeeTypeId { get; set; }
    public FeeType FeeType { get; set; } = null!;

    public required string Angkatan { get; set; }
    public DateOnly BerlakuMulai { get; set; }
    public decimal Nominal { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// Status langganan FeeType OPSIONAL per siswa + override nominal.
public class StudentFeeSubscription
{
    public int Id { get; set; }

    public int StudentId { get; set; }
    public Student Student { get; set; } = null!;

    public int FeeTypeId { get; set; }
    public FeeType FeeType { get; set; } = null!;

    public bool IsActive { get; set; } = true;
    public decimal? OverrideAmount { get; set; } // menang di atas tarif angkatan/default
}
