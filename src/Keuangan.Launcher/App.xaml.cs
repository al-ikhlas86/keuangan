using System.IO;
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
    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

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
        var updateApplied = await updateChecker.CheckAndApplyAsync(new ServerProcessManager(), CancellationToken.None);
        if (updateApplied) return; // Shutdown() sudah dipanggil di dalam - jangan lanjut apapun lagi
        splash.Close();

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
