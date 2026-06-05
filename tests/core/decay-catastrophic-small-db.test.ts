import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { CreateEntryInput } from '../../src/core/memory-types.js';

function makeInput(overrides: Partial<CreateEntryInput> & { id: string }): CreateEntryInput {
  return {
    type: 'memory',
    title: `Entry ${overrides.id}`,
    content: 'test content',
    source: 'brain',
    summary: 'test summary',
    tags: [],
    status: 'active',
    priority: 'normal',
    sprint_id: 'sprint-231',
    sprint_num: 100,
    lang: 'en',
    decay_exempt: false,
    metadata: {},
    relations: [],
    ...overrides,
  };
}

let tmpDir: string;
let store: MemoryStore;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'decay-small-db-'));
  store = new MemoryStore(join(tmpDir, 'memory.db'));
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// Sprint 231-003: DB-size-aware catastrophic-abort guard.
// CATASTROPHIC_BATCH_MIN lowered 10→3 so small DBs are protected too.
// decay(currentSprint, decayAfterSprints) → threshold = currentSprint - decayAfterSprints
// Entries with sprint_num < threshold AND sprint_num > 0 qualify for decay.
// Tests below use decay(250, 20) → threshold=230: old=sprint_num<230, recent=sprint_num>=230.

describe('decay catastrophic-abort — small DB bypass fix (sprint-231-003)', () => {
  it('aborts when small DB has >50% non-exempt entries decaying (60% case)', () => {
    // 5 non-exempt entries; 3 old (sprint_num=10 < 230) = 60% → must abort
    store.insert(makeInput({ id: 'e1', sprint_num: 10 }));
    store.insert(makeInput({ id: 'e2', sprint_num: 10 }));
    store.insert(makeInput({ id: 'e3', sprint_num: 10 }));
    store.insert(makeInput({ id: 'e4', sprint_num: 240 })); // recent: 240 >= 230 → kept
    store.insert(makeInput({ id: 'e5', sprint_num: 245 })); // recent: 245 >= 230 → kept

    const result = store.decay(250, 20); // threshold=230
    expect(result.aborted).toBe(true);
    expect(result.deletedCount).toBe(0);
    // All entries preserved
    expect(store.getById('e1')).not.toBeNull();
    expect(store.getById('e2')).not.toBeNull();
    expect(store.getById('e3')).not.toBeNull();
  });

  it('allows legitimate single-entry decay regardless of DB size', () => {
    // 5 non-exempt entries; only 1 old (20%) → must proceed, not abort
    store.insert(makeInput({ id: 'old1', sprint_num: 10 }));
    store.insert(makeInput({ id: 'r1', sprint_num: 240 }));
    store.insert(makeInput({ id: 'r2', sprint_num: 240 }));
    store.insert(makeInput({ id: 'r3', sprint_num: 240 }));
    store.insert(makeInput({ id: 'r4', sprint_num: 240 }));

    const result = store.decay(250, 20); // threshold=230; only old1 qualifies
    expect(result.aborted).toBeUndefined();
    expect(result.deletedCount).toBe(1);
    expect(store.getById('old1')).toBeNull();
  });

  it('allows legitimate two-entry decay (floor=3: batches of 1-2 always proceed)', () => {
    // 5 non-exempt entries; 2 old (40%) → must proceed (below catastrophic floor)
    store.insert(makeInput({ id: 'old1', sprint_num: 10 }));
    store.insert(makeInput({ id: 'old2', sprint_num: 10 }));
    store.insert(makeInput({ id: 'r1', sprint_num: 240 }));
    store.insert(makeInput({ id: 'r2', sprint_num: 240 }));
    store.insert(makeInput({ id: 'r3', sprint_num: 240 }));

    const result = store.decay(250, 20); // threshold=230; old1/old2 qualify
    expect(result.aborted).toBeUndefined();
    expect(result.deletedCount).toBe(2);
    expect(store.getById('old1')).toBeNull();
    expect(store.getById('old2')).toBeNull();
  });

  it('large DB normal decay proceeds without abort (regression guard)', () => {
    // 20 non-exempt entries; 3 old (15%) → must proceed
    for (let i = 1; i <= 3; i++) {
      store.insert(makeInput({ id: `old${i}`, sprint_num: 10 }));
    }
    for (let i = 1; i <= 17; i++) {
      store.insert(makeInput({ id: `recent${i}`, sprint_num: 240 }));
    }

    const result = store.decay(250, 20); // threshold=230; 3 qualify out of 20
    expect(result.aborted).toBeUndefined();
    expect(result.deletedCount).toBe(3);
  });
});
