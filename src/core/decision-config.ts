// ─── Decision Engine Config ─────────────────────────────────────────

export interface DecisionEngineConfig {
  enabled: boolean;  // default true
  agentSelectionThreshold: number;  // default 3
  maxSkillsPerTask: number;  // default 3
  learningEnabled: boolean;  // default true
  learningMaxSprints: number;  // default 10
  decisionLogging: boolean;  // default true
  adaptiveAgentEnabled: boolean;  // default false (opt-in)
}

// ─── Learning Config ────────────────────────────────────────────────

export interface LearningConfig {
  enabled: boolean;
  maxSprintsToKeep: number;
  minConfidenceForRecommendation: number;  // 0-1, default 0.6
  decayInterval: number;  // sprints between compaction
  patternMigrationDone: boolean;
  minSamplesForBonus?: number;  // minimum outcome samples before applying bonus (default 3)
  recentSprintWindow?: number;  // how many recent sprints to consider for recency bonus (default 3)
  sprintRecencySuccessBonus?: number;  // bonus for 100% success in recent window (default 3)
  sprintRecencyFailurePenalty?: number;  // penalty for 0% success in recent window (default -2)
}

// ─── Collaboration Config ───────────────────────────────────────────

export interface CollaborationConfig {
  parallelPipelines: boolean;  // default true
  sharedMemoryEnabled: boolean;  // default false
  conflictStrategy: 'last_writer_wins' | 'first_writer_wins' | 'manual';  // default last_writer_wins
}

// ─── Factory Functions ──────────────────────────────────────────────

export function createDefaultDecisionConfig(): DecisionEngineConfig {
  return {
    enabled: true,
    agentSelectionThreshold: 3,
    maxSkillsPerTask: 3,
    learningEnabled: true,
    learningMaxSprints: 10,
    decisionLogging: true,
    adaptiveAgentEnabled: false,
  };
}

export function createDefaultLearningConfig(): LearningConfig {
  return {
    enabled: true,
    maxSprintsToKeep: 10,
    minConfidenceForRecommendation: 0.6,
    decayInterval: 5,
    patternMigrationDone: false,
    minSamplesForBonus: 3,
    recentSprintWindow: 3,
    sprintRecencySuccessBonus: 3,
    sprintRecencyFailurePenalty: -2,
  };
}

export function createDefaultCollaborationConfig(): CollaborationConfig {
  return {
    parallelPipelines: true,
    sharedMemoryEnabled: false,
    conflictStrategy: 'last_writer_wins',
  };
}

// ─── Validation ─────────────────────────────────────────────────────

export function validateDecisionConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be a non-null object'] };
  }

  const c = config as Record<string, unknown>;

  // enabled
  if (c.enabled !== undefined && typeof c.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }

  // agentSelectionThreshold
  if (c.agentSelectionThreshold !== undefined) {
    if (typeof c.agentSelectionThreshold !== 'number' || c.agentSelectionThreshold < 1 || c.agentSelectionThreshold > 20) {
      errors.push('agentSelectionThreshold must be a number between 1 and 20');
    }
  }

  // maxSkillsPerTask
  if (c.maxSkillsPerTask !== undefined) {
    if (typeof c.maxSkillsPerTask !== 'number' || c.maxSkillsPerTask < 1 || c.maxSkillsPerTask > 10) {
      errors.push('maxSkillsPerTask must be a number between 1 and 10');
    }
  }

  // learningEnabled
  if (c.learningEnabled !== undefined && typeof c.learningEnabled !== 'boolean') {
    errors.push('learningEnabled must be a boolean');
  }

  // learningMaxSprints
  if (c.learningMaxSprints !== undefined) {
    if (typeof c.learningMaxSprints !== 'number' || c.learningMaxSprints < 1 || c.learningMaxSprints > 100) {
      errors.push('learningMaxSprints must be a number between 1 and 100');
    }
  }

  // decisionLogging
  if (c.decisionLogging !== undefined && typeof c.decisionLogging !== 'boolean') {
    errors.push('decisionLogging must be a boolean');
  }

  // adaptiveAgentEnabled
  if (c.adaptiveAgentEnabled !== undefined && typeof c.adaptiveAgentEnabled !== 'boolean') {
    errors.push('adaptiveAgentEnabled must be a boolean');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Learning Config Validation ─────────────────────────────────────

export function validateLearningConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Learning config must be a non-null object'] };
  }

  const c = config as Record<string, unknown>;

  if (c.enabled !== undefined && typeof c.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }

  if (c.maxSprintsToKeep !== undefined) {
    if (typeof c.maxSprintsToKeep !== 'number' || c.maxSprintsToKeep < 1 || c.maxSprintsToKeep > 100) {
      errors.push('maxSprintsToKeep must be a number between 1 and 100');
    }
  }

  if (c.minConfidenceForRecommendation !== undefined) {
    if (typeof c.minConfidenceForRecommendation !== 'number' || c.minConfidenceForRecommendation < 0 || c.minConfidenceForRecommendation > 1) {
      errors.push('minConfidenceForRecommendation must be a number between 0 and 1');
    }
  }

  if (c.decayInterval !== undefined) {
    if (typeof c.decayInterval !== 'number' || c.decayInterval < 1 || c.decayInterval > 50) {
      errors.push('decayInterval must be a number between 1 and 50');
    }
  }

  if (c.patternMigrationDone !== undefined && typeof c.patternMigrationDone !== 'boolean') {
    errors.push('patternMigrationDone must be a boolean');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Collaboration Config Validation ────────────────────────────────

const VALID_CONFLICT_STRATEGIES = ['last_writer_wins', 'first_writer_wins', 'manual'] as const;

export function validateCollaborationConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Collaboration config must be a non-null object'] };
  }

  const c = config as Record<string, unknown>;

  if (c.parallelPipelines !== undefined && typeof c.parallelPipelines !== 'boolean') {
    errors.push('parallelPipelines must be a boolean');
  }

  if (c.sharedMemoryEnabled !== undefined && typeof c.sharedMemoryEnabled !== 'boolean') {
    errors.push('sharedMemoryEnabled must be a boolean');
  }

  if (c.conflictStrategy !== undefined) {
    if (typeof c.conflictStrategy !== 'string' || !(VALID_CONFLICT_STRATEGIES as readonly string[]).includes(c.conflictStrategy)) {
      errors.push(`conflictStrategy must be one of: ${VALID_CONFLICT_STRATEGIES.join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
