// apiFetch versi Keuangan.exe - BEDA TOTAL dari versi Django/Akuntansi lama
// (yang disalin ke sini sbg titik awal lalu diganti): backend sekarang
// ASP.NET Core dgn cookie-auth sungguhan (bukan CSRF+X-Source-Role bebas),
// semua endpoint membalas amplop `{success, data?, message?}`, dan field
// JSON camelCase (default Microsoft.AspNetCore.Http.Json), BUKAN snake_case
// gaya Django. Lihat DeveloperModeMiddleware.cs utk kenapa X-Dev-Role ada.
import type { RoleKey } from './menus';

let currentDevRole: RoleKey | null = null;
// Dipanggil AuthContext/RoleProvider tiap role dropdown mode developer
// berubah - HANYA berefek kalau backend memang mode "developer" (server/klien
// mengabaikan header ini sepenuhnya, lihat DeveloperModeMiddleware.cs).
export function setDevRole(role: RoleKey | null) {
  currentDevRole = role;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface ApiEnvelope<T> { success: boolean; data?: T; message?: string }

export async function apiFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> | undefined) };
  if (currentDevRole) headers['X-Dev-Role'] = currentDevRole;

  const res = await fetch(url, { credentials: 'include', ...options, headers });
  const text = await res.text();
  let body: ApiEnvelope<T> | null = null;
  if (text) {
    try { body = JSON.parse(text); } catch { /* balasan bukan JSON (mis. 401 polos tanpa body) */ }
  }

  if (!res.ok) {
    throw new ApiError(body?.message || text || `HTTP ${res.status}`, res.status);
  }
  if (body && typeof body === 'object' && 'success' in body) {
    if (!body.success) throw new ApiError(body.message || 'Permintaan gagal.', res.status);
    return (body.data !== undefined ? body.data : body) as T;
  }
  return body as T;
}

// Unggah/unduh berkas (apiFetch selalu JSON) - header X-Dev-Role tetap dikirim, Content-Type
// SENGAJA tidak diset utk FormData (browser mengisi boundary sendiri).
async function apiRaw(url: string, options: RequestInit): Promise<Response> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };
  if (currentDevRole) headers['X-Dev-Role'] = currentDevRole;
  const res = await fetch(url, { credentials: 'include', ...options, headers });
  if (!res.ok) {
    let pesan = `HTTP ${res.status}`;
    try { const b = await res.json(); if (b?.message) pesan = b.message; } catch { /* bukan JSON */ }
    throw new ApiError(pesan, res.status);
  }
  return res;
}

async function apiUpload<T>(url: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await apiRaw(url, { method: 'POST', body: fd });
  const body = await res.json();
  if (body && typeof body === 'object' && 'success' in body && !body.success) throw new ApiError(body.message || 'Permintaan gagal.', res.status);
  return body as T; // amplop penuh {success, message?, data}
}

// ---- Nomor VA massal (lihat VaEndpoints.cs) ----
export interface VaImportSummary {
  barisData: number; isi: number; ganti: number; tambah: number; sama: number; error: number; peringatan: number;
  daftarGanti: { nama: string; nis: string; lama: string | null; baru: string }[];
  masalah: { baris: number; nama: string | null; nis: string | null; level: 'error' | 'peringatan'; pesan: string }[];
  totalMasalah: number;
}
export async function downloadVaTemplate(hubIds: number[]) {
  const res = await apiRaw('/api/students/va-template', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hubIds }),
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `template-va-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
export async function previewVaImport(file: File): Promise<VaImportSummary> {
  return (await apiUpload<{ data: VaImportSummary }>('/api/students/va-import/preview', file)).data;
}
export async function commitVaImport(file: File): Promise<{ message: string; data: VaImportSummary }> {
  const r = await apiUpload<{ message: string; data: VaImportSummary }>('/api/students/va-import/commit', file);
  return { message: r.message, data: r.data };
}
export function addStudentVa(id: number, vaNumber: string) {
  return apiFetch<null>(`/api/students/${id}/va`, { method: 'POST', body: JSON.stringify({ vaNumber }) });
}
export function deleteStudentVa(id: number, vaId: number) {
  return apiFetch<null>(`/api/students/${id}/va/${vaId}`, { method: 'DELETE' });
}
export function promoteStudentVa(id: number, vaId: number) {
  return apiFetch<null>(`/api/students/${id}/va/${vaId}/jadikan-utama`, { method: 'POST' });
}

// ---- Auth (BARU - Akuntansi lama tidak punya login sungguhan sama sekali) ----
export type InstallMode = 'developer' | 'server' | 'klien';
export function fetchAuthMode() {
  return apiFetch<{ mode: InstallMode }>('/api/auth/mode');
}
export function fetchSetupStatus() {
  return apiFetch<{ needsSetup: boolean }>('/api/auth/setup-status');
}
export function setupFirstAdmin(fullName: string, username: string, password: string) {
  return apiFetch<{ message?: string }>('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify({ fullName, username, password }),
  });
}
export interface CurrentUser { id: string; username: string; fullName: string; role: RoleKey }
export function login(username: string, password: string) {
  return apiFetch<CurrentUser>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}
export function logout() {
  return apiFetch<null>('/api/auth/logout', { method: 'POST' });
}
export function fetchMe() {
  return apiFetch<CurrentUser>('/api/auth/me');
}

// ---- Kelola Pengguna (GANTI Peran.tsx lama - akun+role tetap, bukan matrix izin) ----
export interface UserAccountDto { id: number; username: string; fullName: string; role: RoleKey; isActive: boolean; createdAt: string }
export function fetchUsers() {
  return apiFetch<UserAccountDto[]>('/api/users/');
}
export function createUser(input: { fullName: string; username: string; password: string; role: RoleKey }) {
  return apiFetch<{ id: number }>('/api/users/', { method: 'POST', body: JSON.stringify(input) });
}
export function updateUser(id: number, input: { fullName?: string; role?: RoleKey; isActive?: boolean; newPassword?: string }) {
  return apiFetch<{ message: string }>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

// ---- Chart of Accounts ----
export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
export type NormalBalance = 'Debit' | 'Credit';
export interface AccountDto { id: number; code: string; name: string; accountType: AccountType; normalBalance: NormalBalance; isActive: boolean }
export function fetchAccounts() {
  return apiFetch<AccountDto[]>('/api/chart-of-accounts/');
}
export function createAccount(input: { code: string; name: string; accountType: AccountType; normalBalance: NormalBalance }) {
  return apiFetch<{ id: number }>('/api/chart-of-accounts/', { method: 'POST', body: JSON.stringify(input) });
}
export function updateAccount(id: number, input: { name?: string; isActive?: boolean }) {
  return apiFetch<{ message: string }>(`/api/chart-of-accounts/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

// ---- Siswa (identitas READ-ONLY hasil sinkron Webview-App, lihat StudentsEndpoints.cs) ----
// Cocok PERSIS enum StudentStatus backend (Keuangan.Data/Enums.cs) - 3 nilai
// (Keluar ditambah v0.2.0 = siswa hilang dari data sumber), "Nonaktif" TIDAK
// PERNAH ada (bug nyata sebelumnya: field ini ditambah menebak-nebak drpd
// dicek ke source - beda dari TagihanStatus di bawah).
export type StudentStatus = 'Aktif' | 'Lulus' | 'Keluar';
export interface StudentDto {
  id: number; studentCode: string; hubId: number | string | null; nis: string; name: string; className: string; tingkat: string;
  status: StudentStatus; katalog?: string | null; vaTambahan?: number; syncedAt: string | null; bankAccountNo: string | null; angkatan: string | null; vaNumber: string | null;
}
// ---- Pegawai (identitas READ-ONLY hasil sinkron Webview-App, lihat EmployeesEndpoints.cs) ----
export type EmployeeStatus = 'Aktif' | 'Nonaktif';
export interface EmployeeListDto {
  id: number; hubId: number; name: string; nip: string | null; jabatan: string | null; isKepalaSekolah: boolean;
  tipe: string; pendidikan: string | null;
  status: EmployeeStatus; statusKeluar: string | null; katalog: string | null; syncedAt: string | null;
}
export function fetchEmployees(q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiFetch<EmployeeListDto[]>(`/api/employees/${qs}`);
}

// ---- Versi aplikasi (Pengaturan, lihat VersionEndpoints.cs) ----
export interface VersionInfoDto {
  version: string; startedAt: string; databaseMigration: string | null; migrationCount: number;
  latest: { status: 'terbaru' | 'ada_update' | 'tidak_bisa_dicek'; tag: string | null; checkedAt: string };
}
export function fetchVersionInfo(force = false) {
  return apiFetch<VersionInfoDto>(`/api/version${force ? '?force=true' : ''}`);
}

// ---- Status sinkron ke Webview-App (banner, lihat SyncEndpoints.cs) ----
export interface SyncStatusDto {
  state: 'belum_mulai' | 'menunggu_persetujuan' | 'tersambung' | 'error';
  stateAt: string | null; lastOkAt: string | null; error: string | null; label: string;
  katalog: string[]; students: number; employees: number;
}
export function fetchSyncStatus() {
  return apiFetch<SyncStatusDto>('/api/sync/status');
}

export interface StudentVaDto { id: number; vaNumber: string; label: string; isActive: boolean }
export interface StudentTagihanRingkasDto { id: number; tagihanCode: string; periodLabel: string; amount: number; paidAmount: number; status: TagihanStatus; dueDate: string | null }
export interface StudentDetailDto extends StudentDto { virtualAccounts: StudentVaDto[]; tagihanTerbaru: StudentTagihanRingkasDto[] }
export function fetchStudents(q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiFetch<StudentDto[]>(`/api/students/${qs}`);
}
export function fetchStudentDetail(id: number) {
  return apiFetch<StudentDetailDto>(`/api/students/${id}`);
}
export function updateStudentFinance(id: number, input: { bankAccountNo?: string; angkatan?: string; vaNumber?: string }) {
  return apiFetch<{ message: string }>(`/api/students/${id}/rincian-keuangan`, { method: 'PATCH', body: JSON.stringify(input) });
}

// ---- Jenis Pembayaran (FeeType) ----
export type FeeKategori = 'Wajib' | 'Opsional';
export type FeeFrekuensi = 'Sekali' | 'Bulanan' | 'Cicilan';
export interface FeeTypeDto {
  id: number; feeCode: string; name: string; description: string | null; defaultAmount: number;
  kategori: FeeKategori; frekuensi: FeeFrekuensi; autoTagihSaatDaftar: boolean; usesAngkatanRate: boolean;
  cicilanJumlahBulanDefault: number; cicilanMinimalPerBulan: number; prioritas: number; isActive: boolean;
}
export function fetchFeeTypes() {
  return apiFetch<FeeTypeDto[]>('/api/fee-types/');
}
export function createFeeType(input: {
  name: string; description?: string; defaultAmount: number; kategori: FeeKategori; frekuensi: FeeFrekuensi;
  autoTagihSaatDaftar: boolean; usesAngkatanRate: boolean; cicilanJumlahBulanDefault?: number; cicilanMinimalPerBulan?: number; prioritas?: number;
}) {
  return apiFetch<{ id: number; feeCode: string }>('/api/fee-types/', { method: 'POST', body: JSON.stringify(input) });
}
export function updateFeeType(id: number, input: { name?: string; description?: string; defaultAmount?: number; prioritas?: number; isActive?: boolean }) {
  return apiFetch<{ message: string }>(`/api/fee-types/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export interface FeeTypeRateDto { id: number; angkatan: string; berlakuMulai: string; nominal: number }
export function fetchFeeTypeRates(feeTypeId: number) {
  return apiFetch<FeeTypeRateDto[]>(`/api/fee-types/${feeTypeId}/rates`);
}
export function createFeeTypeRate(feeTypeId: number, input: { angkatan: string; berlakuMulai: string; nominal: number }) {
  return apiFetch<{ message: string }>(`/api/fee-types/${feeTypeId}/rates`, { method: 'POST', body: JSON.stringify(input) });
}

// ---- Tagihan ----
// Cocok PERSIS enum TagihanStatus backend (Keuangan.Data/Enums.cs) - BUKAN
// gaya penamaan Akuntansi/Django lama (BelumLunas/SebagianLunas). BUG NYATA
// (2026-09-22, dilaporkan user langsung): sebelumnya field ini ditebak dari
// konvensi lama tanpa dicek ke source backend, request GET /api/tagihan/
// ?status=BelumLunas ditolak 400 krn enum tidak match (server pakai
// BelumDibayar/Sebagian/Lunas) - pelajaran: SELALU cek Enums.cs, jangan
// asumsikan penamaan dari sistem lain terbawa apa adanya.
export type TagihanStatus = 'BelumDibayar' | 'Sebagian' | 'Lunas';
export interface TagihanDto {
  id: number; tagihanCode: string; studentName: string; feeTypeName: string; periodLabel: string;
  amount: number; paidAmount: number; status: TagihanStatus; dueDate: string | null; cicilanKe: number | null; cicilanDari: number | null;
}
export function fetchTagihan(params?: { studentId?: number; status?: TagihanStatus }) {
  const qs = new URLSearchParams();
  if (params?.studentId) qs.set('studentId', String(params.studentId));
  if (params?.status) qs.set('status', params.status);
  const s = qs.toString();
  return apiFetch<TagihanDto[]>(`/api/tagihan/${s ? `?${s}` : ''}`);
}
export function createTagihan(input: { studentId: number; feeTypeId: number; periodLabel: string; amount: number; dueDate: string | null }) {
  return apiFetch<{ id: number; tagihanCode: string }>('/api/tagihan/', { method: 'POST', body: JSON.stringify(input) });
}
export function updateTagihan(id: number, input: { amount?: number; dueDate?: string | null }) {
  return apiFetch<{ message: string }>(`/api/tagihan/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteTagihan(id: number) {
  return apiFetch<{ message: string }>(`/api/tagihan/${id}`, { method: 'DELETE' });
}

// ---- Transaksi & Jurnal (baris jurnal WAJIB dikirim eksplisit - lihat catatan desain di TransactionsEndpoints.cs) ----
export type TxType = 'Masuk' | 'Keluar';
export type PaymentMethod = 'Cash' | 'Transfer';
export interface TransactionDto {
  id: number; txCode: string; txDate: string; description: string; txType: TxType; paymentMethod: PaymentMethod;
  amount: number; studentName: string | null; feeTypeName: string | null; createdByRole?: string | null;
}
export interface JournalLineViewDto { accountId: number; accountName: string; debit: number; credit: number }
export interface TransactionDetailDto {
  id: number; txCode: string; txDate: string; description: string; txType: TxType; paymentMethod: PaymentMethod;
  amount: number; studentId: number | null; feeTypeId: number | null; senderNote: string | null; journalLines: JournalLineViewDto[];
}
export function fetchTransactions(params?: { dari?: string; sampai?: string; txType?: TxType; roles?: string }) {
  const qs = new URLSearchParams();
  if (params?.roles) qs.set('roles', params.roles);
  if (params?.dari) qs.set('dari', params.dari);
  if (params?.sampai) qs.set('sampai', params.sampai);
  if (params?.txType) qs.set('txType', params.txType);
  const s = qs.toString();
  return apiFetch<TransactionDto[]>(`/api/transactions/${s ? `?${s}` : ''}`);
}
export function fetchTransactionDetail(id: number) {
  return apiFetch<TransactionDetailDto>(`/api/transactions/${id}`);
}
export interface JournalLineInput { accountId: number; debit: number; credit: number; description?: string }
export function createTransaction(input: {
  txDate: string; description: string; txType: TxType; paymentMethod: PaymentMethod; amount: number;
  studentId?: number | null; feeTypeId?: number | null; senderNote?: string; journalLines: JournalLineInput[];
}) {
  return apiFetch<{ id: number; txCode: string; entryNo: string }>('/api/transactions/', { method: 'POST', body: JSON.stringify(input) });
}

// ---- Pembayaran ----
export type PaymentReceiveMethod = 'Cash' | 'Transfer' | 'Saldo' | 'Keringanan';
export interface ReceivePaymentAllocationInput { tagihanId: number; amount: number }
export function receivePayment(input: {
  studentId: number; paymentDate: string; method: PaymentReceiveMethod; allocations: ReceivePaymentAllocationInput[];
  journalLines?: JournalLineInput[]; description?: string;
}) {
  return apiFetch<{ paymentCodes: string[]; transactionCode: string | null }>('/api/payments/receive', { method: 'POST', body: JSON.stringify(input) });
}
export function autoAllocatePayment(input: {
  studentId: number; paymentDate: string; method: PaymentReceiveMethod; amount: number; journalLines?: JournalLineInput[]; description?: string;
}) {
  return apiFetch<{ paymentCodes: string[]; transactionCode: string | null }>('/api/payments/auto-allocate', { method: 'POST', body: JSON.stringify(input) });
}

// ---- Periode ----
export interface PeriodClosingDto { id: number; periodKey: string; closedAt: string; closedByRole: RoleKey; totalIncome: number; totalExpense: number }
export function fetchPeriods() {
  return apiFetch<PeriodClosingDto[]>('/api/periods/');
}
export function closePeriod(periodKey: string, journalLines?: JournalLineInput[]) {
  return apiFetch<{ message: string }>('/api/periods/close', { method: 'POST', body: JSON.stringify({ periodKey, journalLines }) });
}

// ---- Rekap Kas ----
export interface CashRecapRowDto { txCode: string; txDate: string; description: string; txType: TxType; amount: number; saldoBerjalan: number }
export interface CashRecapDto {
  periodKey: string; saldoAwalPeriode: number; saldoAkhirPeriode: number; totalMasuk: number; totalKeluar: number; baris: CashRecapRowDto[];
}
export function fetchCashRecap(periodKey: string, roles?: string) {
  return apiFetch<CashRecapDto>(`/api/cash-recap?periodKey=${encodeURIComponent(periodKey)}${roles ? `&roles=${encodeURIComponent(roles)}` : ''}`);
}
export function saveOpeningBalance(amount: number, scope?: string) {
  return apiFetch<{ message: string }>('/api/settings/opening-balance', { method: 'POST', body: JSON.stringify({ amount, scope }) });
}

// ============================================================================
// Penggajian (2026-09-30) - port dari Akuntansi. Halaman hasil port memakai bentuk data
// snake_case ala Akuntansi (db_id, is_active, calc_mode, ...) supaya kodenya nyaris tidak berubah;
// backend Keuangan (camelCase) dipetakan di SINI. Parameter `role` dipertahankan agar tanda tangan
// fungsi sama, tapi diabaikan - otorisasi dari login/cookie di server.
// ============================================================================
export type CalcMode = 'MANUAL' | 'AUTO_HARI' | 'AUTO_OWN';
export type SlipSection = 'TETAP' | 'TIDAK_TETAP';
export type EditRole = 'ALL' | 'SUPERVISOR';
export type KelompokPajakBpjs = '' | 'PAJAK' | 'BPJS_TK' | 'BPJS_K';
export interface PayrollComponentTypeDto {
  db_id: string; code: string; name: string; category: 'EARNING' | 'DEDUCTION'; group_id: string | null;
  calc_mode: CalcMode; qty_label: string; default_rate: number; short_label: string;
  slip_section: SlipSection; edit_role: EditRole; kelompok_pajak_bpjs: KelompokPajakBpjs;
  rates: Record<string, number>; urutan: number; is_active: boolean;
}
export interface PayrollComponentGroupDto { db_id: string; name: string; category: 'EARNING' | 'DEDUCTION'; urutan: number; is_active: boolean }
export interface PayrollLineDto { amount: number; quantity: number | null; is_manual_override: boolean }
export interface PayrollItemDto {
  employee_id: string; payroll_item_id: string; hari_masuk: number | null; keterangan: string;
  biaya_jabatan: number | null; ptkp_wajib_pajak: number | null; pajak_ditanggung_pemerintah: number | null;
  lines: Record<string, PayrollLineDto>; is_paid: boolean; slip_no?: string | null;
}
export interface PayrollItemSingleDto extends PayrollItemDto { ok: boolean; exists: boolean }
export interface EmployeeDto {
  db_id: string; id: string; nama: string; jabatan: string; tipe: string; pendidikan: string;
  nip: string | null; katalog: string | null; is_active: boolean; is_kepala_sekolah: boolean;
}
export type PayslipRowType = 'HEADING' | 'COMPONENT_LIST' | 'DATA' | 'TOTAL';
export type PayslipListKelompok = '' | 'REGULAR' | 'PAJAK_BPJS' | 'PAJAK' | 'BPJS_TK' | 'BPJS_K';
export interface PayslipSumSourceDto { line_id: string; sign: 1 | -1 }
export interface PayslipTemplateLineDto {
  db_id: string; row_type: PayslipRowType; label: string; urutan: number; bold: boolean; indent: boolean;
  list_category: 'EARNING' | 'DEDUCTION' | ''; list_slip_section: SlipSection | ''; list_kelompok_pajak_bpjs: PayslipListKelompok;
  is_active: boolean; component_ids: string[]; sum_sources: PayslipSumSourceDto[];
}
export interface PayrollSettings { expenseAccountId: number | null; cashAccountId: number | null; signSpv: string | null; signAdm: string | null; taxGuideUrl: string | null }
export interface PayrollMeta {
  payroll_component_types: PayrollComponentTypeDto[];
  payroll_component_groups: PayrollComponentGroupDto[];
  payslip_template: PayslipTemplateLineDto[];
  employees: EmployeeDto[];
  settings: PayrollSettings;
}
export interface OfficialDto { name: string; jabatan: string }

const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
// "September 2026" -> "2026-09" (halaman memakai label bulan, server memakai kunci YYYY-MM).
export function periodKeyFromLabel(label: string): string {
  const [bulan, tahun] = label.trim().split(/\s+/);
  const idx = BULAN_ID.indexOf(bulan);
  return `${tahun}-${String(idx + 1).padStart(2, '0')}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchPayrollMeta(): Promise<PayrollMeta> {
  const d = await apiFetch<any>('/api/payroll/meta');
  return {
    payroll_component_groups: d.groups.map((g: any) => ({ db_id: String(g.id), name: g.name, category: g.category, urutan: g.urutan, is_active: g.isActive })),
    payroll_component_types: d.types.map((c: any) => ({
      db_id: String(c.id), code: c.code, name: c.name, category: c.category, group_id: c.groupId != null ? String(c.groupId) : null,
      calc_mode: c.calcMode, qty_label: c.qtyLabel, default_rate: c.defaultRate, short_label: c.shortLabel, slip_section: c.slipSection,
      edit_role: c.editRole, kelompok_pajak_bpjs: c.kelompokPajakBpjs, rates: c.rates || {}, urutan: c.urutan, is_active: c.isActive,
    })),
    payslip_template: d.template.map((l: any) => ({
      db_id: String(l.id), row_type: l.rowType, label: l.label, urutan: l.urutan, bold: l.bold, indent: l.indent,
      list_category: l.listCategory, list_slip_section: l.listSlipSection, list_kelompok_pajak_bpjs: l.listKelompokPajakBpjs, is_active: l.isActive,
      component_ids: l.componentIds.map(String), sum_sources: l.sumSources.map((s: any) => ({ line_id: String(s.lineId), sign: s.sign })),
    })),
    employees: d.employees.map((e: any) => ({
      db_id: String(e.id), id: e.nip || String(e.id), nama: e.name, jabatan: e.jabatan || '', tipe: e.tipe, pendidikan: e.pendidikan || '',
      nip: e.nip, katalog: e.katalog, is_active: e.status === 'Aktif', is_kepala_sekolah: e.isKepalaSekolah,
    })),
    settings: d.settings ? {
      expenseAccountId: d.settings.expenseAccountId ?? null, cashAccountId: d.settings.cashAccountId ?? null,
      signSpv: d.settings.signSpv ?? null, signAdm: d.settings.signAdm ?? null, taxGuideUrl: d.settings.taxGuideUrl ?? null,
    } : { expenseAccountId: null, cashAccountId: null, signSpv: null, signAdm: null, taxGuideUrl: null },
  };
}

function mapItem(i: any): PayrollItemDto {
  const lines: Record<string, PayrollLineDto> = {};
  Object.entries(i.lines || {}).forEach(([code, l]: [string, any]) => { lines[code] = { amount: l.amount, quantity: l.quantity ?? null, is_manual_override: !!l.isManualOverride }; });
  return {
    employee_id: String(i.employeeId), payroll_item_id: i.payrollItemId != null ? String(i.payrollItemId) : '', hari_masuk: i.hariMasuk ?? null,
    keterangan: i.keterangan || '', biaya_jabatan: i.biayaJabatan ?? null, ptkp_wajib_pajak: i.ptkpWajibPajak ?? null,
    pajak_ditanggung_pemerintah: i.pajakDitanggungPemerintah ?? null, lines, is_paid: !!i.isPaid, slip_no: i.slipNo ?? null,
  };
}

export async function fetchPayrollItemsList(_role: RoleKey, periodLabel: string) {
  const d = await apiFetch<any>(`/api/payroll/items?period=${periodKeyFromLabel(periodLabel)}`);
  return { ok: true, items: (d.items || []).map(mapItem) as PayrollItemDto[] };
}
export async function fetchPayrollItemForEmployee(_role: RoleKey, periodLabel: string, employeeId: string): Promise<PayrollItemSingleDto> {
  const d = await apiFetch<any>(`/api/payroll/items?period=${periodKeyFromLabel(periodLabel)}&employeeId=${employeeId}`);
  return { ...mapItem({ ...d, employeeId: d.employeeId ?? employeeId }), ok: true, exists: !!d.exists };
}
export interface PayrollItemSavePayload {
  employee_id: string; period_label: string; hari_masuk: number | null; keterangan: string;
  lines: Record<string, number>; quantities: Record<string, number>; overrides: string[];
  biaya_jabatan?: number | null; ptkp_wajib_pajak?: number | null; pajak_ditanggung_pemerintah?: number | null;
}
export function savePayrollItem(_role: RoleKey, p: PayrollItemSavePayload) {
  return apiFetch<any>('/api/payroll/items/save', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: Number(p.employee_id), period: periodKeyFromLabel(p.period_label), hariMasuk: p.hari_masuk, keterangan: p.keterangan,
      lines: p.lines, quantities: p.quantities, overrides: p.overrides,
      ...(p.biaya_jabatan !== undefined ? { biayaJabatan: p.biaya_jabatan } : {}),
      ...(p.ptkp_wajib_pajak !== undefined ? { ptkpWajibPajak: p.ptkp_wajib_pajak } : {}),
      ...(p.pajak_ditanggung_pemerintah !== undefined ? { pajakDitanggungPemerintah: p.pajak_ditanggung_pemerintah } : {}),
    }),
  });
}
export interface FinalizeOptions { expenseAccountId?: number | null; cashAccountId?: number | null; method?: 'Transfer' | 'Cash' }
export async function finalizePayrollPeriod(_role: RoleKey, periodLabel: string, employeeIds?: string[], opts: FinalizeOptions = {}) {
  const d = await apiFetch<any>('/api/payroll/periods/finalize', {
    method: 'POST',
    body: JSON.stringify({
      period: periodKeyFromLabel(periodLabel), employeeIds: employeeIds && employeeIds.length ? employeeIds.map(Number) : undefined,
      expenseAccountId: opts.expenseAccountId ?? undefined, cashAccountId: opts.cashAccountId ?? undefined, method: opts.method,
    }),
  });
  return { employees_paid: d.employeesPaid as number, total_paid: d.totalPaid as number };
}
export async function fetchSalarySlipNo(_role: RoleKey, payrollItemId: string) {
  const d = await apiFetch<any>(`/api/payroll/items/${payrollItemId}/slip`, { method: 'POST' });
  return { slip_no: d.slipNo as string };
}
export interface PayrollHistoryRow { periodKey: string; periodLabel: string; txDate: string; amount: number; method: string; txCode: string; slipNo: string | null }
export function fetchPayrollHistory(employeeId: string) {
  return apiFetch<PayrollHistoryRow[]>(`/api/payroll/employees/${employeeId}/history`);
}

export interface PayrollComponentTypeInput {
  code?: string; name: string; category: 'EARNING' | 'DEDUCTION'; group_id?: string | null; calc_mode: CalcMode;
  qty_label?: string; default_rate?: number; short_label?: string; slip_section?: SlipSection; edit_role?: EditRole;
  kelompok_pajak_bpjs?: KelompokPajakBpjs; urutan?: number;
}
function camelType(i: Record<string, unknown>) {
  const map: Record<string, string> = {
    group_id: 'groupId', calc_mode: 'calcMode', qty_label: 'qtyLabel', default_rate: 'defaultRate', short_label: 'shortLabel',
    slip_section: 'slipSection', edit_role: 'editRole', kelompok_pajak_bpjs: 'kelompokPajakBpjs', is_active: 'isActive',
  };
  const out: Record<string, unknown> = {};
  Object.entries(i).forEach(([k, v]) => { out[map[k] || k] = k === 'group_id' && v != null ? Number(v) : v; });
  return out;
}
export function createPayrollComponentType(_role: RoleKey, input: PayrollComponentTypeInput) {
  return apiFetch<any>('/api/payroll/component-types', { method: 'POST', body: JSON.stringify(camelType(input as unknown as Record<string, unknown>)) });
}
export function updatePayrollComponentType(_role: RoleKey, dbId: string, input: Partial<PayrollComponentTypeInput> & { rates?: Record<string, number | null>; is_active?: boolean }) {
  return apiFetch<any>(`/api/payroll/component-types/${dbId}`, { method: 'PATCH', body: JSON.stringify(camelType(input as Record<string, unknown>)) });
}
export function deactivatePayrollComponentType(role: RoleKey, dbId: string) {
  return updatePayrollComponentType(role, dbId, { is_active: false });
}
export async function createPayrollComponentGroup(_role: RoleKey, name: string, category: 'EARNING' | 'DEDUCTION') {
  const d = await apiFetch<any>('/api/payroll/component-groups', { method: 'POST', body: JSON.stringify({ name, category }) });
  return { db_id: String(d.id) };
}
export function updatePayrollComponentGroup(_role: RoleKey, dbId: string, input: { name?: string; urutan?: number }) {
  return apiFetch<any>(`/api/payroll/component-groups/${dbId}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deactivatePayrollComponentGroup(_role: RoleKey, dbId: string) {
  return apiFetch<any>(`/api/payroll/component-groups/${dbId}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) });
}

export interface PayslipTemplateLineInput {
  row_type: PayslipRowType; label: string; urutan: number; bold?: boolean; indent?: boolean;
  list_category?: 'EARNING' | 'DEDUCTION'; list_slip_section?: SlipSection | ''; list_kelompok_pajak_bpjs?: PayslipListKelompok;
  component_ids?: string[]; sum_sources?: PayslipSumSourceDto[];
}
function camelLine(i: Record<string, any>) {
  const out: Record<string, unknown> = {};
  if ('row_type' in i) out.rowType = i.row_type;
  ['label', 'urutan', 'bold', 'indent'].forEach((k) => { if (k in i) out[k] = i[k]; });
  if ('list_category' in i) out.listCategory = i.list_category;
  if ('list_slip_section' in i) out.listSlipSection = i.list_slip_section ?? '';
  if ('list_kelompok_pajak_bpjs' in i) out.listKelompokPajakBpjs = i.list_kelompok_pajak_bpjs;
  if (i.component_ids) out.componentIds = i.component_ids.map(Number);
  if (i.sum_sources) out.sumSources = i.sum_sources.map((s: PayslipSumSourceDto) => ({ lineId: Number(s.line_id), sign: s.sign }));
  return out;
}
export function createPayslipTemplateLine(_role: RoleKey, input: PayslipTemplateLineInput) {
  return apiFetch<any>('/api/payroll/template/', { method: 'POST', body: JSON.stringify(camelLine(input as unknown as Record<string, unknown>)) });
}
export function updatePayslipTemplateLine(_role: RoleKey, dbId: string, input: Partial<PayslipTemplateLineInput>) {
  return apiFetch<any>(`/api/payroll/template/${dbId}`, { method: 'PATCH', body: JSON.stringify(camelLine(input as unknown as Record<string, unknown>)) });
}
export function deletePayslipTemplateLine(_role: RoleKey, dbId: string) {
  return apiFetch<any>(`/api/payroll/template/${dbId}`, { method: 'DELETE' });
}
export function savePayrollSettings(input: Partial<PayrollSettings>) {
  return apiFetch<null>('/api/payroll/settings', { method: 'PUT', body: JSON.stringify(input) });
}
export function updateEmployeeRincianGaji(id: string, input: { tipe?: string; pendidikan?: string }) {
  return apiFetch<null>(`/api/employees/${id}/rincian-gaji`, { method: 'PATCH', body: JSON.stringify(input) });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================================================
// Validasi pembayaran (usulan alokasi saldo & keringanan), setoran saldo, rekonsiliasi bank
// (2026-09-30) - lihat ValidationEndpoints.cs.
// ============================================================================
export function fetchSaldo(studentId: number) {
  return apiFetch<{ saldo: number }>(`/api/payments/saldo/${studentId}`);
}
export function depositSaldo(input: {
  studentId: number; paymentDate: string; method: 'Cash' | 'Transfer'; amount: number; journalLines: JournalLineInput[]; description?: string;
}) {
  return apiFetch<{ txCode: string; saldo: number }>('/api/payments/deposit', { method: 'POST', body: JSON.stringify(input) });
}

export type ProposalStatus = 'PENDING' | 'VALIDATED' | 'REJECTED';
export interface AllocationProposalItemDto { tagihanId: number; feeName: string; periodLabel: string; amount: number; tagihanTotal: number; tagihanStatus: string }
export interface AllocationProposalDto {
  id: number; studentId: number; studentName: string; nis: string; status: ProposalStatus; note: string; proposedByRole: string;
  validatedByRole: string | null; validatedAt: string | null; createdAt: string; totalAmount: number; saldo: number; items: AllocationProposalItemDto[];
}
export function fetchAllocationProposals(status?: ProposalStatus) {
  return apiFetch<AllocationProposalDto[]>(`/api/allocation-proposals/${status ? `?status=${status}` : ''}`);
}
export function createAllocationProposal(studentId: number, items: { tagihanId: number; amount: number }[], note: string) {
  return apiFetch<{ id: number }>('/api/allocation-proposals/', { method: 'POST', body: JSON.stringify({ studentId, items, note }) });
}
export function decideAllocationProposal(id: number, decision: 'validate' | 'reject') {
  return apiFetch<{ status: ProposalStatus }>(`/api/allocation-proposals/${id}/${decision}`, { method: 'POST' });
}

export type KeringananStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface KeringananItemDto { tagihanId: number; periodLabel: string; amount: number; tagihanStatus: string }
export interface KeringananProposalDto {
  id: number; studentId: number; studentName: string; nis: string; feeTypeId: number; feeTypeName: string; reason: string; status: KeringananStatus;
  proposedByRole: string; decidedByRole: string | null; decidedAt: string | null; createdAt: string; totalAmount: number; items: KeringananItemDto[];
}
export function fetchKeringananProposals(status?: KeringananStatus) {
  return apiFetch<KeringananProposalDto[]>(`/api/keringanan-proposals/${status ? `?status=${status}` : ''}`);
}
export function createKeringananProposal(studentId: number, feeTypeId: number, periodLabels: string[], reason: string) {
  return apiFetch<{ id: number }>('/api/keringanan-proposals/', { method: 'POST', body: JSON.stringify({ studentId, feeTypeId, periodLabels, reason }) });
}
export function decideKeringananProposal(id: number, decision: 'validate' | 'reject') {
  return apiFetch<{ status: KeringananStatus; dibebaskan?: number }>(`/api/keringanan-proposals/${id}/${decision}`, { method: 'POST' });
}

export interface BankLineDto { id: number; bankDate: string; description: string; amount: number; periodKey: string; matchedTransactionId: number | null; matchedTxCode: string | null }
export function fetchBankLines() {
  return apiFetch<BankLineDto[]>('/api/bank-lines/');
}
export function createBankLine(bankDate: string, description: string, amount: number) {
  return apiFetch<{ id: number }>('/api/bank-lines/', { method: 'POST', body: JSON.stringify({ bankDate, description, amount }) });
}
export function deleteBankLine(id: number) {
  return apiFetch<null>(`/api/bank-lines/${id}`, { method: 'DELETE' });
}
export function matchBankLine(id: number, transactionId: number | null) {
  return apiFetch<{ matched: boolean }>(`/api/bank-lines/${id}/match`, { method: 'POST', body: JSON.stringify({ transactionId }) });
}

// ============================================================================
// Manajemen Data (backup/pulihkan) & Riwayat Audit (2026-09-30) - lihat ManagementEndpoints.cs.
// ============================================================================
export interface ManagementSummary {
  siswaAktif: number; pegawaiAktif: number; transaksi: number; tagihan: number; ukuranDatabaseBytes: number;
  backupTerakhir: string | null; jumlahBackup: number; pemulihanMenunggu: boolean;
}
export interface BackupInfo { name: string; ukuran: number; dibuat: string }
export function fetchManagementSummary() { return apiFetch<ManagementSummary>('/api/management/summary'); }
export function fetchBackups() { return apiFetch<BackupInfo[]>('/api/management/backups'); }
export function createBackup() { return apiFetch<{ name: string; ukuran: number }>('/api/management/backups', { method: 'POST' }); }
export function deleteBackup(name: string) { return apiFetch<null>(`/api/management/backups/${encodeURIComponent(name)}`, { method: 'DELETE' }); }
export async function downloadBackup(name: string) {
  const res = await apiRaw(`/api/management/backups/${encodeURIComponent(name)}`, { method: 'GET' });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
export async function uploadRestore(file: File): Promise<string> {
  const r = await apiUpload<{ message: string }>('/api/management/restore', file);
  return r.message;
}
export function cancelRestore() { return apiFetch<null>('/api/management/restore', { method: 'DELETE' }); }

export interface AuditLogItem {
  id: number; auditCode: string; module: string; action: string; entityName: string; entityCode: string | null; createdAt: string;
  actor: string; actorRole: string; beforeDataJson: string | null; afterDataJson: string | null;
}
export interface AuditLogResult { total: number; perPeran: { peran: string; jumlah: number }[]; items: AuditLogItem[] }
export function fetchAuditLogs(params?: { module?: string; action?: string }) {
  const qs = new URLSearchParams();
  if (params?.module) qs.set('module', params.module);
  if (params?.action) qs.set('action', params.action);
  const s = qs.toString();
  return apiFetch<AuditLogResult>(`/api/audit-logs${s ? `?${s}` : ''}`);
}
