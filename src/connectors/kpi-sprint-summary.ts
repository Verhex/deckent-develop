// KPI Faz-2 — sprint-end KPI summary formatter for connectors.
//
// Pure, network-zero formatter: converts KpiService.listSprintViews() output
// into a compact connector message (plain text, i18n-clean).
//
// Headline KPIs: cost_per_sprint · token_per_task · no_go_rate · completion_rate.
// Reuses existing kpi.* getMessage keys for labels — messages.ts is NOT edited.
// Caller owns the KpiService instance; this module never opens a DB.

import type { KpiView } from '../core/kpi/kpi-service.js';
import { formatKpiValue } from '../cli/commands/kpi.js';
import { getMessage } from '../cli/helpers/messages.js';

// ─── Headline KPI ids (ordered for display) ──────────────────────────────────

const HEADLINE_KPI_IDS = [
  'cost_per_sprint',
  'token_per_task',
  'no_go_rate',
  'completion_rate',
] as const;

// ─── Status emoji (direction-neutral visual cue for connectors) ───────────────

const STATUS_EMOJI: Record<string, string> = {
  healthy: '✅',
  warning: '⚠️',
  critical: '🚨',
  unknown: '❓',
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a compact KPI summary string suitable for connector broadcast
 * (Telegram / Discord / WhatsApp).
 *
 * @param views    Output of `KpiService.listSprintViews(sprintId)`.
 * @param lang     UI language: 'en' or 'tr' (any other value → 'en').
 * @param sprintId Sprint identifier used in the title and no-data fallback.
 * @returns        Plain-text summary string; never throws.
 */
export function buildKpiSprintSummary(
  views: KpiView[],
  lang: string,
  sprintId: string,
): string {
  const headline = views.filter((v) => HEADLINE_KPI_IDS.includes(v.definition.id as typeof HEADLINE_KPI_IDS[number]));

  if (headline.length === 0) {
    return getMessage('kpi.no_data', lang, { sprint: sprintId });
  }

  const title = getMessage('kpi.title', lang, { sprint: sprintId });
  const statusHeader = getMessage('kpi.header_status', lang);
  const lines: string[] = [`📊 ${title}`, ''];

  for (const view of headline) {
    const kpiName = lang === 'tr' ? view.definition.title.tr : view.definition.title.en;
    const value = view.result !== null ? view.result.value : null;
    const formatted = formatKpiValue(value, view.definition.format);
    const direction = view.definition.direction === 'down' ? '↓' : '↑';
    const status = view.result?.status ?? 'unknown';
    const emoji = STATUS_EMOJI[status] ?? '❓';
    lines.push(`${kpiName}: ${formatted} ${direction} ${emoji}`);
  }

  // Append a brief status summary line using the existing header key.
  const statuses = headline
    .map((v) => v.result?.status ?? 'unknown')
    .filter((s) => s !== 'healthy' && s !== 'unknown');
  if (statuses.length > 0) {
    const worst = statuses.includes('critical') ? 'critical' : 'warning';
    const emoji = STATUS_EMOJI[worst] ?? '';
    lines.push('');
    lines.push(`${statusHeader}: ${emoji} ${worst}`);
  }

  return lines.join('\n');
}
