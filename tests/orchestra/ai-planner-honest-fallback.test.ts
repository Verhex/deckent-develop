/**
 * Sprint 224 Task 224-001 (extends Sprint 221 Task 221-017) —
 * AI planner honest-fallback contract with discriminant `PlannerCallResult`.
 *
 * Verifies that `planSprint()` no longer silently drops to structured mode when the
 * AI planner fails. The contract now surfaces a discriminant
 * `{ ok: false, reason, message }` so the caller can show *why* AI mode failed:
 *  - mode === 'ai'   + failure → throws BrainError naming `provider` + `reason` + detailed `message`
 *  - mode === 'auto' + failure → `console.error` with `provider` + `reason` + detailed `message`
 *  - mode === 'ai'   + `no_providers` → throws BrainError naming `reason=no_providers`
 *  - mode === 'ai'   + success → uses `data.tasks`, no warning emitted
 *  - subscription-spawn routing → `callBrainPlanner` is invoked with the
 *    `config.brain_provider`-resolved adapter (no claude bias, no API-key dependency).
 *
 * All tests are hermetic: provider/spawn/fs mocked, no disk I/O, no real network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ResolvedConfig, Task, DebtItem, SprintSizeRecommendation } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([] as never),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  appendFileSync: vi.fn(),
  renameSync: vi.fn(),
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockRejectedValue(new Error('ENOENT')),
  access: vi.fn().mockRejectedValue(new Error('ENOENT')),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({
    status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
  }),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  detectDeadlocks: vi.fn().mockReturnValue([]),
  resetDashboard: vi.fn(),
  updateDashboard: vi.fn(),
  startScanLoop: vi.fn(),
  writeScanToDashboard: vi.fn(),
}));

vi.mock('../../src/orchestra/planner.js', () => ({
  resolvePlanTimeoutMs: vi.fn(() => 900_000), // F-2: sprint-planner/do.ts resolve the plan timeout through this
  createPlannerTaskModelPolicy: vi.fn((model: string, provider?: string) => ({
    defaultModel: provider === 'codex' ? 'gpt-5.5' : model,
    allowedModels: provider === 'codex' ? ['gpt-5.5'] : [model],
  })),
  // Sprint 224 task 224-001 — sprint-planner uses `callBrainPlannerWithReason` for
  // honest-fallback. Default = honest spawn_failed discriminant; each test overrides.
  callBrainPlannerWithReason: vi.fn().mockReturnValue({
    ok: false,
    reason: 'spawn_failed',
    message: 'default mock — subscription spawn returned no output',
  }),
  // Legacy `callBrainPlanner` kept on the mock for backward compat (other tests
  // assume it exists). Not used by sprint-planner in this suite.
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

// Provider registry — adapters + registry built inside vi.hoisted so the mock factory
// (also hoisted) can safely reference them.
const providerFixtures = vi.hoisted(() => {
  const claudeAdapter = {
    name: 'claude' as const,
    buildCommand: () => 'claude --model claude-opus-4-8 /dev/null',
    isAvailable: async () => true,
  };
  const ollamaAdapter = {
    name: 'ollama' as const,
    buildCommand: () => 'ollama run llama3',
    isAvailable: async () => true,
  };
  const registered = new Map<string, typeof claudeAdapter | typeof ollamaAdapter>([
    ['claude', claudeAdapter],
    ['ollama', ollamaAdapter],
  ]);
  return { claudeAdapter, ollamaAdapter, registered };
});

vi.mock('../../src/core/provider.js', () => ({
  orderedRoleProviders: vi.fn((role: string, config: {
    brain_provider?: string;
    worker_provider?: string;
    providers?: { brain?: string; worker?: string };
    provider_fallback?: { auditor_provider?: string; unattended?: boolean };
  }) => ({
    role,
    primary: role === 'worker'
      ? config.providers?.worker ?? config.worker_provider ?? 'claude'
      : role === 'auditor'
        ? config.provider_fallback?.auditor_provider
          ?? config.providers?.brain
          ?? config.brain_provider
          ?? 'claude'
        : config.providers?.brain ?? config.brain_provider ?? 'claude',
    fallbacks: [],
    unattended: config.provider_fallback?.unattended ?? true,
  })),
  providerRegistry: {
    getDefault: vi.fn(() => providerFixtures.claudeAdapter),
    getProvider: vi.fn(
      (name: string) => providerFixtures.registered.get(name) ?? providerFixtures.claudeAdapter,
    ),
    hasProvider: vi.fn((name: string) => providerFixtures.registered.has(name)),
    registerProvider: vi.fn(),
    listProviders: vi.fn(() => [...providerFixtures.registered.keys()]),
    setDefault: vi.fn(),
  },
  ProviderError: class ProviderError extends Error {},
  getProviderForModel: vi.fn().mockReturnValue('claude'),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({
    loadAgents: vi.fn().mockReturnValue(new Map()),
    saveTempAgentToPool: vi.fn(),
  })),
}));

vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({
    loadSkills: vi.fn().mockReturnValue(new Map()),
  })),
}));

vi.mock('../../src/core/agent-selector.js', () => ({
  selectAgent: vi.fn().mockReturnValue({ agent: null, score: 0, reason: 'no-pool' }),
}));

vi.mock('../../src/core/skill-selector.js', () => ({
  selectSkills: vi.fn().mockReturnValue({ skills: [] }),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn().mockReturnValue(undefined),
  detectFullStack: vi.fn().mockReturnValue({ language: '', framework: '', buildTool: '', testFramework: '', commands: { build: '', test: '', lint: '' } }),
}));

// Bypass model-equivalence lookups (real impl throws when provider has no mapping).
// We do not assert on resolved model here — provider-routing is the focus.
vi.mock('../../src/orchestra/model-selector.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/model-selector.js')>();
  return {
    ...actual,
    resolveTaskModel: vi.fn().mockReturnValue('claude-sonnet-5'),
  };
});

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    getNextSprintId: vi.fn().mockReturnValue('sprint-224'),
  };
});

// MemoryStore — not used in our paths (we pass context directly), but readContext could read it.
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({
    getByType: vi.fn().mockReturnValue([]),
    close: vi.fn(),
  })),
}));

// ─── Imports under test ───────────────────────────────────────────

import { planSprint } from '../../src/orchestra/sprint-planner.js';
import { BrainError } from '../../src/orchestra/sprint-lifecycle.js';
import { callBrainPlannerWithReason } from '../../src/orchestra/planner.js';
import type { PlannerCallResult } from '../../src/orchestra/planner.js';
import { providerRegistry } from '../../src/core/provider.js';

const mockedCallBrainPlanner = vi.mocked(callBrainPlannerWithReason);
const mockedHasProvider = vi.mocked(providerRegistry.hasProvider);
const mockedGetProvider = vi.mocked(providerRegistry.getProvider);
const mockedGetDefault = vi.mocked(providerRegistry.getDefault);

// ─── Fixtures ─────────────────────────────────────────────────────

const ROOT = '/project-224';

function makeConfig(brainProvider?: 'claude' | 'ollama'): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'claude-opus-4-8',
      default_model: 'claude-sonnet-5',
      haiku_allowed: false,
      brain_planning: 'auto',
    },
    modes: {} as never,
    language: 'tr',
    projectName: 'test-224',
    projectRoot: ROOT,
    version: '0.1.0',
    ...(brainProvider ? { brain_provider: brainProvider } : {}),
  } as ResolvedConfig;
}

function makeContext(directives = 'Task A\nTask B') {
  return {
    directives,
    memory: '',
    retro: '',
    debt: [] as DebtItem[],
    patterns: '',
    decisions: '',
    existingTasks: [] as Task[],
    projectState: { gitStatus: '', fileTree: [] },
  };
}

const recommendation: SprintSizeRecommendation = {
  size: 'full',
  maxWorkers: 4,
  modelConstraint: null,
  reason: 'normal',
};

const validAiPlannerResult = {
  tasks: [
    {
      title: 'AI Planned Task',
      description: 'From AI',
      model: 'claude-sonnet-5' as const,
      effort: 'normal' as const,
      priority: 'NORMAL' as const,
      reason: 'AI decided',
      scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    },
  ],
  reasoning: 'AI plan rationale',
};

const okResult: PlannerCallResult = { ok: true, data: validAiPlannerResult };

// ─── Test setup / teardown ────────────────────────────────────────

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedCallBrainPlanner.mockReturnValue({
    ok: false,
    reason: 'spawn_failed',
    message: 'default mock — subscription spawn returned no output',
  });
  mockedHasProvider.mockImplementation((name) => providerFixtures.registered.has(name));
  mockedGetProvider.mockImplementation(
    (name) => providerFixtures.registered.get(name) ?? providerFixtures.claudeAdapter,
  );
  mockedGetDefault.mockReturnValue(providerFixtures.claudeAdapter);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

// ─── Tests ────────────────────────────────────────────────────────

describe('Sprint 224 / Task 224-001 — AI planner discriminant honest-fallback', () => {
  it('mode=ai + reason=spawn_failed → throws BrainError naming provider + reason + detailed message', async () => {
    mockedCallBrainPlanner.mockReturnValue({
      ok: false,
      reason: 'spawn_failed',
      message: 'provider=claude exited with status=1, stderr=CLI not found',
    });
    const config = makeConfig('claude');

    let caught: Error | undefined;
    try {
      await planSprint(ROOT, config, makeContext('Task A'), recommendation, { mode: 'ai' });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeInstanceOf(BrainError);
    expect(caught!.message).toMatch(/AI planner failed/);
    expect(caught!.message).toMatch(/provider=claude/);
    expect(caught!.message).toMatch(/reason=spawn_failed/);
    expect(caught!.message).toMatch(/CLI not found/);
    expect(caught!.message).toMatch(/structured moda düşülmedi/);
    expect((caught as BrainError).plannerProof).toMatchObject({
      version: 1,
      requestedMode: 'ai',
      actualMode: 'failed',
      resolutionReason: 'model-failure',
      call: {
        attempted: true,
        succeeded: false,
        resolvedProvider: 'claude',
        failureReason: 'spawn_failed',
      },
    });
  });

  it('mode=auto + reason=parse_failed → structured fallback succeeds (honest fallback via notify, not console.error)', async () => {
    mockedCallBrainPlanner.mockReturnValue({
      ok: false,
      reason: 'parse_failed',
      message: 'provider=claude returned unparseable output (length=42): garbage stdout snippet',
    });
    const config = makeConfig('claude');

    const sprint = await planSprint(
      ROOT,
      config,
      makeContext('Task A\nTask B'),
      recommendation,
      { mode: 'auto' },
    );

    // Sprint-planner now uses notify() (fire-and-forget) for the auto-mode fallback
    // signal instead of console.error() — the honest fallback contract is preserved
    // (planningMode='fallback' + tasks planned), the channel changed.
    expect(sprint.planningMode).toBe('fallback');
    expect(sprint.tasks.length).toBeGreaterThan(0);
    expect(sprint.plannerProof).toMatchObject({
      version: 1,
      requestedMode: 'auto',
      actualMode: 'fallback',
      resolutionReason: 'model-failure-fallback',
      call: {
        attempted: true,
        succeeded: false,
        failureReason: 'parse_failed',
      },
    });
  });

  it.each(['receipt_replay_blocked', 'receipt_failed'] as const)(
    'mode=auto + reason=%s → fails loud instead of minting a structured planning authority',
    async (reason) => {
      const receiptRef = {
        schemaVersion: 1 as const,
        invocationId: `inv-${reason}`,
        tenantId: 'local',
        projectId: 'project-proof',
      };
      mockedCallBrainPlanner.mockReturnValue({
        ok: false,
        reason,
        message: reason === 'receipt_replay_blocked'
          ? 'INVOCATION_RECEIPT_DUPLICATE_DISPATCH_BLOCKED'
          : 'INVOCATION_RECEIPT_EVENT_WRITE_FAILED',
        receiptRef,
      });

      const error = await planSprint(
        ROOT,
        makeConfig('claude'),
        makeContext('Task A\nTask B'),
        recommendation,
        { mode: 'auto' },
      ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BrainError);
      expect(error.message).toContain(`reason=${reason}`);
      expect(error.message).toContain('structured moda düşülmedi (mode=auto)');
      expect((error as BrainError).plannerProof).toMatchObject({
        requestedMode: 'auto',
        actualMode: 'failed',
        resolutionReason: 'invocation-authority-failure',
        call: {
          attempted: true,
          succeeded: false,
          failureReason: reason,
          receiptRef,
        },
      });
    },
  );

  it('mode=ai + reason=no_providers → throws BrainError with reason=no_providers (registry empty)', async () => {
    mockedCallBrainPlanner.mockReturnValue({
      ok: false,
      reason: 'no_providers',
      message: 'Provider registry empty or missing requested provider: No providers registered',
    });
    const config = makeConfig('claude');

    let caught: Error | undefined;
    try {
      await planSprint(ROOT, config, makeContext('Task A'), recommendation, { mode: 'ai' });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeInstanceOf(BrainError);
    expect(caught!.message).toMatch(/reason=no_providers/);
    expect(caught!.message).toMatch(/Provider registry empty/);
    expect((caught as BrainError).plannerProof).toMatchObject({
      requestedMode: 'ai',
      actualMode: 'failed',
      resolutionReason: 'model-failure',
      call: { attempted: true, succeeded: false, failureReason: 'no_providers' },
    });
  });

  it('mode=ai + ok=true (success path) → uses data.tasks, planningMode=ai, no warning emitted', async () => {
    const receiptRef = {
      schemaVersion: 1 as const,
      invocationId: 'inv-planner-proof',
      tenantId: 'local',
      projectId: 'project-proof',
    };
    mockedCallBrainPlanner.mockReturnValue({ ...okResult, receiptRef });
    const config = makeConfig('claude');

    const sprint = await planSprint(
      ROOT,
      config,
      makeContext(''),
      recommendation,
      { mode: 'ai' },
    );

    expect(sprint.planningMode).toBe('ai');
    expect(sprint.plannerProof).toMatchObject({
      requestedMode: 'ai',
      actualMode: 'ai',
      resolutionReason: 'model-success',
      call: { attempted: true, succeeded: true, failureReason: null, receiptRef },
    });
    expect(sprint.tasks.some((t) => t.title === 'AI Planned Task')).toBe(true);
    const messages = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(messages.find((m) => m.includes('AI planner failed'))).toBeUndefined();
  });

  it('gives each dry-run a durable but execution-distinct receipt identity', async () => {
    mockedCallBrainPlanner.mockReturnValue(okResult);
    const config = makeConfig('claude');

    await planSprint(ROOT, config, makeContext(''), recommendation, { mode: 'ai', dryRun: true });
    await planSprint(ROOT, config, makeContext(''), recommendation, { mode: 'ai', dryRun: true });

    const first = mockedCallBrainPlanner.mock.calls[0]![8];
    const second = mockedCallBrainPlanner.mock.calls[1]![8];
    expect(first).toMatchObject({ runId: 'sprint-224' });
    expect(second).toMatchObject({ runId: 'sprint-224' });
    expect(first?.invocationId).toMatch(/^inv-preview-/);
    expect(second?.invocationId).toMatch(/^inv-preview-/);
    expect(first?.invocationId).not.toBe(second?.invocationId);
    expect(first?.idempotencyKey).toContain(':preview:');
    expect(second?.idempotencyKey).toContain(':preview:');
  });

  it('subscription-spawn: callBrainPlanner receives the brain_provider-resolved adapter (no hardcoded default)', async () => {
    mockedCallBrainPlanner.mockReturnValue(okResult);
    const config = makeConfig('ollama');

    await planSprint(
      ROOT,
      config,
      makeContext(''),
      recommendation,
      { mode: 'ai' },
    );

    expect(mockedHasProvider).toHaveBeenCalledWith('ollama');
    expect(mockedGetProvider).toHaveBeenCalledWith('ollama');
    expect(mockedCallBrainPlanner).toHaveBeenCalledTimes(1);
    const adapterArg = mockedCallBrainPlanner.mock.calls[0]![4];
    expect(adapterArg).toBe(providerFixtures.ollamaAdapter);
    expect(mockedGetDefault).not.toHaveBeenCalled();
  });

  it('uses grouped providers.brain as adapter, proof, and receipt requested authority', async () => {
    mockedCallBrainPlanner.mockReturnValue(okResult);
    const config = {
      ...makeConfig(),
      providers: { brain: 'ollama', worker: 'claude' },
    } as ResolvedConfig;

    const sprint = await planSprint(
      ROOT,
      config,
      makeContext(''),
      recommendation,
      { mode: 'ai' },
    );

    expect(mockedGetProvider).toHaveBeenCalledWith('ollama');
    expect(mockedGetDefault).not.toHaveBeenCalled();
    expect(mockedCallBrainPlanner.mock.calls[0]![4]).toBe(providerFixtures.ollamaAdapter);
    expect(mockedCallBrainPlanner.mock.calls[0]![8]).toMatchObject({
      configuredProvider: 'ollama',
      requestedProvider: 'ollama',
    });
    expect(sprint.plannerProof?.call).toMatchObject({
      requestedProvider: 'ollama',
      resolvedProvider: 'ollama',
    });
  });

  it('keeps an absent configured primary unresolved and never substitutes registry default', async () => {
    mockedHasProvider.mockImplementation((name) => name !== 'ollama' && providerFixtures.registered.has(name));
    mockedCallBrainPlanner.mockImplementation((...args) => args[4]
      ? okResult
      : {
          ok: false,
          reason: 'no_providers',
          message: 'Provider not found: "ollama"',
        });
    const config = makeConfig('ollama');

    const error = await planSprint(
      ROOT,
      config,
      makeContext(''),
      recommendation,
      { mode: 'ai' },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BrainError);
    expect(mockedGetDefault).not.toHaveBeenCalled();
    expect(mockedGetProvider).not.toHaveBeenCalledWith('ollama');
    expect(mockedCallBrainPlanner.mock.calls[0]![4]).toBeUndefined();
    expect(mockedCallBrainPlanner.mock.calls[0]![8]).toMatchObject({
      configuredProvider: 'ollama',
      requestedProvider: 'ollama',
    });
    expect((error as BrainError).plannerProof?.call).toMatchObject({
      requestedProvider: 'ollama',
      resolvedProvider: null,
      resolvedModel: null,
      failureReason: 'no_providers',
    });
  });

  it('mode=auto + reason=timeout → structured fallback succeeds (honest fallback via notify, not console.error)', async () => {
    mockedCallBrainPlanner.mockReturnValue({
      ok: false,
      reason: 'timeout',
      message:
        'Subscription spawn timed out after 900000ms (provider=claude). ' +
        'Consider raising brain_plan_timeout_ms in config or passing a larger timeout.',
    });
    const config = makeConfig('claude');

    const sprint = await planSprint(
      ROOT,
      config,
      makeContext('Task A\nTask B'),
      recommendation,
      { mode: 'auto' },
    );

    // Sprint-planner now uses notify() (fire-and-forget) for the auto-mode fallback
    // signal instead of console.error() — the honest fallback contract is preserved
    // (planningMode='fallback' + tasks planned), the channel changed.
    expect(sprint.planningMode).toBe('fallback');
    expect(sprint.tasks.length).toBeGreaterThan(0);
  });

});
