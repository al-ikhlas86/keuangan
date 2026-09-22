import { useEffect, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useToast } from '../contexts/ToastContext';
import { fetchStudentDetail, updateStudentFinance, ApiError, type StudentDetailDto } from '../api';
import { fmt } from '../lib/format';

// Disederhanakan total dari Akuntansi lama Fase 1 (lihat diskusi porting):
// VA multi-nomor, nominal SPP khusus per siswa, generate rencana cicilan
// otomatis, dan usulan keringanan DITUNDA (endpoint-nya belum ada di backend
// Fase 1 - StudentsEndpoints.cs cuma expose GET + PATCH rincian-keuangan
// dasar). Halaman ini = profil + rincian keuangan (bank/angkatan/VA teks
// tunggal) + 20 tagihan terbaru siswa ybs.
export function SiswaDetail() {
  const { tt } = useI18n();
  const { role, siswaDetailId, navigateTo } = useRole();
  const { showToast } = useToast();
  const [s, setS] = useState<StudentDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [angkatan, setAngkatan] = useState('');
  const [vaNumber, setVaNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const canEdit = role === 'AdminManager' || role === 'Staff';

  useEffect(() => {
    if (!siswaDetailId) return;
    let cancelled = false;
    setLoading(true);
    fetchStudentDetail(Number(siswaDetailId))
      .then((d) => {
        if (cancelled) return;
        setS(d);
        setBankAccountNo(d.bankAccountNo || '');
        setAngkatan(d.angkatan || '');
        setVaNumber(d.vaNumber || '');
      })
      .catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat data siswa.', 'error'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siswaDetailId]);

  async function simpanRincian() {
    if (!s) return;
    setSaving(true);
    try {
      await updateStudentFinance(s.id, { bankAccountNo, angkatan, vaNumber });
      setS({ ...s, bankAccountNo, angkatan, vaNumber });
      showToast(tt('msg.berhasil'));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan rincian keuangan.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-xs text-gray-500 py-4">Memuat...</p>;
  if (!s) return <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-6 text-center text-xs text-gray-400">{tt('msg.belumAdaData')}</div>;

  return (
    <>
      <button onClick={() => navigateTo('siswa')} className="no-print flex items-center gap-1.5 text-xs text-gray-400 hover:text-white mb-4"><ArrowLeft className="w-3.5 h-3.5" />{tt('btn.kembali')}</button>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-dark-800 rounded-xl border border-gray-700/50 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-brand-600 flex items-center justify-center text-lg font-bold text-white">{(s.name || '?').charAt(0)}</div>
            <div>
              <h3 className="text-sm font-bold text-white">{s.name}</h3>
              <p className="text-[10px] text-gray-500">{s.nis} - {s.className} ({s.tingkat})</p>
            </div>
          </div>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between"><span className="text-gray-400">{tt('col.status')}</span><span className="text-white">{s.status}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">{tt('misc.sinkronTerakhir') || 'Sinkron Terakhir'}</span><span className="text-white">{s.syncedAt ? new Date(s.syncedAt).toLocaleString('id-ID') : '-'}</span></div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-3">
            <p className="text-[10px] font-semibold text-gray-400">{tt('misc.rincianKeuangan') || 'Rincian Keuangan'}</p>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">{tt('col.norek')}</label>
              <input value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} disabled={!canEdit} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 disabled:opacity-60" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">{tt('label.angkatan')}</label>
              <input value={angkatan} onChange={(e) => setAngkatan(e.target.value)} disabled={!canEdit} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 disabled:opacity-60" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">{tt('col.nomorVa')}</label>
              <input value={vaNumber} onChange={(e) => setVaNumber(e.target.value)} disabled={!canEdit} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 disabled:opacity-60" />
            </div>
            {canEdit && (
              <button onClick={simpanRincian} disabled={saving} className="w-full py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold disabled:opacity-50">
                <Save className="w-3.5 h-3.5 inline mr-1" />{saving ? 'Menyimpan...' : tt('btn.simpan')}
              </button>
            )}
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
            <h4 className="text-sm font-bold text-white mb-3">{tt('heading.tagihanBelumLunas') || 'Tagihan Terbaru'} ({s.tagihanTerbaru.length})</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700/50 text-gray-400 text-left">
                    <th className="pb-2">{tt('misc.periode') || 'Periode'}</th><th className="pb-2 text-right">{tt('col.jumlah')}</th>
                    <th className="pb-2 text-right">{tt('misc.sudahDibayarLabel') || 'Terbayar'}</th><th className="pb-2">{tt('col.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.tagihanTerbaru.length ? s.tagihanTerbaru.map((t) => (
                    <tr key={t.id} className="border-b border-gray-700/30">
                      <td className="py-2 text-gray-300">{t.periodLabel}</td>
                      <td className="py-2 text-right text-gray-300">{fmt(t.amount)}</td>
                      <td className="py-2 text-right text-emerald-400">{fmt(t.paidAmount)}</td>
                      <td className="py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${t.status === 'Lunas' ? 'bg-emerald-500/20 text-emerald-400' : t.status === 'Sebagian' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>{t.status}</span></td>
                    </tr>
                  )) : <tr><td colSpan={4} className="py-6 text-center text-gray-400">{tt('msg.belumAdaData')}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
