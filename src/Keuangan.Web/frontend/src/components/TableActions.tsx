import { Pencil, Trash2 } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { useDeleteModal } from '../contexts/DeleteModalContext';

// Versi disederhanakan Fase 1 - RBAC sekarang DITEGAKKAN SERVER (login
// sungguhan + [Authorize]/RequireRole, lihat AuthEndpoints.cs), jadi alur
// "ajukan izin ke admin lalu tombol nyala sekali pakai" (ApprovalRequest,
// Fase 2) tidak diperlukan lagi - kalau tombol ini muncul di halaman,
// berarti role yang sedang login memang berwenang; kalau backend tetap
// menolak (403 - role berubah di tab lain dsb), pesan errornya ditampilkan biasa.
export function TableActions({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => Promise<unknown> | void }) {
  const { tt } = useI18n();
  const { showToast } = useToast();
  const { openDeleteModal } = useDeleteModal();

  const doDelete = () => {
    if (!onDelete) return;
    openDeleteModal(async () => {
      try {
        await onDelete();
      } catch (err) {
        showToast(err instanceof Error ? err.message : tt('msg.gagalHapusData'), 'error');
      }
    });
  };

  return (
    <div className="flex gap-1 no-print">
      {onEdit && (
        <button onClick={onEdit} className="p-1.5 rounded btn-icon-edit"><Pencil className="w-3.5 h-3.5" /></button>
      )}
      {onDelete && (
        <button onClick={doDelete} className="p-1.5 rounded btn-icon-delete"><Trash2 className="w-3.5 h-3.5" /></button>
      )}
    </div>
  );
}
