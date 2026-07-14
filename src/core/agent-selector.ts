// ─── Agent Selector ──────────────────────────────────────────────────────────
import type { ModelType } from './types.js';
import type { AgentDefinition, AgentPool, AgentSelectionResult } from './agent-types.js';
// extractKeywords is the canonical R4-KEYWORDS SSOT in memory-import. Re-exported here
// for backward-compatible imports; selectAgent/suggestNewAgent call it with defaults
// (uncapped, minLength 2) so short/action keywords like "fix"/"add"/"ci" stay matchable.
import { extractKeywords } from './memory-import.js';

export { extractKeywords };

// Minimum score threshold for an agent to be selected
const SCORE_THRESHOLD = 3;

// ─── Glob-like pattern matching ──────────────────────────────────────────────

/**
 * Simple glob matching: supports * (any chars) and ** (any path segments).
 */
function globMatch(pattern: string, text: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '@@GLOBSTAR@@')
    .replace(/\*/g, '[^/]*')
    .replace(/@@GLOBSTAR@@/g, '.*');
  try {
    return new RegExp(`^${regexStr}$`).test(text);
  } catch {
    return false;
  }
}

// ─── selectAgent ─────────────────────────────────────────────────────────────

/**
 * Select the best agent from the pool for a given task.
 *
 * Scoring algorithm:
 * 1. Extract keywords from task title + description
 * 2. For each enabled agent:
 *    - +2 per keyword match with triggerKeywords
 *    - +3 per scope directory overlap with triggerScopes
 *    - +1 per file pattern match with triggerFilePatterns
 * 3. Filter: score >= 3
 * 4. Tie-break by agent stats successRate (higher wins)
 * 5. Return best or null
 */
/**
 * @deprecated DEAD IN PRODUCTION (PCOMP-6 ground-truth, 2026-07-14): zero src/
 * callers — the live path is routeTaskV2 → selectBestAgent (core/routing-engine.ts).
 * Six test files still pin THIS legacy behavior and give false confidence;
 * porting them to the live path + deleting this function is born-699.
 * Do NOT add new callers.
 */
export function selectAgent(
  task: {
    title: string;
    description: string;
    scope: { directories: string[]; filesWrite: string[] };
  },
  pool: AgentPool,
): AgentSelectionResult {
  const keywords = extractKeywords(`${task.title} ${task.description}`);

  let bestAgent: AgentDefinition | null = null;
  let bestScore = 0;
  let bestReason = 'No matching agent found';

  for (const [, agent] of pool) {
    if (!agent.enabled) continue;

    let score = 0;
    const matchReasons: string[] = [];

    // +2 per keyword match with triggerKeywords
    for (const kw of agent.triggerKeywords) {
      const kwLower = kw.toLowerCase();
      if (keywords.includes(kwLower)) {
        score += 2;
        matchReasons.push(`keyword:${kwLower}`);
      }
    }

    // +3 per scope directory overlap with triggerScopes
    for (const scope of agent.triggerScopes) {
      for (const dir of task.scope.directories) {
        if (dir.startsWith(scope) || scope.startsWith(dir)) {
          score += 3;
          matchReasons.push(`scope:${scope}`);
        }
      }
    }

    // +1 per file pattern match with triggerFilePatterns
    for (const pattern of agent.triggerFilePatterns) {
      for (const file of task.scope.filesWrite) {
        if (globMatch(pattern, file)) {
          score += 1;
          matchReasons.push(`file:${pattern}`);
        }
      }
    }

    if (score < SCORE_THRESHOLD) continue;

    // Tie-break: higher successRate wins
    if (
      score > bestScore ||
      (score === bestScore && agent.stats.successRate > (bestAgent?.stats.successRate ?? 0))
    ) {
      bestScore = score;
      bestAgent = agent;
      bestReason = `Matched: ${matchReasons.join(', ')}`;
    }
  }

  return {
    agent: bestAgent,
    score: bestScore,
    reason: bestReason,
  };
}

// ─── suggestNewAgent ─────────────────────────────────────────────────────────

/**
 * If 3+ tasks share keywords that no agent in the pool covers,
 * suggest creating a new agent for those keywords.
 * Returns null if no suggestion warranted.
 */
export function suggestNewAgent(
  tasks: Array<{ title: string; description: string }>,
  pool: AgentPool,
): { name: string; keywords: string[]; model: ModelType } | null {
  if (tasks.length < 3) return null;

  // Collect all agent trigger keywords
  const coveredKeywords = new Set<string>();
  for (const [, agent] of pool) {
    for (const kw of agent.triggerKeywords) {
      coveredKeywords.add(kw.toLowerCase());
    }
  }

  // Count keyword frequency across tasks
  const keywordCounts = new Map<string, number>();
  for (const task of tasks) {
    const keywords = extractKeywords(`${task.title} ${task.description}`);
    for (const kw of keywords) {
      if (!coveredKeywords.has(kw)) {
        keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1);
      }
    }
  }

  // Find keywords that appear in 3+ tasks
  const sharedKeywords = [...keywordCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([kw]) => kw);

  if (sharedKeywords.length === 0) return null;

  // Use top keywords for name suggestion
  const topKeywords = sharedKeywords.slice(0, 5);
  const name = `${topKeywords[0]}-specialist`;

  return {
    name,
    keywords: topKeywords,
    model: 'sonnet',
  };
}
