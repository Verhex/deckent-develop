// ═══ Audit Event Write API ═══════════════════════════════════════════════════
// Structured write-side companion to audit-query.ts.
// F4 enterprise foundation — ADR-037 audit-trail + tenant isolation.
// Sprint 208 (208-011).

import { createHash } from 'node:crypto';
import { writeEvent } from './event-stream.js';

// ─── Channel constant ─────────────────────────────────────────────

/** Dedicated channel for structured audit events written via this API. */
export const AUDIT_EVENT_CHANNEL = 'DECKENT→AUDIT:EVENT_WRITTEN';

// ─── Hash-chain constants ─────────────────────────────────────────

/** Genesis seed for the tamper-evident hmac chain. */
const GENESIS_HMAC = 'deckent-audit-genesis-0000000000000000000000000000000000000000';

/** Running chain head — updated after every successful write. */
let chainHead: string = GENESIS_HMAC;

// ─── Types ────────────────────────────────────────────────────────

/** Input shape for writeAuditEvent(). All required fields must be non-empty strings. */
export interface AuditEvent {
  tenantId: string;
  actor: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
  /**
   * Tamper-evident chain field. Added by writeAuditEvent() — absent on legacy records.
   * Contains the hmac of the previous event in the chain (or the genesis constant).
   */
  prevHmac?: string;
  /**
   * Tamper-evident chain field. Added by writeAuditEvent() — absent on legacy records.
   * sha256(prevHmac + canonicalJson(payload_without_chain_fields)).
   */
  hmac?: string;
}

/** The payload stored in the event stream for each audit event. */
export interface AuditEventPayload extends AuditEvent {
  timestamp: string;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Reset the module-level chain head. Intended for testing only — allows
 * deterministic chain verification in isolated test runs.
 */
export function _resetChainHead(seed?: string): void {
  chainHead = seed ?? GENESIS_HMAC;
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
    timestamp,
  };

  const prevHmac = chainHead;
  const hmac = computeEventHmac(prevHmac, basePayload);

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
    chainHead = hmac;
  }

  return written !== null;
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

    // Reconstruct base payload: strip chain fields before re-hashing
    const base: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(event)) {
      if (k !== 'hmac' && k !== 'prevHmac') base[k] = v;
    }

    const expected = computeEventHmac(event.prevHmac, base);
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

function computeEventHmac(prevHmac: string, basePayload: unknown): string {
  const h = createHash('sha256');
  h.update(prevHmac + canonicalJson(basePayload));
  return h.digest('hex');
}

/** Deterministic JSON serialization with sorted keys at every level. */
function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + (obj as unknown[]).map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj as object).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k])).join(',') + '}';
}
