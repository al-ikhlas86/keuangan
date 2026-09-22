import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { translations, type Lang } from '../i18n';

// Mirror `currentLang`/`tt()`/`switchLang()` dari index.html:178,441-446 -
// perilaku identik: default 'id', dipersist ke localStorage key 'lang',
// fallback ke translations.id lalu ke key mentah kalau tidak ketemu.
interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  tt: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('lang') as Lang) || 'id');

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStorage.setItem('lang', next);
  }, []);

  const tt = useCallback(
    (key: string) => translations[lang]?.[key] || translations.id[key] || key,
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, tt }), [lang, setLang, tt]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
