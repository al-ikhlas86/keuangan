import { ExternalLink } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { useToast } from '../contexts/ToastContext';
import { PajakBpjsGrid } from '../components/PajakBpjsGrid';

// Mirror bagian pajak dari PajakBpjsPegawai.tsx (kini dipecah jadi 3 menu
// terpisah: Pajak/BPJS TK/BPJS K, lihat menus.ts) - link Panduan Pajak
// khusus di sini karena memang cuma relevan utk pajak.
export function Pajak() {
  const { tt } = useI18n();
  const { data } = useBootstrap();
  const { showToast } = useToast();
  const taxGuideUrl = data?.org_profile?.tax_guide_url;

  return (
    <div className="space-y-4">
      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">{tt('heading.pajak')}</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">{tt('misc.pajakBpjsInfo')}</p>
          </div>
          {taxGuideUrl ? (
            <a href={taxGuideUrl} target="_blank" rel="noopener" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-gray-300 hover:bg-dark-850 text-xs font-medium flex-shrink-0"><ExternalLink className="w-3.5 h-3.5" />{tt('btn.panduanPajak')}</a>
          ) : (
            <button onClick={() => showToast(tt('msg.aturPanduanDulu'), 'error')} title={tt('msg.aturPanduanDulu')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-gray-400 text-xs font-medium flex-shrink-0"><ExternalLink className="w-3.5 h-3.5" />{tt('btn.panduanPajak')}</button>
          )}
        </div>
      </div>
      <PajakBpjsGrid kelompok="PAJAK" />
    </div>
  );
}
