import { useEffect, useState } from 'react';
import { fetchUpdatePengaturan, simpanUpdatePengaturan } from '../api';

// Pengaturan pembaruan (2026-11-27). Dua bagian, keduanya BAWAAN MATI:
//  1. PC ini (Launcher): "restart otomatis setelah pembaruan diunduh". Disimpan di Launcher lewat jembatan pesan WebView2 (hanya ada di aplikasi desktop).
//     Mati = pembaruan diberi tahu lewat notifikasi pojok kanan bawah dan dipasang saat Anda memilih mulai ulang atau saat aplikasi dibuka lagi.
//  2. Server (khusus PC server, Admin): "boleh restart layanan kapan saja". Mati = layanan baru dipasang di jendela malam 22:00-05:00.
interface WebView2Bridge {
  postMessage(pesan: unknown): void;
  addEventListener(tipe: 'message', cb: (e: { data: unknown }) => void): void;
  removeEventListener(tipe: 'message', cb: (e: { data: unknown }) => void): void;
}
const jembatan = (): WebView2Bridge | undefined => (window as unknown as { chrome?: { webview?: WebView2Bridge } }).chrome?.webview;

interface StatusLokal { autoRestart: boolean; versiSiap: string | null }

export function PembaruanCard({ adminServer }: { adminServer: boolean }) {
  const [lokal, setLokal] = useState<StatusLokal | null>(null);
  const [kapanSaja, setKapanSaja] = useState<boolean | null>(null);
  const [galat, setGalat] = useState('');
  const ada = jembatan() !== undefined;

  useEffect(() => {
    const b = jembatan();
    if (!b) return;
    const saat = (e: { data: unknown }) => {
      const d = e.data as { type?: string; autoRestart?: boolean; versiSiap?: string | null } | null;
      if (d?.type === 'update-status') setLokal({ autoRestart: !!d.autoRestart, versiSiap: d.versiSiap ?? null });
    };
    b.addEventListener('message', saat);
    b.postMessage({ type: 'update-ambil' });
    return () => b.removeEventListener('message', saat);
  }, []);

  useEffect(() => {
    if (!adminServer) return;
    fetchUpdatePengaturan().then((d) => setKapanSaja(d.restartKapanSaja)).catch(() => setKapanSaja(null));
  }, [adminServer]);

  const ubahKapanSaja = async (nilai: boolean) => {
    setGalat('');
    const lama = kapanSaja;
    setKapanSaja(nilai);
    try { await simpanUpdatePengaturan(nilai); } catch { setKapanSaja(lama); setGalat('Gagal menyimpan pengaturan server.'); }
  };

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <h3 className="text-sm font-bold text-white mb-3">Pembaruan Aplikasi</h3>
      <div className="space-y-4 text-xs">
        <div>
          <label className={`flex items-start gap-2 ${ada ? '' : 'opacity-60'}`}>
            <input type="checkbox" className="mt-0.5" disabled={!ada || lokal === null} checked={lokal?.autoRestart ?? false}
              onChange={(e) => jembatan()?.postMessage({ type: 'update-simpan', autoRestart: e.target.checked })} />
            <span className="text-gray-300">Mulai ulang otomatis setelah pembaruan diunduh (PC ini)
              <span className="block text-gray-500 mt-0.5">Mati (bawaan): muncul notifikasi di pojok kanan bawah, Anda yang memilih kapan mulai ulang; pembaruan juga terpasang sendiri saat aplikasi dibuka lagi. Menyala: hitung mundur 60 detik lalu mulai ulang (bisa ditunda).</span>
            </span>
          </label>
          {!ada && <p className="text-gray-500 mt-1">Tersedia di aplikasi Keuangan desktop.</p>}
          {lokal?.versiSiap && (
            <button type="button" onClick={() => jembatan()?.postMessage({ type: 'update-mulai-ulang' })} className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white">
              Mulai ulang sekarang untuk memasang v{lokal.versiSiap.split('.').slice(0, 3).join('.')}
            </button>
          )}
        </div>

        {adminServer && (
          <div>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" disabled={kapanSaja === null} checked={kapanSaja ?? false} onChange={(e) => void ubahKapanSaja(e.target.checked)} />
              <span className="text-gray-300">Server boleh restart layanan kapan saja saat ada pembaruan
                <span className="block text-gray-500 mt-0.5">Mati (bawaan): layanan server baru dipasang di jendela malam 22:00-05:00. Menyala: dipasang begitu unduhan selesai; PC klien tersendat beberapa detik lalu tersambung ulang.</span>
              </span>
            </label>
            {galat && <p className="text-red-400 mt-1">{galat}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
