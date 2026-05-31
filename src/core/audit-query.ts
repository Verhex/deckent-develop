// ═══ Audit Log Query API ════════════════════════════════════════════════
// Read-only query layer over the event stream (src/orchestra/event-stream.ts).
// F4 enterprise foundation — ADR-062 audit-trail + tenant-based filtering.
// Sprint 205 (205-008) — skeleton only: read + filter, no new audit writes.

import { readEvents } from '../orchestra/event-stream.js';
import type { DeckentEvent } from '../orchestra/event-stream.js';
import { can, Permission } from './rbac.js';

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
