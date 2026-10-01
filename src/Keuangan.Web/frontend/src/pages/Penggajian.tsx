import { useEffect, useState } from 'react';
import { User, X, Pencil } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { ExportBtn, PrintBtn } from '../components/Buttons';
import { PayrollFieldsForm } from '../components/PayrollFieldsForm';
import { componentShortLabel, lineAmount, payrollColumnBlocks, penggajianPeriodLabel, penggajianYearOptions } from '../lib/payroll';
import { fmt, monthNamesFullId, downloadExcel } from '../lib/format';
import { fetchPayrollItemsList, type PayrollItemDto } from '../api';

const LANDSCAPE_STYLE = `@page{size:A4 landscape;margin:0.2in;}
  @media print{
    #penggajianTableWrap table{font-size:8px!important;}
    #penggajianTableWrap th,#penggajianTableWrap td{padding:2px 4px!important;white-space:normal!important;border:1px solid #999!important;}
  }`;

// Mirror renderPenggajian()/renderPenggajianTable() (index.html:1910-2283) - versi
// dirombak: Penggajian sekarang HANYA tempat Admin Keuangan menyusun rincian gaji
// (komponen earning + potongan non-pajak), tidak lagi bisa membayar atau mencetak
// slip di sini, dan tidak lagi menampilkan kolom pajak/BPJS (komponen edit_role
// SUPERVISOR) sama sekali - itu semua sekarang murni urusan halaman Bayar Gaji
// (lihat BayarGaji.tsx), sesuai keputusan eksplisit: "penggajian khusus admin
// keuangan ngisi data gajinya tapi belum langsung dibayarkan di menu ini".
export function Penggajian() {
  const { tt } = useI18n();
  const { role, openEmployeeProfile, navigateTo } = useRole();
  const { data } = useBootstrap();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [itemsByEmployee, setItemsByEmployee] = useState<Record<string, PayrollItemDto>>({});
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);

  const period = penggajianPeriodLabel(year, month);
  const isAdminOrStaff = role === 'AdminManager' || role === 'Staff';

  useEffect(() => {
    let cancelled = false;
    fetchPayrollItemsList(role, period).then((res) => {
      if (cancelled) return;
      const map: Record<string, PayrollItemDto> = {};
      (res.items || []).forEach((i) => { map[i.employee_id] = i; });
      setItemsByEmployee(map);
    }).catch(() => { if (!cancelled) setItemsByEmployee({}); });
    return () => { cancelled = true; };
  }, [role, period, data]);

  useEffect(() => {
    const el = document.getElementById('dynamicPageStyle');
    if (el) el.textContent = LANDSCAPE_STYLE;
  }, []);

  const types = data?.payroll_component_types || [];
  const groups = data?.payroll_component_groups || [];
  const earningBlocks = payrollColumnBlocks('EARNING', types, groups);
  // Komponen edit_role SUPERVISOR (pajak/BPJS, lihat PajakBpjsPegawai.tsx) SENGAJA
  // dikeluarkan dari sini - Admin Keuangan tidak pernah bisa mengedit komponen itu
  // di halaman ini (selalu read-only), jadi menyembunyikannya tidak menghilangkan
  // kemampuan apa pun, cuma menghindari kebingungan "kok ada tabel pajak di sini".
  const deductionBlocks = payrollColumnBlocks('DEDUCTION', types.filter((c) => c.edit_role !== 'SUPERVISOR'), groups);
  const earningComponents = earningBlocks.flatMap((b) => b.components);
  const deductionComponents = deductionBlocks.flatMap((b) => b.components);
  const employees = data?.employees || [];
  const aktif = employees.filter((e) => e.is_active);
  const tetap = aktif.filter((e) => e.tipe === 'Tetap');
  const honor = aktif.filter((e) => e.tipe !== 'Tetap');
  const sudahFinalisasi = aktif.some((e) => itemsByEmployee[e.db_id]?.is_paid);

  async function reload() {
    const res = await fetchPayrollItemsList(role, period);
    const map: Record<string, PayrollItemDto> = {};
    (res.items || []).forEach((i) => { map[i.employee_id] = i; });
    setItemsByEmployee(map);
  }

  const exportExcel = () => {
    const rows = aktif.map((e) => {
      const item = itemsByEmployee[e.db_id];
      const lines = item?.lines || {};
      const jumlah = earningComponents.reduce((a, c) => a + lineAmount(lines, c.code), 0);
      const potongan = deductionComponents.reduce((a, c) => a + lineAmount(lines, c.code), 0);
      return [e.id, e.nama, e.jabatan, jumlah, potongan, jumlah - potongan];
    });
    downloadExcel('penggajian', ['ID', 'Nama', 'Jabatan', 'Jumlah', 'Potongan', 'Subtotal'], rows);
  };

  function Row({ e, no }: { e: (typeof aktif)[number]; no: number }) {
    const item = itemsByEmployee[e.db_id];
    const lines = item?.lines || {};
    const jumlah = earningComponents.reduce((a, c) => a + lineAmount(lines, c.code), 0);
    const potongan = deductionComponents.reduce((a, c) => a + lineAmount(lines, c.code), 0);
    const subtotal = jumlah - potongan;
    const isPaid = !!item?.is_paid;
    const isEditing = inlineEditId === e.db_id;
    const tdBase = 'py-2 px-2 whitespace-nowrap';
    return (
      <>
        <tr className="border-b border-gray-700/30 hover:bg-dark-850/50">
          <td className={`${tdBase} text-gray-400`}>{no}</td>
          <td className={`${tdBase} font-medium text-white`}><button onClick={() => { openEmployeeProfile(e.db_id); navigateTo('pegawai_detail'); }} className="hover:underline hover:text-brand-400 text-left">{e.nama}</button></td>
          <td className={`${tdBase} text-gray-400`}>{e.jabatan}</td>
          {earningComponents.map((c) => <td key={c.code} className={`${tdBase} text-right ${isPaid ? 'text-white' : 'text-emerald-400'}`}>{lineAmount(lines, c.code) ? fmt(lineAmount(lines, c.code)) : <span className="text-gray-400">-</span>}</td>)}
          <td className={`${tdBase} text-center border-l border-gray-700/50`}>{item?.hari_masuk != null ? item.hari_masuk : <span className="text-gray-400">-</span>}</td>
          <td className={`${tdBase} text-right font-semibold text-white border-l border-gray-700/50`}>{fmt(jumlah)}</td>
          {deductionComponents.map((c) => <td key={c.code} className={`${tdBase} text-right text-red-400`}>{lineAmount(lines, c.code) ? fmt(lineAmount(lines, c.code)) : <span className="text-gray-400">-</span>}</td>)}
          <td className={`${tdBase} text-right font-bold text-white border-l border-gray-700/50`}>{fmt(subtotal)}</td>
          <td className={tdBase}>
            {isPaid ? <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">{tt('status.sudahDibayar')}</span>
              : item ? <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400">{tt('status.draft')}</span>
              : <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-500/20 text-gray-400">-</span>}
          </td>
          <td className={`${tdBase} no-print`}>
            <div className="flex gap-1">
              {!isPaid && isAdminOrStaff && <button onClick={() => setInlineEditId(isEditing ? null : e.db_id)} className="p-1.5 rounded btn-icon-edit" title={tt('btn.edit')}>{isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}</button>}
              <button onClick={() => { openEmployeeProfile(e.db_id); navigateTo('pegawai_detail'); }} className="p-1.5 rounded bg-dark-900 border border-gray-700 text-gray-400 hover:text-white" title={tt('btn.lihatProfil')}><User className="w-3.5 h-3.5" /></button>
            </div>
          </td>
        </tr>
        {isEditing && (
          <tr className="bg-dark-900/40 no-print"><td colSpan={99} className="p-4">
            <PayrollFieldsForm employee={e} year={year} month={month} initialData={item ? { hari_masuk: item.hari_masuk, keterangan: item.keterangan, lines: item.lines } : { hari_masuk: null, keterangan: '', lines: {} }}
              onSaved={async () => { await reload(); setInlineEditId(null); }} />
          </td></tr>
        )}
      </>
    );
  }

  return (
    <div className="print-sheet bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-bold text-white">{tt('heading.dataPenggajian')}</h3>
        <div className="flex gap-2 no-print"><ExportBtn onClick={exportExcel} /><PrintBtn label="Penggajian" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4 no-print">
        <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300">
          {monthNamesFullId.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300">
          {penggajianYearOptions(year).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div id="penggajianTableWrap">
        <p className="text-[10px] text-gray-400 mb-3">
          {tt('misc.periode')}: {period} {sudahFinalisasi && <span className="text-emerald-400 font-semibold">({tt('status.sudahDibayar')})</span>}
          {' - '}{tt('misc.rincianPajakBpjsDiBayarGaji')}
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-700/50">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-700/30 text-gray-400 text-left bg-dark-900/60">
                <th className="pb-2 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide" rowSpan={2}>No</th>
                <th className="pb-2 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide" rowSpan={2}>{tt('col.nama')}</th>
                <th className="pb-2 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide" rowSpan={2}>{tt('col.jabatan')}</th>
                {earningBlocks.map((b, i) => b.type === 'group'
                  ? <th key={i} className="pb-2 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-center border-b border-gray-700/50" colSpan={b.components.length}>{b.group.name}</th>
                  : <th key={i} className="pb-2 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-right" rowSpan={2} title={b.components[0].name}>{componentShortLabel(b.components[0])}</th>)}
                <th className="pb-2 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-center border-l border-gray-700/50" rowSpan={2}>{tt('col.hari')}</th>
                <th className="pb-2 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-right border-l border-gray-700/50" rowSpan={2}>{tt('col.jumlah')}</th>
                {deductionBlocks.map((b, i) => b.type === 'group'
                  ? <th key={i} className="pb-2 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-center border-b border-gray-700/50" colSpan={b.components.length}>{b.group.name}</th>
                  : <th key={i} className="pb-2 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-right" rowSpan={2} title={b.components[0].name}>{componentShortLabel(b.components[0])}</th>)}
                <th className="pb-2 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-right border-l border-gray-700/50" rowSpan={2}>{tt('misc.subtotal')}</th>
                <th className="pb-2 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide" rowSpan={2}>{tt('col.statusBayar')}</th>
                <th className="pb-2 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide no-print" rowSpan={2}>{tt('col.aksi')}</th>
              </tr>
              <tr className="border-b border-gray-700/50 text-gray-400 text-left bg-dark-900/60">
                {earningBlocks.filter((b) => b.type === 'group').flatMap((b) => b.components).map((c) => <th key={c.code} className="pb-2 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-right" title={c.name}>{componentShortLabel(c)}</th>)}
                {deductionBlocks.filter((b) => b.type === 'group').flatMap((b) => b.components).map((c) => <th key={c.code} className="pb-2 px-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-right" title={c.name}>{componentShortLabel(c)}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-dark-900/40"><td colSpan={99} className="py-1.5 px-2 font-bold text-[10px] text-gray-400 uppercase">{tt('misc.karyawanGuruTetap')}</td></tr>
              {tetap.length ? tetap.map((e, i) => <Row key={e.db_id} e={e} no={i + 1} />) : <tr><td colSpan={99} className="py-4 text-center text-gray-400">{tt('msg.belumAdaData')}</td></tr>}
              <tr className="bg-dark-900/40"><td colSpan={99} className="py-1.5 px-2 font-bold text-[10px] text-gray-400 uppercase">{tt('misc.guruKaryawanHonor')}</td></tr>
              {honor.length ? honor.map((e, i) => <Row key={e.db_id} e={e} no={i + 1} />) : <tr><td colSpan={99} className="py-4 text-center text-gray-400">{tt('msg.belumAdaData')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
