import { Fragment, useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { fetchCalonSiswa, ApiError, type CalonSiswaDto } from '../api';
import { fmt } from '../lib/format';

// Calon siswa dari PSB (diterima, belum jadi siswa di Data Master). Tagihan awal dibuat otomatis oleh sinkron (jenis pembayaran bertanda
// "tagih saat daftar"); pembayarannya dicatat di menu Terima Pembayaran. Status lunas dikirim ke Data Master: calon baru bisa masuk kelas setelah lunas.
const LABEL: Record<CalonSiswaDto['statusAwal'], { teks: string; kelas: string }> = {
  lunas: { teks: 'Lunas', kelas: 'bg-emerald-500/20 text-emerald-400' },
  sebagian: { teks: 'Sebagian', kelas: 'bg-amber-500/20 text-amber-400' },
  belum: { teks: 'Belum bayar', kelas: 'bg-red-500/20 text-red-400' },
  tanpa_tagihan: { teks: 'Belum ada tagihan', kelas: 'bg-gray-500/20 text-gray-300' },
};

export function CalonSiswa() {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [items, setItems] = useState<CalonSiswaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [buka, setBuka] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      fetchCalonSiswa(q.trim() || undefined)
        .then((d) => { if (!cancelled) setItems(d); })
        .catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat calon siswa.', 'error'))
        .finally(() => { if (!cancelled) setLoading(false); });
    }, q ? 300 : 0);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const tanpaTagihan = items.some((x) => x.status === 'Calon' && x.statusAwal === 'tanpa_tagihan');

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-white">{tt('menu.calon_siswa')} ({items.length})</h3>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / nomor pendaftaran"
          className="bg-dark-900 border border-gray-700/50 rounded-lg px-3 py-1.5 text-xs text-white w-full sm:w-64" />
      </div>
      {tanpaTagihan && (
        <p className="text-xs text-amber-400 mb-3">
          Ada calon yang belum punya tagihan awal. Buka menu Jenis Pembayaran: pastikan ada jenis Wajib dengan nominal dan opsi "tagih saat daftar" aktif
          (contoh bawaan: BOP), tagihan dibuat otomatis pada sinkronisasi berikutnya.
        </p>
      )}
      {loading ? <p className="text-xs text-gray-500 py-4">Memuat...</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700/50 text-gray-400 text-left">
                <th className="pb-2">{tt('col.nama')}</th><th className="pb-2">No. Pendaftaran</th><th className="pb-2">Katalog</th>
                <th className="pb-2">Tahun Ajaran</th><th className="pb-2 text-right">Tagihan awal</th>
                <th className="pb-2 text-right">Dibayar</th><th className="pb-2">{tt('col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? items.map((c) => {
                const l = LABEL[c.statusAwal] ?? LABEL.tanpa_tagihan;
                return (
                  <Fragment key={c.id}>
                    <tr className="border-b border-gray-700/30 cursor-pointer hover:bg-white/5" onClick={() => setBuka(buka === c.id ? null : c.id)}>
                      <td className="py-2 text-white font-medium">
                        {c.nama}
                        {c.sudahJadiSiswa && <span className="ml-2 text-[10px] text-sky-400">sudah jadi siswa</span>}
                        {c.status === 'Keluar' && !c.sudahJadiSiswa && <span className="ml-2 text-[10px] text-gray-400">mundur</span>}
                      </td>
                      <td className="py-2 text-gray-300">{c.nomor}</td>
                      <td className="py-2 text-gray-300">{c.katalog ?? '-'}</td>
                      <td className="py-2 text-gray-300">{c.tahunAjaran ?? '-'}</td>
                      <td className="py-2 text-right text-gray-300">{fmt(c.totalAwal)}</td>
                      <td className="py-2 text-right text-emerald-400">{fmt(c.dibayarAwal)}</td>
                      <td className="py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${l.kelas}`}>{l.teks}</span></td>
                    </tr>
                    {buka === c.id && (
                      <tr className="border-b border-gray-700/30 bg-dark-900/50">
                        <td colSpan={7} className="py-2 px-3">
                          {c.tagihan.length ? c.tagihan.map((t) => (
                            <div key={t.id} className="flex justify-between gap-3 text-gray-300 py-0.5">
                              <span>{t.kode} - {t.jenis} ({t.periode})</span>
                              <span>{fmt(t.dibayar)} / {fmt(t.jumlah)}</span>
                            </div>
                          )) : <span className="text-gray-400">Belum ada tagihan awal.</span>}
                          <p className="text-gray-500 mt-1">Pembayaran dicatat di menu Terima Pembayaran (cari nama calon).</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              }) : <tr><td colSpan={7} className="py-8 text-center text-gray-400">{tt('misc.tidakAdaData')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
