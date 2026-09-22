using Keuangan.Data;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

// Windows Service (mode "server") jalan sbg akun SYSTEM, TIDAK punya induk
// (Launcher) yg bisa inject connection string via env var - port pola sama
// persis DataMaster.Web/Program.cs: self-konfigurasi ke %LocalAppData%\Keuangan
// HANYA kalau env var belum diisi dari luar ("??=" - anak-proses Launcher /
// tes manual yg sudah set ConnectionStrings__Keuangan tetap menang).
try
{
    var dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Keuangan");
    var appDataDir = Path.Combine(dataDir, "App_Data");
    Directory.CreateDirectory(appDataDir);

    if (Environment.GetEnvironmentVariable("ConnectionStrings__Keuangan") is null)
    {
        var dbPath = Path.Combine(appDataDir, "keuangan.db");
        Environment.SetEnvironmentVariable("ConnectionStrings__Keuangan", $"Data Source={dbPath}");
    }
}
catch { /* non-fatal - path khusus dev tetap dipakai lewat appsettings.json */ }

var builder = WebApplication.CreateBuilder(args);

// UseWindowsService() - no-op OTOMATIS kecuali proses BENAR2 dimulai Service
// Control Manager (mode "server" via WindowsServiceHelper.cs di Launcher) -
// port pola sama persis DataMaster.Web, AMAN dipasang walau app tetap
// dijalankan cara lama (anak proses Launcher, mode developer/klien).
builder.Host.UseWindowsService();

builder.Services.AddDbContext<KeuanganDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Keuangan")));

// Cookie session standar ASP.NET Core - login per-akun sungguhan (lihat
// Entities/User.cs), BUKAN header X-Source-Role yg bisa dipalsukan bebas
// spt versi Akuntansi Django/React lama.
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/api/auth/login";
        options.ExpireTimeSpan = TimeSpan.FromHours(12);
        options.SlidingExpiration = true;
    });
builder.Services.AddAuthorization();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { success = true, service = "keuangan-web" }));

app.Run();
