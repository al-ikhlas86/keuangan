import { useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { TableActions } from '../components/TableActions';
import { StudentSearchSelect } from '../components/StudentSearchSelect';
import { fmt } from '../lib/format';
import {
  createTagihan, updateTagihan, deleteTagihan, fetchTagihan, fetchFeeTypes, fetchStudents, ApiError,
  type TagihanDto, type FeeTypeDto, type StudentDto,
} from '../api';

// Disederhanakan Fase 1: "Saldo belum dialokasikan"/alokasi otomatis lintas
// tagihan (SaldoSiswaPanel lama) dan "Tandai Lunas manual" DITUNDA - backend
// (TagihanEndpoints.cs/PaymentsEndpoints.cs) belum expose keduanya, status
// Tagihan SELALU dihitung ulang otomatis dari SUM(Payment) lewat
// TagihanService.RecomputeStatusAsync (lihat Terima Pembayaran).
function TagihanForm({ editRecord, feeTypes, students, onDone }: {
  editRecord: TagihanDto | (TagihanDto & { id: number }) | null;
  feeTypes: FeeTypeDto[];
  students: StudentDto[];
  onDone: () => void;
}) {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const opsionalFeeTypes = feeTypes.filter((f) => f.kategori === 'Opsional' && f.frekuensi === 'Sekali' && f.isActive);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [feeId, setFeeId] = useState<number | null>(opsionalFeeTypes[0]?.id ?? null);
  const [periode, setPeriode] = useState(editRecord?.periodLabel || '');
  const [jumlah, setJumlah] = useState(editRecord?.amount ?? 500000);
  const [jatuhTempo, setJatuhTempo] = useState(editRecord?.dueDate || '');

  async function simpan() {
    if ((!editRecord && (!studentId || !feeId)) || !periode.trim() || !jumlah) { showToast(tt('msg.semuaFieldWajib'), 'error'); return; }
    try {
      if (editRecord) {
        await updateTagihan(editRecord.id, { amount: jumlah, dueDate: jatuhTempo || null });
        showToast(tt('msg.tagihanBerhasilDiperbarui'));
      } else {
        await createTagihan({ studentId: studentId!, feeTypeId: feeId!, periodLabel: periode.trim(), amount: jumlah, dueDate: jatuhTempo || null });
        showToast(tt('msg.tagihanBerhasilDibuat'));
      }
      onDone();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan tagihan.', 'error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4" onClick={onDone}>
      <div className="bg-dark-800 rounded-xl border border-gray-700 p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-white mb-4">{editRecord ? tt('form.editTagihan') : tt('form.tambahTagihanBaru')}</h3>
        {!editRecord && <p className="text-[10px] text-gray-400 mb-3 p-2 rounded-lg bg-dark-900/60">{tt('misc.tambahTagihanOpsionalInfo')}</p>}
        <form onSubmit={(e) => { e.preventDefault(); simpan(); }} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">{tt('col.siswa')} *</label>
            {editRecord ? (
              <input type="text" disabled value={editRecord.studentName} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-500" />
            ) : (
              <StudentSearchSelect students={students} value={studentId} onChange={setStudentId} placeholder={tt('placeholder.ketikNamaAtauNis')} />
            )}
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">{tt('col.jenisPembayaran')} *</label>
            {editRecord ? (
              <input type="text" disabled value={editRecord.feeTypeName} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-500" />
            ) : opsionalFeeTypes.length === 0 ? (
              <p className="text-[10px] text-amber-400 py-2">{tt('misc.belumAdaJenisOpsional')}</p>
            ) : (
              <select value={feeId ?? ''} onChange={(e) => setFeeId(Number(e.target.value))} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300">
                {opsionalFeeTypes.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
            )}
          </div>
          <div><label className="text-[10px] text-gray-500 block mb-1">{tt('col.periode')} *</label><input type="text" required value={periode} onChange={(e) => setPeriode(e.target.value)} placeholder={tt('placeholder.contohFebruari2025')} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" /></div>
          <div><label className="text-[10px] text-gray-500 block mb-1">{tt('col.jumlah')} (Rp) *</label><input type="number" required value={jumlah} onChange={(e) => setJumlah(parseInt(e.target.value) || 0)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" /></div>
          <div><label className="text-[10px] text-gray-500 block mb-1">{tt('col.jatuhTempo')}</label><input type="date" value={jatuhTempo} onChange={(e) => setJatuhTempo(e.target.value)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" /></div>
          <div className="md:col-span-2 flex gap-2">
            <button type="submit" disabled={!editRecord && opsionalFeeTypes.length === 0} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 disabled:opacity-50"><Save className="w-3.5 h-3.5 inline mr-1" />{editRecord ? tt('btn.update') : tt('btn.simpan')}</button>
            <button type="button" onClick={onDone} className="px-4 py-2 rounded-lg bg-dark-900 border border-gray-700 text-gray-400 text-xs hover:bg-dark-850">{tt('btn.batal')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TagihanPembayaran() {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [tagihanList, setTagihanList] = useState<TagihanDto[]>([]);
  const [feeTypes, setFeeTypes] = useState<FeeTypeDto[]>([]);
  const [students, setStudents] = useState<StudentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState<false | TagihanDto | 'new'>(false);

  async function load() {
    setLoading(true);
    try {
      const [t, f, s] = await Promise.all([fetchTagihan(), fetchFeeTypes(), fetchStudents()]);
      setTagihanList(t); setFeeTypes(f); setStudents(s);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal memuat tagihan.', 'error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function hapus(id: number) {
    try {
      await deleteTagihan(id);
      showToast(tt('msg.berhasilDihapus'));
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menghapus tagihan.', 'error');
    }
  }

  function onFormDone() {
    setFormOpen(false);
    load();
  }

  return (
    <>
      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h3 className="text-sm font-bold text-white">{tt('heading.tagihanPembayaran')} ({tagihanList.length})</h3>
          <button onClick={() => setFormOpen('new')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 text-xs font-medium">
            <Plus className="w-3.5 h-3.5" />{tt('btn.tambah')} {tt('entity.tagihan')}
          </button>
        </div>
        {loading ? <p className="text-xs text-gray-500 py-4">Memuat...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700/50 text-gray-400 text-left">
                  <th className="pb-3">{tt('col.noTagihan')}</th><th className="pb-3">{tt('col.siswa')}</th><th className="pb-3">{tt('col.jenis')}</th>
                  <th className="pb-3">{tt('col.periode')}</th><th className="pb-3 text-right">{tt('col.jumlah')}</th><th className="pb-3">{tt('col.jatuhTempo')}</th>
                  <th className="pb-3">{tt('col.status')}</th><th className="pb-3">{tt('col.aksi')}</th>
                </tr>
              </thead>
              <tbody>
                {tagihanList.length ? tagihanList.map((t) => (
                  <tr key={t.id} className="border-b border-gray-700/30">
                    <td className="py-3 text-gray-400">{t.tagihanCode}</td>
                    <td className="py-3 text-white">{t.studentName}</td>
                    <td className="py-3 text-gray-300">
                      {t.feeTypeName}
                      {t.cicilanDari != null && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/20 text-purple-400">{tt('label.cicilanKe')} {t.cicilanKe}/{t.cicilanDari}</span>}
                    </td>
                    <td className="py-3 text-gray-300">{t.periodLabel}</td>
                    <td className="py-3 text-right text-white">
                      {fmt(t.amount)}
                      {t.status === 'SebagianLunas' && <span className="block text-[9px] text-amber-400">{tt('misc.sisaDariTotal')} {fmt(t.amount - t.paidAmount)}</span>}
                    </td>
                    <td className="py-3 text-gray-300">{t.dueDate || '-'}</td>
                    <td className="py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${t.status === 'Lunas' ? 'bg-emerald-500/20 text-emerald-400' : t.status === 'SebagianLunas' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>{t.status}</span></td>
                    <td className="py-3"><TableActions onEdit={t.paidAmount === 0 ? () => setFormOpen(t) : undefined} onDelete={t.paidAmount === 0 ? () => hapus(t.id) : undefined} /></td>
                  </tr>
                )) : <tr><td colSpan={8} className="py-8 text-center text-gray-400">{tt('msg.belumAdaData')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {formOpen && <TagihanForm editRecord={formOpen === 'new' ? null : formOpen} feeTypes={feeTypes} students={students} onDone={onFormDone} />}
    </>
  );
}
