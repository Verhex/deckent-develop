import { describe, it, expect } from 'vitest';
import { needsMigration, isV2Manifest, migrateAgentManifest, migrateSkillManifest } from '../../src/core/manifest-migrator.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';

describe('manifest-migrator', () => {
  describe('needsMigration', () => {
    it('returns true for v1 (no manifestVersion)', () => {
      expect(needsMigration({})).toBe(true);
    });

    it('returns true for manifestVersion 1', () => {
      expect(needsMigration({ manifestVersion: 1 })).toBe(true);
    });

    it('returns false for manifestVersion 2', () => {
      expect(needsMigration({ manifestVersion: 2 })).toBe(false);
    });
  });

  describe('isV2Manifest', () => {
    it('returns true for v2', () => {
      expect(isV2Manifest({ manifestVersion: 2 })).toBe(true);
    });

    it('returns false for v1', () => {
      expect(isV2Manifest({ manifestVersion: 1 })).toBe(false);
      expect(isV2Manifest({})).toBe(false);
    });
  });

  describe('migrateAgentManifest', () => {
    it('migrates v1 security-auditor agent', () => {
      const agent = createAgentDefinition({
        id: 'security-auditor',
        name: 'Security Auditor',
        triggerKeywords: ['security', 'auth', 'jwt', 'csrf'],
        triggerScopes: ['src/auth/', 'src/security/'],
        triggerFilePatterns: ['**/*.auth.ts'],
      });

      const migrated = migrateAgentManifest(agent);
      expect(migrated.manifestVersion).toBe(2);
      expect(migrated.activation).toBeDefined();
      expect(migrated.activation!.rules.length).toBeGreaterThan(0);
      expect(migrated.activation!.minScore).toBe(5);
      // V1 fields preserved
      expect(migrated.triggerKeywords).toEqual(['security', 'auth', 'jwt', 'csrf']);
    });

    it('no-ops on already-v2 agent', () => {
      const agent = createAgentDefinition({
        id: 'test',
        name: 'Test',
        manifestVersion: 2,
        activation: { rules: [{ when: { 'intent.primary': 'testing' }, score: 10 }], exclude: [], minScore: 5 },
      });

      const migrated = migrateAgentManifest(agent);
      expect(migrated.activation!.rules).toHaveLength(1);
      expect(migrated.activation!.rules[0]!.score).toBe(10);
    });

    it('handles agent with no trigger keywords', () => {
      const agent = createAgentDefinition({ id: 'empty', name: 'Empty' });
      const migrated = migrateAgentManifest(agent);
      expect(migrated.manifestVersion).toBe(2);
      expect(migrated.activation).toBeDefined();
    });
  });

  describe('migrateSkillManifest', () => {
    it('migrates v1 typescript-expert skill', () => {
      const skill = createSkillDefinition({
        id: 'typescript-expert',
        name: 'TypeScript Expert',
        category: 'language',
        triggers: ['typescript', 'type', 'interface'],
        stackDetection: { files: ['tsconfig.json'], dependencies: ['typescript'], commands: [] },
      });

      const migrated = migrateSkillManifest(skill);
      expect(migrated.manifestVersion).toBe(2);
      expect(migrated.activation).toBeDefined();
      expect(migrated.activation!.rules.length).toBeGreaterThan(0);
      expect(migrated.activation!.minScore).toBe(3);
      // V1 fields preserved
      expect(migrated.triggers).toContain('typescript');
    });

    it('migrates v1 ci-testing skill', () => {
      const skill = createSkillDefinition({
        id: 'ci-testing',
        name: 'CI Testing',
        category: 'workflow',
        triggers: ['test', 'ci', 'regression', 'coverage'],
      });

      const migrated = migrateSkillManifest(skill);
      expect(migrated.manifestVersion).toBe(2);
      expect(migrated.activation!.rules.length).toBeGreaterThan(0);
    });

    it('no-ops on already-v2 skill', () => {
      const skill = createSkillDefinition({
        id: 'v2-skill',
        name: 'V2 Skill',
        manifestVersion: 2,
        activation: { rules: [], exclude: [], minScore: 3 },
      });

      const migrated = migrateSkillManifest(skill);
      expect(migrated.activation!.rules).toHaveLength(0);
    });
  });
});
