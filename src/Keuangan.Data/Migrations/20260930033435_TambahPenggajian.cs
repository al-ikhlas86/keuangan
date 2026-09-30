using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Keuangan.Data.Migrations
{
    /// <inheritdoc />
    public partial class TambahPenggajian : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Pendidikan",
                table: "Employees",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Tipe",
                table: "Employees",
                type: "TEXT",
                nullable: false,
                defaultValue: "Tetap");

            migrationBuilder.CreateTable(
                name: "PayrollComponentGroups",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Category = table.Column<string>(type: "TEXT", nullable: false),
                    Urutan = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollComponentGroups", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PayrollPeriods",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PeriodKey = table.Column<string>(type: "TEXT", nullable: false),
                    Status = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollPeriods", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PayslipTemplateLines",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    RowType = table.Column<string>(type: "TEXT", nullable: false),
                    Label = table.Column<string>(type: "TEXT", nullable: false),
                    Urutan = table.Column<int>(type: "INTEGER", nullable: false),
                    Bold = table.Column<bool>(type: "INTEGER", nullable: false),
                    Indent = table.Column<bool>(type: "INTEGER", nullable: false),
                    ListCategory = table.Column<string>(type: "TEXT", nullable: false),
                    ListSlipSection = table.Column<string>(type: "TEXT", nullable: false),
                    ListKelompokPajakBpjs = table.Column<string>(type: "TEXT", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayslipTemplateLines", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PayrollComponentTypes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Code = table.Column<string>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Category = table.Column<string>(type: "TEXT", nullable: false),
                    GroupId = table.Column<int>(type: "INTEGER", nullable: true),
                    CalcMode = table.Column<string>(type: "TEXT", nullable: false),
                    QtyLabel = table.Column<string>(type: "TEXT", nullable: false),
                    DefaultRate = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    ShortLabel = table.Column<string>(type: "TEXT", nullable: false),
                    SlipSection = table.Column<string>(type: "TEXT", nullable: false),
                    EditRole = table.Column<string>(type: "TEXT", nullable: false),
                    KelompokPajakBpjs = table.Column<string>(type: "TEXT", nullable: false),
                    Urutan = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollComponentTypes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayrollComponentTypes_PayrollComponentGroups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "PayrollComponentGroups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "PayrollItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PayrollPeriodId = table.Column<int>(type: "INTEGER", nullable: false),
                    EmployeeId = table.Column<int>(type: "INTEGER", nullable: false),
                    TransactionId = table.Column<int>(type: "INTEGER", nullable: true),
                    HariMasuk = table.Column<int>(type: "INTEGER", nullable: true),
                    Keterangan = table.Column<string>(type: "TEXT", nullable: false),
                    BiayaJabatan = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: true),
                    PtkpWajibPajak = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: true),
                    PajakDitanggungPemerintah = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayrollItems_Employees_EmployeeId",
                        column: x => x.EmployeeId,
                        principalTable: "Employees",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PayrollItems_FinancialTransactions_TransactionId",
                        column: x => x.TransactionId,
                        principalTable: "FinancialTransactions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PayrollItems_PayrollPeriods_PayrollPeriodId",
                        column: x => x.PayrollPeriodId,
                        principalTable: "PayrollPeriods",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PayslipTemplateSumBindings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    LineId = table.Column<int>(type: "INTEGER", nullable: false),
                    SourceLineId = table.Column<int>(type: "INTEGER", nullable: false),
                    Sign = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayslipTemplateSumBindings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayslipTemplateSumBindings_PayslipTemplateLines_LineId",
                        column: x => x.LineId,
                        principalTable: "PayslipTemplateLines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PayslipTemplateSumBindings_PayslipTemplateLines_SourceLineId",
                        column: x => x.SourceLineId,
                        principalTable: "PayslipTemplateLines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PayrollComponentRates",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ComponentTypeId = table.Column<int>(type: "INTEGER", nullable: false),
                    EducationLevel = table.Column<string>(type: "TEXT", nullable: false),
                    Rate = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollComponentRates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayrollComponentRates_PayrollComponentTypes_ComponentTypeId",
                        column: x => x.ComponentTypeId,
                        principalTable: "PayrollComponentTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PayslipTemplateComponentBindings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    LineId = table.Column<int>(type: "INTEGER", nullable: false),
                    ComponentTypeId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayslipTemplateComponentBindings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayslipTemplateComponentBindings_PayrollComponentTypes_ComponentTypeId",
                        column: x => x.ComponentTypeId,
                        principalTable: "PayrollComponentTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PayslipTemplateComponentBindings_PayslipTemplateLines_LineId",
                        column: x => x.LineId,
                        principalTable: "PayslipTemplateLines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PayrollItemLines",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PayrollItemId = table.Column<int>(type: "INTEGER", nullable: false),
                    ComponentTypeId = table.Column<int>(type: "INTEGER", nullable: false),
                    Amount = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    Quantity = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: true),
                    IsManualOverride = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollItemLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayrollItemLines_PayrollComponentTypes_ComponentTypeId",
                        column: x => x.ComponentTypeId,
                        principalTable: "PayrollComponentTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PayrollItemLines_PayrollItems_PayrollItemId",
                        column: x => x.PayrollItemId,
                        principalTable: "PayrollItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SalarySlips",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PayrollItemId = table.Column<int>(type: "INTEGER", nullable: false),
                    SlipNo = table.Column<string>(type: "TEXT", nullable: false),
                    IssuedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalarySlips", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SalarySlips_PayrollItems_PayrollItemId",
                        column: x => x.PayrollItemId,
                        principalTable: "PayrollItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PayrollComponentRates_ComponentTypeId_EducationLevel",
                table: "PayrollComponentRates",
                columns: new[] { "ComponentTypeId", "EducationLevel" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PayrollComponentTypes_Code",
                table: "PayrollComponentTypes",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PayrollComponentTypes_GroupId",
                table: "PayrollComponentTypes",
                column: "GroupId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollItemLines_ComponentTypeId",
                table: "PayrollItemLines",
                column: "ComponentTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollItemLines_PayrollItemId_ComponentTypeId",
                table: "PayrollItemLines",
                columns: new[] { "PayrollItemId", "ComponentTypeId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PayrollItems_EmployeeId",
                table: "PayrollItems",
                column: "EmployeeId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollItems_PayrollPeriodId_EmployeeId",
                table: "PayrollItems",
                columns: new[] { "PayrollPeriodId", "EmployeeId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PayrollItems_TransactionId",
                table: "PayrollItems",
                column: "TransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollPeriods_PeriodKey",
                table: "PayrollPeriods",
                column: "PeriodKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PayslipTemplateComponentBindings_ComponentTypeId",
                table: "PayslipTemplateComponentBindings",
                column: "ComponentTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_PayslipTemplateComponentBindings_LineId",
                table: "PayslipTemplateComponentBindings",
                column: "LineId");

            migrationBuilder.CreateIndex(
                name: "IX_PayslipTemplateSumBindings_LineId",
                table: "PayslipTemplateSumBindings",
                column: "LineId");

            migrationBuilder.CreateIndex(
                name: "IX_PayslipTemplateSumBindings_SourceLineId",
                table: "PayslipTemplateSumBindings",
                column: "SourceLineId");

            migrationBuilder.CreateIndex(
                name: "IX_SalarySlips_PayrollItemId",
                table: "SalarySlips",
                column: "PayrollItemId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalarySlips_SlipNo",
                table: "SalarySlips",
                column: "SlipNo",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PayrollComponentRates");

            migrationBuilder.DropTable(
                name: "PayrollItemLines");

            migrationBuilder.DropTable(
                name: "PayslipTemplateComponentBindings");

            migrationBuilder.DropTable(
                name: "PayslipTemplateSumBindings");

            migrationBuilder.DropTable(
                name: "SalarySlips");

            migrationBuilder.DropTable(
                name: "PayrollComponentTypes");

            migrationBuilder.DropTable(
                name: "PayslipTemplateLines");

            migrationBuilder.DropTable(
                name: "PayrollItems");

            migrationBuilder.DropTable(
                name: "PayrollComponentGroups");

            migrationBuilder.DropTable(
                name: "PayrollPeriods");

            migrationBuilder.DropColumn(
                name: "Pendidikan",
                table: "Employees");

            migrationBuilder.DropColumn(
                name: "Tipe",
                table: "Employees");
        }
    }
}
