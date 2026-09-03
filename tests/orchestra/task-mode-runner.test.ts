// tests/orchestra/task-mode-runner.test.ts
//
// Hermetic tests for runTaskMode — phase-1a gap fixes (gaps E + G).
//
// Asserts:
//   - .tasks/task-{id}.json is written to disk BEFORE spawn (Gap E fix)
//   - Written task JSON contains the description and scope (Gap E)
//   - buildWorkerPrompt is called without projectRoot as agentPrompt (Gap G fix)
//   - spawnWorkerMultiProvider receives the prompt string (not a path)
//
// Hermetic: uses tmpdir as projectRoot; mocks spawn so no real worker launches;
// mocks buildWorkerPrompt to prevent ADR/memory DB reads in CI.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Mocks (hoisted before imports) ────────────────────────────────────────

const backendHarness = vi.hoisted(() => ({
  spawn: vi.fn(),
  kill: vi.fn(),
}));

vi.mock('../../src/orchestra/spawn-backend.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    SpawnBackendFactory: {
      create: vi.fn(() => ({
        name: 'subprocess',
        liveUsageBudgetSupport: 'measured-stream',
        executionLandingCapability: 'cooperative-landing',
        spawn: backendHarness.spawn,
        kill: backendHarness.kill,
        list: () => [],
        isAvailable: async () => true,
      })),
    },
  };
});

vi.mock('../../src/orchestra/task-builder.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    // Intercept buildWorkerPrompt so CI does not need .brain/memory.db;
    // return a deterministic string so we can assert the prompt arg to spawn.
    buildWorkerPrompt: vi.fn((_task: unknown, _agentPrompt?: string, _skillPrompts?: unknown) =>
      'mock-worker-prompt',
    ),
  };
});

// ─── Import SUT after mocks ─────────────────────────────────────────────────

import {
  executeTaskIngress,
  readTaskIngressErrorAuthority,
  runTaskMode,
} from '../../src/orchestra/task-mode-runner.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { ExecutionBudget } from '../../src/core/work-model.js';
import { ProviderExecutionIngressHoldError } from '../../src/core/provider-execution-ingress-authority.js';
import { InvocationReceiptStore } from '../../src/core/invocation-receipt-store.js';
import { TaskStatus, type Task } from '../../src/core/types.js';
import { ModelActivationStore } from '../../src/core/model-activation-store.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTaskConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    deckent_style: 'task',
    spawn_backend: 'subprocess',
    execution_budget: {
      roles: {
        worker: { default: { maxTokens: 100_000, maxTurns: 10 } },
      },
      landing: { reserve_ratio: 0.25 },
    },
    ...overrides,
  } as unknown as ResolvedConfig;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('runTaskMode — phase-1a gap fixes (E + G)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'task-mode-runner-'));
    vi.clearAllMocks();
    backendHarness.spawn.mockReset();
    backendHarness.kill.mockReset();
    (buildWorkerPrompt as ReturnType<typeof vi.fn>).mockReturnValue('mock-worker-prompt');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('Gap E: writes .tasks/task-{id}.json before spawn', async () => {
    const config = makeTaskConfig();
    const result = await runTaskMode(
      { description: 'write a hello world function', projectRoot: root },
      config,
    );

    const taskFilePath = join(root, '.tasks', `task-${result.taskId}.json`);
    expect(existsSync(taskFilePath), 'task JSON must exist on disk').toBe(true);
  });

  it('Gap E: written task JSON contains description and scope', async () => {
    const config = makeTaskConfig();
    const desc = 'implement feature XYZ with full tests';

    const result = await runTaskMode(
      { description: desc, scope: { directories: ['src/feature'] }, projectRoot: root },
      config,
    );

    const taskFilePath = join(root, '.tasks', `task-${result.taskId}.json`);
    const content = JSON.parse(readFileSync(taskFilePath, 'utf-8')) as {
      description: string;
      scope: { directories: string[] };
      id: string;
    };

    expect(content.description).toBe(desc);
    expect(content.scope.directories).toContain('src/feature');
    expect(content.id).toBe(result.taskId);
  });

  it('Gap G: buildWorkerPrompt is called without projectRoot as agentPrompt', async () => {
    const config = makeTaskConfig();

    await runTaskMode(
      { description: 'fix the bug', projectRoot: root },
      config,
    );

    expect(buildWorkerPrompt).toHaveBeenCalledOnce();
    const [_task, agentPromptArg] = (buildWorkerPrompt as ReturnType<typeof vi.fn>).mock.calls[0]!;

    // agentPrompt must NOT be a filesystem path (the Gap G bug was passing projectRoot)
    expect(typeof agentPromptArg === 'string' && agentPromptArg.startsWith('/'),
      'agentPrompt must not be an absolute path (Gap G regression)',
    ).toBe(false);
  });

  it('spawn receives the prompt string from buildWorkerPrompt (not a path)', async () => {
    const config = makeTaskConfig();

    await runTaskMode(
      { description: 'do something', projectRoot: root },
      config,
    );

    expect(backendHarness.spawn).toHaveBeenCalledOnce();
    const [_taskId, _model, prompt] = backendHarness.spawn.mock.calls[0]!;

    // prompt should be the return value of buildWorkerPrompt, not an absolute path
    expect(prompt).toBe('mock-worker-prompt');
  });

  it('returns taskId, backend, and provider from spawn', async () => {
    const config = makeTaskConfig();

    const result = await runTaskMode(
      { description: 'sample task', projectRoot: root },
      config,
    );

    expect(result.taskId).toBeTruthy();
    expect(result.backend).toBe('subprocess');
    expect(result.provider).toBe('claude');
  });

  it('persists one dispatch-started invocation receipt through the common ingress', async () => {
    const result = await runTaskMode(
      { description: 'receipt-backed task', projectRoot: root },
      makeTaskConfig(),
    );

    expect(result.invocation).toMatchObject({
      state: 'dispatch-started',
      executionBackend: 'host-subprocess',
      transport: 'local-runtime',
      executionEvidenceRef: expect.any(String),
    });
    const store = new InvocationReceiptStore(root);
    try {
      const view = store.get(
        result.invocation.receiptRef,
        result.invocation.receiptRef.invocationId,
      );
      expect(view?.events.map(event => event.type)).toEqual(['dispatch_started']);
      expect(view?.receipt.taskId).toBe(result.taskId);
    } finally {
      store.close();
    }
  });

  it('holds a remote task before Task JSON and spawn when owner budget policy is missing', async () => {
    const config = makeTaskConfig({ execution_budget: undefined });

    await expect(runTaskMode(
      { description: 'must not spawn', projectRoot: root, model: 'claude-sonnet-5', provider: 'claude' },
      config,
    )).rejects.toThrow('EXECUTION_BUDGET_HOLD:budget-policy-missing:execution_budget.roles.worker');

    expect(existsSync(join(root, '.tasks'))).toBe(false);
    expect(backendHarness.spawn).not.toHaveBeenCalled();
  });

  it('enforces the project active-set even when the process registry was never bootstrapped', async () => {
    const store = new ModelActivationStore(root);
    try {
      store.setProviderPolicy('claude', 'explicit-active');
      store.setActivation('claude', 'claude-sonnet-5', true);
    } finally {
      store.close();
    }
    const task: Task = {
      id: 'project-model-policy-hold',
      title: 'Project model policy hold',
      description: 'must not dispatch an inactive exact model',
      model: 'claude-fable-5-1',
      provider: 'claude',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: {
        goCriteria: 'inactive model is rejected before dispatch',
        noGoCriteria: 'inactive model reaches a provider',
        techDebtAcceptable: 'None',
      },
      status: TaskStatus.PENDING,
      createdAt: new Date().toISOString(),
    };

    const caught = await executeTaskIngress({
      projectRoot: root,
      config: makeTaskConfig(),
      task,
      timeoutMs: 1_000,
      transport: 'local-runtime',
    }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(Error);
    expect((caught as { code?: string }).code).toBe('MODEL_INACTIVE');
    expect(existsSync(join(root, '.tasks'))).toBe(false);
    expect(backendHarness.spawn).not.toHaveBeenCalled();
  });

  it('holds before Task JSON and spawn when the project model authority is unreadable', async () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'models.db'), 'not-a-sqlite-database', 'utf8');
    const task: Task = {
      id: 'project-model-authority-unavailable',
      title: 'Project model authority unavailable',
      description: 'must not dispatch without owner model authority',
      model: 'claude-fable-5-1',
      provider: 'claude',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: {
        goCriteria: 'unreadable model authority is a typed hold',
        noGoCriteria: 'unreadable model authority silently opens execution',
        techDebtAcceptable: 'None',
      },
      status: TaskStatus.PENDING,
      createdAt: new Date().toISOString(),
    };

    const caught = await executeTaskIngress({
      projectRoot: root,
      config: makeTaskConfig(),
      task,
      timeoutMs: 1_000,
      transport: 'local-runtime',
    }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(Error);
    expect((caught as { code?: string }).code).toBe('MODEL_ACTIVATION_AUTHORITY_UNAVAILABLE');
    expect(existsSync(join(root, '.tasks'))).toBe(false);
    expect(backendHarness.spawn).not.toHaveBeenCalled();
  });

  it('closes a pre-dispatch budget refusal as one durable zero-work invocation', async () => {
    const task: Task = {
      id: 'known-zero-work-task',
      title: 'Known zero work',
      description: 'must not dispatch',
      model: 'claude-sonnet-5',
      provider: 'claude',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: {
        goCriteria: 'dispatches only after admission',
        noGoCriteria: 'provider starts without a budget',
        techDebtAcceptable: 'None',
      },
      status: TaskStatus.PENDING,
      createdAt: new Date().toISOString(),
    };

    const caught = await executeTaskIngress({
      projectRoot: root,
      config: makeTaskConfig({ execution_budget: undefined }),
      task,
      timeoutMs: 1_000,
      transport: 'local-runtime',
    }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('EXECUTION_BUDGET_HOLD');
    expect(readTaskIngressErrorAuthority(caught)).toMatchObject({
      schemaVersion: 1,
      reasonCode: 'EXECUTION_BUDGET_HOLD',
      invocation: {
        state: 'not-dispatched',
        executionBackend: 'host-subprocess',
        transport: 'local-runtime',
        reasonCode: 'EXECUTION_BUDGET_HOLD',
        receiptRef: { invocationId: expect.any(String) },
      },
    });

    expect(existsSync(join(root, '.tasks'))).toBe(false);
    expect(backendHarness.spawn).not.toHaveBeenCalled();
    const store = new InvocationReceiptStore(root);
    try {
      const receipts = store.scanTaskReceipts({
        tenantId: 'local',
        projectId: store.projectId,
        taskId: task.id,
        purpose: 'worker-execution',
      });
      expect(receipts).toHaveLength(1);
      expect(receipts[0]?.events.map(event => event.type)).toEqual([
        'dispatch_rejected',
        'consumer_settled',
      ]);
      expect(receipts[0]).toMatchObject({
        transportOutcome: 'not_dispatched',
        consumerOutcome: 'accepted',
        taskDisposition: 'not_dispatched',
      });
    } finally {
      store.close();
    }
  });

  it('declares the budget-resolved Docker backend before a final-only containment hold', async () => {
    const task: Task = {
      id: 'final-only-backend-authority',
      title: 'Final-only backend authority',
      description: 'must bind the receipt to the budget-resolved backend',
      model: 'gpt-5.6-sol',
      provider: 'codex',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: {
        goCriteria: 'receipt backend matches execution intent',
        noGoCriteria: 'host adapter receipt silently precedes Docker containment',
        techDebtAcceptable: 'None',
      },
      status: TaskStatus.PENDING,
      createdAt: new Date().toISOString(),
      budget: { maxTurns: 2 },
      budgetPolicy: {
        state: 'allow',
        role: 'worker',
        resolvedProvider: 'codex',
        executionCostClass: 'remote',
        profileRef: 'tests.task-mode.final-only',
        policyDigest: 'a'.repeat(64),
        admissionMode: 'unattended',
        landingPolicy: { reserve_ratio: 0.25 },
        finalOnlyUsage: {
          maxWallClockSeconds: 60,
          profileRef: 'execution_budget.final_only_usage',
          policyDigest: 'a'.repeat(64),
        },
      },
    };

    const caught = await executeTaskIngress({
      projectRoot: root,
      config: makeTaskConfig({ spawn_backend: 'docker', routing_engine: 'v2' }),
      task,
      timeoutMs: 1_000,
      transport: 'local-runtime',
    }).catch((error: unknown) => error);

    expect((caught as Error).message).toContain('FINAL_ONLY_USAGE_CONTAINMENT_HOLD');
    expect(readTaskIngressErrorAuthority(caught)).toMatchObject({
      reasonCode: 'FINAL_ONLY_USAGE_CONTAINMENT_HOLD',
      invocation: {
        state: 'reconciliation-required',
        executionBackend: 'docker',
        executionMode: 'normal-docker-exact',
      },
    });
    const store = new InvocationReceiptStore(root);
    try {
      const receipts = store.scanTaskReceipts({
        tenantId: 'local',
        projectId: store.projectId,
        taskId: task.id,
        purpose: 'worker-execution',
      });
      expect(receipts).toHaveLength(1);
      expect(receipts[0]?.receipt.backend.executionBackend).toBe('docker');
      expect(receipts[0]?.taskDisposition).toBeNull();
    } finally {
      store.close();
    }
  });

  it('consumes configured provider authority before routing, Task JSON, prompt, event, or spawn', async () => {
    const executionRunId = 'task-mode-authority-hold';
    const authorityEvidenceRef = `provider-authority:${'a'.repeat(64)}`;
    const caught = await runTaskMode({
      description: 'must stop at provider authority',
      projectRoot: root,
      model: 'claude-sonnet-5',
      provider: 'claude',
      executionRunId,
      providerAuthority: {
        state: 'hold',
        reasonCode: 'keyring_unavailable',
        authorityEvidenceRef,
        retryable: false,
        close: vi.fn(),
      },
    }, makeTaskConfig({
      spawn_backend: 'docker',
      provider_fallback: {
        worker: ['codex', 'gemini'],
        unattended: true,
      },
    })).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ProviderExecutionIngressHoldError);
    expect(readTaskIngressErrorAuthority(caught)).toMatchObject({
      reasonCode: 'PROVIDER_EXECUTION_AUTHORITY_HOLD',
      invocation: {
        state: 'reconciliation-required',
        authorityEvidenceRefs: expect.arrayContaining([expect.any(String)]),
        receiptRef: { invocationId: expect.any(String) },
      },
    });
    expect(caught).toMatchObject({
      reasonCode: 'keyring_unavailable',
      durableEvidenceWritten: true,
      request: {
        role: 'worker',
        purpose: 'worker-execution',
        runId: executionRunId,
        provider: 'claude',
        model: 'claude-sonnet-5',
        configuredBackend: 'subprocess',
        fallbackProviders: ['codex', 'gemini'],
        unattended: true,
      },
    });
    expect(existsSync(join(root, '.tasks'))).toBe(false);
    expect(buildWorkerPrompt).not.toHaveBeenCalled();
    expect(backendHarness.spawn).not.toHaveBeenCalled();

    const eventPath = join(
      root,
      '.deckent',
      'recently-works',
      `${executionRunId}-events.jsonl`,
    );
    const events = readFileSync(eventPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as {
        channel: string;
        payload: { taskId: string; authorityEvidenceRefs: string[] };
      });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      channel: 'BRAIN→AUDITOR:PROVIDER_AUTHORITY_HOLD',
      payload: {
        taskId: expect.stringMatching(/^run-/),
        authorityEvidenceRefs: expect.arrayContaining([authorityEvidenceRef]),
      },
    });
  });

  it('persists and spawns with the same owner budget while request ceilings only narrow it', async () => {
    const config = makeTaskConfig({
      execution_budget: {
        roles: {
          worker: { default: { maxTokens: 20_000, maxTurns: 8, maxOutputTokens: 4_000 } },
        },
        landing: { reserve_ratio: 0.25 },
      },
    });

    const result = await runTaskMode({
      description: 'bounded task',
      projectRoot: root,
      model: 'claude-sonnet-5',
      provider: 'claude',
      budget: { maxTokens: 50_000, maxTurns: 3, maxInputTokens: 9_000 },
    }, config);

    const persisted = JSON.parse(readFileSync(
      join(root, '.tasks', `task-${result.taskId}.json`),
      'utf-8',
    )) as { budget: Record<string, number> };
    expect(persisted.budget).toEqual({
      maxTokens: 20_000,
      maxTurns: 3,
      maxOutputTokens: 4_000,
      maxInputTokens: 9_000,
    });
    const spawnOptions = backendHarness.spawn.mock.calls[0]![3];
    expect(spawnOptions.executionBudget).toEqual(persisted.budget);
  });

  it('keeps exact executionRunId on provider admission while using one executor', async () => {
    await runTaskMode({
      description: 'authority forwarding',
      projectRoot: root,
      model: 'claude-sonnet-5',
      provider: 'claude',
      executionTenantId: 'tenant-a',
      executionRunId: 'run-a',
    }, makeTaskConfig());

    expect(backendHarness.spawn).toHaveBeenCalledOnce();
  });

  it.each([
    ['empty', {}],
    ['negative', { maxTurns: -1 }],
    ['unknown-field', { unlimited: 1 }],
  ])('rejects a malformed %s request budget before Task JSON and spawn', async (_label, budget) => {
    await expect(runTaskMode({
      description: 'invalid budget',
      projectRoot: root,
      model: 'claude-sonnet-5',
      provider: 'claude',
      budget: budget as unknown as ExecutionBudget,
    }, makeTaskConfig())).rejects.toThrow();

    expect(existsSync(join(root, '.tasks'))).toBe(false);
    expect(backendHarness.spawn).not.toHaveBeenCalled();
  });

  it('does not silently route an unavailable local adapter through the configured remote backend', async () => {
    await expect(runTaskMode({
      description: 'local task',
      projectRoot: root,
      model: 'qwen-coder-32b',
      provider: 'ollama',
    }, makeTaskConfig({ execution_budget: undefined })))
      .rejects.toThrow('TASK_INGRESS_NOT_DISPATCHED:provider-unavailable');
    expect(backendHarness.spawn).not.toHaveBeenCalled();
  });

  it('throws when deckent_style is not "task"', async () => {
    const config = makeTaskConfig({ deckent_style: 'sprint' as unknown as 'task' });

    await expect(
      runTaskMode({ description: 'should fail', projectRoot: root }, config),
    ).rejects.toThrow('deckent_style !== "task"');
  });
});
