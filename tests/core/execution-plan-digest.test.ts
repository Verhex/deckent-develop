import { describe, expect, it, vi } from 'vitest';
import {
  applyWorkerExecutionBudgetPolicy,
  buildExecutionPlanDigestContext,
  computeExecutionPlanDigest,
  EXECUTION_PLAN_DIGEST_VERSION,
} from '../../src/core/execution-plan-digest.js';
import type { ExecutionBudgetPolicyConfig, ResolvedConfig } from '../../src/core/config-types.js';
import type { Sprint, Task } from '../../src/core/types.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';
import { startApprovedRun, RunJobDigestMismatchError } from '../../src/orchestra/run-job-service.js';

function policy(maxTurns = 40): ExecutionBudgetPolicyConfig {
  return {
    roles: {
      worker: {
        default: { maxTurns, maxCacheReadTokens: 5_000_000 },
        by_task_kind: { documentation: { maxTurns: 10, maxCacheReadTokens: 500_000 } },
      },
    },
  };
}

function config(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'claude-fable-5',
      default_model: 'claude-sonnet-5',
      haiku_allowed: true,
      brain_planning: 'structured',
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: 'digest-test',
    projectRoot: '/tmp/digest-test',
    version: '1.0.0',
    worker_provider: 'claude',
    fallback_provider: 'codex',
    provider_fallback: { worker: ['codex', 'gemini'], unattended: false },
    spawn_backend: 'docker',
    execution_budget: policy(),
    ...overrides,
  } as ResolvedConfig;
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Execute ${id}`,
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'owner directive',
    scope: { directories: ['src/'], filesRead: ['src/input.ts'], filesWrite: ['src/output.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'target passes', noGoCriteria: 'target fails', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    type: 'code-development',
    provider: 'claude',
    backend: 'docker',
    authMode: 'subscription',
    assignedAgent: 'backend-developer',
    assignedSkills: ['typescript'],
    sprintId: 'sprint-001',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function sprint(overrides: Partial<Sprint> = {}): Sprint {
  const first = task('001-001');
  const second = task('001-002', { dependencies: ['001-001'], title: 'Second task' });
  return {
    id: 'sprint-001',
    number: 1,
    status: SprintStatus.PLANNING,
    phase: SprintPhase.PLAN,
    tasks: [first, second],
    workers: ['w-001-001', 'w-001-002'],
    promptGate: { ok: true, findings: [], blockers: [] },
    ...overrides,
  };
}

function digest(value: Sprint, cfg = config()): string {
  const context = buildExecutionPlanDigestContext(cfg, 'subscription');
  return computeExecutionPlanDigest(value, context).digest;
}

describe('plan-time worker budget projection', () => {
  it('persists the owner ceiling and retains a narrower request as provenance', () => {
    const planned = task('001-001', { budget: { maxTurns: 12, maxCacheReadTokens: 9_000_000 } });
    const [snapshot] = applyWorkerExecutionBudgetPolicy([planned], policy());

    expect(planned.budget).toEqual({ maxTurns: 12, maxCacheReadTokens: 5_000_000 });
    expect(snapshot).toMatchObject({
      state: 'allow',
      role: 'worker',
      profileRef: 'execution_budget.roles.worker.default',
      requestedBudget: { maxTurns: 12, maxCacheReadTokens: 9_000_000 },
    });
    expect(planned.budgetPolicy).toEqual(snapshot);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('records a remote HOLD without treating a caller budget as owner authority', () => {
    const planned = task('001-001', { budget: { maxTurns: 3 } });
    const [snapshot] = applyWorkerExecutionBudgetPolicy([planned]);
    expect(snapshot).toMatchObject({ state: 'hold', reasonCode: 'budget-policy-missing' });
    const result = computeExecutionPlanDigest(
      sprint({ tasks: [planned], workers: ['w-001-001'] }),
      buildExecutionPlanDigestContext(config({ execution_budget: undefined }), 'subscription'),
    );
    expect(JSON.stringify(result.projection)).toContain('"effective":null');
  });

  it('keeps local Ollama work policy-exempt without inventing a ceiling', () => {
    const planned = task('001-001', { provider: 'ollama', model: 'qwen3.6:27b' });
    const [snapshot] = applyWorkerExecutionBudgetPolicy([planned]);
    expect(snapshot).toMatchObject({ state: 'allow', executionCostClass: 'local', profileRef: 'local-exempt' });
    expect(planned.budget).toBeUndefined();
  });
});

describe('execution plan digest v2', () => {
  it('is stable across volatile sprint/task identities, timestamps, scope order, and remapped internal dependency IDs', () => {
    const original = sprint();
    const remapped = sprint({
      id: 'sprint-999',
      number: 999,
      status: SprintStatus.ACTIVE,
      workers: ['runtime-worker-a'],
      startedAt: '2030-01-01T00:00:00.000Z',
      tasks: [
        task('999-701', {
          title: 'Task 001-001',
          description: 'Execute 001-001',
          sprintId: 'sprint-999',
          createdAt: '2030-01-01T00:00:00.000Z',
          assignedWorker: 'runtime-worker-a',
          scope: { directories: ['src/', 'src/'], filesRead: ['src\\input.ts'], filesWrite: ['src/output.ts'] },
        }),
        task('999-702', {
          sprintId: 'sprint-999',
          title: 'Second task',
          description: 'Execute 001-002',
          dependencies: ['999-701'],
          createdAt: '2030-01-01T00:00:00.000Z',
        }),
      ],
    });
    expect(digest(remapped)).toBe(digest(original));
  });

  it.each([
    ['provider', (value: Sprint) => { value.tasks[0]!.provider = 'codex'; }],
    ['model', (value: Sprint) => { value.tasks[0]!.model = 'gpt-5.6-sol'; }],
    ['backend', (value: Sprint) => { value.tasks[0]!.backend = 'subprocess'; }],
    ['auth', (value: Sprint) => { value.tasks[0]!.authMode = 'api'; }],
    ['budget', (value: Sprint) => { value.tasks[0]!.budget = { maxTurns: 7 }; }],
    ['scope', (value: Sprint) => { value.tasks[0]!.scope.filesWrite.push('src/new.ts'); }],
    ['dependency', (value: Sprint) => { value.tasks[1]!.dependencies.push('external-task'); }],
    ['goCriteria', (value: Sprint) => { value.tasks[0]!.goNogo.goCriteria = 'different proof'; }],
    ['kind', (value: Sprint) => { value.tasks[0]!.type = 'documentation'; }],
    ['agent', (value: Sprint) => { value.tasks[0]!.assignedAgent = 'security-engineer'; }],
    ['prompt gate', (value: Sprint) => { value.promptGate = { ok: false, findings: [], blockers: [] }; }],
  ] as const)('%s drift changes the approval CAS digest', (_name, mutate) => {
    const baseline = sprint();
    const changed = structuredClone(baseline);
    mutate(changed);
    expect(digest(changed)).not.toBe(digest(baseline));
  });

  it('binds configured fallback and owner-policy changes even when task summaries stay identical', () => {
    const value = sprint();
    expect(digest(value, config({ fallback_provider: 'gemini' }))).not.toBe(digest(value));
    expect(digest(value, config({ execution_budget: policy(20) }))).not.toBe(digest(value));
  });

  it('returns a versioned deep-frozen canonical projection', () => {
    const result = computeExecutionPlanDigest(
      sprint(),
      buildExecutionPlanDigestContext(config(), 'subscription'),
    );
    expect(result.version).toBe(EXECUTION_PLAN_DIGEST_VERSION);
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(result.projection)).toBe(true);
    expect(Object.isFrozen((result.projection.tasks as unknown[])[0])).toBe(true);
  });

  it('blocks a tampered v2 stored Sprint before spawnStart', () => {
    const approvedSprint = sprint();
    const context = buildExecutionPlanDigestContext(config(), 'subscription');
    const approvedDigest = computeExecutionPlanDigest(approvedSprint, context).digest;
    approvedSprint.tasks[0]!.scope.filesWrite.push('src/tampered.ts');
    const spawnStart = vi.fn(() => ({ flowId: 'flow-1', jobId: 'job-1', logRef: 'log-1' }));

    expect(() => startApprovedRun({
      flowId: 'flow-1',
      expectedRevision: 1,
      expectedPlanDigest: approvedDigest,
      approvedSnapshot: {
        flowId: 'flow-1',
        revision: 1,
        planDigest: approvedDigest,
        planDigestVersion: EXECUTION_PLAN_DIGEST_VERSION,
        planDigestContext: context,
        approvedBy: { id: 'owner' },
        approvedAt: '2026-07-21T00:00:00.000Z',
        sprint: approvedSprint,
      },
      spawnStart,
    })).toThrow(RunJobDigestMismatchError);
    expect(spawnStart).not.toHaveBeenCalled();
  });
});
