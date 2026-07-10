/**
 * DESK-1 (born-496) — electron-vite build config.
 *
 * Three build units, blueprint §2:
 *  - main: window manager + daemon lifecycle + IPC. ESM output (electron-vite
 *    default for "type": "module").
 *  - preload: sandboxed → MUST bundle to CJS (electron-vite's documented rule
 *    for sandboxed preloads; contextIsolation stays ON).
 *  - renderer: the THIN pre-daemon UI only (profile picker / connecting /
 *    error states). The real dashboard is NEVER built here — after a healthy
 *    daemon handshake the window loadURL()s the daemon's own
 *    http://127.0.0.1:<port>/ (same serving path a browser uses; sidesteps
 *    file:// base-path + CSP entirely).
 *
 * i18n note: main-process strings come from the repo's getMessage(key, lang)
 * (src/cli/helpers/messages.ts) — rollup bundles that TS source directly at
 * build time; no dependency on the repo's dist/ tree.
 */
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: 'src/main/index.ts',
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: 'src/preload/index.ts',
        output: {
          // Sandboxed preload requirement (contextIsolation + sandbox ON).
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: 'src/renderer/index.html',
      },
    },
  },
});
