import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { SearchBar } from '../components/SearchBar';
import { SyncStatusBanner } from '../components/SyncStatusBanner';
import { fetchEmployees, ApiError, type EmployeeDto } from '../api';

// Daftar pegawai/guru READ-ONLY - identitas datang dari Data Master lewat sinkron
// (lihat EmployeesEndpoints.cs), TIDAK ADA tambah/ubah manual di sini. Komponen
// gaji & slip gaji menyusul di fase berikutnya.
export function Pegawai() {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchEmployees(query || undefined)
      .then((e) => { if (!cancelled) setEmployees(e); })
      .catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat data pegawai.', 'error'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const aktif = employees.filter((e) => e.status === 'Aktif').length;

  return (
    <>
      <SyncStatusBanner />
      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-sm font-bold text-white mb-1">{tt('menu.pegawai')} ({aktif} aktif / {employees.length})</h3>
        <p className="text-[10px] text-gray-500 mb-3">Data pegawai dan guru otomatis dari Data Master - tidak perlu diinput manual.</p>
        <div className="mb-4"><SearchBar value={query} onChange={setQuery} placeholder="Cari nama atau NIP..." /></div>
        {loading ? <p className="text-xs text-gray-500 py-4">Memuat...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700/50 text-gray-400 text-left">
                  <th className="pb-3">{tt('col.nama')}</th><th className="pb-3">NIP</th>
                  <th className="pb-3">{tt('col.jabatan')}</th><th className="pb-3">Katalog</th><th className="pb-3">{tt('col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {employees.length ? employees.map((e) => (
                  <tr key={e.id} className="border-b border-gray-700/30 hover:bg-dark-850/50">
                    <td className="py-3 font-medium text-white">{e.name}{e.isKepalaSekolah ? <span className="ml-1.5 text-[10px] text-brand-400">Kepala Sekolah</span> : null}</td>
                    <td className="py-3 text-gray-300">{e.nip || '-'}</td>
                    <td className="py-3 text-gray-300 capitalize">{e.jabatan || '-'}</td>
                    <td className="py-3 text-gray-300">{e.katalog || '-'}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${e.status === 'Aktif' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>{e.status}</span>
                    </td>
                  </tr>
                )) : <tr><td colSpan={5} className="py-8 text-center text-gray-400">{tt('misc.tidakAdaData')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
