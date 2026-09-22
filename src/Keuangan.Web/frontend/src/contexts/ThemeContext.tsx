import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// Mirror toggleTheme()/loadTheme() di index.html:822-844: default light-mode=true,
// dipersist ke localStorage key 'themeMode', diterapkan sebagai class 'light-mode' di <body>
// (dipakai luas oleh override CSS body.light-mode.* di index.css).
interface ThemeContextValue {
  isLight: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isLight, setIsLight] = useState(() => localStorage.getItem('themeMode') !== 'dark');

  useEffect(() => {
    document.body.classList.toggle('light-mode', isLight);
  }, [isLight]);

  const value = useMemo(
    () => ({
      isLight,
      toggleTheme: () => {
        setIsLight((v) => {
          const next = !v;
          localStorage.setItem('themeMode', next ? 'light' : 'dark');
          return next;
        });
      },
    }),
    [isLight],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
