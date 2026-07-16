/**
 * DESK-1 (born-496) — renderer entry point, wired by electron.vite.config.ts's
 * `renderer.build.rollupOptions.input` (via index.html's module script).
 *
 * D4-1: the default watch (theme) is applied SYNCHRONOUSLY before the first
 * render — no unthemed flash; bootstrap() then loads the persisted preference
 * over IPC and re-applies it through the same runtime.
 */
import { applyWatch } from './theme-runtime.js';
import { bootstrap } from './app.js';

applyWatch(document.documentElement);
void bootstrap(document.getElementById('app'));
