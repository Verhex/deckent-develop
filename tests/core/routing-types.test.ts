import { describe, it, expect } from 'vitest';
import {
  createDefaultTaskDNA,
  createDefaultActivationConfig,
  createDefaultRoutingEngineConfig,
  isValidIntentType,
  ALL_INTENT_TYPES,
  SKILL_BUDGET_BY_SIZE,
  LEARNING_BONUS_CAP,
} from '../../src/core/routing-types.js';

describe('routing-types helpers', () => {
  describe('createDefaultTaskDNA', () => {
    it('returns unknown intent with zero confidence', () => {
      const dna = createDefaultTaskDNA();
      expect(dna.intent.primary).toBe('unknown');
      expect(dna.intent.confidence).toBe(0);
      expect(dna.intent.secondary).toEqual([]);
    });

    it('returns empty domains and operations', () => {
      const dna = createDefaultTaskDNA();
      expect(dna.domains).toEqual([]);
      expect(dna.operations).toEqual([]);
    });

    it('returns small complexity by default', () => {
      const dna = createDefaultTaskDNA();
      expect(dna.complexity.estimatedSize).toBe('small');
      expect(dna.complexity.fileCount).toBe(0);
      expect(dna.complexity.crossCutting).toBe(false);
    });
  });

  describe('createDefaultActivationConfig', () => {
    it('returns empty rules with default minScore 5', () => {
      const config = createDefaultActivationConfig();
      expect(config.rules).toEqual([]);
      expect(config.exclude).toEqual([]);
      expect(config.minScore).toBe(5);
    });

    it('accepts custom minScore', () => {
      const config = createDefaultActivationConfig(3);
      expect(config.minScore).toBe(3);
    });
  });

  describe('createDefaultRoutingEngineConfig', () => {
    it('returns correct defaults', () => {
      const config = createDefaultRoutingEngineConfig();
      expect(config.agentMinScore).toBe(5);
      expect(config.skillMinScore).toBe(3);
      expect(config.maxSkillsDefault).toBe(3);
    });
  });

  describe('isValidIntentType', () => {
    it('returns true for valid intent types', () => {
      expect(isValidIntentType('implementation')).toBe(true);
      expect(isValidIntentType('security')).toBe(true);
      // Sprint 148: 'testing' removed from IntentType union
      expect(isValidIntentType('testing')).toBe(false);
      expect(isValidIntentType('unknown')).toBe(true);
    });

    it('returns false for invalid types', () => {
      expect(isValidIntentType('invalid')).toBe(false);
      expect(isValidIntentType('')).toBe(false);
      expect(isValidIntentType('SECURITY')).toBe(false);
    });
  });

  describe('ALL_INTENT_TYPES', () => {
    it('contains 12 intent types (testing removed Sprint 148, architecture added V3)', () => {
      expect(ALL_INTENT_TYPES).toHaveLength(12);
    });

    it('includes core intent types (testing excluded)', () => {
      expect(ALL_INTENT_TYPES).toContain('implementation');
      expect(ALL_INTENT_TYPES).toContain('bugfix');
      expect(ALL_INTENT_TYPES).not.toContain('testing');
      expect(ALL_INTENT_TYPES).toContain('security');
      expect(ALL_INTENT_TYPES).toContain('unknown');
    });
  });

  describe('SKILL_BUDGET_BY_SIZE', () => {
    it('trivial gets 0 skills', () => {
      expect(SKILL_BUDGET_BY_SIZE.trivial).toBe(0);
    });

    it('large gets 3 skills', () => {
      expect(SKILL_BUDGET_BY_SIZE.large).toBe(3);
    });

    it('epic is capped at 3', () => {
      expect(SKILL_BUDGET_BY_SIZE.epic).toBe(3);
    });
  });

  describe('LEARNING_BONUS_CAP', () => {
    it('is 3', () => {
      expect(LEARNING_BONUS_CAP).toBe(3);
    });
  });
});
