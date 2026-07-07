import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// born-516: chat-tool-bridge.ts's headless spawn used one flat 30s timeout for
// every bridged tool, killing legitimately-long tools (deckent_audit,
// deckent_plan) mid-run. These tests exercise the real timeout/error-listener
// logic in `defaultSpawnFn` directly — node:child_process is mocked with a
// fake EventEmitter-based child + vi.useFakeTimers so no real subprocess is
// spawned and no test waits on a real 30s+ wall-clock timer (hermetic).

const hoisted = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: hoisted.spawnMock,
}));

import {
  defaultSpawnFn,
  resolveSpawnTimeoutMs,
} from '../../src/cli/commands/chat-tool-bridge.js';

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

describe('resolveSpawnTimeoutMs — per-command spawn-kill budget (born-516)', () => {
  it('gives audit/plan (documented long-running) a budget past the 30s default', () => {
    expect(resolveSpawnTimeoutMs(['audit'])).toBeGreaterThan(30_000);
    expect(resolveSpawnTimeoutMs(['audit', 'sprint-224'])).toBeGreaterThan(30_000);
    expect(resolveSpawnTimeoutMs(['audit', 'query', '--action', 'rbac.check'])).toBeGreaterThan(30_000);
    expect(resolveSpawnTimeoutMs(['plan'])).toBeGreaterThan(30_000);
  });

  it('keeps the conservative 30s default for short read-only tools', () => {
    expect(resolveSpawnTimeoutMs(['status'])).toBe(30_000);
    expect(resolveSpawnTimeoutMs(['history'])).toBe(30_000);
    expect(resolveSpawnTimeoutMs(['recall', 'docker'])).toBe(30_000);
  });

  it('falls back to the default for an empty argv', () => {
    expect(resolveSpawnTimeoutMs([])).toBe(30_000);
  });
});

describe('defaultSpawnFn — per-command timeout + error listener (born-516 / born-509)', () => {
  beforeEach(() => {
    hoisted.spawnMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('short tool (status) is still killed at the default 30s budget if it hangs', async () => {
    const child = fakeChild();
    hoisted.spawnMock.mockReturnValue(child);
    const promise = defaultSpawnFn(['status']);
    const assertion = expect(promise).rejects.toThrow('timed out after 30s');
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('a deckent_audit spawn legitimately exceeding 30s is NOT killed and completes normally', async () => {
    const child = fakeChild();
    hoisted.spawnMock.mockReturnValue(child);
    const promise = defaultSpawnFn(['audit', 'sprint-224']);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(child.kill).not.toHaveBeenCalled();
    child.stdout.emit('data', 'audit gate: GO\n');
    child.emit('close');
    await expect(promise).resolves.toBe('audit gate: GO');
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('the long-running budget is still finite — an audit spawn that never closes is eventually killed', async () => {
    const child = fakeChild();
    hoisted.spawnMock.mockReturnValue(child);
    const promise = defaultSpawnFn(['audit']);
    const assertion = expect(promise).rejects.toThrow(/timed out after \d+s/);
    await vi.advanceTimersByTimeAsync(resolveSpawnTimeoutMs(['audit']));
    await assertion;
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('a spawn-level error (e.g. ENOENT) rejects immediately — no hang until the timeout fires', async () => {
    const child = fakeChild();
    hoisted.spawnMock.mockReturnValue(child);
    const promise = defaultSpawnFn(['status']);
    const err = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
    child.emit('error', err);
    await expect(promise).rejects.toThrow('spawn ENOENT');
    // Advancing past the timeout budget afterward must not double-settle.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('short tools still resolve normally well within their 30s budget', async () => {
    const child = fakeChild();
    hoisted.spawnMock.mockReturnValue(child);
    const promise = defaultSpawnFn(['history']);
    child.stdout.emit('data', 'sprint-222\n');
    child.emit('close');
    await expect(promise).resolves.toBe('sprint-222');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(child.kill).not.toHaveBeenCalled();
  });
});
