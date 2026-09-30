import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchPayrollMeta, type PayrollMeta, type OfficialDto } from '../api';
import { useRole } from './RoleContext';

// Data penggajian (komponen, grup, template slip, pegawai, pengaturan) sekali muat dan dibagi ke
// semua halaman penggajian. Namanya "Bootstrap" sengaja meniru BootstrapContext Akuntansi supaya
// halaman hasil port hanya perlu sedikit perubahan; isinya sudah dipetakan ke bentuk Akuntansi
// (lihat api.ts fetchPayrollMeta). Hanya AdminManager/Staff yang boleh membaca (403 utk peran lain
// -> data tetap null, halaman penggajian memang tidak ada di menu mereka).
export interface BootstrapData extends PayrollMeta {
  officials: OfficialDto[];
  org_profile: { foundation_name?: string; tax_guide_url?: string };
}

interface Ctx { data: BootstrapData | null; refetch: () => Promise<void> }
const BootstrapContext = createContext<Ctx>({ data: null, refetch: async () => {} });

export function BootstrapProvider({ children }: { children: ReactNode }) {
  const { role } = useRole();
  const [data, setData] = useState<BootstrapData | null>(null);
  const allowed = role === 'AdminManager' || role === 'Staff';

  const refetch = useCallback(async () => {
    if (!allowed) { setData(null); return; }
    try {
      const m = await fetchPayrollMeta();
      const officials: OfficialDto[] = [];
      if (m.settings.signSpv) officials.push({ name: m.settings.signSpv, jabatan: 'Spv. Keuangan' });
      if (m.settings.signAdm) officials.push({ name: m.settings.signAdm, jabatan: 'Adm. Keuangan' });
      setData({ ...m, officials, org_profile: { tax_guide_url: m.settings.taxGuideUrl || undefined } });
    } catch { setData(null); }
  }, [allowed]);

  useEffect(() => { refetch(); }, [refetch, role]);

  const value = useMemo(() => ({ data, refetch }), [data, refetch]);
  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBootstrap() {
  return useContext(BootstrapContext);
}
