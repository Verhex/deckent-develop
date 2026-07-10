/**
 * DESK-B2-IPC-SECURITY (born-496 §392-004) — the main-process side of the
 * `DeckentDesktopApi` contract (../shared/desktop-api.js, SSOT). Implements every
 * channel the preload (../preload/index.ts) invokes, plus the `daemon.status` push.
 *
 * Channel names below MUST stay byte-identical to preload/index.ts's own CHANNELS map
 * (its header comment states this same invariant from the other side).
 *
 * Every `ipcMain.handle` in this file goes through `guardedHandle()`, which performs
 * the sender-frame trust check FIRST, unconditionally — there is no raw
 * `ipcMain.handle` call anywhere else in this module, so a new channel cannot be added
 * without it. Renderer processes in this app only ever run a top-level document (no
 * iframes), so "trusted" means "the event's senderFrame is the mainFrame of a
 * BrowserWindow this app created" — anything else (a compromised/foreign frame trying
 * to reuse a channel) is rejected and logged.
 *
 * daemon-lifecycle.ts (DESK-B2-LIFECYCLE, already built) owns the actual
 * adopt-vs-spawn/health-poll mechanics; this module orchestrates those calls for the
 * `connection.connect` channel and reports progress via `daemon.status` pushes. The
 * BrowserWindow loadURL swap and the quit-time orphan-pid bookkeeping belong to
 * window-manager.ts (DESK-B2-WINDOW-APP) — this module never reaches into that state
 * directly, and instead exposes optional injected callbacks
 * (`onConnected`/`onDaemonSpawned`/`onDisconnected`) for the caller to wire to
 * window-manager.ts's `connectWindow`/`registerOwnedDaemon`/`unregisterOwnedDaemon`,
 * the same DI discipline tray.ts already uses for its own sibling-module calls.
 */
import { app, ipcMain, shell, BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type {
  ConnectionProfile,
  ConnectResult,
  DaemonStatus,
  DaemonStatusEvent,
} from '../shared/desktop-api.js';
import type { ConnectionProfileInput, ConnectionProfileStore } from './connection-profile-store.js';
import {
  decideConnectionAction,
  pollHealth,
  resolveTokens,
  spawnDaemon,
  type DaemonLifecycleDeps,
  type ResolveTokensResult,
} from './daemon-lifecycle.js';
import { getDesktopStrings } from './i18n.js';
import { isAllowedExternalUrl } from './security.js';

const CHANNELS = {
  connectionList: 'connection.list',
  connectionAdd: 'connection.add',
  connectionRemove: 'connection.remove',
  connectionConnect: 'connection.connect',
  connectionDisconnect: 'connection.disconnect',
  daemonStatus: 'daemon.status',
  windowMinimize: 'window.minimize',
  windowMaximize: 'window.maximize',
  windowClose: 'window.close',
  appGetVersion: 'app.getVersion',
  appOpenExternal: 'app.openExternal',
  appGetStrings: 'app.getStrings',
} as const;

/** Full connect flow this app owns end to end (spawn+poll path only — adopt is
 * already health-verified by decideConnectionAction itself). Overridable for tests. */
const DEFAULT_CONNECT_HEALTH_TIMEOUT_MS = 15_000;

export interface RegisterIpcHandlersDeps {
  profileStore: ConnectionProfileStore;
  /** Every BrowserWindow this app currently owns — the sender-frame trust source of
   * truth. Any of these windows' mainFrame is a trusted sender for any channel. */
  getWindows(): Iterable<BrowserWindow>;
  /** The window currently showing `profileId` (if any) — used to target `daemon.status`
   * pushes. Returns undefined if the window was closed mid-connect (push is a no-op). */
  getWindowForProfile(profileId: string): BrowserWindow | undefined;
  /** Called once a profile's daemon becomes reachable (adopt or spawn+poll both land
   * here) so the caller can loadURL-swap that profile's window to `daemonUrl`. Tokens
   * are threaded here (main-process-internal) rather than returned through the IPC
   * contract — `ConnectResult` deliberately carries no token field. */
  onConnected?(profileId: string, daemonUrl: string, tokens: ResolveTokensResult): void;
  /** Called only when spawnDaemon started a NEW process this app owns (never for an
   * adopted/pre-existing daemon) — the caller's quit-time orphan-pid Set. */
  onDaemonSpawned?(profileId: string, pid: number, orphanShutdownOnQuit: boolean): void;
  /** Called on `connection.disconnect` so the caller can reset that profile's window
   * back to the disconnected/picker state. */
  onDisconnected?(profileId: string): void;
  /** Override for daemon-lifecycle's fetch/spawn/pid-liveness — tests only; production
   * callers omit this and get the real implementations. */
  daemonLifecycleDeps?: DaemonLifecycleDeps;
  /** Overall spawn+poll budget in ms (default 15s). */
  connectHealthTimeoutMs?: number;
}

function isTrustedSender(event: IpcMainInvokeEvent, deps: RegisterIpcHandlersDeps): boolean {
  const frame = event.senderFrame;
  if (!frame) return false;
  for (const win of deps.getWindows()) {
    if (win.webContents.mainFrame === frame) return true;
  }
  return false;
}

/** The single enforcement point for the sender-frame check — see module header. */
function guardedHandle(
  channel: string,
  deps: RegisterIpcHandlersDeps,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    if (!isTrustedSender(event, deps)) {
      console.warn(
        `[ipc-handlers] rejected untrusted sender on channel "${channel}" (frame url: ${event.senderFrame?.url ?? 'unknown'})`
      );
      throw new Error(`untrusted sender for channel "${channel}"`);
    }
    return handler(event, ...args);
  });
}

function requireString(value: unknown, argName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`expected string arg "${argName}"`);
  }
  return value;
}

async function handleConnect(profileId: string, deps: RegisterIpcHandlersDeps): Promise<ConnectResult> {
  const profile: ConnectionProfile | undefined = deps.profileStore.get(profileId);
  if (!profile) {
    throw new Error(`connection profile not found: ${profileId}`);
  }

  const pushStatus = (status: DaemonStatus, errorKey?: string, errorVars?: Record<string, string>): void => {
    const win = deps.getWindowForProfile(profileId);
    const event: DaemonStatusEvent = { profileId, status, errorKey, errorVars };
    win?.webContents.send(CHANNELS.daemonStatus, event);
  };

  const lifecycleDeps = deps.daemonLifecycleDeps ?? {};
  const action = await decideConnectionAction(profile, lifecycleDeps);

  if (action === 'spawn') {
    pushStatus('spawning');
    const spawnResult = await spawnDaemon(profile, lifecycleDeps);
    if (spawnResult.status === 'error') {
      pushStatus('error', spawnResult.errorKey, spawnResult.errorVars);
      return { ok: false, errorKey: spawnResult.errorKey ?? 'desktop.error.daemon_crashed', errorVars: spawnResult.errorVars };
    }
    if (spawnResult.pid !== undefined) {
      deps.onDaemonSpawned?.(profileId, spawnResult.pid, profile.orphanShutdownOnQuit);
    }

    pushStatus('health-polling');
    const timeoutMs = deps.connectHealthTimeoutMs ?? DEFAULT_CONNECT_HEALTH_TIMEOUT_MS;
    const healthResult = await pollHealth(profile.host, profile.port, timeoutMs, lifecycleDeps);
    if (healthResult.status === 'error') {
      pushStatus('error', healthResult.errorKey);
      return { ok: false, errorKey: healthResult.errorKey ?? 'desktop.error.health_timeout' };
    }
  } else {
    pushStatus('adopting');
  }

  const tokens = resolveTokens(profile.projectPath, lifecycleDeps);
  const url = `http://${profile.host}:${profile.port}/`;
  pushStatus('connected');
  deps.onConnected?.(profileId, url, tokens);
  return { ok: true, url };
}

function handleDisconnect(profileId: string, deps: RegisterIpcHandlersDeps): void {
  deps.onDisconnected?.(profileId);
  const win = deps.getWindowForProfile(profileId);
  const event: DaemonStatusEvent = { profileId, status: 'idle' };
  win?.webContents.send(CHANNELS.daemonStatus, event);
}

/** Register every DeckentDesktopApi channel. Call once at startup, after
 * `installSecurityLockdown` (security.ts) has already been installed. */
export function registerIpcHandlers(deps: RegisterIpcHandlersDeps): void {
  guardedHandle(CHANNELS.connectionList, deps, () => deps.profileStore.list().profiles);

  guardedHandle(CHANNELS.connectionAdd, deps, (_event, input) => {
    return deps.profileStore.add(input as ConnectionProfileInput);
  });

  guardedHandle(CHANNELS.connectionRemove, deps, (_event, id) => {
    deps.profileStore.remove(requireString(id, 'id'));
  });

  guardedHandle(CHANNELS.connectionConnect, deps, (_event, id) => {
    return handleConnect(requireString(id, 'id'), deps);
  });

  guardedHandle(CHANNELS.connectionDisconnect, deps, (_event, id) => {
    handleDisconnect(requireString(id, 'id'), deps);
  });

  guardedHandle(CHANNELS.windowMinimize, deps, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  guardedHandle(CHANNELS.windowMaximize, deps, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.maximize();
  });

  guardedHandle(CHANNELS.windowClose, deps, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  guardedHandle(CHANNELS.appGetVersion, deps, () => app.getVersion());

  guardedHandle(CHANNELS.appOpenExternal, deps, (_event, url) => {
    const target = requireString(url, 'url');
    if (!isAllowedExternalUrl(target)) {
      throw new Error(`disallowed external URL scheme: ${target}`);
    }
    return shell.openExternal(target);
  });

  guardedHandle(CHANNELS.appGetStrings, deps, () => getDesktopStrings());
}
