import { describe, it, expect } from 'vitest';
import { parseSprintNumber, shouldRemoveResolvedDebt } from '../../src/core/utils.js';
import type { DebtItem } from '../../src/core/types.js';
import { DebtPriority } from '../../src/core/types.js';

// ─── Helper ────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<DebtItem> = {}): DebtItem {
  return {
    id: 'DEBT-001',
    description: 'test debt',
    originTaskId: 't-001',
    originSprintId: 'sprint-001',
    priority: DebtPriority.NORMAL,
    sprintsOpen: 1,
    resolved: false,
    resolvedInSprintId: undefined,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

// ─── parseSprintNumber ──────────────────────────────────────────────

describe('parseSprintNumber', () => {
  it('parses sprint-021 → 21', () => {
    expect(parseSprintNumber('sprint-021')).toBe(21);
  });

  it('parses sprint-003 → 3', () => {
    expect(parseSprintNumber('sprint-003')).toBe(3);
  });

  it('parses sprint-001 → 1', () => {
    expect(parseSprintNumber('sprint-001')).toBe(1);
  });

  it('parses sprint-100 → 100', () => {
    expect(parseSprintNumber('sprint-100')).toBe(100);
  });

  it('returns 0 for unrecognised format', () => {
    expect(parseSprintNumber('s-2')).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(parseSprintNumber('')).toBe(0);
  });

  it('returns 0 for arbitrary string', () => {
    expect(parseSprintNumber('unknown')).toBe(0);
  });
});

// ─── shouldRemoveResolvedDebt ───────────────────────────────────────

describe('shouldRemoveResolvedDebt', () => {
  it('open entry → keep (returns false)', () => {
    const entry = makeEntry({ resolved: false });
    expect(shouldRemoveResolvedDebt(entry, 'sprint-022')).toBe(false);
  });

  it('open entry with resolvedInSprintId set → keep (resolved=false takes priority)', () => {
    const entry = makeEntry({ resolved: false, resolvedInSprintId: 'sprint-001' });
    expect(shouldRemoveResolvedDebt(entry, 'sprint-022')).toBe(false);
  });

  it('resolved + resolvedInSprintId undefined (legacy) → remove', () => {
    const entry = makeEntry({ resolved: true, resolvedInSprintId: undefined });
    expect(shouldRemoveResolvedDebt(entry, 'sprint-022')).toBe(true);
  });

  it('resolved 1 sprint ago (diff=1 < 3) → keep', () => {
    const entry = makeEntry({ resolved: true, resolvedInSprintId: 'sprint-021' });
    expect(shouldRemoveResolvedDebt(entry, 'sprint-022')).toBe(false);
  });

  it('resolved 2 sprints ago (diff=2 < 3) → keep', () => {
    const entry = makeEntry({ resolved: true, resolvedInSprintId: 'sprint-020' });
    expect(shouldRemoveResolvedDebt(entry, 'sprint-022')).toBe(false);
  });

  it('resolved 3 sprints ago (diff=3 = retentionSprints) → remove', () => {
    const entry = makeEntry({ resolved: true, resolvedInSprintId: 'sprint-019' });
    expect(shouldRemoveResolvedDebt(entry, 'sprint-022')).toBe(true);
  });

  it('resolved 5 sprints ago (diff=5 > 3) → remove', () => {
    const entry = makeEntry({ resolved: true, resolvedInSprintId: 'sprint-017' });
    expect(shouldRemoveResolvedDebt(entry, 'sprint-022')).toBe(true);
  });

  it('resolved in same sprint (diff=0) → keep', () => {
    const entry = makeEntry({ resolved: true, resolvedInSprintId: 'sprint-022' });
    expect(shouldRemoveResolvedDebt(entry, 'sprint-022')).toBe(false);
  });

  it('custom retentionSprints=5: diff=4 → keep', () => {
    const entry = makeEntry({ resolved: true, resolvedInSprintId: 'sprint-018' });
    expect(shouldRemoveResolvedDebt(entry, 'sprint-022', 5)).toBe(false);
  });

  it('custom retentionSprints=5: diff=5 → remove', () => {
    const entry = makeEntry({ resolved: true, resolvedInSprintId: 'sprint-017' });
    expect(shouldRemoveResolvedDebt(entry, 'sprint-022', 5)).toBe(true);
  });

  it('custom retentionSprints=1: diff=1 → remove', () => {
    const entry = makeEntry({ resolved: true, resolvedInSprintId: 'sprint-021' });
    expect(shouldRemoveResolvedDebt(entry, 'sprint-022', 1)).toBe(true);
  });
});

// ─── Integration: DEBT-002 retention ───────────────────────────────

describe('runDecay integration — DEBT-002 retention', () => {
  it('recently-resolved entry (diff < 3) survives decay filter', () => {
    const debt002 = makeEntry({
      id: 'DEBT-002',
      resolved: true,
      resolvedInSprintId: 'sprint-021',
    });
    // current sprint is sprint-022, diff = 1 < 3 → NOT removed
    expect(shouldRemoveResolvedDebt(debt002, 'sprint-022', 3)).toBe(false);
  });

  it('old-resolved entry (diff >= 3) is removed by decay filter', () => {
    const oldDebt = makeEntry({
      id: 'DEBT-001',
      resolved: true,
      resolvedInSprintId: 'sprint-019',
    });
    // diff = 3 >= 3 → removed
    expect(shouldRemoveResolvedDebt(oldDebt, 'sprint-022', 3)).toBe(true);
  });

  it('mixed batch: only old entries are filtered out', () => {
    const entries: DebtItem[] = [
      makeEntry({ id: 'OPEN-001', resolved: false }),
      makeEntry({ id: 'RECENT-001', resolved: true, resolvedInSprintId: 'sprint-021' }),
      makeEntry({ id: 'OLD-001', resolved: true, resolvedInSprintId: 'sprint-019' }),
      makeEntry({ id: 'LEGACY-001', resolved: true, resolvedInSprintId: undefined }),
    ];

    const kept = entries.filter(e => !shouldRemoveResolvedDebt(e, 'sprint-022', 3));
    const removed = entries.filter(e => shouldRemoveResolvedDebt(e, 'sprint-022', 3));

    expect(kept.map(e => e.id)).toEqual(['OPEN-001', 'RECENT-001']);
    expect(removed.map(e => e.id)).toEqual(['OLD-001', 'LEGACY-001']);
  });
});
