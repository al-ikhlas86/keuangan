using System.Globalization;
using System.Security.Claims;
using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

// Validasi pembayaran (maker-checker) + setoran saldo + rekonsiliasi bank - port dari Akuntansi
// (apps/dashboard/api/allocation_proposals.py, keringanan.py, api_views.py bank_lines_*).
//
// Saldo siswa = SUM(transaksi kas MASUK atas nama siswa) - SUM(Payment yg BUKAN Keringanan).
// Keringanan bukan uang sungguhan, jadi tidak boleh ikut mengurangi saldo.
//   - Setoran saldo (deposit)  : uang masuk tanpa dialokasikan ke tagihan -> menambah saldo
//   - Usulan alokasi + validasi: saldo dipakai melunasi tagihan (Payment method=Saldo, tanpa jurnal baru)
//   - Usulan keringanan        : hanya AdminManager yg boleh menyetujui (Payment method=Keringanan)
public static class ValidationEndpoints
{
    private static readonly string[] BulanId = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    public static void MapValidationEndpoints(this WebApplication app)
    {
        var finance = new[] { UserRole.AdminManager.ToString(), UserRole.Kasir.ToString(), UserRole.Akuntansi.ToString() };
        var admin = UserRole.AdminManager.ToString();
        var bankRoles = new[] { UserRole.AdminManager.ToString(), UserRole.Akuntansi.ToString() };

        // ---------------- Saldo siswa & setoran saldo ----------------
        var pay = app.MapGroup("/api/payments").RequireAuthorization();

        pay.MapGet("/saldo/{studentId:int}", async (int studentId, KeuanganDbContext db) =>
            Results.Ok(new { success = true, data = new { saldo = await SaldoAsync(db, studentId) } }));

        // Setoran saldo ("bayar di muka" / titip): uang MASUK atas nama siswa tanpa dialokasikan ke tagihan.
        pay.MapPost("/deposit", async (DepositRequest req, KeuanganDbContext db, DocumentNumberService docNum, ClaimsPrincipal user) =>
        {
            if (req.Amount <= 0) return Bad("Nominal harus lebih dari 0.");
            if (req.Method is not (PaymentReceiveMethod.Cash or PaymentReceiveMethod.Transfer)) return Bad("Setoran saldo hanya lewat Cash atau Transfer.");
            if (!await db.Students.AnyAsync(s => s.Id == req.StudentId)) return Results.NotFound(new { success = false, message = "Siswa tidak ditemukan." });
            var lines = req.JournalLines;
            if (lines is null || lines.Count == 0) return Bad("Baris jurnal (debit/kredit) wajib diisi.");
            if (lines.Sum(l => l.Debit) != lines.Sum(l => l.Credit)) return Bad("Jurnal tidak seimbang - total debit harus sama dengan total kredit.");
            if (lines.Sum(l => l.Debit) != req.Amount) return Bad("Total jurnal harus sama dengan nominal setoran.");
            var accountIds = lines.Select(l => l.AccountId).Distinct().ToList();
            if (await db.ChartOfAccounts.CountAsync(a => accountIds.Contains(a.Id)) != accountIds.Count) return Bad("Ada akun di baris jurnal yang tidak ditemukan.");

            var date = req.PaymentDate;
            var desc = string.IsNullOrWhiteSpace(req.Description) ? "Setoran saldo siswa" : req.Description.Trim();
            var uid = int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var u) && u > 0 ? u : (int?)null;
            await using var dbTx = await db.Database.BeginTransactionAsync();
            var tx = new FinancialTransaction
            {
                TxCode = await docNum.NextAsync(DocType.TRX, date), TxDate = date, Description = desc, TxType = TxType.Masuk,
                PaymentMethod = req.Method == PaymentReceiveMethod.Transfer ? PaymentMethod.Transfer : PaymentMethod.Cash,
                Amount = req.Amount, StudentId = req.StudentId, CreatedByUserId = uid,
            };
            db.FinancialTransactions.Add(tx);
            await db.SaveChangesAsync();
            var je = new JournalEntry { EntryNo = await docNum.NextAsync(DocType.JE, date), EntryDate = date, Memo = desc, SourceTransactionId = tx.Id };
            foreach (var l in lines) je.Lines.Add(new JournalLine { AccountId = l.AccountId, Debit = l.Debit, Credit = l.Credit, Description = l.Description });
            db.JournalEntries.Add(je);
            AuditWriter.Add(db, user, "finance", "deposit", "FinancialTransaction", tx.TxCode, null, new { req.StudentId, req.Amount });
            await db.SaveChangesAsync();
            await dbTx.CommitAsync();
            return Results.Ok(new { success = true, data = new { tx.TxCode, saldo = await SaldoAsync(db, req.StudentId) } });
        });

        // ---------------- Usulan alokasi saldo ----------------
        var alloc = app.MapGroup("/api/allocation-proposals").RequireAuthorization(p => p.RequireRole(finance));

        alloc.MapGet("/", async (string? status, KeuanganDbContext db) =>
        {
            var q = db.PaymentAllocationProposals.Include(p => p.Student).Include(p => p.Items).ThenInclude(i => i.Tagihan).ThenInclude(t => t.FeeType).AsQueryable();
            if (!string.IsNullOrEmpty(status)) q = q.Where(p => p.Status == status);
            var list = await q.OrderByDescending(p => p.CreatedAt).Take(200).ToListAsync();
            var saldoByStudent = new Dictionary<int, decimal>();
            foreach (var sid in list.Select(p => p.StudentId).Distinct()) saldoByStudent[sid] = await SaldoAsync(db, sid);
            return Results.Ok(new { success = true, data = list.Select(p => new
            {
                p.Id, p.StudentId, studentName = p.Student.Name, nis = p.Student.Nis, p.Status, p.Note, p.ProposedByRole, p.ValidatedByRole, p.ValidatedAt, p.CreatedAt,
                totalAmount = p.Items.Sum(i => i.Amount), saldo = saldoByStudent[p.StudentId],
                items = p.Items.Select(i => new { i.TagihanId, feeName = i.Tagihan.FeeType.Name, periodLabel = i.Tagihan.PeriodLabel, i.Amount, tagihanTotal = i.Tagihan.Amount, tagihanStatus = i.Tagihan.Status.ToString() }),
            }) });
        });

        alloc.MapPost("/", async (AllocationProposalRequest req, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            var student = await db.Students.FindAsync(req.StudentId);
            if (student is null) return Bad("Siswa tidak ditemukan.");
            if (req.Items is null || req.Items.Count == 0) return Bad("Minimal 1 tagihan yang diusulkan wajib diisi.");

            var resolved = new List<(Tagihan T, decimal Amount)>();
            decimal total = 0;
            foreach (var raw in req.Items)
            {
                var t = await db.TagihanList.Include(x => x.FeeType).FirstOrDefaultAsync(x => x.Id == raw.TagihanId && x.StudentId == student.Id);
                if (t is null) return Bad("Salah satu tagihan pada usulan tidak ditemukan untuk siswa ini.");
                if (t.Status == TagihanStatus.Lunas) return Bad($"Tagihan {t.FeeType.Name} - {t.PeriodLabel} sudah lunas.");
                var sisa = t.Amount - t.PaidAmount;
                if (raw.Amount <= 0 || raw.Amount > sisa) return Bad($"Nominal untuk {t.FeeType.Name} - {t.PeriodLabel} harus antara 0 dan sisa tagihan ({sisa:N0}).");
                resolved.Add((t, raw.Amount));
                total += raw.Amount;
            }
            var saldo = await SaldoAsync(db, student.Id);
            if (total > saldo) return Bad($"Total usulan ({total:N0}) melebihi saldo siswa yang tersedia ({saldo:N0}).");

            var proposal = new PaymentAllocationProposal { StudentId = student.Id, Note = req.Note?.Trim() ?? "", ProposedByRole = RoleOf(user) };
            foreach (var (t, amount) in resolved) proposal.Items.Add(new PaymentAllocationProposalItem { TagihanId = t.Id, Amount = amount });
            db.PaymentAllocationProposals.Add(proposal);
            AuditWriter.Add(db, user, "finance", "create", "PaymentAllocationProposal", null, null, new { student = student.Name, total, items = resolved.Count });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { proposal.Id } });
        });

        alloc.MapPost("/{id:int}/validate", async (int id, KeuanganDbContext db, DocumentNumberService docNum, TagihanService tagihanService, ClaimsPrincipal user) =>
        {
            var proposal = await db.PaymentAllocationProposals.Include(p => p.Student).Include(p => p.Items).ThenInclude(i => i.Tagihan).ThenInclude(t => t.FeeType).FirstOrDefaultAsync(p => p.Id == id);
            if (proposal is null) return Results.NotFound(new { success = false, message = "Usulan tidak ditemukan." });
            if (proposal.Status != "PENDING") return Bad("Usulan ini sudah diputuskan sebelumnya.");
            if (proposal.Items.Count == 0) return Bad("Usulan ini tidak punya item.");

            // Cek ulang saat validasi - saldo/tagihan bisa berubah sejak usulan dibuat.
            var total = proposal.Items.Sum(i => i.Amount);
            var saldo = await SaldoAsync(db, proposal.StudentId);
            if (total > saldo) return Bad($"Saldo siswa tidak lagi cukup (sisa saldo {saldo:N0}, usulan {total:N0}) - sudah terpakai di tempat lain?");
            foreach (var item in proposal.Items)
            {
                var sisa = item.Tagihan.Amount - item.Tagihan.PaidAmount;
                if (item.Tagihan.Status == TagihanStatus.Lunas || item.Amount > sisa)
                    return Bad($"Tagihan {item.Tagihan.FeeType.Name} - {item.Tagihan.PeriodLabel} sudah berubah, tidak bisa lagi menampung {item.Amount:N0}.");
            }

            var today = DateOnly.FromDateTime(DateTime.Now);
            await using var dbTx = await db.Database.BeginTransactionAsync();
            foreach (var item in proposal.Items)
            {
                db.Payments.Add(new Payment
                {
                    PaymentCode = await docNum.NextAsync(DocType.PAY, today), StudentId = proposal.StudentId, FeeTypeId = item.Tagihan.FeeTypeId,
                    PaymentDate = today, PeriodLabel = item.Tagihan.PeriodLabel, Method = PaymentReceiveMethod.Saldo, Amount = item.Amount, TagihanId = item.TagihanId,
                    Description = $"Validasi usulan alokasi - {item.Tagihan.FeeType.Name} - {item.Tagihan.PeriodLabel}",
                });
                await db.SaveChangesAsync();
                await tagihanService.RecomputeStatusAsync(item.TagihanId);
            }
            proposal.Status = "VALIDATED";
            proposal.ValidatedByRole = RoleOf(user);
            proposal.ValidatedAt = DateTime.UtcNow;
            AuditWriter.Add(db, user, "finance", "validate", "PaymentAllocationProposal", id.ToString(), new { status = "PENDING" }, new { status = "VALIDATED", total });
            await db.SaveChangesAsync();
            await dbTx.CommitAsync();
            return Results.Ok(new { success = true, data = new { proposal.Status } });
        });

        alloc.MapPost("/{id:int}/reject", async (int id, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            var p = await db.PaymentAllocationProposals.FindAsync(id);
            if (p is null) return Results.NotFound(new { success = false, message = "Usulan tidak ditemukan." });
            if (p.Status != "PENDING") return Bad("Usulan ini sudah diputuskan sebelumnya.");
            p.Status = "REJECTED"; p.ValidatedByRole = RoleOf(user); p.ValidatedAt = DateTime.UtcNow;
            AuditWriter.Add(db, user, "finance", "reject", "PaymentAllocationProposal", id.ToString(), new { status = "PENDING" }, new { status = "REJECTED" });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { p.Status } });
        });

        // ---------------- Usulan keringanan ----------------
        var ker = app.MapGroup("/api/keringanan-proposals").RequireAuthorization(p => p.RequireRole(finance));

        ker.MapGet("/", async (string? status, KeuanganDbContext db) =>
        {
            var q = db.KeringananProposals.Include(p => p.Student).Include(p => p.FeeType).Include(p => p.Items).ThenInclude(i => i.Tagihan).AsQueryable();
            if (!string.IsNullOrEmpty(status)) q = q.Where(p => p.Status == status);
            var list = await q.OrderByDescending(p => p.CreatedAt).Take(200).ToListAsync();
            return Results.Ok(new { success = true, data = list.Select(p => new
            {
                p.Id, p.StudentId, studentName = p.Student.Name, nis = p.Student.Nis, p.FeeTypeId, feeTypeName = p.FeeType.Name, p.Reason, p.Status,
                p.ProposedByRole, p.DecidedByRole, p.DecidedAt, p.CreatedAt, totalAmount = p.Items.Sum(i => i.Tagihan.Amount),
                items = p.Items.Select(i => new { i.TagihanId, periodLabel = i.Tagihan.PeriodLabel, amount = i.Tagihan.Amount, tagihanStatus = i.Tagihan.Status.ToString() }),
            }) });
        });

        ker.MapPost("/", async (KeringananRequest req, KeuanganDbContext db, DocumentNumberService docNum, ClaimsPrincipal user) =>
        {
            var student = await db.Students.FindAsync(req.StudentId);
            if (student is null) return Bad("Siswa tidak ditemukan.");
            var fee = await db.FeeTypes.Include(f => f.Rates).FirstOrDefaultAsync(f => f.Id == req.FeeTypeId);
            if (fee is null) return Bad("Jenis pembayaran tidak ditemukan.");
            if (fee.Frekuensi != FeeFrekuensi.Bulanan) return Bad("Keringanan cuma berlaku untuk jenis pembayaran bulanan (mis. SPP).");
            if (string.IsNullOrWhiteSpace(req.Reason)) return Bad("Alasan wajib diisi.");
            if (req.PeriodLabels is null || req.PeriodLabels.Count == 0) return Bad("Minimal 1 periode yang diusulkan wajib diisi.");

            await using var dbTx = await db.Database.BeginTransactionAsync();
            var tagihanList = new List<Tagihan>();
            foreach (var raw in req.PeriodLabels.Select(p => (p ?? "").Trim()).Distinct())
            {
                if (raw == "") { await dbTx.RollbackAsync(); return Bad("Salah satu periode kosong/tidak valid."); }
                var amount = await ResolveAmountAsync(db, student, fee, raw);
                if (amount is null) { await dbTx.RollbackAsync(); return Bad($"Periode \"{raw}\" tidak valid (format contoh: Juli 2026)."); }
                var tagihan = await db.TagihanList.FirstOrDefaultAsync(t => t.StudentId == student.Id && t.FeeTypeId == fee.Id && t.PeriodLabel == raw);
                if (tagihan is null)
                {
                    // Dibuat SEKARANG (Belum Dibayar) - transparan di menu Tagihan sebelum keringanan disetujui.
                    tagihan = new Tagihan { TagihanCode = await docNum.NextAsync(DocType.TAG, DateOnly.FromDateTime(DateTime.Now)), StudentId = student.Id, FeeTypeId = fee.Id, PeriodLabel = raw, Amount = amount.Value };
                    db.TagihanList.Add(tagihan);
                    await db.SaveChangesAsync();
                }
                else if (tagihan.Status == TagihanStatus.Lunas)
                {
                    await dbTx.RollbackAsync();
                    return Bad($"Tagihan {fee.Name} - {raw} sudah lunas, tidak perlu diusulkan keringanan.");
                }
                tagihanList.Add(tagihan);
            }
            var proposal = new KeringananProposal { StudentId = student.Id, FeeTypeId = fee.Id, Reason = req.Reason.Trim(), ProposedByRole = RoleOf(user) };
            foreach (var t in tagihanList) proposal.Items.Add(new KeringananProposalItem { TagihanId = t.Id });
            db.KeringananProposals.Add(proposal);
            AuditWriter.Add(db, user, "finance", "create", "KeringananProposal", null, null, new { student = student.Name, fee = fee.Name, periods = req.PeriodLabels, reason = req.Reason });
            await db.SaveChangesAsync();
            await dbTx.CommitAsync();
            return Results.Ok(new { success = true, data = new { proposal.Id } });
        });

        ker.MapPost("/{id:int}/validate", async (int id, KeuanganDbContext db, DocumentNumberService docNum, TagihanService tagihanService, ClaimsPrincipal user) =>
        {
            if (!user.IsInRole(admin)) return Results.Json(new { success = false, message = "Butuh izin Admin/Supervisor untuk menyetujui/menolak keringanan." }, statusCode: 403);
            var proposal = await db.KeringananProposals.Include(p => p.Items).ThenInclude(i => i.Tagihan).ThenInclude(t => t.FeeType).FirstOrDefaultAsync(p => p.Id == id);
            if (proposal is null) return Results.NotFound(new { success = false, message = "Usulan tidak ditemukan." });
            if (proposal.Status != "PENDING") return Bad("Usulan ini sudah diputuskan sebelumnya.");

            var today = DateOnly.FromDateTime(DateTime.Now);
            var dibebaskan = 0;
            await using var dbTx = await db.Database.BeginTransactionAsync();
            foreach (var item in proposal.Items)
            {
                var t = item.Tagihan;
                if (t.Status == TagihanStatus.Lunas) continue; // sudah lunas lewat jalur lain - tidak dobel catat
                var waived = t.Amount - t.PaidAmount;
                db.Payments.Add(new Payment
                {
                    PaymentCode = await docNum.NextAsync(DocType.PAY, today), StudentId = proposal.StudentId, FeeTypeId = t.FeeTypeId, PaymentDate = today,
                    PeriodLabel = t.PeriodLabel, Method = PaymentReceiveMethod.Keringanan, Amount = waived, TagihanId = t.Id,
                    Description = $"Keringanan - {t.FeeType.Name} - {t.PeriodLabel} - {proposal.Reason}",
                });
                await db.SaveChangesAsync();
                await tagihanService.RecomputeStatusAsync(t.Id);
                dibebaskan++;
            }
            proposal.Status = "APPROVED"; proposal.DecidedByRole = RoleOf(user); proposal.DecidedAt = DateTime.UtcNow;
            AuditWriter.Add(db, user, "finance", "approve", "KeringananProposal", id.ToString(), new { status = "PENDING" }, new { status = "APPROVED", dibebaskan });
            await db.SaveChangesAsync();
            await dbTx.CommitAsync();
            return Results.Ok(new { success = true, data = new { proposal.Status, dibebaskan } });
        });

        ker.MapPost("/{id:int}/reject", async (int id, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            if (!user.IsInRole(admin)) return Results.Json(new { success = false, message = "Butuh izin Admin/Supervisor untuk menyetujui/menolak keringanan." }, statusCode: 403);
            var p = await db.KeringananProposals.FindAsync(id);
            if (p is null) return Results.NotFound(new { success = false, message = "Usulan tidak ditemukan." });
            if (p.Status != "PENDING") return Bad("Usulan ini sudah diputuskan sebelumnya.");
            // Tagihannya TIDAK disentuh - tetap terbuka seperti tagihan normal.
            p.Status = "REJECTED"; p.DecidedByRole = RoleOf(user); p.DecidedAt = DateTime.UtcNow;
            AuditWriter.Add(db, user, "finance", "reject", "KeringananProposal", id.ToString(), new { status = "PENDING" }, new { status = "REJECTED" });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { p.Status } });
        });

        // ---------------- Rekonsiliasi bank ----------------
        var bank = app.MapGroup("/api/bank-lines").RequireAuthorization(p => p.RequireRole(bankRoles));

        bank.MapGet("/", async (KeuanganDbContext db) =>
        {
            var data = await db.BankStatementLines.Include(l => l.MatchedTransaction).OrderByDescending(l => l.BankDate).ThenByDescending(l => l.Id)
                .Select(l => new { l.Id, l.BankDate, l.Description, l.Amount, l.PeriodKey, l.MatchedTransactionId, matchedTxCode = l.MatchedTransaction != null ? l.MatchedTransaction.TxCode : null })
                .ToListAsync();
            return Results.Ok(new { success = true, data });
        });

        bank.MapPost("/", async (BankLineRequest req, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            if (string.IsNullOrWhiteSpace(req.Description)) return Bad("Keterangan wajib diisi.");
            if (req.Amount == 0) return Bad("Nominal tidak boleh nol.");
            var line = new BankStatementLine { BankDate = req.BankDate, Description = req.Description.Trim(), Amount = req.Amount, PeriodKey = req.BankDate.ToString("yyyy-MM", CultureInfo.InvariantCulture) };
            db.BankStatementLines.Add(line);
            AuditWriter.Add(db, user, "finance", "create", "BankStatementLine", null, null, new { line.BankDate, line.Description, line.Amount });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { line.Id } });
        });

        bank.MapDelete("/{id:int}", async (int id, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            if (!user.IsInRole(admin)) return Results.Json(new { success = false, message = "Hanya Admin/Supervisor yang boleh menghapus mutasi bank." }, statusCode: 403);
            var line = await db.BankStatementLines.FindAsync(id);
            if (line is null) return Results.NotFound(new { success = false, message = "Baris mutasi tidak ditemukan." });
            AuditWriter.Add(db, user, "finance", "delete", "BankStatementLine", id.ToString(), new { line.Description, line.Amount }, null);
            db.BankStatementLines.Remove(line);
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true });
        });

        // Cocokkan mutasi ke transaksi (transactionId null = batalkan). Lebih ketat dari Akuntansi:
        // 1 transaksi hanya boleh dicocokkan ke 1 mutasi, dan nominalnya harus sama.
        bank.MapPost("/{id:int}/match", async (int id, MatchRequest req, KeuanganDbContext db, ClaimsPrincipal user) =>
        {
            var line = await db.BankStatementLines.FindAsync(id);
            if (line is null) return Results.NotFound(new { success = false, message = "Baris mutasi tidak ditemukan." });
            if (req.TransactionId is null)
            {
                line.MatchedTransactionId = null;
                AuditWriter.Add(db, user, "finance", "unmatch_bank_line", "BankStatementLine", id.ToString(), null, null);
                await db.SaveChangesAsync();
                return Results.Ok(new { success = true, data = new { matched = false } });
            }
            var tx = await db.FinancialTransactions.FindAsync(req.TransactionId);
            if (tx is null) return Bad("Transaksi tidak ditemukan.");
            if (Math.Abs(tx.Amount - Math.Abs(line.Amount)) > 0.01m) return Bad($"Nominal tidak sama - mutasi {Math.Abs(line.Amount):N0}, transaksi {tx.Amount:N0}.");
            if (await db.BankStatementLines.AnyAsync(l => l.MatchedTransactionId == tx.Id && l.Id != id))
                return Results.Conflict(new { success = false, message = $"Transaksi {tx.TxCode} sudah dicocokkan ke mutasi lain." });
            line.MatchedTransactionId = tx.Id;
            AuditWriter.Add(db, user, "finance", "match_bank_line", "BankStatementLine", id.ToString(), null, new { tx.TxCode });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { matched = true } });
        });
    }

    // ------------------------------------------------------------------ helper
    private static IResult Bad(string message) => Results.BadRequest(new { success = false, message });

    private static string RoleOf(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.Role) ?? "";

    public static async Task<decimal> SaldoAsync(KeuanganDbContext db, int studentId)
    {
        var masuk = await db.FinancialTransactions.Where(t => t.StudentId == studentId && t.TxType == TxType.Masuk).SumAsync(t => (decimal?)t.Amount) ?? 0m;
        var dialokasikan = await db.Payments.Where(p => p.StudentId == studentId && p.Method != PaymentReceiveMethod.Keringanan).SumAsync(p => (decimal?)p.Amount) ?? 0m;
        return masuk - dialokasikan;
    }

    // Urutan resolusi nominal tagihan (sama dgn Akuntansi _resolve_amount): 1) override langganan siswa,
    // 2) tarif angkatan yang berlaku pada periode, 3) nominal default jenis pembayaran. null = periode tak valid.
    private static async Task<decimal?> ResolveAmountAsync(KeuanganDbContext db, Student student, FeeType fee, string periodLabel)
    {
        var parts = periodLabel.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 2 || Array.IndexOf(BulanId, parts[0]) < 0 || !int.TryParse(parts[1], out var year)) return null;
        var target = new DateOnly(year, Array.IndexOf(BulanId, parts[0]) + 1, 1);

        var sub = await db.StudentFeeSubscriptions.FirstOrDefaultAsync(s => s.StudentId == student.Id && s.FeeTypeId == fee.Id);
        if (sub?.OverrideAmount is { } o) return o;
        if (fee.UsesAngkatanRate && !string.IsNullOrWhiteSpace(student.Angkatan))
        {
            var rate = await db.FeeTypeRates.Where(r => r.FeeTypeId == fee.Id && r.Angkatan == student.Angkatan && r.BerlakuMulai <= target)
                .OrderByDescending(r => r.BerlakuMulai).FirstOrDefaultAsync();
            if (rate is not null) return rate.Nominal;
        }
        return fee.DefaultAmount;
    }
}

public record DepositRequest(int StudentId, DateOnly PaymentDate, PaymentReceiveMethod Method, decimal Amount, List<JournalLineInput>? JournalLines, string? Description);
public record AllocationItemRequest(int TagihanId, decimal Amount);
public record AllocationProposalRequest(int StudentId, List<AllocationItemRequest>? Items, string? Note);
public record KeringananRequest(int StudentId, int FeeTypeId, List<string>? PeriodLabels, string? Reason);
public record BankLineRequest(DateOnly BankDate, string? Description, decimal Amount);
public record MatchRequest(int? TransactionId);
