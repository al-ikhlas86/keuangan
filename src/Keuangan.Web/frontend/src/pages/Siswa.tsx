import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useToast } from '../contexts/ToastContext';
import { ExportBtn } from '../components/Buttons';
import { StudentTable } from '../components/StudentTable';
import { SearchBar } from '../components/SearchBar';
import { FilterSelect } from '../components/FilterSelect';
import { ImportVaModal } from '../components/ImportVaModal';
import { fetchStudents, downloadVaTemplate, ApiError, type StudentDto } from '../api';
import { downloadCsv } from '../lib/format';

// Mirror renderSiswa() lama, diporting ulang Fase 1: identitas siswa
// READ-ONLY (hasil sinkron Webview-App, lihat StudentsEndpoints.cs) - tidak
// ada lagi form "Tambah Siswa" manual (dulu bikin data siswa dobel dgn Data
// Master), klik nama/Detail buka SiswaDetail utk edit rincian keuangan.
//
// v0.2.0: filter (katalog/kelas/status VA) + urutan berjalan di sisi klien (data
// lokal, ratusan baris). Template VA diunduh utk siswa yang SEDANG TAMPIL, jadi
// filter = cara memilih siapa yang masuk template (lihat VaEndpoints.cs).
export function Siswa() {
  const { tt } = useI18n();
  const { role } = useRole();
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentDto[]>([]);
  const [query, setQuery] = useState('');
  const [katalog, setKatalog] = useState('semua');
  const [kelas, setKelas] = useState('semua');
  const [vaFilter, setVaFilter] = useState('semua');
  const [urut, setUrut] = useState('nama');
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [muatUlang, setMuatUlang] = useState(0);
  const [mengunduh, setMengunduh] = useState(false);

  const canEdit = role === 'AdminManager' || role === 'Staff';

  useEffect(() => {
    let cancelled = false;
    fetchStudents(query || undefined)
      .then((s) => { if (!cancelled) setStudents(s.filter((x) => x.status === 'Aktif')); })
      .catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat data siswa.', 'error'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, muatUlang]);

  const katalogOpsi = useMemo(
    () => [...new Set(students.map((s) => s.katalog).filter((k): k is string => !!k))].sort(),
    [students],
  );
  const kelasOpsi = useMemo(
    () => [...new Set(students.filter((s) => katalog === 'semua' || s.katalog === katalog).map((s) => s.className).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'id', { numeric: true })),
    [students, katalog],
  );

  const tampil = useMemo(() => {
    const hasil = students.filter((s) =>
      (katalog === 'semua' || s.katalog === katalog)
      && (kelas === 'semua' || s.className === kelas)
      && (vaFilter === 'semua' || (vaFilter === 'ada' ? !!s.vaNumber : !s.vaNumber)));
    const cmp = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').localeCompare(b ?? '', 'id', { numeric: true });
    return hasil.sort((a, b) =>
      urut === 'nis' ? cmp(a.nis, b.nis)
      : urut === 'kelas' ? cmp(a.className, b.className) || cmp(a.name, b.name)
      : cmp(a.name, b.name));
  }, [students, katalog, kelas, vaFilter, urut]);

  const exportCsv = () => downloadCsv('data-siswa', ['No VA', 'Nama', 'NIS', 'Kelas', 'Katalog', 'Status'], tampil.map((s) => [s.vaNumber, s.name, s.nis, s.className, s.katalog, s.status]));

  async function unduhTemplate() {
    setMengunduh(true);
    try {
      await downloadVaTemplate(tampil.map((s) => Number(s.hubId)).filter((n) => Number.isFinite(n)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal mengunduh template.', 'error');
    } finally {
      setMengunduh(false);
    }
  }

  const belumVa = students.filter((s) => !s.vaNumber).length;

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold text-white">
          {tt('heading.dataSiswa')} ({tampil.length}{tampil.length !== students.length ? ` dari ${students.length}` : ''} {tt('status.aktifSuffix')})
          {students.length > 0 && <span className="ml-2 text-[10px] font-normal text-gray-500">{belumVa} belum punya VA</span>}
        </h3>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <>
              <button onClick={unduhTemplate} disabled={mengunduh || tampil.length === 0}
                className="no-print flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 text-xs font-medium disabled:opacity-50">
                <FileSpreadsheet className="w-3.5 h-3.5" />{mengunduh ? 'Menyiapkan...' : 'Unduh Template VA'}
              </button>
              <button onClick={() => setImportOpen(true)}
                className="no-print flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-xs font-medium">
                <Upload className="w-3.5 h-3.5" />Impor VA
              </button>
            </>
          )}
          <ExportBtn onClick={exportCsv} />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <FilterSelect label="Katalog" value={katalog} onChange={(v) => { setKatalog(v); setKelas('semua'); }}
          options={[{ value: 'semua', label: 'Semua katalog' }, ...katalogOpsi.map((k) => ({ value: k, label: k }))]} />
        <FilterSelect label="Kelas" value={kelas} onChange={setKelas}
          options={[{ value: 'semua', label: 'Semua kelas' }, ...kelasOpsi.map((k) => ({ value: k, label: k }))]} />
        <FilterSelect label="Nomor VA" value={vaFilter} onChange={setVaFilter}
          options={[{ value: 'semua', label: 'Semua' }, { value: 'ada', label: 'Sudah punya VA' }, { value: 'belum', label: 'Belum punya VA' }]} />
        <FilterSelect label="Urutkan" value={urut} onChange={setUrut}
          options={[{ value: 'nama', label: 'Nama' }, { value: 'nis', label: 'NIS' }, { value: 'kelas', label: 'Kelas' }]} />
      </div>

      <div className="mb-4"><SearchBar value={query} onChange={setQuery} placeholder={tt('placeholder.cariNamaAtauNis')} /></div>
      {loading ? <p className="text-xs text-gray-500 py-4">Memuat...</p> : <StudentTable students={tampil} emptyMessage={tt('misc.belumAdaSiswaAktif')} />}

      {importOpen && <ImportVaModal onClose={() => setImportOpen(false)} onDone={() => setMuatUlang((n) => n + 1)} />}
    </div>
  );
}
