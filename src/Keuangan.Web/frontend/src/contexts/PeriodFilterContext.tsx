import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

// Mirror periodFilterState/getPeriodFilter/setPeriodFilter/setPeriodCustom (index.html:1110-1155).
// State per-namespace bertahan selintas navigasi (bukan di localStorage), sama seperti global var lama.
export type PeriodPreset = 'hari' | 'minggu' | 'bulan' | 'tahun' | 'semua' | 'custom';
export interface PeriodFilterState { period: PeriodPreset; from: string; to: string }

interface PeriodFilterContextValue {
  get: (ns: string) => PeriodFilterState;
  setPreset: (ns: string, period: PeriodPreset) => void;
  setCustom: (ns: string, from: string, to: string) => void;
}

const DEFAULT_STATE: PeriodFilterState = { period: 'semua', from: '', to: '' };
const PeriodFilterContext = createContext<PeriodFilterContextValue | null>(null);

export function PeriodFilterProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<Record<string, PeriodFilterState>>({});

  const value = useMemo<PeriodFilterContextValue>(() => ({
    get: (ns) => states[ns] || DEFAULT_STATE,
    setPreset: (ns, period) => setStates((s) => ({ ...s, [ns]: { period, from: period === 'custom' ? (s[ns]?.from || '') : '', to: period === 'custom' ? (s[ns]?.to || '') : '' } })),
    setCustom: (ns, from, to) => setStates((s) => ({ ...s, [ns]: { period: (from || to) ? 'custom' : 'semua', from, to } })),
  }), [states]);

  return <PeriodFilterContext.Provider value={value}>{children}</PeriodFilterContext.Provider>;
}

export function usePeriodFilter() {
  const ctx = useContext(PeriodFilterContext);
  if (!ctx) throw new Error('usePeriodFilter must be used inside PeriodFilterProvider');
  return ctx;
}
