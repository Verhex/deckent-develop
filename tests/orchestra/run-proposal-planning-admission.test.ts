import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callZeroConfigPlannerWithReason: vi.fn(),
  preflightPlanningExecutionAuthority: vi.fn(),
}));

vi.mock('../../src/core/config.js', () => ({
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
  resolveBrainModel: vi.fn(() => 'claude-sonnet-5'),
  resolveDefaultModel: vi.fn(() => 'claude-sonnet-5'),
}));

vi.mock('../../src/orchestra/planner.js', () => ({
  callZeroConfigPlannerWithReason: mocks.callZeroConfigPlannerWithReason,
  createPlannerTaskModelPolicy: vi.fn((defaultModel: string) => ({
    defaultModel,
    allowedModels: [defaultModel],
  })),
  resolvePlanTimeoutMs: vi.fn(() => 900_000),
}));

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  preflightPlanningExecutionAuthority: mocks.preflightPlanningExecutionAuthority,
}));

import { TaskAttemptCustodyHold } from '../../src/core/task-attempt-custody-store.js';
import type { RunProposal } from '../../src/core/run-flow-contract.js';
import type { ResolvedConfig } from '../../src/core/types.js';
import {
  compileRunProposalIntent,
  RunProposalPlanError,
} from '../../src/orchestra/run-proposal-compiler.js';
import { derivePlannerPlanContract } from '../../src/orchestra/planner-plan-contract.js';

function proposal(): RunProposal {
  return {
    flowId: 'flow-admission-1',
    tenant: 'local',
    project: 'canary',
    actor: { id: 'owner' },
    origin: 'cli',
    revision: 1,
    intentSummary: 'Write the bounded canary result',
  };
}

function config(): ResolvedConfig {
  return {
    spawn_backend: 'docker',
    brain_provider: 'claude',
    worker_provider: 'claude',
  } as ResolvedConfig;
}

const planContract = derivePlannerPlanContract({
  mode: 'closed-allowlist',
  filesWrite: ['docs/CANARY-RESULT.md'],
});

describe('run proposal planning admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preflightPlanningExecutionAuthority.mockReturnValue({
      state: 'ready',
      backend: 'docker',
      authorityKind: 'exact-docker-custody-root',
    });
    mocks.callZeroConfigPlannerWithReason.mockResolvedValue({
      ok: true,
      data: {
        reasoning: 'atomic',
        tasks: [{
        title: 'Write result',
        description: 'Write docs/CANARY-RESULT.md.',
        model: 'claude-sonnet-5',
        effort: 'normal',
        priority: 'NORMAL',
        reason: 'bounded',
        scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/CANARY-RESULT.md'] },
        dependencies: [],
        goNogo: {
          goCriteria: 'docs/CANARY-RESULT.md contains the result.',
          noGoCriteria: 'docs/CANARY-RESULT.md is unchanged.',
          techDebtAcceptable: 'none',
        },
        }],
      },
      receiptRef: {
        schemaVersion: 1,
        tenantId: 'local',
        projectId: 'project-safe',
        invocationId: 'inv-safe-1',
      },
    });
  });

  it('proves effective Docker custody before invoking the external planner', async () => {
    const root = process.cwd();
    await compileRunProposalIntent(proposal(), undefined, config(), { projectRoot: root, planContract });

    expect(mocks.preflightPlanningExecutionAuthority).toHaveBeenCalledWith({
      projectRoot: root,
      backend: 'docker',
    });
    expect(mocks.preflightPlanningExecutionAuthority.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.callZeroConfigPlannerWithReason.mock.invocationCallOrder[0]!,
    );
    expect(mocks.callZeroConfigPlannerWithReason.mock.calls[0]?.[9]).toEqual(planContract);
  });

  it('surfaces a typed non-retryable HOLD and spends zero provider calls when custody is unsafe', async () => {
    mocks.preflightPlanningExecutionAuthority.mockImplementation(() => {
      throw new TaskAttemptCustodyHold('HOST_ROOT_INSIDE_PROJECT', 'open-root');
    });

    let caught: unknown;
    try {
      await compileRunProposalIntent(proposal(), undefined, config(), {
        projectRoot: process.cwd(),
        planContract,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RunProposalPlanError);
    expect(caught).toMatchObject({
      code: 'EXECUTION_ADMISSION_HOLD',
      reasonCode: 'TASK_ATTEMPT_CUSTODY_HOLD:HOST_ROOT_INSIDE_PROJECT',
      retryable: false,
    });
    expect(mocks.callZeroConfigPlannerWithReason).not.toHaveBeenCalled();
  });

  it('transports bounded recovery identities without retrying or invoking the planner', async () => {
    mocks.preflightPlanningExecutionAuthority.mockImplementation(() => {
      throw Object.freeze({
        code: 'EXACT_CUSTODY_RECOVERY_REQUIRED',
        unresolved: Object.freeze([{
          taskId: '714-001',
          dispatchRequestId: `dreq-${'1'.repeat(64)}`,
          reasonCode: 'ADMISSION_RECONCILIATION_REQUIRED',
          custodyHoldCode: null,
        }]),
        recoveryListReceiptDigest: `sha256:${'2'.repeat(64)}`,
      });
    });

    let caught: unknown;
    try {
      await compileRunProposalIntent(proposal(), undefined, config(), {
        projectRoot: process.cwd(),
        planContract,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: 'EXECUTION_ADMISSION_HOLD',
      reasonCode: 'EXACT_CUSTODY_RECOVERY_REQUIRED',
      retryable: false,
    });
    expect((caught as Error).message).toContain(
      '714-001:ADMISSION_RECONCILIATION_REQUIRED',
    );
    expect((caught as Error).message).not.toContain(`dreq-${'1'.repeat(64)}`);
    expect(mocks.callZeroConfigPlannerWithReason).not.toHaveBeenCalled();
  });

  it('preserves a secret-safe typed planner terminal reason and receipt through compilation', async () => {
    mocks.callZeroConfigPlannerWithReason.mockResolvedValue({
        ok: false,
        reason: 'validation_failed',
        message: 'schema violations at tasks.0.effort:invalid_value',
        receiptRef: {
          schemaVersion: 1,
          tenantId: 'local',
          projectId: 'project-safe',
          invocationId: 'inv-safe-1',
        },
        evidence: {
          provider: 'claude',
          model: 'claude-sonnet-5',
          parserStage: 'planner-schema',
        },
    });

    let caught: unknown;
    try {
      await compileRunProposalIntent(proposal(), undefined, config(), {
        projectRoot: process.cwd(),
        planContract,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RunProposalPlanError);
    expect(caught).toMatchObject({
      code: 'PLAN_UNAVAILABLE',
      reasonCode: 'validation_failed',
      retryable: false,
      receiptId: 'inv-safe-1',
      safeDetail: 'schema violations at tasks.0.effort:invalid_value',
    });
    expect((caught as Error).message).not.toContain('provider unavailable');
  });
});
