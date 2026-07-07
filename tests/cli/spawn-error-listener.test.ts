// tests/cli/spawn-error-listener.test.ts — Task 380-005 (SPAWN-ERROR-LISTENERS)
//
// Verifies the fix for three spawn-sites that lacked a `child.on('error', ...)`
// listener (an EventEmitter 'error' event with no listener throws as an
// uncaught exception — Node contract), plus the related `ensureSpawn()`
// post-exit `exited` flag reset:
//   1. chat-session.ts `defaultPersistentSpawn` — real ENOENT spawn must not
//      crash the process and must reject instead of hanging forever.
//   2. chat-session.ts `ensureSpawn()` — after exit()+respawn, isAlive() must
//      report honestly (not stuck `false` from a stale `exited` flag).
//   3. chat-enterprise-bridge.ts `defaultSpawnFn` — a spawn 'error' must
//      resolve the returned Promise (tagged), not hang or crash.
//   4. chat.ts interactive `--native` REPL branch — must pass
//      `gracefulErrors: true` to runChatNativeLoop (mirrors the sibling
//      --once branch) so a provider throw becomes a handled turn.
//
// Hermetic: no real claude/codex/gemini binary is touched. Group 1 spawns a
// deliberately nonexistent path via Node's real child_process (guaranteed
// ENOENT, no host dependency). Groups 3/4 mock node:child_process /
// chat-native.js respectively.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { Command } from 'commander';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => ({
  printMock: vi.fn(),
  printErrorMock: vi.fn(),
  runChatNativeLoopMock: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  // Default: pass through to the REAL spawn (group 1 needs a genuine ENOENT).
  // Individual tests override with mockImplementationOnce (group 3).
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: hoisted.printMock,
  printError: hoisted.printErrorMock,
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/project'),
}));

vi.mock('../../src/cli/commands/chat-native.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cli/commands/chat-native.js')>();
  return { ...actual, runChatNativeLoop: hoisted.runChatNativeLoopMock };
});

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { spawn } from 'node:child_process';
import {
  createPersistentClaudeSession,
  defaultPersistentSpawn,
  type PersistentClaudeHandle,
  type PersistentSpawnFn,
} from '../../src/cli/commands/chat-session.js';
import { defaultSpawnFn } from '../../src/cli/commands/chat-enterprise-bridge.js';
import { registerChat } from '../../src/cli/commands/chat.js';

const ENOENT_BINARY = '/nonexistent/deckent-enoent-test-binary-xyz';

function resetMocks(): void {
  hoisted.printMock.mockReset();
  hoisted.printErrorMock.mockReset();
  hoisted.runChatNativeLoopMock.mockReset();
  hoisted.runChatNativeLoopMock.mockResolvedValue([]);
  vi.mocked(spawn).mockClear();
}

// ─── Group 1 — chat-session.ts defaultPersistentSpawn ───────────────────────

describe('chat-session.ts — defaultPersistentSpawn error listener (real ENOENT)', () => {
  beforeEach(resetMocks);

  it('does not crash and rejects stdoutLines.next() instead of hanging forever', async () => {
    const handle = defaultPersistentSpawn(ENOENT_BINARY, [], { ...process.env });
    const iterator = handle.stdoutLines[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toBeInstanceOf(Error);
    handle.kill();
  });

  it('resolves `wait` even though close is not guaranteed to fire after error', async () => {
    const handle = defaultPersistentSpawn(ENOENT_BINARY, [], { ...process.env });
    const result = await handle.wait;
    expect(result.exitCode).toBeNull();
    handle.kill();
  });
});

// ─── Group 2 — chat-session.ts ensureSpawn() exited-flag reset ──────────────

/** Minimal fresh mock PersistentClaudeHandle — a NEW instance per call, like a real spawn. */
function makeMockHandle(): PersistentClaudeHandle & { pushLine(line: string): void } {
  let closed = false;
  const lineQueue: string[] = [];
  let pendingResolver: ((line: string | null) => void) | null = null;
  let waitResolver!: (v: { exitCode: number | null }) => void;
  const wait = new Promise<{ exitCode: number | null }>((r) => { waitResolver = r; });

  function pushLine(line: string): void {
    if (pendingResolver) {
      const r = pendingResolver;
      pendingResolver = null;
      r(line);
    } else {
      lineQueue.push(line);
    }
  }
  function closeStream(): void {
    if (closed) return;
    closed = true;
    if (pendingResolver) {
      const r = pendingResolver;
      pendingResolver = null;
      r(null);
    }
    waitResolver({ exitCode: 0 });
  }

  const stdin = new Writable({
    write(_chunk, _enc, cb) { cb(); },
    final(cb) { cb(); },
  });
  const stdoutLines: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({
      next(): Promise<IteratorResult<string>> {
        if (lineQueue.length > 0) {
          return Promise.resolve({ value: lineQueue.shift() as string, done: false });
        }
        if (closed) {
          return Promise.resolve({ value: undefined as unknown as string, done: true });
        }
        return new Promise<IteratorResult<string>>((resolve) => {
          pendingResolver = (line) => {
            if (line === null) resolve({ value: undefined as unknown as string, done: true });
            else resolve({ value: line, done: false });
          };
        });
      },
    }),
  };

  return {
    stdin,
    stdoutLines,
    wait,
    kill() { closeStream(); },
    pushLine,
  };
}

describe('chat-session.ts — ensureSpawn() exited-flag reset on respawn', () => {
  it('isAlive() reports true after exit() followed by a fresh respawn (kill+restart)', async () => {
    let current = makeMockHandle();
    const spawnFn = vi.fn(() => {
      current = makeMockHandle();
      return current;
    }) as unknown as PersistentSpawnFn;
    const session = createPersistentClaudeSession({ spawnFn });

    // First spawn.
    const send1 = session.send([{ role: 'user', content: 'hi' }]);
    current.pushLine(JSON.stringify({ type: 'result', result: 'ok1' }));
    await send1;
    expect(session.isAlive()).toBe(true);

    // Kill.
    await session.exit();
    expect(session.isAlive()).toBe(false);

    // Restart — a genuinely new child is spawned.
    const send2 = session.send([{ role: 'user', content: 'again' }]);
    current.pushLine(JSON.stringify({ type: 'result', result: 'ok2' }));
    const r2 = await send2;

    expect(r2.text).toBe('ok2');
    expect(session.spawnCount).toBe(2);
    // Bug: without the exited-flag reset in ensureSpawn(), this stayed `false`
    // even though a brand-new child is alive.
    expect(session.isAlive()).toBe(true);
  });
});

// ─── Group 3 — chat-enterprise-bridge.ts defaultSpawnFn error listener ──────

describe('chat-enterprise-bridge.ts — defaultSpawnFn error listener', () => {
  beforeEach(resetMocks);

  it('resolves with an [enterprise-error] tag instead of hanging when spawn errors', async () => {
    const fakeChild = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    vi.mocked(spawn).mockImplementationOnce(() => fakeChild as unknown as ReturnType<typeof spawn>);

    const resultPromise = defaultSpawnFn(['status']);
    fakeChild.emit('error', new Error('spawn node ENOENT'));

    const result = await resultPromise;
    expect(result).toContain('[enterprise-error]');
    expect(result).toContain('ENOENT');
  });

  it('still resolves normally via close when no error occurs', async () => {
    const fakeChild = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    vi.mocked(spawn).mockImplementationOnce(() => fakeChild as unknown as ReturnType<typeof spawn>);

    const resultPromise = defaultSpawnFn(['status']);
    fakeChild.stdout.write('all good');
    fakeChild.stdout.end();
    fakeChild.emit('close', 0);

    const result = await resultPromise;
    expect(result).toBe('all good');
  });
});

// ─── Group 4 — chat.ts interactive --native REPL gracefulErrors ────────────

describe('chat.ts — interactive --native REPL passes gracefulErrors: true', () => {
  beforeEach(resetMocks);

  it('runChatNativeLoop is called with gracefulErrors: true (mirrors the --once branch)', async () => {
    const program = new Command();
    program.exitOverride();
    registerChat(program);

    await program.parseAsync(['node', 'deckent', 'chat', '--native']);

    expect(hoisted.runChatNativeLoopMock).toHaveBeenCalledTimes(1);
    const callArg = hoisted.runChatNativeLoopMock.mock.calls[0]?.[0] as { gracefulErrors?: boolean };
    expect(callArg.gracefulErrors).toBe(true);
  });
});
