import { useEffect, useRef, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';

export interface TagOption { id: string; label: string; badge?: string; badgeClass?: string }

// Klik-untuk-pilih, hasilnya tampil sebagai tag/chip yang bisa dihapus satu-
// satu - bukan daftar centang panjang. Bisa pilih lebih dari satu (dipakai
// caller sebagai "kalau lebih dari 1 berarti dijumlah"). `options` yang
// dikirim ke sini HARUS sudah dikecualikan dari yang sedang dipakai di
// tempat lain (exclusive) oleh pemanggil - komponen ini murni tampilan.
export function TagPicker({ options, selected, onChange, placeholder, extra }: {
  options: TagOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  extra?: (id: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selectedOptions = selected.map((id) => options.find((o) => o.id === id)).filter((o): o is TagOption => !!o);
  const available = options.filter((o) => !selected.includes(o.id) && o.label.toLowerCase().includes(query.toLowerCase()));

  function pick(id: string) {
    onChange([...selected, id]);
    setQuery('');
    setOpen(false);
  }
  function remove(id: string) {
    onChange(selected.filter((x) => x !== id));
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="space-y-1 mb-1.5">
        {selectedOptions.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-2 bg-dark-900 border border-gray-700 rounded-lg px-2.5 py-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {o.badge && <span className={`px-1 py-0.5 rounded text-[8px] flex-shrink-0 ${o.badgeClass || 'bg-gray-500/20 text-gray-400'}`}>{o.badge}</span>}
              <span className="text-xs text-white truncate">{o.label}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {extra?.(o.id)}
              <button type="button" onClick={() => remove(o.id)} className="text-red-400 hover:text-red-300"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-xs text-gray-400 hover:border-brand-500">
        <span>{placeholder || '+ Tambah'}</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-dark-900 border border-gray-700 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          <input
            autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari..."
            className="w-full px-3 py-2 text-xs text-gray-300 bg-dark-850 border-b border-gray-700 focus:outline-none"
          />
          {available.length === 0 ? (
            <p className="text-[10px] text-gray-500 text-center py-3">Tidak ada pilihan lagi.</p>
          ) : (
            available.map((o) => (
              <button key={o.id} type="button" onClick={() => pick(o.id)} className="w-full flex items-center gap-1.5 px-3 py-2 text-left text-xs text-gray-300 hover:bg-dark-850">
                {o.badge && <span className={`px-1 py-0.5 rounded text-[8px] flex-shrink-0 ${o.badgeClass || 'bg-gray-500/20 text-gray-400'}`}>{o.badge}</span>}
                <span className="truncate">{o.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
