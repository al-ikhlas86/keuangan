import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base = '/' (BEDA dari Akuntansi lama '/static/react/' - itu utk Django
// STATICFILES_DIRS/WhiteNoise) - Keuangan.Web (ASP.NET Core) serve build
// ini LANGSUNG dari wwwroot/ sbg root situs (UseStaticFiles() default),
// jadi base path polos "/" yang benar di sini. Dev server (npm run dev)
// proxy /api ke Keuangan.Web lokal (bukan Django lagi) supaya bisa dites
// tanpa CORS saat development.
export default defineConfig({
  plugins: [react()],
  // Versi tampilan (UI) ditanam saat build - CI mengisi VITE_APP_VERSION dari tag rilis. Dibandingkan
  // dgn versi server di Pengaturan utk mendeteksi update setengah jalan (UI baru, server lama).
  define: { __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION ?? 'dev') },
  base: '/',
  build: {
    outDir: '../wwwroot',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5139',
    },
  },
})
