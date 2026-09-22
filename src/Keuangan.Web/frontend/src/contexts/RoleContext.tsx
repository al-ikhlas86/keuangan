import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { menus, flattenMenuPages, type RoleKey } from '../menus';
import { setDevRole } from '../api';

export type Role = RoleKey;

// Halaman detail/transien butuh state tambahan (id yang dipilih) yang tidak ikut
// tersimpan lewat refresh - sama seperti NON_PERSISTABLE_PAGES di index.html:680.
const NON_PERSISTABLE_PAGES = new Set(['siswa_detail', 'kwitansi']);

interface RoleContextValue {
  role: Role;
  page: string;
  expandedGroups: Record<string, boolean>;
  switchRole: (role: Role) => void;
  canSwitchRole: boolean;
  navigateTo: (page: string) => void;
  toggleGroup: (key: string) => void;
  kwitansiTxId: string | null;
  openKwitansi: (txDbId: string) => void;
  closeKwitansi: () => void;
  siswaDetailId: string | null;
  openStudentProfile: (dbId: string) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

function firstPageFor(role: Role): string {
  const first = menus[role][0];
  return 'group' in first && first.group ? first.children[0].page : (first as { page: string }).page;
}

function persistNavState(role: Role, page: string) {
  localStorage.setItem('lastRole', role);
  if (!NON_PERSISTABLE_PAGES.has(page)) localStorage.setItem('lastPage', page);
}

// Mirror initApp() di index.html:4512-4530: pulihkan role/page terakhir dari
// localStorage kalau valid, jatuh balik ke role pertama/halaman pertama role itu.
function restoreInitialState(preferredRole: Role): { role: Role; page: string } {
  const savedRole = localStorage.getItem('lastRole') as Role | null;
  const restoredRole: Role = savedRole && menus[savedRole] ? savedRole : preferredRole;
  const savedPage = localStorage.getItem('lastPage');
  const page = savedPage && flattenMenuPages(restoredRole).includes(savedPage) ? savedPage : firstPageFor(restoredRole);
  return { role: restoredRole, page };
}

// forcedRole: diisi AuthContext saat mode "server"/"klien" (login sungguhan) -
// role IKUT AKUN yang login, dropdown role-switcher TIDAK ADA/disabled. Null
// di mode "developer" (dropdown bebas, persis Akuntansi lama).
export function RoleProvider({ children, forcedRole }: { children: ReactNode; forcedRole?: Role | null }) {
  const [{ role, page }, setState] = useState(() => restoreInitialState(forcedRole || 'AdminManager'));
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [kwitansiTxId, setKwitansiTxId] = useState<string | null>(null);
  const kwitansiReturnPage = useRef<string | null>(null);
  const [siswaDetailId, setSiswaDetailId] = useState<string | null>(null);

  // Akun sungguhan login sbg role X -> paksa role = X, sinkron kalau berubah
  // (mis. admin ganti role akun ybs dari Kelola Pengguna lalu re-login).
  useEffect(() => {
    if (forcedRole && forcedRole !== role) {
      const nextPage = firstPageFor(forcedRole);
      setState({ role: forcedRole, page: nextPage });
      persistNavState(forcedRole, nextPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedRole]);

  // X-Dev-Role dikirim api.ts HANYA kalau backend mode developer - di
  // server/klien header ini diabaikan backend, aman selalu di-set di sini.
  useEffect(() => {
    setDevRole(role);
  }, [role]);

  const switchRole = useCallback((next: Role) => {
    if (forcedRole) return; // dropdown mati saat login sungguhan (server/klien)
    const nextPage = firstPageFor(next);
    setState({ role: next, page: nextPage });
    persistNavState(next, nextPage);
  }, [forcedRole]);

  const navigateTo = useCallback((next: string) => {
    setState((s) => {
      persistNavState(s.role, next);
      return { role: s.role, page: next };
    });
  }, []);

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((g) => ({ ...g, [key]: !g[key] }));
  }, []);

  // Mirror bukaKwitansi() (index.html:1245-1249).
  const openKwitansi = useCallback((txDbId: string) => {
    setState((s) => {
      if (s.page !== 'kwitansi') kwitansiReturnPage.current = s.page;
      persistNavState(s.role, 'kwitansi');
      return { role: s.role, page: 'kwitansi' };
    });
    setKwitansiTxId(txDbId);
  }, []);

  const closeKwitansi = useCallback(() => {
    const back = kwitansiReturnPage.current || 'dashboard';
    navigateTo(back);
  }, [navigateTo]);

  const openStudentProfile = useCallback((dbId: string) => setSiswaDetailId(dbId), []);

  const value = useMemo(
    () => ({
      role, page, expandedGroups, switchRole, canSwitchRole: !forcedRole, navigateTo, toggleGroup,
      kwitansiTxId, openKwitansi, closeKwitansi, siswaDetailId, openStudentProfile,
    }),
    [role, page, expandedGroups, switchRole, forcedRole, navigateTo, toggleGroup, kwitansiTxId, openKwitansi, closeKwitansi, siswaDetailId, openStudentProfile],
  );
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used inside RoleProvider');
  return ctx;
}
