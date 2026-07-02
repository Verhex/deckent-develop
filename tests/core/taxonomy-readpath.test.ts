// tests/core/taxonomy-readpath.test.ts
//
// Sprint 356 — Task 356-003 (TAXONOMY-READPATH, row 160 / ADR-G-019 + ADR-G-035).
// Covers the read-path gap: `insert()` already wrote adr_class/scope/immutable/
// source_authority/enforcement_level, but `rowToEntry()` did not map them back and
// `upsert()` silently dropped them on update. This suite proves the fix against a
// real-shape SQLite fixture DB in a tmpdir (hermetic — no gitignored state).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { CreateEntryInput } from '../../src/core/memory-types.js';

let store: MemoryStore;
let tmpDir: string;

function makeAdrInput(overrides: Partial<CreateEntryInput> = {}): CreateEntryInput {
  return {
    id: overrides.id ?? 'adr-g-901',
    type: overrides.type ?? 'adr',
    title: overrides.title ?? 'Test ADR',
    content: overrides.content ?? 'Some ADR content',
    source: overrides.source ?? 'import',
    status: overrides.status ?? 'accepted',
    adr_class: overrides.adr_class,
    scope: overrides.scope,
    immutable: overrides.immutable,
    source_authority: overrides.source_authority,
    enforcement_level: overrides.enforcement_level,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'taxonomy-readpath-test-'));
  const dbPath = join(tmpDir, 'test.db');
  store = new MemoryStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── rowToEntry taxonomy mapping ───────────────────────────────────────

describe('rowToEntry taxonomy fields', () => {
  it('getById returns all 5 taxonomy columns after insert', () => {
    store.insert(makeAdrInput({
      id: 'adr-g-901',
      adr_class: 'G',
      scope: 'global',
      immutable: true,
      source_authority: 'publisher',
      enforcement_level: 'hard',
    }));

    const entry = store.getById('adr-g-901');
    expect(entry).not.toBeNull();
    expect(entry!.adr_class).toBe('G');
    expect(entry!.scope).toBe('global');
    expect(entry!.immutable).toBe(1);
    expect(entry!.source_authority).toBe('publisher');
    expect(entry!.enforcement_level).toBe('hard');
  });

  it('getByType returns taxonomy columns for every row', () => {
    store.insert(makeAdrInput({
      id: 'adr-d-901',
      adr_class: 'D',
      scope: 'project',
      immutable: false,
      source_authority: 'contributor',
      enforcement_level: 'advisory',
    }));

    const [entry] = store.getByType('adr');
    expect(entry).toBeDefined();
    expect(entry!.adr_class).toBe('D');
    expect(entry!.scope).toBe('project');
    expect(entry!.immutable).toBe(0);
    expect(entry!.source_authority).toBe('contributor');
    expect(entry!.enforcement_level).toBe('advisory');
  });

  it('non-ADR / taxonomy-omitted rows return null for all 5 fields (no false data)', () => {
    store.insert({ id: 'mem-901', type: 'memory', title: 'Plain memory', content: 'no taxonomy' });
    const entry = store.getById('mem-901');
    expect(entry).not.toBeNull();
    expect(entry!.adr_class).toBeNull();
    expect(entry!.scope).toBeNull();
    expect(entry!.immutable).toBeNull();
    expect(entry!.source_authority).toBeNull();
    expect(entry!.enforcement_level).toBeNull();
  });
});

// ── getByType class/scope filter ──────────────────────────────────────

describe('getByType class/scope filter', () => {
  beforeEach(() => {
    store.insert(makeAdrInput({ id: 'adr-g-001', adr_class: 'G', scope: 'global' }));
    store.insert(makeAdrInput({ id: 'adr-g-002', adr_class: 'G', scope: 'global' }));
    store.insert(makeAdrInput({ id: 'adr-d-001', adr_class: 'D', scope: 'project' }));
  });

  it('filters by adr_class', () => {
    const gOnly = store.getByType('adr', undefined, { adr_class: 'G' });
    expect(gOnly.map(e => e.id).sort()).toEqual(['adr-g-001', 'adr-g-002']);

    const dOnly = store.getByType('adr', undefined, { adr_class: 'D' });
    expect(dOnly.map(e => e.id)).toEqual(['adr-d-001']);
  });

  it('filters by scope', () => {
    const projectOnly = store.getByType('adr', undefined, { scope: 'project' });
    expect(projectOnly.map(e => e.id)).toEqual(['adr-d-001']);
  });

  it('combines adr_class + scope filters (AND)', () => {
    const result = store.getByType('adr', undefined, { adr_class: 'G', scope: 'global' });
    expect(result.map(e => e.id).sort()).toEqual(['adr-g-001', 'adr-g-002']);

    const none = store.getByType('adr', undefined, { adr_class: 'G', scope: 'project' });
    expect(none).toHaveLength(0);
  });

  it('omitted filters = unchanged full-type result (regression guard, default behavior)', () => {
    const all = store.getByType('adr');
    expect(all.map(e => e.id).sort()).toEqual(['adr-d-001', 'adr-g-001', 'adr-g-002']);
  });
});

// ── upsert taxonomy column protection ─────────────────────────────────

describe('upsert taxonomy column protection', () => {
  it('upsert WITHOUT taxonomy fields preserves existing classification', () => {
    store.insert(makeAdrInput({
      id: 'adr-g-500',
      title: 'Original Title',
      adr_class: 'G',
      scope: 'global',
      immutable: true,
      source_authority: 'publisher',
      enforcement_level: 'hard',
    }));

    // Generic patch that only changes title/content — no taxonomy fields supplied.
    store.upsert(
      { id: 'adr-g-500', type: 'adr', title: 'Amended Title', content: 'Amended content' },
      'brain',
    );

    const entry = store.getById('adr-g-500');
    expect(entry!.title).toBe('Amended Title');
    expect(entry!.adr_class).toBe('G');
    expect(entry!.scope).toBe('global');
    expect(entry!.immutable).toBe(1);
    expect(entry!.source_authority).toBe('publisher');
    expect(entry!.enforcement_level).toBe('hard');
  });

  it('upsert WITH new taxonomy fields overwrites them explicitly', () => {
    store.insert(makeAdrInput({
      id: 'adr-g-501',
      adr_class: 'G',
      scope: 'global',
      immutable: true,
      source_authority: 'publisher',
      enforcement_level: 'hard',
    }));

    store.upsert(
      makeAdrInput({
        id: 'adr-g-501',
        adr_class: 'D',
        scope: 'project',
        immutable: false,
        source_authority: 'contributor',
        enforcement_level: 'advisory',
      }),
      'brain',
    );

    const entry = store.getById('adr-g-501');
    expect(entry!.adr_class).toBe('D');
    expect(entry!.scope).toBe('project');
    expect(entry!.immutable).toBe(0);
    expect(entry!.source_authority).toBe('contributor');
    expect(entry!.enforcement_level).toBe('advisory');
  });

  it('upsert taxonomy overwrite records field-level history diffs', () => {
    store.insert(makeAdrInput({ id: 'adr-g-502', adr_class: 'G', enforcement_level: 'advisory' }));
    store.upsert(makeAdrInput({ id: 'adr-g-502', adr_class: 'D', enforcement_level: 'hard' }), 'user');

    const history = store.getHistory('adr-g-502');
    const classChange = history.find(h => h.field === 'adr_class' && h.change_type === 'update');
    expect(classChange).toBeDefined();
    expect(classChange!.old_value).toBe('G');
    expect(classChange!.new_value).toBe('D');

    const enforcementChange = history.find(h => h.field === 'enforcement_level' && h.change_type === 'update');
    expect(enforcementChange).toBeDefined();
    expect(enforcementChange!.old_value).toBe('advisory');
    expect(enforcementChange!.new_value).toBe('hard');
  });

  it('upsert does not record taxonomy history when fields are simply omitted (protected, not "changed")', () => {
    store.insert(makeAdrInput({ id: 'adr-g-503', adr_class: 'G', scope: 'global' }));
    store.upsert({ id: 'adr-g-503', type: 'adr', title: 'Test ADR', content: 'Some ADR content' }, 'brain');

    const history = store.getHistory('adr-g-503');
    const taxonomyChanges = history.filter(h =>
      ['adr_class', 'scope', 'immutable', 'source_authority', 'enforcement_level'].includes(h.field),
    );
    expect(taxonomyChanges).toHaveLength(0);
  });

  it('upsert on a non-existent id (insert path) still writes taxonomy columns', () => {
    store.upsert(makeAdrInput({ id: 'adr-g-504', adr_class: 'G', scope: 'global', enforcement_level: 'runtime' }), 'brain');
    const entry = store.getById('adr-g-504');
    expect(entry!.adr_class).toBe('G');
    expect(entry!.scope).toBe('global');
    expect(entry!.enforcement_level).toBe('runtime');
  });
});
