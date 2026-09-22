import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { ExportBtn, PrintBtn } from '../components/Buttons';
import { fmt, downloadCsv } from '../lib/format';
import { fetchTransactions, fetchTransactionDetail, ApiError, type TransactionDto, type TransactionDetailDto } from '../api';

// Disederhanakan Fase 1: TIDAK ada lagi scoping "akuntansi lihat jurnal
// kasir+akuntansi" (source_role per transaksi tidak dilacak lagi di backend)
// dan tombol "+Tambah Entri" lama (di Akuntansi cuma toast palsu, tidak
// pernah benar2 menyimpan apa pun) - entri jurnal SELALU lewat transaksi
// nyata (Penerimaan/Pengeluaran/Terima Pembayaran), halaman ini murni buku
// besar baca-saja. Baris jurnal per transaksi di-load sekali di awal
// (N+1 fetch kecil, wajar utk ukuran data 1 yayasan).
export function Jurnal() {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [rows, setRows] = useState<{ tx: TransactionDto; detail: TransactionDetailDto }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const list = await fetchTransactions();
        const details = await Promise.all(list.map((t) => fetchTransactionDetail(t.id)));
        if (!cancelled) setRows(list.map((tx, i) => ({ tx, detail: details[i] })));
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Gagal memuat jurnal.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flatRows = rows.flatMap(({ tx, detail }) => detail.journalLines.map((line) => ({ tx, line })));
  const totalDebit = flatRows.reduce((a, r) => a + r.line.debit, 0);
  const totalCredit = flatRows.reduce((a, r) => a + r.line.credit, 0);

  const exportCsv = () => {
    const csvRows = flatRows.map(({ tx, line }) => [tx.txCode, tx.txDate, tx.description, line.accountName, line.debit, line.credit]);
    downloadCsv('jurnal-umum', ['No Transaksi', 'Tanggal', 'Keterangan', 'Nama Akun', 'Debit', 'Kredit'], csvRows);
  };

  return (
    <div className="print-sheet bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h3 className="text-sm font-bold text-white">{tt('heading.jurnalUmum')}</h3>
        <div className="flex gap-2 no-print">
          <ExportBtn onClick={exportCsv} />
          <PrintBtn label="Jurnal" />
        </div>
      </div>
      {loading ? <p className="text-xs text-gray-500 py-4">Memuat...</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700/50 text-gray-400 text-left">
                <th className="pb-3 font-semibold">{tt('col.tanggal')}</th><th className="pb-3 font-semibold">{tt('col.noBukti')}</th>
                <th className="pb-3 font-semibold">{tt('col.keterangan')}</th><th className="pb-3 font-semibold">{tt('col.akun')}</th>
                <th className="pb-3 font-semibold text-right">{tt('col.debit')}</th><th className="pb-3 font-semibold text-right">{tt('col.kredit')}</th>
                <th className="pb-3 font-semibold">{tt('col.metode')}</th>
              </tr>
            </thead>
            <tbody>
              {flatRows.length ? flatRows.map(({ tx, line }, i) => (
                <tr key={tx.id + '_' + i} className="border-b border-gray-700/30">
                  <td className="py-3 text-gray-300">{tx.txDate}</td>
                  <td className="py-3 text-gray-400">{tx.txCode}</td>
                  <td className="py-3 text-gray-300">{tx.description}</td>
                  <td className="py-3 text-white">{line.accountName}</td>
                  <td className="py-3 text-right text-emerald-400">{line.debit > 0 ? fmt(line.debit) : '-'}</td>
                  <td className="py-3 text-right text-blue-400">{line.credit > 0 ? fmt(line.credit) : '-'}</td>
                  <td className="py-3 text-gray-300"><span className={`${tx.paymentMethod === 'Cash' ? 'badge-cash' : 'badge-transfer'} px-2 py-0.5 rounded text-[10px]`}>{tx.paymentMethod}</span></td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400">{tt('misc.belumAdaEntriJurnal')}</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-600 font-bold">
                <td colSpan={4} className="py-3 text-white">{tt('col.total').toUpperCase()}</td>
                <td className="py-3 text-right text-emerald-400">{fmt(totalDebit)}</td>
                <td className="py-3 text-right text-blue-400">{fmt(totalCredit)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
