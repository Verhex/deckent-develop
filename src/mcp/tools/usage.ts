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

import { join } from 'node:path';
import { homedir } from 'node:os';
import { createReadStream, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { parseTranscriptUsage, limitCost } from '../../core/limit-ledger.js';
import type { UsageRecord, LedgerOpts, LedgerPrices } from '../../core/limit-ledger.js';
import { summarizeSprint, evaluateCacheGate, extractTaskIdFromStream } from '../../core/limit-ledger-report.js';

// ─── Injectable deps ────────────────────────────────────────────────────────

export interface UsageToolDeps {
  parseFn?: (opts: LedgerOpts) => Promise<UsageRecord[]>;
  buildTaskMapFn?: (opts: LedgerOpts) => Promise<Record<string, string>>;
  pricesFn?: () => LedgerPrices;
}

// ─── Default helpers (same logic as cli/commands/usage.ts) ──────────────────

function safeReadDir(p: string): string[] {
  try { return readdirSync(p); } catch { return []; }
}

function makeLineReader(filePath: string): AsyncIterable<string> {
  return createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
}

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
        // skip unreadable files
      }
    }
  }
  return map;
}

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

// ─── Core function (exported for tests) ─────────────────────────────────────

export interface UsageResult {
  models?: ModelSummary[];
  tasks?: unknown[];
  totals?: unknown;
  cacheGate?: unknown;
  message?: string;
}

export async function getUsageData(
  opts: { sprint?: string; since?: string; until?: string },
  deps: UsageToolDeps = {},
): Promise<UsageResult> {
  const parseFn = deps.parseFn ?? parseTranscriptUsage;
  const buildTaskMapFn = deps.buildTaskMapFn ?? defaultBuildTaskMap;
  const prices = deps.pricesFn?.() ?? {};

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
        'With sprint: per-task breakdown + cache gate report for that sprint.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: z.object({
        sprint: z.string().optional().describe('Sprint number (e.g. "275") — per-task breakdown mode'),
        since: z.string().optional().describe('ISO date window start (e.g. "2026-06-01")'),
        until: z.string().optional().describe('ISO date window end (e.g. "2026-06-10")'),
      }),
    },
    async ({ sprint, since, until }) => {
      try {
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
