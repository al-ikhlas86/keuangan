import { useEffect, useState } from 'react';
import { fetchSyncStatus, type SyncStatusDto } from '../api';

// Status sambungan ke Data Master (via Webview-App) - siswa & pegawai Keuangan
// bersumber dari sana, jadi pengguna perlu tahu kalau belum disetujui Admin IT /
// sedang gangguan (bukan mengira datanya kosong). Diam kalau tidak ada info.
function formatWaktu(ts: string | null) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function SyncStatusBanner() {
  const [s, setS] = useState<SyncStatusDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    const muat = () => fetchSyncStatus().then((d) => { if (!cancelled) setS(d); }).catch(() => { /* banner opsional */ });
    muat();
    const t = setInterval(muat, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!s || s.state === 'belum_mulai') return null;

  const gaya =
    s.state === 'tersambung' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : s.state === 'menunggu_persetujuan' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
    : 'border-red-500/30 bg-red-500/10 text-red-300';

  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 text-xs ${gaya}`}>
      {s.state === 'tersambung' && (
        <>
          <span className="font-semibold">Tersambung ke Data Master</span>
          {s.katalog.length > 0 && <> · Katalog {s.katalog.join(' + ')}</>}
          {' · '}{s.students} siswa aktif, {s.employees} pegawai aktif · sinkron terakhir {formatWaktu(s.lastOkAt)}
        </>
      )}
      {s.state === 'menunggu_persetujuan' && (
        <>
          <span className="font-semibold">Menunggu persetujuan Admin IT</span>
          {' · '}instalasi ini terdaftar sebagai "{s.label}". Minta Admin IT menyetujui di menu Status Sinkronisasi &gt; Keuangan
          dan memilih katalog (SD/TK). Data siswa &amp; pegawai akan terisi otomatis setelah disetujui.
        </>
      )}
      {s.state === 'error' && (
        <>
          <span className="font-semibold">Sinkronisasi bermasalah</span>
          {s.error ? <> · {s.error}</> : null} · akan dicoba lagi otomatis tiap menit.
        </>
      )}
    </div>
  );
}
