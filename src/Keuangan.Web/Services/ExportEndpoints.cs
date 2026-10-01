using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClosedXML.Excel;

namespace Keuangan.Web.Services;

// Ekspor ke Excel (.xlsx) SUNGGUHAN (2026-10-01, permintaan user: "semua format ekspor jangan CSV, xlsx
// aja" - CSV membuat kolom menyatu/berantakan saat dibuka di Excel). Frontend mengirim judul kolom + baris
// data, server membuat berkas .xlsx rapi: judul tebal, kolom otomatis selebar isinya, angka tersimpan
// sebagai ANGKA (bisa dijumlah di Excel), teks tetap teks (NIS/VA berawalan 0 tidak hilang), tanggal
// yyyy-MM-dd jadi tanggal sungguhan, baris judul dibekukan dan diberi filter.
public static class ExportEndpoints
{
    private const string XlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    private const int MaxBaris = 100_000;
    private static readonly Regex TanggalRx = new(@"^\d{4}-\d{2}-\d{2}$", RegexOptions.Compiled);

    public static void MapExportEndpoints(this WebApplication app)
    {
        app.MapPost("/api/export/xlsx", (ExportRequest req) =>
        {
            if (req.Sheets is null || req.Sheets.Count == 0)
                return Results.BadRequest(new { success = false, message = "Tidak ada data untuk diekspor." });
            if (req.Sheets.Sum(s => s.Rows?.Count ?? 0) > MaxBaris)
                return Results.BadRequest(new { success = false, message = $"Data terlalu besar untuk diekspor sekaligus (maks {MaxBaris:N0} baris)." });

            using var wb = new XLWorkbook();
            var dipakai = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var no = 0;
            foreach (var sheet in req.Sheets)
            {
                no++;
                var ws = wb.AddWorksheet(NamaSheet(sheet.Name, no, dipakai));
                var headers = sheet.Headers ?? [];
                for (var c = 0; c < headers.Count; c++) ws.Cell(1, c + 1).Value = headers[c];

                var rows = sheet.Rows ?? [];
                for (var r = 0; r < rows.Count; r++)
                {
                    var row = rows[r];
                    for (var c = 0; c < row.Count; c++) Isi(ws.Cell(r + 2, c + 1), row[c]);
                }

                var lastCol = Math.Max(headers.Count, rows.Count == 0 ? 0 : rows.Max(x => x.Count));
                if (lastCol > 0)
                {
                    var header = ws.Range(1, 1, 1, lastCol);
                    header.Style.Font.Bold = true;
                    header.Style.Fill.BackgroundColor = XLColor.LightGray;
                    ws.SheetView.FreezeRows(1);
                    ws.Range(1, 1, Math.Max(rows.Count + 1, 1), lastCol).SetAutoFilter();
                    ws.Columns(1, lastCol).AdjustToContents();
                    foreach (var col in ws.Columns(1, lastCol)) if (col.Width > 60) col.Width = 60;
                }
            }

            using var ms = new MemoryStream();
            wb.SaveAs(ms);
            return Results.File(ms.ToArray(), XlsxMime, NamaBerkas(req.FileName));
        }).RequireAuthorization();
    }

    private static void Isi(IXLCell cell, JsonElement v)
    {
        switch (v.ValueKind)
        {
            case JsonValueKind.Number:
                var d = v.GetDecimal();
                cell.Value = d;
                cell.Style.NumberFormat.Format = d == decimal.Truncate(d) ? "#,##0" : "#,##0.00";
                break;
            case JsonValueKind.True: cell.Value = "Ya"; break;
            case JsonValueKind.False: cell.Value = "Tidak"; break;
            case JsonValueKind.String:
                var s = v.GetString() ?? "";
                if (TanggalRx.IsMatch(s) && DateTime.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt))
                {
                    cell.Value = dt;
                    cell.Style.NumberFormat.Format = "dd/mm/yyyy";
                }
                else cell.Value = s; // teks tetap teks (NIS/VA berawalan 0 tidak hilang)
                break;
        }
    }

    private static string NamaSheet(string? nama, int no, HashSet<string> dipakai)
    {
        var bersih = new string((nama ?? $"Sheet{no}").Where(ch => !"[]:*?/\\".Contains(ch)).ToArray()).Trim();
        if (bersih.Length == 0) bersih = $"Sheet{no}";
        if (bersih.Length > 31) bersih = bersih[..31];
        var asli = bersih; var n = 2;
        while (!dipakai.Add(bersih)) bersih = $"{asli[..Math.Min(asli.Length, 28)]} {n++}";
        return bersih;
    }

    private static string NamaBerkas(string? nama)
    {
        var bersih = Regex.Replace(nama ?? "data", @"[^\w\-\. ]", "_").Trim();
        if (bersih.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase)) bersih = bersih[..^5];
        if (bersih.Length == 0) bersih = "data";
        return $"{bersih}.xlsx";
    }
}

public record ExportSheet(string? Name, List<string>? Headers, List<List<JsonElement>>? Rows);
public record ExportRequest(string? FileName, List<ExportSheet>? Sheets);
