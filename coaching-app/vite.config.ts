/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Emits sw.js with this build's files, so the hosted app can open offline.
 * The version changes with the files, which makes browsers install the new worker. */
function serviceWorker(): Plugin {
  return {
    name: 'coachbook-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      // ExcelJS is only needed when a coach imports a workbook; it is cached on first use instead.
      const built = Object.keys(bundle).filter((f) => !f.includes('exceljs')).sort();
      const files = ['./', ...built.filter((f) => f !== 'index.html'), 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'apple-touch-icon.png'];
      const version = createHash('sha256').update(built.join('\n')).digest('hex').slice(0, 10);
      const source = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// `npm run build` -> regular static site in dist/ (host anywhere, e.g. GitHub Pages).
// `npm run build:single` -> one self-contained dist-single/index.html.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react(), serviceWorker()],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
  },
}));
