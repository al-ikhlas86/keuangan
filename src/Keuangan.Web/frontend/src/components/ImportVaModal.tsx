import { useRef, useState } from 'react';
import { X, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { previewVaImport, commitVaImport, ApiError, type VaImportSummary } from '../api';

// Impor nomor VA massal dari template Excel (lihat VaEndpoints.cs). Alur: pilih file
// -> PRATINJAU otomatis (belum menyimpan apa pun) -> konfirmasi "Simpan".
export function ImportVaModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<VaImportSummary | null>(null);
  const [error, setError] = useState('');

  async function pilihFile(f: File | null) {
    setFile(f); setSummary(null); setError('');
    if (!f) return;
    setBusy(true);
    try {
      setSummary(await previewVaImport(f));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membaca file.');
    } finally {
      setBusy(false);
    }
  }

  async function simpan() {
    if (!file) return;
    setBusy(true);
    try {
      const hasil = await commitVaImport(file);
      showToast(hasil.message);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan impor.');
      setBusy(false);
    }
  }

  const bisaSimpan = !!summary && !busy && (summary.isi + summary.ganti + summary.tambah) > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-800 border border-gray-700/50 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">Impor Nomor VA dari Excel</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <p className="text-[11px] text-gray-400 mb-3">
          Gunakan file hasil <b>Unduh Template</b>. Isi kolom "No VA 1" (utama) dan "No VA 2, 3, ..." (tambahan). Sel kosong tidak mengubah apa pun.
        </p>

        <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => pilihFile(e.target.files?.[0] ?? null)} />
        <button onClick={() => inputRef.current?.click()} disabled={busy}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-xs font-medium disabled:opacity-50">
          <Upload className="w-3.5 h-3.5" />{file ? file.name : 'Pilih file .xlsx'}
        </button>

        {busy && !summary && <p className="text-xs text-gray-500 mt-3">Membaca file...</p>}
        {error && <p className="text-xs text-red-400 mt-3 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{error}</p>}

        {summary && (
          <div className="mt-4">
            <p className="text-[11px] text-gray-400 mb-2">Pratinjau - {summary.barisData} baris dibaca. <b>Belum ada yang disimpan.</b></p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3 text-center">
              <Kotak label="VA utama diisi" nilai={summary.isi} warna="text-emerald-400" />
              <Kotak label="VA utama diganti" nilai={summary.ganti} warna="text-amber-400" />
              <Kotak label="VA tambahan" nilai={summary.tambah} warna="text-blue-400" />
              <Kotak label="Sudah sama" nilai={summary.sama} warna="text-gray-300" />
              <Kotak label="Bermasalah" nilai={summary.error} warna="text-red-400" />
            </div>

            {summary.daftarGanti.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-amber-400 mb-1">VA utama berikut akan DIGANTI - periksa dulu:</p>
                <div className="overflow-x-auto max-h-40 overflow-y-auto border border-gray-700/50 rounded-lg">
                  <table className="w-full text-[11px]">
                    <thead><tr className="text-gray-400 text-left"><th className="p-1.5">Nama</th><th className="p-1.5">NIS</th><th className="p-1.5">VA lama</th><th className="p-1.5">VA baru</th></tr></thead>
                    <tbody>{summary.daftarGanti.map((g, i) => (
                      <tr key={i} className="border-t border-gray-700/30"><td className="p-1.5 text-gray-200">{g.nama}</td><td className="p-1.5 text-gray-300">{g.nis}</td><td className="p-1.5 text-gray-400">{g.lama}</td><td className="p-1.5 text-amber-300">{g.baru}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {summary.totalMasalah > 0 && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-red-400 mb-1">
                  Catatan ({summary.totalMasalah}) - yang bertanda "error" tidak akan disimpan{summary.totalMasalah > summary.masalah.length ? `, ${summary.masalah.length} pertama ditampilkan` : ''}:
                </p>
                <div className="overflow-x-auto max-h-48 overflow-y-auto border border-gray-700/50 rounded-lg">
                  <table className="w-full text-[11px]">
                    <thead><tr className="text-gray-400 text-left"><th className="p-1.5">Baris</th><th className="p-1.5">Siswa</th><th className="p-1.5">Masalah</th></tr></thead>
                    <tbody>{summary.masalah.map((m, i) => (
                      <tr key={i} className="border-t border-gray-700/30 align-top">
                        <td className="p-1.5 text-gray-400">{m.baris}</td>
                        <td className="p-1.5 text-gray-300">{m.nama}{m.nis ? ` (${m.nis})` : ''}</td>
                        <td className={`p-1.5 ${m.level === 'error' ? 'text-red-300' : 'text-amber-300'}`}>{m.pesan}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {(summary.isi + summary.ganti + summary.tambah) === 0 && (
              <p className="text-xs text-gray-400 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Tidak ada perubahan yang perlu disimpan.</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-xs text-gray-300 hover:bg-gray-700/40">Batal</button>
          <button onClick={simpan} disabled={!bisaSimpan}
            className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold disabled:opacity-40">
            {busy && summary ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Kotak({ label, nilai, warna }: { label: string; nilai: number; warna: string }) {
  return (
    <div className="rounded-lg border border-gray-700/50 py-2">
      <div className={`text-lg font-bold ${warna}`}>{nilai}</div>
      <div className="text-[10px] text-gray-500">{label}</div>
    </div>
  );
}
