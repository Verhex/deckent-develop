import { join } from 'node:path';

import { TASKS_DIR } from '../core/constants.js';
import {
  readLatestTaskResultSettlementRef,
  readClosedTaskResultSettlement,
  type TaskResultSettlementRefV1,
} from '../core/task-result-settlement.js';
import { createExecutionAuthorityError } from '../core/errors.js';
import { readJsonSafe } from '../core/utils.js';
import {
  readRuntimeBudgetExhaustion,
  type RuntimeBudgetStopEvidence,
} from './runtime-budget-monitor.js';

export type TaskResultAuthorityState =
  | 'settled'
  | 'pending-settlement'
  | 'legacy'
  | 'absent';

export interface TaskResultAuthorityRead<T> {
  state: TaskResultAuthorityState;
  result: T | null;
  settlementRef: TaskResultSettlementRefV1 | null;
  rawResultPath: string;
}

export interface RuntimeBudgetEvaluationAuthority {
  settlementRef: TaskResultSettlementRefV1;
  exhaustion: RuntimeBudgetStopEvidence;
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
    return settlement
      ? { state: 'settled', result: settlement.result as T, settlementRef, rawResultPath }
      : { state: 'pending-settlement', result: null, settlementRef, rawResultPath };
  }

  const legacy = readJsonSafe<T>(rawResultPath);
  return legacy === null
    ? { state: 'absent', result: null, settlementRef: null, rawResultPath }
    : { state: 'legacy', result: legacy, settlementRef: null, rawResultPath };
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
