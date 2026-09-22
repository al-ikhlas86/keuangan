namespace Keuangan.Web.Services;

// Opsi konfigurasi via appsettings.json section "AppSettings" - port pola
// sederhana dari DataMaster.Web (AppOptions.cs), TIDAK ada logic
// migrasi-URL-lama di sini krn Keuangan baru dibuat hari ini (belum ada
// instalasi lama yg perlu di-migrasi).
public class AppOptions
{
    public string? WebviewApiUrl { get; set; }
}
