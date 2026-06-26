// ─── KPI Scorecard — retro markdown renderer ──────────────────────────────────
// Renders a compact "KPI Scorecard" markdown table for the sprint retrospective
// (spec §10 Surfaces → Retro). Pure module: no I/O, no network — it consumes the
// already-joined KpiView[] (definition + computed result) and emits markdown.
//
// i18n: every user-visible label is language-aware. KPI titles already carry
// {en, tr} in their definition (kpi-definitions.ts); the three fixed column
// headers are resolved from a local en/tr map keyed by `lang`. This module does
// NOT import `getMessage` (src/cli/helpers/messages.ts) — that would be a
// core→cli dependency and violate ADR-008 (core must never import upper layers).
//
// ─── ADR-008 note on `formatKpiValue` ────────────────────────────────────────
// The plan asked Task 10 to "import formatKpiValue from Task 9
// (src/cli/commands/kpi.ts)". Importing a CLI module into `src/core/kpi/` would
// invert the dependency direction (core→cli) — the exact class of violation
// tracked as CORE-W1 under ADR-008. The KPI value formatter is a genuine *core*
// concern, so its canonical home is here; the CLI command can import it FROM
// core (cli→core is the allowed direction). It is therefore implemented and
// exported here, with the same display semantics the spec prescribes.

import type { KpiView } from './kpi-service.js';
import type { KpiFormat } from './types.js';

// ─── Public types ─────────────────────────────────────────────────────────────

/** Supported render languages — mirrors the {en, tr} shape of KPI titles. */
export type ScorecardLang = 'en' | 'tr';

// ─── Localized column headers ─────────────────────────────────────────────────
// Three fixed headers (the KPI title column itself is filled from def.title[lang]).
const HEADERS: Record<ScorecardLang, { kpi: string; value: string; target: string; status: string }> = {
  en: { kpi: 'KPI', value: 'Value', target: 'Target', status: 'Status' },
  tr: { kpi: 'KPI', value: 'Değer', target: 'Hedef', status: 'Durum' },
};

/** BCP-47 locale used for `number`-format value localization. */
const NUMBER_LOCALE: Record<ScorecardLang, string> = { en: 'en-US', tr: 'tr-TR' };

// ─── Value formatting ─────────────────────────────────────────────────────────

/**
 * Format a computed KPI value for display, honoring its declared format.
 *
 * - `null` / `undefined`  → `—` (no data / division-by-zero, spec §11).
 * - `currency`            → `$x.xx` (2 decimals).
 * - `percent`             → `x.x%`  (ratio ×100, 1 decimal).
 * - `number`              → locale-grouped number (lang-aware).
 * - `duration`            → `x.xs` (seconds, 1 decimal) — matches the Task 9 CLI
 *                           formatter byte-for-byte so the two never drift (no
 *                           Phase-1 KPI uses `duration` yet, so this is inert today).
 *
 * Exported as the canonical core formatter (see ADR-008 note in the file header).
 */
export function formatKpiValue(
  value: number | null | undefined,
  format: KpiFormat,
  lang: ScorecardLang = 'en',
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';

  switch (format) {
    case 'currency':
      return `$${value.toFixed(2)}`;
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    case 'duration':
      return `${value.toFixed(1)}s`;
    case 'number':
    default:
      // `number` + exhaustiveness guard — a new KpiFormat falls back to a locale number.
      return value.toLocaleString(NUMBER_LOCALE[lang]);
  }
}

// ─── Scorecard renderer ───────────────────────────────────────────────────────

/**
 * Render the "KPI Scorecard" retro section as a markdown table.
 *
 * Only KPIs that have a computed result (data present this sprint) are shown —
 * KPIs without data are omitted rather than rendered as all-`—` noise. When no
 * KPI has data (or `views` is empty), returns `''` so the caller suppresses the
 * section entirely (graceful-empty, matching the rest of the retro renderer).
 *
 * Pure: no I/O. The heading mirrors `formatRubricScoresSection`'s
 * `### Quality Dimensions (<sprint>)` style so the retro reads consistently.
 *
 * @param sprintId  Canonical sprint id (e.g. `sprint-330`) — shown in the heading.
 * @param views     KpiView[] from `KpiService.listSprintViews(sprintId)`.
 * @param lang      Render language (default `'en'`, matching the retro).
 */
export function renderScorecardMarkdown(
  sprintId: string,
  views: readonly KpiView[],
  lang: ScorecardLang = 'en',
): string {
  const withData = views.filter(v => v.result !== null);
  if (withData.length === 0) return '';

  const h = HEADERS[lang];
  const lines: string[] = [];

  lines.push(`### KPI Scorecard (${sprintId})`);
  lines.push(`| ${h.kpi} | ${h.value} | ${h.target} | ${h.status} |`);
  lines.push('|-----|-------|--------|--------|');

  for (const view of withData) {
    const def = view.definition;
    // withData guarantees result is non-null.
    const result = view.result!;
    const title = def.title[lang];
    const value = formatKpiValue(result.value, def.format, lang);
    const target = formatKpiValue(result.target, def.format, lang);
    lines.push(`| ${title} | ${value} | ${target} | ${result.status} |`);
  }

  return lines.join('\n');
}
