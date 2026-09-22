import { Download, Upload, Printer, Receipt } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';

// Mirror exportBtn()/importBtn()/printBtn()/kwitansiBtn() (index.html:970-973).
export function ExportBtn({ onClick }: { onClick: () => void }) {
  const { tt } = useI18n();
  return (
    <button onClick={onClick} className="no-print flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 text-xs font-medium">
      <Download className="w-3.5 h-3.5" />{tt('btn.ekspor')}
    </button>
  );
}

export function ImportBtn() {
  const { tt } = useI18n();
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast(tt('btn.impor') + ' - ' + tt('msg.berhasil'))} className="no-print flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-xs font-medium">
      <Upload className="w-3.5 h-3.5" />{tt('btn.impor')}
    </button>
  );
}

export function PrintBtn({ label }: { label: string }) {
  const { tt } = useI18n();
  return (
    <button onClick={() => window.print()} className="no-print flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 text-xs font-medium">
      <Printer className="w-3.5 h-3.5" />{tt('btn.cetak')} {label}
    </button>
  );
}

export function KwitansiBtn({ onClick }: { onClick: () => void }) {
  const { tt } = useI18n();
  return (
    <button onClick={onClick} title={tt('btn.cetakKwitansi')} className="no-print p-1.5 rounded bg-purple-600/20 text-purple-400 hover:bg-purple-600/40">
      <Receipt className="w-3.5 h-3.5" />
    </button>
  );
}
