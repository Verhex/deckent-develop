// ─── KPI Breach Advisor — threshold-breach advisory for the retro ─────────────
// KPI Faz-2 (Sprint 333 Task 333-003). Surfaces a finalized sprint's KPI
// threshold breaches as a compact, advisory-only retro section.
//
// The rollup engine ALREADY computes a per-KPI health status
// (`rollup-engine.ts` computeStatus → healthy | warning | critical | unknown,
// persisted on `ResultRow.status`); until now that status was only DISPLAYED in
// the scorecard table (cli/commands/kpi.ts + core/kpi/scorecard.ts). This module
// CONSUMES that status verbatim — it NEVER re-computes it (task nogo) — and turns
// every non-healthy KPI into one advisory line so a breached sprint
// (cost_per_sprint / no_go_rate / …) no longer passes silently.
//
// PURE module: no I/O, no network. It consumes the already-joined `KpiView[]`
// (definition + computed result) and emits markdown — exactly the shape and
// contract of the sibling `scorecard.ts` renderer.
//
// ─── i18n / ADR-008 ───────────────────────────────────────────────────────────
// Field labels (Value / Target / Status) MIRROR the existing `kpi.header_value`,
// `kpi.header_target`, `kpi.header_status` message keys (src/cli/helpers/
// messages.ts, en/tr). This module does NOT import `getMessage`: a core→cli
// import would invert the dependency direction and violate ADR-008 (core must
// never import upper layers) — the very constraint `scorecard.ts` documents and
// solves with its local `HEADERS` map. messages.ts is owned by Task 10, so no
// key is added or edited here. The section heading has no existing kpi.* key →
// see the `TODO(phase2)` below.

import type { KpiView } from './kpi-service.js';
import { formatKpiValue, type ScorecardLang } from './scorecard.js';

// ─── Localized field labels ───────────────────────────────────────────────────
// Mirrors the VALUES of kpi.header_value / kpi.header_target / kpi.header_status
// (messages.ts). Kept local because core/ cannot import getMessage (ADR-008);
// identical pattern to scorecard.ts HEADERS.
const LABELS: Record<ScorecardLang, { value: string; target: string; status: string }> = {
  en: { value: 'Value', target: 'Target', status: 'Status' },
  tr: { value: 'Değer', target: 'Hedef', status: 'Durum' },
};

// ─── Breach advisory renderer ─────────────────────────────────────────────────

/**
 * Build the "KPI Breaches" advisory markdown section for a sprint retro.
 *
 * A KPI is a breach when it HAS a computed result and that result's `status` is
 * non-healthy (warning / critical / unknown). A KPI with no data (`result` null)
 * is NOT a breach and is excluded — mirroring the scorecard's data-present
 * filter, so an unmeasured KPI never masquerades as a breach. The `status` is
 * consumed verbatim from the view (NEVER re-computed — task nogo) and rendered
 * raw, exactly as `scorecard.ts` renders it.
 *
 * Each breached KPI becomes one bullet naming its title, formatted value, target
 * and status, with i18n field labels. Order is the deterministic definition
 * order of `views` (the filter preserves input order).
 *
 * Returns `''` when nothing breached (all-healthy / empty / no-data) so the
 * caller suppresses the section entirely — an honest no-op, never a crash.
 *
 * @param views  KpiView[] from `KpiService.listSprintViews(sprintId)`.
 * @param lang   Render language (`'en' | 'tr'`), default `'en'` (matches the retro).
 */
export function buildKpiBreachAdvisory(
  views: readonly KpiView[],
  lang: ScorecardLang = 'en',
): string {
  const breached = views.filter(v => v.result !== null && v.result.status !== 'healthy');
  if (breached.length === 0) return '';

  const l = LABELS[lang];
  const lines: string[] = [];

  // TODO(phase2): i18n the section heading — no kpi.* message key exists yet for
  // "KPI Breaches" (messages.ts is owned by Task 10). The English default mirrors
  // the scorecard heading style (`### KPI Scorecard (...)`).
  lines.push('### KPI Breaches');

  for (const view of breached) {
    const def = view.definition;
    const result = view.result!; // filter guarantees a non-null result
    const title = def.title[lang];
    const value = formatKpiValue(result.value, def.format, lang);
    const target = formatKpiValue(result.target, def.format, lang);
    lines.push(
      `- **${title}** — ${l.value}: ${value} · ${l.target}: ${target} · ${l.status}: ${result.status}`,
    );
  }

  return lines.join('\n');
}
