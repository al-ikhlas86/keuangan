import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_FOUNDATION_NAME, DEFAULT_FOUNDATION_ADDRESS } from '../lib/consts';
import { fetchVersionInfo, type VersionInfoDto } from '../api';

// Disederhanakan total Fase 1: Info Yayasan (nama/alamat) tetap statis dari
// lib/consts.ts (SAMA seperti Akuntansi lama - form "simpan"-nya di sana
// TIDAK PERNAH benar2 menyimpan apa pun ke server, cuma toast palsu, jadi
// di sini jujur ditampilkan sbg info baca-saja drpd meniru form yang tidak
// bekerja). Penomoran Dokumen/Data Pengurus/Panduan Pajak DITUNDA - backend
// belum expose endpoint utk itu (DocumentNumberService.cs baru dipakai
// internal saat generate nomor, belum ada API utk admin mengatur formatnya;
// OrgOfficial/tax-guide-url memang Fase 2).
export function Pengaturan() {
  const { tt } = useI18n();
  const { mode, user } = useAuth();
  const [health, setHealth] = useState<{ service: string } | null>(null);
  const [ver, setVer] = useState<VersionInfoDto | null>(null);
  const [verState, setVerState] = useState<'muat' | 'ok' | 'tidak_ada'>('muat');
  const uiVersion = __APP_VERSION__;

  // force=true -> abaikan cache 10 menit di server (tombol "Cek ulang").
  const muatVersi = (force = false) => {
    setVerState('muat');
    fetchVersionInfo(force)
      .then((d) => { setVer(d); setVerState('ok'); })
      .catch(() => { setVer(null); setVerState('tidak_ada'); });
  };

  useEffect(() => {
    fetch('/health').then((r) => r.json()).then((d) => setHealth(d)).catch(() => setHealth(null));
    muatVersi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tampilan (UI) & server harusnya SAMA - beda = update setengah jalan (berkas baru, layanan masih kode lama).
  const uiBeda = !!ver && uiVersion !== 'dev' && uiVersion !== ver.version;
  const terbaru = !!ver && !uiBeda && ver.latest.status === 'terbaru';

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">Versi Aplikasi</h3>
          <button onClick={() => muatVersi(true)} disabled={verState === 'muat'} className="text-[10px] text-brand-400 hover:text-brand-300 disabled:opacity-50">
            {verState === 'muat' ? 'Memeriksa...' : 'Cek ulang'}
          </button>
        </div>

        {verState === 'tidak_ada' && (
          <p className="text-xs text-amber-400 mb-3">Server ini belum mendukung info versi - kemungkinan besar server belum ter-update ke versi terbaru. Restart layanan Keuangan di PC server (atau restart PC-nya), lalu buka ulang aplikasi.</p>
        )}
        {ver && uiBeda && (
          <p className="text-xs text-amber-400 mb-3">Update belum tuntas: tampilan sudah v{uiVersion} tetapi server masih v{ver.version}. Restart layanan Keuangan di PC server (atau restart PC-nya) supaya server memakai versi baru.</p>
        )}
        {ver && !uiBeda && ver.latest.status === 'ada_update' && (
          <p className="text-xs text-amber-400 mb-3">Ada versi baru ({ver.latest.tag}). Tutup lalu buka ulang aplikasi Keuangan di PC server - update terpasang otomatis saat dibuka.</p>
        )}
        {terbaru && <p className="text-xs text-emerald-400 mb-3">Sudah versi terbaru.</p>}
        {ver && !uiBeda && ver.latest.status === 'tidak_bisa_dicek' && (
          <p className="text-xs text-gray-400 mb-3">Rilis terbaru tidak bisa dicek sekarang (tidak ada internet?). Aplikasi tetap bisa dipakai seperti biasa.</p>
        )}

        <div className="space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-gray-500">Versi server</span><span className="text-white">{ver ? `v${ver.version}` : verState === 'muat' ? '...' : 'tidak diketahui'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Versi tampilan</span><span className={uiBeda ? 'text-amber-400' : 'text-white'}>{uiVersion === 'dev' ? 'dev (build lokal)' : `v${uiVersion}`}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Server aktif sejak</span><span className="text-white">{ver ? new Date(ver.startedAt).toLocaleString('id-ID') : '-'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Versi database</span><span className="text-white text-right max-w-[60%] break-all">{ver?.databaseMigration ?? '-'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Rilis terbaru di GitHub</span>
            <span className={ver?.latest.status === 'ada_update' ? 'text-amber-400' : 'text-white'}>{ver?.latest.tag ?? '-'}</span>
          </div>
        </div>
      </div>

      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-sm font-bold text-white mb-4">{tt('heading.informasiYayasan')}</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-gray-500">{tt('label.namaYayasan')}</span><span className="text-white">{DEFAULT_FOUNDATION_NAME}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">{tt('label.alamat')}</span><span className="text-white text-right max-w-[60%]">{DEFAULT_FOUNDATION_ADDRESS}</span></div>
        </div>
      </div>

      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-sm font-bold text-white mb-3">{tt('heading.informasiSistem')}</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-gray-500">Akun</span><span className="text-white">{user ? `${user.fullName} (${user.role})` : 'Mode Developer'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Mode Instalasi</span><span className="text-white capitalize">{mode || '-'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Status Server</span><span className={health ? 'text-emerald-400' : 'text-red-400'}>{health ? `${health.service} - OK` : 'Tidak terhubung'}</span></div>
        </div>
      </div>
    </div>
  );
}
