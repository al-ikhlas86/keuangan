using System.IO;

namespace Keuangan.Launcher;

// Rotasi berkas log HARIAN - port pola PERSIS DataMaster.Launcher/LogCleanup.cs.
public static class LogCleanup
{
    private const int SimpanHari = 14;

    public static void RotasiLogLama(string logDir)
    {
        try
        {
            var batas = DateTime.Now.AddDays(-SimpanHari);
            foreach (var f in Directory.GetFiles(logDir, "*.log"))
            {
                try
                {
                    if (File.GetLastWriteTime(f) < batas) File.Delete(f);
                }
                catch { /* berkas mungkin sedang dipakai proses lain - coba lagi siklus berikutnya */ }
            }
        }
        catch { /* jangan sampai gagal rotasi log menghalangi start aplikasi */ }
    }
}
