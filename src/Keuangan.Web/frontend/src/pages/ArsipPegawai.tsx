import { useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useBootstrap } from '../contexts/BootstrapContext';

const ARSIP_PER_PAGE = 20;

// Mirror renderArsipPegawai() (index.html:2972-2983). Baris nama dibuat bisa
// diklik ke Profil Pegawai (dulu tidak - tabel murni tampilan, tidak ada
// jalan sama sekali utk lihat profil/riwayat pembayaran/cetak ulang slip
// pegawai yang sudah diarsipkan) supaya riwayat pegawai lama tetap bisa
// ditelusuri jangka panjang, bukan cuma daftar nama mati. Pagination
// (20/halaman, pola sama seperti RiwayatPembayaranPanel di SiswaDetail.tsx)
// supaya tabel tidak makin berat dirender begitu arsip menumpuk bertahun-tahun.
export function ArsipPegawai() {
  const { tt } = useI18n();
  const { navigateTo, openEmployeeProfile } = useRole();
  const { data } = useBootstrap();
  const [page, setPage] = useState(0);
  const arsip = (data?.employees || []).filter((e) => !e.is_active);
  const totalPage = Math.max(1, Math.ceil(arsip.length / ARSIP_PER_PAGE));
  const pageClamped = Math.min(page, totalPage - 1);
  const shown = arsip.slice(pageClamped * ARSIP_PER_PAGE, (pageClamped + 1) * ARSIP_PER_PAGE);

  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
      <h3 className="text-sm font-bold text-white mb-4">{tt('heading.arsipPegawai')} ({arsip.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-gray-700/50 text-gray-400 text-left"><th className="pb-3">{tt('col.id')}</th><th className="pb-3">{tt('col.nama')}</th><th className="pb-3">{tt('col.jabatan')}</th><th className="pb-3">{tt('col.tipe')}</th></tr></thead>
          <tbody>
            {shown.length ? shown.map((e) => (
              <tr key={e.db_id} className="border-b border-gray-700/30 hover:bg-dark-850/50">
                <td className="py-3 text-gray-400">{e.id}</td>
                <td className="py-3 text-white"><button onClick={() => { openEmployeeProfile(e.db_id); navigateTo('pegawai_detail'); }} className="hover:underline hover:text-brand-400 text-left">{e.nama}</button></td>
                <td className="py-3 text-gray-300">{e.jabatan}</td><td className="py-3 text-gray-300">{e.tipe}</td>
              </tr>
            )) : <tr><td colSpan={4} className="py-8 text-center text-gray-400">{tt('misc.belumDiarsipkan')}</td></tr>}
          </tbody>
        </table>
      </div>
      {totalPage > 1 && (
        <div className="flex items-center justify-between mt-3 text-[10px] text-gray-400">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={pageClamped === 0} className="px-2.5 py-1 rounded bg-dark-900 border border-gray-700 hover:bg-dark-850 disabled:opacity-40">{tt('btn.sebelumnya')}</button>
          <span>{tt('misc.halaman')} {pageClamped + 1} / {totalPage}</span>
          <button onClick={() => setPage((p) => Math.min(totalPage - 1, p + 1))} disabled={pageClamped >= totalPage - 1} className="px-2.5 py-1 rounded bg-dark-900 border border-gray-700 hover:bg-dark-850 disabled:opacity-40">{tt('btn.berikutnya')}</button>
        </div>
      )}
    </div>
  );
}
