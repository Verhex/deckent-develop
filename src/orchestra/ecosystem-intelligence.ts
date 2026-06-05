// ─── Ecosystem Intelligence ───────────────────────────────────────────────────
// Analyzes newly installed skills and auto-generates V2 activation rules.
// Called by `skill install` so that every skill gets intent-based routing rules
// without requiring manual configuration.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { debugLog } from '../core/utils.js';
import type {
  ActivationConfig,
  ActivationRule,
  ExclusionRule,
  IntentType,
} from '../core/routing-types.js';

// ─── Keyword Mappings ─────────────────────────────────────────────────────────

/** Maps skill trigger/category keywords to intent types */
const KEYWORD_TO_INTENT: Record<string, IntentType> = {
  // Testing → implementation (Sprint 148: testing removed as primary intent)
  test: 'implementation', testing: 'implementation', spec: 'implementation', coverage: 'implementation',
  assertion: 'implementation', mock: 'implementation', vitest: 'implementation', jest: 'implementation',
  // CI/DevOps
  ci: 'devops', deploy: 'devops', pipeline: 'devops', docker: 'devops',
  github: 'devops', actions: 'devops', workflow: 'devops', devops: 'devops',
  // Documentation
  doc: 'documentation', docs: 'documentation', documentation: 'documentation',
  readme: 'documentation', guide: 'documentation', markdown: 'documentation',
  // Security
  security: 'security', auth: 'security', vulnerability: 'security',
  audit: 'security', crypto: 'security', permission: 'security',
  // Performance
  performance: 'performance', optimization: 'performance', cache: 'performance',
  speed: 'performance', profiling: 'performance', benchmark: 'performance',
  // Refactoring
  refactor: 'refactor', clean: 'refactor', architecture: 'refactor',
  // Migration
  migration: 'migration', schema: 'migration', upgrade: 'migration',
  // Implementation (fallback)
  typescript: 'implementation', python: 'implementation', react: 'implementation',
  api: 'implementation', database: 'implementation', framework: 'implementation',
  language: 'implementation', code: 'implementation',
};

/** Maps skill category field directly to intent type */
const CATEGORY_TO_INTENT: Record<string, IntentType> = {
  language: 'implementation',
  framework: 'implementation',
  tool: 'implementation',
  domain: 'implementation',
  workflow: 'devops',
};

/** Intents that should be excluded for certain primary intents */
const EXCLUSION_RULES: Record<IntentType, IntentType[]> = {
  documentation: ['implementation'],
  // 'testing' removed as primary intent (Sprint 148)
  security:      ['documentation'],
  devops:        [],
  implementation:[], bugfix: [], refactor: [], config: [],
  performance:   [], design: [], migration: [], architecture: [], unknown: [],
};

// ─── Core Function ────────────────────────────────────────────────────────────

/**
 * Analyze a newly installed skill and generate V2 activation rules.
 * Reads manifest.json and SKILL.md / PROMPT.md / README.md from the skill directory.
 * Uses keyword analysis to infer the most appropriate intent-based activation rules.
 *
 * @param skillPath - Absolute path to the skill directory
 * @returns ActivationConfig with generated activation and exclusion rules
 */
export function analyzeNewSkill(skillPath: string): ActivationConfig {
  // ── 1. Read manifest ──────────────────────────────────────────────
  const manifestPath = join(skillPath, 'manifest.json');
  let manifest: Record<string, unknown> = {};
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
    } catch (e) {
      debugLog('analyzeNewSkill:readManifest', e);
    }
  }

  // ── 2. Read skill content (SKILL.md, PROMPT.md, or README.md) ────
  let skillContent = '';
  for (const filename of ['SKILL.md', 'PROMPT.md', 'README.md']) {
    const contentPath = join(skillPath, filename);
    if (existsSync(contentPath)) {
      try {
        skillContent = readFileSync(contentPath, 'utf-8').toLowerCase();
        break;
      } catch (e) {
        debugLog('analyzeNewSkill:readSkillContent', e);
      }
    }
  }

  // ── 3. Collect keywords ───────────────────────────────────────────
  const id       = typeof manifest.id          === 'string' ? manifest.id.toLowerCase()          : '';
  const name     = typeof manifest.name        === 'string' ? manifest.name.toLowerCase()        : '';
  const desc     = typeof manifest.description === 'string' ? manifest.description.toLowerCase() : '';
  const category = typeof manifest.category    === 'string' ? manifest.category.toLowerCase()    : '';
  const triggers = Array.isArray(manifest.triggers) ? (manifest.triggers as string[]) : [];

  // Extract relevant words from skill content (first 500 chars, known keywords only)
  const contentKeywords = skillContent
    .slice(0, 500)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && Object.prototype.hasOwnProperty.call(KEYWORD_TO_INTENT, w))
    .slice(0, 20); // cap to avoid noise

  // All text sources combined for scoring
  const allWords = [id, name, desc, category, ...triggers, ...contentKeywords]
    .flatMap(w => w.split(/[\s_-]+/)) // split compound words
    .map(w => w.toLowerCase())
    .filter(Boolean);

  // ── 4. Score intent types ──────────────────────────────────────────
  const intentScores = new Map<IntentType, number>();

  for (const word of allWords) {
    const intent = KEYWORD_TO_INTENT[word];
    if (intent) {
      intentScores.set(intent, (intentScores.get(intent) ?? 0) + 1);
    }
  }

  // Category field adds a bonus vote for its mapped intent
  const catIntent = CATEGORY_TO_INTENT[category];
  if (catIntent) {
    intentScores.set(catIntent, (intentScores.get(catIntent) ?? 0) + 1);
  }

  // ── 5. Build activation rules ──────────────────────────────────────
  const sortedIntents = [...intentScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3); // top 3 intents become rules

  const rules: ActivationRule[] = sortedIntents.map(([intent, count]) => ({
    name: `${id || 'skill'}-${intent}`,
    when: { 'intent.primary': intent },
    score: count >= 3 ? 10 : count >= 2 ? 8 : 5,
  }));

  // Fallback: ensure at least one rule exists
  if (rules.length === 0) {
    rules.push({
      name: `${id || 'skill'}-default`,
      when: { 'intent.primary': 'implementation' as IntentType },
      score: 3,
    });
  }

  // ── 6. Build exclusion rules ───────────────────────────────────────
  const primaryIntent = sortedIntents[0]?.[0];
  const excludedIntents = primaryIntent ? (EXCLUSION_RULES[primaryIntent] ?? []) : [];
  const exclude: ExclusionRule[] = excludedIntents.map(excl => ({
    when: { 'intent.primary': excl },
  }));

  return { rules, exclude, minScore: 5 };
}

/**
 * Analyze a skill's in-memory metadata to generate V2 activation rules.
 * Unlike analyzeNewSkill(), requires no filesystem access — all data is taken
 * from the already-loaded skill definition fields.
 *
 * Used by the routing engine to enrich skill activation for V1 (trigger-based)
 * skills not yet persisted via `skill install` (which writes V2 rules to manifest.json).
 *
 * @param data - Subset of SkillDefinition fields available in-memory
 * @returns ActivationConfig with intent-based activation and exclusion rules
 */
export function analyzeSkillInMemory(data: {
  id?: string;
  name?: string;
  description?: string;
  category?: string;
  triggers?: string[];
}): ActivationConfig {
  const id       = (data.id          ?? '').toLowerCase();
  const name     = (data.name        ?? '').toLowerCase();
  const desc     = (data.description ?? '').toLowerCase();
  const category = (data.category    ?? '').toLowerCase();
  const triggers = Array.isArray(data.triggers) ? data.triggers : [];

  const allWords = [id, name, desc, category, ...triggers]
    .flatMap(w => w.split(/[\s_-]+/))
    .map(w => w.toLowerCase())
    .filter(Boolean);

  const intentScores = new Map<IntentType, number>();
  for (const word of allWords) {
    const intent = KEYWORD_TO_INTENT[word];
    if (intent) {
      intentScores.set(intent, (intentScores.get(intent) ?? 0) + 1);
    }
  }

  const catIntent = CATEGORY_TO_INTENT[category];
  if (catIntent) {
    intentScores.set(catIntent, (intentScores.get(catIntent) ?? 0) + 1);
  }

  const sortedIntents = [...intentScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const rules: ActivationRule[] = sortedIntents.map(([intent, count]) => ({
    name: `${id || 'skill'}-${intent}`,
    when: { 'intent.primary': intent },
    score: count >= 3 ? 10 : count >= 2 ? 8 : 5,
  }));

  if (rules.length === 0) {
    rules.push({
      name: `${id || 'skill'}-default`,
      when: { 'intent.primary': 'implementation' as IntentType },
      score: 3,
    });
  }

  const primaryIntent = sortedIntents[0]?.[0];
  const excludedIntents = primaryIntent ? (EXCLUSION_RULES[primaryIntent] ?? []) : [];
  const exclude: ExclusionRule[] = excludedIntents.map(excl => ({
    when: { 'intent.primary': excl },
  }));

  return { rules, exclude, minScore: 5 };
}

/**
 * Persist a generated ActivationConfig into a skill's manifest.json.
 * Skips write if the manifest already has manifestVersion 2 (idempotent).
 *
 * @param skillPath - Absolute path to the skill directory
 * @param activation - The activation config to persist
 */
export function persistSkillActivation(skillPath: string, activation: ActivationConfig): void {
  const manifestPath = join(skillPath, 'manifest.json');
  if (!existsSync(manifestPath)) return;

  let manifest: Record<string, unknown> = {};
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
  } catch (e) {
    debugLog('persistSkillActivation:readManifest', e);
    return;
  }

  // Idempotent: don't overwrite an existing V2 manifest
  if (manifest['manifestVersion'] === 2) return;

  manifest['manifestVersion'] = 2;
  manifest['activation'] = activation;

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
