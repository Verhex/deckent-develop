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

// ─── Command options + injectable deps ────────────────────────────────────────

export interface KpiCommandOptions {
  sprint?: string;
  json?: boolean;
}

export interface KpiDeps {
  /** Resolve the active sprint id when `--sprint` is omitted. */
  currentSprintFn?: (root: string) => string | null;
  /** Read the effective UI language from config. */
  configFn?: (root: string) => Promise<{ language?: string }>;
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

  const cfg = await configFn(root);
  const lang = getLanguage(cfg.language);

  const sprintId = options.sprint ?? currentSprintFn(root);
  const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);

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
    .option('--json', 'Output raw JSON')
    .action(async (opts) => {
      await runKpiCommand(opts);
    });
}
