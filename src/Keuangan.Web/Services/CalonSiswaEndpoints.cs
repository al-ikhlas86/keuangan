using Keuangan.Data;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

// Daftar calon siswa dari PSB beserta status tagihan awalnya (read-only). Calon dibuat oleh CalonSiswaService (sinkron webview);
// pembayaran dicatat kasir lewat menu Terima Pembayaran seperti siswa biasa.
public static class CalonSiswaEndpoints
{
    public static void MapCalonSiswaEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/calon-siswa").RequireAuthorization();

        group.MapGet("/", async (string? q, KeuanganDbContext db) =>
        {
            var query = db.Students.AsNoTracking().Where(s => s.PsbId != null);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                query = query.Where(s => s.Name.Contains(term) || s.Nis.Contains(term));
            }
            var baris = await query.OrderBy(s => s.Name)
                .Select(s => new
                {
                    s.Id, s.Nis, s.Name, s.Katalog, s.Angkatan, s.ClassName, Status = s.Status.ToString(), s.HubId,
                    Awal = s.TagihanList.Where(t => t.PeriodLabel.StartsWith(CalonSiswaLogika.AwalPrefix))
                        .Select(t => new { t.Id, t.TagihanCode, Jenis = t.FeeType.Name, t.PeriodLabel, t.Amount, t.PaidAmount }).ToList(),
                })
                .ToListAsync();

            var data = baris.Select(b =>
            {
                var st = CalonSiswaLogika.HitungStatus(b.Awal.Select(t => (t.Amount, t.PaidAmount)));
                return new
                {
                    b.Id, nomor = b.Nis, nama = b.Name, katalog = b.Katalog, tahunAjaran = b.Angkatan, kelasTujuan = b.ClassName,
                    status = b.Status, sudahJadiSiswa = b.HubId > 0,
                    statusAwal = st.Kode, totalAwal = st.Total, dibayarAwal = st.Dibayar,
                    tagihan = b.Awal.Select(t => new { t.Id, kode = t.TagihanCode, jenis = t.Jenis, periode = t.PeriodLabel, jumlah = t.Amount, dibayar = t.PaidAmount }),
                };
            });
            return Results.Ok(new { success = true, data });
        });
    }
}
