import { Search } from 'lucide-react';

// Kolom cari-ketik polos (bukan combobox/dropdown seperti StudentSearchSelect)
// - dipakai di atas tabel siswa (Data Siswa/Sudah Lunas/Belum Lunas/Arsip)
// untuk filter cepat berdasarkan nama/NIS tanpa perlu scroll manual.
export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-dark-900 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500"
      />
    </div>
  );
}
