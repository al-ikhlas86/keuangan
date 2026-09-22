import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useToast } from '../contexts/ToastContext';
import { usePeriodFilter } from '../contexts/PeriodFilterContext';
import { PeriodFilterBar } from '../components/PeriodFilterBar';
import { PrintBtn, ExportBtn, KwitansiBtn } from '../components/Buttons';
import { fmt, filterTransactionsByPeriod, downloadCsv } from '../lib/format';
import { fetchTransactions, ApiError, type TransactionDto, type PaymentMethod } from '../api';

// Disederhanakan Fase 1: dulu difilter `source_role in [kasir,akuntansi]`
// (backend tidak melacak itu lagi) - sekarang riwayat pembayaran SISWA
// dikenali dari `studentName` terisi (transaksi hasil Terima Pembayaran
// SELALU terkait 1 siswa), bukan lagi siapa yang mencatatnya.
export function JurnalPenerimaan({ metode }: { metode: PaymentMethod }) {
  const { tt } = useI18n();
  const { openKwitansi } = useRole();
  const { showToast } = useToast();
  const { get } = usePeriodFilter();
  const [transactions, setTransactions] = useState<TransactionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const ns = metode === 'Cash' ? 'riwayatPembayaranCash' : 'riwayatPembayaranTransfer';
  const st = get(ns);
  const heading = metode === 'Cash' ? tt('heading.riwayatPembayaranCash') : tt('heading.riwayatPembayaranTransfer');

  useEffect(() => {
    let cancelled = false;
    fetchTransactions({ txType: 'Masuk' })
      .then((t) => { if (!cancelled) setTransactions(t.filter((x) => x.paymentMethod === metode && x.studentName)); })
      .catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat riwayat pembayaran.', 'error'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metode]);

  const masuk = filterTransactionsByPeriod(transactions, st);
  const total = masuk.reduce((a, t) => a + t.amount, 0);

  const exportCsv = () => downloadCsv(metode === 'Cash' ? 'riwayat-pembayaran-cash' : 'riwayat-pembayaran-transfer', ['Tanggal', 'Siswa', 'Keterangan', 'Metode', 'Jumlah'],
    masuk.map((t) => [t.txDate, t.studentName, t.description, t.paymentMethod, t.amount]));

  return (
    <div className="print-sheet bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-bold text-white">{heading} ({masuk.length})</h3>
        <div className="flex gap-2"><PrintBtn label={metode === 'Cash' ? 'Riwayat Cash' : 'Riwayat Transfer'} /><ExportBtn onClick={exportCsv} /></div>
      </div>
      <PeriodFilterBar ns={ns} />
      {loading ? <p className="text-xs text-gray-500 py-4">Memuat...</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700/50 text-gray-400 text-left">
                <th className="pb-3">{tt('col.tanggal')}</th><th className="pb-3">{tt('col.siswa')}</th><th className="pb-3">{tt('col.keterangan')}</th>
                <th className="pb-3">{tt('col.metode')}</th><th className="pb-3 text-right">{tt('col.jumlah')}</th><th className="pb-3">{tt('col.aksi')}</th>
              </tr>
            </thead>
            <tbody>
              {masuk.length ? masuk.map((t) => (
                <tr key={t.id} className="border-b border-gray-700/30">
                  <td className="py-3 text-gray-300">{t.txDate}</td>
                  <td className="py-3 text-white">{t.studentName}</td>
                  <td className="py-3 text-gray-300">{t.description}</td>
                  <td className="py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${t.paymentMethod === 'Cash' ? 'badge-cash' : 'badge-transfer'}`}>{t.paymentMethod}</span></td>
                  <td className="py-3 text-right font-semibold text-emerald-400">{fmt(t.amount)}</td>
                  <td className="py-3"><KwitansiBtn onClick={() => openKwitansi(String(t.id))} /></td>
                </tr>
              )) : <tr><td colSpan={6} className="py-8 text-center text-gray-400">{tt('misc.tidakAdaPembayaranPeriodeIni')}</td></tr>}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-600"><td colSpan={4} className="py-2 font-bold text-white text-sm">{tt('misc.totalSemua').toUpperCase()}</td><td className="py-2 text-right font-bold text-white text-sm">{fmt(total)}</td><td></td></tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
