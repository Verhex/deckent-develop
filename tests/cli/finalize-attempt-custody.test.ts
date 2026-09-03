import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { TaskEvaluation, TaskStatus, type Task } from '../../src/core/types.js';
import { buildSprintFromTasks } from '../../src/cli/commands/finalize.js';
import { buildFinalizerTerminalTruth } from '../../src/orchestra/sprint-finalizer.js';
import { createTaskResultSettlementV2Fixture } from '../helpers/task-result-settlement-v2-fixture.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('finalize exact attempt custody', () => {
  it('does not convert a raw V2 result self-report into terminal authority', () => {
    const exact = createTaskResultSettlementV2Fixture();
    const root = mkdtempSync(join(tmpdir(), 'deckent-finalize-exact-custody-'));
    roots.push(root);
    const tasksDir = join(root, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    const task: Task = {
      id: exact.identity.taskId,
      title: 'Exact finalize fixture',
      description: 'Raw V2 result requires the T11 Store receipt',
      model: 'config-resolved',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'fixture',
      type: 'code-development',
      provider: 'config-resolved',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'fixture', noGoCriteria: 'fixture', techDebtAcceptable: 'none' },
      status: TaskStatus.DONE,
      sprintId: 'sprint-910',
    } as Task;
    writeFileSync(
      join(tasksDir, `task-${task.id}.json`),
      `${JSON.stringify(task, null, 2)}\n`,
      'utf8',
    );
    writeFileSync(
      join(tasksDir, `task-${task.id}.result`),
      `${JSON.stringify(exact.result, null, 2)}\n`,
      'utf8',
    );

    const loaded = buildSprintFromTasks(root, 'sprint-910');
    expect(loaded.results).toHaveLength(1);
    expect(loaded.evaluations.get(task.id)).toBe(TaskEvaluation.DEFERRED);
    expect((loaded.results[0] as { exactCustodyTerminalAuthorityRequired?: unknown })
      .exactCustodyTerminalAuthorityRequired).toBe(true);

    const truth = buildFinalizerTerminalTruth({
      tasks: loaded.tasks,
      results: loaded.results,
      evaluations: loaded.evaluations,
    });
    expect(truth.attempts[0]?.authority).toEqual({
      state: 'UNKNOWN',
      reasonCode: 'EXACT_TERMINAL_AUTHORITY_REQUIRED',
    });
    expect(truth.terminalEvidence.cleanupEligibility.candidate).toBe(false);
    expect(truth.logicalMetrics.completedTasks).toBe(0);
  }, 30_000);

  it('ignores a forged public DONE when the Store discriminator reports exact custody without a current receipt', () => {
    const exact = createTaskResultSettlementV2Fixture();
    const root = mkdtempSync(join(tmpdir(), 'deckent-finalize-exact-missing-ref-'));
    roots.push(root);
    const tasksDir = join(root, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    const task: Task = {
      id: exact.identity.taskId,
      title: 'Exact finalize missing reference fixture',
      description: 'Public bytes cannot replace a T11 Store receipt',
      model: 'config-resolved',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'fixture',
      type: 'code-development',
      provider: 'config-resolved',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'fixture', noGoCriteria: 'fixture', techDebtAcceptable: 'none' },
      status: TaskStatus.DONE,
      sprintId: 'sprint-911',
    } as Task;
    writeFileSync(
      join(tasksDir, `task-${task.id}.json`),
      `${JSON.stringify(task, null, 2)}\n`,
      'utf8',
    );
    const forged = {
      ...exact.result,
      selfAssessment: TaskEvaluation.DONE,
      evaluationDecision: TaskEvaluation.DONE,
    } as Record<string, unknown>;
    delete forged.attemptCustody;
    writeFileSync(
      join(tasksDir, `task-${task.id}.result`),
      `${JSON.stringify(forged, null, 2)}\n`,
      'utf8',
    );

    const readExactTaskTerminalAuthority = () => ({ state: 'exact' as const });
    const loaded = buildSprintFromTasks(root, 'sprint-911', {
      readExactTaskTerminalAuthority,
    });

    expect(loaded.evaluations.get(task.id)).toBe(TaskEvaluation.DEFERRED);
    expect(loaded.exactTerminalAuthorities.get(task.id)).toEqual({
      state: 'hold',
      reasonCode: 'exact-terminal-reference-required',
    });
    const truth = buildFinalizerTerminalTruth({
      tasks: loaded.tasks,
      results: loaded.results,
      evaluations: loaded.evaluations,
      exactTerminalAuthorities: loaded.exactTerminalAuthorities,
    });
    expect(truth.attempts[0]?.authority.state).toBe('UNKNOWN');
    expect(truth.terminalEvidence.cleanupEligibility.candidate).toBe(false);
    expect(truth.logicalMetrics.completedTasks).toBe(0);
  }, 30_000);
});
