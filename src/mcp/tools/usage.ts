/**
 * deckent_usage MCP tool — token/limit consumption view (ADR-022 parity with `deckent usage` CLI)
 *
 * Wraps the same core functions as the CLI command:
 *   parseTranscriptUsage → limit-ledger ground-truth
 *   summarizeSprint + evaluateCacheGate → limit-ledger-report sprint aggregation
 *
 * Injectable deps for hermetic tests — never reads ~/.claude in tests.
 *
 * Sprint 275 Task 275-003
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { parseTranscriptUsage, limitCost } from '../../core/limit-ledger.js';
import type { UsageRecord, LedgerOpts, LedgerPrices } from '../../core/limit-ledger.js';
import { summarizeSprint, evaluateCacheGate, buildTranscriptTaskMap } from '../../core/limit-ledger-report.js';
import { buildLedgerPrices } from '../../core/cost-config-loader.js';
import { aggregateLineageUsageAuthority } from '../../core/lineage-usage-authority.js';
import type {
  LineageUsageAuthorityAggregate,
  LineageUsageAuthorityInput,
} from '../../core/lineage-usage-authority.js';

// ─── Injectable deps ────────────────────────────────────────────────────────

export interface UsageToolDeps {
  parseFn?: (opts: LedgerOpts) => Promise<UsageRecord[]>;
  buildTaskMapFn?: (opts: LedgerOpts) => Promise<Record<string, string>>;
  pricesFn?: () => LedgerPrices;
}

// Task-map builder shared with the CLI/retro/cost-guard consumers
// (core/limit-ledger-report.ts) — was a third local copy of the same scan.
const defaultBuildTaskMap = buildTranscriptTaskMap;

interface ModelSummary {
  model: string;
  calls: number;
  in: number;
  out: number;
  cacheRead: number;
  cacheWrite: number;
  limitCost: number;
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
      limitCost: limitCost(recs, prices),
      hitRate: totalIn + totalCr > 0 ? totalCr / (totalIn + totalCr) : 0,
    });
  }
  return out.sort((a, b) => b.limitCost - a.limitCost);
}

// ─── Lineage projection (ADR quality-bar: no independent MCP-side inference) ──
//
// This is a direct passthrough to the canonical aggregator in
// core/lineage-usage-authority.ts (486-004). It exists so MCP never grows its
// own copy of the billing/denominator math — every field (logical root,
// billing mode, token denominators, reference cost, typed billed USD) is
// projected exactly as the shared authority computed it.

const lineageBillingAuthoritySchema = z.enum([
  'metered',
  'subscription',
  'local',
  'free-tier',
  'unknown',
  'hybrid',
]);

const lineageTaskSchema = z.object({
  id: z.string(),
  billingAuthority: lineageBillingAuthoritySchema,
});

const lineageAttemptSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  fixForTaskId: z.string().optional(),
  logicalRootTaskId: z.string().optional(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheCreationTokens: z.number(),
  referenceCostUsd: z.number(),
  invoicedCostUsd: z.number().optional(),
});

const lineageInputSchema = z.object({
  tasks: z.array(lineageTaskSchema),
  attempts: z.array(lineageAttemptSchema),
});

export function projectUsageLineage(
  input: LineageUsageAuthorityInput,
): readonly LineageUsageAuthorityAggregate[] {
  return aggregateLineageUsageAuthority(input);
}

// ─── Core function (exported for tests) ─────────────────────────────────────

export interface UsageResult {
  models?: ModelSummary[];
  tasks?: unknown[];
  totals?: unknown;
  cacheGate?: unknown;
  message?: string;
  lineage?: readonly LineageUsageAuthorityAggregate[];
}

export async function getUsageData(
  opts: { sprint?: string; since?: string; until?: string },
  deps: UsageToolDeps = {},
): Promise<UsageResult> {
  const parseFn = deps.parseFn ?? parseTranscriptUsage;
  const buildTaskMapFn = deps.buildTaskMapFn ?? defaultBuildTaskMap;
  // Empty prices would zero every cost column (the MCP surface shipped this
  // way in Sprint 275 — every model reported $0; found 2026-06-11). The MCP
  // server runs with cwd = project root, so cost-config resolves from there.
  const prices = deps.pricesFn?.() ?? buildLedgerPrices(process.cwd());

  const ledgerOpts: LedgerOpts = { since: opts.since, until: opts.until };
  const records = await parseFn(ledgerOpts);

  if (records.length === 0) {
    return { message: 'No usage records found for the specified window.' };
  }

  if (opts.sprint) {
    const allTaskMap = await buildTaskMapFn(ledgerOpts);
    const prefix = `${opts.sprint}-`;
    const filteredMap: Record<string, string> = {};
    for (const [sessionFile, taskId] of Object.entries(allTaskMap)) {
      if (taskId.startsWith(prefix)) filteredMap[sessionFile] = taskId;
    }
    const summary = summarizeSprint(records, filteredMap, prices);
    const cacheGate = evaluateCacheGate(records, filteredMap);
    return { ...summary, cacheGate };
  }

  return { models: aggregateByModel(records, prices) };
}

// ─── Tool registration ───────────────────────────────────────────────────────

export function registerUsageTool(server: McpServer): void {
  server.registerTool(
    'deckent_usage',
    {
      title: 'Usage',
      description:
        'Show token/limit consumption from Claude Code transcripts. ' +
        'Default: last-7-day model-level summary (calls, tokens, limit-cost, cache hit%). ' +
        'With sprint: per-task breakdown + cache gate report for that sprint. ' +
        'With lineage: project the canonical logical-root usage/billing aggregate ' +
        '(same authority as core/lineage-usage-authority.ts) for caller-supplied tasks/attempts — ' +
        'no MCP-side billing recalculation.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: z.object({
        sprint: z.string().optional().describe('Sprint number (e.g. "275") — per-task breakdown mode'),
        since: z.string().optional().describe('ISO date window start (e.g. "2026-06-01")'),
        until: z.string().optional().describe('ISO date window end (e.g. "2026-06-10")'),
        lineage: lineageInputSchema.optional()
          .describe('Tasks + attempts to fold into logical-root usage/billing aggregates via the canonical authority'),
      }),
    },
    async ({ sprint, since, until, lineage }) => {
      try {
        if (lineage) {
          const aggregates = projectUsageLineage(lineage);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ lineage: aggregates }, null, 2) }],
          };
        }
        const data = await getUsageData({ sprint, since, until });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error reading usage data: ${err instanceof Error ? err.message : String(err)}`,
          }],
          isError: true,
        };
      }
    },
  );
}
