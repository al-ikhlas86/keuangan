import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_FOUNDATION_NAME, DEFAULT_FOUNDATION_ADDRESS } from '../lib/consts';

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

  useEffect(() => {
    fetch('/health').then((r) => r.json()).then((d) => setHealth(d)).catch(() => setHealth(null));
  }, []);

  return (
    <div className="max-w-2xl space-y-4">
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
