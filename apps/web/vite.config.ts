import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const TRANSCRIPTS_DIR = fileURLToPath(
  new URL('../../packages/test-fixtures/transcripts/', import.meta.url),
);

/**
 * Dev server only (Phase 0 spike): POST /__spike/transcripts/<name>.json saves a recorded
 * transcript straight into packages/test-fixtures/transcripts/. Not part of production builds.
 */
function saveTranscripts(): Plugin {
  return {
    name: 'codetochip-save-transcripts',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__spike/transcripts/', (req, res) => {
        const name = decodeURIComponent((req.url ?? '').replace(/^\//, ''));
        if (req.method !== 'POST' || !/^[a-z0-9][a-z0-9-]*\.json$/.test(name)) {
          res.statusCode = 400;
          return res.end('POST a JSON body to /__spike/transcripts/<lowercase-name>.json');
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          void (async () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
              await mkdir(TRANSCRIPTS_DIR, { recursive: true });
              await writeFile(TRANSCRIPTS_DIR + name, JSON.stringify(body, null, 2) + '\n');
              res.end(`saved packages/test-fixtures/transcripts/${name}`);
            } catch (e) {
              res.statusCode = 500;
              res.end(String(e));
            }
          })();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    saveTranscripts(),
    // Installable app; the app shell works offline (compiling needs the network; saved
    // projects are available offline through Firestore's cache).
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'CodeToChip',
        short_name: 'CodeToChip',
        description: 'Write code, flash any microcontroller, from any device.',
        theme_color: '#0f172a',
        background_color: '#020617',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: 'es' },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
