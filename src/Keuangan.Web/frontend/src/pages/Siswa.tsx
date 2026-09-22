import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { ExportBtn } from '../components/Buttons';
import { StudentTable } from '../components/StudentTable';
import { SearchBar } from '../components/SearchBar';
import { fetchStudents, ApiError, type StudentDto } from '../api';
import { downloadCsv } from '../lib/format';

// Mirror renderSiswa() lama, diporting ulang Fase 1: identitas siswa
// READ-ONLY (hasil sinkron Webview-App, lihat StudentsEndpoints.cs) - tidak
// ada lagi form "Tambah Siswa" manual (dulu bikin data siswa dobel dgn Data
// Master), klik nama/Detail buka SiswaDetail utk edit rincian keuangan.
export function Siswa() {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentDto[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchStudents(query || undefined)
      .then((s) => { if (!cancelled) setStudents(s.filter((x) => x.status === 'Aktif')); })
      .catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat data siswa.', 'error'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const exportCsv = () => downloadCsv('data-siswa', ['No VA', 'Nama', 'NIS', 'Kelas', 'Status'], students.map((s) => [s.vaNumber, s.name, s.nis, s.className, s.status]));

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold text-white">{tt('heading.dataSiswa')} ({students.length} {tt('status.aktifSuffix')})</h3>
        <ExportBtn onClick={exportCsv} />
      </div>
      <div className="mb-4"><SearchBar value={query} onChange={setQuery} placeholder={tt('placeholder.cariNamaAtauNis')} /></div>
      {loading ? <p className="text-xs text-gray-500 py-4">Memuat...</p> : <StudentTable students={students} emptyMessage={tt('misc.belumAdaSiswaAktif')} />}
    </div>
  );
}
