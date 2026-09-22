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

public enum StudentStatus { Aktif, Lulus }

public enum DocType { TRX, PAY, TAG, JE }

public enum ResetCadence { Monthly, Yearly, Never }
