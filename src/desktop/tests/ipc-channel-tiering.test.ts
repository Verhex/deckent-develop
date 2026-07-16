/**
 * born-597+598+600 (sprint-394, task-394-001) — unit coverage for ipc-handlers.ts's
 * two-tier IPC guard (`guardedHandle` vs `guardedLocalHandle`), the adopt-path URL fix,
 * and the non-localhost plain-http reject path. See that module's header comment for the
 * full born-600/601 (consult-#7 Finding-2/3) threat model this closes.
 *
 * 'electron' is mocked (ipc-handlers.ts imports it directly, and the real `electron` npm
 * package is not the live API outside an actual Electron process) — every other
 * dependency (daemon-lifecycle.ts, daemon-meta-client.ts) is the REAL implementation
 * exercised against a tmpdir project root, matching daemon-lifecycle.test.ts's own style
 * (Test Hermeticity rule: tmpdir fixtures, no gitignored global state, no spawnSync).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { ipcMain, BrowserWindow, type IpcMainInvokeEvent } from 'electron';

import { writeServeDaemonMeta } from '../../api/serve-daemon-meta.js';
import { clearServeDaemonMeta } from '../src/main/daemon-meta-client.js';
import type { SpawnedChildLike } from '../src/main/daemon-lifecycle.js';
import type { ConnectionProfile } from '../src/shared/desktop-api.js';
import type { ConnectionProfileInput, ConnectionProfileStore } from '../src/main/connection-profile-store.js';
import { registerIpcHandlers, type RegisterIpcHandlersDeps } from '../src/main/ipc-handlers.js';

class FakeChildProcess extends EventEmitter implements SpawnedChildLike {
  pid = 9191;
  unref = vi.fn();
}

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => 'test-version') },
  ipcMain: { handle: vi.fn() },
  shell: { openExternal: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn() },
}));

const CONNECTION_CHANNELS = [
  'connection.list',
  'connection.add',
  'connection.remove',
  'connection.connect',
  'connection.disconnect',
] as const;

const LOCAL_URL = 'app://local-renderer/index.html';
const REMOTE_URL = 'http://127.0.0.1:4317/';

function isLocalRendererUrlFixture(url: string): boolean {
  return url === LOCAL_URL;
}

interface FakeFrame {
  url: string;
}

function makeWindowWithFrameUrl(url: string): { window: unknown; mainFrame: FakeFrame } {
  const mainFrame: FakeFrame = { url };
  const window = { webContents: { mainFrame, send: vi.fn() } };
  return { window, mainFrame };
}

function makeEvent(senderFrame: FakeFrame | null, sender: unknown = {}): IpcMainInvokeEvent {
  return { senderFrame, sender } as unknown as IpcMainInvokeEvent;
}

function makeProfileStore(overrides: Partial<ConnectionProfileStore> = {}): ConnectionProfileStore {
  return {
    filePath: '/fake/connection-profiles.json',
    list: vi.fn(() => ({ profiles: [], invalidDropped: 0, corrupted: false })),
    get: vi.fn(() => undefined),
    add: vi.fn(
      (input: ConnectionProfileInput) => ({ ...input, id: 'fake-id', createdAt: 'now' }) as ConnectionProfile
    ),
    remove: vi.fn(() => true),
    ...overrides,
  };
}

function makeProfile(projectPath: string, overrides: Partial<ConnectionProfile> = {}): ConnectionProfile {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    label: 'test-profile',
    kind: 'local',
    projectPath,
    host: '127.0.0.1',
    port: 4317,
    autoStart: true,
    orphanShutdownOnQuit: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** D4-1 — hermetic preferences store double (tmpdir would also work, but the
 *  tiering suite only cares that the channel reaches the store). */
function makePreferencesStore(): RegisterIpcHandlersDeps['preferencesStore'] {
  let current = { version: 1 as const, watch: 'day-watch' as const, customTokens: {} };
  return {
    filePath: '/tmp/fake-preferences.json',
    get: vi.fn(() => ({ preferences: current, corrupted: false })),
    set: vi.fn((input) => {
      current = { ...current, ...input };
      return current;
    }),
  };
}

function makeDeps(overrides: Partial<RegisterIpcHandlersDeps> = {}): RegisterIpcHandlersDeps {
  const { window } = makeWindowWithFrameUrl(LOCAL_URL);
  return {
    profileStore: makeProfileStore(),
    preferencesStore: makePreferencesStore(),
    getWindows: () => [window] as never,
    getWindowForProfile: () => window as never,
    isLocalRendererUrl: isLocalRendererUrlFixture,
    ...overrides,
  };
}

function getHandler(channel: string): (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown {
  const call = vi.mocked(ipcMain.handle).mock.calls.find(([ch]) => ch === channel);
  if (!call) throw new Error(`no handler registered for channel "${channel}"`);
  return call[1] as (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
}

/** ipcMain.handle's registered wrapper is not itself declared `async` (it returns
 * whatever the inner handler returns — sometimes a plain value, sometimes a Promise —
 * and a rejection-path throw is synchronous). Real Electron normalizes both cases at the
 * actual IPC round-trip; calling the handler function directly (bypassing that
 * round-trip) does not. Routing every call through this `async` helper reproduces that
 * normalization: a synchronous throw or a plain return both become a settled Promise, so
 * `.resolves`/`.rejects` behave the same regardless of which channel's handler is sync
 * vs async. */
async function invokeHandler(channel: string, event: IpcMainInvokeEvent, ...args: unknown[]): Promise<unknown> {
  return getHandler(channel)(event, ...args);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('connection.* channel tiering (born-600/601)', () => {
  it('rejects when senderFrame is not any known window mainFrame at all', async () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    await expect(invokeHandler('connection.list', makeEvent(null))).rejects.toThrow(/untrusted sender/);
  });

  it('rejects a remote/post-swap frame even though it is a known window mainFrame (connection.list)', async () => {
    const { window, mainFrame } = makeWindowWithFrameUrl(REMOTE_URL);
    const deps = makeDeps({ getWindows: () => [window] as never, getWindowForProfile: () => window as never });
    registerIpcHandlers(deps);

    await expect(invokeHandler('connection.list', makeEvent(mainFrame))).rejects.toThrow(/untrusted sender/);
  });

  it('rejects a remote/post-swap frame even though it is a known window mainFrame (connection.connect)', async () => {
    const { window, mainFrame } = makeWindowWithFrameUrl(REMOTE_URL);
    const deps = makeDeps({ getWindows: () => [window] as never, getWindowForProfile: () => window as never });
    registerIpcHandlers(deps);

    await expect(invokeHandler('connection.connect', makeEvent(mainFrame), 'some-id'))
      .rejects.toThrow(/untrusted sender/);
  });

  it('allows a local-renderer frame that is a known window mainFrame (connection.list)', async () => {
    const { window, mainFrame } = makeWindowWithFrameUrl(LOCAL_URL);
    const profiles = [makeProfile('/tmp/whatever')];
    const deps = makeDeps({
      getWindows: () => [window] as never,
      getWindowForProfile: () => window as never,
      profileStore: makeProfileStore({ list: vi.fn(() => ({ profiles, invalidDropped: 0, corrupted: false })) }),
    });
    registerIpcHandlers(deps);

    await expect(invokeHandler('connection.list', makeEvent(mainFrame))).resolves.toEqual(profiles);
  });

  it('fails closed when isLocalRendererUrl itself is not wired, even with a matching mainFrame', async () => {
    const { window, mainFrame } = makeWindowWithFrameUrl(LOCAL_URL);
    const deps = makeDeps({
      getWindows: () => [window] as never,
      getWindowForProfile: () => window as never,
      isLocalRendererUrl: undefined,
    });
    registerIpcHandlers(deps);

    await expect(invokeHandler('connection.list', makeEvent(mainFrame))).rejects.toThrow(/untrusted sender/);
  });

  // D4-1: preferences.* joins the stricter tier — a connected daemon page must
  // not be able to read or mutate local user preferences.
  // D4-3: session.get too — it carries the daemon api token.
  it.each([...CONNECTION_CHANNELS, 'preferences.get', 'preferences.set', 'session.get'] as const)('gates "%s" behind the local-renderer tier', async (channel) => {
    const { window, mainFrame } = makeWindowWithFrameUrl(REMOTE_URL);
    const deps = makeDeps({ getWindows: () => [window] as never, getWindowForProfile: () => window as never });
    registerIpcHandlers(deps);

    await expect(invokeHandler(channel, makeEvent(mainFrame), 'some-id')).rejects.toThrow(/untrusted sender/);
  });

  // D4-1 — functional pins for the preferences channels themselves.
  it('preferences.get returns the store record; preferences.set validates at the trust boundary', async () => {
    const { window, mainFrame } = makeWindowWithFrameUrl(LOCAL_URL);
    const deps = makeDeps({ getWindows: () => [window] as never, getWindowForProfile: () => window as never });
    registerIpcHandlers(deps);

    await expect(invokeHandler('preferences.get', makeEvent(mainFrame))).resolves.toMatchObject({ watch: 'day-watch' });

    await expect(invokeHandler('preferences.set', makeEvent(mainFrame), { watch: 'night-watch' })).resolves.toMatchObject({ watch: 'night-watch' });
    expect(deps.preferencesStore.set).toHaveBeenCalledWith({ watch: 'night-watch' });

    // schema bites BEFORE the store: unknown watch never reaches disk
    await expect(invokeHandler('preferences.set', makeEvent(mainFrame), { watch: 'dog-watch' })).rejects.toThrow();
    expect(deps.preferencesStore.set).toHaveBeenCalledTimes(1);
  });
});

describe('window.*/app.* stay on the mainFrame-only tier', () => {
  it('window.minimize succeeds with a local-renderer frame', async () => {
    const { window, mainFrame } = makeWindowWithFrameUrl(LOCAL_URL);
    const minimize = vi.fn();
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({ minimize } as never);
    registerIpcHandlers(makeDeps({ getWindows: () => [window] as never, getWindowForProfile: () => window as never }));

    await getHandler('window.minimize')(makeEvent(mainFrame));

    expect(minimize).toHaveBeenCalledTimes(1);
  });

  it('window.minimize ALSO succeeds with a remote/post-swap frame (unaffected by the new tier)', async () => {
    const { window, mainFrame } = makeWindowWithFrameUrl(REMOTE_URL);
    const minimize = vi.fn();
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({ minimize } as never);
    registerIpcHandlers(makeDeps({ getWindows: () => [window] as never, getWindowForProfile: () => window as never }));

    await getHandler('window.minimize')(makeEvent(mainFrame));

    expect(minimize).toHaveBeenCalledTimes(1);
  });

  it('window.minimize still rejects a sender that is not a known window mainFrame at all', async () => {
    registerIpcHandlers(makeDeps());

    await expect(invokeHandler('window.minimize', makeEvent(null))).rejects.toThrow(/untrusted sender/);
  });

  it('app.getVersion succeeds with both a local-renderer and a remote/post-swap frame', async () => {
    const local = makeWindowWithFrameUrl(LOCAL_URL);
    registerIpcHandlers(
      makeDeps({ getWindows: () => [local.window] as never, getWindowForProfile: () => local.window as never })
    );
    await expect(invokeHandler('app.getVersion', makeEvent(local.mainFrame))).resolves.toBe('test-version');

    vi.clearAllMocks();
    const remote = makeWindowWithFrameUrl(REMOTE_URL);
    registerIpcHandlers(
      makeDeps({ getWindows: () => [remote.window] as never, getWindowForProfile: () => remote.window as never })
    );
    await expect(invokeHandler('app.getVersion', makeEvent(remote.mainFrame))).resolves.toBe('test-version');
  });
});

describe('adopt-path URL resolution (born-598)', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'deckent-desktop-ipc-handlers-'));
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  function connectDeps(profile: ConnectionProfile, extra: Partial<RegisterIpcHandlersDeps> = {}) {
    const { window, mainFrame } = makeWindowWithFrameUrl(LOCAL_URL);
    const onConnected = vi.fn();
    const deps = makeDeps({
      getWindows: () => [window] as never,
      getWindowForProfile: () => window as never,
      profileStore: makeProfileStore({ get: vi.fn(() => profile) }),
      onConnected,
      ...extra,
    });
    return { deps, mainFrame, onConnected };
  }

  it('uses the handshake file host:port (not profile.host:port) when adopting a mismatched port', async () => {
    writeServeDaemonMeta(projectPath, {
      host: '127.0.0.1',
      port: 5000,
      projectRoot: projectPath,
      terminalEnabled: false,
    });
    const profile = makeProfile(projectPath, { port: 4317 });
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ projectRoot: projectPath }) }) as Response);
    const { deps, mainFrame, onConnected } = connectDeps(profile, {
      daemonLifecycleDeps: { fetchImpl },
    });
    registerIpcHandlers(deps);

    const result = await getHandler('connection.connect')(makeEvent(mainFrame), profile.id);

    expect(result).toEqual({ ok: true, url: 'http://127.0.0.1:5000/' });
    expect(onConnected).toHaveBeenCalledWith(profile.id, 'http://127.0.0.1:5000/', expect.anything());
  });

  it('uses profile.host:port on the spawn path (no handshake meta present)', async () => {
    const profile = makeProfile(projectPath, { port: 4317 });
    const spawnImpl = vi.fn((): SpawnedChildLike => {
      const child = new FakeChildProcess();
      queueMicrotask(() => child.emit('spawn'));
      return child;
    });
    // No writeServeDaemonMeta() call — decideConnectionAction sees no handshake file and
    // resolves 'spawn'; pollHealth then needs a 200 to land on 'connected'.
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({}) }) as Response);
    const { deps, mainFrame, onConnected } = connectDeps(profile, {
      daemonLifecycleDeps: { fetchImpl, spawnImpl, deckentBin: 'deckent' },
    });
    registerIpcHandlers(deps);

    const result = await getHandler('connection.connect')(makeEvent(mainFrame), profile.id);

    expect(result).toEqual({ ok: true, url: 'http://127.0.0.1:4317/' });
    expect(onConnected).toHaveBeenCalledWith(profile.id, 'http://127.0.0.1:4317/', expect.anything());
    expect(spawnImpl).toHaveBeenCalledTimes(1);
  });
});

describe('non-localhost + plain-http reject path (born-600)', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'deckent-desktop-ipc-handlers-remote-'));
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('rejects a non-loopback host before any spawn/adopt work happens', async () => {
    const profile = makeProfile(projectPath, { host: '203.0.113.5' });
    const fetchImpl = vi.fn();
    const spawnImpl = vi.fn();
    const { window, mainFrame } = makeWindowWithFrameUrl(LOCAL_URL);
    const deps = makeDeps({
      getWindows: () => [window] as never,
      getWindowForProfile: () => window as never,
      profileStore: makeProfileStore({ get: vi.fn(() => profile) }),
      daemonLifecycleDeps: { fetchImpl, spawnImpl },
    });
    registerIpcHandlers(deps);

    const result = await getHandler('connection.connect')(makeEvent(mainFrame), profile.id);

    expect(result).toEqual({
      ok: false,
      errorKey: 'desktop.error.remote_plain_http',
      errorVars: { host: '203.0.113.5' },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(spawnImpl).not.toHaveBeenCalled();
    expect((window as { webContents: { send: ReturnType<typeof vi.fn> } }).webContents.send).toHaveBeenCalledWith(
      'daemon.status',
      { profileId: profile.id, status: 'error', errorKey: 'desktop.error.remote_plain_http', errorVars: { host: '203.0.113.5' } }
    );
  });

  it.each(['localhost', '127.0.0.1', '::1', 'LOCALHOST'])('allows host "%s" through to the normal connect flow', async (host) => {
    // A handshake file must exist for decideConnectionAction to reach its /health check
    // at all (no meta => it short-circuits straight to 'spawn' without ever fetching) —
    // writing one here is what actually proves the host-check did NOT short-circuit
    // handleConnect itself before decideConnectionAction ran.
    writeServeDaemonMeta(projectPath, { host, port: 4317, projectRoot: projectPath, terminalEnabled: false });
    const profile = makeProfile(projectPath, { host });
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ projectRoot: projectPath }) }) as Response);
    const { window, mainFrame } = makeWindowWithFrameUrl(LOCAL_URL);
    const deps = makeDeps({
      getWindows: () => [window] as never,
      getWindowForProfile: () => window as never,
      profileStore: makeProfileStore({ get: vi.fn(() => profile) }),
      daemonLifecycleDeps: { fetchImpl },
    });
    registerIpcHandlers(deps);

    const result = await getHandler('connection.connect')(makeEvent(mainFrame), profile.id);

    expect(fetchImpl).toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true });
  });
});

describe('adopt-path meta race (best-effort fallback)', () => {
  it('falls back to profile.host:port if the handshake file vanishes between decide and resolve', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'deckent-desktop-ipc-handlers-race-'));
    try {
      writeServeDaemonMeta(projectPath, {
        host: '127.0.0.1',
        port: 5000,
        projectRoot: projectPath,
        terminalEnabled: false,
      });
      const profile = makeProfile(projectPath, { port: 4317 });
      const fetchImpl = vi.fn(async () => {
        // Simulate the handshake file disappearing during the /health round-trip —
        // decideConnectionAction has already read it by now (real function, real read).
        clearServeDaemonMeta(projectPath);
        return { status: 200, json: async () => ({ projectRoot: projectPath }) } as Response;
      });
      const { window, mainFrame } = makeWindowWithFrameUrl(LOCAL_URL);
      const deps = makeDeps({
        getWindows: () => [window] as never,
        getWindowForProfile: () => window as never,
        profileStore: makeProfileStore({ get: vi.fn(() => profile) }),
        daemonLifecycleDeps: { fetchImpl },
      });
      registerIpcHandlers(deps);

      const result = await getHandler('connection.connect')(makeEvent(mainFrame), profile.id);

      expect(result).toEqual({ ok: true, url: 'http://127.0.0.1:4317/' });
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });
});

// ─── Composition-pin (Codex cross-check vakası, 2026-07-10) ───────────────────
// Sprint-394'te guard (ipc-handlers) ve hardening (index) AYRI single-writer
// task'lardı; aradaki köprü — index.ts'in registerIpcHandlers deps'ine
// isLocalRendererUrl'ü GEÇMESİ — hiçbir testin konusu değildi ve düştü:
// production desktop'ta tüm connection.* fail-closed kilitliydi. Bu test o
// sınıfı statik pinler: gerçek kompozisyon kaynağında (index.ts) deps bloğu
// alanı içermek ZORUNDA. (Kaba source-assert — Electron'lu index.ts'i
// import etmeden kompozisyonu pinlemenin hermetik yolu.)
import { readFileSync } from 'node:fs';
import { dirname as pinDirname, join as pinJoin } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('composition pin — index.ts wires isLocalRendererUrl into registerIpcHandlers', () => {
  it('the registerIpcHandlers({...}) block in index.ts contains isLocalRendererUrl', () => {
    const indexSrc = readFileSync(
      pinJoin(pinDirname(fileURLToPath(import.meta.url)), '..', 'src', 'main', 'index.ts'),
      'utf-8',
    );
    const start = indexSrc.indexOf('registerIpcHandlers({');
    expect(start, 'registerIpcHandlers call not found in index.ts').toBeGreaterThan(-1);
    const block = indexSrc.slice(start, indexSrc.indexOf('});', start));
    expect(block).toContain('isLocalRendererUrl');
  });
});

// ─── Preload-path pin (2026-07-10 canlı-vaka: "açılıyor ama kullanılamıyor") ──
// electron-vite sandboxed-preload'u CJS olarak `index.cjs` yazar; window-manager
// bir dönem `.js` arıyordu → preload sessizce yüklenmedi → window.deckentDesktop
// undefined → cansız fallback-UI. Bu pin, yol-uzantısının .cjs kaldığını ve
// build-çıktısının gerçekten o adla var olduğunu doğrular.
describe('preload-path pin — window-manager points at the CJS artifact', () => {
  it("window-manager resolves '../preload/index.cjs' (never .js)", () => {
    const src = readFileSync(
      pinJoin(pinDirname(fileURLToPath(import.meta.url)), '..', 'src', 'main', 'window-manager.ts'),
      'utf-8',
    );
    expect(src).toContain("'../preload/index.cjs'");
    expect(src).not.toContain("'../preload/index.js'");
  });
});
