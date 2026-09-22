import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { fetchTagihan, ApiError, type TagihanDto } from '../api';
import { fmt } from '../lib/format';

// BEDA dari Akuntansi lama: di sana halaman ini daftar SISWA dgn status
// pelunasan agregat. Backend Fase 1 tidak menghitung status agregat per siswa
// (lihat StudentsEndpoints.cs - status di sana status KELULUSAN, bukan
// pelunasan) - jadi di sini ditampilkan daftar TAGIHAN per status langsung
// (data yang memang tersedia dari TagihanEndpoints.cs), bukan siswa.
export function SiswaByStatus({ kind }: { kind: 'Lunas' | 'BelumLunas' }) {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [items, setItems] = useState<TagihanDto[]>([]);
  const [loading, setLoading] = useState(true);
  const title = kind === 'Lunas' ? tt('menu.siswa_lunas') : tt('menu.siswa_belum_lunas');

  useEffect(() => {
    let cancelled = false;
    fetchTagihan({ status: kind })
      .then((t) => { if (!cancelled) setItems(t); })
      .catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat tagihan.', 'error'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <h3 className="text-sm font-bold text-white mb-3">{title} ({items.length})</h3>
      {loading ? <p className="text-xs text-gray-500 py-4">Memuat...</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700/50 text-gray-400 text-left">
                <th className="pb-2">{tt('col.nama')}</th><th className="pb-2">{tt('col.jenisPembayaran')}</th>
                <th className="pb-2">{tt('misc.periode') || 'Periode'}</th><th className="pb-2 text-right">{tt('col.jumlah')}</th>
                <th className="pb-2 text-right">{tt('misc.sudahDibayarLabel') || 'Sudah Dibayar'}</th><th className="pb-2">{tt('col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? items.map((t) => (
                <tr key={t.id} className="border-b border-gray-700/30">
                  <td className="py-2 text-white font-medium">{t.studentName}</td>
                  <td className="py-2 text-gray-300">{t.feeTypeName}</td>
                  <td className="py-2 text-gray-300">{t.periodLabel}</td>
                  <td className="py-2 text-right text-gray-300">{fmt(t.amount)}</td>
                  <td className="py-2 text-right text-emerald-400">{fmt(t.paidAmount)}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${t.status === 'Lunas' ? 'bg-emerald-500/20 text-emerald-400' : t.status === 'SebagianLunas' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>{t.status}</span>
                  </td>
                </tr>
              )) : <tr><td colSpan={6} className="py-8 text-center text-gray-400">{tt('misc.tidakAdaData')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
