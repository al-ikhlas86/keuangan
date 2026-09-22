import { useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useRole } from '../contexts/RoleContext';
import { useToast } from '../contexts/ToastContext';
import { AssetImgWithFallback } from '../components/AssetImgWithFallback';
import { PengurusSignature } from '../components/PengurusSignature';
import { fetchTransactionDetail, ApiError, type TransactionDetailDto } from '../api';
import { fmt, terbilang, formatTanggalPanjang } from '../lib/format';
import { KWITANSI_LOGO_URL, STEMPEL_URL, KWITANSI_ORG_NAME, KWITANSI_ORG_ADDRESS_LINE1, KWITANSI_ORG_ADDRESS_LINE2, KWITANSI_ORG_PHONE, KWITANSI_ORG_CITY } from '../lib/consts';

// Disederhanakan Fase 1: rincian per-item pembayaran (breakdown per jenis+
// periode dalam 1 transaksi) DITUNDA - backend belum punya endpoint GET
// Payments per transaksi (PaymentsEndpoints.cs cuma POST). Kwitansi di sini
// menampilkan deskripsi transaksi sbg 1 baris tunggal. Tanda tangan pengurus
// (OrgOfficial) & log cetak (logKwitansiPrint) juga Fase 2 - cetak langsung
// window.print() tanpa server-side logging.
export function Kwitansi() {
  const { tt } = useI18n();
  const { kwitansiTxId, closeKwitansi } = useRole();
  const { showToast } = useToast();
  const [t, setT] = useState<TransactionDetailDto | null>(null);
  const [diterimaOleh, setDiterimaOleh] = useState('');

  useEffect(() => {
    if (!kwitansiTxId) return;
    fetchTransactionDetail(Number(kwitansiTxId)).then(setT).catch((err) => showToast(err instanceof ApiError ? err.message : 'Gagal memuat transaksi.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kwitansiTxId]);

  const isMasuk = t?.txType === 'Masuk';
  useEffect(() => {
    const el = document.getElementById('dynamicPageStyle');
    if (el) el.textContent = isMasuk ? '@page{size:9.5in 5.5in;margin:0.1in 0.5in;}' : '';
  }, [isMasuk]);

  if (!t) {
    return <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-6 text-center text-xs text-gray-400">{tt('msg.belumAdaData')}</div>;
  }

  const labelPihak = isMasuk ? tt('misc.telahTerimaDari') : tt('misc.telahDibayarkanKepada');
  const labelPenerima = isMasuk ? tt('misc.diterimaOleh') : tt('misc.dibayarkanOleh');

  return (
    <>
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-4">
        <button onClick={closeKwitansi} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white"><ArrowLeft className="w-3.5 h-3.5" />{tt('btn.kembali')}</button>
        <div className="flex items-center gap-2">
          <input value={diterimaOleh} onChange={(e) => setDiterimaOleh(e.target.value)} placeholder={tt('misc.namaKasirAkuntan')} className="px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-xs focus:outline-none focus:border-brand-500" />
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 text-xs font-medium"><Printer className="w-3.5 h-3.5" />{tt('btn.cetak')}</button>
        </div>
      </div>
      <div className="kwitansi-paper max-w-2xl mx-auto bg-white text-gray-800 rounded-xl shadow-xl border border-gray-300 p-8">
        <div className="kwitansi-header flex items-start justify-between border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <AssetImgWithFallback
              url={KWITANSI_LOGO_URL} alt="Logo" className="w-16 h-16 object-contain flex-shrink-0"
              fallback={<div className="w-16 h-16 rounded border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-[9px] text-center leading-tight flex-shrink-0">{tt('misc.logoPlaceholder')}</div>}
            />
            <div>
              <p className="text-sm font-extrabold uppercase tracking-wide">{KWITANSI_ORG_NAME}</p>
              <p className="text-[10px] text-gray-500">{KWITANSI_ORG_ADDRESS_LINE1}</p>
              <p className="text-[10px] text-gray-500">{KWITANSI_ORG_ADDRESS_LINE2}</p>
              <p className="text-[10px] text-gray-500">Telp. {KWITANSI_ORG_PHONE}</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <h2 className="text-base font-extrabold tracking-wide text-gray-700 uppercase">{tt('misc.buktiPembayaranKwitansi')}</h2>
            <p className="text-[10px] text-gray-500 mt-1">{tt('misc.nomorTransaksi')}: <span className="font-mono">{t.txCode}</span></p>
          </div>
        </div>
        <div className="kwitansi-body space-y-3 text-sm">
          <div className="flex gap-2 items-end">
            <span className="w-40 text-gray-500 flex-shrink-0">{labelPihak}</span>
            <span className="flex-1 font-semibold border-b border-dotted border-gray-400">{t.description}</span>
          </div>
          <div className="flex gap-2"><span className="w-40 text-gray-500 flex-shrink-0">{tt('misc.uangSejumlah')}</span><span className="flex-1 font-semibold border-b border-dotted border-gray-400">{terbilang(t.amount)}</span></div>
          <div className="flex gap-2"><span className="w-40 text-gray-500 flex-shrink-0">{tt('col.metode')}</span><span className="flex-1 border-b border-dotted border-gray-400">{t.paymentMethod}</span></div>
          {t.senderNote && <div className="flex gap-2"><span className="w-40 text-gray-500 flex-shrink-0">{tt('col.senderNote')}</span><span className="flex-1 text-xs text-gray-600">{t.senderNote}</span></div>}
          <div className="flex gap-2 justify-between border-t-2 border-gray-800 pt-2 mt-2">
            <span className="font-bold">{tt('col.total')}</span>
            <span className="font-bold">{fmt(t.amount)}</span>
          </div>
        </div>
        <div className="kwitansi-footer text-right text-xs mt-10 ml-auto" style={{ width: 220 }}>
          <p className="text-gray-600">{KWITANSI_ORG_CITY}, {formatTanggalPanjang(t.txDate)}</p>
          <div className="h-14 flex items-end justify-end"><AssetImgWithFallback url={STEMPEL_URL} alt="Stempel" className="w-16 h-16 object-contain opacity-90" /></div>
          <p className="border-t border-gray-400 pt-1"><PengurusSignature official={undefined} fallbackJabatan={labelPenerima} /></p>
          <p className="print-only font-semibold">({diterimaOleh})</p>
          <p className="no-print text-gray-400 text-[9px]">{labelPenerima} &mdash; {tt('misc.ketikNamaDiAtas')}</p>
        </div>
      </div>
    </>
  );
}
