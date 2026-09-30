import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { fetchAuditLogs, ApiError, type AuditLogResult } from '../api';
import { FilterSelect } from '../components/FilterSelect';

// Riwayat Audit (hanya Admin/Supervisor) - siapa mengubah apa dan kapan (penggajian, pembayaran,
// validasi, backup, dst). Di Akuntansi lama ini iframe ke halaman Django yang tidak masuk menu;
// di sini halaman sungguhan yang membaca tabel AuditLog.
export function AuditLog() {
  const { showToast } = useToast();
  const [data, setData] = useState<AuditLogResult | null>(null);
  const [modul, setModul] = useState('');
  const [aksi, setAksi] = useState('');
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    fetchAuditLogs({ module: modul || undefined, action: aksi || undefined })
      .then(setData)
      .catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat riwayat audit.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modul, aksi]);

  const modulOpsi = [...new Set((data?.items ?? []).map((i) => i.module))];
  const aksiOpsi = [...new Set((data?.items ?? []).map((i) => i.action))];

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <h3 className="text-sm font-bold text-white mb-1">Riwayat Audit ({data?.total ?? 0} catatan)</h3>
      <p className="text-[10px] text-gray-500 mb-3">200 catatan terbaru. Klik baris untuk melihat data sebelum/sesudah.</p>
      {data && data.perPeran.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {data.perPeran.map((p) => <span key={p.peran} className="px-2 py-1 rounded bg-dark-900 border border-gray-700 text-[10px] text-gray-300">{p.peran}: <b className="text-white">{p.jumlah}</b></span>)}
        </div>
      )}
      <div className="flex flex-wrap gap-3 mb-3">
        <FilterSelect label="Modul" value={modul} onChange={setModul} options={[{ value: '', label: 'Semua modul' }, ...modulOpsi.map((m) => ({ value: m, label: m }))]} />
        <FilterSelect label="Aksi" value={aksi} onChange={setAksi} options={[{ value: '', label: 'Semua aksi' }, ...aksiOpsi.map((a) => ({ value: a, label: a }))]} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-gray-700/50 text-gray-400 text-left"><th className="pb-2">Waktu</th><th className="pb-2">Pengguna</th><th className="pb-2">Modul</th><th className="pb-2">Aksi</th><th className="pb-2">Objek</th><th className="pb-2" /></tr></thead>
          <tbody>
            {(data?.items ?? []).map((a) => (
              <>
                <tr key={a.id} onClick={() => setOpen(open === a.id ? null : a.id)} className="border-b border-gray-700/30 hover:bg-dark-850/50 cursor-pointer">
                  <td className="py-2 text-gray-400 whitespace-nowrap">{new Date(a.createdAt + 'Z').toLocaleString('id-ID')}</td>
                  <td className="py-2 text-gray-200">{a.actor} <span className="text-[10px] text-gray-500">({a.actorRole})</span></td>
                  <td className="py-2 text-gray-300">{a.module}</td>
                  <td className="py-2 text-gray-300">{a.action}</td>
                  <td className="py-2 text-gray-300">{a.entityName}{a.entityCode ? ` - ${a.entityCode}` : ''}</td>
                  <td className="py-2 text-gray-500">{open === a.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</td>
                </tr>
                {open === a.id && (
                  <tr key={`${a.id}-d`} className="bg-dark-900/40">
                    <td colSpan={6} className="p-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
                        <div><p className="text-gray-500 mb-1">Sebelum</p><pre className="whitespace-pre-wrap break-all text-gray-300">{a.beforeDataJson || '-'}</pre></div>
                        <div><p className="text-gray-500 mb-1">Sesudah</p><pre className="whitespace-pre-wrap break-all text-gray-300">{a.afterDataJson || '-'}</pre></div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {data && data.items.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-gray-400">Belum ada catatan audit.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
