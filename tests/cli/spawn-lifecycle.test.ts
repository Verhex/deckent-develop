/**
 * tests/cli/spawn-lifecycle.test.ts — Task 268-003 (SPAWN-LIFECYCLE)
 *
 * 1. modelEffort pass-through: the manual paths (`deckent spawn` task-json,
 *    `deckent run --model-effort`) must reach resolveReasoningEffort and emit
 *    `reasoningEffort` in the backend spawn(...) opts — mirroring the sprint
 *    path (sprint-spawner.ts). Invalid/unsupported level → no flag emitted.
 * 2. Completion status finalize: when the worker's `.result` appears, the task
 *    JSON `status` is derived from selfAssessment (DONE/GO_WITH_TECH_DEBT →
 *    DONE, NO_GO → NO_GO — ADR-045 §1 mapping) so a later spawn cannot run a
 *    duplicate worker (267-004 live evidence).
 *
 * Hermetic: tmpdir fixtures, mocked spawn backends, no real subprocess/network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

// ─── Mocks (hoisted — only `state` from vi.hoisted may be referenced) ────────

const state = vi.hoisted(() => ({ base: '', root: '', executeTaskIngress: vi.fn() }));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => state.root,
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/core/config.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, loadConfig: vi.fn() };
});

vi.mock('../../src/orchestra/tmux.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, ensureSession: vi.fn(), spawnWorker: vi.fn() };
});

vi.mock('../../src/orchestra/spawn-backend.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, SpawnBackendFactory: { create: vi.fn() } };
});

vi.mock('../../src/orchestra/task-mode-runner.js', () => ({
  executeTaskIngress: state.executeTaskIngress,
  readTaskIngressErrorAuthority: (error: any) => error?.taskIngressAuthority,
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import {
  spawnWorkerMultiProvider,
  finalizeTaskStatusFromResult,
  registerSpawn,
} from '../../src/cli/commands/spawn.js';
import { registerRun } from '../../src/cli/commands/run.js';
import { SpawnBackendFactory } from '../../src/orchestra/spawn-backend.js';
import { spawnWorker } from '../../src/orchestra/tmux.js';
import { loadConfig } from '../../src/core/config.js';
import { TaskStatus } from '../../src/core/types.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementClosureAtomic,
  type TaskResultSettlementRefV1,
} from '../../src/core/task-result-settlement.js';
import { TEST_DOCKER_EXECUTION_OPTIONS } from '../helpers/budgeted-docker-execution-fixture.js';
import { resolveReasoningEffort } from '../../src/core/reasoning-effort.js';
import { print } from '../../src/cli/helpers/output.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTaskJson(taskId: string, overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: taskId,
    title: 'Lifecycle test task',
    description: 'Test description for spawn lifecycle',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-test',
    createdAt: new Date().toISOString(),
    budget: { maxTurns: 1 },
    budgetPolicy: {
      state: 'allow',
      role: 'worker',
      taskKind: 'code-development',
      resolvedProvider: 'claude',
      executionCostClass: 'remote',
      profileRef: 'tests.cli.spawn-lifecycle',
      policyDigest: 'a'.repeat(64),
      admissionMode: 'unattended',
      landingPolicy: { reserve_ratio: 0.25 },
    },
    ...overrides,
  };
}

function writeTaskJson(taskId: string, overrides?: Record<string, unknown>): void {
  writeFileSync(
    join(state.root, '.tasks', `task-${taskId}.json`),
    JSON.stringify(makeTaskJson(taskId, overrides), null, 2),
    'utf-8',
  );
}

function finalOnlyBudgetPolicy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    state: 'allow',
    role: 'worker',
    taskKind: 'code-development',
    resolvedProvider: 'codex',
    executionCostClass: 'remote',
    profileRef: 'tests.cli.spawn-lifecycle',
    policyDigest: 'a'.repeat(64),
    admissionMode: 'unattended',
    landingPolicy: { reserve_ratio: 0.25 },
    finalOnlyUsage: {
      maxWallClockSeconds: 60,
      profileRef: 'execution_budget.final_only_usage',
      policyDigest: 'a'.repeat(64),
    },
    ...overrides,
  };
}

function writeResult(taskId: string, selfAssessment: string): void {
  writeFileSync(
    join(state.root, '.tasks', `task-${taskId}.result`),
    JSON.stringify({
      taskId,
      filesChanged: [],
      testsPassed: selfAssessment !== 'NO_GO',
      selfAssessment,
      notes: 'test result',
      tokenUsage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, provider: 'claude', model: 'claude-sonnet-5' },
    }, null, 2),
    'utf-8',
  );
}

function settleResult(
  taskId: string,
  selfAssessment: string,
  opts: { settlementRef?: TaskResultSettlementRefV1 },
): void {
  writeResult(taskId, selfAssessment);
  if (!opts.settlementRef) return;
  const result = JSON.parse(
    readFileSync(join(state.root, '.tasks', `task-${taskId}.result`), 'utf-8'),
  );
  claimTaskResultSettlementAttemptAtomic(opts.settlementRef);
  writeTaskResultSettlementAtomic(createTaskResultSettlement({
    ref: opts.settlementRef,
    exitCode: 0,
    result,
  }));
  writeTaskResultSettlementClosureAtomic(opts.settlementRef, {
    containerDisposition: 'stopped-removed',
    locksReleased: true,
  });
}

function readTaskStatus(taskId: string): string {
  const raw = readFileSync(join(state.root, '.tasks', `task-${taskId}.json`), 'utf-8');
  return (JSON.parse(raw) as { status: string }).status;
}

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerSpawn(program);
  registerRun(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // commander exitOverride
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let backendSpawn: ReturnType<typeof vi.fn>;
const originalDeckentHome = process.env.DECKENT_HOME;

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  state.base = mkdtempSync(join(tmpdir(), 'spawn-lifecycle-'));
  state.root = join(state.base, 'project');
  mkdirSync(join(state.root, '.tasks'), { recursive: true });
  process.env.DECKENT_HOME = join(state.base, 'host-state');
  backendSpawn = vi.fn();
  vi.mocked(SpawnBackendFactory.create).mockReturnValue({
    name: 'docker',
    liveUsageBudgetSupport: 'measured-stream',
    executionLandingCapability: 'checkpoint-stop',
    spawn: backendSpawn,
  } as never);
  // routing_engine v1 → registerRun skips the V2 routing block (kept out of scope here)
  vi.mocked(loadConfig).mockResolvedValue({
    language: 'en',
    spawn_backend: 'docker',
    routing_engine: 'v1',
    execution_budget: {
      roles: { worker: { default: { maxTurns: 1 } } },
      landing: { reserve_ratio: 0.25 },
    },
  } as never);
  state.executeTaskIngress.mockImplementation(async (input: any) => {
    const finalOnlyUsage = input.task.budgetPolicy?.finalOnlyUsage;
    const backend = SpawnBackendFactory.create({
      backend: input.task.backend ?? input.config.spawn_backend,
      projectDir: input.projectRoot,
    }) as any;
    if (input.task.budgetPolicy?.executionCostClass === 'remote'
      && input.task.provider === 'codex') {
      if (!finalOnlyUsage || backend.name !== 'docker') {
        throw new Error('final-only usage containment requires Docker and an exact grant');
      }
    }
    const taskPath = join(input.projectRoot, '.tasks', `task-${input.task.id}.json`);
    try {
      readFileSync(taskPath, 'utf-8');
    } catch {
      writeFileSync(taskPath, JSON.stringify(input.task, null, 2), 'utf-8');
    }
    const invocation = {
      receiptRef: {
        schemaVersion: 1,
        invocationId: `test:${input.task.id}`,
        tenantId: 'local',
        projectId: 'test',
      },
      executionBackend: backend.name === 'docker' ? 'docker' : 'host-subprocess',
      transport: 'cli',
      state: 'dispatch-started',
      executionMode: 'legacy-non-docker',
      executionEvidenceRef: `test:${input.task.id}`,
      dispatchStartedAt: new Date().toISOString(),
    };
    await input.onDispatchBoundary?.({
      taskId: input.task.id,
      provider: input.task.provider ?? 'claude',
      model: input.task.model,
      backend: backend.name,
      executionEvidenceRef: invocation.executionEvidenceRef,
    }, invocation);
    backend.spawn(input.task.id, input.task.model, 'prompt', {
      projectDir: input.projectRoot,
      autoApprove: input.autoApprove,
      reasoningEffort: resolveReasoningEffort(
        input.task.provider ?? 'claude',
        input.task.modelEffort,
      ),
      ...(finalOnlyUsage ? { finalOnlyUsageContainment: finalOnlyUsage } : {}),
    });
    return {
      disposition: {
        kind: 'spawned',
        taskId: input.task.id,
        executionMode: 'legacy-non-docker',
        executionBackend: backend.name,
      },
      executionMode: 'legacy-non-docker',
      backend: backend.name,
      provider: input.task.provider ?? 'claude',
      invocation,
    };
  });
});

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  rmSync(state.base, { recursive: true, force: true });
  process.exitCode = undefined;
});

// ─── 1. spawnWorkerMultiProvider — modelEffort → reasoningEffort ─────────────

describe('spawnWorkerMultiProvider — modelEffort pass-through', () => {
  it('passes a valid claude level to the config backend spawn as reasoningEffort', async () => {
    await spawnWorkerMultiProvider('t-001', 'claude-sonnet-5', 'prompt', state.root, {
      spawnBackend: 'docker',
      modelEffort: 'high',
      ...TEST_DOCKER_EXECUTION_OPTIONS,
    });

    expect(backendSpawn).toHaveBeenCalledWith(
      't-001', 'claude-sonnet-5', 'prompt',
      expect.objectContaining({ reasoningEffort: 'high' }),
    );
  });

  it('does NOT emit reasoningEffort for an invalid level (resolveReasoningEffort gate)', async () => {
    await spawnWorkerMultiProvider('t-002', 'claude-sonnet-5', 'prompt', state.root, {
      spawnBackend: 'docker',
      modelEffort: 'turbo',
      ...TEST_DOCKER_EXECUTION_OPTIONS,
    });

    expect(backendSpawn).toHaveBeenCalledOnce();
    const opts = backendSpawn.mock.calls[0]?.[3] as { reasoningEffort?: string };
    expect(opts.reasoningEffort).toBeUndefined();
  });

  it('keeps opt-in semantics: no modelEffort → reasoningEffort undefined', async () => {
    await spawnWorkerMultiProvider('t-003', 'claude-sonnet-5', 'prompt', state.root, {
      spawnBackend: 'docker',
      ...TEST_DOCKER_EXECUTION_OPTIONS,
    });

    const opts = backendSpawn.mock.calls[0]?.[3] as { reasoningEffort?: string };
    expect(opts.reasoningEffort).toBeUndefined();
  });

  it('holds the unmetered tmux fallback before provider work', async () => {
    await expect(spawnWorkerMultiProvider('t-004', 'claude-sonnet-5', 'prompt', state.root, {
      modelEffort: 'max',
      executionBudget: { maxTurns: 1 },
    })).rejects.toThrow(/requires measured streaming usage/);

    expect(spawnWorker).not.toHaveBeenCalled();
  });
});

// ─── 2. registerSpawn — task.modelEffort from the task JSON reaches spawn ────

describe('registerSpawn — task-json modelEffort path', () => {
  it('forwards task.modelEffort from the task JSON to the backend spawn', async () => {
    writeTaskJson('268-901', { modelEffort: 'high' });

    await runCommand(['spawn', '268-901']);

    expect(backendSpawn).toHaveBeenCalledOnce();
    const opts = backendSpawn.mock.calls[0]?.[3] as { reasoningEffort?: string };
    expect(opts.reasoningEffort).toBe('high');
  });

  it('emits no reasoningEffort when the task JSON has an invalid modelEffort', async () => {
    writeTaskJson('268-902', { modelEffort: 'ultra-mega' });

    await runCommand(['spawn', '268-902']);

    expect(backendSpawn).toHaveBeenCalledOnce();
    const opts = backendSpawn.mock.calls[0]?.[3] as { reasoningEffort?: string };
    expect(opts.reasoningEffort).toBeUndefined();
  });

  it('retains the invocation receipt when common ingress throws before dispatch', async () => {
    writeTaskJson('268-903');
    const error = new Error('provider authority unavailable') as Error & Record<string, unknown>;
    error.taskIngressAuthority = {
      schemaVersion: 1,
      reasonCode: 'PROVIDER_EXECUTION_AUTHORITY_HOLD',
      invocation: {
        receiptRef: {
          schemaVersion: 1,
          invocationId: 'zero:manual-spawn-hold',
          tenantId: 'local',
          projectId: 'test',
        },
        executionBackend: 'docker',
        transport: 'cli',
        state: 'not-dispatched',
        executionMode: 'normal-docker-exact',
        reasonCode: 'PROVIDER_EXECUTION_AUTHORITY_HOLD',
      },
    };
    state.executeTaskIngress.mockRejectedValueOnce(error);

    await runCommand(['spawn', '268-903']);

    expect(backendSpawn).not.toHaveBeenCalled();
    expect(vi.mocked(print)).toHaveBeenCalledWith(
      expect.stringContaining('zero:manual-spawn-hold'),
    );
    expect(process.exitCode).toBe(1);
  });
});


// ─── 3. registerSpawn — final-only containment ───────────────────────────────

describe('registerSpawn — final-only containment', () => {
  it('rejects forced exact respawn until a new generation identity is available', async () => {
    writeTaskJson('628-005-valid', {
      model: 'gpt-4.1',
      provider: 'codex',
      status: TaskStatus.NO_GO,
      budgetPolicy: finalOnlyBudgetPolicy(),
    });

    await runCommand(['spawn', '628-005-valid', '--force']);

    expect(backendSpawn).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('fails closed before provider work when a final-only task has no grant', async () => {
    writeTaskJson('628-005-missing', {
      model: 'gpt-4.1',
      provider: 'codex',
      budgetPolicy: finalOnlyBudgetPolicy({ finalOnlyUsage: undefined }),
    });

    await runCommand(['spawn', '628-005-missing']);

    expect(backendSpawn).not.toHaveBeenCalled();
  });

  it('fails closed before provider work when a final-only grant resolves to non-Docker', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ language: 'en', spawn_backend: 'subprocess' } as never);
    vi.mocked(SpawnBackendFactory.create).mockReturnValue({
      name: 'subprocess',
      liveUsageBudgetSupport: 'measured-stream',
      executionLandingCapability: 'checkpoint-stop',
      spawn: backendSpawn,
    } as never);
    writeTaskJson('628-005-nondocker', {
      model: 'gpt-4.1',
      provider: 'codex',
      budgetPolicy: finalOnlyBudgetPolicy(),
    });

    await runCommand(['spawn', '628-005-nondocker']);

    expect(backendSpawn).not.toHaveBeenCalled();
  });
});

// ─── 3. registerRun — --model-effort flag path ────────────────────────────────

describe('registerRun — --model-effort flag path', () => {
  it('forwards --model-effort through buildExecutionRequest to the backend spawn', async () => {
    // Simulate a blocking-style worker: write the result during spawn so the
    // run command returns immediately (no timeout wait).
    backendSpawn.mockImplementation((taskId: string, _model: string, _prompt: string, opts: { settlementRef?: TaskResultSettlementRefV1 }) => {
      settleResult(taskId, 'DONE', opts);
    });

    await runCommand(['run', 'do a thing', '--model', 'claude-sonnet-5', '--model-effort', 'high', '--scope', 'src/', '--timeout', '3000']);

    expect(backendSpawn).toHaveBeenCalledOnce();
    const opts = backendSpawn.mock.calls[0]?.[3] as { reasoningEffort?: string };
    expect(opts.reasoningEffort).toBe('high');
  });

  it('emits no reasoningEffort for an invalid --model-effort level', async () => {
    backendSpawn.mockImplementation((taskId: string, _model: string, _prompt: string, opts: { settlementRef?: TaskResultSettlementRefV1 }) => {
      settleResult(taskId, 'DONE', opts);
    });

    await runCommand(['run', 'do a thing', '--model', 'claude-sonnet-5', '--model-effort', 'turbo', '--scope', 'src/', '--timeout', '3000']);

    expect(backendSpawn).toHaveBeenCalledOnce();
    const opts = backendSpawn.mock.calls[0]?.[3] as { reasoningEffort?: string };
    expect(opts.reasoningEffort).toBeUndefined();
  });
});

// ─── 4. finalizeTaskStatusFromResult — selfAssessment → status mapping ───────

describe('finalizeTaskStatusFromResult — status derivation', () => {
  it('DONE result → task JSON status DONE', () => {
    writeTaskJson('268-911', { status: TaskStatus.EXECUTING });
    writeResult('268-911', 'DONE');

    const finalized = finalizeTaskStatusFromResult(state.root, '268-911');

    expect(finalized).toBe(TaskStatus.DONE);
    expect(readTaskStatus('268-911')).toBe('DONE');
  });

  it('GO_WITH_TECH_DEBT result → task JSON status DONE (ADR-045 §1 mapping)', () => {
    writeTaskJson('268-912', { status: TaskStatus.EXECUTING });
    writeResult('268-912', 'GO_WITH_TECH_DEBT');

    const finalized = finalizeTaskStatusFromResult(state.root, '268-912');

    expect(finalized).toBe(TaskStatus.DONE);
    expect(readTaskStatus('268-912')).toBe('DONE');
  });

  it('NO_GO result → task JSON status NO_GO', () => {
    writeTaskJson('268-913', { status: TaskStatus.EXECUTING });
    writeResult('268-913', 'NO_GO');

    const finalized = finalizeTaskStatusFromResult(state.root, '268-913');

    expect(finalized).toBe(TaskStatus.NO_GO);
    expect(readTaskStatus('268-913')).toBe('NO_GO');
  });

  it('missing result file → null, task JSON untouched', () => {
    writeTaskJson('268-914', { status: TaskStatus.EXECUTING });

    const finalized = finalizeTaskStatusFromResult(state.root, '268-914');

    expect(finalized).toBeNull();
    expect(readTaskStatus('268-914')).toBe('EXECUTING');
  });

  it('unknown selfAssessment → null, task JSON untouched', () => {
    writeTaskJson('268-915', { status: TaskStatus.EXECUTING });
    writeResult('268-915', 'MAYBE_LATER');

    const finalized = finalizeTaskStatusFromResult(state.root, '268-915');

    expect(finalized).toBeNull();
    expect(readTaskStatus('268-915')).toBe('EXECUTING');
  });
});

// ─── 5. registerSpawn — completion finalize (blocking-backend shape) ─────────

describe('registerSpawn — status finalize when .result appears', () => {
  it('finalizes task JSON to DONE when the worker result is DONE', async () => {
    writeTaskJson('268-921');
    // Blocking-style backend (docker): result exists by the time spawn returns.
    backendSpawn.mockImplementation((taskId: string, _model: string, _prompt: string, opts: { settlementRef?: TaskResultSettlementRefV1 }) => {
      settleResult(taskId, 'DONE', opts);
    });

    await runCommand(['spawn', '268-921']);

    expect(readTaskStatus('268-921')).toBe('DONE');
  });

  it('finalizes task JSON to NO_GO when the worker result is NO_GO', async () => {
    writeTaskJson('268-922');
    backendSpawn.mockImplementation((taskId: string, _model: string, _prompt: string, opts: { settlementRef?: TaskResultSettlementRefV1 }) => {
      settleResult(taskId, 'NO_GO', opts);
    });

    await runCommand(['spawn', '268-922']);

    expect(readTaskStatus('268-922')).toBe('NO_GO');
  });

  it('ignores a STALE pre-spawn result on --force respawn (mtime guard)', async () => {
    // Old run failed (NO_GO) and left its result behind; the new spawn writes
    // nothing — the stale DONE-less result must NOT flip the status.
    writeTaskJson('268-923', { status: TaskStatus.NO_GO });
    writeResult('268-923', 'DONE'); // stale artifact from a previous run
    vi.mocked(loadConfig).mockResolvedValue({
      language: 'en',
      spawn_backend: 'subprocess',
      execution_budget: {
        roles: { worker: { default: { maxTurns: 1 } } },
        landing: { reserve_ratio: 0.25 },
      },
    } as never);
    vi.mocked(SpawnBackendFactory.create).mockReturnValue({
      name: 'subprocess',
      liveUsageBudgetSupport: 'measured-stream',
      executionLandingCapability: 'cooperative-landing',
      spawn: backendSpawn,
    } as never);
    backendSpawn.mockImplementation(() => { /* new worker still running */ });

    await runCommand(['spawn', '268-923', '--force']);

    expect(backendSpawn).toHaveBeenCalledOnce();
    // Stale result not applied: status remains NO_GO, not flipped to DONE.
    expect(readTaskStatus('268-923')).toBe('NO_GO');
  });
});
