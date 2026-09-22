// Menu Fase 1 SAJA (Ledger + Tagihan/Pembayaran siswa) - lihat plan file
// soft-dreaming-shannon.md. Modul Pegawai/Penggajian/Pajak-BPJS/Rekonsiliasi
// Bank/Approval (maker-checker) DITUNDA ke Fase 2, sengaja tidak ada di sini
// (bukan lupa - backend-nya memang belum dibangun).
export interface MenuLeaf { icon: string; label: string; page: string }
export interface MenuGroup { icon: string; label: string; group: true; key: string; children: MenuLeaf[] }
export type MenuItem = MenuLeaf | MenuGroup;
// Cocok persis dgn string UserRole enum backend (Keuangan.Data/Enums.cs) -
// dipakai LANGSUNG sbg X-Dev-Role / dibaca dari claim Role hasil login,
// tidak ada mapping terpisah lagi spt sourceRoleFor() versi Django lama.
export type RoleKey = 'AdminManager' | 'Akuntansi' | 'Staff' | 'Kasir';

export const menus: Record<RoleKey, MenuItem[]> = {
  AdminManager: [
    { icon: 'layout-dashboard', label: 'menu.dashboard', page: 'dashboard' },
    { icon: 'book-open', label: 'menu.jurnal', page: 'jurnal' },
    { icon: 'bar-chart-3', label: 'menu.laporan_group', group: true, key: 'laporan_group', children: [
      { icon: 'bar-chart-3', label: 'menu.laporan', page: 'laporan' },
      { icon: 'arrow-down-circle', label: 'menu.penerimaan', page: 'penerimaan' },
      { icon: 'arrow-up-circle', label: 'menu.pengeluaran', page: 'pengeluaran' },
      { icon: 'printer', label: 'menu.rekapitulasi_kas', page: 'rekapitulasi_kas' },
    ] },
    { icon: 'graduation-cap', label: 'menu.siswa_group', group: true, key: 'siswa_group', children: [
      { icon: 'graduation-cap', label: 'menu.siswa', page: 'siswa' },
      { icon: 'file-text', label: 'menu.tagihan', page: 'tagihan_pembayaran' },
      { icon: 'check-circle', label: 'menu.siswa_lunas', page: 'siswa_lunas' },
      { icon: 'alert-circle', label: 'menu.siswa_belum_lunas', page: 'siswa_belum_lunas' },
      { icon: 'archive', label: 'menu.arsip_siswa', page: 'arsip_siswa' },
      { icon: 'receipt', label: 'menu.jenis_pembayaran', page: 'jenis_pembayaran' },
    ] },
    { icon: 'user-cog', label: 'menu.kelola_pengguna', page: 'kelola_pengguna' },
    { icon: 'landmark', label: 'menu.bagan_akun', page: 'bagan_akun' },
    { icon: 'settings', label: 'menu.pengaturan', page: 'pengaturan' },
  ],
  Staff: [
    { icon: 'layout-dashboard', label: 'menu.dashboard', page: 'dashboard' },
    { icon: 'arrow-down-circle', label: 'menu.penerimaan_kas', page: 'penerimaan_kas' },
    { icon: 'arrow-up-circle', label: 'menu.pengeluaran', page: 'pengeluaran' },
    { icon: 'printer', label: 'menu.rekapitulasi_kas', page: 'rekapitulasi_kas' },
    { icon: 'settings', label: 'menu.pengaturan', page: 'pengaturan' },
  ],
  Kasir: [
    { icon: 'layout-dashboard', label: 'menu.dashboard', page: 'dashboard' },
    { icon: 'graduation-cap', label: 'menu.siswa_group', group: true, key: 'siswa_group', children: [
      { icon: 'graduation-cap', label: 'menu.siswa', page: 'siswa' },
      { icon: 'check-circle', label: 'menu.siswa_lunas', page: 'siswa_lunas' },
      { icon: 'alert-circle', label: 'menu.siswa_belum_lunas', page: 'siswa_belum_lunas' },
      { icon: 'archive', label: 'menu.arsip_siswa', page: 'arsip_siswa' },
    ] },
    { icon: 'wallet', label: 'menu.pembayaran_group', group: true, key: 'pembayaran_group', children: [
      { icon: 'file-text', label: 'menu.tagihan', page: 'tagihan_pembayaran' },
      { icon: 'receipt', label: 'menu.jenis_pembayaran', page: 'jenis_pembayaran' },
      { icon: 'wallet', label: 'menu.terima_pembayaran', page: 'terima_pembayaran' },
      { icon: 'history', label: 'menu.jurnal_penerimaan_cash', page: 'jurnal_penerimaan_cash' },
      { icon: 'history', label: 'menu.jurnal_penerimaan_transfer', page: 'jurnal_penerimaan_transfer' },
    ] },
    { icon: 'printer', label: 'menu.cetak_kasir', page: 'cetak_kasir' },
    { icon: 'settings', label: 'menu.pengaturan', page: 'pengaturan' },
  ],
  Akuntansi: [
    { icon: 'layout-dashboard', label: 'menu.dashboard', page: 'dashboard' },
    { icon: 'graduation-cap', label: 'menu.siswa_group', group: true, key: 'siswa_group', children: [
      { icon: 'graduation-cap', label: 'menu.siswa', page: 'siswa' },
      { icon: 'check-circle', label: 'menu.siswa_lunas', page: 'siswa_lunas' },
      { icon: 'alert-circle', label: 'menu.siswa_belum_lunas', page: 'siswa_belum_lunas' },
      { icon: 'archive', label: 'menu.arsip_siswa', page: 'arsip_siswa' },
    ] },
    { icon: 'wallet', label: 'menu.pembayaran_group', group: true, key: 'pembayaran_group', children: [
      { icon: 'file-text', label: 'menu.tagihan', page: 'tagihan_pembayaran' },
      { icon: 'receipt', label: 'menu.jenis_pembayaran', page: 'jenis_pembayaran' },
      { icon: 'wallet', label: 'menu.terima_pembayaran', page: 'terima_pembayaran' },
      { icon: 'history', label: 'menu.jurnal_penerimaan_cash', page: 'jurnal_penerimaan_cash' },
      { icon: 'history', label: 'menu.jurnal_penerimaan_transfer', page: 'jurnal_penerimaan_transfer' },
    ] },
    { icon: 'book-open', label: 'menu.jurnal', page: 'jurnal' },
    { icon: 'bar-chart-3', label: 'menu.laporan', page: 'laporan' },
    { icon: 'file-text', label: 'menu.jurnal_akhir', page: 'jurnal_akhir' },
    { icon: 'landmark', label: 'menu.bagan_akun', page: 'bagan_akun' },
    { icon: 'printer', label: 'menu.cetak_akuntansi', page: 'cetak_akuntansi' },
    { icon: 'settings', label: 'menu.pengaturan', page: 'pengaturan' },
  ],
};

export const titleKeys: Record<string, string> = {
  dashboard: 'menu.dashboard', jurnal: 'menu.jurnal', laporan: 'menu.laporan',
  penerimaan: 'menu.penerimaan', pengeluaran: 'menu.pengeluaran', siswa: 'menu.siswa',
  pengaturan: 'menu.pengaturan', terima_pembayaran: 'menu.terima_pembayaran',
  penerimaan_kas: 'menu.penerimaan_kas',
  jurnal_penerimaan_cash: 'menu.jurnal_penerimaan_cash', jurnal_penerimaan_transfer: 'menu.jurnal_penerimaan_transfer',
  cetak_kasir: 'menu.cetak_kasir', jurnal_akhir: 'menu.jurnal_akhir',
  cetak_akuntansi: 'menu.cetak_akuntansi', kelola_pengguna: 'menu.kelola_pengguna', bagan_akun: 'menu.bagan_akun',
  tagihan_pembayaran: 'menu.tagihan',
  siswa_lunas: 'menu.siswa_lunas', siswa_belum_lunas: 'menu.siswa_belum_lunas', arsip_siswa: 'menu.arsip_siswa',
  siswa_detail: 'heading.profilSiswa', kwitansi: 'heading.kwitansi',
  rekapitulasi_kas: 'menu.rekapitulasi_kas',
  jenis_pembayaran: 'menu.jenis_pembayaran',
};

export function flattenMenuPages(role: RoleKey): string[] {
  const flat: string[] = [];
  (menus[role] || []).forEach((m) => {
    if ('group' in m && m.group) m.children.forEach((c) => flat.push(c.page));
    else flat.push((m as MenuLeaf).page);
  });
  return flat;
}
