import { describe, expect, it } from 'vitest';

import { TaskStatus, type Task, type TaskResult } from '../../src/core/types.js';
import {
  applyTerminalTaskOutcome,
  taskStatusForTerminalResult,
} from '../../src/core/task-terminal-outcome.js';

describe('task terminal outcome projection', () => {
  it.each([
    ['DONE', TaskStatus.DONE],
    ['GO_WITH_TECH_DEBT', TaskStatus.DONE],
    ['NO_GO', TaskStatus.NO_GO],
  ] as const)('maps %s to %s', (selfAssessment, expected) => {
    expect(taskStatusForTerminalResult({ selfAssessment })).toBe(expected);
  });

  it('does not mutate for a non-terminal assessment', () => {
    const task = { status: TaskStatus.EXECUTING } as Task;
    const changed = applyTerminalTaskOutcome(
      task,
      { selfAssessment: 'PARTIAL' } as TaskResult,
    );
    expect(changed).toBe(false);
    expect(task.status).toBe(TaskStatus.EXECUTING);
  });
});
