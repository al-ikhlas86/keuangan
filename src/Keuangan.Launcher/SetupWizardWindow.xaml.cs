using System.Windows;

namespace Keuangan.Launcher;

/// <summary>
/// Ditampilkan SEKALI saja sebelum MainWindow, hanya kalau LauncherConfig.SetupSelesai
/// masih false - port pola PERSIS SetupWizardWindow DataMaster.Launcher, dgn
/// 3 radio (Developer/Server/Klien, bukan Mandiri/Server/Klien - lihat
/// LauncherConfig.cs) + 1 field tambahan khusus Server (WebviewApiUrl).
/// </summary>
public partial class SetupWizardWindow : Window
{
    private readonly LauncherConfig _config;

    public SetupWizardWindow(LauncherConfig config)
    {
        InitializeComponent();
        _config = config;
        TxtNamaPcServer.Text = Environment.MachineName;

        TxtServerPort.Text = config.ServerPort.ToString();
        TxtWebviewApiUrl.Text = config.WebviewApiUrl ?? "";
        if (config.Mode == "server") RbServer.IsChecked = true;
        else if (config.Mode == "klien")
        {
            RbKlien.IsChecked = true;
            if (!string.IsNullOrWhiteSpace(config.KlienServerUrl)) TxtKlienUrl.Text = config.KlienServerUrl;
        }
        else RbDeveloper.IsChecked = true;
    }

    private void ModePilihan_Changed(object sender, RoutedEventArgs e)
    {
        if (PanelServer is null || PanelKlien is null || BorderDetail is null) return;

        PanelServer.Visibility = RbServer.IsChecked == true ? Visibility.Visible : Visibility.Collapsed;
        PanelKlien.Visibility = RbKlien.IsChecked == true ? Visibility.Visible : Visibility.Collapsed;
        BorderDetail.Visibility = (RbServer.IsChecked == true || RbKlien.IsChecked == true) ? Visibility.Visible : Visibility.Collapsed;
        TxtError.Visibility = Visibility.Collapsed;
    }

    private void BtnLanjut_Click(object sender, RoutedEventArgs e)
    {
        if (RbServer.IsChecked == true)
        {
            if (!int.TryParse(TxtServerPort.Text.Trim(), out var port) || port is < 1 or > 65535)
            {
                TampilkanError("Port harus angka 1-65535.");
                return;
            }
            _config.Mode = "server";
            _config.ServerPort = port;
            _config.KlienServerUrl = null;
            var webviewUrl = TxtWebviewApiUrl.Text.Trim();
            _config.WebviewApiUrl = webviewUrl.Length > 0 ? webviewUrl.TrimEnd('/') : null;
        }
        else if (RbKlien.IsChecked == true)
        {
            var url = TxtKlienUrl.Text.Trim();
            if (url == "" || !(url.StartsWith("http://") || url.StartsWith("https://")))
            {
                TampilkanError("Alamat PC server harus diawali http:// atau https://, contoh: http://NAMA-PC-SERVER:5251");
                return;
            }
            _config.Mode = "klien";
            _config.KlienServerUrl = url.TrimEnd('/');
        }
        else
        {
            _config.Mode = "developer";
            _config.KlienServerUrl = null;
        }

        _config.SetupSelesai = true;
        _config.SaveKe();

        DialogResult = true;
        Close();
    }

    private void TampilkanError(string pesan)
    {
        TxtError.Text = pesan;
        TxtError.Visibility = Visibility.Visible;
    }

    private void BtnSalinAlamat_Click(object sender, RoutedEventArgs e)
    {
        var port = TxtServerPort.Text.Trim();
        if (port == "") port = "5251";
        Clipboard.SetText($"http://{TxtNamaPcServer.Text}:{port}");
        TxtSalinSukses.Visibility = Visibility.Visible;
    }
}
