import { useEffect, useState } from 'react';
import { Pencil, Save } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useToast } from '../contexts/ToastContext';
import { PrintBtn } from '../components/Buttons';
import { PengurusSignature } from '../components/PengurusSignature';
import { fetchCashRecap, saveOpeningBalance, ApiError, type CashRecapDto } from '../api';
import { fmt, monthNamesFullId, formatTanggalPanjang } from '../lib/format';
import { DEFAULT_FOUNDATION_NAME, DEFAULT_FOUNDATION_ADDRESS, KWITANSI_ORG_CITY } from '../lib/consts';

function SaldoAwalForm({ onDone }: { onDone: () => void }) {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [nominal, setNominal] = useState('0');

  async function simpan() {
    const amount = parseInt(nominal, 10);
    if (Number.isNaN(amount)) { showToast(tt('msg.nominalTidakValid'), 'error'); return; }
    try {
      await saveOpeningBalance(amount);
      showToast(tt('msg.berhasil'));
      onDone();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan saldo awal.', 'error');
    }
  }

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-4 mb-2">
      <h4 className="text-xs font-bold text-white mb-3">{tt('misc.saldoAwalPencatatan')}</h4>
      <form onSubmit={(e) => { e.preventDefault(); simpan(); }} className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><label className="text-[10px] text-gray-500 block mb-1">{tt('col.jumlah')} *</label><input type="number" required value={nominal} onChange={(e) => setNominal(e.target.value)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" /></div>
        <div className="flex items-end gap-2">
          <button type="submit" className="px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700"><Save className="w-3.5 h-3.5 inline mr-1" />{tt('misc.simpanSaldoAwal')}</button>
          <button type="button" onClick={onDone} className="px-4 py-2 rounded-lg bg-dark-900 border border-gray-700 text-gray-400 text-xs hover:bg-dark-850">{tt('btn.batal')}</button>
        </div>
      </form>
    </div>
  );
}

export function RekapitulasiKas() {
  const { tt } = useI18n();
  const { role } = useRole();
  const { showToast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [recap, setRecap] = useState<CashRecapDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSaldoForm, setShowSaldoForm] = useState(false);
  const isAdmin = role === 'AdminManager';

  useEffect(() => {
    let cancelled = false;
    const periodKey = `${year}-${String(month).padStart(2, '0')}`;
    fetchCashRecap(periodKey)
      .then((d) => { if (!cancelled) { setRecap(d); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'Gagal memuat rekap kas.'); });
    return () => { cancelled = true; };
  }, [year, month]);

  const name = DEFAULT_FOUNDATION_NAME;
  const addr = DEFAULT_FOUNDATION_ADDRESS;
  const todayLong = formatTanggalPanjang(new Date().toISOString().slice(0, 10));
  const bulanLabel = monthNamesFullId[month - 1] || String(month);

  function onSaldoSaved() {
    setShowSaldoForm(false);
    const periodKey = `${year}-${String(month).padStart(2, '0')}`;
    fetchCashRecap(periodKey).then(setRecap).catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat ulang rekap.', 'error'));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300">
            {monthNamesFullId.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value) || now.getFullYear())} className="w-24 bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300" />
        </div>
        <div className="flex gap-2">
          {isAdmin && <button onClick={() => setShowSaldoForm((v) => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-gray-400 hover:text-white text-xs font-medium"><Pencil className="w-3.5 h-3.5" />{tt('misc.saldoAwalPencatatan')}</button>}
          <PrintBtn label={tt('heading.rekapitulasiKas')} />
        </div>
      </div>
      {showSaldoForm && <div className="no-print"><SaldoAwalForm onDone={onSaldoSaved} /></div>}
      <div className="print-sheet bg-dark-800 rounded-xl border border-gray-700/50 p-6">
        {error ? (
          <p className="text-xs text-red-400 py-8 text-center">{error}</p>
        ) : !recap ? (
          <p className="text-xs text-gray-400 text-center py-8">Memuat...</p>
        ) : (
          <>
            <div className="text-center mb-6 border-b border-gray-700/50 pb-4">
              <h2 className="text-lg font-bold text-white">{name}</h2>
              <p className="text-[10px] text-gray-500">{addr}</p>
              <p className="text-sm font-semibold text-brand-400 mt-1">{tt('heading.rekapitulasiKas').toUpperCase()}</p>
              <p className="text-[10px] text-gray-500">{tt('misc.periode')}: {bulanLabel} {year}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-700/50 text-gray-400 text-left"><th className="pb-3">{tt('col.tanggal')}</th><th className="pb-3">{tt('col.uraian')}</th><th className="pb-3 text-right">{tt('col.debet')}</th><th className="pb-3 text-right">{tt('col.kredit')}</th><th className="pb-3 text-right">{tt('col.saldo')}</th></tr></thead>
                <tbody>
                  <tr className="border-b border-gray-700/30 bg-dark-900/40"><td className="py-2 text-white" colSpan={2}>{tt('misc.saldoBulan')} {bulanLabel}</td><td className="py-2 text-right text-gray-500">-</td><td className="py-2 text-right text-gray-500">-</td><td className="py-2 text-right font-semibold text-white">{fmt(recap.saldoAwalPeriode)}</td></tr>
                  {recap.baris.map((r, i) => (
                    <tr key={i} className="border-b border-gray-700/30">
                      <td className="py-2 text-gray-300">{r.txDate}</td><td className="py-2 text-gray-300">{r.description}</td>
                      <td className={`py-2 text-right ${r.txType === 'Masuk' ? 'text-emerald-400' : 'text-gray-500'}`}>{r.txType === 'Masuk' ? fmt(r.amount) : '-'}</td>
                      <td className={`py-2 text-right ${r.txType === 'Keluar' ? 'text-red-400' : 'text-gray-500'}`}>{r.txType === 'Keluar' ? fmt(r.amount) : '-'}</td>
                      <td className="py-2 text-right font-medium text-white">{fmt(r.saldoBerjalan)}</td>
                    </tr>
                  ))}
                  {recap.baris.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-gray-400">{tt('msg.belumAdaData')}</td></tr>}
                </tbody>
                <tfoot><tr className="border-t border-gray-600 font-bold"><td colSpan={2} className="py-3 text-white">{tt('col.total')}</td><td className="py-3 text-right text-emerald-400">{fmt(recap.totalMasuk)}</td><td className="py-3 text-right text-red-400">{fmt(recap.totalKeluar)}</td><td className="py-3 text-right text-white">{fmt(recap.saldoAkhirPeriode)}</td></tr></tfoot>
              </table>
            </div>
            <div className="grid grid-cols-5 mt-12 text-xs">
              <div className="text-center"><p className="text-gray-400">{tt('misc.diperiksaOleh')}</p><div className="h-14" /><PengurusSignature official={undefined} fallbackJabatan="Spv. Keuangan" /></div>
              <div></div><div></div><div></div>
              <div className="text-center">
                <p className="text-gray-400">{KWITANSI_ORG_CITY}, {todayLong}</p>
                <p className="text-gray-400">{name},</p>
                <div className="h-14" />
                <PengurusSignature official={undefined} fallbackJabatan="Adm. Keuangan" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
