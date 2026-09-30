import { useEffect, useMemo, useState } from 'react';
import { Check, X, ChevronDown, ChevronUp, Wallet, HeartHandshake } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useToast } from '../contexts/ToastContext';
import { StudentSearchSelect } from '../components/StudentSearchSelect';
import {
  fetchStudents, fetchTagihan, fetchSaldo, fetchAllocationProposals, createAllocationProposal, decideAllocationProposal,
  fetchKeringananProposals, decideKeringananProposal, ApiError,
  type AllocationProposalDto, type KeringananProposalDto, type StudentDto, type TagihanDto,
} from '../api';
import { fmt } from '../lib/format';

// Port ValidasiPembayaran.tsx Akuntansi - alur "usul -> validasi" (maker-checker):
//  - Kiri : ajukan alokasi saldo siswa ke tagihan (belum ada uang berpindah)
//  - Kanan: daftar usulan menunggu validasi (Kasir/Akuntansi/Admin boleh memvalidasi)
//  - Bawah: persetujuan keringanan (pembebasan tagihan bulanan) - HANYA Admin/Supervisor.
// Saldo siswa = uang masuk atas nama siswa yang belum dialokasikan ke tagihan (lihat menu Terima
// Pembayaran > "Titip ke Saldo").
function AjukanAlokasiForm({ students, onDone }: { students: StudentDto[]; onDone: () => void }) {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [studentId, setStudentId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [saldo, setSaldo] = useState(0);
  const [openTagihan, setOpenTagihan] = useState<TagihanDto[]>([]);
  const [paidAmounts, setPaidAmounts] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    setPaidAmounts(new Map()); setNote(''); setSaldo(0); setOpenTagihan([]);
    if (!studentId) return;
    Promise.all([fetchSaldo(studentId), fetchTagihan({ studentId })])
      .then(([s, all]) => {
        setSaldo(s.saldo);
        setOpenTagihan(all.filter((t) => t.status !== 'Lunas').sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || (a.cicilanKe || 0) - (b.cicilanKe || 0)));
      })
      .catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat data siswa.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  function toggle(id: number, sisa: number) {
    setPaidAmounts((prev) => { const n = new Map(prev); if (n.has(id)) n.delete(id); else n.set(id, sisa); return n; });
  }
  function setAmount(id: number, sisa: number, raw: number) {
    setPaidAmounts((prev) => new Map(prev).set(id, Math.max(0, Math.min(raw, sisa))));
  }

  const selected = openTagihan.filter((t) => paidAmounts.has(t.id)).map((t) => ({ t, amount: paidAmounts.get(t.id) || 0 }));
  const total = selected.reduce((a, e) => a + e.amount, 0);
  const overSaldo = total > saldo;

  async function submit() {
    if (!studentId || selected.length === 0) { showToast(tt('msg.semuaFieldWajib'), 'error'); return; }
    if (overSaldo) { showToast(tt('msg.usulanMelebihiSaldo'), 'error'); return; }
    try {
      await createAllocationProposal(studentId, selected.map((e) => ({ tagihanId: e.t.id, amount: e.amount })), note.trim());
      setStudentId(null);
      showToast(tt('msg.usulanAlokasiTerkirim'));
      onDone();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : tt('msg.gagalSimpanPembayaran'), 'error');
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] text-gray-500 block mb-1">{tt('misc.nisNamaSiswa')}</label>
        <StudentSearchSelect students={students} value={studentId} onChange={setStudentId} placeholder={tt('placeholder.ketikNamaAtauNis')} />
      </div>
      {!studentId ? (
        <p className="text-[10px] text-gray-400 text-center py-4">{tt('misc.pilihSiswaDulu')}</p>
      ) : (
        <>
          <div className="flex items-center justify-between bg-dark-900/60 rounded-lg px-3 py-2">
            <span className="text-[10px] text-gray-500">{tt('misc.saldoBelumDialokasikan')}</span>
            <span className={`text-sm font-bold ${saldo > 0 ? 'text-amber-400' : 'text-gray-500'}`}>{fmt(saldo)}</span>
          </div>
          {openTagihan.length === 0 ? (
            <p className="text-[10px] text-gray-400 text-center py-3">{tt('misc.tidakAdaTagihanTerbuka')}</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {openTagihan.map((t) => {
                const sisa = t.amount - t.paidAmount;
                const checked = paidAmounts.has(t.id);
                const amount = paidAmounts.get(t.id) ?? sisa;
                return (
                  <div key={t.id} className="bg-dark-900/60 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center gap-2.5">
                      <input type="checkbox" checked={checked} onChange={() => toggle(t.id, sisa)} className="flex-shrink-0" />
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggle(t.id, sisa)}>
                        <p className="text-white font-medium truncate">
                          {t.feeTypeName}
                          {t.cicilanDari != null && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/20 text-purple-400">{tt('label.cicilanKe')} {t.cicilanKe}/{t.cicilanDari}</span>}
                        </p>
                        <p className="text-[10px] text-gray-500">{t.periodLabel}</p>
                      </div>
                      <span className="text-gray-400 flex-shrink-0 text-[10px]">{fmt(sisa)}</span>
                    </div>
                    {checked && (
                      <div className="flex items-center gap-2 mt-2 pl-6">
                        <span className="text-[10px] text-gray-500 flex-shrink-0">{tt('label.jumlahDibayar')}</span>
                        <input type="number" value={amount} max={sisa} min={0} step={1} onChange={(e) => setAmount(t.id, sisa, parseFloat(e.target.value) || 0)}
                          className="flex-1 min-w-0 bg-dark-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-emerald-400 font-semibold focus:outline-none focus:border-brand-500" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className={`flex items-center justify-between pt-2 border-t border-gray-700/50 text-xs font-bold ${overSaldo ? 'text-red-400' : 'text-white'}`}>
            <span>{tt('col.total')}</span><span>{fmt(total)}</span>
          </div>
          {overSaldo && <p className="text-[10px] text-red-400">{tt('msg.usulanMelebihiSaldo')}</p>}
        </>
      )}
      <div>
        <label className="text-[10px] text-gray-500 block mb-1">{tt('misc.catatanUsulan')}</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={tt('placeholder.catatanUsulanContoh')} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
      </div>
      <button onClick={submit} className="w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold">{tt('btn.ajukanUsulan')}</button>
    </div>
  );
}

function ProposalCard({ p, canDecide, onDecide }: { p: AllocationProposalDto; canDecide: boolean; onDecide: (id: number, d: 'validate' | 'reject') => void }) {
  const { tt } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const badge = p.status === 'VALIDATED' ? 'bg-emerald-500/20 text-emerald-400' : p.status === 'REJECTED' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400';
  const badgeLabel = p.status === 'VALIDATED' ? tt('status.divalidasi') : p.status === 'REJECTED' ? tt('status.ditolak') : tt('status.menungguValidasi');
  const saldoKurang = p.status === 'PENDING' && p.saldo < p.totalAmount;
  return (
    <div className="bg-dark-900/60 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white truncate">{p.studentName} <span className="text-gray-500 font-normal">({p.nis})</span></p>
          {p.note && <p className="text-[10px] text-gray-500 mt-0.5">"{p.note}"</p>}
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${badge}`}>{badgeLabel}</span>
      </div>
      <div className="flex items-center justify-between mt-2">
        <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}{p.items.length} {tt('misc.jenisTagihan')}
        </button>
        <span className="text-sm font-bold text-white">{fmt(p.totalAmount)}</span>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1 pl-1">
          {p.items.map((i) => (
            <div key={i.tagihanId} className="flex items-center justify-between text-[10px] text-gray-400 py-1 border-t border-gray-700/30">
              <span>{i.feeName} - {i.periodLabel}</span><span className="text-gray-300">{fmt(i.amount)}</span>
            </div>
          ))}
        </div>
      )}
      <div className={`flex items-center justify-between mt-2 pt-2 border-t border-gray-700/30 text-[10px] ${saldoKurang ? 'text-red-400' : 'text-gray-500'}`}>
        <span className="flex items-center gap-1"><Wallet className="w-3 h-3" />{tt('misc.saldoSaatIni')}</span><span className="font-semibold">{fmt(p.saldo)}</span>
      </div>
      {canDecide && p.status === 'PENDING' && (
        <div className="flex gap-2 mt-3">
          <button onClick={() => onDecide(p.id, 'validate')} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] font-medium"><Check className="w-3 h-3" />{tt('btn.validasi')}</button>
          <button onClick={() => onDecide(p.id, 'reject')} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 text-[10px] font-medium"><X className="w-3 h-3" />{tt('btn.tolak')}</button>
        </div>
      )}
    </div>
  );
}

function KeringananCard({ p, canDecide, onDecide }: { p: KeringananProposalDto; canDecide: boolean; onDecide: (id: number, d: 'validate' | 'reject') => void }) {
  const { tt } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const badge = p.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400' : p.status === 'REJECTED' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400';
  const badgeLabel = p.status === 'APPROVED' ? tt('status.disetujui') : p.status === 'REJECTED' ? tt('status.ditolak') : tt('status.menungguPersetujuan');
  return (
    <div className="bg-dark-900/60 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white truncate">{p.studentName} <span className="text-gray-500 font-normal">({p.nis})</span></p>
          <p className="text-[10px] text-gray-500 mt-0.5">{p.feeTypeName} - "{p.reason}"</p>
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${badge}`}>{badgeLabel}</span>
      </div>
      <div className="flex items-center justify-between mt-2">
        <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}{p.items.length} {tt('misc.bulanSingkat')}
        </button>
        <span className="text-sm font-bold text-white">{fmt(p.totalAmount)}</span>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1 pl-1">
          {p.items.map((i) => (
            <div key={i.tagihanId} className="flex items-center justify-between text-[10px] text-gray-400 py-1 border-t border-gray-700/30">
              <span>{i.periodLabel}</span><span className="text-gray-300">{fmt(i.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {canDecide && p.status === 'PENDING' && (
        <div className="flex gap-2 mt-3">
          <button onClick={() => onDecide(p.id, 'validate')} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] font-medium"><Check className="w-3 h-3" />{tt('btn.setujui')}</button>
          <button onClick={() => onDecide(p.id, 'reject')} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 text-[10px] font-medium"><X className="w-3 h-3" />{tt('btn.tolak')}</button>
        </div>
      )}
    </div>
  );
}

function KeringananSection() {
  const { tt } = useI18n();
  const { role } = useRole();
  const { showToast } = useToast();
  const [proposals, setProposals] = useState<KeringananProposalDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'PENDING' | 'ALL'>('PENDING');

  async function load() {
    setLoading(true);
    try { setProposals(await fetchKeringananProposals(tab === 'PENDING' ? 'PENDING' : undefined)); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  async function decide(id: number, decision: 'validate' | 'reject') {
    try {
      await decideKeringananProposal(id, decision);
      await load();
      showToast(decision === 'validate' ? tt('msg.keringananDisetujui') : tt('msg.usulanDitolakToast'));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : tt('msg.gagalSimpanPembayaran'), 'error');
    }
  }

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5 mt-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="text-sm font-bold text-white flex items-center gap-1.5"><HeartHandshake className="w-4 h-4 text-brand-400" />{tt('heading.persetujuanKeringanan')}</h3>
        <div className="flex gap-1 p-1 rounded-lg bg-dark-900/60">
          {(['PENDING', 'ALL'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1 rounded-md text-[10px] font-medium ${tab === t ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {t === 'PENDING' ? tt('status.menungguPersetujuan') : tt('misc.semua')}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-gray-500 mb-4">{tt('misc.persetujuanKeringananInfo')}</p>
      {loading ? <p className="text-[10px] text-gray-400 text-center py-6">{tt('msg.memuat')}</p>
        : proposals.length === 0 ? <p className="text-[10px] text-gray-400 text-center py-6">{tt('misc.tidakAdaPermintaan')}</p>
        : <div className="space-y-2">{proposals.map((p) => <KeringananCard key={p.id} p={p} canDecide={role === 'AdminManager'} onDecide={decide} />)}</div>}
    </div>
  );
}

export function ValidasiPembayaran() {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentDto[]>([]);
  const [proposals, setProposals] = useState<AllocationProposalDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'PENDING' | 'ALL'>('PENDING');

  useEffect(() => { fetchStudents().then((s) => setStudents(s.filter((x) => x.status === 'Aktif'))).catch(() => setStudents([])); }, []);

  const load = useMemo(() => async () => {
    setLoading(true);
    try { setProposals(await fetchAllocationProposals(tab === 'PENDING' ? 'PENDING' : undefined)); } finally { setLoading(false); }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  async function decide(id: number, decision: 'validate' | 'reject') {
    try {
      await decideAllocationProposal(id, decision);
      await load();
      showToast(decision === 'validate' ? tt('msg.usulanDivalidasi') : tt('msg.usulanDitolakToast'));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : tt('msg.gagalSimpanPembayaran'), 'error');
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
          <h3 className="text-sm font-bold text-white mb-1">{tt('heading.ajukanAlokasi')}</h3>
          <p className="text-[10px] text-gray-500 mb-4">{tt('misc.ajukanAlokasiInfo')}</p>
          <AjukanAlokasiForm students={students} onDone={load} />
        </div>
        <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-bold text-white">{tt('heading.menungguValidasi')}</h3>
            <div className="flex gap-1 p-1 rounded-lg bg-dark-900/60">
              {(['PENDING', 'ALL'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1 rounded-md text-[10px] font-medium ${tab === t ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                  {t === 'PENDING' ? tt('status.menungguValidasi') : tt('misc.semua')}
                </button>
              ))}
            </div>
          </div>
          {loading ? <p className="text-[10px] text-gray-400 text-center py-6">{tt('msg.memuat')}</p>
            : proposals.length === 0 ? <p className="text-[10px] text-gray-400 text-center py-6">{tt('misc.tidakAdaPermintaan')}</p>
            : <div className="space-y-2 max-h-[38rem] overflow-y-auto">{proposals.map((p) => <ProposalCard key={p.id} p={p} canDecide onDecide={decide} />)}</div>}
        </div>
      </div>
      <KeringananSection />
    </>
  );
}
