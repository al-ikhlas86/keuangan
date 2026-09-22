using System.IO;
using System.Text.Json;

namespace Keuangan.Launcher;

// Konfigurasi per-PC - file JSON terpisah di sebelah .exe, port pola PERSIS
// DataMaster.Launcher/LauncherConfig.cs. 3 mode (lihat plan file
// soft-dreaming-shannon.md, BEDA dari DataMaster yang cuma py
// mandiri/server/klien):
//   "developer" (default) - TIDAK perlu login, dropdown role bebas (lihat
//                            DeveloperModeMiddleware.cs di Keuangan.Web) -
//                            dipakai developer/IT internal, BUKAN pemakaian
//                            sungguhan sekolah.
//   "server"              - database SQLite sungguhan ADA di PC ini,
//                            Kestrel dengar 0.0.0.0:ServerPort, boleh
//                            dipasang sbg Windows Service (WindowsServiceHelper.cs).
//                            Wajib login sungguhan (lihat AuthEndpoints.cs).
//   "klien"                - TIDAK py database/server sendiri, jendela
//                            langsung menampilkan PC Server lewat KlienServerUrl.
public sealed class LauncherConfig
{
    public string Mode { get; set; } = "developer";

    // Wajib diisi kalau Mode="klien" - alamat PC "server" di jaringan lokal,
    // mis. "http://NAMA-PC-SERVER:5251".
    public string? KlienServerUrl { get; set; }

    // Dipakai kalau Mode="server" - port TETAP (beda dari default DataMaster
    // 5250 supaya kedua app bisa jalan bersamaan di 1 PC tanpa bentrok port
    // kalau suatu saat perlu).
    public int ServerPort { get; set; } = 5251;

    // Dipakai kalau Mode="server" - alamat Webview-App backend utk
    // KeuanganSyncService pull identitas siswa (AppSettings:WebviewApiUrl,
    // lihat AppOptions.cs/KeuanganSyncService.cs). Kosong = sync dilewati
    // (fitur opsional, boleh diisi belakangan lewat "Ganti Pengaturan Jaringan").
    public string? WebviewApiUrl { get; set; }

    // false = SetupWizardWindow WAJIB ditampilkan sebelum MainWindow - lihat
    // App.xaml.cs. Di-set true otomatis begitu wizard pertama kali selesai.
    public bool SetupSelesai { get; set; }

    private static string ConfigPath => Path.Combine(AppContext.BaseDirectory, "appsettings.json");

    public static LauncherConfig Load()
    {
        try
        {
            if (!File.Exists(ConfigPath))
            {
                var fresh = new LauncherConfig();
                Save(fresh);
                return fresh;
            }

            var json = File.ReadAllText(ConfigPath);
            return JsonSerializer.Deserialize<LauncherConfig>(json) ?? new LauncherConfig();
        }
        catch
        {
            return new LauncherConfig();
        }
    }

    public void SaveKe() => Save(this);

    private static void Save(LauncherConfig config)
    {
        try
        {
            var json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(ConfigPath, json);
        }
        catch { /* non-fatal - cek update murni fitur pendukung */ }
    }
}
