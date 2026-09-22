using Keuangan.Data;
using Keuangan.Web.Services;
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
// spt versi Akuntansi Django/React lama. Events.OnRedirectToLogin DITIMPA
// jadi 401 polos (BUKAN redirect 302 ke halaman) - default cookie-auth
// ASP.NET Core diarahkan utk app MVC/Razor server-rendered, frontend di
// sini React SPA yg panggil JSON API, 302 ke URL "login page" yg tidak
// pernah ada bikin fetch() gagal aneh, bukan 401 yg rapi ditangani frontend.
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.ExpireTimeSpan = TimeSpan.FromHours(12);
        options.SlidingExpiration = true;
        options.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
        options.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
    });
builder.Services.AddAuthorization();

// Enum sbg STRING di JSON (2026-09-22, bug nyata ketemu lewat tes langsung -
// default System.Text.Json baca/tulis enum sbg ANGKA, klien HARUS tahu
// "Kasir" = angka berapa, tidak masuk akal utk frontend React nanti/API
// manapun yg konsumsi ini) - "Kasir" dkk sekarang bisa dikirim/dibaca apa
// adanya sbg teks.
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
});

// Sinkron identitas siswa dari Webview-App (pull, lihat KeuanganSyncService.cs)
// - AppOptions:AppSettings:WebviewApiUrl diisi wizard Setup Awal mode "server"
// (Launcher), disimpan appsettings.json sebelah .exe.
builder.Services.Configure<AppOptions>(builder.Configuration.GetSection("AppSettings"));
builder.Services.AddHttpClient<KeuanganSyncService>();
builder.Services.AddHostedService<KeuanganSyncHostedService>();

builder.Services.AddScoped<DocumentNumberService>();
builder.Services.AddScoped<TagihanService>();

var app = builder.Build();

// Migrasi otomatis saat start - port pola sama persis DataMaster.Web
// (Migrate() idempotent per-migrasi, aman dipanggil tiap start termasuk
// tiap kali auto-update selesai) - PC sekolah TIDAK PERNAH perlu jalankan
// migration tool manual.
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<KeuanganDbContext>().Database.Migrate();
}

app.UseAuthentication();
// Lihat DeveloperModeMiddleware.cs - HARUS setelah UseAuthentication (spy
// tidak ketiban-timpa hasil cookie-auth) DAN sebelum UseAuthorization (spy
// principal sintetisnya yg dievaluasi RequireRole/[Authorize]).
app.UseMiddleware<DeveloperModeMiddleware>();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { success = true, service = "keuangan-web" }));
app.MapAuthEndpoints();
app.MapUsersEndpoints();
app.MapChartOfAccountsEndpoints();
app.MapStudentsEndpoints();
app.MapFeeTypesEndpoints();
app.MapTransactionsEndpoints();
app.MapTagihanEndpoints();
app.MapPaymentsEndpoints();
app.MapPeriodsEndpoints();
app.MapCashRecapEndpoints();

app.Run();
