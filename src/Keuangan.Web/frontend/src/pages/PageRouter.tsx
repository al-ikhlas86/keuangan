import { useEffect } from 'react';
import { useRole } from '../contexts/RoleContext';
import { Dashboard } from './Dashboard';
import { Jurnal } from './Jurnal';
import { Laporan } from './Laporan';
import { Pengaturan } from './Pengaturan';
import { JenisPembayaran } from './JenisPembayaran';
import { Siswa } from './Siswa';
import { SiswaByStatus } from './SiswaByStatus';
import { ArsipSiswa } from './ArsipSiswa';
import { SiswaDetail } from './SiswaDetail';
import { TagihanPembayaran } from './TagihanPembayaran';
import { TerimaPembayaran } from './TerimaPembayaran';
import { JurnalPenerimaan } from './JurnalPenerimaan';
import { Penerimaan } from './Penerimaan';
import { Pengeluaran } from './Pengeluaran';
import { PenerimaanKas } from './PenerimaanKas';
import { JurnalAkhir } from './JurnalAkhir';
import { RekapitulasiKas } from './RekapitulasiKas';
import { Cetak } from './Cetak';
import { Kwitansi } from './Kwitansi';
import { KelolaPengguna } from './KelolaPengguna';
import { BaganAkun } from './BaganAkun';

// Fase 1 saja - lihat menus.ts utk daftar halaman yang memang ada menunya.
// Modul Pegawai/Penggajian/Pajak-BPJS/Rekonsiliasi Bank/Approval DITUNDA,
// sengaja tidak ada dispatcher-nya di sini.
export function PageRouter() {
  const { page } = useRole();

  useEffect(() => {
    if (page !== 'kwitansi') {
      const el = document.getElementById('dynamicPageStyle');
      if (el) el.textContent = '';
    }
  }, [page]);

  if (page === 'kwitansi') return <Kwitansi />;
  if (page === 'dashboard') return <Dashboard />;
  if (page === 'jurnal') return <Jurnal />;
  if (page === 'laporan') return <Laporan />;
  if (page === 'pengaturan') return <Pengaturan />;
  if (page === 'jenis_pembayaran') return <JenisPembayaran />;
  if (page === 'siswa') return <Siswa />;
  if (page === 'siswa_lunas') return <SiswaByStatus kind="Lunas" />;
  if (page === 'siswa_belum_lunas') return <SiswaByStatus kind="BelumLunas" />;
  if (page === 'arsip_siswa') return <ArsipSiswa />;
  if (page === 'siswa_detail') return <SiswaDetail />;
  if (page === 'tagihan_pembayaran') return <TagihanPembayaran />;
  if (page === 'terima_pembayaran') return <TerimaPembayaran />;
  if (page === 'jurnal_penerimaan_cash') return <JurnalPenerimaan metode="Cash" />;
  if (page === 'jurnal_penerimaan_transfer') return <JurnalPenerimaan metode="Transfer" />;
  if (page === 'penerimaan') return <Penerimaan />;
  if (page === 'pengeluaran') return <Pengeluaran />;
  if (page === 'penerimaan_kas') return <PenerimaanKas />;
  if (page === 'jurnal_akhir') return <JurnalAkhir />;
  if (page === 'rekapitulasi_kas') return <RekapitulasiKas />;
  if (page === 'cetak_kasir') return <Cetak role="kasir" />;
  if (page === 'cetak_akuntansi') return <Cetak role="akuntansi" />;
  if (page === 'kelola_pengguna') return <KelolaPengguna />;
  if (page === 'bagan_akun') return <BaganAkun />;

  return <Dashboard />;
}
