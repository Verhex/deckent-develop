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
 *
 * born-600/601 (consult-#7 Finding-2/3): a post-connect loadURL swap makes the daemon's
 * own served page the window's mainFrame — so mainFrame identity ALONE can no longer
 * distinguish "our own local UI" from "remote content that now occupies the same frame".
 * `connection.*` (list/add/remove/connect/disconnect — the channels that leak
 * profile/projectPath data or spawn a local binary) therefore run through
 * `guardedLocalHandle`, a stricter tier that ALSO requires the sender frame's own URL to
 * be the app's local renderer (`RegisterIpcHandlersDeps.isLocalRendererUrl` — the same
 * contract security.ts's `SecurityPolicyDeps.isLocalRendererUrl` already uses;
 * window-manager.ts's `isLocalRendererUrl` satisfies both). `window.*`/`app.*` stay on
 * the original mainFrame-only `guardedHandle`, since window-chrome controls must keep
 * working after the swap. `handleConnect` also rejects a non-loopback `profile.host`
 * outright (this app only ever speaks plain http, never TLS, to a daemon — safe only on
 * loopback) and, on the adopt path, resolves the final URL from the handshake file's OWN
 * host:port rather than the profile's (born-598) — see each function's own doc comment.
 */
import { app, ipcMain, shell, BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type {
  ConnectionProfile,
  ConnectResult,
  DaemonStatus,
  DaemonStatusEvent,
} from '../shared/desktop-api.js';
import type { ConnectionProfileInput, ConnectionProfileStore } from './connection-profile-store.js';
import type { PreferencesStore } from './preferences-store.js';
import { desktopPreferencesSchema, type DesktopPreferencesInput } from '../shared/theme-tokens.js';
import type { DaemonSession } from '../shared/desktop-api.js';

/** D4-3 — the live renderer-transport sessions (profileId → session). Set on
 *  a successful connect, cleared on disconnect; `session.get` serves the
 *  renderer's reload/pull path. Module-level like the profile→window maps. */
const activeSessions = new Map<string, DaemonSession>();
import {
  decideConnectionAction,
  pollHealth,
  resolveTokens,
  spawnDaemon,
  type ConnectionAction,
  type DaemonLifecycleDeps,
  type ResolveTokensResult,
} from './daemon-lifecycle.js';
import { readServeDaemonMeta } from './daemon-meta-client.js';
import { getDesktopStrings } from './i18n.js';
import { isAllowedExternalUrl } from './security.js';

const CHANNELS = {
  connectionList: 'connection.list',
  connectionAdd: 'connection.add',
  connectionRemove: 'connection.remove',
  connectionConnect: 'connection.connect',
  connectionDisconnect: 'connection.disconnect',
  daemonStatus: 'daemon.status',
  daemonSession: 'daemon.session',
  sessionGet: 'session.get',
  windowMinimize: 'window.minimize',
  windowMaximize: 'window.maximize',
  windowClose: 'window.close',
  appGetVersion: 'app.getVersion',
  appOpenExternal: 'app.openExternal',
  appGetStrings: 'app.getStrings',
  preferencesGet: 'preferences.get',
  preferencesSet: 'preferences.set',
} as const;

/** Full connect flow this app owns end to end (spawn+poll path only — adopt is
 * already health-verified by decideConnectionAction itself). Overridable for tests. */
const DEFAULT_CONNECT_HEALTH_TIMEOUT_MS = 15_000;

export interface RegisterIpcHandlersDeps {
  profileStore: ConnectionProfileStore;
  /** D4-1 — watch/theme preferences persistence (preferences.get/set channels). */
  preferencesStore: PreferencesStore;
  /** Every BrowserWindow this app currently owns — the sender-frame trust source of
   * truth. Any of these windows' mainFrame is a trusted sender for any channel. */
  getWindows(): Iterable<BrowserWindow>;
  /** True for the app's own local-renderer origin (dev server URL, or the built
   * out/renderer/index.html) — same contract as security.ts's
   * `SecurityPolicyDeps.isLocalRendererUrl` (window-manager.ts's `isLocalRendererUrl`
   * satisfies both). REQUIRED to actually gate `connection.*` (born-600/601 — see module
   * header): mainFrame identity alone can no longer tell "our local UI" apart from
   * "remote content now occupying the same frame" once a connect has loadURL-swapped the
   * window. Optional at the TYPE level only because this module cannot itself edit
   * index.ts's `registerIpcHandlers({...})` call site to wire it (out of this task's
   * write scope — flagged as docImpact). Omitting it fails CLOSED: every `connection.*`
   * call is rejected and loudly logged, never silently allowed. `window.*`/`app.*` are
   * unaffected either way (mainFrame-only tier, see `guardedHandle`). */
  isLocalRendererUrl?(url: string): boolean;
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

/** Stricter tier for `connection.*` (born-600/601 — see module header). Requires BOTH
 * the base mainFrame-identity check AND the sender frame's own URL to be the app's local
 * renderer. Fails closed (and logs loudly) when `isLocalRendererUrl` was never wired. */
function isTrustedLocalRendererSender(event: IpcMainInvokeEvent, deps: RegisterIpcHandlersDeps): boolean {
  if (!isTrustedSender(event, deps)) return false;
  if (!deps.isLocalRendererUrl) {
    console.error(
      '[ipc-handlers] RegisterIpcHandlersDeps.isLocalRendererUrl was not supplied — rejecting ALL connection-management calls (fail-closed default). Wire window-manager.ts\'s isLocalRendererUrl into the registerIpcHandlers({...}) call.'
    );
    return false;
  }
  return deps.isLocalRendererUrl(event.senderFrame?.url ?? '');
}

/** Shared ipcMain.handle wiring for both trust tiers — the single place either tier's
 * rejection is logged/thrown. `guardedHandle`/`guardedLocalHandle` below only differ in
 * which `isTrusted` predicate they pass in. */
function guardedHandleWithCheck(
  channel: string,
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    if (!isTrusted(event)) {
      console.warn(
        `[ipc-handlers] rejected untrusted sender on channel "${channel}" (frame url: ${event.senderFrame?.url ?? 'unknown'})`
      );
      throw new Error(`untrusted sender for channel "${channel}"`);
    }
    return handler(event, ...args);
  });
}

/** The enforcement point for the mainFrame-only check — see module header. Used by
 * `window.*`/`app.*`, which must keep working whether the window currently shows the
 * local renderer or a connected daemon's page. */
function guardedHandle(
  channel: string,
  deps: RegisterIpcHandlersDeps,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  guardedHandleWithCheck(channel, (event) => isTrustedSender(event, deps), handler);
}

/** The enforcement point for the stricter connection-management tier — see module
 * header (born-600/601). Used by `connection.*` only. */
function guardedLocalHandle(
  channel: string,
  deps: RegisterIpcHandlersDeps,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  guardedHandleWithCheck(channel, (event) => isTrustedLocalRendererSender(event, deps), handler);
}

function requireString(value: unknown, argName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`expected string arg "${argName}"`);
  }
  return value;
}

/** Hosts this app will speak plain http to. It never negotiates TLS with a daemon, so
 * anything off-loopback would send api/terminal tokens (see `resolveTokens` below) in
 * cleartext over a real network path — born-600 (consult-#7 Finding-2/3, "http hardcode
 * ile MITM→shell-control"). */
const LOCAL_CONNECT_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function isLocalConnectHost(host: string): boolean {
  return LOCAL_CONNECT_HOSTS.has(host.trim().toLowerCase());
}

/** born-598 (consult-#7 Finding-3): on the adopt path, `decideConnectionAction` already
 * health-verified the daemon at the HANDSHAKE FILE's own host:port — using
 * `profile.host`/`profile.port` instead (a user-edited, unverified field) could
 * loadURL-swap the window to a different, unverified endpoint than the one that actually
 * answered. Re-reads the handshake file rather than threading decideConnectionAction's
 * internal meta out, matching this module's existing "read again, it's a best-effort
 * hint" posture (ADR-G-033) — falls back to profile's fields if the file raced away
 * between that check and this one. The spawn path has no such mismatch risk: this module
 * itself just commanded `deckent serve --port profile.port`, so profile's fields ARE the
 * source of truth there. */
/** D4-3: a bare IPv6 literal must be bracketed in a URL (`http://[::1]:4317/`)
 *  — the unbracketed form is not a parseable URL, which the new-session
 *  `new URL(url)` derivation (and markDaemonActive) would throw on. */
function urlHost(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function resolveConnectUrl(action: ConnectionAction, profile: ConnectionProfile): string {
  if (action === 'adopt') {
    const meta = readServeDaemonMeta(profile.projectPath);
    if (meta) {
      return `http://${urlHost(meta.host)}:${meta.port}/`;
    }
  }
  return `http://${urlHost(profile.host)}:${profile.port}/`;
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

  if (!isLocalConnectHost(profile.host)) {
    const errorKey = 'desktop.error.remote_plain_http';
    const errorVars = { host: profile.host };
    pushStatus('error', errorKey, errorVars);
    return { ok: false, errorKey, errorVars };
  }

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
  const url = resolveConnectUrl(action, profile);
  pushStatus('connected');
  deps.onConnected?.(profileId, url, tokens);
  // D4-3 — hand the renderer its OWN transport session (approved decision #2:
  // the renderer consumes the daemon's tokened HTTP API directly; the old
  // loadURL-swap to the daemon's dashboard is no longer the product path).
  const session: DaemonSession = {
    profileId,
    url: new URL(url).origin,
    ...(tokens.apiToken !== undefined ? { apiToken: tokens.apiToken } : {}),
  };
  activeSessions.set(profileId, session);
  deps.getWindowForProfile(profileId)?.webContents.send(CHANNELS.daemonSession, session);
  return { ok: true, url };
}

function handleDisconnect(profileId: string, deps: RegisterIpcHandlersDeps): void {
  deps.onDisconnected?.(profileId);
  activeSessions.delete(profileId);
  const win = deps.getWindowForProfile(profileId);
  win?.webContents.send(CHANNELS.daemonSession, null);
  const event: DaemonStatusEvent = { profileId, status: 'idle' };
  win?.webContents.send(CHANNELS.daemonStatus, event);
}

/** Register every DeckentDesktopApi channel. Call once at startup, after
 * `installSecurityLockdown` (security.ts) has already been installed. */
export function registerIpcHandlers(deps: RegisterIpcHandlersDeps): void {
  guardedLocalHandle(CHANNELS.connectionList, deps, () => deps.profileStore.list().profiles);

  guardedLocalHandle(CHANNELS.connectionAdd, deps, (_event, input) => {
    return deps.profileStore.add(input as ConnectionProfileInput);
  });

  guardedLocalHandle(CHANNELS.connectionRemove, deps, (_event, id) => {
    deps.profileStore.remove(requireString(id, 'id'));
  });

  guardedLocalHandle(CHANNELS.connectionConnect, deps, (_event, id) => {
    return handleConnect(requireString(id, 'id'), deps);
  });

  // D4-3 — session pull (renderer reload path). Local-renderer tier: the
  // session carries the api token; only the app's own UI may read it.
  guardedLocalHandle(CHANNELS.sessionGet, deps, () => {
    for (const session of activeSessions.values()) return session; // single-window today
    return null;
  });

  // D4-1 — preferences (watch/theme). Local-renderer tier: only the app's own
  // pre-daemon UI ever reads/writes them (post-connect the window shows the
  // daemon's page, which must not be able to mutate local user preferences).
  guardedLocalHandle(CHANNELS.preferencesGet, deps, () => deps.preferencesStore.get().preferences);

  guardedLocalHandle(CHANNELS.preferencesSet, deps, (_event, input) => {
    // Validate the PARTIAL shape at the trust boundary (store.set re-validates
    // the merged record): unknown watch names / bad hex never reach disk.
    const partial = desktopPreferencesSchema.partial().omit({ version: true }).parse(input ?? {});
    return deps.preferencesStore.set(partial as DesktopPreferencesInput);
  });

  guardedLocalHandle(CHANNELS.connectionDisconnect, deps, (_event, id) => {
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
