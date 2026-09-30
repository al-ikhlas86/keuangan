import { useI18n } from '../contexts/I18nContext';
import { PajakBpjsGrid } from '../components/PajakBpjsGrid';

export function BpjsK() {
  const { tt } = useI18n();
  return (
    <div className="space-y-4">
      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-sm font-bold text-white">{tt('heading.bpjsK')}</h3>
        <p className="text-[10px] text-gray-400 mt-0.5">{tt('misc.pajakBpjsInfo')}</p>
      </div>
      <PajakBpjsGrid kelompok="BPJS_K" />
    </div>
  );
}
