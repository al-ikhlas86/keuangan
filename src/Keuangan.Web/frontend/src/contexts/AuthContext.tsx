import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, fetchAuthMode, fetchMe, fetchSetupStatus, login as apiLogin, logout as apiLogout, type CurrentUser, type InstallMode } from '../api';

// BARU (Akuntansi lama/Django+React tidak punya login sungguhan sama sekali -
// role cuma dropdown browser tanpa password, lihat Context di plan file).
// Mode instalasi MENENTUKAN apakah alur ini bahkan dijalankan:
//   - "developer": layar ini langsung lompat ke 'developer-dropdown' - frontend
//     TIDAK PERNAH panggil /api/auth/login, role datang dari dropdown bebas
//     (RoleContext, disuntik lewat header X-Dev-Role - lihat api.ts::setDevRole).
//   - "server"/"klien": WAJIB login. needsSetup=true (tabel Users kosong,
//     hanya mungkin di mode "server" instalasi baru) -> wizard admin pertama.
export type AuthPhase = 'loading' | 'developer-dropdown' | 'needs-setup' | 'needs-login' | 'authenticated';

interface AuthContextValue {
  phase: AuthPhase;
  mode: InstallMode | null;
  user: CurrentUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  onSetupComplete: () => void;
  loginError: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AuthPhase>('loading');
  const [mode, setMode] = useState<InstallMode | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  const resolve = useCallback(async () => {
    setPhase('loading');
    try {
      const { mode: resolvedMode } = await fetchAuthMode();
      setMode(resolvedMode);
      if (resolvedMode === 'developer') {
        setPhase('developer-dropdown');
        return;
      }
      const { needsSetup } = await fetchSetupStatus();
      if (needsSetup) {
        setPhase('needs-setup');
        return;
      }
      try {
        const me = await fetchMe();
        setUser(me);
        setPhase('authenticated');
      } catch {
        setPhase('needs-login');
      }
    } catch {
      // Backend belum siap/network error - anggap developer supaya layar
      // tidak macet putih total saat dev server React jalan duluan.
      setPhase('developer-dropdown');
    }
  }, []);

  useEffect(() => {
    resolve();
  }, [resolve]);

  const login = useCallback(async (username: string, password: string) => {
    setLoginError(null);
    try {
      const me = await apiLogin(username, password);
      setUser(me);
      setPhase('authenticated');
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : 'Login gagal.');
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setPhase('needs-login');
  }, []);

  const onSetupComplete = useCallback(() => {
    setPhase('needs-login');
  }, []);

  const value = useMemo(
    () => ({ phase, mode, user, login, logout, onSetupComplete, loginError }),
    [phase, mode, user, login, logout, onSetupComplete, loginError],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
