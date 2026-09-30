using System.Security.Claims;
using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

// Manajemen Data (backup & pulihkan database) + Riwayat Audit - HANYA AdminManager.
//
// BEDA dari Akuntansi lama (kartu "Backup Data" di sana cuma toast palsu): di sini backup SUNGGUHAN -
// salinan konsisten database SQLite (VACUUM INTO) disimpan di folder "backups" di sebelah database dan
// bisa diunduh. Pulihkan = unggah berkas backup -> DISIMPAN SEBAGAI "restore-pending" dan baru
// diterapkan saat server dinyalakan ulang (server tidak bisa menimpa database yang sedang dipakainya).
// Saat diterapkan, database lama diamankan dulu sebagai "keuangan.db.sebelum-pulihkan-<waktu>".
public static class ManagementEndpoints
{
    private const string PendingName = "restore-pending.db";

    public static void MapManagementEndpoints(this WebApplication app)
    {
        var admin = new[] { UserRole.AdminManager.ToString() };

        // ---------------- Riwayat audit ----------------
        app.MapGet("/api/audit-logs", async (int? take, string? module, string? action, KeuanganDbContext db) =>
        {
            var q = db.AuditLogs.Include(a => a.ActorUser).AsQueryable();
            if (!string.IsNullOrWhiteSpace(module)) q = q.Where(a => a.Module == module);
            if (!string.IsNullOrWhiteSpace(action)) q = q.Where(a => a.Action == action);
            var n = Math.Clamp(take ?? 200, 1, 500);
            var rows = await q.OrderByDescending(a => a.Id).Take(n).ToListAsync();
            var perPeran = await db.AuditLogs.GroupBy(a => a.ActorUser != null ? a.ActorUser.Role.ToString() : "Sistem/Developer")
                .Select(g => new { peran = g.Key, jumlah = g.Count() }).ToListAsync();
            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    total = await db.AuditLogs.CountAsync(),
                    perPeran,
                    items = rows.Select(a => new
                    {
                        a.Id, a.AuditCode, a.Module, a.Action, a.EntityName, a.EntityCode, a.CreatedAt,
                        actor = a.ActorUser?.FullName ?? "Sistem/Developer", actorRole = a.ActorUser?.Role.ToString() ?? "-",
                        a.BeforeDataJson, a.AfterDataJson,
                    }),
                },
            });
        }).RequireAuthorization(p => p.RequireRole(admin));

        // ---------------- Manajemen data ----------------
        var g = app.MapGroup("/api/management").RequireAuthorization(p => p.RequireRole(admin));

        g.MapGet("/summary", async (KeuanganDbContext db, IConfiguration cfg) =>
        {
            var dbPath = DatabaseFiles.ResolveDbPath(cfg);
            var backups = DatabaseFiles.ListBackups(dbPath);
            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    siswaAktif = await db.Students.CountAsync(s => s.Status == StudentStatus.Aktif),
                    pegawaiAktif = await db.Employees.CountAsync(e => e.Status == EmployeeStatus.Aktif),
                    transaksi = await db.FinancialTransactions.CountAsync(),
                    tagihan = await db.TagihanList.CountAsync(),
                    ukuranDatabaseBytes = dbPath is not null && File.Exists(dbPath) ? new FileInfo(dbPath).Length : 0L,
                    backupTerakhir = backups.FirstOrDefault()?.Dibuat,
                    jumlahBackup = backups.Count,
                    pemulihanMenunggu = dbPath is not null && File.Exists(Path.Combine(Path.GetDirectoryName(dbPath)!, PendingName)),
                },
            });
        });

        g.MapGet("/backups", (IConfiguration cfg) =>
            Results.Ok(new { success = true, data = DatabaseFiles.ListBackups(DatabaseFiles.ResolveDbPath(cfg)) }));

        g.MapPost("/backups", async (KeuanganDbContext db, IConfiguration cfg, ClaimsPrincipal user) =>
        {
            var dbPath = DatabaseFiles.ResolveDbPath(cfg);
            if (dbPath is null) return Results.BadRequest(new { success = false, message = "Lokasi database tidak dikenali." });
            var dir = DatabaseFiles.BackupDir(dbPath);
            Directory.CreateDirectory(dir);
            // Milidetik ikut di nama - dua backup beruntun dalam 1 detik tidak boleh bentrok (VACUUM INTO menolak berkas yang sudah ada).
            var name = $"keuangan-{DateTime.Now:yyyyMMdd-HHmmss-fff}.db";
            var target = Path.Combine(dir, name);
            try
            {
                // VACUUM INTO = salinan konsisten walau database sedang dipakai; path harus literal (kutip digandakan).
                await db.Database.ExecuteSqlRawAsync($"VACUUM INTO '{target.Replace("'", "''")}'");
            }
            catch (Exception ex)
            {
                return Results.Json(new { success = false, message = $"Backup gagal: {ex.Message}" }, statusCode: 500);
            }
            DatabaseFiles.PruneBackups(dbPath, keep: 30);
            AuditWriter.Add(db, user, "management", "backup", "Database", name, null, new { ukuran = new FileInfo(target).Length });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { name, ukuran = new FileInfo(target).Length } });
        });

        g.MapGet("/backups/{name}", (string name, IConfiguration cfg) =>
        {
            var path = DatabaseFiles.BackupPath(DatabaseFiles.ResolveDbPath(cfg), name);
            return path is null ? Results.NotFound(new { success = false, message = "Berkas backup tidak ditemukan." })
                : Results.File(path, "application/octet-stream", name);
        });

        g.MapDelete("/backups/{name}", async (string name, KeuanganDbContext db, IConfiguration cfg, ClaimsPrincipal user) =>
        {
            var path = DatabaseFiles.BackupPath(DatabaseFiles.ResolveDbPath(cfg), name);
            if (path is null) return Results.NotFound(new { success = false, message = "Berkas backup tidak ditemukan." });
            File.Delete(path);
            AuditWriter.Add(db, user, "management", "delete_backup", "Database", name, null, null);
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true });
        });

        // Pulihkan: berkas diunggah -> divalidasi (header SQLite + tabel inti ada) -> disimpan sbg restore-pending,
        // BARU diterapkan saat server dinyalakan ulang. Kirim berkas dgn form field "file".
        g.MapPost("/restore", async (HttpRequest http, KeuanganDbContext db, IConfiguration cfg, ClaimsPrincipal user) =>
        {
            var dbPath = DatabaseFiles.ResolveDbPath(cfg);
            if (dbPath is null) return Results.BadRequest(new { success = false, message = "Lokasi database tidak dikenali." });
            if (!http.HasFormContentType) return Results.BadRequest(new { success = false, message = "Kirim berkas backup (.db)." });
            var file = (await http.ReadFormAsync()).Files.FirstOrDefault();
            if (file is null || file.Length == 0) return Results.BadRequest(new { success = false, message = "Berkas belum dipilih." });

            var pending = Path.Combine(Path.GetDirectoryName(dbPath)!, PendingName);
            var tmp = pending + ".tmp";
            await using (var fs = File.Create(tmp)) await file.CopyToAsync(fs);
            var error = DatabaseFiles.ValidateBackup(tmp);
            if (error is not null) { File.Delete(tmp); return Results.BadRequest(new { success = false, message = error }); }
            File.Move(tmp, pending, overwrite: true);

            AuditWriter.Add(db, user, "management", "restore_staged", "Database", file.FileName, null, new { ukuran = file.Length });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, message = "Berkas backup valid dan siap dipulihkan. Restart layanan Keuangan (atau PC server) agar diterapkan - database saat ini akan diamankan otomatis sebelum diganti." });
        });

        g.MapDelete("/restore", (IConfiguration cfg) =>
        {
            var dbPath = DatabaseFiles.ResolveDbPath(cfg);
            var pending = dbPath is null ? null : Path.Combine(Path.GetDirectoryName(dbPath)!, PendingName);
            if (pending is not null && File.Exists(pending)) File.Delete(pending);
            return Results.Ok(new { success = true });
        });
    }
}

public record BackupInfo(string Name, long Ukuran, DateTime Dibuat);

// Lokasi & operasi berkas database SQLite (dipakai endpoint manajemen dan Program.cs saat start).
public static class DatabaseFiles
{
    private const string PendingName = "restore-pending.db";

    public static string? ResolveDbPath(IConfiguration cfg)
    {
        var cs = cfg.GetConnectionString("Keuangan");
        if (string.IsNullOrWhiteSpace(cs)) return null;
        foreach (var part in cs.Split(';'))
        {
            var kv = part.Split('=', 2);
            if (kv.Length == 2 && (kv[0].Trim().Equals("Data Source", StringComparison.OrdinalIgnoreCase) || kv[0].Trim().Equals("DataSource", StringComparison.OrdinalIgnoreCase)))
                return Path.GetFullPath(kv[1].Trim());
        }
        return null;
    }

    public static string BackupDir(string? dbPath) => Path.Combine(Path.GetDirectoryName(dbPath ?? ".")!, "backups");

    public static List<BackupInfo> ListBackups(string? dbPath)
    {
        var dir = BackupDir(dbPath);
        if (dbPath is null || !Directory.Exists(dir)) return [];
        return new DirectoryInfo(dir).GetFiles("keuangan-*.db").OrderByDescending(f => f.CreationTimeUtc)
            .Select(f => new BackupInfo(f.Name, f.Length, f.CreationTime)).ToList();
    }

    // Nama berkas dari klien TIDAK dipercaya: harus persis nama berkas backup di folder backups (anti path traversal).
    public static string? BackupPath(string? dbPath, string name)
    {
        if (dbPath is null || name != Path.GetFileName(name) || !name.StartsWith("keuangan-") || !name.EndsWith(".db")) return null;
        var path = Path.Combine(BackupDir(dbPath), name);
        return File.Exists(path) ? path : null;
    }

    public static void PruneBackups(string dbPath, int keep)
    {
        foreach (var old in ListBackups(dbPath).Skip(keep))
        {
            try { File.Delete(Path.Combine(BackupDir(dbPath), old.Name)); } catch { /* backup lama gagal dihapus - abaikan */ }
        }
    }

    // Berkas harus database SQLite sungguhan yang memuat tabel inti Keuangan.
    public static string? ValidateBackup(string path)
    {
        try
        {
            using var fs = File.OpenRead(path);
            var header = new byte[16];
            if (fs.Read(header, 0, 16) < 16 || System.Text.Encoding.ASCII.GetString(header, 0, 15) != "SQLite format 3")
                return "Berkas bukan database SQLite - pilih berkas backup Keuangan (.db).";
        }
        catch (Exception ex) { return $"Berkas tidak bisa dibaca: {ex.Message}"; }

        try
        {
            using var conn = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={path};Mode=ReadOnly;Pooling=False");
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('Students','FinancialTransactions','Users','__EFMigrationsHistory')";
            if (Convert.ToInt32(cmd.ExecuteScalar()) < 4) return "Berkas ini bukan backup database Keuangan (tabel inti tidak lengkap).";
            cmd.CommandText = "PRAGMA integrity_check";
            if (!string.Equals(cmd.ExecuteScalar()?.ToString(), "ok", StringComparison.OrdinalIgnoreCase)) return "Berkas backup rusak (integrity check gagal).";
        }
        catch (Exception ex) { return $"Berkas backup tidak valid: {ex.Message}"; }
        return null;
    }

    // Dipanggil Program.cs SEBELUM database dipakai: kalau ada restore-pending.db, ganti database dgn itu.
    // Database lama diamankan dulu (tidak pernah dihapus otomatis).
    public static void ApplyPendingRestore(string? dbPath, ILogger logger)
    {
        if (dbPath is null) return;
        var pending = Path.Combine(Path.GetDirectoryName(dbPath)!, PendingName);
        if (!File.Exists(pending)) return;
        try
        {
            if (ValidateBackup(pending) is { } err) { logger.LogError("Pemulihan dibatalkan: {Err}", err); File.Move(pending, pending + ".ditolak", overwrite: true); return; }
            if (File.Exists(dbPath))
            {
                var safe = $"{dbPath}.sebelum-pulihkan-{DateTime.Now:yyyyMMdd-HHmmss}";
                File.Move(dbPath, safe);
                logger.LogWarning("Database lama diamankan di {Safe}", safe);
            }
            foreach (var ext in new[] { "-wal", "-shm" }) { var f = dbPath + ext; if (File.Exists(f)) File.Delete(f); }
            File.Move(pending, dbPath);
            logger.LogWarning("Database dipulihkan dari backup.");
        }
        catch (Exception ex) { logger.LogError(ex, "Pemulihan database gagal."); }
    }
}
