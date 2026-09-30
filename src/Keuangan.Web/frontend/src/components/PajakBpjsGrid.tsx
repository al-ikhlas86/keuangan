import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { useToast } from '../contexts/ToastContext';
import { componentShortLabel, lineAmount, payrollColumnBlocks, penggajianYearOptions } from '../lib/payroll';
import { fmt, monthNamesFullId } from '../lib/format';
import { fetchPayrollItemsList, savePayrollItem, type PayrollItemDto, type EmployeeDto, type KelompokPajakBpjs } from '../api';

const inputCls = 'w-full bg-transparent border border-transparent hover:border-gray-700 focus:border-brand-500 focus:bg-dark-900 rounded px-1.5 py-1 text-xs text-gray-300 focus:outline-none text-right';

// Spreadsheet isi-manual bersama utk 3 halaman: Pajak, BPJS Ketenagakerjaan
// (TK), BPJS Kesehatan (K) - masing-masing cuma beda `kelompok` (filter
// komponen edit_role=SUPERVISOR + kelompok_pajak_bpjs). Kolom "Pendapatan"
// murni ACUAN (tidak bisa diedit di sini) - diambil dari total komponen
// Pendapatan yang sudah diisi Admin Keuangan di menu Penggajian, supaya
// Supervisor bisa lihat dasar hitungan sebelum ketik nominal BPJS/Pajak-nya
// sendiri (dihitung di luar sistem, lalu hasilnya diketik di sini - persis
// seperti Excel, sesuai kesepakatan: sistem ini tidak punya rumus otomatis
// utk BPJS/Pajak).
export function PajakBpjsGrid({ kelompok }: { kelompok: KelompokPajakBpjs }) {
  const { tt } = useI18n();
  const { role } = useRole();
  const { data, refetch } = useBootstrap();
  const { showToast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [itemsByEmployee, setItemsByEmployee] = useState<Record<string, PayrollItemDto>>({});
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});

  const period = `${monthNamesFullId[month - 1]} ${year}`;

  async function reload() {
    try {
      const res = await fetchPayrollItemsList(role, period);
      const map: Record<string, PayrollItemDto> = {};
      (res.items || []).forEach((i) => { map[i.employee_id] = i; });
      setItemsByEmployee(map);
    } catch {
      setItemsByEmployee({});
    }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [role, period]);

  if (role !== 'AdminManager') {
    return <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-6 text-center text-xs text-gray-400">{tt('msg.belumAdaData')}</div>;
  }

  const types = data?.payroll_component_types || [];
  const groups = data?.payroll_component_groups || [];
  const earningComponents = payrollColumnBlocks('EARNING', types, groups).flatMap((b) => b.components);
  const kolomKomponen = types
    .filter((c) => c.edit_role === 'SUPERVISOR' && c.is_active && c.kelompok_pajak_bpjs === kelompok)
    .sort((a, b) => a.urutan - b.urutan);
  const aktif = (data?.employees || []).filter((e) => e.is_active);

  function fieldValue(employeeDbId: string, code: string, fallback: number): string {
    const draft = drafts[employeeDbId]?.[code];
    if (draft !== undefined) return draft;
    return fallback ? String(fallback) : '';
  }
  function setDraft(employeeDbId: string, code: string, value: string) {
    setDrafts((d) => ({ ...d, [employeeDbId]: { ...d[employeeDbId], [code]: value } }));
  }

  async function simpanBaris(e: EmployeeDto) {
    const item = itemsByEmployee[e.db_id];
    const lines: Record<string, number> = {};
    kolomKomponen.forEach((c) => {
      lines[c.code] = parseFloat(fieldValue(e.db_id, c.code, item ? lineAmount(item.lines, c.code) : 0)) || 0;
    });
    try {
      await savePayrollItem(role, {
        employee_id: e.db_id, period_label: period, hari_masuk: item?.hari_masuk ?? null,
        keterangan: item?.keterangan ?? '', lines, quantities: {}, overrides: [],
      });
      await reload();
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tt('msg.gagalSimpanDataPajak'), 'error');
    }
  }

  const thBase = 'py-2 px-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap';

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300">
          {monthNamesFullId.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300">
          {penggajianYearOptions(year).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {kolomKomponen.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6">{tt('msg.belumAdaKomponenKelompok')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700/50">
          <table className="w-full text-xs border-collapse">
            <thead><tr className="border-b border-gray-700/50 bg-dark-900/60">
              <th className={thBase}>{tt('col.nama')}</th>
              <th className={`${thBase} text-right`}>{tt('misc.pendapatanAcuan')}</th>
              {kolomKomponen.map((c) => <th key={c.code} className={`${thBase} text-right`} title={c.name}>{componentShortLabel(c)}</th>)}
              <th className={`${thBase} text-center`}>{tt('col.statusBayar')}</th>
            </tr></thead>
            <tbody>
              {aktif.length ? aktif.map((e) => {
                const item = itemsByEmployee[e.db_id];
                const isPaid = !!item?.is_paid;
                const pendapatan = item ? earningComponents.reduce((a, c) => a + lineAmount(item.lines, c.code), 0) : 0;
                return (
                  <tr key={e.db_id} className="border-t border-gray-700/30 hover:bg-dark-850/50">
                    <td className="px-2 py-1.5 font-medium text-white whitespace-nowrap">{e.nama}</td>
                    <td className="px-2 py-1.5 text-right text-gray-400 whitespace-nowrap">{fmt(pendapatan)}</td>
                    {kolomKomponen.map((c) => (
                      <td key={c.code} className="px-1 py-1">
                        <input type="number" value={fieldValue(e.db_id, c.code, item ? lineAmount(item.lines, c.code) : 0)} onChange={(ev) => setDraft(e.db_id, c.code, ev.target.value)}
                          onBlur={() => simpanBaris(e)} onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
                          placeholder="0" disabled={isPaid} className={`${inputCls} ${isPaid ? 'opacity-50' : ''}`} />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-center">{isPaid && <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">{tt('status.sudahDibayar')}</span>}</td>
                  </tr>
                );
              }) : <tr><td colSpan={kolomKomponen.length + 3} className="py-4 text-center text-gray-400">{tt('msg.belumAdaData')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
