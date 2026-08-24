import { describe, expect, it } from 'vitest';

import type { DetectorContext } from '../../src/core/nervous-types.js';
import { StaleWorkerDetector } from '../../src/nervous/detectors/stale-worker.js';
import type { HostPrimaryLiveness } from '../../src/orchestra/sprint-state-tracker.js';

const OLD_ACTIVITY = '2024-01-01T00:00:00.000Z';

function context(liveness?: HostPrimaryLiveness): DetectorContext {
  return {
    event: { source: 'cron' },
    now: new Date('2026-08-24T12:00:00.000Z'),
    projectRoot: '/unused',
    sprintState: {
      sprintId: 'sprint-661',
      currentPhase: 'EXECUTE',
      activeWorkers: [{
        id: 'w-661-006',
        taskId: '661-006',
        lastHeartbeat: OLD_ACTIVITY,
        ...(liveness ? { liveness } : {}),
      }],
      openDebtCount: 0,
      totalTasks: 1,
      completedTasks: 0,
    },
  } as DetectorContext;
}

describe('StaleWorkerDetector host-primary truth', () => {
  it.each(['alive', 'unknown', 'HOLD'] as const)(
    'does not respawn frozen activity when host verdict is %s',
    (state) => {
      const liveness: HostPrimaryLiveness = state === 'alive'
        ? { state, attemptId: 'attempt-1', hostSequence: 7, reason: 'host running' }
        : { state, attemptId: 'attempt-1', hostSequence: null, reason: 'host unavailable' };
      expect(new StaleWorkerDetector().detect(context(liveness))).toBeNull();
    },
  );

  it('emits exactly once for one exact dead attempt', () => {
    const detector = new StaleWorkerDetector();
    const input = context({
      state: 'dead',
      attemptId: 'attempt-1',
      hostSequence: 8,
      reason: 'host exited',
    });

    expect(detector.detect(input)?.suggestedActions).toHaveLength(1);
    expect(detector.detect(input)).toBeNull();
  });

  it('does not treat a worker without host attempt authority as stale admission', () => {
    expect(new StaleWorkerDetector().detect(context())).toBeNull();
  });
});
