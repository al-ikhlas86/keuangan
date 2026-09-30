import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Plus, Save, Trash2, X } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { useToast } from '../contexts/ToastContext';
import { TagPicker, type TagOption } from '../components/TagPicker';
import {
  createPayslipTemplateLine, updatePayslipTemplateLine, deletePayslipTemplateLine,
  type PayslipTemplateLineDto, type PayrollComponentTypeDto, type PayslipRowType, type PayslipListKelompok,
} from '../api';

const ROW_TYPE_LABEL_KEY: Record<PayslipRowType, string> = {
  HEADING: 'misc.rowTypeHeading', COMPONENT_LIST: 'misc.rowTypeComponentList', DATA: 'misc.rowTypeData', TOTAL: 'misc.rowTypeTotal',
};
const ROW_TYPE_DESC_KEY: Record<PayslipRowType, string> = {
  HEADING: 'misc.rowTypeHeadingDesc', COMPONENT_LIST: 'misc.rowTypeComponentListDesc', DATA: 'misc.rowTypeDataDesc', TOTAL: 'misc.rowTypeTotalDesc',
};
const ROW_TYPE_BADGE: Record<PayslipRowType, string> = {
  HEADING: 'bg-gray-500/20 text-gray-400', COMPONENT_LIST: 'bg-blue-500/20 text-blue-400',
  DATA: 'bg-emerald-500/20 text-emerald-400', TOTAL: 'bg-amber-500/20 text-amber-400',
};
const LIST_KELOMPOK_LABEL_KEY: Record<PayslipListKelompok, string> = {
  '': 'misc.kelompokSemua', REGULAR: 'misc.kelompokRegular', PAJAK_BPJS: 'misc.kelompokPajakBpjsGabungan',
  PAJAK: 'menu.pajak', BPJS_TK: 'menu.bpjsTk', BPJS_K: 'menu.bpjsK',
};

interface LineFormState {
  row_type: PayslipRowType; label: string; bold: boolean; indent: boolean;
  list_category: 'EARNING' | 'DEDUCTION'; list_slip_section: '' | 'TETAP' | 'TIDAK_TETAP'; list_kelompok_pajak_bpjs: PayslipListKelompok;
  component_ids: string[]; sum_sources: { line_id: string; sign: 1 | -1 }[];
}

function blankForm(): LineFormState {
  return { row_type: 'HEADING', label: '', bold: false, indent: false, list_category: 'EARNING', list_slip_section: '', list_kelompok_pajak_bpjs: '', component_ids: [], sum_sources: [] };
}

// Menu Kelola Slip Gaji - mengatur TAMPILAN badan slip gaji saja. TIDAK
// PERNAH memengaruhi nominal gaji sungguhan (lihat apps/finance/models.py
// PayslipTemplateLine). Urutan diatur lewat tombol naik/turun (bukan ketik
// angka manual) - baris baru selalu masuk paling bawah dulu, geser pakai
// panah. Sumber data (komponen utk Isi Data, baris lain utk Jumlah) dipilih
// lewat TagPicker (klik, bukan centang panjang) - satu komponen cuma boleh
// dipakai di SATU baris Isi Data sekaligus (dijaga backend, exclusive).
export function KelolaSlipGaji() {
  const { tt } = useI18n();
  const { role } = useRole();
  const { data, refetch } = useBootstrap();
  const { showToast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);

  const isAdmin = role === 'AdminManager';
  const lines = [...(data?.payslip_template || [])].sort((a, b) => a.urutan - b.urutan);
  const components = data?.payroll_component_types || [];

  async function pindah(index: number, arah: -1 | 1) {
    const lain = lines[index + arah];
    const skrg = lines[index];
    if (!lain || moving) return;
    setMoving(true);
    try {
      await Promise.all([
        updatePayslipTemplateLine(role, skrg.db_id, { urutan: lain.urutan }),
        updatePayslipTemplateLine(role, lain.db_id, { urutan: skrg.urutan }),
      ]);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tt('msg.gagalMenyimpan'), 'error');
    } finally {
      setMoving(false);
    }
  }

  async function hapus(line: PayslipTemplateLineDto) {
    if (!window.confirm(`${tt('msg.konfirmasiHapusBarisSlip')} "${line.label || tt(ROW_TYPE_LABEL_KEY[line.row_type])}"?`)) return;
    try {
      await deletePayslipTemplateLine(role, line.db_id);
      await refetch();
      showToast(tt('msg.berhasil'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tt('msg.gagalMenghapus'), 'error');
    }
  }

  if (!isAdmin) {
    return <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-6 text-center text-xs text-gray-400">{tt('msg.belumAdaData')}</div>;
  }

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 className="text-sm font-bold text-white">{tt('heading.kelolaSlipGaji')}</h3>
        <button onClick={() => { setAdding(true); setExpandedId(null); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 text-xs font-medium"><Plus className="w-3.5 h-3.5" />{tt('btn.tambahBaris')}</button>
      </div>
      <p className="text-[10px] text-gray-400 mb-4">{tt('misc.kelolaSlipGajiInfo')}</p>

      {adding && (
        <div className="mb-3">
          <LineEditor initial={blankForm()} lines={lines} components={components} onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); refetch(); }} />
        </div>
      )}

      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <div key={line.db_id} className="bg-dark-900/60 rounded-lg">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button onClick={() => pindah(i, -1)} disabled={i === 0 || moving} className="p-0.5 rounded bg-dark-900 border border-gray-700 text-gray-400 hover:text-white disabled:opacity-20"><ArrowUp className="w-3 h-3" /></button>
                <button onClick={() => pindah(i, 1)} disabled={i === lines.length - 1 || moving} className="p-0.5 rounded bg-dark-900 border border-gray-700 text-gray-400 hover:text-white disabled:opacity-20"><ArrowDown className="w-3 h-3" /></button>
              </div>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold flex-shrink-0 ${ROW_TYPE_BADGE[line.row_type]}`}>{tt(ROW_TYPE_LABEL_KEY[line.row_type])}</span>
              <span className={`flex-1 min-w-0 truncate text-xs ${line.bold ? 'font-bold text-white' : 'text-gray-300'} ${line.indent ? 'pl-3' : ''}`}>
                {line.label || <span className="text-gray-500 italic">{tt('misc.daftarOtomatis')} ({line.list_category === 'EARNING' ? tt('misc.pendapatan') : tt('misc.potongan')}{line.list_slip_section ? ` - ${line.list_slip_section === 'TETAP' ? tt('slip.tetap') : tt('slip.tidakTetap')}` : ''}{line.list_kelompok_pajak_bpjs ? ` - ${tt(LIST_KELOMPOK_LABEL_KEY[line.list_kelompok_pajak_bpjs])}` : ''})</span>}
              </span>
              <button onClick={() => { setExpandedId(expandedId === line.db_id ? null : line.db_id); setAdding(false); }} className="p-1.5 rounded btn-icon-edit flex-shrink-0">{expandedId === line.db_id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button>
              <button onClick={() => hapus(line)} className="p-1.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            {expandedId === line.db_id && (
              <div className="px-3 pb-3">
                <LineEditor
                  initial={{
                    row_type: line.row_type, label: line.label, bold: line.bold, indent: line.indent,
                    list_category: (line.list_category || 'EARNING') as 'EARNING' | 'DEDUCTION', list_slip_section: line.list_slip_section || '',
                    list_kelompok_pajak_bpjs: line.list_kelompok_pajak_bpjs || '',
                    component_ids: line.component_ids, sum_sources: line.sum_sources,
                  }}
                  lines={lines}
                  components={components}
                  currentLineId={line.db_id}
                  currentUrutan={line.urutan}
                  onCancel={() => setExpandedId(null)}
                  onSaved={() => { setExpandedId(null); refetch(); }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LineEditor({ initial, lines, components, currentLineId, currentUrutan, onCancel, onSaved }: {
  initial: LineFormState; lines: PayslipTemplateLineDto[]; components: PayrollComponentTypeDto[];
  currentLineId?: string; currentUrutan?: number; onCancel: () => void; onSaved: () => void;
}) {
  const { tt } = useI18n();
  const { role } = useRole();
  const { showToast } = useToast();
  const [form, setForm] = useState<LineFormState>(initial);
  const [saving, setSaving] = useState(false);

  // Komponen yang SUDAH dipakai baris Isi Data LAIN (bukan baris ini sendiri)
  // dikeluarkan dari pilihan - satu komponen cuma boleh 1 baris (exclusive),
  // dijaga juga di backend, ini cuma supaya kelihatan jelas dari awal.
  const usedElsewhere = new Set(
    lines.filter((l) => l.db_id !== currentLineId).flatMap((l) => l.component_ids),
  );
  const componentOptions: TagOption[] = components
    .filter((c) => c.is_active && !usedElsewhere.has(c.db_id))
    .sort((a, b) => (a.category === b.category ? a.urutan - b.urutan : a.category.localeCompare(b.category)))
    .map((c) => ({
      id: c.db_id, label: c.name, badge: c.category === 'EARNING' ? tt('misc.pendapatan') : tt('misc.potongan'),
      badgeClass: c.category === 'EARNING' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400',
    }));

  // Baris yang boleh dijumlah = baris lain yang urutannya lebih kecil
  // (di ATAS baris ini) - kalau baris baru (belum punya urutan sendiri),
  // semua baris yang sudah ada boleh dipilih.
  const eligibleLines = lines.filter((l) => l.db_id !== currentLineId && (currentUrutan == null || l.urutan < currentUrutan));
  const lineOptions: TagOption[] = eligibleLines.map((l) => ({
    id: l.db_id, label: l.label || `(${tt(ROW_TYPE_LABEL_KEY[l.row_type])})`,
    badge: tt(ROW_TYPE_LABEL_KEY[l.row_type]), badgeClass: ROW_TYPE_BADGE[l.row_type],
  }));

  function setSumSign(lineId: string, sign: 1 | -1) {
    setForm((f) => ({ ...f, sum_sources: f.sum_sources.map((s) => (s.line_id === lineId ? { ...s, sign } : s)) }));
  }

  async function simpan() {
    if (form.row_type !== 'COMPONENT_LIST' && !form.label.trim()) { showToast(tt('msg.semuaFieldWajib'), 'error'); return; }
    if (form.row_type === 'DATA' && form.component_ids.length === 0) { showToast(tt('msg.pilihMinimalSatuKomponen'), 'error'); return; }
    if (form.row_type === 'TOTAL' && form.sum_sources.length === 0) { showToast(tt('msg.pilihMinimalSatuBaris'), 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        row_type: form.row_type, label: form.label.trim(), bold: form.bold, indent: form.indent,
        list_category: form.list_category, list_slip_section: form.list_slip_section || undefined,
        list_kelompok_pajak_bpjs: form.list_kelompok_pajak_bpjs,
        component_ids: form.row_type === 'DATA' ? form.component_ids : undefined,
        sum_sources: form.row_type === 'TOTAL' ? form.sum_sources : undefined,
      };
      if (currentLineId) {
        await updatePayslipTemplateLine(role, currentLineId, payload);
      } else {
        const maxUrutan = Math.max(0, ...lines.map((l) => l.urutan));
        await createPayslipTemplateLine(role, { ...payload, urutan: maxUrutan + 10 });
      }
      showToast(tt('msg.berhasil'));
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tt('msg.gagalMenyimpan'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-3 rounded-lg border border-dashed border-gray-700/50 space-y-3">
      <div>
        <label className="text-[10px] text-gray-500 block mb-1">{tt('col.tipeBaris')}</label>
        <select value={form.row_type} onChange={(e) => setForm((f) => ({ ...blankForm(), row_type: e.target.value as PayslipRowType, label: f.label }))} disabled={!!currentLineId} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500 disabled:opacity-50">
          {(Object.keys(ROW_TYPE_LABEL_KEY) as PayslipRowType[]).map((rt) => <option key={rt} value={rt}>{tt(ROW_TYPE_LABEL_KEY[rt])}</option>)}
        </select>
        <p className="text-[10px] text-gray-500 mt-1">{tt(ROW_TYPE_DESC_KEY[form.row_type])}</p>
      </div>

      {form.row_type !== 'COMPONENT_LIST' && (
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">{tt('col.labelBaris')}</label>
          <input type="text" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
        </div>
      )}

      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 text-[10px] text-gray-300"><input type="checkbox" checked={form.bold} onChange={(e) => setForm((f) => ({ ...f, bold: e.target.checked }))} />{tt('misc.tebal')}</label>
        <label className="flex items-center gap-1.5 text-[10px] text-gray-300"><input type="checkbox" checked={form.indent} onChange={(e) => setForm((f) => ({ ...f, indent: e.target.checked }))} />{tt('misc.menjorok')}</label>
      </div>

      {form.row_type === 'COMPONENT_LIST' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">{tt('col.kategori')}</label>
            <select value={form.list_category} onChange={(e) => setForm((f) => ({ ...f, list_category: e.target.value as 'EARNING' | 'DEDUCTION' }))} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300">
              <option value="EARNING">{tt('misc.pendapatan')}</option>
              <option value="DEDUCTION">{tt('misc.potongan')}</option>
            </select>
          </div>
          {form.list_category === 'EARNING' && (
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">{tt('col.bagianSlip')}</label>
              <select value={form.list_slip_section} onChange={(e) => setForm((f) => ({ ...f, list_slip_section: e.target.value as '' | 'TETAP' | 'TIDAK_TETAP' }))} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300">
                <option value="">{tt('misc.semua')}</option>
                <option value="TETAP">{tt('slip.tetap')}</option>
                <option value="TIDAK_TETAP">{tt('slip.tidakTetap')}</option>
              </select>
            </div>
          )}
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">{tt('misc.kelompokPajakBpjs')}</label>
            <select value={form.list_kelompok_pajak_bpjs} onChange={(e) => setForm((f) => ({ ...f, list_kelompok_pajak_bpjs: e.target.value as PayslipListKelompok }))} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300">
              {(Object.keys(LIST_KELOMPOK_LABEL_KEY) as PayslipListKelompok[]).map((k) => <option key={k} value={k}>{tt(LIST_KELOMPOK_LABEL_KEY[k])}</option>)}
            </select>
          </div>
        </div>
      )}

      {form.row_type === 'DATA' && (
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">{tt('misc.pilihSumberKomponen')}</label>
          <TagPicker options={componentOptions} selected={form.component_ids} onChange={(ids) => setForm((f) => ({ ...f, component_ids: ids }))} placeholder={tt('misc.tambahKomponen')} />
        </div>
      )}

      {form.row_type === 'TOTAL' && (
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">{tt('misc.pilihBarisDijumlah')}</label>
          {lineOptions.length === 0 ? (
            <p className="text-[10px] text-amber-400">{tt('misc.tidakAdaBarisDiAtas')}</p>
          ) : (
            <TagPicker
              options={lineOptions}
              selected={form.sum_sources.map((s) => s.line_id)}
              onChange={(ids) => setForm((f) => ({
                ...f,
                sum_sources: ids.map((id) => f.sum_sources.find((s) => s.line_id === id) || { line_id: id, sign: 1 as const }),
              }))}
              placeholder={tt('misc.tambahBaris')}
              extra={(id) => {
                const src = form.sum_sources.find((s) => s.line_id === id);
                if (!src) return null;
                return (
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setSumSign(id, 1)} className={`px-1.5 rounded text-[10px] ${src.sign === 1 ? 'bg-emerald-600 text-white' : 'bg-dark-850 text-gray-500'}`}>+</button>
                    <button type="button" onClick={() => setSumSign(id, -1)} className={`px-1.5 rounded text-[10px] ${src.sign === -1 ? 'bg-red-600 text-white' : 'bg-dark-850 text-gray-500'}`}>-</button>
                  </div>
                );
              }}
            />
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={simpan} disabled={saving} className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-[11px] font-medium hover:bg-brand-700 disabled:opacity-50"><Save className="w-3 h-3 inline mr-1" />{tt('btn.simpan')}</button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-dark-900 border border-gray-700 text-gray-400 text-[11px] hover:bg-dark-850"><X className="w-3 h-3 inline mr-1" />{tt('btn.batal')}</button>
      </div>
    </div>
  );
}
