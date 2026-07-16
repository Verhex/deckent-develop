/**
 * born-479 / 362-002 MODEL-DROP-FIX — `- Model:` directive override drop repro + fix proof.
 *
 * Sprint-361 Task 5 (CODEX-RETRY-RCA, confirmed via `git log -p -- DIRECTIVES.md`) used:
 *   - Model: gpt-5
 *   - Backend: subprocess
 * with NO explicit `- Provider:` line. The written task JSON ended up with
 * `model: 'opus'` while `provider` was (correctly) later inferred as `'codex'` by
 * task-router.ts from the still-intact `forceModel`.
 *
 * Root cause: `planSprint()`'s structured-fallback loop
 * (`src/orchestra/sprint-planner.ts`) called
 *   resolveTaskModel(..., src.forceModel, undefined, src.provider)
 * with `src.provider === undefined`. `resolveTaskModel` defaults the target provider to
 * the registry default ('claude') when no provider is given, sees `gpt-5` unavailable for
 * claude, and silently remaps it to the claude equivalent ('opus') via getEquivalentModel.
 * `recommendation.modelConstraint ??` had the identical silent-override risk.
 *
 * Unlike `planner-override-precedence.test.ts` (which mocks `model-selector.js` with a
 * `forceModel ?? 'sonnet'` stub and therefore cannot observe this bug), this file keeps
 * `resolveTaskModel` / `model-registry` REAL so the cross-provider remap actually fires.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ResolvedConfig, Task, DebtItem, SprintSizeRecommendation } from '../../src/core/types.js';

// ─── Mocks (fs/process/planner/provider-registry/pools — everything EXCEPT
//      model-selector.js / model-registry.ts, which must stay real) ──────────

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
  callBrainPlannerWithReason: vi.fn().mockReturnValue({
    ok: false,
    reason: 'not_used_in_structured_mode',
    message: 'AI planner not exercised by this test suite',
  }),
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

const providerFixtures = vi.hoisted(() => {
  const claudeAdapter = { name: 'claude' as const, buildCommand: () => 'claude', isAvailable: async () => true };
  const codexAdapter = { name: 'codex' as const, buildCommand: () => 'codex', isAvailable: async () => true };
  const registered = new Map<string, typeof claudeAdapter | typeof codexAdapter>([
    ['claude', claudeAdapter],
    ['codex', codexAdapter],
  ]);
  return { claudeAdapter, codexAdapter, registered };
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

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return { ...actual, getNextSprintId: vi.fn().mockReturnValue('sprint-362') };
});

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({ getByType: vi.fn().mockReturnValue([]), close: vi.fn() })),
}));

// NOTE: no mock for '../../src/orchestra/model-selector.js' — resolveTaskModel and the
// model-registry it delegates to must run for real to reproduce/prove the fix.

// ─── Import under test ────────────────────────────────────────────

import { planSprint } from '../../src/orchestra/sprint-planner.js';

// ─── Fixtures ─────────────────────────────────────────────────────

const ROOT = '/project-362';

function makeConfig(): ResolvedConfig {
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
    projectName: 'test-362',
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

function makeRecommendation(modelConstraint: SprintSizeRecommendation['modelConstraint'] = null): SprintSizeRecommendation {
  return { size: 'full', maxWorkers: 4, modelConstraint, reason: 'test' };
}

// Reconstructs sprint-361 Task 5 (CODEX-RETRY-RCA) exactly: `- Model: gpt-5` +
// `- Backend: subprocess`, NO `- Provider:` line — the born-479 repro shape.
const GPT5_NO_PROVIDER_DIRECTIVES = [
  '# DIRECTIVES — born-479 repro',
  '',
  '## Task 1: CODEX-RETRY-RCA — codex-timeout kok-analizi',
  '- Model: gpt-5',
  '- Backend: subprocess',
  '- Files: docs/analysis/repro.md',
  '- Scope: docs/analysis/',
  '',
  '### Description',
  'Repro fixture for born-479.',
].join('\n');

const GPT5_WITH_PROVIDER_DIRECTIVES = [
  '# DIRECTIVES — explicit provider control',
  '',
  '## Task 1: CODEX-RETRY-RCA — explicit provider',
  '- Provider: codex',
  '- Model: gpt-5',
  '- Backend: subprocess',
  '- Files: docs/analysis/repro.md',
  '- Scope: docs/analysis/',
  '',
  '### Description',
  'Explicit-provider control case.',
].join('\n');

function haikuDirectives(): string {
  return [
    '# DIRECTIVES — haiku regression',
    '',
    '## Task 1: Haiku Override Task',
    '- Model: haiku',
    '- Files: docs/analysis/haiku.md',
    '- Scope: docs/analysis/',
    '',
    '### Description',
    'Haiku override regression.',
  ].join('\n');
}

function fableDirectives(): string {
  return [
    '# DIRECTIVES — fable regression',
    '',
    '## Task 1: Fable Override Task',
    '- Model: fable',
    '- Files: docs/analysis/fable.md',
    '- Scope: docs/analysis/',
    '',
    '### Description',
    'Fable override regression.',
  ].join('\n');
}

// `- Provider: claude` + `- Model: gpt-5` is an explicit, contradictory combo
// (gpt-5 is a codex-only catalog entry). This is the one shape that survives
// task-builder.ts's parse-time gate while still being "unavailable for the
// stated provider" — every other "unknown model" shape (no provider + a
// non-catalog id, or explicit non-adapter provider + a non-catalog id) is
// already dropped to `forceModel: undefined` upstream in task-builder.ts
// (see tests/orchestra/task-builder-ollama-flow.test.ts), which is out of
// this task's write scope and unaffected by this fix.
const CONTRADICTORY_PROVIDER_MODEL_DIRECTIVES = [
  '# DIRECTIVES — contradictory provider+model',
  '',
  '## Task 1: Contradictory Combo Task',
  '- Provider: claude',
  '- Model: gpt-5',
  '- Files: docs/analysis/contradictory.md',
  '- Scope: docs/analysis/',
  '',
  '### Description',
  'Explicit provider/model mismatch — forceModel must still win verbatim.',
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

describe('born-479 — forceModel must always win (no silent drop)', () => {
  it('repro/fix proof: `- Model: gpt-5` with NO `- Provider:` line resolves to gpt-5, not opus', async () => {
    const sprint = await planSprint(
      ROOT, makeConfig(), makeContext(GPT5_NO_PROVIDER_DIRECTIVES), makeRecommendation(), { mode: 'structured' },
    );
    const t = sprint.tasks.find((x) => x.title.startsWith('CODEX-RETRY-RCA'));
    expect(t).toBeDefined();
    expect(t!.forceModel).toBe('gpt-5');
    // Pre-fix this was 'opus' (resolveTaskModel defaulted provider to claude,
    // gpt-5 unavailable there, silently remapped to the claude equivalent).
    expect(t!.model).toBe('gpt-5');
  });

  it('explicit `- Provider: codex` + `- Model: gpt-5` still resolves to gpt-5 (no regression)', async () => {
    const sprint = await planSprint(
      ROOT, makeConfig(), makeContext(GPT5_WITH_PROVIDER_DIRECTIVES), makeRecommendation(), { mode: 'structured' },
    );
    const t = sprint.tasks.find((x) => x.title.startsWith('CODEX-RETRY-RCA'));
    expect(t).toBeDefined();
    expect(t!.provider).toBe('codex');
    expect(t!.forceModel).toBe('gpt-5');
    expect(t!.model).toBe('gpt-5');
  });

  it('recommendation.modelConstraint set does NOT override a forceModel directive', async () => {
    const sprint = await planSprint(
      ROOT, makeConfig(), makeContext(GPT5_NO_PROVIDER_DIRECTIVES), makeRecommendation('sonnet'), { mode: 'structured' },
    );
    const t = sprint.tasks.find((x) => x.title.startsWith('CODEX-RETRY-RCA'));
    expect(t).toBeDefined();
    expect(t!.forceModel).toBe('gpt-5');
    expect(t!.model).toBe('gpt-5');
  });

  it('regression: `- Model: haiku` (no provider) resolves to haiku verbatim', async () => {
    const sprint = await planSprint(
      ROOT, makeConfig(), makeContext(haikuDirectives()), makeRecommendation(), { mode: 'structured' },
    );
    const t = sprint.tasks.find((x) => x.title === 'Haiku Override Task');
    expect(t).toBeDefined();
    expect(t!.forceModel).toBe('haiku');
    expect(t!.model).toBe('haiku');
  });

  it('regression: `- Model: fable` (no provider) resolves to fable verbatim', async () => {
    const sprint = await planSprint(
      ROOT, makeConfig(), makeContext(fableDirectives()), makeRecommendation(), { mode: 'structured' },
    );
    const t = sprint.tasks.find((x) => x.title === 'Fable Override Task');
    expect(t).toBeDefined();
    expect(t!.forceModel).toBe('fable');
    expect(t!.model).toBe('fable');
  });

  it('explicit contradictory `- Provider: claude` + `- Model: gpt-5`: forceModel still wins verbatim (not remapped to opus)', async () => {
    const sprint = await planSprint(
      ROOT, makeConfig(), makeContext(CONTRADICTORY_PROVIDER_MODEL_DIRECTIVES), makeRecommendation(), { mode: 'structured' },
    );
    const t = sprint.tasks.find((x) => x.title === 'Contradictory Combo Task');
    expect(t).toBeDefined();
    expect(t!.provider).toBe('claude');
    expect(t!.forceModel).toBe('gpt-5');
    // gpt-5 IS in the global catalog (just not available for claude specifically) —
    // preserved verbatim, not silently remapped to the claude tier-equivalent (opus).
    expect(t!.model).toBe('gpt-5');
  });
});
