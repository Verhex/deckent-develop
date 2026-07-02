// ─── Approval History API Endpoint (359-013 APR-HISTORY, Sıra-71) ───────────
// GET /api/approvals/history[?status=&limit=&offset=] — paginated, read-only
// audit trail over ApprovalStore's SETTLED buckets (approved / denied /
// expired). `pending` is deliberately excluded — that live queue is already
// served by GET /api/approvals (356-002); this endpoint is its history/audit
// companion. Same read-only stance as that endpoint (ADR-G-033/ADR-G-020):
// the dashboard observes, it never decides — there is no mutation route here.
//
// NOT wired into server.ts — server.ts is closed for this sprint (task
// scope). Disk-verified call site for whoever wires it next:
//
//   1. import { registerApprovalHistoryRoute } from './approval-history-endpoint.js';
//      — add alongside the other `import { registerXRoute } from './x-endpoint.js'`
//      lines (server.ts ~line 49-64).
//   2. In the GET section, add:
//        if (registerApprovalHistoryRoute(url, res, projectRoot)) return;
//      immediately AFTER the `if (url === '/api/approvals') { ... }` block
//      (server.ts ~line 922-931) and BEFORE the `GET /api/approvals/:id`
//      block (`if (url.startsWith('/api/approvals/')) { ... }`, ~line 935).
//      Ordering matters: the :id block's prefix match
//      (`url.startsWith('/api/approvals/')`) would otherwise swallow
//      `/api/approvals/history` as id="history" (the id regex
//      `/^[a-zA-Z0-9_-]+$/` matches the literal string "history") and 404,
//      never reaching this route.

import type { ServerResponse } from 'node:http';
import { ApprovalStore, type ApprovalStoreEntry } from '../core/approval-store.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, { error: message }, status);
}

/** The 3 SETTLED categories this endpoint serves. `pending` is intentionally
 *  excluded — this is the history view, not the live queue. */
export type ApprovalHistoryCategory = 'approved' | 'denied' | 'expired';

const HISTORY_CATEGORIES: readonly ApprovalHistoryCategory[] = ['approved', 'denied', 'expired'];

/** `status` query filter — the 3 history categories, or `all` (default). */
export type ApprovalHistoryStatusFilter = ApprovalHistoryCategory | 'all';

const STATUS_FILTERS: readonly ApprovalHistoryStatusFilter[] = ['all', ...HISTORY_CATEGORIES];

export const APPROVAL_HISTORY_DEFAULT_LIMIT = 20;
export const APPROVAL_HISTORY_MAX_LIMIT = 100;

/** One flattened, maskedArgs-only row. Same redaction stance as server.ts's
 *  `serializeApprovalEntry` (ADR-G-020): `rawArgsRef` never leaves the store
 *  layer, and the raw arg value itself is not a field on the contract type. */
export interface ApprovalHistoryEntry {
  id: string;
  summary: string;
  scope: string;
  risk: string;
  policy: string;
  maskedArgs: Record<string, unknown> | null;
  category: ApprovalHistoryCategory;
  /** null only for an overdue-but-unswept `expired` entry (no decision file
   *  written yet — see approval-store.ts `categorize`). */
  channel: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  reason: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface ApprovalHistoryPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ApprovalHistoryResponse {
  entries: ApprovalHistoryEntry[];
  pagination: ApprovalHistoryPagination;
}

function serializeHistoryEntry(category: ApprovalHistoryCategory, entry: ApprovalStoreEntry): ApprovalHistoryEntry {
  const { request, decision } = entry;
  return {
    id: request.id,
    summary: request.summary,
    scope: request.scope,
    risk: request.risk,
    policy: request.policy,
    maskedArgs: request.maskedArgs,
    category,
    channel: decision?.channel ?? null,
    decidedBy: decision?.decidedBy ?? null,
    decidedAt: decision?.decidedAt ?? null,
    reason: decision?.reason ?? null,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
  };
}

/** Sort key for most-recent-first ordering. `decidedAt` when the entry
 *  carries a decision; otherwise `expiresAt` — an overdue-unswept `expired`
 *  entry has no decision yet but is still meaningfully ordered by when it
 *  went overdue. */
function sortKey(e: ApprovalHistoryEntry): number {
  return Date.parse(e.decidedAt ?? e.expiresAt);
}

export interface ApprovalHistoryQuery {
  status?: string | null;
  limit?: string | null;
  offset?: string | null;
}

export interface ApprovalHistoryQueryOk {
  ok: true;
  status: ApprovalHistoryStatusFilter;
  limit: number;
  offset: number;
}
export interface ApprovalHistoryQueryErr {
  ok: false;
  message: string;
}
export type ApprovalHistoryQueryResult = ApprovalHistoryQueryOk | ApprovalHistoryQueryErr;

/** Parse + validate the 3 query params. Never throws — a malformed value
 *  yields a discriminated error the HTTP wrapper turns into a 400. */
export function parseApprovalHistoryQuery(query: ApprovalHistoryQuery): ApprovalHistoryQueryResult {
  const rawStatus = query.status ?? 'all';
  if (!STATUS_FILTERS.includes(rawStatus as ApprovalHistoryStatusFilter)) {
    return {
      ok: false,
      message: `Invalid status filter: '${rawStatus}' (expected one of: ${STATUS_FILTERS.join(', ')})`,
    };
  }

  const rawLimit = query.limit ?? String(APPROVAL_HISTORY_DEFAULT_LIMIT);
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > APPROVAL_HISTORY_MAX_LIMIT) {
    return {
      ok: false,
      message: `Invalid limit: '${rawLimit}' (expected an integer 1-${APPROVAL_HISTORY_MAX_LIMIT})`,
    };
  }

  const rawOffset = query.offset ?? '0';
  const offset = Number(rawOffset);
  if (!Number.isInteger(offset) || offset < 0) {
    return { ok: false, message: `Invalid offset: '${rawOffset}' (expected a non-negative integer)` };
  }

  return { ok: true, status: rawStatus as ApprovalHistoryStatusFilter, limit, offset };
}

/**
 * Pure page-builder over an already-constructed {@link ApprovalStore} — the
 * hermetically-testable core (no HTTP, no `ServerResponse`). A test can
 * point an `ApprovalStore` at a tmpdir fixture and call this directly.
 * Sorted most-recent-first, then sliced to `[offset, offset + limit)`.
 */
export function buildApprovalHistoryPage(
  store: ApprovalStore,
  query: { status: ApprovalHistoryStatusFilter; limit: number; offset: number },
): ApprovalHistoryResponse {
  const snapshot = store.load();
  const categories: readonly ApprovalHistoryCategory[] =
    query.status === 'all' ? HISTORY_CATEGORIES : [query.status];

  const all: ApprovalHistoryEntry[] = [];
  for (const category of categories) {
    for (const entry of snapshot[category]) {
      all.push(serializeHistoryEntry(category, entry));
    }
  }
  all.sort((a, b) => sortKey(b) - sortKey(a));

  const total = all.length;
  const page = all.slice(query.offset, query.offset + query.limit);
  return {
    entries: page,
    pagination: {
      total,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + page.length < total,
    },
  };
}

/**
 * Handle GET /api/approvals/history[?status=&limit=&offset=]. Returns `true`
 * when the route matched (and a response was sent), `false` otherwise so the
 * caller can fall through to its other routes. See the wiring note at the
 * top of this file for the exact server.ts call site + why its position
 * (BEFORE the `/api/approvals/:id` block) matters.
 */
export function registerApprovalHistoryRoute(url: string, res: ServerResponse, projectRoot: string): boolean {
  const parsed = new URL(url, 'http://localhost');
  if (parsed.pathname !== '/api/approvals/history') return false;

  const parsedQuery = parseApprovalHistoryQuery({
    status: parsed.searchParams.get('status'),
    limit: parsed.searchParams.get('limit'),
    offset: parsed.searchParams.get('offset'),
  });
  if (!parsedQuery.ok) {
    sendError(res, 400, parsedQuery.message);
    return true;
  }

  const store = new ApprovalStore(projectRoot);
  const response = buildApprovalHistoryPage(store, parsedQuery);
  sendJson(res, response);
  return true;
}
