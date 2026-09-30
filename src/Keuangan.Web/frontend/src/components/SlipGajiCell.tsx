import { Fragment } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { lineAmount, lineQuantity, payrollResolveRate } from '../lib/payroll';
import { fmt } from '../lib/format';
import { DEFAULT_FOUNDATION_NAME } from '../lib/consts';
import type { PayrollItemDto, PayrollComponentTypeDto, EmployeeDto, OfficialDto, PayslipTemplateLineDto } from '../api';

// Mirror resolvePengurusSignature() (index.html:2985-2989).
export function resolvePengurusSignature(officials: OfficialDto[], isAdmin: boolean): { name: string; jabatan: string } {
  const jabatanKey = isAdmin ? 'spv. keuangan' : 'adm. keuangan';
  const found = officials.find((o) => (o.jabatan || '').toLowerCase().includes(jabatanKey));
  return found ? { name: found.name, jabatan: found.jabatan } : { name: '-', jabatan: isAdmin ? 'Spv. Keuangan' : 'Adm. Keuangan' };
}

// Badan slip (antara kop & tanda tangan, keduanya TETAP hardcode di bawah -
// lihat penutup fungsi ini) dirender DINAMIS dari PayslipTemplateLine (menu
// Kelola Slip Gaji) - bukan lagi hardcode JSX. PENTING: ini SEMATA-MATA
// tampilan - nominal yang dipakai persis lineAmount() dari PayrollItemLine
// yang sudah ada (sumber kebenaran yang sama dipakai payroll_period_finalize_api
// utk transfer sungguhan), template cuma menentukan baris mana ditampilkan
// dengan label apa dan urutan apa - tidak pernah menghitung ulang/mengubah
// nominal itu sendiri.
//
// Komponen yang SUDAH DINONAKTIFKAN (mis. hasil reorganisasi BPJS TK jadi
// JKK/JKM/JHT/JPN terpisah) TETAP dimasukkan ke daftar COMPONENT_LIST kalau
// item INI masih punya nominal tercatat di situ - supaya slip lama (yang
// sudah dibayar sebelum reorganisasi) tetap tercetak identik dengan aslinya,
// tidak diam-diam kehilangan baris.
export function SlipGajiCell({ item, employee, periodLabel, slipNo, isAdmin }: { item: PayrollItemDto; employee: EmployeeDto; periodLabel: string; slipNo: string; isAdmin: boolean }) {
  const { tt } = useI18n();
  const { data } = useBootstrap();
  const lines = item.lines || {};
  const types = data?.payroll_component_types || [];
  const template = [...(data?.payslip_template || [])].sort((a, b) => a.urutan - b.urutan);
  const componentsById: Record<string, PayrollComponentTypeDto> = {};
  types.forEach((c) => { componentsById[c.db_id] = c; });

  type Expanded = { component: PayrollComponentTypeDto; amount: number };
  interface Computed { line: PayslipTemplateLineDto; value: number; expanded: Expanded[] }

  const valueByLineId: Record<string, number> = {};
  const computed: Computed[] = template.map((line) => {
    let value = 0;
    let expanded: Expanded[] = [];
    if (line.row_type === 'COMPONENT_LIST') {
      const kelompokFilter = line.list_kelompok_pajak_bpjs;
      expanded = types
        .filter((c) => c.category === line.list_category)
        .filter((c) => !line.list_slip_section || c.slip_section === line.list_slip_section)
        .filter((c) => {
          if (!kelompokFilter) return true;
          if (kelompokFilter === 'REGULAR') return !c.kelompok_pajak_bpjs;
          if (kelompokFilter === 'PAJAK_BPJS') return !!c.kelompok_pajak_bpjs;
          return c.kelompok_pajak_bpjs === kelompokFilter;
        })
        .filter((c) => c.is_active || lineAmount(lines, c.code) !== 0)
        .sort((a, b) => a.urutan - b.urutan)
        .map((c) => ({ component: c, amount: lineAmount(lines, c.code) }));
      value = expanded.reduce((a, e) => a + e.amount, 0);
    } else if (line.row_type === 'DATA') {
      value = line.component_ids.reduce((a, id) => {
        const comp = componentsById[id];
        return a + (comp ? lineAmount(lines, comp.code) : 0);
      }, 0);
    } else if (line.row_type === 'TOTAL') {
      value = line.sum_sources.reduce((a, s) => a + s.sign * (valueByLineId[s.line_id] || 0), 0);
    }
    valueByLineId[line.db_id] = value;
    return { line, value, expanded };
  });

  const sig = resolvePengurusSignature(data?.officials || [], isAdmin);
  const foundationName = data?.org_profile?.foundation_name || DEFAULT_FOUNDATION_NAME;
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  function ComponentRow({ c, amount }: { c: PayrollComponentTypeDto; amount: number }) {
    const qty = lineQuantity(lines, c.code);
    let rumus = '';
    if ((c.calc_mode === 'AUTO_HARI' || c.calc_mode === 'AUTO_OWN') && qty != null) {
      rumus = `${qty} x ${fmt(payrollResolveRate(c, employee))}`;
    }
    return (
      <tr>
        <td className="py-[1px] pl-3">{c.name}</td>
        <td className="py-[1px] text-right text-[7px] text-gray-500 whitespace-nowrap slip-gaji-rumus">{rumus}</td>
        <td className="py-[1px] pr-1 whitespace-nowrap slip-gaji-rumus">:</td>
        <td className="py-[1px] text-right whitespace-nowrap slip-gaji-rumus">{fmt(amount)}</td>
      </tr>
    );
  }

  return (
    <div className="slip-gaji-cell text-[9px] leading-snug text-black">
      <div className="text-center mb-1.5">
        <p className="font-bold">{foundationName.toUpperCase()}</p>
        <p className="font-semibold">{tt('heading.slipGajiKaryawan').toUpperCase()}</p>
        <p>{tt('misc.periode').toUpperCase()}: {periodLabel.toUpperCase()}</p>
        {slipNo && <p className="text-[8px]">{tt('misc.nomorSlip')}: {slipNo}</p>}
      </div>
      <table className="w-full mb-1.5"><tbody>
        <tr><td className="w-1/2">{tt('col.nama').toUpperCase()} : {employee.nama}</td><td>NRP : {employee.id}</td></tr>
        <tr><td></td><td>NPWP : -</td></tr>
      </tbody></table>
      <table className="w-full border-collapse">
        <colgroup><col /><col className="w-16" /><col className="w-3" /><col className="w-24" /></colgroup>
        <tbody>
          {computed.map(({ line, value, expanded }, i) => {
            const isLast = i === computed.length - 1;
            if (line.row_type === 'HEADING') {
              return (
                <tr key={line.db_id}>
                  <td colSpan={4} className={`${line.bold ? 'font-bold' : ''} pt-1 ${line.indent ? 'pl-1' : ''}`}>{line.label}</td>
                </tr>
              );
            }
            if (line.row_type === 'COMPONENT_LIST') {
              return (
                <Fragment key={line.db_id}>
                  {expanded.length
                    ? expanded.map((e) => <ComponentRow key={e.component.db_id} c={e.component} amount={e.amount} />)
                    : <tr><td colSpan={4} className="pl-3 text-gray-500">-</td></tr>}
                </Fragment>
              );
            }
            // DATA / TOTAL - satu baris angka
            const strong = line.row_type === 'TOTAL' && line.bold;
            return (
              <tr key={line.db_id} className={`${line.row_type === 'TOTAL' ? 'border-t border-gray-500' : ''} ${strong ? 'font-bold' : ''} ${isLast ? 'border-t-2 border-b-2 border-black py-1.5' : ''}`}>
                <td className={`py-[1px] ${isLast ? 'py-1.5' : ''}`} colSpan={3}>{line.label}</td>
                <td className={`py-[1px] text-right whitespace-nowrap slip-gaji-rumus ${isLast ? 'py-1.5' : ''}`}>{fmt(value)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <table className="w-full mt-4"><tbody>
        <tr><td className="w-1/2 text-center"></td><td className="text-center">{today}</td></tr>
        <tr><td className="text-center">{tt('misc.penerima')}</td><td className="text-center">{foundationName}</td></tr>
        <tr><td className="h-10"></td><td className="h-10"></td></tr>
        <tr>
          <td className="text-center align-top">{employee.nama}</td>
          <td className="text-center align-top">{sig.name}<br /><span className="text-[8px]">{sig.jabatan}</span></td>
        </tr>
      </tbody></table>
    </div>
  );
}
