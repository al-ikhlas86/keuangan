import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { useI18n } from './I18nContext';

// Mirror openDeleteModal()/closeDeleteModal()/confirmDelete() di index.html:766-768
// dan markup modal di index.html:155-167.
interface DeleteModalContextValue { openDeleteModal: (cb: () => void) => void }

const DeleteModalContext = createContext<DeleteModalContextValue | null>(null);

export function DeleteModalProvider({ children }: { children: ReactNode }) {
  const { tt } = useI18n();
  const [callback, setCallback] = useState<(() => void) | null>(null);

  const openDeleteModal = useCallback((cb: () => void) => setCallback(() => cb), []);
  const close = () => setCallback(null);
  const confirm = () => {
    if (callback) callback();
    close();
  };

  const value = useMemo(() => ({ openDeleteModal }), [openDeleteModal]);
  return (
    <DeleteModalContext.Provider value={value}>
      {children}
      {callback && (
        <div className="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4">
          <div className="bg-dark-800 rounded-xl border border-gray-700 p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-white font-bold">{tt('modal.hapusJudul')}</h3>
            </div>
            <p className="text-sm text-gray-400 mb-6">{tt('modal.hapusTeks')}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={close} className="px-4 py-2 text-xs rounded-lg bg-dark-900 border border-gray-700 text-gray-300 hover:bg-dark-800">
                {tt('btn.batal')}
              </button>
              <button onClick={confirm} className="px-4 py-2 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700">
                {tt('btn.hapus')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DeleteModalContext.Provider>
  );
}

export function useDeleteModal() {
  const ctx = useContext(DeleteModalContext);
  if (!ctx) throw new Error('useDeleteModal must be used inside DeleteModalProvider');
  return ctx;
}
