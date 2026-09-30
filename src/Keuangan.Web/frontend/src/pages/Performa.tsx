import { Activity } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';

// Mirror renderPerforma() (index.html:2960-2970).
export function Performa() {
  const { tt } = useI18n();
  return (
    <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-10 text-center">
      <Activity className="w-10 h-10 text-gray-600 mx-auto mb-3" />
      <h3 className="text-sm font-bold text-white mb-1">{tt('msg.segeraHadir')}</h3>
      <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">{tt('msg.performaDesc')}</p>
    </div>
  );
}
