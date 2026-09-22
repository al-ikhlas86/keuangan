namespace Keuangan.Data.Entities;

// Key/value generik - port pola sama persis DataMaster.Data/Entities/User.cs::SystemSetting.
// Dipakai utk: token sinkron ke Webview-App (baru diisi setelah Admin IT
// approve, lihat KeuanganSyncService), URL Webview-App, status sinkron
// terakhir (last_sync_at/last_sync_unauthorized_at, port pola persis
// last_hub_sync_ok_at/last_hub_sync_unauthorized_at DataMaster), info yayasan
// (foundation_name dkk, dipakai halaman Pengaturan).
public class SystemSetting
{
    public required string SettingKey { get; set; }
    public string? SettingValue { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
