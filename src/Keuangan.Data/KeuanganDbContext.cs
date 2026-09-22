using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Data;

public class KeuanganDbContext(DbContextOptions<KeuanganDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<ChartOfAccount> ChartOfAccounts => Set<ChartOfAccount>();
    public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();
    public DbSet<JournalLine> JournalLines => Set<JournalLine>();
    public DbSet<FinancialTransaction> FinancialTransactions => Set<FinancialTransaction>();
    public DbSet<DocumentSequence> DocumentSequences => Set<DocumentSequence>();
    public DbSet<DocumentNumberFormat> DocumentNumberFormats => Set<DocumentNumberFormat>();
    public DbSet<Tagihan> TagihanList => Set<Tagihan>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentReference> PaymentReferences => Set<PaymentReference>();
    public DbSet<Student> Students => Set<Student>();
    public DbSet<StudentVirtualAccount> StudentVirtualAccounts => Set<StudentVirtualAccount>();
    public DbSet<FeeType> FeeTypes => Set<FeeType>();
    public DbSet<FeeTypeRate> FeeTypeRates => Set<FeeTypeRate>();
    public DbSet<StudentFeeSubscription> StudentFeeSubscriptions => Set<StudentFeeSubscription>();
    public DbSet<PeriodClosing> PeriodClosings => Set<PeriodClosing>();
    public DbSet<RecurringBillingRun> RecurringBillingRuns => Set<RecurringBillingRun>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // --- Users ---
        b.Entity<User>().HasIndex(u => u.Username).IsUnique();

        // --- ChartOfAccount ---
        b.Entity<ChartOfAccount>().HasIndex(a => a.Code).IsUnique();

        // --- JournalEntry / JournalLine ---
        b.Entity<JournalEntry>().HasIndex(e => e.EntryNo).IsUnique();
        b.Entity<JournalEntry>().HasIndex(e => e.EntryDate);
        b.Entity<JournalEntry>()
            .HasOne(e => e.SourceTransaction)
            .WithMany(t => t.JournalEntries)
            .HasForeignKey(e => e.SourceTransactionId)
            .OnDelete(DeleteBehavior.SetNull);

        b.Entity<JournalLine>()
            .HasOne(l => l.JournalEntry)
            .WithMany(e => e.Lines)
            .HasForeignKey(l => l.JournalEntryId)
            .OnDelete(DeleteBehavior.Cascade);
        // PROTECT di Django (tidak boleh hapus akun kalau masih dipakai jurnal) ->
        // Restrict di EF Core, semantik sama.
        b.Entity<JournalLine>()
            .HasOne(l => l.Account)
            .WithMany(a => a.JournalLines)
            .HasForeignKey(l => l.AccountId)
            .OnDelete(DeleteBehavior.Restrict);
        b.Entity<JournalLine>().Property(l => l.Debit).HasPrecision(14, 2);
        b.Entity<JournalLine>().Property(l => l.Credit).HasPrecision(14, 2);

        // --- FinancialTransaction ---
        b.Entity<FinancialTransaction>().HasIndex(t => t.TxCode).IsUnique();
        b.Entity<FinancialTransaction>().HasIndex(t => t.TxDate);
        b.Entity<FinancialTransaction>().Property(t => t.Amount).HasPrecision(14, 2);
        b.Entity<FinancialTransaction>()
            .HasOne(t => t.Student).WithMany().HasForeignKey(t => t.StudentId).OnDelete(DeleteBehavior.SetNull);
        b.Entity<FinancialTransaction>()
            .HasOne(t => t.FeeType).WithMany().HasForeignKey(t => t.FeeTypeId).OnDelete(DeleteBehavior.SetNull);
        b.Entity<FinancialTransaction>()
            .HasOne(t => t.CreatedByUser).WithMany().HasForeignKey(t => t.CreatedByUserId).OnDelete(DeleteBehavior.SetNull);

        // --- DocumentSequence / DocumentNumberFormat ---
        b.Entity<DocumentSequence>().HasIndex(s => new { s.DocType, s.PeriodKey }).IsUnique();

        // --- Tagihan ---
        b.Entity<Tagihan>().HasIndex(t => t.TagihanCode).IsUnique();
        b.Entity<Tagihan>().HasIndex(t => t.DueDate);
        b.Entity<Tagihan>().Property(t => t.Amount).HasPrecision(14, 2);
        b.Entity<Tagihan>().Property(t => t.PaidAmount).HasPrecision(14, 2);
        // PROTECT di Django (siswa/jenis-bayar tidak boleh dihapus kalau masih py tagihan).
        b.Entity<Tagihan>()
            .HasOne(t => t.Student).WithMany(s => s.TagihanList).HasForeignKey(t => t.StudentId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Tagihan>()
            .HasOne(t => t.FeeType).WithMany().HasForeignKey(t => t.FeeTypeId).OnDelete(DeleteBehavior.Restrict);

        // --- Payment ---
        b.Entity<Payment>().HasIndex(p => p.PaymentCode).IsUnique();
        b.Entity<Payment>().HasIndex(p => p.PaymentDate);
        b.Entity<Payment>().Property(p => p.Amount).HasPrecision(14, 2);
        b.Entity<Payment>()
            .HasOne(p => p.Student).WithMany().HasForeignKey(p => p.StudentId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Payment>()
            .HasOne(p => p.FeeType).WithMany().HasForeignKey(p => p.FeeTypeId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Payment>()
            .HasOne(p => p.Transaction).WithMany(t => t.Payments).HasForeignKey(p => p.TransactionId).OnDelete(DeleteBehavior.SetNull);

        // Relasi GANDA Tagihan<->Payment - HARUS dikonfigurasi eksplisit dgn 2
        // FK BERBEDA supaya EF Core tidak salah tebak/gabung jadi 1 relasi:
        //   (1) Payment.TagihanId -> Tagihan.PaymentsApplied (banyak Payment per
        //       Tagihan, cicilan bertahap) - INI sumber kebenaran alokasi.
        //   (2) Tagihan.LastPaymentId -> Payment (1 pointer ke Payment TERAKHIR
        //       saja, murni cache tampilan) - relasi terpisah, TANPA collection
        //       balik (WithMany() kosong) supaya tidak dikira sama dgn relasi (1).
        b.Entity<Payment>()
            .HasOne(p => p.Tagihan).WithMany(t => t.PaymentsApplied).HasForeignKey(p => p.TagihanId).OnDelete(DeleteBehavior.SetNull);
        b.Entity<Tagihan>()
            .HasOne(t => t.LastPayment).WithMany().HasForeignKey(t => t.LastPaymentId).OnDelete(DeleteBehavior.SetNull);

        b.Entity<PaymentReference>().HasIndex(r => r.ReferenceNo).IsUnique();
        b.Entity<PaymentReference>()
            .HasOne(r => r.Payment).WithMany(p => p.References).HasForeignKey(r => r.PaymentId).OnDelete(DeleteBehavior.Cascade);

        // --- Student ---
        b.Entity<Student>().HasIndex(s => s.StudentCode).IsUnique();
        b.Entity<Student>().HasIndex(s => s.Nis).IsUnique();
        b.Entity<Student>().HasIndex(s => s.VaNumber).IsUnique();
        b.Entity<Student>().Property(s => s.MonthlyFee).HasPrecision(14, 2);
        b.Entity<Student>().Property(s => s.SemesterTotal).HasPrecision(14, 2);

        b.Entity<StudentVirtualAccount>().HasIndex(v => v.VaNumber).IsUnique();
        b.Entity<StudentVirtualAccount>()
            .HasOne(v => v.Student).WithMany(s => s.VirtualAccounts).HasForeignKey(v => v.StudentId).OnDelete(DeleteBehavior.Cascade);

        // --- FeeType / FeeTypeRate / StudentFeeSubscription ---
        b.Entity<FeeType>().HasIndex(f => f.FeeCode).IsUnique();
        b.Entity<FeeType>().Property(f => f.DefaultAmount).HasPrecision(14, 2);
        b.Entity<FeeType>().Property(f => f.CicilanMinimalPerBulan).HasPrecision(14, 2);

        b.Entity<FeeTypeRate>().HasIndex(r => new { r.FeeTypeId, r.Angkatan, r.BerlakuMulai }).IsUnique();
        b.Entity<FeeTypeRate>().Property(r => r.Nominal).HasPrecision(14, 2);
        b.Entity<FeeTypeRate>()
            .HasOne(r => r.FeeType).WithMany(f => f.Rates).HasForeignKey(r => r.FeeTypeId).OnDelete(DeleteBehavior.Cascade);

        b.Entity<StudentFeeSubscription>().HasIndex(s => new { s.StudentId, s.FeeTypeId }).IsUnique();
        b.Entity<StudentFeeSubscription>().Property(s => s.OverrideAmount).HasPrecision(14, 2);
        b.Entity<StudentFeeSubscription>()
            .HasOne(s => s.Student).WithMany(st => st.FeeSubscriptions).HasForeignKey(s => s.StudentId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<StudentFeeSubscription>()
            .HasOne(s => s.FeeType).WithMany(f => f.Subscriptions).HasForeignKey(s => s.FeeTypeId).OnDelete(DeleteBehavior.Cascade);

        // --- PeriodClosing ---
        b.Entity<PeriodClosing>().HasIndex(p => p.PeriodKey).IsUnique();
        b.Entity<PeriodClosing>().Property(p => p.TotalIncome).HasPrecision(14, 2);
        b.Entity<PeriodClosing>().Property(p => p.TotalExpense).HasPrecision(14, 2);
        b.Entity<PeriodClosing>()
            .HasOne(p => p.JournalEntry).WithMany().HasForeignKey(p => p.JournalEntryId).OnDelete(DeleteBehavior.SetNull);

        // --- RecurringBillingRun ---
        b.Entity<RecurringBillingRun>().HasIndex(r => r.PeriodLabel).IsUnique();

        // --- AuditLog ---
        b.Entity<AuditLog>().HasIndex(a => a.AuditCode).IsUnique();
        b.Entity<AuditLog>()
            .HasOne(a => a.ActorUser).WithMany().HasForeignKey(a => a.ActorUserId).OnDelete(DeleteBehavior.SetNull);
    }
}
