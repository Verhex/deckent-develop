// ─── Skill System Types ─────────────────────────────────────────────────────
import type { ModelType } from './types.js';
import type { ActivationConfig } from './routing-types.js';

// ─── Skill Category ─────────────────────────────────────────────────────────

export type SkillCategory = 'language' | 'framework' | 'tool' | 'domain' | 'workflow';

// ─── Stack Detection Rule ───────────────────────────────────────────────────

export interface StackDetectionRule {
  files: string[];         // file patterns to check existence
  dependencies: string[];  // package.json deps to check
  commands: string[];      // CLI commands to check
}

// ─── Prompt Injection Config ────────────────────────────────────────────────

export interface PromptInjectionConfig {
  position: 'prepend' | 'append' | 'section';
  maxTokens: number;  // default 1500
}

// ─── Skill Stats ────────────────────────────────────────────────────────────

export interface SkillStats {
  totalUses: number;
  successRate: number;     // 0.0-1.0
  avgCoverage: number;     // 0-100
  lastUsedInSprint: string;
}

// ─── Skill Definition ───────────────────────────────────────────────────────

export interface SkillDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  entrypoint: string;       // SKILL.md path
  category: SkillCategory;
  triggers: string[];
  stackDetection: StackDetectionRule;
  composableWith: string[];
  priority: number;         // higher = selected first
  promptInjection: PromptInjectionConfig;
  model?: ModelType;
  enabled: boolean;
  stats: SkillStats;
  /** Manifest version: 1 (v1 triggers), 2 (v2 activation rules) */
  manifestVersion?: 1 | 2;
  /** V2 activation rules — if present, used instead of triggers */
  activation?: ActivationConfig;
}

// ─── Project Stack ──────────────────────────────────────────────────────────

export interface ProjectStack {
  language: string;
  framework: string;
  dependencies: string[];
  buildTool: string;
  testFramework: string;
  detectedAt: string;
  detectedLanguages?: string[];
  subProjects?: string[];
}

// ─── Skill Selection Result ─────────────────────────────────────────────────

export interface SkillSelectionResult {
  skills: SkillDefinition[];
  scores: Map<string, number>;
  truncated: boolean;  // true if capped at max skills
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create default skill stats with zeroed counters.
 */
export function createDefaultSkillStats(): SkillStats {
  return {
    totalUses: 0,
    successRate: 0,
    avgCoverage: 0,
    lastUsedInSprint: '',
  };
}

/**
 * Create a SkillDefinition with sensible defaults.
 * Requires at minimum `id` and `name`.
 */
export function createSkillDefinition(
  partial: Partial<SkillDefinition> & { id: string; name: string },
): SkillDefinition {
  return {
    version: '0.1.0',
    description: '',
    entrypoint: 'SKILL.md',
    category: 'tool',
    triggers: [],
    stackDetection: { files: [], dependencies: [], commands: [] },
    composableWith: [],
    priority: 0,
    promptInjection: { position: 'append', maxTokens: 1500 },
    enabled: true,
    stats: createDefaultSkillStats(),
    ...partial,
  };
}
