import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { StudentDto } from '../api';

// Combobox ketik-untuk-cari (bukan <select> polos) - ketik nama/NIS, pilih
// dari daftar yang muncul. Dipakai di halaman-halaman yang butuh pilih siswa
// dari daftar panjang (Terima Pembayaran, Tagihan).
export function StudentSearchSelect({
  students, value, onChange, placeholder,
}: {
  students: StudentDto[];
  value: number | null;
  onChange: (id: number) => void;
  placeholder?: string;
}) {
  const selected = students.find((s) => s.id === value);
  const selectedLabel = selected ? `${selected.nis} - ${selected.name}` : '';
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!open) setQuery(selectedLabel); }, [selectedLabel, open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selectedLabel);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLabel]);

  const q = query.trim().toLowerCase();
  const filtered = q === ''
    ? students
    : students.filter((s) => s.name.toLowerCase().includes(q) || s.nis.toLowerCase().includes(q));

  function pick(s: StudentDto) {
    onChange(s.id);
    setQuery(`${s.nis} - ${s.name}`);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-dark-900 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500"
        />
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-700 bg-dark-900 shadow-lg">
          {filtered.length ? filtered.map((s) => (
            <button
              type="button"
              key={s.id}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-dark-850 ${s.id === value ? 'bg-dark-850 text-brand-400' : 'text-gray-300'}`}
            >
              <span className="text-gray-500">{s.nis}</span> - {s.name}
            </button>
          )) : (
            <p className="px-3 py-2 text-xs text-gray-500">Tidak ditemukan</p>
          )}
        </div>
      )}
    </div>
  );
}
