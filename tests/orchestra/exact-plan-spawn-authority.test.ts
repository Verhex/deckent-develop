import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { TaskStatus, type Task } from '../../src/core/types.js';
import {
  assertExactPlanDependencies,
  assertExactPlanTaskUnchanged,
  captureExactPlanTaskAuthority,
  ExactPlanSpawnAuthorityError,
  readSpawnTaskAuthority,
  routeSprintTasksForExecution,
} from '../../src/orchestra/sprint-spawner.js';

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-exact-plan-spawn-'));
  roots.push(root);
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: '461-001',
    title: 'Exact task',
    description: 'Execute only the approved task.',
    status: TaskStatus.PENDING,
    dependencies: [],
    scope: {
      directories: ['src/'],
      filesWrite: ['src/exact.ts'],
      filesRead: [],
    },
    ...overrides,
  } as Task;
}

const authority = {
  flowId: 'flow-exact',
  revision: 1,
  planDigest: 'digest-exact',
} as const;

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('exact plan spawn authority', () => {
  it('accepts already-canonical dependencies without mutating the approved tasks', () => {
    const tasks = [
      task(),
      task({
        id: '461-002',
        title: 'Dependent task',
        dependencies: ['461-001'],
      }),
    ];
    const before = JSON.stringify(tasks);

    expect(() => assertExactPlanDependencies(tasks)).not.toThrow();
    expect(JSON.stringify(tasks)).toBe(before);
  });

  it('rejects a title dependency that would mutate after approval', () => {
    const tasks = [
      task(),
      task({
        id: '461-002',
        title: 'Dependent task',
        dependencies: ['Exact task'],
      }),
    ];

    expect(() => assertExactPlanDependencies(tasks)).toThrowError(
      expect.objectContaining<Partial<ExactPlanSpawnAuthorityError>>({
        code: 'EXACT_PLAN_DEPENDENCY_DRIFT',
      }),
    );
  });

  it('requires the materialized task artifact and rejects semantic drift', () => {
    const root = makeRoot();
    const approved = task();

    expect(() => readSpawnTaskAuthority(root, approved, authority)).toThrowError(
      expect.objectContaining<Partial<ExactPlanSpawnAuthorityError>>({
        code: 'EXACT_PLAN_TASK_ARTIFACT_MISSING',
        taskId: approved.id,
      }),
    );

    writeFileSync(
      join(root, '.tasks', `task-${approved.id}.json`),
      JSON.stringify({ ...approved, model: 'different-model' }),
      'utf8',
    );
    expect(() => readSpawnTaskAuthority(root, approved, authority)).toThrowError(
      expect.objectContaining<Partial<ExactPlanSpawnAuthorityError>>({
        code: 'EXACT_PLAN_TASK_ARTIFACT_DRIFT',
        taskId: approved.id,
      }),
    );
  });

  it('allows legacy disk refresh but rejects exact runtime route mutation', () => {
    const root = makeRoot();
    const approved = task();
    const patched = { ...approved, assignedAgent: 'reviewer' };
    writeFileSync(
      join(root, '.tasks', `task-${approved.id}.json`),
      JSON.stringify(patched),
      'utf8',
    );

    expect(readSpawnTaskAuthority(root, approved)).toEqual(patched);
    const before = captureExactPlanTaskAuthority(approved, authority);
    approved.provider = 'claude';
    expect(() => assertExactPlanTaskUnchanged(approved, before)).toThrowError(
      expect.objectContaining<Partial<ExactPlanSpawnAuthorityError>>({
        code: 'EXACT_PLAN_RUNTIME_ROUTE_DRIFT',
        taskId: approved.id,
      }),
    );
  });

  it('does not re-route or mutate a digest-bound exact task at the execution boundary', () => {
    const approved = task({
      model: 'gpt-5.6-terra',
      provider: undefined,
      assignedAgent: 'core-architect',
      assignedSkills: ['typescript-expert'],
    });
    const before = JSON.stringify(approved);

    routeSprintTasksForExecution(
      [approved],
      {
        worker_provider: 'claude',
        skill_routing: { default: 'claude' },
      } as never,
      ['claude'],
      { projectRoot: '/unused', sprintId: 'sprint-481' },
      authority,
    );

    expect(JSON.stringify(approved)).toBe(before);
    expect(approved.provider).toBeUndefined();
  });
});
