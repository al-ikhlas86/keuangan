namespace Keuangan.Data.Entities;

// Pegawai/guru - identitas DITARIK (pull) dari Webview-App backend
// (employees_cache <- Data Master), SAMA persis semangat Student: Keuangan
// TIDAK punya input manual pegawai. Yang ditambahkan Keuangan di atasnya
// (fase berikutnya): komponen gaji, slip gaji, dst. Sengaja HANYA identitas
// minimal - backend tidak mengirim no HP maupun data pribadi lain.
//
// HubId = kolom `hub_id` di employees_cache (ID GLOBAL dari Hub API) - kunci
// pencocokan sinkronisasi. Pegawai yang hilang dari data sumber TIDAK
// dihapus, cuma ditandai Nonaktif (riwayat slip gaji harus tetap ada).
public class Employee
{
    public int Id { get; set; }

    public int HubId { get; set; }
    public required string Name { get; set; }
    public string? Nip { get; set; }
    public string? Jabatan { get; set; }
    public bool IsKepalaSekolah { get; set; }
    public EmployeeStatus Status { get; set; } = EmployeeStatus.Aktif;
    public string? StatusKeluar { get; set; } // alasan keluar dari Data Master, kalau ada
    public string? Katalog { get; set; }      // kode katalog sumber ("SD"/"TK")
    public DateTime? SyncedAt { get; set; }

    // --- Field KHUSUS Keuangan (tidak ada di Data Master, diisi admin keuangan di halaman detail
    //     pegawai - dipakai penggajian: Tipe mengelompokkan Tetap/Honor, Pendidikan menentukan tarif
    //     komponen per jenjang) ---
    public string Tipe { get; set; } = "Tetap";   // Tetap | Honorer | Kontrak
    public string? Pendidikan { get; set; }        // SMA | D3 | S1 | S2 | S3

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
