import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    // The lazily loaded WebGL map chunk is three.js (~560 kB) plus the campus spec and OpenStreetMap geometry (~300 kB)
    chunkSizeWarningLimit: 900,
  },
});
