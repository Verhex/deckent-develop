import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { TASKS_DIR } from '../core/constants.js';
import {
  readLatestTaskResultSettlementRef,
  readTaskResultSettlement,
  taskResultSettlementPath,
  type TaskResultSettlementRefV1,
} from '../core/task-result-settlement.js';
import { readJsonSafe } from '../core/utils.js';

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

/**
 * Select one result authority for a project/task.
 *
 * A durable Docker claim makes the host-owned settlement receipt mandatory:
 * worker-writable `.result` content remains ineligible until that receipt is
 * present. Projects/tasks without a Docker claim retain the legacy raw-file
 * contract for non-Docker backends and pre-migration records.
 */
export function readAuthoritativeTaskResult<T>(
  projectRoot: string,
  taskId: string,
): TaskResultAuthorityRead<T> {
  const rawResultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
  const settlementRef = readLatestTaskResultSettlementRef(projectRoot, taskId);
  if (settlementRef) {
    const settlement = readTaskResultSettlement(settlementRef);
    if (!settlement && existsSync(taskResultSettlementPath(settlementRef))) {
      throw new Error(
        `Corrupt host-owned Docker result settlement: ${taskResultSettlementPath(settlementRef)}`,
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
