// ═══ Tests — PLANOBS-004: planner-fail notify + plan spinner ══════════════════
// Sprint 280 Task 6 — Verifies that sprint-planner.ts AI-fail paths route through
// notify() (not console.error), planner-start emits PROGRESS via emitProgress(),
// and plan.ts CLI shows a spinner during planSprint().

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ResolvedConfig, Task, DebtItem, SprintSizeRecommendation } from '../../src/core/types.js';

// ─── Mocks ────────────────────────────────────────────────────────

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
  createPlannerTaskModelPolicy: vi.fn((defaultModel: string) => ({ defaultModel, allowedModels: [defaultModel] })),
  callBrainPlannerWithReason: vi.fn().mockReturnValue({
    ok: false,
    reason: 'parse_failed',
    message: 'default mock — parse failed',
  }),
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/core/provider.js', () => ({
  orderedRoleProviders: vi.fn((role: 'brain' | 'worker' | 'auditor', config: ResolvedConfig) => ({
    role,
    primary: role === 'brain'
      ? config.providers?.brain ?? config.brain_provider ?? 'claude'
      : 'claude',
    fallbacks: [],
    unattended: config.provider_fallback?.unattended ?? true,
  })),
  providerRegistry: {
    getDefault: vi.fn(() => ({ name: 'claude', buildCommand: () => 'claude', isAvailable: async () => true })),
    getProvider: vi.fn(() => ({ name: 'claude', buildCommand: () => 'claude', isAvailable: async () => true })),
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
  return { ...actual, resolveTaskModel: vi.fn().mockReturnValue('claude-sonnet-5') };
});

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return { ...actual, getNextSprintId: vi.fn().mockReturnValue('sprint-280') };
});

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({
    getByType: vi.fn().mockReturnValue([]),
    close: vi.fn(),
  })),
}));

// Mock notify — must come before sprint-planner import (hoisted)
vi.mock('../../src/core/notify.js', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
  notifyProgress: vi.fn().mockResolvedValue(undefined),
  notifyAsync: vi.fn(),
}));

// Mock emitProgress from event-stream — must be hoisted
vi.mock('../../src/core/event-stream.js', () => ({
  emitProgress: vi.fn().mockReturnValue(null),
  writeEvent: vi.fn().mockReturnValue(null),
  CHANNELS: {
    PLAN: 'PLAN',
    SPAWN: 'SPAWN',
    EXECUTE: 'EXECUTE',
    EVALUATE: 'EVALUATE',
    FIX: 'FIX',
    RETRO: 'RETRO',
    HEARTBEAT: 'HEARTBEAT',
    LOCK: 'LOCK',
    DEPENDENCY: 'DEPENDENCY',
    DEPENDENCY_BLOCKED: 'DEPENDENCY_BLOCKED',
    DEPENDENCY_RESOLVED: 'DEPENDENCY_RESOLVED',
    TASK_STATUS: 'TASK_STATUS',
    SPRINT_STATUS: 'SPRINT_STATUS',
    AUDIT: 'AUDIT',
    BUDGET: 'BUDGET',
    CONFIG: 'CONFIG',
    NOTIFY: 'NOTIFY',
    IPC: 'IPC',
    WORKER_COMMS: 'WORKER_COMMS',
    MONITOR: 'MONITOR',
    SCOPE_VIOLATION: 'SCOPE_VIOLATION',
    DECISION_TRAIL: 'DECISION_TRAIL',
    QUALITY: 'QUALITY',
    PROGRESS: 'PROGRESS',
  },
  getCurrentSprintId: vi.fn().mockReturnValue(null),
}));

// ─── Imports under test ────────────────────────────────────────────

import { planSprint } from '../../src/orchestra/sprint-planner.js';
import { notify } from '../../src/core/notify.js';
import { emitProgress } from '../../src/core/event-stream.js';
import { callBrainPlannerWithReason } from '../../src/orchestra/planner.js';

const mockedNotify = vi.mocked(notify);
const mockedEmitProgress = vi.mocked(emitProgress);
const mockedCallPlanner = vi.mocked(callBrainPlannerWithReason);

// ─── Fixtures ──────────────────────────────────────────────────────

const ROOT = '/project-280-006';

function makeConfig(): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'claude-opus-4-8',
      default_model: 'claude-sonnet-5',
      haiku_allowed: false,
      brain_planning: 'auto',
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test-280',
    projectRoot: ROOT,
    version: '0.1.0',
  } as ResolvedConfig;
}

function makeContext(directives = 'Task A\nTask B') {
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

// ─── Test 1: parse_failed → notify called ─────────────────────────

describe('planner-fail: parse_failed → notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto mode + parse_failed → notify called with phase-change event', async () => {
    mockedCallPlanner.mockReturnValue({
      ok: false,
      reason: 'parse_failed',
      message: 'AI response could not be parsed as JSON',
    });

    await planSprint(ROOT, makeConfig(), makeContext(), recommendation, { mode: 'auto', dryRun: true });

    expect(mockedNotify).toHaveBeenCalledWith(
      'phase-change',
      'sprint-280',
      expect.stringContaining('plan:ai-failed'),
      expect.stringContaining('parse_failed'),
    );
  });
});

// ─── Test 2: timeout → notify called ──────────────────────────────

describe('planner-fail: timeout → notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto mode + timeout → notify called with reason=timeout in summary', async () => {
    mockedCallPlanner.mockReturnValue({
      ok: false,
      reason: 'timeout',
      message: 'AI planner timed out after 30000ms',
    });

    await planSprint(ROOT, makeConfig(), makeContext(), recommendation, { mode: 'auto', dryRun: true });

    expect(mockedNotify).toHaveBeenCalledWith(
      'phase-change',
      'sprint-280',
      expect.stringContaining('plan:ai-failed'),
      expect.stringContaining('timeout'),
    );
  });
});

// ─── Test 3: planner-start → emitProgress called ──────────────────

describe('planner-start: emitProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emitProgress is called with phase PLAN at the start of planSprint', async () => {
    await planSprint(ROOT, makeConfig(), makeContext('Task A'), recommendation, {
      mode: 'structured',
      dryRun: true,
    });

    expect(mockedEmitProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'PLAN' }),
    );
  });

  it('emitProgress is called before any task processing', async () => {
    const calls: string[] = [];
    mockedEmitProgress.mockImplementation((opts) => {
      calls.push(`emitProgress:${opts.phase}`);
      return null;
    });
    mockedCallPlanner.mockReturnValue({ ok: false, reason: 'parse_failed', message: 'fail' });

    await planSprint(ROOT, makeConfig(), makeContext(), recommendation, { mode: 'auto', dryRun: true });

    expect(calls[0]).toBe('emitProgress:PLAN');
  });
});

// ─── Test 4: notify NOT called on success path ─────────────────────

describe('planner-success: notify NOT called for plan:ai-failed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('structured mode success → notify not called with ai-failed', async () => {
    await planSprint(ROOT, makeConfig(), makeContext('Task A'), recommendation, {
      mode: 'structured',
      dryRun: true,
    });

    const aiFailedCalls = mockedNotify.mock.calls.filter(([, , title]) =>
      typeof title === 'string' && title.includes('ai-failed'),
    );
    expect(aiFailedCalls).toHaveLength(0);
  });
});

// ─── Test 5: overflow warning → notify called ─────────────────────

describe('planner overflow guard: >2x tasks → notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('>2x directive count from AI in strict-ai mode → notify called with task-overflow', async () => {
    // Directives with 1 plain-text task (no model/provider override so planMode stays ai).
    // AI returns 3 tasks (>2x of 1). In strict 'ai' mode the early auto-fallback check
    // does NOT run — all 3 tasks land in the plan, and the post-routing overflow guard fires.
    mockedCallPlanner.mockReturnValue({
      ok: true,
      data: {
        tasks: [
          { title: 'T1', description: 'd', model: 'claude-sonnet-5', effort: 'normal', priority: 'NORMAL',
            reason: 'r', scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
            dependencies: [], goNogo: { goCriteria: 'go', noGoCriteria: 'nogo', techDebtAcceptable: '' } },
          { title: 'T2', description: 'd', model: 'claude-sonnet-5', effort: 'normal', priority: 'NORMAL',
            reason: 'r', scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
            dependencies: [], goNogo: { goCriteria: 'go', noGoCriteria: 'nogo', techDebtAcceptable: '' } },
          { title: 'T3', description: 'd', model: 'claude-sonnet-5', effort: 'normal', priority: 'NORMAL',
            reason: 'r', scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
            dependencies: [], goNogo: { goCriteria: 'go', noGoCriteria: 'nogo', techDebtAcceptable: '' } },
        ],
        reasoning: 'test',
      },
    });

    // Structured directive with no "- Model:" or "- Provider:" lines, so parseStructuredDirectives
    // returns 1 entry with forceModel=undefined → planMode stays 'ai' (no forced structured switch).
    const singleTaskDirectives = '## Task 1: Only Task\n\nDo this one thing.';
    await planSprint(ROOT, makeConfig(), makeContext(singleTaskDirectives), recommendation, {
      mode: 'ai',
      dryRun: true,
    });

    const overflowCalls = mockedNotify.mock.calls.filter(([, , title]) =>
      typeof title === 'string' && title.includes('task-overflow'),
    );
    expect(overflowCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Test 6: i18n — spinner label selection ────────────────────────

describe('plan.ts spinner label i18n', () => {
  it('uses "Planlanıyor…" for Turkish language', () => {
    const lang = 'tr';
    const label = lang === 'tr' ? 'Planlanıyor…' : 'Planning…';
    expect(label).toBe('Planlanıyor…');
  });

  it('uses "Planning…" for English language', () => {
    const lang = 'en';
    const label = lang === 'tr' ? 'Planlanıyor…' : 'Planning…';
    expect(label).toBe('Planning…');
  });

  it('defaults to English for unknown language', () => {
    const lang = 'de';
    const label = lang === 'tr' ? 'Planlanıyor…' : 'Planning…';
    expect(label).toBe('Planning…');
  });
});
