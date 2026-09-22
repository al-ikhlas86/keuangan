import { useI18n } from '../contexts/I18nContext';
import { usePeriodFilter, type PeriodPreset } from '../contexts/PeriodFilterContext';

// Mirror periodFilterBar() (index.html:1122-1140).
export function PeriodFilterBar({ ns }: { ns: string }) {
  const { tt } = useI18n();
  const { get, setPreset, setCustom } = usePeriodFilter();
  const st = get(ns);
  const presets: { key: PeriodPreset; label: string }[] = [
    { key: 'hari', label: tt('filter.hariIni') },
    { key: 'minggu', label: tt('filter.mingguIni') },
    { key: 'bulan', label: tt('filter.bulanIni') },
    { key: 'tahun', label: tt('filter.tahunIni') },
    { key: 'semua', label: tt('filter.semua') },
  ];
  return (
    <div className="no-print flex flex-wrap items-center gap-2 mb-4">
      {presets.map((p) => (
        <button key={p.key} onClick={() => setPreset(ns, p.key)} className={`px-3 py-1.5 rounded-lg text-[10px] font-medium ${st.period === p.key ? 'bg-brand-600 text-white' : 'bg-dark-900 border border-gray-700 text-gray-400 hover:bg-dark-850'}`}>
          {p.label}
        </button>
      ))}
      <span className="text-gray-600 text-[10px]">|</span>
      <input type="date" value={st.from} onChange={(e) => setCustom(ns, e.target.value, st.to)} className="bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-[10px] text-gray-300 focus:outline-none focus:border-brand-500" />
      <span className="text-gray-500 text-[10px]">-</span>
      <input type="date" value={st.to} onChange={(e) => setCustom(ns, st.from, e.target.value)} className="bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-[10px] text-gray-300 focus:outline-none focus:border-brand-500" />
    </div>
  );
}
