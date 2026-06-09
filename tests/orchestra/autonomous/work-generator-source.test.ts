import { describe, it, expect, vi } from 'vitest';
import { makeWorkGeneratorSource, makeDebtWorkGenerator } from '../../../src/orchestra/autonomous/work-generator-source.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';
import { DebtPriority } from '../../../src/core/sprint-types.js';
import type { DebtItem } from '../../../src/core/sprint-types.js';

const entry: BacklogEntry = {
  id: 'wg-debt-D-1',
  title: 'Fix auth leak',
  kind: 'task',
  spec: { description: '[source:debt] Fix auth leak' },
  policy: 'auto',
  trigger: { type: 'one-off' },
  status: 'pending',
  lastRun: null,
  lastResult: null,
};

describe('makeWorkGeneratorSource', () => {
  it('yields first candidate as a trigger when generate returns entries', () => {
    const src = makeWorkGeneratorSource({ generate: () => [entry] });
    const trigger = src.next();
    expect(trigger).not.toBeNull();
    expect(trigger?.id).toBe('work-gen-wg-debt-D-1');
    expect(trigger?.source).toBe('work-generator');
    expect(trigger?.action).toBe('autonomous.execute');
    expect(trigger?.requestedBy).toBe('system');
    expect((trigger?.payload as { entry: BacklogEntry }).entry).toBe(entry);
  });

  it('returns null when generate returns empty array', () => {
    const src = makeWorkGeneratorSource({ generate: () => [] });
    expect(src.next()).toBeNull();
  });

  it('swallows generator errors and returns null (fail-safe)', () => {
    const src = makeWorkGeneratorSource({
      generate: () => { throw new Error('db gone'); },
    });
    expect(() => src.next()).not.toThrow();
    expect(src.next()).toBeNull();
  });

  it('includes tenant in requestedBy when entry has tenant', () => {
    const tenantEntry: BacklogEntry = { ...entry, tenant: 'acme' };
    const src = makeWorkGeneratorSource({ generate: () => [tenantEntry] });
    const trigger = src.next();
    expect(trigger?.requestedBy).toBe('system:acme');
  });

  it('uses system requestedBy when entry has no tenant', () => {
    const noTenantEntry: BacklogEntry = { ...entry, tenant: undefined };
    const src = makeWorkGeneratorSource({ generate: () => [noTenantEntry] });
    const trigger = src.next();
    expect(trigger?.requestedBy).toBe('system');
  });

  it('yields only the first candidate per call', () => {
    const second: BacklogEntry = { ...entry, id: 'wg-debt-D-2', title: 'Second' };
    const src = makeWorkGeneratorSource({ generate: () => [entry, second] });
    const trigger = src.next();
    expect(trigger?.id).toBe('work-gen-wg-debt-D-1');
  });

  it('re-calls generate on each next() invocation', () => {
    let calls = 0;
    const src = makeWorkGeneratorSource({ generate: () => { calls++; return []; } });
    src.next();
    src.next();
    expect(calls).toBe(2);
  });
});

// ── makeDebtWorkGenerator (live debt → candidate producer, CLI wire) ──────────

function debt(over: Partial<DebtItem> = {}): DebtItem {
  return {
    id: 'D1', description: 'Fix flaky lock', originTaskId: '', originSprintId: 's-1',
    priority: DebtPriority.NORMAL, sprintsOpen: 1, resolved: false,
    createdAt: '2026-06-09T10:00:00Z', ...over,
  };
}

describe('makeDebtWorkGenerator', () => {
  it('maps active debt items to work-generator candidates', () => {
    const gen = makeDebtWorkGenerator({
      projectRoot: '/p',
      loadDebt: () => [debt()],
      clock: () => 0,
    });
    const candidates = gen();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.id).toBe('wg-debt-D1');
    expect(candidates[0]!.title).toBe('Fix flaky lock');
    expect(candidates[0]!.policy).toBe('auto');
    expect(candidates[0]!.trigger).toEqual({ type: 'one-off' });
  });

  it('maps HIGH/CRITICAL debt priority to risk-tagged policy', () => {
    const gen = makeDebtWorkGenerator({
      projectRoot: '/p',
      loadDebt: () => [debt({ id: 'D-high', priority: DebtPriority.HIGH }), debt({ id: 'D-crit', priority: DebtPriority.CRITICAL })],
      clock: () => 0,
    });
    const candidates = gen();
    expect(candidates.map(c => c.policy)).toEqual(['risk-tagged', 'risk-tagged']);
  });

  it('throttles scans: within intervalMs the loader is not re-called and [] is returned', () => {
    let now = 0;
    const loadDebt = vi.fn(() => [debt()]);
    const gen = makeDebtWorkGenerator({ projectRoot: '/p', intervalMs: 10_000, loadDebt, clock: () => now });
    expect(gen()).toHaveLength(1);
    now = 5_000;
    expect(gen()).toEqual([]);
    expect(loadDebt).toHaveBeenCalledTimes(1);
  });

  it('re-scans after intervalMs elapses', () => {
    let now = 0;
    const loadDebt = vi.fn(() => [debt()]);
    const gen = makeDebtWorkGenerator({ projectRoot: '/p', intervalMs: 10_000, loadDebt, clock: () => now });
    gen();
    now = 10_001;
    expect(gen()).toHaveLength(1);
    expect(loadDebt).toHaveBeenCalledTimes(2);
  });

  it('returns [] when the debt loader throws (fail-safe)', () => {
    const gen = makeDebtWorkGenerator({
      projectRoot: '/p',
      loadDebt: () => { throw new Error('db locked'); },
      clock: () => 0,
    });
    expect(() => gen()).not.toThrow();
    expect(gen()).toEqual([]);
  });
});
