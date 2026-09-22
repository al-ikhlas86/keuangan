using System.Security.Claims;
using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

// Login per-akun sungguhan - FITUR BARU (Akuntansi lama/Django+React TIDAK
// punya ini sama sekali, lihat Context di plan). Endpoint minimalis pakai
// Minimal API (bukan Controller MVC penuh) - konsisten gaya Program.cs.
//
// Mode instalasi (developer/server/klien) MENENTUKAN apakah login ini
// bahkan diwajibkan:
//   - "developer": frontend TIDAK PERNAH memanggil endpoint ini, langsung
//     pakai role-switcher dropdown bebas (persis Akuntansi lama) - dicek
//     via GET /api/auth/mode di layar awal frontend.
//   - "server"/"klien": WAJIB login. Kalau tabel Users MASIH KOSONG (baru
//     pertama kali instalasi mode "server"), GET /api/auth/setup-status
//     balikin needsSetup=true, frontend arahkan ke wizard "Buat Akun Admin
//     Pertama" (POST /api/auth/setup, HANYA bisa dipanggil sekali - ditolak
//     kalau Users sudah tidak kosong lagi, mencegah race/reset diam2).
public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/auth");

        group.MapGet("/mode", (IConfiguration config) =>
        {
            var mode = config["AppSettings:Mode"] ?? "developer";
            return Results.Ok(new { success = true, data = new { mode } });
        });

        group.MapGet("/setup-status", async (KeuanganDbContext db) =>
        {
            var needsSetup = !await db.Users.AnyAsync();
            return Results.Ok(new { success = true, data = new { needsSetup } });
        });

        group.MapPost("/setup", async (SetupRequest req, KeuanganDbContext db) =>
        {
            // Ditolak KERAS kalau sudah ada 1 akun pun - wizard ini HANYA
            // utk instalasi benar-benar baru, bukan jalan pintas bikin admin
            // tambahan (itu lewat menu Kelola Pengguna, admin-only, setelah login).
            if (await db.Users.AnyAsync())
            {
                return Results.Conflict(new { success = false, message = "Sudah ada akun terdaftar - gunakan menu Kelola Pengguna (login dulu) utk menambah akun baru." });
            }
            if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password) || string.IsNullOrWhiteSpace(req.FullName))
            {
                return Results.BadRequest(new { success = false, message = "Nama, username, dan password wajib diisi." });
            }
            if (req.Password.Length < 8)
            {
                return Results.BadRequest(new { success = false, message = "Password minimal 8 karakter." });
            }

            var user = new User
            {
                Username = req.Username.Trim(),
                FullName = req.FullName.Trim(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                Role = UserRole.AdminManager, // akun pertama SELALU role tertinggi
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();

            return Results.Ok(new { success = true, message = $"Akun admin \"{user.FullName}\" berhasil dibuat - silakan login." });
        });

        group.MapPost("/login", async (LoginRequest req, KeuanganDbContext db, HttpContext http) =>
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Username == req.Username && u.IsActive);
            if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password ?? "", user.PasswordHash))
            {
                return Results.Json(new { success = false, message = "Username atau password salah." }, statusCode: 401);
            }

            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new(ClaimTypes.Name, user.Username),
                new("FullName", user.FullName),
                new(ClaimTypes.Role, user.Role.ToString()),
            };
            var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
            await http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));

            return Results.Ok(new { success = true, data = new { user.Id, user.Username, user.FullName, Role = user.Role.ToString() } });
        });

        group.MapPost("/logout", async (HttpContext http) =>
        {
            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.Ok(new { success = true });
        });

        group.MapGet("/me", [Authorize] (ClaimsPrincipal user) =>
        {
            var id = user.FindFirstValue(ClaimTypes.NameIdentifier);
            var username = user.FindFirstValue(ClaimTypes.Name);
            var fullName = user.FindFirstValue("FullName");
            var role = user.FindFirstValue(ClaimTypes.Role);
            return Results.Ok(new { success = true, data = new { id, username, fullName, role } });
        });
    }
}

public record SetupRequest(string FullName, string Username, string Password);
public record LoginRequest(string Username, string Password);
