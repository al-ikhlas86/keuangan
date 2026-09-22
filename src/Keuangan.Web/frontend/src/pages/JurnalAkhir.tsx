import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { JournalAccountPicker } from '../components/JournalAccountPicker';
import { closePeriod, fetchPeriods, fetchAccounts, ApiError, type PeriodClosingDto, type AccountDto } from '../api';
import { fmt } from '../lib/format';

// Disederhanakan Fase 1: backend (PeriodsEndpoints.cs) HANYA menyimpan
// periode yang SUDAH ditutup (tidak ada baris "periode terbuka" utk dipilih
// dari dropdown, beda dari Akuntansi lama) - form di sini murni "tutup
// periode baru" (ketik YYYY-MM, sekali per periode, ditolak kalau sudah
// pernah) + daftar riwayat periode yang sudah ditutup di bawahnya. Rincian
// per-akun (Penutup Pendapatan/Beban) DITUNDA - cukup total pemasukan/
// pengeluaran periode itu, sudah dihitung otomatis oleh backend.
export function JurnalAkhir() {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [periods, setPeriods] = useState<PeriodClosingDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodKey, setPeriodKey] = useState('');
  const [debitId, setDebitId] = useState<number | null>(null);
  const [creditId, setCreditId] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);
  const [closing, setClosing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([fetchPeriods(), fetchAccounts()]);
      setPeriods(p); setAccounts(a.filter((x) => x.isActive));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal memuat periode.', 'error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function tutupPeriode() {
    if (!/^\d{4}-\d{2}$/.test(periodKey)) { showToast('Format periode harus YYYY-MM.', 'error'); return; }
    if (!window.confirm(`${tt('msg.konfirmasiTutupPeriode')} ${periodKey}?`)) return;
    setClosing(true);
    try {
      const journalLines = debitId && creditId && amount > 0
        ? [{ accountId: debitId, debit: amount, credit: 0 }, { accountId: creditId, debit: 0, credit: amount }]
        : undefined;
      await closePeriod(periodKey, journalLines);
      setPeriodKey(''); setDebitId(null); setCreditId(null); setAmount(0);
      showToast(tt('msg.periodeBerhasilDitutup'));
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menutup periode.', 'error');
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="print-sheet bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <h3 className="text-sm font-bold text-white mb-4">{tt('heading.jurnalAkhir')}</h3>

      <div className="p-4 rounded-lg border border-dashed border-gray-700/50 mb-5 space-y-3">
        <p className="text-xs font-semibold text-gray-300">{tt('btn.tutupPeriode')}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input type="month" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} className="bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300" />
          <input type="number" placeholder="Nominal jurnal penutup (opsional)" value={amount || ''} onChange={(e) => setAmount(parseInt(e.target.value) || 0)} className="bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 md:col-span-2" />
        </div>
        {amount > 0 && <JournalAccountPicker accounts={accounts} debitId={debitId} setDebitId={setDebitId} creditId={creditId} setCreditId={setCreditId} />}
        <button onClick={tutupPeriode} disabled={closing || !periodKey} className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs font-medium disabled:opacity-50"><Lock className="w-3.5 h-3.5 inline mr-1" />{tt('btn.tutupPeriode')}</button>
      </div>

      {loading ? <p className="text-xs text-gray-500 py-4">Memuat...</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-gray-700/50 text-gray-400 text-left"><th className="pb-3">{tt('misc.periode') || 'Periode'}</th><th className="pb-3">{tt('status.sudahDitutup')}</th><th className="pb-3 text-right">{tt('stat.totalPemasukan')}</th><th className="pb-3 text-right">{tt('stat.totalPengeluaran')}</th></tr></thead>
            <tbody>
              {periods.length ? periods.map((p) => (
                <tr key={p.id} className="border-b border-gray-700/30">
                  <td className="py-3 text-white font-medium">{p.periodKey}</td>
                  <td className="py-3 text-gray-300">{new Date(p.closedAt).toLocaleString('id-ID')}</td>
                  <td className="py-3 text-right text-emerald-400">{fmt(p.totalIncome)}</td>
                  <td className="py-3 text-right text-red-400">{fmt(p.totalExpense)}</td>
                </tr>
              )) : <tr><td colSpan={4} className="py-8 text-center text-gray-400">{tt('msg.belumAdaData')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
