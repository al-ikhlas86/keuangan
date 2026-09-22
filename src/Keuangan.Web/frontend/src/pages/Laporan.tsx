import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { PrintBtn, ExportBtn } from '../components/Buttons';
import { fmt, downloadCsv } from '../lib/format';
import { DEFAULT_FOUNDATION_NAME, DEFAULT_FOUNDATION_ADDRESS } from '../lib/consts';
import { fetchTransactions, fetchTransactionDetail, fetchAccounts, ApiError, type TransactionDto, type AccountDto } from '../api';

interface AccountAgg { label: string; value: number }

export function Laporan() {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [txList, setTxList] = useState<TransactionDto[]>([]);
  const [penerimaanDetail, setPenerimaanDetail] = useState<AccountAgg[]>([]);
  const [pengeluaranDetail, setPengeluaranDetail] = useState<AccountAgg[]>([]);
  const [loading, setLoading] = useState(true);
  const name = DEFAULT_FOUNDATION_NAME;
  const addr = DEFAULT_FOUNDATION_ADDRESS;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [list, accounts] = await Promise.all([fetchTransactions(), fetchAccounts()]);
        const accountTypeById: Record<number, AccountDto> = {};
        accounts.forEach((a) => { accountTypeById[a.id] = a; });
        const details = await Promise.all(list.map((t) => fetchTransactionDetail(t.id)));
        const income: Record<string, number> = {};
        const expense: Record<string, number> = {};
        details.forEach((d) => {
          d.journalLines.forEach((line) => {
            const acc = accountTypeById[line.accountId];
            if (!acc) return;
            if (acc.accountType === 'Income' && line.credit > 0) income[acc.name] = (income[acc.name] || 0) + line.credit;
            if (acc.accountType === 'Expense' && line.debit > 0) expense[acc.name] = (expense[acc.name] || 0) + line.debit;
          });
        });
        if (!cancelled) {
          setTxList(list);
          setPenerimaanDetail(Object.entries(income).map(([label, value]) => ({ label, value })));
          setPengeluaranDetail(Object.entries(expense).map(([label, value]) => ({ label, value })));
        }
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Gagal memuat laporan.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalMasuk = txList.filter((t) => t.txType === 'Masuk').reduce((a, t) => a + t.amount, 0);
  const totalKeluar = txList.filter((t) => t.txType === 'Keluar').reduce((a, t) => a + t.amount, 0);

  const exportCsv = () => {
    downloadCsv('laporan-keuangan', ['Kategori', 'Label', 'Jumlah'], [
      ...penerimaanDetail.map((d) => ['Penerimaan', d.label, d.value]),
      ...pengeluaranDetail.map((d) => ['Pengeluaran', d.label, d.value]),
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap no-print"><PrintBtn label="Laporan" /><ExportBtn onClick={exportCsv} /></div>
      <div className="print-sheet bg-dark-800 rounded-xl border border-gray-700/50 p-6">
        <div className="text-center mb-6 border-b border-gray-700/50 pb-4">
          <h2 className="text-lg font-bold text-white">{name}</h2>
          <p className="text-[10px] text-gray-500">{addr}</p>
          <p className="text-sm font-semibold text-brand-400 mt-1">{tt('heading.laporanKeuangan').toUpperCase()}</p>
        </div>
        {loading ? <p className="text-xs text-gray-400 text-center py-6">Memuat...</p> : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3">{tt('misc.penerimaan')}</h4>
                <div className="space-y-2">
                  {penerimaanDetail.length ? penerimaanDetail.map((d, i) => (
                    <div key={i} className="flex justify-between text-xs"><span className="text-gray-400">{d.label}</span><span className="text-white">{fmt(d.value)}</span></div>
                  )) : <div className="text-xs text-gray-500">{tt('msg.belumAdaData')}</div>}
                  <div className="flex justify-between text-xs font-bold border-t border-gray-700/50 pt-2 mt-2"><span className="text-emerald-400">{tt('misc.totalPenerimaan')}</span><span className="text-emerald-400">{fmt(totalMasuk)}</span></div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3">{tt('misc.pengeluaran')}</h4>
                <div className="space-y-2">
                  {pengeluaranDetail.length ? pengeluaranDetail.map((d, i) => (
                    <div key={i} className="flex justify-between text-xs"><span className="text-gray-400">{d.label}</span><span className="text-white">{fmt(d.value)}</span></div>
                  )) : <div className="text-xs text-gray-500">{tt('msg.belumAdaData')}</div>}
                  <div className="flex justify-between text-xs font-bold border-t border-gray-700/50 pt-2 mt-2"><span className="text-red-400">{tt('misc.totalPengeluaran')}</span><span className="text-red-400">{fmt(totalKeluar)}</span></div>
                </div>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t-2 border-gray-600">
              <div className="flex justify-between text-sm font-bold">
                <span className="text-white">{tt('misc.sisaDanaUpper')}</span>
                <span className={totalMasuk - totalKeluar >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmt(totalMasuk - totalKeluar)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div className="bg-dark-900 rounded-lg p-3"><p className="text-gray-500 text-[10px]">{tt('misc.totalViaCash')}</p><p className="text-white font-bold">{fmt(txList.filter((t) => t.paymentMethod === 'Cash').reduce((a, t) => a + t.amount, 0))}</p></div>
                <div className="bg-dark-900 rounded-lg p-3"><p className="text-gray-500 text-[10px]">{tt('misc.totalViaTransfer')}</p><p className="text-white font-bold">{fmt(txList.filter((t) => t.paymentMethod === 'Transfer').reduce((a, t) => a + t.amount, 0))}</p></div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
