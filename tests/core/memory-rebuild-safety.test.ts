// tests/core/memory-rebuild-safety.test.ts
//
// Sprint 169 Task 7 (C2 — Bug Z3): rebuild contract = backup → import →
// restore → verify. Strict mode throws + rolls back when relations count
// drops below the pre-rebuild snapshot.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import {
  backupRelations,
  restoreRelations,
  rebuildWithRelationSafety,
} from '../../src/core/memory-import.js';
import type { CreateEntryInput } from '../../src/core/memory-types.js';
import { DeckentError } from '../../src/core/errors.js';

let store: MemoryStore;
let tmpDir: string;

function makeEntry(id: string): CreateEntryInput {
  return {
    id,
    type: 'adr',
    title: `Entry ${id}`,
    content: `Content for ${id}`,
    source: 'system',
    status: 'accepted',
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mem-rebuild-safety-'));
  store = new MemoryStore(join(tmpDir, 'test.db'));
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('backupRelations', () => {
  it('returns every row in the relations table', () => {
    store.insert(makeEntry('a'));
    store.insert(makeEntry('b'));
    store.insert(makeEntry('c'));
    store.insertRelation('a', 'b', 'references');
    store.insertRelation('a', 'c', 'supersedes');

    const backup = backupRelations(store);
    expect(backup).toHaveLength(2);
    expect(backup.map((r) => `${r.from_id}→${r.to_id}/${r.rel_type}`).sort()).toEqual([
      'a→b/references',
      'a→c/supersedes',
    ]);
  });

  it('returns empty array when no relations exist', () => {
    store.insert(makeEntry('a'));
    expect(backupRelations(store)).toEqual([]);
  });
});

describe('restoreRelations', () => {
  it('is idempotent — second call inserts zero new rows', () => {
    store.insert(makeEntry('a'));
    store.insert(makeEntry('b'));
    const backup = [
      { from_id: 'a', to_id: 'b', rel_type: 'references' as const, created_at: '' },
    ];

    const first = restoreRelations(store, backup);
    const second = restoreRelations(store, backup);

    expect(first.restored).toBe(1);
    expect(second.restored).toBe(1); // INSERT OR IGNORE — still "attempted", duplicate ignored
    expect(store.countRelations()).toBe(1);
  });

  it('skips orphan relations when referenced entry is missing', () => {
    store.insert(makeEntry('a'));
    // entry 'b' deliberately missing
    const backup = [
      { from_id: 'a', to_id: 'b', rel_type: 'references' as const, created_at: '' },
      { from_id: 'b', to_id: 'a', rel_type: 'supersedes' as const, created_at: '' },
    ];

    const result = restoreRelations(store, backup);
    expect(result.restored).toBe(0);
    expect(result.skipped).toBe(2);
    expect(store.countRelations()).toBe(0);
  });
});

describe('rebuildWithRelationSafety — preserve', () => {
  it('keeps relations count equal before and after a benign rebuild', () => {
    store.insert(makeEntry('a'));
    store.insert(makeEntry('b'));
    store.insert(makeEntry('c'));
    store.insertRelation('a', 'b', 'references');
    store.insertRelation('a', 'c', 'supersedes');

    expect(store.countRelations()).toBe(2);

    // Simulate Bug Z3 scenario: import wipes relations (as the real
    // rebuild flow does via DROP + recreate) but keeps all entries.
    // The wrapper must restore relations from its own backup.
    const result = rebuildWithRelationSafety(store, () => {
      const db = store.getRawDb();
      db.prepare(`DELETE FROM relations`).run();
    });

    expect(result.preCount).toBe(2);
    expect(result.postCount).toBe(2);
    expect(result.backed).toBe(2);
    expect(result.restored).toBe(2);
    expect(result.skipped).toBe(0);
    expect(store.countRelations()).toBe(2);

    // Verify the concrete rows are intact.
    const rows = backupRelations(store).map((r) => `${r.from_id}→${r.to_id}/${r.rel_type}`).sort();
    expect(rows).toEqual(['a→b/references', 'a→c/supersedes']);
  });
});

describe('rebuildWithRelationSafety — verify-fail rollback', () => {
  it('strict mode throws DECKENT_MEMORY_RELATION_LOSS and rolls back when relations would be lost', () => {
    store.insert(makeEntry('a'));
    store.insert(makeEntry('b'));
    store.insert(makeEntry('c'));
    store.insertRelation('a', 'b', 'references');
    store.insertRelation('a', 'c', 'supersedes');
    expect(store.countRelations()).toBe(2);
    expect(store.getById('c')).not.toBeNull();

    let thrown: unknown = null;
    try {
      rebuildWithRelationSafety(
        store,
        () => {
          // Simulate Bug Z3 + entry loss: wipe relations AND drop one
          // referenced entry. Restore will skip the orphan, postCount=1<preCount=2.
          const db = store.getRawDb();
          db.prepare(`DELETE FROM relations`).run();
          db.prepare(`DELETE FROM entries WHERE id = 'c'`).run();
        },
        { strict: true },
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(DeckentError);
    expect((thrown as DeckentError).code).toBe('DECKENT_MEMORY_RELATION_LOSS');
    expect((thrown as DeckentError).message).toMatch(/pre=2/);
    expect((thrown as DeckentError).message).toMatch(/post=1/);

    // Rollback verification: original state intact.
    expect(store.countRelations()).toBe(2);
    expect(store.getById('c')).not.toBeNull();
  });

  it('non-strict mode does not throw when relations are lost (accepts the loss)', () => {
    store.insert(makeEntry('a'));
    store.insert(makeEntry('b'));
    store.insert(makeEntry('c'));
    store.insertRelation('a', 'b', 'references');
    store.insertRelation('a', 'c', 'supersedes');

    const result = rebuildWithRelationSafety(store, () => {
      const db = store.getRawDb();
      db.prepare(`DELETE FROM relations`).run();
      db.prepare(`DELETE FROM entries WHERE id = 'c'`).run();
    });

    expect(result.preCount).toBe(2);
    expect(result.postCount).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.restored).toBe(1);
    expect(store.countRelations()).toBe(1);
    // Entry 'c' stays deleted because we did not roll back.
    expect(store.getById('c')).toBeNull();
  });
});
