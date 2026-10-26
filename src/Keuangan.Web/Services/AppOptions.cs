namespace Keuangan.Web.Services;

// Opsi konfigurasi via appsettings.json section "AppSettings" - port pola
// sederhana dari DataMaster.Web (AppOptions.cs).
public class AppOptions
{
    // Alamat API Webview-App di VPS (v0.2.0) - dipakai kalau WebviewApiUrl kosong,
    // supaya instalasi Keuangan otomatis "menembak" VPS meminta izin Admin IT tanpa
    // perlu diketik manual. Harus sama dengan default di Launcher (SetupWizardWindow).
    public const string DefaultWebviewApiUrl = "https://app.yayasanalikhlas86.sch.id/mobile-api";

    public string? WebviewApiUrl { get; set; }

    // Nama instalasi yang dikirim saat minta izin (tampil di panel Admin IT).
    // Kosong = pakai nama PC.
    public string? InstallationLabel { get; set; }

    // Mode instalasi dari wizard Launcher (server | klien | developer), diteruskan
    // lewat AppSettings__Mode.
    public string? Mode { get; set; }

    // Sambungan ke VPS (tarik siswa/pegawai DAN kirim data keuangan). Kosong =
    // otomatis: AKTIF untuk instalasi sungguhan, MATI TOTAL untuk mode
    // "developer" (sandbox: tidak menarik, tidak mengirim, tidak mendaftar ke
    // Admin IT). Isi true/false untuk memaksa.
    public bool? SyncEnabled { get; set; }

    public bool IsDeveloperMode => string.Equals(Mode, "developer", StringComparison.OrdinalIgnoreCase);

    public bool EffectiveSyncEnabled => SyncEnabled ?? !IsDeveloperMode;

    // Instalasi lama menyimpan alamat domain lama (duckdns) di pengaturannya; domain resmi pindah ke sch.id
    // (2026-10-26). Diganti otomatis di sini supaya semua PC ikut pindah tanpa edit manual.
    public string EffectiveWebviewApiUrl =>
        string.IsNullOrWhiteSpace(WebviewApiUrl)
            ? DefaultWebviewApiUrl
            : WebviewApiUrl.Trim().TrimEnd('/').Replace("alikhlas86.duckdns.org", "app.yayasanalikhlas86.sch.id", StringComparison.OrdinalIgnoreCase);

    public string EffectiveInstallationLabel =>
        string.IsNullOrWhiteSpace(InstallationLabel) ? Environment.MachineName : InstallationLabel.Trim();
}
