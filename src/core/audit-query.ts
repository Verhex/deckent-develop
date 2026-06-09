// ═══ Audit Log Query API ════════════════════════════════════════════════
// Read-only query layer over the event stream (src/orchestra/event-stream.ts).
// F4 enterprise foundation — ADR-062 audit-trail + tenant-based filtering.
// Sprint 205 (205-008) — skeleton only: read + filter, no new audit writes.

import { readEvents } from '../orchestra/event-stream.js';
import type { DeckentEvent } from '../orchestra/event-stream.js';
import { can, Permission } from './rbac.js';
import { AUDIT_EVENT_CHANNEL } from './audit-writer.js';
import type { AuditEvent, AuditEventPayload } from './audit-writer.js';

// ─── Types ────────────────────────────────────────────────────────

/** Filter parameters for queryAudit(). All fields are optional (AND semantics). */
export interface AuditQuery {
  /** Only events whose payload.tenantId matches this value. */
  tenantId?: string;
  /** Only events whose channel matches this value (exact match). */
  channel?: string;
  /** Only events at or after this ISO 8601 timestamp. */
  from?: string;
  /** Only events at or before this ISO 8601 timestamp. */
  to?: string;
}

/** A single matched audit event with its raw source. */
export interface AuditEntry {
  timestamp: string;
  sequence: number;
  source: string;
  target: string;
  channel: string;
  tenantId: string | undefined;
  payload: unknown;
}

/** Result of queryAudit(). */
export interface AuditQueryResult {
  sprintId: string;
  totalScanned: number;
  matched: AuditEntry[];
}

// ─── Core Query ───────────────────────────────────────────────────

/**
 * Query audit events for a sprint with optional filtering.
 *
 * Reads from the sprint event stream (append-only JSONL) via readEvents(),
 * then applies filters in this order: tenantId → channel → time-range.
 * Returns an empty matched array (never throws) on I/O failure.
 *
 * When `role` is provided, enforces RBAC: the caller must have READ permission
 * for the tenant scope. Calls `can(role, Permission.READ, tenantId)` — returns
 * an empty result if the check fails (fail-closed, ADR-037).
 *
 * @param projectRoot - Project root directory
 * @param sprintId    - Sprint identifier, e.g. "sprint-205"
 * @param query       - Filter parameters (all optional, AND semantics)
 * @param role        - Optional caller role for RBAC enforcement
 */
export function queryAudit(
  projectRoot: string,
  sprintId: string,
  query: AuditQuery = {},
  role?: string,
): AuditQueryResult {
  if (role !== undefined) {
    const tenantId = query.tenantId ?? 'local';
    if (!can(role, Permission.READ, tenantId)) {
      return { sprintId, totalScanned: 0, matched: [] };
    }
  }

  const rawEvents = readEvents(projectRoot, sprintId);
  let filtered: DeckentEvent[] = rawEvents;

  if (query.tenantId !== undefined) {
    filtered = filterByTenant(filtered, query.tenantId);
  }

  if (query.channel !== undefined) {
    filtered = filterByChannel(filtered, query.channel);
  }

  if (query.from !== undefined || query.to !== undefined) {
    filtered = filterByTimeRange(filtered, query.from, query.to);
  }

  return {
    sprintId,
    totalScanned: rawEvents.length,
    matched: filtered.map(toAuditEntry),
  };
}

// ─── Raw audit-event reader (gap #5 read-side) ────────────────────

/**
 * Read the raw ENT-3 audit payloads (with prevHmac/hmac chain fields) for a
 * sprint, in stream order — the input shape `verifyAuditChain`,
 * `generateComplianceReport`, and the SIEM forwarder consume. Non-audit
 * channels on the stream are excluded. Missing stream → `[]` (never throws).
 */
export function readAuditEvents(projectRoot: string, sprintId: string): AuditEventPayload[] {
  return readEvents(projectRoot, sprintId)
    .filter(e => e.channel === AUDIT_EVENT_CHANNEL)
    .map(e => e.payload as unknown as AuditEventPayload);
}

// ─── Filter Helpers ───────────────────────────────────────────────

function filterByTenant(events: DeckentEvent[], tenantId: string): DeckentEvent[] {
  return events.filter(e => extractTenantId(e.payload) === tenantId);
}

function filterByChannel(events: DeckentEvent[], channel: string): DeckentEvent[] {
  return events.filter(e => e.channel === channel);
}

function filterByTimeRange(
  events: DeckentEvent[],
  from: string | undefined,
  to: string | undefined,
): DeckentEvent[] {
  return events.filter(e => {
    const ts = e.timestamp;
    if (from !== undefined && ts < from) return false;
    if (to !== undefined && ts > to) return false;
    return true;
  });
}

// ─── Utilities ────────────────────────────────────────────────────

function extractTenantId(payload: unknown): string | undefined {
  if (payload !== null && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (typeof p['tenantId'] === 'string') return p['tenantId'];
  }
  return undefined;
}

function toAuditEntry(e: DeckentEvent): AuditEntry {
  return {
    timestamp: e.timestamp,
    sequence: e.sequence,
    source: e.source,
    target: e.target,
    channel: e.channel,
    tenantId: extractTenantId(e.payload),
    payload: e.payload,
  };
}

// ═══ Lineage Query Surface (ENT-3, SOC2/ISO traceability) ═════════════════
// Pure, read-only helpers over a provided AuditEvent list.
// No I/O — callers supply the event list; these functions only filter/group.

/**
 * AuditEvent with optional lineage fields (correlationId + causationId).
 * Extends the base write-side AuditEvent with the two lineage fields that
 * DeckentEvent carries at the top level (ADR-035, ENT-3).
 */
export interface AuditEventWithLineage extends AuditEvent {
  /** Groups all events belonging to the same logical request flow. */
  correlationId?: string;
  /** Identifies the upstream request that caused this event to be emitted. */
  causationId?: string;
}

/**
 * Filter events by correlationId (exact match).
 * Returns a new array; does not mutate input. Empty input → [].
 */
export function filterByCorrelation(
  events: AuditEventWithLineage[],
  correlationId: string,
): AuditEventWithLineage[] {
  return events.filter(e => e.correlationId === correlationId);
}

/**
 * Filter events by causationId (exact match).
 * Returns a new array; does not mutate input. Empty input → [].
 */
export function filterByCausation(
  events: AuditEventWithLineage[],
  causationId: string,
): AuditEventWithLineage[] {
  return events.filter(e => e.causationId === causationId);
}

/**
 * Build the ordered causal chain for a given correlationId.
 *
 * Returns all events that share `rootCorrelationId`, ordered so that
 * causal ancestors appear before their dependents: events with no
 * causationId (or a causationId not in the correlation group) come first,
 * then events whose causationId was already placed, until all are placed.
 * This is a topological sort over the causation graph within the group.
 *
 * Empty input → []. Events with no correlationId match are excluded.
 * Cyclic or unresolvable causation chains: remaining events appended in order.
 */
export function buildCausalChain(
  events: AuditEventWithLineage[],
  rootCorrelationId: string,
): AuditEventWithLineage[] {
  const group = events.filter(e => e.correlationId === rootCorrelationId);
  if (group.length === 0) return [];

  // Topological sort: place events whose causal parent is already placed
  // (or has no parent within the group). Use hmac as the stable event id.
  const placedHmacs = new Set<string>();
  const result: AuditEventWithLineage[] = [];
  let remaining = [...group];
  let progress = true;

  while (progress && remaining.length > 0) {
    progress = false;
    const nextRemaining: AuditEventWithLineage[] = [];
    for (const e of remaining) {
      // parentHmacInGroup: true when this event's causationId matches a group member's hmac
      const parentHmacInGroup =
        e.causationId !== undefined && group.some(g => g.hmac === e.causationId);
      // placeable if: no parent in group (root/external cause) OR parent already placed
      const placeable =
        !parentHmacInGroup ||
        (e.causationId !== undefined && placedHmacs.has(e.causationId));
      if (placeable) {
        result.push(e);
        if (e.hmac !== undefined) placedHmacs.add(e.hmac);
        progress = true;
      } else {
        nextRemaining.push(e);
      }
    }
    remaining = nextRemaining;
  }

  // Append any remaining events (cycle or unresolvable causation) in original order.
  result.push(...remaining);
  return result;
}

/**
 * Group events by their `actor` field.
 * Returns a Map<actor, AuditEvent[]>. Events with an empty/missing actor
 * are grouped under the empty string key. Empty input → empty Map.
 */
export function groupByActor(events: AuditEvent[]): Map<string, AuditEvent[]> {
  const map = new Map<string, AuditEvent[]>();
  for (const e of events) {
    const key = typeof e.actor === 'string' ? e.actor : '';
    const bucket = map.get(key);
    if (bucket !== undefined) {
      bucket.push(e);
    } else {
      map.set(key, [e]);
    }
  }
  return map;
}
