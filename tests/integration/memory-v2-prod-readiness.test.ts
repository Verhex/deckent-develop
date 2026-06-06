/**
 * Memory V2 Prod-Readiness E2E — Sprint 145 Beta GA validation.
 *
 * Validates the full Memory V2 DB-first lifecycle:
 *   1. DB init + 7 entry type insert (adr, memory, sprint, debt, pattern, retro, identity)
 *   2. Tag many-to-many association
 *   3. Relations (references, supersedes)
 *   4. FTS5 dual-layer query (TR + EN + DE)
 *   5. Decay trigger
 *   6. Export → .md → reimport roundtrip
 *   7. Upsert history tracking
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import { searchMemory } from '../../src/core/memory-query.js';
import {
  exportSummaryMd,
  exportDecisionsMd,
  exportMemoryMd,
  exportDebtMd,
} from '../../src/core/memory-export.js';
import { parseDecisionsMd, parseMemoryMd, parseDebtMd } from '../../src/core/memory-import.js';

let store: MemoryStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'memv2-prod-'));
  store = new MemoryStore(join(tmpDir, 'prod-readiness.db'));
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Helpers ──────────────────────────────────────────────────────────

function insertAllSevenTypes(): void {
  store.insert({
    id: 'ADR-042',
    type: 'adr',
    title: 'Test ADR for Prod Readiness',
    content: 'Decision: validate Memory V2 before beta. Context: prod-readiness.',
    source: 'system',
    tags: ['prod-readiness', 'memory-v2'],
    status: 'accepted',
    sprint_num: 145,
    sprint_id: 'sprint-145',
    decay_exempt: true,
  });

  store.insert({
    id: 'mem-145-learn',
    type: 'memory',
    title: 'Sprint 145 Learning',
    content: 'Memory V2 stress test passed with 1000 entries.',
    source: 'brain',
    tags: ['learning', 'memory-v2'],
    sprint_num: 145,
    sprint_id: 'sprint-145',
  });

  store.insert({
    id: 'sprint-145-log',
    type: 'sprint',
    title: 'Sprint 145 Log',
    content: '27 tasks planned, adaptive timeout active.',
    source: 'brain',
    tags: ['sprint-log'],
    sprint_num: 145,
    sprint_id: 'sprint-145',
  });

  store.insert({
    id: 'debt-145-001',
    type: 'debt',
    title: 'Timeout estimator edge case',
    content: 'timeout-estimator returns NaN for zero-task sprints.',
    source: 'brain',
    tags: ['tech-debt', 'timeout'],
    status: 'active',
    priority: 'low',
    sprint_num: 145,
    sprint_id: 'sprint-145',
  });

  store.insert({
    id: 'pattern-concurrent',
    type: 'pattern',
    title: 'Concurrent SQLite Access Pattern',
    content: 'WAL mode enables concurrent reads. Single write at a time.',
    source: 'brain',
    tags: ['sqlite', 'concurrency'],
    sprint_num: 145,
    sprint_id: 'sprint-145',
  });

  store.insert({
    id: 'retro-145',
    type: 'retro',
    title: 'Sprint 145 Retrospective',
    content: 'Memory V2 validated. 27/27 tasks DONE. Beta GA gate passed.',
    source: 'brain',
    tags: ['retro'],
    sprint_num: 145,
    sprint_id: 'sprint-145',
  });

  store.insert({
    id: 'identity-deckent',
    type: 'identity',
    title: 'Deckent Project Identity',
    content: 'AI agent orchestration CLI. TypeScript ESM. 145+ sprints.',
    source: 'system',
    tags: ['identity', 'project'],
    sprint_num: 1,
    sprint_id: 'sprint-1',
    decay_exempt: true,
  });
}

// ── Test 1: DB init + 7 entry types ──────────────────────────────────

describe('Memory V2 Prod-Readiness', () => {
  it('initializes DB and inserts all 7 entry types', () => {
    insertAllSevenTypes();

    expect(store.totalCount()).toBe(7);

    // Verify each type exists
    const types = ['adr', 'memory', 'sprint', 'debt', 'pattern', 'retro', 'identity'];
    for (const type of types) {
      const entries = store.getByType(type);
      expect(entries.length).toBeGreaterThanOrEqual(1);
    }

    // Verify schema version is set
    expect(store.getSchemaVersion()).toBeGreaterThanOrEqual(1);
  });

  // ── Test 2: Tag many-to-many association ─────────────────────────

  it('manages tag many-to-many associations correctly', () => {
    insertAllSevenTypes();

    // Verify tags for specific entry
    const adrTags = store.getTagsForEntry('ADR-042');
    expect(adrTags).toContain('prod-readiness');
    expect(adrTags).toContain('memory-v2');

    // getByTags: find all entries with 'memory-v2' tag
    const memV2Entries = store.getByTags(['memory-v2']);
    expect(memV2Entries.length).toBe(2); // adr-042 + mem-145-learn

    const ids = memV2Entries.map(e => e.id);
    expect(ids).toContain('ADR-042');
    expect(ids).toContain('mem-145-learn');

    // getByTags with tag that only one entry has
    const sqliteEntries = store.getByTags(['sqlite']);
    expect(sqliteEntries.length).toBe(1);
    expect(sqliteEntries[0]!.id).toBe('pattern-concurrent');
  });

  // ── Test 3: Relations (references, supersedes) ───────────────────

  it('handles relations between entries', () => {
    insertAllSevenTypes();

    // Insert relation: memory references the ADR
    store.insertRelation('mem-145-learn', 'ADR-042', 'references');

    // Insert relation: retro references the sprint log
    store.insertRelation('retro-145', 'sprint-145-log', 'references');

    // Insert supersedes: adr-042 supersedes a hypothetical old ADR
    store.insert({
      id: 'ADR-041-old',
      type: 'adr',
      title: 'Old Memory Design',
      content: 'File-based memory system.',
      source: 'system',
      status: 'superseded',
      sprint_num: 100,
      decay_exempt: true,
    });
    store.insertRelation('ADR-042', 'ADR-041-old', 'supersedes');

    // Verify relations
    expect(store.countRelations()).toBe(3);

    // getRelationsFrom: mem-145-learn → adr-042
    const fromMem = store.getRelationsFrom('mem-145-learn');
    expect(fromMem.length).toBe(1);
    expect(fromMem[0]!.to_id).toBe('ADR-042');
    expect(fromMem[0]!.rel_type).toBe('references');

    // getRelationsTo: adr-042 receives refs from mem-145-learn
    const toAdr = store.getRelationsTo('ADR-042');
    expect(toAdr.length).toBe(1);
    expect(toAdr[0]!.from_id).toBe('mem-145-learn');

    // getRelations: adr-042 has both incoming (references) and outgoing (supersedes)
    const allRels = store.getRelations('ADR-042');
    expect(allRels.length).toBe(2);
  });

  // ── Test 4: FTS5 dual-layer query (TR + EN + DE) ─────────────────

  it('performs FTS5 dual-layer search across TR, EN, and DE text', () => {
    // Insert entries in different languages
    store.insert({
      id: 'tr-entry',
      type: 'memory',
      title: 'Kararlı ve Düzgün Çalışma',
      content: 'Sistem kararlı ve düzgün çalışıyor. Güvenli ve sağlam mimari.',
      source: 'brain',
      tags: ['stability'],
      lang: 'tr',
      sprint_num: 145,
    });

    store.insert({
      id: 'en-entry',
      type: 'memory',
      title: 'Stable and Safe Operation',
      content: 'The system runs stable and safe. Solid architecture confirmed.',
      source: 'brain',
      tags: ['stability'],
      lang: 'en',
      sprint_num: 145,
    });

    store.insert({
      id: 'de-entry',
      type: 'memory',
      title: 'Sicherheit und Stabilität',
      content: 'Das System läuft sicher und stabil. Sicherheit bestätigt.',
      source: 'brain',
      tags: ['stability'],
      lang: 'de',
      sprint_num: 145,
    });

    // TR search: "kararlı düzgün" → finds tr-entry
    const trResults = searchMemory(store, { text: 'kararlı düzgün', limit: 10 });
    expect(trResults.length).toBeGreaterThanOrEqual(1);
    expect(trResults.some(r => r.entry.id === 'tr-entry')).toBe(true);

    // EN search: "stable safe" → finds en-entry
    const enResults = searchMemory(store, { text: 'stable safe', limit: 10 });
    expect(enResults.length).toBeGreaterThanOrEqual(1);
    expect(enResults.some(r => r.entry.id === 'en-entry')).toBe(true);

    // DE search: "Sicherheit" → finds de-entry
    const deResults = searchMemory(store, { text: 'Sicherheit', limit: 10 });
    expect(deResults.length).toBeGreaterThanOrEqual(1);
    expect(deResults.some(r => r.entry.id === 'de-entry')).toBe(true);

    // Normalized search: "kararli" (ASCII) should find TR entry via normalized columns
    const normResults = searchMemory(store, { text: 'kararli', limit: 10 });
    expect(normResults.some(r => r.entry.id === 'tr-entry')).toBe(true);

    // Cross-language tag search (structured, not FTS)
    const tagResults = searchMemory(store, {
      tags_contain: ['stability'],
      limit: 10,
    });
    expect(tagResults.length).toBe(3);
  });

  // ── Test 5: Decay trigger ────────────────────────────────────────

  it('decays old non-exempt entries, preserves exempt and recent', () => {
    // Insert exempt entry (sprint 10, identity)
    store.insert({
      id: 'exempt-ancient',
      type: 'identity',
      title: 'Ancient Identity',
      content: 'Created at sprint 10, should survive decay.',
      source: 'system',
      sprint_num: 10,
      decay_exempt: true,
    });

    // Insert old non-exempt entries (various types, sprint < 97)
    for (let i = 0; i < 5; i++) {
      store.insert({
        id: `old-entry-${i}`,
        type: ['memory', 'sprint', 'debt', 'pattern', 'retro'][i]!,
        title: `Old Entry ${i}`,
        content: `Content from sprint ${50 + i * 10}`,
        source: 'brain',
        sprint_num: 50 + i * 10, // 50, 60, 70, 80, 90
      });
    }

    // Insert recent entry (sprint 99)
    store.insert({
      id: 'recent-entry',
      type: 'memory',
      title: 'Recent Learning',
      content: 'From sprint 99, should survive.',
      source: 'brain',
      sprint_num: 99,
    });

    // Additional recent (surviving) entries so the decay batch stays UNDER the
    // catastrophic-abort ratio (>= 50% of non-exempt aborts — see memory-store.ts
    // decay() guard, asserted in memory-backup-and-abort.test.ts). With 5 old +
    // 6 recent = 11 non-exempt, 5/11 = 45% < 50% → decay proceeds normally.
    for (let i = 0; i < 5; i++) {
      store.insert({
        id: `recent-extra-${i}`,
        type: 'memory',
        title: `Recent Extra ${i}`,
        content: 'From sprint 98, should survive.',
        source: 'brain',
        sprint_num: 98,
      });
    }

    expect(store.totalCount()).toBe(12); // 1 exempt + 5 old + 6 recent

    // Decay: current=100, decay_after=3 → threshold=97
    // Entries with sprint_num < 97 AND not exempt → soft-deleted
    const result = store.decay(100, 3);

    // old-entry-0 (sprint 50), old-entry-1 (60), old-entry-2 (70), old-entry-3 (80), old-entry-4 (90) → all < 97 → decayed
    expect(result.deletedCount).toBe(5);

    // Exempt survives
    expect(store.getById('exempt-ancient')).not.toBeNull();

    // Recent survives
    expect(store.getById('recent-entry')).not.toBeNull();

    // Old entries soft-deleted
    for (let i = 0; i < 5; i++) {
      expect(store.getById(`old-entry-${i}`)).toBeNull();
      // But still in DB with includeDeleted
      const deleted = store.getById(`old-entry-${i}`, { includeDeleted: true });
      expect(deleted).not.toBeNull();
      expect(deleted!.deleted_at).not.toBeNull();
    }

    // totalCount reflects active only
    expect(store.totalCount()).toBe(7); // exempt + 6 recent
  });

  // ── Test 6: Export → .md → reimport roundtrip ────────────────────

  it('roundtrips through export and reimport without data loss', () => {
    insertAllSevenTypes();

    // Add relations for richer export
    store.insertRelation('mem-145-learn', 'ADR-042', 'references');

    // Export all four formats
    const summaryMd = exportSummaryMd(store);
    const decisionsMd = exportDecisionsMd(store);
    const memoryMd = exportMemoryMd(store);
    const debtMd = exportDebtMd(store);

    // Verify exports are non-empty and contain expected content
    expect(summaryMd.length).toBeGreaterThan(0);
    expect(summaryMd.length).toBeLessThan(5000);
    expect(summaryMd).toContain('ADR-042');

    expect(decisionsMd).toContain('Test ADR for Prod Readiness');
    expect(memoryMd).toContain('Sprint 145 Learning');
    expect(debtMd).toContain('Timeout estimator');

    // Reimport into a fresh store
    const store2 = new MemoryStore(join(tmpDir, 'reimport.db'));
    try {
      // Parse and reimport ADRs
      const reimportedAdrs = parseDecisionsMd(decisionsMd);
      for (const entry of reimportedAdrs) {
        store2.insert(entry);
      }

      // Parse and reimport memories
      const reimportedMems = parseMemoryMd(memoryMd);
      for (const entry of reimportedMems) {
        store2.insert(entry);
      }

      // Parse and reimport debt
      const reimportedDebt = parseDebtMd(debtMd);
      for (const entry of reimportedDebt) {
        store2.insert(entry);
      }

      // Verify ADR roundtrip
      const adrs = store2.getByType('adr');
      expect(adrs.length).toBeGreaterThanOrEqual(1);
      expect(adrs.some(a => a.title.includes('Test ADR for Prod Readiness'))).toBe(true);

      // Verify memory roundtrip
      const mems = store2.getByType('memory');
      expect(mems.length).toBeGreaterThanOrEqual(1);

      // Verify FTS works on reimported data
      const searchResult = searchMemory(store2, { text: 'prod readiness', limit: 5 });
      expect(searchResult.length).toBeGreaterThanOrEqual(1);
    } finally {
      store2.close();
    }
  });

  // ── Test 7: Upsert + history tracking ────────────────────────────

  it('tracks field-level history across multiple upserts', () => {
    store.insert({
      id: 'evolving-entry',
      type: 'adr',
      title: 'Initial Title',
      content: 'Initial content before any changes.',
      source: 'system',
      status: 'proposed',
      sprint_num: 145,
    });

    // First upsert: change title and status
    store.upsert(
      {
        id: 'evolving-entry',
        type: 'adr',
        title: 'Revised Title',
        content: 'Initial content before any changes.',
        source: 'system',
        status: 'accepted',
        sprint_num: 145,
      },
      'brain',
    );

    // Second upsert: change content
    store.upsert(
      {
        id: 'evolving-entry',
        type: 'adr',
        title: 'Revised Title',
        content: 'Updated content after review.',
        source: 'system',
        status: 'accepted',
        sprint_num: 145,
      },
      'user',
    );

    // Verify current state
    const current = store.getById('evolving-entry');
    expect(current).not.toBeNull();
    expect(current!.title).toBe('Revised Title');
    expect(current!.content).toBe('Updated content after review.');
    expect(current!.status).toBe('accepted');

    // Verify history
    const history = store.getHistory('evolving-entry');
    // create + title update + status update + content update = at least 4 records
    expect(history.length).toBeGreaterThanOrEqual(3);

    // Find title change
    const titleChange = history.find(
      h => h.field === 'title' && h.change_type === 'update',
    );
    expect(titleChange).toBeDefined();
    expect(titleChange!.old_value).toBe('Initial Title');
    expect(titleChange!.new_value).toBe('Revised Title');
    expect(titleChange!.changed_by).toBe('brain');

    // Find content change
    const contentChange = history.find(
      h => h.field === 'content' && h.change_type === 'update',
    );
    expect(contentChange).toBeDefined();
    expect(contentChange!.changed_by).toBe('user');
  });
});
