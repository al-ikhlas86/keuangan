import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { SearchBar } from '../components/SearchBar';
import { SyncStatusBanner } from '../components/SyncStatusBanner';
import { FilterSelect } from '../components/FilterSelect';
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
  const [katalog, setKatalog] = useState('semua');
  const [jabatan, setJabatan] = useState('semua');
  const [status, setStatus] = useState('semua');
  const [urut, setUrut] = useState('nama');

  useEffect(() => {
    let cancelled = false;
    fetchEmployees(query || undefined)
      .then((e) => { if (!cancelled) setEmployees(e); })
      .catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat data pegawai.', 'error'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const katalogOpsi = useMemo(() => [...new Set(employees.map((e) => e.katalog).filter((k): k is string => !!k))].sort(), [employees]);
  const jabatanOpsi = useMemo(() => [...new Set(employees.map((e) => e.jabatan).filter((j): j is string => !!j))].sort(), [employees]);

  const tampil = useMemo(() => {
    const hasil = employees.filter((e) =>
      (katalog === 'semua' || e.katalog === katalog)
      && (jabatan === 'semua' || e.jabatan === jabatan)
      && (status === 'semua' || e.status === status));
    const cmp = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '', 'id', { numeric: true });
    return hasil.sort((a, b) =>
      urut === 'jabatan' ? cmp(a.jabatan, b.jabatan) || cmp(a.name, b.name)
      : urut === 'katalog' ? cmp(a.katalog, b.katalog) || cmp(a.name, b.name)
      : cmp(a.name, b.name));
  }, [employees, katalog, jabatan, status, urut]);

  const aktif = tampil.filter((e) => e.status === 'Aktif').length;

  return (
    <>
      <SyncStatusBanner />
      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-sm font-bold text-white mb-1">{tt('menu.pegawai')} ({aktif} aktif / {tampil.length})</h3>
        <p className="text-[10px] text-gray-500 mb-3">Data pegawai dan guru otomatis dari Data Master - tidak perlu diinput manual.</p>
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <FilterSelect label="Katalog" value={katalog} onChange={setKatalog}
            options={[{ value: 'semua', label: 'Semua katalog' }, ...katalogOpsi.map((k) => ({ value: k, label: k }))]} />
          <FilterSelect label="Jabatan" value={jabatan} onChange={setJabatan}
            options={[{ value: 'semua', label: 'Semua jabatan' }, ...jabatanOpsi.map((j) => ({ value: j, label: j }))]} />
          <FilterSelect label="Status" value={status} onChange={setStatus}
            options={[{ value: 'semua', label: 'Semua' }, { value: 'Aktif', label: 'Aktif' }, { value: 'Nonaktif', label: 'Nonaktif' }]} />
          <FilterSelect label="Urutkan" value={urut} onChange={setUrut}
            options={[{ value: 'nama', label: 'Nama' }, { value: 'jabatan', label: 'Jabatan' }, { value: 'katalog', label: 'Katalog' }]} />
        </div>
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
                {tampil.length ? tampil.map((e) => (
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
