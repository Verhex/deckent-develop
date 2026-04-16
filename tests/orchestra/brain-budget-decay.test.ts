import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DebtPriority } from '../../src/core/types.js';
import type { DebtItem } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => { throw new Error('ENOENT: no such file'); }),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
  // Sprint 139 async I/O migration: sprint-finalizer and other modules use
  // `import { promises as fsPromises } from 'node:fs'`. Bind async impls via
  // `vi.fn(async () => ...)` so vi.clearAllMocks preserves them.
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn().mockReturnValue(0),
  createWorkerStateMachine: vi.fn(() => ({
    transition: vi.fn(),
    canTransition: vi.fn(() => true),
    getState: vi.fn(() => 'SPAWNING'),
    stop: vi.fn(),
  })),
  removeWorkerStateMachine: vi.fn(() => true),
  isWorkerStoppable: vi.fn(() => true),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    countBrainLines: vi.fn().mockReturnValue(100),
  };
});

// ── MemoryStore mock for DB-first code paths ─────────────────────
const mockMemStore = {
  getById: vi.fn().mockReturnValue(null),
  getByType: vi.fn().mockReturnValue([]),
  insert: vi.fn().mockImplementation((input) => ({ ...input, metadata: JSON.stringify(input.metadata ?? {}), tag_text: (input.tags ?? []).join(' '), status: input.status ?? 'active', priority: input.priority ?? 'normal', sprint_id: input.sprint_id ?? null, sprint_num: input.sprint_num ?? 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })),
  upsert: vi.fn().mockImplementation((input) => ({ ...input, metadata: JSON.stringify(input.metadata ?? {}), tag_text: (input.tags ?? []).join(' '), status: input.status ?? 'active', priority: input.priority ?? 'normal' })),
  softDelete: vi.fn(), totalCount: vi.fn().mockReturnValue(0), countByType: vi.fn(),
  decay: vi.fn(), close: vi.fn(), getRawDb: vi.fn(),
  getRelationsFrom: vi.fn().mockReturnValue([]), getRelationsTo: vi.fn().mockReturnValue([]),
  getTagsForEntry: vi.fn().mockReturnValue([]), getByTags: vi.fn().mockReturnValue([]),
  getHistory: vi.fn().mockReturnValue([]), restore: vi.fn(), getSchemaVersion: vi.fn().mockReturnValue(1),
};
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockMemStore),
}));


import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { countBrainLines, parseDebtTable, generateDebtTable } from '../../src/core/utils.js';
import { archiveResolvedDebt, runDecay } from '../../src/orchestra/debt-manager.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeDebtItem(overrides: Partial<DebtItem> = {}): DebtItem {
  return {
    id: 'debt-001',
    description: 'Some tech debt',
    originTaskId: 'task-001',
    originSprintId: 'sprint-001',
    priority: DebtPriority.NORMAL,
    sprintsOpen: 0,
    resolved: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── archiveResolvedDebt ─────────────────────────────────────────────

describe('archiveResolvedDebt', () => {
  // archiveResolvedDebt now uses MemoryStore DB instead of file I/O.
  // It opens the store, queries getByType('debt'), filters resolved entries,
  // and returns the count of resolved entries.

  /** Helper: make existsSync return true for the memory.db path */
  function enableMemoryDb(): void {
    vi.mocked(existsSync).mockImplementation((p: unknown) =>
      String(p).includes('memory.db') ? true : false,
    );
  }

  /** Helper: make a MemoryEntryV2-like row for getByType results */
  function makeDbDebtEntry(id: string, status: 'active' | 'resolved'): Record<string, unknown> {
    return {
      id, type: 'debt', title: id, content: '', source: 'test',
      status, priority: 'normal', sprint_id: null, sprint_num: 0,
      metadata: '{}', tag_text: '', summary: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it('returns 0 when DB is missing', () => {
    // existsSync returns false → getMemoryStore returns null → 0
    const count = archiveResolvedDebt('/root');
    expect(count).toBe(0);
  });

  it('returns 0 when no resolved items exist', () => {
    enableMemoryDb();
    mockMemStore.getByType.mockReturnValue([
      makeDbDebtEntry('debt-001', 'active'),
      makeDbDebtEntry('debt-002', 'active'),
    ]);
    const count = archiveResolvedDebt('/root');
    expect(count).toBe(0);
  });

  it('returns count of all resolved items', () => {
    enableMemoryDb();
    mockMemStore.getByType.mockReturnValue([
      makeDbDebtEntry('debt-001', 'resolved'),
      makeDbDebtEntry('debt-002', 'resolved'),
      makeDbDebtEntry('debt-003', 'active'),
    ]);

    const count = archiveResolvedDebt('/root');
    expect(count).toBe(2);
  });

  it('returns 0 when DB has only active debt', () => {
    enableMemoryDb();
    mockMemStore.getByType.mockReturnValue([
      makeDbDebtEntry('debt-open', 'active'),
    ]);

    const count = archiveResolvedDebt('/root');
    expect(count).toBe(0);
  });

  it('counts resolved entries correctly with mixed statuses', () => {
    enableMemoryDb();
    mockMemStore.getByType.mockReturnValue([
      makeDbDebtEntry('debt-new', 'resolved'),
      makeDbDebtEntry('debt-old', 'resolved'),
      makeDbDebtEntry('debt-active', 'active'),
    ]);

    const count = archiveResolvedDebt('/root');
    expect(count).toBe(2);
  });

  it('closes the store after querying', () => {
    enableMemoryDb();
    mockMemStore.getByType.mockReturnValue([
      makeDbDebtEntry('debt-001', 'resolved'),
    ]);

    archiveResolvedDebt('/root');

    expect(mockMemStore.close).toHaveBeenCalled();
  });

  it('handles all resolved items (returns full count)', () => {
    enableMemoryDb();
    mockMemStore.getByType.mockReturnValue([
      makeDbDebtEntry('debt-001', 'resolved'),
      makeDbDebtEntry('debt-002', 'resolved'),
    ]);

    const count = archiveResolvedDebt('/root');
    expect(count).toBe(2);
  });
});

// ─── runDecay with archiveResolvedDebt ──────────────────────────────

describe('runDecay — MemoryStore DB integration', () => {
  // runDecay now uses MemoryStore DB. It opens the store, checks totalCount
  // against the budget, calls store.decay() if over budget or force=true,
  // and returns { linesBefore, linesAfter, removedDebtCount: 0, ... }.

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(countBrainLines).mockReturnValue(700);
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it('calls store.decay when force=true and returns counts', () => {
    // Enable DB path
    vi.mocked(existsSync).mockImplementation((p: unknown) =>
      String(p).includes('memory.db') ? true : false,
    );
    mockMemStore.totalCount
      .mockReturnValueOnce(100)  // totalBefore
      .mockReturnValueOnce(80);  // totalAfter
    mockMemStore.decay.mockReturnValue(undefined);

    const result = runDecay('/root', 'sprint-061', { force: true });

    expect(mockMemStore.decay).toHaveBeenCalledWith(61, 8); // sprintNum=61, default decaySprints=8
    expect(result.linesBefore).toBe(100);
    expect(result.linesAfter).toBe(80);
    expect(result.removedDebtCount).toBe(0); // DB decay doesn't separately track debt removal
  });

  it('skips decay when under budget and force=false', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) =>
      String(p).includes('memory.db') ? true : false,
    );
    mockMemStore.totalCount.mockReturnValue(50); // under budget (default 900)

    const result = runDecay('/root', 'sprint-061');

    expect(mockMemStore.decay).not.toHaveBeenCalled();
    expect(result.linesBefore).toBe(50);
    expect(result.linesAfter).toBe(50);
    expect(result.removedDebtCount).toBe(0);
  });
});
