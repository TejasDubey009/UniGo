import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Production pages carry a Content-Security-Policy: scripts only from this site, connections only to
// this site and the Supabase project, and images, fonts and frames only from the services the app
// uses. (The dev server is left alone: hot reload needs inline scripts.) Framing protection has to
// be a response header, so see README → "Hosting headers".
const contentSecurityPolicy = (supabaseUrl) => {
  let supabase = 'https://*.supabase.co wss://*.supabase.co';
  try {
    const { origin } = new URL(supabaseUrl);
    supabase = `${origin} ${origin.replace(/^http/, 'ws')}`;
  } catch {
    // No project configured yet: allow any Supabase project
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    // The celebration confetti draws in a worker it creates from a blob: URL
    "worker-src 'self' blob:",
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data: https://images.unsplash.com https://upload.wikimedia.org https://*.googleusercontent.com",
    `connect-src 'self' ${supabase}`,
    'frame-src https://maps.google.com https://www.google.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'unigo-content-security-policy',
        apply: 'build',
        transformIndexHtml: (html) =>
          html.replace(
            '<meta charset="UTF-8" />',
            `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(env.VITE_SUPABASE_URL)}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`
          ),
      },
    ],
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
    },
    build: {
      // The lazily loaded WebGL map chunk is three.js (~560 kB), the campus spec and OpenStreetMap geometry
      // (~300 kB) and the screen-width route lines (~30 kB)
      chunkSizeWarningLimit: 950,
    },
  };
});
