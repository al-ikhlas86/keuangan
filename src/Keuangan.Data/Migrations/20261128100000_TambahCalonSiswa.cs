using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Keuangan.Data.Migrations
{
    /// <summary>
    /// Calon siswa dari PSB (2026-11-28): Students.PsbId (id pendaftar di webview, unik) dan Students.AwalDibuatAt (tagihan awal dibuat sekali).
    /// Ditulis tangan (model snapshot disunting selaras); kecocokannya dijaga tes HasPendingModelChanges.
    /// </summary>
    [DbContext(typeof(KeuanganDbContext))]
    [Migration("20261128100000_TambahCalonSiswa")]
    public partial class TambahCalonSiswa : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(name: "AwalDibuatAt", table: "Students", type: "TEXT", nullable: true);
            migrationBuilder.AddColumn<int>(name: "PsbId", table: "Students", type: "INTEGER", nullable: true);
            migrationBuilder.CreateIndex(name: "IX_Students_PsbId", table: "Students", column: "PsbId", unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_Students_PsbId", table: "Students");
            migrationBuilder.DropColumn(name: "PsbId", table: "Students");
            migrationBuilder.DropColumn(name: "AwalDibuatAt", table: "Students");
        }
    }
}
