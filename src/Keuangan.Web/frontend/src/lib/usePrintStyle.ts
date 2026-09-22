import { useEffect } from 'react';

// Mirror pola manipulasi `<style id="dynamicPageStyle">` (index.html berbagai
// tempat, mis. renderKwitansi() baris ~1367). Dipakai halaman yang butuh @page
// CSS khusus (ukuran kertas dot-matrix, dst) - dibersihkan otomatis oleh
// PageRouter saat pindah ke halaman lain yang tidak mengelola style-nya sendiri.
export function usePrintStyle(css: string) {
  useEffect(() => {
    const el = document.getElementById('dynamicPageStyle');
    if (el) el.textContent = css;
  }, [css]);
}
