import { useEffect, useState } from 'react';
import { fetchSyncStatus, isiDataContoh, type SyncStatusDto } from '../api';

// Status sambungan ke Data Master (via Webview-App) - siswa & pegawai Keuangan
// bersumber dari sana, jadi pengguna perlu tahu kalau belum disetujui Admin IT /
// sedang gangguan (bukan mengira datanya kosong). Diam kalau tidak ada info.
function formatWaktu(ts: string | null) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function SyncStatusBanner() {
  const [s, setS] = useState<SyncStatusDto | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesanContoh, setPesanContoh] = useState('');

  useEffect(() => {
    let cancelled = false;
    const muat = () => fetchSyncStatus().then((d) => { if (!cancelled) setS(d); }).catch(() => { /* banner opsional */ });
    muat();
    const t = setInterval(muat, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!s) return null;

  // Mode developer = SANDBOX - database terpisah dari data asli dan TIDAK terhubung ke VPS
  // sama sekali. Banner ini sengaja mencolok supaya tidak ada yang mengira ini data sungguhan.
  if (s.mode === 'developer') {
    const isi = async () => {
      setSibuk(true); setPesanContoh('');
      try {
        const r = await isiDataContoh();
        setPesanContoh(`Data contoh siap: +${r.siswaBaru} siswa, +${r.pegawaiBaru} pegawai. Muat ulang halaman untuk melihatnya.`);
      } catch { setPesanContoh('Gagal mengisi data contoh.'); }
      setSibuk(false);
    };
    return (
      <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
        <span className="font-semibold">MODE DEVELOPER (SANDBOX)</span>
        {' · '}data di sini terpisah dari data asli dan tidak terhubung ke server sekolah. Ganti ke mode Server (lewat "Ganti Pengaturan Jaringan") untuk memakai data sungguhan.
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" disabled={sibuk} onClick={isi} className="rounded-lg border border-amber-500/50 px-2.5 py-1 font-semibold hover:bg-amber-500/20 disabled:opacity-50">
            {sibuk ? 'Mengisi…' : 'Isi data contoh (siswa & pegawai palsu)'}
          </button>
          {s.students === 0 && s.employees === 0 && <span className="opacity-90">Sandbox masih kosong - isi data contoh dulu supaya menu bisa dicoba.</span>}
          {pesanContoh && <span>{pesanContoh}</span>}
        </div>
      </div>
    );
  }

  if (s.state === 'belum_mulai') return null;

  const gaya =
    s.state === 'tersambung' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : s.state === 'menunggu_persetujuan' || s.state === 'dinonaktifkan' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
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
      {s.state === 'tersambung' && s.pushState && (
        <div className="mt-1 opacity-90">
          {s.pushState === 'tersambung' && s.pushPending === 0 && <>Data keuangan terkirim ke aplikasi orang tua &amp; pegawai · terakhir {formatWaktu(s.pushOkAt)}</>}
          {s.pushState === 'tersambung' && s.pushPending > 0 && <>Mengirim data keuangan ke aplikasi · {s.pushPending} item menunggu</>}
          {s.pushState === 'offline' && <>Tidak ada internet · data keuangan akan terkirim otomatis begitu tersambung{s.pushPending > 0 ? ` (${s.pushPending} item menunggu)` : ''}</>}
          {s.pushState === 'dinonaktifkan' && <>Pengiriman data keuangan ke aplikasi dimatikan (mode developer) - data tes tidak dikirim ke produksi</>}
          {s.pushState === 'belum_ada_katalog' && <>Pengiriman data keuangan menunggu Admin IT memilih katalog untuk instalasi ini</>}
          {s.pushState === 'menunggu_persetujuan' && <>Pengiriman data keuangan menunggu persetujuan Admin IT</>}
          {s.pushState === 'error' && <>Pengiriman data keuangan bermasalah{s.pushError ? ` · ${s.pushError}` : ''} · dicoba lagi otomatis</>}
        </div>
      )}
      {s.state === 'dinonaktifkan' && (
        <><span className="font-semibold">Sinkronisasi dimatikan</span> · instalasi ini tidak terhubung ke server sekolah (diatur lewat pengaturan).</>
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
