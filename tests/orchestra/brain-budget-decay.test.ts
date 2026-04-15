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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it('returns 0 when DEBT.md is empty/missing', () => {
    const count = archiveResolvedDebt('/root');
    expect(count).toBe(0);
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('returns 0 when no resolved items exist', () => {
    const items = [
      makeDebtItem({ id: 'debt-001', resolved: false }),
      makeDebtItem({ id: 'debt-002', resolved: false }),
    ];
    vi.mocked(readFileSync).mockReturnValue(generateDebtTable(items));
    const count = archiveResolvedDebt('/root');
    expect(count).toBe(0);
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('archives all resolved items and returns count', () => {
    const items = [
      makeDebtItem({ id: 'debt-001', resolved: true, resolvedInSprintId: 'sprint-059' }),
      makeDebtItem({ id: 'debt-002', resolved: true, resolvedInSprintId: 'sprint-060' }),
      makeDebtItem({ id: 'debt-003', resolved: false }),
    ];
    vi.mocked(readFileSync).mockReturnValue(generateDebtTable(items));

    const count = archiveResolvedDebt('/root');
    expect(count).toBe(2);

    // Should have written archive and updated DEBT.md
    const writeCalls = vi.mocked(writeFileSync).mock.calls;
    expect(writeCalls.length).toBe(2);

    // Archive write: contains all resolved items
    const archiveWrite = writeCalls.find(c => (c[0] as string).includes('DEBT-ARCHIVE'));
    expect(archiveWrite).toBeDefined();
    const archived = parseDebtTable(archiveWrite![1] as string);
    expect(archived).toHaveLength(2);
    expect(archived.map(d => d.id)).toContain('debt-001');
    expect(archived.map(d => d.id)).toContain('debt-002');
  });

  it('keeps only open items in DEBT.md after archiving', () => {
    const items = [
      makeDebtItem({ id: 'debt-open', resolved: false }),
      makeDebtItem({ id: 'debt-resolved', resolved: true, resolvedInSprintId: 'sprint-059' }),
    ];
    vi.mocked(readFileSync).mockReturnValue(generateDebtTable(items));

    archiveResolvedDebt('/root');

    const writeCalls = vi.mocked(writeFileSync).mock.calls;
    const debtWrite = writeCalls.find(c => (c[0] as string).includes('DEBT.md'));
    expect(debtWrite).toBeDefined();
    const remaining = parseDebtTable(debtWrite![1] as string);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe('debt-open');
    expect(remaining[0]!.resolved).toBe(false);
  });

  it('merges with existing DEBT-ARCHIVE.md without duplicates', () => {
    const existingArchived = [
      makeDebtItem({ id: 'debt-old', resolved: true, resolvedInSprintId: 'sprint-050' }),
    ];
    const currentDebt = [
      makeDebtItem({ id: 'debt-new', resolved: true, resolvedInSprintId: 'sprint-060' }),
      makeDebtItem({ id: 'debt-old', resolved: true, resolvedInSprintId: 'sprint-050' }), // duplicate
    ];

    vi.mocked(existsSync).mockImplementation((p: unknown) =>
      String(p).includes('DEBT-ARCHIVE') ? true : false,
    );
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      if (String(p).includes('DEBT-ARCHIVE')) return generateDebtTable(existingArchived);
      if (String(p).includes('DEBT.md')) return generateDebtTable(currentDebt);
      throw new Error('ENOENT');
    });

    const count = archiveResolvedDebt('/root');
    expect(count).toBe(2); // both resolved items counted

    const archiveWrite = vi.mocked(writeFileSync).mock.calls.find(c =>
      (c[0] as string).includes('DEBT-ARCHIVE'),
    );
    expect(archiveWrite).toBeDefined();
    const archived = parseDebtTable(archiveWrite![1] as string);
    // Only 2 unique items (deduplication of 'debt-old')
    expect(archived).toHaveLength(2);
    const ids = archived.map(d => d.id);
    expect(ids).toContain('debt-old');
    expect(ids).toContain('debt-new');
  });

  it('creates archive directory if it does not exist', () => {
    const items = [
      makeDebtItem({ id: 'debt-001', resolved: true, resolvedInSprintId: 'sprint-059' }),
    ];
    vi.mocked(readFileSync).mockReturnValue(generateDebtTable(items));
    vi.mocked(existsSync).mockReturnValue(false);

    archiveResolvedDebt('/root');

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('archive'),
      expect.objectContaining({ recursive: true }),
    );
  });

  it('handles all resolved items (empty DEBT.md after archive)', () => {
    const items = [
      makeDebtItem({ id: 'debt-001', resolved: true, resolvedInSprintId: 'sprint-059' }),
      makeDebtItem({ id: 'debt-002', resolved: true, resolvedInSprintId: 'sprint-059' }),
    ];
    vi.mocked(readFileSync).mockReturnValue(generateDebtTable(items));

    const count = archiveResolvedDebt('/root');
    expect(count).toBe(2);

    const debtWrite = vi.mocked(writeFileSync).mock.calls.find(c =>
      (c[0] as string).includes('DEBT.md'),
    );
    expect(debtWrite).toBeDefined();
    // Empty table (no data rows)
    const remaining = parseDebtTable(debtWrite![1] as string);
    expect(remaining).toHaveLength(0);
  });
});

// ─── runDecay with archiveResolvedDebt ──────────────────────────────

describe('runDecay — archiveResolvedDebt integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(countBrainLines).mockReturnValue(700); // over budget
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it('archives resolved debt during decay run', () => {
    const items = [
      makeDebtItem({ id: 'debt-resolved', resolved: true, resolvedInSprintId: 'sprint-059' }),
      makeDebtItem({ id: 'debt-open', resolved: false }),
    ];
    vi.mocked(existsSync).mockImplementation((p: unknown) =>
      String(p).includes('DEBT.md') ? false : false, // no archive yet
    );
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      if (String(p).includes('DEBT.md') && !String(p).includes('ARCHIVE')) {
        return generateDebtTable(items);
      }
      throw new Error('ENOENT');
    });

    const result = runDecay('/root', 'sprint-061', { force: true });

    expect(result.removedDebtCount).toBe(1);
    // Archive write should have happened
    const archiveWrite = vi.mocked(writeFileSync).mock.calls.find(c =>
      (c[0] as string).includes('DEBT-ARCHIVE'),
    );
    expect(archiveWrite).toBeDefined();
  });

  it('returns removedDebtCount=0 when no resolved debt', () => {
    const items = [makeDebtItem({ id: 'debt-open', resolved: false })];
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      if (String(p).includes('DEBT.md') && !String(p).includes('ARCHIVE')) {
        return generateDebtTable(items);
      }
      throw new Error('ENOENT');
    });

    const result = runDecay('/root', 'sprint-061', { force: true });
    expect(result.removedDebtCount).toBe(0);
  });
});
