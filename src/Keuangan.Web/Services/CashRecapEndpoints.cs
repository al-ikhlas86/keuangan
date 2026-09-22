using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

// Buku kas bulanan format resmi - port konsep RekapitulasiKas.tsx (saldo
// awal -> berjalan per transaksi -> saldo akhir). Saldo awal disimpan di
// SystemSettings ("opening_cash_balance"/"opening_cash_balance_date") -
// key/value generik (lihat Entities/SystemSetting.cs), BUKAN AppSetting
// 1-baris-tunggal spt Akuntansi lama (Fase 1 belum py entitas AppSetting
// terpisah, disatukan ke SystemSettings biar tidak nambah tabel baru
// utk 1 nilai).
public static class CashRecapEndpoints
{
    public static void MapCashRecapEndpoints(this WebApplication app)
    {
        app.MapGet("/api/cash-recap", async (string periodKey, KeuanganDbContext db) =>
        {
            var parts = periodKey.Split('-');
            if (parts.Length != 2 || !int.TryParse(parts[0], out var year) || !int.TryParse(parts[1], out var month) || month is < 1 or > 12)
                return Results.BadRequest(new { success = false, message = "Format periode harus YYYY-MM." });

            var fromDate = new DateOnly(year, month, 1);
            var toDate = fromDate.AddMonths(1).AddDays(-1);

            var openingSetting = await db.SystemSettings.FindAsync("opening_cash_balance");
            var openingBalance = decimal.TryParse(openingSetting?.SettingValue, out var ob) ? ob : 0m;

            // Saldo awal periode INI = saldo pembuka global + semua transaksi
            // SEBELUM tanggal 1 periode ini (bukan cuma dari tanggal saldo
            // pembuka disetel) - supaya rekap bulan manapun konsisten dihitung
            // dari 1 titik referensi yang sama.
            var totalSebelumPeriode = await db.FinancialTransactions
                .Where(t => t.TxDate < fromDate)
                .SumAsync(t => (decimal?)(t.TxType == TxType.Masuk ? t.Amount : -t.Amount)) ?? 0;
            var saldoAwalPeriode = openingBalance + totalSebelumPeriode;

            var transaksi = await db.FinancialTransactions
                .Where(t => t.TxDate >= fromDate && t.TxDate <= toDate)
                .OrderBy(t => t.TxDate).ThenBy(t => t.Id)
                .Select(t => new { t.TxCode, t.TxDate, t.Description, TxType = t.TxType.ToString(), t.Amount })
                .ToListAsync();

            var saldoBerjalan = saldoAwalPeriode;
            var baris = new List<object>();
            foreach (var t in transaksi)
            {
                saldoBerjalan += t.TxType == "Masuk" ? t.Amount : -t.Amount;
                baris.Add(new { t.TxCode, t.TxDate, t.Description, t.TxType, t.Amount, SaldoBerjalan = saldoBerjalan });
            }

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    periodKey,
                    saldoAwalPeriode,
                    saldoAkhirPeriode = saldoBerjalan,
                    totalMasuk = transaksi.Where(t => t.TxType == "Masuk").Sum(t => t.Amount),
                    totalKeluar = transaksi.Where(t => t.TxType == "Keluar").Sum(t => t.Amount),
                    baris,
                },
            });
        }).RequireAuthorization();

        app.MapPost("/api/settings/opening-balance", async (OpeningBalanceRequest req, KeuanganDbContext db) =>
        {
            var setting = await db.SystemSettings.FindAsync("opening_cash_balance");
            if (setting is null)
            {
                db.SystemSettings.Add(new SystemSetting { SettingKey = "opening_cash_balance", SettingValue = req.Amount.ToString(), UpdatedAt = DateTime.UtcNow });
            }
            else
            {
                setting.SettingValue = req.Amount.ToString();
                setting.UpdatedAt = DateTime.UtcNow;
            }
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, message = "Saldo awal kas disimpan." });
        }).RequireAuthorization(policy => policy.RequireRole(UserRole.AdminManager.ToString()));
    }
}

public record OpeningBalanceRequest(decimal Amount);
