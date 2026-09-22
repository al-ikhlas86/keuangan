import { useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { TableActions } from '../components/TableActions';
import { fetchUsers, createUser, updateUser, ApiError, type UserAccountDto } from '../api';
import type { RoleKey } from '../menus';

// BARU (ganti Peran.tsx lama - matrix izin generik tanpa login sungguhan).
// Kelola akun+role tetap (4, lihat Enums.cs UserRole) - admin-only
// (UsersEndpoints.cs sudah RequireAuthorization(AdminManager)). Akun TIDAK
// PERNAH benar2 dihapus, cuma dinonaktifkan (isActive=false) - konsisten
// dgn prinsip audit trail keuangan (siapa mencatat apa harus tetap terlacak).
function UserForm({ editRecord, onDone }: { editRecord: UserAccountDto | null; onDone: () => void }) {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [fullName, setFullName] = useState(editRecord?.fullName || '');
  const [username, setUsername] = useState(editRecord?.username || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<RoleKey>(editRecord?.role || 'Kasir');

  async function simpan() {
    if (!fullName.trim() || !username.trim()) { showToast(tt('msg.semuaFieldWajib'), 'error'); return; }
    if (!editRecord && password.length < 8) { showToast('Password minimal 8 karakter.', 'error'); return; }
    try {
      if (editRecord) {
        await updateUser(editRecord.id, { fullName: fullName.trim(), role, newPassword: password || undefined });
      } else {
        await createUser({ fullName: fullName.trim(), username: username.trim(), password, role });
      }
      showToast(tt('msg.berhasil'));
      onDone();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan akun.', 'error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4" onClick={onDone}>
      <div className="bg-dark-800 rounded-xl border border-gray-700 p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-white mb-4">{editRecord ? 'Edit Akun' : 'Tambah Akun'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); simpan(); }} className="space-y-3">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Nama Lengkap *</label>
            <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Username *</label>
            <input type="text" required disabled={!!editRecord} value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 disabled:opacity-60 focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">{editRecord ? 'Password Baru (opsional)' : 'Password *'}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Role *</label>
            <select value={role} onChange={(e) => setRole(e.target.value as RoleKey)} className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300">
              <option value="AdminManager">Admin / Supervisor</option>
              <option value="Akuntansi">Akuntansi</option>
              <option value="Staff">Admin Keuangan</option>
              <option value="Kasir">Kasir</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700"><Save className="w-3.5 h-3.5 inline mr-1" />{tt('btn.simpan')}</button>
            <button type="button" onClick={onDone} className="px-4 py-2 rounded-lg bg-dark-900 border border-gray-700 text-gray-400 text-xs hover:bg-dark-850">{tt('btn.batal')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function KelolaPengguna() {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserAccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState<false | UserAccountDto | 'new'>(false);

  async function load() {
    setLoading(true);
    try {
      setUsers(await fetchUsers());
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal memuat daftar akun.', 'error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function toggleActive(u: UserAccountDto) {
    try {
      await updateUser(u.id, { isActive: !u.isActive });
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal mengubah status akun.', 'error');
    }
  }

  return (
    <>
      <div className="bg-dark-800 rounded-xl border border-gray-700/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h3 className="text-sm font-bold text-white">{tt('menu.kelola_pengguna')} ({users.length})</h3>
          <button onClick={() => setFormOpen('new')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 text-xs font-medium"><Plus className="w-3.5 h-3.5" />{tt('btn.tambah')}</button>
        </div>
        {loading ? <p className="text-xs text-gray-500 py-4">Memuat...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700/50 text-gray-400 text-left">
                  <th className="pb-3">{tt('col.nama')}</th><th className="pb-3">Username</th><th className="pb-3">Role</th>
                  <th className="pb-3">{tt('col.status')}</th><th className="pb-3">{tt('col.aksi')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-700/30 hover:bg-dark-850/50">
                    <td className="py-3 font-medium text-white">{u.fullName}</td>
                    <td className="py-3 text-gray-300">{u.username}</td>
                    <td className="py-3 text-gray-300">{tt(`role.${u.role}`)}</td>
                    <td className="py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${u.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>{u.isActive ? tt('status.aktif') : tt('status.nonaktif')}</span></td>
                    <td className="py-3"><TableActions onEdit={() => setFormOpen(u)} onDelete={() => toggleActive(u)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {formOpen && <UserForm editRecord={formOpen === 'new' ? null : formOpen} onDone={() => { setFormOpen(false); load(); }} />}
    </>
  );
}
