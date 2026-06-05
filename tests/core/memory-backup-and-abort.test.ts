import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { CreateEntryInput } from '../../src/core/memory-types.js';

let store: MemoryStore;
let tmpDir: string;

function makeEntry(id: string, sprintNum: number, decayExempt = false): CreateEntryInput {
  return {
    id,
    type: 'memory',
    title: `Entry ${id}`,
    content: `Content for ${id}`,
    source: 'brain',
    tags: [],
    status: 'active',
    priority: 'normal',
    sprint_id: `sprint-${sprintNum}`,
    sprint_num: sprintNum,
    lang: 'en',
    decay_exempt: decayExempt,
    metadata: {},
    relations: [],
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mem-backup-abort-test-'));
  store = new MemoryStore(join(tmpDir, 'test.db'));
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Catastrophic-abort >= fix ────────────────────────────────────────

describe('decay catastrophic-abort operator fix', () => {
  it('aborts when batch equals exactly 50% of non-exempt entries (>= boundary)', () => {
    // Need batch >= CATASTROPHIC_BATCH_MIN (3) AND ratio == 0.5 exactly
    // → 3 old + 3 recent = 6 total; 3/6 = 0.5 = CATASTROPHIC_RATIO → must abort with >=
    for (let i = 1; i <= 3; i++) {
      store.insert(makeEntry(`old-${i}`, 5));   // sprint 5 < threshold 10 → decay candidates
    }
    for (let i = 1; i <= 3; i++) {
      store.insert(makeEntry(`recent-${i}`, 25)); // sprint 25 >= threshold 10 → not candidates
    }

    // currentSprint=30, decayAfterSprints=20 → threshold=10
    // batch=3 (>= CATASTROPHIC_BATCH_MIN=3); nonExemptTotal=6; 3/6=0.5 >= 0.5 → abort
    const result = store.decay(30, 20);
    expect(result.aborted).toBe(true);
    expect(result.deletedCount).toBe(0);
  });

  it('aborts when batch is strictly greater than 50% of non-exempt entries', () => {
    // 3 old entries, 1 recent → 3/4 = 75% → abort
    for (let i = 1; i <= 3; i++) {
      store.insert(makeEntry(`old-${i}`, 5));
    }
    store.insert(makeEntry('recent-1', 25));

    const result = store.decay(30, 20);
    expect(result.aborted).toBe(true);
    expect(result.deletedCount).toBe(0);
  });

  it('does NOT abort when batch is less than 50% of non-exempt entries', () => {
    // 1 old entry, 3 recent → 1/4 = 25% → NOT aborted
    store.insert(makeEntry('old-1', 5));
    for (let i = 1; i <= 3; i++) {
      store.insert(makeEntry(`recent-${i}`, 25));
    }

    const result = store.decay(30, 20);
    expect(result.aborted).toBeUndefined();
    expect(result.deletedCount).toBe(1);
  });

  it('decay-exempt entries survive even when batch is below threshold', () => {
    // 2 non-exempt old, 4 non-exempt recent → 2/6 = 33% → deletes the 2 old ones
    // Plus 2 decay-exempt old entries → these are never counted in batch or total
    store.insert(makeEntry('exempt-old-1', 5, true));
    store.insert(makeEntry('exempt-old-2', 5, true));
    for (let i = 1; i <= 2; i++) {
      store.insert(makeEntry(`non-exempt-old-${i}`, 5));
    }
    for (let i = 1; i <= 4; i++) {
      store.insert(makeEntry(`recent-${i}`, 25));
    }

    const result = store.decay(30, 20);
    // 2 non-exempt old / 6 non-exempt total = 33% < 50% → no abort, deletes 2
    expect(result.aborted).toBeUndefined();
    expect(result.deletedCount).toBe(2);

    // Exempt entries must still be present (not soft-deleted)
    const e1 = store.getById('exempt-old-1');
    const e2 = store.getById('exempt-old-2');
    expect(e1?.deleted_at).toBeNull();
    expect(e2?.deleted_at).toBeNull();
  });
});

// ── WAL-safe backup ──────────────────────────────────────────────────

describe('WAL-safe backup', () => {
  it('backup creates a non-empty file that preserves entry count', async () => {
    // Insert some entries
    for (let i = 1; i <= 5; i++) {
      store.insert(makeEntry(`entry-${i}`, 200));
    }
    const originalCount = store.totalCount();
    expect(originalCount).toBe(5);

    const db = store.getRawDb();
    // WAL checkpoint before backup
    db.pragma('wal_checkpoint(TRUNCATE)');

    const backupPath = join(tmpDir, 'memory.db.bak-test');
    await db.backup(backupPath);

    // File must exist and be non-empty
    expect(existsSync(backupPath)).toBe(true);
    const stat = statSync(backupPath);
    expect(stat.size).toBeGreaterThan(0);

    // Backup must contain same entry count
    const backupStore = new MemoryStore(backupPath);
    try {
      const backupCount = backupStore.totalCount();
      expect(backupCount).toBe(originalCount);
    } finally {
      backupStore.close();
    }
  });

  it('backup preserves data integrity after WAL checkpoint with active entries', async () => {
    // Insert entries in WAL mode (default for MemoryStore)
    const entries = ['adr-001', 'memory-001', 'pattern-001'];
    for (const id of entries) {
      store.insert(makeEntry(id, 210, true));
    }

    const db = store.getRawDb();
    db.pragma('wal_checkpoint(TRUNCATE)');

    const backupPath = join(tmpDir, 'memory.db.bak-integrity');
    await db.backup(backupPath);

    // Verify each entry is present in the backup
    const backupStore = new MemoryStore(backupPath);
    try {
      for (const id of entries) {
        const entry = backupStore.getById(id);
        expect(entry).not.toBeNull();
        expect(entry!.id).toBe(id);
      }
    } finally {
      backupStore.close();
    }
  });
});
