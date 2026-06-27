// ─── KPI API Endpoint ──────────────────────────────────────────────────────────
// GET /api/kpi[?sprint=&tenantId=] — sprint KPI scorecard for the dashboard (Faz-2).
//
// Joins the built-in (+ custom) KPI definitions with their computed sprint results
// via KpiService.listSprintViews (the SSOT evaluator — rollup or live-computed). All
// KPI math is delegated to KpiService; this endpoint only resolves scope + serializes
// (no formula re-implementation).
//
// Tenant scope is ALWAYS server-derived from the authenticated request principal
// (deriveRequestPrincipal over the bearer the upstream auth-gate already verified) —
// never trusted from a client-supplied field. A non-admin caller is hard-scoped to
// its own tenant; the ?tenantId= query param only narrows scope for a verified admin
// (cross-tenant view), so it can never be used to read another tenant's KPIs
// (anti-IDOR — mirrors the /api/autonomous/lineage + /api/enterprise/missions-audit
// A1/A2 lessons: register WITH `req`, derive tenant from the principal).
//
// Fail-safe: no active sprint or no memory.db yet → 200 { sprintId, kpis: [] }
// (honest "no data", never a 500; never creates the DB as a read side effect). A
// tenant whose DB exists but holds no measurements yields the full KPI list with
// null values (honest per-KPI "no data").

import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../core/constants.js';
import { getCurrentSprintId } from '../core/event-stream.js';
import { KpiService } from '../core/kpi/kpi-service.js';
import type { KpiFormat } from '../core/kpi/types.js';
import { deriveRequestPrincipal } from './auth-me-endpoint.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/** One KPI row in the API response — definition metadata joined with its result. */
export interface KpiApiEntry {
  id: string;
  /** i18n title object — the client picks the language (mechanism stays string-free). */
  title: { en: string; tr: string };
  /** Computed value for the period, or null when no measurement data exists. */
  value: number | null;
  /** Performance target (definition target, falling back to the result's target). */
  target: number | null;
  /** Health status: 'healthy' | 'warning' | 'critical' | 'unknown'. */
  status: string;
  /** Whether a higher ('up') or lower ('down') value is better. */
  direction: 'up' | 'down';
  format: KpiFormat;
  unit: string;
}

/** GET /api/kpi response envelope. */
export interface KpiApiResponse {
  /** The scored sprint id, or null when no active sprint could be resolved. */
  sprintId: string | null;
  kpis: KpiApiEntry[];
}

/**
 * Resolve the effective tenant scope from the request principal (anti-IDOR).
 *
 *   - No bearer / static operator → 'default' (matches the `deckent kpi` CLI + host smoke).
 *   - OIDC bearer with a tenant claim → that tenant.
 *   - ?tenantId= override honored ONLY for a verified admin (cross-tenant view); a
 *     non-admin caller is hard-scoped to its own tenant and CANNOT widen scope via the
 *     query param — so it can never read another tenant's KPIs.
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
 * Handle GET /api/kpi[?sprint=&tenantId=]. Returns true when the route matched (and a
 * response was sent), false otherwise so the caller can fall through.
 *
 * `req` MUST be threaded from server.ts so tenant scope derives from the verified
 * bearer (no cross-tenant leak — A1/A2). When omitted, scope safely degrades to
 * 'default' (single-tenant operator / CLI parity).
 */
export function registerKpiEndpoint(
  url: string,
  res: ServerResponse,
  projectRoot: string,
  req?: IncomingMessage,
): boolean {
  const parsed = new URL(url, 'http://localhost');
  if (parsed.pathname !== '/api/kpi') return false;

  const sprintId = parsed.searchParams.get('sprint') ?? getCurrentSprintId(projectRoot);
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);

  // No active sprint, or no KPI store yet → honest empty (never create the DB as a
  // side effect of a read-only request, and never 500 on absent data).
  if (!sprintId || !existsSync(dbPath)) {
    sendJson(res, { sprintId: sprintId ?? null, kpis: [] } satisfies KpiApiResponse);
    return true;
  }

  const tenantId = resolveTenant(req, parsed.searchParams.get('tenantId'));
  const service = new KpiService(dbPath, { tenantId });
  try {
    const kpis: KpiApiEntry[] = service.listSprintViews(sprintId).map(
      ({ definition: def, result }) => ({
        id: def.id,
        title: def.title,
        value: result?.value ?? null,
        target: def.target ?? result?.target ?? null,
        status: result?.status ?? 'unknown',
        direction: def.direction,
        format: def.format,
        unit: def.unit,
      }),
    );
    sendJson(res, { sprintId, kpis } satisfies KpiApiResponse);
  } finally {
    service.close();
  }
  return true;
}
