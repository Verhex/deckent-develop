// ─── Prompt Token Optimizer ──────────────────────────────────────────────────
// Filters skill prompts based on TaskDNA to reduce token usage when V2 routing
// is active. Irrelevant skill prompts are removed before the worker prompt is built.

import type { TaskDNA, IntentType } from '../core/routing-types.js';
import type { SkillDefinition } from '../core/skill-types.js';
import { evaluateActivation } from '../core/activation-engine.js';
import { debugLog } from '../core/utils.js';

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

// ─── Word-boundary matching ────────────────────────────────────────────────────

/**
 * Word-boundary-aware containment: true when `term` occurs inside `text` delimited
 * by string edges or non-alphanumeric characters (hyphen, space, dot, …).
 *
 * Replaces raw `String.includes` in the relevance heuristics below so a short token
 * no longer produces a spurious inside-a-word hit: the keyword `test` must NOT match
 * inside `latest`, and the skill name `script` must NOT match inside the keyword
 * `typescript`. Callers already lowercase their inputs; the `i` flag + regex-escaping
 * keep the helper correct even if that ever changes.
 */
function containsWord(text: string, term: string): boolean {
  if (!term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(text);
}

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
    // Word-boundary match, not raw substring: keyword `test` must not match inside `latest`.
    if (affinityKeywords.some(kw => containsWord(triggerLower, kw) || containsWord(kw, triggerLower))) {
      score += 2;
    }
    for (const domain of domainNames) {
      if (containsWord(triggerLower, domain) || containsWord(domain, triggerLower)) {
        score += 3;
      }
    }
  }

  if (skill.category) {
    const catLower = skill.category.toLowerCase();
    if (affinityKeywords.some(kw => containsWord(catLower, kw))) {
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
 * @returns Skill prompts scoring at/above the relevance threshold. MAY be empty when
 *   nothing is relevant (see the below-threshold branch) — a skill-less worker prompt
 *   is legitimate and cheaper than injecting relevance-0 skill bodies.
 */
/**
 * PCOMP-6 D4: narrow-domain skills and the file/text signals that justify them —
 * the SINGLE source shared with prompt-lint's W5 check. A narrow skill with zero
 * signal in the task's write targets/text is dropped regardless of its coarse
 * affinity score (generic intent keywords like 'command'/'script' hit almost any
 * skill prose — the corpus relevance-inversion class).
 */
export const NARROW_SKILL_DOMAIN_SIGNALS: Record<string, RegExp> = {
  'sh-portability': /\.(sh|bash)\b|shell|wrapper|trap |posix|spawn.*(docker|tmux)/i,
  'file-watch-hygiene': /fs\.watch|watcher|polling|chokidar|watch mode|file.?watch/i,
  'devops-engineer': /docker|dockerfile|kubernetes|k8s|\.github\/workflows|ci\/cd|pipeline|deploy/i,
  'dashboard-frontend': /dashboard|react|\.tsx\b|vite|tailwind/i,
};

export interface SkillFilterTaskSignals {
  /** task.scope.filesWrite — write targets carry the strongest domain signal. */
  filesWrite?: readonly string[];
  /** title + description (+ criteria) free text. */
  taskText?: string;
}

export function filterSkillPromptsByDNA(
  skillPrompts: Array<{ name: string; content: string }>,
  taskDNA: TaskDNA,
  signals?: SkillFilterTaskSignals,
): Array<{ name: string; content: string }> {
  // PCOMP-6 D4 (CC): the historical single-skill short-circuit is retired — a
  // lone irrelevant skill body was the highest-frequency corpus leak
  // (sh-portability 10/31, file-watch-hygiene 6/31, all single-assignment).
  // An empty result is a valid outcome; buildSkillBlock renders nothing for [].

  const primaryIntent = taskDNA.intent.primary;
  const affinityKeywords = INTENT_SKILL_AFFINITY[primaryIntent] ?? [];
  const domainNames = taskDNA.domains.map(d => d.name.toLowerCase());

  const scored = skillPrompts.map(sp => {
    const nameLower = sp.name.toLowerCase();
    let score = 0;

    // Name contains an intent affinity keyword at a word boundary. The REVERSE
    // direction (`kw.includes(nameLower)`) was removed (441): a short skill name is a
    // substring of almost every keyword, so it spuriously matched everything.
    if (affinityKeywords.some(kw => containsWord(nameLower, kw))) {
      score += 3;
    }

    // Name contains a task domain name at a word boundary. Reverse direction
    // (`d.includes(nameLower)`) removed for the same reason as the affinity check above.
    if (domainNames.some(d => containsWord(nameLower, d))) {
      score += 4;
    }

    // Scan first 200 chars of content for affinity keyword hits (capped at 2 points).
    // This prose scan stays substring-based on purpose — it is a coarse secondary
    // signal, distinct from the word-boundary identity matching on name/domain above.
    const snippet = sp.content.slice(0, 200).toLowerCase();
    const contentHits = affinityKeywords.filter(kw => snippet.includes(kw)).length;
    score += Math.min(contentHits, 2);

    return { sp, score };
  });

  // Narrow-domain gate (D4): when the caller supplied task signals and the
  // skill is a known narrow domain, require an actual domain hit — the coarse
  // affinity score alone cannot admit it.
  const haystack = `${(signals?.filesWrite ?? []).join('\n')}\n${signals?.taskText ?? ''}`;
  const gated = scored.filter(({ sp }) => {
    const sig = NARROW_SKILL_DOMAIN_SIGNALS[sp.name.toLowerCase()];
    if (!sig || haystack.trim().length === 0) return true;
    return sig.test(haystack);
  });

  const PROMPT_THRESHOLD = 1;
  const passing = gated.filter(s => s.score >= PROMPT_THRESHOLD);
  if (passing.length === 0) {
    // Pre-441 this returned the full `skillPrompts` list as a "safe fallback: no filter
    // applied" — the fear being a worker left with zero skill context. That reasoning is
    // retired: injecting relevance-0 skill bodies wastes tokens, and a skill-less prompt
    // is legitimate (buildSkillBlock renders nothing for []). When NOTHING clears the
    // relevance bar we now drop everything and record it on the existing debug channel,
    // instead of silently re-adding the whole set.
    debugLog('filterSkillPromptsByDNA', 'skill-prompts filtered to zero (all below relevance)');
    return [];
  }

  return passing.map(s => s.sp);
}
