// Disalin verbatim dari helper format/kalkulasi index.html (fmt, monthNamesId,
// monthNamesFullId, computeMonthlyTrend, aggregateByAccount, downloadCsv).
export function fmt(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
}

export const monthNamesId = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const monthNamesFullId = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Filter tabel siswa (Data Siswa/Sudah Lunas/Belum Lunas/Arsip) berdasarkan
// nama atau NIS - dipakai bareng kolom pencarian di halaman-halaman itu.
export function filterStudentsByQuery<T extends { nama: string; nis: string }>(students: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return students;
  return students.filter((s) => s.nama.toLowerCase().includes(q) || s.nis.toLowerCase().includes(q));
}

// Kebalikan dari penggajianPeriodLabel() (lib/payroll.ts) - "Juli 2026" -> {year:2026,month:7}.
// Mirror apps/finance/recurring_billing.py parse_period_label() persis.
export function parsePeriodLabel(label: string): { year: number; month: number } | null {
  const parts = label.trim().split(' ');
  if (parts.length < 2) return null;
  const year = parseInt(parts[parts.length - 1], 10);
  const monthName = parts.slice(0, -1).join(' ');
  const month = monthNamesFullId.indexOf(monthName) + 1;
  if (!year || !month) return null;
  return { year, month };
}

export interface Trend { key: string; label: string; masuk: number; keluar: number }

export function computeMonthlyTrend(transactions: { tgl?: string; jenis: string; jumlah: number }[]): Trend[] {
  const map: Record<string, { masuk: number; keluar: number }> = {};
  transactions.forEach((t) => {
    const key = (t.tgl || '').slice(0, 7);
    if (!key) return;
    if (!map[key]) map[key] = { masuk: 0, keluar: 0 };
    if (t.jenis === 'Masuk') map[key].masuk += t.jumlah;
    else map[key].keluar += t.jumlah;
  });
  return Object.keys(map)
    .sort()
    .slice(-6)
    .map((key) => ({
      key,
      label: monthNamesId[parseInt(key.split('-')[1], 10) - 1] || key,
      masuk: map[key].masuk,
      keluar: map[key].keluar,
    }));
}

export interface Account { code: string; account_type: string }
export interface JournalLine { account_code: string; account_name: string; debit: number; credit: number }
export interface JournalEntry { lines?: JournalLine[]; payment_method?: string }

export function aggregateByAccount(entries: JournalEntry[], accounts: Account[], accountType: 'INCOME' | 'EXPENSE') {
  const accByCode: Record<string, Account> = {};
  accounts.forEach((a) => { accByCode[a.code] = a; });
  const totals: Record<string, number> = {};
  entries.forEach((entry) => {
    (entry.lines || []).forEach((line) => {
      const acc = accByCode[line.account_code];
      if (!acc || acc.account_type !== accountType) return;
      const amount = accountType === 'INCOME' ? line.credit : line.debit;
      if (!amount) return;
      const label = `${line.account_name}${entry.payment_method ? ` (${entry.payment_method})` : ''}`;
      totals[label] = (totals[label] || 0) + amount;
    });
  });
  return Object.entries(totals).map(([label, value]) => ({ label, value }));
}

// Mirror fmtDateISO()/filterTransactionsByPeriod() (index.html:1115-1185).
export function fmtDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function filterTransactionsByPeriod<T extends { txDate: string }>(transactions: T[], st: { period: string; from: string; to: string }): T[] {
  const now = new Date();
  const todayStr = fmtDateISO(now);
  if (st.period === 'custom') {
    return transactions.filter((t) => {
      if (st.from && t.txDate < st.from) return false;
      if (st.to && t.txDate > st.to) return false;
      return true;
    });
  }
  if (st.period === 'hari') return transactions.filter((t) => t.txDate === todayStr);
  if (st.period === 'minggu') {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    const mondayStr = fmtDateISO(monday);
    return transactions.filter((t) => t.txDate >= mondayStr && t.txDate <= todayStr);
  }
  if (st.period === 'bulan') {
    const ym = todayStr.slice(0, 7);
    return transactions.filter((t) => t.txDate.slice(0, 7) === ym);
  }
  if (st.period === 'tahun') {
    const y = todayStr.slice(0, 4);
    return transactions.filter((t) => t.txDate.slice(0, 4) === y);
  }
  return transactions;
}

// Mirror formatTanggalPanjang() (index.html:1260-1265).
export function formatTanggalPanjang(isoDate: string): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return isoDate;
  return `${String(d).padStart(2, '0')} ${monthNamesFullId[m - 1] || m} ${y}`;
}

// Mirror terbilang() (index.html:1267-1285).
export function terbilang(n: number): string {
  n = Math.floor(Math.abs(Number(n) || 0));
  const satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  function toWords(num: number): string {
    if (num < 12) return satuan[num];
    if (num < 20) return toWords(num - 10) + ' belas';
    if (num < 100) return toWords(Math.floor(num / 10)).trim() + ' puluh' + (num % 10 !== 0 ? ' ' + toWords(num % 10) : '');
    if (num < 200) return 'seratus' + (num % 100 !== 0 ? ' ' + toWords(num % 100) : '');
    if (num < 1000) return toWords(Math.floor(num / 100)).trim() + ' ratus' + (num % 100 !== 0 ? ' ' + toWords(num % 100) : '');
    if (num < 2000) return 'seribu' + (num % 1000 !== 0 ? ' ' + toWords(num % 1000) : '');
    if (num < 1000000) return toWords(Math.floor(num / 1000)).trim() + ' ribu' + (num % 1000 !== 0 ? ' ' + toWords(num % 1000) : '');
    if (num < 1000000000) return toWords(Math.floor(num / 1000000)).trim() + ' juta' + (num % 1000000 !== 0 ? ' ' + toWords(num % 1000000) : '');
    if (num < 1000000000000) return toWords(Math.floor(num / 1000000000)).trim() + ' miliar' + (num % 1000000000 !== 0 ? ' ' + toWords(num % 1000000000) : '');
    return toWords(Math.floor(num / 1000000000000)).trim() + ' triliun' + (num % 1000000000000 !== 0 ? ' ' + toWords(num % 1000000000000) : '');
  }
  if (n === 0) return 'Nol rupiah';
  const words = toWords(n).replace(/\s+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1) + ' rupiah';
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][], onDone?: () => void) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(',')];
  rows.forEach((row) => lines.push(row.map(esc).join(',')));
  const csvContent = '﻿' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  onDone?.();
}
