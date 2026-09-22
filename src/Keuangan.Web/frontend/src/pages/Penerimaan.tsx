import { useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { usePeriodFilter } from '../contexts/PeriodFilterContext';
import { PeriodFilterBar } from '../components/PeriodFilterBar';
import { PrintBtn, ExportBtn, KwitansiBtn } from '../components/Buttons';
import { JournalAccountPicker } from '../components/JournalAccountPicker';
import { useRole } from '../contexts/RoleContext';
import { createTransaction, fetchTransactions, fetchAccounts, ApiError, type TransactionDto, type AccountDto, type PaymentMethod } from '../api';
import { fmt, filterTransactionsByPeriod, downloadCsv } from '../lib/format';

function PenerimaanForm({ accounts, onDone }: { accounts: AccountDto[]; onDone: () => void }) {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [ket, setKet] = useState('');
  const [jumlah, setJumlah] = useState(100000);
  const [metode, setMetode] = useState<PaymentMethod>('Cash');
  const [tgl, setTgl] = useState('');
  const [debitId, setDebitId] = useState<number | null>(null);
  const [creditId, setCreditId] = useState<number | null>(null);

  async function simpan() {
    if (!ket.trim()) { showToast(tt('msg.keteranganHarusDiisi'), 'error'); return; }
    if (!debitId || !creditId) { showToast('Pilih akun debit dan kredit.', 'error'); return; }
    const amount = jumlah || 100000;
    try {
      await createTransaction({
        txDate: tgl || new Date().toISOString().split('T')[0], description: ket.trim(), txType: 'Masuk', paymentMethod: metode, amount,
        journalLines: [{ accountId: debitId, debit: amount, credit: 0 }, { accountId: creditId, debit: 0, credit: amount }],
      });
      showToast(`${tt('msg.penerimaanSebesar')} ${fmt(amount)} ${tt('msg.berhasilDicatat')}`);
      onDone();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan penerimaan.', 'error');
    }
  }

  return (
    <div className="mt-4 bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <h3 className="text-sm font-bold text-white mb-4">{tt('btn.tambah')} {tt('heading.dataPenerimaan')}</h3>
      <form onSubmit={(e) => { e.preventDefault(); simpan(); }} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className="text-[10px] text-gray-500 block mb-1">{tt('label.keteranganPenerimaan')} *</label><input type="text" required value={ket} onChange={(e) => setKet(e.target.value)} placeholder={tt('placeholder.contohSumbangan')} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" /></div>
        <div><label className="text-[10px] text-gray-500 block mb-1">{tt('col.jumlah')} (Rp) *</label><input type="number" required value={jumlah} onChange={(e) => setJumlah(parseInt(e.target.value) || 0)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" /></div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">{tt('label.metodePembayaran')}</label>
          <select value={metode} onChange={(e) => setMetode(e.target.value as PaymentMethod)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300">
            <option value="Cash">{tt('misc.tunaiCash')}</option><option value="Transfer">Transfer</option>
          </select>
        </div>
        <div><label className="text-[10px] text-gray-500 block mb-1">{tt('label.tanggalPenerimaan')}</label><input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" /></div>
        <div className="md:col-span-2"><JournalAccountPicker accounts={accounts} debitId={debitId} setDebitId={setDebitId} creditId={creditId} setCreditId={setCreditId} /></div>
        <div className="md:col-span-2 flex gap-2">
          <button type="submit" className="px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700"><Save className="w-3.5 h-3.5 inline mr-1" />{tt('btn.simpan')}</button>
          <button type="button" onClick={onDone} className="px-4 py-2 rounded-lg bg-dark-900 border border-gray-700 text-gray-400 text-xs hover:bg-dark-850">{tt('btn.batal')}</button>
        </div>
      </form>
    </div>
  );
}

export function Penerimaan() {
  const { tt } = useI18n();
  const { openKwitansi } = useRole();
  const { showToast } = useToast();
  const { get } = usePeriodFilter();
  const [transactions, setTransactions] = useState<TransactionDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const st = get('penerimaan');

  async function load() {
    setLoading(true);
    try {
      const [t, a] = await Promise.all([fetchTransactions({ txType: 'Masuk' }), fetchAccounts()]);
      setTransactions(t); setAccounts(a.filter((x) => x.isActive));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal memuat data penerimaan.', 'error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const masuk = filterTransactionsByPeriod(transactions, st);
  const exportCsv = () => downloadCsv('penerimaan', ['No Transaksi', 'Tanggal', 'Keterangan', 'Metode', 'Jumlah'], masuk.map((t) => [t.txCode, t.txDate, t.description, t.paymentMethod, t.amount]));

  return (
    <>
      <div className="print-sheet bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-bold text-white">{tt('heading.dataPenerimaan')} ({masuk.length})</h3>
          <div className="flex gap-2">
            <PrintBtn label="Penerimaan" /><ExportBtn onClick={exportCsv} />
            <button onClick={() => setFormOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 text-xs font-medium"><Plus className="w-3.5 h-3.5" />{tt('btn.tambah')}</button>
          </div>
        </div>
        <PeriodFilterBar ns="penerimaan" />
        {loading ? <p className="text-xs text-gray-500 py-4">Memuat...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-gray-700/50 text-gray-400 text-left"><th className="pb-3">{tt('col.id')}</th><th className="pb-3">{tt('col.tanggal')}</th><th className="pb-3">{tt('col.keterangan')}</th><th className="pb-3">{tt('col.metode')}</th><th className="pb-3 text-right">{tt('col.jumlah')}</th><th className="pb-3">{tt('col.aksi')}</th></tr></thead>
              <tbody>
                {masuk.length ? masuk.map((t) => (
                  <tr key={t.id} className="border-b border-gray-700/30 hover:bg-dark-850/50">
                    <td className="py-3 text-gray-400">{t.txCode}</td><td className="py-3 text-gray-300">{t.txDate}</td><td className="py-3 text-gray-300">{t.description}</td>
                    <td className="py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${t.paymentMethod === 'Cash' ? 'badge-cash' : 'badge-transfer'}`}>{t.paymentMethod}</span></td>
                    <td className="py-3 text-right font-semibold text-emerald-400">{fmt(t.amount)}</td>
                    <td className="py-3"><KwitansiBtn onClick={() => openKwitansi(String(t.id))} /></td>
                  </tr>
                )) : <tr><td colSpan={6} className="py-8 text-center text-gray-400">{tt('misc.tidakAdaPembayaranPeriodeIni')}</td></tr>}
              </tbody>
              <tfoot><tr className="border-t border-gray-600 font-bold"><td colSpan={4} className="py-3 text-white">{tt('col.total').toUpperCase()}</td><td className="py-3 text-right text-emerald-400">{fmt(masuk.reduce((a, t) => a + t.amount, 0))}</td><td></td></tr></tfoot>
            </table>
          </div>
        )}
      </div>
      {formOpen && <PenerimaanForm accounts={accounts} onDone={() => { setFormOpen(false); load(); }} />}
    </>
  );
}
