import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, utimesSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StaleWorkerDetector } from '../../src/nervous/detectors/stale-worker.js';
import { getSprintStateSnapshot } from '../../src/orchestra/sprint-state-tracker.js';
import type { SprintStateSnapshot } from '../../src/core/nervous-types.js';

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
    return root;
  }

  function writeHb(r: string, taskId: string, inFileTimestamp: string, mtimeEpochMs: number): void {
    const p = join(r, '.tasks', `task-${taskId}.hb`);
    writeFileSync(
      p,
      JSON.stringify({ workerId: `w-${taskId}`, taskId, timestamp: inFileTimestamp, status: 'EXECUTING' }),
      'utf-8',
    );
    const t = mtimeEpochMs / 1000;
    utimesSync(p, t, t); // set both atime + mtime to the chosen instant
  }

  function detect(snap: SprintStateSnapshot, now: number) {
    return new StaleWorkerDetector().detect({
      event: { source: 'cron' } as never,
      sprintState: { currentPhase: 'EXECUTE', activeWorkers: snap.activeWorkers } as never,
      now: new Date(now),
    } as never);
  }

  it('FALSE-POSITIVE fixed: midnight in-file timestamp but FRESH mtime → lastHeartbeat fresh, detector NOT flagged', () => {
    const r = setup(['290-001']);
    const now = 1_750_000_000_000; // fixed reference instant (ms)
    // in-file ts = midnight (container-clock skew ≈ 11h stale), but mtime = 3s ago (host fs)
    writeHb(r, '290-001', '2026-06-18T00:00:00.000Z', now - 3_000);

    const snap = getSprintStateSnapshot(r);
    const w = snap.activeWorkers.find((x) => x.taskId === '290-001')!;
    expect(w).toBeDefined();
    const ageMs = now - new Date(w.lastHeartbeat).getTime();
    expect(ageMs).toBeLessThan(60_000); // fresh (from mtime), NOT ~11h (from the midnight in-file ts)

    expect(detect(snap, now)).toBeNull();
  });

  it('REAL staleness preserved: OLD mtime (11 min ago) → StaleWorkerDetector flags it', () => {
    const r = setup(['290-009']);
    const now = 1_750_000_000_000;
    // in-file ts looks fresh, but the actual host mtime is 11 min ago → genuinely hung
    writeHb(r, '290-009', new Date(now).toISOString(), now - 11 * 60_000);

    const snap = getSprintStateSnapshot(r);
    const res = detect(snap, now);
    expect(res).not.toBeNull();
    expect(res!.metadata).toMatchObject({ type: 'stale-worker' });
  });

  it('FINISHED-worker guard intact: .hb with sibling .result → not in activeWorkers', () => {
    const r = setup(['290-010']);
    const now = 1_750_000_000_000;
    writeHb(r, '290-010', new Date(now).toISOString(), now - 3_000);
    writeFileSync(join(r, '.tasks', 'task-290-010.result'), '{"selfAssessment":"DONE"}', 'utf-8');

    const snap = getSprintStateSnapshot(r);
    expect(snap.activeWorkers.find((x) => x.taskId === '290-010')).toBeUndefined();
  });
});
