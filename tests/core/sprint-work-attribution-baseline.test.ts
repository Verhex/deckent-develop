import { describe, expect, it } from 'vitest';

import {
  projectAttributedTaskWork,
  projectSprintWorkAttribution,
} from '../../src/core/sprint-work-attribution.js';
import type { TaskResult } from '../../src/core/task-types.js';

const BASELINE_SHA256 = 'a'.repeat(64);
const SCOPE_DIGEST = 'b'.repeat(64);

function settledResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '482-002',
    workerId: 'w-482-002',
    filesChanged: ['src/core/current-attempt.ts'],
    linesAdded: 7,
    linesRemoved: 2,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    workAttribution: {
      state: 'VERIFIED',
      attemptId: 'attempt-482',
      baselineRef:
        `task-result-work-attribution-baseline:sha256:${BASELINE_SHA256}`,
      baselineSha256: BASELINE_SHA256,
      scopeDigest: SCOPE_DIGEST,
    },
    ...overrides,
  };
}

describe('claim-time sprint work attribution baseline', () => {
  it('accepts settlement only when exact attempt and immutable baseline digest agree', () => {
    expect(projectAttributedTaskWork(settledResult())).toEqual({
      state: 'VERIFIED',
      attemptId: 'attempt-482',
      reasonCode: null,
      filesChanged: ['src/core/current-attempt.ts'],
      linesAdded: 7,
      linesRemoved: 2,
    });
  });

  it('does not charge inherited predecessor files or ambient lines to the later attempt', () => {
    const result = settledResult({
      // Host reconciliation has replaced the worker's ambient claim with the
      // exact claim-time-baseline delta.  The predecessor claim remains only
      // forensic input and must never re-enter the sprint projection.
      filesChanged: ['src/core/current-attempt.ts'],
      linesAdded: 7,
      linesRemoved: 2,
      workerWorkClaim: {
        filesChanged: [
          'src/core/predecessor-480.ts',
          'src/core/current-attempt.ts',
        ],
        linesAdded: 487,
        linesRemoved: 82,
        mismatch: true,
      },
    });

    expect(projectSprintWorkAttribution([result])).toMatchObject({
      filesChanged: ['src/core/current-attempt.ts'],
      linesAdded: 7,
      linesRemoved: 2,
      fileAttemptIds: {
        'src/core/current-attempt.ts': ['attempt-482'],
      },
    });
  });

  it.each([
    {
      label: 'missing immutable baseline digest',
      workAttribution: {
        state: 'VERIFIED' as const,
        attemptId: 'attempt-482',
        baselineRef: 'task-result-work-attribution-baseline:unavailable',
        scopeDigest: SCOPE_DIGEST,
      },
    },
    {
      label: 'baseline reference owned by different bytes',
      workAttribution: {
        state: 'VERIFIED' as const,
        attemptId: 'attempt-482',
        baselineRef: `task-result-work-attribution-baseline:sha256:${'c'.repeat(64)}`,
        baselineSha256: BASELINE_SHA256,
        scopeDigest: SCOPE_DIGEST,
      },
    },
  ])('returns typed HOLD for ambiguous ownership: $label', ({ workAttribution }) => {
    expect(projectAttributedTaskWork(settledResult({ workAttribution }))).toEqual({
      state: 'HOLD',
      attemptId: 'attempt-482',
      reasonCode: 'ATTRIBUTION_AUTHORITY_MISMATCH',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
    });
  });
});
