import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getMessage } from '../../src/cli/helpers/messages.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/task-types.js';
import type { Task } from '../../src/core/task-types.js';
import { SprintStatus } from '../../src/core/sprint-types.js';
import type { Sprint } from '../../src/core/sprint-types.js';
import {
  admitRepairQueueRecord,
  transitionRepairQueueRecord,
} from '../../src/orchestra/repair-queue-authority.js';
import {
  applyCascadeCircuitBreaker,
  applyUnresolvedLineageOperatorHold,
  resolveRepairQuiescence,
} from '../../src/orchestra/sprint-controller.js';

const roots: string[] = [];
const policy = {
  enabled: true,
  max_unresolved_tasks: 5,
  min_unresolved_ratio_percent: 50,
} as const;

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'repair-quiescence-'));
  roots.push(value);
  mkdirSync(join(value, '.tasks'));
  return value;
}

function sprint(): Sprint {
  return {
    id: 'sprint-quiescence',
    status: SprintStatus.EVALUATING,
    tasks: Array.from({ length: 6 }, (_, index) => ({
      id: `root-${index}`,
      status: TaskStatus.NO_GO,
    } as Task)),
  } as Sprint;
}

function evaluations(value: Sprint): Map<string, TaskEvaluation> {
  return new Map(value.tasks.map(task => [task.id, TaskEvaluation.NO_GO]));
}

function admit(
  projectRoot: string,
  taskId = 'root-0-fix',
  sprintId = 'sprint-704',
): string {
  return admitRepairQueueRecord(projectRoot, {
    taskId,
    sprintId,
    birthClass: 'FIX',
    admittedAt: '2026-08-28T12:00:00.000Z',
    attempt: { attemptId: taskId, ordinal: 1, parentTaskId: 'root-0' },
  }).queueId;
}

afterEach(() => {
  for (const value of roots.splice(0)) {
    rmSync(value, { recursive: true, force: true });
  }
});

describe('repair quiescence pause gate', () => {
  it('forbids both PAUSE decisions while an admitted repair is pending', () => {
    const projectRoot = root();
    const value = sprint();
    admit(projectRoot);
    const quiescence = resolveRepairQuiescence(projectRoot);

    expect(quiescence).toMatchObject({
      kind: 'DRAIN_REQUIRED',
      reason: 'ADMITTED_REPAIR_QUEUE_NOT_DRAINED',
      pendingQueueCount: 1,
      snapshot: {
        pendingAdmittedRepairs: 1,
        activeAttempts: 0,
        authorizedRepairDecisions: 1,
      },
    });
    expect(applyCascadeCircuitBreaker(
      projectRoot, value, evaluations(value), policy, 'en', quiescence,
    )).toBe(false);
    expect(applyUnresolvedLineageOperatorHold(
      projectRoot, value, evaluations(value), policy, 'en', quiescence,
    )).toBe(false);
    expect(value.status).not.toBe(SprintStatus.PAUSED);
  });

  it('allows the unchanged configured breaker after the durable queue drains', () => {
    const projectRoot = root();
    const value = sprint();
    const queueId = admit(projectRoot);
    transitionRepairQueueRecord(projectRoot, queueId, 'dispatched');
    transitionRepairQueueRecord(projectRoot, queueId, 'settled');
    const quiescence = resolveRepairQuiescence(projectRoot);

    expect(quiescence.kind).toBe('QUIESCENT');
    expect(applyCascadeCircuitBreaker(
      projectRoot, value, evaluations(value), policy, 'en', quiescence,
    )).toBe(true);
    expect(value.status).toBe(SprintStatus.PAUSED);
  });

  it('surfaces a typed reason, queue count, and localized operator text', () => {
    const projectRoot = root();
    admit(projectRoot);

    const outcome = resolveRepairQuiescence(projectRoot, 'tr');
    expect(outcome).toMatchObject({
      kind: 'DRAIN_REQUIRED',
      reason: 'ADMITTED_REPAIR_QUEUE_NOT_DRAINED',
      pendingQueueCount: 1,
      snapshot: { pendingAdmittedRepairs: 1, activeAttempts: 0 },
    });
    expect(outcome.kind === 'DRAIN_REQUIRED' && outcome.message)
      .toContain('Repair kuyruğu drenajı bloke');
    expect(getMessage('repair.quiescence_drain_blocked', 'en', {
      count: '1', pending: '1', active: '0',
    })).toContain('1 authorized repair decision');
  });

  // A dispatched repair still owns a provider attempt. RETRO/finalization may
  // not race it merely because it left the queue: quiescence requires terminal
  // settlement, not dispatch acknowledgement.
  it('keeps a dispatched attempt fenced until it settles', () => {
    const projectRoot = root();
    const queueId = admit(projectRoot);
    transitionRepairQueueRecord(projectRoot, queueId, 'dispatched');

    expect(resolveRepairQuiescence(projectRoot)).toMatchObject({
      kind: 'DRAIN_REQUIRED',
      reason: 'ADMITTED_REPAIR_QUEUE_NOT_DRAINED',
      snapshot: {
        pendingAdmittedRepairs: 0,
        activeAttempts: 1,
        authorizedRepairDecisions: 1,
      },
    });
  });

  it('never lets another run\'s unsettled repair fence this run', () => {
    const projectRoot = root();
    admit(projectRoot, 'foreign-0-fix', 'sprint-703');

    expect(resolveRepairQuiescence(projectRoot, 'en', 'sprint-704'))
      .toMatchObject({ kind: 'QUIESCENT', snapshot: { authorizedRepairDecisions: 0 } });
    expect(resolveRepairQuiescence(projectRoot, 'en', 'sprint-703'))
      .toMatchObject({ kind: 'DRAIN_REQUIRED', pendingQueueCount: 1 });
  });

  it('does not let a policy-terminal NOT_DISPATCHED row block quiescence', () => {
    const projectRoot = root();
    admit(projectRoot, 'provider-terminal');
    writeFileSync(
      join(projectRoot, '.tasks', 'task-provider-terminal.result'),
      JSON.stringify({
        taskId: 'provider-terminal', workerId: 'host', filesChanged: [],
        linesAdded: 0, linesRemoved: 0, testsPassed: false, coverage: 0,
        selfAssessment: 'NO_GO', notes: 'provider unavailable before dispatch',
        preDispatchSettlement: {
          version: 1, state: 'NOT_DISPATCHED',
          reasonCode: 'PROVIDER_ADAPTER_UNAVAILABLE',
          attemptId: 'host-pre-dispatch:provider-terminal:attempt',
          evidenceRef: 'host:provider-unavailable',
        },
      }),
    );

    expect(resolveRepairQuiescence(projectRoot)).toEqual({
      kind: 'QUIESCENT',
      snapshot: {
        pendingAdmittedRepairs: 0,
        activeAttempts: 0,
        authorizedRepairDecisions: 0,
      },
    });
  });
});
