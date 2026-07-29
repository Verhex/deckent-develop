import type { Task, TaskResult } from './types.js';
import { TaskStatus } from './types.js';

/**
 * Project a terminal worker assessment into the canonical task lifecycle.
 *
 * GO_WITH_TECH_DEBT is dependency-satisfying DONE; debt registration remains a
 * separate evaluation concern. Unknown/non-terminal assessments never mutate
 * task state.
 */
export function taskStatusForTerminalResult(
  result: Pick<TaskResult, 'selfAssessment'>,
): TaskStatus.DONE | TaskStatus.NO_GO | null {
  if (
    result.selfAssessment === 'DONE'
    || result.selfAssessment === 'GO_WITH_TECH_DEBT'
  ) {
    return TaskStatus.DONE;
  }
  if (result.selfAssessment === 'NO_GO') return TaskStatus.NO_GO;
  return null;
}

/** Apply the shared terminal projection in place. Returns true on mutation. */
export function applyTerminalTaskOutcome(
  task: Pick<Task, 'status'>,
  result: Pick<TaskResult, 'selfAssessment'>,
): boolean {
  const status = taskStatusForTerminalResult(result);
  if (status === null || task.status === status) return false;
  task.status = status;
  return true;
}
