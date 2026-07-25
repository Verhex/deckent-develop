// PROCESS-GROUP-KILL (born-568, ADR-G-013 PGID-TEARDOWN parity) — proves that
// CodexAdapter and GeminiAdapter now share subprocess.ts's process-group kill +
// SIGTERM→SIGKILL escalation primitive (`killProcessGroupWithEscalation`)
// instead of the old naive single-pid `entry.process.kill(signal)`.
//
// Before this task: codex.ts / gemini.ts spawned their CLI child WITHOUT
// `detached: true` and killed it with a plain single-pid signal — any
// grandchild the CLI forked (its own tool subprocesses) was never signalled
// and survived as an orphan, and there was no SIGKILL follow-up for a
// signal-ignoring child.
//
// After this task, both adapters:
//   - spawn with `detached: this.platform !== 'win32'` (POSIX: the worker
//     becomes the LEADER of its own process group, so a group-form signal
//     reaches it and everything it forked).
//   - route kill through the shared `killProcessGroupWithEscalation` (see
//     subprocess.ts), which signals `process.kill(-pid, signal)` on POSIX
//     (falling back to the direct pid on throw) and arms an unref'd
//     SIGTERM→SIGKILL escalation cleared on child exit.
//   - on win32, use taskkill /T and escalate with /F so grandchildren cannot
//     outlive a budget/timeout stop.
//
// Mirrors the proven pattern in tests/providers/pgid-teardown.test.ts
// (subprocess.ts's own coverage for the identical mechanism).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';

// ─── Mock node:child_process ─────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '0.1.0\n' }),
}));

// ─── Mock node:fs ────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  openSync: vi.fn().mockReturnValue(42),
  closeSync: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { CodexAdapter } from '../../src/providers/codex.js';
import { GeminiAdapter } from '../../src/providers/gemini.js';
import type { ModelType } from '../../src/core/types.js';

const mockSpawn = spawn as unknown as MockInstance;

/** A fully-faked child — an EventEmitter with the surface both adapters touch. Never a real process. */
function makeFakeChild(pid: number): ChildProcess & { emit: EventEmitter['emit'] } {
  const child = new EventEmitter() as unknown as ChildProcess & { emit: EventEmitter['emit'] };
  (child as unknown as { pid: number }).pid = pid;
  (child as unknown as { kill: unknown }).kill = vi.fn();
  (child as unknown as { stdin: unknown }).stdin = { write: vi.fn(), end: vi.fn() };
  (child as unknown as { stdout: unknown }).stdout = { on: vi.fn() };
  (child as unknown as { stderr: unknown }).stderr = { on: vi.fn() };
  (child as unknown as { unref: unknown }).unref = vi.fn();
  return child;
}

const CODEX_MODEL: ModelType = 'gpt-4.1';
const GEMINI_MODEL: ModelType = 'gemini-2.5-pro';
const WORKER_PID = 6789;

beforeEach(() => {
  vi.clearAllMocks();
  process.env['OPENAI_API_KEY'] = 'sk-test-key';
  process.env['GOOGLE_API_KEY'] = 'AIza-test-key';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env['OPENAI_API_KEY'];
  delete process.env['GOOGLE_API_KEY'];
});

// ─── Adapter-parametrized suite ────────────────────────────────────────
// Both adapters share the exact same fix, so the same scenarios are run
// against each via a small adapter-specific shim.

interface AdapterUnderTest {
  label: string;
  spawnWorker: (platform: NodeJS.Platform, child: ReturnType<typeof makeFakeChild>) => CodexAdapter | GeminiAdapter;
}

const ADAPTERS: AdapterUnderTest[] = [
  {
    label: 'CodexAdapter',
    spawnWorker: (platform, child) => {
      mockSpawn.mockReturnValue(child);
      const adapter = new CodexAdapter('/tmp/test-codex-project', { platform });
      adapter.spawn('task-pg-1', CODEX_MODEL, 'prompt');
      return adapter;
    },
  },
  {
    label: 'GeminiAdapter',
    spawnWorker: (platform, child) => {
      mockSpawn.mockReturnValue(child);
      const adapter = new GeminiAdapter('/tmp/test-gemini-project', { platform });
      adapter.spawn('task-pg-1', GEMINI_MODEL, 'prompt');
      return adapter;
    },
  },
];

describe.each(ADAPTERS)('$label — PROCESS-GROUP-KILL on POSIX', ({ spawnWorker }) => {
  it('spawn() passes detached:true to spawn on a POSIX platform', () => {
    const child = makeFakeChild(WORKER_PID);
    spawnWorker('linux', child);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [, , spawnOpts] = mockSpawn.mock.calls[0] as [unknown, unknown, { detached?: boolean }];
    expect(spawnOpts.detached).toBe(true);
  });

  it('kill() (SIGTERM) signals process.kill(-pid, "SIGTERM") — the process-group form', () => {
    const child = makeFakeChild(WORKER_PID);
    const adapter = spawnWorker('linux', child);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    adapter.kill('task-pg-1');

    expect(killSpy).toHaveBeenCalledWith(-WORKER_PID, 'SIGTERM');
    // The group form succeeded — the direct single-pid child.kill() must NOT be used.
    expect((child as unknown as { kill: ReturnType<typeof vi.fn> }).kill).not.toHaveBeenCalled();
    child.emit('exit', 0); // clears the SIGKILL-escalation timer
  });

  it('SIGTERM→SIGKILL escalation also targets the process group after the grace window', async () => {
    vi.useFakeTimers();
    const child = makeFakeChild(WORKER_PID);
    const adapter = spawnWorker('linux', child);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    adapter.kill('task-pg-1');
    expect(killSpy).toHaveBeenCalledWith(-WORKER_PID, 'SIGTERM');
    expect(killSpy).not.toHaveBeenCalledWith(-WORKER_PID, 'SIGKILL');

    await vi.advanceTimersByTimeAsync(2_000); // past SIGKILL_ESCALATION_MS

    expect(killSpy).toHaveBeenCalledWith(-WORKER_PID, 'SIGKILL');
  });

  it('a worker that exits on SIGTERM is not SIGKILL-escalated (escalation cleared on exit)', async () => {
    vi.useFakeTimers();
    const child = makeFakeChild(WORKER_PID);
    const adapter = spawnWorker('linux', child);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    adapter.kill('task-pg-1');
    child.emit('exit', 0); // well-behaved worker exits → escalation timer cleared
    await vi.advanceTimersByTimeAsync(2_000);

    expect(killSpy).not.toHaveBeenCalledWith(-WORKER_PID, 'SIGKILL');
  });

  it('falls back to the direct child pid when the group-kill form throws (e.g. group already reaped)', () => {
    const child = makeFakeChild(WORKER_PID);
    const adapter = spawnWorker('linux', child);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH: no such process');
    });

    adapter.kill('task-pg-1');

    expect(killSpy).toHaveBeenCalledWith(-WORKER_PID, 'SIGTERM');
    expect((child as unknown as { kill: ReturnType<typeof vi.fn> }).kill).toHaveBeenCalledWith('SIGTERM');
    child.emit('exit', 0);
  });

  it('a long-running grandchild-forking worker leaves no orphan: group-kill reaches the whole tree, no manual per-grandchild teardown needed', async () => {
    // The worker itself never emits 'exit' on SIGTERM (simulates a slow/ignoring
    // process with its own forked grandchild) — teardown must still escalate to
    // SIGKILL against the *group*, which on a real OS reaps the grandchild too.
    vi.useFakeTimers();
    const child = makeFakeChild(WORKER_PID);
    const adapter = spawnWorker('linux', child);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    adapter.kill('task-pg-1');
    await vi.advanceTimersByTimeAsync(2_000);

    // Both the graceful signal and the forced escalation targeted the GROUP
    // (negative pid) — a real kill(2) group-signal reaches every process
    // sharing that pgid, i.e. the grandchild, not just the worker's own pid.
    expect(killSpy).toHaveBeenNthCalledWith(1, -WORKER_PID, 'SIGTERM');
    expect(killSpy).toHaveBeenCalledWith(-WORKER_PID, 'SIGKILL');
  });
});

describe.each(ADAPTERS)('$label — PROCESS-GROUP-KILL win32 process tree', ({ spawnWorker }) => {
  it('spawn() does NOT set detached on win32', () => {
    const child = makeFakeChild(WORKER_PID);
    spawnWorker('win32', child);

    const [, , spawnOpts] = mockSpawn.mock.calls[0] as [unknown, unknown, { detached?: boolean }];
    expect(spawnOpts.detached).toBe(false);
  });

  it('kill() terminates the whole process tree with taskkill /T', () => {
    const child = makeFakeChild(WORKER_PID);
    const adapter = spawnWorker('win32', child);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    adapter.kill('task-pg-1');

    expect(killSpy).not.toHaveBeenCalled();
    expect(mockSpawn).toHaveBeenNthCalledWith(
      2,
      'taskkill',
      ['/PID', String(WORKER_PID), '/T'],
      { stdio: 'ignore', windowsHide: true },
    );
    expect((child as unknown as { kill: ReturnType<typeof vi.fn> }).kill).not.toHaveBeenCalled();
    child.emit('exit', 0);
  });

  it('SIGTERM→SIGKILL escalation on win32 adds taskkill /F for the whole tree', async () => {
    vi.useFakeTimers();
    const child = makeFakeChild(WORKER_PID);
    const adapter = spawnWorker('win32', child);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    adapter.kill('task-pg-1');
    await vi.advanceTimersByTimeAsync(2_000);

    expect(killSpy).not.toHaveBeenCalled();
    expect(mockSpawn).toHaveBeenNthCalledWith(
      3,
      'taskkill',
      ['/PID', String(WORKER_PID), '/T', '/F'],
      { stdio: 'ignore', windowsHide: true },
    );
    expect((child as unknown as { kill: ReturnType<typeof vi.fn> }).kill).not.toHaveBeenCalled();
  });
});
