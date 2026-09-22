import { useState } from 'react';
import { I18nProvider } from './contexts/I18nContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { RoleProvider } from './contexts/RoleContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { DeleteModalProvider } from './contexts/DeleteModalContext';
import { PeriodFilterProvider } from './contexts/PeriodFilterContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { PageRouter } from './pages/PageRouter';
import { Login } from './pages/Login';
import { Setup } from './pages/Setup';

// Mirror struktur <div id="app"> (index.html:111-152) - sidebar + header + contentArea.
function Shell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  return (
    <div id="app" className="h-full w-full flex overflow-hidden">
      <div className={sidebarOpen ? '' : 'hidden'}>
        <Sidebar />
      </div>
      <main className="flex-1 h-full overflow-y-auto bg-dark-950">
        <Header onToggleSidebar={() => setSidebarOpen((v) => !v)} />
        <div className="p-6 fade-in">
          <PageRouter />
        </div>
      </main>
    </div>
  );
}

// Gerbang auth - lihat AuthContext.tsx utk arti tiap phase. "developer-dropdown"
// dan "authenticated" sama-sama lompat ke Shell (role sudah pasti diketahui di
// keduanya - dropdown bebas vs akun login), bedanya cuma forcedRole yg dioper
// ke RoleProvider (null = dropdown bebas, terisi = role terkunci ikut akun).
function AuthGate() {
  const { phase, mode, user } = useAuth();

  if (phase === 'loading') {
    return (
      <div className="h-full w-full flex items-center justify-center bg-dark-950">
        <p className="text-sm text-gray-500">Memuat...</p>
      </div>
    );
  }
  if (phase === 'needs-setup') return <Setup />;
  if (phase === 'needs-login') return <Login />;

  const forcedRole = mode !== 'developer' && user ? user.role : null;
  return (
    <RoleProvider forcedRole={forcedRole}>
      <ToastProvider>
        <DeleteModalProvider>
          <PeriodFilterProvider>
            <Shell />
          </PeriodFilterProvider>
        </DeleteModalProvider>
      </ToastProvider>
    </RoleProvider>
  );
}

function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

export default App;
