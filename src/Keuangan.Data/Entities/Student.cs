namespace Keuangan.Data.Entities;

// REVISI (2026-09-22, koreksi arsitektur dari user setelah scaffold pertama
// di-push) - BEDA dari Akuntansi lama (yang murni sumber kebenaran sendiri
// tanpa sinkronisasi eksternal): identitas siswa di Keuangan SEKARANG
// DITARIK (pull) dari Webview-App backend (yang sendiri sudah tersinkron
// dari Hub API <- DataMaster.exe, lihat students_cache di
// D:\Webview-App\backend\db\schema.sql) - BUKAN dientri manual terpisah.
// Alasan (arahan user): "data di keuangan sama persis dengan data master,
// baru deh keuangan tinggal tambahin rincian2 biaya dll" - jadi identitas
// (nama/NIS/kelas) SELALU ikut sumber sekolah, Keuangan cuma menambahkan
// data KHUSUS keuangan (nomor rekening, tarif, VA) di atasnya.
//
// HubId = kolom `hub_id` di students_cache webview-app (ID GLOBAL dari Hub
// API, unik lintas semua unit sekolah) - kunci pencocokan sinkronisasi,
// port konsep sama persis pola *_source_id di DataMaster.exe. SyncedAt
// dicatat tiap kali KeuanganSyncService berhasil tarik ulang baris ini
// (lihat Fase Sinkronisasi di plan) - dipakai UI utk tampilkan "data
// terakhir sinkron kapan" per siswa, jujur kalau ada yg sempat basi.
public class Student
{
    public int Id { get; set; }
    public required string StudentCode { get; set; } // auto "STD-..." - nomor internal Keuangan sendiri, BEDA dari NIS

    public int HubId { get; set; } // hub_id dari students_cache - identitas SUMBER, wajib ada
    public required string Nis { get; set; }
    public required string Name { get; set; }
    public string? ClassName { get; set; }
    public string? Tingkat { get; set; }
    public StudentStatus Status { get; set; } = StudentStatus.Aktif;
    public DateTime? SyncedAt { get; set; } // null = belum pernah berhasil sinkron ulang sejak dibuat

    // --- Field KHUSUS Keuangan (TIDAK ada di students_cache, ditambahkan
    //     lokal di sini - inilah "rincian yang ditambahkan Keuangan" yg
    //     dimaksud user) ---
    public string? BankAccountNo { get; set; }

    // Legacy - dipertahankan utk kompatibilitas data lama, FeeTypeRate per
    // angkatan yang jadi sumber kebenaran baru (lihat FeeType.UsesAngkatanRate).
    public decimal MonthlyFee { get; set; }
    public decimal SemesterTotal { get; set; }

    public string? Angkatan { get; set; } // tahun ajaran masuk, dipakai resolusi tarif
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
