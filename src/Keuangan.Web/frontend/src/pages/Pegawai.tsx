import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useToast } from '../contexts/ToastContext';
import { SearchBar } from '../components/SearchBar';
import { SyncStatusBanner } from '../components/SyncStatusBanner';
import { FilterSelect } from '../components/FilterSelect';
import { fetchEmployees, ApiError, type EmployeeListDto } from '../api';
import { PAYROLL_EDUCATION_LEVELS } from '../lib/payroll';

// Daftar pegawai/guru AKTIF - identitas datang dari Data Master lewat sinkron (lihat
// EmployeesEndpoints.cs), TIDAK ADA tambah/hapus manual di sini. Klik nama = profil (tipe,
// jenjang pendidikan, input gaji). Pegawai nonaktif ada di menu Arsip Pegawai.
export function Pegawai() {
  const { tt } = useI18n();
  const { navigateTo, openEmployeeProfile } = useRole();
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [employees, setEmployees] = useState<EmployeeListDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [katalog, setKatalog] = useState('semua');
  const [jabatan, setJabatan] = useState('semua');
  const [tipe, setTipe] = useState('semua');
  const [urut, setUrut] = useState('nama');

  useEffect(() => {
    let cancelled = false;
    fetchEmployees(query || undefined)
      .then((e) => { if (!cancelled) setEmployees(e.filter((x) => x.status === 'Aktif')); })
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
      && (tipe === 'semua' || e.tipe === tipe));
    const cmp = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '', 'id', { numeric: true });
    return hasil.sort((a, b) =>
      urut === 'jabatan' ? cmp(a.jabatan, b.jabatan) || cmp(a.name, b.name)
      : urut === 'katalog' ? cmp(a.katalog, b.katalog) || cmp(a.name, b.name)
      : cmp(a.name, b.name));
  }, [employees, katalog, jabatan, tipe, urut]);

  return (
    <>
      <SyncStatusBanner />
      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-sm font-bold text-white mb-1">{tt('heading.dataPegawai')} ({tampil.length} aktif)</h3>
        <p className="text-[10px] text-gray-500 mb-3">Data pegawai dan guru otomatis dari Data Master - tidak perlu diinput manual. Klik nama untuk mengisi tipe, jenjang pendidikan, dan gaji.</p>
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <FilterSelect label="Katalog" value={katalog} onChange={setKatalog}
            options={[{ value: 'semua', label: 'Semua katalog' }, ...katalogOpsi.map((k) => ({ value: k, label: k }))]} />
          <FilterSelect label="Jabatan" value={jabatan} onChange={setJabatan}
            options={[{ value: 'semua', label: 'Semua jabatan' }, ...jabatanOpsi.map((j) => ({ value: j, label: j }))]} />
          <FilterSelect label="Tipe" value={tipe} onChange={setTipe}
            options={[{ value: 'semua', label: 'Semua' }, { value: 'Tetap', label: 'Tetap' }, { value: 'Honorer', label: 'Honorer' }, { value: 'Kontrak', label: 'Kontrak' }]} />
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
                  <th className="pb-3">{tt('col.jabatan')}</th><th className="pb-3">{tt('col.tipe')}</th>
                  <th className="pb-3">{tt('col.jenjangPendidikan')}</th><th className="pb-3">Katalog</th>
                </tr>
              </thead>
              <tbody>
                {tampil.length ? tampil.map((e) => (
                  <tr key={e.id} className="border-b border-gray-700/30 hover:bg-dark-850/50">
                    <td className="py-3 font-medium text-white">
                      <button onClick={() => { openEmployeeProfile(String(e.id)); navigateTo('pegawai_detail'); }} className="hover:underline hover:text-brand-400 text-left">{e.name}</button>
                      {e.isKepalaSekolah ? <span className="ml-1.5 text-[10px] text-brand-400">Kepala Sekolah</span> : null}
                    </td>
                    <td className="py-3 text-gray-300">{e.nip || '-'}</td>
                    <td className="py-3 text-gray-300 capitalize">{e.jabatan || '-'}</td>
                    <td className="py-3 text-gray-300">{e.tipe}</td>
                    <td className="py-3 text-gray-300">{PAYROLL_EDUCATION_LEVELS.find((x) => x[0] === e.pendidikan)?.[1] || <span className="text-amber-400/80">belum diisi</span>}</td>
                    <td className="py-3 text-gray-300">{e.katalog || '-'}</td>
                  </tr>
                )) : <tr><td colSpan={6} className="py-8 text-center text-gray-400">{tt('misc.tidakAdaData')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
