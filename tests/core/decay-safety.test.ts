import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { CreateEntryInput } from '../../src/core/memory-types.js';

// Hermetic seed helper — every field that the SQLite schema needs explicitly
// so each test can tune sprint_num / decay_exempt / type independently.
function seed(overrides: Partial<CreateEntryInput> = {}): CreateEntryInput {
  return {
    id: overrides.id ?? 'seed-001',
    type: overrides.type ?? 'memory',
    title: overrides.title ?? 'Seeded entry',
    content: overrides.content ?? 'content',
    source: overrides.source ?? 'brain',
    summary: overrides.summary ?? null,
    tags: overrides.tags ?? [],
    status: overrides.status ?? 'active',
    priority: overrides.priority ?? 'normal',
    sprint_id: overrides.sprint_id ?? null,
    sprint_num: overrides.sprint_num ?? 100,
    lang: overrides.lang ?? 'en',
    decay_exempt: overrides.decay_exempt ?? false,
    metadata: overrides.metadata ?? {},
    relations: overrides.relations ?? [],
  };
}

let store: MemoryStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'decay-safety-'));
  store = new MemoryStore(join(tmpDir, 'test.db'));
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('decay-safety — sprint-227-003', () => {
  it('preserves window-boundary entries (currentNum - decayAfterSprints <= entryNum)', () => {
    // Window: currentSprintNum=140, decayAfterSprints=20 → threshold=120.
    // Entries with sprint_num >= 120 must survive; sprint_num < 120 decays.
    store.insert(seed({ id: 'on-boundary-120', sprint_num: 120 }));
    store.insert(seed({ id: 'just-inside-121', sprint_num: 121 }));
    store.insert(seed({ id: 'just-outside-119', sprint_num: 119 }));

    const result = store.decay(140, 20);

    // Boundary entry (sprint_num == threshold) is kept; only sprint_num<120 wiped.
    expect(store.getById('on-boundary-120')).not.toBeNull();
    expect(store.getById('just-inside-121')).not.toBeNull();
    expect(store.getById('just-outside-119')).toBeNull();
    expect(result.deletedCount).toBe(1);
    expect(result.aborted).toBeUndefined();
  });

  it('preserves entries with sprint_num == 0 (undated / parse-missing) — skipDelete guard', () => {
    // sprint_num=0 (schema default) means "unset/unparseable" — must NEVER
    // default-decay per [[feedback_db_silmek_yasak]]. Mix with an obviously
    // old dated entry to show only the dated one is wiped.
    store.insert(seed({ id: 'undated-A', sprint_num: 0 }));
    store.insert(seed({ id: 'undated-B', sprint_num: 0 }));
    store.insert(seed({ id: 'dated-old', sprint_num: 100 }));

    const result = store.decay(140, 20); // threshold=120

    expect(store.getById('undated-A')).not.toBeNull();
    expect(store.getById('undated-B')).not.toBeNull();
    expect(store.getById('dated-old')).toBeNull();
    expect(result.deletedCount).toBe(1);
    expect(result.aborted).toBeUndefined();
  });

  it('aborts decay batch that would wipe more than 50% of non-exempt entries (catastrophic guard)', () => {
    // 12 dated old entries, all eligible — batch=12, nonExemptTotal=12 → ratio=100%.
    // With CATASTROPHIC_BATCH_MIN=10 the guard fires: abort, preserve all.
    for (let i = 0; i < 12; i++) {
      store.insert(seed({ id: `old-${i}`, sprint_num: 50 }));
    }

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = store.decay(140, 20); // threshold=120, all 12 would be wiped

    expect(result.deletedCount).toBe(0);
    expect(result.aborted).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnMsg = (warnSpy.mock.calls[0]?.[0] ?? '') as string;
    expect(warnMsg).toMatch(/catastrophic/);

    // All entries still alive.
    for (let i = 0; i < 12; i++) {
      expect(store.getById(`old-${i}`)).not.toBeNull();
    }

    warnSpy.mockRestore();
  });

  it('keeps decay-exempt ADRs untouched even when batch crosses catastrophic threshold', () => {
    // 5 ADRs (decay_exempt=true, sprint_num=50) + 6 fresh non-exempt entries
    // + 1 old non-exempt entry. Old entry is sole decay candidate; ADRs ignored
    // by the WHERE clause; the catastrophic-ratio denominator is only
    // non-exempt count (6+1=7), so a 1/7 ≈ 14% delete falls well under 50%.
    for (let i = 0; i < 5; i++) {
      store.insert(seed({
        id: `adr-${i}`,
        type: 'adr',
        sprint_num: 50, // intentionally ancient
        decay_exempt: true,
      }));
    }
    for (let i = 0; i < 6; i++) {
      store.insert(seed({ id: `fresh-${i}`, sprint_num: 139 })); // within window
    }
    store.insert(seed({ id: 'old-non-exempt', sprint_num: 50 }));

    const result = store.decay(140, 20); // threshold=120

    // ADRs preserved (decay_exempt protects regardless of age).
    for (let i = 0; i < 5; i++) {
      expect(store.getById(`adr-${i}`)).not.toBeNull();
    }
    // Fresh entries preserved (within window).
    for (let i = 0; i < 6; i++) {
      expect(store.getById(`fresh-${i}`)).not.toBeNull();
    }
    // Only the single old non-exempt entry is decayed; guard did NOT fire.
    expect(store.getById('old-non-exempt')).toBeNull();
    expect(result.deletedCount).toBe(1);
    expect(result.aborted).toBeUndefined();
  });
});
