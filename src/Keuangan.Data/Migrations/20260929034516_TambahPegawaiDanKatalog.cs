using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Keuangan.Data.Migrations
{
    /// <inheritdoc />
    public partial class TambahPegawaiDanKatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Students_Nis",
                table: "Students");

            migrationBuilder.AddColumn<string>(
                name: "Katalog",
                table: "Students",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Employees",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    HubId = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Nip = table.Column<string>(type: "TEXT", nullable: true),
                    Jabatan = table.Column<string>(type: "TEXT", nullable: true),
                    IsKepalaSekolah = table.Column<bool>(type: "INTEGER", nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    StatusKeluar = table.Column<string>(type: "TEXT", nullable: true),
                    Katalog = table.Column<string>(type: "TEXT", nullable: true),
                    SyncedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Employees", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Students_Nis",
                table: "Students",
                column: "Nis");

            migrationBuilder.CreateIndex(
                name: "IX_Employees_HubId",
                table: "Employees",
                column: "HubId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Employees");

            migrationBuilder.DropIndex(
                name: "IX_Students_Nis",
                table: "Students");

            migrationBuilder.DropColumn(
                name: "Katalog",
                table: "Students");

            migrationBuilder.CreateIndex(
                name: "IX_Students_Nis",
                table: "Students",
                column: "Nis",
                unique: true);
        }
    }
}
