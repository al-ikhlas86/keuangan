import { useEffect, useRef, useState } from 'react';
import { GraduationCap, Users, Receipt, Database, Download, Upload, Trash2, ShieldAlert } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useToast } from '../contexts/ToastContext';
import { ExportBtn } from '../components/Buttons';
import {
  fetchManagementSummary, fetchBackups, createBackup, deleteBackup, downloadBackup, uploadRestore, cancelRestore, fetchStudents, fetchEmployees, fetchTransactions,
  ApiError, type ManagementSummary, type BackupInfo,
} from '../api';
import { downloadCsv } from '../lib/format';

function ukuran(b: number): string {
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

// Manajemen Data (hanya Admin/Supervisor) - port dari Manajemen.tsx Akuntansi, tapi backup-nya SUNGGUHAN:
// salinan database yang konsisten (bisa diunduh) dan pemulihan lewat berkas backup. Kartu "Backup Data" di
// Akuntansi lama hanya menampilkan toast. Pulihkan baru berlaku setelah layanan Keuangan dinyalakan ulang;
// database yang lama diamankan otomatis sebelum diganti.
export function Manajemen() {
  const { tt } = useI18n();
  const { navigateTo } = useRole();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sum, setSum] = useState<ManagementSummary | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);

  async function muat() {
    try {
      const [s, b] = await Promise.all([fetchManagementSummary(), fetchBackups()]);
      setSum(s); setBackups(b);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal memuat data manajemen.', 'error');
    }
  }
  useEffect(() => { muat(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const cards = [
    { icon: GraduationCap, title: tt('menu.siswa_group'), desc: `${sum?.siswaAktif ?? '-'} ${tt('misc.siswaTerdaftar')}`, page: 'siswa' },
    { icon: Users, title: tt('label.dataKaryawan'), desc: `${sum?.pegawaiAktif ?? '-'} ${tt('misc.karyawanAktif')}`, page: 'pegawai' },
    { icon: Receipt, title: tt('label.dataTransaksi'), desc: `${sum?.transaksi ?? '-'} ${tt('misc.transaksiSuffix')}`, page: 'jurnal' },
    { icon: Database, title: tt('label.backupData'), desc: sum ? `${ukuran(sum.ukuranDatabaseBytes)} - ${sum.jumlahBackup} backup` : '-', page: null },
  ];

  async function buatBackup() {
    setBusy(true);
    try {
      const b = await createBackup();
      showToast(`Backup dibuat (${ukuran(b.ukuran)}).`);
      await muat();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal membuat backup.', 'error');
    } finally { setBusy(false); }
  }

  async function hapusBackup(name: string) {
    if (!window.confirm(`Hapus berkas backup ${name}?`)) return;
    try { await deleteBackup(name); await muat(); } catch (err) { showToast(err instanceof ApiError ? err.message : 'Gagal menghapus backup.', 'error'); }
  }

  async function pilihRestore(file: File | null) {
    if (!file) return;
    if (!window.confirm(`Pulihkan database dari "${file.name}"?\n\nData yang dibuat SETELAH backup ini akan tidak ada lagi. Pemulihan diterapkan saat layanan Keuangan dinyalakan ulang, dan database saat ini diamankan otomatis. Lanjutkan?`)) {
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setBusy(true);
    try {
      const msg = await uploadRestore(file);
      showToast(msg);
      await muat();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal mengunggah backup.', 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // Ekspor seluruh data (siswa, pegawai, transaksi) ke satu berkas CSV - tetap ada seperti di Akuntansi.
  async function exportSemuaData() {
    try {
      const [students, employees, tx] = await Promise.all([fetchStudents(), fetchEmployees(), fetchTransactions()]);
      const rows: (string | number | null | undefined)[][] = [];
      rows.push(['=== SISWA ===']);
      rows.push(['No VA', 'Nama', 'NIS', 'Kelas', 'Katalog', 'Status']);
      students.forEach((s) => rows.push([s.vaNumber, s.name, s.nis, s.className, s.katalog, s.status]));
      rows.push([]); rows.push(['=== PEGAWAI ===']);
      rows.push(['Nama', 'NIP', 'Jabatan', 'Tipe', 'Katalog', 'Status']);
      employees.forEach((e) => rows.push([e.name, e.nip, e.jabatan, e.tipe, e.katalog, e.status]));
      rows.push([]); rows.push(['=== TRANSAKSI ===']);
      rows.push(['No Transaksi', 'Tanggal', 'Keterangan', 'Jenis', 'Metode', 'Jumlah']);
      tx.forEach((t) => rows.push([t.txCode, t.txDate, t.description, t.txType, t.paymentMethod, t.amount]));
      downloadCsv('semua-data', rows[0].map(String), rows.slice(1));
      showToast(tt('msg.eksporExcelBerhasil'));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal mengekspor data.', 'error');
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <div key={i} onClick={() => { if (c.page) navigateTo(c.page); }} className={`card-stat bg-dark-800 rounded-xl border border-gray-700/50 p-5 ${c.page ? 'cursor-pointer' : ''}`}>
            <div className="w-10 h-10 rounded-lg bg-brand-500/20 flex items-center justify-center mb-3"><c.icon className="w-5 h-5 text-brand-400" /></div>
            <h4 className="text-sm font-bold text-white">{c.title}</h4>
            <p className="text-[10px] text-gray-500 mt-1">{c.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5 mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h3 className="text-sm font-bold text-white">Backup &amp; Pulihkan Database</h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={buatBackup} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-medium disabled:opacity-50"><Database className="w-3.5 h-3.5" />Buat Backup Sekarang</button>
            <input ref={fileRef} type="file" accept=".db" className="hidden" onChange={(e) => pilihRestore(e.target.files?.[0] ?? null)} />
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-xs font-medium disabled:opacity-50"><Upload className="w-3.5 h-3.5" />Pulihkan dari Berkas</button>
            <ExportBtn onClick={exportSemuaData} />
          </div>
        </div>
        <p className="text-[10px] text-gray-500 mb-3">Backup disimpan di server (30 terbaru) dan bisa diunduh untuk disimpan di tempat lain - sangat disarankan sebelum update aplikasi dan secara berkala.</p>

        {sum?.pemulihanMenunggu && (
          <div className="mb-3 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-300 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1">Ada backup yang MENUNGGU dipulihkan. Restart layanan Keuangan (atau PC server) agar diterapkan - database saat ini diamankan otomatis sebelum diganti.</div>
            <button onClick={async () => { await cancelRestore(); await muat(); }} className="px-2 py-1 rounded bg-dark-900 border border-gray-700 text-gray-300 text-[10px]">Batalkan</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-gray-700/50 text-gray-400 text-left"><th className="pb-2">Berkas backup</th><th className="pb-2">Dibuat</th><th className="pb-2 text-right">Ukuran</th><th className="pb-2 text-right">Aksi</th></tr></thead>
            <tbody>
              {backups.length ? backups.map((b) => (
                <tr key={b.name} className="border-b border-gray-700/30">
                  <td className="py-2 text-gray-200">{b.name}</td>
                  <td className="py-2 text-gray-400">{new Date(b.dibuat).toLocaleString('id-ID')}</td>
                  <td className="py-2 text-right text-gray-400">{ukuran(b.ukuran)}</td>
                  <td className="py-2 text-right">
                    <span className="inline-flex gap-1">
                      <button onClick={() => downloadBackup(b.name).catch(() => showToast('Gagal mengunduh backup.', 'error'))} title="Unduh" className="p-1.5 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/40"><Download className="w-3.5 h-3.5" /></button>
                      <button onClick={() => hapusBackup(b.name)} title="Hapus" className="p-1.5 rounded btn-icon-delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </span>
                  </td>
                </tr>
              )) : <tr><td colSpan={4} className="py-6 text-center text-gray-400">Belum ada backup - klik "Buat Backup Sekarang".</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
