/**
 * DESK-B2 (born-496 §392-003) — desktop main-process entry point.
 *
 * Wires every already-shipped sibling main-process module together:
 *  - i18n.ts / menu.ts (392-005) — language resolution + application menu.
 *  - security.ts (392-004) — session/webContents lockdown, installed AFTER
 *    app.whenReady() and BEFORE the first BrowserWindow is created (its own
 *    doc comment states this ordering requirement — `web-contents-created`
 *    must be listening before any webContents exists to harden it).
 *  - connection-profile-store.ts (392-002) — the saved-profiles CRUD store.
 *  - ipc-handlers.ts (392-004) — every `DeckentDesktopApi` channel, wired via
 *    injected callbacks (onConnected/onDaemonSpawned/onDisconnected) into
 *    window-manager.ts's session-state registries — see that module's header
 *    comment for why the registries live there rather than here (avoids an
 *    index.ts <-> ipc-handlers.ts import cycle).
 *  - window-manager.ts (this task) — window lifecycle.
 *
 * NOT wired here, deliberately: tray.ts's createTray() (392-005). Its
 * quick-connect entries need the same connect orchestration ipc-handlers.ts
 * already owns end to end (decideConnectionAction -> spawn/adopt ->
 * pollHealth -> connectWindow) — reusing that here would mean either
 * duplicating handleConnect's logic or exporting it from ipc-handlers.ts,
 * neither of which is this task's write scope. Wiring tray with a no-op
 * onClick would be exactly the placeholder the project's quality bar
 * forbids, so it is left for a small follow-up once a shared connect
 * entrypoint exists. Flagged as docImpact in this task's .result.
 */
import { app } from 'electron';
import { installApplicationMenu } from './menu.js';
import { resolveDesktopLanguage } from './i18n.js';
import { installSecurityLockdown } from './security.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { createConnectionProfileStore } from './connection-profile-store.js';
import {
  createWindow,
  getAllWindows,
  getWindowForProfile,
  claimWindowForProfile,
  connectWindow,
  resetWindowToLocalRenderer,
  registerOwnedDaemon,
  unregisterOwnedDaemon,
  getOwnedDaemons,
  getActiveDaemonOrigins,
  isLocalRendererUrl,
} from './window-manager.js';
import { INITIAL_WINDOW_ID } from './constants.js';

// Must run before any other app usage, per Electron's own documented contract.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [firstWindow] = getAllWindows().values();
    if (!firstWindow) return;
    if (firstWindow.isMinimized()) firstWindow.restore();
    firstWindow.show();
    firstWindow.focus();
  });

  app.on('before-quit', () => {
    for (const daemon of getOwnedDaemons().values()) {
      // Adopted daemons are never in this registry (only a real spawnDaemon()
      // caller registers one, via onDaemonSpawned below) — "adopt edilene
      // ASLA" holds by construction.
      if (!daemon.orphanShutdownOnQuit) continue;
      try {
        process.kill(daemon.pid, 'SIGTERM');
      } catch {
        // Already exited — nothing to clean up (same precedent as
        // src/connectors/bot-daemon.ts's stopBotDaemon).
      }
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  void app.whenReady().then(() => {
    resolveDesktopLanguage(app.getLocale());
    installApplicationMenu();

    // Before the first BrowserWindow — see module header.
    installSecurityLockdown({
      isLocalRendererUrl,
      getActiveDaemonOrigins,
    });

    const profileStore = createConnectionProfileStore();

    createWindow(INITIAL_WINDOW_ID);

    registerIpcHandlers({
      profileStore,
      getWindows: () => getAllWindows().values(),
      getWindowForProfile,
      // born-597 channel-tiering güvenlik-katmanının ZORUNLU köprüsü: bu alan
      // verilmezse ipc-handlers fail-closed olarak TÜM connection.* çağrılarını
      // reddeder (tasarım gereği) — yani bu satır düşerse desktop bağlantı-akışı
      // komple kilitlenir (2026-07-10 Codex cross-check'inin yakaladığı canlı vaka).
      isLocalRendererUrl,
      onConnected: (profileId, daemonUrl, _tokens) => {
        // _tokens (api/terminal) intentionally dropped here: no consumer exists yet
        // (terminal-panel/auth storage is a future feature, not this hardening task's
        // scope) — threading it into window-manager now would be unused state, not a
        // hardening change.
        claimWindowForProfile(profileId);
        connectWindow(profileId, daemonUrl);
      },
      onDaemonSpawned: (profileId, pid, orphanShutdownOnQuit) => {
        registerOwnedDaemon(profileId, pid, orphanShutdownOnQuit);
      },
      onDisconnected: (profileId) => {
        unregisterOwnedDaemon(profileId);
        resetWindowToLocalRenderer(profileId);
      },
    });

    app.on('activate', () => {
      if (getAllWindows().size === 0) {
        createWindow(INITIAL_WINDOW_ID);
      }
    });
  });
}
