namespace Keuangan.Web.Services;

// Opsi konfigurasi via appsettings.json section "AppSettings" - port pola
// sederhana dari DataMaster.Web (AppOptions.cs).
public class AppOptions
{
    // Alamat API Webview-App di VPS (v0.2.0) - dipakai kalau WebviewApiUrl kosong,
    // supaya instalasi Keuangan otomatis "menembak" VPS meminta izin Admin IT tanpa
    // perlu diketik manual. Harus sama dengan default di Launcher (SetupWizardWindow).
    public const string DefaultWebviewApiUrl = "https://alikhlas86.duckdns.org/mobile-api";

    public string? WebviewApiUrl { get; set; }

    // Nama instalasi yang dikirim saat minta izin (tampil di panel Admin IT).
    // Kosong = pakai nama PC.
    public string? InstallationLabel { get; set; }

    public string EffectiveWebviewApiUrl =>
        string.IsNullOrWhiteSpace(WebviewApiUrl) ? DefaultWebviewApiUrl : WebviewApiUrl.Trim().TrimEnd('/');

    public string EffectiveInstallationLabel =>
        string.IsNullOrWhiteSpace(InstallationLabel) ? Environment.MachineName : InstallationLabel.Trim();
}
