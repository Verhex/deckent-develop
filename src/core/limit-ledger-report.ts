/**
 * Limit Ledger Report — Session→Task mapping and sprint aggregation
 *
 * Maps Claude Code session files to task IDs using the `.tasks/task-NNN-NNN.` pattern
 * found in the first user message of each session. Aggregates usage records per task
 * for sprint-level reporting.
 *
 * NOTE on durationMs: task duration is NOT derived from transcript timestamps.
 * Transcript timestamps are unreliable for interrupted/resumed tasks — a task paused
 * and resumed shows the idle gap as active time (analysis §10.1 #5). Callers must
 * provide durationMs from heartbeat data (.hb files) via the optional durationMap.
 *
 * F1-TOK Faz 1 — Sprint 273 Task 273-002
 */

import { limitCost } from './limit-ledger.js';
import type { UsageRecord, LedgerPrices } from './limit-ledger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TaskUsageSummary {
  taskId: string;
  /** Dominant model — the model used for the most API calls in this task */
  model: string;
  calls: number;
  in: number;
  out: number;
  cacheRead: number;
  cacheWrite: number;
  /** First call's cacheWrite — initial context load cost for the task */
  bootstrapCw: number;
  limitCost: number;
  /** Cache hit rate: cacheRead / (in + cacheRead). Range [0, 1]. */
  hitRate: number;
  /**
   * Task wall-clock duration from heartbeat data.
   * Never derived from transcript timestamps (unreliable for interrupted tasks).
   * Present only when caller provides durationMap to summarizeSprint.
   */
  durationMs?: number;
}

export interface SprintUsageSummary {
  tasks: TaskUsageSummary[];
  totals: {
    calls: number;
    in: number;
    out: number;
    cacheRead: number;
    cacheWrite: number;
    limitCost: number;
    /** bootstrapCw sum / totals.cacheWrite — fraction of cache writes that are bootstrap */
    bootstrapShare: number;
  };
}

export interface CacheGateSession {
  taskId: string;
  /** First call's cache read tokens */
  firstCallCr: number;
  /** First call's cache write tokens */
  firstCallCw: number;
  /**
   * True if this session's first call had cacheRead >= cacheWrite.
   * Always false for the warmer (first session) — the warmer is the writer by definition.
   */
  readsWarm: boolean;
}

export interface CacheGateReport {
  /**
   * False for single-session sprints — gate requires ≥ 2 sessions to be meaningful.
   * When false, pass is also false and sessions is empty.
   */
  applicable: boolean;
  /** warmShare >= 0.8 → PASS. Always false when applicable is false. */
  pass: boolean;
  /** TaskId of the first (warmer) session. Null when applicable is false. */
  warmTaskId: string | null;
  /**
   * All mapped sessions in chronological order (by first call ts).
   * Index 0 = warmer; indices 1..N = followers evaluated for the gate.
   */
  sessions: CacheGateSession[];
  /**
   * Fraction of follower sessions (2.+) whose first call had cacheRead >= cacheWrite.
   * Range [0, 1]. 0 when applicable is false.
   *
   * Gate threshold: warmShare >= 0.8 → PASS.
   * A single outlier worker should not fail the gate — the 0.8 threshold allows one miss
   * in a 5-worker fleet.
   */
  warmShare: number;
}

// ─── Task ID extraction ──────────────────────────────────────────────────────

/**
 * Count "-fix" suffix occurrences in a task ID.
 * "273-001-fix-fix" → 2, "273-001-fix" → 1, "273-001" → 0
 */
function countFixes(taskId: string): number {
  const m = taskId.match(/-fix/g);
  return m ? m.length : 0;
}

/**
 * Find the most specific task ID in text.
 *
 * Scans text for `.tasks/task-NNN-NNN[-fix*].` patterns and returns the match
 * with the most `-fix` suffixes. Returns null if no match is found.
 *
 * Specificity order: "273-001-fix-fix" > "273-001-fix" > "273-001"
 */
export function mapSessionToTask(text: string): string | null {
  const pattern = /\.tasks\/task-(\d{3}-\d{3}(?:-fix)*)\./gi;
  let best: string | null = null;
  let bestFixes = -1;

  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const taskId = m[1]!;
    const fixes = countFixes(taskId);
    if (fixes > bestFixes) {
      best = taskId;
      bestFixes = fixes;
    }
  }

  return best;
}

/**
 * Extract a task ID from the first ~6 JSONL lines of a session file.
 *
 * Parses each line as JSON and looks for message content (string or content-block array)
 * at `message.content` or top-level `content`. Applies mapSessionToTask to find the
 * task reference. Returns the first task ID found, or null.
 */
export function extractTaskIdFromStream(lines: string[]): string | null {
  const limit = Math.min(lines.length, 6);
  for (let i = 0; i < limit; i++) {
    const line = lines[i];
    if (!line) continue;

    let j: unknown;
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }

    if (!j || typeof j !== 'object') continue;
    const rec = j as Record<string, unknown>;
    const msg = rec['message'] as Record<string, unknown> | undefined;

    const textParts: string[] = [];

    // Collect text from both top-level and message.content
    for (const src of [rec, msg] as const) {
      if (!src) continue;
      const content = src['content'];
      if (typeof content === 'string') {
        textParts.push(content);
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === 'object') {
            const text = (block as Record<string, unknown>)['text'];
            if (typeof text === 'string') textParts.push(text);
          }
        }
      }
    }

    for (const text of textParts) {
      const taskId = mapSessionToTask(text);
      if (taskId) return taskId;
    }
  }

  return null;
}

// ─── Sprint aggregation ──────────────────────────────────────────────────────

/**
 * Aggregate usage records into a per-task sprint summary.
 *
 * @param records    UsageRecord[] from parseTranscriptUsage
 * @param taskMap    Maps sessionFile basename → taskId (build with extractTaskIdFromStream)
 * @param prices     Per-model per-token prices; pass {} to skip cost calculation
 * @param durationMap  Optional per-task wall-clock durations from heartbeat data.
 *                     Do NOT derive from transcript timestamps (unreliable — §10.1 #5).
 */
export function summarizeSprint(
  records: UsageRecord[],
  taskMap: Record<string, string>,
  prices: LedgerPrices = {},
  durationMap?: Record<string, number>,
): SprintUsageSummary {
  // Group records by taskId using sessionFile lookup
  const groups = new Map<string, UsageRecord[]>();

  for (const r of records) {
    const taskId = taskMap[r.sessionFile];
    if (!taskId) continue;
    let arr = groups.get(taskId);
    if (!arr) {
      arr = [];
      groups.set(taskId, arr);
    }
    arr.push(r);
  }

  const tasks: TaskUsageSummary[] = [];

  for (const [taskId, recs] of groups) {
    // Dominant model = model with the most API calls (by count)
    const modelCounts = new Map<string, number>();
    for (const r of recs) {
      modelCounts.set(r.model, (modelCounts.get(r.model) ?? 0) + 1);
    }
    let dominantModel = recs[0]?.model ?? 'unknown';
    let maxCount = 0;
    for (const [model, count] of modelCounts) {
      if (count > maxCount) {
        dominantModel = model;
        maxCount = count;
      }
    }

    // Aggregate token counts
    let totalIn = 0, totalOut = 0, totalCr = 0, totalCw = 0;
    for (const r of recs) {
      totalIn += r.in;
      totalOut += r.out;
      totalCr += r.cacheRead;
      totalCw += r.cacheWrite;
    }

    // bootstrapCw = first call's cacheWrite, sorted by ts (insertion order when ts absent)
    const sorted = [...recs].sort((a, b) => {
      if (a.ts && b.ts) return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0;
      return 0;
    });
    const bootstrapCw = sorted[0]?.cacheWrite ?? 0;

    // hitRate = cacheRead / (in + cacheRead); 0 when denominator is 0
    const hitRate = totalIn + totalCr > 0 ? totalCr / (totalIn + totalCr) : 0;

    const entry: TaskUsageSummary = {
      taskId,
      model: dominantModel,
      calls: recs.length,
      in: totalIn,
      out: totalOut,
      cacheRead: totalCr,
      cacheWrite: totalCw,
      bootstrapCw,
      limitCost: limitCost(recs, prices),
      hitRate,
    };

    if (durationMap?.[taskId] !== undefined) {
      entry.durationMs = durationMap[taskId];
    }

    tasks.push(entry);
  }

  // Sprint totals
  let tCalls = 0, tIn = 0, tOut = 0, tCr = 0, tCw = 0, tCost = 0, tBoot = 0;
  for (const t of tasks) {
    tCalls += t.calls;
    tIn += t.in;
    tOut += t.out;
    tCr += t.cacheRead;
    tCw += t.cacheWrite;
    tCost += t.limitCost;
    tBoot += t.bootstrapCw;
  }

  return {
    tasks,
    totals: {
      calls: tCalls,
      in: tIn,
      out: tOut,
      cacheRead: tCr,
      cacheWrite: tCw,
      limitCost: tCost,
      bootstrapShare: tCw > 0 ? tBoot / tCw : 0,
    },
  };
}

// ─── Cache-gate evaluation ────────────────────────────────────────────────────

/**
 * Evaluate whether the sprint's follower workers read from cache (vs writing fresh).
 *
 * Algorithm:
 * 1. Group records by sessionFile; resolve taskId from taskMap (skip unmapped sessions).
 * 2. Sort sessions chronologically by their earliest record's ts.
 * 3. First session = "warmer" (the worker that populated the shared prompt-prefix cache).
 * 4. Each follower session's FIRST call is checked: cacheRead >= cacheWrite → readsWarm.
 * 5. warmShare = readsWarm count / follower count. Gate: warmShare >= 0.8 → PASS.
 *    The 0.8 threshold means a single outlier worker does not fail a 5+ worker fleet.
 *
 * @param records  UsageRecord[] — all records for the sprint (may include all models/sessions)
 * @param taskMap  sessionFile basename → taskId (from extractTaskIdFromStream)
 */
export function evaluateCacheGate(
  records: UsageRecord[],
  taskMap: Record<string, string>,
): CacheGateReport {
  const NA: CacheGateReport = {
    applicable: false,
    pass: false,
    warmTaskId: null,
    sessions: [],
    warmShare: 0,
  };

  // Group records by sessionFile
  const sessionGroups = new Map<string, UsageRecord[]>();
  for (const r of records) {
    let arr = sessionGroups.get(r.sessionFile);
    if (!arr) {
      arr = [];
      sessionGroups.set(r.sessionFile, arr);
    }
    arr.push(r);
  }

  // Build per-session entries (skip sessions without a taskId mapping)
  interface SessionEntry {
    taskId: string;
    firstRecord: UsageRecord;
  }

  const entries: SessionEntry[] = [];
  for (const [sessionFile, recs] of sessionGroups) {
    const taskId = taskMap[sessionFile];
    if (!taskId) continue;

    // Sort by ts so index 0 is the earliest call
    const sorted = [...recs].sort((a, b) => {
      if (a.ts && b.ts) return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0;
      return 0;
    });

    entries.push({ taskId, firstRecord: sorted[0]! });
  }

  // Need at least 2 sessions to evaluate the gate
  if (entries.length < 2) return NA;

  // Sort sessions chronologically by their first-call ts
  entries.sort((a, b) => {
    const ta = a.firstRecord.ts;
    const tb = b.firstRecord.ts;
    if (ta && tb) return ta < tb ? -1 : ta > tb ? 1 : 0;
    return 0;
  });

  // Build CacheGateSession list
  const sessions: CacheGateSession[] = entries.map((e, idx) => ({
    taskId: e.taskId,
    firstCallCr: e.firstRecord.cacheRead,
    firstCallCw: e.firstRecord.cacheWrite,
    // warmer (idx=0) is the writer by definition — readsWarm is always false for it
    readsWarm: idx === 0 ? false : e.firstRecord.cacheRead >= e.firstRecord.cacheWrite,
  }));

  // warmShare: fraction of follower sessions that readsWarm
  const followers = sessions.slice(1);
  const warmCount = followers.filter((s) => s.readsWarm).length;
  const warmShare = followers.length > 0 ? warmCount / followers.length : 0;

  return {
    applicable: true,
    pass: warmShare >= 0.8,
    warmTaskId: sessions[0]!.taskId,
    sessions,
    warmShare,
  };
}
