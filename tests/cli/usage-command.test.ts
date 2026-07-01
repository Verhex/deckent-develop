/**
 * Tests for `deckent usage` command — injectable ledger, hermetic (no real ~/.claude)
 *
 * Tests use injectable deps (parseFn, buildTaskMapFn, costPricesFn, configFn)
 * so no real transcript files, no ~/.claude, no .deckent state is read.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mock external dependencies ─────────────────────────────────────────────

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn((headers: string[], rows: string[][]) => {
    // Return a simple string representation for assertion
    return [headers.join('|'), ...rows.map((r) => r.join('|'))].join('\n');
  }),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

// Don't mock core/limit-ledger — we use injectable parseFn instead

import { print } from '../../src/cli/helpers/output.js';
import { runUsageCommand, registerUsage } from '../../src/cli/commands/usage.js';
import type { UsageCommandOptions, UsageDeps } from '../../src/cli/commands/usage.js';
import type { UsageRecord, LedgerOpts, LedgerPrices } from '../../src/core/limit-ledger.js';
import type { SprintUsageSummary } from '../../src/core/limit-ledger-report.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const SAMPLE_RECORDS: UsageRecord[] = [
  {
    ts: '2026-06-09T10:00:00.000Z',
    model: 'claude-sonnet-5',
    sessionFile: 'session-abc.jsonl',
    projectDir: 'proj-a',
    in: 50_000,
    out: 5_000,
    cacheRead: 200_000,
    cacheWrite: 30_000,
  },
  {
    ts: '2026-06-09T11:00:00.000Z',
    model: 'claude-sonnet-5',
    sessionFile: 'session-abc.jsonl',
    projectDir: 'proj-a',
    in: 48_000,
    out: 4_800,
    cacheRead: 190_000,
    cacheWrite: 0,
  },
  {
    ts: '2026-06-09T12:00:00.000Z',
    model: 'claude-haiku-4-5-20251001',
    sessionFile: 'session-def.jsonl',
    projectDir: 'proj-a',
    in: 10_000,
    out: 2_000,
    cacheRead: 5_000,
    cacheWrite: 8_000,
  },
];

const SAMPLE_PRICES: LedgerPrices = {
  'claude-sonnet-5': { in: 3e-6, out: 15e-6 },
  'claude-haiku-4-5-20251001': { in: 0.8e-6, out: 4e-6 },
};

const EMPTY_CONFIG = async (_root: string) => ({ language: 'en' as string });
const EN_CONFIG = EMPTY_CONFIG;

// ─── Helper ─────────────────────────────────────────────────────────────────

function makeParseFn(records: UsageRecord[]) {
  return vi.fn().mockResolvedValue(records);
}

function makeTaskMapFn(map: Record<string, string>) {
  return vi.fn().mockResolvedValue(map);
}

function makeCostFn(prices: LedgerPrices) {
  return vi.fn().mockReturnValue(prices);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('usage command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  // ─── Test 1: command registration ──────────────────────────────────

  it('registers usage command with expected options', () => {
    const program = new Command();
    registerUsage(program);
    const cmd = program.commands.find((c) => c.name() === 'usage');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toContain('transcript');
    // Has expected options
    const opts = cmd!.options.map((o) => o.long);
    expect(opts).toContain('--sprint');
    expect(opts).toContain('--since');
    expect(opts).toContain('--until');
    expect(opts).toContain('--json');
  });

  // ─── Test 2: default table render (by model) ───────────────────────

  it('renders model-level table for default 7-day window', async () => {
    const parseFn = makeParseFn(SAMPLE_RECORDS);
    const deps: UsageDeps = {
      parseFn,
      costPricesFn: makeCostFn(SAMPLE_PRICES),
      configFn: EN_CONFIG,
    };
    await runUsageCommand({}, deps);

    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    // Header should mention "7 days"
    expect(calls.some((s) => s.includes('7'))).toBe(true);
    // Table output should contain model name
    expect(calls.some((s) => s.includes('claude-sonnet-5'))).toBe(true);
    // Table output should contain haiku model
    expect(calls.some((s) => s.includes('claude-haiku'))).toBe(true);
    // Totals row
    expect(calls.some((s) => s.includes('TOTAL'))).toBe(true);
  });

  // ─── Test 3: --json default shape ──────────────────────────────────

  it('outputs JSON array with expected shape for --json flag', async () => {
    const parseFn = makeParseFn(SAMPLE_RECORDS);
    const deps: UsageDeps = {
      parseFn,
      costPricesFn: makeCostFn(SAMPLE_PRICES),
      configFn: EN_CONFIG,
    };
    await runUsageCommand({ json: true }, deps);

    const printCalls = vi.mocked(print).mock.calls;
    expect(printCalls.length).toBeGreaterThan(0);
    const jsonOutput = printCalls[0]![0];
    const parsed = JSON.parse(jsonOutput) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    // Each entry should have model, calls, in, out, cacheWrite, limitCostVal, hitRate
    const first = parsed[0] as Record<string, unknown>;
    expect(first).toHaveProperty('model');
    expect(first).toHaveProperty('calls');
    expect(first).toHaveProperty('in');
    expect(first).toHaveProperty('out');
    expect(first).toHaveProperty('cacheWrite');
    expect(first).toHaveProperty('limitCostVal');
    expect(first).toHaveProperty('hitRate');
  });

  // ─── Test 4: --sprint mapping ───────────────────────────────────────

  it('shows per-task sprint table when --sprint N is given', async () => {
    // Records associated with sprint 273 sessions
    const sprintRecords: UsageRecord[] = [
      {
        ts: '2026-06-09T10:00:00.000Z',
        model: 'claude-sonnet-5',
        sessionFile: 'session-task1.jsonl',
        projectDir: 'proj',
        in: 60_000,
        out: 8_000,
        cacheRead: 150_000,
        cacheWrite: 40_000,
      },
    ];

    const taskMap = {
      'session-task1.jsonl': '273-001',
    };

    const deps: UsageDeps = {
      parseFn: makeParseFn(sprintRecords),
      buildTaskMapFn: makeTaskMapFn(taskMap),
      costPricesFn: makeCostFn(SAMPLE_PRICES),
      configFn: EN_CONFIG,
    };

    await runUsageCommand({ sprint: '273' }, deps);

    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    // Sprint header
    expect(calls.some((s) => s.includes('273'))).toBe(true);
    // Task ID in output
    expect(calls.some((s) => s.includes('273-001'))).toBe(true);
  });

  // ─── Test 5: no-data (empty records) ───────────────────────────────

  it('prints no_data message when no records found', async () => {
    const deps: UsageDeps = {
      parseFn: makeParseFn([]),
      costPricesFn: makeCostFn({}),
      configFn: EN_CONFIG,
    };

    await runUsageCommand({}, deps);

    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    expect(calls.some((s) => s.includes('No usage data'))).toBe(true);
  });

  // ─── Test 6: --since/--until passed to parseFn ──────────────────────

  it('passes --since and --until to parseFn opts', async () => {
    const parseFn = makeParseFn(SAMPLE_RECORDS);
    const deps: UsageDeps = {
      parseFn,
      costPricesFn: makeCostFn({}),
      configFn: EN_CONFIG,
    };

    await runUsageCommand({ since: '2026-06-01', until: '2026-06-10' }, deps);

    expect(parseFn).toHaveBeenCalledWith(
      expect.objectContaining({ since: '2026-06-01', until: '2026-06-10' }),
    );
  });

  // ─── Test 7: --json sprint shape ────────────────────────────────────

  it('outputs SprintUsageSummary JSON for --sprint --json', async () => {
    const sprintRecords: UsageRecord[] = [
      {
        ts: '2026-06-09T10:00:00.000Z',
        model: 'claude-sonnet-5',
        sessionFile: 'session-s1.jsonl',
        projectDir: 'proj',
        in: 50_000,
        out: 5_000,
        cacheRead: 100_000,
        cacheWrite: 25_000,
      },
    ];

    const deps: UsageDeps = {
      parseFn: makeParseFn(sprintRecords),
      buildTaskMapFn: makeTaskMapFn({ 'session-s1.jsonl': '273-002' }),
      costPricesFn: makeCostFn(SAMPLE_PRICES),
      configFn: EN_CONFIG,
    };

    await runUsageCommand({ sprint: '273', json: true }, deps);

    const printCalls = vi.mocked(print).mock.calls;
    expect(printCalls.length).toBe(1);
    const jsonOutput = printCalls[0]![0];
    const parsed = JSON.parse(jsonOutput) as SprintUsageSummary;
    expect(parsed).toHaveProperty('tasks');
    expect(parsed).toHaveProperty('totals');
    expect(Array.isArray(parsed.tasks)).toBe(true);
    expect(parsed.totals).toHaveProperty('limitCost');
    expect(parsed.tasks[0]).toHaveProperty('taskId', '273-002');
  });

  // ─── Test 8: budget reference line shown when config has weekly_budget_equiv ──

  it('shows weekly budget reference line when config has weekly_budget_equiv', async () => {
    const deps: UsageDeps = {
      parseFn: makeParseFn(SAMPLE_RECORDS),
      costPricesFn: makeCostFn(SAMPLE_PRICES),
      configFn: async (_root) => ({
        language: 'en',
        usage: { weekly_budget_equiv: 650 },
      }),
    };

    await runUsageCommand({}, deps);

    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    // Budget reference line should contain the amount
    expect(calls.some((s) => s.includes('650'))).toBe(true);
    expect(calls.some((s) => /budget/i.test(s))).toBe(true);
  });

  // ─── Test 9: no budget line when config missing weekly_budget_equiv ──

  it('omits budget reference line when config lacks weekly_budget_equiv', async () => {
    const deps: UsageDeps = {
      parseFn: makeParseFn(SAMPLE_RECORDS),
      costPricesFn: makeCostFn(SAMPLE_PRICES),
      configFn: EN_CONFIG,
    };

    await runUsageCommand({}, deps);

    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    // Should not have a line with "budget" (no config value)
    expect(calls.some((s) => /weekly budget reference/i.test(s))).toBe(false);
  });

  // ─── Test 10: --json empty returns [] ───────────────────────────────

  it('outputs [] JSON for --json when no data', async () => {
    const deps: UsageDeps = {
      parseFn: makeParseFn([]),
      costPricesFn: makeCostFn({}),
      configFn: EN_CONFIG,
    };

    await runUsageCommand({ json: true }, deps);

    const printCalls = vi.mocked(print).mock.calls;
    expect(printCalls.length).toBe(1);
    expect(printCalls[0]![0]).toBe('[]');
  });
});
