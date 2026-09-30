import { useState } from 'react';
import { Pencil, Trash2, FolderPlus, Plus, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { useToast } from '../contexts/ToastContext';
import { useSyncedState } from '../lib/useSyncedState';
import { PAYROLL_EDUCATION_LEVELS } from '../lib/payroll';
import { fmt } from '../lib/format';
import {
  updatePayrollComponentType, createPayrollComponentType,
  createPayrollComponentGroup, updatePayrollComponentGroup, deactivatePayrollComponentGroup,
  type PayrollComponentTypeDto, type PayrollComponentGroupDto, type CalcMode, type SlipSection, type EditRole,
} from '../api';

const inputCls = 'w-full bg-transparent border border-transparent hover:border-gray-700 focus:border-brand-500 focus:bg-dark-900 rounded px-1.5 py-1 text-xs text-gray-300 focus:outline-none';

// Mirror renderKelolaKomponenGaji()/kategoriSpreadsheetHtml()/komponenRowHtml()/tarifExpandRowHtml()
// (index.html:2420-2777) - tabel spreadsheet inline-edit, simpan onBlur, persis pola aslinya.
export function KelolaKomponenGaji() {
  const { tt } = useI18n();
  const { role } = useRole();
  const boleh = role === 'AdminManager' || role === 'Staff';
  const [tarifExpandId, setTarifExpandId] = useState<string | null>(null);
  const [grupRenameId, setGrupRenameId] = useState<string | null>(null);
  const [komponenBaruDraft, setKomponenBaruDraft] = useState<Record<string, boolean>>({});

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-white">{tt('heading.kelolaKomponenGaji')}</h3>
        <p className="text-[10px] text-gray-400 mt-0.5">{tt('misc.kelolaKomponenInfo')}</p>
      </div>
      {!boleh ? (
        <p className="text-xs text-gray-400 text-center py-6">{tt('msg.belumAdaData')}</p>
      ) : (
        <>
          <KategoriSpreadsheet category="EARNING" labelKey="misc.pendapatan" tarifExpandId={tarifExpandId} setTarifExpandId={setTarifExpandId} grupRenameId={grupRenameId} setGrupRenameId={setGrupRenameId} komponenBaruDraft={komponenBaruDraft} setKomponenBaruDraft={setKomponenBaruDraft} />
          <KategoriSpreadsheet category="DEDUCTION" labelKey="misc.potongan" tarifExpandId={tarifExpandId} setTarifExpandId={setTarifExpandId} grupRenameId={grupRenameId} setGrupRenameId={setGrupRenameId} komponenBaruDraft={komponenBaruDraft} setKomponenBaruDraft={setKomponenBaruDraft} />
        </>
      )}
    </div>
  );
}

interface KategoriProps {
  category: 'EARNING' | 'DEDUCTION'; labelKey: string;
  tarifExpandId: string | null; setTarifExpandId: (v: string | null) => void;
  grupRenameId: string | null; setGrupRenameId: (v: string | null) => void;
  komponenBaruDraft: Record<string, boolean>; setKomponenBaruDraft: (v: Record<string, boolean>) => void;
}

function KategoriSpreadsheet({ category, labelKey, tarifExpandId, setTarifExpandId, grupRenameId, setGrupRenameId, komponenBaruDraft, setKomponenBaruDraft }: KategoriProps) {
  const { tt } = useI18n();
  const { role } = useRole();
  const { data, refetch } = useBootstrap();
  const { showToast } = useToast();
  const thBase = 'py-2 px-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap';

  const allTypes = data?.payroll_component_types || [];
  const allGroups = data?.payroll_component_groups || [];
  const groups = allGroups.filter((g) => g.category === category && g.is_active).sort((a, b) => a.urutan - b.urutan);
  const ungrouped = allTypes.filter((c) => c.category === category && c.is_active && !c.group_id).sort((a, b) => a.urutan - b.urutan);
  const draftOpen = !!komponenBaruDraft[category];

  async function tambahGrupBaru() {
    const maxUrutan = Math.max(0, ...allGroups.filter((g) => g.category === category).map((g) => g.urutan), 0);
    try {
      const res = await createPayrollComponentGroup(role, tt('misc.grupBaru'), category) as { db_id: string };
      await refetch();
      setGrupRenameId(res.db_id);
      void maxUrutan;
    } catch (err) {
      showToast(err instanceof Error ? err.message : tt('msg.gagalTambahGrup'), 'error');
    }
  }

  function tambahKomponenBaru() {
    setKomponenBaruDraft({ ...komponenBaruDraft, [category]: true });
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-white uppercase">{tt(labelKey)}</h4>
        <div className="flex gap-2">
          <button onClick={tambahGrupBaru} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-dark-900 border border-gray-700 text-gray-300 hover:bg-dark-850 text-[10px] font-medium"><FolderPlus className="w-3 h-3" />{tt('btn.tambahGrup')}</button>
          <button onClick={tambahKomponenBaru} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 text-[10px] font-medium"><Plus className="w-3 h-3" />{tt('btn.tambahKomponen')}</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-700/50">
        <table className="w-full text-xs border-collapse">
          <thead><tr className="border-b border-gray-700/50 bg-dark-900/60">
            <th className={thBase}>{tt('col.namaKomponen')}</th>
            <th className={thBase}>{tt('col.grup')}</th>
            <th className={thBase}>{tt('col.modePerhitungan')}</th>
            <th className={`${thBase} text-center`}>{tt('col.urutan')}</th>
            <th className={thBase}>{tt('col.tarifDefault')}</th>
            <th className={thBase}>{tt('col.bagianSlip')}</th>
            <th className={thBase}>{tt('col.siapaIsi')}</th>
            <th className={thBase}>{tt('col.labelSingkat')}</th>
            <th className={`${thBase} no-print`}>{tt('col.aksi')}</th>
          </tr></thead>
          <tbody>
            {groups.map((g) => (
              <GroupSection key={g.db_id} g={g} allTypes={allTypes} category={category} isRenaming={grupRenameId === g.db_id} onStartRename={() => setGrupRenameId(g.db_id)} onDoneRename={() => setGrupRenameId(null)}
                tarifExpandId={tarifExpandId} setTarifExpandId={setTarifExpandId} groupOptions={groups} />
            ))}
            {(ungrouped.length > 0 || !groups.length) && (
              <>
                <tr className="bg-dark-900/40 border-t border-b border-gray-700/30"><td colSpan={9} className="py-1.5 px-2 text-[10px] font-semibold text-gray-400 uppercase">{tt('misc.tanpaGrup')}</td></tr>
                {ungrouped.map((c) => <KomponenRow key={c.db_id} c={c} category={category} groupOptions={groups} isExpanded={tarifExpandId === c.db_id} onToggleExpand={() => setTarifExpandId(tarifExpandId === c.db_id ? null : c.db_id)} />)}
              </>
            )}
            {draftOpen && <KomponenBaruRow category={category} onDone={() => setKomponenBaruDraft({ ...komponenBaruDraft, [category]: false })} />}
            {!groups.length && !ungrouped.length && !draftOpen && <tr><td colSpan={9} className="py-4 text-center text-gray-400">{tt('msg.belumAdaData')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupSection({ g, allTypes, category, isRenaming, onStartRename, onDoneRename, tarifExpandId, setTarifExpandId, groupOptions }: {
  g: PayrollComponentGroupDto; allTypes: PayrollComponentTypeDto[]; category: 'EARNING' | 'DEDUCTION'; isRenaming: boolean; onStartRename: () => void; onDoneRename: () => void;
  tarifExpandId: string | null; setTarifExpandId: (v: string | null) => void; groupOptions: PayrollComponentGroupDto[];
}) {
  const { tt } = useI18n();
  const { role } = useRole();
  const { refetch } = useBootstrap();
  const { showToast } = useToast();
  const [name, setName] = useSyncedState(g.name);
  const comps = allTypes.filter((c) => c.group_id === g.db_id && c.is_active).sort((a, b) => a.urutan - b.urutan);

  async function simpanRename() {
    onDoneRename();
    const trimmed = name.trim();
    if (!trimmed) { setName(g.name); return; }
    try {
      await updatePayrollComponentGroup(role, g.db_id, { name: trimmed });
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tt('msg.gagalSimpanNamaGrup'), 'error');
    }
  }

  async function nonaktifkan() {
    if (!window.confirm(`${tt('msg.konfirmasiNonaktifkanGrup')} "${g.name}"?`)) return;
    try {
      await deactivatePayrollComponentGroup(role, g.db_id);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tt('msg.gagalNonaktifkanGrup'), 'error');
    }
  }

  return (
    <>
      <tr className="bg-brand-500/5 border-t border-b border-brand-500/20">
        <td colSpan={9} className="py-1.5 px-2">
          <div className="flex items-center justify-between gap-2">
            {isRenaming ? (
              <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={simpanRename} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="bg-dark-900 border border-brand-500 rounded px-2 py-1 text-xs font-semibold text-brand-400 focus:outline-none" />
            ) : (
              <span className="text-xs font-semibold text-brand-400">{g.name} <span className="text-gray-400 font-normal">({tt('col.urutan')}: {g.urutan})</span></span>
            )}
            <div className="flex gap-1 no-print">
              <button onClick={onStartRename} className="p-1 rounded btn-icon-edit" title={tt('btn.edit')}><Pencil className="w-3 h-3" /></button>
              <button onClick={nonaktifkan} className="p-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/40" title={tt('btn.nonaktifkan')}><Trash2 className="w-3 h-3" /></button>
            </div>
          </div>
        </td>
      </tr>
      {comps.map((c) => <KomponenRow key={c.db_id} c={c} category={category} groupOptions={groupOptions} isExpanded={tarifExpandId === c.db_id} onToggleExpand={() => setTarifExpandId(tarifExpandId === c.db_id ? null : c.db_id)} />)}
    </>
  );
}

function KomponenRow({ c, category, groupOptions, isExpanded, onToggleExpand }: { c: PayrollComponentTypeDto; category: 'EARNING' | 'DEDUCTION'; groupOptions: PayrollComponentGroupDto[]; isExpanded: boolean; onToggleExpand: () => void }) {
  const { tt } = useI18n();
  const { role } = useRole();
  const { refetch } = useBootstrap();
  const { showToast } = useToast();
  const isAdmin = role === 'AdminManager';
  const [name, setName] = useSyncedState(c.name);
  const [shortLabel, setShortLabel] = useSyncedState(c.short_label);
  const [urutan, setUrutan] = useSyncedState(String(c.urutan));

  async function patch(input: Record<string, unknown>, errMsg: string) {
    try {
      await updatePayrollComponentType(role, c.db_id, input);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : errMsg, 'error');
    }
  }

  async function simpanNamaLabel() {
    const trimmed = name.trim();
    if (!trimmed) { showToast(tt('msg.belumAdaData'), 'error'); setName(c.name); return; }
    await patch({ name: trimmed, short_label: shortLabel.trim() }, tt('msg.gagalMenyimpan'));
  }

  async function nonaktifkan() {
    if (!window.confirm(`${tt('msg.konfirmasiNonaktifkanKomponen')} "${c.name}"?`)) return;
    await patch({ is_active: false }, tt('msg.gagalNonaktifkanKomponen'));
  }

  const tarifCellContent = c.calc_mode === 'MANUAL' ? (
    <span className="text-gray-400">-</span>
  ) : (
    <button onClick={onToggleExpand} className="text-[11px] text-blue-400 hover:underline flex items-center gap-1">{fmt(c.default_rate)}{isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</button>
  );

  return (
    <>
      <tr className="border-t border-gray-700/30 hover:bg-dark-850/50">
        <td className="px-2 py-1"><input type="text" value={name} onChange={(e) => setName(e.target.value)} onBlur={simpanNamaLabel} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={`${inputCls} font-medium`} title={tt('col.namaKomponen')} /></td>
        <td className="px-2 py-1">
          <select value={c.group_id || ''} onChange={(e) => patch({ group_id: e.target.value || null }, tt('msg.gagalPindahGrup'))} className={inputCls}>
            <option value="">{tt('misc.tanpaGrup')}</option>
            {groupOptions.map((g) => <option key={g.db_id} value={g.db_id}>{g.name}</option>)}
          </select>
        </td>
        <td className="px-2 py-1">
          <select value={c.calc_mode} onChange={(e) => { const mode = e.target.value as CalcMode; patch(mode === 'MANUAL' ? { calc_mode: mode, default_rate: 0, qty_label: '' } : { calc_mode: mode }, tt('msg.gagalUbahModePerhitungan')); if (mode !== 'MANUAL') onToggleExpand(); }} className={inputCls}>
            <option value="MANUAL">{tt('calc.manual')}</option>
            <option value="AUTO_HARI">{tt('calc.autoHari')}</option>
            <option value="AUTO_OWN">{tt('calc.autoOwn')}</option>
          </select>
        </td>
        <td className="px-2 py-1 text-center"><input type="number" value={urutan} onChange={(e) => setUrutan(e.target.value)} onBlur={() => patch({ urutan: parseInt(urutan) || 0 }, tt('msg.gagalUbahUrutan'))} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={`${inputCls} text-center w-16`} /></td>
        <td className="px-2 py-1">{tarifCellContent}</td>
        <td className="px-2 py-1">
          {category === 'EARNING' ? (
            <select value={c.slip_section} onChange={(e) => patch({ slip_section: e.target.value as SlipSection }, tt('msg.gagalUbahBagianSlip'))} className={inputCls}>
              <option value="TETAP">{tt('slip.tetap')}</option>
              <option value="TIDAK_TETAP">{tt('slip.tidakTetap')}</option>
            </select>
          ) : <span className="text-gray-400">-</span>}
        </td>
        <td className="px-2 py-1">
          {isAdmin ? (
            <select value={c.edit_role} onChange={(e) => patch({ edit_role: e.target.value as EditRole }, tt('msg.gagalUbahSiapaIsi'))} className={inputCls}>
              <option value="ALL">{tt('role.semua')}</option>
              <option value="SUPERVISOR">{tt('role.supervisorSaja')}</option>
            </select>
          ) : <span className={c.edit_role === 'SUPERVISOR' ? 'text-amber-400' : 'text-gray-400'}>{c.edit_role === 'SUPERVISOR' ? tt('role.supervisorSaja') : tt('role.semua')}</span>}
        </td>
        <td className="px-2 py-1"><input type="text" value={shortLabel} maxLength={20} placeholder={tt('misc.opsional')} onChange={(e) => setShortLabel(e.target.value)} onBlur={simpanNamaLabel} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={inputCls} /></td>
        <td className="px-2 py-1 no-print"><button onClick={nonaktifkan} className="p-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/40" title={tt('btn.nonaktifkan')}><Trash2 className="w-3.5 h-3.5" /></button></td>
      </tr>
      {isExpanded && <TarifExpandRow c={c} onDone={onToggleExpand} />}
    </>
  );
}

function TarifExpandRow({ c, onDone }: { c: PayrollComponentTypeDto; onDone: () => void }) {
  const { tt } = useI18n();
  const { role } = useRole();
  const { refetch } = useBootstrap();
  const { showToast } = useToast();
  const [qtyLabel, setQtyLabel] = useState(c.qty_label);
  const [defaultRate, setDefaultRate] = useState(String(c.default_rate));
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    PAYROLL_EDUCATION_LEVELS.forEach(([code]) => { init[code] = c.rates[code] != null ? String(c.rates[code]) : ''; });
    return init;
  });

  async function simpan() {
    if (c.calc_mode === 'AUTO_OWN' && !qtyLabel.trim()) { showToast(tt('msg.belumAdaData'), 'error'); return; }
    const ratesPayload: Record<string, number | null> = {};
    PAYROLL_EDUCATION_LEVELS.forEach(([code]) => { ratesPayload[code] = rates[code] !== '' ? parseFloat(rates[code]) : null; });
    try {
      await updatePayrollComponentType(role, c.db_id, {
        default_rate: parseFloat(defaultRate) || 0,
        ...(c.calc_mode === 'AUTO_OWN' ? { qty_label: qtyLabel.trim() } : {}),
        rates: ratesPayload,
      });
      showToast(tt('msg.berhasil'));
      await refetch();
      onDone();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tt('msg.gagalSimpanTarif'), 'error');
    }
  }

  return (
    <tr className="bg-dark-900/40 no-print"><td colSpan={9} className="p-3">
      <div className="border border-gray-700/50 rounded-lg p-3 space-y-3 max-w-2xl">
        {c.calc_mode === 'AUTO_OWN' ? (
          <div className="max-w-xs"><label className="text-[10px] text-gray-500 block mb-1">{tt('col.labelInput')} *</label><input type="text" value={qtyLabel} onChange={(e) => setQtyLabel(e.target.value)} placeholder="Contoh: Jam Mengajar" className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" /></div>
        ) : <p className="text-[10px] text-gray-400">{tt('misc.otomatisDariHariInfo')}</p>}
        <div className="max-w-[200px]"><label className="text-[10px] text-gray-500 block mb-1">{tt('col.tarifDefault')} *</label><input type="number" value={defaultRate} onChange={(e) => setDefaultRate(e.target.value)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" /></div>
        <div>
          <div className="text-[10px] text-gray-400 mb-1">{tt('heading.tarifJenjangPendidikan')}</div>
          <p className="text-[9px] text-gray-400 mb-2">{tt('misc.tarifJenjangInfo')}</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {PAYROLL_EDUCATION_LEVELS.map(([code, label]) => (
              <div key={code}><label className="text-[9px] text-gray-500 block mb-1">{label}</label><input type="number" value={rates[code]} onChange={(e) => setRates((r) => ({ ...r, [code]: e.target.value }))} placeholder={tt('misc.pakaiDefault')} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-[11px] text-gray-300 focus:outline-none focus:border-brand-500" /></div>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={simpan} className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-[11px] font-medium hover:bg-brand-700"><Save className="w-3 h-3 inline mr-1" />{tt('btn.simpan')}</button>
          <button onClick={onDone} className="px-3 py-1.5 rounded-lg bg-dark-900 border border-gray-700 text-gray-400 text-[11px] hover:bg-dark-850">{tt('btn.tutup')}</button>
        </div>
      </div>
    </td></tr>
  );
}

function KomponenBaruRow({ category, onDone }: { category: 'EARNING' | 'DEDUCTION'; onDone: () => void }) {
  const { tt } = useI18n();
  const { role } = useRole();
  const { data, refetch } = useBootstrap();
  const { showToast } = useToast();
  const [name, setName] = useState('');

  async function simpan() {
    const trimmed = name.trim();
    onDone();
    if (!trimmed) return;
    const types = data?.payroll_component_types || [];
    const maxUrutan = Math.max(0, ...types.filter((c) => c.category === category).map((c) => c.urutan), 0);
    const code = trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '_' + Date.now().toString(36).toUpperCase().slice(-4);
    try {
      await createPayrollComponentType(role, { code, name: trimmed, category, urutan: maxUrutan + 1, calc_mode: 'MANUAL' });
      showToast(tt('msg.berhasil'));
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tt('msg.gagalTambahKomponen'), 'error');
    }
  }

  return (
    <tr className="border-t border-gray-700/30 bg-brand-500/5">
      <td className="px-2 py-1"><input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={tt('misc.namaKomponenBaru')} onBlur={simpan} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="w-full bg-dark-900 border border-brand-500 rounded px-1.5 py-1 text-xs text-gray-300 focus:outline-none" /></td>
      <td colSpan={8} className="px-2 py-1 text-[10px] text-gray-400">{tt('misc.ketikNamaLaluEnter')}</td>
    </tr>
  );
}
