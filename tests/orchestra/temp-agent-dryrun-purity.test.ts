import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BrainContext,
  DebtItem,
  ResolvedConfig,
  SprintSizeRecommendation,
  Task,
} from '../../src/core/types.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
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
  callBrainPlannerWithReason: vi.fn().mockReturnValue({
    ok: false,
    reason: 'no_providers',
    message: 'not used in structured mode',
  }),
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn().mockReturnValue({
    language: 'TypeScript',
    framework: 'React',
    buildTool: 'vite',
    testFramework: 'vitest',
    dependencies: ['react', 'typescript'],
    detectedAt: '2026-08-25T00:00:00.000Z',
  }),
  detectFullStack: vi.fn().mockReturnValue({
    language: 'TypeScript',
    framework: 'React',
    buildTool: 'vite',
    testFramework: 'vitest',
    commands: {},
  }),
}));

vi.mock('../../src/core/provider.js', () => ({
  providerRegistry: {
    getDefault: vi.fn(),
    getProvider: vi.fn(),
    hasProvider: vi.fn().mockReturnValue(false),
    registerProvider: vi.fn(),
    listProviders: vi.fn().mockReturnValue([]),
    setDefault: vi.fn(),
  },
  ProviderError: class ProviderError extends Error {},
  getProviderForModel: vi.fn().mockReturnValue('claude'),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return { ...actual, getNextSprintId: vi.fn().mockReturnValue('sprint-677') };
});

import { planSprint } from '../../src/orchestra/sprint-planner.js';

const recommendation: SprintSizeRecommendation = {
  size: 'full',
  maxWorkers: 1,
  modelConstraint: null,
  reason: 'fixture',
};

function makeConfig(projectRoot: string): ResolvedConfig {
  return {
    mode: 'performance',
    activeModeConfig: {
      max_workers: 1,
      brain_model: 'claude-sonnet-5',
      default_model: 'claude-sonnet-5',
      haiku_allowed: true,
      brain_planning: 'structured',
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: 'temp-agent-purity',
    projectRoot,
    version: '0.1.0',
    brain_provider: 'claude',
  } as ResolvedConfig;
}

function makeContext(): BrainContext {
  return {
    directives: '# Goal\n\n- Exercise temp-agent generation',
    memory: '',
    retro: '',
    debt: [] as DebtItem[],
    patterns: '',
    decisions: '',
    existingTasks: [] as Task[],
    projectState: { gitStatus: '', fileTree: [] },
  };
}

function tempAgentDirectories(projectRoot: string): string[] {
  const agentsDir = join(projectRoot, '.deckent', 'agents');
  try {
    return readdirSync(agentsDir).filter((entry) => entry.startsWith('temp-'));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

describe('planSprint temp-agent persistence purity', () => {
  let projectRoot: string;

  beforeEach(() => {
    vi.clearAllMocks();
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-plan-purity-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('does not create .deckent/agents/temp-* during dry-run planning', async () => {
    await planSprint(projectRoot, makeConfig(projectRoot), makeContext(), recommendation, {
      mode: 'structured',
      dryRun: true,
    });

    expect(tempAgentDirectories(projectRoot)).toEqual([]);
  });

  it('persists .deckent/agents/temp-* during non-dry-run planning', async () => {
    await planSprint(projectRoot, makeConfig(projectRoot), makeContext(), recommendation, {
      mode: 'structured',
      dryRun: false,
    });

    expect(tempAgentDirectories(projectRoot).length).toBeGreaterThan(0);
  });
});
