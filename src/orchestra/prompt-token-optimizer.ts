// ─── Prompt Token Optimizer ──────────────────────────────────────────────────
// Filters skill prompts based on TaskDNA to reduce token usage when V2 routing
// is active. Irrelevant skill prompts are removed before the worker prompt is built.

import type { TaskDNA, IntentType } from '../core/routing-types.js';
import type { SkillDefinition } from '../core/skill-types.js';
import { evaluateActivation } from '../core/activation-engine.js';

// ─── Config ──────────────────────────────────────────────────────────────────

/** Minimum relevance score to include a skill (0.0–1.0) */
const RELEVANCE_THRESHOLD = 0.3;

/** Maps intent types to skill trigger/category keywords for V1 fallback matching */
const INTENT_SKILL_AFFINITY: Record<IntentType, string[]> = {
  implementation: ['typescript', 'python', 'react', 'api', 'database', 'language', 'framework', 'code', 'testing', 'test', 'coverage'],
  bugfix:         ['typescript', 'testing', 'debug', 'fix', 'error', 'bug', 'diagnostic'],
  refactor:       ['typescript', 'refactor', 'clean', 'architecture', 'design', 'quality'],
  // 'testing' removed as primary intent (Sprint 148) — keywords merged into implementation
  documentation:  ['documentation', 'docs', 'writer', 'readme', 'guide', 'markdown'],
  security:       ['security', 'auth', 'permission', 'vulnerability', 'audit', 'crypto'],
  devops:         ['devops', 'ci', 'deploy', 'pipeline', 'docker', 'github', 'actions', 'workflow'],
  config:         ['config', 'settings', 'environment', 'setup', 'configuration'],
  performance:    ['performance', 'optimization', 'cache', 'speed', 'profiling', 'benchmark'],
  design:         ['design', 'ui', 'ux', 'frontend', 'react', 'css', 'component', 'visual'],
  migration:      ['database', 'migration', 'schema', 'upgrade', 'transform', 'data'],
  architecture:   ['architecture', 'design', 'system', 'adr', 'roadmap', 'module', 'structure'],
  unknown:        [],
};

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Compute a relevance score for a skill against a TaskDNA.
 * Uses V2 activation rules when available, falls back to trigger keyword matching.
 *
 * @param skill - The skill definition to score
 * @param taskDNA - Task DNA from intent classification
 * @returns Relevance score in range 0.0–1.0
 */
export function computeSkillRelevance(skill: SkillDefinition, taskDNA: TaskDNA): number {
  // V2: use activation rules if available
  if (skill.manifestVersion === 2 && skill.activation) {
    const result = evaluateActivation(taskDNA, skill.activation);
    if (result.excluded) return 0;
    const maxPossibleScore = skill.activation.rules.reduce((sum, r) => sum + r.score, 0) || 1;
    return Math.min(result.score / maxPossibleScore, 1);
  }

  // V1 fallback: match triggers and category against intent keywords
  const primaryIntent = taskDNA.intent.primary;
  const affinityKeywords = INTENT_SKILL_AFFINITY[primaryIntent] ?? [];
  const domainNames = taskDNA.domains.map(d => d.name.toLowerCase());

  let score = 0;

  for (const trigger of skill.triggers) {
    const triggerLower = trigger.toLowerCase();
    if (affinityKeywords.some(kw => triggerLower.includes(kw) || kw.includes(triggerLower))) {
      score += 2;
    }
    for (const domain of domainNames) {
      if (triggerLower.includes(domain) || domain.includes(triggerLower)) {
        score += 3;
      }
    }
  }

  if (skill.category) {
    const catLower = skill.category.toLowerCase();
    if (affinityKeywords.some(kw => catLower.includes(kw))) {
      score += 1;
    }
  }

  // Normalize: a well-matching skill with 2+ triggers scores ~6–8 raw
  return Math.min(score / 6, 1);
}

/**
 * Filter a list of SkillDefinition objects to only those relevant to the given TaskDNA.
 * Preserves original order. Guarantees at least one skill is always returned.
 *
 * @param skills - Skill definitions to filter
 * @param taskDNA - Task DNA from intent classification
 * @returns Subset of skills relevant to the task
 */
export function filterSkillPrompts(skills: SkillDefinition[], taskDNA: TaskDNA): SkillDefinition[] {
  if (skills.length === 0) return [];

  const scored = skills.map(skill => ({
    skill,
    relevance: computeSkillRelevance(skill, taskDNA),
  }));

  const passing = scored.filter(s => s.relevance >= RELEVANCE_THRESHOLD);

  if (passing.length === 0) {
    // Fallback: return the single highest-scoring skill to avoid leaving worker with no context
    const best = scored.reduce((a, b) => (a.relevance >= b.relevance ? a : b));
    return [best.skill];
  }

  return passing.map(s => s.skill);
}

/**
 * Filter already-loaded skill prompts (name + content pairs) based on TaskDNA.
 * Used by buildWorkerPrompt to reduce token usage in V2 routing mode.
 * Matches skill names and a brief content snippet against task intent and domain keywords.
 *
 * @param skillPrompts - Array of {name, content} pairs
 * @param taskDNA - Task DNA from intent classification
 * @returns Filtered skill prompts (always non-empty if input is non-empty)
 */
export function filterSkillPromptsByDNA(
  skillPrompts: Array<{ name: string; content: string }>,
  taskDNA: TaskDNA,
): Array<{ name: string; content: string }> {
  if (skillPrompts.length <= 1) return skillPrompts;

  const primaryIntent = taskDNA.intent.primary;
  const affinityKeywords = INTENT_SKILL_AFFINITY[primaryIntent] ?? [];
  const domainNames = taskDNA.domains.map(d => d.name.toLowerCase());

  const scored = skillPrompts.map(sp => {
    const nameLower = sp.name.toLowerCase();
    let score = 0;

    // Name matches intent affinity keywords
    if (affinityKeywords.some(kw => nameLower.includes(kw) || kw.includes(nameLower))) {
      score += 3;
    }

    // Name matches task domain names
    if (domainNames.some(d => nameLower.includes(d) || d.includes(nameLower))) {
      score += 4;
    }

    // Scan first 200 chars of content for affinity keyword hits (capped at 2 points)
    const snippet = sp.content.slice(0, 200).toLowerCase();
    const contentHits = affinityKeywords.filter(kw => snippet.includes(kw)).length;
    score += Math.min(contentHits, 2);

    return { sp, score };
  });

  const PROMPT_THRESHOLD = 1;
  const passing = scored.filter(s => s.score >= PROMPT_THRESHOLD);
  if (passing.length === 0) return skillPrompts; // safe fallback: no filter applied

  return passing.map(s => s.sp);
}
