# Keuangan — Ekosistem Al-Ikhlas 86

Repo PUBLIK: jangan menulis rahasia, token, atau detail infrastruktur di sini. Konteks ekosistem lengkap ada di laptop dev pemilik: `C:\xampp\htdocs\webarsipdata-master\CLAUDE.md` dan `Projek.md`. Balas Bahasa Indonesia; commit tanpa trailer Claude.

## Isi repo (.NET 10 + React/Vite)
- `src/Keuangan.Launcher` — WPF: wizard setup (mode server/klien LAN), `UpdateChecker`, `WindowsServiceHelper`.
- `src/Keuangan.Web` — ASP.NET Core + SQLite; API, `frontend/` (React/Vite; CI menjalankan `npm ci` + `npm run build` sebelum publish), sinkron/push ke backend webview (`KeuanganSyncService`, `KeuanganPushService`).
- `src/Keuangan.Data` — EF Core; `Keuangan.MigrationTool` — stub.
- Versi dicap dari tag (`-p:Version=`, `VITE_APP_VERSION`); `VersionEndpoints.ServerVersion` dilaporkan sebagai header `X-App-Version`.

## Prinsip data
- **Keuangan = sumber valid data keuangan** (tagihan, pembayaran, saldo, slip gaji). VPS hanya salinan tampilan; kalau beda, Keuangan menang. Data siswa/pegawai ditarik dari Data Master via backend.
- Mode developer = sandbox (`Keuangan-Dev`, tanpa sinkron/kirim ke VPS). Mode server = data asli `%LocalAppData%\Keuangan`. Laptop dev pemilik berisi data ASLI: jangan hapus/ubah.

## Mode & update
- Mode server berjalan sebagai Windows Service `KeuanganWebService` (SYSTEM, port bawaan 5251, health `/health`). `ServiceAutoUpdateHostedService` memeriksa rilis tiap 3 jam dan memasang 22:00-05:00 (cadangan + pemulihan otomatis; log `%ProgramData%\Keuangan\update`). Mati: `AppSettings__AutoUpdateServer=false`.

## Aturan
- **Jangan compile/publish lokal.** Cek kompilasi: `gh workflow run build.yml -R al-ikhlas86/keuangan`; rilis: tag `vX.Y.Z` setelah build uji hijau.
- Clone lokal `D:\Keuangan` berriwayat lama: lakukan perubahan lewat clone bersih (`gh repo clone al-ikhlas86/keuangan`), fetch+rebase ke `origin/main` sebelum push/tag.
- Pembatasan peran saat ini sebagian hanya di menu frontend, bukan di server; jangan menganggapnya sudah aman.
