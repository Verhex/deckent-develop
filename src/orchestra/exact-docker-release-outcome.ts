import type { ExactDockerCommandDiagnosticV1 } from './exact-docker-command-diagnostic.js';
import type { ExactDockerEffectDiagnosticRefV1 } from './spawn-backend.js';

export const EXACT_DOCKER_RELEASE_STAGES = [
  'AUTHORITY', 'PROGRESS_MISSING', 'RELEASE_PUBLICATION',
  'RELEASE_PREPARED', 'CONTAINER_ABSENT', 'WORKSPACE_VOLUME_ABSENT',
  'DEPENDENCY_VOLUME_ABSENT', 'RELEASED',
  'CONTAINER_DELETE_INTENT', 'WORKSPACE_VOLUME_DELETE_INTENT', 'DEPENDENCY_VOLUME_DELETE_INTENT',
  'CONTAINER_DELETE_INTENT_COMMAND_DELETE', 'CONTAINER_DELETE_INTENT_COMMAND_INSPECT',
  'WORKSPACE_VOLUME_DELETE_INTENT_COMMAND_DELETE', 'WORKSPACE_VOLUME_DELETE_INTENT_COMMAND_INSPECT',
  'DEPENDENCY_VOLUME_DELETE_INTENT_COMMAND_DELETE', 'DEPENDENCY_VOLUME_DELETE_INTENT_COMMAND_INSPECT',
] as const;
export type ExactDockerReleaseStage = typeof EXACT_DOCKER_RELEASE_STAGES[number];
export interface ExactDockerReleaseHold {
  readonly kind: 'release-hold';
  readonly code: string;
  readonly stage: ExactDockerReleaseStage;
  readonly command: ExactDockerCommandDiagnosticV1 | null;
  readonly diagnostic: ExactDockerEffectDiagnosticRefV1 | null;
  readonly diagnosticPublicationFailed: boolean;
  readonly replayBudgetExhausted?: boolean;
  readonly replayInProgress?: boolean;
  readonly replayPublicationFailed?: boolean;
  readonly replayReceiptDigest?: string;
  readonly outcomeReceiptDigest?: string;
}
export function isExactDockerReleaseRetryable(hold: ExactDockerReleaseHold): boolean {
  if (hold.diagnosticPublicationFailed || hold.replayPublicationFailed || hold.replayInProgress) return false;
  if (['RELEASE_CONTAINER_DELETE_UNCONFIRMED', 'RELEASE_CONTAINER_ABSENCE_UNCONFIRMED',
    'RELEASE_VOLUME_DELETE_UNCONFIRMED', 'RELEASE_VOLUME_ABSENCE_UNCONFIRMED',
    'RELEASE_ABSENCE_EVIDENCE_MISSING'].includes(hold.code)) return true;
  return ['RELEASE_PROGRESS_REREAD_MISMATCH', 'RELEASE_OPERATION_EXCEPTION'].includes(hold.code)
    && hold.command !== null && ['timeout', 'unavailable', 'process-error'].includes(hold.command.reason);
}

/** Re-read from the exact attempt's immutable replay and outcome artifacts. */
export interface ExactDockerReleaseHoldEvidence {
  readonly classification: 'RECOVERABLE_EXHAUSTED' | 'AUTHORITY_CONTRADICTION' | 'PUBLICATION_FAILED';
  readonly taskId: string;
  readonly attemptId: string;
  readonly generation: number;
  readonly admissionRefDigest: string;
  readonly replayReceiptDigest: string;
  readonly outcomeReceiptDigest: string;
  readonly predecessorProgressDigest: string;
  readonly finalProgressDigest: string;
  readonly code: string;
}
