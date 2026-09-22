import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, Activity, GraduationCap, FileWarning } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useToast } from '../contexts/ToastContext';
import { LineChart } from '../components/LineChart';
import { ExportBtn } from '../components/Buttons';
import { KwitansiBtn } from '../components/Buttons';
import { fmt, computeMonthlyTrend, downloadCsv } from '../lib/format';
import { fetchTransactions, fetchStudents, fetchTagihan, ApiError, type TransactionDto } from '../api';

// Mirror renderDashboard() lama, diporting ulang total ke Fase 1: tanpa data
// Pegawai/Penggajian (Fase 2, lihat plan) - ringkasan siswa dipangkas jadi
// "total siswa aktif" + "tagihan belum lunas" saja (breakdown lunas/belum per
// siswa yang lebih detail ada di halaman Data Siswa/Sudah Lunas/Belum Lunas).
export function Dashboard() {
  const { tt } = useI18n();
  const { role, openKwitansi } = useRole();
  const { showToast } = useToast();
  const [transactions, setTransactions] = useState<TransactionDto[]>([]);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [tagihanBelumLunas, setTagihanBelumLunas] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const showSiswaStats = role !== 'Staff';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const tasks: Promise<void>[] = [
          fetchTransactions().then((t) => { if (!cancelled) setTransactions(t); }),
        ];
        if (showSiswaStats) {
          tasks.push(fetchStudents().then((s) => { if (!cancelled) setStudentCount(s.length); }));
          tasks.push(fetchTagihan().then((t) => { if (!cancelled) setTagihanBelumLunas(t.filter((x) => x.status !== 'Lunas').length); }));
        }
        await Promise.all(tasks);
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Gagal memuat data dashboard.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSiswaStats]);

  const totalMasuk = transactions.filter((t) => t.txType === 'Masuk').reduce((a, t) => a + t.amount, 0);
  const totalKeluar = transactions.filter((t) => t.txType === 'Keluar').reduce((a, t) => a + t.amount, 0);
  const sisa = totalMasuk - totalKeluar;
  const totalCash = transactions.filter((t) => t.paymentMethod === 'Cash').reduce((a, t) => a + t.amount, 0);
  const totalTransfer = transactions.filter((t) => t.paymentMethod === 'Transfer').reduce((a, t) => a + t.amount, 0);

  const stats = [
    { label: tt('stat.totalPemasukan'), value: fmt(totalMasuk), icon: TrendingUp, color: 'bg-emerald-500/20 text-emerald-400' },
    { label: tt('stat.totalPengeluaran'), value: fmt(totalKeluar), icon: TrendingDown, color: 'bg-red-500/20 text-red-400' },
    { label: tt('stat.sisaDana'), value: fmt(sisa), icon: Wallet, color: 'bg-brand-500/20 text-brand-400' },
    { label: tt('stat.totalTransaksi'), value: `${transactions.length} ${tt('stat.unitTransaksi')}`, icon: Activity, color: 'bg-amber-500/20 text-amber-400' },
  ];

  const trend = computeMonthlyTrend(transactions.map((t) => ({ tgl: t.txDate, jenis: t.txType, jumlah: t.amount })));

  const ringkasanStats = showSiswaStats
    ? [
        { label: tt('stat.totalSiswa'), value: studentCount ?? '-', icon: GraduationCap, color: 'bg-brand-500/20 text-brand-400' },
        { label: tt('stat.siswaBelumLunas'), value: tagihanBelumLunas ?? '-', icon: FileWarning, color: 'bg-red-500/20 text-red-400' },
      ]
    : [];

  const recentTransactions = [...transactions].sort((a, b) => (b.txDate || '').localeCompare(a.txDate || '') || b.id - a.id).slice(0, 8);

  const exportCsv = () => downloadCsv('transaksi-terbaru', ['No Transaksi', 'Tanggal', 'Keterangan', 'Jenis', 'Metode', 'Jumlah'],
    transactions.map((t) => [t.txCode, t.txDate, t.description, t.txType, t.paymentMethod, t.amount]));

  if (loading) return <p className="text-sm text-gray-500">Memuat...</p>;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {stats.map((s, i) => (
          <div key={i} className="card-stat bg-dark-800 rounded-xl border border-gray-700/50 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg ${s.color} flex items-center justify-center`}><s.icon className="w-5 h-5" /></div>
            </div>
            <p className="text-[11px] text-gray-500 mb-1">{s.label}</p>
            <p className="text-lg font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-dark-800 rounded-xl border border-gray-700/50 p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-white">{tt('heading.pemasukanVsPengeluaran')}</h3>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1.5 text-gray-400"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#10b981' }} />{tt('misc.pemasukanUpper')}</span>
              <span className="flex items-center gap-1.5 text-gray-400"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#ef4444' }} />{tt('misc.pengeluaranUpper')}</span>
            </div>
          </div>
          <p className="text-[10px] text-gray-500 mb-3">{tt('misc.enamBulanTerakhir')}</p>
          <LineChart trend={trend} h={180} />
        </div>
        <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
          <h3 className="text-sm font-bold text-white mb-3">{tt('heading.metodePembayaran')}</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1"><span className="text-gray-400">{tt('misc.tunaiCash')}</span><span className="text-white font-semibold">{fmt(totalCash)}</span></div>
              <div className="h-2 bg-dark-900 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.round((totalCash / (totalCash + totalTransfer || 1)) * 100)}%` }} /></div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1"><span className="text-gray-400">Transfer</span><span className="text-white font-semibold">{fmt(totalTransfer)}</span></div>
              <div className="h-2 bg-dark-900 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round((totalTransfer / (totalCash + totalTransfer || 1)) * 100)}%` }} /></div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-700/50">
            <p className="text-[10px] text-gray-500">{tt('misc.totalSemua')}</p>
            <p className="text-lg font-bold text-white">{fmt(totalCash + totalTransfer)}</p>
          </div>
        </div>
      </div>

      {ringkasanStats.length > 0 && (
        <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5 mb-6">
          <h3 className="text-sm font-bold text-white mb-3">{tt('heading.ringkasanSiswaPegawai')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            {ringkasanStats.map((s, i) => (
              <div key={i} className="bg-dark-900 rounded-lg p-3">
                <div className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center mb-2`}><s.icon className="w-4 h-4" /></div>
                <p className="text-[10px] text-gray-500 mb-1">{s.label}</p>
                <p className="text-base font-bold text-white">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-white">{tt('heading.transaksiTerbaru')}</h3>
          <ExportBtn onClick={exportCsv} />
        </div>
        <p className="text-[10px] text-gray-500 mb-3">{tt('misc.lihatSemuaDiJurnal')}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700/50 text-gray-400 text-left">
                <th className="pb-3 font-semibold">{tt('col.id')}</th><th className="pb-3 font-semibold">{tt('col.tanggal')}</th>
                <th className="pb-3 font-semibold">{tt('col.keterangan')}</th><th className="pb-3 font-semibold">{tt('col.jenis')}</th>
                <th className="pb-3 font-semibold">{tt('col.metode')}</th><th className="pb-3 font-semibold text-right">{tt('col.jumlah')}</th>
                <th className="pb-3 font-semibold">{tt('col.aksi')}</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.length ? recentTransactions.map((t) => (
                <tr key={t.id} className="border-b border-gray-700/30 hover:bg-dark-850/50">
                  <td className="py-3 text-gray-400">{t.txCode}</td>
                  <td className="py-3 text-gray-300">{t.txDate}</td>
                  <td className="py-3 text-gray-300">{t.description}</td>
                  <td className="py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${t.txType === 'Masuk' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{t.txType}</span></td>
                  <td className="py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${t.paymentMethod === 'Cash' ? 'badge-cash' : 'badge-transfer'}`}>{t.paymentMethod}</span></td>
                  <td className={`py-3 text-right font-semibold ${t.txType === 'Masuk' ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(t.amount)}</td>
                  <td className="py-3"><KwitansiBtn onClick={() => openKwitansi(String(t.id))} /></td>
                </tr>
              )) : <tr><td colSpan={7} className="py-8 text-center text-gray-400">{tt('msg.belumAdaData')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
