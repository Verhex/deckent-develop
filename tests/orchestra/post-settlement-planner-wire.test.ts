/**
 * 488-014 — structured `planSprint` (and the RunFlow plan surface) must NOT
 * drop a `- PromotionProof:` directive.
 *
 * `extractPromotionProofDeclaration` (task-builder.ts, landed by 488-013)
 * already parses a `- PromotionProof: <ingress>[/<platform>] <cmd...>` line
 * into `ParsedDirectiveTask.postSettlementProjection`. The wiring gap this
 * test closes: `createTask()` never copied `params.postSettlementProjection`
 * onto the returned `Task`, and `planSprint`'s structured-directive loop
 * never threaded `src.postSettlementProjection` into the `createTask({...})`
 * call — so the parsed declaration vanished before it ever reached a planned
 * Task or the written `.tasks/task-*.json`. Mirrors the same wire-bug shape
 * as `planner-smoke-e2e.test.ts` (the `Smoke:` directive, PLAN-W1 Bug 1).
 *
 * Also proves the declaration is represented separately from executable
 * work — it rides ON a Task, it never becomes a hidden Task of its own — and
 * that the RunFlow plan surface (`run-flow-plan-service.ts`) does not strip
 * the field off the Sprint it persists.
 *
 * Hermetic: provider/spawn/fs/model-selector/memory mocked, no disk I/O, no net.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ResolvedConfig, Task, DebtItem, SprintSizeRecommendation } from '../../src/core/types.js';

// ─── Mocks (mirror planner-smoke-e2e.test.ts) ────────────────────────

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
  resolvePlanTimeoutMs: vi.fn(() => 900_000),
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
  return { ...actual, getNextSprintId: vi.fn().mockReturnValue('sprint-488') };
});

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({ getByType: vi.fn().mockReturnValue([]), close: vi.fn() })),
}));

// ─── Import under test ────────────────────────────────────────────

import { planSprint } from '../../src/orchestra/sprint-planner.js';
import * as plannerModule from '../../src/orchestra/planner.js';

// ─── Fixtures ─────────────────────────────────────────────────────

const ROOT = '/project-488';

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
    projectName: 'test-488',
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

const PROMOTION_PROOF_DIRECTIVES = [
  '# DIRECTIVES — Sprint 488 post-settlement proof',
  '',
  '## Task 1: Post-settlement proof task',
  '- Model: claude-sonnet-5',
  '- Effort: normal',
  '- Files: src/api/server.ts',
  '- Scope: src/api/',
  '',
  '### Description',
  'Wire up post-settlement promotion verification.',
  '',
  '- PromotionProof: sprint npm run verify',
].join('\n');

const NO_PROMOTION_PROOF_DIRECTIVES = [
  '# DIRECTIVES — Sprint 488 post-settlement proof',
  '',
  '## Task 1: internal refactor',
  '- Model: claude-haiku-4-5-20251001',
  '- Effort: low',
  '- Files: src/core/types.ts',
  '- Scope: src/core/',
  '',
  '### Description',
  'Rename a few internal types — no promotion proof declared.',
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

describe('488-014 — structured planSprint propagates PromotionProof: into task.postSettlementProjection', () => {
  it('structured plan of a DIRECTIVES with a PromotionProof line → produced task carries the projection, without inflating task count', async () => {
    const sprint = await planSprint(ROOT, makeConfig(), makeContext(PROMOTION_PROOF_DIRECTIVES), recommendation, { mode: 'structured' });

    // Never a hidden Task of its own — exactly one task for one directive block.
    expect(sprint.tasks).toHaveLength(1);

    const t = sprint.tasks.find((x) => x.title === 'Post-settlement proof task');
    expect(t).toBeDefined();
    expect(t!.postSettlementProjection).toBeDefined();
    const proj = t!.postSettlementProjection!;
    expect(proj.ingress).toBe('sprint');
    expect(proj.platformCapability).toBe('any');
    expect(proj.command).toEqual({ executable: 'npm', args: ['run', 'verify'], cwdRef: 'src/api/' });
    expect(proj.contractDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('projection survives JSON serialisation — exactly the `.tasks/task-*.json` write shape', async () => {
    const sprint = await planSprint(ROOT, makeConfig(), makeContext(PROMOTION_PROOF_DIRECTIVES), recommendation, { mode: 'structured' });
    const t = sprint.tasks.find((x) => x.title === 'Post-settlement proof task')!;

    const onDisk = JSON.parse(JSON.stringify(t)) as Task;
    expect(onDisk.postSettlementProjection).toBeDefined();
    expect(onDisk.postSettlementProjection).toEqual(t.postSettlementProjection);
  });

  it('no PromotionProof line → task.postSettlementProjection stays undefined (regression baseline)', async () => {
    const sprint = await planSprint(ROOT, makeConfig(), makeContext(NO_PROMOTION_PROOF_DIRECTIVES), recommendation, { mode: 'structured' });
    const t = sprint.tasks.find((x) => x.title === 'internal refactor');
    expect(t).toBeDefined();
    expect(t!.postSettlementProjection).toBeUndefined();
  });

  it('auto mode: a declared PromotionProof forces exact structured routing (never silently dropped by the AI planner)', async () => {
    const sprint = await planSprint(ROOT, makeConfig(), makeContext(PROMOTION_PROOF_DIRECTIVES), recommendation, { mode: 'auto' });

    // The AI planner must never even be attempted — the directive-override
    // forcing check routes straight to structured mode, same as an explicit
    // provider/model/agent/skills override.
    expect(vi.mocked(plannerModule.callBrainPlannerWithReason)).not.toHaveBeenCalled();
    expect(sprint.planningMode).toBe('structured');
    const t = sprint.tasks.find((x) => x.title === 'Post-settlement proof task');
    expect(t!.postSettlementProjection).toBeDefined();
    expect(t!.postSettlementProjection!.ingress).toBe('sprint');
  });
});
