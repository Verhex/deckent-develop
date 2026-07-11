/**
 * born-587 (DEAD-LISTENER-MIGRATION) — nervous.ts / chat.ts / flow.ts /
 * heartbeat.ts / dashboard.ts each used to register a command-level
 * process.on(SIGINT[/SIGTERM]) listener that was reproduced-dead in
 * production: entry.ts's bootstrap-time onSignal wins registration order and
 * exits synchronously before any later-registered listener for the same
 * event ever runs (see src/cli/helpers/shutdown-hooks.ts's module doc and the
 * serve.ts precedent, commit 6a2d7016 — the 1st fixed member of this class).
 *
 * This suite proves, per command:
 *   - registerShutdownHook is called with the SAME cleanup the dead listener
 *     used to run (mock-registry pattern — no real OS signal is ever sent);
 *   - zero direct process.on('SIGINT'|'SIGTERM', ...) calls remain;
 *   - invoking the captured hook runs the cleanup, twice safely (idempotent);
 *   - chat.ts (the one member with a normal-exit path) unregisters on detach.
 *
 * Hermetic: 'node:fs', 'node:child_process' and every command's deep
 * dependency (FlowRegistry/FlowRuntime, HeartbeatDaemon, …) are mocked — no
 * real filesystem I/O, no real child process, no real timer left running
 * past a test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { EventEmitter } from 'node:events';

// ─── Shared shutdown-hooks mock-registry ────────────────────────────────────
const registeredHooks: Array<() => Promise<void>> = [];
const unregisterMocks: Array<ReturnType<typeof vi.fn>> = [];
const mockRegisterShutdownHook = vi.fn((hook: () => Promise<void>) => {
  registeredHooks.push(hook);
  const un = vi.fn();
  unregisterMocks.push(un);
  return un;
});
vi.mock('../../src/cli/helpers/shutdown-hooks.js', () => ({
  registerShutdownHook: (hook: () => Promise<void>) => mockRegisterShutdownHook(hook),
}));

function lastHook(): () => Promise<void> {
  const h = registeredHooks[registeredHooks.length - 1];
  if (!h) throw new Error('no shutdown hook registered');
  return h;
}
function lastUnregister(): ReturnType<typeof vi.fn> {
  const u = unregisterMocks[unregisterMocks.length - 1];
  if (!u) throw new Error('no shutdown hook registered');
  return u;
}

// ─── Low-level fs / child_process mocks (shared across all 5 commands) ─────
const mockExistsSync = vi.fn(() => false);
const mockReadFileSync = vi.fn(() => '');
const mockWriteFileSync = vi.fn();
const mockAppendFileSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockReaddirSync = vi.fn(() => []);
const mockWatchFile = vi.fn();
const mockUnwatchFile = vi.fn();
const mockFsWatch = vi.fn(() => ({ close: vi.fn(), on: vi.fn() }));

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  appendFileSync: (...a: unknown[]) => mockAppendFileSync(...a),
  mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
  readdirSync: (...a: unknown[]) => mockReaddirSync(...a),
  watchFile: (...a: unknown[]) => mockWatchFile(...a),
  unwatchFile: (...a: unknown[]) => mockUnwatchFile(...a),
  watch: (...a: unknown[]) => mockFsWatch(...a),
}));

const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...a: unknown[]) => mockSpawn(...a),
}));

// ─── CLI helper mocks shared by all 5 commands ──────────────────────────────
vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(() => '/test-root'),
}));
vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  isNoColor: vi.fn(() => false),
  formatTable: vi.fn(() => ''),
}));
vi.mock('../../src/cli/helpers/messages.js', () => ({
  getLanguage: vi.fn(() => 'en'),
  getMessage: vi.fn((key: string) => key),
}));
vi.mock('../../src/cli/helpers/i18n.js', () => ({
  detectLang: vi.fn(() => 'en'),
}));
vi.mock('../../src/cli/helpers/config-reader.js', () => ({
  getLangFromConfig: vi.fn(() => 'en'),
}));
vi.mock('../../src/core/constants.js', () => ({
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
  NERVOUS_HISTORY_FILE: '.deckent/nervous/history.jsonl',
  NERVOUS_PENDING_FILE: '.deckent/nervous/pending.json',
  PANIC_IPC_DIR: '.deckent/panic-ipc',
  DASHBOARD_FILE: '.dashboard',
}));

// ─── nervous.ts's other dependencies (unexercised by `log --follow`, but
// imported at module scope — must resolve without side effects) ───────────
vi.mock('../../src/nervous/observer.js', () => ({
  getActiveDirectivesProtection: vi.fn(() => null),
}));
vi.mock('../../src/cli/commands/config-nervous.js', () => ({
  handleEnableNervous: vi.fn(),
}));
vi.mock('../../src/nervous/ipc-queue.js', () => ({
  NervousIpcQueue: vi.fn(),
  isNervousPollerAlive: vi.fn(() => false),
}));
vi.mock('../../src/nervous/recommendation-log.js', () => ({
  readRecommendations: vi.fn(() => []),
  dismissRecommendation: vi.fn(() => false),
}));
vi.mock('../../src/core/pending-approvals.js', () => ({
  removeNervousPending: vi.fn(),
}));

// ─── chat.ts's provider-probe dependencies (mirrors tests/cli/chat.test.ts) ─
vi.mock('../../src/providers/claude.js', () => ({ ClaudeAdapter: vi.fn() }));
vi.mock('../../src/providers/codex.js', () => ({ CodexAdapter: vi.fn() }));
vi.mock('../../src/providers/gemini.js', () => ({ GeminiAdapter: vi.fn() }));

// ─── flow.ts's daemon dependencies ──────────────────────────────────────────
const mockRuntimeStart = vi.fn();
const mockRuntimeStop = vi.fn();
vi.mock('../../src/core/flow-registry.js', () => ({
  FlowRegistry: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('../../src/core/flow-runtime.js', () => ({
  FlowRuntime: vi.fn().mockImplementation(() => ({
    start: mockRuntimeStart,
    stop: mockRuntimeStop,
    tick: vi.fn(),
  })),
}));
vi.mock('../../src/core/scheduled-flow.js', () => ({
  parseCronExpr: vi.fn(),
}));
vi.mock('../../src/core/event-trigger.js', () => ({
  enqueuePendingEventDispatches: vi.fn(() => []),
  approveDispatch: vi.fn(() => null),
  pendingEventDispatchPath: vi.fn(() => '/test-root/.deckent/flows/pending-event-dispatch.json'),
}));
vi.mock('../../src/core/self-dispatch.js', () => ({
  createSelfDispatchCallback: vi.fn(() => vi.fn()),
}));

// ─── heartbeat.ts's daemon dependencies ─────────────────────────────────────
const mockDaemonStart = vi.fn(() => ({ executed: 0, passed: 0, failed: 0, total: 0, details: [] }));
const mockDaemonStop = vi.fn();
vi.mock('../../src/orchestra/heartbeat-daemon.js', () => ({
  runHeartbeat: vi.fn(),
  HeartbeatDaemon: vi.fn().mockImplementation(() => ({
    start: mockDaemonStart,
    stop: mockDaemonStop,
  })),
  readDaemonPid: vi.fn(() => null),
  stopDaemonByPid: vi.fn(() => false),
}));

// ─── Imports under test (after all mocks) ───────────────────────────────────
import { registerNervous } from '../../src/cli/commands/nervous.js';
import { spawnChatProcess } from '../../src/cli/commands/chat.js';
import { registerFlow } from '../../src/cli/commands/flow.js';
import { registerHeartbeat } from '../../src/cli/commands/heartbeat.js';
import { registerDashboard } from '../../src/cli/commands/dashboard.js';

// ─── Helpers ─────────────────────────────────────────────────────────────
function fakeChildProcess(): EventEmitter & { kill: ReturnType<typeof vi.fn>; killed: boolean } {
  const emitter = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn>; killed: boolean };
  emitter.kill = vi.fn();
  emitter.killed = false;
  return emitter;
}

function signalListenerCalls(onSpy: ReturnType<typeof vi.spyOn>): unknown[][] {
  return onSpy.mock.calls.filter(([sig]) => sig === 'SIGINT' || sig === 'SIGTERM');
}

beforeEach(() => {
  vi.clearAllMocks();
  registeredHooks.length = 0;
  unregisterMocks.length = 0;
  mockExistsSync.mockReturnValue(false);
  mockFsWatch.mockReturnValue({ close: vi.fn(), on: vi.fn() });
});

describe('dead-listener migration — nervous.ts (`nervous log --follow`)', () => {
  it('registers a shutdown hook instead of process.on(SIGINT)', async () => {
    const onSpy = vi.spyOn(process, 'on');
    const program = new Command();
    program.exitOverride();
    registerNervous(program);

    await program.parseAsync(['node', 'test', 'nervous', 'log', '--follow']);

    expect(mockRegisterShutdownHook).toHaveBeenCalledTimes(1);
    expect(signalListenerCalls(onSpy)).toEqual([]);
    onSpy.mockRestore();
  });

  it('the registered hook unwatches the history file — real cleanup, idempotent', async () => {
    const program = new Command();
    program.exitOverride();
    registerNervous(program);
    await program.parseAsync(['node', 'test', 'nervous', 'log', '--follow']);

    const hook = lastHook();
    await hook();
    await hook();

    expect(mockUnwatchFile).toHaveBeenCalledTimes(2);
    expect(mockUnwatchFile).toHaveBeenCalledWith(
      '/test-root/.deckent/nervous/history.jsonl',
      expect.any(Function),
    );
  });

  it('non-follow `nervous log` registers no hook (unchanged, non-daemon path)', async () => {
    const program = new Command();
    program.exitOverride();
    registerNervous(program);

    await program.parseAsync(['node', 'test', 'nervous', 'log']);

    expect(mockRegisterShutdownHook).not.toHaveBeenCalled();
  });
});

describe('dead-listener migration — chat.ts (spawnChatProcess)', () => {
  it('registers a shutdown hook instead of process.on(SIGINT/SIGTERM)', () => {
    mockSpawn.mockImplementation(() => fakeChildProcess());
    const onSpy = vi.spyOn(process, 'on');

    const { detach } = spawnChatProcess('claude');

    expect(mockRegisterShutdownHook).toHaveBeenCalledTimes(1);
    expect(signalListenerCalls(onSpy)).toEqual([]);

    detach();
    onSpy.mockRestore();
  });

  it('the registered hook kills a still-alive child; detach() unregisters the hook (normal-exit path)', async () => {
    let captured: ReturnType<typeof fakeChildProcess> | null = null;
    mockSpawn.mockImplementation(() => { captured = fakeChildProcess(); return captured; });

    const { detach } = spawnChatProcess('codex');
    const hook = lastHook();
    const unregister = lastUnregister();

    await hook();
    expect(captured!.kill).toHaveBeenCalledTimes(1);
    expect(unregister).not.toHaveBeenCalled();

    detach();
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('the hook is a no-op once the child already exited (idempotent guard preserved)', async () => {
    let captured: ReturnType<typeof fakeChildProcess> | null = null;
    mockSpawn.mockImplementation(() => { captured = fakeChildProcess(); return captured; });
    spawnChatProcess('gemini');
    captured!.killed = true;

    const hook = lastHook();
    await hook();

    expect(captured!.kill).not.toHaveBeenCalled();
  });
});

describe('dead-listener migration — flow.ts (`flow run` daemon mode)', () => {
  it('registers a shutdown hook instead of process.on(SIGINT)', async () => {
    const onSpy = vi.spyOn(process, 'on');
    const program = new Command();
    program.exitOverride();
    registerFlow(program);

    await program.parseAsync(['node', 'test', 'flow', 'run']);

    expect(mockRegisterShutdownHook).toHaveBeenCalledTimes(1);
    expect(signalListenerCalls(onSpy)).toEqual([]);
    onSpy.mockRestore();
  });

  it('the registered hook stops the runtime — real cleanup, idempotent (FlowRuntime.stop() self-guards)', async () => {
    const program = new Command();
    program.exitOverride();
    registerFlow(program);
    await program.parseAsync(['node', 'test', 'flow', 'run']);

    const hook = lastHook();
    await hook();
    await hook();

    expect(mockRuntimeStop).toHaveBeenCalledTimes(2);
  });

  it('`flow run --once` registers no hook (single tick, no daemon loop)', async () => {
    const program = new Command();
    program.exitOverride();
    registerFlow(program);

    await program.parseAsync(['node', 'test', 'flow', 'run', '--once']);

    expect(mockRegisterShutdownHook).not.toHaveBeenCalled();
  });
});

describe('dead-listener migration — heartbeat.ts (`heartbeat --daemon`)', () => {
  it('registers a shutdown hook instead of process.on(SIGINT/SIGTERM)', async () => {
    const onSpy = vi.spyOn(process, 'on');
    const program = new Command();
    program.exitOverride();
    registerHeartbeat(program);

    await program.parseAsync(['node', 'test', 'heartbeat', '--daemon']);

    expect(mockRegisterShutdownHook).toHaveBeenCalledTimes(1);
    expect(signalListenerCalls(onSpy)).toEqual([]);
    onSpy.mockRestore();
  });

  it('the registered hook stops the daemon — real cleanup, idempotent (HeartbeatDaemon.stop() self-guards)', async () => {
    const program = new Command();
    program.exitOverride();
    registerHeartbeat(program);
    await program.parseAsync(['node', 'test', 'heartbeat', '--daemon']);

    const hook = lastHook();
    await hook();
    await hook();

    expect(mockDaemonStop).toHaveBeenCalledTimes(2);
  });
});

describe('dead-listener migration — dashboard.ts', () => {
  it('registers a shutdown hook instead of process.on(SIGINT/SIGTERM)', async () => {
    const onSpy = vi.spyOn(process, 'on');
    const program = new Command();
    program.exitOverride();
    registerDashboard(program);

    await program.parseAsync(['node', 'test', 'dashboard']);

    expect(mockRegisterShutdownHook).toHaveBeenCalledTimes(1);
    expect(signalListenerCalls(onSpy)).toEqual([]);
    onSpy.mockRestore();
  });

  it('the registered hook closes the watcher + clears the fallback timer — real cleanup, idempotent', async () => {
    const closeMock = vi.fn();
    mockFsWatch.mockReturnValue({ close: closeMock, on: vi.fn() });
    const program = new Command();
    program.exitOverride();
    registerDashboard(program);

    await program.parseAsync(['node', 'test', 'dashboard']);

    const hook = lastHook();
    await hook();
    await hook();

    expect(closeMock).toHaveBeenCalledTimes(2);
  });
});
