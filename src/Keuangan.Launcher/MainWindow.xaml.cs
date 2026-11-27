using System.Diagnostics;
using System.IO;
using System.Text.Json;
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
        _updateChecker.ProgressChanged += UpdateChecker_ProgressChanged;
        TaskbarItemInfo = new System.Windows.Shell.TaskbarItemInfo();
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        await InisialisasiAsync();
    }

    private async Task InisialisasiAsync()
    {
        SetSplash("Menyiapkan aplikasi...");
        SetSplash(_server.IsKlien ? "Menyambung ke server Keuangan di jaringan..." : "Menyiapkan server lokal...");
        var envDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Keuangan", "webview2-data");
        Directory.CreateDirectory(envDataDir);
        var env = await CoreWebView2Environment.CreateAsync(userDataFolder: envDataDir);
        await Browser.EnsureCoreWebView2Async(env);
        await BersihkanCacheBilaVersiBerubahAsync();
        Browser.CoreWebView2.WebMessageReceived += Browser_WebMessageReceived;
        Browser.CoreWebView2.Settings.IsPasswordAutosaveEnabled = true;
        Browser.CoreWebView2.Settings.IsGeneralAutofillEnabled = true;

        var ok = await _server.StartAsync(CancellationToken.None);
        if (!ok)
        {
            if (_server.IsKlien)
            {
                SetSplash("Gagal menyambung ke server Keuangan.");
                MessageBox.Show(this, "Tidak dapat menyambung ke PC server Keuangan di jaringan. Pastikan PC server sudah menyala (Keuangan di PC server berjalan otomatis sebagai layanan Windows, tidak perlu dibuka), PC ini terhubung ke jaringan yang sama, Firewall PC server mengizinkan port-nya, dan alamat di appsettings.json (KlienServerUrl) masih benar - lalu coba buka ulang aplikasi ini.",
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

        // Aplikasi sudah bisa dipakai: pemeriksaan + unduhan pembaruan berjalan di latar belakang (tidak menghalangi apa pun).
        _ = JalankanPembaruanLatarAsync();
    }

    // ---- pembaruan di latar belakang ----

    private readonly CancellationTokenSource _ctsPembaruan = new();

    // Loop: periksa tiap 6 jam (PC bendahara sering dibiarkan menyala seharian). Bila sudah siap dan pengguna memilih "Nanti", tanya lagi 3 jam kemudian.
    private async Task JalankanPembaruanLatarAsync()
    {
        var ct = _ctsPembaruan.Token;
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(15), ct); // beri waktu aplikasi tampil dulu
            while (!ct.IsCancellationRequested)
            {
                var siap = await _updateChecker.PeriksaDanSiapkanAsync(ct);
                if (siap is not null && await TanyaRestartAsync(siap)) return; // diterapkan: aplikasi menutup diri
                await Task.Delay(TimeSpan.FromHours(siap is null ? 6 : 3), ct);
            }
        }
        catch (OperationCanceledException) { /* aplikasi ditutup */ }
    }

    /// <summary>
    /// Notifikasi pembaruan siap di pojok kanan bawah (jendela terpisah, tidak merebut fokus, tidak mengunci layar). Mode otomatis (pengaturan PC ini, bawaan mati):
    /// hitung mundur lalu mulai ulang sendiri. true = penerapan dimulai.
    /// </summary>
    private async Task<bool> TanyaRestartAsync(string versi)
    {
        var selesai = new TaskCompletionSource<bool>();
        await Dispatcher.InvokeAsync(() =>
        {
            var notif = new NotifUpdateWindow("Keuangan", versi.Split('.').Length >= 3 ? string.Join('.', versi.Split('.').Take(3)) : versi,
                PengaturanUpdateLokal.AutoRestart, WindowsServiceHelper.IsInstalled()) { Owner = this };
            notif.MulaiUlang += () => selesai.TrySetResult(UpdateChecker.TerapkanSekarang(_server));
            notif.Nanti += () => selesai.TrySetResult(false);
            notif.Show();
        });
        return await selesai.Task;
    }

    // ---- jembatan pengaturan dengan halaman Pengaturan (WebView2) ----

    private void Browser_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            // Hanya dari halaman aplikasi sendiri (server lokal atau server jaringan yang dipilih).
            if (!Uri.TryCreate(e.Source, UriKind.Absolute, out var sumber) || !Uri.TryCreate(_server.BaseUrl, UriKind.Absolute, out var basis)
                || sumber.Host != basis.Host || sumber.Port != basis.Port) return;
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var tipe = doc.RootElement.TryGetProperty("type", out var t) ? t.GetString() : null;
            switch (tipe)
            {
                case "update-ambil":
                    KirimStatusUpdate();
                    break;
                case "update-simpan":
                    PengaturanUpdateLokal.Simpan(doc.RootElement.TryGetProperty("autoRestart", out var a) && a.ValueKind == JsonValueKind.True);
                    KirimStatusUpdate();
                    break;
                case "update-mulai-ulang":
                    if (UpdateChecker.VersiSiap() is not null) UpdateChecker.TerapkanSekarang(_server);
                    break;
            }
        }
        catch { /* pesan rusak diabaikan */ }
    }

    private void KirimStatusUpdate()
    {
        var isi = JsonSerializer.Serialize(new { type = "update-status", autoRestart = PengaturanUpdateLokal.AutoRestart, versiSiap = UpdateChecker.VersiSiap() });
        Browser.CoreWebView2.PostWebMessageAsJson(isi);
    }

    // WebView2 menyimpan index.html di cache disk; tanpa dibersihkan, tampilan versi lama bisa tetap tampil sesudah update (kejadian 2026-11-27: sidebar
    // masih v0.10.3). Dibersihkan SEKALI tiap versi aplikasi berubah; sesi login tidak disentuh (hanya cache).
    private async Task BersihkanCacheBilaVersiBerubahAsync()
    {
        try
        {
            var versi = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "?";
            var berkas = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Keuangan", "versi_terakhir.txt");
            var lama = File.Exists(berkas) ? File.ReadAllText(berkas).Trim() : "";
            if (lama == versi) return;
            await Browser.CoreWebView2.Profile.ClearBrowsingDataAsync(Microsoft.Web.WebView2.Core.CoreWebView2BrowsingDataKinds.DiskCache | Microsoft.Web.WebView2.Core.CoreWebView2BrowsingDataKinds.CacheStorage);
            File.WriteAllText(berkas, versi);
        }
        catch { /* membersihkan cache tidak boleh menghalangi aplikasi terbuka */ }
    }

    // Kemajuan unduhan hanya di judul jendela + bilah tugas (BUKAN overlay: WebView2 menutupi elemen WPF di atasnya, dan layar penuh menghalangi pekerjaan).
    private void UpdateChecker_StatusChanged(string? status)
    {
        Dispatcher.BeginInvoke(() =>
        {
            Title = status is null ? "Keuangan" : $"Keuangan - {status}";
            if (status is null) TaskbarItemInfo.ProgressState = System.Windows.Shell.TaskbarItemProgressState.None;
        });
    }

    private void UpdateChecker_ProgressChanged(double? persen)
    {
        Dispatcher.BeginInvoke(() =>
        {
            if (persen is null) { TaskbarItemInfo.ProgressState = System.Windows.Shell.TaskbarItemProgressState.Indeterminate; return; }
            TaskbarItemInfo.ProgressState = System.Windows.Shell.TaskbarItemProgressState.Normal;
            TaskbarItemInfo.ProgressValue = Math.Clamp(persen.Value / 100.0, 0, 1);
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
        _ctsPembaruan.Cancel();
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
