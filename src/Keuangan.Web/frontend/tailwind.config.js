/** @type {import('tailwindcss').Config} */
// Tema ini SENGAJA disalin verbatim dari konfigurasi tailwind.config CDN di
// templates/dashboard/index.html (lihat script tag di <head>) supaya class
// utility yang dipakai di halaman lama (brand-*, dark-*, font-jakarta) tetap
// menghasilkan warna/style yang identik saat dipindah ke React.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { jakarta: ['Plus Jakarta Sans', 'sans-serif'] },
      colors: {
        brand: { 50: '#eef2ff', 100: '#e0e7ff', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' },
        dark: { 800: '#1e2a3a', 850: '#172133', 900: '#111c2d', 950: '#0b1120' },
      },
    },
  },
  plugins: [],
}
