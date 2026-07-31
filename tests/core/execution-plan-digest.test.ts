import { describe, expect, it, vi } from 'vitest';
import {
  applyWorkerExecutionBudgetPolicy,
  buildExecutionPlanDigestContext,
  computeExecutionPlanDigest,
  computeExecutionPlanDigestByVersion,
  computeExecutionPlanDigestV3,
  computeExecutionPlanDigestV4,
  EXECUTION_PLAN_DIGEST_VERSION,
  EXECUTION_PLAN_DIGEST_VERSION_V2,
  EXECUTION_PLAN_DIGEST_VERSION_V3,
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
    landing: { reserve_ratio: 0.25 },
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
      admissionMode: 'unattended',
      landingPolicy: { reserve_ratio: 0.25, attended_unsupported: 'hold' },
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

  it('binds final-only provider usage to a fail-closed plan HOLD before process birth', () => {
    const planned = task('001-001', {
      provider: 'codex',
      model: 'gpt-5.6-terra',
      budget: { maxTurns: 12 },
    });
    const [snapshot] = applyWorkerExecutionBudgetPolicy([planned], policy());

    expect(snapshot).toMatchObject({
      state: 'hold',
      resolvedProvider: 'codex',
      reasonCode: 'final-only-usage-authorization-missing',
      profileRef: 'execution_budget.final_only_usage',
      requestedBudget: { maxTurns: 12 },
    });
    expect(planned.budget).toBeUndefined();

    const projection = computeExecutionPlanDigest(
      sprint({ tasks: [planned], workers: ['w-001-001'] }),
      buildExecutionPlanDigestContext(config({ worker_provider: 'codex' }), 'subscription'),
    );
    expect(projection.budgetHolds).toEqual([
      expect.objectContaining({
        slot: 1,
        resolvedProvider: 'codex',
        reasonCode: 'final-only-usage-authorization-missing',
      }),
    ]);
  });

  it('binds an exact owner-authorized final-only containment grant into the task and digest', () => {
    const authorizedPolicy: ExecutionBudgetPolicyConfig = {
      ...policy(),
      final_only_usage: {
        action: 'allow-wall-clock-containment',
        roles: ['worker'],
        max_wall_clock_seconds: 300,
      },
    };
    const planned = task('001-001', {
      provider: 'codex',
      model: 'gpt-5.6-terra',
      budget: { maxTurns: 12 },
    });
    const [snapshot] = applyWorkerExecutionBudgetPolicy([planned], authorizedPolicy);

    expect(snapshot).toMatchObject({
      state: 'allow',
      resolvedProvider: 'codex',
      finalOnlyUsage: {
        maxWallClockSeconds: 300,
        profileRef: 'execution_budget.final_only_usage',
      },
    });
    expect(planned.budget).toEqual({ maxTurns: 12, maxCacheReadTokens: 5_000_000 });

    const authorizedDigest = computeExecutionPlanDigest(
      sprint({ tasks: [planned], workers: ['w-001-001'] }),
      buildExecutionPlanDigestContext(config({ execution_budget: authorizedPolicy }), 'subscription'),
    );
    expect(JSON.stringify(authorizedDigest.projection)).toContain('"maxWallClockSeconds":300');

    const changedGrant = structuredClone(authorizedPolicy);
    changedGrant.final_only_usage!.max_wall_clock_seconds = 301;
    expect(computeExecutionPlanDigest(
      sprint({ tasks: [structuredClone(planned)], workers: ['w-001-001'] }),
      buildExecutionPlanDigestContext(config({ execution_budget: changedGrant }), 'subscription'),
    ).digest).not.toBe(authorizedDigest.digest);
  });
});

describe('execution plan digest v3 topology binding', () => {
  function v3(value: Sprint, maxWorkers = 4) {
    return computeExecutionPlanDigestV3(
      value,
      buildExecutionPlanDigestContext(config(), 'subscription', maxWorkers),
    );
  }

  it('binds shared-writer topology and configured concurrency while ignoring task-ID-only drift', () => {
    const base = sprint({
      tasks: [
        task('counter-900', { scope: { directories: [], filesRead: [], filesWrite: ['src/shared.ts'] } }),
        task('counter-100', { scope: { directories: [], filesRead: [], filesWrite: ['./src/shared.ts'] } }),
      ],
    });
    const remapped = structuredClone(base);
    remapped.tasks[0]!.id = 'new-a';
    remapped.tasks[1]!.id = 'new-b';

    expect(v3(remapped).digest).toBe(v3(base).digest);
    expect(v3(base, 2).digest).not.toBe(v3(base, 1).digest);
    expect(v3(base).topology.verdict).toBe('block');
    expect(v3(base).version).toBe(EXECUTION_PLAN_DIGEST_VERSION_V3);
  });

  it('keeps v2 byte semantics independent from the new optional concurrency context', () => {
    const planned = sprint();
    const oldContext = buildExecutionPlanDigestContext(config(), 'subscription');
    const extendedContext = buildExecutionPlanDigestContext(config(), 'subscription', 8);
    expect(computeExecutionPlanDigest(planned, extendedContext).digest)
      .toBe(computeExecutionPlanDigest(planned, oldContext).digest);
  });

  it('dispatches persisted v2, v3 and v4 explicitly and rejects unknown versions', () => {
    const planned = sprint();
    const context = buildExecutionPlanDigestContext(config(), 'subscription', 4);
    expect(computeExecutionPlanDigestByVersion(EXECUTION_PLAN_DIGEST_VERSION_V2, planned, context).version)
      .toBe(EXECUTION_PLAN_DIGEST_VERSION_V2);
    expect(computeExecutionPlanDigestByVersion(EXECUTION_PLAN_DIGEST_VERSION_V3, planned, context).version)
      .toBe(EXECUTION_PLAN_DIGEST_VERSION_V3);
    expect(computeExecutionPlanDigestByVersion(EXECUTION_PLAN_DIGEST_VERSION, planned, context).version)
      .toBe(EXECUTION_PLAN_DIGEST_VERSION);
    expect(() => computeExecutionPlanDigestByVersion(99, planned, context)).toThrow('unsupported version 99');
  });
});

describe('execution plan digest v4 structured-criterion binding', () => {
  const context = buildExecutionPlanDigestContext(config(), 'subscription', 4);

  it('binds criterion identity, polarity, statement and evidence without changing frozen v3 bytes', () => {
    const base = sprint();
    const enriched = structuredClone(base);
    enriched.tasks[0]!.goNogo.items = [{
      id: 'criterion-go-proof',
      polarity: 'go',
      statement: 'target passes',
      evidenceRequirements: ['tests/core/example.test.ts', 'npm test'],
    }];

    expect(computeExecutionPlanDigestV3(enriched, context).digest)
      .toBe(computeExecutionPlanDigestV3(base, context).digest);
    expect(computeExecutionPlanDigestV4(enriched, context).digest)
      .not.toBe(computeExecutionPlanDigestV4(base, context).digest);
    expect(computeExecutionPlanDigestV4(enriched, context).version)
      .toBe(EXECUTION_PLAN_DIGEST_VERSION);
  });

  it('treats evidence requirements as a canonical set but preserves criterion order', () => {
    const left = sprint();
    left.tasks[0]!.goNogo.items = [
      {
        id: 'criterion-go-a',
        polarity: 'go',
        statement: 'A',
        evidenceRequirements: ['z', 'a', 'a'],
      },
      {
        id: 'criterion-no-go-b',
        polarity: 'no-go',
        statement: 'B',
        evidenceRequirements: ['b'],
      },
    ];
    const reorderedEvidence = structuredClone(left);
    reorderedEvidence.tasks[0]!.goNogo.items![0]!.evidenceRequirements = ['a', 'z'];
    const reorderedCriteria = structuredClone(left);
    reorderedCriteria.tasks[0]!.goNogo.items!.reverse();

    expect(computeExecutionPlanDigestV4(reorderedEvidence, context).digest)
      .toBe(computeExecutionPlanDigestV4(left, context).digest);
    expect(computeExecutionPlanDigestV4(reorderedCriteria, context).digest)
      .not.toBe(computeExecutionPlanDigestV4(left, context).digest);
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

  it('binds a normalized closed write allowlist only in the current V4 projection', () => {
    const value = sprint();
    const baseline = buildExecutionPlanDigestContext(config(), 'subscription', 4);
    const first = buildExecutionPlanDigestContext(config(), 'subscription', 4, {
      mode: 'closed-allowlist',
      filesWrite: ['./src/b.ts', 'src/a.ts', 'src/a.ts'],
    });
    const reordered = buildExecutionPlanDigestContext(config(), 'subscription', 4, {
      mode: 'closed-allowlist',
      filesWrite: ['src/a.ts', 'src/b.ts'],
    });

    expect(first.writeScopePolicy?.filesWrite).toEqual(['src/a.ts', 'src/b.ts']);
    expect(computeExecutionPlanDigestV4(value, first).digest)
      .toBe(computeExecutionPlanDigestV4(value, reordered).digest);
    expect(computeExecutionPlanDigestV4(value, first).digest)
      .not.toBe(computeExecutionPlanDigestV4(value, baseline).digest);
    expect(computeExecutionPlanDigestV3(value, first).digest)
      .toBe(computeExecutionPlanDigestV3(value, baseline).digest);
  });

  it('returns a versioned deep-frozen canonical projection', () => {
    const result = computeExecutionPlanDigest(
      sprint(),
      buildExecutionPlanDigestContext(config(), 'subscription'),
    );
    expect(result.version).toBe(EXECUTION_PLAN_DIGEST_VERSION_V2);
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
        planDigestVersion: EXECUTION_PLAN_DIGEST_VERSION_V2,
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
