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
    buildCommand: () => 'claude --model opus /dev/null',
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
    resolveTaskModel: vi.fn().mockReturnValue('sonnet'),
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
      brain_model: 'opus',
      default_model: 'sonnet',
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
      model: 'sonnet' as const,
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
  });

  it('mode=auto + reason=parse_failed → console.error with reason + detail + structured fallback succeeds', async () => {
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

    expect(sprint.planningMode).toBe('fallback');
    expect(sprint.tasks.length).toBeGreaterThan(0);
    const messages = errorSpy.mock.calls.map((c) => String(c[0]));
    const hit = messages.find(
      (m) =>
        m.includes('AI planner failed') &&
        m.includes('provider=claude') &&
        m.includes('reason=parse_failed') &&
        m.includes('garbage stdout snippet') &&
        (m.includes('structured moda') || m.includes('falling back')),
    );
    expect(hit).toBeDefined();
  });

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
  });

  it('mode=ai + ok=true (success path) → uses data.tasks, planningMode=ai, no warning emitted', async () => {
    mockedCallBrainPlanner.mockReturnValue(okResult);
    const config = makeConfig('claude');

    const sprint = await planSprint(
      ROOT,
      config,
      makeContext(''),
      recommendation,
      { mode: 'ai' },
    );

    expect(sprint.planningMode).toBe('ai');
    expect(sprint.tasks.some((t) => t.title === 'AI Planned Task')).toBe(true);
    const messages = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(messages.find((m) => m.includes('AI planner failed'))).toBeUndefined();
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
  });

  it('mode=auto + reason=timeout → console.error mentions timeout + brain_plan_timeout_ms hint + structured fallback', async () => {
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

    expect(sprint.planningMode).toBe('fallback');
    const messages = errorSpy.mock.calls.map((c) => String(c[0]));
    const hit = messages.find(
      (m) =>
        m.includes('reason=timeout') &&
        m.includes('brain_plan_timeout_ms') &&
        (m.includes('structured moda') || m.includes('falling back')),
    );
    expect(hit).toBeDefined();
  });

});
