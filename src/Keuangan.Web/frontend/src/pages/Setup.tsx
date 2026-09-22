import { useState, type FormEvent } from 'react';
import { ApiError, setupFirstAdmin } from '../api';
import { useAuth } from '../contexts/AuthContext';

// Wizard "Buat Akun Admin Pertama" - HANYA muncul sekali per instalasi
// mode "server" (tabel Users masih kosong, lihat AuthEndpoints.cs::/setup).
// Akun ini otomatis role AdminManager tertinggi.
export function Setup() {
  const { onSetupComplete } = useAuth();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Password minimal 8 karakter.');
    if (password !== confirm) return setError('Konfirmasi password tidak sama.');
    setBusy(true);
    try {
      await setupFirstAdmin(fullName, username, password);
      onSetupComplete();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuat akun admin.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full w-full flex items-center justify-center bg-dark-950">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-dark-800 rounded-xl border border-gray-700/50 p-6">
        <div className="text-center mb-6">
          <h1 className="text-lg font-bold text-white">Instalasi Awal</h1>
          <p className="text-xs text-gray-500 mt-1">Buat akun Admin/Supervisor pertama untuk server ini</p>
        </div>
        {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">{error}</div>}
        <label className="text-[11px] text-gray-400 mb-1 block">Nama Lengkap</label>
        <input
          autoFocus
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full mb-4 bg-dark-900 border border-gray-700 rounded-lg text-sm p-2.5 text-gray-200 focus:outline-none focus:border-brand-500"
        />
        <label className="text-[11px] text-gray-400 mb-1 block">Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full mb-4 bg-dark-900 border border-gray-700 rounded-lg text-sm p-2.5 text-gray-200 focus:outline-none focus:border-brand-500"
        />
        <label className="text-[11px] text-gray-400 mb-1 block">Password (min. 8 karakter)</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 bg-dark-900 border border-gray-700 rounded-lg text-sm p-2.5 text-gray-200 focus:outline-none focus:border-brand-500"
        />
        <label className="text-[11px] text-gray-400 mb-1 block">Ulangi Password</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full mb-6 bg-dark-900 border border-gray-700 rounded-lg text-sm p-2.5 text-gray-200 focus:outline-none focus:border-brand-500"
        />
        <button
          type="submit"
          disabled={busy || !fullName || !username || !password}
          className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg py-2.5"
        >
          {busy ? 'Memproses...' : 'Buat Akun & Lanjut ke Login'}
        </button>
      </form>
    </div>
  );
}
