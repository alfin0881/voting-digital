import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/*
 * Build aplikasi React + Inertia.
 *
 * Berbeda dari sebelumnya (folder /frontend yang dibangun terpisah lalu
 * disalin ke public/react; keduanya sudah dihapus), sumber React kini hidup di
 * resources/js dan hasil build langsung dibaca Laravel lewat @vite. Tidak ada
 * lagi langkah salin manual: `npm run build` sudah cukup.
 */
export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.jsx'],
            refresh: true,
        }),
        react(),
        tailwindcss(),
    ],

    build: {
        sourcemap: false,

        /*
         * Pemecahan bundel supaya halaman login tidak ikut mengunduh
         * ApexCharts (hanya dipakai halaman Hasil & Layar Besar).
         */
        rollupOptions: {
            output: {
                manualChunks: {
                    react: ['react', 'react-dom', '@inertiajs/react'],
                    apexcharts: ['apexcharts', 'react-apexcharts'],
                },
            },
        },

        chunkSizeWarningLimit: 800,
    },
});
