import type {
  ExactAttemptEvidence,
  ExactAttemptIdentity,
} from '../../src/orchestra/sprint-terminal-evidence.js';

export const ORIGINAL_ATTEMPT: ExactAttemptIdentity = {
  taskId: '485-006',
  attemptId: 'original-attempt',
};
export const FIX_ATTEMPT: ExactAttemptIdentity = {
  taskId: '485-006-fix',
  attemptId: 'fix-attempt',
};
export const FIX_FIX_ATTEMPT: ExactAttemptIdentity = {
  taskId: '485-006-fix-fix',
  attemptId: 'fix-fix-attempt',
};

export interface AttributionReplayPayload {
  readonly costUsd: number;
  readonly label: string;
}

export interface SprintAttributionFixture {
  readonly attempts: readonly ExactAttemptEvidence<AttributionReplayPayload>[];
  readonly expectedVerifiedAttemptIds: readonly string[];
  readonly expectedFilesByAttempt: Readonly<Record<string, readonly string[]>>;
  readonly expectedExcludedAttemptIds: readonly string[];
  readonly independentlyAccountedCostUsd: number;
}

export function createSprintAttributionFixture(): SprintAttributionFixture {
  const original: ExactAttemptEvidence<AttributionReplayPayload> = {
    logicalTaskId: 'logical-485-006',
    identity: ORIGINAL_ATTEMPT,
    authority: {
      state: 'TERMINAL',
      verdict: 'NO_GO',
      evidenceRef: 'settlement:original-attempt',
    },
    result: {
      state: 'COMPLETE',
      verdict: 'NO_GO',
      evidenceRef: 'result:original-attempt',
      payload: { costUsd: 1.25, label: 'original' },
    },
    attribution: {
      state: 'VERIFIED',
      evidenceRef: 'attribution:original-attempt',
      filesChanged: ['tests/orchestra/original-proof.test.ts'],
      linesAdded: 11,
      linesRemoved: 2,
    },
  };
  const fix: ExactAttemptEvidence<AttributionReplayPayload> = {
    logicalTaskId: 'logical-485-006',
    identity: FIX_ATTEMPT,
    supersedes: ORIGINAL_ATTEMPT,
    authority: {
      state: 'TERMINAL',
      verdict: 'NO_GO',
      evidenceRef: 'settlement:fix-attempt',
    },
    result: {
      state: 'COMPLETE',
      verdict: 'NO_GO',
      evidenceRef: 'result:fix-attempt',
      payload: { costUsd: 0.5, label: 'fix-held' },
    },
    attribution: {
      state: 'HOLD',
      evidenceRef: 'attribution:fix-attempt',
      reasonCode: 'ATTRIBUTION_AUTHORITY_MISMATCH',
    },
  };
  const fixFix: ExactAttemptEvidence<AttributionReplayPayload> = {
    logicalTaskId: 'logical-485-006',
    identity: FIX_FIX_ATTEMPT,
    supersedes: FIX_ATTEMPT,
    authority: {
      state: 'TERMINAL',
      verdict: 'DONE',
      evidenceRef: 'settlement:fix-fix-attempt',
    },
    result: {
      state: 'COMPLETE',
      verdict: 'DONE',
      evidenceRef: 'result:fix-fix-attempt',
      payload: { costUsd: 2.75, label: 'fix-fix' },
    },
    attribution: {
      state: 'VERIFIED',
      evidenceRef: 'attribution:fix-fix-attempt',
      filesChanged: ['tests/helpers/sprint-attribution-fixture.ts'],
      linesAdded: 29,
      linesRemoved: 0,
    },
  };
  const unavailable: ExactAttemptEvidence<AttributionReplayPayload> = {
    logicalTaskId: 'logical-legacy-485-006',
    identity: { taskId: '485-006-legacy', attemptId: 'legacy-attempt' },
    authority: {
      state: 'TERMINAL',
      verdict: 'NO_GO',
      evidenceRef: 'settlement:legacy-attempt',
    },
    result: {
      state: 'COMPLETE',
      verdict: 'NO_GO',
      evidenceRef: 'result:legacy-attempt',
      payload: { costUsd: 0.75, label: 'legacy' },
    },
    attribution: {
      state: 'UNAVAILABLE',
      evidenceRef: 'attribution:legacy-attempt',
      reasonCode: 'ATTRIBUTION_AUTHORITY_UNAVAILABLE',
    },
  };

  return {
    attempts: [fixFix, unavailable, original, fix],
    expectedVerifiedAttemptIds: [ORIGINAL_ATTEMPT.attemptId, FIX_FIX_ATTEMPT.attemptId],
    expectedFilesByAttempt: {
      [ORIGINAL_ATTEMPT.attemptId]: original.attribution.filesChanged,
      [FIX_FIX_ATTEMPT.attemptId]: fixFix.attribution.filesChanged,
    },
    expectedExcludedAttemptIds: [FIX_ATTEMPT.attemptId, unavailable.identity.attemptId],
    independentlyAccountedCostUsd: 5.25,
  };
}
