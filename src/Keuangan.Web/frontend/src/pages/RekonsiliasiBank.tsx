import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useToast } from '../contexts/ToastContext';
import { useDeleteModal } from '../contexts/DeleteModalContext';
import { fetchBankLines, createBankLine, deleteBankLine, matchBankLine, fetchTransactions, ApiError, type BankLineDto, type TransactionDto } from '../api';
import { fmt } from '../lib/format';

// Port RekonsiliasiBank.tsx Akuntansi: mutasi rekening koran dicatat manual, lalu dicocokkan ke
// transaksi transfer masuk. Saran otomatis = nominal sama dan selisih tanggal <= 3 hari. Lebih ketat
// dari Akuntansi lama: 1 transaksi hanya boleh dicocokkan ke 1 mutasi dan nominalnya harus sama
// (dijaga di server, lihat ValidationEndpoints.cs).
export function RekonsiliasiBank() {
  const { tt } = useI18n();
  const { role } = useRole();
  const { showToast } = useToast();
  const { openDeleteModal } = useDeleteModal();
  const [tanggal, setTanggal] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [jumlah, setJumlah] = useState<number | ''>('');
  const [bankLines, setBankLines] = useState<BankLineDto[]>([]);
  const [transactions, setTransactions] = useState<TransactionDto[]>([]);

  async function muat() {
    try {
      const [lines, tx] = await Promise.all([fetchBankLines(), fetchTransactions({ txType: 'Masuk' })]);
      setBankLines(lines);
      setTransactions(tx);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal memuat data rekonsiliasi.', 'error');
    }
  }
  useEffect(() => { muat(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const matchedTxIds = new Set(bankLines.filter((b) => b.matchedTransactionId != null).map((b) => b.matchedTransactionId));
  const unreconciled = transactions.filter((t) => t.paymentMethod === 'Transfer' && !matchedTxIds.has(t.id));

  function suggestFor(line: BankLineDto): TransactionDto | null {
    if (line.matchedTransactionId != null) return null;
    return unreconciled.find((t) => {
      if (Math.abs(t.amount - Math.abs(line.amount)) > 0.01) return false;
      const diffDays = Math.abs((new Date(line.bankDate).getTime() - new Date(t.txDate).getTime()) / 86400000);
      return diffDays <= 3;
    }) || null;
  }

  async function jalankan(aksi: () => Promise<unknown>, pesanBerhasil: string, pesanGagal: string) {
    try {
      await aksi();
      await muat();
      showToast(pesanBerhasil);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : pesanGagal, 'error');
    }
  }

  async function tambah() {
    if (!tanggal || !keterangan.trim() || !jumlah) { showToast(tt('msg.semuaFieldWajib'), 'error'); return; }
    await jalankan(async () => {
      await createBankLine(tanggal, keterangan.trim(), jumlah);
      setTanggal(''); setKeterangan(''); setJumlah('');
    }, tt('msg.mutasiBankBerhasilDitambah'), tt('msg.gagalTambahMutasiBank'));
  }

  const cocok = (line: BankLineDto, txId: number) => jalankan(() => matchBankLine(line.id, txId), tt('msg.berhasilDicocokkan'), tt('msg.gagalMencocokkan'));
  const batal = (line: BankLineDto) => jalankan(() => matchBankLine(line.id, null), tt('msg.cocokDibatalkan'), tt('msg.gagalMembatalkan'));
  const hapus = (line: BankLineDto) => openDeleteModal(() => { jalankan(() => deleteBankLine(line.id), tt('msg.mutasiBankBerhasilDihapus'), tt('msg.gagalMenghapus')); });

  return (
    <>
      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5 mb-4">
        <h3 className="text-sm font-bold text-white mb-1">{tt('heading.tambahMutasiBank')}</h3>
        <p className="text-[10px] text-gray-500 mb-4">{tt('misc.penjelasanRekonsiliasi')}</p>
        <form onSubmit={(e) => { e.preventDefault(); tambah(); }} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div><label className="text-[10px] text-gray-500 block mb-1">{tt('col.tanggal')} *</label><input type="date" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" /></div>
          <div className="md:col-span-2"><label className="text-[10px] text-gray-500 block mb-1">{tt('col.keterangan')} *</label><input type="text" required value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Contoh: TRSF DR ORTU SISWA" className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" /></div>
          <div><label className="text-[10px] text-gray-500 block mb-1">{tt('col.jumlah')} (Rp) *</label><input type="number" required value={jumlah} onChange={(e) => setJumlah(e.target.value ? parseInt(e.target.value) : '')} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" /></div>
          <div className="md:col-span-4"><button type="submit" className="px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700"><Plus className="w-3.5 h-3.5 inline mr-1" />{tt('btn.tambah')}</button></div>
        </form>
      </div>
      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-sm font-bold text-white mb-4">{tt('heading.mutasiBank')} ({bankLines.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-gray-700/50 text-gray-400 text-left"><th className="pb-3">{tt('col.tanggal')}</th><th className="pb-3">{tt('col.keterangan')}</th><th className="pb-3 text-right">{tt('col.jumlah')}</th><th className="pb-3">{tt('col.status')}</th><th className="pb-3">{tt('col.aksi')}</th></tr></thead>
            <tbody>
              {bankLines.length ? bankLines.map((line) => {
                const suggestion = suggestFor(line);
                return (
                  <tr key={line.id} className="border-b border-gray-700/30">
                    <td className="py-3 text-gray-300">{line.bankDate}</td><td className="py-3 text-gray-300">{line.description}</td>
                    <td className="py-3 text-right font-semibold text-white">{fmt(line.amount)}</td>
                    <td className="py-3">
                      {line.matchedTransactionId != null ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">{tt('status.cocok')}: {line.matchedTxCode}</span>
                      ) : suggestion ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400">{tt('misc.sarantersedia')}: {suggestion.txCode}</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-400">{tt('status.belumCocok')}</span>
                      )}
                    </td>
                    <td className="py-3">
                      {line.matchedTransactionId != null ? (
                        <button onClick={() => batal(line)} className="px-2 py-1 rounded bg-gray-600/20 text-gray-400 hover:bg-gray-600/40 text-[10px]">{tt('btn.batalkanCocok')}</button>
                      ) : (
                        <div className="flex gap-1">
                          {suggestion && <button onClick={() => cocok(line, suggestion.id)} className="px-2 py-1 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 text-[10px]">{tt('btn.cocokkan')}</button>}
                          {role === 'AdminManager' && <button onClick={() => hapus(line)} className="p-1.5 rounded btn-icon-delete"><Trash2 className="w-3.5 h-3.5" /></button>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              }) : <tr><td colSpan={5} className="py-8 text-center text-gray-400">{tt('misc.belumAdaMutasiBank')}</td></tr>}
            </tbody>
          </table>
        </div>
        {unreconciled.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700/50">
            <p className="text-[10px] text-amber-400 font-semibold mb-2">{tt('misc.transferBelumDicocokkan')} ({unreconciled.length})</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs"><tbody>
                {unreconciled.map((t) => (
                  <tr key={t.id} className="border-b border-gray-700/30"><td className="py-2 text-gray-400">{t.txCode}</td><td className="py-2 text-gray-300">{t.txDate}</td><td className="py-2 text-gray-300">{t.studentName || t.description}</td><td className="py-2 text-right text-white">{fmt(t.amount)}</td></tr>
                ))}
              </tbody></table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
