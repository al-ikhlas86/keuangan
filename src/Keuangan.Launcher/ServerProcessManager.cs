using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;

namespace Keuangan.Launcher;

// Menjalankan Keuangan.Web sbg PROSES ANAK terpisah - port pola PERSIS
// DataMaster.Launcher/ServerProcessManager.cs (lihat komentar lengkap di
// sana). BEDA: 3 mode bukan 3 (mandiri/server/klien) tapi (developer/server/
// klien) - "developer" berperilaku SAMA seperti "mandiri" DataMaster dari
// sisi proses (anak proses lokal, port dinamis, TIDAK pernah lewat Windows
// Service), field AppSettings__Mode diteruskan APA ADANYA ke Keuangan.Web
// (dibaca DeveloperModeMiddleware.cs) - itulah yang membedakan perilaku
// login/role-switcher, BUKAN kode di sini. Health check endpoint "/health"
// (bukan "/healthz" spt DataMaster - lihat Program.cs Keuangan.Web).
public sealed class ServerProcessManager : IDisposable
{
    private Process? _process;
    private bool _intentionalStop;
    private StreamWriter? _logWriter;
    private readonly LauncherConfig _config = LauncherConfig.Load();

    public int Port { get; private set; }

    public bool IsKlien => _config.Mode == "klien";
    public string BaseUrl { get; private set; } = "";

    public event Action? ServerExitedUnexpectedly;

    public string DataDirectory { get; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Keuangan");

    public async Task<bool> StartAsync(CancellationToken ct)
    {
        if (IsKlien)
        {
            _intentionalStop = false;
            BaseUrl = (_config.KlienServerUrl ?? "").TrimEnd('/');
            if (BaseUrl.Length == 0) return false;
            return await WaitUntilHealthyAsync(ct, checkLocalProcessAlive: false, timeoutSeconds: 60);
        }

        _process?.Dispose();
        _process = null;
        _logWriter?.Dispose();
        _logWriter = null;

        _intentionalStop = false;
        var isServerMode = _config.Mode == "server";
        Directory.CreateDirectory(DataDirectory);

        var appDataDir = Path.Combine(DataDirectory, "App_Data");
        Directory.CreateDirectory(appDataDir);
        var connectionString = $"Data Source={Path.Combine(appDataDir, "keuangan.db")}";
        var webviewApiUrl = _config.WebviewApiUrl;

        // Windows Service - HANYA mode "server" (lihat WindowsServiceHelper.cs
        // & komentar panjang ServerProcessManager.cs DataMaster utk alasan
        // guard ini & seluruh alur fallback di bawah - berlaku sama persis).
        if (isServerMode && TryPakaiWindowsService(connectionString, webviewApiUrl))
        {
            if (await WaitUntilHealthyAsync(ct, checkLocalProcessAlive: false, timeoutSeconds: 30))
                return true;
            WindowsServiceHelper.StopUntukFallback();
        }

        // --- Fallback: anak proses (dipakai juga mode "developer" SELALU,
        // tidak pernah lewat Windows Service sama sekali). ---
        Port = isServerMode ? _config.ServerPort : GetFreeTcpPort();
        BaseUrl = $"http://127.0.0.1:{Port}";
        var listenUrl = isServerMode ? $"http://0.0.0.0:{Port}" : BaseUrl;

        var logDir = Path.Combine(DataDirectory, "logs");
        Directory.CreateDirectory(logDir);
        LogCleanup.RotasiLogLama(logDir);

        var (fileName, arguments, workDir) = LocateServerExecutable();

        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workDir,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        psi.EnvironmentVariables["ASPNETCORE_URLS"] = listenUrl;
        psi.EnvironmentVariables["ASPNETCORE_ENVIRONMENT"] = "Production";
        psi.EnvironmentVariables["ConnectionStrings__Keuangan"] = connectionString;
        psi.EnvironmentVariables["AppSettings__Mode"] = _config.Mode;
        if (!string.IsNullOrEmpty(webviewApiUrl)) psi.EnvironmentVariables["AppSettings__WebviewApiUrl"] = webviewApiUrl;

        _logWriter = new StreamWriter(File.Open(Path.Combine(logDir, $"web_{DateTime.Now:yyyy-MM-dd}.log"), FileMode.Append, FileAccess.Write, FileShare.Read)) { AutoFlush = true };

        _process = new Process { StartInfo = psi, EnableRaisingEvents = true };
        _process.OutputDataReceived += (_, e) => { if (e.Data is not null) _logWriter.WriteLine(e.Data); };
        _process.ErrorDataReceived += (_, e) => { if (e.Data is not null) _logWriter.WriteLine(e.Data); };
        _process.Exited += (_, _) =>
        {
            if (!_intentionalStop) ServerExitedUnexpectedly?.Invoke();
        };

        _process.Start();
        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();

        return await WaitUntilHealthyAsync(ct, checkLocalProcessAlive: true, timeoutSeconds: 30);
    }

    private bool TryPakaiWindowsService(string connectionString, string? webviewApiUrl)
    {
        string webExePath;
        try
        {
            var (fileName, _, _) = LocateServerExecutable();
            if (!fileName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) return false; // mode dev (dotnet <dll>) - service butuh exe asli
            webExePath = fileName;
        }
        catch
        {
            return false;
        }

        if (WindowsServiceHelper.IsInstalled())
        {
            if (!WindowsServiceHelper.BinPathCocok(webExePath))
            {
                return WindowsServiceHelper.PerbaikiBinPathDanMulai(webExePath, _config.ServerPort, connectionString, webviewApiUrl)
                    && SetelahServiceSiap();
            }

            WindowsServiceHelper.TerapkanEnvironment(_config.ServerPort, connectionString, webviewApiUrl);
            WindowsServiceHelper.EnsureStarted();
            if (WindowsServiceHelper.IsRunning()) return SetelahServiceSiap();
            return false;
        }

        return WindowsServiceHelper.TryInstallAndStart(webExePath, DataDirectory, _config.ServerPort, connectionString, webviewApiUrl)
            && SetelahServiceSiap();
    }

    private bool SetelahServiceSiap()
    {
        Port = _config.ServerPort;
        BaseUrl = $"http://127.0.0.1:{Port}";
        return true;
    }

    private async Task<bool> WaitUntilHealthyAsync(CancellationToken ct, bool checkLocalProcessAlive, int timeoutSeconds)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        var deadline = DateTime.UtcNow.AddSeconds(timeoutSeconds);
        while (DateTime.UtcNow < deadline && !ct.IsCancellationRequested)
        {
            if (checkLocalProcessAlive && _process is { HasExited: true }) return false;
            try
            {
                using var resp = await http.GetAsync($"{BaseUrl}/health", ct);
                if (resp.IsSuccessStatusCode) return true;
            }
            catch
            {
                // server belum siap (atau, mode klien: PC server belum menyala) - coba lagi
            }
            await Task.Delay(300, ct);
        }
        return false;
    }

    public void StopIntentionally()
    {
        _intentionalStop = true;
        try { if (_process is { HasExited: false }) _process.Kill(entireProcessTree: true); } catch { /* proses mungkin sudah berhenti sendiri */ }
    }

    private static int GetFreeTcpPort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    // Susunan folder PRODUKSI (lihat .github/workflows/build.yml): Launcher.exe
    // di root, Keuangan.Web ter-publish ke subfolder "web/". Fallback DEV:
    // proyek Keuangan.Web ditemukan lewat struktur solusi relatif.
    private static (string FileName, string Arguments, string WorkDir) LocateServerExecutable()
    {
        var baseDir = AppContext.BaseDirectory;

        var publishedWebFolder = Path.Combine(baseDir, "web", "Keuangan.Web.exe");
        if (File.Exists(publishedWebFolder)) return (publishedWebFolder, "", Path.GetDirectoryName(publishedWebFolder)!);

        var flatExe = Path.Combine(baseDir, "Keuangan.Web.exe");
        if (File.Exists(flatExe)) return (flatExe, "", baseDir);

        var dir = new DirectoryInfo(baseDir);
        for (var i = 0; i < 10 && dir is not null; i++, dir = dir.Parent)
        {
            foreach (var config in new[] { "Debug", "Release" })
            {
                var devDll = Path.Combine(dir.FullName, "Keuangan.Web", "bin", config, "net10.0", "Keuangan.Web.dll");
                if (File.Exists(devDll)) return ("dotnet", $"\"{devDll}\"", Path.GetDirectoryName(devDll)!);
            }
        }

        throw new FileNotFoundException("Tidak dapat menemukan Keuangan.Web (belum di-build/publish). Jalankan 'dotnet build' pada solusi Keuangan terlebih dahulu.");
    }

    public void Dispose()
    {
        StopIntentionally();
        _logWriter?.Dispose();
    }
}
