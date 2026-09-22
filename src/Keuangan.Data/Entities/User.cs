namespace Keuangan.Data.Entities;

// Login per-akun sungguhan (2026-09-22, FITUR BARU - Akuntansi lama/Django+React
// TIDAK punya ini sama sekali, role di sana cuma dropdown client-side tanpa
// password, lihat Context di plan). PasswordHash pakai BCrypt.Net-Next (Keuangan.Data.csproj)
// - konsisten dgn algoritma yg sudah dipakai ekosistem lain (Webview-App backend
// pakai bcryptjs versi Node, sama-sama BCrypt, walau hash-nya sendiri TIDAK
// portable lintas 2 sistem itu - masing2 punya tabel user terpisah).
//
// RecoveryCodeHash - port pola sama persis DataMaster.Data/Entities/User.cs
// (dialami langsung pemilik proyek sesi lain: app desktop mandiri per-PC/LAN
// TIDAK punya infrastruktur kirim OTP email/SMS, jadi kode pemulihan offline
// SEKALI PAKAI yg ditampilkan SEKALI saat dibuat/di-generate ulang, user wajib
// simpan sendiri) - relevan sama persis di Keuangan krn instalasi mode "server"
// juga desktop mandiri, bukan layanan cloud dgn infrastruktur reset password.
public class User
{
    public int Id { get; set; }
    public required string Username { get; set; }
    public required string FullName { get; set; }
    public required string PasswordHash { get; set; }
    public UserRole Role { get; set; }
    public bool IsActive { get; set; } = true;
    public string? RecoveryCodeHash { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}
