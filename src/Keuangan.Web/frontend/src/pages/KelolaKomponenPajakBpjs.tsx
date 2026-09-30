import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { useToast } from '../contexts/ToastContext';
import { useSyncedState } from '../lib/useSyncedState';
import {
  createPayrollComponentType, updatePayrollComponentType,
  type PayrollComponentTypeDto, type KelompokPajakBpjs,
} from '../api';

const inputCls = 'w-full bg-transparent border border-transparent hover:border-gray-700 focus:border-brand-500 focus:bg-dark-900 rounded px-1.5 py-1 text-xs text-gray-300 focus:outline-none';

const KELOMPOK_LIST: { kelompok: KelompokPajakBpjs; labelKey: string }[] = [
  { kelompok: 'PAJAK', labelKey: 'heading.pajak' },
  { kelompok: 'BPJS_TK', labelKey: 'heading.bpjsTk' },
  { kelompok: 'BPJS_K', labelKey: 'heading.bpjsK' },
];

// Kelola Komponen KHUSUS Pajak/BPJS (menu "Pajak & BPJS") - SENGAJA
// terpisah dari Kelola Komponen Gaji yang sudah ada (itu tetap khusus
// urusan Penggajian: gaji pokok, tunjangan, dst) supaya tidak tercampur,
// sesuai kesepakatan diskusi. Cuma atur STRUKTUR (nama kolom, kategori,
// urutan) - tempat ISI ANGKA-nya tetap di halaman Pajak/BPJS TK/BPJS K
// masing-masing (lihat PajakBpjsGrid.tsx).
export function KelolaKomponenPajakBpjs() {
  const { tt } = useI18n();
  const { role } = useRole();
  const isAdmin = role === 'AdminManager';

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-white">{tt('heading.kelolaKomponenPajakBpjs')}</h3>
        <p className="text-[10px] text-gray-400 mt-0.5">{tt('misc.kelolaKomponenPajakBpjsInfo')}</p>
      </div>
      {!isAdmin ? (
        <p className="text-xs text-gray-400 text-center py-6">{tt('msg.belumAdaData')}</p>
      ) : (
        KELOMPOK_LIST.map(({ kelompok, labelKey }) => <KelompokSection key={kelompok} kelompok={kelompok} labelKey={labelKey} />)
      )}
    </div>
  );
}

function KelompokSection({ kelompok, labelKey }: { kelompok: KelompokPajakBpjs; labelKey: string }) {
  const { tt } = useI18n();
  const { role } = useRole();
  const { data, refetch } = useBootstrap();
  const { showToast } = useToast();
  const [draftOpen, setDraftOpen] = useState(false);

  const items = (data?.payroll_component_types || [])
    .filter((c) => c.edit_role === 'SUPERVISOR' && c.is_active && c.kelompok_pajak_bpjs === kelompok)
    .sort((a, b) => a.urutan - b.urutan);

  const thBase = 'py-2 px-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap';

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-white uppercase">{tt(labelKey)}</h4>
        <button onClick={() => setDraftOpen(true)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 text-[10px] font-medium"><Plus className="w-3 h-3" />{tt('btn.tambahKomponen')}</button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-700/50">
        <table className="w-full text-xs border-collapse">
          <thead><tr className="border-b border-gray-700/50 bg-dark-900/60">
            <th className={thBase}>{tt('col.namaKomponen')}</th>
            <th className={thBase}>{tt('col.kategori')}</th>
            <th className={`${thBase} text-center`}>{tt('col.urutan')}</th>
            <th className={thBase}>{tt('col.labelSingkat')}</th>
            <th className={`${thBase} no-print`}>{tt('col.aksi')}</th>
          </tr></thead>
          <tbody>
            {items.map((c) => <KomponenRow key={c.db_id} c={c} />)}
            {draftOpen && <KomponenBaruRow kelompok={kelompok} onDone={() => setDraftOpen(false)} />}
            {!items.length && !draftOpen && <tr><td colSpan={5} className="py-4 text-center text-gray-400">{tt('msg.belumAdaData')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  function KomponenRow({ c }: { c: PayrollComponentTypeDto }) {
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

    return (
      <tr className="border-t border-gray-700/30 hover:bg-dark-850/50">
        <td className="px-2 py-1"><input type="text" value={name} onChange={(e) => setName(e.target.value)} onBlur={simpanNamaLabel} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={`${inputCls} font-medium`} /></td>
        <td className="px-2 py-1">
          <select value={c.category} onChange={(e) => patch({ category: e.target.value }, tt('msg.gagalMenyimpan'))} className={inputCls}>
            <option value="EARNING">{tt('misc.pendapatan')}</option>
            <option value="DEDUCTION">{tt('misc.potongan')}</option>
          </select>
        </td>
        <td className="px-2 py-1 text-center"><input type="number" value={urutan} onChange={(e) => setUrutan(e.target.value)} onBlur={() => patch({ urutan: parseInt(urutan) || 0 }, tt('msg.gagalUbahUrutan'))} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={`${inputCls} text-center w-16`} /></td>
        <td className="px-2 py-1"><input type="text" value={shortLabel} maxLength={20} placeholder={tt('misc.opsional')} onChange={(e) => setShortLabel(e.target.value)} onBlur={simpanNamaLabel} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={inputCls} /></td>
        <td className="px-2 py-1 no-print"><button onClick={nonaktifkan} className="p-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/40" title={tt('btn.nonaktifkan')}><Trash2 className="w-3.5 h-3.5" /></button></td>
      </tr>
    );
  }
}

function KomponenBaruRow({ kelompok, onDone }: { kelompok: KelompokPajakBpjs; onDone: () => void }) {
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
    const maxUrutan = Math.max(0, ...types.filter((c) => c.kelompok_pajak_bpjs === kelompok).map((c) => c.urutan), 0);
    const code = trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '_' + Date.now().toString(36).toUpperCase().slice(-4);
    try {
      await createPayrollComponentType(role, {
        code, name: trimmed, category: 'DEDUCTION', urutan: maxUrutan + 1, calc_mode: 'MANUAL',
        edit_role: 'SUPERVISOR', kelompok_pajak_bpjs: kelompok,
      });
      showToast(tt('msg.berhasil'));
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tt('msg.gagalTambahKomponen'), 'error');
    }
  }

  return (
    <tr className="border-t border-gray-700/30 bg-brand-500/5">
      <td className="px-2 py-1"><input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={tt('misc.namaKomponenBaru')} onBlur={simpan} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="w-full bg-dark-900 border border-brand-500 rounded px-1.5 py-1 text-xs text-gray-300 focus:outline-none" /></td>
      <td colSpan={4} className="px-2 py-1 text-[10px] text-gray-400">{tt('misc.ketikNamaLaluEnter')}</td>
    </tr>
  );
}
