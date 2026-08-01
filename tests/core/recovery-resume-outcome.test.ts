import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';

import {
  createRecoveryResumeOutcome,
  readRecoveryResumeOutcome,
  recoveryResumeOutcomePath,
  removeRecoveryResumeOutcome,
  writeRecoveryResumeOutcome,
} from '../../src/core/recovery-resume-outcome.js';
import type { CanonicalRunStatus } from '../../src/core/run-status-authority.js';

function rootFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-resume-outcome-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function authority(
  lifecycle: CanonicalRunStatus['lifecycle'],
  sprintId = 'sprint-901',
): CanonicalRunStatus {
  return {
    schemaVersion: 1,
    lifecycle,
    active: lifecycle === 'ACTIVE',
    resumable: lifecycle === 'PAUSED' || lifecycle === 'ORPHANED',
    sprintId,
    phase: lifecycle === 'PAUSED' ? 'EVALUATE' : 'COMPLETE',
    status: lifecycle,
    reason: lifecycle === 'PAUSED' ? 'operator-decision-required' : null,
    recoveryCommand: lifecycle === 'PAUSED' ? `deckent recover ${sprintId} --resume` : null,
    finalizeCommand: lifecycle === 'PAUSED' ? `deckent finalize --sprint ${sprintId} --force` : null,
    coordinator: lifecycle === 'ACTIVE' ? 'alive' : 'absent',
    conflicts: [],
  };
}

describe('typed recovery resume outcome', () => {
  it.each([
    ['ACTIVE', 'resumed-running', 0],
    ['PAUSED', 'resumed-paused', 2],
    ['COMPLETE', 'completed', 0],
    ['ABORTED', 'aborted', 2],
  ] as const)('maps %s authority to %s with exit %s', (lifecycle, outcome, exitCode) => {
    expect(createRecoveryResumeOutcome({
      sprintId: 'sprint-901',
      observedStatus: lifecycle,
      authority: authority(lifecycle),
      observedAt: '2026-08-01T00:00:00.000Z',
    })).toMatchObject({ outcome, exitCode });
  });

  it('fails closed when returned status has no matching durable authority', () => {
    expect(createRecoveryResumeOutcome({
      sprintId: 'sprint-901',
      observedStatus: 'PAUSED',
      authority: authority('IDLE', 'sprint-foreign'),
    })).toMatchObject({
      outcome: 'failed',
      exitCode: 1,
      reason: 'next-authority-sprint-mismatch',
    });
  });

  it('atomically round-trips only an owned runtime artifact', () => {
    const root = rootFixture();
    const path = recoveryResumeOutcomePath(root, '12345678-abcd');
    const outcome = createRecoveryResumeOutcome({
      sprintId: 'sprint-901',
      observedStatus: 'PAUSED',
      authority: authority('PAUSED'),
    });
    writeRecoveryResumeOutcome(root, path, outcome);
    expect(readRecoveryResumeOutcome(root, path, 'sprint-901')).toEqual(outcome);
    removeRecoveryResumeOutcome(root, path);
    expect(existsSync(path)).toBe(false);
    expect(() => writeRecoveryResumeOutcome(root, join(root, 'outside.json'), outcome))
      .toThrow('RECOVERY_RESUME_OUTCOME_PATH_OUTSIDE_RUNTIME');
  });
});
