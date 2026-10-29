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

    // null = indeterminate, 0-100 = persentase unduhan (splash progress bar).
    public event Action<double?>? ProgressChanged;

    private const string AssetName = "Keuangan-win-x64.zip";
    private const string ApiLatestReleaseUrl = "https://api.github.com/repos/al-ikhlas86/keuangan/releases/latest";
    private const string ApiAssetUrlTemplate = "https://api.github.com/repos/al-ikhlas86/keuangan/releases/assets/{0}";

    // Kembalikan true kalau update DITERAPKAN (Application.Current.Shutdown()
    // SUDAH dipanggil di dalam ApplyAndRestart) - pemanggil WAJIB berhenti lanjut.
    // Maksimal percobaan menerapkan update yang SAMA (versi tujuan sama, versi terpasang tak berubah) sebelum berhenti mencoba otomatis.
    private const int MaksPercobaan = 2;

    // Port perbaikan DataMaster.Launcher (kejadian 2026-10-29: update berputar tanpa henti, jendela ganda): (1) mutex satu-instance di
    // App.xaml.cs, (2) robocopy + cek kode keluar + log helper (xcopy lama gagal diam-diam saat berkas terkunci), (3) pembatas pengulangan
    // lewat update_state.json, (4) satu pemeriksaan update pada satu waktu di dalam proses (App dan MainWindow keduanya memanggil).
    private static readonly SemaphoreSlim KunciPeriksa = new(1, 1);

    // true = sesi ini jangan memeriksa update (dibuka ulang helper setelah penyalinan gagal; jangan langsung unduh lagi).
    public static bool LewatiSesiIni { get; set; }
    // Pesan untuk pengguna bila update otomatis ditahan karena gagal berulang (ditampilkan App setelah splash).
    public static string? PesanTahan { get; private set; }

    internal sealed record StatusPercobaan(string Target, int Percobaan, DateTime TerakhirUtc);

    private static string BerkasStatus => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Keuangan", "update_state.json");

    private static StatusPercobaan? BacaStatus()
    {
        try { return File.Exists(BerkasStatus) ? JsonSerializer.Deserialize<StatusPercobaan>(File.ReadAllText(BerkasStatus)) : null; }
        catch { return null; }
    }

    private static void TulisStatus(StatusPercobaan s)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(BerkasStatus)!);
            File.WriteAllText(BerkasStatus, JsonSerializer.Serialize(s));
        }
        catch { /* gagal menyimpan status tidak boleh menghentikan update */ }
    }

    private static void HapusStatus()
    {
        try { if (File.Exists(BerkasStatus)) File.Delete(BerkasStatus); }
        catch { /* abaikan */ }
    }

    public async Task<bool> CheckAndApplyAsync(ServerProcessManager server, CancellationToken ct)
    {
        // Satu pemeriksaan pada satu waktu di proses ini.
        if (!await KunciPeriksa.WaitAsync(0, ct))
        {
            Log("Pemeriksaan update lain masih berjalan - dilewati.");
            return false;
        }
        try { return await CheckAndApplyCoreAsync(server, ct); }
        finally { KunciPeriksa.Release(); }
    }

    private async Task<bool> CheckAndApplyCoreAsync(ServerProcessManager server, CancellationToken ct)
    {
        try
        {
            if (LewatiSesiIni)
            {
                Log("Sesi ini melewati pemeriksaan update (penyalinan update sebelumnya gagal).");
                return false;
            }
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
                HapusStatus(); // update sebelumnya (kalau ada) sudah berhasil
                return false;
            }

            // Pembatas: versi tujuan yang SAMA sudah dicoba MaksPercobaan kali dalam 24 jam terakhir tetapi versi terpasang tidak berubah
            // = penerapan terus gagal. Berhenti mengunduh ulang (hemat kuota) dan beri tahu pengguna, jangan berputar selamanya.
            var tujuan = remote.ToString();
            var status = BacaStatus();
            if (status is not null && status.Target == tujuan && status.Percobaan >= MaksPercobaan && (DateTime.UtcNow - status.TerakhirUtc) < TimeSpan.FromHours(24))
            {
                Log($"Update ke {tujuan} sudah dicoba {status.Percobaan}x dan gagal diterapkan - pembaruan otomatis ditahan 24 jam. Lihat update_helper.log.");
                PesanTahan = $"Pembaruan otomatis ke versi {remote.ToString(3)} gagal diterapkan {status.Percobaan} kali. Aplikasi tetap bisa dipakai dengan versi sekarang ({installed.ToString(3)}).\n\n" +
                             "Tutup SEMUA jendela Keuangan (cek Task Manager), lalu buka lagi untuk mencoba kembali besok, atau minta Admin IT memperbarui secara manual. Rincian: %LocalAppData%\\Keuangan\\logs\\update_helper.log";
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
                // ResponseHeadersRead + baca per-chunk supaya kemajuan bisa dilaporkan
                // (unduhan ~120MB tanpa indikator dikira macet lalu aplikasi ditutup).
                using var assetResp = await http.SendAsync(assetReq, HttpCompletionOption.ResponseHeadersRead, ctsUnduh.Token);
                assetResp.EnsureSuccessStatusCode();
                var totalBytes = assetResp.Content.Headers.ContentLength ?? assetSize;
                await using var respStream = await assetResp.Content.ReadAsStreamAsync(ctsUnduh.Token);
                using var mem = new MemoryStream(totalBytes > 0 ? (int)totalBytes : 0);
                var buffer = new byte[81920];
                long totalRead = 0;
                var lastReport = DateTime.MinValue;
                int read;
                while ((read = await respStream.ReadAsync(buffer, ctsUnduh.Token)) > 0)
                {
                    await mem.WriteAsync(buffer.AsMemory(0, read), ctsUnduh.Token);
                    totalRead += read;
                    if (totalBytes > 0 && (DateTime.UtcNow - lastReport).TotalMilliseconds >= 200)
                    {
                        lastReport = DateTime.UtcNow;
                        ProgressChanged?.Invoke(totalRead * 100.0 / totalBytes);
                        StatusChanged?.Invoke($"Memperbarui ke versi {remote} ({totalRead / 1024.0 / 1024.0:F0}/{totalBytes / 1024.0 / 1024.0:F0} MB) - JANGAN TUTUP APLIKASI INI sampai selesai...");
                    }
                }
                ProgressChanged?.Invoke(100);
                zipBytes = mem.ToArray();
            }
            Log($"Unduhan selesai ({zipBytes.Length} bytes). Menerapkan pembaruan...");

            ProgressChanged?.Invoke(null);
            StatusChanged?.Invoke("Update selesai diunduh - aplikasi akan tertutup sebentar lalu terbuka lagi otomatis...");
            ApplyAndRestart(zipBytes, server, tujuan);
            Log("ApplyAndRestart selesai dipanggil, Shutdown() diminta.");
            return true;
        }
        catch (Exception ex)
        {
            Log($"GAGAL cek/terapkan update: {ex}");
            StatusChanged?.Invoke(null);
            ProgressChanged?.Invoke(null);
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

    private static void ApplyAndRestart(byte[] zipBytes, ServerProcessManager server, string versiTujuan)
    {
        // Catat percobaan SEBELUM menerapkan: bila penyalinan gagal dan aplikasi lama terbuka lagi, percobaan ini tetap terhitung.
        var sebelumnya = BacaStatus();
        TulisStatus(new StatusPercobaan(versiTujuan, (sebelumnya is not null && sebelumnya.Target == versiTujuan ? sebelumnya.Percobaan : 0) + 1, DateTime.UtcNow));

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
        // Mode server: Keuangan.Web dijalankan WINDOWS SERVICE (bukan anak proses), jadi
        // StopIntentionally() di atas tidak menyentuhnya. Kalau service tidak dimatikan
        // EKSPLISIT sebelum xcopy, berkas web\ ditimpa tapi proses service LAMA terus hidup
        // dgn kode lama di memori (bug nyata yang sama di Data Master, 2026-09-25) - server
        // tidak pernah benar2 ter-update. Tunggu sampai benar2 Stopped sebelum menimpa.
        if (WindowsServiceHelper.IsInstalled()) WindowsServiceHelper.StopDanTungguUntukUpdate();

        var pid = Process.GetCurrentProcess().Id;
        var scriptPath = Path.Combine(Path.GetTempPath(), "keuangan-update.bat");
        // robocopy (BUKAN xcopy; /IS = tetap timpa berkas yang tampak sama, seperti xcopy /Y dulu): mengulang otomatis bila berkas masih
        // terkunci (/R:15 /W:2 = sampai ~30 dtk per berkas) dan KODE KELUARNYA diperiksa (>= 8 = gagal). xcopy sebelumnya gagal diam-diam,
        // lalu aplikasi LAMA dibuka lagi tanpa ada yang tahu. Semua langkah dicatat ke update_helper.log. Bila gagal, aplikasi lama
        // dibuka dengan --update-gagal (sesi itu tidak langsung mengunduh ulang).
        var script =
            "@echo off\r\n" +
            "set \"LOGDIR=%LOCALAPPDATA%\\Keuangan\\logs\"\r\n" +
            "if not exist \"%LOGDIR%\" mkdir \"%LOGDIR%\"\r\n" +
            "set \"LOG=%LOGDIR%\\update_helper.log\"\r\n" +
            $"echo [%date% %time%] helper mulai, menunggu PID {pid} keluar >> \"%LOG%\"\r\n" +
            ":wait\r\n" +
            $"tasklist /FI \"PID eq {pid}\" 2>NUL | find \"{pid}\" >NUL\r\n" +
            "if not errorlevel 1 (\r\n" +
            "    ping 127.0.0.1 -n 2 >NUL\r\n" +
            "    goto wait\r\n" +
            ")\r\n" +
            $"robocopy \"{stagingDir}\" \"{installDir}\" /E /IS /R:15 /W:2 /NFL /NDL /NJH /NJS /NP >> \"%LOG%\" 2>&1\r\n" +
            "set \"RC=%ERRORLEVEL%\"\r\n" +
            "echo [%date% %time%] robocopy kode keluar %RC% >> \"%LOG%\"\r\n" +
            "if %RC% GEQ 8 goto gagal\r\n" +
            $"rmdir /S /Q \"{stagingDir}\"\r\n" +
            "echo [%date% %time%] update diterapkan, membuka aplikasi baru >> \"%LOG%\"\r\n" +
            $"start \"\" \"{exePath}\"\r\n" +
            "goto selesai\r\n" +
            ":gagal\r\n" +
            "echo [%date% %time%] PENYALINAN GAGAL, berkas masih terkunci - membuka aplikasi lama >> \"%LOG%\"\r\n" +
            $"start \"\" \"{exePath}\" --update-gagal\r\n" +
            ":selesai\r\n" +
            "(goto) 2>NUL & del \"%~f0\"\r\n"; // idiom: helper menghapus dirinya tanpa pesan galat "batch file cannot be found" 
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
