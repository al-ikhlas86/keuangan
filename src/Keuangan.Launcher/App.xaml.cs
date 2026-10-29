using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Windows;
using System.Windows.Threading;

namespace Keuangan.Launcher;

/// <summary>
/// Interaction logic for App.xaml
/// </summary>
public partial class App : Application
{
    // Port pola PERSIS DataMaster.Launcher/App.xaml.cs - lihat komentar
    // lengkap di sana. Update dicek SEDINI mungkin (sebelum wizard pun
    // sempat tampil), exception tak tertangani dicatat ke log (bukan cuma
    // mati diam-diam).
    // Mutex satu-instance: dipegang selama proses hidup (sengaja disimpan di field statis supaya tidak dibuang oleh GC).
    private static Mutex? _kunciSatuInstance;

    // Hanya SATU Launcher per folder instalasi (port dari DataMaster.Launcher, kejadian 2026-10-29: dua Launcher berjalan bersamaan,
    // masing-masing mengunduh update lalu saling mengunci berkas, penyalinan gagal dan siklus update berputar tanpa henti). Instance yang
    // dibuka ulang oleh proses lama (restart setelah update / ganti jaringan) menunggu sebentar sampai proses lama selesai keluar.
    private static bool AmbilKunciSatuInstance()
    {
        var folder = AppContext.BaseDirectory.TrimEnd('\\', '/').ToLowerInvariant();
        var nama = "Keuangan.Launcher." + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(folder)))[..16];
        var mutex = new Mutex(false, @"Local\" + nama);
        bool dapat;
        try { dapat = mutex.WaitOne(TimeSpan.FromSeconds(8)); }
        catch (AbandonedMutexException) { dapat = true; } // proses sebelumnya mati mendadak: kunci tetap sah diambil alih
        if (!dapat)
        {
            mutex.Dispose();
            return false;
        }
        _kunciSatuInstance = mutex;
        return true;
    }

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        if (!AmbilKunciSatuInstance())
        {
            MessageBox.Show("Keuangan sudah terbuka atau sedang memperbarui diri.\n\nTunggu sampai selesai (jangan buka lagi), atau cek jendela Keuangan yang sudah ada di taskbar.",
                "Keuangan", MessageBoxButton.OK, MessageBoxImage.Information);
            Shutdown();
            return;
        }
        // Dibuka ulang oleh helper karena penyalinan update gagal: jangan langsung mengunduh lagi di sesi ini.
        if (e.Args.Contains("--update-gagal")) UpdateChecker.LewatiSesiIni = true;

        try
        {
            var logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Keuangan", "logs");
            LogCleanup.RotasiLogLama(logDir);
        }
        catch { /* non-fatal */ }

        DispatcherUnhandledException += (_, args) =>
        {
            CatatErrorFatal(args.Exception);
            MessageBox.Show($"Terjadi kesalahan tak terduga:\n\n{args.Exception.Message}\n\nRincian lengkap dicatat di %LocalAppData%\\Keuangan\\logs.",
                "Keuangan - Kesalahan", MessageBoxButton.OK, MessageBoxImage.Error);
            args.Handled = true;
        };

        var splash = new UpdateSplashWindow();
        splash.Show();
        var updateChecker = new UpdateChecker();
        updateChecker.StatusChanged += status => { if (status is not null) splash.SetStatus(status); };
        updateChecker.ProgressChanged += splash.SetProgress;
        var updateApplied = await updateChecker.CheckAndApplyAsync(new ServerProcessManager(), CancellationToken.None);
        if (updateApplied) return; // Shutdown() sudah dipanggil di dalam - jangan lanjut apapun lagi
        splash.Close();

        // Update otomatis ditahan karena gagal berulang, atau baru saja gagal disalin: beri tahu sekali, aplikasi lama tetap jalan.
        if (UpdateChecker.PesanTahan is { } pesanTahan)
            MessageBox.Show(pesanTahan, "Keuangan - Pembaruan", MessageBoxButton.OK, MessageBoxImage.Warning);
        else if (UpdateChecker.LewatiSesiIni)
            MessageBox.Show("Pembaruan otomatis gagal menimpa berkas (kemungkinan masih terkunci oleh program lain). Keuangan versi sekarang tetap bisa dipakai.\n\nTutup semua jendela Keuangan lalu buka lagi untuk mencoba kembali.\nRincian: %LocalAppData%\\Keuangan\\logs\\update_helper.log",
                "Keuangan - Pembaruan", MessageBoxButton.OK, MessageBoxImage.Warning);

        var config = LauncherConfig.Load();
        if (!config.SetupSelesai)
        {
            var wizard = new SetupWizardWindow(config);
            var selesai = wizard.ShowDialog();
            if (selesai != true)
            {
                Shutdown();
                return;
            }
        }

        var main = new MainWindow();
        MainWindow = main;
        main.Show();
    }

    private static void CatatErrorFatal(Exception ex)
    {
        try
        {
            var logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Keuangan", "logs");
            Directory.CreateDirectory(logDir);
            File.AppendAllText(Path.Combine(logDir, $"launcher_{DateTime.Now:yyyy-MM-dd}.log"), $"[{DateTime.Now:O}] {ex}\n\n");
        }
        catch { /* jangan sampai logging error justru melempar error baru */ }
    }
}
