import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// REPL-575 K4: chat-enterprise-bridge.ts's headless spawn had NO timeout (and
// no `reject`) — a genuinely-hung `/audit` subprocess (never emits close/error)
// froze the whole REPL turn forever, since the outer loop awaits it. The
// sibling chat-tool-bridge got born-516's finite budget; this brings the same
// safety net here, keeping this bridge's never-reject contract (returns a
// tagged `[enterprise-error]` string on timeout). Exercises the real
// timeout/kill logic directly — node:child_process mocked + fake timers, no
// real subprocess, no wall-clock wait (hermetic).

const hoisted = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: hoisted.spawnMock,
}));

import {
  defaultSpawnFn,
  resolveEnterpriseTimeoutMs,
} from '../../src/cli/commands/chat-enterprise-bridge.js';

type FakeStream = EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };

interface FakeChild extends EventEmitter {
  stdout: FakeStream;
  stderr: FakeStream;
  kill: ReturnType<typeof vi.fn>;
}

function fakeStream(): FakeStream {
  const stream = new EventEmitter() as FakeStream;
  stream.setEncoding = vi.fn();
  return stream;
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = fakeStream();
  child.stderr = fakeStream();
  child.kill = vi.fn();
  return child;
}

describe('resolveEnterpriseTimeoutMs — per-command spawn-kill budget (REPL-575 K4)', () => {
  it('gives audit (provider-backed gate, documented 30-60s+) a budget past the 30s default', () => {
    expect(resolveEnterpriseTimeoutMs(['audit'])).toBeGreaterThan(30_000);
    expect(resolveEnterpriseTimeoutMs(['audit', 'sprint-224'])).toBeGreaterThan(30_000);
  });

  it('keeps the conservative 30s default for the short enterprise reads', () => {
    expect(resolveEnterpriseTimeoutMs(['rbac', 'roles'])).toBe(30_000);
    expect(resolveEnterpriseTimeoutMs(['flow', 'list'])).toBe(30_000);
    expect(resolveEnterpriseTimeoutMs(['cost', 'show'])).toBe(30_000);
  });

  it('falls back to the default for an empty argv', () => {
    expect(resolveEnterpriseTimeoutMs([])).toBe(30_000);
  });
});

describe('defaultSpawnFn — finite budget + never-reject contract (REPL-575 K4)', () => {
  beforeEach(() => {
    hoisted.spawnMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a hung short command (cost) is killed at the 30s budget and returns a tagged notice (never rejects)', async () => {
    const child = fakeChild();
    hoisted.spawnMock.mockReturnValue(child);
    const promise = defaultSpawnFn(['cost', 'show']);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(promise).resolves.toBe('[enterprise-error] timed out after 30s');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('a bare /audit that legitimately exceeds 30s is NOT killed and completes normally', async () => {
    const child = fakeChild();
    hoisted.spawnMock.mockReturnValue(child);
    const promise = defaultSpawnFn(['audit']);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(child.kill).not.toHaveBeenCalled();
    child.stdout.emit('data', 'audit gate: GO\n');
    child.emit('close');
    await expect(promise).resolves.toBe('audit gate: GO');
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('the long-running budget is still finite — an audit that never closes is eventually killed', async () => {
    const child = fakeChild();
    hoisted.spawnMock.mockReturnValue(child);
    const promise = defaultSpawnFn(['audit']);
    await vi.advanceTimersByTimeAsync(resolveEnterpriseTimeoutMs(['audit']));
    await expect(promise).resolves.toMatch(/\[enterprise-error\] timed out after \d+s/);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('a spawn-level error (ENOENT) settles immediately with a tagged notice — no hang until timeout', async () => {
    const child = fakeChild();
    hoisted.spawnMock.mockReturnValue(child);
    const promise = defaultSpawnFn(['cost', 'show']);
    child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
    await expect(promise).resolves.toBe('[enterprise-error] spawn ENOENT');
    // Advancing past the budget afterward must not double-settle or kill.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('a normal close well within budget resolves with trimmed output and clears the timer', async () => {
    const child = fakeChild();
    hoisted.spawnMock.mockReturnValue(child);
    const promise = defaultSpawnFn(['flow', 'list']);
    child.stdout.emit('data', 'flow-1\n');
    child.emit('close');
    await expect(promise).resolves.toBe('flow-1');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(child.kill).not.toHaveBeenCalled();
  });
});
