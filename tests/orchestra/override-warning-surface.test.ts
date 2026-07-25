/**
 * born-595 (395-005) — OVERRIDE-WARNING-SURFACE.
 *
 * Audit: sprint-391 saw 9/9 tasks carry `routingMeta.overrideWarnings`
 * (forceAgent/forceSkills semantic-mismatch advisories, F8 Sprint 182), yet
 * NONE were visible on any real surface — `sprint-planner.ts` only
 * `debugLog()`'d them (DECKENT_DEBUG-gated).
 *
 * This file verifies:
 *  (a) `collectOverrideWarnings()` (new pure export on sprint-planner.ts) —
 *      flattens task.routingMeta.overrideWarnings into task-id-tagged entries.
 *  (b) `deckent plan` (incl. --dry-run) renders a task-id'd warning block
 *      (en+tr i18n) when overrideWarnings are present — RED-test-first.
 *  (c) Regression: a plan with zero overrideWarnings anywhere prints no
 *      override-related line at all (byte-identical to pre-fix output).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig } from '../../src/core/types.js';
import { collectOverrideWarnings } from '../../src/orchestra/sprint-planner.js';

// ─── Mocks (mirrors tests/cli/commands/plan.test.ts's setup) ───────────────
// orchestra/sprint-planner.js is intentionally NOT mocked — collectOverrideWarnings
// must be the real implementation for the CLI-level assertions below to be honest.

vi.mock('../../src/core/config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/config.js')>()),
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
  resolveBrainModel: () => 'claude-sonnet-5',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
}));

vi.mock('../../src/core/provider.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/provider.js')>()),
  bootstrapProviders: vi.fn().mockResolvedValue({
    connector: {},
    registered: ['claude'],
    skipped: [],
    defaultProvider: 'claude',
    providerEnvOverrides: {},
  }),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  readContext: vi.fn(),
  planSprint: vi.fn(),
  confirmDraftTasks: vi.fn(),
  cleanupDraftTasks: vi.fn(),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn().mockImplementation((headers: string[], rows: string[][]) => {
    return [headers.join(' | '), ...rows.map(r => r.join(' | '))].join('\n');
  }),
}));

vi.mock('../../src/cli/helpers/prompt.js', () => ({
  promptConfirm: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { loadConfig } from '../../src/core/config.js';
import { readContext, planSprint } from '../../src/orchestra/brain.js';
import { print } from '../../src/cli/helpers/output.js';
import { registerPlan } from '../../src/cli/commands/plan.js';

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 8, brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5',
      haiku_allowed: true,
      brain_planning: 'auto',
    },
    modes: {} as any,
    language: 'en', projectName: 'test', projectRoot: '/mock/root',
    version: '1.0.0', auto_docs: { tier1: true, tier2: true, tier3: false },
    worker_provider: 'claude',
    spawn_backend: 'docker',
    execution_budget: {
      roles: { worker: { default: { maxTurns: 1 } } },
      landing: { reserve_ratio: 0.25 },
    },
    ...overrides,
  };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '395-001', title: 'Test Task', description: 'desc', model: 'claude-sonnet-5',
    effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.DRAFT, sprintId: 'sprint-395', createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSprint(overrides?: Partial<Sprint>): Sprint {
  return {
    id: 'sprint-395', number: 395,
    status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
    tasks: [makeTask()], workers: ['w-395-001'],
    ...overrides,
  };
}

function setupMocks(lang: 'en' | 'tr' = 'en'): void {
  vi.mocked(loadConfig).mockResolvedValue(makeConfig({ language: lang }));
  vi.mocked(readContext).mockReturnValue({
    directives: '', memory: '', retro: '', debt: [],
    patterns: '', decisions: '', existingTasks: [],
    projectState: { gitStatus: '', fileTree: [] },
  });
  vi.mocked(planSprint).mockReturnValue(makeSprint());
}

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerPlan(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

function printedLines(): string[] {
  return vi.mocked(print).mock.calls.map(c => String(c[0]));
}

// ─── (a) collectOverrideWarnings — pure function ───────────────────────────

describe('collectOverrideWarnings (sprint-planner.ts)', () => {
  it('returns [] for an empty task list', () => {
    expect(collectOverrideWarnings([])).toEqual([]);
  });

  it('returns [] when no task carries routingMeta.overrideWarnings', () => {
    const tasks = [
      makeTask({ id: 'a' }),
      makeTask({ id: 'b', routingMeta: { routingVersion: 'v2' } }),
      makeTask({ id: 'c', routingMeta: { routingVersion: 'v2', overrideWarnings: [] } }),
    ];
    expect(collectOverrideWarnings(tasks)).toEqual([]);
  });

  it('flattens multiple warnings per task, task-id tagged, preserving order', () => {
    const tasks = [
      makeTask({ id: '001-001', routingMeta: { overrideWarnings: ['w1', 'w2'] } }),
      makeTask({ id: '001-002' }),
      makeTask({ id: '001-003', routingMeta: { overrideWarnings: ['w3'] } }),
    ];
    expect(collectOverrideWarnings(tasks)).toEqual([
      { taskId: '001-001', message: 'w1' },
      { taskId: '001-001', message: 'w2' },
      { taskId: '001-003', message: 'w3' },
    ]);
  });
});

// ─── (b)/(c) `deckent plan` CLI surface ────────────────────────────────────

describe('deckent plan — override-warning surface (born-595 / 395-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('RED: an overrideWarnings-carrying fixture renders a task-id-tagged warning block', async () => {
    setupMocks('en');
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      tasks: [makeTask({
        id: '395-010',
        routingMeta: { overrideWarnings: ["forceAgent 'x' has low semantic relevance"] },
      })],
    }));

    await runCommand(['plan', '--no-confirm']);

    const lines = printedLines();
    expect(lines.some(l => l.includes('Override warnings — 1 warning(s)'))).toBe(true);
    expect(lines.some(l => l.includes("[395-010] forceAgent 'x' has low semantic relevance"))).toBe(true);
  });

  it('RED: overrideWarnings are also surfaced in --dry-run output', async () => {
    setupMocks('en');
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      tasks: [makeTask({ id: '395-011', routingMeta: { overrideWarnings: ['dry-run warning'] } })],
    }));

    await runCommand(['plan', '--dry-run', '--no-confirm']);

    const lines = printedLines();
    expect(lines.some(l => l.includes('[395-011] dry-run warning'))).toBe(true);
    expect(lines.some(l => l.includes('[dry-run]'))).toBe(true);
  });

  it('renders the tr header + tr count phrasing when config.language is tr', async () => {
    setupMocks('tr');
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      tasks: [makeTask({ id: '395-012', routingMeta: { overrideWarnings: ['uyari mesaji'] } })],
    }));

    await runCommand(['plan', '--no-confirm']);

    const lines = printedLines();
    expect(lines.some(l => l.startsWith('Override uyarıları — 1 uyarı'))).toBe(true);
    expect(lines.some(l => l.includes('[395-012] uyari mesaji'))).toBe(true);
  });

  it('multiple tasks with multiple warnings all render, one line per warning', async () => {
    setupMocks('en');
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      tasks: [
        makeTask({ id: '395-013', routingMeta: { overrideWarnings: ['w1', 'w2'] } }),
        makeTask({ id: '395-014', routingMeta: { overrideWarnings: ['w3'] } }),
      ],
    }));

    await runCommand(['plan', '--no-confirm']);

    const lines = printedLines();
    expect(lines.some(l => l.includes('Override warnings — 3 warning(s)'))).toBe(true);
    expect(lines.some(l => l.includes('[395-013] w1'))).toBe(true);
    expect(lines.some(l => l.includes('[395-013] w2'))).toBe(true);
    expect(lines.some(l => l.includes('[395-014] w3'))).toBe(true);
  });

  it('REGRESSION: no overrideWarnings anywhere (no routingMeta) -> no override-related line printed', async () => {
    setupMocks('en');
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      tasks: [makeTask({ id: '395-015' })],
    }));

    await runCommand(['plan', '--no-confirm']);

    const lines = printedLines();
    expect(lines.some(l => l.toLowerCase().includes('override'))).toBe(false);
  });

  it('REGRESSION: routingMeta present but overrideWarnings is an empty array -> no block printed', async () => {
    setupMocks('en');
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      tasks: [makeTask({ id: '395-016', routingMeta: { routingVersion: 'v2', overrideWarnings: [] } })],
    }));

    await runCommand(['plan', '--no-confirm']);

    const lines = printedLines();
    expect(lines.some(l => l.toLowerCase().includes('override'))).toBe(false);
  });

  it('REGRESSION: plan output for a warning-free sprint is unchanged (same print-call count as baseline)', async () => {
    setupMocks('en');
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      tasks: [makeTask({ id: '395-017', title: 'Plain task', model: 'opus', priority: 'HIGH' })],
    }));

    await runCommand(['plan', '--no-confirm']);

    const lines = printedLines();
    // Baseline shape: sprint_planned header, table, then approval prompt path
    // (no-confirm means asDraft=false, so no approval print). No blank-line +
    // override-header pair should appear anywhere.
    expect(lines.some(l => l.includes('Override'))).toBe(false);
    expect(lines).toEqual([
      expect.stringContaining('Run 395 (sprint) (sprint-395) planned with 1 tasks:'),
      expect.stringContaining('395-017'),
    ]);
  });
});
