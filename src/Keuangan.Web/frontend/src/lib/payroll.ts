import type { PayrollComponentTypeDto, PayrollComponentGroupDto, PayrollLineDto, EmployeeDto } from '../api';
import { monthNamesFullId } from './format';

// Jenjang pendidikan - dipakai tarif komponen per jenjang & form pegawai (kode, label).
export const PAYROLL_EDUCATION_LEVELS: [string, string][] = [['SMA', 'SMA/SMK'], ['D3', 'D3'], ['S1', 'S1'], ['S2', 'S2'], ['S3', 'S3']];
export const EMPLOYEE_TYPES = ['Tetap', 'Honorer', 'Kontrak'];

// Port lib/payroll.ts Akuntansi - lineAmount/lineQuantity/lineIsOverride/componentShortLabel dst.
export function lineAmount(lines: Record<string, PayrollLineDto>, code: string): number {
  const l = lines[code];
  return l && l.amount != null ? l.amount : 0;
}
export function lineQuantity(lines: Record<string, PayrollLineDto>, code: string): number | null {
  const l = lines[code];
  return l && l.quantity != null ? l.quantity : null;
}
export function lineIsOverride(lines: Record<string, PayrollLineDto>, code: string): boolean {
  const l = lines[code];
  return !!(l && l.is_manual_override);
}

export function componentShortLabel(c: PayrollComponentTypeDto): string {
  if (c.short_label) return c.short_label;
  return c.name.length > 14 ? c.name.slice(0, 13) + '…' : c.name;
}

export function payrollResolveRate(c: PayrollComponentTypeDto, employee: EmployeeDto | undefined): number {
  const r = (c.rates || {})[employee ? employee.pendidikan : ''];
  return r != null ? r : (c.default_rate || 0);
}
export function payrollComputeAmount(c: PayrollComponentTypeDto, employee: EmployeeDto | undefined, qty: number | string): number {
  return (parseFloat(String(qty)) || 0) * payrollResolveRate(c, employee);
}

export type PayrollBlock =
  | { type: 'group'; urutan: number; group: PayrollComponentGroupDto; components: PayrollComponentTypeDto[] }
  | { type: 'single'; urutan: number; components: PayrollComponentTypeDto[] };

export function payrollColumnBlocks(category: 'EARNING' | 'DEDUCTION', types: PayrollComponentTypeDto[], groups: PayrollComponentGroupDto[]): PayrollBlock[] {
  const blocks: PayrollBlock[] = [];
  groups.filter((g) => g.category === category && g.is_active).forEach((g) => {
    const comps = types.filter((c) => c.category === category && c.is_active && c.group_id === g.db_id);
    if (comps.length) blocks.push({ type: 'group', urutan: g.urutan, group: g, components: comps });
  });
  types.filter((c) => c.category === category && c.is_active && !c.group_id).forEach((c) => {
    blocks.push({ type: 'single', urutan: c.urutan, components: [c] });
  });
  blocks.sort((a, b) => a.urutan - b.urutan);
  return blocks;
}
export function payrollFlatComponents(category: 'EARNING' | 'DEDUCTION', types: PayrollComponentTypeDto[], groups: PayrollComponentGroupDto[]): PayrollComponentTypeDto[] {
  return payrollColumnBlocks(category, types, groups).flatMap((b) => b.components);
}

export function penggajianPeriodLabel(year: number, month: number): string {
  return `${monthNamesFullId[month - 1]} ${year}`;
}
export function penggajianYearOptions(currentSelectedYear: number | null): number[] {
  const now = new Date().getFullYear();
  const years = new Set<number>();
  for (let y = now - 2; y <= now + 1; y++) years.add(y);
  if (currentSelectedYear) years.add(currentSelectedYear);
  return [...years].sort((a, b) => a - b);
}
export function prevPeriodPenggajian(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}
