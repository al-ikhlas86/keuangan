using System.Security.Claims;
using System.Text.Json;
using Keuangan.Data;
using Keuangan.Data.Entities;

namespace Keuangan.Web.Services;

// Penulis jejak audit (tabel AuditLog sudah ada sejak Fase 1 tapi belum pernah ditulis siapa pun).
// Dipanggil dari endpoint yang mengubah data penting (penggajian dst). Sengaja TIDAK memanggil
// SaveChanges sendiri - ikut tersimpan bersama perubahan datanya dalam SATU SaveChanges/transaksi
// pemanggil, jadi log tidak bisa "yatim" (ada log tanpa perubahan, atau sebaliknya).
public static class AuditWriter
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public static void Add(KeuanganDbContext db, ClaimsPrincipal? user, string module, string action, string entityName, string? entityCode, object? before = null, object? after = null)
    {
        // Mode developer: UserId 0 (bukan baris asli di Users) - jangan dijadikan FK.
        var uid = int.TryParse(user?.FindFirstValue(ClaimTypes.NameIdentifier), out var id) && id > 0 ? id : (int?)null;
        db.AuditLogs.Add(new AuditLog
        {
            AuditCode = $"AUD-{Guid.NewGuid().ToString("N")[..10].ToUpperInvariant()}",
            ActorUserId = uid,
            Module = module,
            Action = action,
            EntityName = entityName,
            EntityCode = entityCode,
            BeforeDataJson = before is null ? null : JsonSerializer.Serialize(before, Json),
            AfterDataJson = after is null ? null : JsonSerializer.Serialize(after, Json),
        });
    }
}
