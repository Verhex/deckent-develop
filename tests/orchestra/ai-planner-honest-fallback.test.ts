/**
 * Sprint 221 Task 221-017 — AI planner honest-fallback contract.
 *
 * Verifies that `planSprint()` no longer falls back to structured mode silently when the
 * AI planner returns null. Instead:
 *  - mode === 'ai'   → throws BrainError that names the brain_provider tried.
 *  - mode === 'auto' → emits an explicit `console.error` warning + structured fallback.
 *  - mode === 'auto' + AI success → uses AI result, no warning.
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
    getNextSprintId: vi.fn().mockReturnValue('sprint-221'),
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
import { callBrainPlanner } from '../../src/orchestra/planner.js';
import { providerRegistry } from '../../src/core/provider.js';

const mockedCallBrainPlanner = vi.mocked(callBrainPlanner);
const mockedHasProvider = vi.mocked(providerRegistry.hasProvider);
const mockedGetProvider = vi.mocked(providerRegistry.getProvider);
const mockedGetDefault = vi.mocked(providerRegistry.getDefault);

// ─── Fixtures ─────────────────────────────────────────────────────

const ROOT = '/project-221';

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
    projectName: 'test-221',
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

// ─── Test setup / teardown ────────────────────────────────────────

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedCallBrainPlanner.mockReturnValue(null);
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

describe('Sprint 221 / Task 221-017 — AI planner honest-fallback', () => {
  it('mode=ai + AI null → throws BrainError naming the brain_provider (subscription-spawn fail surfaced)', async () => {
    mockedCallBrainPlanner.mockReturnValue(null);
    const config = makeConfig('claude');

    await expect(
      planSprint(ROOT, config, makeContext('Task A'), recommendation, { mode: 'ai' }),
    ).rejects.toThrow(BrainError);

    // Second invocation to inspect the actual message — keep mocks deterministic.
    mockedCallBrainPlanner.mockReturnValue(null);
    let caught: Error | undefined;
    try {
      await planSprint(ROOT, config, makeContext('Task A'), recommendation, { mode: 'ai' });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeInstanceOf(BrainError);
    expect(caught!.message).toMatch(/AI planner failed/);
    expect(caught!.message).toMatch(/provider=claude/);
    expect(caught!.message).toMatch(/structured moda düşülmedi/);
  });

  it('mode=auto + AI null → console.error warning emitted + structured fallback succeeds (no silent drop)', async () => {
    mockedCallBrainPlanner.mockReturnValue(null);
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
    // Honest fallback warning must mention provider + falling back / structured moda.
    const messages = errorSpy.mock.calls.map((c) => String(c[0]));
    const hit = messages.find(
      (m) =>
        m.includes('AI planner failed') &&
        m.includes('provider=claude') &&
        (m.includes('structured moda') || m.includes('falling back')),
    );
    expect(hit).toBeDefined();
  });

  it('mode=ai + AI success → uses AI result, planningMode=ai, no fallback warning', async () => {
    mockedCallBrainPlanner.mockReturnValue(validAiPlannerResult);
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
    // No "AI planner failed" warning when AI succeeds.
    const messages = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(messages.find((m) => m.includes('AI planner failed'))).toBeUndefined();
  });

  it('subscription-spawn → callBrainPlanner receives the brain_provider-resolved adapter (not a hardcoded default)', async () => {
    mockedCallBrainPlanner.mockReturnValue(validAiPlannerResult);
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
    // Adapter passed as 5th positional arg must be the ollama adapter (subscription
    // CLI spawn — no ANTHROPIC_API_KEY claude fallback).
    const adapterArg = mockedCallBrainPlanner.mock.calls[0]![4];
    expect(adapterArg).toBe(providerFixtures.ollamaAdapter);
  });

  it('mode=auto + AI success → uses AI result with no fallback warning (success path symmetric)', async () => {
    mockedCallBrainPlanner.mockReturnValue(validAiPlannerResult);
    const config = makeConfig('claude');

    const sprint = await planSprint(
      ROOT,
      config,
      makeContext(''),
      recommendation,
      { mode: 'auto' },
    );

    expect(sprint.planningMode).toBe('ai');
    const messages = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(messages.find((m) => m.includes('AI planner failed'))).toBeUndefined();
  });
});
