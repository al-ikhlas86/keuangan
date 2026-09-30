namespace Keuangan.Data;

// Role backend tetap (Fase 1) - port nama dari Akuntansi lama (apps/users/roles.py)
// supaya istilah domain tetap familiar buat staf Keuangan yang sudah biasa pakai
// istilah ini, TAPI sekarang benar-benar terikat ke akun berpassword (lihat
// Entities/User.cs) - bukan lagi dropdown tanpa login spt versi Django/React lama.
public enum UserRole
{
    AdminManager, // "Admin/Supervisor" - akses penuh
    Akuntansi,    // "Akuntansi"
    Staff,        // "Admin Keuangan"
    Kasir,        // "Kasir"
}

public enum AccountType { Asset, Liability, Equity, Income, Expense }

public enum NormalBalance { Debit, Credit }

public enum TxType { Masuk, Keluar }

public enum PaymentMethod { Cash, Transfer, Cek }

// Method KHUSUS Payment (beda dari PaymentMethod transaksi kas) - "Saldo" &
// "Keringanan" BUKAN uang sungguhan yang masuk/keluar kas, sengaja dipisah dari
// TxType/PaymentMethod di atas - lihat catatan panjang di Entities/Payment.cs.
public enum PaymentReceiveMethod { Cash, Transfer, Saldo, Keringanan }

public enum TagihanStatus { BelumDibayar, Sebagian, Lunas }

public enum FeeKategori { Wajib, Opsional }

public enum FeeFrekuensi { Sekali, Bulanan, Cicilan }

// Keluar (2026-09-29) = siswa TIDAK ADA LAGI di data sumber (Data Master) - mis.
// pindah/dihapus. Ditambah di ULANG (bukan menyisip) supaya nilai Aktif/Lulus
// yang sudah tersimpan tetap sama. Baris tidak pernah dihapus (riwayat
// tagihan/pembayaran harus tetap utuh).
public enum StudentStatus { Aktif, Lulus, Keluar }

// Status pegawai di Keuangan - Nonaktif = keluar/dinonaktifkan di Data Master
// atau sudah tidak ada di data sumber (baris tetap ada utk riwayat slip gaji).
public enum EmployeeStatus { Aktif, Nonaktif }

// SLIP (2026-09-30) = nomor slip gaji - ditambah di ULANG supaya nilai enum yang sudah tersimpan tidak bergeser.
public enum DocType { TRX, PAY, TAG, JE, SLIP }

public enum ResetCadence { Monthly, Yearly, Never }
