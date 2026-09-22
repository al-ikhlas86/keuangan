import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import type { StudentDto } from '../api';

// Disederhanakan Fase 1 - identitas siswa (nis/nama/kelas/dst) READ-ONLY hasil
// sinkron Webview-App (lihat StudentsEndpoints.cs), TIDAK BISA
// ditambah/dihapus manual dari sini lagi (beda dari Akuntansi lama yang CRUD
// bebas) - kolom Aksi cuma buka detail (tempat rincian keuangan khusus
// Keuangan boleh diedit).
export function StudentTable({ students, emptyMessage }: { students: StudentDto[]; emptyMessage: string }) {
  const { tt } = useI18n();
  const { navigateTo, openStudentProfile } = useRole();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-700/50 text-gray-400 text-left">
            <th className="pb-3">{tt('col.nomorVa')}</th><th className="pb-3">{tt('col.nama')}</th>
            <th className="pb-3">{tt('col.nis')}</th><th className="pb-3">{tt('col.kelas')}</th>
            <th className="pb-3">{tt('col.angkatan')}</th><th className="pb-3">{tt('col.status')}</th><th className="pb-3">{tt('col.aksi')}</th>
          </tr>
        </thead>
        <tbody>
          {students.length ? students.map((s) => (
            <tr key={s.id} className="border-b border-gray-700/30 hover:bg-dark-850/50">
              <td className="py-3 text-gray-400">{s.vaNumber || '-'}</td>
              <td className="py-3 font-medium text-white">
                <button onClick={() => { openStudentProfile(String(s.id)); navigateTo('siswa_detail'); }} className="hover:underline hover:text-brand-400 text-left">{s.name}</button>
              </td>
              <td className="py-3 text-gray-300">{s.nis}</td>
              <td className="py-3 text-gray-300">{s.className}</td>
              <td className="py-3 text-gray-300">{s.angkatan || '-'}</td>
              <td className="py-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${s.status === 'Aktif' ? 'bg-emerald-500/20 text-emerald-400' : s.status === 'Lulus' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>
                  {s.status}
                </span>
              </td>
              <td className="py-3">
                <button onClick={() => { openStudentProfile(String(s.id)); navigateTo('siswa_detail'); }} className="no-print text-[10px] text-brand-400 hover:text-brand-300">{tt('btn.lihatDetail') || 'Detail'}</button>
              </td>
            </tr>
          )) : <tr><td colSpan={7} className="py-8 text-center text-gray-400">{emptyMessage}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
