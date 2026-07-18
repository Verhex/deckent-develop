/**
 * Hermetic vitest coverage for MemoryStore's core SQLite paths: insert,
 * upsert, getByType, FTS query (searchMemory), and decay.
 *
 * Every test creates and tears down its own tmpdir SQLite database — no
 * shared state, no live Brain DB, no spawnSync (ADR-D-002), no external DB
 * (ADR-G-035, better-sqlite3 file only). Safe under a 2-fork memory-capped
 * run: each fork's tests only ever touch their own process-local tmpdir.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import { searchMemory } from '../../src/core/memory-query.js';
import type { CreateEntryInput } from '../../src/core/memory-types.js';

let store: MemoryStore;
let tmpDir: string;

function makeInput(overrides: Partial<CreateEntryInput> & { id: string }): CreateEntryInput {
  return {
    type: 'memory',
    title: `Entry ${overrides.id}`,
    content: 'default content',
    source: 'brain',
    tags: [],
    status: 'active',
    priority: 'normal',
    sprint_num: 0,
    lang: 'en',
    decay_exempt: false,
    metadata: {},
    relations: [],
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'memstore-hermetic-'));
  store = new MemoryStore(join(tmpDir, 'test.db'));
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── insert ──────────────────────────────────────────────────────────

describe('MemoryStore hermetic — insert', () => {
  it('persists a row retrievable via getById with correct defaults', () => {
    store.insert(makeInput({ id: 'ins-001', content: 'hermetic insert content' }));
    const entry = store.getById('ins-001');
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe('ins-001');
    expect(entry!.content).toBe('hermetic insert content');
    expect(entry!.status).toBe('active');
    expect(entry!.deleted_at).toBeNull();
  });

  it('computes content_norm on insert', () => {
    store.insert(makeInput({ id: 'ins-002', content: 'Istanbul guvenlik konfigurasyonu' }));
    const entry = store.getById('ins-002');
    expect(entry!.content_norm).toBe('istanbul guvenlik konfigurasyonu');
  });

  it('is immediately searchable via FTS5 after insert (entries_ai trigger)', () => {
    store.insert(makeInput({ id: 'ins-003', content: 'freshly inserted hermetic row' }));
    const results = searchMemory(store, { text: 'hermetic' });
    expect(results.map(r => r.entry.id)).toContain('ins-003');
  });

  it('does not leak rows across independent tmpdir DB instances', () => {
    store.insert(makeInput({ id: 'ins-isolated' }));
    const otherTmp = mkdtempSync(join(tmpdir(), 'memstore-hermetic-other-'));
    const otherStore = new MemoryStore(join(otherTmp, 'other.db'));
    try {
      expect(otherStore.getById('ins-isolated')).toBeNull();
      expect(otherStore.totalCount()).toBe(0);
    } finally {
      otherStore.close();
      rmSync(otherTmp, { recursive: true, force: true });
    }
  });
});

// ── upsert ──────────────────────────────────────────────────────────

describe('MemoryStore hermetic — upsert', () => {
  it('inserts when the id does not yet exist', () => {
    store.upsert(makeInput({ id: 'up-001', content: 'created via upsert' }), 'brain');
    const entry = store.getById('up-001');
    expect(entry).not.toBeNull();
    expect(entry!.content).toBe('created via upsert');
  });

  it('updates an existing row and recomputes content_norm', () => {
    store.insert(makeInput({ id: 'up-002', content: 'Once' }));
    store.upsert(makeInput({ id: 'up-002', content: 'Guncellenmis icerik' }), 'brain');
    const entry = store.getById('up-002');
    expect(entry!.content).toBe('Guncellenmis icerik');
    expect(entry!.content_norm).toBe('guncellenmis icerik');
  });

  it('keeps the updated content searchable via FTS5 (entries_au trigger)', () => {
    store.insert(makeInput({ id: 'up-003', content: 'original searchable text' }));
    store.upsert(makeInput({ id: 'up-003', content: 'replaced hermetic phrase' }), 'brain');

    const staleHit = searchMemory(store, { text: 'original' });
    expect(staleHit.map(r => r.entry.id)).not.toContain('up-003');

    const freshHit = searchMemory(store, { text: 'hermetic' });
    expect(freshHit.map(r => r.entry.id)).toContain('up-003');
  });

  it('leaves an untouched row out of history on a no-op upsert', () => {
    const input = makeInput({ id: 'up-004', content: 'stable' });
    store.insert(input);
    store.upsert(input, 'brain');
    const updates = store.getHistory('up-004').filter(h => h.change_type === 'update');
    expect(updates).toHaveLength(0);
  });
});

// ── getByType ───────────────────────────────────────────────────────

describe('MemoryStore hermetic — getByType', () => {
  it('orders results by sprint_num DESC and excludes soft-deleted rows', () => {
    store.insert(makeInput({ id: 'gt-a', type: 'debt', sprint_num: 10 }));
    store.insert(makeInput({ id: 'gt-b', type: 'debt', sprint_num: 30 }));
    store.insert(makeInput({ id: 'gt-c', type: 'debt', sprint_num: 20 }));
    store.softDelete('gt-a', 'test');

    const rows = store.getByType('debt');
    expect(rows.map(r => r.id)).toEqual(['gt-b', 'gt-c']);
  });

  it('isolates rows by tenant when a tenantId is supplied', () => {
    store.insert(makeInput({ id: 'gt-tenant-acme', type: 'pattern', tenant_id: 'acme' }));
    store.insert(makeInput({ id: 'gt-tenant-beta', type: 'pattern', tenant_id: 'beta' }));

    const acmeOnly = store.getByType('pattern', 'acme');
    expect(acmeOnly.map(r => r.id)).toEqual(['gt-tenant-acme']);
  });

  it('applies the ADR-G-019 adr_class taxonomy filter', () => {
    store.insert(makeInput({ id: 'gt-class-g', type: 'adr', adr_class: 'G' }));
    store.insert(makeInput({ id: 'gt-class-d', type: 'adr', adr_class: 'D' }));

    const globalOnly = store.getByType('adr', undefined, { adr_class: 'G' });
    expect(globalOnly.map(r => r.id)).toEqual(['gt-class-g']);
  });

  it('applies the ADR-G-019 scope taxonomy filter', () => {
    store.insert(makeInput({ id: 'gt-scope-dev', type: 'adr', scope: 'dev' }));
    store.insert(makeInput({ id: 'gt-scope-global', type: 'adr', scope: 'global' }));

    const devOnly = store.getByType('adr', undefined, { scope: 'dev' });
    expect(devOnly.map(r => r.id)).toEqual(['gt-scope-dev']);
  });

  it('returns an empty array for a type with no rows', () => {
    expect(store.getByType('nonexistent-type')).toEqual([]);
  });
});

// ── FTS query (searchMemory) ───────────────────────────────────────

describe('MemoryStore hermetic — FTS query', () => {
  beforeEach(() => {
    store.insert(makeInput({
      id: 'fts-adr',
      type: 'adr',
      title: 'Hermetic Test Isolation Policy',
      content: 'Every test must create its own tmpdir SQLite database.',
      tags: ['hermetic', 'testing'],
    }));
    store.insert(makeInput({
      id: 'fts-debt',
      type: 'debt',
      title: 'Flaky shared-state test',
      content: 'A leftover global database caused cross-test pollution.',
      tags: ['flaky'],
    }));
  });

  it('finds an entry by a content keyword', () => {
    const results = searchMemory(store, { text: 'tmpdir' });
    expect(results.map(r => r.entry.id)).toContain('fts-adr');
  });

  it('filters FTS results by type', () => {
    const results = searchMemory(store, { text: 'database', type: ['debt'] });
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.entry.type).toBe('debt');
    }
  });

  it('excludes soft-deleted rows from FTS results by default', () => {
    store.softDelete('fts-debt', 'test');
    const results = searchMemory(store, { text: 'pollution' });
    expect(results.map(r => r.entry.id)).not.toContain('fts-debt');
  });

  it('returns no results for a query matching nothing', () => {
    const results = searchMemory(store, { text: 'zzznomatchzzz' });
    expect(results).toEqual([]);
  });
});

// ── decay ───────────────────────────────────────────────────────────

describe('MemoryStore hermetic — decay', () => {
  it('soft-deletes entries older than the decay threshold', () => {
    store.insert(makeInput({ id: 'decay-old', sprint_num: 100 }));
    store.insert(makeInput({ id: 'decay-recent', sprint_num: 195 }));

    const result = store.decay(200, 20); // threshold=180
    expect(result.deletedCount).toBe(1);
    expect(store.getById('decay-old')).toBeNull();
    expect(store.getById('decay-recent')).not.toBeNull();
  });

  it('never decays decay_exempt entries regardless of age', () => {
    store.insert(makeInput({ id: 'decay-exempt', sprint_num: 10, decay_exempt: true }));
    const result = store.decay(200, 20);
    expect(result.deletedCount).toBe(0);
    expect(store.getById('decay-exempt')).not.toBeNull();
  });

  it('removes decayed entries from FTS search results', () => {
    store.insert(makeInput({ id: 'decay-fts', sprint_num: 10, content: 'unique decay marker phrase' }));
    store.decay(200, 20);
    const results = searchMemory(store, { text: 'marker' });
    expect(results.map(r => r.entry.id)).not.toContain('decay-fts');
  });

  it('aborts a catastrophic batch (>=3 entries, >=50% of non-exempt rows)', () => {
    store.insert(makeInput({ id: 'decay-cat-1', sprint_num: 10 }));
    store.insert(makeInput({ id: 'decay-cat-2', sprint_num: 10 }));
    store.insert(makeInput({ id: 'decay-cat-3', sprint_num: 10 }));
    store.insert(makeInput({ id: 'decay-cat-recent', sprint_num: 195 }));

    const result = store.decay(200, 20); // 3/4 = 75% >= 50% and batch >= 3 → abort
    expect(result.aborted).toBe(true);
    expect(result.deletedCount).toBe(0);
    expect(store.getById('decay-cat-1')).not.toBeNull();
  });
});
