// src/nervous/recommendation-log.ts
//
// Nervous recommendation inbox — the durable, Brain-actionable feed for nervous
// actions that touch a resource the nervous system does NOT own (debt priority,
// routing weights, agent flags, wave order, directives, over-budget proceed).
//
// ADR-037 (authority matrix): the nervous system PROPOSES; Brain / the operator
// DISPOSES. So a medium / safety-floor action does not self-mutate the repo
// (the self-modification hazard) — it lands a structured proposal here that the
// Brain consumes on its next planning cycle and that the dashboard / CLI surface.
// Distinct from `nervous-history.jsonl` (the raw audit of every action) — this is
// the filtered, open, actionable subset. Append-only JSONL, dependency-free, so
// it never pulls the LLM / orchestration graph into the nervous hot path.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Path (relative to project root) of the durable recommendation feed. */
export const RECOMMENDATIONS_FILE = '.deckent/nervous-recommendations.jsonl';

/**
 * A nervous proposal awaiting Brain / operator disposition. The data layer is
 * deliberately English + structured (like ExecutionRecord / event-stream); any
 * user-facing surface i18n's `actionId` at render time (getMessage), so this feed
 * stays a clean machine/Brain signal + training-data record.
 */
export interface NervousRecommendation {
  /** Stable unique id (`rec-<uuid>`). */
  id: string;
  /** The registry action id this proposal corresponds to (e.g. 'DEBT_REPRIORITIZE'). */
  actionId: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** The detector-provided action payload — the context Brain needs to act. */
  payload: Record<string, unknown>;
  /** Lifecycle status. New proposals are 'open'; the operator dismisses addressed
   *  ones (a proposal is inert — it never auto-executes, dismiss is housekeeping). */
  status: 'open' | 'dismissed';
}

/**
 * Append a Brain-actionable proposal to the durable feed. Creates the `.deckent`
 * directory if absent. Synchronous + atomic-append (single JSONL line) so it is
 * safe to call from the nervous executor hot path. Returns the stamped record.
 */
export function recordRecommendation(
  projectRoot: string,
  actionId: string,
  payload: Record<string, unknown> = {},
): NervousRecommendation {
  const rec: NervousRecommendation = {
    id: `rec-${randomUUID()}`,
    actionId,
    createdAt: new Date().toISOString(),
    payload,
    status: 'open',
  };
  const path = join(projectRoot, RECOMMENDATIONS_FILE);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(path, JSON.stringify(rec) + '\n', 'utf-8');
  return rec;
}

/**
 * Read every recommendation from the durable feed (newest last). Malformed lines
 * are skipped, never thrown — a corrupt tail must not blind the Brain to the rest.
 * Returns `[]` when the feed does not exist yet.
 */
export function readRecommendations(projectRoot: string): NervousRecommendation[] {
  const path = join(projectRoot, RECOMMENDATIONS_FILE);
  if (!existsSync(path)) return [];
  const out: NervousRecommendation[] = [];
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as NervousRecommendation);
    } catch {
      // skip a corrupt line — the rest of the feed stays readable
    }
  }
  return out;
}

/**
 * Mark an open recommendation as dismissed (operator housekeeping). Rewrites the
 * feed flipping the matching `open` entry — by exact id or a unique `rec-` prefix
 * — to `dismissed`. Returns true when an entry changed, false when no open match
 * was found. A proposal is inert, so dismiss only clears the inbox; it never
 * executes anything. Malformed lines are dropped on rewrite (already unreadable).
 */
export function dismissRecommendation(projectRoot: string, id: string): boolean {
  const all = readRecommendations(projectRoot);
  let changed = false;
  const next = all.map((rec) => {
    if (!changed && rec.status === 'open' && (rec.id === id || rec.id.startsWith(id))) {
      changed = true;
      return { ...rec, status: 'dismissed' as const };
    }
    return rec;
  });
  if (!changed) return false;
  const path = join(projectRoot, RECOMMENDATIONS_FILE);
  writeFileSync(path, next.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
  return true;
}
