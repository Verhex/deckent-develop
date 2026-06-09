import { describe, it, expect } from 'vitest';
import type { AuditEvent } from '../../src/core/audit-writer.js';
import { planRetention } from '../../src/core/audit-retention.js';

// ─── Test helpers ─────────────────────────────────────────────────

const NOW = 1_700_000_000_000; // fixed reference point for determinism

/** Build a minimal AuditEvent with a deterministic ISO timestamp. */
function makeEvent(offsetMs: number, extras?: Partial<AuditEvent>): AuditEvent & { timestamp: string } {
  return {
    tenantId: 'acme',
    actor: 'user-001',
    action: 'test:action',
    timestamp: new Date(NOW + offsetMs).toISOString(),
    ...extras,
  } as AuditEvent & { timestamp: string };
}

/** Build an AuditEvent WITHOUT a timestamp (legacy record). */
function makeLegacyEvent(extras?: Partial<AuditEvent>): AuditEvent {
  return { tenantId: 'acme', actor: 'user-001', action: 'legacy:action', ...extras };
}

// ─── 1. Empty input ───────────────────────────────────────────────

describe('planRetention — empty input', () => {
  it('returns three empty arrays when input is empty', () => {
    const result = planRetention([], { maxAgeMs: 1000, maxCount: 5, now: NOW });
    expect(result).toEqual({ keep: [], archive: [], prune: [] });
  });

  it('returns three empty arrays with no policy', () => {
    const result = planRetention([], {});
    expect(result).toEqual({ keep: [], archive: [], prune: [] });
  });
});

// ─── 2. No policy — everything kept ──────────────────────────────

describe('planRetention — no policy', () => {
  it('keeps all entries when no policy fields are set', () => {
    const entries = [makeEvent(-5000), makeEvent(-3000), makeEvent(-1000)];
    const result = planRetention(entries, { now: NOW });
    expect(result.keep).toHaveLength(3);
    expect(result.archive).toHaveLength(0);
    expect(result.prune).toHaveLength(0);
  });
});

// ─── 3. maxAgeMs — age-based pruning ─────────────────────────────

describe('planRetention — maxAgeMs age-based pruning', () => {
  it('prunes entries older than maxAgeMs', () => {
    // e0: 10s old (expired), e1: 4s old (within), e2: 1s old (within)
    const e0 = makeEvent(-10_000);
    const e1 = makeEvent(-4_000);
    const e2 = makeEvent(-1_000);
    const result = planRetention([e0, e1, e2], { maxAgeMs: 5_000, now: NOW });

    expect(result.prune).toEqual([e0]);
    expect(result.archive).toEqual([]);
    expect(result.keep).toEqual([e1, e2]);
  });

  it('prunes multiple consecutive old entries from head', () => {
    const e0 = makeEvent(-30_000); // 30s old
    const e1 = makeEvent(-20_000); // 20s old
    const e2 = makeEvent(-4_000);  // 4s old (within 5s window)
    const result = planRetention([e0, e1, e2], { maxAgeMs: 5_000, now: NOW });

    expect(result.prune).toEqual([e0, e1]);
    expect(result.archive).toEqual([]);
    expect(result.keep).toEqual([e2]);
  });

  it('keeps all entries when all are within maxAgeMs', () => {
    const entries = [makeEvent(-2_000), makeEvent(-1_000), makeEvent(-500)];
    const result = planRetention(entries, { maxAgeMs: 60_000, now: NOW });

    expect(result.prune).toHaveLength(0);
    expect(result.archive).toHaveLength(0);
    expect(result.keep).toHaveLength(3);
  });

  it('prunes all entries when all are beyond maxAgeMs', () => {
    const entries = [makeEvent(-60_000), makeEvent(-50_000), makeEvent(-40_000)];
    const result = planRetention(entries, { maxAgeMs: 5_000, now: NOW });

    expect(result.prune).toHaveLength(3);
    expect(result.archive).toHaveLength(0);
    expect(result.keep).toHaveLength(0);
  });
});

// ─── 4. maxCount — count-based archiving ─────────────────────────

describe('planRetention — maxCount count-based archiving', () => {
  it('archives entries beyond the maxCount window', () => {
    const e0 = makeEvent(-5_000);
    const e1 = makeEvent(-4_000);
    const e2 = makeEvent(-3_000);
    const e3 = makeEvent(-2_000);
    const e4 = makeEvent(-1_000);
    // maxCount=2: keep last 2, archive first 3
    const result = planRetention([e0, e1, e2, e3, e4], { maxCount: 2, now: NOW });

    expect(result.prune).toEqual([]);
    expect(result.archive).toEqual([e0, e1, e2]);
    expect(result.keep).toEqual([e3, e4]);
  });

  it('keeps all when maxCount >= entries.length', () => {
    const entries = [makeEvent(-3000), makeEvent(-2000), makeEvent(-1000)];
    const result = planRetention(entries, { maxCount: 10, now: NOW });

    expect(result.prune).toHaveLength(0);
    expect(result.archive).toHaveLength(0);
    expect(result.keep).toHaveLength(3);
  });

  it('archives all when maxCount is 0', () => {
    const entries = [makeEvent(-3000), makeEvent(-2000), makeEvent(-1000)];
    const result = planRetention(entries, { maxCount: 0, now: NOW });

    expect(result.prune).toHaveLength(0);
    expect(result.archive).toHaveLength(3);
    expect(result.keep).toHaveLength(0);
  });
});

// ─── 5. Combined policy (maxAgeMs + maxCount) ────────────────────

describe('planRetention — combined maxAgeMs + maxCount', () => {
  it('prunes oldest (age), archives middle (count), keeps newest', () => {
    // 6 events ordered oldest→newest
    const e0 = makeEvent(-60_000); // 60s old — pruned by age (>10s)
    const e1 = makeEvent(-50_000); // 50s old — pruned by age
    const e2 = makeEvent(-5_000);  // 5s old — within age, archived by count
    const e3 = makeEvent(-4_000);  // 4s old — within age, archived by count
    const e4 = makeEvent(-3_000);  // 3s old — kept
    const e5 = makeEvent(-1_000);  // 1s old — kept
    const entries = [e0, e1, e2, e3, e4, e5];

    const result = planRetention(entries, { maxAgeMs: 10_000, maxCount: 2, now: NOW });

    expect(result.prune).toEqual([e0, e1]);
    expect(result.archive).toEqual([e2, e3]);
    expect(result.keep).toEqual([e4, e5]);
  });

  it('maxCount cannot "unprune" age-expired entries (prune boundary respected)', () => {
    // Even with maxCount=100, age-expired entries stay in prune
    const e0 = makeEvent(-20_000); // age-expired
    const e1 = makeEvent(-1_000);  // within window
    const result = planRetention([e0, e1], { maxAgeMs: 5_000, maxCount: 100, now: NOW });

    expect(result.prune).toEqual([e0]);
    expect(result.archive).toEqual([]);
    expect(result.keep).toEqual([e1]);
  });
});

// ─── 6. Chain-contiguity preserved ───────────────────────────────

describe('planRetention — contiguity invariant', () => {
  it('prune + archive + keep reconstructs the original ordered array', () => {
    const entries = Array.from({ length: 8 }, (_, i) => makeEvent(-(8 - i) * 1_000));

    const { prune, archive, keep } = planRetention(entries, {
      maxAgeMs: 5_000,
      maxCount: 3,
      now: NOW,
    });

    expect([...prune, ...archive, ...keep]).toEqual(entries);
  });

  it('no gaps: slices are contiguous and cover all entries', () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEvent(-(10 - i) * 2_000));

    const { prune, archive, keep } = planRetention(entries, {
      maxAgeMs: 8_000,
      maxCount: 4,
      now: NOW,
    });

    expect(prune.length + archive.length + keep.length).toBe(entries.length);
    // Verify order preservation: last prune → first archive, last archive → first keep
    if (prune.length > 0 && archive.length > 0) {
      const pruneLastIdx = entries.indexOf(prune[prune.length - 1]!);
      const archiveFirstIdx = entries.indexOf(archive[0]!);
      expect(archiveFirstIdx).toBe(pruneLastIdx + 1);
    }
    if (archive.length > 0 && keep.length > 0) {
      const archiveLastIdx = entries.indexOf(archive[archive.length - 1]!);
      const keepFirstIdx = entries.indexOf(keep[0]!);
      expect(keepFirstIdx).toBe(archiveLastIdx + 1);
    }
  });
});

// ─── 7. Legacy events (no timestamp) ─────────────────────────────

describe('planRetention — legacy events without timestamp', () => {
  it('does not prune entries without a timestamp (conservative)', () => {
    // Legacy event first in chain — stops pruning even if it appears "old"
    const legacy = makeLegacyEvent();
    const newer = makeEvent(-1_000);
    const result = planRetention([legacy, newer], { maxAgeMs: 100, now: NOW });

    // No prune because the first entry lacks a timestamp → stop immediately
    expect(result.prune).toHaveLength(0);
    expect(result.archive).toHaveLength(0);
    expect(result.keep).toEqual([legacy, newer]);
  });

  it('prunes timestamped head entries then stops at first legacy entry', () => {
    const old = makeEvent(-20_000);    // timestamp, age-expired
    const legacy = makeLegacyEvent();  // no timestamp — stops pruning
    const newer = makeEvent(-1_000);   // timestamp, within window
    const result = planRetention([old, legacy, newer], { maxAgeMs: 5_000, now: NOW });

    expect(result.prune).toEqual([old]);
    // legacy and newer are kept (pruning stopped at legacy)
    expect(result.archive).toHaveLength(0);
    expect(result.keep).toEqual([legacy, newer]);
  });
});
