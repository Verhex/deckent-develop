/**
 * Sprint 238 İŞ1 (+ 429-007 PLNR2) — Per-task provider/model/agent/skills override
 * precedence.
 *
 * When DIRECTIVES carry explicit per-task `- Provider:` / `- Model:` / `- Agent:` /
 * `- Skills:` overrides, those are deterministic routing decisions that MUST be
 * honored exactly. AI planning cannot guarantee a 1:1 directive→task mapping, so
 * `planSprint()` routes to structured planning in ANY mode whenever such overrides
 * are present.
 *
 * Contract (asserted on the OUTCOME — the produced task JSON — not the internal
 * planning mode, per design review):
 *  - mode='ai'  + `- Provider: ollama` override → task.provider==='ollama' (AI
 *    planner result is NOT used; the AI-only task title is absent).
 *  - mode='auto' + override → same.
 *  - mode='structured' + override → same (regression baseline; already worked).
 *  - mode='ai' WITHOUT override → AI path still runs (precedence does not hijack
 *    normal AI planning).
 *  - mode='ai'/'auto' + an `- Agent:`/`- Skills:`-ONLY override (no Provider/Model)
 *    → ALSO honored exactly via structured planning (429-007 PLNR2 — the original
 *    guard only checked provider/forceModel, so an Agent/Skills-only directive
 *    silently fell through to the AI planner and the override was lost).
 *
 * Hermetic: provider/spawn/fs/model-selector mocked, no disk I/O, no network.
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

// AI planner ALWAYS returns a valid (non-ollama) result. If the precedence rule
// failed, mode=ai/auto would surface this 'AI Planned Task' WITHOUT a provider —
// the assertions below catch exactly that.
vi.mock('../../src/orchestra/planner.js', () => ({
  resolvePlanTimeoutMs: vi.fn(() => 900_000), // F-2: sprint-planner/do.ts resolve the plan timeout through this
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
  const ollamaAdapter = { name: 'ollama' as const, buildCommand: () => 'ollama', isAvailable: async () => true };
  const registered = new Map<string, typeof claudeAdapter | typeof ollamaAdapter>([
    ['claude', claudeAdapter],
    ['ollama', ollamaAdapter],
  ]);
  return { claudeAdapter, ollamaAdapter, registered };
});

vi.mock('../../src/core/provider.js', () => ({
  providerRegistry: {
    getDefault: vi.fn(() => providerFixtures.claudeAdapter),
    getProvider: vi.fn((name: string) => providerFixtures.registered.get(name) ?? providerFixtures.claudeAdapter),
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

// resolveTaskModel: mirror the real adapter-provider behaviour (pass forceModel
// through) so the test is deterministic and independent of the global registry.
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
  return { ...actual, getNextSprintId: vi.fn().mockReturnValue('sprint-238') };
});

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({ getByType: vi.fn().mockReturnValue([]), close: vi.fn() })),
}));

// ─── Imports under test ───────────────────────────────────────────

import { planSprint } from '../../src/orchestra/sprint-planner.js';
import * as notifyModule from '../../src/core/notify.js';

// ─── Fixtures ─────────────────────────────────────────────────────

const ROOT = '/project-238';

function makeConfig(): ResolvedConfig {
  return {
    mode: 'performance',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'opus',
      haiku_allowed: true,
      brain_planning: 'auto',
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test-238',
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

// DIRECTIVES with an explicit per-task ollama provider + model override.
const OLLAMA_DIRECTIVES = [
  '# DIRECTIVES — Sprint 238 test',
  '',
  '## Task 1: Local Ollama Worker Task',
  '- Provider: ollama',
  '- Model: qwen3.6:27b',
  '- Files: src/foo.ts',
  '- Scope: src/',
  '',
  '### Description',
  'Do something on the local model.',
].join('\n');

// DIRECTIVES with NO per-task provider/model override (plain goals).
const PLAIN_DIRECTIVES = [
  '# DIRECTIVES — Sprint 238 test',
  '',
  '## Task 1: Plain Task',
  '- Files: src/bar.ts',
  '- Scope: src/',
  '',
  '### Description',
  'A task with no provider override.',
].join('\n');

// DIRECTIVES with an Agent/Skills-ONLY override — deliberately NO `- Provider:`/
// `- Model:` line, to reproduce the 429-007 PLNR2 (Bug-2) gap.
const AGENT_SKILLS_DIRECTIVES = [
  '# DIRECTIVES — Sprint 429 test',
  '',
  '## Task 1: Agent Skills Only Task',
  '- Agent: security-auditor',
  '- Skills: typescript-expert, ci-testing',
  '- Files: src/baz.ts',
  '- Scope: src/',
  '',
  '### Description',
  'A task with only Agent/Skills overrides (no Provider/Model).',
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

describe('Sprint 238 İŞ1 — per-task provider/model override precedence', () => {
  it('mode=ai + ollama override → honored exactly via structured (AI result NOT used)', async () => {
    const sprint = await planSprint(ROOT, makeConfig(), makeContext(OLLAMA_DIRECTIVES), recommendation, { mode: 'ai' });

    const t = sprint.tasks.find((x) => x.title === 'Local Ollama Worker Task');
    expect(t).toBeDefined();
    expect(t!.provider).toBe('ollama');
    expect(t!.forceModel).toBe('qwen3.6:27b');
    expect(t!.model).toBe('qwen3.6:27b');
    // AI-only task must be absent — proves the AI planner output was bypassed.
    expect(sprint.tasks.some((x) => x.title === 'AI Planned Task')).toBe(false);
    expect(sprint.plannerProof).toMatchObject({
      requestedMode: 'ai',
      actualMode: 'structured',
      resolutionReason: 'directive-routing-override',
      directiveOverrideKinds: ['provider', 'model'],
      call: { attempted: false, succeeded: false, failureReason: null },
    });
  });

  it('mode=auto + ollama override → honored exactly', async () => {
    const sprint = await planSprint(ROOT, makeConfig(), makeContext(OLLAMA_DIRECTIVES), recommendation, { mode: 'auto' });

    const t = sprint.tasks.find((x) => x.title === 'Local Ollama Worker Task');
    expect(t).toBeDefined();
    expect(t!.provider).toBe('ollama');
    expect(t!.forceModel).toBe('qwen3.6:27b');
    expect(sprint.tasks.some((x) => x.title === 'AI Planned Task')).toBe(false);
  });

  it('mode=structured + ollama override → honored exactly (regression baseline)', async () => {
    const sprint = await planSprint(ROOT, makeConfig(), makeContext(OLLAMA_DIRECTIVES), recommendation, { mode: 'structured' });

    const t = sprint.tasks.find((x) => x.title === 'Local Ollama Worker Task');
    expect(t).toBeDefined();
    expect(t!.provider).toBe('ollama');
    expect(t!.forceModel).toBe('qwen3.6:27b');
  });

  it('mode=ai WITHOUT override → AI planning still runs (precedence does not hijack normal AI)', async () => {
    const sprint = await planSprint(ROOT, makeConfig(), makeContext(PLAIN_DIRECTIVES), recommendation, { mode: 'ai' });

    // No explicit provider/model → AI path is taken → AI-only task present.
    expect(sprint.tasks.some((x) => x.title === 'AI Planned Task')).toBe(true);
  });

  it('mode=ai + Agent/Skills-ONLY override (no Provider/Model) → honored exactly via structured (429-007 PLNR2 regression)', async () => {
    const notifySpy = vi.spyOn(notifyModule, 'notify').mockResolvedValue(undefined);

    const sprint = await planSprint(ROOT, makeConfig(), makeContext(AGENT_SKILLS_DIRECTIVES), recommendation, { mode: 'ai' });

    const t = sprint.tasks.find((x) => x.title === 'Agent Skills Only Task');
    expect(t).toBeDefined();
    expect(t!.forceAgent).toBe('security-auditor');
    expect(t!.forceSkills).toEqual(['typescript-expert', 'ci-testing']);
    // AI-only task must be absent — proves the AI planner output was bypassed.
    expect(sprint.tasks.some((x) => x.title === 'AI Planned Task')).toBe(false);
    // The structured-override notify fires in mode='ai' regardless of WHICH
    // override field (provider/model/agent/skills) triggered it.
    expect(notifySpy).toHaveBeenCalledWith(
      'phase-change', 'sprint-238', '[Brain] plan:structured-override',
      expect.stringContaining('agent/skills'),
    );

    notifySpy.mockRestore();
  });

  it('mode=auto + Agent/Skills-ONLY override → honored exactly', async () => {
    const sprint = await planSprint(ROOT, makeConfig(), makeContext(AGENT_SKILLS_DIRECTIVES), recommendation, { mode: 'auto' });

    const t = sprint.tasks.find((x) => x.title === 'Agent Skills Only Task');
    expect(t).toBeDefined();
    expect(t!.forceAgent).toBe('security-auditor');
    expect(t!.forceSkills).toEqual(['typescript-expert', 'ci-testing']);
    expect(sprint.tasks.some((x) => x.title === 'AI Planned Task')).toBe(false);
  });
});
