/**
 * RUN-POLICY-DELIVERY-001 correction-2 — plan→disk persistence proof.
 *
 * The run-policy snapshot must be stamped BEFORE the first task-JSON
 * persistence inside planSprint: the on-disk task file is what workers are
 * spawned from, so a post-persistence stamp delivers nothing at runtime.
 * This suite runs the REAL planSprint structured path with REAL fs into a
 * tmpdir (heavy planner/provider/pool modules mocked exactly like the
 * established planner harness — fs deliberately NOT mocked) and asserts the
 * persisted bytes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  callBrainPlannerWithReason: vi.fn().mockReturnValue({ ok: false, data: null }),
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

const providerFixtures = vi.hoisted(() => {
  const claudeAdapter = { name: 'claude' as const, buildCommand: () => 'claude', isAvailable: async () => true };
  return { claudeAdapter, registered: new Map([['claude', claudeAdapter]]) };
});

vi.mock('../../src/core/provider.js', () => ({
  orderedRoleProviders: vi.fn((role: 'brain' | 'worker' | 'auditor') => ({
    role, primary: 'claude', fallbacks: [], unattended: true,
  })),
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

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({ getByType: vi.fn().mockReturnValue([]), close: vi.fn() })),
}));

import { planSprint } from '../../src/orchestra/sprint-planner.js';
import {
  resolveRunPolicyFromDirectives,
  RUN_POLICY_DIRECTIVES_SECTION,
} from '../../src/orchestra/run-policy-resolver.js';
import type { ResolvedConfig, Task, DebtItem, SprintSizeRecommendation } from '../../src/core/types.js';

function makeConfig(projectRoot: string): ResolvedConfig {
  return {
    mode: 'performance',
    activeModeConfig: {
      max_workers: 2,
      brain_model: 'claude-sonnet-5',
      default_model: 'claude-sonnet-5',
      haiku_allowed: true,
      brain_planning: 'structured',
    },
    modes: {} as never,
    language: 'en',
    projectName: 'run-policy-persistence',
    projectRoot,
    version: '0.1.0',
    brain_provider: 'claude',
    prompt: {
      codex_core_channel: true,
      codex_suppress_project_doc: true,
      catalog_mount_mask: true,
    },
  } as unknown as ResolvedConfig;
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
  maxWorkers: 2,
  modelConstraint: null,
  reason: 'normal',
};

const CONTRACT_DIRECTIVES = [
  '# DIRECTIVES — run-policy persistence proof',
  '',
  RUN_POLICY_DIRECTIVES_SECTION,
  '',
  '- No build or repository-wide test run during the sprint.',
  '- Effective concurrency is one.',
  '',
  '## Task 1: Carry the policy',
  '- Files: src/foo.ts',
  '- Scope: src/',
  '',
  '### Description',
  'Persisted task must carry the digest-bound run policy.',
].join('\n');

const NO_CONTRACT_DIRECTIVES = [
  '# DIRECTIVES — policy-free run',
  '',
  '## Task 1: Plain Task',
  '- Files: src/bar.ts',
  '- Scope: src/',
  '',
  '### Description',
  'A run that declares no execution contract.',
].join('\n');

describe('correction-2 — run policy is stamped BEFORE first task-JSON persistence', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), 'deckent-rp-persist-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function readPersistedTasks(): Array<Record<string, unknown>> {
    const dir = join(root, '.tasks');
    return readdirSync(dir)
      .filter(f => /^task-.*\.json$/.test(f))
      .map(f => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as Record<string, unknown>);
  }

  it('real planSprint (structured) persists every task JSON with the digest-bound snapshot', async () => {
    const expected = resolveRunPolicyFromDirectives(CONTRACT_DIRECTIVES)!;
    const sprint = await planSprint(root, makeConfig(root), makeContext(CONTRACT_DIRECTIVES), recommendation, { mode: 'structured' });
    expect(sprint.tasks.length).toBeGreaterThan(0);

    const persisted = readPersistedTasks();
    expect(persisted.length).toBe(sprint.tasks.length);
    for (const diskTask of persisted) {
      expect(diskTask.runPolicy).toMatchObject({
        version: 1,
        policyDigest: expected.policyDigest,
        constraints: [...expected.constraints],
      });
      expect(diskTask.promptCostCanary).toMatchObject({
        version: 1,
        logicalLineageId: expect.stringMatching(/^prompt-cost-lineage:sha256:[a-f0-9]{64}$/u),
        workloadDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
        featureDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
        authorityDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
        featureSnapshot: {
          codexCoreChannel: true,
          codexSuppressProjectDoc: true,
          catalogMountMask: true,
        },
      });
    }
  });

  it('a run without an Execution Contract persists tasks with NO runPolicy field (explicit absence)', async () => {
    const sprint = await planSprint(root, makeConfig(root), makeContext(NO_CONTRACT_DIRECTIVES), recommendation, { mode: 'structured' });
    expect(sprint.tasks.length).toBeGreaterThan(0);
    for (const diskTask of readPersistedTasks()) {
      expect(diskTask.runPolicy).toBeUndefined();
      expect(diskTask.promptCostCanary).toBeDefined();
    }
  });
});
