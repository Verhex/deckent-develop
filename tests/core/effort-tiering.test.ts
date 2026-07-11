/**
 * born-636-K2 (Sprint 407, Task 407-003, COST-K2) — task-tipi→effort tiering.
 *
 * `task.effort` existed but nothing derived it from the task's TYPE: the
 * structured/directive planning path in sprint-planner.ts hardcoded the
 * fallback to 'normal' for every task regardless of what kind of work it
 * was. This suite:
 *
 * 1. RED-evidence (`describe('RED-evidence...')`): proves the pre-existing
 *    gap — a fixture spanning several distinct task "types" (documentation,
 *    config, security, migration, refactor, implementation, test-dominant,
 *    audit) all resolve to `effort: 'normal'` with the new
 *    `routing.effort_tiering` flag OFF (the default). This is simultaneously
 *    the flag-off byte-identical pin: the same assertions must stay true
 *    forever, by construction, once the flag ships.
 * 2. Unit-tests `resolveEffortTier()` (routing-engine.ts) exhaustively over
 *    every `IntentType` — the pure tip→effort table, decoupled from
 *    `classifyIntent`'s keyword-scoring heuristics.
 * 3. Flag-on integration: the same fixture, with the flag enabled, resolves
 *    each task to the table's expected tier (including the two signals the
 *    pure resolver does NOT see directly — audit via scope-shape, and the
 *    test-dominant bucket collapsing into 'normal').
 * 4. Hint precedence: an explicit `- Effort:` directive always wins over the
 *    derived tier, flag on or off (404-003 hint-chain, unchanged).
 *
 * Hermetic: fs/child_process/planner/provider/agent-pool/skill-pool mocked,
 * no disk I/O, no network — mirrors tests/orchestra/planner-override-precedence.test.ts's
 * proven `planSprint()` harness.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ResolvedConfig, Task, DebtItem, SprintSizeRecommendation } from '../../src/core/types.js';
import type { IntentType } from '../../src/core/routing-types.js';
import { ALL_INTENT_TYPES } from '../../src/core/routing-types.js';
import type { TaskEffort } from '../../src/core/task-types.js';

// ─── Mocks (mirrors planner-override-precedence.test.ts's proven harness) ──

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
  callBrainPlannerWithReason: vi.fn().mockReturnValue({ ok: false, reason: 'no_providers', message: 'not used' }),
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

const providerFixtures = vi.hoisted(() => {
  const claudeAdapter = { name: 'claude' as const, buildCommand: () => 'claude', isAvailable: async () => true };
  return { claudeAdapter };
});

vi.mock('../../src/core/provider.js', () => ({
  providerRegistry: {
    getDefault: vi.fn(() => providerFixtures.claudeAdapter),
    getProvider: vi.fn(() => providerFixtures.claudeAdapter),
    hasProvider: vi.fn(() => true),
    registerProvider: vi.fn(),
    listProviders: vi.fn(() => ['claude']),
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
        forceModel ?? 'sonnet',
    ),
  };
});

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return { ...actual, getNextSprintId: vi.fn().mockReturnValue('sprint-407-effort-tiering') };
});

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({ getByType: vi.fn().mockReturnValue([]), close: vi.fn() })),
}));

// ─── Imports under test ─────────────────────────────────────────────

import { planSprint } from '../../src/orchestra/sprint-planner.js';
import { resolveEffortTier } from '../../src/core/routing-engine.js';

// ─── Fixtures ────────────────────────────────────────────────────────

const ROOT = '/project-407-effort-tiering';

function makeConfig(routing?: Record<string, unknown>): ResolvedConfig {
  return {
    mode: 'performance',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'opus',
      haiku_allowed: true,
      brain_planning: 'structured',
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test-407-effort-tiering',
    projectRoot: ROOT,
    version: '0.1.0',
    brain_provider: 'claude',
    ...(routing ? { routing } : {}),
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

// One directive block per bucket in the task's own tiering table:
//   documentation/config → low · code-development/test/refactor → normal ·
//   security/migration/audit → high
// Keyword/scope choices are picked to score decisively for their intended
// intent (verified by hand against intent-classifier.ts's scoring — see
// the task .plan file) so the fixture is deterministic, not flaky.
const MULTI_TYPE_DIRECTIVES = [
  '# DIRECTIVES — Sprint 407 effort-tiering test',
  '',
  '## Task 1: Update README documentation guide',
  '- Files: docs/readme-notes.md',
  '',
  '### Description',
  'Update the documentation guide and readme content for the project.',
  '',
  '## Task 2: Update environment config settings',
  '- Files: src/core/config.ts',
  '',
  '### Description',
  'Config setting env option parameter defaults for the application.',
  '',
  '## Task 3: Security hardening for auth flow',
  '- Files: src/auth/session.ts',
  '',
  '### Description',
  'Harden security around the auth flow, close a vulnerability and review encryption and permission checks.',
  '',
  '## Task 4: Database schema migration for tenant tables',
  '- Files: src/core/schema-migrator.ts',
  '',
  '### Description',
  'Migrate and transform the tenant schema, upgrade to the new version.',
  '',
  '## Task 5: Refactor cleanup of legacy module',
  '- Files: src/core/legacy.ts',
  '',
  '### Description',
  'Refactor and cleanup the legacy module, restructure and simplify the code.',
  '',
  '## Task 6: Implement new adaptive timeout estimator',
  '- Files: src/orchestra/new-estimator.ts',
  '',
  '### Description',
  'Build a new engine module: implement an adaptive timeout estimator with validator checks.',
  '',
  '## Task 7: Fix flaky test regression sweep',
  '- Files: tests/core/flaky-suite.test.ts',
  '',
  '### Description',
  'Fix a flaky test regression sweep, stabilize the hermetic test suite.',
  '',
  '## Task 8: Audit report for routing coverage',
  '- Files: docs/audits/routing-coverage-407.md',
  '',
  '### Description',
  'Produce an audit report identifying coverage gaps in the routing engine.',
].join('\n');

// Same security-flavored task as Task 3 above, but with an explicit
// `- Effort: low` hint — must win over the derived 'high' tier.
const HINT_OVERRIDE_DIRECTIVES = [
  '# DIRECTIVES — Sprint 407 effort-tiering hint-precedence test',
  '',
  '## Task 1: Security hardening for auth flow',
  '- Files: src/auth/session.ts',
  '- Effort: low',
  '',
  '### Description',
  'Harden security around the auth flow, close a vulnerability and review encryption and permission checks.',
].join('\n');

const TASK_TITLES = [
  'Update README documentation guide',
  'Update environment config settings',
  'Security hardening for auth flow',
  'Database schema migration for tenant tables',
  'Refactor cleanup of legacy module',
  'Implement new adaptive timeout estimator',
  'Fix flaky test regression sweep',
  'Audit report for routing coverage',
] as const;

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

// ─── Tests ───────────────────────────────────────────────────────────

describe('born-636-K2 — resolveEffortTier() pure tip→effort table', () => {
  const EXPECTED_TIER: Record<IntentType, TaskEffort> = {
    documentation: 'low',
    config: 'low',
    security: 'high',
    migration: 'high',
    implementation: 'normal',
    bugfix: 'normal',
    refactor: 'normal',
    performance: 'normal',
    devops: 'normal',
    design: 'normal',
    architecture: 'normal',
    unknown: 'normal',
  };

  // Exhaustiveness guard: fails loudly if routing-types.ts's IntentType union
  // ever grows without this table being updated alongside it.
  it('covers every IntentType in ALL_INTENT_TYPES', () => {
    expect(Object.keys(EXPECTED_TIER).sort()).toEqual([...ALL_INTENT_TYPES].sort());
  });

  it.each(Object.entries(EXPECTED_TIER))('%s → %s', (intent, tier) => {
    expect(resolveEffortTier(intent as IntentType)).toBe(tier);
  });
});

describe('born-636-K2 — RED-evidence / flag-off byte-identical pin', () => {
  it('flag absent (config.routing undefined) → every task type resolves effort=normal', async () => {
    const sprint = await planSprint(ROOT, makeConfig(), makeContext(MULTI_TYPE_DIRECTIVES), recommendation, { mode: 'structured' });

    expect(sprint.tasks).toHaveLength(TASK_TITLES.length);
    for (const title of TASK_TITLES) {
      const t = sprint.tasks.find(x => x.title === title);
      expect(t, `task "${title}" not found`).toBeDefined();
      expect(t!.effort, `task "${title}" effort`).toBe('normal');
    }
  });

  it('flag explicitly false → identical to flag-absent (every task effort=normal)', async () => {
    const sprint = await planSprint(
      ROOT, makeConfig({ effort_tiering: false }), makeContext(MULTI_TYPE_DIRECTIVES), recommendation, { mode: 'structured' },
    );
    for (const title of TASK_TITLES) {
      const t = sprint.tasks.find(x => x.title === title);
      expect(t!.effort, `task "${title}" effort`).toBe('normal');
    }
  });
});

describe('born-636-K2 — flag-on: tip→effort table wired through planSprint', () => {
  it('resolves each task per the documentation/config→low · code-dev/test/refactor→normal · security/migration/audit→high table', async () => {
    const sprint = await planSprint(
      ROOT, makeConfig({ effort_tiering: true }), makeContext(MULTI_TYPE_DIRECTIVES), recommendation, { mode: 'structured' },
    );

    const byTitle = (title: string) => sprint.tasks.find(x => x.title === title);

    expect(byTitle('Update README documentation guide')!.effort).toBe('low');
    expect(byTitle('Update environment config settings')!.effort).toBe('low');
    expect(byTitle('Security hardening for auth flow')!.effort).toBe('high');
    expect(byTitle('Database schema migration for tenant tables')!.effort).toBe('high');
    expect(byTitle('Refactor cleanup of legacy module')!.effort).toBe('normal');
    expect(byTitle('Implement new adaptive timeout estimator')!.effort).toBe('normal');
    // test-dominant task: classifies as implementation OR bugfix depending on
    // keyword-score ordering (both map to 'normal') — asserting the OBSERVABLE
    // effort output, not the internal intent, keeps this robust to that detail.
    expect(byTitle('Fix flaky test regression sweep')!.effort).toBe('normal');
    // audit: scope-shape detection (docs/audits/*.md, single file, no source
    // dirs) overrides intent classification entirely → high, regardless of
    // what the title/description text would otherwise classify as.
    expect(byTitle('Audit report for routing coverage')!.effort).toBe('high');
  });
});

describe('born-636-K2 — hint precedence (404-003 chain, unchanged)', () => {
  it('flag ON + explicit `- Effort: low` on an otherwise-high-tier task → hint wins', async () => {
    const sprint = await planSprint(
      ROOT, makeConfig({ effort_tiering: true }), makeContext(HINT_OVERRIDE_DIRECTIVES), recommendation, { mode: 'structured' },
    );
    const t = sprint.tasks.find(x => x.title === 'Security hardening for auth flow');
    expect(t).toBeDefined();
    expect(t!.effort).toBe('low');
  });

  it('flag OFF + explicit `- Effort: low` → hint still wins (pre-existing behavior, untouched)', async () => {
    const sprint = await planSprint(
      ROOT, makeConfig(), makeContext(HINT_OVERRIDE_DIRECTIVES), recommendation, { mode: 'structured' },
    );
    const t = sprint.tasks.find(x => x.title === 'Security hardening for auth flow');
    expect(t).toBeDefined();
    expect(t!.effort).toBe('low');
  });
});
