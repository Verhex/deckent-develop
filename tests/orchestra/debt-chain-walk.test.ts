/**
 * Sprint 365 — Task 365-001.
 *
 * Unit tests for `resolveDebtChain()` — the single shared definition (extracted
 * from the FIX phase and now also used by the EVALUATE phase) that resolves a
 * priority-fix task's ENTIRE debt lineage by walking `fixForTaskId` links to the
 * root, not just the immediate parent.
 *
 * These were the mechanical root cause of the multi-sprint CRITICAL-debt pile-up
 * (debt-357-015-fix / debt-362-001-fix): a fix-of-a-fix completing via EVALUATE
 * resolved only `debt-<fixForTaskId>`, leaving the origin debt `active` to
 * re-inject every sprint.
 *
 * Hermetic: node:fs + memory-store + worker are mocked; no gitignored state,
 * no real DB, no tmpdir needed (pure in-memory).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn().mockReturnValue(0),
}));

// ── MemoryStore mock for DB-first resolveDebt path ────────────────
const mockMemStore = {
  getById: vi.fn(),
  getByType: vi.fn().mockReturnValue([]),
  insert: vi.fn(),
  upsert: vi.fn().mockImplementation((input) => ({ ...input })),
  softDelete: vi.fn(), totalCount: vi.fn().mockReturnValue(0), countByType: vi.fn(),
  decay: vi.fn(), close: vi.fn(), getRawDb: vi.fn(),
  getRelationsFrom: vi.fn().mockReturnValue([]), getRelationsTo: vi.fn().mockReturnValue([]),
  getTagsForEntry: vi.fn().mockReturnValue([]), getByTags: vi.fn().mockReturnValue([]),
  getHistory: vi.fn().mockReturnValue([]), restore: vi.fn(), getSchemaVersion: vi.fn().mockReturnValue(1),
};
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockMemStore),
}));

import { readFileSync, existsSync } from 'node:fs';
import { resolveDebtChain } from '../../src/orchestra/debt-chain.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedExistsSync = vi.mocked(existsSync);

const ROOT = '/project';
const SPRINT = 'sprint-365';

/** Active DB debt entry so resolveDebt() finds + resolves it. */
function activeDebtEntry(id: string) {
  return {
    id, type: 'debt', title: 'Test debt', content: '', source: 'brain',
    summary: null, status: 'active', priority: 'critical',
    sprint_id: 'sprint-000', sprint_num: 0, tag_text: '',
    created_at: '2026-03-17T00:00:00.000Z', updated_at: '2026-03-17T00:00:00.000Z',
    deleted_at: null,
    metadata: JSON.stringify({ originTaskId: '', originSprintId: 'sprint-000', sprintsOpen: 0 }),
  };
}

/**
 * Wire the mocks:
 *  - memory.db "exists" so getMemoryStore returns the mock store.
 *  - getById returns an ACTIVE entry for every `debt-*` id (so each hop resolves).
 *  - readFileSync serves task-<id>.json bodies from `taskFiles`; unknown paths
 *    return '' → JSON.parse throws → readJsonSafe null → walk stops (missing file).
 */
function wire(taskFiles: Record<string, { fixForTaskId?: string }>): void {
  mockedExistsSync.mockImplementation((p: unknown) => String(p).includes('memory.db'));
  mockMemStore.getById.mockImplementation((id: string) =>
    id.startsWith('debt-') ? activeDebtEntry(id) : null);
  mockedReadFileSync.mockImplementation((p: unknown) => {
    const s = String(p);
    for (const [taskId, body] of Object.entries(taskFiles)) {
      if (s.endsWith(`task-${taskId}.json`)) return JSON.stringify(body);
    }
    return '';
  });
}

/** IDs that resolveDebtChain marked resolved (via a status='resolved' upsert). */
function resolvedIds(): string[] {
  return mockMemStore.upsert.mock.calls
    .map((args: unknown[]) => args[0] as Record<string, unknown>)
    .filter(input => input.status === 'resolved')
    .map(input => input.id as string);
}

describe('resolveDebtChain', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('single-hop (direct fix, no ancestor task file): resolves only the immediate parent debt', () => {
    wire({}); // no task files → walk stops after the first hop

    resolveDebtChain(ROOT, 'fix-1', 'origin', SPRINT);

    expect(resolvedIds()).toEqual(['debt-origin']);
  });

  it('multi-hop (A-fix → B → C): resolves the WHOLE ancestor lineage to the root', () => {
    wire({
      'A-fix': { fixForTaskId: 'B' },
      'B': { fixForTaskId: 'C' },
      // task-C.json absent → C is the root; walk stops after resolving debt-C
    });

    resolveDebtChain(ROOT, 'fix-top', 'A-fix', SPRINT);

    expect(resolvedIds()).toEqual(['debt-A-fix', 'debt-B', 'debt-C']);
  });

  it('records the correct resolvedInSprintId on every hop', () => {
    wire({ 'A-fix': { fixForTaskId: 'B' } });

    resolveDebtChain(ROOT, 'fix-top', 'A-fix', SPRINT);

    const sprints = mockMemStore.upsert.mock.calls
      .map((args: unknown[]) => args[0] as Record<string, unknown>)
      .filter(input => input.status === 'resolved')
      .map(input => (input.metadata as Record<string, unknown>).resolvedInSprintId);
    expect(sprints).toEqual([SPRINT, SPRINT]);
  });

  it('cycle guard: a self-referential fixForTaskId resolves once and does not loop forever', () => {
    wire({ 'X': { fixForTaskId: 'X' } }); // X points at itself

    resolveDebtChain(ROOT, 'fix-top', 'X', SPRINT);

    expect(resolvedIds()).toEqual(['debt-X']); // resolved exactly once, no hang
  });

  it('never resolves the fix task\'s own debt (seed guard): firstAncestor === seed is a no-op', () => {
    wire({ 'fix-1': { fixForTaskId: 'origin' } });

    resolveDebtChain(ROOT, 'fix-1', 'fix-1', SPRINT);

    expect(resolvedIds()).toEqual([]); // seed already in `seen` → loop body never runs
  });

  it('does not double-resolve when a longer chain revisits an id (bounded by `seen`)', () => {
    wire({
      'A-fix': { fixForTaskId: 'B' },
      'B': { fixForTaskId: 'A-fix' }, // B loops back to A-fix
    });

    resolveDebtChain(ROOT, 'fix-top', 'A-fix', SPRINT);

    expect(resolvedIds()).toEqual(['debt-A-fix', 'debt-B']); // each resolved once
  });
});
