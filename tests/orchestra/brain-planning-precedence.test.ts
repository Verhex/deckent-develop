/**
 * Task 429-006 (PLNR1) — brain_planning top-level precedence (eski-🔴 Bug-1).
 *
 * Root cause: DEFAULT_MODES hardcodes `brain_planning: 'auto'` in all 4 presets
 * (config.ts), and `ResolvedConfig` had no top-level `brain_planning` field —
 * sprint-planner.ts read ONLY `config.activeModeConfig.brain_planning`, so a
 * user's top-level `{"brain_planning": "structured"}` (advertised as a real
 * setting by `deckent init` templates) was silently ignored.
 *
 * Fix: `resolveBrainPlanningMode()` (config.ts) resolves with precedence
 *   explicit top-level `config.brain_planning` > `activeModeConfig.brain_planning`
 *   (preset) > 'auto', and sprint-planner.ts now calls it instead of reading the
 *   preset field directly.
 *
 * This file covers:
 *  1. The pure resolver across all 4 real presets (performance/balanced/economic/api)
 *     — both the "top-level absent → today's behavior preserved" case and the
 *     "explicit top-level wins" case.
 *  2. The deckent-dev manual-mask regression (this project's own `.deckent/config.json`
 *     has both a top-level AND a `modes.performance.brain_planning` set to
 *     'structured' — the fix must not change that outcome).
 *  3. An integration test through the real `planSprint()` call site proving the
 *     wiring (not just the pure function) is correct end-to-end.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  ResolvedConfig, Task, DebtItem, SprintSizeRecommendation, PlanMode, BrainPlanningMode,
} from '../../src/core/types.js';

// ─── Mocks (only exercised by the planSprint integration section) ──────────

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

// AI planner ALWAYS returns a valid result when invoked — its presence in the
// output task list is the signal that the AI path (not structured) was taken.
vi.mock('../../src/orchestra/planner.js', () => ({
  callBrainPlannerWithReason: vi.fn().mockReturnValue({
    ok: true,
    data: {
      tasks: [
        {
          title: 'AI Planned Task',
          description: 'From AI',
          model: 'sonnet',
          effort: 'normal',
          priority: 'NORMAL',
          reason: 'AI decided',
          scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
          dependencies: [],
          goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
        },
      ],
      reasoning: 'AI plan rationale',
    },
  }),
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
    hasProvider: vi.fn().mockReturnValue(true),
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
  return { ...actual, getNextSprintId: vi.fn().mockReturnValue('sprint-429-006') };
});

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({ getByType: vi.fn().mockReturnValue([]), close: vi.fn() })),
}));

// ─── Imports under test ─────────────────────────────────────────────────────

import { planSprint } from '../../src/orchestra/sprint-planner.js';
import { resolveBrainPlanningMode, DEFAULT_MODES } from '../../src/core/config.js';

// ─── Part 1 — pure resolveBrainPlanningMode precedence ──────────────────────

const PRESET_NAMES: PlanMode[] = ['performance', 'balanced', 'economic', 'api'];

function baseResolvedConfig(mode: PlanMode, brainPlanningTopLevel?: BrainPlanningMode): ResolvedConfig {
  return {
    mode,
    activeModeConfig: { ...DEFAULT_MODES[mode] },
    modes: DEFAULT_MODES,
    language: 'en',
    projectName: 'test-429-006',
    projectRoot: '/test-429-006',
    version: '0.1.0',
    brain_planning: brainPlanningTopLevel,
  } as ResolvedConfig;
}

describe('429-006 PLNR1 — resolveBrainPlanningMode (pure precedence, four-preset coverage)', () => {
  it.each(PRESET_NAMES)(
    'top-level absent → preset "%s" own brain_planning is preserved (today\'s behavior)',
    (mode) => {
      const config = baseResolvedConfig(mode);
      expect(config.brain_planning).toBeUndefined();
      // Today all 4 DEFAULT_MODES presets hardcode 'auto' — asserted against the
      // actual DEFAULT_MODES value (not a literal) so this locks in real source
      // of truth, not a duplicated assumption.
      expect(resolveBrainPlanningMode(config)).toBe(DEFAULT_MODES[mode]!.brain_planning);
    },
  );

  it.each(PRESET_NAMES)(
    'explicit top-level "structured" overrides preset "%s" even when the preset itself is \'auto\'',
    (mode) => {
      const config = baseResolvedConfig(mode, 'structured');
      // Sanity: the preset's own value stays 'auto' (untouched) — proves the
      // override is genuinely coming from the top-level field, not a fixture fluke.
      expect(config.activeModeConfig.brain_planning).toBe('auto');
      expect(resolveBrainPlanningMode(config)).toBe('structured');
    },
  );

  it('deckent-dev manual-mask regression: top-level="structured" + modes.performance.brain_planning="structured" (both explicit, agreeing) → still "structured"', () => {
    // Mirrors this project's own .deckent/config.json: before this fix, only the
    // manual modes.performance.brain_planning mask made 'structured' planning
    // actually happen (the top-level field was dead). After the fix both agree,
    // so the observable outcome for deckent-dev itself must not change.
    const config = baseResolvedConfig('performance', 'structured');
    config.activeModeConfig = { ...config.activeModeConfig, brain_planning: 'structured' };
    expect(resolveBrainPlanningMode(config)).toBe('structured');
  });

  it('both top-level and preset brain_planning absent → falls back to "auto"', () => {
    const config = baseResolvedConfig('performance');
    config.activeModeConfig = { ...config.activeModeConfig, brain_planning: undefined };
    expect(resolveBrainPlanningMode(config)).toBe('auto');
  });
});

// ─── Part 2 — planSprint() integration (real sprint-planner.ts wiring) ──────

const ROOT = '/project-429-006';

function makePlanSprintConfig(activePlanning: BrainPlanningMode, topLevelPlanning?: BrainPlanningMode): ResolvedConfig {
  return {
    mode: 'performance',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'opus',
      haiku_allowed: true,
      brain_planning: activePlanning,
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test-429-006',
    projectRoot: ROOT,
    version: '0.1.0',
    brain_provider: 'claude',
    brain_planning: topLevelPlanning,
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

// No per-task provider/model override — keeps the "structured directive override"
// precedence rule (Sprint 238 İŞ1) out of the way so ONLY the brain_planning
// precedence under test drives which path (AI vs structured) is taken.
const PLAIN_DIRECTIVES = [
  '# DIRECTIVES — Sprint 429-006 test',
  '',
  '## Task 1: Plain Task',
  '- Files: src/bar.ts',
  '- Scope: src/',
  '',
  '### Description',
  'A task with no provider override.',
].join('\n');

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('429-006 PLNR1 — planSprint() wiring (integration, no options.mode override)', () => {
  it('preset=structured, top-level absent → structured path taken (today\'s behavior preserved, AI planner NOT invoked)', async () => {
    const sprint = await planSprint(ROOT, makePlanSprintConfig('structured'), makeContext(PLAIN_DIRECTIVES), recommendation);

    expect(sprint.tasks.some((t) => t.title === 'AI Planned Task')).toBe(false);
    expect(sprint.tasks.some((t) => t.title === 'Plain Task')).toBe(true);
  });

  it('preset=structured, top-level="ai" (explicit override) → AI path taken (the original bug: this used to be silently ignored)', async () => {
    const sprint = await planSprint(ROOT, makePlanSprintConfig('structured', 'ai'), makeContext(PLAIN_DIRECTIVES), recommendation);

    expect(sprint.tasks.some((t) => t.title === 'AI Planned Task')).toBe(true);
  });

  it('preset=ai, top-level absent → AI path still taken (preset-only behavior unchanged)', async () => {
    const sprint = await planSprint(ROOT, makePlanSprintConfig('ai'), makeContext(PLAIN_DIRECTIVES), recommendation);

    expect(sprint.tasks.some((t) => t.title === 'AI Planned Task')).toBe(true);
  });
});
