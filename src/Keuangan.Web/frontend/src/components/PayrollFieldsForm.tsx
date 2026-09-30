import { useEffect, useState } from 'react';
import { Save, Copy, Lock, LockOpen, Settings } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { useToast } from '../contexts/ToastContext';
import { savePayrollItem, fetchPayrollItemForEmployee, type EmployeeDto, type PayrollComponentTypeDto, type PayrollLineDto } from '../api';
import { lineAmount, lineQuantity, lineIsOverride, componentShortLabel, payrollComputeAmount, payrollColumnBlocks, penggajianPeriodLabel, prevPeriodPenggajian } from '../lib/payroll';

interface InitialData { hari_masuk: number | null; keterangan: string; lines: Record<string, PayrollLineDto> }

// Mirror payrollFieldsFormHtml()/simpanPayrollForm()/samakanBulanLaluForm()/togglePayrollOverride()
// (index.html:2022-2150) - versi React state-managed dari form DOM-manipulasi asli.
// Dipakai bersama oleh baris inline-edit Penggajian DAN panel Input Gaji di Profil Pegawai,
// persis seperti fungsi aslinya dipanggil dengan `ctx` berbeda dari dua tempat itu.
export function PayrollFieldsForm({ employee, year, month, initialData, onSaved }: { employee: EmployeeDto; year: number; month: number; initialData: InitialData; onSaved: () => Promise<void> | void }) {
  const { tt } = useI18n();
  const { role } = useRole();
  const { data } = useBootstrap();
  const { showToast } = useToast();
  const types = data?.payroll_component_types || [];
  const groups = data?.payroll_component_groups || [];
  const isAdmin = role === 'AdminManager';

  const [values, setValues] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [hariMasuk, setHariMasuk] = useState<string>('');
  const [keterangan, setKeterangan] = useState('');

  function loadFrom(d: InitialData) {
    const lines = d.lines || {};
    const nextValues: Record<string, string> = {};
    const nextQty: Record<string, string> = {};
    const nextOverrides = new Set<string>();
    types.forEach((c) => {
      const amt = lineAmount(lines, c.code);
      nextValues[c.code] = amt ? String(amt) : '';
      const qty = lineQuantity(lines, c.code);
      if (qty != null) nextQty[c.code] = String(qty);
      if (c.calc_mode !== 'MANUAL' && lineIsOverride(lines, c.code)) nextOverrides.add(c.code);
    });
    setValues(nextValues);
    setQuantities(nextQty);
    setOverrides(nextOverrides);
    setHariMasuk(d.hari_masuk != null ? String(d.hari_masuk) : '');
    setKeterangan(d.keterangan || '');
  }

  useEffect(() => {
    loadFrom(initialData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.db_id, year, month]);

  // Mirror recomputePayrollField() (index.html:1978-1994): hitung ulang nilai AUTO_HARI/AUTO_OWN
  // yang belum di-override manual, dipicu tiap kali Hari atau qty AUTO_OWN berubah.
  function recompute(nextHari: string, nextQuantities: Record<string, string>, currentOverrides: Set<string>) {
    setValues((prev) => {
      const next = { ...prev };
      types.forEach((c) => {
        if (currentOverrides.has(c.code)) return;
        if (c.calc_mode === 'AUTO_HARI') {
          next[c.code] = String(Math.round(payrollComputeAmount(c, employee, nextHari)));
        } else if (c.calc_mode === 'AUTO_OWN') {
          const qty = nextQuantities[c.code] ?? '';
          next[c.code] = String(Math.round(payrollComputeAmount(c, employee, qty)));
        }
      });
      return next;
    });
  }

  function onHariChange(v: string) {
    setHariMasuk(v);
    recompute(v, quantities, overrides);
  }
  function onQtyChange(code: string, v: string) {
    const nextQty = { ...quantities, [code]: v };
    setQuantities(nextQty);
    recompute(hariMasuk, nextQty, overrides);
  }
  function toggleOverride(code: string) {
    setOverrides((prev) => {
      const next = new Set(prev);
      const willOverride = !next.has(code);
      if (willOverride) next.add(code); else next.delete(code);
      if (!willOverride) recompute(hariMasuk, quantities, next);
      return next;
    });
  }

  async function samakanBulanLalu() {
    const prev = prevPeriodPenggajian(year, month);
    const prevLabel = penggajianPeriodLabel(prev.year, prev.month);
    try {
      const res = await fetchPayrollItemForEmployee(role, prevLabel, employee.db_id);
      if (!res.exists) { showToast(tt('msg.belumAdaDataBulanLalu'), 'error'); return; }
      loadFrom(res);
      showToast(tt('msg.berhasil'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tt('msg.gagalAmbilDataBulanLalu'), 'error');
    }
  }

  async function simpan() {
    const period = penggajianPeriodLabel(year, month);
    const lines: Record<string, number> = {};
    const qtyOut: Record<string, number> = {};
    const overridesOut: string[] = [];
    types.forEach((c) => {
      lines[c.code] = parseFloat(values[c.code]) || 0;
      if (c.calc_mode === 'AUTO_OWN' && quantities[c.code] !== undefined && quantities[c.code] !== '') {
        qtyOut[c.code] = parseFloat(quantities[c.code]) || 0;
      }
      if (c.calc_mode !== 'MANUAL' && overrides.has(c.code)) overridesOut.push(c.code);
    });
    try {
      await savePayrollItem(role, {
        employee_id: employee.db_id, period_label: period,
        hari_masuk: hariMasuk !== '' ? parseInt(hariMasuk) : null,
        keterangan: keterangan.trim(), lines, quantities: qtyOut, overrides: overridesOut,
      });
      showToast(tt('msg.berhasil'));
      await onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tt('msg.gagalSimpanDataGaji'), 'error');
    }
  }

  function Field({ c }: { c: PayrollComponentTypeDto }) {
    const isSupervisorLocked = c.edit_role === 'SUPERVISOR' && !isAdmin;
    if (isSupervisorLocked) {
      return (
        <div>
          <label className="text-[10px] text-gray-500 block mb-1 truncate" title={c.name}>{componentShortLabel(c)} <span className="text-amber-500" title={tt('misc.diisiSupervisor')}>🔒</span></label>
          <input type="number" value={values[c.code] || '0'} readOnly className="w-full bg-dark-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-400 focus:outline-none" />
        </div>
      );
    }
    if (c.calc_mode === 'MANUAL') {
      return (
        <div>
          <label className="text-[10px] text-gray-500 block mb-1 truncate" title={c.name}>{componentShortLabel(c)}{c.edit_role === 'SUPERVISOR' && <span className="text-amber-500" title={tt('misc.supervisorSajaInfo')}> 🔒</span>}</label>
          <input type="number" value={values[c.code] || ''} onChange={(e) => setValues((v) => ({ ...v, [c.code]: e.target.value }))} placeholder="0" className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
        </div>
      );
    }
    const isOverride = overrides.has(c.code);
    const rateInfo = c.calc_mode === 'AUTO_HARI' ? tt('calc.autoHari') : tt('calc.autoOwn');
    return (
      <div>
        <label className="text-[10px] text-gray-500 block mb-1 truncate" title={c.name}>{componentShortLabel(c)} <span className="text-gray-600" title={rateInfo}><Settings className="w-2.5 h-2.5 inline" /></span></label>
        {c.calc_mode === 'AUTO_OWN' && (
          <input type="number" value={quantities[c.code] || ''} onChange={(e) => onQtyChange(c.code, e.target.value)} placeholder={c.qty_label || tt('col.jumlah')} disabled={isOverride}
            className="w-full mb-1 bg-dark-900 border border-gray-700 rounded-lg px-3 py-1.5 text-[11px] text-gray-400 focus:outline-none focus:border-brand-500" />
        )}
        <div className="flex items-center gap-1">
          <input type="number" value={values[c.code] || '0'} readOnly={!isOverride} onChange={(e) => setValues((v) => ({ ...v, [c.code]: e.target.value }))}
            className={`w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500 ${isOverride ? 'text-gray-300' : 'text-gray-400 bg-dark-950'}`} />
          <button type="button" onClick={() => toggleOverride(c.code)} title={isOverride ? tt('btn.kembaliOtomatis') : tt('btn.timpaManual')} className="p-2 rounded-lg bg-dark-900 border border-gray-700 text-gray-400 hover:text-white flex-shrink-0">
            {isOverride ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    );
  }

  function Blocks({ category }: { category: 'EARNING' | 'DEDUCTION' }) {
    const blocks = payrollColumnBlocks(category, types, groups);
    return (
      <div className="flex flex-wrap items-start gap-3">
        {blocks.map((b, i) => b.type === 'group' ? (
          <div key={i} className="border border-gray-700/50 rounded-lg p-2.5 flex-1 min-w-[220px]">
            <div className="text-[10px] font-semibold text-brand-400 uppercase mb-2">{b.group.name}</div>
            <div className="grid grid-cols-2 gap-2">{b.components.map((c) => <Field key={c.code} c={c} />)}</div>
          </div>
        ) : (
          <div key={i} className="min-w-[140px] flex-1"><Field c={b.components[0]} /></div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">{tt('misc.pendapatan')}</div>
        <Blocks category="EARNING" />
      </div>
      <div className="mb-3 max-w-[180px]">
        <label className="text-[10px] text-gray-500 block mb-1">{tt('col.hari')}</label>
        <input type="number" value={hariMasuk} onChange={(e) => onHariChange(e.target.value)} placeholder="0" className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
      </div>
      <div className="mb-3">
        <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">{tt('misc.potongan')}</div>
        <Blocks category="DEDUCTION" />
      </div>
      <div className="mb-3">
        <label className="text-[10px] text-gray-500 block mb-1">{tt('col.keterangan')}</label>
        <input type="text" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder={tt('misc.opsional')} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={simpan} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700"><Save className="w-3.5 h-3.5 inline mr-1" />{tt('btn.simpan')}</button>
        <button onClick={samakanBulanLalu} className="px-4 py-2 rounded-lg bg-dark-900 border border-gray-700 text-gray-300 text-xs hover:bg-dark-850"><Copy className="w-3.5 h-3.5 inline mr-1" />{tt('btn.samakanBulanLalu')}</button>
      </div>
    </div>
  );
}
