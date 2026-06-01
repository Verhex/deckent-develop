// ─── Prompt Evolution (F5 Skeleton) ─────────────────────────────────────────
// Rule-based prompt tuning — appends hint blocks to a base prompt based on
// past routing outcomes. NOT an LLM call; pure string composition.
// Integration point for OutcomeTracker (see outcome-tracker.ts) — accepts the
// same RoutingOutcome shape so future callers can pipe sprint history in.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { RoutingOutcome } from './outcome-tracker.js';
import { PromptRollback } from '../agents/prompt-rollback.js';
import type { RollbackResult } from '../agents/prompt-rollback.js';

const OUTCOMES_DIR = '.deckent/routing/outcomes';

export interface PromptEvolutionResult {
  evolvedPrompt: string;
  changes: string[];
  outcomeCount: number;
  successRate: number;
}

const SUCCESS_HEADER = '## Başarı Pattern (Outcome-Driven)';
const FAILURE_HEADER = '## Risk Uyarısı (Outcome-Driven)';

const MIN_SUCCESS_OUTCOMES = 3;
const SUCCESS_RATE_THRESHOLD = 0.75;
const MIN_FAILURE_OUTCOMES = 2;
const TOP_ENTITY_LIMIT = 3;

/**
 * Evolve a base prompt by inspecting past routing outcomes and appending
 * deterministic hint blocks (success reinforcement, failure warning).
 *
 * Rules:
 *   1. Empty outcomes  → no-op.
 *   2. ≥3 outcomes with success rate ≥0.75 → append SUCCESS block.
 *   3. ≥2 NO_GO outcomes → append FAILURE block with corrective hints.
 *   4. Idempotent — skips a block if its header already appears in basePrompt.
 */
export function evolvePrompt(
  basePrompt: string,
  outcomes: RoutingOutcome[],
): PromptEvolutionResult {
  if (outcomes.length === 0) {
    return { evolvedPrompt: basePrompt, changes: [], outcomeCount: 0, successRate: 0 };
  }

  const successCount = outcomes.filter(o => o.evaluation !== 'NO_GO').length;
  const failCount = outcomes.length - successCount;
  const successRate = successCount / outcomes.length;

  const changes: string[] = [];
  const sections: string[] = [basePrompt];

  if (successCount >= MIN_SUCCESS_OUTCOMES && successRate >= SUCCESS_RATE_THRESHOLD) {
    if (!basePrompt.includes(SUCCESS_HEADER)) {
      sections.push(buildSuccessBlock(outcomes, successRate));
      changes.push('reinforced-success-pattern');
    }
  }

  if (failCount >= MIN_FAILURE_OUTCOMES) {
    if (!basePrompt.includes(FAILURE_HEADER)) {
      sections.push(buildFailureBlock(outcomes, failCount));
      changes.push('added-failure-warning');
    }
  }

  return {
    evolvedPrompt: sections.join('\n\n'),
    changes,
    outcomeCount: outcomes.length,
    successRate,
  };
}

function buildSuccessBlock(outcomes: RoutingOutcome[], rate: number): string {
  const counts = countAgents(outcomes, 'success');
  const topAgents = pickTop(counts).map(([id]) => id).join(', ');
  const percent = Math.round(rate * 100);
  const tail = topAgents.length > 0
    ? ` Yüksek başarılı agent: ${topAgents}. Bu yaklaşımı sürdür.`
    : '';
  return `${SUCCESS_HEADER}\nGeçmiş ${outcomes.length} task'ta %${percent} başarı.${tail}`;
}

function buildFailureBlock(outcomes: RoutingOutcome[], failCount: number): string {
  const counts = countAgents(outcomes, 'fail');
  const topFails = pickTop(counts)
    .map(([id, n]) => `${id} (${n}x)`)
    .join(', ');
  const tail = topFails.length > 0
    ? ` Tekrarlanan başarısızlık: ${topFails}.`
    : '';
  return `${FAILURE_HEADER}\n${failCount}/${outcomes.length} geçmiş NO_GO.${tail} Bu pattern'i tekrarlamamaya dikkat et: gereksinim doğrulama, scope sınırı, test koşumu.`;
}

function countAgents(outcomes: RoutingOutcome[], side: 'success' | 'fail'): Map<string, number> {
  const counts = new Map<string, number>();
  for (const o of outcomes) {
    const isFail = o.evaluation === 'NO_GO';
    const wanted = side === 'fail' ? isFail : !isFail;
    if (!wanted) continue;
    if (!o.agentId || o.agentId === 'generic') continue;
    counts.set(o.agentId, (counts.get(o.agentId) ?? 0) + 1);
  }
  return counts;
}

function pickTop(counts: Map<string, number>): Array<[string, number]> {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_ENTITY_LIMIT);
}

// ─── Outcome-Tracker Wire ───────────────────────────────────────────────────
// Reads the sprint outcome file written by OutcomeTracker.saveSprintOutcome
// (at `<projectRoot>/.deckent/routing/outcomes/<sprintId>.json`) and feeds the
// outcomes into evolvePrompt. Suggestion-only — does not mutate any agent
// prompt, config, or stored learnings. Caller for the dormant evolvePrompt().

export interface PromptEvolutionWireOptions {
  projectRoot: string;
  sprintId: string;
  basePrompt: string;
}

/**
 * Wire: load sprint outcomes from disk and produce an evolved-prompt
 * suggestion. Missing / unreadable / malformed outcome files degrade
 * gracefully to a no-op (returns basePrompt unchanged).
 */
export function wirePromptEvolutionFromOutcomes(
  opts: PromptEvolutionWireOptions,
): PromptEvolutionResult {
  const outcomes = loadSprintOutcomes(opts.projectRoot, opts.sprintId);
  return evolvePrompt(opts.basePrompt, outcomes);
}

/**
 * Companion helper exposed for callers that already hold outcomes in memory
 * (e.g. when chaining off OutcomeTracker without an intermediate file read).
 */
export function evolvePromptFromSprintOutcomes(
  basePrompt: string,
  outcomes: RoutingOutcome[],
): PromptEvolutionResult {
  return evolvePrompt(basePrompt, outcomes);
}

function loadSprintOutcomes(projectRoot: string, sprintId: string): RoutingOutcome[] {
  const filePath = join(projectRoot, OUTCOMES_DIR, `${sprintId}.json`);
  if (!existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    return Array.isArray(parsed) ? (parsed as RoutingOutcome[]) : [];
  } catch {
    return [];
  }
}

// ─── Rollback Wire ──────────────────────────────────────────────────────────
// When an evolved prompt shows low performance (successRate < 50% with ≥3
// outcomes), delegate to PromptRollback to suggest reverting to the best
// historical prompt version. This is the real external caller that activates
// the dormant prompt-rollback module in the evolution flow.

export interface PromptRollbackSuggestion {
  agentId: string;
  rolledBackTo: number;
  reason: string;
}

export interface PromptEvolutionWithRollback extends PromptEvolutionResult {
  rollbackSuggestion?: PromptRollbackSuggestion;
}

/**
 * Evolve a prompt and, when the outcome history shows poor performance,
 * call PromptRollback to suggest reverting to the best historical version.
 * Returns an extended result that includes the optional rollback suggestion.
 */
export function evolvePromptCheckRollback(
  basePrompt: string,
  outcomes: RoutingOutcome[],
  agentId: string,
  projectRoot: string,
): PromptEvolutionWithRollback {
  const evolved = evolvePrompt(basePrompt, outcomes);

  if (outcomes.length === 0) {
    return evolved;
  }

  const rb = new PromptRollback(projectRoot);
  const needsRollback = rb.shouldRollback(agentId, {
    uses: outcomes.length,
    successRate: evolved.successRate,
  });

  if (!needsRollback) {
    return evolved;
  }

  const result: RollbackResult | null = rb.rollbackPrompt(agentId);
  if (!result) {
    return evolved;
  }

  return {
    ...evolved,
    rollbackSuggestion: {
      agentId,
      rolledBackTo: result.rolledBackTo,
      reason: result.reason,
    },
  };
}
