// ═══ Audit Event Write API ═══════════════════════════════════════════════════
// Structured write-side companion to audit-query.ts.
// F4 enterprise foundation — ADR-037 audit-trail + tenant isolation.
// Sprint 208 (208-011).

import { createHash, createHmac } from 'node:crypto';
import { writeEvent, readEvents } from './event-stream.js';
import type { ApprovalSlaEvidence } from './approval-sla.js';

// ─── Channel constant ─────────────────────────────────────────────

/** Dedicated channel for structured audit events written via this API. */
export const AUDIT_EVENT_CHANNEL = 'DECKENT→AUDIT:EVENT_WRITTEN';

// ─── Hash-chain constants ─────────────────────────────────────────

/**
 * Genesis seed for the tamper-evident hmac chain. Algorithm-agnostic — the seed
 * is the `prevHmac` of every stream's first event regardless of chain version.
 * Exported so external/compliance verifiers can independently anchor the chain.
 */
export const GENESIS_HMAC = 'deckent-audit-genesis-0000000000000000000000000000000000000000';

/**
 * Shared HMAC secret for the v2 (keyed) chain. MUST match the default `secret`
 * of `audit-export.ts` (`'deckent-audit'`) so the write side and the
 * export/verification side use the SAME keyed-HMAC-SHA256 algorithm (323-013).
 * Exported so an independent verifier can recompute a written record's hmac.
 *
 * NOTE (tracked follow-up): a production deployment should thread a single
 * config/secret-manager-sourced secret through BOTH `audit-writer` and
 * `audit-export`. Reading an env override on only one side would re-introduce
 * the very mismatch this task fixes, so the literal default is intentionally
 * kept identical on both sides here; the shared-config work is out of scope.
 */
export const AUDIT_HMAC_SECRET = 'deckent-audit';

/**
 * Current chain-algorithm version written into every new event's payload.
 * - **v2** (this constant) — keyed `HMAC-SHA256(AUDIT_HMAC_SECRET, …)`,
 *   matching `audit-export.ts`'s primitive.
 * - **v1 / absent** — legacy unkeyed `sha256(…)` (records written before
 *   323-013). Still verified with the legacy algorithm for backward-compat.
 *
 * `chainVersion` is part of the authenticated basePayload, so tampering with it
 * on a v2 record breaks verification. (A full v2→v1 downgrade forgery remains
 * theoretically possible only because legacy v1 records were secret-less and are
 * still accepted for back-compat; upgrading them requires a secret-keyed re-sign
 * migration — an operational follow-up, see result notes.)
 */
const CHAIN_ALGO_VERSION = 2;

/**
 * Per-(projectRoot, sprintId) running chain heads. A21: a single module-level
 * head let EVERY sprint and EVERY audit partition ('autonomous', 'process',
 * mission, enterprise sprint-N) share one running hmac. In a long-lived process
 * (autonomous loop, server) the second stream written began its first event with
 * `prevHmac = <previous stream's head>` ≠ GENESIS, so `verifyAuditChain()` over
 * that stream — which anchors index 0 at GENESIS — returned `{ brokenAt: 0 }`.
 * Scoping the head per stream makes each on-disk chain independently anchor at
 * GENESIS at its first event, restoring tamper-evidence cross-sprint.
 */
const chainHeads = new Map<string, string>();

/** When set by {@link _resetChainHead}(seed), the next write of every stream
 *  anchors at `seed` instead of re-seeding from disk/GENESIS (test-only). */
let chainSeedOverride: string | undefined;

/** Identity key for a chain head. NUL cannot appear in a path or sprintId. */
function chainKey(projectRoot: string, sprintId: string): string {
  return `${projectRoot}\u0000${sprintId}`;
}

/**
 * Resolve the current chain head for a stream. On the first write of this process
 * to a given (projectRoot, sprintId) the head is seeded from the last persisted
 * audit event's hmac so a restart that APPENDS to an existing sprint stays
 * contiguous (verifyAuditChain anchors index 0 at GENESIS — the pre-restart first
 * event already carries it). An empty/missing/unreadable stream seeds GENESIS.
 * Cached per key thereafter.
 */
function currentChainHead(projectRoot: string, sprintId: string): string {
  const key = chainKey(projectRoot, sprintId);
  const cached = chainHeads.get(key);
  if (cached !== undefined) return cached;

  let seed = chainSeedOverride ?? GENESIS_HMAC;
  if (chainSeedOverride === undefined) {
    try {
      const auditEvents = readEvents(projectRoot, sprintId, { channel: AUDIT_EVENT_CHANNEL });
      const lastHmac = (auditEvents[auditEvents.length - 1]?.payload as { hmac?: string } | undefined)?.hmac;
      if (typeof lastHmac === 'string' && lastHmac.length > 0) seed = lastHmac;
    } catch { /* missing/unreadable stream → GENESIS */ }
  }
  chainHeads.set(key, seed);
  return seed;
}

// ─── Types ────────────────────────────────────────────────────────

/** Input shape for writeAuditEvent(). All required fields must be non-empty strings. */
export interface AuditEvent {
  tenantId: string;
  actor: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
  /** Groups all events belonging to the same logical request flow (ENT-3 causal lineage). */
  correlationId?: string;
  /** Identifies the upstream request that caused this event to be emitted (ENT-3 causal lineage). */
  causationId?: string;
  /**
   * Tamper-evident chain field. Added by writeAuditEvent() — absent on legacy records.
   * Contains the hmac of the previous event in the chain (or the genesis constant).
   */
  prevHmac?: string;
  /**
   * Tamper-evident chain field. Added by writeAuditEvent() — absent on legacy records.
   * v2: `HMAC-SHA256(AUDIT_HMAC_SECRET, prevHmac + canonicalJson(base))`.
   * v1/legacy: unkeyed `sha256(prevHmac + canonicalJson(base))`.
   * `base` = the payload without the chain fields (`prevHmac`, `hmac`).
   */
  hmac?: string;
  /**
   * Chain-algorithm version for this record (323-013). `2` = keyed HMAC-SHA256
   * (export-compatible). Absent/`1` = legacy unkeyed SHA-256. Part of the
   * authenticated base, so it cannot be silently changed on a v2 record.
   */
  chainVersion?: number;
}

/** The payload stored in the event stream for each audit event. */
export interface AuditEventPayload extends AuditEvent {
  timestamp: string;
}

export interface ApprovalLifecycleAuditInput {
  readonly tenantId: string;
  readonly requestId: string;
  readonly origin: string;
  readonly evidence: ApprovalSlaEvidence;
  readonly sourceReference: string;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Reset all per-stream chain heads. Intended for testing only — allows
 * deterministic chain verification in isolated test runs. With a `seed` the
 * next write of every stream anchors at it (legacy single-head semantics);
 * without one each stream re-seeds from disk/GENESIS on its next write.
 */
export function _resetChainHead(seed?: string): void {
  chainHeads.clear();
  chainSeedOverride = seed;
}

/**
 * Write a structured audit event to the sprint event stream.
 *
 * Each event carries prevHmac + hmac for tamper-evidence (optional additive
 * fields — absent on legacy records → backward-safe). The module-level chain
 * head is advanced only on successful write.
 *
 * Fail-safe: I/O errors from writeEvent() are silently absorbed (writeEvent
 * never throws — it returns null on failure). Callers can treat `false` as
 * "event not persisted" and decide whether to retry.
 *
 * @param projectRoot - Project root directory
 * @param sprintId    - Sprint identifier, e.g. "sprint-208"
 * @param event       - Structured audit event data
 */
export function writeAuditEvent(
  projectRoot: string,
  sprintId: string,
  event: AuditEvent,
): boolean {
  if (!validateAuditEvent(event)) return false;

  const timestamp = new Date().toISOString();
  const basePayload = {
    tenantId: event.tenantId,
    actor: event.actor,
    action: event.action,
    ...(event.target !== undefined ? { target: event.target } : {}),
    ...(event.metadata !== undefined ? { metadata: event.metadata } : {}),
    ...(event.correlationId !== undefined ? { correlationId: event.correlationId } : {}),
    ...(event.causationId !== undefined ? { causationId: event.causationId } : {}),
    // chainVersion is authenticated (part of the hashed base) — see CHAIN_ALGO_VERSION.
    chainVersion: CHAIN_ALGO_VERSION,
    timestamp,
  };

  const prevHmac = currentChainHead(projectRoot, sprintId);
  const hmac = computeEventHmac(prevHmac, basePayload, CHAIN_ALGO_VERSION);

  const payload: AuditEventPayload = { ...basePayload, prevHmac, hmac };

  const written = writeEvent(
    projectRoot,
    sprintId,
    'deckent',
    'auditor',
    AUDIT_EVENT_CHANNEL,
    payload,
  );

  if (written !== null) {
    chainHeads.set(chainKey(projectRoot, sprintId), hmac);
  }

  return written !== null;
}

/**
 * Persist one lifecycle stage/skip/expiry as a structured system audit event.
 * Mechanism callers supply only typed metadata; timeout is never attributed to
 * a human actor and no user-visible prose is stored as authority.
 */
export function writeApprovalLifecycleAuditEvent(
  projectRoot: string,
  sprintId: string,
  input: ApprovalLifecycleAuditInput,
): boolean {
  if (!input.requestId || !input.origin || !input.sourceReference) return false;
  if (input.evidence.requestId !== input.requestId) return false;
  return writeAuditEvent(projectRoot, sprintId, {
    tenantId: input.tenantId,
    actor: input.evidence.kind === 'expired' ? 'system:expiry' : 'system:approval-sla',
    action: input.evidence.kind === 'expired'
      ? 'approval.timeout-disposition'
      : input.evidence.kind === 'skipped'
        ? 'approval.sla-stage-skipped'
        : 'approval.sla-stage-due',
    target: input.requestId,
    correlationId: input.requestId,
    causationId: input.evidence.eventId,
    metadata: {
      origin: input.origin,
      sourceReference: input.sourceReference,
      lifecycleGeneration: input.evidence.lifecycleGeneration,
      stage: input.evidence.stage,
      ordinal: input.evidence.ordinal,
      kind: input.evidence.kind,
      dueAt: input.evidence.dueAt,
      observedAt: input.evidence.observedAt,
      authoredPolicyDigest: input.evidence.authoredPolicyDigest,
      appliedPolicyDigest: input.evidence.appliedPolicyDigest,
      ...(input.evidence.reasonCode ? { reasonCode: input.evidence.reasonCode } : {}),
    },
  });
}

/**
 * Verify the tamper-evident chain of a sequence of audit events.
 *
 * Events without hmac fields (legacy records) are skipped — backward-safe.
 * A broken link (prevHmac mismatch or hmac recomputation mismatch) returns
 * `{ intact: false, brokenAt: <0-based index> }`.
 *
 * @param events - Ordered sequence of audit events (as stored)
 */
export function verifyAuditChain(events: AuditEvent[]): { intact: boolean; brokenAt?: number } {
  let expectedPrev = GENESIS_HMAC;

  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    if (event.hmac === undefined) continue; // legacy record — skip, backward-safe

    if (event.prevHmac !== expectedPrev) {
      return { intact: false, brokenAt: i };
    }

    // Reconstruct base payload: strip chain links before re-hashing. chainVersion
    // stays in the base (it is authenticated), and selects the algorithm so that
    // legacy v1 (unkeyed SHA-256) and v2 (keyed HMAC) records — including a stream
    // that migrated v1→v2 mid-chain — each verify under their own algorithm.
    const base: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(event)) {
      if (k !== 'hmac' && k !== 'prevHmac') base[k] = v;
    }

    const version = typeof event.chainVersion === 'number' ? event.chainVersion : 1;
    const expected = computeEventHmac(event.prevHmac, base, version);
    if (expected !== event.hmac) {
      return { intact: false, brokenAt: i };
    }

    expectedPrev = event.hmac;
  }

  return { intact: true };
}

// ─── Validation ───────────────────────────────────────────────────

/** Validates that all required AuditEvent fields are present and non-empty. */
export function validateAuditEvent(event: AuditEvent): boolean {
  if (typeof event.tenantId !== 'string' || event.tenantId.trim() === '') return false;
  if (typeof event.actor !== 'string' || event.actor.trim() === '') return false;
  if (typeof event.action !== 'string' || event.action.trim() === '') return false;
  return true;
}

// ─── Hash-chain helpers ────────────────────────────────────────────

/**
 * Compute one chain link.
 * - **v2** — keyed `HMAC-SHA256(AUDIT_HMAC_SECRET, prevHmac + canonicalJson(base))`,
 *   the same keyed-HMAC primitive `audit-export.ts` uses (323-013 alignment).
 * - **v1 / legacy** — unkeyed `sha256(prevHmac + canonicalJson(base))`, preserved
 *   so records written before 323-013 stay verifiable (backward-compat).
 */
function computeEventHmac(prevHmac: string, basePayload: unknown, version: number): string {
  const data = prevHmac + canonicalJson(basePayload);
  if (version >= 2) {
    return createHmac('sha256', AUDIT_HMAC_SECRET).update(data).digest('hex');
  }
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Deterministic JSON serialization with sorted keys at every level. Exported so
 * an independent/compliance verifier can reconstruct the exact bytes that were
 * fed to the chain HMAC and re-validate a written record off-process.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + (obj as unknown[]).map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj as object).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k])).join(',') + '}';
}
