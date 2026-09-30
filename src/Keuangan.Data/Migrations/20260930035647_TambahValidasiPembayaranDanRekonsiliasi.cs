using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Keuangan.Data.Migrations
{
    /// <inheritdoc />
    public partial class TambahValidasiPembayaranDanRekonsiliasi : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BankStatementLines",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    BankDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Description = table.Column<string>(type: "TEXT", nullable: false),
                    Amount = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    PeriodKey = table.Column<string>(type: "TEXT", nullable: false),
                    MatchedTransactionId = table.Column<int>(type: "INTEGER", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BankStatementLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BankStatementLines_FinancialTransactions_MatchedTransactionId",
                        column: x => x.MatchedTransactionId,
                        principalTable: "FinancialTransactions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "KeringananProposals",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    StudentId = table.Column<int>(type: "INTEGER", nullable: false),
                    FeeTypeId = table.Column<int>(type: "INTEGER", nullable: false),
                    Reason = table.Column<string>(type: "TEXT", nullable: false),
                    Status = table.Column<string>(type: "TEXT", nullable: false),
                    ProposedByRole = table.Column<string>(type: "TEXT", nullable: false),
                    DecidedByRole = table.Column<string>(type: "TEXT", nullable: true),
                    DecidedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KeringananProposals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KeringananProposals_FeeTypes_FeeTypeId",
                        column: x => x.FeeTypeId,
                        principalTable: "FeeTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_KeringananProposals_Students_StudentId",
                        column: x => x.StudentId,
                        principalTable: "Students",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PaymentAllocationProposals",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    StudentId = table.Column<int>(type: "INTEGER", nullable: false),
                    Status = table.Column<string>(type: "TEXT", nullable: false),
                    Note = table.Column<string>(type: "TEXT", nullable: false),
                    ProposedByRole = table.Column<string>(type: "TEXT", nullable: false),
                    ValidatedByRole = table.Column<string>(type: "TEXT", nullable: true),
                    ValidatedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentAllocationProposals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentAllocationProposals_Students_StudentId",
                        column: x => x.StudentId,
                        principalTable: "Students",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "KeringananProposalItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ProposalId = table.Column<int>(type: "INTEGER", nullable: false),
                    TagihanId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KeringananProposalItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KeringananProposalItems_KeringananProposals_ProposalId",
                        column: x => x.ProposalId,
                        principalTable: "KeringananProposals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_KeringananProposalItems_TagihanList_TagihanId",
                        column: x => x.TagihanId,
                        principalTable: "TagihanList",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PaymentAllocationProposalItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ProposalId = table.Column<int>(type: "INTEGER", nullable: false),
                    TagihanId = table.Column<int>(type: "INTEGER", nullable: false),
                    Amount = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentAllocationProposalItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentAllocationProposalItems_PaymentAllocationProposals_ProposalId",
                        column: x => x.ProposalId,
                        principalTable: "PaymentAllocationProposals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PaymentAllocationProposalItems_TagihanList_TagihanId",
                        column: x => x.TagihanId,
                        principalTable: "TagihanList",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementLines_MatchedTransactionId",
                table: "BankStatementLines",
                column: "MatchedTransactionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementLines_PeriodKey",
                table: "BankStatementLines",
                column: "PeriodKey");

            migrationBuilder.CreateIndex(
                name: "IX_KeringananProposalItems_ProposalId",
                table: "KeringananProposalItems",
                column: "ProposalId");

            migrationBuilder.CreateIndex(
                name: "IX_KeringananProposalItems_TagihanId",
                table: "KeringananProposalItems",
                column: "TagihanId");

            migrationBuilder.CreateIndex(
                name: "IX_KeringananProposals_FeeTypeId",
                table: "KeringananProposals",
                column: "FeeTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_KeringananProposals_Status",
                table: "KeringananProposals",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_KeringananProposals_StudentId",
                table: "KeringananProposals",
                column: "StudentId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAllocationProposalItems_ProposalId",
                table: "PaymentAllocationProposalItems",
                column: "ProposalId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAllocationProposalItems_TagihanId",
                table: "PaymentAllocationProposalItems",
                column: "TagihanId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAllocationProposals_Status",
                table: "PaymentAllocationProposals",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAllocationProposals_StudentId",
                table: "PaymentAllocationProposals",
                column: "StudentId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BankStatementLines");

            migrationBuilder.DropTable(
                name: "KeringananProposalItems");

            migrationBuilder.DropTable(
                name: "PaymentAllocationProposalItems");

            migrationBuilder.DropTable(
                name: "KeringananProposals");

            migrationBuilder.DropTable(
                name: "PaymentAllocationProposals");
        }
    }
}
