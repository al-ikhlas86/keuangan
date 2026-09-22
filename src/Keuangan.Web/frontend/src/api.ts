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
export type StudentStatus = 'Aktif' | 'Lulus' | 'Nonaktif';
export interface StudentDto {
  id: number; studentCode: string; hubId: string | null; nis: string; name: string; className: string; tingkat: string;
  status: StudentStatus; syncedAt: string | null; bankAccountNo: string | null; angkatan: string | null; vaNumber: string | null;
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
export type TagihanStatus = 'BelumLunas' | 'SebagianLunas' | 'Lunas';
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
  amount: number; studentName: string | null; feeTypeName: string | null;
}
export interface JournalLineViewDto { accountId: number; accountName: string; debit: number; credit: number }
export interface TransactionDetailDto {
  id: number; txCode: string; txDate: string; description: string; txType: TxType; paymentMethod: PaymentMethod;
  amount: number; studentId: number | null; feeTypeId: number | null; senderNote: string | null; journalLines: JournalLineViewDto[];
}
export function fetchTransactions(params?: { dari?: string; sampai?: string; txType?: TxType }) {
  const qs = new URLSearchParams();
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
export function fetchCashRecap(periodKey: string) {
  return apiFetch<CashRecapDto>(`/api/cash-recap?periodKey=${encodeURIComponent(periodKey)}`);
}
export function saveOpeningBalance(amount: number) {
  return apiFetch<{ message: string }>('/api/settings/opening-balance', { method: 'POST', body: JSON.stringify({ amount }) });
}
