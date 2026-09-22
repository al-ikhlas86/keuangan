import { useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { TableActions } from '../components/TableActions';
import { createAccount, updateAccount, fetchAccounts, ApiError, type AccountDto, type AccountType, type NormalBalance } from '../api';

// BARU - halaman Bagan Akun (Chart of Account) tidak ada di Akuntansi lama
// (COA di sana sepertinya sudah di-seed/hardcode, tidak ada UI kelola).
// Wajib ada di Keuangan.exe karena baris jurnal SEKARANG eksplisit pilih akun
// (lihat catatan desain di TransactionsEndpoints.cs) - staf perlu tempat
// menambah akun baru kalau kebutuhan pencatatan berkembang.
function AccountForm({ editRecord, onDone }: { editRecord: AccountDto | null; onDone: () => void }) {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [code, setCode] = useState(editRecord?.code || '');
  const [name, setName] = useState(editRecord?.name || '');
  const [accountType, setAccountType] = useState<AccountType>(editRecord?.accountType || 'Asset');
  const [normalBalance, setNormalBalance] = useState<NormalBalance>(editRecord?.normalBalance || 'Debit');

  async function simpan() {
    if (!code.trim() || !name.trim()) { showToast(tt('msg.semuaFieldWajib'), 'error'); return; }
    try {
      if (editRecord) await updateAccount(editRecord.id, { name: name.trim() });
      else await createAccount({ code: code.trim(), name: name.trim(), accountType, normalBalance });
      showToast(tt('msg.berhasil'));
      onDone();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan akun.', 'error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4" onClick={onDone}>
      <div className="bg-dark-800 rounded-xl border border-gray-700 p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-white mb-4">{editRecord ? 'Edit Akun' : 'Tambah Akun'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); simpan(); }} className="space-y-3">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Kode *</label>
            <input type="text" required disabled={!!editRecord} value={code} onChange={(e) => setCode(e.target.value)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 disabled:opacity-60 focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Nama Akun *</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Tipe Akun *</label>
              <select value={accountType} disabled={!!editRecord} onChange={(e) => setAccountType(e.target.value as AccountType)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 disabled:opacity-60">
                <option value="Asset">Aset</option>
                <option value="Liability">Kewajiban</option>
                <option value="Equity">Ekuitas</option>
                <option value="Income">Pendapatan</option>
                <option value="Expense">Beban</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Saldo Normal *</label>
              <select value={normalBalance} disabled={!!editRecord} onChange={(e) => setNormalBalance(e.target.value as NormalBalance)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 disabled:opacity-60">
                <option value="Debit">Debit</option>
                <option value="Credit">Kredit</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700"><Save className="w-3.5 h-3.5 inline mr-1" />{tt('btn.simpan')}</button>
            <button type="button" onClick={onDone} className="px-4 py-2 rounded-lg bg-dark-900 border border-gray-700 text-gray-400 text-xs hover:bg-dark-850">{tt('btn.batal')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BaganAkun() {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState<false | AccountDto | 'new'>(false);

  async function load() {
    setLoading(true);
    try {
      setAccounts(await fetchAccounts());
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal memuat bagan akun.', 'error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function toggleActive(a: AccountDto) {
    try {
      await updateAccount(a.id, { isActive: !a.isActive });
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal mengubah status akun.', 'error');
    }
  }

  return (
    <>
      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h3 className="text-sm font-bold text-white">{tt('menu.bagan_akun')} ({accounts.length})</h3>
          <button onClick={() => setFormOpen('new')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 text-xs font-medium"><Plus className="w-3.5 h-3.5" />{tt('btn.tambah')}</button>
        </div>
        {loading ? <p className="text-xs text-gray-500 py-4">Memuat...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700/50 text-gray-400 text-left">
                  <th className="pb-3">Kode</th><th className="pb-3">Nama Akun</th><th className="pb-3">Tipe</th><th className="pb-3">Saldo Normal</th>
                  <th className="pb-3">{tt('col.status')}</th><th className="pb-3">{tt('col.aksi')}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-gray-700/30 hover:bg-dark-850/50">
                    <td className="py-3 text-gray-400 font-mono">{a.code}</td>
                    <td className="py-3 font-medium text-white">{a.name}</td>
                    <td className="py-3 text-gray-300">{a.accountType}</td>
                    <td className="py-3 text-gray-300">{a.normalBalance}</td>
                    <td className="py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${a.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>{a.isActive ? tt('status.aktif') : tt('status.nonaktif')}</span></td>
                    <td className="py-3"><TableActions onEdit={() => setFormOpen(a)} onDelete={() => toggleActive(a)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {formOpen && <AccountForm editRecord={formOpen === 'new' ? null : formOpen} onDone={() => { setFormOpen(false); load(); }} />}
    </>
  );
}
