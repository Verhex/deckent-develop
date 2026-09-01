import { join } from 'node:path';

import { TASKS_DIR } from '../core/constants.js';
import {
  readLatestTaskResultSettlementRef,
  readClosedTaskResultSettlement,
  readTaskResultSettlementClosure,
  readTaskVerificationIsolationHoldReceipt,
  type TaskVerificationIsolationHoldReceiptV1,
  type TaskResultSettlementRefV1,
} from '../core/task-result-settlement.js';
import { projectDockerRecoveryPreDispatchSettlement } from '../core/pre-dispatch-settlement.js';
import { createExecutionAuthorityError } from '../core/errors.js';
import { readJsonSafe } from '../core/utils.js';
import type {
  Sha256Digest,
  TaskAttemptCustodyIdentityV2,
} from '../core/task-attempt-custody-store.js';
import type { TaskResultV2 } from '../core/task-result-schema.js';
import {
  inspectExactAcceptedTaskResultAuthority,
  inspectExactTaskResultSettlementAuthority,
  type ExactAcceptedTaskResultRefV2,
  type ExactTaskResultSettlementRefV2,
  type InspectExactAcceptedTaskResultAuthorityInput,
  type InspectExactTaskResultAttemptSettlementInput,
  type InspectExactTaskResultSettlementAuthorityInput,
} from '../core/task-settlement-authority.js';
import {
  readRuntimeBudgetExhaustion,
  type RuntimeBudgetStopEvidence,
} from './runtime-budget-monitor.js';

export type TaskResultAuthorityState =
  | 'settled'
  | 'exact-accepted'
  | 'exact-settled'
  | 'pending-settlement'
  | 'not-dispatched'
  | 'authority-hold'
  | 'legacy'
  | 'absent';

export interface ExactTaskResultAuthorityMetadata {
  readonly executionMode: 'normal-docker';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly settlementRef: ExactTaskResultSettlementRefV2;
  readonly settlementDigest: Sha256Digest;
  readonly resultDigest: Sha256Digest;
  readonly acceptedResultChainDigest: Sha256Digest;
  readonly evaluationChainDigest: Sha256Digest;
  readonly finalizerChainDigest: Sha256Digest;
  readonly evaluationArtifact: {
    readonly artifactReceiptDigest: Sha256Digest;
    readonly chainDigest: Sha256Digest;
    readonly artifactSha256: Sha256Digest;
    readonly byteLength: number;
  };
  readonly finalizerArtifact: {
    readonly artifactReceiptDigest: Sha256Digest;
    readonly chainDigest: Sha256Digest;
    readonly artifactSha256: Sha256Digest;
    readonly byteLength: number;
  };
}

export interface ExactAcceptedTaskResultAuthorityMetadata {
  readonly executionMode: 'normal-docker';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly acceptedResultRef: ExactAcceptedTaskResultRefV2;
  readonly acceptedResultChainDigest: Sha256Digest;
  readonly resultDigest: Sha256Digest;
}

export type ExactAuthoritativeTaskResult<T> = T & {
  readonly exactSettlementAuthority: ExactTaskResultAuthorityMetadata;
};

export type ExactAcceptedAuthoritativeTaskResult<T> = T & {
  readonly exactAcceptedResultAuthority: ExactAcceptedTaskResultAuthorityMetadata;
};

export type ReadExactAuthoritativeTaskResultInput =
  | InspectExactAcceptedTaskResultAuthorityInput
  | Exclude<
      InspectExactTaskResultSettlementAuthorityInput,
      InspectExactTaskResultAttemptSettlementInput
    >;

export interface TaskResultAuthorityRead<T> {
  state: TaskResultAuthorityState;
  result: T | null;
  settlementRef: TaskResultSettlementRefV1 | null;
  rawResultPath: string;
  exactAuthority?: ExactTaskResultAuthorityMetadata;
  exactAcceptedAuthority?: ExactAcceptedTaskResultAuthorityMetadata;
  holdReason?: string;
  attemptCount?: number;
}

export interface RuntimeBudgetEvaluationAuthority {
  settlementRef: TaskResultSettlementRefV1;
  exhaustion: RuntimeBudgetStopEvidence;
}

/** Host-owned verification isolation authority for the exact settled attempt. */
export function readVerificationIsolationEvaluationAuthority(
  projectRoot: string,
  taskId: string,
): TaskVerificationIsolationHoldReceiptV1 | null {
  const resultAuthority = readAuthoritativeTaskResult<unknown>(projectRoot, taskId);
  if (resultAuthority.state !== 'settled' || !resultAuthority.settlementRef) return null;
  return readTaskVerificationIsolationHoldReceipt(resultAuthority.settlementRef);
}

/**
 * Select one result authority for a project/task.
 *
 * A durable Docker claim makes the host-owned settlement receipt mandatory:
 * worker-writable `.result` content remains ineligible until that receipt has
 * a matching lifecycle closure. Projects/tasks without a Docker claim retain
 * the legacy raw-file contract for non-Docker backends and pre-migration records.
 */
export function readAuthoritativeTaskResult<T>(
  projectRoot: string,
  taskId: string,
): TaskResultAuthorityRead<T> {
  const rawResultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
  const settlementRef = readLatestTaskResultSettlementRef(projectRoot, taskId);
  if (settlementRef) {
    let settlement;
    try {
      settlement = readClosedTaskResultSettlement(settlementRef);
    } catch (error) {
      throw createExecutionAuthorityError(
        `Task ${taskId} Docker result settlement is invalid: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const closure = settlement ? readTaskResultSettlementClosure(settlementRef) : null;
    const result = settlement && closure?.containerDisposition === 'not-dispatched'
      ? projectDockerRecoveryPreDispatchSettlement(settlement.result, settlementRef)
      : settlement?.result;
    return settlement
      ? { state: 'settled', result: result as T, settlementRef, rawResultPath }
      : { state: 'pending-settlement', result: null, settlementRef, rawResultPath };
  }

  const legacy = readJsonSafe<T>(rawResultPath);
  return legacy === null
    ? { state: 'absent', result: null, settlementRef: null, rawResultPath }
    : { state: 'legacy', result: legacy, settlementRef: null, rawResultPath };
}

/**
 * Explicit execution-mode boundary for new exact-attempt consumers. Normal
 * Docker delegates only to host-private custody inspection; public `.tasks`
 * bytes are read solely by the separately named legacy non-Docker arm.
 */
export function readExactAuthoritativeTaskResult<T = unknown>(
  input: ReadExactAuthoritativeTaskResultInput,
): TaskResultAuthorityRead<T> {
  const rawResultPath = join(input.projectRoot, TASKS_DIR, `task-${input.taskId}.result`);
  if (input.executionMode === 'normal-docker' && input.authorityKind === 'accepted-result') {
    const inspected = inspectExactAcceptedTaskResultAuthority(input);
    if (inspected.state === 'hold') {
      return {
        state: 'authority-hold',
        result: null,
        settlementRef: null,
        rawResultPath,
        holdReason: inspected.reasonCode,
      };
    }
    const exactAcceptedAuthority: ExactAcceptedTaskResultAuthorityMetadata = Object.freeze({
      executionMode: 'normal-docker',
      identity: Object.freeze({ ...inspected.identity }),
      admissionReceiptDigest: inspected.admissionReceiptDigest,
      acceptedResultRef: Object.freeze({
        ...inspected.acceptedResultRef,
        identity: Object.freeze({ ...inspected.acceptedResultRef.identity }),
      }),
      acceptedResultChainDigest: inspected.acceptedResultChainDigest,
      resultDigest: inspected.resultDigest,
    });
    return {
      state: 'exact-accepted',
      result: projectExactAcceptedTaskResult(inspected.result, exactAcceptedAuthority) as T,
      settlementRef: null,
      rawResultPath,
      exactAcceptedAuthority,
    };
  }
  const inspected = inspectExactTaskResultSettlementAuthority(input);
  if (inspected.state === 'not-dispatched') {
    return {
      state: 'not-dispatched',
      result: null,
      settlementRef: null,
      rawResultPath,
      attemptCount: inspected.attemptCount,
    };
  }
  if (inspected.state === 'hold') {
    return {
      state: 'authority-hold',
      result: null,
      settlementRef: null,
      rawResultPath,
      holdReason: inspected.reasonCode,
    };
  }
  return inspected.result === null
    ? { state: 'absent', result: null, settlementRef: null, rawResultPath }
    : { state: 'legacy', result: inspected.result as T, settlementRef: null, rawResultPath };
}

/** Downstream-only terminal settlement reader; collector must not call this. */
export function readExactSettledTaskResult<T = unknown>(
  input: InspectExactTaskResultAttemptSettlementInput,
): TaskResultAuthorityRead<T> {
  const rawResultPath = join(input.projectRoot, TASKS_DIR, `task-${input.taskId}.result`);
  const inspected = inspectExactTaskResultSettlementAuthority(input);
  if (inspected.state === 'hold') {
    return {
      state: 'authority-hold',
      result: null,
      settlementRef: null,
      rawResultPath,
      holdReason: inspected.reasonCode,
    };
  }
  if (inspected.state !== 'accepted') {
    return { state: 'authority-hold', result: null, settlementRef: null, rawResultPath };
  }
  const exactAuthority: ExactTaskResultAuthorityMetadata = Object.freeze({
    executionMode: 'normal-docker',
    identity: Object.freeze({ ...inspected.identity }),
    admissionReceiptDigest: inspected.admissionReceiptDigest,
    settlementRef: Object.freeze({
      ...inspected.settlementRef,
      identity: Object.freeze({ ...inspected.settlementRef.identity }),
    }),
    settlementDigest: inspected.settlementDigest,
    resultDigest: inspected.settlement.resultDigest,
    acceptedResultChainDigest: inspected.settlement.chain.acceptedResultChainDigest,
    evaluationChainDigest: inspected.settlement.chain.evaluationChainDigest,
    finalizerChainDigest: inspected.settlement.chain.finalizerChainDigest,
    evaluationArtifact: Object.freeze({ ...inspected.evaluationArtifact }),
    finalizerArtifact: Object.freeze({ ...inspected.finalizerArtifact }),
  });
  return {
    state: 'exact-settled',
    result: projectExactTaskResult(inspected.result, exactAuthority) as T,
    settlementRef: null,
    rawResultPath,
    exactAuthority,
  };
}

function projectCompatibleTaskResult(result: TaskResultV2): Record<string, unknown> {
  const {
    attemptCustody: _attemptCustody,
    brainEvaluation: _brainEvaluation,
    brainEvaluationReason: _brainEvaluationReason,
    rubricScores: _rubricScores,
    totalScore: _totalScore,
    filesChanged,
    totalLinesAdded,
    totalLinesRemoved,
    tests,
    ...compatible
  } = result;
  return {
    ...compatible,
    filesChanged: filesChanged.map(change => change.path),
    linesAdded: totalLinesAdded,
    linesRemoved: totalLinesRemoved,
    testsPassed: result.testVerification?.outcome === 'PASSED'
      || (result.testVerification === undefined && tests.outcome === 'PASSED'),
    coverage: tests.coverage ?? 0,
  };
}

function projectExactAcceptedTaskResult(
  result: TaskResultV2,
  exactAcceptedResultAuthority: ExactAcceptedTaskResultAuthorityMetadata,
): ExactAcceptedAuthoritativeTaskResult<Record<string, unknown>> {
  return {
    ...projectCompatibleTaskResult(result),
    exactAcceptedResultAuthority,
  };
}

function projectExactTaskResult(
  result: TaskResultV2,
  exactSettlementAuthority: ExactTaskResultAuthorityMetadata,
): ExactAuthoritativeTaskResult<Record<string, unknown>> {
  return {
    ...projectCompatibleTaskResult(result),
    exactSettlementAuthority,
  };
}

/**
 * Join the two host-owned authorities that make a runtime-budget verdict
 * terminal: a closed immutable Docker settlement and exhaustion evidence for
 * that exact attempt. A stale marker from an earlier attempt is not authority
 * over a later settlement.
 */
export function readRuntimeBudgetEvaluationAuthority(
  projectRoot: string,
  taskId: string,
): RuntimeBudgetEvaluationAuthority | null {
  const resultAuthority = readAuthoritativeTaskResult<unknown>(projectRoot, taskId);
  if (resultAuthority.state !== 'settled' || !resultAuthority.settlementRef) return null;

  const exhaustion = readRuntimeBudgetExhaustion(projectRoot, taskId);
  if (!exhaustion || exhaustion.attemptId !== resultAuthority.settlementRef.attemptId) {
    return null;
  }
  return {
    settlementRef: resultAuthority.settlementRef,
    exhaustion,
  };
}

/**
 * Fail-closed phase boundary for consumers that would otherwise manufacture a
 * timeout/sentinel/finalization decision while Docker settlement is pending.
 */
export function assertTaskResultAuthoritiesReady(
  projectRoot: string,
  taskIds: readonly string[],
  context: string,
): void {
  const pendingTaskIds: string[] = [];
  for (const taskId of taskIds) {
    const authority = readAuthoritativeTaskResult<unknown>(projectRoot, taskId);
    if (authority.state === 'pending-settlement') pendingTaskIds.push(taskId);
  }
  if (pendingTaskIds.length > 0) {
    throw createExecutionAuthorityError(
      `${context} HOLD: pending Docker result settlement for task(s) ${pendingTaskIds.join(', ')}`,
    );
  }
}
