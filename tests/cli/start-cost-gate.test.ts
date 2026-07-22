/**
 * CLI `deckent start` — Cost Gate Integration Tests (Sprint 189 T-008)
 *
 * Verifies that the CLI start command consumes the shared evaluateCostGate()
 * helper (the same helper used by MCP deckent_start) so both surfaces behave
 * identically when the planned sprint exceeds the budget.
 *
 * Tests focus on the helper contract — full sprint flow is covered in
 * tests/cli/commands/start.test.ts. Here we mock evaluateCostGate to
 * control the gate outcome deterministically.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(),
  planSprint: vi.fn(),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(message: string, phase?: string) {
      super(message);
      this.name = 'BrainError';
      this.phase = phase;
    }
  },
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  isSessionActive: vi.fn(() => false),
  setupWatchWindow: vi.fn(),
}));

vi.mock('../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn().mockResolvedValue({ registered: [], skipped: [], defaultProvider: null }),
}));

vi.mock('../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn(() => ({ checks: [] })),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatSprintSummary: vi.fn(() => 'mock summary'),
  formatTable: vi.fn(() => 'mock table'),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(() => '/mock/root'),
}));

vi.mock('../../src/cli/helpers/prompt.js', () => ({
  promptConfirm: vi.fn(),
}));

vi.mock('../../src/cli/commands/quick-start.js', () => ({
  prepareZeroConfig: vi.fn(),
  cleanupZeroConfig: vi.fn(),
}));

vi.mock('../../src/core/multi-ide.js', () => ({
  isSprintLocked: vi.fn(() => ({ locked: false })),
}));

vi.mock('../../src/orchestra/sprint-pid-manager.js', () => ({
  detectOrphan: vi.fn(() => null),
  archiveOrphan: vi.fn(),
  listPidFiles: vi.fn(() => []),
}));

vi.mock('../../src/core/cost-config-loader.js', () => ({
  initCostConfig: vi.fn(),
  loadCostConfig: vi.fn(() => ({
    _version: '1.0',
    providers: {},
    cost_limits: { sprint_max_usd: 5, daily_max_usd: 50, auto_confirm_below_usd: 2 },
    update_config: { sources_priority: ['bundled'] },
  })),
}));

vi.mock('../../src/core/cost-calculator.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/cost-calculator.js')>('../../src/core/cost-calculator.js');
  return {
    ...actual,
    estimateSprintCost: vi.fn(() => ({ totalApiCostUsd: 0, withinBudget: true })),
    formatEstimate: vi.fn(() => 'mock estimate'),
  };
});

vi.mock('../../src/core/cost-gate.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/cost-gate.js')>('../../src/core/cost-gate.js');
  return {
    ...actual,
    evaluateCostGate: vi.fn(),
  };
});

import { loadConfig } from '../../src/core/config.js';
import { readContext, planSprint, runSprint } from '../../src/orchestra/brain.js';
import { evaluateCostGate } from '../../src/core/cost-gate.js';
import { promptConfirm } from '../../src/cli/helpers/prompt.js';
import { printError } from '../../src/cli/helpers/output.js';
import { registerStart } from '../../src/cli/commands/start.js';
import type { SprintCostEstimate } from '../../src/core/cost-calculator.js';

// ─── Fixtures ──────────────────────────────────────────────────────

function makeConfig() {
  return {
    activeModeConfig: { brain_model: 'claude-opus-4-8', max_workers: 3 },
    brain_planning: 'auto',
    language: 'en',
  };
}

function makeSprint() {
  return {
    id: 'sprint-cost-cli',
    number: 1,
    tasks: [
      {
        id: '001-001',
        title: 'mock',
        model: 'opus',
        effort: 'high',
        priority: 'NORMAL',
        estimatedTokens: 2700,
      },
    ],
  };
}

function fakeEstimate(opts?: { withinBudget?: boolean; cost?: number; budget?: number }): SprintCostEstimate {
  const cost = opts?.cost ?? 0.5;
  const budget = opts?.budget ?? 5;
  return {
    taskCount: 1,
    retryMultiplier: 1.2,
    cacheHitRatio: 0.7,
    perProvider: {},
    totalUncachedInputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    totalOutputTokens: 0,
    totalApiCostUsd: cost,
    subscriptionImpact: {},
    costNaive: cost * 0.7,
    costRealistic: cost,
    costWorstCase: cost * 1.6,
    budgetUsd: budget,
    withinBudget: opts?.withinBudget ?? cost <= budget,
    percentOfBudget: (cost / budget) * 100,
    warnings: [],
    recommendations: [],
  };
}

async function runStart(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerStart(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    /* commander exitOverride */
  }
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('cli start — cost gate (Sprint 189 T-008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as never);
    vi.mocked(readContext).mockReturnValue({ memory: '', retro: '', debt: '', patterns: [] } as never);
    vi.mocked(planSprint).mockResolvedValue(makeSprint() as never);
    vi.mocked(runSprint).mockResolvedValue({
      ...makeSprint(),
      metrics: undefined,
    } as never);
    vi.mocked(promptConfirm).mockResolvedValue(true);

    // Default: cost gate passes with autoConfirm=true
    vi.mocked(evaluateCostGate).mockReturnValue({
      ok: true,
      estimate: fakeEstimate({ withinBudget: true, cost: 0.5 }),
      autoConfirm: true,
      autoConfirmThresholdUsd: 2,
      overrideApplied: false,
    });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('calls evaluateCostGate before spawning workers (gate active by default)', async () => {
    await runStart(['start']);
    expect(vi.mocked(evaluateCostGate)).toHaveBeenCalledTimes(1);
  });

  it('blocks the sprint with exitCode=1 when the gate returns COST_GATE_EXCEEDED', async () => {
    vi.mocked(evaluateCostGate).mockReturnValue({
      ok: false,
      reason: 'COST_GATE_EXCEEDED',
      estimate: fakeEstimate({ withinBudget: false, cost: 50, budget: 5 }),
      estimatedUsd: 50,
      budgetUsd: 5,
      message: 'Sprint cost $50.00 exceeds budget $5.00.',
    });

    await runStart(['start']);

    expect(process.exitCode).toBe(1);
    expect(vi.mocked(printError)).toHaveBeenCalled();
    expect(vi.mocked(runSprint)).not.toHaveBeenCalled();
  });

  it('skips the cost gate entirely when --force is passed (CLI parity with MCP force=true)', async () => {
    await runStart(['start', '--force']);
    expect(vi.mocked(evaluateCostGate)).not.toHaveBeenCalled();
  });

  it('prompts the user when realistic cost is above the auto-confirm threshold', async () => {
    vi.mocked(evaluateCostGate).mockReturnValue({
      ok: true,
      estimate: fakeEstimate({ withinBudget: true, cost: 3, budget: 5 }),
      autoConfirm: false, // prompt required
      autoConfirmThresholdUsd: 2,
      overrideApplied: false,
    });

    await runStart(['start']);

    expect(vi.mocked(promptConfirm)).toHaveBeenCalled();
  });

  it('does not prompt the user when autoConfirm=true (cost below threshold)', async () => {
    await runStart(['start']);
    expect(vi.mocked(promptConfirm)).not.toHaveBeenCalled();
  });

  it('aborts when the user declines the confirm prompt', async () => {
    vi.mocked(evaluateCostGate).mockReturnValue({
      ok: true,
      estimate: fakeEstimate({ withinBudget: true, cost: 3, budget: 5 }),
      autoConfirm: false,
      autoConfirmThresholdUsd: 2,
      overrideApplied: false,
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);

    await runStart(['start']);

    expect(vi.mocked(runSprint)).not.toHaveBeenCalled();
  });
});
