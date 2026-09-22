import { Icon } from './Icon';
import { LogOut } from 'lucide-react';
import { useRole, type Role } from '../contexts/RoleContext';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { menus, type MenuItem } from '../menus';

// Mirror markup <aside id="sidebar"> (index.html:112-138) + renderSidebar() (index.html:707-737).
export function Sidebar() {
  const { role, page, expandedGroups, switchRole, canSwitchRole, navigateTo, toggleGroup } = useRole();
  const { mode, user, logout } = useAuth();
  const { tt, lang } = useI18n();
  const items = menus[role];

  return (
    <aside className="no-print w-64 bg-dark-900 border-r border-gray-700/50 flex flex-col flex-shrink-0 h-full overflow-y-auto">
      <div className="p-5 border-b border-gray-700/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
            <img src="/favicon.svg" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Yayasan Al-Ikhlas 86</h1>
            <p className="text-[10px] text-gray-500">{lang === 'en' ? 'Finance System' : 'Sistem Keuangan'}</p>
          </div>
        </div>
      </div>
      <div className="p-3 border-b border-gray-700/50">
        <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block font-semibold">{tt('label.masukSebagai')}</label>
        {canSwitchRole ? (
          <select
            value={role}
            onChange={(e) => switchRole(e.target.value as Role)}
            className="w-full bg-dark-800 border border-gray-700 rounded-lg text-xs p-2 text-gray-300 focus:outline-none focus:border-brand-500"
          >
            <option value="AdminManager">{tt('role.AdminManager')}</option>
            <option value="Staff">{tt('role.Staff')}</option>
            <option value="Kasir">{tt('role.Kasir')}</option>
            <option value="Akuntansi">{tt('role.Akuntansi')}</option>
          </select>
        ) : (
          <p className="text-xs text-gray-300 font-medium">{user?.fullName} - {tt(`role.${role}`)}</p>
        )}
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.map((m: MenuItem, i) =>
          'group' in m && m.group ? (
            <div key={m.key}>
              <button
                onClick={() => toggleGroup(m.key)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-xs font-medium text-gray-400 hover:bg-dark-800"
              >
                <span className="flex items-center gap-3">
                  <Icon name={m.icon} className="w-4 h-4 flex-shrink-0" />
                  {tt(m.label)}
                </span>
                <Icon name={expandedGroups[m.key] ? 'chevron-down' : 'chevron-right'} className="w-3.5 h-3.5" />
              </button>
              <div className={`space-y-1 mt-1 ${expandedGroups[m.key] || m.children.some((c) => c.page === page) ? '' : 'hidden'}`}>
                {m.children.map((c) => (
                  <button
                    key={c.page}
                    onClick={() => navigateTo(c.page)}
                    className={`sidebar-item w-full flex items-center gap-3 pl-9 pr-3 py-2 rounded-lg text-xs font-medium text-gray-400 ${page === c.page ? 'active' : ''}`}
                  >
                    <Icon name={c.icon} className="w-3.5 h-3.5 flex-shrink-0" />
                    {tt(c.label)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              key={i}
              onClick={() => navigateTo((m as { page: string }).page)}
              className={`sidebar-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium text-gray-400 ${page === (m as { page: string }).page ? 'active' : ''}`}
            >
              <Icon name={m.icon} className="w-4 h-4 flex-shrink-0" />
              {tt(m.label)}
            </button>
          ),
        )}
      </nav>
      <div className="p-3 border-t border-gray-700/50">
        <div className="flex items-center gap-3 p-2">
          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white">A</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{user?.fullName || tt(`role.${role}`)}</p>
            <p className="text-[10px] text-gray-500">{tt(`role.${role}`)}</p>
          </div>
          {mode !== 'developer' && (
            <button onClick={() => logout()} className="text-gray-500 hover:text-red-400">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
