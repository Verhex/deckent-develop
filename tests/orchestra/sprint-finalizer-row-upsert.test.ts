// Sprint 198 198-002 — sprint-log row upsert contract.
//
// 197-002 forensic showed sprint-log-194 + sprint-log-196 were absent
// from `.brain/memory.db` because finalize crashed (Sprint 194 halted
// pre-finalize; Sprint 196 mid-finalize) and the legacy code path had
// no defensive fallback. The fix introduces:
//   - `MemoryStore.upsertSprintLog(sprintId, payload)` — single-call
//     atomic upsert for the canonical `sprint-log-<num>` row.
//   - Sprint 198 198-002 defensive fallback in `sprint-finalizer.ts`
//     that engages whenever `writeRetrospective` did not persist the
//     sprint-log row.
//
// These tests pin the contract for the helper and the minimal-row
// fallback semantics so the bug cannot regress silently.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'sprint-log-upsert-'));
  dbPath = join(tmpDir, 'memory.db');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('MemoryStore.upsertSprintLog', () => {
  it('happy path — inserts canonical sprint-log row with full payload', () => {
    const store = new MemoryStore(dbPath);
    try {
      const id = store.upsertSprintLog('sprint-194', {
        totalTasks: 14,
        durationMs: 60_000,
        content: '# sprint-194\n\n- Total tasks: 14\n- Completed: 8\n- NO_GO: 6\n',
      });
      expect(id).toBe('sprint-log-194');

      const entry = store.getById(id);
      expect(entry).not.toBeNull();
      expect(entry?.type).toBe('sprint');
      expect(entry?.sprint_id).toBe('sprint-194');
      expect(entry?.sprint_num).toBe(194);
      expect(entry?.status).toBe('active');
      expect(entry?.content).toContain('- Total tasks: 14');
      expect(entry?.title).toBe('Sprint sprint-194');
      expect(entry?.tag_text.split(' ')).toEqual(
        expect.arrayContaining(['sprint', 'sprint-194']),
      );
    } finally {
      store.close();
    }
  });

  it('idempotent — second call upserts the same row (no duplicate)', () => {
    const store = new MemoryStore(dbPath);
    try {
      store.upsertSprintLog('sprint-196', { totalTasks: 5, durationMs: 10_000 });
      store.upsertSprintLog('sprint-196', {
        totalTasks: 8,
        durationMs: 25_000,
        content: '# sprint-196\n\n- Total tasks: 8\n',
      });

      const rows = (
        store as unknown as { db: { prepare: (sql: string) => { all: () => unknown[] } } }
      ).db
        .prepare(`SELECT id FROM entries WHERE sprint_id = 'sprint-196' AND type = 'sprint'`)
        .all() as Array<{ id: string }>;
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe('sprint-log-196');

      const entry = store.getById('sprint-log-196');
      expect(entry?.content).toContain('- Total tasks: 8');
    } finally {
      store.close();
    }
  });

  it('defensive minimal payload — writes row when metrics omitted (halted sprint)', () => {
    const store = new MemoryStore(dbPath);
    try {
      // Simulates the post-crash fallback after Sprint 194-style halt:
      // no totalTasks, no durationMs, no content.
      const id = store.upsertSprintLog('sprint-194', {
        extraTags: ['defensive-fallback'],
      });
      expect(id).toBe('sprint-log-194');

      const entry = store.getById(id);
      expect(entry).not.toBeNull();
      expect(entry?.sprint_num).toBe(194);
      // Default fallback body must still be addressable (downstream tools parse `# sprint-NNN`).
      expect(entry?.content).toContain('# sprint-194');
      expect(entry?.content).toContain('Backfilled via upsertSprintLog');
      expect(entry?.tag_text.split(' ')).toEqual(
        expect.arrayContaining(['sprint', 'sprint-194', 'defensive-fallback']),
      );
    } finally {
      store.close();
    }
  });

  it('race condition — two sequential upserts collapse to one row', () => {
    const store = new MemoryStore(dbPath);
    try {
      // better-sqlite3 is synchronous; simulating "two finalize calls"
      // race by calling back-to-back without close().
      store.upsertSprintLog('sprint-198', { totalTasks: 6 });
      store.upsertSprintLog('sprint-198', { totalTasks: 6, durationMs: 99 });

      const rows = (
        store as unknown as { db: { prepare: (sql: string) => { all: () => unknown[] } } }
      ).db
        .prepare(`SELECT id FROM entries WHERE id = 'sprint-log-198'`)
        .all() as Array<{ id: string }>;
      expect(rows.length).toBe(1);

      const entry = store.getById('sprint-log-198');
      expect(entry?.content).toContain('99ms');
    } finally {
      store.close();
    }
  });

  it('canonical id derivation — strips non-digits from sprint id', () => {
    const store = new MemoryStore(dbPath);
    try {
      const id = store.upsertSprintLog('sprint-042', { totalTasks: 1 });
      expect(id).toBe('sprint-log-42');
      const entry = store.getById(id);
      expect(entry?.sprint_num).toBe(42);
    } finally {
      store.close();
    }
  });
});
