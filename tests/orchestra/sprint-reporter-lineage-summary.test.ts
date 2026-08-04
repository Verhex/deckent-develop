import { describe, expect, it } from 'vitest';

import { buildReporterLogicalLineageSummary } from '../../src/orchestra/sprint-reporter.js';
import type { TaskResult } from '../../src/core/task-types.js';

function result(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '486-012',
    workerId: 'w-486-012',
    filesChanged: ['src/orchestra/sprint-reporter.ts'],
    linesAdded: 12,
    linesRemoved: 2,
    testsPassed: true,
    coverage: 80,
    selfAssessment: 'DONE',
    notes: 'verified',
    workAttribution: {
      state: 'VERIFIED',
      attemptId: 'attempt-original',
      baselineRef: '.tasks/task-486-012.scope-baseline',
      scopeDigest: 'a'.repeat(64),
    },
    ...overrides,
  };
}

describe('buildReporterLogicalLineageSummary', () => {
  it('keeps one logical outcome distinct from its original and FIX attempts', () => {
    const summary = buildReporterLogicalLineageSummary({
      results: [
        result(),
        result({
          taskId: '486-012-fix',
          coverage: 100,
          workAttribution: {
            state: 'VERIFIED',
            attemptId: 'attempt-fix',
            baselineRef: '.tasks/task-486-012-fix.scope-baseline',
            scopeDigest: 'b'.repeat(64),
          },
        }),
        result({
          taskId: '486-013',
          coverage: 99,
          filesChanged: ['src/core/untrusted.ts'],
          workAttribution: {
            state: 'HOLD',
            attemptId: 'attempt-held',
            baselineRef: '.tasks/task-486-013.scope-baseline',
            scopeDigest: 'c'.repeat(64),
            reasonCode: 'SCOPE_EVIDENCE_UNAVAILABLE',
          },
        }),
      ],
      logicalProgress: {
        // Canonical contract: every attempt carries the producer-assigned
        // logicalTaskId shared across its repair lineage (invalid-logical-task-id
        // is a typed rejection, not a repair).
        attempts: [
          { logicalTaskId: '486-012', id: 'attempt-original', status: 'blocked', sequence: 1 },
          {
            logicalTaskId: '486-012',
            id: 'attempt-fix', status: 'done', fixForAttemptId: 'attempt-original', sequence: 2,
          },
        ],
        denominator: { kind: 'logical-task', total: 1 },
      },
      usageAuthority: {
        tasks: [{ id: '486-012', billingAuthority: 'subscription' }],
        attempts: [
          {
            id: 'attempt-original', taskId: '486-012', inputTokens: 100, outputTokens: 10,
            cacheReadTokens: 20, cacheCreationTokens: 5, referenceCostUsd: 1,
          },
          {
            id: 'attempt-fix', taskId: '486-012-fix', fixForTaskId: '486-012',
            inputTokens: 200, outputTokens: 20, cacheReadTokens: 40, cacheCreationTokens: 10,
            referenceCostUsd: 2,
          },
        ],
      },
    });

    expect(summary.state).toBe('available');
    if (summary.state !== 'available') return;

    expect(summary.logicalOutcomes).toMatchObject({ done: 1, active: 0, blocked: 0, total: 1 });
    expect(summary.exactAttempts).toEqual({ count: 2 });
    expect(summary.logicalOutcomes.lineages[0]).toMatchObject({
      logicalTaskId: '486-012', attemptCount: 2, attemptIds: ['attempt-original', 'attempt-fix'],
    });
    expect(summary.attribution).toMatchObject({
      filesChanged: ['src/orchestra/sprint-reporter.ts'],
      verifiedAttempts: 2,
      heldAttempts: 1,
    });
    expect(summary.attribution.fileAttemptIds['src/orchestra/sprint-reporter.ts']).toEqual(
      ['attempt-fix', 'attempt-original'],
    );
    expect(summary.usageByLogicalRoot).toHaveLength(1);
    expect(summary.usageByLogicalRoot[0]).toMatchObject({
      logicalRootTaskId: '486-012',
      tokenUsage: { inputTokens: 300, outputTokens: 30, cacheReadTokens: 60, cacheCreationTokens: 15 },
      billedUsd: { state: 'known', usd: 0 },
    });
    expect(summary.coverage).toEqual({ state: 'available', percent: 90 });
  });

  it('retains typed invalid progress and unavailable coverage instead of NaN or repaired totals', () => {
    const summary = buildReporterLogicalLineageSummary({
      results: [result({
        coverage: Number.NaN,
        workAttribution: {
          state: 'HOLD',
          attemptId: 'attempt-held',
          baselineRef: '.tasks/task-486-012.scope-baseline',
          scopeDigest: 'd'.repeat(64),
          reasonCode: 'SCOPE_EVIDENCE_UNAVAILABLE',
        },
      })],
      logicalProgress: {
        // logicalTaskId is present so the projection reaches the denominator
        // check — the typed rejection under test is the attempt-denominator.
        attempts: [{ logicalTaskId: '486-012', id: 'attempt-original', status: 'done' }],
        denominator: { kind: 'attempt', total: 1 },
      },
      usageAuthority: {
        tasks: [],
        attempts: [{
          id: 'attempt-held', taskId: '486-012', inputTokens: 0, outputTokens: 0,
          cacheReadTokens: 0, cacheCreationTokens: 0, referenceCostUsd: 0,
        }],
      },
    });

    expect(summary).toMatchObject({
      state: 'unavailable',
      progress: { ok: false, diagnostic: 'mixed-denominator-attempts' },
      attribution: { heldAttempts: 1, unavailableAttempts: 0, filesChanged: [] },
      coverage: { state: 'unavailable', reason: 'no-verified-finite-coverage' },
    });
  });
});
