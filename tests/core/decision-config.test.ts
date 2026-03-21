import { describe, it, expect } from 'vitest';

import {
  createDefaultDecisionConfig,
  createDefaultLearningConfig,
  createDefaultCollaborationConfig,
  validateDecisionConfig,
  validateLearningConfig,
  validateCollaborationConfig,
  type DecisionEngineConfig,
  type LearningConfig,
  type CollaborationConfig,
} from '../../src/core/decision-config.js';

// ─── createDefaultDecisionConfig ────────────────────────────────────

describe('createDefaultDecisionConfig', () => {
  it('returns enabled by default', () => {
    const config = createDefaultDecisionConfig();
    expect(config.enabled).toBe(true);
  });

  it('sets agentSelectionThreshold to 3', () => {
    expect(createDefaultDecisionConfig().agentSelectionThreshold).toBe(3);
  });

  it('sets maxSkillsPerTask to 3', () => {
    expect(createDefaultDecisionConfig().maxSkillsPerTask).toBe(3);
  });

  it('sets learningEnabled to true', () => {
    expect(createDefaultDecisionConfig().learningEnabled).toBe(true);
  });

  it('sets learningMaxSprints to 10', () => {
    expect(createDefaultDecisionConfig().learningMaxSprints).toBe(10);
  });

  it('sets decisionLogging to true', () => {
    expect(createDefaultDecisionConfig().decisionLogging).toBe(true);
  });

  it('sets adaptiveAgentEnabled to false (opt-in)', () => {
    expect(createDefaultDecisionConfig().adaptiveAgentEnabled).toBe(false);
  });

  it('returns a new object each time', () => {
    const a = createDefaultDecisionConfig();
    const b = createDefaultDecisionConfig();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ─── createDefaultLearningConfig ────────────────────────────────────

describe('createDefaultLearningConfig', () => {
  it('returns enabled by default', () => {
    expect(createDefaultLearningConfig().enabled).toBe(true);
  });

  it('sets maxSprintsToKeep to 10', () => {
    expect(createDefaultLearningConfig().maxSprintsToKeep).toBe(10);
  });

  it('sets minConfidenceForRecommendation to 0.6', () => {
    expect(createDefaultLearningConfig().minConfidenceForRecommendation).toBe(0.6);
  });

  it('sets decayInterval to 5', () => {
    expect(createDefaultLearningConfig().decayInterval).toBe(5);
  });

  it('sets patternMigrationDone to false', () => {
    expect(createDefaultLearningConfig().patternMigrationDone).toBe(false);
  });
});

// ─── createDefaultCollaborationConfig ───────────────────────────────

describe('createDefaultCollaborationConfig', () => {
  it('enables parallelPipelines by default', () => {
    expect(createDefaultCollaborationConfig().parallelPipelines).toBe(true);
  });

  it('disables sharedMemoryEnabled by default', () => {
    expect(createDefaultCollaborationConfig().sharedMemoryEnabled).toBe(false);
  });

  it('sets conflictStrategy to last_writer_wins', () => {
    expect(createDefaultCollaborationConfig().conflictStrategy).toBe('last_writer_wins');
  });
});

// ─── validateDecisionConfig ─────────────────────────────────────────

describe('validateDecisionConfig', () => {
  it('validates a correct default config', () => {
    const result = validateDecisionConfig(createDefaultDecisionConfig());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects null config', () => {
    const result = validateDecisionConfig(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Config must be a non-null object');
  });

  it('rejects non-object config', () => {
    const result = validateDecisionConfig('string');
    expect(result.valid).toBe(false);
  });

  it('rejects non-boolean enabled', () => {
    const result = validateDecisionConfig({ enabled: 'yes' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('enabled must be a boolean');
  });

  it('rejects agentSelectionThreshold out of range', () => {
    const result = validateDecisionConfig({ agentSelectionThreshold: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('agentSelectionThreshold');
  });

  it('accepts agentSelectionThreshold in range', () => {
    const result = validateDecisionConfig({ agentSelectionThreshold: 5 });
    expect(result.valid).toBe(true);
  });

  it('rejects maxSkillsPerTask out of range', () => {
    const result = validateDecisionConfig({ maxSkillsPerTask: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('maxSkillsPerTask');
  });

  it('rejects non-boolean learningEnabled', () => {
    const result = validateDecisionConfig({ learningEnabled: 1 });
    expect(result.valid).toBe(false);
  });

  it('rejects learningMaxSprints out of range', () => {
    const result = validateDecisionConfig({ learningMaxSprints: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('learningMaxSprints');
  });

  it('rejects learningMaxSprints above 100', () => {
    const result = validateDecisionConfig({ learningMaxSprints: 101 });
    expect(result.valid).toBe(false);
  });

  it('rejects non-boolean decisionLogging', () => {
    const result = validateDecisionConfig({ decisionLogging: 'true' });
    expect(result.valid).toBe(false);
  });

  it('rejects non-boolean adaptiveAgentEnabled', () => {
    const result = validateDecisionConfig({ adaptiveAgentEnabled: 1 });
    expect(result.valid).toBe(false);
  });

  it('accepts empty object (all optional)', () => {
    const result = validateDecisionConfig({});
    expect(result.valid).toBe(true);
  });

  it('collects multiple errors', () => {
    const result = validateDecisionConfig({
      enabled: 'yes',
      agentSelectionThreshold: 0,
      maxSkillsPerTask: 100,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── validateLearningConfig ─────────────────────────────────────────

describe('validateLearningConfig', () => {
  it('validates a correct default config', () => {
    const result = validateLearningConfig(createDefaultLearningConfig());
    expect(result.valid).toBe(true);
  });

  it('rejects null', () => {
    const result = validateLearningConfig(null);
    expect(result.valid).toBe(false);
  });

  it('rejects non-boolean enabled', () => {
    const result = validateLearningConfig({ enabled: 1 });
    expect(result.valid).toBe(false);
  });

  it('rejects maxSprintsToKeep out of range', () => {
    expect(validateLearningConfig({ maxSprintsToKeep: 0 }).valid).toBe(false);
    expect(validateLearningConfig({ maxSprintsToKeep: 101 }).valid).toBe(false);
  });

  it('rejects minConfidenceForRecommendation out of 0-1 range', () => {
    expect(validateLearningConfig({ minConfidenceForRecommendation: -0.1 }).valid).toBe(false);
    expect(validateLearningConfig({ minConfidenceForRecommendation: 1.1 }).valid).toBe(false);
  });

  it('accepts minConfidenceForRecommendation at boundaries', () => {
    expect(validateLearningConfig({ minConfidenceForRecommendation: 0 }).valid).toBe(true);
    expect(validateLearningConfig({ minConfidenceForRecommendation: 1 }).valid).toBe(true);
  });

  it('rejects decayInterval out of range', () => {
    expect(validateLearningConfig({ decayInterval: 0 }).valid).toBe(false);
    expect(validateLearningConfig({ decayInterval: 51 }).valid).toBe(false);
  });

  it('rejects non-boolean patternMigrationDone', () => {
    expect(validateLearningConfig({ patternMigrationDone: 'yes' }).valid).toBe(false);
  });

  it('accepts empty object', () => {
    expect(validateLearningConfig({}).valid).toBe(true);
  });
});

// ─── validateCollaborationConfig ────────────────────────────────────

describe('validateCollaborationConfig', () => {
  it('validates a correct default config', () => {
    const result = validateCollaborationConfig(createDefaultCollaborationConfig());
    expect(result.valid).toBe(true);
  });

  it('rejects null', () => {
    expect(validateCollaborationConfig(null).valid).toBe(false);
  });

  it('rejects non-boolean parallelPipelines', () => {
    expect(validateCollaborationConfig({ parallelPipelines: 'yes' }).valid).toBe(false);
  });

  it('rejects non-boolean sharedMemoryEnabled', () => {
    expect(validateCollaborationConfig({ sharedMemoryEnabled: 1 }).valid).toBe(false);
  });

  it('rejects invalid conflictStrategy', () => {
    const result = validateCollaborationConfig({ conflictStrategy: 'invalid' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('conflictStrategy');
  });

  it('accepts valid conflictStrategy values', () => {
    expect(validateCollaborationConfig({ conflictStrategy: 'last_writer_wins' }).valid).toBe(true);
    expect(validateCollaborationConfig({ conflictStrategy: 'first_writer_wins' }).valid).toBe(true);
    expect(validateCollaborationConfig({ conflictStrategy: 'manual' }).valid).toBe(true);
  });

  it('accepts empty object', () => {
    expect(validateCollaborationConfig({}).valid).toBe(true);
  });
});

// ─── DeckentConfig integration ──────────────────────────────────────

describe('DeckentConfig decision_engine field', () => {
  it('DecisionEngineConfig type matches createDefaultDecisionConfig output', () => {
    const config: DecisionEngineConfig = createDefaultDecisionConfig();
    expect(config.enabled).toBe(true);
    expect(typeof config.agentSelectionThreshold).toBe('number');
    expect(typeof config.maxSkillsPerTask).toBe('number');
    expect(typeof config.learningEnabled).toBe('boolean');
    expect(typeof config.learningMaxSprints).toBe('number');
    expect(typeof config.decisionLogging).toBe('boolean');
    expect(typeof config.adaptiveAgentEnabled).toBe('boolean');
  });

  it('LearningConfig type matches createDefaultLearningConfig output', () => {
    const config: LearningConfig = createDefaultLearningConfig();
    expect(typeof config.enabled).toBe('boolean');
    expect(typeof config.maxSprintsToKeep).toBe('number');
    expect(typeof config.minConfidenceForRecommendation).toBe('number');
    expect(typeof config.decayInterval).toBe('number');
    expect(typeof config.patternMigrationDone).toBe('boolean');
  });

  it('CollaborationConfig type matches createDefaultCollaborationConfig output', () => {
    const config: CollaborationConfig = createDefaultCollaborationConfig();
    expect(typeof config.parallelPipelines).toBe('boolean');
    expect(typeof config.sharedMemoryEnabled).toBe('boolean');
    expect(typeof config.conflictStrategy).toBe('string');
  });
});
