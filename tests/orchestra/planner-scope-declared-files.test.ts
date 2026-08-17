import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({
    status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
  }),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  detectDeadlocks: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/orchestra/planner.js', () => ({
  resolvePlanTimeoutMs: vi.fn(() => 900_000),
  createPlannerTaskModelPolicy: vi.fn((defaultModel: string) => ({
    defaultModel,
    allowedModels: [defaultModel],
  })),
  callBrainPlannerWithReason: vi.fn().mockReturnValue({ ok: false, data: null }),
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

const providerFixtures = vi.hoisted(() => {
  const adapter = {
    name: 'claude' as const,
    buildCommand: () => 'claude',
    isAvailable: async () => true,
  };
  return { adapter };
});

vi.mock('../../src/core/provider.js', () => ({
  orderedRoleProviders: vi.fn((role: 'brain' | 'worker' | 'auditor') => ({
    role, primary: 'claude', fallbacks: [], unattended: true,
  })),
  providerRegistry: {
    getDefault: vi.fn(() => providerFixtures.adapter),
    getProvider: vi.fn(() => providerFixtures.adapter),
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
  detectFullStack: vi.fn().mockReturnValue({
    language: '', framework: '', buildTool: '', testFramework: '',
    commands: { build: '', test: '', lint: '' },
  }),
}));

vi.mock('../../src/orchestra/model-selector.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/model-selector.js')>();
  return {
    ...actual,
    resolveTaskModel: vi.fn(
      (_title: string, _description: string, _scope: unknown, _config: unknown,
        _patterns: unknown, forced?: string) => forced ?? 'claude-sonnet-5',
    ),
  };
});

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({
    getByType: vi.fn().mockReturnValue([]),
    close: vi.fn(),
  })),
}));

import { planSprint } from '../../src/orchestra/sprint-planner.js';
import type {
  BrainContext,
  DebtItem,
  ResolvedConfig,
  SprintSizeRecommendation,
  Task,
} from '../../src/core/types.js';

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
    projectName: 'declared-files-scope',
    projectRoot,
    version: '0.1.0',
    brain_provider: 'claude',
    debt_preflight_enabled: false,
  } as unknown as ResolvedConfig;
}

function makeContext(directives: string): BrainContext {
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

describe('structured planner declared-file write authority', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), 'deckent-declared-scope-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('keeps existing and not-yet-existing declared files without adding undeclared paths', async () => {
    const existing = 'src/orchestra/existing.ts';
    const future = 'tests/orchestra/future.test.ts';
    const existingPath = join(root, existing);
    mkdirSync(dirname(existingPath), { recursive: true });
    writeFileSync(existingPath, 'export {};\n');

    const directives = [
      '# DIRECTIVES',
      '',
      '## Task 1: Preserve declared write authority',
      `- Files: ${existing}, ${future}, ${future}`,
      '- Scope: src/orchestra/, tests/orchestra/',
      '',
      '### Description',
      'Plan both declared targets without inferring another file.',
    ].join('\n');

    const sprint = await planSprint(
      root,
      makeConfig(root),
      makeContext(directives),
      recommendation,
      { mode: 'structured', dryRun: true },
    );

    expect(sprint.tasks).toHaveLength(1);
    expect(sprint.tasks[0]?.scope.filesWrite).toEqual([existing, future]);
    expect(sprint.tasks[0]?.scope.filesWrite).not.toContain('src/orchestra/undeclared.ts');
  });

  it('preserves directory-only scope without inventing file authority', async () => {
    const directives = [
      '# DIRECTIVES',
      '',
      '## Task 1: Directory-only authority',
      '- Scope: src/orchestra/, tests/orchestra/',
      '',
      '### Description',
      'Keep the established directory fallback.',
    ].join('\n');

    const sprint = await planSprint(
      root,
      makeConfig(root),
      makeContext(directives),
      recommendation,
      { mode: 'structured', dryRun: true },
    );

    expect(sprint.tasks).toHaveLength(1);
    expect(sprint.tasks[0]?.scope.directories).toEqual([
      'src/orchestra/',
      'tests/orchestra/',
    ]);
    expect(sprint.tasks[0]?.scope.filesWrite).toEqual([]);
  });
});
