import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { PrintBtn, ExportBtn } from '../components/Buttons';
import { PengurusSignature } from '../components/PengurusSignature';
import { fmt, downloadCsv, formatTanggalPanjang } from '../lib/format';
import { DEFAULT_FOUNDATION_NAME, DEFAULT_FOUNDATION_ADDRESS, KWITANSI_ORG_CITY } from '../lib/consts';
import { fetchTransactions, ApiError, type TransactionDto } from '../api';

// Disederhanakan Fase 1: dulu scoping per role via source_role (backend
// tidak melacak itu lagi) - sekarang kedua varian (Kasir/Akuntansi)
// menampilkan SEMUA transaksi, bedanya cuma judul & apakah ada baris tanda
// tangan Kasir di bawah.
export function Cetak({ role }: { role: 'kasir' | 'akuntansi' }) {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [txList, setTxList] = useState<TransactionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const name = DEFAULT_FOUNDATION_NAME;
  const addr = DEFAULT_FOUNDATION_ADDRESS;

  useEffect(() => {
    fetchTransactions().then(setTxList).catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat data.', 'error')).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalMasuk = txList.filter((t) => t.txType === 'Masuk').reduce((a, t) => a + t.amount, 0);
  const totalKeluar = txList.filter((t) => t.txType === 'Keluar').reduce((a, t) => a + t.amount, 0);
  const cashIn = txList.filter((t) => t.txType === 'Masuk' && t.paymentMethod === 'Cash').reduce((a, t) => a + t.amount, 0);
  const transferIn = txList.filter((t) => t.txType === 'Masuk' && t.paymentMethod === 'Transfer').reduce((a, t) => a + t.amount, 0);
  const cashOut = txList.filter((t) => t.txType === 'Keluar' && t.paymentMethod === 'Cash').reduce((a, t) => a + t.amount, 0);
  const transferOut = txList.filter((t) => t.txType === 'Keluar' && t.paymentMethod === 'Transfer').reduce((a, t) => a + t.amount, 0);

  const exportCsv = () => downloadCsv('cetak-laporan', ['Tanggal', 'Keterangan', 'Jenis', 'Metode', 'Jumlah'], txList.map((t) => [t.txDate, t.description, t.txType, t.paymentMethod, t.amount]));

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap no-print"><PrintBtn label="Laporan" /><ExportBtn onClick={exportCsv} /></div>
      <div className="print-sheet bg-dark-800 rounded-xl border border-gray-700/50 p-6">
        <div className="text-center mb-6 border-b border-gray-700/50 pb-4">
          <h2 className="text-lg font-bold text-white">{name}</h2>
          <p className="text-[10px] text-gray-500">{addr}</p>
          <p className="text-sm font-semibold text-brand-400 mt-1">{(role === 'kasir' ? tt('heading.laporanTransaksiKasir') : tt('heading.laporanJurnalAkhir')).toUpperCase()}</p>
        </div>
        {loading ? <p className="text-xs text-gray-400 text-center py-6">Memuat...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-gray-700/50 text-gray-400 text-left"><th className="pb-3">{tt('col.tanggal')}</th><th className="pb-3">{tt('col.keterangan')}</th><th className="pb-3">{tt('col.jenis')}</th><th className="pb-3">{tt('col.metode')}</th><th className="pb-3 text-right">{tt('col.jumlah')}</th></tr></thead>
              <tbody>
                {txList.map((t) => (
                  <tr key={t.id} className="border-b border-gray-700/30">
                    <td className="py-2 text-gray-300">{t.txDate}</td><td className="py-2 text-gray-300">{t.description}</td>
                    <td className="py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${t.txType === 'Masuk' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{t.txType}</span></td>
                    <td className="py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${t.paymentMethod === 'Cash' ? 'badge-cash' : 'badge-transfer'}`}>{t.paymentMethod}</span></td>
                    <td className={`py-2 text-right font-semibold ${t.txType === 'Masuk' ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {txList.length === 0 && <p className="text-xs text-gray-400 text-center py-6">{tt('msg.belumAdaData')}</p>}
          </div>
        )}

        <div className="mt-6 border-t border-gray-600 pt-4">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">{tt('heading.ringkasan')}</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-dark-900 rounded-lg p-3"><p className="text-[10px] text-gray-500">Penerimaan Cash</p><p className="font-bold text-emerald-400">{fmt(cashIn)}</p></div>
            <div className="bg-dark-900 rounded-lg p-3"><p className="text-[10px] text-gray-500">Penerimaan Transfer</p><p className="font-bold text-blue-400">{fmt(transferIn)}</p></div>
            <div className="bg-dark-900 rounded-lg p-3"><p className="text-[10px] text-gray-500">Pengeluaran Cash</p><p className="font-bold text-red-400">{fmt(cashOut)}</p></div>
            <div className="bg-dark-900 rounded-lg p-3"><p className="text-[10px] text-gray-500">Pengeluaran Transfer</p><p className="font-bold text-orange-400">{fmt(transferOut)}</p></div>
          </div>
          <div className="mt-3 flex justify-between items-center bg-dark-900 rounded-lg p-4">
            <span className="text-sm font-bold text-white">{tt('misc.sisaDanaUpper')}</span>
            <span className={`text-lg font-bold ${totalMasuk - totalKeluar >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(totalMasuk - totalKeluar)}</span>
          </div>
        </div>
        {role === 'kasir' && (
          <div className="mt-10 text-xs text-right">
            <p className="text-gray-400">{KWITANSI_ORG_CITY}, {formatTanggalPanjang(new Date().toISOString().slice(0, 10))}</p>
            <div className="h-14" />
            <PengurusSignature official={undefined} fallbackJabatan="Kasir" />
          </div>
        )}
      </div>
    </div>
  );
}
