import { useI18n } from '../contexts/I18nContext';

// Mirror namaPengurusOrPlaceholder() (index.html:4025-4027). OrgOfficial
// (data pengurus) Fase 2 - `official` di Fase 1 SELALU undefined, komponen
// ini dipertahankan sbg placeholder tanda tangan yang konsisten tampilannya.
export function PengurusSignature({ official, fallbackJabatan }: { official: { name: string; jabatan: string } | undefined; fallbackJabatan: string }) {
  const { tt } = useI18n();
  return (
    <>
      {official ? <p className="font-semibold text-white underline">{official.name}</p> : <p className="text-[10px] italic text-gray-500">({tt('misc.jabatanBelumDiisi')})</p>}
      <p className="text-gray-500">{official ? official.jabatan : fallbackJabatan}</p>
    </>
  );
}
