using Keuangan.Data.Entities;

namespace Keuangan.Data;

/// <summary>Ringkasan tagihan awal satu calon: Kode = tanpa_tagihan | belum | sebagian | lunas.</summary>
public sealed record StatusAwal(string Kode, decimal Total, decimal Dibayar);

/// <summary>
/// Aturan murni calon siswa dari PSB (2026-11-28): label periode tagihan awal, tarif awal sebuah jenis pembayaran, status lunas, dan pencocokan calon dengan siswa
/// sungguhan dari Data Master. Tanpa database/jaringan supaya teruji. Calon = baris Student ber-Status Calon dengan PsbId terisi dan HubId NEGATIF (-PsbId).
/// </summary>
public static class CalonSiswaLogika
{
    public const string AwalPrefix = "Awal ";

    /// <summary>Label periode tagihan awal, mis. "Awal 2027/2028" (tahun ajaran gelombang PSB).</summary>
    public static string LabelPeriodeAwal(string? tahunAjaran) => AwalPrefix + (string.IsNullOrWhiteSpace(tahunAjaran) ? "-" : tahunAjaran.Trim());

    public static bool PeriodeAwal(string? label) => label is not null && label.StartsWith(AwalPrefix, StringComparison.Ordinal);

    /// <summary>Nama dibandingkan tanpa beda huruf besar/kecil dan spasi ganda.</summary>
    public static string NormalNama(string? nama) => string.Join(' ', (nama ?? "").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).ToLowerInvariant();

    /// <summary>
    /// Nominal tagihan awal sebuah jenis pembayaran untuk calon dengan tahun ajaran (Angkatan) tertentu; null = tidak ditagihkan (bukan jenis awal, tidak aktif,
    /// nominal 0, atau tarif per angkatan belum diatur). Hanya jenis AKTIF, WAJIB, dan bertanda "tagih saat daftar".
    /// </summary>
    public static decimal? TarifAwal(FeeType fee, string? angkatan, DateOnly hariIni)
    {
        if (!fee.IsActive || fee.Kategori != FeeKategori.Wajib || !fee.AutoTagihSaatDaftar) return null;
        decimal nominal;
        if (fee.UsesAngkatanRate)
        {
            var a = angkatan?.Trim();
            var tarif = fee.Rates.Where(r => string.Equals(r.Angkatan, a, StringComparison.OrdinalIgnoreCase) && r.BerlakuMulai <= hariIni)
                .OrderByDescending(r => r.BerlakuMulai).FirstOrDefault();
            if (tarif is null) return null;
            nominal = tarif.Nominal;
        }
        else nominal = fee.DefaultAmount;
        return nominal > 0 ? nominal : null;
    }

    /// <summary>Status gabungan seluruh tagihan awal: lunas bila SEMUA lunas; belum bila belum ada yang terbayar; selain itu sebagian. Pembayaran berlebih tidak dihitung lebih dari nominalnya.</summary>
    public static StatusAwal HitungStatus(IEnumerable<(decimal Amount, decimal Paid)> tagihan)
    {
        var daftar = tagihan.ToList();
        if (daftar.Count == 0) return new StatusAwal("tanpa_tagihan", 0m, 0m);
        var total = daftar.Sum(t => t.Amount);
        var dibayar = daftar.Sum(t => Math.Min(Math.Max(t.Paid, 0m), t.Amount));
        var kode = daftar.All(t => t.Paid >= t.Amount) ? "lunas" : dibayar <= 0m ? "belum" : "sebagian";
        return new StatusAwal(kode, total, dibayar);
    }

    /// <summary>
    /// Mencari calon yang SAMA dengan siswa yang baru muncul dari Data Master: nama (dinormalkan) dan katalog sama dan tepat SATU kandidat. Ragu/ganda = null
    /// (tidak digabung diam-diam: lebih baik dua baris yang bisa dirapikan daripada tagihan nyasar ke siswa yang salah).
    /// </summary>
    public static int? Cocokkan(IReadOnlyList<(int Id, string Nama, string? Katalog)> calon, string? nama, string? katalog)
    {
        var n = NormalNama(nama);
        if (n.Length == 0) return null;
        var cocok = calon.Where(c => NormalNama(c.Nama) == n && string.Equals(c.Katalog ?? "", katalog ?? "", StringComparison.OrdinalIgnoreCase)).ToList();
        return cocok.Count == 1 ? cocok[0].Id : null;
    }
}
