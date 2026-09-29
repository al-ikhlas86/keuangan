// Dropdown filter/urutan kecil yang dipakai halaman Siswa & Pegawai.
export function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] text-gray-500">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-dark-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 min-w-[130px]">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
