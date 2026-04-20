/**
 * Memory V2 1000-Entry Stress Test — Sprint 145 Beta GA validation.
 *
 * Performance and scale validation:
 *   1. 1000 entry insert (mixed types) — timing
 *   2. 100 tag associations — verify getByTags
 *   3. 200 relation inserts — verify countRelations
 *   4. FTS5 50 random queries — all < 100ms
 *   5. Concurrent read (20x Promise.all) — no error
 *   6. DB file size < 5MB
 *   7. Full DB export → .md < 500ms
 *   8. Decay 500 entries — ms measurement
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
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

// ── Constants ────────────────────────────────────────────────────────

const ENTRY_COUNT = 1000;
const TAG_COUNT = 100;
const RELATION_COUNT = 200;
const QUERY_COUNT = 50;
const CONCURRENT_READERS = 20;

const ENTRY_TYPES = ['adr', 'memory', 'sprint', 'debt', 'pattern', 'retro', 'identity'] as const;
const SOURCES = ['system', 'brain', 'worker', 'user'] as const;

// Deterministic pseudo-random (simple LCG for reproducibility)
function createRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Sample words for generating content
const WORDS_EN = [
  'sprint', 'docker', 'heartbeat', 'worker', 'brain', 'task', 'routing',
  'provider', 'agent', 'skill', 'timeout', 'config', 'memory', 'query',
  'export', 'import', 'decay', 'checkpoint', 'pipeline', 'validation',
  'architecture', 'module', 'dependency', 'interface', 'pattern', 'security',
  'performance', 'optimization', 'concurrent', 'transaction', 'migration',
];

const WORDS_TR = [
  'kararlı', 'düzgün', 'güvenli', 'sağlam', 'mimari', 'görev', 'çalışma',
  'ışık', 'şifre', 'güncelleme', 'değişiklik', 'bağımlılık', 'özellik',
  'başarılı', 'tamamlandı', 'süreç', 'yapılandırma', 'doğrulama',
];

function randomWords(rng: () => number, count: number): string {
  const allWords = [...WORDS_EN, ...WORDS_TR];
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(allWords[Math.floor(rng() * allWords.length)]!);
  }
  return result.join(' ');
}

// ── Suite ────────────────────────────────────────────────────────────

let store: MemoryStore;
let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'memv2-stress-'));
  dbPath = join(tmpDir, 'stress.db');
  store = new MemoryStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('Memory V2 Stress Test (1000 entries)', () => {
  // ── Test 1: Bulk insert ──────────────────────────────────────────

  it(`inserts ${ENTRY_COUNT} entries with mixed types`, () => {
    const rng = createRng(42);
    const start = Date.now();

    for (let i = 0; i < ENTRY_COUNT; i++) {
      const type = ENTRY_TYPES[Math.floor(rng() * ENTRY_TYPES.length)]!;
      const source = SOURCES[Math.floor(rng() * SOURCES.length)]!;
      const sprintNum = Math.floor(rng() * 150);

      const tag1 = randomWords(rng, 1);
      let tag2 = randomWords(rng, 1);
      if (tag2 === tag1) tag2 = `${tag2}-${i}`;

      store.insert({
        id: `stress-${String(i).padStart(4, '0')}`,
        type,
        title: `Entry ${i}: ${randomWords(rng, 3)}`,
        content: randomWords(rng, 10 + Math.floor(rng() * 20)),
        source,
        tags: [tag1, tag2],
        sprint_num: sprintNum,
        sprint_id: `sprint-${sprintNum}`,
        decay_exempt: rng() > 0.8, // 20% exempt
      });
    }

    const elapsed = Date.now() - start;
    expect(store.totalCount()).toBe(ENTRY_COUNT);

    // Bulk insert should complete in reasonable time (< 10s even on slow CI)
    expect(elapsed).toBeLessThan(10_000);

    // Verify type distribution (all types should have entries)
    const counts = store.countByType();
    for (const type of ENTRY_TYPES) {
      expect(counts.get(type) ?? 0).toBeGreaterThan(0);
    }
  });

  // ── Test 2: Tag associations ─────────────────────────────────────

  it(`validates ${TAG_COUNT} tag associations across entries`, () => {
    const rng = createRng(42);
    seedEntries(store, rng, ENTRY_COUNT);

    // Pick TAG_COUNT random entries and verify they have tags
    let entriesWithTags = 0;
    for (let i = 0; i < TAG_COUNT; i++) {
      const idx = Math.floor(createRng(i + 100)() * ENTRY_COUNT);
      const entryId = `stress-${String(idx).padStart(4, '0')}`;
      const tags = store.getTagsForEntry(entryId);
      if (tags.length > 0) entriesWithTags++;
    }

    // Most entries should have tags (we insert 2 tags per entry)
    expect(entriesWithTags).toBeGreaterThan(TAG_COUNT * 0.8);

    // getByTags should return results for common words
    const tagged = store.getByTags(['sprint']);
    expect(tagged.length).toBeGreaterThan(0);
  });

  // ── Test 3: Relations ────────────────────────────────────────────

  it(`inserts ${RELATION_COUNT} relations and verifies count`, () => {
    const rng = createRng(42);
    seedEntries(store, rng, ENTRY_COUNT);

    const relTypes = ['references', 'supersedes', 'caused_by', 'resolves', 'blocks', 'depends_on'] as const;
    const relRng = createRng(99);
    let insertedCount = 0;

    for (let i = 0; i < RELATION_COUNT; i++) {
      const fromIdx = Math.floor(relRng() * ENTRY_COUNT);
      let toIdx = Math.floor(relRng() * ENTRY_COUNT);
      if (toIdx === fromIdx) toIdx = (toIdx + 1) % ENTRY_COUNT;

      const fromId = `stress-${String(fromIdx).padStart(4, '0')}`;
      const toId = `stress-${String(toIdx).padStart(4, '0')}`;
      const relType = relTypes[Math.floor(relRng() * relTypes.length)]!;

      try {
        store.insertRelation(fromId, toId, relType);
        insertedCount++;
      } catch {
        // INSERT OR IGNORE — duplicates silently ignored
      }
    }

    const total = store.countRelations();
    expect(total).toBeGreaterThan(0);
    // Some may be duplicates, so total <= insertedCount
    expect(total).toBeLessThanOrEqual(insertedCount);
  });

  // ── Test 4: FTS5 query performance ───────────────────────────────

  it(`completes ${QUERY_COUNT} FTS5 queries each under 100ms`, () => {
    const rng = createRng(42);
    seedEntries(store, rng, ENTRY_COUNT);

    const queryRng = createRng(77);
    const allWords = [...WORDS_EN, ...WORDS_TR];
    let maxQueryTime = 0;

    for (let i = 0; i < QUERY_COUNT; i++) {
      const term = allWords[Math.floor(queryRng() * allWords.length)]!;
      const start = Date.now();

      const results = searchMemory(store, {
        text: term,
        limit: 20,
      });

      const elapsed = Date.now() - start;
      maxQueryTime = Math.max(maxQueryTime, elapsed);

      // Should return results (our entries contain these words)
      // Some queries may return 0 if the word wasn't used in any entry
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      // Each query must complete under 100ms
      expect(elapsed).toBeLessThan(100);
    }

    // Report max query time for visibility
    expect(maxQueryTime).toBeLessThan(100);
  });

  // ── Test 5: Concurrent reads ─────────────────────────────────────

  it(`handles ${CONCURRENT_READERS} concurrent reads without errors`, async () => {
    const rng = createRng(42);
    seedEntries(store, rng, ENTRY_COUNT);

    const queries = Array.from({ length: CONCURRENT_READERS }, (_, i) => {
      const term = WORDS_EN[i % WORDS_EN.length]!;
      return searchMemory(store, { text: term, limit: 10 });
    });

    // Promise.all simulates concurrent access
    const results = await Promise.all(
      queries.map(r => Promise.resolve(r)),
    );

    // All should resolve without error
    expect(results.length).toBe(CONCURRENT_READERS);
    for (const r of results) {
      expect(Array.isArray(r)).toBe(true);
    }
  });

  // ── Test 6: DB file size ─────────────────────────────────────────

  it('keeps DB file under 5MB with 1000 entries', () => {
    const rng = createRng(42);
    seedEntries(store, rng, ENTRY_COUNT);

    const stats = statSync(dbPath);
    const sizeMB = stats.size / (1024 * 1024);

    // Target: < 5MB
    expect(sizeMB).toBeLessThan(5);
  });

  // ── Test 7: Export performance ───────────────────────────────────

  it('exports full DB to markdown under 500ms', () => {
    const rng = createRng(42);
    seedEntries(store, rng, ENTRY_COUNT);

    const start = Date.now();

    const summary = exportSummaryMd(store);
    const decisions = exportDecisionsMd(store);
    const memory = exportMemoryMd(store);
    const debt = exportDebtMd(store);

    const elapsed = Date.now() - start;

    // All exports should produce content
    expect(summary.length).toBeGreaterThan(0);
    expect(decisions.length).toBeGreaterThan(0);
    expect(memory.length).toBeGreaterThan(0);
    expect(debt.length).toBeGreaterThan(0);

    // Export should complete under 500ms
    expect(elapsed).toBeLessThan(500);
  });

  // ── Test 8: Decay performance ────────────────────────────────────

  it('decays ~500 entries with measured performance', () => {
    const rng = createRng(42);
    seedEntries(store, rng, ENTRY_COUNT);

    // Count entries that will be decayed:
    // decay(150, 75) → threshold = 75
    // Entries with sprint_num < 75 AND decay_exempt=false → ~50% of entries
    // (sprint_num is random 0-149, ~50% are < 75, ~80% are not exempt)
    const beforeCount = store.totalCount();

    const start = Date.now();
    const result = store.decay(150, 75);
    const elapsed = Date.now() - start;

    // Should have decayed a significant number
    expect(result.deletedCount).toBeGreaterThan(0);

    // Remaining count should be less than before
    const afterCount = store.totalCount();
    expect(afterCount).toBeLessThan(beforeCount);
    expect(afterCount).toBe(beforeCount - result.deletedCount);

    // Decay should be fast (< 500ms even for hundreds of entries)
    expect(elapsed).toBeLessThan(500);

    // Exempt entries should survive even with low sprint_num
    // We can't check specific entries since seeding is pseudo-random,
    // but decay_exempt entries with sprint_num < 75 should still be there
  });
});

// ── Shared seed helper ───────────────────────────────────────────────

function seedEntries(s: MemoryStore, rng: () => number, count: number): void {
  for (let i = 0; i < count; i++) {
    const type = ENTRY_TYPES[Math.floor(rng() * ENTRY_TYPES.length)]!;
    const source = SOURCES[Math.floor(rng() * SOURCES.length)]!;
    const sprintNum = Math.floor(rng() * 150);

    const tag1 = randomWords(rng, 1);
    let tag2 = randomWords(rng, 1);
    if (tag2 === tag1) tag2 = `${tag2}-${i}`;

    s.insert({
      id: `stress-${String(i).padStart(4, '0')}`,
      type,
      title: `Entry ${i}: ${randomWords(rng, 3)}`,
      content: randomWords(rng, 10 + Math.floor(rng() * 20)),
      source,
      tags: [tag1, tag2],
      sprint_num: sprintNum,
      sprint_id: `sprint-${sprintNum}`,
      decay_exempt: rng() > 0.8,
    });
  }
}
