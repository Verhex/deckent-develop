import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  createTaskResultSettlementRefForAttempt,
  taskResultSettlementPath,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
} from '../../src/core/task-result-settlement.js';
import type { ResolvedConfig, Sprint, Task, TaskResult } from '../../src/core/types.js';
import {
  SprintPhase,
  SprintStatus,
  TaskEvaluation,
  TaskStatus,
} from '../../src/core/types.js';
import {
  assertTaskResultAuthoritiesReady,
  readAuthoritativeTaskResult,
  readRuntimeBudgetEvaluationAuthority,
} from '../../src/orchestra/task-result-authority.js';
import { RuntimeBudgetMonitor } from '../../src/orchestra/runtime-budget-monitor.js';
import {
  runEvaluatePhase,
  runRetroPhase,
} from '../../src/orchestra/sprint-phases.js';
import { evaluationAuditPath } from '../../src/orchestra/evaluation-audit-trail.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function fixture(taskId: string): {
  root: string;
  tasksDir: string;
  task: Task;
  sprint: Sprint;
} {
  const base = mkdtempSync(join(tmpdir(), 'deckent-sprint-terminal-hold-'));
  roots.push(base);
  const root = join(base, 'project');
  const tasksDir = join(root, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  mkdirSync(join(root, '.deckent'), { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  const task = {
    id: taskId,
    title: 'Terminal settlement HOLD',
    description: 'host authority must close before terminal phases',
    model: 'claude-fable-5',
    effort: 'low',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'host truth', noGoCriteria: 'raw wins', techDebtAcceptable: 'none' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-terminal-hold',
  } as Task;
  writeFileSync(join(tasksDir, `task-${taskId}.json`), JSON.stringify(task), 'utf-8');
  const sprint = {
    id: 'sprint-terminal-hold',
    number: 916,
    tasks: [task],
    workers: [`w-${taskId}`],
    phase: SprintPhase.EVALUATE,
    status: SprintStatus.EVALUATING,
    startedAt: '2026-07-24T00:00:00.000Z',
  } as Sprint;
  return { root, tasksDir, task, sprint };
}

function rawResult(taskId: string, notes: string): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes,
  };
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('live sprint terminal settlement HOLD', () => {
  it('rejects RETRO before sprint/evaluation/result mutation while Docker settlement is pending', async () => {
    const taskId = '916-001';
    const { root, tasksDir, sprint } = fixture(taskId);
    const resultPath = join(tasksDir, `task-${taskId}.result`);
    writeFileSync(resultPath, JSON.stringify(rawResult(taskId, 'untrusted raw DONE')), 'utf-8');
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    const beforeHash = sha256(resultPath);
    const evaluations = new Map();

    expect(() => assertTaskResultAuthoritiesReady(root, [taskId], 'test-boundary'))
      .toThrow(/pending Docker result settlement/);
    await expect(runRetroPhase(
      root,
      sprint,
      evaluations,
      [],
      { language: 'en' } as ResolvedConfig,
    )).rejects.toMatchObject({ code: 'DECKENT_E077' });

    expect(sprint.status).toBe(SprintStatus.EVALUATING);
    expect(sprint.phase).toBe(SprintPhase.EVALUATE);
    expect(evaluations.size).toBe(0);
    expect(sha256(resultPath)).toBe(beforeHash);
    expect(existsSync(join(root, '.deckent', 'sprint-state.json'))).toBe(false);
  });

  it('propagates EVALUATE authority HOLD and releases its idempotency lock', async () => {
    const taskId = '916-005';
    const { root, tasksDir, sprint } = fixture(taskId);
    writeFileSync(
      join(tasksDir, `task-${taskId}.result`),
      JSON.stringify(rawResult(taskId, 'untrusted raw DONE')),
      'utf-8',
    );
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    const evaluations = new Map();

    await expect(runEvaluatePhase(
      root,
      sprint,
      [],
      evaluations,
      90,
      { language: 'en' } as ResolvedConfig,
    )).rejects.toMatchObject({ code: 'DECKENT_E077' });

    expect(sprint.status).toBe(SprintStatus.EVALUATING);
    expect(sprint.phase).toBe(SprintPhase.EVALUATE);
    expect(evaluations.size).toBe(0);
    expect(existsSync(join(root, '.deckent', `${sprint.id}-evaluate-lock`))).toBe(false);
  });

  it('wraps corrupt settlement evidence as DECKENT_E077', () => {
    const taskId = '916-002';
    const { root, tasksDir } = fixture(taskId);
    writeFileSync(
      join(tasksDir, `task-${taskId}.result`),
      JSON.stringify(rawResult(taskId, 'raw fallback forbidden')),
      'utf-8',
    );
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    writeFileSync(taskResultSettlementPath(ref), '{}', 'utf-8');

    let thrown: unknown;
    try {
      assertTaskResultAuthoritiesReady(root, [taskId], 'test-corrupt');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: 'DECKENT_E077' });
  });

  it('accepts closed host truth and legacy non-Docker terminal/absent paths', () => {
    const dockerTaskId = '916-003';
    const docker = fixture(dockerTaskId);
    writeFileSync(
      join(docker.tasksDir, `task-${dockerTaskId}.result`),
      JSON.stringify(rawResult(dockerTaskId, 'contradictory raw DONE')),
      'utf-8',
    );
    const ref = createTaskResultSettlementRef(docker.root, dockerTaskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 1,
      result: {
        ...rawResult(dockerTaskId, 'host NO_GO truth'),
        testsPassed: false,
        selfAssessment: 'NO_GO',
      },
    }));
    writeTaskResultSettlementClosureAtomic(ref, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
    expect(() => assertTaskResultAuthoritiesReady(
      docker.root,
      [dockerTaskId],
      'test-closed',
    )).not.toThrow();
    expect(readAuthoritativeTaskResult<TaskResult>(docker.root, dockerTaskId))
      .toMatchObject({
        state: 'settled',
        result: { selfAssessment: 'NO_GO', notes: 'host NO_GO truth' },
      });

    const legacyTaskId = '916-004';
    const legacy = fixture(legacyTaskId);
    writeFileSync(
      join(legacy.tasksDir, `task-${legacyTaskId}.result`),
      JSON.stringify(rawResult(legacyTaskId, 'legacy terminal')),
      'utf-8',
    );
    expect(() => assertTaskResultAuthoritiesReady(
      legacy.root,
      [legacyTaskId, 'legacy-absent'],
      'test-legacy',
    )).not.toThrow();
  });

  it('keeps exact-attempt host runtime-budget exhaustion terminal through EVALUATE', async () => {
    const taskId = '916-006';
    const { root, tasksDir, task, sprint } = fixture(taskId);
    const ref = createTaskResultSettlementRef(root, taskId);
    const hostResult = rawResult(taskId, 'host settlement result');
    writeFileSync(
      join(tasksDir, `task-${taskId}.result`),
      JSON.stringify(hostResult),
      'utf-8',
    );
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);

    const monitor = new RuntimeBudgetMonitor({
      projectRoot: root,
      taskId,
      attemptId: ref.attemptId,
      backend: 'docker',
      budget: { maxCacheReadTokens: 10 },
      onStop: () => undefined,
    });
    monitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'budget-stop',
          usage: { cache_read_input_tokens: 11 },
          content: [],
        },
      },
    });
    monitor.settle();

    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 137,
      result: hostResult as unknown as Record<string, unknown>,
    }));
    writeTaskResultSettlementClosureAtomic(ref, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });

    expect(readRuntimeBudgetEvaluationAuthority(root, taskId)).toMatchObject({
      settlementRef: { attemptId: ref.attemptId },
      exhaustion: { attemptId: ref.attemptId, state: 'exceeded' },
    });

    const evaluations = new Map<string, TaskEvaluation>();
    await runEvaluatePhase(
      root,
      sprint,
      [hostResult],
      evaluations,
      90,
      { language: 'en' } as ResolvedConfig,
    );

    expect(evaluations.get(taskId)).toBe(TaskEvaluation.NO_GO);
    const persisted = JSON.parse(
      readFileSync(join(tasksDir, `task-${taskId}.result`), 'utf-8'),
    ) as { brainEvaluation?: string; brainEvaluationReason?: string };
    expect(persisted.brainEvaluation).toBe('NO_GO');
    expect(persisted.brainEvaluationReason)
      .toContain(`host_runtime_budget_exhausted:${ref.attemptId}`);
    const audit = JSON.parse(
      readFileSync(evaluationAuditPath(root, sprint.id, taskId, 1), 'utf-8'),
    ) as { decision?: string; decisionRationale?: string };
    // 7097-B1 verdict-source chain: post-rubric flips append their typed
    // cause — the budget veto now leaves a readable trace after the base
    // rationale instead of an unexplained NO_GO.
    expect(audit).toMatchObject({
      decision: 'NO_GO',
      decisionRationale:
        `host_runtime_budget_exhausted:${ref.attemptId} | post-rubric: path:main → runtime-budget-authority:NO_GO`,
    });
  });

  it('does not let a stale runtime-budget marker veto a later settled attempt', () => {
    const taskId = '916-007';
    const { root } = fixture(taskId);
    const stoppedAttemptId = '019b8cf0-3c16-7f53-8f1c-965f9701672a';
    const settledAttemptId = '019b8cf0-3c16-7f53-8f1c-965f9701672b';
    const monitor = new RuntimeBudgetMonitor({
      projectRoot: root,
      taskId,
      attemptId: stoppedAttemptId,
      backend: 'docker',
      budget: { maxCacheReadTokens: 10 },
      onStop: () => undefined,
    });
    monitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'stale-budget-stop',
          usage: { cache_read_input_tokens: 11 },
          content: [],
        },
      },
    });
    monitor.settle();

    const ref = createTaskResultSettlementRefForAttempt(root, taskId, settledAttemptId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 0,
      result: rawResult(taskId, 'later successful attempt') as unknown as Record<string, unknown>,
    }));
    writeTaskResultSettlementClosureAtomic(ref, {
      containerDisposition: 'absent-after-exit',
      locksReleased: true,
    });

    expect(readRuntimeBudgetEvaluationAuthority(root, taskId)).toBeNull();
  });
});
