// KPI Faz-2 — sprint-end KPI summary dispatch wiring.
//
// Bridges the two halves that already exist but were never connected:
//   1. `buildKpiSprintSummary` (kpi-sprint-summary.ts) — pure i18n formatter.
//   2. the `kpiSummaryFn` hook on `makeConnectorNotificationAdapter`
//      (connector-notify-adapter.ts) — invoked, non-blocking, on a `sprint-finalized`
//      notification to broadcast a KPI summary to the messaging connectors.
//
// The only prod adapter-construction path, `buildConnectorNotificationAdapter`
// (connector-bootstrap.ts), neither accepts nor forwards `ConnectorNotifyOptions`,
// Both building blocks it composes —
// `buildConnectorTargets` and `makeConnectorNotificationAdapter` — are exported, so
// this module re-composes them in a thin opts-forwarding wrapper instead. Wiring
// happens at the three clean caller-sites (start / autonomous / sprint-runner-entry),
// never in connector-bootstrap.ts.

import { join } from 'node:path';
import type { NotificationAdapter } from '../core/notification-dispatcher.js';
import type { DeckentConfig } from '../core/types.js';
import { KpiService } from '../core/kpi/kpi-service.js';
import { buildKpiSprintSummary } from './kpi-sprint-summary.js';
import {
  makeConnectorNotificationAdapter,
  type ConnectorNotifyOptions,
} from './connector-notify-adapter.js';
import { buildConnectorTargets, type ConnectorBootstrapDeps } from './connector-bootstrap.js';

/** A sprint-end KPI summary producer: sprintId → formatted summary, or null when there is no data. */
export type SprintKpiSummaryFn = (sprintId: string) => Promise<string | null>;

/**
 * Build a sprint-end KPI summary closure for connector broadcast.
 *
 * The returned closure is what `ConnectorNotifyOptions.kpiSummaryFn` expects: it is
 * called (non-blocking) after a `sprint-finalized` notification. On each call it opens
 * a fresh `KpiService` over `<root>/.brain/memory.db` (tenant `default`), reads the
 * sprint's headline KPIs, and formats them via the shared `buildKpiSprintSummary`.
 *
 * Contract (honest no-op, never throws):
 *   - Returns `null` when the sprint has no KPI data (fresh/missing DB, unknown sprint,
 *     or every headline KPI is unmeasured) — so connectors stay silent instead of
 *     broadcasting an empty "no data" line.
 *   - The `KpiService` (and its SQLite handle) is ALWAYS closed in a `finally` block —
 *     a leaked handle would block deletion of memory.db on Windows.
 *   - Any error is swallowed and surfaced as `null`; the connector notify path is
 *     non-blocking and must never be broken by a telemetry read.
 *
 * Construction is cheap and side-effect-free (no DB is opened until the closure runs),
 * so it is safe to build eagerly at adapter-construction time.
 */
export function buildSprintKpiSummaryFn(root: string, lang: string): SprintKpiSummaryFn {
  const dbPath = join(root, '.brain', 'memory.db');
  return async (sprintId: string): Promise<string | null> => {
    let service: KpiService | null = null;
    try {
      service = new KpiService(dbPath, { tenantId: 'default' });
      const views = service.listSprintViews(sprintId);
      // Only broadcast when at least one headline KPI actually has a measured result;
      // otherwise buildKpiSprintSummary would emit placeholder dashes — a noisy no-op.
      const hasData = views.some((v) => v.result !== null);
      if (!hasData) return null;
      const summary = buildKpiSprintSummary(views, lang, sprintId);
      return summary.length > 0 ? summary : null;
    } catch {
      // Honest no-op: a telemetry read must never throw into the non-blocking notify path.
      return null;
    } finally {
      if (service) {
        // Windows handle-guard: release the SQLite connection even on the error path.
        try {
          service.close();
        } catch {
          // Closing an already-closed / never-opened store is a no-op we ignore.
        }
      }
    }
  };
}

/**
 * Build a connector NotificationAdapter that ALSO forwards `ConnectorNotifyOptions`
 * (notably `kpiSummaryFn`) to the underlying adapter.
 *
 * This mirrors `buildConnectorNotificationAdapter` (connector-bootstrap.ts) but adds the
 * opts-forwarding that function lacks. Behaviour is
 * byte-for-byte identical when no connectors are configured: `buildConnectorTargets`
 * returns an empty list → this returns `null`, so the default (no-notify) path is
 * unchanged and the `kpiSummaryFn` is never invoked.
 *
 * @param notifyConnectors  config.notify_connectors (undefined → no connectors → null).
 * @param opts              forwarded to makeConnectorNotificationAdapter (e.g. kpiSummaryFn).
 * @param deps              optional bootstrap deps (test connector injection).
 */
export async function buildConnectorAdapterWithKpiSummary(
  notifyConnectors: DeckentConfig['notify_connectors'],
  opts: ConnectorNotifyOptions = {},
  deps: ConnectorBootstrapDeps = {},
): Promise<NotificationAdapter | null> {
  const targets = await buildConnectorTargets(notifyConnectors, deps);
  if (targets.length === 0) return null;
  return makeConnectorNotificationAdapter(targets, opts);
}
