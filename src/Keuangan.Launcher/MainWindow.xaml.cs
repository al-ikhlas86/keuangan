using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;

namespace Keuangan.Launcher;

/// <summary>
/// Interaction logic for MainWindow.xaml
/// </summary>
public partial class MainWindow : Window
{
    private readonly ServerProcessManager _server = new();
    private readonly UpdateChecker _updateChecker = new();
    private bool _closingIntentionally;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += MainWindow_Loaded;
        Closing += MainWindow_Closing;
        _server.ServerExitedUnexpectedly += Server_ExitedUnexpectedly;
        _updateChecker.StatusChanged += UpdateChecker_StatusChanged;
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        await InisialisasiAsync();
    }

    private async Task InisialisasiAsync()
    {
        SetSplash("Memeriksa pembaruan...");
        // Tidak memblokir start server - lihat App.xaml.cs, cek update UTAMA
        // sudah dijalankan SEBELUM MainWindow ini pernah ada. Panggilan kedua
        // di sini (biasanya no-op instan krn baru saja dicek) jaga-jaga kalau
        // MainWindow di-restart manual (mis. tombol Ganti Pengaturan Jaringan)
        // tanpa app.xaml.cs OnStartup terpanggil lagi.
        _ = _updateChecker.CheckAndApplyAsync(_server, CancellationToken.None);

        SetSplash(_server.IsKlien ? "Menyambung ke server Keuangan di jaringan..." : "Menyiapkan server lokal...");
        var envDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Keuangan", "webview2-data");
        Directory.CreateDirectory(envDataDir);
        var env = await CoreWebView2Environment.CreateAsync(userDataFolder: envDataDir);
        await Browser.EnsureCoreWebView2Async(env);
        Browser.CoreWebView2.Settings.IsPasswordAutosaveEnabled = true;
        Browser.CoreWebView2.Settings.IsGeneralAutofillEnabled = true;

        var ok = await _server.StartAsync(CancellationToken.None);
        if (!ok)
        {
            if (_server.IsKlien)
            {
                SetSplash("Gagal menyambung ke server Keuangan.");
                MessageBox.Show(this, "Tidak dapat menyambung ke PC server Keuangan di jaringan. Pastikan PC server sudah menyala & aplikasi Keuangan-nya sudah terbuka, PC ini terhubung ke jaringan yang sama, dan alamat di appsettings.json (KlienServerUrl) masih benar - lalu coba buka ulang aplikasi ini.",
                    "Keuangan - Gagal Menyambung", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            else
            {
                SetSplash("Gagal menyalakan server lokal. Cek log di %LocalAppData%\\Keuangan\\logs.");
                MessageBox.Show(this, "Server lokal Keuangan gagal dinyalakan dalam waktu 30 detik. Periksa berkas log di %LocalAppData%\\Keuangan\\logs untuk rinciannya, lalu coba jalankan ulang aplikasi.",
                    "Keuangan - Gagal Start", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            Close();
            return;
        }

        SetSplash("Membuka aplikasi...");
        Browser.CoreWebView2.Navigate(_server.BaseUrl);
        Browser.CoreWebView2.NavigationCompleted += (_, args) =>
        {
            if (args.IsSuccess) TampilkanBrowser();
        };
    }

    private void UpdateChecker_StatusChanged(string? status)
    {
        Dispatcher.Invoke(() =>
        {
            if (status is null)
            {
                if (Browser.Visibility == Visibility.Visible) SplashOverlay.Visibility = Visibility.Collapsed;
                return;
            }
            Browser.Visibility = Visibility.Collapsed;
            SplashOverlay.Visibility = Visibility.Visible;
            SplashStatus.Text = status;
        });
    }

    private void Server_ExitedUnexpectedly()
    {
        Dispatcher.Invoke(async () =>
        {
            if (_closingIntentionally) return;
            Browser.Visibility = Visibility.Collapsed;
            SplashOverlay.Visibility = Visibility.Visible;
            SetSplash("Menerapkan pembaruan data, menyalakan ulang...");

            await Task.Delay(1000);
            var ok = await _server.StartAsync(CancellationToken.None);
            if (!ok)
            {
                SetSplash("Gagal menyalakan ulang server. Silakan tutup dan buka ulang aplikasi.");
                return;
            }
            Browser.CoreWebView2.Navigate(_server.BaseUrl);
        });
    }

    private void TampilkanBrowser()
    {
        SplashOverlay.Visibility = Visibility.Collapsed;
        Browser.Visibility = Visibility.Visible;
    }

    private void SetSplash(string status) => Dispatcher.Invoke(() => SplashStatus.Text = status, DispatcherPriority.Background);

    private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        // Tombol X = keluar SEPENUHNYA di SEMUA mode - lihat komentar panjang
        // MainWindow_Closing DataMaster.Launcher (mode "server" pakai Windows
        // Service beneran di level OS utk tetap nyala walau app ditutup,
        // BUKAN trik minimize-ke-tray).
        _closingIntentionally = true;
        _server.StopIntentionally();
        Application.Current.Shutdown();
    }

    private void BtnGantiJaringan_Click(object sender, RoutedEventArgs e)
    {
        var config = LauncherConfig.Load();
        var wizard = new SetupWizardWindow(config) { Owner = this };
        var selesai = wizard.ShowDialog();
        if (selesai != true) return;

        _closingIntentionally = true;
        _server.StopIntentionally();
        Process.Start(Environment.ProcessPath ?? Process.GetCurrentProcess().MainModule!.FileName!);
        Application.Current.Shutdown();
    }
}
