/**
 * FO07 cross-surface authority conformance. Actual manual, initial-sprint, and
 * continuation consumers are exercised in the companion scoped suites; this
 * file pins their shared canonical projection and settlement negative space.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveFinalOnlyUsageContainment,
  type ResolvedFinalOnlyUsageExecutor,
} from '../../src/core/final-only-usage-containment.js';
import { resolveWorkerExecutionRoute, finalizeTaskStatusFromSettlement } from '../../src/cli/commands/spawn.js';
import type { TaskExecutionBudgetPolicySnapshot } from '../../src/core/task-types.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRefForAttempt,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
} from '../../src/core/task-result-settlement.js';
import { TaskStatus } from '../../src/core/types.js';

const docker: ResolvedFinalOnlyUsageExecutor = {
  executor: 'docker', finalOnlyUsageContainment: 'wall-clock',
};

function projection(): {
  budget: Readonly<{ maxTurns: number }>;
  budgetPolicy: Readonly<TaskExecutionBudgetPolicySnapshot>;
} {
  const budget = { maxTurns: 1 };
  const finalOnlyUsage = Object.freeze({
    maxWallClockSeconds: 60,
    profileRef: 'execution_budget.final_only_usage',
    policyDigest: 'a'.repeat(64),
  });
  return {
    budget,
    budgetPolicy: Object.freeze({
      state: 'allow',
      role: 'worker',
      resolvedProvider: 'codex',
      executionCostClass: 'remote',
      profileRef: 'tests.cli.spawn-final-only-parity',
      policyDigest: 'a'.repeat(64),
      admissionMode: 'unattended',
      finalOnlyUsage,
    }),
  };
}

function decide(
  input: Partial<Parameters<typeof resolveFinalOnlyUsageContainment>[0]> = {},
) {
  const immutable = projection();
  return resolveFinalOnlyUsageContainment({
    role: 'worker',
    provider: 'codex',
    providerCommand: { liveUsage: 'final-only' },
    executor: docker,
    budget: immutable.budget,
    budgetPolicy: immutable.budgetPolicy,
    ...input,
  });
}

describe('FO07 final-only manual/sprint canonical-projection parity', () => {
  it('returns the same exact task-stamped grant for both ingress families', () => {
    const immutable = projection();
    const ingress = () => resolveFinalOnlyUsageContainment({
      role: immutable.budgetPolicy.role,
      provider: immutable.budgetPolicy.resolvedProvider,
      providerCommand: { liveUsage: 'final-only' },
      executor: docker,
      budget: immutable.budget,
      budgetPolicy: immutable.budgetPolicy,
    });

    const manual = ingress();
    const sprint = ingress();
    expect(manual).toEqual(sprint);
    expect(manual).toEqual({ state: 'grant', grant: immutable.budgetPolicy.finalOnlyUsage });
    if (manual.state === 'grant') expect(manual.grant).toBe(immutable.budgetPolicy.finalOnlyUsage);
  });

  it.each([
    ['missing grant', { budgetPolicy: { ...projection().budgetPolicy, finalOnlyUsage: undefined } }, 'owner-authorization-missing'],
    ['provider mismatch', { provider: 'gemini' }, 'task-provider-mismatch'],
    ['non-Docker executor', { executor: { executor: 'subprocess', finalOnlyUsageContainment: 'wall-clock' } as never }, 'executor-containment-unavailable'],
  ] as const)('fails closed equally for %s', (_name, overrides, reasonCode) => {
    const manual = decide(overrides);
    const sprint = decide(overrides);
    expect(manual).toEqual(sprint);
    expect(manual).toEqual({ state: 'hold', reasonCode });
  });

  it('resolves auto before containment and rejects its non-Docker platform result', () => {
    expect(resolveWorkerExecutionRoute('codex', {
      spawnBackend: 'auto', platform: 'linux', requiresImmutableSettlement: true,
    })).toBe('docker');
    expect(resolveWorkerExecutionRoute('codex', {
      spawnBackend: 'auto', platform: 'win32', requiresImmutableSettlement: true,
    })).toBe('subprocess');
    expect(decide()).toMatchObject({ state: 'grant' });
    expect(decide({
      executor: { executor: 'subprocess', finalOnlyUsageContainment: 'wall-clock' } as never,
    })).toEqual({ state: 'hold', reasonCode: 'executor-containment-unavailable' });
  });
});

describe('FO07 immutable dispatch and settlement negative cases', () => {
  const originalHome = process.env.DECKENT_HOME;
  let base = '';

  afterEach(() => {
    if (originalHome === undefined) delete process.env.DECKENT_HOME;
    else process.env.DECKENT_HOME = originalHome;
    if (base) rmSync(base, { recursive: true, force: true });
    base = '';
  });

  it('makes replay settlement first-writer-only and rejects a stale foreign receipt', () => {
    base = mkdtempSync(join(tmpdir(), 'fo07-parity-'));
    process.env.DECKENT_HOME = join(base, 'host-state');
    const root = join(base, 'project');
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const taskId = '628-007-once';
    writeFileSync(join(root, '.tasks', `task-${taskId}.json`), JSON.stringify({ id: taskId, status: TaskStatus.EXECUTING }));

    const ref = createTaskResultSettlementRefForAttempt(root, taskId, '11111111-1111-4111-8111-111111111111');
    writeTaskResultSettlementAttemptAtomic(ref);
    expect(claimTaskResultSettlementAttemptAtomic(ref)).toBe('claimed');
    expect(claimTaskResultSettlementAttemptAtomic(ref)).toBe('adopted');
    const settled = createTaskResultSettlement({ ref, exitCode: 0, result: { taskId, selfAssessment: 'DONE' } });
    writeTaskResultSettlementAtomic(settled);
    expect(() => writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref, exitCode: 1, result: { taskId, selfAssessment: 'NO_GO' },
    }))).toThrow('Conflicting immutable Docker result settlement');

    const staleRef = createTaskResultSettlementRefForAttempt(root, 'other-task', '22222222-2222-4222-8222-222222222222');
    expect(() => finalizeTaskStatusFromSettlement(root, taskId, staleRef)).toThrow('does not match project/task authority');
    expect(JSON.parse(readFileSync(join(root, '.tasks', `task-${taskId}.json`), 'utf-8'))).toMatchObject({ status: TaskStatus.EXECUTING });
  });
});
