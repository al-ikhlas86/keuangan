import { Menu, Search, Sun, Moon } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useTheme } from '../contexts/ThemeContext';
import { useRole } from '../contexts/RoleContext';
import { titleKeys } from '../menus';

// Mirror <header> (index.html:141-149) + renderLangToggle() (index.html:450-454)
// + toggleTheme()/loadTheme() (index.html:822-844).
export function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { tt, lang, setLang } = useI18n();
  const { isLight, toggleTheme } = useTheme();
  const { page } = useRole();

  return (
    <header className="no-print sticky top-0 z-30 bg-dark-950/80 backdrop-blur-md border-b border-gray-700/50 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button onClick={onToggleSidebar} className="lg:hidden text-gray-400 hover:text-white">
          <Menu className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold text-white">{tt(titleKeys[page] || 'menu.dashboard')}</h2>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative hidden sm:block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder={lang === 'en' ? 'Search...' : 'Cari...'}
            className="bg-dark-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-xs w-48 focus:outline-none focus:border-brand-500 text-gray-300"
          />
        </div>
        <div className="flex items-center rounded-lg bg-dark-800 border border-gray-700 text-[10px] font-semibold overflow-hidden">
          {(['id', 'en'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-2 py-1.5 ${lang === l ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <button onClick={toggleTheme} className="relative text-gray-400 hover:text-white" title={lang === 'en' ? 'Toggle Theme' : 'Toggle Tema'}>
          {isLight ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>
    </header>
  );
}
