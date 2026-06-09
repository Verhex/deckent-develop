// ═══ Audit Log Retention & Rotation Policy ══════════════════════════════════
// Pure retention planner for the audit event chain. Partitions a sequence of
// AuditEvents into keep / archive / prune WITHOUT performing any I/O — the
// caller applies the plan.
//
// Chain-contiguity invariant (mandatory for hash-chain integrity):
//   Pruned and archived entries are always taken from the chain HEAD (oldest
//   events, lowest indices). The keep partition is always a contiguous suffix
//   (newest events). This ensures verifyAuditChain() on the kept events stays
//   meaningful: the kept entries form an internally consistent sub-chain with no
//   gaps. Pruning from the middle would orphan the surviving tail and break
//   prevHmac linkage.
//
//   Partition layout (oldest → newest, i.e. input index 0 → n-1):
//     [ prune... | archive... | keep... ]
//
//   prune   — age-expired entries (older than maxAgeMs from `now`)
//   archive — entries beyond the maxCount window but not age-expired
//   keep    — entries within both limits (most recent)
//
// F4 enterprise foundation — Sprint 262 (262-005).

import type { AuditEvent } from './audit-writer.js';

// ─── Types ────────────────────────────────────────────────────────

/** Policy knobs for planRetention(). All fields are optional. */
export interface RetentionPolicy {
  /**
   * Maximum age of a retained entry in milliseconds.
   * Entries older than `now - maxAgeMs` are placed in `prune`.
   */
  maxAgeMs?: number;
  /**
   * Maximum number of entries to keep.
   * Entries beyond the most recent `maxCount` (but not age-expired) go to `archive`.
   */
  maxCount?: number;
  /**
   * Injectable current time (milliseconds since epoch). Defaults to Date.now().
   * Provide in tests for deterministic behavior.
   */
  now?: number;
}

/** Result of planRetention() — three disjoint, contiguous, ordered partitions. */
export interface RetentionPlan {
  /** Entries within both age and count limits — newest suffix. */
  keep: AuditEvent[];
  /** Entries beyond the count limit but not age-expired — middle band. */
  archive: AuditEvent[];
  /** Age-expired entries — oldest prefix. */
  prune: AuditEvent[];
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Partition `entries` into keep / archive / prune according to `policy`.
 *
 * The function is pure (no I/O) — the caller is responsible for applying the plan.
 * Entries are assumed to be ordered oldest-first (index 0 = oldest), matching
 * the write order produced by writeAuditEvent(). Chain-contiguity is preserved:
 * prune and archive always come from the head, keep is always the tail.
 *
 * @param entries - Ordered audit events (oldest first, as written to the chain).
 * @param policy  - Retention thresholds. All fields optional; empty policy → everything kept.
 */
export function planRetention(entries: AuditEvent[], policy: RetentionPolicy): RetentionPlan {
  if (entries.length === 0) {
    return { keep: [], archive: [], prune: [] };
  }

  const now = policy.now ?? Date.now();
  const n = entries.length;

  // ── Step 1: determine pruneUntil ─────────────────────────────────
  // Scan from the head (oldest). An entry is pruned when its age exceeds maxAgeMs.
  // Stop at the first entry that lacks a parseable timestamp — we cannot determine
  // its age, so we stop pruning to preserve chain-contiguity (conservative).
  let pruneUntil = 0;
  if (policy.maxAgeMs !== undefined) {
    for (let i = 0; i < n; i++) {
      const ts = getTimestampMs(entries[i]!);
      if (ts === undefined) break; // unknown age — stop to preserve contiguity
      if (now - ts > policy.maxAgeMs) {
        pruneUntil = i + 1;
      } else {
        break; // entries are oldest-first; once within window, all later entries are too
      }
    }
  }

  // ── Step 2: determine keepFrom ───────────────────────────────────
  // The most recent maxCount entries are kept. Entries between pruneUntil and
  // keepFrom go to archive (not age-expired, but beyond the count window).
  let keepFrom = pruneUntil;
  if (policy.maxCount !== undefined) {
    const countBasedKeepFrom = Math.max(0, n - policy.maxCount);
    keepFrom = Math.max(pruneUntil, countBasedKeepFrom);
  }

  return {
    prune: entries.slice(0, pruneUntil),
    archive: entries.slice(pruneUntil, keepFrom),
    keep: entries.slice(keepFrom),
  };
}

// ─── Internal helpers ─────────────────────────────────────────────

/**
 * Extract the numeric timestamp (ms since epoch) from an AuditEvent.
 * AuditEventPayload (the stored form) extends AuditEvent with `timestamp: string`.
 * Returns undefined for legacy events that lack this field.
 */
function getTimestampMs(event: AuditEvent): number | undefined {
  const ts = (event as { timestamp?: string }).timestamp;
  if (typeof ts !== 'string') return undefined;
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? undefined : parsed;
}
