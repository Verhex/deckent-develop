// autonomous-endpoint.ts — HTTP routes for the dashboard AutonomousPage (W6-W7).
// GET  /api/autonomous/status        → { pendingCount, backlogSummary, recentAudit }
// GET  /api/autonomous/pending       → PendingApproval[] (triggerId/action/requestedBy/enqueuedAt)
// GET  /api/autonomous/backlog       → BacklogEntry[] (id/title/kind/status/policy/trigger/lastRun)
// POST /api/autonomous/approve/<id>  → gate.accept(triggerId) → decisions.json
// POST /api/autonomous/reject/<id>   → gate.reject(triggerId) → decisions.json
//
// Mirrors nervous-endpoint.ts so the two dashboard pages share one shape. Reuses
// the durable autonomous artifacts (approval-adapter gate + backlog) — no engine
// boot. Fail-safe: a missing/corrupt backlog or pending file degrades to empty,
// never a 500.
//
// ENT-2: when `req` + `opts.strictTenantIsolation` are provided, the backlog
// endpoint filters entries by the caller's tenantId (derived server-side from the
// bearer via deriveRequestPrincipal — never from client-supplied fields).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolveApiCallerTenant } from './tenant-scope.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeApprovalGate } from '../orchestra/autonomous/approval-adapter.js';
import { loadBacklog } from '../orchestra/autonomous/backlog.js';
import type { BacklogEntry } from '../orchestra/autonomous/backlog-types.js';
import { deriveRequestPrincipal } from './auth-me-endpoint.js';
import { readAuditEventsByCorrelationId, buildCausalChain } from '../core/audit-query.js';

/** Options for ENT-2 tenant isolation on the autonomous backlog endpoint. */
export interface AutonomousRouteOptions {
  /**
   * When true, GET /api/autonomous/backlog filters entries by the caller's
   * tenantId (derived from the bearer on `req`). Mirrors `strict_tenant_isolation`
   * in ResolvedConfig. Default false → all entries (backward-compat).
   */
  strictTenantIsolation?: boolean;
}

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function pendingPath(root: string): string {
  return join(root, '.deckent', 'autonomous', 'pending.json');
}
function backlogPath(root: string): string {
  return join(root, '.deckent', 'autonomous', 'backlog.json');
}
function eventsPath(root: string): string {
  return join(root, '.deckent', 'autonomous-events.jsonl');
}

/** Backlog entries, fail-safe ([] on a missing/corrupt file — never a 500). */
function safeBacklog(root: string): BacklogEntry[] {
  try {
    return loadBacklog(backlogPath(root)).entries;
  } catch {
    return [];
  }
}

function backlogSummary(entries: BacklogEntry[]): Record<'total' | 'pending' | 'running' | 'parked' | 'done' | 'failed', number> {
  const counts = { total: entries.length, pending: 0, running: 0, parked: 0, done: 0, failed: 0 };
  for (const e of entries) {
    if (e.status in counts) counts[e.status as keyof typeof counts]++;
  }
  return counts;
}

/** Last `n` audit events from the autonomous event stream (fail-safe → []). */
function recentAudit(root: string, n = 5): Array<{ timestamp: string; action: string; outcome: string; reason: string }> {
  const p = eventsPath(root);
  if (!existsSync(p)) return [];
  try {
    const lines = readFileSync(p, 'utf-8').split('\n').filter((l) => l.trim().length > 0);
    const out: Array<{ timestamp: string; action: string; outcome: string; reason: string }> = [];
    for (const line of lines.slice(-n)) {
      try {
        const ev = JSON.parse(line) as { payload?: Record<string, unknown>; timestamp?: string };
        const pl = ev.payload ?? {};
        out.push({
          timestamp: (pl['timestamp'] as string | undefined) ?? ev.timestamp ?? '',
          action: (pl['action'] as string | undefined) ?? '?',
          outcome: (pl['outcome'] as string | undefined) ?? '?',
          reason: (pl['reason'] as string | undefined) ?? '',
        });
      } catch {
        // skip malformed audit line
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Handle autonomous-engine HTTP routes. Returns true when the route matched (and a
 * response was sent), false otherwise so the caller can fall through.
 *
 * ENT-2: pass `req` + `opts.strictTenantIsolation` to enable per-tenant backlog
 * filtering. When absent the endpoint returns all entries (backward-compat).
 */
export function registerAutonomousRoutes(
  url: string,
  method: string,
  res: ServerResponse,
  projectRoot: string,
  req?: IncomingMessage,
  opts?: AutonomousRouteOptions,
): boolean {
  const path = new URL(url, 'http://localhost').pathname;
  if (!path.startsWith('/api/autonomous/')) return false;

  // GET /api/autonomous/lineage/:correlationId (ENT-3 causal-lineage endpoint)
  // Must be checked before the approval/reject prefix matchers to avoid false conflicts.
  if (method === 'GET' && path.startsWith('/api/autonomous/lineage/')) {
    const correlationId = decodeURIComponent(path.slice('/api/autonomous/lineage/'.length));
    if (!correlationId) {
      sendJson(res, { error: 'correlationId is required' }, 400);
      return true;
    }
    const events = readAuditEventsByCorrelationId(projectRoot, 'autonomous', correlationId);
    const chain = buildCausalChain(events, correlationId);

    // ENT-3-SEC: tenant-scope filtering (anti-IDOR, fail-CLOSED).
    // Mirrors the audit-list branch below: a non-admin sees ONLY their own tenant's
    // events (no/unparseable claim → effective tenant 'local'); only a verified-admin
    // (role checked upstream by the bearer auth-gate) sees the full chain. No fail-open
    // "seeAll" path — an unknown/unauthenticated principal is scoped to 'local', never
    // granted cross-tenant visibility. Empty result (200) leaks no existence.
    if (req) {
      const principal = deriveRequestPrincipal(req);
      const tenantScope = resolveApiCallerTenant(principal, projectRoot);
      if (tenantScope.tenant === null) {
        // TENANT-001 T2: strict mode refuses a tenant-less caller instead of
        // folding it into `local` (the NULL-tenant hole). Default-off keeps v1.
        sendJson(res, { error: tenantScope.reason }, 403);
        return true;
      }
      const callerTenant = tenantScope.tenant;
      const isAdmin = principal.role === 'admin';
      const scoped = isAdmin ? chain : chain.filter((e) => (e.tenantId ?? 'local') === callerTenant);
      sendJson(res, { correlationId, events: scoped, totalEvents: scoped.length });
    } else {
      sendJson(res, { correlationId, events: chain, totalEvents: chain.length });
    }
    return true;
  }

  const gate = makeApprovalGate({ pendingPath: pendingPath(projectRoot) });

  // GET /api/autonomous/pending
  if (method === 'GET' && path === '/api/autonomous/pending') {
    sendJson(res, gate.pending().map((p) => ({
      triggerId: p.triggerId,
      action: p.action,
      requestedBy: p.requestedBy,
      enqueuedAt: p.enqueuedAt,
    })));
    return true;
  }

  // GET /api/autonomous/backlog
  if (method === 'GET' && path === '/api/autonomous/backlog') {
    let entries = safeBacklog(projectRoot);
    // ENT-2 tenant isolation: filter when req is available and strict mode is on.
    if (req && opts?.strictTenantIsolation) {
      const principal = deriveRequestPrincipal(req);
      const tenantScope = resolveApiCallerTenant(principal, projectRoot);
      if (tenantScope.tenant === null) {
        // TENANT-001 T2: strict mode refuses a tenant-less caller instead of
        // folding it into `local` (the NULL-tenant hole). Default-off keeps v1.
        sendJson(res, { error: tenantScope.reason }, 403);
        return true;
      }
      const callerTenant = tenantScope.tenant;
      const isAdmin = principal.role === 'admin';
      if (!isAdmin) {
        entries = entries.filter((e) => (e.tenant ?? 'local') === callerTenant);
      }
    }
    sendJson(res, entries.map((e) => ({
      id: e.id,
      title: e.title,
      kind: e.kind,
      status: e.status,
      policy: e.policy,
      trigger: e.trigger,
      lastRun: e.lastRun,
    })));
    return true;
  }

  // GET /api/autonomous/status
  if (method === 'GET' && path === '/api/autonomous/status') {
    const entries = safeBacklog(projectRoot);
    sendJson(res, {
      pendingCount: gate.pending().length,
      backlogSummary: backlogSummary(entries),
      recentAudit: recentAudit(projectRoot),
    });
    return true;
  }

  // POST /api/autonomous/approve/<triggerId>
  if (method === 'POST' && path.startsWith('/api/autonomous/approve/')) {
    const triggerId = decodeURIComponent(path.slice('/api/autonomous/approve/'.length));
    gate.accept(triggerId, 'approved via dashboard');
    sendJson(res, { approved: triggerId });
    return true;
  }

  // POST /api/autonomous/reject/<triggerId>
  if (method === 'POST' && path.startsWith('/api/autonomous/reject/')) {
    const triggerId = decodeURIComponent(path.slice('/api/autonomous/reject/'.length));
    gate.reject(triggerId, 'rejected via dashboard');
    sendJson(res, { rejected: triggerId });
    return true;
  }

  return false;
}
