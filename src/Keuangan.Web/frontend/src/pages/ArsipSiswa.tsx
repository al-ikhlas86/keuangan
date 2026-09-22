import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { StudentTable } from '../components/StudentTable';
import { SearchBar } from '../components/SearchBar';
import { fetchStudents, ApiError, type StudentDto } from '../api';

// Arsip siswa berstatus Lulus/Nonaktif (identitas sinkron dari Webview-App -
// lihat StudentsEndpoints.cs, tidak ada breakdown lunas/belum lunas lagi
// di sini, lihat catatan di SiswaByStatus.tsx).
export function ArsipSiswa() {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<StudentDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchStudents(query || undefined)
      .then((s) => { if (!cancelled) setStudents(s.filter((x) => x.status !== 'Aktif')); })
      .catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat arsip siswa.', 'error'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <h3 className="text-sm font-bold text-white mb-1">{tt('heading.arsipSiswaLulus')} ({students.length})</h3>
      <p className="text-[10px] text-gray-500 mb-3">Siswa berstatus Lulus/Nonaktif.</p>
      <div className="mb-4"><SearchBar value={query} onChange={setQuery} placeholder={tt('placeholder.cariNamaAtauNis')} /></div>
      {loading ? <p className="text-xs text-gray-500 py-4">Memuat...</p> : <StudentTable students={students} emptyMessage={tt('misc.tidakAdaData')} />}
    </div>
  );
}
