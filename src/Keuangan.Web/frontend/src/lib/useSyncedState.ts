import { useEffect, useState } from 'react';

// Controlled input state yang resync ke `value` terbaru dari server tiap kali prop
// berubah (mis. setelah refetch pasca simpan field lain) - meniru pola render-ulang-
// dari-data yang dipakai index.html untuk sel-sel spreadsheet Kelola Komponen Gaji.
export function useSyncedState<T>(value: T): [T, (v: T) => void] {
  const [state, setState] = useState(value);
  useEffect(() => setState(value), [value]);
  return [state, setState];
}
