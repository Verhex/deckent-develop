/**
 * Limit Ledger — Ground-truth token/cost accounting from Claude Code transcripts
 *
 * Reads ~/.claude/projects/<project>/*.jsonl files and extracts real `message.usage` data
 * from API responses. Worker self-estimates in `.result` files are 3-5× lower
 * than ground truth; this module provides the authoritative numbers.
 *
 * Cost formula (reverse-engineered calibration §3 of weekly-limit analysis):
 *   limitCost = in·$in + out·$out + cacheWrite·1.25·$in
 * cacheRead contributes 0 to limit burn (subscription quota not charged for cache reads).
 *
 * Injectable readDir/openStream for hermetic tests — real ~/.claude is never read in tests.
 *
 * F1-TOK Faz 0 — Sprint 273 Task 273-001
 * Source pattern: scripts/token-usage-report.mjs
 */

import { createReadStream, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { createInterface } from 'node:readline';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UsageRecord {
  /** ISO 8601 timestamp from transcript, or null if absent */
  ts: string | null;
  /** Raw model string from API response (e.g. "claude-sonnet-4-6") */
  model: string;
  /** Basename of the .jsonl session file */
  sessionFile: string;
  /** Project directory name under ~/.claude/projects/ */
  projectDir: string;
  /** Input tokens */
  in: number;
  /** Output tokens */
  out: number;
  /** Cache read tokens (prompt cache hit) */
  cacheRead: number;
  /** Cache creation tokens (cache write — 1.25× cost multiplier on limit burn) */
  cacheWrite: number;
}

/**
 * Per-model prices for limitCost.
 * Keys are model IDs as they appear in transcripts (e.g. "claude-sonnet-4-6").
 * Caller resolves aliases via findModel() from cost-config-loader.
 */
export type LedgerPrices = Record<string, { in: number; out: number }>;

export interface LedgerOpts {
  /** Root directory containing project subdirs. Defaults to ~/.claude/projects */
  root?: string;
  /** Injectable: list filenames in a directory (used for both project dirs and .jsonl files) */
  readDir?: (dirPath: string) => string[];
  /** Injectable: open a file path and return async line iterator */
  openStream?: (filePath: string) => AsyncIterable<string>;
  /** ISO date string — include only records with ts >= since */
  since?: string;
  /** ISO date string — include only records with ts <= until */
  until?: string;
  /** Predicate to filter project directory names */
  projectFilter?: (dirName: string) => boolean;
}

// ─── Default I/O helpers ────────────────────────────────────────────────────

function defaultReadDir(dirPath: string): string[] {
  try {
    return readdirSync(dirPath);
  } catch {
    return [];
  }
}

function defaultOpenStream(filePath: string): AsyncIterable<string> {
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });
  return rl;
}

// ─── Core parse ─────────────────────────────────────────────────────────────

/**
 * Parse all Claude Code session transcripts and return deduplicated usage records.
 *
 * Skips:
 * - Lines without both "usage" and "model" substrings (fast pre-filter)
 * - Malformed JSON lines (tolerant — never throws on parse error)
 * - Messages with model === '<synthetic>' or missing model field
 * - Duplicate message IDs (streamed chunks repeat the same usage)
 */
export async function parseTranscriptUsage(opts: LedgerOpts = {}): Promise<UsageRecord[]> {
  const root = opts.root ?? join(homedir(), '.claude', 'projects');
  const readDir = opts.readDir ?? defaultReadDir;
  const openStream = opts.openStream ?? defaultOpenStream;
  const { since, until, projectFilter } = opts;

  const seen = new Set<string>();
  const records: UsageRecord[] = [];

  let projectDirs: string[];
  try {
    projectDirs = readDir(root);
  } catch {
    return [];
  }

  for (const dirName of projectDirs) {
    if (projectFilter && !projectFilter(dirName)) continue;

    const dirPath = join(root, dirName);
    let files: string[];
    try {
      files = readDir(dirPath).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }

    for (const fileName of files) {
      const filePath = join(dirPath, fileName);
      let lineIter: AsyncIterable<string>;
      try {
        lineIter = openStream(filePath);
      } catch {
        continue;
      }

      try {
        for await (const line of lineIter) {
          // Fast pre-filter — avoid JSON.parse on irrelevant lines
          if (!line.includes('"usage"') || !line.includes('"model"')) continue;

          let j: unknown;
          try {
            j = JSON.parse(line);
          } catch {
            // Corrupt line — skip, never throw
            continue;
          }

          if (!j || typeof j !== 'object') continue;
          const rec = j as Record<string, unknown>;

          const msg = rec['message'] as Record<string, unknown> | undefined;
          if (!msg) continue;

          const usage = msg['usage'] as Record<string, unknown> | undefined;
          if (!usage) continue;

          const model = msg['model'];
          if (typeof model !== 'string' || model === '<synthetic>' || !model) continue;

          // Dedupe by message id
          const msgId = (msg['id'] as string | undefined) ?? (rec['uuid'] as string | undefined);
          if (msgId) {
            if (seen.has(msgId)) continue;
            seen.add(msgId);
          }

          const ts = (rec['timestamp'] as string | null | undefined) ?? null;

          // Date window filter
          if (since && ts && ts < since) continue;
          if (until && ts && ts > until) continue;

          records.push({
            ts,
            model,
            sessionFile: basename(fileName),
            projectDir: dirName,
            in: (usage['input_tokens'] as number | undefined) ?? 0,
            out: (usage['output_tokens'] as number | undefined) ?? 0,
            // cacheRead = 0 weight in limitCost formula (subscription quota not charged)
            cacheRead: (usage['cache_read_input_tokens'] as number | undefined) ?? 0,
            cacheWrite: (usage['cache_creation_input_tokens'] as number | undefined) ?? 0,
          });
        }
      } catch {
        // Stream error — skip file, never throw
        continue;
      }
    }
  }

  return records;
}

// ─── Cost calculation ────────────────────────────────────────────────────────

/**
 * Compute limit-equivalent cost from usage records.
 *
 * Formula (reverse-engineered from subscription limit behavior, §3):
 *   cost = in · prices.in + out · prices.out + cacheWrite · 1.25 · prices.in
 *
 * cacheRead contributes 0 — subscription accounts do not burn quota for cache hits.
 *
 * @param records  UsageRecord[] from parseTranscriptUsage
 * @param prices   Per-model per-token prices. Models not present in prices contribute 0.
 *                 Caller maps model IDs to prices via findModel() from cost-config-loader.
 */
export function limitCost(records: UsageRecord[], prices: LedgerPrices): number {
  let total = 0;
  for (const r of records) {
    const p = prices[r.model];
    if (!p) continue;
    total +=
      r.in * p.in +
      r.out * p.out +
      // cacheWrite costs 1.25× input rate; cacheRead = 0 (no limit burn for cache hits)
      r.cacheWrite * 1.25 * p.in;
  }
  return total;
}
