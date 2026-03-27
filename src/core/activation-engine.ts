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
