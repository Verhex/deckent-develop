import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectPatterns } from '../../src/monitor/auditor.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { MEMORY_DB_FILE, BRAIN_DIR } from '../../src/core/constants.js';
import type { BoundaryViolation } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeViolation(type: string, overrides: Partial<BoundaryViolation> = {}): BoundaryViolation {
  return {
    type: type as BoundaryViolation['type'],
    agentId: 'worker-1',
    detail: `Test violation: ${type}`,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────
//
// B7 (Memory V2): detectPatterns records auditor boundary-violation patterns
// into memory.db as `type='pattern'` entries. The legacy `.brain/PATTERNS.md`
// JSON writer was removed — the DB is the single source of truth.

describe('detectPatterns — Memory V2 DB-first', () => {
  let root: string;
  let dbPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'detect-patterns-'));
    mkdirSync(join(root, BRAIN_DIR), { recursive: true });
    dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
    // Create the DB + schema so detectPatterns has a store to write into.
    new MemoryStore(dbPath).close();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function readPatterns() {
    const store = new MemoryStore(dbPath);
    try {
      return store.getByType('pattern');
    } finally {
      store.close();
    }
  }

  it('records a violation pattern entry in memory.db', () => {
    detectPatterns(root, [makeViolation('file_outside_scope')], 'sprint-027');

    const patterns = readPatterns();
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.id).toBe('pattern-sprint-027-file_outside_scope');
    expect(patterns[0]!.type).toBe('pattern');
    expect(patterns[0]!.sprint_id).toBe('sprint-027');
    expect(patterns[0]!.status).toBe('active');
  });

  it('groups violations by type with an occurrence count in metadata', () => {
    detectPatterns(root, [
      makeViolation('stale_heartbeat'),
      makeViolation('stale_heartbeat'),
      makeViolation('stale_heartbeat'),
    ], 'sprint-027');

    const patterns = readPatterns();
    expect(patterns).toHaveLength(1);
    const meta = JSON.parse(patterns[0]!.metadata || '{}') as { occurrences?: number; violationType?: string };
    expect(meta.occurrences).toBe(3);
    expect(meta.violationType).toBe('stale_heartbeat');
  });

  it('creates a distinct entry per violation type', () => {
    detectPatterns(root, [
      makeViolation('stale_heartbeat'),
      makeViolation('file_outside_scope'),
      makeViolation('stale_lock'),
    ], 'sprint-027');

    const patterns = readPatterns();
    expect(patterns).toHaveLength(3);
    expect(patterns.map(p => p.id).sort()).toEqual([
      'pattern-sprint-027-file_outside_scope',
      'pattern-sprint-027-stale_heartbeat',
      'pattern-sprint-027-stale_lock',
    ]);
  });

  it('upserts idempotently — re-detecting the same sprint+type keeps one row', () => {
    detectPatterns(root, [makeViolation('stale_lock')], 'sprint-027');
    detectPatterns(root, [makeViolation('stale_lock'), makeViolation('stale_lock')], 'sprint-027');

    const patterns = readPatterns();
    expect(patterns).toHaveLength(1);
    const meta = JSON.parse(patterns[0]!.metadata || '{}') as { occurrences?: number };
    expect(meta.occurrences).toBe(2); // last write wins
  });

  it('does nothing when there are no violations', () => {
    detectPatterns(root, [], 'sprint-027');
    expect(readPatterns()).toHaveLength(0);
  });

  it('is a graceful no-op when memory.db is absent', () => {
    const freshRoot = mkdtempSync(join(tmpdir(), 'detect-patterns-nodb-'));
    try {
      expect(() => detectPatterns(freshRoot, [makeViolation('stale_lock')], 'sprint-027')).not.toThrow();
      expect(existsSync(join(freshRoot, BRAIN_DIR, MEMORY_DB_FILE))).toBe(false);
    } finally {
      rmSync(freshRoot, { recursive: true, force: true });
    }
  });
});
