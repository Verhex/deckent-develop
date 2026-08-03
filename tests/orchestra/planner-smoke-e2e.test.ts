/**
 * PLAN-W1 Bug 1 — structured `planSprint` must NOT drop the `Smoke:` directive.
 *
 * The unit-level wire (`planner-smoke-wire.test.ts`, `smoke-field-flow.test.ts`)
 * proves `parseStructuredDirectives → createTask → task.smoke` in ISOLATION, by
 * hand-splicing `smoke` into CreateTaskParams. It does NOT exercise the real
 * `planSprint` structured path, which builds `CreateTaskParams` from
 * `directiveSources` and historically forgot to thread `src.smoke` through →
 * the parsed smoke never reached the written `.tasks/task-*.json`.
 *
 * This test closes that gap: it drives the REAL `planSprint` (structured mode)
 * with a DIRECTIVES fixture carrying a `Smoke:` line and asserts the produced
 * task — and its JSON-serialised shape (exactly what `.tasks/task-*.json`
 * receives) — carries a non-empty `smoke: { command, expect }`.
 *
 * Hermetic: provider/spawn/fs/model-selector/memory mocked, no disk I/O, no net.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ResolvedConfig, Task, DebtItem, SprintSizeRecommendation } from '../../src/core/types.js';

// ─── Mocks (mirror planner-override-precedence.test.ts) ─────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([] as never),
  unlinkSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
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
  createPlannerTaskModelPolicy: vi.fn((defaultModel: string) => ({ defaultModel, allowedModels: [defaultModel] })),
  callBrainPlannerWithReason: vi.fn().mockReturnValue({ ok: false, reason: 'no_providers', message: 'no providers' }),
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

const providerFixtures = vi.hoisted(() => {
  const claudeAdapter = { name: 'claude' as const, buildCommand: () => 'claude', isAvailable: async () => true };
  const registered = new Map<string, typeof claudeAdapter>([['claude', claudeAdapter]]);
  return { claudeAdapter, registered };
});

vi.mock('../../src/core/provider.js', () => ({
  providerRegistry: {
    getDefault: vi.fn(() => providerFixtures.claudeAdapter),
    getProvider: vi.fn(() => providerFixtures.claudeAdapter),
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
  SkillPoolManager: vi.fn().mockImplementation(() => ({ loadSkills: vi.fn().mockReturnValue(new Map()) })),
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

vi.mock('../../src/orchestra/model-selector.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/model-selector.js')>();
  return {
    ...actual,
    resolveTaskModel: vi.fn(
      (_t: string, _d: string, _s: unknown, _c: unknown, _p: unknown, forceModel?: string) =>
        forceModel ?? 'claude-sonnet-5',
    ),
  };
});

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return { ...actual, getNextSprintId: vi.fn().mockReturnValue('sprint-291') };
});

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({ getByType: vi.fn().mockReturnValue([]), close: vi.fn() })),
}));

// ─── Import under test ────────────────────────────────────────────

import { planSprint } from '../../src/orchestra/sprint-planner.js';

// ─── Fixtures ─────────────────────────────────────────────────────

const ROOT = '/project-291';

function makeConfig(): ResolvedConfig {
  return {
    mode: 'performance',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'claude-opus-4-8',
      default_model: 'claude-opus-4-8',
      haiku_allowed: true,
      brain_planning: 'structured',
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test-291',
    projectRoot: ROOT,
    version: '0.1.0',
    brain_provider: 'claude',
  } as ResolvedConfig;
}

function makeContext(directives: string) {
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

const SMOKE_DIRECTIVES = [
  '# DIRECTIVES — Sprint 291 smoke test',
  '',
  '## Task 1: Tier-1 serve endpoint',
  '- Model: claude-sonnet-5',
  '- Effort: normal',
  '- Files: src/api/server.ts',
  '- Scope: src/api/',
  '',
  '### Description',
  'Wire up the serve endpoint with token injection.',
  '',
  '- Smoke: node dist/cli/entry.js serve --port 3211 → 200',
].join('\n');

const NO_SMOKE_DIRECTIVES = [
  '# DIRECTIVES — Sprint 291 smoke test',
  '',
  '## Task 1: internal refactor',
  '- Model: claude-haiku-4-5-20251001',
  '- Effort: low',
  '- Files: src/core/types.ts',
  '- Scope: src/core/',
  '',
  '### Description',
  'Rename a few internal types — no user surface.',
].join('\n');

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

// ─── Tests ────────────────────────────────────────────────────────

describe('PLAN-W1 Bug 1 — structured planSprint propagates Smoke: into task-JSON', () => {
  it('structured plan of a DIRECTIVES with a Smoke line → produced task carries smoke', async () => {
    const sprint = await planSprint(ROOT, makeConfig(), makeContext(SMOKE_DIRECTIVES), recommendation, { mode: 'structured' });

    const t = sprint.tasks.find((x) => x.title === 'Tier-1 serve endpoint');
    expect(t).toBeDefined();
    // The bug: structured planSprint dropped src.smoke → task.smoke was undefined.
    expect(t!.smoke).toBeDefined();
    expect(t!.smoke!.command).toBe('node dist/cli/entry.js serve --port 3211');
    expect(t!.smoke!.expect).toBe('200');
  });

  it('smoke survives JSON serialisation — exactly the `.tasks/task-*.json` write shape', async () => {
    const sprint = await planSprint(ROOT, makeConfig(), makeContext(SMOKE_DIRECTIVES), recommendation, { mode: 'structured' });
    const t = sprint.tasks.find((x) => x.title === 'Tier-1 serve endpoint')!;

    // sprint-planner.ts writes `JSON.stringify(task, null, 2)` to disk — assert the
    // smoke field survives that exact round-trip (the disk artifact the gate reads).
    const onDisk = JSON.parse(JSON.stringify(t)) as { smoke?: { command: string; expect: string } };
    expect(onDisk.smoke).toBeDefined();
    expect(onDisk.smoke!.command).toBe('node dist/cli/entry.js serve --port 3211');
    expect(onDisk.smoke!.expect).toBe('200');
  });

  it('no Smoke line → task.smoke stays undefined (Tier-0, regression baseline)', async () => {
    const sprint = await planSprint(ROOT, makeConfig(), makeContext(NO_SMOKE_DIRECTIVES), recommendation, { mode: 'structured' });
    const t = sprint.tasks.find((x) => x.title === 'internal refactor');
    expect(t).toBeDefined();
    expect(t!.smoke).toBeUndefined();
  });
});
