import { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, Printer, Save } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { useToast } from '../contexts/ToastContext';
import { PayrollFieldsForm } from '../components/PayrollFieldsForm';
import { SlipGajiCell } from '../components/SlipGajiCell';
import { PAYROLL_EDUCATION_LEVELS, EMPLOYEE_TYPES, penggajianYearOptions, penggajianPeriodLabel } from '../lib/payroll';
import { fmt, monthNamesFullId } from '../lib/format';
import { fetchPayrollItemForEmployee, fetchSalarySlipNo, fetchPayrollHistory, updateEmployeeRincianGaji, ApiError, type PayrollItemSingleDto, type PayrollHistoryRow } from '../api';

// Profil pegawai: identitas dari Data Master (baca-saja) + rincian khusus Keuangan (tipe & jenjang
// pendidikan, dipakai penggajian) + input gaji per bulan + cetak ulang slip + riwayat pembayaran.
export function PegawaiDetail() {
  const { tt } = useI18n();
  const { role, pegawaiDetailId, navigateTo } = useRole();
  const { data, refetch } = useBootstrap();
  const { showToast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [payrollData, setPayrollData] = useState<PayrollItemSingleDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [printMode, setPrintMode] = useState(false);
  const [slipNo, setSlipNo] = useState('');
  const [riwayat, setRiwayat] = useState<PayrollHistoryRow[]>([]);
  const [tipe, setTipe] = useState('Tetap');
  const [pendidikan, setPendidikan] = useState('');
  const [savingRincian, setSavingRincian] = useState(false);

  const e = (data?.employees || []).find((x) => x.db_id === pegawaiDetailId);
  const isAdminOrStaff = role === 'AdminManager' || role === 'Staff';

  useEffect(() => {
    if (!e) return;
    setTipe(e.tipe || 'Tetap');
    setPendidikan(e.pendidikan || '');
    fetchPayrollHistory(e.db_id).then(setRiwayat).catch(() => setRiwayat([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e?.db_id]);

  useEffect(() => {
    if (!e) return;
    let cancelled = false;
    setLoading(true);
    const period = `${monthNamesFullId[month - 1]} ${year}`;
    fetchPayrollItemForEmployee(role, period, e.db_id).then((d) => { if (!cancelled) { setPayrollData(d); setLoading(false); } }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e?.db_id, year, month, role]);

  // Cetak ulang slip 1 pegawai utk 1 periode - satu-satunya jalan cetak slip utk pegawai yang sudah
  // diarsipkan (mereka tidak muncul di daftar borongan Bayar Gaji).
  useEffect(() => {
    if (!printMode) return;
    const el = document.getElementById('dynamicPageStyle');
    if (el) el.textContent = '@page{size:A4 portrait;margin:0.4in;}';
    window.print();
    const backToProfile = () => { setPrintMode(false); if (el) el.textContent = ''; };
    window.addEventListener('afterprint', backToProfile);
    return () => window.removeEventListener('afterprint', backToProfile);
  }, [printMode]);

  if (!e) {
    return <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-6 text-center text-xs text-gray-400">{tt('msg.belumAdaData')}</div>;
  }

  async function cetakSlip() {
    if (!payrollData?.payroll_item_id) return;
    try { setSlipNo((await fetchSalarySlipNo(role, payrollData.payroll_item_id)).slip_no); } catch { /* nomor slip opsional, jangan blokir cetak */ }
    setPrintMode(true);
  }

  async function simpanRincian() {
    if (!e) return;
    setSavingRincian(true);
    try {
      await updateEmployeeRincianGaji(e.db_id, { tipe, pendidikan });
      await refetch();
      showToast(tt('msg.berhasil'));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan rincian pegawai.', 'error');
    } finally {
      setSavingRincian(false);
    }
  }

  if (printMode && payrollData && e) {
    return (
      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-6 print-sheet">
        <div className="bg-white rounded-lg p-4"><SlipGajiCell item={payrollData} employee={e} periodLabel={penggajianPeriodLabel(year, month)} slipNo={slipNo} isAdmin={role === 'AdminManager'} /></div>
      </div>
    );
  }

  return (
    <>
      <button onClick={() => navigateTo(e.is_active ? 'pegawai' : 'arsip_pegawai')} className="no-print flex items-center gap-1.5 text-xs text-gray-400 hover:text-white mb-4"><ArrowLeft className="w-3.5 h-3.5" />{tt('btn.kembali')}</button>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-dark-800 rounded-xl border border-gray-700/50 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-brand-600 flex items-center justify-center text-lg font-bold text-white">{(e.nama || '?').charAt(0)}</div>
            <div><h3 className="text-sm font-bold text-white">{e.nama}</h3><p className="text-[10px] text-gray-400 capitalize">{e.jabatan || '-'}{e.katalog ? ` - ${e.katalog}` : ''}</p></div>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-gray-400">NIP</span><span className="text-white">{e.nip || '-'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">{tt('col.status')}</span><span className={e.is_active ? 'text-emerald-400' : 'text-gray-400'}>{e.is_active ? 'Aktif' : 'Nonaktif'}</span></div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-3">
            <p className="text-[10px] font-semibold text-gray-400">Rincian penggajian</p>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">{tt('col.tipe')}</label>
              <select value={tipe} onChange={(ev) => setTipe(ev.target.value)} disabled={!isAdminOrStaff} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 disabled:opacity-60">
                {EMPLOYEE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">{tt('col.jenjangPendidikan')}</label>
              <select value={pendidikan} onChange={(ev) => setPendidikan(ev.target.value)} disabled={!isAdminOrStaff} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 disabled:opacity-60">
                <option value="">- belum diisi -</option>
                {PAYROLL_EDUCATION_LEVELS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
              <p className="text-[9px] text-gray-500 mt-1">Menentukan tarif komponen per jenjang (mis. Kelebihan Jam Mengajar).</p>
            </div>
            {isAdminOrStaff && (
              <button onClick={simpanRincian} disabled={savingRincian} className="w-full py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold disabled:opacity-50">
                <Save className="w-3.5 h-3.5 inline mr-1" />{savingRincian ? 'Menyimpan...' : tt('btn.simpan')}
              </button>
            )}
          </div>
          <div className="mt-3 p-3 rounded-lg border border-dashed border-gray-700/50 flex items-center gap-2 text-[10px] text-gray-400">
            <BarChart3 className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{tt('misc.placeholderPerforma')}</span>
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h4 className="text-sm font-bold text-white">{tt('heading.inputGajiBulan')}</h4>
              <div className="flex gap-2 no-print">
                <select value={month} onChange={(ev) => setMonth(parseInt(ev.target.value))} className="bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-[10px] text-gray-300">
                  {monthNamesFullId.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select value={year} onChange={(ev) => setYear(parseInt(ev.target.value))} className="bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-[10px] text-gray-300">
                  {penggajianYearOptions(year).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                {payrollData?.is_paid && (
                  <button onClick={cetakSlip} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-purple-600/20 text-purple-400 hover:bg-purple-600/40 text-[10px] font-medium"><Printer className="w-3 h-3" />{tt('btn.cetakSlip')}</button>
                )}
              </div>
            </div>
            {loading || !payrollData ? (
              <p className="text-xs text-gray-400 text-center py-4">{tt('msg.memuat')}</p>
            ) : payrollData.is_paid ? (
              <p className="text-xs text-emerald-400 py-2">Gaji periode ini sudah dibayar dan terkunci. Gunakan "Cetak Slip" untuk mencetak ulang.</p>
            ) : (
              <PayrollFieldsForm employee={e} year={year} month={month} initialData={{ hari_masuk: payrollData.hari_masuk, keterangan: payrollData.keterangan, lines: payrollData.lines }}
                onSaved={() => { const period = `${monthNamesFullId[month - 1]} ${year}`; return fetchPayrollItemForEmployee(role, period, e.db_id).then(setPayrollData); }} />
            )}
          </div>
          <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
            <h4 className="text-sm font-bold text-white mb-3">{tt('heading.riwayatPembayaran')}</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-700/50 text-gray-400 text-left"><th className="pb-2">Periode</th><th className="pb-2">{tt('col.tanggal')}</th><th className="pb-2">No. Slip</th><th className="pb-2">{tt('col.metode')}</th><th className="pb-2 text-right">{tt('col.jumlah')}</th></tr></thead>
                <tbody>
                  {riwayat.length ? riwayat.map((t) => (
                    <tr key={t.txCode} className="border-b border-gray-700/30">
                      <td className="py-2 text-gray-300">{t.periodLabel}</td><td className="py-2 text-gray-300">{t.txDate}</td>
                      <td className="py-2 text-gray-400">{t.slipNo || '-'}</td>
                      <td className="py-2"><span className={`px-2 py-0.5 rounded text-[10px] ${t.method === 'Cash' ? 'badge-cash' : 'badge-transfer'}`}>{t.method}</span></td>
                      <td className="py-2 text-right text-red-400">{fmt(t.amount)}</td>
                    </tr>
                  )) : <tr><td colSpan={5} className="py-4 text-center text-gray-400">{tt('msg.belumAdaData')}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
