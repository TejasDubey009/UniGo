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
    // The lazily loaded WebGL map chunk is mostly three.js (~560 kB) and can't be split further
    chunkSizeWarningLimit: 600,
  },
});
