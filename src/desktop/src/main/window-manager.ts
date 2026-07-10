/**
 * DESK-B2 (born-496 §392-003) — window lifecycle + per-profile session state
 * for the desktop main process.
 *
 * Three profileId-keyed Maps:
 *  - `windows` — the live BrowserWindow for that session (blueprint §2's
 *    `Map<profileId, BrowserWindow>`).
 *  - `ownedDaemons` — pid + orphanShutdownOnQuit for a daemon THIS shell
 *    spawned (never one it adopted).
 *  - `activeDaemonOrigins` — the `http://host:port` origin a profile is
 *    currently connected to, consumed by security.ts's `getActiveDaemonOrigins`
 *    dep (392-004) to allow in-app navigation within a connected daemon's own
 *    served UI.
 *
 * `ownedDaemons`/`activeDaemonOrigins` are deliberately housed here rather
 * than in index.ts (where the task blueprint's prose describes the
 * before-quit sweep): ipc-handlers.ts (392-004, now landed) needs to WRITE to
 * both via the callbacks index.ts passes into `registerIpcHandlers`, while
 * index.ts needs to READ them (before-quit) and CALL ipc-handlers.ts's own
 * registration function. Housing the registries in this leaf module — which
 * both sides already depend on one-directionally — avoids index.ts and
 * ipc-handlers.ts importing each other.
 *
 * Single-window-today model: index.ts creates exactly one window at launch,
 * keyed under constants.ts's INITIAL_WINDOW_ID sentinel (no profile is
 * connected yet). `claimWindowForProfile` re-keys that one window to a real
 * profileId the moment a connect attempt resolves — see its own doc comment.
 * The Map stays profileId-shaped throughout so a future multi-window mode
 * (one window per simultaneously-connected profile) is a additive change,
 * not a rewrite.
 */
import { BrowserWindow } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { INITIAL_WINDOW_ID } from './constants.js';

// ESM main process ("type": "module" in package.json) — no __dirname global.
const __dirname = dirname(fileURLToPath(import.meta.url));

const windows = new Map<string, BrowserWindow>();

export interface OwnedDaemon {
  readonly pid: number;
  readonly orphanShutdownOnQuit: boolean;
}

const ownedDaemons = new Map<string, OwnedDaemon>();
const activeDaemonOrigins = new Map<string, string>();

function rendererFileUrl(): URL {
  return pathToFileURL(join(__dirname, '../renderer/index.html'));
}

function resolvePreloadPath(): string {
  return join(__dirname, '../preload/index.js');
}

/**
 * Local-renderer-only initial load (never a remote URL): electron-vite's dev
 * server URL when set (`ELECTRON_RENDERER_URL`), else the built renderer
 * bundle. `connectWindow` is the ONLY path that ever loads something else.
 */
function loadInitialContent(window: BrowserWindow): void {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

/**
 * Is `url` the app's own local renderer (dev server URL, or the built
 * `out/renderer/index.html`)? Percent-decoded pathname comparison for the
 * file:// case — Electron's own `loadFile`-produced URL and Node's
 * `pathToFileURL` do not always byte-match on an install path containing
 * spaces/unicode (e.g. Windows "Program Files"), so this compares decoded
 * protocol+pathname rather than raw href strings. Consumed by security.ts's
 * `SecurityPolicyDeps.isLocalRendererUrl` (392-004) — this module is the one
 * place that knows which dev/prod shape applies to the current run.
 */
export function isLocalRendererUrl(url: string): boolean {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) return url.startsWith(devServerUrl);
  try {
    const target = new URL(url);
    const renderer = rendererFileUrl();
    return target.protocol === renderer.protocol && decodeURIComponent(target.pathname) === decodeURIComponent(renderer.pathname);
  } catch {
    return false;
  }
}

/**
 * Create (or reuse, if still live) the window for `profileId`. `show:false`
 * + `ready-to-show` avoids the white-flash-on-launch; contextIsolation +
 * sandbox stay ON and nodeIntegration is explicitly OFF (never toggled) —
 * the task's own nogo forbids opening a node-integration surface to the
 * renderer.
 */
export function createWindow(profileId: string): BrowserWindow {
  const existing = windows.get(profileId);
  if (existing && !existing.isDestroyed()) {
    return existing;
  }

  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: resolvePreloadPath(),
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  window.on('closed', () => {
    // Reverse-lookup delete: `claimWindowForProfile` re-keys a live window's
    // Map entry after creation, so the key captured at createWindow() time
    // may no longer be this window's current key.
    for (const [key, win] of windows) {
      if (win === window) {
        windows.delete(key);
        activeDaemonOrigins.delete(key);
        break;
      }
    }
  });

  loadInitialContent(window);
  windows.set(profileId, window);
  return window;
}

/** Strict lookup — the window currently keyed exactly under profileId. */
export function getWindow(profileId: string): BrowserWindow | undefined {
  return windows.get(profileId);
}

/**
 * The window handling `profileId`'s connect flow, for ipc-handlers.ts's
 * `daemon.status` push targeting. Falls back to the sole open window when
 * none is keyed under `profileId` yet — the connect flow pushes status
 * ('spawning'/'health-polling'/...) to the requesting profile BEFORE
 * `claimWindowForProfile` re-keys the bootstrap window to that profileId
 * (re-keying only happens once the connect fully resolves, see
 * `claimWindowForProfile`'s doc comment), and today's app never has more
 * than one window open at a time, so the fallback is unambiguous.
 */
export function getWindowForProfile(profileId: string): BrowserWindow | undefined {
  const direct = windows.get(profileId);
  if (direct) return direct;
  if (windows.size === 1) {
    for (const onlyWindow of windows.values()) return onlyWindow;
  }
  return undefined;
}

export function getAllWindows(): ReadonlyMap<string, BrowserWindow> {
  return windows;
}

export function closeAllWindows(): void {
  for (const window of windows.values()) {
    if (!window.isDestroyed()) window.close();
  }
}

/**
 * Re-key the app's sole window to `profileId` once a connect attempt for it
 * resolves. No-op if `profileId` already owns a window, or if more than one
 * window is open (today's app never creates a second one — multi-window
 * support is structural, in the Map's shape, not yet exercised by any
 * caller; automatically reassigning among several open windows would be a
 * guess this module has no basis for).
 */
export function claimWindowForProfile(profileId: string): void {
  if (windows.has(profileId)) return;
  if (windows.size !== 1) return;
  let currentKey: string | undefined;
  let window: BrowserWindow | undefined;
  for (const [key, win] of windows) {
    currentKey = key;
    window = win;
  }
  if (currentKey === undefined || window === undefined || window.isDestroyed()) return;
  windows.delete(currentKey);
  activeDaemonOrigins.delete(currentKey);
  windows.set(profileId, window);
}

/**
 * Swap `profileId`'s window over to the live daemon origin (blueprint §2 —
 * "connectWindow(profileId, daemonUrl) -> loadURL swap"). Requires the
 * window to already be keyed under `profileId` — callers connect via
 * `claimWindowForProfile` first. Validates the scheme itself as a second,
 * independent guard against the task's nogo ("daemon-URL'den başka remote
 * yükleme") — this function never loads anything but an http(s) URL,
 * regardless of what a future caller passes.
 */
export function connectWindow(profileId: string, daemonUrl: string): void {
  const window = windows.get(profileId);
  if (!window || window.isDestroyed()) {
    throw new Error(`connectWindow: no live window registered for profileId "${profileId}"`);
  }

  const parsed = new URL(daemonUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`connectWindow: refusing non-http(s) daemonUrl scheme "${parsed.protocol}"`);
  }

  activeDaemonOrigins.set(profileId, parsed.origin);
  void window.loadURL(daemonUrl);
}

/** Reload `profileId`'s window back to the local picker UI (ipc-handlers.ts's `connection.disconnect`). */
export function resetWindowToLocalRenderer(profileId: string): void {
  const window = windows.get(profileId);
  if (!window || window.isDestroyed()) return;
  activeDaemonOrigins.delete(profileId);
  loadInitialContent(window);
}

/** Origins of every profile currently connected — security.ts's navigation allowlist. */
export function getActiveDaemonOrigins(): readonly string[] {
  return [...new Set(activeDaemonOrigins.values())];
}

/** Record that THIS shell spawned `pid` for `profileId` — never call for an adopted daemon. */
export function registerOwnedDaemon(profileId: string, pid: number, orphanShutdownOnQuit: boolean): void {
  ownedDaemons.set(profileId, { pid, orphanShutdownOnQuit });
}

export function unregisterOwnedDaemon(profileId: string): void {
  ownedDaemons.delete(profileId);
}

export function getOwnedDaemons(): ReadonlyMap<string, OwnedDaemon> {
  return ownedDaemons;
}
