/**
 * SIGTERM-TEARDOWN (born-549, Sprint 387 Task 387-004, ADR-G-013 extension)
 *
 * SIGTERM/SIGINT used to skip the REPL's own resources entirely: a warm-child
 * persistent claude session (src/cli/commands/chat-session.ts), an MCP client
 * broker (src/mcp-client/broker.ts, connected from src/cli/repl/run.tsx), and
 * terminal state (alt-screen / raw mode) were only ever torn down when the app
 * itself called `/exit` — a `kill <pid>` / Ctrl+C left every one of them
 * running, an orphan process for the first two.
 *
 * Fix under test (entry.ts):
 *   - `registerReplTeardown(hook)` — a REPL registers async cleanup here.
 *   - `onSignal(signal)` — awaits every registered hook (bounded, best-effort)
 *     BEFORE the existing interruptActiveSprint()/killAllSessions()/exit(0)
 *     path. When NO hook is registered (no REPL active — the exact shape of
 *     the pre-existing tests/cli/sigterm-cleanup.test.ts), `onSignal` takes
 *     the identical synchronous fast-path it always has — that suite is left
 *     untouched by this task and must keep passing unmodified.
 *   - `shutdownSignalsForPlatform(platform)` — the honest POSIX-vs-Windows
 *     signal-name decision (SIGTERM has no Windows equivalent; SIGBREAK does).
 *
 * Fix under test (run.tsx):
 *   - `buildReplTeardown(deps)` — the ONE teardown shared by normal exit and a
 *     signal: unmount Ink, restore alt-screen, dispose approvals, close
 *     memory, disconnect the MCP broker, exit the warm-child provider.
 *
 * Hermeticity: no real OS signal is ever sent to the test process (no
 * `process.kill`, no `process.emit('SIGTERM', …)`) — `onSignal` is called
 * directly, mirroring the hoisted-mock import pattern already used by
 * tests/cli/sigterm-cleanup.test.ts. The "warm-child" and "MCP broker" cases
 * use REAL production code (`createPersistentClaudeSession`,
 * `McpClientBroker` + the SDK's `InMemoryTransport`) driven by async-spawn-
 * shaped fakes (a `kill()` whose 'close' resolves on a LATER tick, exactly
 * like a real child process) rather than synthetic no-op mocks — proving the
 * cleanup is genuinely awaited, not fired-and-forgotten. No `spawnSync`
 * anywhere in this suite or the code under test.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { Writable } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { McpClientBroker } from '../../src/mcp-client/broker.js';
import type { McpServerDef } from '../../src/mcp-client/types.js';
import {
  createPersistentClaudeSession,
  type PersistentClaudeHandle,
  type PersistentSpawnFn,
} from '../../src/cli/commands/chat-session.js';
import { buildReplTeardown } from '../../src/cli/repl/run.js';

// ─── Hoisted mocks so importing entry.ts has no heavy top-level side-effects
// (mirrors tests/cli/sigterm-cleanup.test.ts's proven pattern exactly). ─────

const hoisted = vi.hoisted(() => ({
  parseAsyncMock: vi.fn(async () => undefined),
  hookMock: vi.fn(),
  buildProgramMock: vi.fn(),
  bootstrapMock: vi.fn(async () => undefined),
  handleCliErrorMock: vi.fn(),
  interruptActiveSprintMock: vi.fn(),
  killAllSessionsMock: vi.fn(),
}));

hoisted.buildProgramMock.mockImplementation(() => {
  const fake = { hook: hoisted.hookMock, parseAsync: hoisted.parseAsyncMock };
  hoisted.hookMock.mockReturnValue(fake);
  return fake;
});

vi.mock('../../src/cli/index.js', () => ({ buildProgram: hoisted.buildProgramMock }));
vi.mock('../../src/cli/helpers/process.js', () => ({ handleCliError: hoisted.handleCliErrorMock }));
vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  interruptActiveSprint: hoisted.interruptActiveSprintMock,
}));
vi.mock('../../src/orchestra/tmux.js', () => ({ killAllSessions: hoisted.killAllSessionsMock }));
vi.mock('../../src/core/model-catalog.js', () => ({ bootstrapFromCatalog: hoisted.bootstrapMock }));

let onSignal: (signal: string) => Promise<void>;
let registerReplTeardown: (hook: () => Promise<void>) => () => void;
let shutdownSignalsForPlatform: (platform: NodeJS.Platform) => readonly string[];

beforeAll(async () => {
  const mod = await import('../../src/cli/entry.js');
  onSignal = mod.onSignal;
  registerReplTeardown = mod.registerReplTeardown;
  shutdownSignalsForPlatform = mod.shutdownSignalsForPlatform;
});

// Every test that registers a hook tracks its unregister here so a failed
// assertion never leaks a stale hook into a LATER test (test isolation).
const pendingUnregisters: Array<() => void> = [];
function trackedRegister(hook: () => Promise<void>): () => void {
  const unregister = registerReplTeardown(hook);
  pendingUnregisters.push(unregister);
  return unregister;
}

beforeEach(() => {
  hoisted.interruptActiveSprintMock.mockClear();
  hoisted.killAllSessionsMock.mockClear();
});

afterEach(() => {
  while (pendingUnregisters.length > 0) {
    pendingUnregisters.pop()!();
  }
  vi.useRealTimers();
});

// ─── Async-spawn-shaped warm-child fake (mirrors chat-session-persistent.test.ts) ──

/** A PersistentClaudeHandle whose kill() resolves `wait` on a LATER tick —
 *  exactly like a real child process's 'close' event never firing synchronously
 *  inside kill(). One scripted `result` line lets a single send() resolve, then
 *  stdout goes idle (a real persistent session stays open between turns). */
function makeAsyncSpawnWarmChild(): { handle: PersistentClaudeHandle; killCount: () => number } {
  let killCount = 0;
  let resolveWait!: (v: { exitCode: number | null }) => void;
  const wait = new Promise<{ exitCode: number | null }>((r) => { resolveWait = r; });
  const stdin = new Writable({
    write(_chunk, _enc, cb) { cb(); },
    final(cb) { cb(); },
  });
  let yielded = false;
  const stdoutLines: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({
      next(): Promise<IteratorResult<string>> {
        if (!yielded) {
          yielded = true;
          return Promise.resolve({
            value: JSON.stringify({ type: 'result', result: 'hi there' }),
            done: false,
          });
        }
        // Idle warm child: no more output until killed — never resolves.
        return new Promise(() => { /* stays pending */ });
      },
    }),
  };
  const handle: PersistentClaudeHandle = {
    stdin,
    stdoutLines,
    wait,
    kill() {
      killCount++;
      setImmediate(() => resolveWait({ exitCode: 0 }));
    },
  };
  return { handle, killCount: () => killCount };
}

async function buildFakeMcpServer(): Promise<{ client: Client }> {
  const server = new McpServer({ name: 'fake-server', version: '0.0.1' });
  server.registerTool(
    'ping',
    { description: 'returns pong', inputSchema: {} },
    async () => ({ content: [{ type: 'text' as const, text: 'pong' }] }),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.1' }, { capabilities: {} });
  await client.connect(clientTransport);
  return { client };
}

function fakeStdioTransport(): Transport {
  return { start: async () => undefined, close: async () => undefined, send: async () => undefined };
}

const FAKE_MCP_DEF: McpServerDef = { transport: 'stdio', command: '/nonexistent/mcp-server' };

// ─── onSignal — no REPL active → unchanged synchronous fast-path ───────────
// Regression guard: proves this task's changes do not alter behavior for the
// no-REPL case that tests/cli/sigterm-cleanup.test.ts (out of this task's
// write scope) already locks in.

describe('onSignal — no REPL registered → unchanged synchronous fast-path', () => {
  it('SIGTERM still runs interrupt/killSessions/exit synchronously in the same tick', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    void onSignal('SIGTERM');

    expect(hoisted.interruptActiveSprintMock).toHaveBeenCalledTimes(1);
    expect(hoisted.killAllSessionsMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(stderrSpy).toHaveBeenCalledWith('\nReceived SIGTERM, exiting…\n');

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});

// ─── registerReplTeardown + onSignal — the actual gap this task closes ─────

describe('registerReplTeardown — a running REPL is torn down on SIGTERM/SIGINT', () => {
  it('warm-child persistent session (real createPersistentClaudeSession, async spawn) is killed and AWAITED before sprint/tmux cleanup', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { handle, killCount } = makeAsyncSpawnWarmChild();
    const spawnFn: PersistentSpawnFn = () => handle;
    const session = createPersistentClaudeSession({ spawnFn });

    // A prior REPL turn already happened — the child is warm and reused.
    const reply = await session.send([{ role: 'user', content: 'merhaba' }]);
    expect(reply.text).toBe('hi there');
    expect(session.isAlive()).toBe(true);

    const order: string[] = [];
    hoisted.interruptActiveSprintMock.mockImplementationOnce(() => { order.push('interrupt'); });
    hoisted.killAllSessionsMock.mockImplementationOnce(() => { order.push('killSessions'); });
    trackedRegister(async () => {
      await session.exit();
      order.push('warm-child-exited');
    });

    await onSignal('SIGTERM');

    expect(killCount()).toBe(1);
    expect(session.isAlive()).toBe(false);
    expect(order).toEqual(['warm-child-exited', 'interrupt', 'killSessions']);
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
    vi.mocked(process.stderr.write).mockRestore();
  });

  it('MCP client broker (real McpClientBroker + SDK InMemoryTransport) is fully disconnected — no orphaned connection survives SIGTERM', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const broker = new McpClientBroker();
    const { client } = await buildFakeMcpServer();
    broker.registerConnection('fake', client, fakeStdioTransport(), FAKE_MCP_DEF);
    expect(broker.isConnected('fake')).toBe(true);

    trackedRegister(() => broker.disconnectAll());

    await onSignal('SIGTERM');

    expect(broker.isConnected('fake')).toBe(false);
    expect(broker.list()).toEqual([]);
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
    vi.mocked(process.stderr.write).mockRestore();
  });

  it('unregister() removes the hook — a later signal does not re-run stale REPL cleanup', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const hook = vi.fn(async () => undefined);
    const unregister = trackedRegister(hook);
    unregister();

    await onSignal('SIGTERM');

    expect(hook).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
    vi.mocked(process.stderr.write).mockRestore();
  });

  it('a rejecting REPL teardown hook does not prevent sprint/tmux cleanup or exit (best-effort, non-fatal)', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    trackedRegister(async () => { throw new Error('boom'); });

    await expect(onSignal('SIGTERM')).resolves.toBeUndefined();
    expect(hoisted.interruptActiveSprintMock).toHaveBeenCalledTimes(1);
    expect(hoisted.killAllSessionsMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
    vi.mocked(process.stderr.write).mockRestore();
  });

  it('a hanging REPL teardown hook does not block shutdown forever (bounded overall timeout)', async () => {
    vi.useFakeTimers();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    trackedRegister(() => new Promise<void>(() => { /* never resolves */ }));

    const signalPromise = onSignal('SIGTERM');
    await vi.advanceTimersByTimeAsync(5_100);
    await signalPromise;

    expect(hoisted.interruptActiveSprintMock).toHaveBeenCalledTimes(1);
    expect(hoisted.killAllSessionsMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
    vi.mocked(process.stderr.write).mockRestore();
  });
});

// ─── shutdownSignalsForPlatform — honest POSIX vs. Windows adapter ─────────

describe('shutdownSignalsForPlatform (Law #2 — every environment)', () => {
  it('POSIX (linux/darwin) registers SIGINT + SIGTERM', () => {
    expect(shutdownSignalsForPlatform('linux')).toEqual(['SIGINT', 'SIGTERM']);
    expect(shutdownSignalsForPlatform('darwin')).toEqual(['SIGINT', 'SIGTERM']);
  });

  it('win32 registers SIGINT + SIGBREAK, NOT SIGTERM (Node has no real Windows SIGTERM event)', () => {
    const signals = shutdownSignalsForPlatform('win32');
    expect(signals).toEqual(['SIGINT', 'SIGBREAK']);
    expect(signals).not.toContain('SIGTERM');
  });
});

// ─── buildReplTeardown (run.tsx) — pure factory, no Ink mount required ─────

describe('buildReplTeardown — shared normal-exit/signal teardown (pure, no Ink mount)', () => {
  it('unmounts Ink, disconnects the MCP broker, then exits the warm-child switcher, in order', async () => {
    const order: string[] = [];
    const teardown = buildReplTeardown({
      unmountInk: () => { order.push('unmount'); },
      altScreen: false,
      restoreAltScreen: () => { order.push('altscreen-restore'); },
      mcpBroker: {
        disconnectAll: async () => {
          await new Promise((r) => setImmediate(r));
          order.push('mcp-disconnect');
        },
      },
      switcherExit: async () => {
        await new Promise((r) => setImmediate(r));
        order.push('switcher-exit');
      },
    });

    await teardown();

    expect(order).toEqual(['unmount', 'mcp-disconnect', 'switcher-exit']);
  });

  it('restores the alt-screen only when altScreen=true', async () => {
    const restoreOn = vi.fn();
    const teardownOn = buildReplTeardown({
      unmountInk: () => undefined,
      altScreen: true,
      restoreAltScreen: restoreOn,
      switcherExit: async () => undefined,
    });
    await teardownOn();
    expect(restoreOn).toHaveBeenCalledTimes(1);

    const restoreOff = vi.fn();
    const teardownOff = buildReplTeardown({
      unmountInk: () => undefined,
      altScreen: false,
      restoreAltScreen: restoreOff,
      switcherExit: async () => undefined,
    });
    await teardownOff();
    expect(restoreOff).not.toHaveBeenCalled();
  });

  it('is idempotent — calling teardown() twice only runs the cleanup once', async () => {
    const switcherExit = vi.fn(async () => undefined);
    const teardown = buildReplTeardown({
      unmountInk: () => undefined,
      altScreen: false,
      restoreAltScreen: () => undefined,
      switcherExit,
    });

    await teardown();
    await teardown();

    expect(switcherExit).toHaveBeenCalledTimes(1);
  });

  it('one throwing dependency (memory.close) does not skip the remaining steps (best-effort)', async () => {
    const memoryClose = vi.fn(() => { throw new Error('already closed'); });
    const mcpDisconnectAll = vi.fn(async () => undefined);
    const switcherExit = vi.fn(async () => undefined);
    const teardown = buildReplTeardown({
      unmountInk: () => undefined,
      altScreen: false,
      restoreAltScreen: () => undefined,
      memory: { close: memoryClose },
      mcpBroker: { disconnectAll: mcpDisconnectAll },
      switcherExit,
    });

    await expect(teardown()).resolves.toBeUndefined();
    expect(mcpDisconnectAll).toHaveBeenCalledTimes(1);
    expect(switcherExit).toHaveBeenCalledTimes(1);
  });

  it('a rejecting mcpBroker.disconnectAll() still allows switcherExit() to run (independent best-effort steps)', async () => {
    const mcpDisconnectAll = vi.fn(async () => { throw new Error('transport hung'); });
    const switcherExit = vi.fn(async () => undefined);
    const teardown = buildReplTeardown({
      unmountInk: () => undefined,
      altScreen: false,
      restoreAltScreen: () => undefined,
      mcpBroker: { disconnectAll: mcpDisconnectAll },
      switcherExit,
    });

    await teardown();

    expect(switcherExit).toHaveBeenCalledTimes(1);
  });
});
