import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StaleWorkerDetector } from '../../src/nervous/detectors/stale-worker.js';
import { getSprintStateSnapshot } from '../../src/orchestra/sprint-state-tracker.js';
import type { SprintStateSnapshot } from '../../src/core/nervous-types.js';
import { WorkerHeartbeatAuthorityStore } from '../../src/core/worker-heartbeat-authority-store.js';

// Bug-1: worker freshness must come from the .hb file mtime (host-set through the
// docker bind-mount), NOT the in-file `timestamp` (written on the container's
// possibly-skewed clock). These tests are hermetic — tmpdir + utimesSync, no fs mocks (ADR-087).

describe('sprint-state-tracker — worker freshness uses .hb mtime (clock-skew-proof)', () => {
  let root: string;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function setup(taskIds: string[]): string {
    root = mkdtempSync(join(tmpdir(), 'sst-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
    // getSprintStateSnapshot reads .deckent/sprint-state.json → without an active
    // (non-IDLE) sprint it returns IDLE_SNAPSHOT with empty activeWorkers. Write a
    // realistic EXECUTE-phase state so activeWorkers is actually populated.
    writeFileSync(
      join(root, '.deckent', 'sprint-state.json'),
      JSON.stringify({
        sprintId: 'sprint-290',
        phase: 'EXECUTE',
        status: 'running',
        startedAt: '2026-06-18T00:00:00.000Z',
        updatedAt: '2026-06-18T00:00:00.000Z',
        taskIds,
      }),
      'utf-8',
    );
    // A live worker always has its task JSON on disk — it is the claim surface the
    // worker operates on, and the docker backend refuses to spawn without it. The
    // fixture writes one per task so activeWorkers is exercised against the same
    // evidence production has.
    for (const id of taskIds) {
      writeFileSync(
        join(root, '.tasks', `task-${id}.json`),
        JSON.stringify({ id, title: `task ${id}`, scope: {} }),
        'utf-8',
      );
    }
    return root;
  }

  function writeHb(
    r: string,
    taskId: string,
    observedAt: string,
    liveness: 'alive' | 'not-alive' | 'unknown' = 'unknown',
    verdict: 'pending' | 'done' | 'no-go' | 'hold' = 'pending',
  ): void {
    const attemptId = `attempt-${taskId}`;
    const p = join(r, '.tasks', `task-${taskId}.hb`);
    writeFileSync(
      p,
      JSON.stringify({
        version: 1,
        kind: 'worker-activity-heartbeat',
        workerId: `w-${taskId}`,
        taskId,
        attemptId,
        backend: 'docker',
        observedAt,
        status: 'EXECUTING',
        currentAction: 'preserved activity',
      }),
      'utf-8',
    );
    const identity = { runId: 'run', taskId, attemptId, workerId: `docker-${taskId}`, fence: 'fence' };
    const store = new WorkerHeartbeatAuthorityStore(join(r, '.tasks', 'worker-heartbeat-authority'));
    store.initialize(identity);
    store.observe({
      identity,
      expectedHostSequence: 0,
      hostProcessOutcome: liveness === 'alive'
        ? { state: 'running', exitCode: null }
        : { state: 'exited', exitCode: 1 },
      workerTaskVerdict: verdict,
      liveness,
    });
  }

  function detect(snap: SprintStateSnapshot, now: number) {
    return new StaleWorkerDetector().detect({
      event: { source: 'cron' } as never,
      sprintState: { currentPhase: 'EXECUTE', activeWorkers: snap.activeWorkers } as never,
      now: new Date(now),
    } as never);
  }

  it('frozen activity with exact-attempt live host authority is not stale', () => {
    const r = setup(['290-001']);
    const now = 1_750_000_000_000; // fixed reference instant (ms)
    // in-file ts = midnight (container-clock skew ≈ 11h stale), but mtime = 3s ago (host fs)
    writeHb(r, '290-001', '2024-01-01T00:00:00.000Z', 'alive');

    const snap = getSprintStateSnapshot(r);
    const w = snap.activeWorkers.find((x) => x.taskId === '290-001')!;
    expect(w).toBeDefined();
    expect(w).toMatchObject({
      attemptId: 'attempt-290-001',
      currentAction: 'preserved activity',
      liveness: { state: 'alive' },
    });

    expect(detect(snap, now)).toBeNull();
  });

  it('exact dead attempt produces a stale event', () => {
    const r = setup(['290-009']);
    const now = 1_750_000_000_000;
    // in-file ts looks fresh, but the actual host mtime is 11 min ago → genuinely hung
    writeHb(r, '290-009', new Date(now).toISOString(), 'not-alive');

    const snap = getSprintStateSnapshot(r);
    const res = detect(snap, now);
    expect(res).not.toBeNull();
    expect(res!.metadata).toMatchObject({ type: 'stale-worker' });
  });

  // Measured 2026-08-10: a residue heartbeat named `500-003-fix-fix-fix.hb` (no
  // `task-` prefix; the producer is still unidentified) survived cleanup because
  // the sweep matches on that prefix. The finished-worker guard then looked for
  // `500-003-fix-fix-fix.result`, a name nothing writes, so the file read as an
  // active worker; its six-hour-old mtime read as stale and StaleWorkerDetector
  // fired WORKER_RESPAWN twice against a sprint settled hours earlier. Keying on
  // the heartbeat's own taskId, and on whether the task still exists, makes the
  // detector immune to whatever the file happens to be called.
  it('residue heartbeat whose task no longer exists is not an active worker', () => {
    const r = setup(['290-011']);
    const now = 1_750_000_000_000;
    writeHb(r, '290-011', new Date(now).toISOString(), 'alive');
    // Cleanup removed the task JSON when the sprint settled; only the .hb lingers.
    rmSync(join(r, '.tasks', 'task-290-011.json'));

    const snap = getSprintStateSnapshot(r);
    expect(snap.activeWorkers.find((x) => x.taskId === '290-011')).toBeUndefined();
  });

  it('FINISHED-worker guard intact: .hb with sibling .result → not in activeWorkers', () => {
    const r = setup(['290-010']);
    const now = 1_750_000_000_000;
    writeHb(r, '290-010', new Date(now).toISOString(), 'alive');
    writeFileSync(join(r, '.tasks', 'task-290-010.result'), '{"selfAssessment":"DONE"}', 'utf-8');

    const snap = getSprintStateSnapshot(r);
    expect(snap.activeWorkers.find((x) => x.taskId === '290-010')).toBeUndefined();
  });

  it('includes a dynamic FIX worker even when it was not in the initial taskIds', () => {
    const r = setup(['290-001']);
    writeFileSync(
      join(r, '.tasks', 'task-290-001-fix.json'),
      JSON.stringify({ id: '290-001-fix', title: 'dynamic repair', scope: {} }),
      'utf8',
    );
    writeHb(r, '290-001-fix', '2026-08-24T12:00:00.000Z', 'alive');

    expect(getSprintStateSnapshot(r).activeWorkers).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: '290-001-fix', liveness: expect.objectContaining({ state: 'alive' }) }),
    ]));
  });

  // Pin for task 671-003: countCompletedTasks used to count raw `.result` files,
  // so a FIX attempt's own `.result` inflated the completed count past the true
  // logical-task total. It now binds to the canonical logical-progress authority
  // (projectLogicalProgress), which folds a logical task and its FIX attempts
  // into ONE lineage before counting.
  it('completedTasks counts distinct logical tasks, excluding fix-attempt inflation', () => {
    const r = setup(['290-020', '290-021']);
    // Original attempt for 290-020 finished (NO_GO) ...
    writeFileSync(
      join(r, '.tasks', 'task-290-020.result'),
      JSON.stringify({ selfAssessment: 'NO_GO' }),
      'utf-8',
    );
    // ...and its FIX attempt also wrote its own `.result` artifact. Both are real
    // attempt-level artifacts on disk, but they belong to the SAME logical task
    // (290-020) and must count once, not twice.
    writeFileSync(
      join(r, '.tasks', 'task-290-020-fix.result'),
      JSON.stringify({ selfAssessment: 'DONE' }),
      'utf-8',
    );
    // A second, unrelated logical task with a single attempt.
    writeFileSync(
      join(r, '.tasks', 'task-290-021.result'),
      JSON.stringify({ selfAssessment: 'DONE' }),
      'utf-8',
    );

    const snap = getSprintStateSnapshot(r);
    // 2 logical tasks completed (290-020, 290-021), NOT 3 attempt-level artifacts.
    expect(snap.completedTasks).toBe(2);
  });
});
