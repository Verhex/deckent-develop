import { describe, expect, it } from 'vitest';
import type { Task, TaskResult } from '../../src/core/types.js';
import type { DiskVerifyResult } from '../../src/orchestra/disk-verify.js';
import { enforceHonestResultGate } from '../../src/orchestra/result-evaluator.js';

function makeTask(): Task {
  return {
    id: '679-002',
    title: 'Remove obsolete implementation',
    description: 'Delete the obsolete implementation and keep verification green.',
    model: 'sonnet',
    effort: 'high',
    reason: 'Regression fixture',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/obsolete.ts'],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'Obsolete implementation removed and targeted tests pass.',
      noGoCriteria: 'Deletion is incomplete or verification fails.',
      techDebtAcceptable: '',
    },
    status: 'EXECUTING',
  } as Task;
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '679-002',
    workerId: 'w-679-002',
    filesChanged: ['src/orchestra/obsolete.ts'],
    linesAdded: 0,
    linesRemoved: 24,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: 'goCriteria MET: obsolete implementation removed; targeted tests passed.',
    ...overrides,
  };
}

const noDiskEvidence: DiskVerifyResult = {
  hasDiskEvidence: false,
  linesAdded: 0,
  untrackedFiles: [],
};

describe('enforceHonestResultGate — evidence-backed deletion-only work', () => {
  it('keeps the 679-002 24-deletion/0-addition result DONE', () => {
    const gated = enforceHonestResultGate(
      makeResult(),
      makeTask(),
      noDiskEvidence,
    );

    expect(gated.honest).toBe(true);
    expect(gated.violation).toBeUndefined();
    expect(gated.result.selfAssessment).toBe('DONE');
  });

  it('still rejects a genuine 0/0 stub without evidence', () => {
    const gated = enforceHonestResultGate(
      makeResult({ linesRemoved: 0, testsPassed: false, notes: '' }),
      makeTask(),
      noDiskEvidence,
    );

    expect(gated.honest).toBe(false);
    expect(gated.violation).toBe('DISHONEST_DONE_STUB');
    expect(gated.result.selfAssessment).toBe('NO_GO');
  });

  it('preserves rejection of deletion-only work without verification evidence', () => {
    const gated = enforceHonestResultGate(
      makeResult({
        testsPassed: false,
        notes: 'Deletion claimed but targeted verification did not pass.',
      }),
      makeTask(),
      noDiskEvidence,
    );

    expect(gated.honest).toBe(false);
    expect(gated.violation).toBe('DISHONEST_DONE_STUB');
    expect(gated.result.selfAssessment).toBe('NO_GO');
  });
});
