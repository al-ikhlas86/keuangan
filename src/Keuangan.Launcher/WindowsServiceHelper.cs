using System.Diagnostics;
using System.Linq;
using System.ServiceProcess;

namespace Keuangan.Launcher;

// Windows Service utk Keuangan.Web (mode "server") - port pola PERSIS
// DataMaster.Launcher/WindowsServiceHelper.cs (lihat komentar lengkap di sana
// utk alasan tiap keputusan - registry Environment, RunElevated via cmd.exe
// terpisah, deteksi binPath basi, dst - semuanya berlaku sama di sini).
// BEDA: tidak ada HubApiUrl/HubApiToken (Keuangan tidak push ke Hub API) -
// diganti AppSettings__Mode + AppSettings__WebviewApiUrl (lihat AppOptions.cs/
// KeuanganSyncService.cs Keuangan.Web). Token sync sendiri TIDAK disuntik lewat
// env var - tersimpan di tabel SystemSettings DALAM database (lihat
// KeuanganSyncService.BacaSettingAsync), otomatis ikut kalau database di-restore/
// dipindah, tidak perlu diketahui Launcher sama sekali.
public static class WindowsServiceHelper
{
    public const string ServiceName = "KeuanganWebService";

    public static bool IsInstalled()
    {
        try
        {
            using var sc = new ServiceController(ServiceName);
            _ = sc.Status;
            return true;
        }
        catch
        {
            return false;
        }
    }

    public static bool IsRunning()
    {
        try
        {
            using var sc = new ServiceController(ServiceName);
            sc.Refresh();
            return sc.Status == ServiceControllerStatus.Running;
        }
        catch
        {
            return false;
        }
    }

    public static bool BinPathCocok(string webExePathSekarang)
    {
        var terdaftar = BacaBinPathTerdaftar();
        return terdaftar is not null
            && string.Equals(terdaftar.Trim(), webExePathSekarang.Trim(), StringComparison.OrdinalIgnoreCase);
    }

    private static string? BacaBinPathTerdaftar()
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "sc.exe",
                Arguments = $"qc {ServiceName}",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                CreateNoWindow = true,
            };
            using var p = Process.Start(psi);
            if (p is null) return null;
            var output = p.StandardOutput.ReadToEnd();
            p.WaitForExit(5000);
            const string marker = "BINARY_PATH_NAME";
            var line = output.Split('\n').FirstOrDefault(l => l.Contains(marker));
            if (line is null) return null;
            var idx = line.IndexOf(':');
            return idx < 0 ? null : line[(idx + 1)..].Trim();
        }
        catch
        {
            return null;
        }
    }

    public static bool PerbaikiBinPathDanMulai(string webExePathBenar, int port, string connectionString, string? webviewApiUrl)
    {
        try
        {
            if (!RunElevated("sc.exe", $"config {ServiceName} binPath= \"{webExePathBenar}\"")) return false;
            TerapkanEnvironment(port, connectionString, webviewApiUrl);
            RunElevated("sc.exe", $"stop {ServiceName}");
            using (var scWait = new ServiceController(ServiceName))
            {
                try { scWait.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(10)); } catch { /* mungkin sudah stop */ }
            }
            if (!RunElevated("sc.exe", $"start {ServiceName}")) return false;
            using var sc = new ServiceController(ServiceName);
            sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(20));
            return sc.Status == ServiceControllerStatus.Running;
        }
        catch
        {
            return false;
        }
    }

    public static bool TerapkanEnvironment(int port, string connectionString, string? webviewApiUrl)
    {
        var vars = new System.Collections.Generic.List<string>
        {
            $"ASPNETCORE_URLS=http://0.0.0.0:{port}",
            "ASPNETCORE_ENVIRONMENT=Production",
            $"ConnectionStrings__Keuangan={connectionString}",
            "AppSettings__Mode=server",
        };
        if (!string.IsNullOrEmpty(webviewApiUrl)) vars.Add($"AppSettings__WebviewApiUrl={webviewApiUrl}");

        var data = string.Join("\\0", vars);
        return RunElevated("reg.exe", $"add \"HKLM\\SYSTEM\\CurrentControlSet\\Services\\{ServiceName}\" /v Environment /t REG_MULTI_SZ /d \"{data}\" /f");
    }

    public static void StopUntukFallback()
    {
        try { RunElevated("sc.exe", $"stop {ServiceName}"); } catch { /* non-fatal - fallback tetap dicoba walau stop gagal */ }
    }

    public static void EnsureStarted()
    {
        try
        {
            using var sc = new ServiceController(ServiceName);
            sc.Refresh();
            if (sc.Status is ServiceControllerStatus.Stopped or ServiceControllerStatus.StopPending)
            {
                RunElevated("sc.exe", $"start {ServiceName}");
                sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(20));
            }
        }
        catch { /* non-fatal - StartAsync pemanggil tetap akan polling /health, gagal jelas terlihat dari situ */ }
    }

    public static bool TryInstallAndStart(string webExePath, string dataDirectory, int port, string connectionString, string? webviewApiUrl)
    {
        try
        {
            System.IO.Directory.CreateDirectory(dataDirectory);

            var createArgs = $"create {ServiceName} binPath= \"{webExePath}\" start= auto DisplayName= \"Keuangan - Server Yayasan Al-Ikhlas 86\"";
            if (!RunElevated("sc.exe", createArgs)) return false;

            RunElevated("sc.exe", $"failure {ServiceName} reset= 86400 actions= restart/5000/restart/30000/restart/60000");

            TerapkanEnvironment(port, connectionString, webviewApiUrl);

            if (!RunElevated("sc.exe", $"start {ServiceName}")) return false;

            using var sc = new ServiceController(ServiceName);
            sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(20));
            return sc.Status == ServiceControllerStatus.Running;
        }
        catch
        {
            return false;
        }
    }

    private static bool RunElevated(string exe, string args)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c \"{exe} {args}\"",
                UseShellExecute = true,
                Verb = "runas",
                WindowStyle = ProcessWindowStyle.Hidden,
                CreateNoWindow = true,
            };
            using var p = Process.Start(psi);
            if (p is null) return false;
            p.WaitForExit(15000);
            return p.HasExited && p.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }
}
