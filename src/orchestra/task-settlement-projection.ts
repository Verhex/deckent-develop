import { join } from 'node:path';

import { readTask } from '../agents/worker.js';
import { atomicWriteFileSync } from '../agents/worker-lifecycle.js';
import { TASKS_DIR } from '../core/constants.js';
import { normalizeTaskResultShape } from '../core/task-result-schema.js';
import {
  assertTaskResultSettlementRef,
  readClosedTaskResultSettlement,
  type TaskResultSettlementRefV1,
} from '../core/task-result-settlement.js';
import { taskStatusForTerminalResult } from '../core/task-terminal-outcome.js';
import type { TaskResult } from '../core/types.js';
import { TaskStatus } from '../core/types.js';
import { debugLog } from '../core/utils.js';

/**
 * Project one exact closed host-owned attempt into the raw task read model.
 *
 * Manual spawn, mandatory XVerify and future execution ingresses must use this
 * single settlement-bound service. Provider prose and unclosed/raw result files
 * are never sufficient authority for a terminal task projection.
 */
export function finalizeTaskStatusFromSettlement(
  root: string,
  taskId: string,
  settlementRef: TaskResultSettlementRefV1,
): TaskStatus | null {
  assertTaskResultSettlementRef(root, taskId, settlementRef);
  const settlement = readClosedTaskResultSettlement(settlementRef);
  if (!settlement) return null;
  const result = normalizeTaskResultShape(settlement.result as unknown as TaskResult);
  if (!result || result.taskId !== taskId) return null;

  const status = taskStatusForTerminalResult(result);
  if (status === null) return null;

  const taskPath = join(root, TASKS_DIR, `task-${taskId}.json`);
  try {
    const task = readTask(root, taskId);
    if (task.id !== taskId) return null;
    task.status = status;
    atomicWriteFileSync(taskPath, `${JSON.stringify(task, null, 2)}\n`);
    return status;
  } catch (error) {
    debugLog('task-settlement-projection:finalize', error);
    return null;
  }
}
