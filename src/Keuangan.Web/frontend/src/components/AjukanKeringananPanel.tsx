import { useEffect, useState } from 'react';
import { HeartHandshake, Plus, X } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useToast } from '../contexts/ToastContext';
import { fetchFeeTypes, createKeringananProposal, ApiError, type FeeTypeDto } from '../api';
import { monthNamesFullId } from '../lib/format';

// Ajukan pembebasan (keringanan) 1/beberapa bulan SPP - mis. "bonus 1 bulan gratis karena lunas 1
// tahun di muka". Tagihan periode yang diusulkan dibuat SEKARANG (terlihat normal di menu Tagihan) -
// baru jadi Lunas setelah disetujui Admin/Supervisor di menu Validasi Pembayaran. Port dari
// AjukanKeringananPanel (SiswaDetail.tsx Akuntansi).
function consecutivePeriods(startYear: number, startMonth: number, count: number): string[] {
  const out: string[] = [];
  let y = startYear, m = startMonth;
  for (let i = 0; i < count; i++) {
    out.push(`${monthNamesFullId[m - 1]} ${y}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function AjukanKeringananPanel({ studentId }: { studentId: number }) {
  const { tt } = useI18n();
  const { role } = useRole();
  const { showToast } = useToast();
  const [feeTypes, setFeeTypes] = useState<FeeTypeDto[]>([]);
  const [open, setOpen] = useState(false);
  const [feeTypeId, setFeeTypeId] = useState('');
  const now = new Date();
  const [startMonth, setStartMonth] = useState(now.getMonth() + 1);
  const [startYear, setStartYear] = useState(now.getFullYear());
  const [jumlahBulan, setJumlahBulan] = useState(1);
  const [periods, setPeriods] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const boleh = role === 'AdminManager' || role === 'Kasir' || role === 'Akuntansi';
  useEffect(() => {
    if (!boleh) return;
    fetchFeeTypes().then((f) => setFeeTypes(f.filter((x) => x.frekuensi === 'Bulanan' && x.isActive))).catch(() => setFeeTypes([]));
  }, [boleh]);

  if (!boleh || feeTypes.length === 0) return null;

  function tambahPeriode() {
    const next = consecutivePeriods(startYear, startMonth, jumlahBulan).filter((p) => !periods.includes(p));
    setPeriods((c) => [...c, ...next]);
  }

  async function submit() {
    if (!feeTypeId || periods.length === 0 || !reason.trim()) { showToast(tt('msg.semuaFieldWajib'), 'error'); return; }
    setSubmitting(true);
    try {
      await createKeringananProposal(studentId, Number(feeTypeId), periods, reason.trim());
      setPeriods([]); setReason(''); setOpen(false);
      showToast(tt('msg.usulanKeringananTerkirim'));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : tt('msg.gagalSimpanPembayaran'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-white">{tt('heading.ajukanKeringanan')}</h4>
          <p className="text-[10px] text-gray-500 mt-0.5">{tt('misc.ajukanKeringananInfo')}</p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="no-print flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-gray-300 hover:bg-dark-850 text-xs font-medium flex-shrink-0">
          <HeartHandshake className="w-3.5 h-3.5" />{open ? tt('btn.batal') : tt('btn.ajukanKeringanan')}
        </button>
      </div>
      {open && (
        <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-3">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">{tt('col.jenisPembayaran')}</label>
            <select value={feeTypeId} onChange={(e) => setFeeTypeId(e.target.value)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500">
              <option value="">{tt('misc.pilihJenis')}</option>
              {feeTypes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">{tt('misc.bulanMulai')}</label>
              <select value={startMonth} onChange={(e) => setStartMonth(parseInt(e.target.value))} className="bg-dark-900 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-300">
                {monthNamesFullId.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <input type="number" value={startYear} onChange={(e) => setStartYear(parseInt(e.target.value) || now.getFullYear())} className="w-20 bg-dark-900 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-300" />
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">{tt('misc.jumlahBulan')}</label>
              <input type="number" min={1} max={24} value={jumlahBulan} onChange={(e) => setJumlahBulan(Math.max(1, parseInt(e.target.value) || 1))} className="w-16 bg-dark-900 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-300" />
            </div>
            <button onClick={tambahPeriode} disabled={!feeTypeId} className="px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-gray-300 hover:bg-dark-850 text-[10px] font-medium disabled:opacity-40"><Plus className="w-3 h-3 inline mr-1" />{tt('btn.tambahKeKeranjang')}</button>
          </div>
          {periods.length > 0 && (
            <div className="space-y-1">
              {periods.map((p) => (
                <div key={p} className="flex items-center justify-between bg-dark-900/60 rounded-lg px-3 py-1.5 text-xs text-white">
                  {p}
                  <button onClick={() => setPeriods((c) => c.filter((x) => x !== p))} className="text-red-400 hover:text-red-300"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">{tt('misc.alasanKeringanan')} *</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={tt('placeholder.alasanKeringananContoh')} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
          </div>
          <button onClick={submit} disabled={submitting} className="w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold disabled:opacity-50">{tt('btn.ajukanUsulan')}</button>
        </div>
      )}
    </div>
  );
}
