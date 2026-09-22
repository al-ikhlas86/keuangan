namespace Keuangan.Data.Entities;

// Port dari Akuntansi (apps/masterdata/models.py Student + StudentVirtualAccount).
// SENGAJA TANPA field sinkronisasi eksternal (external_id dkk) - Akuntansi lama
// juga tidak punya, sistem ini sumber kebenaran sendiri utk data siswa, BUKAN
// mirror dari DataMaster/Hub API (data siswa utk keuangan boleh berbeda cakupan
// dari data siswa akademik - lihat diskusi sinkronisasi di plan).
public class Student
{
    public int Id { get; set; }
    public required string StudentCode { get; set; } // auto "STD-..."
    public required string Nis { get; set; }
    public required string Name { get; set; }
    public string? ClassName { get; set; }
    public string? BankAccountNo { get; set; }

    // Legacy - dipertahankan utk kompatibilitas data lama, FeeTypeRate per
    // angkatan yang jadi sumber kebenaran baru (lihat FeeType.UsesAngkatanRate).
    public decimal MonthlyFee { get; set; }
    public decimal SemesterTotal { get; set; }

    public string? Angkatan { get; set; } // tahun ajaran masuk, dipakai resolusi tarif
    public bool IsActive { get; set; } = true;
    public StudentStatus Status { get; set; } = StudentStatus.Aktif;
    public string? VaNumber { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<StudentVirtualAccount> VirtualAccounts { get; set; } = new List<StudentVirtualAccount>();
    public ICollection<StudentFeeSubscription> FeeSubscriptions { get; set; } = new List<StudentFeeSubscription>();
    public ICollection<Tagihan> TagihanList { get; set; } = new List<Tagihan>();
}

public class StudentVirtualAccount
{
    public int Id { get; set; }

    public int StudentId { get; set; }
    public Student Student { get; set; } = null!;

    public required string VaNumber { get; set; }
    public string Label { get; set; } = "Utama";
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
