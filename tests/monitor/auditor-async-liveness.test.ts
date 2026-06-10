/**
 * Sprint 279 WK-7 — Auditor async-batch liveness probe.
 *
 * The 30s auditor scan used to probe each worker with a blocking
 * `spawnSync('docker'|'tmux', …)` (O(n) event-loop blocking, resource
 * contention at ≥20 workers). These tests cover the NON-BLOCKING replacement:
 * async `spawn` probes started in parallel and collected with
 * `Promise.allSettled`, memoized in a liveness cache that the scan loop
 * pre-warms so synchronous stale detection reads cached verdicts.
 *
 * Hermetic: no real docker/tmux/network. The async `spawn` is injected via a
 * fake child-process emitter; disk reads use per-test tmpdirs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { spawn as nodeSpawn } from 'node:child_process';

import {
  probeWorkerAlive,
  batchProbeLiveness,
  collectActiveHeartbeats,
  refreshLivenessFromDisk,
  clearLivenessCache,
  getLivenessCacheSize,
  getCachedLiveness,
  isWorkerStale,
  clearHeartbeatCache,
} from '../../src/monitor/auditor.js';
import { AgentStatus } from '../../src/core/types.js';
import { TASKS_DIR } from '../../src/core/constants.js';
import type { Heartbeat } from '../../src/core/types.js';

// ─── Fake async spawn ───────────────────────────────────────────────

interface ProbeSpec {
  /** stdout chunk to emit before close (docker container name etc.) */
  stdout?: string;
  /** exit code emitted on 'close' */
  code?: number | null;
  /** emit an 'error' event instead of closing (spawn failure) */
  error?: boolean;
  /** never emit close/error — forces the probe timeout path */
  neverClose?: boolean;
}

function makeFakeSpawn(resolveSpec: (command: string, args: string[]) => ProbeSpec) {
  const calls: Array<{ command: string; args: string[] }> = [];
  let killCount = 0;

  const spawnFn = ((command: string, args: string[]) => {
    calls.push({ command, args });
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      kill: () => void;
    };
    child.stdout = new EventEmitter();
    child.kill = () => { killCount += 1; };

    const spec = resolveSpec(command, args);
    if (!spec.neverClose) {
      // Emit on a microtask so the probe's listeners attach first.
      queueMicrotask(() => {
        if (spec.error) {
          child.emit('error', new Error('spawn boom'));
          return;
        }
        if (spec.stdout) child.stdout.emit('data', Buffer.from(spec.stdout));
        child.emit('close', spec.code ?? 0);
      });
    }
    return child;
  }) as unknown as typeof nodeSpawn;

  return { spawnFn, calls, killCount: () => killCount };
}

function makeHb(overrides: Partial<Heartbeat> = {}): Heartbeat {
  return {
    workerId: 'w-001',
    taskId: '001',
    status: AgentStatus.EXECUTING,
    currentAction: 'writing',
    timestamp: new Date().toISOString(),
    filesChangedCount: 0,
    sequence: 1,
    progress: 50,
    ...overrides,
  };
}

beforeEach(() => {
  clearLivenessCache();
  clearHeartbeatCache();
});

// ─── probeWorkerAlive (async, non-blocking) ─────────────────────────

describe('probeWorkerAlive', () => {
  it('returns a Promise (non-blocking async probe, not spawnSync)', () => {
    const { spawnFn } = makeFakeSpawn(() => ({ stdout: 'deckent-w-001\n', code: 0 }));
    const result = probeWorkerAlive(makeHb({ backend: 'docker' }), { spawn: spawnFn });
    expect(typeof (result as Promise<boolean>).then).toBe('function');
    return result; // settle it so no dangling promise
  });

  it('detects a running Docker container (non-empty stdout → true)', async () => {
    const { spawnFn, calls } = makeFakeSpawn(() => ({ stdout: 'deckent-w-001\n', code: 0 }));
    const alive = await probeWorkerAlive(makeHb({ workerId: 'w-001', backend: 'docker' }), { spawn: spawnFn });
    expect(alive).toBe(true);
    expect(calls[0]).toEqual({
      command: 'docker',
      args: ['ps', '--filter', 'name=deckent-w-001', '--format', '{{.Names}}'],
    });
  });

  it('returns false for a stopped Docker container (empty stdout)', async () => {
    const { spawnFn } = makeFakeSpawn(() => ({ stdout: '', code: 0 }));
    const alive = await probeWorkerAlive(makeHb({ backend: 'docker' }), { spawn: spawnFn });
    expect(alive).toBe(false);
  });

  it('detects an active tmux session (exit 0 → true)', async () => {
    const { spawnFn, calls } = makeFakeSpawn(() => ({ code: 0 }));
    const alive = await probeWorkerAlive(makeHb({ workerId: 'w-003', backend: 'tmux' }), { spawn: spawnFn });
    expect(alive).toBe(true);
    expect(calls[0]).toEqual({ command: 'tmux', args: ['has-session', '-t', 'w-003'] });
  });

  it('returns false for a dead tmux session (exit 1)', async () => {
    const { spawnFn } = makeFakeSpawn(() => ({ code: 1 }));
    const alive = await probeWorkerAlive(makeHb({ backend: 'tmux' }), { spawn: spawnFn });
    expect(alive).toBe(false);
  });

  it('returns false for subprocess backend without spawning (conservative)', async () => {
    const { spawnFn, calls } = makeFakeSpawn(() => ({ code: 0 }));
    const alive = await probeWorkerAlive(makeHb({ backend: 'subprocess' }), { spawn: spawnFn });
    expect(alive).toBe(false);
    expect(calls).toHaveLength(0); // no probe spawned
  });

  it('returns false for an undefined backend (conservative)', async () => {
    const { spawnFn, calls } = makeFakeSpawn(() => ({ code: 0 }));
    const alive = await probeWorkerAlive(makeHb(), { spawn: spawnFn });
    expect(alive).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('resolves false (fail-safe) when the probe emits an error', async () => {
    const { spawnFn } = makeFakeSpawn(() => ({ error: true }));
    const alive = await probeWorkerAlive(makeHb({ backend: 'docker' }), { spawn: spawnFn });
    expect(alive).toBe(false);
  });

  it('resolves false and kills the child on timeout', async () => {
    const { spawnFn, killCount } = makeFakeSpawn(() => ({ neverClose: true }));
    const alive = await probeWorkerAlive(makeHb({ backend: 'docker' }), { spawn: spawnFn, timeoutMs: 20 });
    expect(alive).toBe(false);
    expect(killCount()).toBe(1);
  });

  it('resolves false (fail-safe) when spawn throws synchronously', async () => {
    const throwingSpawn = (() => { throw new Error('ENOENT'); }) as unknown as typeof nodeSpawn;
    const alive = await probeWorkerAlive(makeHb({ backend: 'docker' }), { spawn: throwingSpawn });
    expect(alive).toBe(false);
  });
});

// ─── batchProbeLiveness (parallel, Promise.allSettled) ──────────────

describe('batchProbeLiveness', () => {
  it('probes N workers IN PARALLEL (all spawns start before any resolves)', () => {
    const { spawnFn, calls } = makeFakeSpawn(() => ({ stdout: 'x\n', code: 0 }));
    const hbs = Array.from({ length: 8 }, (_v, i) =>
      makeHb({ workerId: `w-${i}`, backend: 'docker' }));

    // Invoke but do NOT await yet — all probes must have spawned synchronously.
    const pending = batchProbeLiveness(hbs, { spawn: spawnFn });
    expect(calls).toHaveLength(8); // all 8 started concurrently before any close
    return pending; // settle to avoid dangling
  });

  it('resolves a verdict for every worker', async () => {
    const { spawnFn } = makeFakeSpawn((cmd, args) => {
      // alive only for even workers
      const id = args[args.indexOf('--filter') + 1] ?? '';
      const even = /w-(\d+)/.exec(id)?.[1];
      return { stdout: even && Number(even) % 2 === 0 ? 'alive\n' : '', code: 0 };
    });
    const hbs = Array.from({ length: 4 }, (_v, i) =>
      makeHb({ workerId: `w-${i}`, backend: 'docker' }));

    const verdicts = await batchProbeLiveness(hbs, { spawn: spawnFn });
    expect(verdicts.get('w-0')).toBe(true);
    expect(verdicts.get('w-1')).toBe(false);
    expect(verdicts.get('w-2')).toBe(true);
    expect(verdicts.get('w-3')).toBe(false);
  });

  it('isolates a single failing probe — other workers are unaffected', async () => {
    const { spawnFn } = makeFakeSpawn((_cmd, args) => {
      const id = args[args.indexOf('--filter') + 1] ?? '';
      if (id.includes('w-1')) return { error: true }; // this one fails
      return { stdout: 'alive\n', code: 0 };
    });
    const hbs = [
      makeHb({ workerId: 'w-0', backend: 'docker' }),
      makeHb({ workerId: 'w-1', backend: 'docker' }),
      makeHb({ workerId: 'w-2', backend: 'docker' }),
    ];

    const verdicts = await batchProbeLiveness(hbs, { spawn: spawnFn });
    expect(verdicts.get('w-0')).toBe(true);   // unaffected by w-1 failure
    expect(verdicts.get('w-1')).toBe(false);  // failed probe → fail-safe false
    expect(verdicts.get('w-2')).toBe(true);   // unaffected
  });

  it('populates the module-level liveness cache', async () => {
    const { spawnFn } = makeFakeSpawn(() => ({ stdout: 'alive\n', code: 0 }));
    expect(getLivenessCacheSize()).toBe(0);

    await batchProbeLiveness([makeHb({ workerId: 'w-9', backend: 'docker' })], { spawn: spawnFn });
    expect(getCachedLiveness('w-9')).toBe(true);
    expect(getLivenessCacheSize()).toBe(1);
  });

  it('returns an empty map for no heartbeats (no spawns)', async () => {
    const { spawnFn, calls } = makeFakeSpawn(() => ({ code: 0 }));
    const verdicts = await batchProbeLiveness([], { spawn: spawnFn });
    expect(verdicts.size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

// ─── isWorkerStale reads the cache (Signal B) ───────────────────────

describe('isWorkerStale liveness-cache integration', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'auditor-stale-'));
    mkdirSync(join(root, TASKS_DIR), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('suppresses stale when the cache reports the worker alive (no sync probe)', async () => {
    const staleTs = new Date(Date.now() - 300_000).toISOString();
    const hb = makeHb({ workerId: 'w-live', taskId: 'L1', backend: 'docker', timestamp: staleTs });

    // Warm the cache via the async batch path (docker container running).
    const { spawnFn } = makeFakeSpawn(() => ({ stdout: 'deckent-w-live\n', code: 0 }));
    await batchProbeLiveness([hb], { spawn: spawnFn });
    expect(getCachedLiveness('w-live')).toBe(true);

    // No .result file exists → Signal A inactive. Cache (Signal B) suppresses stale.
    expect(isWorkerStale(hb, root, 120_000)).toBe(false);
  });

  it('reports stale when the cache reports the worker dead + HB stale + no result', async () => {
    const staleTs = new Date(Date.now() - 300_000).toISOString();
    const hb = makeHb({ workerId: 'w-dead', taskId: 'D1', backend: 'docker', timestamp: staleTs });

    // Warm the cache: docker container stopped (empty stdout → dead).
    const { spawnFn } = makeFakeSpawn(() => ({ stdout: '', code: 0 }));
    await batchProbeLiveness([hb], { spawn: spawnFn });
    expect(getCachedLiveness('w-dead')).toBe(false);

    // Cache says dead, HB stale, no .result, no hbPath (Signal C skipped) → stale.
    expect(isWorkerStale(hb, root, 120_000)).toBe(true);
  });

  it('still returns false for a FRESH heartbeat regardless of cache', () => {
    const hb = makeHb({ workerId: 'w-fresh', taskId: 'F1', backend: 'docker' }); // fresh ts
    expect(isWorkerStale(hb, root, 120_000)).toBe(false);
  });
});

// ─── collectActiveHeartbeats / refreshLivenessFromDisk (disk) ───────

describe('collectActiveHeartbeats', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'auditor-collect-'));
    mkdirSync(join(root, TASKS_DIR), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeHb(id: string, hb: Partial<Heartbeat>): void {
    writeFileSync(
      join(root, TASKS_DIR, `task-${id}.hb`),
      JSON.stringify(makeHb({ taskId: id, ...hb })),
    );
  }

  it('returns active (non-DONE) heartbeats and skips DONE workers', () => {
    writeHb('001', { workerId: 'w-001', status: AgentStatus.EXECUTING, backend: 'docker' });
    writeHb('002', { workerId: 'w-002', status: AgentStatus.TESTING, backend: 'tmux' });
    writeHb('003', { workerId: 'w-003', status: AgentStatus.DONE, backend: 'docker' });

    const active = collectActiveHeartbeats(root);
    const ids = active.map((h) => h.workerId).sort();
    expect(ids).toEqual(['w-001', 'w-002']); // DONE excluded
  });

  it('returns [] when the .tasks directory is absent', () => {
    const empty = mkdtempSync(join(tmpdir(), 'auditor-empty-'));
    try {
      expect(collectActiveHeartbeats(empty)).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('refreshLivenessFromDisk reads HBs, probes them, and warms the cache', async () => {
    writeHb('001', { workerId: 'w-001', status: AgentStatus.EXECUTING, backend: 'docker' });
    writeHb('002', { workerId: 'w-002', status: AgentStatus.EXECUTING, backend: 'tmux' });

    const { spawnFn, calls } = makeFakeSpawn((cmd) =>
      cmd === 'docker' ? { stdout: 'deckent-w-001\n', code: 0 } : { code: 1 });

    const verdicts = await refreshLivenessFromDisk(root, { spawn: spawnFn });
    expect(calls).toHaveLength(2); // both active workers probed
    expect(verdicts.get('w-001')).toBe(true);  // docker alive
    expect(verdicts.get('w-002')).toBe(false); // tmux dead
    expect(getCachedLiveness('w-001')).toBe(true);
  });
});

// ─── Async-path guard (liveness probe uses spawn, not spawnSync) ────

describe('liveness probe async-path guard', () => {
  it('probeWorkerAlive source uses async spawn — no spawnSync in the probe path', () => {
    const src = readFileSync(
      join(process.cwd(), 'src', 'monitor', 'auditor.ts'),
      'utf-8',
    );
    // Isolate the async batch-liveness block (between its banner and the next section).
    const start = src.indexOf('Async Batch Liveness Probe (Sprint 279 WK-7)');
    const end = src.indexOf('Multi-Signal Stale Detection (Sprint 139)');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);

    // The probe block must NOT *call* the blocking spawnSync, and MUST use async spawn.
    expect(block).not.toMatch(/spawnSync\s*\(/);     // no blocking spawnSync call
    expect(block).toMatch(/spawnFn\(command, args/); // async spawn invocation
    expect(block).toMatch(/Promise\.allSettled/);    // parallel batch collection
  });
});
