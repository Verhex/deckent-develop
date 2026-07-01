// MOAT-2 (ADR-G-013) — orphan-start-process / coordinator-linger root-cause proof.
//
// ROOT CAUSE (code-grounded + empirically verified, sprint-333 "~27min linger"):
// the DOMINANT loop-anchor is the WORKER CHILD PROCESS HANDLE. A `child_process`
// spawned without `detached`/`unref` keeps the PARENT's event loop alive by default
// until the child exits (Node docs: `child.unref()` "allow[s] the parent to exit
// independently of the child"). The sprint keys completion on the `.result` FILE
// (waitForResults / pollForResultFile), NOT the child's `exit` — so a worker that
// writes its result while its process lingers pins the COORDINATOR's loop for the
// child's whole lifetime. Verified with a same-stdio repro: WITHOUT child.unref the
// parent waits the child's full runtime; WITH it the parent drains in ~3ms.
//
// FIX (this suite proves it):
//  1. PRIMARY — `child.unref()` after spawn: the coordinator no longer waits on the
//     child. During the sprint the EXECUTE result-poll loop keeps the loop alive, so
//     an unref'd child never causes a premature mid-sprint exit.
//  2. NO ORPHAN — `killWithSignal` escalates a graceful SIGTERM to SIGKILL after a
//     short (unref'd) grace, so a signal-ignoring worker cannot survive as an orphan
//     once the coordinator drains.
//  3. DEFENSE-IN-DEPTH — the 15s heartbeat interval (+ optional kill-timeout) are
//     also `.unref()`'d and the interval is reaped in `kill()`, so no coordinator-
//     side timer independently pins the loop either.
//
// A `hasRef() === false` timer + a `child.unref()` call are, by Node's own contract,
// exactly the properties that stop a handle from keeping the event loop alive — so
// these assertions are the hermetic behavioural proof. The full "does `deckent start`
// actually exit on normal completion (no OTHER ref'd handle lingers)" check is the
// run-proven companion smoke (host-side; `getActiveResourcesInfo` at exit shows no
// ref'd Process/Timeout) — Alperen-runs-it. This suite is the CI guard.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { SubprocessSpawnBackend } from '../../src/providers/subprocess.js';
import type { ModelType } from '../../src/core/types.js';

/** The `node:child_process` `spawn` function type — matches the backend's `spawnImpl` seam. */
type SpawnFn = typeof import('node:child_process').spawn;

/** A fully-faked child — an EventEmitter with a stdin sink. Never a real process. */
function makeFakeChild(): ChildProcess & { emit: EventEmitter['emit'] } {
  const child = new EventEmitter() as unknown as ChildProcess & { emit: EventEmitter['emit'] };
  (child as unknown as { stdin: unknown }).stdin = { write: vi.fn(), end: vi.fn() };
  (child as unknown as { kill: unknown }).kill = vi.fn();
  // The ROOT-CAUSE fix calls child.unref() — a real ChildProcess is ref'd by
  // default and pins the parent loop until it exits. The fake exposes it as a spy.
  (child as unknown as { unref: unknown }).unref = vi.fn();
  (child as unknown as { pid: number }).pid = 4242;
  return child;
}

const MODEL: ModelType = 'sonnet';

let root: string;
// Real timers created during spawn — cleared in afterEach so no test leaks a live
// interval into the next (the whole point of the fix is they don't pin the loop,
// but a tidy suite still cleans them).
const liveIntervals: Array<ReturnType<typeof setInterval>> = [];
const liveTimeouts: Array<ReturnType<typeof setTimeout>> = [];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'moat2-'));
});

afterEach(() => {
  for (const t of liveIntervals) clearInterval(t);
  for (const t of liveTimeouts) clearTimeout(t);
  liveIntervals.length = 0;
  liveTimeouts.length = 0;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function spawnWithSpies(opts?: { defaultTimeoutMs?: number }): {
  backend: SubprocessSpawnBackend;
  child: ReturnType<typeof makeFakeChild>;
  hbTimer: NodeJS.Timeout;
  timeoutTimer: NodeJS.Timeout | undefined;
} {
  const child = makeFakeChild();
  const backend = new SubprocessSpawnBackend(root, {
    defaultTimeoutMs: opts?.defaultTimeoutMs ?? 0,
    spawnImpl: (() => child) as unknown as SpawnFn,
  });
  // vi.spyOn calls through to the real timer by default → real Timeout objects
  // whose .hasRef() reflects the unref() the fix applies.
  const setIntervalSpy = vi.spyOn(global, 'setInterval');
  const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

  backend.spawn('t1', MODEL, 'the-prompt', { projectDir: root });

  const hbResult = setIntervalSpy.mock.results.at(-1);
  if (!hbResult || hbResult.type !== 'return') throw new Error('spawn did not create a heartbeat interval');
  const hbTimer = hbResult.value as NodeJS.Timeout;
  liveIntervals.push(hbTimer);

  let timeoutTimer: NodeJS.Timeout | undefined;
  const toResult = setTimeoutSpy.mock.results.at(-1);
  if (toResult && toResult.type === 'return') {
    timeoutTimer = toResult.value as NodeJS.Timeout;
    liveTimeouts.push(timeoutTimer);
  }

  return { backend, child, hbTimer, timeoutTimer };
}

describe('MOAT-2 PRIMARY: the worker child handle is unref’d (the dominant loop anchor)', () => {
  it('child.unref() is called after spawn so the coordinator can drain independently', () => {
    const { child } = spawnWithSpies();
    // A real ChildProcess is ref'd by default and pins the parent loop until it
    // exits — the empirically-confirmed ~27min linger. unref() is the root-cause
    // closure; without it, unref'ing the timers alone would not let the coordinator
    // exit while a worker child lingers.
    expect((child as unknown as { unref: ReturnType<typeof vi.fn> }).unref).toHaveBeenCalledTimes(1);
  });
});

describe('MOAT-2 DiD: the coordinator-side heartbeat interval does NOT pin the event loop', () => {
  it('the 15s heartbeat setInterval is unref’d after spawn (hasRef === false)', () => {
    const { hbTimer } = spawnWithSpies();
    // A ref’d timer keeps the Node process alive; unref’d does not. This is the
    // exact property that turns "worker child outlives .result" from a ~27min
    // linger into a clean exit.
    expect(hbTimer.hasRef()).toBe(false);
  });

  it('the optional kill-timeout setTimeout is unref’d when defaultTimeoutMs > 0', () => {
    const { timeoutTimer } = spawnWithSpies({ defaultTimeoutMs: 60_000 });
    expect(timeoutTimer).toBeDefined();
    expect(timeoutTimer!.hasRef()).toBe(false);
  });
});

describe('MOAT-2: kill() reaps the heartbeat interval deterministically', () => {
  it('kill() clears the heartbeat interval immediately (not waiting for child exit)', () => {
    const { backend, child, hbTimer } = spawnWithSpies();
    const clearSpy = vi.spyOn(global, 'clearInterval');
    // cleanup() calls adapter.kill(taskId) → killWithSignal → clearInterval(hbInterval).
    backend.kill('t1');
    expect(clearSpy).toHaveBeenCalledWith(hbTimer);
    child.emit('exit', 0); // let the child exit → clears the SIGKILL escalation timer
  });

  it('kill() also terminates the child process (SIGTERM) and drops the worker', () => {
    const { backend, child } = spawnWithSpies();
    backend.kill('t1');
    expect((child as unknown as { kill: ReturnType<typeof vi.fn> }).kill).toHaveBeenCalledWith('SIGTERM');
    // A second kill throws "no running worker" — proves the entry was removed.
    expect(() => backend.kill('t1')).toThrow();
    child.emit('exit', 0); // clears the escalation timer
  });
});

describe('MOAT-2: SIGTERM→SIGKILL escalation guarantees no orphan worker survives', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function spawnFake() {
    const child = makeFakeChild();
    const backend = new SubprocessSpawnBackend(root, {
      spawnImpl: (() => child) as unknown as SpawnFn,
    });
    backend.spawn('t1', MODEL, 'the-prompt', { projectDir: root });
    const killSpy = (child as unknown as { kill: ReturnType<typeof vi.fn> }).kill;
    return { backend, child, killSpy };
  }

  it('a worker that IGNORES SIGTERM is SIGKILL-escalated after the grace window', () => {
    const { backend, killSpy } = spawnFake();
    backend.kill('t1'); // SIGTERM + schedules SIGKILL escalation
    expect(killSpy).toHaveBeenCalledWith('SIGTERM');
    expect(killSpy).not.toHaveBeenCalledWith('SIGKILL');
    vi.advanceTimersByTime(2_000); // past SIGKILL_ESCALATION_MS
    expect(killSpy).toHaveBeenCalledWith('SIGKILL');
  });

  it('a worker that EXITS on SIGTERM is not SIGKILL’d (escalation cleared on exit)', () => {
    const { backend, child, killSpy } = spawnFake();
    backend.kill('t1');
    child.emit('exit', 0); // well-behaved worker exits → escalation timer cleared
    vi.advanceTimersByTime(2_000);
    expect(killSpy).not.toHaveBeenCalledWith('SIGKILL');
  });
});

describe('MOAT-2: the child-exit path still clears the interval (idempotent with kill)', () => {
  it('emitting the child exit event clears the heartbeat interval without error', () => {
    const { child, hbTimer } = spawnWithSpies();
    const clearSpy = vi.spyOn(global, 'clearInterval');
    // The exit handler (closure-scoped clearInterval) fires on real child exit.
    expect(() => child.emit('exit', 0)).not.toThrow();
    expect(clearSpy).toHaveBeenCalledWith(hbTimer);
  });
});
