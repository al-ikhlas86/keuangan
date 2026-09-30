using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

// Data awal penggajian - PERSIS komponen yang dipakai di Akuntansi lama (dibaca dari DB
// Akuntansi asli 2026-09-30, komponen aktif saja): grup "Gaji" & "Tunjangan Fungsional",
// komponen penghasilan/potongan biasa, komponen Pajak/BPJS (khusus Supervisor), tarif
// Kelebihan Jam Mengajar per jenjang, dan template slip default (I. Penghasilan Bruto A/B,
// II. Potongan, Penghasilan Bersih). Hanya dijalankan kalau tabel komponen MASIH KOSONG -
// setelah itu admin bebas mengubah lewat menu Kelola Komponen Gaji / Kelola Slip Gaji, dan
// seeder tidak pernah menimpanya lagi.
public static class PayrollSeeder
{
    public static async Task SeedAsync(KeuanganDbContext db)
    {
        if (await db.PayrollComponentTypes.AnyAsync()) return;

        var gaji = new PayrollComponentGroup { Name = "Gaji", Category = "EARNING", Urutan = 1 };
        var tunj = new PayrollComponentGroup { Name = "Tunjangan Fungsional", Category = "EARNING", Urutan = 4 };
        db.PayrollComponentGroups.AddRange(gaji, tunj);
        await db.SaveChangesAsync();

        PayrollComponentType C(string code, string name, string cat, int urut, string section = "TIDAK_TETAP", PayrollComponentGroup? g = null,
            string mode = "MANUAL", decimal rate = 0, string qty = "", string edit = "ALL", string kel = "") => new()
        {
            Code = code, Name = name, Category = cat, Urutan = urut, SlipSection = section, GroupId = g?.Id,
            CalcMode = mode, DefaultRate = rate, QtyLabel = qty, EditRole = edit, KelompokPajakBpjs = kel,
        };

        var jam = C("KELEBIHAN_JAM_MENGAJAR", "Kelebihan Jam Mengajar", "EARNING", 8, "TETAP", tunj, "AUTO_OWN", 10000, "Jam Mengajar");
        db.PayrollComponentTypes.AddRange(
            C("GAJI_POKOK", "Gaji Pokok", "EARNING", 1, "TETAP", gaji),
            C("HONOR", "Honor", "EARNING", 2, "TETAP", gaji),
            C("TUNJ_JABATAN", "Tunj. Jabatan", "EARNING", 3, "TETAP"),
            C("WALAS_STAFF_KEU_KOORD", "Walas/Staff/Keu/Koord", "EARNING", 4, "TETAP", tunj),
            C("TMK", "TMK (Tunjangan Masa Kerja)", "EARNING", 5, "TETAP", tunj),
            C("PENDAMPING", "Pendamping", "EARNING", 6, "TETAP", tunj),
            C("PERIJIN_DINAS", "Perijin Dinas", "EARNING", 7, "TETAP", tunj),
            jam,
            C("TRANSPORT", "Transport", "EARNING", 9, "TIDAK_TETAP", null, "AUTO_HARI", 30000),
            C("MAKAN", "Makan", "EARNING", 10, "TIDAK_TETAP", null, "AUTO_HARI", 20000),
            C("BAPELAN_GAPOK_HONOR_BLN", "Bapelan/Gapok/Honor Bln", "EARNING", 11),
            C("POTONGAN_LAIN", "Potongan", "DEDUCTION", 1),
            C("SIMPANAN_KOPERASI", "Simpanan Koperasi", "DEDUCTION", 13),
            C("PINJAMAN_KOPERASI", "Pinjaman Koperasi", "DEDUCTION", 14),
            C("DANA_SOSIAL", "Dana Sosial", "DEDUCTION", 15),
            C("ARISAN", "Arisan", "DEDUCTION", 16),
            // Pajak & BPJS - khusus Supervisor (AdminManager) yang boleh mengisi.
            C("BPJS_TK_JKK", "BPJS TK - JKK (Yayasan)", "EARNING", 1, "TIDAK_TETAP", null, "MANUAL", 0, "", "SUPERVISOR", "BPJS_TK"),
            C("BPJS_TK_JKM", "BPJS TK - JKM (Yayasan)", "EARNING", 2, "TIDAK_TETAP", null, "MANUAL", 0, "", "SUPERVISOR", "BPJS_TK"),
            C("BPJS_KES_YAYASAN", "Tunj. BPJS Kesehatan (Yayasan)", "EARNING", 3, "TIDAK_TETAP", null, "MANUAL", 0, "", "SUPERVISOR", "BPJS_K"),
            C("PPH21_BULAN_INI", "Pajak Penghasilan (PPh 21) Bulan Ini", "DEDUCTION", 1, "TIDAK_TETAP", null, "MANUAL", 0, "", "SUPERVISOR", "PAJAK"),
            C("BPJS_TK_JHT", "BPJS TK - JHT (Potongan Pegawai)", "DEDUCTION", 2, "TIDAK_TETAP", null, "MANUAL", 0, "", "SUPERVISOR", "BPJS_TK"),
            C("BPJS_TK_JPN", "BPJS TK - JPN (Potongan Pegawai)", "DEDUCTION", 3, "TIDAK_TETAP", null, "MANUAL", 0, "", "SUPERVISOR", "BPJS_TK"),
            C("BPJS_KES_PEGAWAI", "BPJS Kesehatan Pegawai", "DEDUCTION", 4, "TIDAK_TETAP", null, "MANUAL", 0, "", "SUPERVISOR", "BPJS_K"));
        await db.SaveChangesAsync();

        db.PayrollComponentRates.AddRange(
            new PayrollComponentRate { ComponentTypeId = jam.Id, EducationLevel = "S1", Rate = 10000 },
            new PayrollComponentRate { ComponentTypeId = jam.Id, EducationLevel = "S2", Rate = 12500 });

        // Template slip default.
        PayslipTemplateLine L(string type, string label, int urut, bool bold = false, bool indent = false, string cat = "", string section = "", string kel = "") =>
            new() { RowType = type, Label = label, Urutan = urut, Bold = bold, Indent = indent, ListCategory = cat, ListSlipSection = section, ListKelompokPajakBpjs = kel };

        var l10 = L("HEADING", "I. PENGHASILAN BRUTO", 10, bold: true);
        var l20 = L("HEADING", "A. TETAP", 20);
        var l30 = L("COMPONENT_LIST", "", 30, indent: true, cat: "EARNING", section: "TETAP");
        var l40 = L("TOTAL", "Jumlah", 40);
        var l50 = L("HEADING", "B. TIDAK TETAP", 50);
        var l60 = L("COMPONENT_LIST", "", 60, indent: true, cat: "EARNING", section: "TIDAK_TETAP", kel: "REGULAR");
        var l65 = L("COMPONENT_LIST", "", 65, indent: true, cat: "EARNING", section: "TIDAK_TETAP", kel: "PAJAK_BPJS");
        var l70 = L("TOTAL", "Jumlah", 70);
        var l80 = L("TOTAL", "C. Jumlah Penghasilan Bruto (A+B)", 80, bold: true);
        var l90 = L("HEADING", "II. POTONGAN PENGHASILAN", 90, bold: true);
        var l100 = L("COMPONENT_LIST", "", 100, indent: true, cat: "DEDUCTION", kel: "REGULAR");
        var l105 = L("COMPONENT_LIST", "", 105, indent: true, cat: "DEDUCTION", kel: "PAJAK_BPJS");
        var l110 = L("TOTAL", "Jumlah", 110);
        var l120 = L("TOTAL", "PENGHASILAN BERSIH (Bruto - Potongan)", 120, bold: true);
        db.PayslipTemplateLines.AddRange(l10, l20, l30, l40, l50, l60, l65, l70, l80, l90, l100, l105, l110, l120);
        await db.SaveChangesAsync();

        void Sum(PayslipTemplateLine total, PayslipTemplateLine src, int sign) =>
            db.PayslipTemplateSumBindings.Add(new PayslipTemplateSumBinding { LineId = total.Id, SourceLineId = src.Id, Sign = sign });
        Sum(l40, l30, 1);
        Sum(l70, l60, 1); Sum(l70, l65, 1);
        Sum(l80, l40, 1); Sum(l80, l70, 1);
        Sum(l110, l100, 1); Sum(l110, l105, 1);
        Sum(l120, l80, 1); Sum(l120, l110, -1);
        await db.SaveChangesAsync();
    }
}
