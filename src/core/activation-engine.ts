// ─── Activation Engine ──────────────────────────────────────────────────────
// Layer 2: Evaluate activation rules against TaskDNA.
// Replaces keyword-based scoring with structured, intent-aware matching.

import type { TaskDNA, ActivationConfig, ActivationRule, ExclusionRule, ActivationResult } from './routing-types.js';
import type { SkillCategory, StackDetectionRule } from './skill-types.js';
import { evaluateCondition } from './condition-evaluator.js';

// ─── Main API ───────────────────────────────────────────────────────────────

/**
 * Evaluate an agent/skill's activation config against a task's DNA.
 * Returns score, exclusion status, and matched rule names.
 */
export function evaluateActivation(
  taskDNA: TaskDNA,
  config: ActivationConfig,
): ActivationResult {
  // Check exclusions first — if excluded, skip scoring entirely
  for (const exclusion of config.exclude) {
    if (evaluateExclusion(taskDNA, exclusion)) {
      return {
        score: 0,
        excluded: true,
        matchedRules: [],
        excludeReason: exclusion.reason ?? exclusion.name ?? 'Excluded by rule',
      };
    }
  }

  // Evaluate activation rules — accumulate scores
  let totalScore = 0;
  const matchedRules: string[] = [];

  for (const rule of config.rules) {
    const result = evaluateRule(taskDNA, rule);
    if (result.matched) {
      totalScore += result.score;
      matchedRules.push(rule.name ?? `rule(score=${rule.score})`);
    } else {
      // Secondary intent matching — rules that check intent.primary also check secondary intents
      // but at 50% score to reflect lower confidence of secondary classification
      const secondaryScore = evaluateRuleViaSecondary(taskDNA, rule);
      if (secondaryScore > 0) {
        totalScore += secondaryScore;
        matchedRules.push(`${rule.name ?? `rule`}(via-secondary)`);
      }
    }
  }

  return {
    score: totalScore,
    excluded: false,
    matchedRules,
  };
}

// ─── Rule Evaluation ────────────────────────────────────────────────────────

/**
 * Check if an activation rule matches via secondary intents at 50% score.
 * Only applies when the rule checks `intent.primary` for an exact string value
 * and that value appears in the task's secondary intents (not as primary).
 * Returns half the rule score if matched, 0 otherwise.
 */
export function evaluateRuleViaSecondary(taskDNA: TaskDNA, rule: ActivationRule): number {
  const primaryCond = rule.when['intent.primary'];
  if (typeof primaryCond === 'string' && (taskDNA.intent.secondary as string[]).includes(primaryCond)) {
    return Math.floor(rule.score * 0.5);
  }
  return 0;
}

/**
 * Evaluate a single activation rule against TaskDNA.
 */
export function evaluateRule(
  taskDNA: TaskDNA,
  rule: ActivationRule,
): { matched: boolean; score: number } {
  const dnaData = taskDNAToRecord(taskDNA);
  const matched = evaluateCondition(dnaData, rule.when);
  return { matched, score: matched ? rule.score : 0 };
}

/**
 * Evaluate a single exclusion rule against TaskDNA.
 * Returns true if the exclusion matches (agent/skill should be excluded).
 */
export function evaluateExclusion(
  taskDNA: TaskDNA,
  exclusion: ExclusionRule,
): boolean {
  const dnaData = taskDNAToRecord(taskDNA);
  return evaluateCondition(dnaData, exclusion.when);
}

// ─── V1 → V2 Migration ─────────────────────────────────────────────────────

/**
 * Convert v1 agent trigger fields to v2 activation config.
 * Produces activation rules from triggerKeywords, triggerScopes, and triggerFilePatterns.
 */
export function migrateV1AgentToActivation(
  triggerKeywords: string[],
  triggerScopes: string[],
  triggerFilePatterns: string[],
): ActivationConfig {
  const rules: ActivationRule[] = [];
  const exclude: ExclusionRule[] = [];

  // Infer primary intent from keywords
  const intentMap = inferIntentsFromKeywords(triggerKeywords);

  // Create activation rules for each inferred intent
  for (const [intent, strength] of intentMap) {
    rules.push({
      name: `v1-keyword-${intent}`,
      when: { 'intent.primary': intent },
      score: Math.min(strength * 2, 10),
    });
  }

  // Create scope-based rules
  for (const scope of triggerScopes) {
    const domain = extractDomainFromScope(scope);
    if (domain) {
      rules.push({
        name: `v1-scope-${domain}`,
        when: { domains: { $contains: domain } },
        score: 3,
      });
    }
  }

  // File pattern rules (lower weight)
  if (triggerFilePatterns.some(p => p.includes('.test.') || p.includes('.spec.'))) {
    rules.push({
      name: 'v1-filepattern-test',
      when: { 'scope.testWriteRatio': { $gte: 0.3 } },
      score: 2,
    });
  }

  return {
    rules,
    exclude,
    minScore: 5,
  };
}

/**
 * Convert v1 skill trigger fields to v2 activation config.
 */
export function migrateV1SkillToActivation(
  triggers: string[],
  category: SkillCategory,
  stackDetection: StackDetectionRule,
): ActivationConfig {
  const rules: ActivationRule[] = [];
  const exclude: ExclusionRule[] = [];

  // Category-based rules
  if (category === 'language') {
    // Language skills activate for their language
    for (const trigger of triggers) {
      rules.push({
        name: `v1-language-${trigger}`,
        when: { 'intent.primary': { $not: 'unknown' } },
        score: 3,
      });
    }
  } else if (category === 'framework') {
    for (const trigger of triggers) {
      rules.push({
        name: `v1-framework-${trigger}`,
        when: { 'intent.primary': { $not: 'unknown' } },
        score: 3,
      });
    }
  } else {
    // Domain/tool/workflow skills — use keyword-based intent inference
    const intentMap = inferIntentsFromKeywords(triggers);
    for (const [intent, strength] of intentMap) {
      rules.push({
        name: `v1-trigger-${intent}`,
        when: { 'intent.primary': intent },
        score: Math.min(strength * 2, 8),
      });
    }
  }

  // Stack detection rules
  if (stackDetection.dependencies.length > 0) {
    rules.push({
      name: 'v1-stack-deps',
      when: { 'intent.primary': { $not: 'unknown' } },
      score: 2,
    });
  }

  return {
    rules,
    exclude,
    minScore: 3,
  };
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Convert TaskDNA to a flat record for condition evaluation.
 * Preserves nested structure for path-based access.
 */
function taskDNAToRecord(dna: TaskDNA): Record<string, unknown> {
  return {
    intent: {
      primary: dna.intent.primary,
      secondary: dna.intent.secondary,
      confidence: dna.intent.confidence,
    },
    domains: dna.domains,
    operations: dna.operations,
    complexity: dna.complexity,
    scope: dna.scope,
  };
}

/**
 * Infer intent types from a list of keywords.
 * Returns a map of intent → strength (number of matching keywords).
 */
function inferIntentsFromKeywords(keywords: string[]): Map<string, number> {
  const KEYWORD_TO_INTENT: Record<string, string> = {
    security: 'security', auth: 'security', jwt: 'security', csrf: 'security',
    xss: 'security', encryption: 'security', vulnerability: 'security', authentication: 'security',
    fix: 'bugfix', bug: 'bugfix', error: 'bugfix', crash: 'bugfix', regression: 'bugfix',
    test: 'testing', spec: 'testing', coverage: 'testing', vitest: 'testing',
    mock: 'testing', unit: 'testing', integration: 'testing',
    refactor: 'refactor', cleanup: 'refactor', restructure: 'refactor', simplify: 'refactor',
    doc: 'documentation', readme: 'documentation', changelog: 'documentation',
    performance: 'performance', optimize: 'performance', speed: 'performance', cache: 'performance',
    ui: 'design', component: 'design', layout: 'design', style: 'design',
    ci: 'devops', deploy: 'devops', pipeline: 'devops', docker: 'devops',
    config: 'config', setting: 'config', env: 'config',
    api: 'implementation', endpoint: 'implementation', route: 'implementation',
    handler: 'implementation', feature: 'implementation',
  };

  const intentCounts = new Map<string, number>();
  for (const kw of keywords) {
    const intent = KEYWORD_TO_INTENT[kw.toLowerCase()];
    if (intent) {
      intentCounts.set(intent, (intentCounts.get(intent) ?? 0) + 1);
    }
  }
  return intentCounts;
}

function extractDomainFromScope(scopePath: string): string | null {
  const cleaned = scopePath
    .replace(/\/$/, '')
    .replace(/^(src|tests|test|lib)\//, '');
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  const domain = parts[0]!;
  if (['index', 'utils'].includes(domain)) return null;
  return domain;
}

// ─── Dynamic Exclusions ───────────────────────────────────────────────────

/**
 * Compute dynamic agent exclusions based on intent + scope.
 * Replaces hard-coded global exclusion of architecture-planner, frontend-designer,
 * migration-specialist with context-aware per-task exclusions.
 */
export function getDynamicExclusions(
  intent: string,
  scopeDirs: string[],
): string[] {
  const exclusions = new Set<string>();

  // Intent-based exclusions
  switch (intent) {
    case 'documentation':
      exclusions.add('migration-specialist');
      exclusions.add('devops-engineer');
      exclusions.add('security-auditor');
      break;
    // 'testing' removed as primary intent (Sprint 148 taxonomy reform)
    // Test-related exclusions now handled via 'test-coverage' tag
    case 'security':
      // No exclusions — security tasks may touch any domain
      break;
    case 'design':
      exclusions.add('data-engineer');
      exclusions.add('migration-specialist');
      break;
  }

  // Scope-based exclusions
  for (const dir of scopeDirs) {
    if (dir.startsWith('src/orchestra/') || dir === 'src/orchestra') {
      exclusions.add('frontend-designer');
      exclusions.add('accessibility-auditor');
    }
    if (dir.startsWith('src/cli/') || dir === 'src/cli') {
      exclusions.add('frontend-designer');
      exclusions.add('accessibility-auditor');
      exclusions.add('migration-specialist');
    }
    if (dir.startsWith('src/dashboard/') || dir === 'src/dashboard') {
      exclusions.add('data-engineer');
      exclusions.add('migration-specialist');
    }
  }

  return [...exclusions];
}

// ─── Skill→Agent Affinity Signal (Sprint 212-008) ──────────────────────────
//
// Routing skew fix: skill routing diversifies (frontend-design, security-specialist,
// api-builder skills attach to tasks) but AGENT selection collapses to refactorer
// for ~75% of a sprint because the routing engine has no skill→agent bonus.
//
// SKILL_AGENT_MAP wires the implicit affinity: when a domain skill is in the
// task's assigned skill set, the corresponding domain agent receives
// SKILL_AGENT_AFFINITY_BONUS in agent scoring. Refactorer remains a viable
// candidate (no penalty, no negative score) — the bonus is purely additive,
// preserving Sprint 205's "refactorer-still-eligible" guard.
//
// The mapping mirrors the natural skill↔agent specialization pairs in the
// built-in pool (DECKENT.md "Built-in Agents 15" / "Built-in Skills 21").

/** Score added to an agent when at least one of the task's assigned skills
 *  maps to that agent in SKILL_AGENT_MAP. Equal to DOMAIN_MATCH_BONUS in
 *  routing-engine.ts so skill-derived affinity is on par with intent/domain
 *  derived affinity — no signal dominates. */
export const SKILL_AGENT_AFFINITY_BONUS = 3;

/**
 * Map a built-in skill id → the built-in agent id whose specialization aligns
 * with that skill. Multiple skills can map to the same agent (e.g. both
 * `frontend-design` and `react-specialist` → `frontend-designer`).
 *
 * Refactorer, architect, code-reviewer, bug-fixer are intentionally absent —
 * they are generalist agents that should be selected via base activation
 * scoring (intent/domain rules), not by skill→agent affinity.
 */
export const SKILL_AGENT_MAP: Readonly<Record<string, string>> = {
  // Frontend / UI cluster
  'frontend-design':       'frontend-designer',
  'react-specialist':      'frontend-designer',
  'accessibility-expert':  'accessibility-auditor',

  // Security cluster
  'security-specialist':   'security-auditor',

  // API cluster
  'api-builder':           'api-builder',
  'graphql-expert':        'api-builder',

  // Docs cluster
  'documentation-writer':  'doc-writer',

  // DevOps / infra cluster
  'docker-expert':         'devops-engineer',
  'devops-engineer':       'devops-engineer',
  'ci-testing':            'ci-guardian',

  // Data / migration cluster
  'database-migration':    'data-engineer',
  'migration-expert':      'migration-specialist',

  // Performance / architecture cluster
  'performance-optimizer': 'performance-analyzer',
  'system-architect':      'architect',
};

/**
 * Skill→agent affinity bonus for agent scoring.
 *
 * Returns SKILL_AGENT_AFFINITY_BONUS when at least one skill in
 * `assignedSkills` maps to `agentId` via SKILL_AGENT_MAP. The bonus is
 * capped at one application (matching DOMAIN_MATCH_BONUS semantics) so a
 * task with three frontend skills still grants frontend-designer +3, not +9.
 *
 * @param agentId         The agent being scored.
 * @param assignedSkills  Skill ids the routing engine plans to assign
 *                        (or has assigned) to this task.
 * @returns SKILL_AGENT_AFFINITY_BONUS if any assigned skill maps to
 *          agentId, 0 otherwise.
 */
export function getSkillAgentAffinityBonus(
  agentId: string,
  assignedSkills: readonly string[] | undefined,
): number {
  if (!assignedSkills || assignedSkills.length === 0) return 0;
  for (const skillId of assignedSkills) {
    if (SKILL_AGENT_MAP[skillId] === agentId) {
      return SKILL_AGENT_AFFINITY_BONUS;
    }
  }
  return 0;
}
