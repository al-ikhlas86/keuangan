import type { AccountDto } from '../api';

// Baris jurnal (Debit/Kredit) WAJIB eksplisit dari pemanggil - backend TIDAK
// PERNAH menebak akun (lihat catatan desain di TransactionsEndpoints.cs).
// Komponen kecil dipakai berulang di form Penerimaan/Pengeluaran/Penerimaan
// Kas/Terima Pembayaran supaya tidak duplikasi markup 2 <select> akun.
export function JournalAccountPicker({
  accounts, debitId, setDebitId, creditId, setCreditId, debitLabel = 'Akun Debit', creditLabel = 'Akun Kredit',
}: {
  accounts: AccountDto[];
  debitId: number | null;
  setDebitId: (id: number | null) => void;
  creditId: number | null;
  setCreditId: (id: number | null) => void;
  debitLabel?: string;
  creditLabel?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="text-[10px] text-gray-500 block mb-1">{debitLabel}</label>
        <select value={debitId ?? ''} onChange={(e) => setDebitId(Number(e.target.value) || null)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-300">
          <option value="">Pilih</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[10px] text-gray-500 block mb-1">{creditLabel}</label>
        <select value={creditId ?? ''} onChange={(e) => setCreditId(Number(e.target.value) || null)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-300">
          <option value="">Pilih</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
        </select>
      </div>
    </div>
  );
}
