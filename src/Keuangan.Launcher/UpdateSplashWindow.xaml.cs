using System.Windows;

namespace Keuangan.Launcher;

/// <summary>
/// Splash kecil berdiri sendiri - dipakai HANYA selama App.xaml.cs mengecek
/// update di awal SEKALI, SEBELUM wizard/MainWindow pernah ada.
/// </summary>
public partial class UpdateSplashWindow : Window
{
    public UpdateSplashWindow()
    {
        InitializeComponent();
    }

    public void SetStatus(string status) => Dispatcher.Invoke(() => TxtStatus.Text = status);
}
