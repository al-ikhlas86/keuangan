namespace Keuangan.Data.Entities;

// Port dari Akuntansi (apps/auditlog/models.py AuditLog) - BEDA PENTING dari
// versi lama: ActorUserId sekarang FK ke akun login SUNGGUHAN (lihat Entities/User.cs),
// bukan string bebas dari header X-Source-Role yg bisa dipalsukan siapa saja.
public class AuditLog
{
    public int Id { get; set; }
    public required string AuditCode { get; set; } // auto "AUD-..."

    public int? ActorUserId { get; set; }
    public User? ActorUser { get; set; }

    public required string Module { get; set; }
    public required string Action { get; set; }
    public required string EntityName { get; set; }
    public string? EntityCode { get; set; }

    public string? BeforeDataJson { get; set; }
    public string? AfterDataJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
