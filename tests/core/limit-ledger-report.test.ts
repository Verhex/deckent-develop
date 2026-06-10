import { describe, it, expect } from 'vitest';
import {
  mapSessionToTask,
  extractTaskIdFromStream,
  summarizeSprint,
  type TaskUsageSummary,
  type SprintUsageSummary,
} from '../../src/core/limit-ledger-report.js';
import type { UsageRecord, LedgerPrices } from '../../src/core/limit-ledger.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    ts: '2026-06-10T10:00:00.000Z',
    model: 'claude-sonnet-4-6',
    sessionFile: 'session-abc.jsonl',
    projectDir: 'my-project',
    in: 1000,
    out: 200,
    cacheRead: 5000,
    cacheWrite: 800,
    ...overrides,
  };
}

/** Build a JSONL line with message.content content-block array */
function makeContentLine(text: string): string {
  return JSON.stringify({
    timestamp: '2026-06-10T10:00:00.000Z',
    message: {
      role: 'user',
      content: [{ type: 'text', text }],
    },
  });
}

// ─── mapSessionToTask ─────────────────────────────────────────────────────────

describe('mapSessionToTask', () => {
  it('extracts a base task ID from text', () => {
    const text = 'Read your task file at .tasks/task-273-001.json and complete it.';
    expect(mapSessionToTask(text)).toBe('273-001');
  });

  it('returns the most specific match when fix-chain is present', () => {
    // All three variants present; should pick the deepest fix
    const text =
      'Base: .tasks/task-273-001.json, fix: .tasks/task-273-001-fix.json, fix-fix: .tasks/task-273-001-fix-fix.json';
    expect(mapSessionToTask(text)).toBe('273-001-fix-fix');
  });

  it('prefers single-fix over base when both appear', () => {
    const text = 'Original .tasks/task-273-002.json and .tasks/task-273-002-fix.json';
    expect(mapSessionToTask(text)).toBe('273-002-fix');
  });

  it('returns null when no task pattern is present', () => {
    expect(mapSessionToTask('no task reference here')).toBeNull();
  });

  it('is case-insensitive for the pattern', () => {
    // The pattern is case-insensitive on the prefix; task IDs are digits/hyphens
    const text = '.tasks/task-001-001.json';
    expect(mapSessionToTask(text)).toBe('001-001');
  });
});

// ─── extractTaskIdFromStream ──────────────────────────────────────────────────

describe('extractTaskIdFromStream', () => {
  it('extracts task ID from message.content text block in JSONL', () => {
    const lines = [makeContentLine('Read .tasks/task-273-002.json and implement it.')];
    expect(extractTaskIdFromStream(lines)).toBe('273-002');
  });

  it('extracts task ID from top-level content string', () => {
    const line = JSON.stringify({
      timestamp: '2026-06-10T10:00:00.000Z',
      content: 'Task at .tasks/task-273-003.json',
    });
    expect(extractTaskIdFromStream([line])).toBe('273-003');
  });

  it('only checks the first 6 lines', () => {
    const irrelevant = JSON.stringify({ timestamp: 't', content: 'no task here' });
    const withTask = makeContentLine('.tasks/task-273-004.json');
    // Put the task ID on line 7 (index 6) — should NOT be found
    const lines = [irrelevant, irrelevant, irrelevant, irrelevant, irrelevant, irrelevant, withTask];
    expect(extractTaskIdFromStream(lines)).toBeNull();
  });

  it('finds task ID on line 6 (index 5 — last allowed)', () => {
    const irrelevant = JSON.stringify({ timestamp: 't', content: 'no task here' });
    const withTask = makeContentLine('.tasks/task-273-005.json');
    const lines = [irrelevant, irrelevant, irrelevant, irrelevant, irrelevant, withTask];
    expect(extractTaskIdFromStream(lines)).toBe('273-005');
  });

  it('tolerates malformed JSON lines without throwing', () => {
    const lines = [
      '{ broken json',
      '',
      'not json at all',
      makeContentLine('.tasks/task-273-006.json'),
    ];
    expect(() => extractTaskIdFromStream(lines)).not.toThrow();
    expect(extractTaskIdFromStream(lines)).toBe('273-006');
  });

  it('returns null for empty lines array', () => {
    expect(extractTaskIdFromStream([])).toBeNull();
  });
});

// ─── summarizeSprint ─────────────────────────────────────────────────────────

describe('summarizeSprint', () => {
  it('aggregates records for a single task', () => {
    const records = [
      makeRecord({ sessionFile: 'sess1.jsonl', in: 1000, out: 200, cacheRead: 3000, cacheWrite: 500 }),
      makeRecord({ sessionFile: 'sess1.jsonl', in: 800, out: 150, cacheRead: 2000, cacheWrite: 0 }),
    ];
    const taskMap = { 'sess1.jsonl': '273-001' };

    const summary = summarizeSprint(records, taskMap);

    expect(summary.tasks).toHaveLength(1);
    const t = summary.tasks[0]!;
    expect(t.taskId).toBe('273-001');
    expect(t.calls).toBe(2);
    expect(t.in).toBe(1800);
    expect(t.out).toBe(350);
    expect(t.cacheRead).toBe(5000);
    expect(t.cacheWrite).toBe(500);
  });

  it('bootstrapCw equals the first call cacheWrite (by ts order)', () => {
    const records = [
      makeRecord({ ts: '2026-06-10T10:00:00.000Z', sessionFile: 's.jsonl', cacheWrite: 900 }),
      makeRecord({ ts: '2026-06-10T10:01:00.000Z', sessionFile: 's.jsonl', cacheWrite: 0 }),
      makeRecord({ ts: '2026-06-10T10:02:00.000Z', sessionFile: 's.jsonl', cacheWrite: 50 }),
    ];
    const taskMap = { 's.jsonl': '273-002' };

    const summary = summarizeSprint(records, taskMap);
    // bootstrapCw should be the first call's cacheWrite = 900
    expect(summary.tasks[0]!.bootstrapCw).toBe(900);
  });

  it('bootstrapCw uses insertion order when ts is null', () => {
    const records = [
      makeRecord({ ts: null, sessionFile: 's.jsonl', cacheWrite: 750 }),
      makeRecord({ ts: null, sessionFile: 's.jsonl', cacheWrite: 0 }),
    ];
    const taskMap = { 's.jsonl': '273-003' };

    const summary = summarizeSprint(records, taskMap);
    expect(summary.tasks[0]!.bootstrapCw).toBe(750);
  });

  it('computes hitRate as cacheRead / (in + cacheRead)', () => {
    const records = [
      makeRecord({ sessionFile: 's.jsonl', in: 1000, cacheRead: 4000, cacheWrite: 500 }),
    ];
    const taskMap = { 's.jsonl': '273-004' };

    const summary = summarizeSprint(records, taskMap);
    // hitRate = 4000 / (1000 + 4000) = 0.8
    expect(summary.tasks[0]!.hitRate).toBeCloseTo(0.8, 6);
  });

  it('hitRate is 0 when in and cacheRead are both 0', () => {
    const records = [
      makeRecord({ sessionFile: 's.jsonl', in: 0, cacheRead: 0, cacheWrite: 100 }),
    ];
    const taskMap = { 's.jsonl': '273-005' };

    const summary = summarizeSprint(records, taskMap);
    expect(summary.tasks[0]!.hitRate).toBe(0);
  });

  it('computes limitCost using provided prices', () => {
    const prices: LedgerPrices = {
      'claude-sonnet-4-6': { in: 0.000003, out: 0.000015 },
    };
    const records = [
      makeRecord({
        sessionFile: 's.jsonl',
        model: 'claude-sonnet-4-6',
        in: 10_000,
        out: 2_000,
        cacheRead: 5_000,
        cacheWrite: 4_000,
      }),
    ];
    const taskMap = { 's.jsonl': '273-006' };

    const summary = summarizeSprint(records, taskMap, prices);
    // in: 10000×0.000003=0.03, out: 2000×0.000015=0.03, cw: 4000×1.25×0.000003=0.015 → 0.075
    expect(summary.tasks[0]!.limitCost).toBeCloseTo(0.075, 8);
    expect(summary.totals.limitCost).toBeCloseTo(0.075, 8);
  });

  it('sprint totals sum across all tasks correctly', () => {
    const records = [
      makeRecord({ sessionFile: 'a.jsonl', in: 1000, out: 100, cacheRead: 2000, cacheWrite: 300 }),
      makeRecord({ sessionFile: 'b.jsonl', in: 500, out: 50, cacheRead: 1000, cacheWrite: 200 }),
    ];
    const taskMap = { 'a.jsonl': '273-007', 'b.jsonl': '273-008' };

    const summary = summarizeSprint(records, taskMap);
    expect(summary.totals.calls).toBe(2);
    expect(summary.totals.in).toBe(1500);
    expect(summary.totals.out).toBe(150);
    expect(summary.totals.cacheRead).toBe(3000);
    expect(summary.totals.cacheWrite).toBe(500);
  });

  it('bootstrapShare = sum(bootstrapCw) / totals.cacheWrite', () => {
    const records = [
      makeRecord({ ts: '2026-06-10T10:00:00.000Z', sessionFile: 'a.jsonl', cacheWrite: 600 }),
      makeRecord({ ts: '2026-06-10T10:01:00.000Z', sessionFile: 'a.jsonl', cacheWrite: 200 }),
      makeRecord({ ts: '2026-06-10T10:00:00.000Z', sessionFile: 'b.jsonl', cacheWrite: 400 }),
    ];
    const taskMap = { 'a.jsonl': '273-009a', 'b.jsonl': '273-009b' };

    const summary = summarizeSprint(records, taskMap);
    // task a: bootstrapCw=600, totalCw=800; task b: bootstrapCw=400, totalCw=400
    // totals.cacheWrite=1200, totalBoot=1000, bootstrapShare=1000/1200≈0.833
    expect(summary.totals.bootstrapShare).toBeCloseTo(1000 / 1200, 6);
  });

  it('bootstrapShare is 0 when totals.cacheWrite is 0', () => {
    const records = [
      makeRecord({ sessionFile: 's.jsonl', cacheWrite: 0 }),
    ];
    const taskMap = { 's.jsonl': '273-010' };

    const summary = summarizeSprint(records, taskMap);
    expect(summary.totals.bootstrapShare).toBe(0);
  });

  it('excludes records whose sessionFile is not in taskMap', () => {
    const records = [
      makeRecord({ sessionFile: 'known.jsonl', in: 100 }),
      makeRecord({ sessionFile: 'unknown.jsonl', in: 999 }),
    ];
    const taskMap = { 'known.jsonl': '273-011' };

    const summary = summarizeSprint(records, taskMap);
    expect(summary.tasks).toHaveLength(1);
    expect(summary.tasks[0]!.in).toBe(100);
    expect(summary.totals.in).toBe(100);
  });

  it('applies durationMs from durationMap to matching tasks', () => {
    const records = [
      makeRecord({ sessionFile: 'a.jsonl' }),
      makeRecord({ sessionFile: 'b.jsonl' }),
    ];
    const taskMap = { 'a.jsonl': '273-012a', 'b.jsonl': '273-012b' };
    const durationMap = { '273-012a': 45000, '273-012b': 62000 };

    const summary = summarizeSprint(records, taskMap, {}, durationMap);
    const taskA = summary.tasks.find((t) => t.taskId === '273-012a')!;
    const taskB = summary.tasks.find((t) => t.taskId === '273-012b')!;
    expect(taskA.durationMs).toBe(45000);
    expect(taskB.durationMs).toBe(62000);
  });

  it('does not set durationMs when not in durationMap', () => {
    const records = [makeRecord({ sessionFile: 's.jsonl' })];
    const taskMap = { 's.jsonl': '273-013' };

    const summary = summarizeSprint(records, taskMap);
    expect(summary.tasks[0]!.durationMs).toBeUndefined();
  });

  it('selects dominant model by call count', () => {
    const records = [
      makeRecord({ sessionFile: 's.jsonl', model: 'claude-haiku-4-5' }),
      makeRecord({ sessionFile: 's.jsonl', model: 'claude-sonnet-4-6' }),
      makeRecord({ sessionFile: 's.jsonl', model: 'claude-sonnet-4-6' }),
    ];
    const taskMap = { 's.jsonl': '273-014' };

    const summary = summarizeSprint(records, taskMap);
    expect(summary.tasks[0]!.model).toBe('claude-sonnet-4-6');
  });

  it('returns empty tasks and zero totals for empty records', () => {
    const summary = summarizeSprint([], {});
    expect(summary.tasks).toHaveLength(0);
    expect(summary.totals.calls).toBe(0);
    expect(summary.totals.bootstrapShare).toBe(0);
  });
});
