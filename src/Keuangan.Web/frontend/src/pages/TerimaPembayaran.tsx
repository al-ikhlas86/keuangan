import { useEffect, useState } from 'react';
import { Banknote, CreditCard, Zap } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import {
  receivePayment, autoAllocatePayment, fetchStudents, fetchTagihan, fetchAccounts, ApiError,
  type StudentDto, type TagihanDto, type AccountDto, type PaymentReceiveMethod, type JournalLineInput,
} from '../api';
import { fmt } from '../lib/format';
import { StudentSearchSelect } from '../components/StudentSearchSelect';

// Disederhanakan total dari Akuntansi lama Fase 1: "Bayar di Muka"
// (generate tagihan bulan depan sekaligus) dan "Transfer -> saldo tertunda
// utk divalidasi ortu via app" DITUNDA - keduanya bergantung pada fitur
// backend yang belum dibangun (recurring billing generator, konsep saldo
// tertahan). BARU dari versi lama: form ini WAJIB pilih akun Debit/Kredit
// utk metode Cash/Transfer (lihat catatan desain di TransactionsEndpoints.cs
// - backend TIDAK PERNAH menebak akun jurnal, harus eksplisit dari sini).
// Saldo/Keringanan TIDAK real uang - tanpa baris jurnal (lihat Payment.cs).
export function TerimaPembayaran() {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [mode, setMode] = useState<'manual' | 'otomatis'>('manual');
  const [method, setMethod] = useState<PaymentReceiveMethod>('Cash');
  const [studentId, setStudentId] = useState<number | null>(null);
  const [openTagihan, setOpenTagihan] = useState<TagihanDto[]>([]);
  const [paidAmounts, setPaidAmounts] = useState<Map<number, number>>(new Map());
  const [autoAmount, setAutoAmount] = useState(0);
  const [debitAccountId, setDebitAccountId] = useState<number | null>(null);
  const [creditAccountId, setCreditAccountId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([fetchStudents(), fetchAccounts()])
      .then(([s, a]) => { setStudents(s); setAccounts(a.filter((x) => x.isActive)); })
      .catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat data.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPaidAmounts(new Map());
    if (!studentId) { setOpenTagihan([]); return; }
    fetchTagihan({ studentId }).then((all) => setOpenTagihan(all.filter((t) => t.status !== 'Lunas')))
      .catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat tagihan siswa.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const needsJournal = method === 'Cash' || method === 'Transfer';

  function toggle(t: TagihanDto) {
    setPaidAmounts((prev) => {
      const next = new Map(prev);
      if (next.has(t.id)) next.delete(t.id);
      else next.set(t.id, t.amount - t.paidAmount);
      return next;
    });
  }
  function setJumlahDibayar(t: TagihanDto, raw: number) {
    const sisa = t.amount - t.paidAmount;
    setPaidAmounts((prev) => new Map(prev).set(t.id, Math.max(0, Math.min(raw, sisa))));
  }

  const selectedEntries = openTagihan.filter((t) => paidAmounts.has(t.id)).map((t) => ({ tagihan: t, amount: paidAmounts.get(t.id) || 0 }));
  const total = selectedEntries.reduce((a, e) => a + e.amount, 0);

  function buildJournalLines(amount: number): JournalLineInput[] | undefined {
    if (!needsJournal) return undefined;
    if (!debitAccountId || !creditAccountId) return undefined;
    return [
      { accountId: debitAccountId, debit: amount, credit: 0 },
      { accountId: creditAccountId, debit: 0, credit: amount },
    ];
  }

  async function simpanManual() {
    if (!studentId || selectedEntries.length === 0) { showToast(tt('msg.keranjangKosong'), 'error'); return; }
    if (needsJournal && (!debitAccountId || !creditAccountId)) { showToast('Pilih akun debit dan kredit terlebih dahulu.', 'error'); return; }
    setSubmitting(true);
    try {
      await receivePayment({
        studentId, paymentDate: new Date().toISOString().slice(0, 10), method,
        allocations: selectedEntries.map(({ tagihan, amount }) => ({ tagihanId: tagihan.id, amount })),
        journalLines: buildJournalLines(total), description: description.trim() || undefined,
      });
      setPaidAmounts(new Map());
      showToast(tt('msg.berhasil'));
      if (studentId) fetchTagihan({ studentId }).then((all) => setOpenTagihan(all.filter((t) => t.status !== 'Lunas')));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan pembayaran.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function simpanOtomatis() {
    if (!studentId || autoAmount <= 0) { showToast(tt('msg.semuaFieldWajib'), 'error'); return; }
    if (needsJournal && (!debitAccountId || !creditAccountId)) { showToast('Pilih akun debit dan kredit terlebih dahulu.', 'error'); return; }
    setSubmitting(true);
    try {
      await autoAllocatePayment({
        studentId, paymentDate: new Date().toISOString().slice(0, 10), method, amount: autoAmount,
        journalLines: buildJournalLines(autoAmount), description: description.trim() || undefined,
      });
      setAutoAmount(0);
      showToast(tt('msg.berhasil'));
      if (studentId) fetchTagihan({ studentId }).then((all) => setOpenTagihan(all.filter((t) => t.status !== 'Lunas')));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan pembayaran.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const isCash = method === 'Cash';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-sm font-bold text-white mb-4">{tt('menu.terima_pembayaran')}</h3>
        <div className="flex gap-1.5 mb-4 p-1 rounded-lg bg-dark-900/60 no-print">
          <button type="button" onClick={() => setMode('manual')} className={`flex-1 py-1.5 rounded-md text-xs font-medium ${mode === 'manual' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}>{tt('btn.modeManual')}</button>
          <button type="button" onClick={() => setMode('otomatis')} className={`flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1 ${mode === 'otomatis' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}><Zap className="w-3 h-3" />{tt('btn.modeOtomatis')}</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">{tt('misc.nisNamaSiswa')}</label>
            <StudentSearchSelect students={students} value={studentId} onChange={setStudentId} placeholder={tt('placeholder.ketikNamaAtauNis')} />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">{tt('col.metode')}</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentReceiveMethod)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500">
              <option value="Cash">{tt('misc.tunaiCash')}</option>
              <option value="Transfer">Transfer</option>
              <option value="Saldo">Saldo</option>
              <option value="Keringanan">Keringanan</option>
            </select>
          </div>
          {needsJournal && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Akun Debit ({isCash ? 'Kas' : 'Bank'})</label>
                <select value={debitAccountId ?? ''} onChange={(e) => setDebitAccountId(Number(e.target.value) || null)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-300">
                  <option value="">Pilih</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Akun Kredit (Pendapatan)</label>
                <select value={creditAccountId ?? ''} onChange={(e) => setCreditAccountId(Number(e.target.value) || null)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-300">
                  <option value="">Pilih</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                </select>
              </div>
            </div>
          )}
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">{tt('col.keterangan')}</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
          </div>
          <button type="button" onClick={mode === 'manual' ? simpanManual : simpanOtomatis} disabled={submitting} className={`w-full py-2.5 rounded-lg ${isCash ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'} text-white text-xs font-semibold disabled:opacity-50`}>
            {isCash ? <Banknote className="w-3.5 h-3.5 inline mr-1" /> : <CreditCard className="w-3.5 h-3.5 inline mr-1" />}
            {tt('btn.simpanPembayaran')}
          </button>
        </div>
      </div>

      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        {mode === 'manual' ? (
          <div>
            <label className="text-[10px] text-gray-500 block mb-1 font-semibold">{tt('heading.tagihanTerbukaSiswa')}</label>
            {!studentId ? (
              <p className="text-[10px] text-gray-400 text-center py-4">{tt('misc.pilihSiswaDulu')}</p>
            ) : openTagihan.length === 0 ? (
              <p className="text-[10px] text-gray-400 text-center py-4">{tt('misc.tidakAdaTagihanTerbuka')}</p>
            ) : (
              <>
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {openTagihan.map((t) => {
                    const sisa = t.amount - t.paidAmount;
                    const checked = paidAmounts.has(t.id);
                    const amount = paidAmounts.get(t.id) ?? sisa;
                    return (
                      <div key={t.id} className="bg-dark-900/60 rounded-lg px-3 py-2 text-xs">
                        <div className="flex items-center gap-2.5">
                          <input type="checkbox" checked={checked} onChange={() => toggle(t)} className="flex-shrink-0" />
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggle(t)}>
                            <p className="text-white font-medium truncate">
                              {t.feeTypeName}
                              {t.cicilanDari != null && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/20 text-purple-400">{tt('label.cicilanKe')} {t.cicilanKe}/{t.cicilanDari}</span>}
                              {t.status === 'SebagianLunas' && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-400">{tt('status.sebagian')}</span>}
                            </p>
                            <p className="text-[10px] text-gray-500">{t.periodLabel}{t.paidAmount > 0 && <span className="text-amber-400"> - {tt('misc.sisaDariTotal')} {fmt(sisa)} / {fmt(t.amount)}</span>}</p>
                          </div>
                          <span className="text-gray-400 flex-shrink-0 text-[10px]">{fmt(t.amount)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 pl-6">
                          <span className={`text-[10px] flex-shrink-0 ${checked ? 'text-gray-500' : 'text-gray-600'}`}>{tt('label.jumlahDibayar')}</span>
                          <input type="number" value={checked ? amount : sisa} max={sisa} min={0} step={1} disabled={!checked}
                            onChange={(e) => setJumlahDibayar(t, parseFloat(e.target.value) || 0)}
                            className="flex-1 min-w-0 bg-dark-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-emerald-400 font-semibold focus:outline-none focus:border-brand-500 disabled:opacity-40" />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-700/50 mt-3 text-xs font-bold">
                  <span className="text-white">{tt('col.total')}</span><span className="text-white">{fmt(total)}</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">{tt('label.nominalDiterima')}</label>
            <input type="number" value={autoAmount || ''} onChange={(e) => setAutoAmount(parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
            <p className="text-[10px] text-gray-400 mt-1">{tt('misc.alokasiOtomatisInfo')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
