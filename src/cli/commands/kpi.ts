/**
 * `deckent kpi` — Sprint KPI scorecard (KPI Faz-1, Sprint 330 Task 9)
 *
 * Joins the 8 built-in KPI definitions with their computed sprint results
 * (rollup or live-computed via the SSOT evaluator) and renders them as either
 * an i18n table (default) or machine-readable JSON (`--json`).
 *
 *   deckent kpi                  → scorecard for the current sprint
 *   deckent kpi --sprint <id>    → scorecard for a specific sprint
 *   deckent kpi --json           → { sprintId, kpis: [...] }
 *
 * Current-sprint resolution reuses the status-command source of truth
 * (`getCurrentSprintId` → .deckent/sprint-active.json → sprint-state.json) —
 * no fabricated sprint source. KPI data lives in `.brain/memory.db`, the same
 * store the sprint-finalizer hook (Task 8) writes measurements into.
 *
 * i18n-first: every user-visible string flows through getMessage / def.title[lang].
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Command } from 'commander';
import { print, formatTable } from '../helpers/output.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { loadConfig } from '../../core/config.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { getCurrentSprintId } from '../../monitor/sprint-state.js';
import { KpiService } from '../../core/kpi/kpi-service.js';
import type { KpiView } from '../../core/kpi/kpi-service.js';
import { loadKpiDefinitions } from '../../core/kpi/kpi-definitions.js';
import type { KpiDefinitionSpec } from '../../core/kpi/kpi-definitions.js';
import type { ResultRow } from '../../core/kpi/kpi-store.js';
import type { KpiFormat } from '../../core/kpi/types.js';

// ─── Value formatting (exported — reused by the retro scorecard, Task 10) ─────

/**
 * Format a numeric KPI value for display according to its declared format.
 *
 *   currency → `$x.xx`              (e.g. 7      → "$7.00")
 *   percent  → `x.x%`  (ratio 0..1) (e.g. 0.755 → "75.5%")
 *   duration → `x.xs`  (seconds)    (e.g. 12.4  → "12.4s")
 *   number   → locale-grouped       (e.g. 50000 → "50,000")
 *   null     → `—`                  (no measurement data)
 *
 * The 'en-US' locale is fixed (not lang-derived): the signature carries no
 * language and Node 24 ships full ICU, so this is deterministic across hosts.
 */
export function formatKpiValue(value: number | null, format: KpiFormat): string {
  if (value === null) return '—';
  switch (format) {
    case 'currency':
      return `$${value.toFixed(2)}`;
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    case 'duration':
      return `${value.toFixed(1)}s`;
    case 'number':
    default:
      return value.toLocaleString('en-US');
  }
}

// ─── Direction arrow (lower-is-better ↓ / higher-is-better ↑) ──────────────────

function directionArrow(direction: 'up' | 'down'): string {
  return direction === 'down' ? '↓' : '↑';
}

// ─── Trend rendering ──────────────────────────────────────────────────────────

/**
 * Render `KpiService.getTrend()` results as JSON or a table.
 *
 * Column headers reuse existing kpi.* message keys.
 * "Sprint" as the period column label is a language-neutral technical term
 * (used as-is in Turkish throughout the codebase — e.g. `status.sprint_active`).
 */
function renderTrend(
  kpiId: string,
  series: ResultRow[],
  def: KpiDefinitionSpec | undefined,
  lang: string,
  jsonMode: boolean,
): void {
  if (jsonMode) {
    print(JSON.stringify({
      kpiId,
      series: series.map(r => ({
        periodKey: r.periodKey,
        value: r.value,
        status: r.status,
      })),
    }, null, 2));
    return;
  }

  if (series.length === 0) {
    print(getMessage('kpi.no_data', lang, { sprint: kpiId }));
    return;
  }

  const title = def
    ? (lang === 'tr' ? def.title.tr : def.title.en)
    : kpiId;
  print(getMessage('kpi.title', lang, { sprint: title }));
  print('');

  const headers = [
    'Sprint',
    getMessage('kpi.header_value', lang),
    getMessage('kpi.header_target', lang),
    getMessage('kpi.header_status', lang),
  ];

  const rows = series.map(r => {
    const formatted = def
      ? `${formatKpiValue(r.value, def.format)} ${directionArrow(def.direction)}`
      : String(r.value);
    const target = def
      ? formatKpiValue(r.target, def.format)
      : (r.target !== null ? String(r.target) : '—');
    return [r.periodKey, formatted, target, r.status];
  });

  print(formatTable(headers, rows));
}

// ─── Command options + injectable deps ────────────────────────────────────────

export interface KpiCommandOptions {
  sprint?: string;
  /** --trend <kpiId>: render trend series instead of the scorecard. */
  trend?: string;
  /** --n <count>: number of sprints to include in the trend (default 10). */
  n?: string | number;
  json?: boolean;
}

export interface KpiDeps {
  /** Resolve the active sprint id when `--sprint` is omitted. */
  currentSprintFn?: (root: string) => string | null;
  /** Read the effective UI language from config. */
  configFn?: (root: string) => Promise<{ language?: string }>;
  /** Override the DB path (for hermetic tests). Defaults to <root>/.brain/memory.db. */
  dbPathFn?: (root: string) => string;
}

async function defaultConfigFn(root: string): Promise<{ language?: string }> {
  const cfg = await loadConfig(root).catch(() => ({ language: 'en' as const }));
  return { language: (cfg as Record<string, unknown>)['language'] as string | undefined };
}

// ─── Run command ──────────────────────────────────────────────────────────────

export async function runKpiCommand(
  options: KpiCommandOptions,
  deps: KpiDeps = {},
): Promise<void> {
  const root = resolveProjectRoot();
  const configFn = deps.configFn ?? defaultConfigFn;
  const currentSprintFn = deps.currentSprintFn ?? getCurrentSprintId;
  const dbPathFn = deps.dbPathFn ?? ((r: string) => join(r, BRAIN_DIR, MEMORY_DB_FILE));

  const cfg = await configFn(root);
  const lang = getLanguage(cfg.language);

  const dbPath = dbPathFn(root);

  // ─── Trend mode ─────────────────────────────────────────────────────────
  if (options.trend) {
    const kpiId = options.trend;
    const n = Math.max(1, parseInt(String(options.n ?? 10), 10) || 10);
    const defs = loadKpiDefinitions();
    const def = defs.find(d => d.id === kpiId);

    if (!existsSync(dbPath)) {
      renderTrend(kpiId, [], def, lang, options.json ?? false);
      return;
    }

    const svc = new KpiService(dbPath);
    let series: ResultRow[] = [];
    try {
      series = svc.getTrend(kpiId, n);
    } finally {
      svc.close();
    }
    renderTrend(kpiId, series, def, lang, options.json ?? false);
    return;
  }

  // ─── Scorecard mode ──────────────────────────────────────────────────────
  const sprintId = options.sprint ?? currentSprintFn(root);

  // No active sprint, or no KPI store yet → no data (never create the DB as a
  // side effect of a read-only command).
  if (!sprintId || !existsSync(dbPath)) {
    if (options.json) {
      print(JSON.stringify({ sprintId: sprintId ?? null, kpis: [] }, null, 2));
    } else {
      print(getMessage('kpi.no_data', lang, { sprint: sprintId ?? '—' }));
    }
    return;
  }

  let views: KpiView[];
  const service = new KpiService(dbPath);
  try {
    views = service.listSprintViews(sprintId);
  } finally {
    service.close();
  }

  // ─── JSON mode ────────────────────────────────────────────────────
  if (options.json) {
    const kpis = views.map(({ definition: def, result }) => ({
      id: def.id,
      title: lang === 'tr' ? def.title.tr : def.title.en,
      value: result?.value ?? null,
      formatted: formatKpiValue(result?.value ?? null, def.format),
      target: def.target ?? result?.target ?? null,
      status: result?.status ?? 'unknown',
      direction: def.direction,
      format: def.format,
      unit: def.unit,
    }));
    print(JSON.stringify({ sprintId, kpis }, null, 2));
    return;
  }

  // ─── Table mode ───────────────────────────────────────────────────
  if (views.length === 0) {
    print(getMessage('kpi.no_data', lang, { sprint: sprintId }));
    return;
  }

  print(getMessage('kpi.title', lang, { sprint: sprintId }));
  print('');

  const headers = [
    getMessage('kpi.header_kpi', lang),
    getMessage('kpi.header_value', lang),
    getMessage('kpi.header_target', lang),
    getMessage('kpi.header_status', lang),
  ];

  const rows = views.map(({ definition: def, result }) => {
    const value = result?.value ?? null;
    const target = def.target ?? result?.target ?? null;
    return [
      lang === 'tr' ? def.title.tr : def.title.en,
      `${formatKpiValue(value, def.format)} ${directionArrow(def.direction)}`,
      formatKpiValue(target, def.format),
      result?.status ?? 'unknown',
    ];
  });

  print(formatTable(headers, rows));
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerKpi(program: Command): void {
  program
    .command('kpi')
    .description('Show the KPI scorecard for the current (or a specific) sprint')
    .option('--sprint <id>', 'Sprint id to score (defaults to the current sprint)')
    .option('--trend <kpiId>', 'Show trend series for a specific KPI')
    .option('-n, --n <count>', 'Number of sprints to include in the trend (default 10)')
    .option('--json', 'Output raw JSON')
    .action(async (opts) => {
      await runKpiCommand(opts);
    });
}
