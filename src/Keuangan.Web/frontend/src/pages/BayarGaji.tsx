import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Wallet, Printer, CheckSquare } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { useToast } from '../contexts/ToastContext';
import { SlipGajiCell } from '../components/SlipGajiCell';
import { penggajianPeriodLabel, penggajianYearOptions } from '../lib/payroll';
import { fmt, monthNamesFullId } from '../lib/format';
import { fetchPayrollItemsList, finalizePayrollPeriod, fetchSalarySlipNo, fetchAccounts, type PayrollItemDto, type EmployeeDto, type AccountDto } from '../api';

// Halaman baru - gabungan bekas "Cetak Slip Gaji" (yang tadinya CUMA reprint
// pegawai yang sudah dibayar) dengan aksi bayar yang dicabut dari Penggajian.tsx.
// Di sinilah rincian LENGKAP (termasuk pajak/BPJS dari PajakBpjsPegawai.tsx)
// ditampilkan dan pembayaran sungguhan dieksekusi - Penggajian.tsx sendiri
// sekarang murni tempat Admin Keuangan menyusun data, tidak bisa bayar/cetak lagi.
// Tampilan sengaja akordeon vertikal (bukan tabel lebar ke samping) - pakai
// ulang SlipGajiCell yang sudah berbentuk slip vertikal, supaya konsisten
// dengan yang sudah pernah ada, bukan bikin komponen tampilan baru.
export function BayarGaji() {
  const { tt } = useI18n();
  const { role } = useRole();
  const { data, refetch } = useBootstrap();
  const { showToast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [itemsByEmployee, setItemsByEmployee] = useState<Record<string, PayrollItemDto>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPrint, setShowPrint] = useState(false);
  const [slipNos, setSlipNos] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Akun jurnal pembayaran gaji: D Beban Gaji / K Kas-Bank. Default dari Pengaturan > Penggajian; kalau
  // belum diatur, dipilih di sini (server tidak pernah menebak akun).
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [expenseId, setExpenseId] = useState<string>('');
  const [cashId, setCashId] = useState<string>('');
  const [method, setMethod] = useState<'Transfer' | 'Cash'>('Transfer');

  const period = penggajianPeriodLabel(year, month);
  // Hanya pegawai AKTIF - begitu diarsipkan, tidak boleh muncul lagi di sini
  // sama sekali supaya tidak ikut kesapu "Pilih Semua -> Cetak Semua" secara
  // tidak sengaja. Cetak ulang slip utk pegawai yang sudah diarsipkan
  // dilakukan satu-satu dari Profil Pegawai (lihat PegawaiDetail.tsx), bukan
  // dari daftar borongan ini.
  const employees = (data?.employees || []).filter((e) => e.is_active);

  useEffect(() => {
    let cancelled = false;
    fetchPayrollItemsList(role, period).then((res) => {
      if (cancelled) return;
      const map: Record<string, PayrollItemDto> = {};
      (res.items || []).forEach((i) => { map[i.employee_id] = i; });
      setItemsByEmployee(map);
      setSelected(new Set());
      setExpandedId(null);
      setShowPrint(false);
      setSlipNos({});
    }).catch(() => { if (!cancelled) setItemsByEmployee({}); });
    return () => { cancelled = true; };
  }, [role, period]);

  useEffect(() => {
    fetchAccounts().then((a) => setAccounts(a.filter((x) => x.isActive))).catch(() => setAccounts([]));
  }, []);
  useEffect(() => {
    const st = data?.settings;
    if (st?.expenseAccountId && !expenseId) setExpenseId(String(st.expenseAccountId));
    if (st?.cashAccountId && !cashId) setCashId(String(st.cashAccountId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.settings]);

  useEffect(() => {
    const el = document.getElementById('dynamicPageStyle');
    if (!showPrint) { if (el) el.textContent = ''; return; }
    if (el) el.textContent = `@page{size:A4 portrait;margin:0.4in;}
      @media print{
        .slip-gaji-page{display:grid;grid-template-columns:1fr 1fr;gap:0.3in;break-after:page;page-break-after:always;}
        .slip-gaji-page:last-child{break-after:auto;page-break-after:auto;}
        .slip-gaji-half{padding-right:0.15in;}
        .slip-gaji-half:first-child{border-right:1px solid #ccc;}
      }`;
  }, [showPrint]);

  // Klik "Cetak Slip Terpilih" langsung ke dialog cetak browser, tidak lagi
  // singgah di halaman preview dengan tombol Cetak/Kembali terpisah - begitu
  // dialog print ditutup (baik dicetak maupun dibatalkan), otomatis kembali
  // ke daftar (event 'afterprint').
  useEffect(() => {
    if (!showPrint) return;
    window.print();
    const backToList = () => setShowPrint(false);
    window.addEventListener('afterprint', backToList);
    return () => window.removeEventListener('afterprint', backToList);
  }, [showPrint]);

  async function reload() {
    const res = await fetchPayrollItemsList(role, period);
    const map: Record<string, PayrollItemDto> = {};
    (res.items || []).forEach((i) => { map[i.employee_id] = i; });
    setItemsByEmployee(map);
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(employees.map((e) => e.db_id)) : new Set());
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  const payableSelected = [...selected].filter((id) => itemsByEmployee[id] && !itemsByEmployee[id].is_paid);
  const printableSelected = [...selected].filter((id) => itemsByEmployee[id]?.is_paid);

  async function bayarSatu(e: EmployeeDto) {
    if (!window.confirm(`${tt('msg.konfirmasiBayarSatuPegawai')} (${e.nama})`)) return;
    setBusy(true);
    try {
      const res = await finalizePayrollPeriod(role, period, [e.db_id], { expenseAccountId: expenseId ? Number(expenseId) : null, cashAccountId: cashId ? Number(cashId) : null, method });
      await refetch();
      await reload();
      showToast(`${tt('msg.berhasil')}: ${fmt(res.total_paid)}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tt('msg.gagalProsesPembayaranGaji'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function bayarTerpilih() {
    if (!payableSelected.length) { showToast(tt('msg.belumAdaData'), 'error'); return; }
    if (!window.confirm(`${tt('msg.konfirmasiBayarTerpilih')} (${payableSelected.length})`)) return;
    setBusy(true);
    try {
      const res = await finalizePayrollPeriod(role, period, payableSelected, { expenseAccountId: expenseId ? Number(expenseId) : null, cashAccountId: cashId ? Number(cashId) : null, method });
      await refetch();
      await reload();
      showToast(`${tt('msg.berhasil')}: ${res.employees_paid} - ${fmt(res.total_paid)}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tt('msg.gagalProsesPembayaranGaji'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function tampilkanPrint() {
    if (!printableSelected.length) { showToast(tt('msg.belumAdaData'), 'error'); return; }
    const nos = { ...slipNos };
    for (const id of printableSelected) {
      if (nos[id]) continue;
      const item = itemsByEmployee[id];
      if (!item?.payroll_item_id) continue;
      try { nos[id] = (await fetchSalarySlipNo(role, item.payroll_item_id)).slip_no; } catch { /* nomor slip opsional, jangan blokir cetak */ }
    }
    setSlipNos(nos);
    setShowPrint(true);
  }

  const pairs: string[][] = [];
  for (let i = 0; i < printableSelected.length; i += 2) pairs.push(printableSelected.slice(i, i + 2));

  if (showPrint) {
    return (
      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5 print-sheet">
        {pairs.map((pair, i) => (
          <div key={i} className="slip-gaji-page">
            {pair.map((id) => {
              const e = employees.find((x) => x.db_id === id);
              const item = itemsByEmployee[id];
              if (!e || !item) return null;
              return <div key={id} className="slip-gaji-half bg-white"><SlipGajiCell item={item} employee={e} periodLabel={period} slipNo={slipNos[id] || ''} isAdmin={role === 'AdminManager'} /></div>;
            })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-bold text-white">{tt('heading.bayarGaji')}</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={bayarTerpilih} disabled={busy || !payableSelected.length} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 text-xs font-medium disabled:opacity-40"><Wallet className="w-3.5 h-3.5" />{tt('btn.bayarTerpilih')} ({payableSelected.length})</button>
          <button onClick={tampilkanPrint} disabled={!printableSelected.length} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 text-xs font-medium disabled:opacity-40"><Printer className="w-3.5 h-3.5" />{tt('btn.cetakTerpilih')} ({printableSelected.length})</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300">
          {monthNamesFullId.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300">
          {penggajianYearOptions(year).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-end gap-3 mb-4 p-3 rounded-lg border border-gray-700/50 bg-dark-900/40">
        <label className="flex flex-col gap-1 text-[10px] text-gray-500">Akun Beban Gaji (Debit)
          <select value={expenseId} onChange={(e) => setExpenseId(e.target.value)} className="bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 min-w-[200px]">
            <option value="">- pilih akun -</option>
            {accounts.filter((a) => a.accountType === 'Expense').map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-gray-500">Akun Kas / Bank (Kredit)
          <select value={cashId} onChange={(e) => setCashId(e.target.value)} className="bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 min-w-[200px]">
            <option value="">- pilih akun -</option>
            {accounts.filter((a) => a.accountType === 'Asset').map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-gray-500">Metode
          <select value={method} onChange={(e) => setMethod(e.target.value as 'Transfer' | 'Cash')} className="bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300">
            <option value="Transfer">Transfer</option><option value="Cash">Cash</option>
          </select>
        </label>
        {(!expenseId || !cashId) && <p className="text-[10px] text-amber-400 basis-full">Pilih akun dulu sebelum membayar - pembayaran gaji tercatat sebagai transaksi kas keluar + jurnal. Admin bisa menyimpan pilihan bawaan di Pengaturan &gt; Penggajian.</p>}
      </div>
      {employees.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">{tt('msg.belumAdaData')}</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs text-gray-300 mb-2 pb-2 border-b border-gray-700/50">
            <input type="checkbox" checked={employees.every((e) => selected.has(e.db_id))} onChange={(ev) => toggleAll(ev.target.checked)} />
            <CheckSquare className="w-3.5 h-3.5 text-gray-500" />{tt('misc.pilihSemua')} ({selected.size}/{employees.length})
          </label>
          <div className="space-y-1.5">
            {employees.map((e) => {
              const item = itemsByEmployee[e.db_id];
              const isPaid = !!item?.is_paid;
              const isExpanded = expandedId === e.db_id;
              return (
                <div key={e.db_id} className="bg-dark-900/60 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <input type="checkbox" checked={selected.has(e.db_id)} onChange={(ev) => toggleOne(e.db_id, ev.target.checked)} className="flex-shrink-0" />
                    <button onClick={() => setExpandedId(isExpanded ? null : e.db_id)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{e.nama}</p>
                        <p className="text-[10px] text-gray-500 truncate">{e.jabatan}</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isPaid ? <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">{tt('status.sudahDibayar')}</span>
                        : item ? <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400">{tt('status.belumDibayar')}</span>
                        : <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-500/20 text-gray-400">{tt('status.belumDiisi')}</span>}
                      {!isPaid && item && (
                        <button onClick={() => bayarSatu(e)} disabled={busy} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-600 text-white hover:bg-brand-700 text-[10px] font-medium disabled:opacity-40">
                          <Wallet className="w-3 h-3" />{tt('btn.bayarGaji')}
                        </button>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      {item ? (
                        <div className="bg-white rounded-lg p-4"><SlipGajiCell item={item} employee={e} periodLabel={period} slipNo={isPaid ? (slipNos[e.db_id] || '') : ''} isAdmin={role === 'AdminManager'} /></div>
                      ) : (
                        <p className="text-[10px] text-gray-400 text-center py-4">{tt('misc.belumAdaDataGajiIsiDuluDiPenggajian')}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
