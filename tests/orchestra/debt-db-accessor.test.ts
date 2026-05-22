// B1/B2/B3 (Task #4a) — DB-backed debt accessor.
// getDebtItems() is the saf-DB-first replacement for
// parseDebtTable(readFile('.brain/DEBT.md')). Uses a real MemoryStore +
// real temp filesystem (debt-manager.test.ts mocks node:fs, which would
// prevent the SQLite DB from opening).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { MemoryStore } from '../../src/core/memory-store.js';
import { DebtPriority } from '../../src/core/types.js';
import { getDebtItems } from '../../src/core/debt-store.js';
import { recordRollbackInDebt } from '../../src/orchestra/rollback.js';
import { autoResolveDebt } from '../../src/orchestra/sprint-docs-updater.js';

const ROOT = join(process.cwd(), '.test-debt-accessor-' + process.pid);

function cleanup() {
  if (fs.existsSync(ROOT)) fs.rmSync(ROOT, { recursive: true, force: true });
}

function seedDebt(): MemoryStore {
  return new MemoryStore(join(ROOT, '.brain', 'memory.db'));
}

beforeEach(() => {
  cleanup();
  fs.mkdirSync(join(ROOT, '.brain'), { recursive: true });
});
afterEach(cleanup);

describe('getDebtItems', () => {
  it('maps a DB debt entry to the DebtItem shape', () => {
    const store = seedDebt();
    store.insert({
      id: 'debt-200-001', type: 'debt',
      title: 'Tech debt from 200-001: leftover validation',
      content: 'Task 200-001 evaluated as GO_WITH_TECH_DEBT.',
      source: 'brain', status: 'active', priority: 'high',
      sprint_id: 'sprint-200', sprint_num: 200, tags: ['debt'],
      metadata: { originTaskId: '200-001', originSprintId: 'sprint-200', sprintsOpen: 2 },
    });
    store.close();

    const items = getDebtItems(ROOT);
    expect(items).toHaveLength(1);
    const d = items[0]!;
    expect(d.id).toBe('debt-200-001');
    expect(d.description).toContain('200-001');
    expect(d.priority).toBe(DebtPriority.HIGH);
    expect(d.originTaskId).toBe('200-001');
    expect(d.originSprintId).toBe('sprint-200');
    expect(d.sprintsOpen).toBe(2);
    expect(d.resolved).toBe(false);
  });

  it('activeOnly excludes resolved debt', () => {
    const store = seedDebt();
    store.insert({
      id: 'debt-open', type: 'debt', title: 'still open',
      content: '', source: 'brain', status: 'active', priority: 'normal',
      sprint_id: 'sprint-200', sprint_num: 200, tags: ['debt'], metadata: {},
    });
    store.insert({
      id: 'debt-done', type: 'debt', title: 'resolved one',
      content: '', source: 'brain', status: 'resolved', priority: 'normal',
      sprint_id: 'sprint-200', sprint_num: 200, tags: ['debt'], metadata: {},
    });
    store.close();

    expect(getDebtItems(ROOT)).toHaveLength(2);
    const active = getDebtItems(ROOT, { activeOnly: true });
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe('debt-open');
    expect(active[0]!.resolved).toBe(false);
  });

  it('returns an empty array when no memory.db is present', () => {
    expect(getDebtItems(ROOT)).toEqual([]);
  });
});

describe('recordRollbackInDebt', () => {
  it('writes the rollback record to the DB, not to .brain/DEBT.md', () => {
    seedDebt().close(); // create an empty memory.db
    recordRollbackInDebt(ROOT, 'sprint-200', {
      success: true,
      message: 'Rolled back to safety point "deckent-backup-sprint-200"',
    });

    const rollback = getDebtItems(ROOT).find(d => d.id === 'rollback-sprint-200');
    expect(rollback).toBeDefined();
    expect(rollback!.description.toLowerCase()).toContain('rollback');

    // B1/B2: no legacy .brain/DEBT.md file written (no corrupt 7-col rows).
    expect(fs.existsSync(join(ROOT, '.brain', 'DEBT.md'))).toBe(false);
  });

  it('is idempotent — a second call does not duplicate the record', () => {
    seedDebt().close();
    recordRollbackInDebt(ROOT, 'sprint-200', { success: false, message: 'first' });
    recordRollbackInDebt(ROOT, 'sprint-200', { success: false, message: 'second' });

    const rollbacks = getDebtItems(ROOT).filter(d => d.id === 'rollback-sprint-200');
    expect(rollbacks).toHaveLength(1);
  });

  it('does not throw when no memory.db is present', () => {
    // .brain/ exists but no DB — recordRollbackInDebt must no-op safely.
    expect(() => recordRollbackInDebt(ROOT, 'sprint-300', { success: true, message: 'ok' }))
      .not.toThrow();
    expect(getDebtItems(ROOT)).toEqual([]);
  });
});

describe('autoResolveDebt', () => {
  function fixSprint(fixTaskId: string, fixForTaskId: string) {
    return { id: 'sprint-201', tasks: [{ id: fixTaskId, isPriorityFix: true, fixForTaskId }] };
  }

  it('resolves the DB debt entry whose fix task completed', () => {
    const store = seedDebt();
    store.insert({
      id: 'debt-200-005', type: 'debt', title: 'tech debt from 200-005',
      content: '', source: 'brain', status: 'active', priority: 'normal',
      sprint_id: 'sprint-200', sprint_num: 200, tags: ['debt'],
      metadata: { originTaskId: '200-005', originSprintId: 'sprint-200', sprintsOpen: 0 },
    });
    store.close();

    const count = autoResolveDebt(
      ROOT, fixSprint('200-005-fix', '200-005'), new Map([['200-005-fix', 'DONE']]),
    );

    expect(count).toBe(1);
    expect(getDebtItems(ROOT).find(d => d.id === 'debt-200-005')!.resolved).toBe(true);
  });

  it('leaves debt active when the fix task did not complete', () => {
    const store = seedDebt();
    store.insert({
      id: 'debt-200-006', type: 'debt', title: 'tech debt from 200-006',
      content: '', source: 'brain', status: 'active', priority: 'normal',
      sprint_id: 'sprint-200', sprint_num: 200, tags: ['debt'],
      metadata: { originTaskId: '200-006', originSprintId: 'sprint-200', sprintsOpen: 0 },
    });
    store.close();

    const count = autoResolveDebt(
      ROOT, fixSprint('200-006-fix', '200-006'), new Map([['200-006-fix', 'NO_GO']]),
    );

    expect(count).toBe(0);
    expect(getDebtItems(ROOT).find(d => d.id === 'debt-200-006')!.resolved).toBe(false);
  });

  it('resolves multiple debt entries in one pass', () => {
    const store = seedDebt();
    for (const tid of ['200-007', '200-008']) {
      store.insert({
        id: `debt-${tid}`, type: 'debt', title: `tech debt from ${tid}`,
        content: '', source: 'brain', status: 'active', priority: 'normal',
        sprint_id: 'sprint-200', sprint_num: 200, tags: ['debt'],
        metadata: { originTaskId: tid, originSprintId: 'sprint-200', sprintsOpen: 0 },
      });
    }
    store.close();

    const count = autoResolveDebt(ROOT, {
      id: 'sprint-201',
      tasks: [
        { id: '200-007-fix', isPriorityFix: true, fixForTaskId: '200-007' },
        { id: '200-008-fix', isPriorityFix: true, fixForTaskId: '200-008' },
      ],
    }, new Map([['200-007-fix', 'DONE'], ['200-008-fix', 'DONE']]));

    expect(count).toBe(2);
    expect(getDebtItems(ROOT, { activeOnly: true })).toHaveLength(0);
  });
});
