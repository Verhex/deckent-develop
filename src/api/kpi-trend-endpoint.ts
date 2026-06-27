// ─── KPI Trend API Endpoint ──────────────────────────────────────────────────────
// GET /api/kpi/trend?kpiId=&n=&tenantId= — the last `n` sprint-grain results for one
// KPI, ordered old→new (Faz-2 trend surface; sibling of the /api/kpi scorecard).
//
// All trend math is delegated to KpiService.getTrend (the cross-period SSOT reader) —
// this endpoint only resolves scope, validates the query, and serializes. No formula
// re-implementation here.
//
// Tenant scope is ALWAYS server-derived from the authenticated request principal
// (deriveRequestPrincipal over the bearer the upstream auth-gate already verified) —
// never trusted from a client-supplied field. A non-admin caller is hard-scoped to its
// own tenant; the ?tenantId= query param only narrows scope for a verified admin
// (cross-tenant view), so it can never be used to read another tenant's trend
// (anti-IDOR — mirrors the /api/kpi + /api/autonomous/lineage A1/A2 lessons: register
// WITH `req`, derive tenant from the principal).
//
// Fail-safe: empty/absent kpiId, an unknown kpiId, or no memory.db yet → 200
// { kpiId, series: [] } (honest "no data", never a 500; never creates the DB as a
// read side effect).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../core/constants.js';
import { KpiService } from '../core/kpi/kpi-service.js';
import { deriveRequestPrincipal } from './auth-me-endpoint.js';

/** Default trend window (sprint-grain periods) when `?n=` is absent/invalid. */
const DEFAULT_N = 12;
/** Hard cap on the trend window so a hostile `?n=` can't request an unbounded scan. */
const MAX_N = 100;

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/** One point on a KPI trend line — value + health status for a single period. */
export interface KpiTrendPoint {
  /** Period identifier (sprint id for sprint-grain), ordered old→new across the series. */
  periodKey: string;
  /** Computed KPI value for the period. */
  value: number;
  /** Health status: 'healthy' | 'warning' | 'critical' | 'unknown'. */
  status: string;
}

/** GET /api/kpi/trend response envelope. */
export interface KpiTrendResponse {
  /** The KPI whose trend was requested (echoed back; '' when none was supplied). */
  kpiId: string;
  /** Trend points ordered old→new; empty when there is no data for (tenant, kpiId). */
  series: KpiTrendPoint[];
}

/**
 * Resolve the effective tenant scope from the request principal (anti-IDOR).
 *
 *   - No bearer / static operator → 'default' (matches the `deckent kpi` CLI + host smoke).
 *   - OIDC bearer with a tenant claim → that tenant.
 *   - ?tenantId= override honored ONLY for a verified admin (cross-tenant view); a
 *     non-admin caller is hard-scoped to its own tenant and CANNOT widen scope via the
 *     query param — so it can never read another tenant's trend.
 *
 * Mirrors kpi-endpoint.ts#resolveTenant verbatim; replicated (not imported) because that
 * helper is module-private and this task's scope forbids touching kpi-endpoint.ts.
 */
function resolveTenant(
  req: IncomingMessage | undefined,
  requestedTenant: string | null,
): string {
  if (!req) return 'default';
  const principal = deriveRequestPrincipal(req);
  const callerTenant = principal.tenantId ?? 'default';
  if (principal.role === 'admin' && requestedTenant) return requestedTenant;
  return callerTenant;
}

/**
 * Parse the `?n=` window. A positive integer in [1, MAX_N]; anything missing, non-numeric,
 * or out of range falls back to DEFAULT_N (a negative/NaN value reaching SQLite's `LIMIT ?`
 * would otherwise mean "unbounded" or throw).
 */
function parseWindow(raw: string | null): number {
  if (raw === null) return DEFAULT_N;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_N;
  return Math.min(n, MAX_N);
}

/**
 * Handle GET /api/kpi/trend?kpiId=&n=&tenantId=. Returns true when the route matched (and
 * a response was sent), false otherwise so the caller can fall through.
 *
 * `req` MUST be threaded from server.ts so tenant scope derives from the verified bearer
 * (no cross-tenant leak — A1/A2). When omitted, scope safely degrades to 'default'
 * (single-tenant operator / CLI parity).
 */
export function registerKpiTrendEndpoint(
  url: string,
  res: ServerResponse,
  projectRoot: string,
  req?: IncomingMessage,
): boolean {
  const parsed = new URL(url, 'http://localhost');
  if (parsed.pathname !== '/api/kpi/trend') return false;

  const kpiId = parsed.searchParams.get('kpiId') ?? '';
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);

  // No KPI requested, or no KPI store yet → honest empty (never create the DB as a side
  // effect of a read-only request, and never 500 on absent data).
  if (!kpiId || !existsSync(dbPath)) {
    sendJson(res, { kpiId, series: [] } satisfies KpiTrendResponse);
    return true;
  }

  const n = parseWindow(parsed.searchParams.get('n'));
  const tenantId = resolveTenant(req, parsed.searchParams.get('tenantId'));
  const service = new KpiService(dbPath, { tenantId });
  try {
    const series: KpiTrendPoint[] = service.getTrend(kpiId, n).map((r) => ({
      periodKey: r.periodKey,
      value: r.value,
      status: r.status,
    }));
    sendJson(res, { kpiId, series } satisfies KpiTrendResponse);
  } finally {
    service.close();
  }
  return true;
}
