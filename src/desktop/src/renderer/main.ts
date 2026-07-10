/**
 * DESK-1 (born-496) — renderer entry point, wired by electron.vite.config.ts's
 * `renderer.build.rollupOptions.input` (via index.html's module script).
 */
import { bootstrap } from './app.js';

void bootstrap(document.getElementById('app'));
