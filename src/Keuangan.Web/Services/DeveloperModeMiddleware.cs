using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Keuangan.Web.Services;

// Mode "developer" (lihat plan) - TIDAK perlu login, role-switcher dropdown
// bebas persis pola Akuntansi lama (header X-Source-Role) - TAPI supaya
// SEMUA endpoint tetap bisa pakai [Authorize]/RequireRole yang SAMA (tidak
// perlu 2 jalur kode terpisah utk developer vs server/klien), middleware
// ini menyuntikkan ClaimsPrincipal SINTETIS dari header "X-Dev-Role" SEBELUM
// UseAuthorization() jalan - HANYA aktif kalau AppSettings:Mode == "developer"
// (dicek SEKALI saat startup, bukan per-request, supaya mode "server"/"klien"
// produksi TIDAK PERNAH bisa "disuap" header ini walau dikirim iseng).
public class DeveloperModeMiddleware(RequestDelegate next, IConfiguration config)
{
    private readonly bool _isDeveloperMode = string.Equals(config["AppSettings:Mode"], "developer", StringComparison.OrdinalIgnoreCase);

    public async Task InvokeAsync(HttpContext context)
    {
        if (_isDeveloperMode)
        {
            var roleHeader = context.Request.Headers["X-Dev-Role"].ToString();
            var role = Enum.TryParse<Data.UserRole>(roleHeader, ignoreCase: true, out var parsed) ? parsed : Data.UserRole.AdminManager;
            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, "0"),
                new(ClaimTypes.Name, "developer"),
                new("FullName", "Mode Developer"),
                new(ClaimTypes.Role, role.ToString()),
            };
            context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme));
        }
        await next(context);
    }
}
