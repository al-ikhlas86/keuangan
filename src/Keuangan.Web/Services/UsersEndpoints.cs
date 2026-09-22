using Keuangan.Data;
using Keuangan.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Keuangan.Web.Services;

// Kelola Pengguna - GANTI Peran.tsx lama Akuntansi (permission matrix
// generik) - di sini murni kelola akun+role tetap (4, lihat Enums.cs),
// admin-only (RequireAuthorization(nameof(UserRole.AdminManager))).
public static class UsersEndpoints
{
    public static void MapUsersEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/users").RequireAuthorization(policy => policy.RequireRole(UserRole.AdminManager.ToString()));

        group.MapGet("/", async (KeuanganDbContext db) =>
        {
            var users = await db.Users
                .OrderBy(u => u.FullName)
                .Select(u => new { u.Id, u.Username, u.FullName, Role = u.Role.ToString(), u.IsActive, u.CreatedAt })
                .ToListAsync();
            return Results.Ok(new { success = true, data = users });
        });

        group.MapPost("/", async (CreateUserRequest req, KeuanganDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password) || string.IsNullOrWhiteSpace(req.FullName))
            {
                return Results.BadRequest(new { success = false, message = "Nama, username, dan password wajib diisi." });
            }
            if (req.Password.Length < 8)
            {
                return Results.BadRequest(new { success = false, message = "Password minimal 8 karakter." });
            }
            if (await db.Users.AnyAsync(u => u.Username == req.Username.Trim()))
            {
                return Results.Conflict(new { success = false, message = "Username sudah dipakai." });
            }

            var user = new User
            {
                Username = req.Username.Trim(),
                FullName = req.FullName.Trim(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                Role = req.Role,
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, data = new { user.Id } });
        });

        group.MapPatch("/{id:int}", async (int id, UpdateUserRequest req, KeuanganDbContext db) =>
        {
            var user = await db.Users.FindAsync(id);
            if (user is null) return Results.NotFound(new { success = false, message = "Akun tidak ditemukan." });

            if (req.FullName is not null) user.FullName = req.FullName.Trim();
            if (req.Role is not null) user.Role = req.Role.Value;
            if (req.IsActive is not null) user.IsActive = req.IsActive.Value;
            if (!string.IsNullOrWhiteSpace(req.NewPassword))
            {
                if (req.NewPassword.Length < 8)
                    return Results.BadRequest(new { success = false, message = "Password minimal 8 karakter." });
                user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
            }
            user.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, message = "Akun diperbarui." });
        });
    }
}

public record CreateUserRequest(string FullName, string Username, string Password, UserRole Role);
public record UpdateUserRequest(string? FullName, UserRole? Role, bool? IsActive, string? NewPassword);
