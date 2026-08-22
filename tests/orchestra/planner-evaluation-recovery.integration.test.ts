import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createGoNoGoCriterionItem } from '../../src/core/task-types.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { PlannerTask, Task, TaskResult } from '../../src/core/types.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';
import { classifyFixFailure } from '../../src/orchestra/fix-failure-classification.js';
import { parsePlannerResponse } from '../../src/orchestra/planner.js';
import { evaluateGoNogoCriteria } from '../../src/orchestra/criterion-evaluation.js';
import {
  deriveAcceptanceFailureFingerprint,
  evaluateWithRubric,
} from '../../src/orchestra/result-evaluator.js';
import { extractGoNogoCriteria } from '../../src/orchestra/sprint-utils.js';
import { resolveVerifyCommands } from '../../src/orchestra/worker-verify-tool.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function plannerJson(): string {
  return JSON.stringify({
    reasoning: 'Twenty independent, file-scoped changes run in one verification wave.',
    tasks: Array.from({ length: 20 }, (_, index) => {
      const ordinal = index + 1;
      const output = `src/features/feature-${ordinal}.ts`;
      const test = `tests/features/feature-${ordinal}.test.ts`;
      return {
        title: `Scoped feature ${ordinal}`,
        description: index === 0
          ? 'Keep the api/v1 assertion truthful and produce the declared output.'
          : `Implement only feature ${ordinal}.`,
        model: 'claude-sonnet-5',
        effort: 'normal',
        priority: 'NORMAL',
        reason: 'Independent scoped change',
        scope: {
          directories: ['src/features/', 'tests/features/'],
          filesRead: [],
          filesWrite: [output, test],
        },
        dependencies: [],
        goNogo: {
          goCriteria: `${output} exists and ${test} passes`,
          noGoCriteria: `${output} is absent`,
          techDebtAcceptable: 'none',
        },
      };
    }),
  });
}

function result(taskId: string): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 95,
    selfAssessment: 'DONE',
    notes: 'The scoped probe is green; the required output is still absent.',
  };
}

describe('planner → evaluator → FIX recovery production integration', () => {
  it('keeps global verification wave-owned and pauses an unchanged typed failure after one FIX', () => {
    const parsed = parsePlannerResponse(plannerJson());
    expect(parsed?.tasks).toHaveLength(20);

    const stack = {
      kind: 'code-development' as const,
      stack: 'typescript' as const,
      commands: { typecheck: 'npx tsc --noEmit', test: 'npx vitest run' },
    };
    const taskContracts = parsed!.tasks.map((planned, index) => extractGoNogoCriteria(
      planned.description,
      `npx vitest run tests/features/feature-${index + 1}.test.ts`,
      stack,
    ));
    expect(taskContracts).toHaveLength(20);
    expect(taskContracts.every(contract => !contract.goCriteria.includes('npx tsc --noEmit'))).toBe(true);

    const waveContract = resolveVerifyCommands('/hermetic/project', () => ({
      build: 'npx vite build',
      lint: 'npx eslint',
      typecheck: stack.commands.typecheck,
      test: stack.commands.test,
    }));
    expect(JSON.stringify({ taskContracts, waveContract }).match(/npx tsc --noEmit/g)).toHaveLength(1);

    const root = mkdtempSync(join(tmpdir(), 'deckent-planner-recovery-'));
    roots.push(root);
    mkdirSync(join(root, '.tasks'), { recursive: true });

    const planned = parsed!.tasks[0] as PlannerTask;
    const task: Task = {
      ...planned,
      id: '611-001',
      status: TaskStatus.PENDING,
      sprintId: 'sprint-611',
      assignedWorker: 'w-611-001',
      goNogo: {
        ...planned.goNogo,
        items: [
          createGoNoGoCriterionItem({
            id: 'slashy-assertion',
            polarity: 'go',
            statement: 'api/v1 returns the expected payload',
            evidenceRequirements: [{ kind: 'assertion', value: 'api/v1 payload is correct' }],
          }),
          createGoNoGoCriterionItem({
            id: 'scoped-probe',
            polarity: 'go',
            statement: 'the scoped test is green',
            evidenceRequirements: [{ kind: 'command', value: 'npx vitest run tests/features/feature-1.test.ts' }],
          }),
          createGoNoGoCriterionItem({
            id: 'output-produced',
            polarity: 'go',
            statement: 'the scoped output exists',
            evidenceRequirements: [{ kind: 'file', value: 'src/features/feature-1.ts' }],
          }),
        ],
      },
    };
    writeFileSync(join(root, '.tasks', `task-${task.id}.json`), JSON.stringify(task));

    const firstResult = result(task.id);
    const criterionOutcome = evaluateGoNogoCriteria(task, firstResult, root);
    expect(criterionOutcome?.items.slice(0, 2).map(item => item.status))
      .toEqual(['undecidable', 'undecidable']);
    expect(criterionOutcome?.items[2]?.status).toBe('unsatisfied');
    const evaluation = evaluateWithRubric(firstResult, task, undefined, root);
    expect(evaluation.decision).toBe('NO_GO');

    const fingerprint = deriveAcceptanceFailureFingerprint(task, firstResult, root);
    expect(fingerprint).toMatch(/^sha256:/u);
    expect(classifyFixFailure({
      result: { ...firstResult, selfAssessment: 'NO_GO' },
      acceptanceFailureFingerprint: fingerprint,
    }).allowsFixTask).toBe(true);

    handleEvaluation(root, task, TaskEvaluation.NO_GO, { ...firstResult, selfAssessment: 'NO_GO' });
    const fixPath = join(root, '.tasks', 'task-611-001-fix.json');
    const fix = JSON.parse(readFileSync(fixPath, 'utf8')) as Task & {
      acceptanceFailureFingerprint: string;
    };
    expect(fix.acceptanceFailureFingerprint).toBe(fingerprint);
    expect(fix.status).toBe(TaskStatus.PENDING);

    const replayResult = { ...firstResult, taskId: fix.id, selfAssessment: 'NO_GO' as const };
    const replayFingerprint = deriveAcceptanceFailureFingerprint(fix, replayResult, root);
    expect(replayFingerprint).toBe(fingerprint);
    expect(classifyFixFailure({
      result: replayResult,
      acceptanceFailureFingerprint: replayFingerprint,
      priorAcceptanceFailureFingerprint: fix.acceptanceFailureFingerprint,
    })).toMatchObject({
      code: 'REPEATED_ACCEPTANCE_FAILURE',
      allowsFixTask: false,
    });

    handleEvaluation(root, fix, TaskEvaluation.NO_GO, replayResult);
    const parked = JSON.parse(readFileSync(fixPath, 'utf8')) as Task;
    expect(parked.status).toBe(TaskStatus.PAUSED);
    expect(() => readFileSync(join(root, '.tasks', `task-${fix.id}-fix.json`), 'utf8')).toThrow();
  });
});
