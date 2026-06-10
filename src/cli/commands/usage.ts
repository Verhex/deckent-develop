/**
 * `deckent usage` — Token/limit consumption view from Claude Code transcripts
 *
 * Default: last-7-day model-level table (calls, in/out/cw tokens, limit-$ equiv, cache hit%)
 * --sprint <N>: per-task breakdown for sprint N (uses limit-ledger-report sprint aggregation)
 * --since/--until: ISO window override
 * --json: machine-readable output
 *
 * Uses transcript-ledger ground-truth (parseTranscriptUsage) — worker self-estimates in
 * .result files are 3-5× lower; this command surfaces the real numbers.
 *
 * F1-TOK Faz 1 — Sprint 273 Task 273-003
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { readdirSync, createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { loadConfig } from '../../core/config.js';
import { parseTranscriptUsage, limitCost } from '../../core/limit-ledger.js';
import type { UsageRecord, LedgerOpts, LedgerPrices } from '../../core/limit-ledger.js';
import { summarizeSprint, extractTaskIdFromStream, evaluateCacheGate } from '../../core/limit-ledger-report.js';
import type { SprintUsageSummary, CacheGateReport } from '../../core/limit-ledger-report.js';
import { loadCostConfig, listEnabledModels } from '../../core/cost-config-loader.js';

// ─── Injectable deps ────────────────────────────────────────────────────────

export interface UsageDeps {
  parseFn?: (opts: LedgerOpts) => Promise<UsageRecord[]>;
  buildTaskMapFn?: (opts: LedgerOpts) => Promise<Record<string, string>>;
  costPricesFn?: (root: string) => LedgerPrices;
  configFn?: (root: string) => Promise<{ language?: string; usage?: { weekly_budget_equiv?: number } }>;
}

// ─── Default I/O helpers ────────────────────────────────────────────────────

function safeReadDir(p: string): string[] {
  try { return readdirSync(p); } catch { return []; }
}

function makeLineReader(filePath: string): AsyncIterable<string> {
  return createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
}

// ─── Build task map (session file → task ID) ─────────────────────────────────

async function defaultBuildTaskMap(opts: LedgerOpts): Promise<Record<string, string>> {
  const root = opts.root ?? join(homedir(), '.claude', 'projects');
  const readDir = opts.readDir ?? safeReadDir;
  const openStream = opts.openStream ?? makeLineReader;

  const map: Record<string, string> = {};
  const projectDirs = readDir(root);

  for (const dirName of projectDirs) {
    if (opts.projectFilter && !opts.projectFilter(dirName)) continue;
    const dirPath = join(root, dirName);
    const files = readDir(dirPath).filter((f) => f.endsWith('.jsonl'));

    for (const fileName of files) {
      const filePath = join(dirPath, fileName);
      try {
        const lines: string[] = [];
        for await (const line of openStream(filePath)) {
          lines.push(line);
          if (lines.length >= 6) break;
        }
        const taskId = extractTaskIdFromStream(lines);
        if (taskId) map[fileName] = taskId;
      } catch {
        // Skip unreadable files
      }
    }
  }

  return map;
}

// ─── Default cost prices builder ─────────────────────────────────────────────

function defaultCostPrices(root: string): LedgerPrices {
  try {
    const config = loadCostConfig(root);
    const models = listEnabledModels(config);
    const prices: LedgerPrices = {};
    for (const { modelId, pricing } of models) {
      const entry = { in: pricing.input_cost_per_token, out: pricing.output_cost_per_token };
      prices[modelId] = entry;
      for (const alias of pricing.deckent_aliases ?? []) {
        prices[alias] = entry;
      }
    }
    return prices;
  } catch {
    return {};
  }
}

// ─── Default config reader ────────────────────────────────────────────────────

async function defaultConfigFn(
  root: string,
): Promise<{ language?: string; usage?: { weekly_budget_equiv?: number } }> {
  // Read language from loadConfig (handles 3-layer merge)
  const cfg = await loadConfig(root).catch(() => ({ language: 'en' as const }));
  // Read usage.weekly_budget_equiv from raw .deckent/config.json (optional extension field)
  let weeklyBudget: number | undefined;
  const rawPath = join(root, '.deckent', 'config.json');
  if (existsSync(rawPath)) {
    try {
      const { readFileSync } = await import('node:fs');
      const raw = JSON.parse(readFileSync(rawPath, 'utf-8')) as Record<string, unknown>;
      const usageSection = raw['usage'] as Record<string, unknown> | undefined;
      const val = usageSection?.['weekly_budget_equiv'];
      if (typeof val === 'number' && val > 0) weeklyBudget = val;
    } catch {
      // ignore — field is optional
    }
  }
  return {
    language: (cfg as Record<string, unknown>)['language'] as string | undefined,
    usage: weeklyBudget !== undefined ? { weekly_budget_equiv: weeklyBudget } : undefined,
  };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtPct(r: number): string {
  return `${Math.round(r * 100)}%`;
}

// ─── Per-model aggregation ────────────────────────────────────────────────────

interface ModelSummary {
  model: string;
  calls: number;
  in: number;
  out: number;
  cacheRead: number;
  cacheWrite: number;
  limitCostVal: number;
  hitRate: number;
}

function aggregateByModel(records: UsageRecord[], prices: LedgerPrices): ModelSummary[] {
  const groups = new Map<string, UsageRecord[]>();
  for (const r of records) {
    let arr = groups.get(r.model);
    if (!arr) { arr = []; groups.set(r.model, arr); }
    arr.push(r);
  }
  const out: ModelSummary[] = [];
  for (const [model, recs] of groups) {
    let totalIn = 0, totalOut = 0, totalCr = 0, totalCw = 0;
    for (const r of recs) {
      totalIn += r.in; totalOut += r.out; totalCr += r.cacheRead; totalCw += r.cacheWrite;
    }
    out.push({
      model,
      calls: recs.length,
      in: totalIn,
      out: totalOut,
      cacheRead: totalCr,
      cacheWrite: totalCw,
      limitCostVal: limitCost(recs, prices),
      hitRate: totalIn + totalCr > 0 ? totalCr / (totalIn + totalCr) : 0,
    });
  }
  return out.sort((a, b) => b.limitCostVal - a.limitCostVal);
}

// ─── Default 7-day window ────────────────────────────────────────────────────

function sevenDaysAgoISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ─── Run command ──────────────────────────────────────────────────────────────

export interface UsageCommandOptions {
  sprint?: string;
  since?: string;
  until?: string;
  json?: boolean;
}

export async function runUsageCommand(
  options: UsageCommandOptions,
  deps: UsageDeps = {},
): Promise<void> {
  const root = resolveProjectRoot();
  const configFn = deps.configFn ?? defaultConfigFn;
  const cfg = await configFn(root);
  const lang = getLanguage(cfg.language);

  const parseFn = deps.parseFn ?? parseTranscriptUsage;
  const costPricesFn = deps.costPricesFn ?? defaultCostPrices;
  const buildTaskMapFn = deps.buildTaskMapFn ?? defaultBuildTaskMap;

  // ─── Window defaults ──────────────────────────────────────────────
  const since = options.since ?? (options.sprint ? undefined : sevenDaysAgoISO());
  const until = options.until;

  const ledgerOpts: LedgerOpts = { since, until };

  // ─── Parse transcripts ────────────────────────────────────────────
  const records = await parseFn(ledgerOpts);

  if (records.length === 0) {
    if (options.json) {
      print('[]');
      return;
    }
    print(getMessage('usage.no_data', lang));
    return;
  }

  const prices = costPricesFn(root);

  // ─── Sprint mode ──────────────────────────────────────────────────
  if (options.sprint) {
    const sprintNum = options.sprint;
    const allTaskMap = await buildTaskMapFn(ledgerOpts);

    // Filter to sprint N tasks only (taskId starts with "{N}-")
    const prefix = `${sprintNum}-`;
    const filteredMap: Record<string, string> = {};
    for (const [sessionFile, taskId] of Object.entries(allTaskMap)) {
      if (taskId.startsWith(prefix)) filteredMap[sessionFile] = taskId;
    }

    const summary: SprintUsageSummary = summarizeSprint(records, filteredMap, prices);
    const cacheGate: CacheGateReport = evaluateCacheGate(records, filteredMap);

    if (options.json) {
      print(JSON.stringify({ ...summary, cacheGate }, null, 2));
      return;
    }

    if (summary.tasks.length === 0) {
      print(getMessage('usage.no_sprint_data', lang, { sprint: sprintNum }));
      return;
    }

    print(getMessage('usage.header_sprint', lang, { sprint: sprintNum }));
    print('');

    const headers = [
      getMessage('usage.col_task', lang),
      getMessage('usage.col_model', lang),
      getMessage('usage.col_calls', lang),
      getMessage('usage.col_output', lang),
      getMessage('usage.col_cw', lang),
      getMessage('usage.col_boot_cw', lang),
      getMessage('usage.col_cost', lang),
    ];

    const rows = summary.tasks.map((t) => [
      t.taskId,
      t.model,
      String(t.calls),
      fmtTokens(t.out),
      fmtTokens(t.cacheWrite),
      fmtTokens(t.bootstrapCw),
      fmtCost(t.limitCost),
    ]);

    // Totals row
    const tot = summary.totals;
    rows.push([
      getMessage('usage.totals', lang),
      '',
      String(tot.calls),
      fmtTokens(tot.out),
      fmtTokens(tot.cacheWrite),
      '',
      fmtCost(tot.limitCost),
    ]);

    print(formatTable(headers, rows));

    // Cache gate line
    print('');
    if (!cacheGate.applicable) {
      print(getMessage('usage.cache_gate_na', lang));
    } else {
      const status = cacheGate.pass ? 'PASS' : 'FAIL';
      const share = Math.round(cacheGate.warmShare * 100).toString();
      const taskId = cacheGate.warmTaskId ?? '?';
      print(getMessage('usage.cache_gate', lang, { status, share, taskId }));
    }
    return;
  }

  // ─── Default window mode ──────────────────────────────────────────
  const modelSummaries = aggregateByModel(records, prices);

  if (options.json) {
    print(JSON.stringify(modelSummaries, null, 2));
    return;
  }

  // Header
  if (since && !until) {
    print(getMessage('usage.header_window', lang, { days: '7' }));
  } else if (since && until) {
    print(getMessage('usage.header_since_until', lang, { since, until }));
  } else {
    print(getMessage('usage.header_window', lang, { days: '7' }));
  }
  print('');

  const headers = [
    getMessage('usage.col_model', lang),
    getMessage('usage.col_calls', lang),
    getMessage('usage.col_input', lang),
    getMessage('usage.col_output', lang),
    getMessage('usage.col_cw', lang),
    getMessage('usage.col_cost', lang),
    getMessage('usage.col_hit_rate', lang),
  ];

  let totalCalls = 0, totalIn = 0, totalOut = 0, totalCw = 0, totalCost = 0, totalCr = 0;
  const rows = modelSummaries.map((m) => {
    totalCalls += m.calls;
    totalIn += m.in;
    totalOut += m.out;
    totalCw += m.cacheWrite;
    totalCr += m.cacheRead;
    totalCost += m.limitCostVal;
    return [
      m.model,
      String(m.calls),
      fmtTokens(m.in),
      fmtTokens(m.out),
      fmtTokens(m.cacheWrite),
      fmtCost(m.limitCostVal),
      fmtPct(m.hitRate),
    ];
  });

  // Totals row
  const totalHitRate = totalIn + totalCr > 0 ? totalCr / (totalIn + totalCr) : 0;
  rows.push([
    getMessage('usage.totals', lang),
    String(totalCalls),
    fmtTokens(totalIn),
    fmtTokens(totalOut),
    fmtTokens(totalCw),
    fmtCost(totalCost),
    fmtPct(totalHitRate),
  ]);

  print(formatTable(headers, rows));

  // Optional weekly budget reference line
  const budgetEquiv = cfg.usage?.weekly_budget_equiv;
  if (typeof budgetEquiv === 'number') {
    print('');
    print(getMessage('usage.budget_ref', lang, { budget: budgetEquiv.toFixed(0) }));
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerUsage(program: Command): void {
  program
    .command('usage')
    .description('Show token/limit consumption from Claude Code transcripts')
    .option('--sprint <N>', 'Show per-task breakdown for sprint N')
    .option('--since <ISO>', 'Window start (ISO date, e.g. 2026-06-01)')
    .option('--until <ISO>', 'Window end (ISO date, e.g. 2026-06-10)')
    .option('--json', 'Output raw JSON')
    .action(async (opts) => {
      await runUsageCommand(opts);
    });
}
