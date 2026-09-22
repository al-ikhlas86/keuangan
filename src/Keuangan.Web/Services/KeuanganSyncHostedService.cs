namespace Keuangan.Web.Services;

// Penjadwal sync - port pola sama persis DataMaster.Web/Services/HubApiSyncHostedService.cs.
// Interval 1 menit, loop TUNGGAL (bukan spawn-per-tick) mencegah overlap
// secara alami, scope baru tiap tick spy KeuanganSyncService (scoped)
// selalu instance segar.
public class KeuanganSyncHostedService(IServiceScopeFactory scopeFactory, ILogger<KeuanganSyncHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var sync = scope.ServiceProvider.GetRequiredService<KeuanganSyncService>();
                await sync.RunAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { logger.LogError(ex, "Sync Webview-App: siklus gagal tak terduga - lanjut ke siklus berikutnya."); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
