// ─── Agent Selection Step ──────────────────────────────────────────────────
// Boosts agent scores based on TaskAnalysis type, then delegates to selectAgent.
import type { AgentPool, AgentSelectionResult } from '../../core/agent-types.js';
import type { TaskAnalysis, TaskType } from '../../core/decision-types.js';
import { selectAgent } from '../../core/agent-selector.js';

// ─── Type-to-keyword boost map ─────────────────────────────────────────────

const TYPE_BOOST_KEYWORDS: Record<TaskType, string[]> = {
  security: ['security', 'auth', 'jwt', 'csrf', 'xss', 'encrypt', 'oauth', 'credential'],
  test:     ['test', 'spec', 'coverage', 'vitest', 'jest', 'testing'],
  doc:      ['doc', 'readme', 'changelog', 'guide', 'documentation'],
  refactor: ['refactor', 'rename', 'extract', 'split', 'cleanup'],
  devops:   ['docker', 'ci', 'deploy', 'pipeline', 'workflow', 'release'],
  config:   ['config', 'settings', 'env', 'environment'],
  code:     [],
};

// ─── executeAgentStep ──────────────────────────────────────────────────────

/**
 * Execute the agent selection step of the decision pipeline.
 * Boosts agent scores based on task analysis type before delegating to selectAgent.
 *
 * Strategy:
 * - Build a synthetic task whose title includes boost keywords for the analysis type
 * - This causes selectAgent's keyword matching to naturally boost relevant agents
 */
export function executeAgentStep(
  analysis: TaskAnalysis,
  pool: AgentPool,
  task: { title: string; description: string; scope: { directories: string[]; filesWrite: string[] } },
): AgentSelectionResult {
  const boostKeywords = TYPE_BOOST_KEYWORDS[analysis.type] ?? [];

  // If there are no boost keywords (e.g. type=code), run plain selection
  if (boostKeywords.length === 0) {
    return selectAgent(task, pool);
  }

  // Augment task text with type-specific keywords to bias the scoring
  const boostSuffix = boostKeywords.join(' ');
  const boostedTask = {
    title: `${task.title} ${boostSuffix}`,
    description: `${task.description} ${boostSuffix}`,
    scope: task.scope,
  };

  const boostedResult = selectAgent(boostedTask, pool);
  const plainResult = selectAgent(task, pool);

  // If boost found a match that plain did not, use it
  if (boostedResult.agent && !plainResult.agent) {
    return {
      agent: boostedResult.agent,
      score: boostedResult.score,
      reason: `Type-boosted (${analysis.type}): ${boostedResult.reason}`,
    };
  }

  // If both found agents, prefer the higher-scoring one
  if (boostedResult.agent && plainResult.agent) {
    if (boostedResult.score > plainResult.score) {
      return {
        agent: boostedResult.agent,
        score: boostedResult.score,
        reason: `Type-boosted (${analysis.type}): ${boostedResult.reason}`,
      };
    }
    return plainResult;
  }

  // Fallback: return plain result (may be null)
  return plainResult;
}
