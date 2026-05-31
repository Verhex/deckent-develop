// ═══ Audit Event Write API ═══════════════════════════════════════════════════
// Structured write-side companion to audit-query.ts.
// F4 enterprise foundation — ADR-037 audit-trail + tenant isolation.
// Sprint 208 (208-011).

import { writeEvent } from '../orchestra/event-stream.js';

// ─── Channel constant ─────────────────────────────────────────────

/** Dedicated channel for structured audit events written via this API. */
export const AUDIT_EVENT_CHANNEL = 'DECKENT→AUDIT:EVENT_WRITTEN';

// ─── Types ────────────────────────────────────────────────────────

/** Input shape for writeAuditEvent(). All required fields must be non-empty strings. */
export interface AuditEvent {
  tenantId: string;
  actor: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

/** The payload stored in the event stream for each audit event. */
export interface AuditEventPayload extends AuditEvent {
  timestamp: string;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Write a structured audit event to the sprint event stream.
 *
 * The event payload includes tenantId at the top level so that
 * audit-query.filterByTenant() can locate it. Returns true on success,
 * false when validation fails (no event written, no throw).
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

  const payload: AuditEventPayload = {
    tenantId: event.tenantId,
    actor: event.actor,
    action: event.action,
    ...(event.target !== undefined ? { target: event.target } : {}),
    ...(event.metadata !== undefined ? { metadata: event.metadata } : {}),
    timestamp: new Date().toISOString(),
  };

  const written = writeEvent(
    projectRoot,
    sprintId,
    'deckent',
    'auditor',
    AUDIT_EVENT_CHANNEL,
    payload,
  );

  return written !== null;
}

// ─── Validation ───────────────────────────────────────────────────

/** Validates that all required AuditEvent fields are present and non-empty. */
export function validateAuditEvent(event: AuditEvent): boolean {
  if (typeof event.tenantId !== 'string' || event.tenantId.trim() === '') return false;
  if (typeof event.actor !== 'string' || event.actor.trim() === '') return false;
  if (typeof event.action !== 'string' || event.action.trim() === '') return false;
  return true;
}
