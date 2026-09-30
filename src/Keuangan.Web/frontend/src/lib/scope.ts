import type { RoleKey } from '../menus';

// Lingkup data per peran (port dari scoping Akuntansi lama): tiap peran hanya melihat transaksi yang DIBUAT
// peran yang relevan - Admin Keuangan (Staff) hanya miliknya, Kasir hanya miliknya, Akuntansi = Kasir +
// Akuntansi, Admin/Supervisor melihat semua. Hasilnya dikirim sbg parameter `roles` ke API transaksi.
export function scopeRolesFor(role: RoleKey): string | undefined {
  if (role === 'Staff') return 'Staff';
  if (role === 'Kasir') return 'Kasir';
  if (role === 'Akuntansi') return 'Kasir,Akuntansi';
  return undefined;
}
