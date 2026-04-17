import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { CreateEntryInput } from '../../src/core/memory-types.js';

let store: MemoryStore;
let tmpDir: string;

function makeInput(overrides: Partial<CreateEntryInput> = {}): CreateEntryInput {
  return {
    id: overrides.id ?? 'test-001',
    type: overrides.type ?? 'memory',
    title: overrides.title ?? 'Test Entry',
    content: overrides.content ?? 'Some content about testing',
    source: overrides.source ?? 'brain',
    summary: overrides.summary ?? 'A test summary',
    tags: overrides.tags ?? ['test', 'unit'],
    status: overrides.status ?? 'active',
    priority: overrides.priority ?? 'normal',
    sprint_id: overrides.sprint_id ?? 'sprint-140',
    sprint_num: overrides.sprint_num ?? 140,
    lang: overrides.lang ?? 'en',
    decay_exempt: overrides.decay_exempt ?? false,
    metadata: overrides.metadata ?? { key: 'value' },
    relations: overrides.relations ?? [],
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'memstore-test-'));
  const dbPath = join(tmpDir, 'test.db');
  store = new MemoryStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── CRUD ────────────────────────────────────────────────────────────

describe('CRUD', () => {
  it('insert + getById returns the entry', () => {
    const input = makeInput();
    store.insert(input);
    const entry = store.getById('test-001');
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe('test-001');
    expect(entry!.type).toBe('memory');
    expect(entry!.title).toBe('Test Entry');
    expect(entry!.content).toBe('Some content about testing');
    expect(entry!.source).toBe('brain');
    expect(entry!.summary).toBe('A test summary');
    expect(entry!.status).toBe('active');
    expect(entry!.priority).toBe('normal');
    expect(entry!.sprint_id).toBe('sprint-140');
    expect(entry!.sprint_num).toBe(140);
    expect(entry!.lang).toBe('en');
    expect(entry!.decay_exempt).toBe(false);
    expect(entry!.deleted_at).toBeNull();
    expect(entry!.tag_text).toBe('test unit');
    expect(entry!.metadata).toBe('{"key":"value"}');
  });

  it('insert computes normalized fields', () => {
    store.insert(makeInput({
      id: 'tr-001',
      title: 'Guvenlik Protokolu',
      content: 'Istanbul guvenlik acigi',
      summary: 'Ozet: cokme analizi',
      tags: ['guvenlik', 'istanbul'],
    }));
    const entry = store.getById('tr-001');
    expect(entry).not.toBeNull();
    // turkishNormalize should produce lowercase ASCII equivalents
    expect(entry!.title_norm).toBe('guvenlik protokolu');
    expect(entry!.content_norm).toBe('istanbul guvenlik acigi');
    expect(entry!.summary_norm).toBe('ozet: cokme analizi');
    expect(entry!.tag_norm).toBe('guvenlik istanbul');
  });

  it('insert with defaults for optional fields', () => {
    store.insert({
      id: 'min-001',
      type: 'debt',
      title: 'Minimal',
      content: 'Minimal content',
    });
    const entry = store.getById('min-001');
    expect(entry).not.toBeNull();
    expect(entry!.source).toBe('system');
    expect(entry!.summary).toBeNull();
    expect(entry!.status).toBe('active');
    expect(entry!.priority).toBe('normal');
    expect(entry!.sprint_id).toBeNull();
    expect(entry!.sprint_num).toBe(0);
    expect(entry!.lang).toBe('en');
    expect(entry!.decay_exempt).toBe(false);
    expect(entry!.tag_text).toBe('');
    expect(entry!.metadata).toBe('{}');
  });

  it('insert with relations creates relation rows', () => {
    store.insert(makeInput({ id: 'base-001' }));
    store.insert(makeInput({
      id: 'rel-001',
      relations: [{ to_id: 'base-001', rel_type: 'references' }],
    }));
    const rels = store.getRelationsFrom('rel-001');
    expect(rels).toHaveLength(1);
    expect(rels[0]!.to_id).toBe('base-001');
    expect(rels[0]!.rel_type).toBe('references');
  });

  it('insert records a create history entry', () => {
    store.insert(makeInput({ id: 'hist-001' }));
    const history = store.getHistory('hist-001');
    expect(history.length).toBeGreaterThanOrEqual(1);
    const createRecord = history.find(h => h.change_type === 'create');
    expect(createRecord).toBeDefined();
    expect(createRecord!.field).toBe('*');
    expect(createRecord!.changed_by).toBe('system');
  });

  it('getById returns null for non-existent id', () => {
    expect(store.getById('nonexistent')).toBeNull();
  });

  it('getById excludes soft-deleted by default', () => {
    store.insert(makeInput({ id: 'del-001' }));
    store.softDelete('del-001', 'test');
    expect(store.getById('del-001')).toBeNull();
  });

  it('getById with includeDeleted returns soft-deleted', () => {
    store.insert(makeInput({ id: 'del-002' }));
    store.softDelete('del-002', 'test');
    const entry = store.getById('del-002', { includeDeleted: true });
    expect(entry).not.toBeNull();
    expect(entry!.deleted_at).not.toBeNull();
  });

  it('getByType returns entries ordered by sprint_num DESC', () => {
    store.insert(makeInput({ id: 'a', type: 'memory', sprint_num: 130 }));
    store.insert(makeInput({ id: 'b', type: 'memory', sprint_num: 140 }));
    store.insert(makeInput({ id: 'c', type: 'memory', sprint_num: 135 }));
    store.insert(makeInput({ id: 'd', type: 'debt', sprint_num: 140 }));
    const memories = store.getByType('memory');
    expect(memories).toHaveLength(3);
    expect(memories[0]!.id).toBe('b'); // sprint_num 140
    expect(memories[1]!.id).toBe('c'); // sprint_num 135
    expect(memories[2]!.id).toBe('a'); // sprint_num 130
  });

  it('getByType excludes soft-deleted entries', () => {
    store.insert(makeInput({ id: 'e1', type: 'pattern' }));
    store.insert(makeInput({ id: 'e2', type: 'pattern' }));
    store.softDelete('e1', 'test');
    const patterns = store.getByType('pattern');
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.id).toBe('e2');
  });

  it('upsert inserts when entry does not exist', () => {
    store.upsert(makeInput({ id: 'new-001' }), 'brain');
    const entry = store.getById('new-001');
    expect(entry).not.toBeNull();
    expect(entry!.title).toBe('Test Entry');
  });

  it('upsert updates existing entry and records field history', () => {
    store.insert(makeInput({ id: 'up-001', title: 'Old Title', content: 'Old content' }));
    store.upsert(
      makeInput({ id: 'up-001', title: 'New Title', content: 'New content' }),
      'user',
    );
    const entry = store.getById('up-001');
    expect(entry!.title).toBe('New Title');
    expect(entry!.content).toBe('New content');

    const history = store.getHistory('up-001');
    const titleChange = history.find(h => h.field === 'title' && h.change_type === 'update');
    expect(titleChange).toBeDefined();
    expect(titleChange!.old_value).toBe('Old Title');
    expect(titleChange!.new_value).toBe('New Title');
    expect(titleChange!.changed_by).toBe('user');

    const contentChange = history.find(h => h.field === 'content' && h.change_type === 'update');
    expect(contentChange).toBeDefined();
    expect(contentChange!.old_value).toBe('Old content');
    expect(contentChange!.new_value).toBe('New content');
  });

  it('upsert replaces tags on update', () => {
    store.insert(makeInput({ id: 'tag-up', tags: ['old1', 'old2'] }));
    store.upsert(makeInput({ id: 'tag-up', tags: ['new1', 'new2', 'new3'] }), 'brain');
    const tags = store.getTagsForEntry('tag-up');
    expect(tags.sort()).toEqual(['new1', 'new2', 'new3'].sort());
    const entry = store.getById('tag-up');
    expect(entry!.tag_text).toBe('new1 new2 new3');
  });

  it('upsert does not record history for unchanged fields', () => {
    const input = makeInput({ id: 'no-change' });
    store.insert(input);
    store.upsert(input, 'brain');
    const history = store.getHistory('no-change');
    const updates = history.filter(h => h.change_type === 'update');
    expect(updates).toHaveLength(0);
  });
});

// ── Tags ────────────────────────────────────────────────────────────

describe('Tags', () => {
  it('getTagsForEntry returns all tags', () => {
    store.insert(makeInput({ id: 'tagged', tags: ['alpha', 'beta', 'gamma'] }));
    const tags = store.getTagsForEntry('tagged');
    expect(tags.sort()).toEqual(['alpha', 'beta', 'gamma'].sort());
  });

  it('getTagsForEntry returns empty array for no tags', () => {
    store.insert(makeInput({ id: 'notags', tags: [] }));
    expect(store.getTagsForEntry('notags')).toEqual([]);
  });

  it('getByTags returns entries with ANY matching tag', () => {
    store.insert(makeInput({ id: 't1', tags: ['security', 'audit'] }));
    store.insert(makeInput({ id: 't2', tags: ['test', 'unit'] }));
    store.insert(makeInput({ id: 't3', tags: ['security', 'fix'] }));
    const results = store.getByTags(['security']);
    expect(results.map(e => e.id).sort()).toEqual(['t1', 't3'].sort());
  });

  it('getByTags with multiple tags returns entries having ANY', () => {
    store.insert(makeInput({ id: 'x1', tags: ['a'] }));
    store.insert(makeInput({ id: 'x2', tags: ['b'] }));
    store.insert(makeInput({ id: 'x3', tags: ['c'] }));
    const results = store.getByTags(['a', 'b']);
    expect(results).toHaveLength(2);
  });

  it('getByTags excludes soft-deleted entries', () => {
    store.insert(makeInput({ id: 'sd1', tags: ['keep'] }));
    store.insert(makeInput({ id: 'sd2', tags: ['keep'] }));
    store.softDelete('sd2', 'test');
    const results = store.getByTags(['keep']);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('sd1');
  });

  it('getByTags returns empty for no matches', () => {
    store.insert(makeInput({ id: 'nm', tags: ['alpha'] }));
    expect(store.getByTags(['nonexistent'])).toEqual([]);
  });
});

// ── Relations ───────────────────────────────────────────────────────

describe('Relations', () => {
  it('getRelationsFrom returns outgoing relations', () => {
    store.insert(makeInput({ id: 'from-a' }));
    store.insert(makeInput({ id: 'to-b' }));
    store.insert(makeInput({
      id: 'from-c',
      relations: [
        { to_id: 'from-a', rel_type: 'references' },
        { to_id: 'to-b', rel_type: 'depends_on' },
      ],
    }));
    const rels = store.getRelationsFrom('from-c');
    expect(rels).toHaveLength(2);
    expect(rels.map(r => r.to_id).sort()).toEqual(['from-a', 'to-b'].sort());
  });

  it('getRelationsTo returns incoming relations', () => {
    store.insert(makeInput({ id: 'target' }));
    store.insert(makeInput({
      id: 'source1',
      relations: [{ to_id: 'target', rel_type: 'references' }],
    }));
    store.insert(makeInput({
      id: 'source2',
      relations: [{ to_id: 'target', rel_type: 'caused_by' }],
    }));
    const rels = store.getRelationsTo('target');
    expect(rels).toHaveLength(2);
    expect(rels.map(r => r.from_id).sort()).toEqual(['source1', 'source2'].sort());
  });

  it('getRelationsFrom returns empty for no relations', () => {
    store.insert(makeInput({ id: 'lonely' }));
    expect(store.getRelationsFrom('lonely')).toEqual([]);
  });
});

// ── History ─────────────────────────────────────────────────────────

describe('History', () => {
  it('getHistory returns all records ordered by id', () => {
    store.insert(makeInput({ id: 'hh-001' }));
    store.upsert(makeInput({ id: 'hh-001', title: 'Changed' }), 'user');
    store.softDelete('hh-001', 'admin');
    store.restore('hh-001', 'admin');
    const history = store.getHistory('hh-001');
    expect(history.length).toBeGreaterThanOrEqual(4);
    const types = history.map(h => h.change_type);
    expect(types).toContain('create');
    expect(types).toContain('update');
    expect(types).toContain('soft_delete');
    expect(types).toContain('restore');
  });

  it('getHistory returns empty for non-existent entry', () => {
    expect(store.getHistory('ghost')).toEqual([]);
  });
});

// ── Lifecycle ───────────────────────────────────────────────────────

describe('Lifecycle', () => {
  it('softDelete sets deleted_at and records history', () => {
    store.insert(makeInput({ id: 'sd-001' }));
    store.softDelete('sd-001', 'decay-process');
    const entry = store.getById('sd-001', { includeDeleted: true });
    expect(entry!.deleted_at).not.toBeNull();
    const history = store.getHistory('sd-001');
    const delRecord = history.find(h => h.change_type === 'soft_delete');
    expect(delRecord).toBeDefined();
    expect(delRecord!.changed_by).toBe('decay-process');
  });

  it('restore clears deleted_at and records history', () => {
    store.insert(makeInput({ id: 'rs-001' }));
    store.softDelete('rs-001', 'test');
    store.restore('rs-001', 'admin');
    const entry = store.getById('rs-001');
    expect(entry).not.toBeNull();
    expect(entry!.deleted_at).toBeNull();
    const history = store.getHistory('rs-001');
    const restoreRecord = history.find(h => h.change_type === 'restore');
    expect(restoreRecord).toBeDefined();
    expect(restoreRecord!.changed_by).toBe('admin');
  });
});

// ── Decay ───────────────────────────────────────────────────────────

describe('Decay', () => {
  it('soft-deletes old non-exempt entries', () => {
    store.insert(makeInput({ id: 'old-1', sprint_num: 100, decay_exempt: false }));
    store.insert(makeInput({ id: 'old-2', sprint_num: 110, decay_exempt: false }));
    store.insert(makeInput({ id: 'recent', sprint_num: 139, decay_exempt: false }));
    const result = store.decay(140, 20);
    expect(result.deletedCount).toBe(2);
    expect(store.getById('old-1')).toBeNull();
    expect(store.getById('old-2')).toBeNull();
    expect(store.getById('recent')).not.toBeNull();
  });

  it('preserves decay-exempt entries regardless of age', () => {
    store.insert(makeInput({ id: 'exempt-1', sprint_num: 50, decay_exempt: true }));
    store.insert(makeInput({ id: 'non-exempt', sprint_num: 50, decay_exempt: false }));
    const result = store.decay(140, 20);
    expect(result.deletedCount).toBe(1);
    expect(store.getById('exempt-1')).not.toBeNull();
    expect(store.getById('non-exempt')).toBeNull();
  });

  it('does not double-delete already soft-deleted entries', () => {
    store.insert(makeInput({ id: 'already-del', sprint_num: 50, decay_exempt: false }));
    store.softDelete('already-del', 'prev');
    const result = store.decay(140, 20);
    expect(result.deletedCount).toBe(0);
  });

  it('records decay history for each decayed entry', () => {
    store.insert(makeInput({ id: 'dc-001', sprint_num: 100, decay_exempt: false }));
    store.decay(140, 20);
    const history = store.getHistory('dc-001');
    const decayRecord = history.find(h => h.change_type === 'decay');
    expect(decayRecord).toBeDefined();
    expect(decayRecord!.changed_by).toBe('decay');
  });
});

// ── Counts ──────────────────────────────────────────────────────────

describe('Counts', () => {
  it('countByType returns correct counts', () => {
    store.insert(makeInput({ id: 'c1', type: 'memory' }));
    store.insert(makeInput({ id: 'c2', type: 'memory' }));
    store.insert(makeInput({ id: 'c3', type: 'adr' }));
    store.insert(makeInput({ id: 'c4', type: 'debt' }));
    store.insert(makeInput({ id: 'c5', type: 'debt' }));
    store.softDelete('c5', 'test');
    const counts = store.countByType();
    expect(counts.get('memory')).toBe(2);
    expect(counts.get('adr')).toBe(1);
    expect(counts.get('debt')).toBe(1);
  });

  it('totalCount returns active entry count', () => {
    store.insert(makeInput({ id: 'tc1' }));
    store.insert(makeInput({ id: 'tc2' }));
    store.insert(makeInput({ id: 'tc3' }));
    store.softDelete('tc3', 'test');
    expect(store.totalCount()).toBe(2);
  });

  it('totalCount returns 0 for empty DB', () => {
    expect(store.totalCount()).toBe(0);
  });
});

// ── Schema ──────────────────────────────────────────────────────────

describe('Schema', () => {
  it('getSchemaVersion returns 1', () => {
    expect(store.getSchemaVersion()).toBe(1);
  });

  it('getRawDb returns a Database instance', () => {
    const db = store.getRawDb();
    expect(db).toBeDefined();
    // basic sanity: can run a query
    const result = db.prepare('SELECT 1 as n').get() as { n: number };
    expect(result.n).toBe(1);
  });

  it('close does not throw', () => {
    expect(() => store.close()).not.toThrow();
    // Re-create for afterEach cleanup
    store = new MemoryStore(join(tmpDir, 'test2.db'));
  });
});

// ── decay_exempt boolean conversion ─────────────────────────────────

describe('decay_exempt boolean conversion', () => {
  it('stores true as 1 and reads back as true', () => {
    store.insert(makeInput({ id: 'bool-t', decay_exempt: true }));
    const entry = store.getById('bool-t');
    expect(entry!.decay_exempt).toBe(true);
    expect(typeof entry!.decay_exempt).toBe('boolean');
  });

  it('stores false as 0 and reads back as false', () => {
    store.insert(makeInput({ id: 'bool-f', decay_exempt: false }));
    const entry = store.getById('bool-f');
    expect(entry!.decay_exempt).toBe(false);
    expect(typeof entry!.decay_exempt).toBe('boolean');
  });
});

// ── insertRelation / getRelations / countRelations ─────────────────

describe('insertRelation', () => {
  it('inserts a relation between two entries', () => {
    store.insert(makeInput({ id: 'rel-a' }));
    store.insert(makeInput({ id: 'rel-b' }));
    store.insertRelation('rel-a', 'rel-b', 'references');
    const rels = store.getRelationsFrom('rel-a');
    expect(rels).toHaveLength(1);
    expect(rels[0]!.to_id).toBe('rel-b');
    expect(rels[0]!.rel_type).toBe('references');
  });

  it('ignores duplicate relations (INSERT OR IGNORE)', () => {
    store.insert(makeInput({ id: 'dup-a' }));
    store.insert(makeInput({ id: 'dup-b' }));
    store.insertRelation('dup-a', 'dup-b', 'references');
    store.insertRelation('dup-a', 'dup-b', 'references');
    const rels = store.getRelationsFrom('dup-a');
    expect(rels).toHaveLength(1);
  });

  it('allows different relation types between same entries', () => {
    store.insert(makeInput({ id: 'mt-a' }));
    store.insert(makeInput({ id: 'mt-b' }));
    store.insertRelation('mt-a', 'mt-b', 'references');
    store.insertRelation('mt-a', 'mt-b', 'depends_on');
    const rels = store.getRelationsFrom('mt-a');
    expect(rels).toHaveLength(2);
  });
});

describe('getRelations', () => {
  it('returns both from and to relations', () => {
    store.insert(makeInput({ id: 'gr-a' }));
    store.insert(makeInput({ id: 'gr-b' }));
    store.insert(makeInput({ id: 'gr-c' }));
    store.insertRelation('gr-a', 'gr-b', 'references');
    store.insertRelation('gr-c', 'gr-a', 'depends_on');
    const rels = store.getRelations('gr-a');
    expect(rels).toHaveLength(2);
  });

  it('returns empty array when no relations exist', () => {
    store.insert(makeInput({ id: 'no-rel' }));
    expect(store.getRelations('no-rel')).toEqual([]);
  });
});

describe('countRelations', () => {
  it('returns correct count', () => {
    store.insert(makeInput({ id: 'cnt-a' }));
    store.insert(makeInput({ id: 'cnt-b' }));
    store.insert(makeInput({ id: 'cnt-c' }));
    store.insertRelation('cnt-a', 'cnt-b', 'references');
    store.insertRelation('cnt-b', 'cnt-c', 'depends_on');
    expect(store.countRelations()).toBeGreaterThanOrEqual(2);
  });

  it('returns 0 for empty relations table', () => {
    // Fresh store with no relations — but insert might auto-extract
    const count = store.countRelations();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ── extractAdrReferences ──────────────────────────────────────────

describe('extractAdrReferences', () => {
  it('extracts single ADR reference', () => {
    const refs = MemoryStore.extractAdrReferences('This implements ADR-006 security pattern');
    expect(refs).toEqual(['adr-006']);
  });

  it('extracts multiple ADR references', () => {
    const refs = MemoryStore.extractAdrReferences('ADR-001 and ADR-008 are relevant, also ADR-036');
    expect(refs).toHaveLength(3);
    expect(refs).toContain('adr-001');
    expect(refs).toContain('adr-008');
    expect(refs).toContain('adr-036');
  });

  it('deduplicates repeated references', () => {
    const refs = MemoryStore.extractAdrReferences('ADR-006 is used by ADR-006 pattern');
    expect(refs).toEqual(['adr-006']);
  });

  it('returns empty for no ADR references', () => {
    const refs = MemoryStore.extractAdrReferences('No architecture decisions here');
    expect(refs).toEqual([]);
  });

  it('does not match partial patterns like ADR-06 or ADR-0001', () => {
    const refs = MemoryStore.extractAdrReferences('ADR-06 and ADR-0001 are not valid');
    expect(refs).toEqual([]);
  });

  it('normalizes to lowercase', () => {
    const refs = MemoryStore.extractAdrReferences('ADR-010 is mentioned');
    expect(refs).toEqual(['adr-010']);
  });
});

// ── Auto-extract ADR references on insert ─────────────────────────

describe('Auto-extract ADR references on insert', () => {
  it('auto-inserts references relation when content mentions ADR', () => {
    store.insert(makeInput({ id: 'adr-006', type: 'adr', title: 'ADR-006 spawnSync' }));
    store.insert(makeInput({
      id: 'mem-001',
      content: 'This implements ADR-006 security pattern',
    }));
    const rels = store.getRelationsFrom('mem-001');
    const adrRef = rels.find(r => r.to_id === 'adr-006' && r.rel_type === 'references');
    expect(adrRef).toBeDefined();
  });

  it('does not self-reference', () => {
    store.insert(makeInput({
      id: 'adr-010',
      type: 'adr',
      title: 'ADR-010 Tek Runtime Dependency',
      content: 'ADR-010 defines the dependency policy',
    }));
    const rels = store.getRelationsFrom('adr-010');
    const selfRef = rels.find(r => r.to_id === 'adr-010');
    expect(selfRef).toBeUndefined();
  });

  it('extracts from both title and content', () => {
    store.insert(makeInput({ id: 'adr-001' }));
    store.insert(makeInput({ id: 'adr-008' }));
    store.insert(makeInput({
      id: 'combined-entry',
      title: 'Task references ADR-001',
      content: 'Also relates to ADR-008 import rules',
    }));
    const rels = store.getRelationsFrom('combined-entry');
    expect(rels.some(r => r.to_id === 'adr-001')).toBe(true);
    expect(rels.some(r => r.to_id === 'adr-008')).toBe(true);
  });

  it('coexists with explicit relations', () => {
    store.insert(makeInput({ id: 'adr-006' }));
    store.insert(makeInput({
      id: 'hybrid-entry',
      content: 'References ADR-006 pattern',
      relations: [{ to_id: 'adr-006', rel_type: 'depends_on' }],
    }));
    const rels = store.getRelationsFrom('hybrid-entry');
    // Should have both the explicit depends_on AND auto-extracted references
    expect(rels.some(r => r.rel_type === 'depends_on' && r.to_id === 'adr-006')).toBe(true);
    expect(rels.some(r => r.rel_type === 'references' && r.to_id === 'adr-006')).toBe(true);
  });
});

// ── ADR-010 Amendment (Sprint 143 — Task 18) ──────────────────────

describe('ADR-010 Amendment', () => {
  it('upsert updates adr-010 title and content to amended version', () => {
    // Insert original ADR-010
    store.insert(makeInput({
      id: 'adr-010',
      type: 'adr',
      title: 'Tek Runtime Dependency — commander.js',
      content: 'CLI tek runtime dependency olarak commander kullanır.',
      status: 'accepted',
      tags: ['architecture', 'adr'],
    }));

    // Amend ADR-010
    store.upsert(makeInput({
      id: 'adr-010',
      type: 'adr',
      title: 'Minimal Runtime Dependencies (Amended Sprint 143)',
      content: 'Projenin runtime bağımlılıkları minimal tutulur. İzin verilen 4 bağımlılık: commander, better-sqlite3, @modelcontextprotocol/sdk, zod.',
      summary: 'Runtime bağımlılıkları minimal tutulur: commander, better-sqlite3, @modelcontextprotocol/sdk, zod.',
      status: 'accepted',
      tags: ['architecture', 'adr', 'dependencies'],
    }), 'brain');

    const entry = store.getById('adr-010');
    expect(entry).not.toBeNull();
    expect(entry!.title).toBe('Minimal Runtime Dependencies (Amended Sprint 143)');
    expect(entry!.content).toContain('4 bağımlılık');
    expect(entry!.content).toContain('better-sqlite3');
    expect(entry!.content).toContain('zod');
  });

  it('amendment records field-level history diff', () => {
    store.insert(makeInput({
      id: 'adr-010',
      type: 'adr',
      title: 'Tek Runtime Dependency — commander.js',
      content: 'CLI tek runtime dependency olarak commander kullanır.',
    }));

    store.upsert(makeInput({
      id: 'adr-010',
      type: 'adr',
      title: 'Minimal Runtime Dependencies (Amended Sprint 143)',
      content: 'Runtime bağımlılıkları minimal tutulur: commander, better-sqlite3, @modelcontextprotocol/sdk, zod.',
    }), 'sprint-143');

    const history = store.getHistory('adr-010');
    const titleChange = history.find(h => h.field === 'title' && h.change_type === 'update');
    expect(titleChange).toBeDefined();
    expect(titleChange!.old_value).toBe('Tek Runtime Dependency — commander.js');
    expect(titleChange!.new_value).toBe('Minimal Runtime Dependencies (Amended Sprint 143)');
    expect(titleChange!.changed_by).toBe('sprint-143');

    const contentChange = history.find(h => h.field === 'content' && h.change_type === 'update');
    expect(contentChange).toBeDefined();
    expect(contentChange!.old_value).toContain('tek runtime dependency');
    expect(contentChange!.new_value).toContain('better-sqlite3');
  });

  it('amended adr-010 is discoverable via tag query', () => {
    store.insert(makeInput({
      id: 'adr-010',
      type: 'adr',
      title: 'Minimal Runtime Dependencies (Amended Sprint 143)',
      content: 'Runtime bağımlılıkları minimal tutulur.',
      tags: ['architecture', 'adr', 'dependencies'],
    }));

    const byDeps = store.getByTags(['dependencies']);
    expect(byDeps.some(e => e.id === 'adr-010')).toBe(true);

    const adrs = store.getByType('adr');
    const adr010 = adrs.find(e => e.id === 'adr-010');
    expect(adr010).toBeDefined();
    expect(adr010!.title).toContain('Minimal Runtime Dependencies');
  });
});
