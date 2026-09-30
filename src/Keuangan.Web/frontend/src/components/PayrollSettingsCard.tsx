import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { fetchAccounts, savePayrollSettings, ApiError, type AccountDto } from '../api';

// Pengaturan Penggajian (hanya AdminManager): akun jurnal pembayaran gaji (D Beban Gaji / K Kas-Bank)
// dan nama penanda tangan slip. Bayar Gaji memakai ini sbg pilihan bawaan; server tidak pernah
// menebak akun sendiri.
export function PayrollSettingsCard() {
  const { showToast } = useToast();
  const { data, refetch } = useBootstrap();
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [expenseId, setExpenseId] = useState('');
  const [cashId, setCashId] = useState('');
  const [signSpv, setSignSpv] = useState('');
  const [signAdm, setSignAdm] = useState('');
  const [taxGuide, setTaxGuide] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAccounts().then((a) => setAccounts(a.filter((x) => x.isActive))).catch(() => setAccounts([])); }, []);
  useEffect(() => {
    const s = data?.settings;
    if (!s) return;
    setExpenseId(s.expenseAccountId ? String(s.expenseAccountId) : '');
    setCashId(s.cashAccountId ? String(s.cashAccountId) : '');
    setSignSpv(s.signSpv || '');
    setSignAdm(s.signAdm || '');
    setTaxGuide(s.taxGuideUrl || '');
  }, [data?.settings]);

  async function simpan() {
    setSaving(true);
    try {
      await savePayrollSettings({
        expenseAccountId: expenseId ? Number(expenseId) : null, cashAccountId: cashId ? Number(cashId) : null,
        signSpv: signSpv.trim(), signAdm: signAdm.trim(), taxGuideUrl: taxGuide.trim(),
      });
      await refetch();
      showToast('Pengaturan penggajian disimpan.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan pengaturan penggajian.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const sel = 'w-full bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300';
  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <h3 className="text-sm font-bold text-white mb-1">Penggajian</h3>
      <p className="text-[10px] text-gray-500 mb-3">Akun untuk jurnal pembayaran gaji dan nama penanda tangan slip gaji.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <label className="text-[10px] text-gray-500">Akun Beban Gaji (Debit)
          <select value={expenseId} onChange={(e) => setExpenseId(e.target.value)} className={sel}>
            <option value="">- belum diatur -</option>
            {accounts.filter((a) => a.accountType === 'Expense').map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
          </select>
        </label>
        <label className="text-[10px] text-gray-500">Akun Kas / Bank (Kredit)
          <select value={cashId} onChange={(e) => setCashId(e.target.value)} className={sel}>
            <option value="">- belum diatur -</option>
            {accounts.filter((a) => a.accountType === 'Asset').map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
          </select>
        </label>
        <label className="text-[10px] text-gray-500">Penanda tangan slip - Spv. Keuangan (Admin)
          <input value={signSpv} onChange={(e) => setSignSpv(e.target.value)} placeholder="Nama lengkap" className={sel} />
        </label>
        <label className="text-[10px] text-gray-500">Penanda tangan slip - Adm. Keuangan
          <input value={signAdm} onChange={(e) => setSignAdm(e.target.value)} placeholder="Nama lengkap" className={sel} />
        </label>
        <label className="text-[10px] text-gray-500 sm:col-span-2">Tautan Panduan Pajak (opsional - tombol di menu Pajak)
          <input value={taxGuide} onChange={(e) => setTaxGuide(e.target.value)} placeholder="https://..." className={sel} />
        </label>
      </div>
      <button onClick={simpan} disabled={saving} className="mt-3 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold disabled:opacity-50">
        <Save className="w-3.5 h-3.5 inline mr-1" />{saving ? 'Menyimpan...' : 'Simpan'}
      </button>
    </div>
  );
}
