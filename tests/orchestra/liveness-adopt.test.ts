/**
 * LIVE668A / task 420-001 — the two PRODUCTION kill-paths adopt the canonical
 * host-primary `decideWorkerLiveness` instead of their own `.hb` timestamp/mtime
 * copies:
 *   (a) src/monitor/auditor.ts        :: isWorkerStale       (Signal B)
 *   (b) src/orchestra/sprint-checkpoint.ts :: detectStaleWorkers (via isStaleHeartbeat)
 *
 * Proves (all hermetic — tmpdir + this process's own pid as a guaranteed-live
 * host signal, no spawn):
 *   1. voteWorkerLivenessFromRecord — the SINGLE adopter — verdict matrix.
 *   2. RED→GREEN ×2 — a stale-ts `.hb` for a LIVE subprocess worker: the OLD
 *      timestamp logic marks it stale (would kill); the NEW host-primary decision
 *      keeps it alive. Both kill-paths, independently.
 *   3. HONEST fallback (never silent) — a record with no derivable host signal
 *      yields an explicit `host-signal-unavailable` reason AND preserves the old
 *      stale verdict.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import {
  voteWorkerLivenessFromRecord,
  HOST_SIGNAL_UNAVAILABLE,
  probeDockerRunningAsync,
  probeTmuxPaneAliveAsync,
  probeProcessAliveWindowsAsync,
  type LivenessRecord,
  type AsyncSpawn,
} from '../../src/orchestra/heartbeat-monitor.js';
import { isWorkerStale, clearLivenessCache } from '../../src/monitor/auditor.js';
import {
  detectStaleWorkers,
  STALE_HEARTBEAT_THRESHOLD_MS,
  type SprintCheckpoint,
} from '../../src/orchestra/sprint-checkpoint.js';
import { SprintPhase } from '../../src/core/types.js';

const LIVE_PID = process.pid; // guaranteed alive for the duration of the test run
const STALE_TS = new Date('2026-07-11T00:00:00.000Z').toISOString(); // hardcoded-stale
const NOW = new Date('2026-07-12T00:00:00.000Z').getTime(); // ~24h later

/** Write a `.hb` on disk exactly as a worker would (JSON, additive pid field). */
function writeHb(
  root: string,
  taskId: string,
  extra: Record<string, unknown> = {},
): void {
  writeFileSync(
    join(root, '.tasks', `task-${taskId}.hb`),
    JSON.stringify({
      workerId: `w-${taskId}`,
      taskId,
      status: 'EXECUTING',
      currentAction: 'thinking',
      timestamp: STALE_TS,
      filesChangedCount: 0,
      sequence: 1,
      progress: 50,
      ...extra,
    }),
    'utf-8',
  );
  // 7094-F1d: production writes `.hb` ONCE at spawn, so file mtime equals the
  // content timestamp. The liveness probe consulted on the unavailable path
  // reads MTIME — a fixture written "now" with STALE_TS content would probe
  // alive and mask the staleness these cases pin.
  utimesSync(
    join(root, '.tasks', `task-${taskId}.hb`),
    new Date(STALE_TS), new Date(STALE_TS),
  );
}

describe('voteWorkerLivenessFromRecord — the single canonical adopter', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'live-adopt-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('no backend → host-signal-unavailable (never silent)', () => {
    const rec: LivenessRecord = { taskId: '1', workerId: 'w-1' };
    const vote = voteWorkerLivenessFromRecord(rec);
    expect('unavailable' in vote && vote.unavailable).toBe(true);
    expect(vote.reason).toContain(HOST_SIGNAL_UNAVAILABLE);
  });

  it('docker with a pre-probed live signal → alive', () => {
    const rec: LivenessRecord = { taskId: '2', workerId: 'w-2', backend: 'docker' };
    const vote = voteWorkerLivenessFromRecord(rec, { cachedProcessAlive: true });
    expect('alive' in vote && vote.alive).toBe(true);
  });

  it('docker with a pre-probed dead signal (no host .log) → not alive', () => {
    const rec: LivenessRecord = { taskId: '3', workerId: 'w-3', backend: 'docker' };
    const vote = voteWorkerLivenessFromRecord(rec, { cachedProcessAlive: false, tasksDir: join(root, '.tasks') });
    expect('alive' in vote && vote.alive).toBe(false);
  });

  it('docker WITHOUT a pre-probed signal → host-signal-unavailable (sync scan never spawns)', () => {
    const rec: LivenessRecord = { taskId: '4', workerId: 'w-4', backend: 'docker' };
    const vote = voteWorkerLivenessFromRecord(rec);
    expect('unavailable' in vote && vote.unavailable).toBe(true);
    expect(vote.reason).toContain(HOST_SIGNAL_UNAVAILABLE);
  });

  it('subprocess with a LIVE pid → alive (spawn-free kill(0))', () => {
    const rec: LivenessRecord = { taskId: '5', workerId: 'w-5', backend: 'subprocess', pid: LIVE_PID };
    const vote = voteWorkerLivenessFromRecord(rec);
    expect('alive' in vote && vote.alive).toBe(true);
  });

  it('subprocess with no pid and no tasksDir → host-signal-unavailable', () => {
    const rec: LivenessRecord = { taskId: '6', workerId: 'w-6', backend: 'subprocess' };
    const vote = voteWorkerLivenessFromRecord(rec);
    expect('unavailable' in vote && vote.unavailable).toBe(true);
    expect(vote.reason).toContain(HOST_SIGNAL_UNAVAILABLE);
  });
});

describe('auditor kill-path (isWorkerStale) — RED→GREEN', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'live-adopt-aud-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    clearLivenessCache(); // module-level cache leaks across tests — force a MISS
  });
  afterEach(() => {
    clearLivenessCache();
    rmSync(root, { recursive: true, force: true });
  });

  it('stale unauthenticated .hb remains stale even when its claimed subprocess pid is live', () => {
    const hb = {
      workerId: 'w-A1', taskId: 'A1', status: 'EXECUTING',
      currentAction: 'thinking', timestamp: STALE_TS,
      filesChangedCount: 0, sequence: 1, progress: 50,
      backend: 'subprocess' as const, pid: LIVE_PID,
    };
    // A worker-authored pid is not host process authority. Without an hbPath
    // that binds the heartbeat to a host observation, age remains decisive.
    expect(isWorkerStale(hb as never, root, 120_000)).toBe(true);
  });

  it('a genuinely dead worker (no backend, stale ts, no result) is still stale (fallback preserved)', () => {
    const hb = {
      workerId: 'w-A2', taskId: 'A2', status: 'EXECUTING',
      currentAction: 'thinking', timestamp: STALE_TS,
      filesChangedCount: 0, sequence: 1, progress: 50,
    };
    expect(isWorkerStale(hb as never, root, 120_000)).toBe(true);
  });
});

describe('checkpoint kill-path (detectStaleWorkers) — RED→GREEN', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'live-adopt-cp-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function checkpointFor(taskId: string): SprintCheckpoint {
    return {
      sprintId: 'sprint-420',
      checkpointNumber: 1,
      timestamp: new Date(NOW).toISOString(),
      completedTasks: [],
      pendingTasks: [],
      activeWorkers: [
        { workerId: `w-${taskId}`, taskId, status: 'EXECUTING', spawnedAt: STALE_TS },
      ],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 0,
    };
  }

  it('GREEN: stale-ts .hb for a LIVE subprocess worker is NOT flagged stale', () => {
    writeHb(root, 'C1', { backend: 'subprocess', pid: LIVE_PID });
    const stale = detectStaleWorkers(root, checkpointFor('C1'), STALE_HEARTBEAT_THRESHOLD_MS, NOW);
    expect(stale).toHaveLength(0);
  });

  it('a stale-ts .hb with no host signal (no backend) is still flagged stale (fallback preserved)', () => {
    writeHb(root, 'C2'); // no backend/pid → host-signal-unavailable → old timestamp check
    const stale = detectStaleWorkers(root, checkpointFor('C2'), STALE_HEARTBEAT_THRESHOLD_MS, NOW);
    expect(stale).toHaveLength(1);
    expect(stale[0].taskId).toBe('C2');
    expect(stale[0].reason).toBe('stale');
  });
});

describe('spawnSync→async host probes (task 420-001 — non-blocking, hermetic)', () => {
  // Minimal fake `spawn`: an EventEmitter child that emits `stdout` data then
  // `close(code)` on the next tick (after runAsyncHostProbe attaches listeners).
  function fakeSpawn(code: number, stdout: string): AsyncSpawn {
    return ((): EventEmitter & { stdout: EventEmitter; kill: () => void } => {
      const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; kill: () => void };
      child.stdout = new EventEmitter();
      child.kill = () => undefined;
      setImmediate(() => {
        if (stdout) child.stdout.emit('data', Buffer.from(stdout));
        child.emit('close', code);
      });
      return child;
    }) as unknown as AsyncSpawn;
  }

  it('probeDockerRunningAsync: State.Running true → alive; false/non-zero → dead', async () => {
    expect(await probeDockerRunningAsync('deckent-w-1', fakeSpawn(0, 'true\n'))).toBe(true);
    expect(await probeDockerRunningAsync('deckent-w-1', fakeSpawn(0, 'false\n'))).toBe(false);
    expect(await probeDockerRunningAsync('deckent-w-1', fakeSpawn(1, ''))).toBe(false);
  });

  it('probeTmuxPaneAliveAsync: a non-dead pane (0) → alive; all dead (1) → dead', async () => {
    expect(await probeTmuxPaneAliveAsync('w-1', fakeSpawn(0, '0\n'))).toBe(true);
    expect(await probeTmuxPaneAliveAsync('w-1', fakeSpawn(0, '1\n'))).toBe(false);
  });

  it('probeProcessAliveWindowsAsync: CSV row for the pid → alive; empty / invalid pid → dead', async () => {
    expect(await probeProcessAliveWindowsAsync(1234, fakeSpawn(0, '"node.exe","1234","Console","1","5 K"\n'))).toBe(true);
    expect(await probeProcessAliveWindowsAsync(1234, fakeSpawn(0, 'INFO: No tasks\n'))).toBe(false);
    expect(await probeProcessAliveWindowsAsync(0, fakeSpawn(0, ''))).toBe(false);
  });
});
