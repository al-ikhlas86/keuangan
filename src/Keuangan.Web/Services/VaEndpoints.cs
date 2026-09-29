using System.Globalization;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

// Nomor VA siswa (2026-09-29) - Keuangan TIDAK punya data siswa sendiri (sumber:
// Data Master), jadi VA diisi MASSAL lewat Excel: unduh template berisi siswa yang
// sedang tampil di layar (nama/NIS/kelas terisi otomatis) -> isi kolom "No VA 1..n"
// -> impor dgn PRATINJAU dulu. Kolom ID siswa (HubId, tersembunyi) jadi kunci
// pencocokan - BUKAN NIS/nama, yang bisa rusak diketik ulang/di-format Excel.
//
// Model: Student.VaNumber = VA utama (tampil di daftar siswa); VA tambahan =
// baris StudentVirtualAccount. Satu nomor VA hanya boleh dipakai SATU siswa
// (dicek lintas kedua tabel, lihat VaLogic.PemilikVa).
public static class VaEndpoints
{
    private const string XlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    public static void MapVaEndpoints(this WebApplication app)
    {
        var edit = new[] { UserRole.AdminManager.ToString(), UserRole.Staff.ToString() };
        var group = app.MapGroup("/api/students").RequireAuthorization(p => p.RequireRole(edit));

        // Unduh template - hubIds = siswa yang sedang tampil (sudah difilter di layar).
        group.MapPost("/va-template", async (VaTemplateRequest req, KeuanganDbContext db) =>
        {
            var ids = (req.HubIds ?? []).Distinct().ToList();
            if (ids.Count == 0)
                return Results.BadRequest(new { success = false, message = "Tidak ada siswa untuk diunduh - ubah filter dulu." });

            var students = await db.Students.Include(s => s.VirtualAccounts)
                .Where(s => ids.Contains(s.HubId)).ToListAsync();
            var urut = students.OrderBy(s => s.Katalog).ThenBy(s => s.ClassName).ThenBy(s => s.Name).ToList();
            return Results.File(VaLogic.BuatTemplate(urut), XlsxMime, $"template-va-{DateTime.Now:yyyyMMdd-HHmm}.xlsx");
        });

        // Pratinjau - TIDAK menyimpan apa pun.
        group.MapPost("/va-import/preview", async (HttpRequest http, KeuanganDbContext db) =>
        {
            var (plan, error) = await VaLogic.AnalisisDariRequestAsync(http, db);
            if (plan is null) return Results.BadRequest(new { success = false, message = error });
            return Results.Ok(new { success = true, data = plan.Ringkasan() });
        });

        // Simpan - analisis diulang dari file yang sama (stateless), lalu terapkan
        // aksi yang valid dalam SATU SaveChanges. Entri bermasalah dilewati.
        group.MapPost("/va-import/commit", async (HttpRequest http, KeuanganDbContext db) =>
        {
            var (plan, error) = await VaLogic.AnalisisDariRequestAsync(http, db);
            if (plan is null) return Results.BadRequest(new { success = false, message = error });

            foreach (var a in plan.Aksi)
            {
                if (a.Jenis == "tambah")
                    db.StudentVirtualAccounts.Add(new StudentVirtualAccount { StudentId = a.StudentId, VaNumber = a.Va, Label = "Tambahan" });
                else
                {
                    var s = await db.Students.FindAsync(a.StudentId);
                    if (s is not null) s.VaNumber = a.Va;
                }
            }
            await db.SaveChangesAsync();
            var r = plan.Ringkasan();
            return Results.Ok(new
            {
                success = true,
                message = $"Impor selesai: {plan.Isi} VA utama diisi, {plan.Ganti} diganti, {plan.Tambah} VA tambahan ditambahkan, {plan.Sama} sudah sama, {plan.Error} dilewati karena bermasalah.",
                data = r,
            });
        });

        // --- VA per siswa (halaman detail) ---
        group.MapPost("/{id:int}/va", async (int id, VaRequest req, KeuanganDbContext db) =>
        {
            var s = await db.Students.Include(x => x.VirtualAccounts).FirstOrDefaultAsync(x => x.Id == id);
            if (s is null) return Results.NotFound(new { success = false, message = "Siswa tidak ditemukan." });

            var (va, err) = VaLogic.Normalisasi(req.VaNumber);
            if (va is null) return Results.BadRequest(new { success = false, message = err ?? "Nomor VA wajib diisi." });

            var pemilik = await VaLogic.PemilikVa(db, va);
            if (pemilik is not null && pemilik.StudentId != id)
                return Results.Conflict(new { success = false, message = $"VA {va} sudah dipakai {pemilik.Nama} ({pemilik.Nis})." });
            if (pemilik is not null)
                return Results.Conflict(new { success = false, message = $"VA {va} sudah terdaftar di siswa ini." });

            // Belum punya VA utama -> VA pertama otomatis jadi utama.
            if (string.IsNullOrEmpty(s.VaNumber)) s.VaNumber = va;
            else db.StudentVirtualAccounts.Add(new StudentVirtualAccount { StudentId = id, VaNumber = va, Label = "Tambahan" });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, message = "Nomor VA ditambahkan." });
        });

        group.MapDelete("/{id:int}/va/{vaId:int}", async (int id, int vaId, KeuanganDbContext db) =>
        {
            var va = await db.StudentVirtualAccounts.FirstOrDefaultAsync(v => v.Id == vaId && v.StudentId == id);
            if (va is null) return Results.NotFound(new { success = false, message = "VA tidak ditemukan." });
            db.StudentVirtualAccounts.Remove(va);
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, message = "Nomor VA dihapus." });
        });

        // Tukar VA tambahan <-> VA utama.
        group.MapPost("/{id:int}/va/{vaId:int}/jadikan-utama", async (int id, int vaId, KeuanganDbContext db) =>
        {
            var s = await db.Students.Include(x => x.VirtualAccounts).FirstOrDefaultAsync(x => x.Id == id);
            var va = s?.VirtualAccounts.FirstOrDefault(v => v.Id == vaId);
            if (s is null || va is null) return Results.NotFound(new { success = false, message = "VA tidak ditemukan." });

            var lama = s.VaNumber;
            s.VaNumber = va.VaNumber;
            if (string.IsNullOrEmpty(lama)) db.StudentVirtualAccounts.Remove(va);
            else va.VaNumber = lama;
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, message = "VA utama diperbarui." });
        });
    }
}

public record VaTemplateRequest(List<int>? HubIds);
public record VaRequest(string? VaNumber);

internal record PemilikVaInfo(int StudentId, string Nama, string Nis);

internal record VaAksi(int StudentId, string Nama, string Nis, string Jenis, string Va, string? Lama);
internal record VaMasalah(int Baris, string? Nama, string? Nis, string Level, string Pesan);

internal class VaImportPlan
{
    public List<VaAksi> Aksi { get; } = [];
    public List<VaMasalah> Masalah { get; } = [];
    public int BarisData { get; set; }
    public int Sama { get; set; }
    public int Isi => Aksi.Count(a => a.Jenis == "isi");
    public int Ganti => Aksi.Count(a => a.Jenis == "ganti");
    public int Tambah => Aksi.Count(a => a.Jenis == "tambah");
    public int Error => Masalah.Count(m => m.Level == "error");
    public int Peringatan => Masalah.Count(m => m.Level == "peringatan");

    public object Ringkasan() => new
    {
        barisData = BarisData,
        isi = Isi, ganti = Ganti, tambah = Tambah, sama = Sama, error = Error, peringatan = Peringatan,
        // Yang berisiko (menimpa VA utama lama) ditampilkan utk dikonfirmasi.
        daftarGanti = Aksi.Where(a => a.Jenis == "ganti").Take(50)
            .Select(a => new { a.Nama, a.Nis, lama = a.Lama, baru = a.Va }),
        masalah = Masalah.Take(200),
        totalMasalah = Masalah.Count,
    };
}

internal static class VaLogic
{
    private const int JumlahKolomVaDefault = 10;
    private static readonly Regex KolomVa = new(@"^\s*no\.?\s*va\s*(\d+)\s*$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // VA = ANGKA saja (boleh diawali 0 - disimpan sbg teks, nol tidak hilang), tanpa spasi,
    // 4-32 digit. Panjang persis tiap bank belum dipastikan - sengaja longgar, cukup utk
    // menangkap salah ketik parah (huruf, tanda baca, terlalu pendek).
    public static (string? Va, string? Error) Normalisasi(string? mentah)
    {
        var raw = new string((mentah ?? "").Where(c => !char.IsWhiteSpace(c)).ToArray());
        if (raw.Length == 0) return (null, null);
        if (raw.Length < 4 || raw.Length > 32 || !raw.All(char.IsAsciiDigit))
            return (null, $"Format VA \"{raw}\" tidak valid (harus angka saja, 4-32 digit).");
        return (raw, null);
    }

    // Siapa yang sudah memakai nomor VA ini (kolom utama ATAU tambahan)?
    public static async Task<PemilikVaInfo?> PemilikVa(KeuanganDbContext db, string va)
    {
        var utama = await db.Students.Where(s => s.VaNumber == va)
            .Select(s => new PemilikVaInfo(s.Id, s.Name, s.Nis)).FirstOrDefaultAsync();
        if (utama is not null) return utama;
        return await db.StudentVirtualAccounts.Where(v => v.VaNumber == va)
            .Select(v => new PemilikVaInfo(v.StudentId, v.Student.Name, v.Student.Nis)).FirstOrDefaultAsync();
    }

    // ---------- Template ----------
    public static byte[] BuatTemplate(List<Student> siswa)
    {
        var maxExtra = siswa.Count == 0 ? 0 : siswa.Max(s => s.VirtualAccounts.Count);
        var jumlahVa = Math.Max(JumlahKolomVaDefault, maxExtra + 1);

        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("Siswa");
        string[] tetap = ["ID Siswa (jangan diubah)", "Nama", "NIS", "Kelas", "Katalog"];
        for (var c = 0; c < tetap.Length; c++) ws.Cell(1, c + 1).Value = tetap[c];
        for (var n = 1; n <= jumlahVa; n++) ws.Cell(1, tetap.Length + n).Value = $"No VA {n}";

        // Kolom identitas & VA berformat TEKS - cegah Excel membuang nol di depan /
        // mengubah angka panjang jadi 1.23E+15.
        var lastCol = tetap.Length + jumlahVa;
        var lastRow = Math.Max(siswa.Count + 1, 2);
        ws.Range(2, 3, lastRow, lastCol).Style.NumberFormat.Format = "@";

        for (var i = 0; i < siswa.Count; i++)
        {
            var s = siswa[i];
            var r = i + 2;
            ws.Cell(r, 1).Value = s.HubId;
            ws.Cell(r, 2).Value = s.Name;
            ws.Cell(r, 3).Value = s.Nis;
            ws.Cell(r, 4).Value = s.ClassName ?? "";
            ws.Cell(r, 5).Value = s.Katalog ?? "";
            if (!string.IsNullOrEmpty(s.VaNumber)) ws.Cell(r, 6).Value = s.VaNumber;
            var col = 7;
            foreach (var v in s.VirtualAccounts.OrderBy(v => v.Id)) ws.Cell(r, col++).Value = v.VaNumber;
        }

        var header = ws.Range(1, 1, 1, lastCol);
        header.Style.Font.Bold = true;
        header.Style.Fill.BackgroundColor = XLColor.LightGray;
        ws.Range(2, 1, lastRow, 5).Style.Fill.BackgroundColor = XLColor.FromHtml("#F3F4F6");
        ws.SheetView.FreezeRows(1);
        ws.Columns(2, lastCol).AdjustToContents();
        ws.Column(1).Hide();

        var info = wb.AddWorksheet("Petunjuk");
        string[] baris =
        [
            "CARA MENGISI",
            "1. Isi kolom \"No VA 1\" dengan VA utama siswa. Kolom \"No VA 2\", \"No VA 3\", dst. untuk VA tambahan (opsional).",
            "2. JANGAN mengubah kolom ID Siswa (tersembunyi). Nama/NIS/Kelas/Katalog hanya penanda - perubahan di sana tidak dibaca.",
            "3. Baris boleh diurutkan ulang atau dihapus (baris yang dihapus tidak diproses).",
            "4. Sel VA yang KOSONG = tidak diubah (tidak menghapus VA yang sudah ada). Hapus VA dari halaman detail siswa.",
            "5. Jika VA 1 berbeda dari yang tersimpan, di pratinjau akan ditandai \"akan diganti\".",
            "6. Satu nomor VA hanya boleh dipakai satu siswa. VA: angka saja tanpa spasi (4-32 digit), BOLEH diawali 0.",
            "7. Kolom VA sudah berformat Teks supaya angka 0 di depan tidak hilang - JANGAN diubah jadi Angka/General. Kalau menempel (paste) dari file lain, pakai Paste Special > Text/Values.",
        ];
        for (var i = 0; i < baris.Length; i++) info.Cell(i + 1, 1).Value = baris[i];
        info.Cell(1, 1).Style.Font.Bold = true;
        info.Column(1).Width = 120;

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    // ---------- Impor ----------
    public static async Task<(VaImportPlan? Plan, string? Error)> AnalisisDariRequestAsync(HttpRequest http, KeuanganDbContext db)
    {
        if (!http.HasFormContentType) return (null, "Kirim file Excel (.xlsx).");
        var form = await http.ReadFormAsync();
        var file = form.Files.FirstOrDefault();
        if (file is null || file.Length == 0) return (null, "File belum dipilih.");
        if (!file.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase)) return (null, "Format file harus .xlsx (Excel).");

        try
        {
            using var stream = file.OpenReadStream();
            return await AnalisisAsync(db, stream);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return (null, "File Excel tidak bisa dibaca - pastikan file dari template dan tidak rusak.");
        }
    }

    private static async Task<(VaImportPlan? Plan, string? Error)> AnalisisAsync(KeuanganDbContext db, Stream stream)
    {
        using var wb = new XLWorkbook(stream);
        var ws = wb.Worksheets.First();
        var lastRow = ws.LastRowUsed()?.RowNumber() ?? 0;
        var lastCol = ws.LastColumnUsed()?.ColumnNumber() ?? 0;
        if (lastRow < 2) return (null, "File kosong - tidak ada baris siswa.");

        // Cari kolom lewat judul (bukan posisi) - tahan kalau kolom digeser.
        var idCol = 0;
        var vaCols = new List<(int Nomor, int Kolom)>();
        for (var c = 1; c <= lastCol; c++)
        {
            var judul = ws.Cell(1, c).GetString().Trim();
            if (idCol == 0 && judul.StartsWith("ID", StringComparison.OrdinalIgnoreCase)) idCol = c;
            var m = KolomVa.Match(judul);
            if (m.Success) vaCols.Add((int.Parse(m.Groups[1].Value), c));
        }
        if (idCol == 0) return (null, "Kolom \"ID Siswa\" tidak ditemukan - gunakan file hasil unduhan template dari menu Data Siswa.");
        if (vaCols.Count == 0) return (null, "Kolom \"No VA 1\" tidak ditemukan - gunakan file hasil unduhan template.");
        vaCols = vaCols.OrderBy(v => v.Nomor).ToList();
        var utamaNomor = vaCols[0].Nomor;

        var siswa = await db.Students.Include(s => s.VirtualAccounts).ToListAsync();
        var perHub = siswa.ToDictionary(s => s.HubId);
        // Pemilik VA saat ini (utama & tambahan) - utk cek bentrok dgn siswa LAIN.
        var pemilik = new Dictionary<string, Student>();
        foreach (var s in siswa)
        {
            if (!string.IsNullOrEmpty(s.VaNumber)) pemilik[s.VaNumber] = s;
            foreach (var v in s.VirtualAccounts) pemilik[v.VaNumber] = s;
        }

        var plan = new VaImportPlan();
        // Pass 1: kumpulkan entri valid per baris.
        var entri = new List<(int Baris, Student S, int Nomor, string Va)>();
        var selAngka = 0;
        for (var r = 2; r <= lastRow; r++)
        {
            var idCell = ws.Cell(r, idCol);
            if (idCell.IsEmpty() && vaCols.All(v => ws.Cell(r, v.Kolom).IsEmpty())) continue; // baris kosong
            plan.BarisData++;

            var hubId = idCell.DataType == XLDataType.Number
                ? (int)idCell.GetDouble()
                : int.TryParse(idCell.GetString().Trim(), out var parsed) ? parsed : 0;
            if (!perHub.TryGetValue(hubId, out var s))
            {
                plan.Masalah.Add(new VaMasalah(r, ws.Cell(r, 2).GetString(), ws.Cell(r, 3).GetString(), "error", "ID siswa tidak dikenal - baris ini dilewati."));
                continue;
            }

            var dalamBaris = new HashSet<string>();
            foreach (var (nomor, kolom) in vaCols)
            {
                var (va, err, angka) = BacaSelVa(ws.Cell(r, kolom));
                if (err is not null) { plan.Masalah.Add(new VaMasalah(r, s.Name, s.Nis, "error", $"No VA {nomor}: {err}")); continue; }
                if (va is null) continue;
                if (angka) selAngka++;
                if (!dalamBaris.Add(va)) continue; // VA sama diketik dua kali di baris yg sama
                entri.Add((r, s, nomor, va));
            }
        }

        if (selAngka > 0)
            plan.Masalah.Add(new VaMasalah(0, null, null, "peringatan",
                $"{selAngka} nomor VA di file tersimpan sebagai ANGKA (bukan teks). Kalau ada VA yang seharusnya diawali 0, nol itu sudah hilang di Excel - periksa, dan format kolom sebagai Teks sebelum mengisi."));

        // VA yang dipakai >1 siswa di dalam file -> semua entrinya ditolak.
        var bentrokFile = entri.GroupBy(e => e.Va).Where(g => g.Select(x => x.S.Id).Distinct().Count() > 1)
            .Select(g => g.Key).ToHashSet();

        // Pass 2: putuskan aksi per entri.
        foreach (var (baris, s, nomor, va) in entri)
        {
            if (bentrokFile.Contains(va))
            {
                plan.Masalah.Add(new VaMasalah(baris, s.Name, s.Nis, "error", $"VA {va} muncul untuk lebih dari satu siswa di file ini - dilewati."));
                continue;
            }
            if (pemilik.TryGetValue(va, out var pm) && pm.Id != s.Id)
            {
                plan.Masalah.Add(new VaMasalah(baris, s.Name, s.Nis, "error", $"VA {va} sudah dipakai {pm.Name} ({pm.Nis}) - dilewati."));
                continue;
            }
            if (s.VaNumber == va || s.VirtualAccounts.Any(v => v.VaNumber == va))
            {
                // Sudah terdaftar di siswa ini. Kalau diminta jadi VA utama tapi statusnya masih tambahan -> arahkan.
                if (nomor == utamaNomor && s.VaNumber != va)
                    plan.Masalah.Add(new VaMasalah(baris, s.Name, s.Nis, "peringatan", $"VA {va} sudah ada sebagai VA tambahan - gunakan \"Jadikan utama\" di halaman detail siswa."));
                plan.Sama++;
                continue;
            }

            if (nomor == utamaNomor)
                plan.Aksi.Add(new VaAksi(s.Id, s.Name, s.Nis, string.IsNullOrEmpty(s.VaNumber) ? "isi" : "ganti", va, s.VaNumber));
            else
                plan.Aksi.Add(new VaAksi(s.Id, s.Name, s.Nis, "tambah", va, null));
        }
        return (plan, null);
    }

    // Baca sel VA. Angka >= 1e15 = sudah dibulatkan Excel (rusak) -> error.
    private static (string? Va, string? Error, bool DariAngka) BacaSelVa(IXLCell cell)
    {
        if (cell.IsEmpty()) return (null, null, false);
        string raw;
        var angka = cell.DataType == XLDataType.Number;
        if (angka)
        {
            var d = cell.GetDouble();
            if (d >= 1e15)
                return (null, "VA tersimpan sebagai angka dan kemungkinan sudah dibulatkan Excel (angka >15 digit). Format kolom sebagai Teks lalu isi ulang.", true);
            // Teks yang TAMPIL di sel (menghormati format kustom spt 0000000000 -> nol di depan ikut).
            var tampil = cell.GetFormattedString();
            raw = tampil.All(char.IsAsciiDigit) && tampil.Length > 0 ? tampil : d.ToString("0", CultureInfo.InvariantCulture);
        }
        else raw = cell.GetString();
        var (va, err) = Normalisasi(raw);
        return (va, err, angka && va is not null);
    }
}
