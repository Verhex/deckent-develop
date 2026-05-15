// tests/core/memory-relations-migration.test.ts
// Sprint 169 C1 — Memory Relations Migration TDD coverage.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { RelationType } from '../../src/core/memory-types.js';

describe('Memory Relations Migration (C1)', () => {
  let testDir: string;
  let dbPath: string;
  let store: MemoryStore;

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), 'memory-relations-test-'));
    dbPath = join(testDir, 'memory.db');
    store = new MemoryStore(dbPath);
    store.insert({
      id: 'adr-100',
      type: 'adr',
      title: 'Test A',
      content: 'Foo',
      status: 'accepted',
    });
    store.insert({
      id: 'adr-101',
      type: 'adr',
      title: 'Test B',
      content: 'Bar',
      status: 'accepted',
    });
  });

  afterAll(() => {
    store.close();
    rmSync(testDir, { recursive: true });
  });

  it('insertRelation: insert basic reference', () => {
    store.insertRelation({
      from_id: 'adr-100',
      to_id: 'adr-101',
      type: 'references',
    });
    const rels = store.getRelations('adr-100');
    const matched = rels.filter(
      (r) => r.to_id === 'adr-101' && r.type === 'references',
    );
    expect(matched).toHaveLength(1);
    expect(matched[0]!.from_id).toBe('adr-100');
    expect(matched[0]!.type).toBe('references');
  });

  it('insertRelation: dedupe duplicate', () => {
    store.insertRelation({
      from_id: 'adr-100',
      to_id: 'adr-101',
      type: 'references',
    });
    store.insertRelation({
      from_id: 'adr-100',
      to_id: 'adr-101',
      type: 'references',
    });
    const rels = store.getRelations('adr-100');
    const matched = rels.filter(
      (r) => r.type === 'references' && r.to_id === 'adr-101',
    );
    expect(matched).toHaveLength(1);
  });

  it('insertRelation: foreign key validation (skip orphan)', () => {
    expect(() =>
      store.insertRelation({
        from_id: 'adr-999',
        to_id: 'adr-100',
        type: 'references',
      }),
    ).toThrow(/orphan|not found/i);
    expect(() =>
      store.insertRelation({
        from_id: 'adr-100',
        to_id: 'adr-999',
        type: 'references',
      }),
    ).toThrow(/orphan|not found/i);
  });

  it('insertRelation: 6 MADR v3 types', () => {
    const types: RelationType[] = [
      'references',
      'supersedes',
      'caused_by',
      'resolves',
      'blocks',
      'depends_on',
    ];
    types.forEach((t, i) => {
      const id = `adr-${200 + i}`;
      store.insert({
        id,
        type: 'adr',
        title: `T${i}`,
        content: '',
        status: 'accepted',
      });
      store.insertRelation({ from_id: 'adr-100', to_id: id, type: t });
    });
    const all = store.getRelations('adr-100');
    for (const t of types) {
      expect(all.find((r) => r.type === t)).toBeDefined();
    }
  });
});
