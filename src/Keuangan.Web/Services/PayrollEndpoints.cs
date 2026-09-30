using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

// Penggajian - port dari Akuntansi lama (apps/dashboard/api/payroll.py + payslip_template.py).
//
// Peran (BEDA dari Akuntansi lama yg membaca role dari header X-Source-Role yang bisa dipalsukan -
// di sini role dari login sungguhan): AdminManager = "Admin/Supervisor", Staff = "Admin Keuangan".
//   - Baca & isi gaji, kelola komponen, bayar gaji, terbitkan slip : AdminManager + Staff
//   - Komponen ber-edit_role SUPERVISOR (Pajak/BPJS) & data PPh   : hanya AdminManager
//   - Kelola template slip & pengaturan penggajian                  : hanya AdminManager
//
// Pembayaran gaji (finalize) = transaksi kas KELUAR per pegawai + jurnal (D akun beban gaji,
// K akun kas/bank) - akun dipilih di Pengaturan Penggajian, TIDAK ditebak (aturan proyek ini:
// server tidak pernah menebak akun, lihat TransactionsEndpoints.cs).
public static class PayrollEndpoints
{
    private const string KeyExpense = "payroll_expense_account_id";
    private const string KeyCash = "payroll_cash_account_id";
    private const string KeySignSpv = "payroll_sign_spv";
    private const string KeySignAdm = "payroll_sign_adm";
    private const string KeyTaxGuide = "payroll_tax_guide_url";
    private static readonly Regex PeriodRx = new(@"^\d{4}-(0[1-9]|1[0-2])$", RegexOptions.Compiled);
    private static readonly string[] BulanId = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    public static string PeriodLabel(string key) => $"{BulanId[int.Parse(key[5..]) - 1]} {key[..4]}";

    public static void MapPayrollEndpoints(this WebApplication app)
    {
        var staffRoles = new[] { UserRole.AdminManager.ToString(), UserRole.Staff.ToString() };
        var adminOnly = new[] { UserRole.AdminManager.ToString() };
        var group = app.MapGroup("/api/payroll").RequireAuthorization(p => p.RequireRole(staffRoles));

        // ---------------- Meta (komponen, grup, template, pegawai, pengaturan) ----------------
        group.MapGet("/meta", async (KeuanganDbContext db) => Results.Ok(new { success = true, data = await BuildMetaAsync(db) }));

        group.MapPut("/settings", async (JsonElement body, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            if (!user.IsInRole(adminOnly[0])) return Results.StatusCode(403);
            async Task Set(string key, string? value)
            {
                var row = await db.SystemSettings.FindAsync(key);
                if (row is null) db.SystemSettings.Add(new SystemSetting { SettingKey = key, SettingValue = value, UpdatedAt = DateTime.UtcNow });
                else { row.SettingValue = value; row.UpdatedAt = DateTime.UtcNow; }
            }
            if (Has(body, "expenseAccountId")) await Set(KeyExpense, Int(body, "expenseAccountId")?.ToString());
            if (Has(body, "cashAccountId")) await Set(KeyCash, Int(body, "cashAccountId")?.ToString());
            if (Has(body, "signSpv")) await Set(KeySignSpv, Str(body, "signSpv")?.Trim());
            if (Has(body, "signAdm")) await Set(KeySignAdm, Str(body, "signAdm")?.Trim());
            if (Has(body, "taxGuideUrl")) await Set(KeyTaxGuide, Str(body, "taxGuideUrl")?.Trim());
            AuditWriter.Add(db, user, "payroll", "update", "PayrollSettings", null, null, new { note = "pengaturan penggajian diubah" });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, message = "Pengaturan penggajian disimpan." });
        });

        // ---------------- Grup komponen ----------------
        group.MapPost("/component-groups", async (JsonElement body, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            var name = Str(body, "name")?.Trim();
            var cat = Str(body, "category");
            if (string.IsNullOrEmpty(name)) return Bad("Nama grup wajib diisi.");
            if (cat is null || !PayrollValues.Categories.Contains(cat)) return Bad("Kategori harus EARNING atau DEDUCTION.");
            var g = new PayrollComponentGroup { Name = name, Category = cat, Urutan = Int(body, "urutan") ?? 0 };
            db.PayrollComponentGroups.Add(g);
            await db.SaveChangesAsync();
            AuditWriter.Add(db, user, "payroll", "create", "PayrollComponentGroup", g.Id.ToString(), null, new { g.Name, g.Category });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { g.Id } });
        });

        group.MapPatch("/component-groups/{id:int}", async (int id, JsonElement body, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            var g = await db.PayrollComponentGroups.FindAsync(id);
            if (g is null) return Results.NotFound(new { success = false, message = "Grup komponen tidak ditemukan." });
            var before = new { g.Name, g.Category, g.Urutan, g.IsActive };
            var cat = Str(body, "category");
            if (cat is not null && cat != g.Category)
            {
                if (!PayrollValues.Categories.Contains(cat)) return Bad("Kategori harus EARNING atau DEDUCTION.");
                if (await db.PayrollComponentTypes.AnyAsync(c => c.GroupId == id && c.IsActive))
                    return Bad("Nonaktifkan/pindahkan komponen di grup ini dulu sebelum mengubah kategori.");
                g.Category = cat;
            }
            if (!string.IsNullOrWhiteSpace(Str(body, "name"))) g.Name = Str(body, "name")!.Trim();
            if (Int(body, "urutan") is { } u) g.Urutan = u;
            if (Bool(body, "isActive") is { } a) g.IsActive = a;
            AuditWriter.Add(db, user, "payroll", "update", "PayrollComponentGroup", id.ToString(), before, new { g.Name, g.Category, g.Urutan, g.IsActive });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true });
        });

        // ---------------- Tipe komponen ----------------
        group.MapPost("/component-types", async (JsonElement body, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            var code = Str(body, "code")?.Trim().ToUpperInvariant().Replace(' ', '_');
            var name = Str(body, "name")?.Trim();
            var cat = Str(body, "category");
            if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(name)) return Bad("Kode dan nama komponen wajib diisi.");
            if (cat is null || !PayrollValues.Categories.Contains(cat)) return Bad("Kategori harus EARNING atau DEDUCTION.");
            if (await db.PayrollComponentTypes.AnyAsync(c => c.Code == code)) return Results.Conflict(new { success = false, message = $"Kode komponen \"{code}\" sudah dipakai." });

            var mode = Str(body, "calcMode") ?? "MANUAL";
            var section = Str(body, "slipSection") ?? "TIDAK_TETAP";
            var edit = Str(body, "editRole") ?? "ALL";
            var kel = Str(body, "kelompokPajakBpjs") ?? "";
            if (!PayrollValues.CalcModes.Contains(mode)) return Bad("Mode perhitungan tidak valid.");
            if (!PayrollValues.SlipSections.Contains(section)) return Bad("Bagian slip tidak valid.");
            if (!PayrollValues.EditRoles.Contains(edit)) return Bad("Pengaturan siapa-boleh-isi tidak valid.");
            if (!PayrollValues.Kelompok.Contains(kel)) return Bad("Kelompok Pajak/BPJS tidak valid.");
            if (edit == "SUPERVISOR" && !user.IsInRole(UserRole.AdminManager.ToString()))
                return Results.Json(new { success = false, message = "Hanya Supervisor yang boleh mengatur komponen khusus Supervisor." }, statusCode: 403);

            var groupId = Int(body, "groupId");
            if (groupId is not null)
            {
                var g = await db.PayrollComponentGroups.FirstOrDefaultAsync(x => x.Id == groupId && x.IsActive);
                if (g is null) return Bad("Grup komponen tidak ditemukan.");
                if (g.Category != cat) return Bad("Kategori komponen harus sama dengan kategori grup.");
            }

            var c = new PayrollComponentType
            {
                Code = code, Name = name, Category = cat, GroupId = groupId, CalcMode = mode,
                QtyLabel = Str(body, "qtyLabel")?.Trim() ?? "", DefaultRate = Dec(body, "defaultRate") ?? 0,
                ShortLabel = Str(body, "shortLabel")?.Trim() ?? "", SlipSection = section, EditRole = edit, KelompokPajakBpjs = kel,
                Urutan = Int(body, "urutan") ?? 0,
            };
            db.PayrollComponentTypes.Add(c);
            await db.SaveChangesAsync();
            if (body.TryGetProperty("rates", out var rates) && rates.ValueKind == JsonValueKind.Object) await ApplyRatesAsync(db, c.Id, rates);
            AuditWriter.Add(db, user, "payroll", "create", "PayrollComponentType", c.Code, null, new { c.Name, c.Category });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { c.Id } });
        });

        group.MapPatch("/component-types/{id:int}", async (int id, JsonElement body, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            var c = await db.PayrollComponentTypes.FindAsync(id);
            if (c is null) return Results.NotFound(new { success = false, message = "Komponen gaji tidak ditemukan." });
            var before = new { c.Name, c.Urutan, c.IsActive };

            if (!string.IsNullOrWhiteSpace(Str(body, "name"))) c.Name = Str(body, "name")!.Trim();
            if (Str(body, "category") is { } cat)
            {
                if (!PayrollValues.Categories.Contains(cat)) return Bad("Kategori harus EARNING atau DEDUCTION.");
                c.Category = cat;
            }
            if (Has(body, "groupId"))
            {
                var gid = Int(body, "groupId");
                if (gid is null) c.GroupId = null;
                else
                {
                    var g = await db.PayrollComponentGroups.FirstOrDefaultAsync(x => x.Id == gid && x.IsActive);
                    if (g is null) return Bad("Grup komponen tidak ditemukan.");
                    if (g.Category != c.Category) return Bad("Kategori komponen harus sama dengan kategori grup.");
                    c.GroupId = gid;
                }
            }
            if (Str(body, "calcMode") is { } mode)
            {
                if (!PayrollValues.CalcModes.Contains(mode)) return Bad("Mode perhitungan tidak valid.");
                c.CalcMode = mode;
            }
            if (Has(body, "qtyLabel")) c.QtyLabel = Str(body, "qtyLabel")?.Trim() ?? "";
            if (Has(body, "defaultRate")) c.DefaultRate = Dec(body, "defaultRate") ?? 0;
            if (Has(body, "shortLabel")) c.ShortLabel = Str(body, "shortLabel")?.Trim() ?? "";
            if (Str(body, "slipSection") is { } sec)
            {
                if (!PayrollValues.SlipSections.Contains(sec)) return Bad("Bagian slip tidak valid.");
                c.SlipSection = sec;
            }
            if (Str(body, "editRole") is { } er)
            {
                if (!PayrollValues.EditRoles.Contains(er)) return Bad("Pengaturan siapa-boleh-isi tidak valid.");
                if (!user.IsInRole(UserRole.AdminManager.ToString()))
                    return Results.Json(new { success = false, message = "Hanya Supervisor yang boleh mengatur komponen khusus Supervisor." }, statusCode: 403);
                c.EditRole = er;
            }
            if (Str(body, "kelompokPajakBpjs") is { } kel)
            {
                if (!PayrollValues.Kelompok.Contains(kel)) return Bad("Kelompok Pajak/BPJS tidak valid.");
                c.KelompokPajakBpjs = kel;
            }
            if (Int(body, "urutan") is { } u) c.Urutan = u;
            if (Bool(body, "isActive") is { } act) c.IsActive = act;
            await db.SaveChangesAsync();
            if (body.TryGetProperty("rates", out var rates) && rates.ValueKind == JsonValueKind.Object) await ApplyRatesAsync(db, c.Id, rates);
            AuditWriter.Add(db, user, "payroll", "update", "PayrollComponentType", c.Code, before, new { c.Name, c.Urutan, c.IsActive });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true });
        });

        // ---------------- Isian gaji per pegawai & periode ----------------
        group.MapGet("/items", async (string? period, int? employeeId, KeuanganDbContext db) =>
        {
            if (period is null || !PeriodRx.IsMatch(period)) return Bad("Parameter period (YYYY-MM) wajib diisi.");
            var pr = await db.PayrollPeriods.FirstOrDefaultAsync(p => p.PeriodKey == period);
            if (employeeId is null)
            {
                if (pr is null) return Results.Ok(new { success = true, data = new { items = Array.Empty<object>() } });
                var items = await db.PayrollItems.Where(i => i.PayrollPeriodId == pr.Id)
                    .Include(i => i.Lines).ThenInclude(l => l.ComponentType).Include(i => i.Slip).ToListAsync();
                return Results.Ok(new { success = true, data = new { items = items.Select(ItemDto) } });
            }
            var item = pr is null ? null : await db.PayrollItems.Where(i => i.PayrollPeriodId == pr.Id && i.EmployeeId == employeeId)
                .Include(i => i.Lines).ThenInclude(l => l.ComponentType).Include(i => i.Slip).FirstOrDefaultAsync();
            if (item is null)
                return Results.Ok(new { success = true, data = new { exists = false, employeeId, hariMasuk = (int?)null, keterangan = "", lines = new Dictionary<string, object>(), isPaid = false } });
            var dto = ItemDto(item);
            return Results.Ok(new { success = true, data = new { exists = true, dto.employeeId, dto.payrollItemId, dto.hariMasuk, dto.keterangan, dto.biayaJabatan, dto.ptkpWajibPajak, dto.pajakDitanggungPemerintah, dto.lines, dto.isPaid, dto.slipNo } });
        });

        group.MapPost("/items/save", async (JsonElement body, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            var employee = Int(body, "employeeId") is { } eid ? await db.Employees.FindAsync(eid) : null;
            if (employee is null) return Bad("Pegawai tidak ditemukan.");
            var periodKey = Str(body, "period");
            if (periodKey is null || !PeriodRx.IsMatch(periodKey)) return Bad("Periode wajib diisi (format YYYY-MM).");

            var pr = await db.PayrollPeriods.FirstOrDefaultAsync(p => p.PeriodKey == periodKey);
            if (pr is null) { pr = new PayrollPeriod { PeriodKey = periodKey }; db.PayrollPeriods.Add(pr); await db.SaveChangesAsync(); }

            var item = await db.PayrollItems.Include(i => i.Lines).FirstOrDefaultAsync(i => i.PayrollPeriodId == pr.Id && i.EmployeeId == employee.Id);
            if (item?.TransactionId is not null)
                return Bad("Gaji pegawai ini untuk periode tersebut sudah dibayar, tidak bisa diubah lagi.");
            if (item is null)
            {
                item = new PayrollItem { PayrollPeriodId = pr.Id, EmployeeId = employee.Id };
                db.PayrollItems.Add(item);
                await db.SaveChangesAsync();
            }

            var isSupervisor = user.IsInRole(UserRole.AdminManager.ToString());
            item.UpdatedAt = DateTime.UtcNow;
            if (Has(body, "hariMasuk")) item.HariMasuk = Int(body, "hariMasuk");
            if (Has(body, "keterangan")) item.Keterangan = Str(body, "keterangan")?.Trim() ?? "";
            if (isSupervisor)
            {
                if (Has(body, "biayaJabatan")) item.BiayaJabatan = Dec(body, "biayaJabatan");
                if (Has(body, "ptkpWajibPajak")) item.PtkpWajibPajak = Dec(body, "ptkpWajibPajak");
                if (Has(body, "pajakDitanggungPemerintah")) item.PajakDitanggungPemerintah = Dec(body, "pajakDitanggungPemerintah");
            }

            var lines = body.TryGetProperty("lines", out var l) && l.ValueKind == JsonValueKind.Object ? l : default;
            var qtys = body.TryGetProperty("quantities", out var q) && q.ValueKind == JsonValueKind.Object ? q : default;
            var overrides = body.TryGetProperty("overrides", out var o) && o.ValueKind == JsonValueKind.Array
                ? o.EnumerateArray().Select(x => x.GetString() ?? "").ToHashSet() : [];

            var components = await db.PayrollComponentTypes.Where(c => c.IsActive).Include(c => c.Rates).ToListAsync();
            foreach (var comp in components)
            {
                if (comp.EditRole == "SUPERVISOR" && !isSupervisor) continue;
                var isOverride = comp.CalcMode != "MANUAL" && overrides.Contains(comp.Code);
                decimal amount;
                decimal? qty = null;
                if (comp.CalcMode == "MANUAL" || isOverride)
                {
                    if (!HasNum(lines, comp.Code)) continue;
                    amount = NumOf(lines, comp.Code);
                    if (isOverride && HasNum(qtys, comp.Code)) qty = NumOf(qtys, comp.Code);
                }
                else if (comp.CalcMode == "AUTO_HARI")
                {
                    qty = item.HariMasuk ?? 0;
                    amount = qty.Value * ResolveRate(comp, employee);
                }
                else // AUTO_OWN
                {
                    if (!HasNum(qtys, comp.Code)) continue;
                    qty = NumOf(qtys, comp.Code);
                    amount = qty.Value * ResolveRate(comp, employee);
                }

                var existing = item.Lines.FirstOrDefault(x => x.ComponentTypeId == comp.Id);
                if (amount == 0 && (qty is null || qty == 0))
                {
                    if (existing is not null) { db.PayrollItemLines.Remove(existing); item.Lines.Remove(existing); }
                }
                else if (existing is null)
                    db.PayrollItemLines.Add(new PayrollItemLine { PayrollItemId = item.Id, ComponentTypeId = comp.Id, Amount = amount, Quantity = qty, IsManualOverride = isOverride });
                else { existing.Amount = amount; existing.Quantity = qty; existing.IsManualOverride = isOverride; }
            }

            AuditWriter.Add(db, user, "payroll", "update", "PayrollItem", $"{employee.Id}:{periodKey}", null, new { employee = employee.Name, period = periodKey, item.HariMasuk });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { payrollItemId = item.Id } });
        });

        // Bayar Gaji: tiap pegawai terpilih -> 1 transaksi kas KELUAR + jurnal. employeeIds kosong = semua yg belum dibayar.
        group.MapPost("/periods/finalize", async (FinalizeRequest req, KeuanganDbContext db, DocumentNumberService docNum, ClaimsPrincipal user) =>
        {
            if (req.Period is null || !PeriodRx.IsMatch(req.Period)) return Bad("Periode wajib diisi (format YYYY-MM).");
            var pr = await db.PayrollPeriods.FirstOrDefaultAsync(p => p.PeriodKey == req.Period);
            if (pr is null) return Bad("Belum ada data gaji yang diisi untuk periode ini.");

            var settings = await ReadSettingsAsync(db);
            var expenseId = req.ExpenseAccountId ?? settings.ExpenseAccountId;
            var cashId = req.CashAccountId ?? settings.CashAccountId;
            if (expenseId is null || cashId is null)
                return Bad("Akun pembayaran gaji belum diatur. Pilih Akun Beban Gaji dan Akun Kas/Bank di Pengaturan > Penggajian (atau di kotak Bayar Gaji).");
            var accountIds = new[] { expenseId.Value, cashId.Value };
            if (await db.ChartOfAccounts.CountAsync(a => accountIds.Contains(a.Id) && a.IsActive) != accountIds.Distinct().Count())
                return Bad("Akun beban gaji / kas yang dipilih tidak ditemukan atau tidak aktif.");
            if (expenseId == cashId) return Bad("Akun beban gaji dan akun kas/bank tidak boleh sama.");

            var q = db.PayrollItems.Where(i => i.PayrollPeriodId == pr.Id && i.TransactionId == null);
            if (req.EmployeeIds is { Count: > 0 }) q = q.Where(i => req.EmployeeIds.Contains(i.EmployeeId));
            var items = await q.Include(i => i.Employee).Include(i => i.Lines).ThenInclude(l => l.ComponentType).ToListAsync();
            if (items.Count == 0)
                return Bad(req.EmployeeIds is { Count: > 0 } ? "Pegawai terpilih sudah dibayar atau belum ada data gaji yang diisi." : "Belum ada data gaji yang diisi untuk periode ini.");

            var method = req.Method ?? PaymentMethod.Transfer;
            var today = DateOnly.FromDateTime(DateTime.Now);
            var userId = int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) && uid > 0 ? uid : (int?)null;
            var label = PeriodLabel(req.Period);
            int paidCount = 0, skipped = 0;
            decimal totalPaid = 0;

            await using var dbTx = await db.Database.BeginTransactionAsync();
            foreach (var item in items)
            {
                var net = NetOf(item);
                if (net <= 0) { skipped++; continue; }

                var description = $"Gaji {item.Employee.Name} - {label}";
                var tx = new FinancialTransaction
                {
                    TxCode = await docNum.NextAsync(DocType.TRX, today), TxDate = today, Description = description,
                    TxType = TxType.Keluar, PaymentMethod = method, Amount = net, CreatedByUserId = userId,
                };
                db.FinancialTransactions.Add(tx);
                await db.SaveChangesAsync();

                var je = new JournalEntry { EntryNo = await docNum.NextAsync(DocType.JE, today), EntryDate = today, Memo = description, SourceTransactionId = tx.Id };
                je.Lines.Add(new JournalLine { AccountId = expenseId.Value, Debit = net, Credit = 0, Description = description });
                je.Lines.Add(new JournalLine { AccountId = cashId.Value, Debit = 0, Credit = net, Description = description });
                db.JournalEntries.Add(je);

                item.TransactionId = tx.Id;
                item.UpdatedAt = DateTime.UtcNow;
                paidCount++;
                totalPaid += net;
                await db.SaveChangesAsync();
            }
            if (paidCount == 0)
            {
                await dbTx.RollbackAsync();
                return Bad("Tidak ada gaji yang bisa dibayar - total bersih semua pegawai terpilih nol atau negatif.");
            }
            if (!await db.PayrollItems.AnyAsync(i => i.PayrollPeriodId == pr.Id && i.TransactionId == null)) pr.Status = "PAID";
            AuditWriter.Add(db, user, "payroll", "pay", "PayrollPeriod", req.Period, new { status = "DRAFT" }, new { employeesPaid = paidCount, total = totalPaid });
            await db.SaveChangesAsync();
            await dbTx.CommitAsync();
            return Results.Ok(new { success = true, data = new { employeesPaid = paidCount, totalPaid, skipped } });
        });

        // Riwayat pembayaran gaji satu pegawai (dipakai halaman Profil Pegawai; juga utk pegawai yang sudah diarsipkan).
        group.MapGet("/employees/{id:int}/history", async (int id, KeuanganDbContext db) =>
        {
            var rows = await db.PayrollItems.Where(i => i.EmployeeId == id && i.TransactionId != null)
                .Include(i => i.PayrollPeriod).Include(i => i.Transaction).Include(i => i.Slip)
                .OrderByDescending(i => i.PayrollPeriod.PeriodKey).ToListAsync();
            var data = rows.Select(i => new
            {
                periodKey = i.PayrollPeriod.PeriodKey, periodLabel = PeriodLabel(i.PayrollPeriod.PeriodKey),
                txDate = i.Transaction!.TxDate, amount = i.Transaction.Amount, method = i.Transaction.PaymentMethod.ToString(),
                txCode = i.Transaction.TxCode, slipNo = i.Slip?.SlipNo,
            });
            return Results.Ok(new { success = true, data });
        });

        // Nomor slip resmi - cetak ulang memakai nomor yang sama.
        group.MapPost("/items/{id:int}/slip", async (int id, KeuanganDbContext db, DocumentNumberService docNum, ClaimsPrincipal user) =>
        {
            var item = await db.PayrollItems.Include(i => i.Employee).Include(i => i.Slip).FirstOrDefaultAsync(i => i.Id == id);
            if (item is null) return Results.NotFound(new { success = false, message = "Data penggajian tidak ditemukan." });
            if (item.TransactionId is null) return Bad("Gaji untuk data ini belum dibayar, belum bisa diterbitkan nomor slip.");

            var created = false;
            if (item.Slip is null)
            {
                item.Slip = new SalarySlip { PayrollItemId = item.Id, SlipNo = await docNum.NextAsync(DocType.SLIP, DateOnly.FromDateTime(DateTime.Now)) };
                db.SalarySlips.Add(item.Slip);
                created = true;
            }
            AuditWriter.Add(db, user, "payroll", "print", "SalarySlip", item.Slip.SlipNo, null, new { employee = item.Employee.Name, reprint = !created });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { slipNo = item.Slip.SlipNo, issuedAt = item.Slip.IssuedAt } });
        });

        // ---------------- Template slip ----------------
        var tpl = app.MapGroup("/api/payroll/template").RequireAuthorization(p => p.RequireRole(adminOnly));

        tpl.MapPost("/", async (JsonElement body, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            var rowType = Str(body, "rowType");
            if (rowType is null || !PayrollValues.RowTypes.Contains(rowType)) return Bad($"Tipe baris tidak valid. Pilihan: {string.Join(", ", PayrollValues.RowTypes)}.");
            var label = Str(body, "label")?.Trim() ?? "";
            if (rowType != "COMPONENT_LIST" && label == "") return Bad("Judul/label wajib diisi.");
            if (Int(body, "urutan") is not { } urutan) return Bad("Urutan wajib diisi angka.");

            var line = new PayslipTemplateLine { RowType = rowType, Label = label, Urutan = urutan, Bold = Bool(body, "bold") ?? false, Indent = Bool(body, "indent") ?? false };
            if (rowType == "COMPONENT_LIST")
            {
                var cat = Str(body, "listCategory"); var sec = Str(body, "listSlipSection") ?? ""; var kel = Str(body, "listKelompokPajakBpjs") ?? "";
                if (cat is null || !PayrollValues.Categories.Contains(cat)) return Bad("Kategori daftar komponen harus EARNING atau DEDUCTION.");
                if (sec != "" && !PayrollValues.SlipSections.Contains(sec)) return Bad("Bagian slip tidak valid.");
                if (!PayrollValues.ListKelompok.Contains(kel)) return Bad("Filter kelompok Pajak/BPJS tidak valid.");
                line.ListCategory = cat; line.ListSlipSection = sec; line.ListKelompokPajakBpjs = kel;
            }
            await using var dbTx = await db.Database.BeginTransactionAsync();
            db.PayslipTemplateLines.Add(line);
            await db.SaveChangesAsync();
            var err = await ApplyBindingsAsync(db, line, body);
            if (err is not null) { await dbTx.RollbackAsync(); return Bad(err); }
            AuditWriter.Add(db, user, "payroll", "create", "PayslipTemplateLine", line.Id.ToString(), null, new { line.RowType, line.Label, line.Urutan });
            await db.SaveChangesAsync();
            await dbTx.CommitAsync();
            return Results.Ok(new { success = true, data = new { line.Id } });
        });

        tpl.MapPatch("/{id:int}", async (int id, JsonElement body, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            var line = await db.PayslipTemplateLines.FirstOrDefaultAsync(x => x.Id == id);
            if (line is null) return Results.NotFound(new { success = false, message = "Baris tidak ditemukan." });
            await using var dbTx = await db.Database.BeginTransactionAsync();
            if (Has(body, "label")) line.Label = Str(body, "label")?.Trim() ?? "";
            if (Has(body, "urutan"))
            {
                if (Int(body, "urutan") is not { } u) { await dbTx.RollbackAsync(); return Bad("Urutan wajib diisi angka."); }
                line.Urutan = u;
            }
            if (Bool(body, "bold") is { } b) line.Bold = b;
            if (Bool(body, "indent") is { } ind) line.Indent = ind;
            if (line.RowType == "COMPONENT_LIST")
            {
                if (Str(body, "listCategory") is { } cat)
                {
                    if (!PayrollValues.Categories.Contains(cat)) { await dbTx.RollbackAsync(); return Bad("Kategori daftar komponen harus EARNING atau DEDUCTION."); }
                    line.ListCategory = cat;
                }
                if (Has(body, "listSlipSection"))
                {
                    var sec = Str(body, "listSlipSection") ?? "";
                    if (sec != "" && !PayrollValues.SlipSections.Contains(sec)) { await dbTx.RollbackAsync(); return Bad("Bagian slip tidak valid."); }
                    line.ListSlipSection = sec;
                }
                if (Has(body, "listKelompokPajakBpjs"))
                {
                    var kel = Str(body, "listKelompokPajakBpjs") ?? "";
                    if (!PayrollValues.ListKelompok.Contains(kel)) { await dbTx.RollbackAsync(); return Bad("Filter kelompok Pajak/BPJS tidak valid."); }
                    line.ListKelompokPajakBpjs = kel;
                }
            }
            if (line.Label == "" && line.RowType != "COMPONENT_LIST") { await dbTx.RollbackAsync(); return Bad("Judul/label wajib diisi."); }
            await db.SaveChangesAsync();
            if (Has(body, "componentIds") || Has(body, "sumSources"))
            {
                var err = await ApplyBindingsAsync(db, line, body);
                if (err is not null) { await dbTx.RollbackAsync(); return Bad(err); }
            }
            AuditWriter.Add(db, user, "payroll", "update", "PayslipTemplateLine", id.ToString(), null, new { line.Label, line.Urutan });
            await db.SaveChangesAsync();
            await dbTx.CommitAsync();
            return Results.Ok(new { success = true });
        });

        tpl.MapDelete("/{id:int}", async (int id, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            var line = await db.PayslipTemplateLines.FirstOrDefaultAsync(x => x.Id == id);
            if (line is null) return Results.NotFound(new { success = false, message = "Baris tidak ditemukan." });
            var blocking = await db.PayslipTemplateSumBindings.Where(s => s.SourceLineId == id && s.Line.IsActive).Select(s => s.Line.Label != "" ? s.Line.Label : s.Line.RowType).Distinct().ToListAsync();
            if (blocking.Count > 0) return Bad($"Baris ini masih dipakai sebagai sumber Jumlah di: {string.Join(", ", blocking)}. Hapus/ubah itu dulu.");
            line.IsActive = false;
            AuditWriter.Add(db, user, "payroll", "delete", "PayslipTemplateLine", id.ToString(), new { line.Label }, null);
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true });
        });

        // ---------------- Data pegawai khusus Keuangan (tipe & pendidikan) ----------------
        app.MapPatch("/api/employees/{id:int}/rincian-gaji", async (int id, JsonElement body, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            var e = await db.Employees.FindAsync(id);
            if (e is null) return Results.NotFound(new { success = false, message = "Pegawai tidak ditemukan." });
            if (Has(body, "tipe"))
            {
                var tipe = Str(body, "tipe");
                if (tipe is null || !PayrollValues.EmployeeTypes.Contains(tipe)) return Bad("Tipe pegawai harus Tetap, Honorer, atau Kontrak.");
                e.Tipe = tipe;
            }
            if (Has(body, "pendidikan"))
            {
                var p = Str(body, "pendidikan");
                if (!string.IsNullOrEmpty(p) && !PayrollValues.EducationLevels.Contains(p)) return Bad("Jenjang pendidikan tidak valid.");
                e.Pendidikan = string.IsNullOrEmpty(p) ? null : p;
            }
            AuditWriter.Add(db, user, "payroll", "update", "Employee", e.Id.ToString(), null, new { e.Tipe, e.Pendidikan });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, message = "Rincian pegawai diperbarui." });
        }).RequireAuthorization(p => p.RequireRole(staffRoles));
    }

    // ------------------------------------------------------------------ helpers
    private static IResult Bad(string message) => Results.BadRequest(new { success = false, message });

    private static bool Has(JsonElement b, string k) => b.ValueKind == JsonValueKind.Object && b.TryGetProperty(k, out _);

    private static string? Str(JsonElement b, string k)
    {
        if (b.ValueKind != JsonValueKind.Object || !b.TryGetProperty(k, out var v)) return null;
        return v.ValueKind switch { JsonValueKind.String => v.GetString(), JsonValueKind.Number => v.ToString(), _ => null };
    }

    private static int? Int(JsonElement b, string k)
    {
        if (b.ValueKind != JsonValueKind.Object || !b.TryGetProperty(k, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n)) return n;
        if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out var m)) return m;
        return null;
    }

    private static decimal? Dec(JsonElement b, string k)
    {
        if (b.ValueKind != JsonValueKind.Object || !b.TryGetProperty(k, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var n)) return n;
        if (v.ValueKind == JsonValueKind.String && decimal.TryParse(v.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var m)) return m;
        return null;
    }

    private static bool? Bool(JsonElement b, string k)
    {
        if (b.ValueKind != JsonValueKind.Object || !b.TryGetProperty(k, out var v)) return null;
        return v.ValueKind switch { JsonValueKind.True => true, JsonValueKind.False => false, _ => null };
    }

    private static bool HasNum(JsonElement obj, string key) => obj.ValueKind == JsonValueKind.Object && Dec(obj, key) is not null;
    private static decimal NumOf(JsonElement obj, string key) => Dec(obj, key) ?? 0;

    // Tarif per jenjang pendidikan pegawai; tidak ada -> tarif default komponen.
    private static decimal ResolveRate(PayrollComponentType comp, Employee employee)
    {
        var r = comp.Rates.FirstOrDefault(x => x.EducationLevel == employee.Pendidikan);
        return r?.Rate ?? comp.DefaultRate;
    }

    private static decimal NetOf(PayrollItem item)
    {
        var earning = item.Lines.Where(l => l.ComponentType.Category == "EARNING").Sum(l => l.Amount);
        var deduction = item.Lines.Where(l => l.ComponentType.Category == "DEDUCTION").Sum(l => l.Amount);
        return earning - deduction;
    }

    private static async Task ApplyRatesAsync(KeuanganDbContext db, int componentId, JsonElement rates)
    {
        foreach (var prop in rates.EnumerateObject())
        {
            if (!PayrollValues.EducationLevels.Contains(prop.Name)) continue;
            var existing = await db.PayrollComponentRates.FirstOrDefaultAsync(r => r.ComponentTypeId == componentId && r.EducationLevel == prop.Name);
            var isEmpty = prop.Value.ValueKind == JsonValueKind.Null || (prop.Value.ValueKind == JsonValueKind.String && string.IsNullOrWhiteSpace(prop.Value.GetString()));
            if (isEmpty) { if (existing is not null) db.PayrollComponentRates.Remove(existing); continue; }
            var rate = prop.Value.ValueKind == JsonValueKind.Number ? prop.Value.GetDecimal()
                : decimal.TryParse(prop.Value.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var d) ? d : 0;
            if (existing is null) db.PayrollComponentRates.Add(new PayrollComponentRate { ComponentTypeId = componentId, EducationLevel = prop.Name, Rate = rate });
            else existing.Rate = rate;
        }
        await db.SaveChangesAsync();
    }

    // Ganti seluruh binding lama dgn yang baru (hapus-lalu-buat-ulang) - aman utk create & update.
    private static async Task<string?> ApplyBindingsAsync(KeuanganDbContext db, PayslipTemplateLine line, JsonElement body)
    {
        var oldComp = db.PayslipTemplateComponentBindings.Where(b => b.LineId == line.Id);
        if (line.RowType == "DATA")
        {
            var ids = body.TryGetProperty("componentIds", out var arr) && arr.ValueKind == JsonValueKind.Array
                ? arr.EnumerateArray().Select(x => x.ValueKind == JsonValueKind.Number ? x.GetInt32() : int.TryParse(x.GetString(), out var n) ? n : 0).Where(n => n > 0).Distinct().ToList()
                : [];
            if (ids.Count == 0) return "Baris Isi Data wajib punya minimal 1 sumber komponen.";
            var comps = await db.PayrollComponentTypes.Where(c => ids.Contains(c.Id)).ToListAsync();
            if (comps.Count != ids.Count) return "Salah satu komponen sumber tidak ditemukan.";
            var clash = await db.PayslipTemplateComponentBindings.Where(b => ids.Contains(b.ComponentTypeId) && b.Line.IsActive && b.LineId != line.Id)
                .Select(b => new { Komponen = b.ComponentType.Name, Baris = b.Line.Label != "" ? b.Line.Label : b.Line.RowType }).FirstOrDefaultAsync();
            if (clash is not null) return $"Komponen '{clash.Komponen}' sudah dipakai di baris '{clash.Baris}' - copot dari sana dulu.";
            db.PayslipTemplateComponentBindings.RemoveRange(oldComp);
            foreach (var c in comps) db.PayslipTemplateComponentBindings.Add(new PayslipTemplateComponentBinding { LineId = line.Id, ComponentTypeId = c.Id });
        }
        else db.PayslipTemplateComponentBindings.RemoveRange(oldComp);

        var oldSum = db.PayslipTemplateSumBindings.Where(b => b.LineId == line.Id);
        if (line.RowType == "TOTAL")
        {
            var sources = body.TryGetProperty("sumSources", out var arr) && arr.ValueKind == JsonValueKind.Array ? arr.EnumerateArray().ToList() : [];
            if (sources.Count == 0) return "Baris Jumlah wajib punya minimal 1 baris sumber.";
            var newBindings = new List<PayslipTemplateSumBinding>();
            foreach (var src in sources)
            {
                var srcId = Int(src, "lineId");
                var sign = Int(src, "sign") ?? 1;
                var srcLine = srcId is null ? null : await db.PayslipTemplateLines.FirstOrDefaultAsync(x => x.Id == srcId);
                if (srcLine is null) return "Salah satu baris sumber Jumlah tidak ditemukan.";
                if (srcLine.Id == line.Id) return "Baris Jumlah tidak boleh menjumlah dirinya sendiri.";
                if (srcLine.Urutan >= line.Urutan) return $"Baris sumber '{(srcLine.Label != "" ? srcLine.Label : srcLine.RowType)}' harus berada DI ATAS baris Jumlah ini (urutan lebih kecil).";
                if (sign != 1 && sign != -1) return "Tanda (+/-) tidak valid.";
                newBindings.Add(new PayslipTemplateSumBinding { LineId = line.Id, SourceLineId = srcLine.Id, Sign = sign });
            }
            db.PayslipTemplateSumBindings.RemoveRange(oldSum);
            db.PayslipTemplateSumBindings.AddRange(newBindings);
        }
        else db.PayslipTemplateSumBindings.RemoveRange(oldSum);

        await db.SaveChangesAsync();
        return null;
    }

    private static PayrollItemDto ItemDto(PayrollItem i) => new(
        i.EmployeeId, i.Id, i.HariMasuk, i.Keterangan, i.BiayaJabatan, i.PtkpWajibPajak, i.PajakDitanggungPemerintah,
        i.Lines.ToDictionary(l => l.ComponentType.Code, l => new PayrollLineDto(l.Amount, l.Quantity, l.IsManualOverride)),
        i.TransactionId is not null, i.Slip?.SlipNo);

    private static async Task<PayrollSettingsDto> ReadSettingsAsync(KeuanganDbContext db)
    {
        var keys = new[] { KeyExpense, KeyCash, KeySignSpv, KeySignAdm, KeyTaxGuide };
        var s = await db.SystemSettings.Where(x => keys.Contains(x.SettingKey)).ToDictionaryAsync(x => x.SettingKey, x => x.SettingValue);
        int? Id(string k) => s.TryGetValue(k, out var v) && int.TryParse(v, out var n) ? n : null;
        string? Text(string k) => s.TryGetValue(k, out var v) && !string.IsNullOrWhiteSpace(v) ? v : null;
        return new PayrollSettingsDto(Id(KeyExpense), Id(KeyCash), Text(KeySignSpv), Text(KeySignAdm), Text(KeyTaxGuide));
    }

    private static async Task<object> BuildMetaAsync(KeuanganDbContext db)
    {
        var groups = await db.PayrollComponentGroups.OrderBy(g => g.Category).ThenBy(g => g.Urutan)
            .Select(g => new { g.Id, g.Name, g.Category, g.Urutan, g.IsActive }).ToListAsync();
        // Semua tipe (termasuk nonaktif) - histori slip lama tetap perlu komponen yang sudah dinonaktifkan.
        var types = (await db.PayrollComponentTypes.Include(c => c.Rates).OrderBy(c => c.Category).ThenBy(c => c.Urutan).ToListAsync())
            .Select(c => new
            {
                c.Id, c.Code, c.Name, c.Category, c.GroupId, c.CalcMode, c.QtyLabel, c.DefaultRate, c.ShortLabel, c.SlipSection,
                c.EditRole, c.KelompokPajakBpjs, Rates = c.Rates.ToDictionary(r => r.EducationLevel, r => r.Rate), c.Urutan, c.IsActive,
            }).ToList();
        var template = (await db.PayslipTemplateLines.Where(l => l.IsActive).Include(l => l.ComponentBindings).Include(l => l.SumBindings)
                .OrderBy(l => l.Urutan).ToListAsync())
            .Select(l => new
            {
                l.Id, l.RowType, l.Label, l.Urutan, l.Bold, l.Indent, l.ListCategory, l.ListSlipSection, l.ListKelompokPajakBpjs, l.IsActive,
                ComponentIds = l.ComponentBindings.Select(b => b.ComponentTypeId).ToList(),
                SumSources = l.SumBindings.Select(b => new { LineId = b.SourceLineId, b.Sign }).ToList(),
            }).ToList();
        var employees = await db.Employees.OrderBy(e => e.Name)
            .Select(e => new { e.Id, e.HubId, e.Name, e.Nip, e.Jabatan, e.Tipe, e.Pendidikan, e.IsKepalaSekolah, Status = e.Status.ToString(), e.Katalog })
            .ToListAsync();
        return new { groups, types, template, employees, settings = await ReadSettingsAsync(db) };
    }
}

public record FinalizeRequest(string? Period, List<int>? EmployeeIds, int? ExpenseAccountId, int? CashAccountId, PaymentMethod? Method);
public record PayrollLineDto(decimal Amount, decimal? Quantity, bool IsManualOverride);
public record PayrollItemDto(int employeeId, int payrollItemId, int? hariMasuk, string keterangan, decimal? biayaJabatan, decimal? ptkpWajibPajak,
    decimal? pajakDitanggungPemerintah, Dictionary<string, PayrollLineDto> lines, bool isPaid, string? slipNo);
public record PayrollSettingsDto(int? ExpenseAccountId, int? CashAccountId, string? SignSpv, string? SignAdm, string? TaxGuideUrl);
