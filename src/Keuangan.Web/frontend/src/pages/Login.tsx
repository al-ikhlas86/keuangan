import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Layar login sungguhan - HANYA muncul mode "server"/"klien" (lihat
// AuthContext.tsx). Akun dibuat dari wizard Setup Awal (akun pertama) atau
// menu Kelola Pengguna (akun berikutnya, admin-only).
export function Login() {
  const { login, loginError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(username, password);
    } catch {
      // loginError sudah diisi AuthContext, cukup hentikan spinner di sini.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full w-full flex items-center justify-center bg-dark-950">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-dark-800 rounded-xl border border-gray-700/50 p-6">
        <div className="text-center mb-6">
          <h1 className="text-lg font-bold text-white">Keuangan</h1>
          <p className="text-xs text-gray-500 mt-1">Yayasan Al-Ikhlas 86</p>
        </div>
        {loginError && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">{loginError}</div>
        )}
        <label className="text-[11px] text-gray-400 mb-1 block">Username</label>
        <input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full mb-4 bg-dark-900 border border-gray-700 rounded-lg text-sm p-2.5 text-gray-200 focus:outline-none focus:border-brand-500"
        />
        <label className="text-[11px] text-gray-400 mb-1 block">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-6 bg-dark-900 border border-gray-700 rounded-lg text-sm p-2.5 text-gray-200 focus:outline-none focus:border-brand-500"
        />
        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg py-2.5"
        >
          {busy ? 'Memproses...' : 'Masuk'}
        </button>
      </form>
    </div>
  );
}
