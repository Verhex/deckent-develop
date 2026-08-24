// Exact-attempt host-primary liveness and episode-dedupe pins.
import { describe, it, expect } from 'vitest';
import { StaleWorkerDetector } from '../../src/nervous/detectors/stale-worker.js';
import type { DetectorContext } from '../../src/core/nervous-types.js';
import type { HostPrimaryLiveness } from '../../src/core/monitoring-types.js';

function ctx(liveness: HostPrimaryLiveness): DetectorContext {
  return {
    event: { source: 'cron' },
    now: new Date('2026-08-24T12:00:00Z'),
    projectRoot: '/unused',
    sprintState: {
      sprintId: 'sprint-900', currentPhase: 'EXECUTE',
      activeWorkers: [{
        id: 'w-900-001', taskId: '900-001',
        lastHeartbeat: '2020-01-01T00:00:00Z', liveness,
      }],
      openDebtCount: 0, totalTasks: 1, completedTasks: 0,
    },
  } as DetectorContext;
}

function verdict(
  state: 'alive' | 'dead' | 'unknown' | 'HOLD',
  hostSequence: number | null,
): HostPrimaryLiveness {
  return {
    state, attemptId: 'attempt-900-001', hostSequence,
    reason: 'host reports ' + state,
  } as HostPrimaryLiveness;
}

describe('stale-worker host-primary activity truth', () => {
  it.each(['alive', 'unknown', 'HOLD'] as const)(
    '%s host verdict never proposes respawn despite an old activity timestamp',
    state => {
      expect(new StaleWorkerDetector().detect(ctx(verdict(state, 1)))).toBeNull();
    },
  );

  it('a dead exact attempt proposes respawn', () => {
    expect(new StaleWorkerDetector().detect(ctx(verdict('dead', 4)))).not.toBeNull();
  });

  it('one host observation notifies exactly once', () => {
    const detector = new StaleWorkerDetector();
    expect(detector.detect(ctx(verdict('dead', 4)))).not.toBeNull();
    expect(detector.detect(ctx(verdict('dead', 4)))).toBeNull();
  });

  it('a later host sequence is a new episode and notifies again', () => {
    const detector = new StaleWorkerDetector();
    expect(detector.detect(ctx(verdict('dead', 4)))).not.toBeNull();
    expect(detector.detect(ctx(verdict('alive', 5)))).toBeNull();
    expect(detector.detect(ctx(verdict('dead', 6)))).not.toBeNull();
  });
});
