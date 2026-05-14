// Sprint 166 — Task 003 (Bug S fix) regression tests.
// Verifies sprint-aware cache key + cache-hit semantics on doc-cache.ts.
// Falsifies the pre-Sprint-166 behavior where (entryHash, fileHash) alone
// produced cache hits across sprints, suppressing CLAUDE.md re-generation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  computeCacheKey,
  isCacheHit,
  readDocCache,
  writeDocCache,
  contentHash,
  type DocCacheEntry,
} from '../../../src/orchestra/managed-docs/doc-cache.js';

const TEST_ROOT = path.join(process.cwd(), '.test-sprint-aware-cache-' + process.pid);

function cleanup() {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

beforeEach(() => {
  cleanup();
  fs.mkdirSync(TEST_ROOT, { recursive: true });
});

afterEach(cleanup);

describe('computeCacheKey — sprint difference', () => {
  it('produces different keys for different sprint IDs (Bug S core fix)', () => {
    const entryHash = contentHash('entry-config');
    const fileHash = contentHash('claude-md-content');

    const key165 = computeCacheKey(entryHash, fileHash, 'sprint-165');
    const key166 = computeCacheKey(entryHash, fileHash, 'sprint-166');

    expect(key165).not.toBe(key166);
    expect(key165).toContain('sprint-165');
    expect(key166).toContain('sprint-166');
  });

  it('isCacheHit returns MISS when only sprintId differs', () => {
    const cached: DocCacheEntry = {
      entryHash: 'eh',
      fileHash: 'fh',
      sprintId: 'sprint-165',
      updatedAt: '2026-04-30T00:00:00.000Z',
    };
    // Identical entry+file hashes but next sprint — must miss to trigger regen.
    expect(isCacheHit(cached, 'eh', 'fh', 'sprint-166')).toBe(false);
  });
});

describe('computeCacheKey — idempotent', () => {
  it('same (entryHash, fileHash, sprintId) yields the same key on repeated calls', () => {
    const entryHash = contentHash('cfg');
    const fileHash = contentHash('body');
    const k1 = computeCacheKey(entryHash, fileHash, 'sprint-166');
    const k2 = computeCacheKey(entryHash, fileHash, 'sprint-166');
    const k3 = computeCacheKey(entryHash, fileHash, 'sprint-166');
    expect(k1).toBe(k2);
    expect(k2).toBe(k3);
  });

  it('isCacheHit is idempotent — repeated calls return the same result', () => {
    const cached: DocCacheEntry = {
      entryHash: 'h1',
      fileHash: 'h2',
      sprintId: 'sprint-166',
      updatedAt: '2026-05-13T00:00:00.000Z',
    };
    expect(isCacheHit(cached, 'h1', 'h2', 'sprint-166')).toBe(true);
    expect(isCacheHit(cached, 'h1', 'h2', 'sprint-166')).toBe(true);
    expect(isCacheHit(cached, 'h1', 'h2', 'sprint-166')).toBe(true);
  });
});

describe('computeCacheKey — backwards compat fallback', () => {
  it('omits sprint segment when sprintId is undefined (legacy callers)', () => {
    const entryHash = contentHash('cfg');
    const fileHash = contentHash('body');
    const legacyKey = computeCacheKey(entryHash, fileHash);
    expect(legacyKey).toBe(`${entryHash}:${fileHash}`);
    expect(legacyKey).not.toContain(':sprint-');
  });

  it('isCacheHit falls back to hash-only check when caller omits sprintId', () => {
    const legacyCached: DocCacheEntry = {
      entryHash: 'eh',
      fileHash: 'fh',
      // No sprintId — pre-Sprint-166 entry shape
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    // Caller without sprintId (standalone `docs run`) sees a HIT — old behavior preserved.
    expect(isCacheHit(legacyCached, 'eh', 'fh')).toBe(true);
    // Hash mismatch is still a MISS, even without sprintId.
    expect(isCacheHit(legacyCached, 'other-eh', 'fh')).toBe(false);
    expect(isCacheHit(legacyCached, 'eh', 'other-fh')).toBe(false);
  });

  it('legacy entry on disk parses without sprintId and survives round-trip', () => {
    // Simulate a pre-Sprint-166 cache file (no sprintId field)
    const legacyEntry: DocCacheEntry = {
      entryHash: 'eh',
      fileHash: 'fh',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    writeDocCache(TEST_ROOT, { 'claude-md': legacyEntry });
    const restored = readDocCache(TEST_ROOT);
    const got = restored['claude-md'] as DocCacheEntry;
    expect(got.entryHash).toBe('eh');
    expect(got.fileHash).toBe('fh');
    expect(got.sprintId).toBeUndefined();
  });
});

describe('updateProjectDocs cache miss on new sprint', () => {
  // Simulates the managed-doc-runner flow: write a cache entry for sprint-165,
  // then evaluate cache hit for sprint-166 — must MISS so the runner regenerates.
  it('legacy entry (no sprintId) + caller with sprintId → MISS (force refresh)', () => {
    const legacyCached: DocCacheEntry = {
      entryHash: 'eh',
      fileHash: 'fh',
      // No sprintId — written before Sprint 166 fix.
      updatedAt: '2026-04-01T00:00:00.000Z',
    };
    // The runner now passes ctx.sprintResult.sprint.id. Legacy cache must
    // invalidate on the first post-fix run so the entry gets rewritten with sprintId.
    expect(isCacheHit(legacyCached, 'eh', 'fh', 'sprint-166')).toBe(false);
  });

  it('end-to-end disk round-trip: sprint-165 entry → sprint-166 check is a MISS', () => {
    const entryHash = contentHash(JSON.stringify({ autoSections: ['Sprint Metrics'] }));
    const fileHash = contentHash('# CLAUDE.md\n\n## Sprint Metrics\n| Sprint | sprint-165 |\n');

    // Previous sprint wrote a cache entry tagged with sprint-165.
    const prev: DocCacheEntry = {
      entryHash,
      fileHash,
      sprintId: 'sprint-165',
      updatedAt: '2026-04-30T12:00:00.000Z',
    };
    writeDocCache(TEST_ROOT, { 'claude-md': prev });

    // New sprint kicks off: same file (not yet rewritten), same config — old logic
    // would HIT here. With sprint-aware key, sprint-166 forces a MISS, so the runner
    // regenerates CLAUDE.md with current sprint metrics.
    const restored = readDocCache(TEST_ROOT);
    const cached = restored['claude-md'] as DocCacheEntry;

    expect(isCacheHit(cached, entryHash, fileHash, 'sprint-166')).toBe(false);
    // Sanity: same-sprint replay is still a HIT (no thrash).
    expect(isCacheHit(cached, entryHash, fileHash, 'sprint-165')).toBe(true);
  });

  it('computeCacheKey changes when sprint advances even with identical hashes', () => {
    const entryHash = contentHash('cfg');
    const fileHash = contentHash('body');
    const before = computeCacheKey(entryHash, fileHash, 'sprint-165');
    const after = computeCacheKey(entryHash, fileHash, 'sprint-166');
    expect(before).not.toBe(after);
  });
});
