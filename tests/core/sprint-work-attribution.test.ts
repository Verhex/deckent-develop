import { describe, expect, it } from 'vitest';

import type { TaskResult } from '../../src/core/task-types.js';
import {
  projectAttributedTaskWork,
  projectSprintWorkAttribution,
} from '../../src/core/sprint-work-attribution.js';

function result(overrides: Partial<TaskResult>): TaskResult {
  return {
    taskId: 't-1',
    workerId: 'w-1',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    ...overrides,
  };
}

describe('sprint work-attribution projection', () => {
  it('excludes ambient legacy and HOLD claims from terminal work totals', () => {
    const legacy = result({
      taskId: 'legacy',
      filesChanged: ['src/predecessor.ts'],
      linesAdded: 999,
    });
    const held = result({
      taskId: 'held',
      filesChanged: ['src/ambiguous.ts'],
      linesAdded: 500,
      workAttribution: {
        state: 'HOLD',
        attemptId: 'attempt-held',
        baselineRef: 'baseline:held',
        scopeDigest: 'a'.repeat(64),
        reasonCode: 'ATTRIBUTION_AUTHORITY_MISMATCH',
      },
    });
    const projected = projectSprintWorkAttribution([legacy, held]);

    expect(projected).toMatchObject({
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      verifiedAttempts: 0,
      heldAttempts: 1,
      unavailableAttempts: 1,
    });
    expect(projectAttributedTaskWork(legacy).state).toBe('UNAVAILABLE');
  });

  it('aggregates only exact VERIFIED attempts and preserves per-file attempt identities', () => {
    const first = result({
      taskId: 'first',
      filesChanged: ['src/a.ts', 'src/shared.ts'],
      linesAdded: 10,
      linesRemoved: 2,
      workAttribution: {
        state: 'VERIFIED',
        attemptId: 'attempt-a',
        baselineRef: 'baseline:a',
        scopeDigest: 'b'.repeat(64),
      },
    });
    const second = result({
      taskId: 'second',
      filesChanged: ['src/shared.ts', 'src/b.ts'],
      linesAdded: 4,
      linesRemoved: 1,
      workAttribution: {
        state: 'VERIFIED',
        attemptId: 'attempt-b',
        baselineRef: 'baseline:b',
        scopeDigest: 'c'.repeat(64),
      },
    });

    expect(projectSprintWorkAttribution([first, second])).toEqual({
      filesChanged: ['src/a.ts', 'src/b.ts', 'src/shared.ts'],
      linesAdded: 14,
      linesRemoved: 3,
      verifiedAttempts: 2,
      heldAttempts: 0,
      unavailableAttempts: 0,
      fileAttemptIds: {
        'src/a.ts': ['attempt-a'],
        'src/b.ts': ['attempt-b'],
        'src/shared.ts': ['attempt-a', 'attempt-b'],
      },
    });
  });
});
