using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Text.Json;
using System.Windows;

namespace Keuangan.Launcher;

// Auto-update lewat GitHub REST API - port pola PERSIS
// DataMaster.Launcher/UpdateChecker.cs (repo public, TANPA token/Authorization
// header sama sekali - lihat keputusan repo public di commit yang menyertai
// file ini).
public class UpdateChecker
{
    public event Action<string?>? StatusChanged;

    private const string AssetName = "Keuangan-win-x64.zip";
    private const string ApiLatestReleaseUrl = "https://api.github.com/repos/al-ikhlas86/keuangan/releases/latest";
    private const string ApiAssetUrlTemplate = "https://api.github.com/repos/al-ikhlas86/keuangan/releases/assets/{0}";

    // Kembalikan true kalau update DITERAPKAN (Application.Current.Shutdown()
    // SUDAH dipanggil di dalam ApplyAndRestart) - pemanggil WAJIB berhenti lanjut.
    public async Task<bool> CheckAndApplyAsync(ServerProcessManager server, CancellationToken ct)
    {
        try
        {
            Log("Mulai cek update...");
            var installed = Assembly.GetExecutingAssembly().GetName().Version ?? new Version(0, 0, 0, 0);
            Log($"Versi terpasang: {installed}.");

            using var http = new HttpClient { Timeout = Timeout.InfiniteTimeSpan };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("Keuangan-AlIkhlas86-Updater");
            http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");

            string releaseJson;
            using (var ctsMeta = CancellationTokenSource.CreateLinkedTokenSource(ct))
            {
                ctsMeta.CancelAfter(TimeSpan.FromSeconds(15));
                releaseJson = await http.GetStringAsync(ApiLatestReleaseUrl, ctsMeta.Token);
            }
            using var doc = JsonDocument.Parse(releaseJson);
            var tagName = doc.RootElement.GetProperty("tag_name").GetString() ?? "";
            Log($"Rilis terbaru di GitHub: {tagName}.");

            if (!Version.TryParse(NormalizeVersion(tagName.TrimStart('v', 'V')), out var remote))
            {
                Log($"GAGAL parse tag_name '{tagName}' sbg versi - dilewati.");
                return false;
            }
            if (remote <= installed)
            {
                Log($"Sudah versi terbaru ({installed} >= {remote}) - tidak ada yang diunduh.");
                return false;
            }

            long assetId = 0;
            long assetSize = 0;
            foreach (var asset in doc.RootElement.GetProperty("assets").EnumerateArray())
            {
                if (asset.GetProperty("name").GetString() == AssetName)
                {
                    assetId = asset.GetProperty("id").GetInt64();
                    assetSize = asset.TryGetProperty("size", out var sizeProp) ? sizeProp.GetInt64() : 0;
                    break;
                }
            }
            if (assetId == 0)
            {
                Log($"Rilis {tagName} ADA tapi asset '{AssetName}' TIDAK DITEMUKAN - dilewati.");
                return false;
            }

            var sizeMb = assetSize > 0 ? $"{assetSize / 1024.0 / 1024.0:F0} MB" : "ukuran tidak diketahui";
            Log($"Update ditemukan: {installed} -> {remote} ({sizeMb}). Mulai unduh asset id={assetId}...");
            StatusChanged?.Invoke($"Memperbarui ke versi {remote} ({sizeMb}) - JANGAN TUTUP APLIKASI INI sampai selesai...");

            using var assetReq = new HttpRequestMessage(HttpMethod.Get, string.Format(ApiAssetUrlTemplate, assetId));
            assetReq.Headers.Accept.ParseAdd("application/octet-stream");
            byte[] zipBytes;
            using (var ctsUnduh = CancellationTokenSource.CreateLinkedTokenSource(ct))
            {
                ctsUnduh.CancelAfter(TimeSpan.FromMinutes(20));
                using var assetResp = await http.SendAsync(assetReq, ctsUnduh.Token);
                assetResp.EnsureSuccessStatusCode();
                zipBytes = await assetResp.Content.ReadAsByteArrayAsync(ctsUnduh.Token);
            }
            Log($"Unduhan selesai ({zipBytes.Length} bytes). Menerapkan pembaruan...");

            StatusChanged?.Invoke("Update selesai diunduh - aplikasi akan tertutup sebentar lalu terbuka lagi otomatis...");
            ApplyAndRestart(zipBytes, server);
            Log("ApplyAndRestart selesai dipanggil, Shutdown() diminta.");
            return true;
        }
        catch (Exception ex)
        {
            Log($"GAGAL cek/terapkan update: {ex}");
            StatusChanged?.Invoke(null);
            return false;
        }
    }

    private static void Log(string pesan)
    {
        try
        {
            var logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Keuangan", "logs");
            Directory.CreateDirectory(logDir);
            File.AppendAllText(Path.Combine(logDir, $"update_{DateTime.Now:yyyy-MM-dd}.log"), $"[{DateTime.Now:O}] {pesan}\n");
        }
        catch { /* logging tidak boleh ikut melempar error baru */ }
    }

    private static string NormalizeVersion(string v)
    {
        var parts = v.Trim().Split('.');
        var padded = parts.Concat(Enumerable.Repeat("0", Math.Max(0, 4 - parts.Length))).Take(4);
        return string.Join(".", padded);
    }

    private static void ApplyAndRestart(byte[] zipBytes, ServerProcessManager server)
    {
        var installDir = AppContext.BaseDirectory.TrimEnd('\\', '/');
        var exePath = Path.Combine(installDir, "Keuangan.Launcher.exe");

        var stagingDir = Path.Combine(Path.GetTempPath(), "keuangan-update-" + Guid.NewGuid().ToString("N"));
        var zipPath = stagingDir + ".zip";
        Directory.CreateDirectory(stagingDir);
        File.WriteAllBytes(zipPath, zipBytes);
        ZipFile.ExtractToDirectory(zipPath, stagingDir);
        File.Delete(zipPath);

        // Matikan proses ANAK (Keuangan.Web) SEKARANG - berkasnya (di bawah
        // installDir\web\) ikut ditimpa xcopy nanti, kuncinya harus lepas dulu.
        server.StopIntentionally();

        var pid = Process.GetCurrentProcess().Id;
        var scriptPath = Path.Combine(Path.GetTempPath(), "keuangan-update.bat");
        var script =
            "@echo off\r\n" +
            ":wait\r\n" +
            $"tasklist /FI \"PID eq {pid}\" 2>NUL | find \"{pid}\" >NUL\r\n" +
            "if not errorlevel 1 (\r\n" +
            "    ping 127.0.0.1 -n 2 >NUL\r\n" +
            "    goto wait\r\n" +
            ")\r\n" +
            $"xcopy \"{stagingDir}\\*\" \"{installDir}\\\" /Y /E /I >NUL\r\n" +
            $"rmdir /S /Q \"{stagingDir}\"\r\n" +
            $"start \"\" \"{exePath}\"\r\n" +
            "del \"%~f0\"\r\n";
        File.WriteAllText(scriptPath, script);

        Process.Start(new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = $"/c \"{scriptPath}\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        });

        Application.Current.Dispatcher.Invoke(() => Application.Current.Shutdown());
    }
}
