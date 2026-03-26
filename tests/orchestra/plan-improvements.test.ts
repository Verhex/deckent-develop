/**
 * tests/orchestra/plan-improvements.test.ts
 *
 * Tests for Sprint 064-002 plan improvements:
 *   A) AI Planner Timeout Configurable — config.ai_planner_timeout properly typed
 *   B) Structured Parser Bullet/Prose (already implemented — confirm behavior)
 *   C) Auto Mode >2x Task Safeguard with fallback
 *   D) Agent/Skill Selection Error Logging — per-task try/catch
 *   E) Usage Safe Default — status:'unknown' when failed, adjustSprintSize skips throttling
 *   F) Context Truncation Priority (already implemented — confirm behavior)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrainContext, SprintSizeRecommendation, ModelType, UsageMetrics, ResolvedConfig } from '../../src/core/types.js';
import type { ProviderAdapter } from '../../src/core/provider.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import {
  callBrainPlanner,
  callZeroConfigPlanner,
  buildPriorityContextBlock,
} from '../../src/orchestra/planner.js';
import {
  parseStructuredDirectives,
  parseBulletOrNumberedTasks,
} from '../../src/orchestra/task-builder.js';
import { adjustSprintSize } from '../../src/orchestra/sprint-controller.js';
import { providerRegistry } from '../../src/core/provider.js';
import { BRAIN_PLAN_TIMEOUT_MS } from '../../src/core/constants.js';

const mockedSpawnSync = vi.mocked(spawnSync);

// ─── Helpers ────────────────────────────────────────────────────────

function makeContext(overrides: Partial<BrainContext> = {}): BrainContext {
  return {
    directives: '# Sprint\n## Task 1: Build feature\nBuild it',
    memory: '# Memory',
    retro: '',
    debt: [],
    patterns: '',
    decisions: '',
    existingTasks: [],
    projectState: { gitStatus: '', fileTree: ['src/index.ts'] },
    ...overrides,
  };
}

function makeRecommendation(overrides: Partial<SprintSizeRecommendation> = {}): SprintSizeRecommendation {
  return {
    size: 'full',
    maxWorkers: 4,
    modelConstraint: null,
    reason: 'OK',
    ...overrides,
  };
}

function makeMockAdapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    name: 'mock-provider',
    supportedModels: ['opus', 'sonnet', 'haiku'] as readonly ModelType[],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    checkUsage: vi.fn().mockResolvedValue({ fiveHourPercent: 0, weeklyPercent: 0, measuredAt: '' }),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('mock-cli -p - --model sonnet < /dev/null'),
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'pro_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'sonnet',
      default_model: 'sonnet',
      haiku_allowed: true,
      usage_thresholds: { '5hr': 0.8, weekly: 0.8 },
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'tr',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '1.0.0',
    ...overrides,
  };
}

const validPlannerJSON = JSON.stringify({
  tasks: [{
    title: 'Build feature',
    description: 'Build the feature',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Standard task',
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/feature.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: 'Minor' },
  }],
  reasoning: 'Single task for the directive',
});

beforeEach(() => {
  vi.clearAllMocks();
  providerRegistry.clear();
});

// ═══ A) AI Planner Timeout Configurable ═══════════════════════════════

describe('A) AI Planner Timeout Configurable', () => {
  it('uses custom timeout when provided', () => {
    const adapter = makeMockAdapter();
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'test', adapter, 120_000);

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'mock-cli',
      expect.any(Array),
      expect.objectContaining({ timeout: 120_000 }),
    );
  });

  it('defaults to BRAIN_PLAN_TIMEOUT_MS when no timeout provided', () => {
    const adapter = makeMockAdapter();
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'test', adapter);

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'mock-cli',
      expect.any(Array),
      expect.objectContaining({ timeout: BRAIN_PLAN_TIMEOUT_MS }),
    );
  });

  it('callZeroConfigPlanner uses custom timeout', () => {
    const adapter = makeMockAdapter();
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    callZeroConfigPlanner('Add login', 'sonnet', 'test', [], adapter, 90_000);

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'mock-cli',
      expect.any(Array),
      expect.objectContaining({ timeout: 90_000 }),
    );
  });

  it('callZeroConfigPlanner defaults to BRAIN_PLAN_TIMEOUT_MS', () => {
    const adapter = makeMockAdapter();
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    callZeroConfigPlanner('Add login', 'sonnet', 'test', [], adapter);

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'mock-cli',
      expect.any(Array),
      expect.objectContaining({ timeout: BRAIN_PLAN_TIMEOUT_MS }),
    );
  });

  it('ResolvedConfig accepts ai_planner_timeout field without type error', () => {
    const config = makeConfig({ ai_planner_timeout: 120_000 });
    expect(config.ai_planner_timeout).toBe(120_000);
  });
});

// ═══ B) Structured Parser Bullet/Prose ════════════════════════════════

describe('B) Structured Parser Bullet/Prose fallback', () => {
  it('parseStructuredDirectives falls back to bullet format when no ## headings', () => {
    const content = `# Goal: Do things\n\n- Task: Build auth module\n- Task: Add tests`;
    const tasks = parseStructuredDirectives(content);
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    expect(tasks[0]!.title).toBe('Build auth module');
  });

  it('parseStructuredDirectives falls back to numbered list format', () => {
    const content = `# Goal\n\n1. Build the API\n2. Write integration tests\n3. Update docs`;
    const tasks = parseStructuredDirectives(content);
    expect(tasks.length).toBeGreaterThanOrEqual(3);
  });

  it('parseBulletOrNumberedTasks handles "1) title" format', () => {
    const content = `1) First task here\n2) Second task here`;
    const tasks = parseBulletOrNumberedTasks(content);
    expect(tasks.length).toBe(2);
    expect(tasks[0]!.title).toBe('First task here');
  });

  it('parseBulletOrNumberedTasks handles "* Task:" format', () => {
    const content = `* Task: Create database schema\n* Task: Add migration scripts`;
    const tasks = parseBulletOrNumberedTasks(content);
    expect(tasks.length).toBe(2);
    expect(tasks[0]!.title).toBe('Create database schema');
    expect(tasks[1]!.title).toBe('Add migration scripts');
  });

  it('parseBulletOrNumberedTasks extracts Model/Effort from sub-lines', () => {
    const content = `- Task: Implement API endpoint\n  Model: opus\n  Effort: high`;
    const tasks = parseBulletOrNumberedTasks(content);
    expect(tasks.length).toBe(1);
    expect(tasks[0]!.forceModel).toBe('opus');
    expect(tasks[0]!.forceEffort).toBe('high');
  });
});

// ═══ E) Usage Safe Default ════════════════════════════════════════════

describe('E) Usage Safe Default', () => {
  it('checkUsage default returns status "unknown" (verified via source)', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
      'utf-8',
    );
    // UNKNOWN_DEFAULT should have status: 'unknown'
    expect(source).toContain("status: 'unknown'");
    // Successful measurement should have status: 'ok'
    expect(source).toContain("status: 'ok'");
  });

  it('adjustSprintSize returns full sprint when usage status is unknown', () => {
    const config = makeConfig();
    const usage: UsageMetrics = {
      fiveHourPercent: 95, // Would normally trigger throttling
      weeklyPercent: 95,
      measuredAt: new Date().toISOString(),
      status: 'unknown',
    };
    const result = adjustSprintSize(config, usage);
    expect(result.size).toBe('full');
    expect(result.reason).toContain('unknown');
  });

  it('adjustSprintSize throttles normally when usage status is ok', () => {
    const config = makeConfig();
    const usage: UsageMetrics = {
      fiveHourPercent: 95,
      weeklyPercent: 95,
      measuredAt: new Date().toISOString(),
      status: 'ok',
    };
    const result = adjustSprintSize(config, usage);
    expect(result.size).toBe('minimal');
  });

  it('adjustSprintSize throttles when status is undefined (backward compat)', () => {
    const config = makeConfig();
    const usage: UsageMetrics = {
      fiveHourPercent: 95,
      weeklyPercent: 95,
      measuredAt: new Date().toISOString(),
      // status is undefined — old behavior should still throttle
    };
    const result = adjustSprintSize(config, usage);
    expect(result.size).toBe('minimal');
  });
});

// ═══ F) Context Truncation Priority ═══════════════════════════════════

describe('F) Context Truncation Priority Order', () => {
  it('preserves DIRECTIVES (priority 1) over PATTERNS (priority 4) when truncating', () => {
    const directives = Array.from({ length: 30 }, (_, i) => `directive-${i}`).join('\n');
    const patterns = Array.from({ length: 30 }, (_, i) => `pattern-${i}`).join('\n');
    const sections = [
      { text: `DIRECTIVES:\n${directives}`, priority: 1 },
      { text: `PATTERNS:\n${patterns}`, priority: 4 },
    ];
    const result = buildPriorityContextBlock(sections, 35);
    expect(result).toContain('DIRECTIVES');
    expect(result).toContain('directive-0');
  });

  it('preserves MEMORY (priority 2) over DEBT (priority 3) when space is limited', () => {
    const memory = Array.from({ length: 20 }, (_, i) => `mem-${i}`).join('\n');
    const debt = Array.from({ length: 20 }, (_, i) => `debt-${i}`).join('\n');
    const sections = [
      { text: `MEMORY:\n${memory}`, priority: 2 },
      { text: `DEBT:\n${debt}`, priority: 3 },
    ];
    const result = buildPriorityContextBlock(sections, 22);
    expect(result).toContain('MEMORY');
    expect(result).toContain('mem-0');
  });

  it('includes all sections when maxLines is sufficient', () => {
    const sections = [
      { text: 'DIRECTIVES: short', priority: 1 },
      { text: 'MEMORY: short', priority: 2 },
      { text: 'DEBT: short', priority: 3 },
      { text: 'PATTERNS: short', priority: 4 },
    ];
    const result = buildPriorityContextBlock(sections, 100);
    expect(result).toContain('DIRECTIVES');
    expect(result).toContain('MEMORY');
    expect(result).toContain('DEBT');
    expect(result).toContain('PATTERNS');
  });
});

// ═══ D) Agent/Skill Selection Error Logging ═══════════════════════════

describe('D) Agent/Skill Selection Error Logging', () => {
  it('has per-task agent selection error handling with debugLog', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
      'utf-8',
    );
    // Outer catch for pool loading failure
    expect(source).toContain("debugLog('planSprint:agent-pool'");
    expect(source).toContain('Agent pool loading failed');
    // Inner per-task catch for individual agent selection failure
    expect(source).toContain("debugLog('planSprint:agent-selection'");
    expect(source).toContain('Agent selection failed for task');
  });

  it('has per-task skill selection error handling with debugLog', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
      'utf-8',
    );
    // Outer catch for pool loading failure
    expect(source).toContain("debugLog('planSprint:skill-pool'");
    expect(source).toContain('Skill pool loading failed');
    // Inner per-task catch for individual skill selection failure
    expect(source).toContain('Skill selection failed for task');
  });
});

// ═══ C) Auto Mode >2x Task Safeguard ═════════════════════════════════

describe('C) Auto Mode >2x Task Safeguard', () => {
  it('has >2x safeguard with fallback (not just warning)', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
      'utf-8',
    );
    // Should set plannerResult = null (fallback) when >2x
    expect(source).toContain('directiveTaskCount * 2');
    expect(source).toContain('Falling back to structured mode');
    // Should have the fallback assignment after >2x check
    expect(source).toMatch(/directiveTaskCount \* 2[\s\S]*?plannerResult = null/);
  });

  it('also has <1x safeguard for too few tasks', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
      'utf-8',
    );
    // AI returned fewer tasks than directives — fallback
    expect(source).toContain('plannerResult.tasks.length < directiveTaskCount');
  });
});
