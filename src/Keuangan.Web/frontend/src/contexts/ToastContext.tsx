import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';

// Mirror showToast() di index.html:757-765: toast auto-hilang setelah 3 detik,
// warna hijau utk sukses / merah utk error.
interface Toast { id: number; msg: string; type: 'success' | 'error' }
interface ToastContextValue { showToast: (msg: string, type?: 'success' | 'error') => void }

const ToastContext = createContext<ToastContextValue | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    const id = nextId++;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="no-print fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast flex items-center gap-2 px-4 py-3 rounded-lg text-xs font-medium shadow-lg ${t.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'} text-white`}
          >
            {t.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
