import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';

import {
  authorizePreplannedResumeTasks,
  beginPauseAuthorityResume,
  clearFailedResumePlanningState,
  restorePauseAuthority,
} from '../../src/cli/commands/resume.js';
import {
  SprintPhase, SprintStatus, TaskStatus,
  type ResolvedConfig, type Sprint, type Task,
} from '../../src/core/types.js';

function root(): string {
  const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-resume-budget-'));
  onTestFinished(() => rmSync(projectRoot, { recursive: true, force: true }));
  mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
  mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
  return projectRoot;
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: id,
    model: 'gpt-5.6-terra',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/a.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    type: 'code-development',
    sprintId: 'sprint-487',
    ...overrides,
  };
}

function sprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-487',
    number: 487,
    phase: SprintPhase.PLAN,
    status: SprintStatus.PLANNING,
    tasks,
    workers: [],
  };
}

function config(withBudget = true): ResolvedConfig {
  return {
    mode: 'balanced',
    activeModeConfig: { max_workers: 6 },
    modes: {},
    language: 'en',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '0.4.0',
    worker_provider: 'codex',
    execution_budget: withBudget ? {
      roles: {
        worker: { default: { maxCacheReadTokens: 10_000_000, maxTurns: 100 } },
      },
      landing: { reserve_ratio: 0.25 },
      final_only_usage: {
        action: 'allow-wall-clock-containment',
        roles: ['worker'],
        max_wall_clock_seconds: 600,
      },
    } : undefined,
  } as ResolvedConfig;
}

describe('resume execution-budget reauthorization', () => {
  it('persists current owner policy for pending dynamic FIX tasks before SPAWN', () => {
    const projectRoot = root();
    const fix = task('487-006-fix', {
      isPriorityFix: true,
      fixForTaskId: '487-006',
    });
    const done = task('487-001', { status: TaskStatus.DONE });
    for (const value of [fix, done]) {
      writeFileSync(
        join(projectRoot, '.tasks', `task-${value.id}.json`),
        JSON.stringify(value),
      );
    }

    authorizePreplannedResumeTasks(projectRoot, sprint([fix, done]), config());

    const persisted = JSON.parse(readFileSync(
      join(projectRoot, '.tasks', 'task-487-006-fix.json'),
      'utf-8',
    )) as Task;
    expect(persisted.budget).toEqual({ maxCacheReadTokens: 10_000_000, maxTurns: 100 });
    expect(persisted.budgetPolicy).toMatchObject({
      state: 'allow',
      role: 'worker',
      resolvedProvider: 'codex',
      profileRef: 'execution_budget.roles.worker.default',
      finalOnlyUsage: { maxWallClockSeconds: 600 },
    });
    const persistedDone = JSON.parse(readFileSync(
      join(projectRoot, '.tasks', 'task-487-001.json'),
      'utf-8',
    )) as Task;
    expect(persistedDone.budgetPolicy).toBeUndefined();
  });

  it('fails closed without rewriting task authority when policy is unavailable', () => {
    const projectRoot = root();
    const fix = task('487-011-fix', {
      isPriorityFix: true,
      fixForTaskId: '487-011',
    });
    const taskPath = join(projectRoot, '.tasks', 'task-487-011-fix.json');
    const original = JSON.stringify(fix);
    writeFileSync(taskPath, original);

    expect(() => authorizePreplannedResumeTasks(
      projectRoot,
      sprint([fix]),
      config(false),
    )).toThrow('RESUME_EXECUTION_BUDGET_HOLD:487-011-fix:budget-policy-missing');
    expect(readFileSync(taskPath, 'utf-8')).toBe(original);
  });

  it('removes only a stale PLANNING projection after resume failure', () => {
    const projectRoot = root();
    const statePath = join(projectRoot, '.deckent', 'sprint-state.json');
    writeFileSync(statePath, JSON.stringify({
      sprintId: 'sprint-487',
      phase: 'PLAN',
      status: 'PLANNING',
    }));
    clearFailedResumePlanningState(projectRoot, 'sprint-487');
    expect(existsSync(statePath)).toBe(false);

    writeFileSync(statePath, JSON.stringify({
      sprintId: 'sprint-487',
      phase: 'FIX',
      status: 'FIXING',
    }));
    clearFailedResumePlanningState(projectRoot, 'sprint-487');
    expect(existsSync(statePath)).toBe(true);
  });

  it('restores the pre-resume PAUSED state and dashboard as one authority lease', () => {
    const projectRoot = root();
    const pausePath = join(projectRoot, '.deckent', 'pause-state.json');
    const statePath = join(projectRoot, '.deckent', 'sprint-state.json');
    const dashboardPath = join(projectRoot, '.dashboard');
    const pause = JSON.stringify({ sprintId: 'sprint-487', status: 'PAUSED' });
    const state = JSON.stringify({ sprintId: 'sprint-487', phase: 'FIX', status: 'PAUSED' });
    const dashboard = JSON.stringify({
      sprint: { id: 'sprint-487', number: 487, phase: 'FIX', status: 'PAUSED' },
      agents: [],
      progress: { done: 19, active: 0, blocked: 13, total: 32 },
      alerts: [],
      updatedAt: '2026-07-31T00:00:00.000Z',
    });
    writeFileSync(pausePath, pause);
    writeFileSync(statePath, state);
    writeFileSync(dashboardPath, dashboard);

    const lease = beginPauseAuthorityResume(projectRoot, 'sprint-487');
    expect(lease.ok).toBe(true);
    if (!lease.ok) throw new Error('expected pause authority lease');
    writeFileSync(statePath, JSON.stringify({ sprintId: 'sprint-487', status: 'PLANNING' }));
    writeFileSync(dashboardPath, JSON.stringify({ sprint: { status: 'PLANNING' } }));

    expect(restorePauseAuthority(lease.lease)).toBe(true);
    expect(readFileSync(pausePath, 'utf-8')).toBe(pause);
    expect(readFileSync(statePath, 'utf-8')).toBe(state);
    expect(readFileSync(dashboardPath, 'utf-8')).toBe(dashboard);
  });
});
