import { describe, it, expect, vi } from 'vitest';
import { buildLimitBurnRow } from '../../src/orchestra/sprint-reporter.js';
import type { LimitBurnOpts } from '../../src/orchestra/sprint-reporter.js';
import type { UsageRecord } from '../../src/core/limit-ledger.js';
import type { SprintUsageSummary, CacheGateReport } from '../../src/core/limit-ledger-report.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    ts: '2026-06-10T10:00:00.000Z',
    model: 'claude-sonnet-4-6',
    sessionFile: 'session-001.jsonl',
    projectDir: 'my-project',
    in: 1000,
    out: 200,
    cacheRead: 5000,
    cacheWrite: 800,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<SprintUsageSummary> = {}): SprintUsageSummary {
  return {
    tasks: [
      {
        taskId: '001-001',
        model: 'claude-sonnet-4-6',
        calls: 3,
        in: 1000,
        out: 200,
        cacheRead: 5000,
        cacheWrite: 800,
        bootstrapCw: 400,
        limitCost: 0.30,
        hitRate: 0.833,
      },
      {
        taskId: '001-002',
        model: 'claude-sonnet-4-6',
        calls: 2,
        in: 800,
        out: 150,
        cacheRead: 4000,
        cacheWrite: 600,
        bootstrapCw: 300,
        limitCost: 0.25,
        hitRate: 0.833,
      },
    ],
    totals: {
      calls: 5,
      in: 1800,
      out: 350,
      cacheRead: 9000,
      cacheWrite: 1400,
      limitCost: 0.55,
      bootstrapShare: 0.5,
    },
    ...overrides,
  };
}

function makeOpts(
  records: UsageRecord[],
  summary: SprintUsageSummary,
): LimitBurnOpts {
  return {
    parseUsage: async () => records,
    summarize: () => summary,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildLimitBurnRow', () => {
  it('formats the row with total cost, per-task cost, boot-cw share, and hit-rate', async () => {
    const records = [makeRecord()];
    const summary = makeSummary();
    // totals: cacheRead=9000, in=1800 → hitRate=9000/10800≈83%
    const row = await buildLimitBurnRow('/root', 2, makeOpts(records, summary));

    expect(row).toBe(
      '| Limit burn | $0.55 eşdeğer (task-başı $0.28, boot-cw %50%, hit-rate %83%) |',
    );
  });

  it('returns null when no records are available (no transcript)', async () => {
    const opts: LimitBurnOpts = {
      parseUsage: async () => [],
      summarize: () => makeSummary(),
    };
    const row = await buildLimitBurnRow('/root', 3, opts);
    expect(row).toBeNull();
  });

  it('returns null when ledger throws — retro must not be blocked', async () => {
    const opts: LimitBurnOpts = {
      parseUsage: async () => { throw new Error('disk read failed'); },
    };
    const row = await buildLimitBurnRow('/root', 2, opts);
    expect(row).toBeNull();
  });

  it('returns null when total limitCost is zero', async () => {
    const summary = makeSummary({
      totals: {
        calls: 2, in: 100, out: 10, cacheRead: 0, cacheWrite: 0,
        limitCost: 0, bootstrapShare: 0,
      },
    });
    const opts: LimitBurnOpts = {
      parseUsage: async () => [makeRecord()],
      summarize: () => summary,
    };
    const row = await buildLimitBurnRow('/root', 2, opts);
    expect(row).toBeNull();
  });

  it('handles zero cacheWrite gracefully (boot-cw %0)', async () => {
    const summary = makeSummary({
      totals: {
        calls: 2, in: 500, out: 100, cacheRead: 200, cacheWrite: 0,
        limitCost: 0.10, bootstrapShare: 0,
      },
    });
    const opts: LimitBurnOpts = {
      parseUsage: async () => [makeRecord()],
      summarize: () => summary,
    };
    // cacheRead=200, in=500 → hitRate=200/700≈29%
    const row = await buildLimitBurnRow('/root', 2, opts);
    expect(row).toBe(
      '| Limit burn | $0.10 eşdeğer (task-başı $0.05, boot-cw %0%, hit-rate %29%) |',
    );
  });

  it('handles taskCount=0 without division error (per-task $0.00)', async () => {
    const summary = makeSummary();
    const opts: LimitBurnOpts = {
      parseUsage: async () => [makeRecord()],
      summarize: () => summary,
    };
    // totals: cacheRead=9000, in=1800 → hitRate=83%
    const row = await buildLimitBurnRow('/root', 0, opts);
    expect(row).toBe(
      '| Limit burn | $0.55 eşdeğer (task-başı $0.00, boot-cw %50%, hit-rate %83%) |',
    );
  });

  it('appends cache-gate PASS when evaluateGate returns applicable+pass', async () => {
    const records = [makeRecord()];
    const summary = makeSummary();
    const gate: CacheGateReport = {
      applicable: true, pass: true,
      warmTaskId: '001-001', sessions: [], warmShare: 1.0,
    };
    const opts: LimitBurnOpts = {
      ...makeOpts(records, summary),
      evaluateGate: () => gate,
    };
    const row = await buildLimitBurnRow('/root', 2, opts);
    expect(row).toBe(
      '| Limit burn | $0.55 eşdeğer (task-başı $0.28, boot-cw %50%, hit-rate %83%, cache-gate PASS) |',
    );
  });

  it('appends cache-gate FAIL when evaluateGate returns applicable+not-pass', async () => {
    const records = [makeRecord()];
    const summary = makeSummary();
    const gate: CacheGateReport = {
      applicable: true, pass: false,
      warmTaskId: '001-001', sessions: [], warmShare: 0.5,
    };
    const opts: LimitBurnOpts = {
      ...makeOpts(records, summary),
      evaluateGate: () => gate,
    };
    const row = await buildLimitBurnRow('/root', 2, opts);
    expect(row).toBe(
      '| Limit burn | $0.55 eşdeğer (task-başı $0.28, boot-cw %50%, hit-rate %83%, cache-gate FAIL) |',
    );
  });

  it('omits cache-gate field when gate is not applicable (single session)', async () => {
    const records = [makeRecord()];
    const summary = makeSummary();
    const gate: CacheGateReport = {
      applicable: false, pass: false,
      warmTaskId: null, sessions: [], warmShare: 0,
    };
    const opts: LimitBurnOpts = {
      ...makeOpts(records, summary),
      evaluateGate: () => gate,
    };
    const row = await buildLimitBurnRow('/root', 2, opts);
    // gate not applicable → no cache-gate field
    expect(row).toBe(
      '| Limit burn | $0.55 eşdeğer (task-başı $0.28, boot-cw %50%, hit-rate %83%) |',
    );
  });

  it('omits cache-gate and does not throw when evaluateGate throws', async () => {
    const records = [makeRecord()];
    const summary = makeSummary();
    const opts: LimitBurnOpts = {
      ...makeOpts(records, summary),
      evaluateGate: () => { throw new Error('gate read failed'); },
    };
    const row = await buildLimitBurnRow('/root', 2, opts);
    // error swallowed → no cache-gate field, row still produced
    expect(row).toBe(
      '| Limit burn | $0.55 eşdeğer (task-başı $0.28, boot-cw %50%, hit-rate %83%) |',
    );
  });

  it('shows hit-rate %0 when cacheRead is zero', async () => {
    const summary = makeSummary({
      totals: {
        calls: 2, in: 1000, out: 200, cacheRead: 0, cacheWrite: 800,
        limitCost: 0.20, bootstrapShare: 0.5,
      },
    });
    const opts: LimitBurnOpts = {
      parseUsage: async () => [makeRecord()],
      summarize: () => summary,
    };
    const row = await buildLimitBurnRow('/root', 2, opts);
    expect(row).toContain('hit-rate %0%');
  });
});
