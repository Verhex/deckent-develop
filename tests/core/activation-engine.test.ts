import { describe, it, expect } from 'vitest';
import {
  evaluateActivation,
  evaluateRule,
  evaluateExclusion,
  evaluateRuleViaSecondary,
  migrateV1AgentToActivation,
  migrateV1SkillToActivation,
  SKILL_AGENT_AFFINITY_BONUS,
} from '../../src/core/activation-engine.js';
import type { TaskDNA, ActivationConfig } from '../../src/core/routing-types.js';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function makeSecurityDNA(): TaskDNA {
  return {
    intent: { primary: 'security', secondary: ['testing'], confidence: 0.85 },
    domains: [{ name: 'auth', weight: 0.6 }, { name: 'api', weight: 0.4 }],
    operations: [{ type: 'modify', weight: 0.7 }, { type: 'test', weight: 0.3 }],
    complexity: { fileCount: 3, moduleCount: 2, crossCutting: true, estimatedSize: 'medium' },
    scope: { writeRatio: { 'src/': 0.67, 'tests/': 0.33 }, primaryWriteTarget: 'src/', testWriteRatio: 0.33 },
  };
}

function makeImplementationDNA(): TaskDNA {
  return {
    intent: { primary: 'implementation', secondary: ['testing'], confidence: 0.9 },
    domains: [{ name: 'cli', weight: 0.5 }, { name: 'orchestra', weight: 0.5 }],
    operations: [{ type: 'modify', weight: 0.85 }, { type: 'test', weight: 0.15 }],
    complexity: { fileCount: 2, moduleCount: 2, crossCutting: true, estimatedSize: 'large' },
    scope: { writeRatio: { 'src/': 1.0 }, primaryWriteTarget: 'src/', testWriteRatio: 0 },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('activation-engine', () => {
  describe('evaluateActivation', () => {
    it('scores matching rules', () => {
      const config: ActivationConfig = {
        rules: [
          { name: 'security-primary', when: { 'intent.primary': 'security' }, score: 10 },
          { name: 'auth-domain', when: { domains: { $contains: 'auth' } }, score: 5 },
        ],
        exclude: [],
        minScore: 5,
      };

      const result = evaluateActivation(makeSecurityDNA(), config);
      expect(result.score).toBe(15);
      expect(result.excluded).toBe(false);
      expect(result.matchedRules).toContain('security-primary');
      expect(result.matchedRules).toContain('auth-domain');
    });

    it('returns 0 for non-matching rules', () => {
      const config: ActivationConfig = {
        rules: [
          { name: 'design-primary', when: { 'intent.primary': 'design' }, score: 10 },
        ],
        exclude: [],
        minScore: 5,
      };

      const result = evaluateActivation(makeSecurityDNA(), config);
      expect(result.score).toBe(0);
      expect(result.matchedRules).toHaveLength(0);
    });

    it('excludes when exclusion rule matches', () => {
      const config: ActivationConfig = {
        rules: [
          { name: 'catch-all', when: { 'intent.primary': { $not: 'unknown' } }, score: 5 },
        ],
        exclude: [
          { name: 'not-for-impl', when: { 'intent.primary': 'implementation' }, reason: 'Not for implementation' },
        ],
        minScore: 3,
      };

      const result = evaluateActivation(makeImplementationDNA(), config);
      expect(result.excluded).toBe(true);
      expect(result.score).toBe(0);
      expect(result.excludeReason).toBe('Not for implementation');
    });

    it('does not exclude when exclusion rule does not match', () => {
      const config: ActivationConfig = {
        rules: [
          { when: { 'intent.primary': 'security' }, score: 10 },
        ],
        exclude: [
          { when: { 'intent.primary': 'implementation' } },
        ],
        minScore: 5,
      };

      const result = evaluateActivation(makeSecurityDNA(), config);
      expect(result.excluded).toBe(false);
      expect(result.score).toBe(10);
    });

    it('accumulates scores from multiple matching rules', () => {
      const config: ActivationConfig = {
        rules: [
          { when: { 'intent.primary': 'security' }, score: 5 },
          { when: { domains: { $contains: 'auth' } }, score: 3 },
          { when: { 'complexity.crossCutting': true }, score: 2 },
        ],
        exclude: [],
        minScore: 5,
      };

      const result = evaluateActivation(makeSecurityDNA(), config);
      expect(result.score).toBe(10);
    });

    it('handles empty config gracefully', () => {
      const config: ActivationConfig = { rules: [], exclude: [], minScore: 5 };
      const result = evaluateActivation(makeSecurityDNA(), config);
      expect(result.score).toBe(0);
      expect(result.excluded).toBe(false);
    });
  });

  // ── ADR-075 skill→agent affinity wire (Sprint 323-016) ────────────────────
  // evaluateActivation is the in-scope integration point: selectBestAgent
  // (routing-engine.ts) calls it per-agent and feeds result.score into
  // finalScore. The affinity signal is flag-gated and default-off.
  describe('evaluateActivation — skill→agent affinity (ADR-075, flag-gated)', () => {
    // A frontend agent config that scores +10 on a design task.
    const frontendConfig: ActivationConfig = {
      rules: [{ name: 'design-primary', when: { 'intent.primary': 'design' }, score: 10 }],
      exclude: [],
      minScore: 5,
    };
    function makeDesignDNA(): TaskDNA {
      return {
        intent: { primary: 'design', secondary: [], confidence: 0.9 },
        domains: [{ name: 'dashboard', weight: 1 }],
        operations: [{ type: 'modify', weight: 1 }],
        complexity: { fileCount: 2, moduleCount: 1, crossCutting: false, estimatedSize: 'small' },
        scope: { writeRatio: { 'src/dashboard/': 1 }, primaryWriteTarget: 'src/dashboard/', testWriteRatio: 0 },
      };
    }

    it('default-off: omitting the affinity context leaves the score unchanged', () => {
      const base = evaluateActivation(makeDesignDNA(), frontendConfig);
      expect(base.score).toBe(10);
      expect(base.matchedRules.some(r => r.startsWith('skill-affinity'))).toBe(false);
    });

    it('default-off: enabled=false leaves the score unchanged (no affinity applied)', () => {
      const result = evaluateActivation(makeDesignDNA(), frontendConfig, {
        agentId: 'frontend-designer',
        assignedSkills: ['frontend-design'],
        enabled: false,
      });
      expect(result.score).toBe(10);
      expect(result.matchedRules.some(r => r.startsWith('skill-affinity'))).toBe(false);
    });

    it('enabled + matching skill→agent: adds SKILL_AGENT_AFFINITY_BONUS to the score', () => {
      const result = evaluateActivation(makeDesignDNA(), frontendConfig, {
        agentId: 'frontend-designer',
        assignedSkills: ['frontend-design'],
        enabled: true,
      });
      expect(result.score).toBe(10 + SKILL_AGENT_AFFINITY_BONUS);
      expect(result.matchedRules).toContain(`skill-affinity:frontend-designer(+${SKILL_AGENT_AFFINITY_BONUS})`);
    });

    it('enabled but agent is NOT the affinity target (refactorer): no bonus, no penalty', () => {
      const refactorerConfig: ActivationConfig = {
        rules: [{ name: 'design-primary', when: { 'intent.primary': 'design' }, score: 7 }],
        exclude: [],
        minScore: 5,
      };
      const result = evaluateActivation(makeDesignDNA(), refactorerConfig, {
        agentId: 'refactorer',
        assignedSkills: ['frontend-design', 'react-specialist'],
        enabled: true,
      });
      expect(result.score).toBe(7); // generalist agents are never boosted by affinity
      expect(result.matchedRules.some(r => r.startsWith('skill-affinity'))).toBe(false);
    });

    it('caps at one application even when multiple assigned skills map to the agent', () => {
      const result = evaluateActivation(makeDesignDNA(), frontendConfig, {
        agentId: 'frontend-designer',
        // both map to frontend-designer in SKILL_AGENT_MAP
        assignedSkills: ['frontend-design', 'react-specialist'],
        enabled: true,
      });
      expect(result.score).toBe(10 + SKILL_AGENT_AFFINITY_BONUS); // not +2x
    });

    it('enabled with empty / undefined assigned skills: no bonus', () => {
      const empty = evaluateActivation(makeDesignDNA(), frontendConfig, {
        agentId: 'frontend-designer',
        assignedSkills: [],
        enabled: true,
      });
      expect(empty.score).toBe(10);
      const undef = evaluateActivation(makeDesignDNA(), frontendConfig, {
        agentId: 'frontend-designer',
        assignedSkills: undefined,
        enabled: true,
      });
      expect(undef.score).toBe(10);
    });

    it('affinity never resurrects an excluded agent (exclusion wins, score stays 0)', () => {
      const excludedConfig: ActivationConfig = {
        rules: [{ name: 'design-primary', when: { 'intent.primary': 'design' }, score: 10 }],
        exclude: [{ name: 'no-design', when: { 'intent.primary': 'design' }, reason: 'excluded' }],
        minScore: 5,
      };
      const result = evaluateActivation(makeDesignDNA(), excludedConfig, {
        agentId: 'frontend-designer',
        assignedSkills: ['frontend-design'],
        enabled: true,
      });
      expect(result.excluded).toBe(true);
      expect(result.score).toBe(0);
      expect(result.matchedRules.some(r => r.startsWith('skill-affinity'))).toBe(false);
    });
  });

  describe('evaluateRule', () => {
    it('matches simple intent condition', () => {
      const result = evaluateRule(makeSecurityDNA(), {
        when: { 'intent.primary': 'security' },
        score: 10,
      });
      expect(result.matched).toBe(true);
      expect(result.score).toBe(10);
    });

    it('does not match when condition fails', () => {
      const result = evaluateRule(makeSecurityDNA(), {
        when: { 'intent.primary': 'testing' },
        score: 10,
      });
      expect(result.matched).toBe(false);
      expect(result.score).toBe(0);
    });

    it('matches complex multi-field condition', () => {
      const result = evaluateRule(makeSecurityDNA(), {
        when: {
          'intent.primary': 'security',
          'intent.confidence': { $gte: 0.8 },
          domains: { $contains: 'auth' },
        },
        score: 15,
      });
      expect(result.matched).toBe(true);
      expect(result.score).toBe(15);
    });
  });

  describe('evaluateExclusion', () => {
    it('returns true when exclusion matches', () => {
      const excluded = evaluateExclusion(makeImplementationDNA(), {
        when: { 'intent.primary': 'implementation' },
      });
      expect(excluded).toBe(true);
    });

    it('returns false when exclusion does not match', () => {
      const excluded = evaluateExclusion(makeSecurityDNA(), {
        when: { 'intent.primary': 'implementation' },
      });
      expect(excluded).toBe(false);
    });

    it('supports complex exclusion conditions', () => {
      const excluded = evaluateExclusion(makeImplementationDNA(), {
        when: {
          'intent.primary': 'implementation',
          'scope.testWriteRatio': { $lt: 0.2 },
        },
      });
      expect(excluded).toBe(true);
    });
  });

  describe('migrateV1AgentToActivation', () => {
    it('converts security keywords to security intent rules', () => {
      const config = migrateV1AgentToActivation(
        ['security', 'auth', 'jwt', 'csrf'],
        ['src/auth/', 'src/security/'],
        ['**/*.auth.ts'],
      );

      expect(config.rules.length).toBeGreaterThan(0);
      expect(config.minScore).toBe(5);

      // Should generate a security intent rule
      const secRule = config.rules.find(r => r.name?.includes('security'));
      expect(secRule).toBeDefined();
      expect(secRule!.score).toBeGreaterThan(0);
    });

    it('converts scope paths to domain rules', () => {
      const config = migrateV1AgentToActivation(
        [],
        ['src/auth/', 'src/api/'],
        [],
      );

      const authRule = config.rules.find(r => r.name?.includes('auth'));
      expect(authRule).toBeDefined();
    });

    it('handles empty inputs', () => {
      const config = migrateV1AgentToActivation([], [], []);
      expect(config.rules).toEqual([]);
      expect(config.minScore).toBe(5);
    });
  });

  describe('migrateV1SkillToActivation', () => {
    it('converts language skill triggers', () => {
      const config = migrateV1SkillToActivation(
        ['typescript', 'type', 'interface'],
        'language',
        { files: ['tsconfig.json'], dependencies: ['typescript'], commands: [] },
      );

      expect(config.rules.length).toBeGreaterThan(0);
      expect(config.minScore).toBe(3);
    });

    it('converts domain skill triggers', () => {
      const config = migrateV1SkillToActivation(
        ['test', 'spec', 'coverage', 'vitest'],
        'domain',
        { files: [], dependencies: ['vitest'], commands: [] },
      );

      expect(config.rules.length).toBeGreaterThan(0);
      const testRule = config.rules.find(r => r.name?.includes('testing'));
      expect(testRule).toBeDefined();
    });

    it('adds stack detection bonus rule', () => {
      const config = migrateV1SkillToActivation(
        ['typescript'],
        'language',
        { files: [], dependencies: ['typescript'], commands: [] },
      );

      const stackRule = config.rules.find(r => r.name === 'v1-stack-deps');
      expect(stackRule).toBeDefined();
    });
  });

  describe('evaluateRuleViaSecondary (C)', () => {
    it('returns 50% score when rule matches via secondary intent', () => {
      const dna: TaskDNA = {
        intent: { primary: 'implementation', secondary: ['testing'], confidence: 0.85 },
        domains: [],
        operations: [],
        complexity: { fileCount: 2, moduleCount: 1, crossCutting: false, estimatedSize: 'small' },
        scope: { writeRatio: { 'src/': 1 }, primaryWriteTarget: 'src/', testWriteRatio: 0 },
      };
      const score = evaluateRuleViaSecondary(dna, { name: 'testing-primary', when: { 'intent.primary': 'testing' }, score: 10 });
      expect(score).toBe(5);
    });

    it('returns 0 when value not in secondary intents', () => {
      const dna: TaskDNA = {
        intent: { primary: 'implementation', secondary: ['documentation'], confidence: 0.8 },
        domains: [],
        operations: [],
        complexity: { fileCount: 1, moduleCount: 1, crossCutting: false, estimatedSize: 'trivial' },
        scope: { writeRatio: {}, primaryWriteTarget: '', testWriteRatio: 0 },
      };
      const score = evaluateRuleViaSecondary(dna, { when: { 'intent.primary': 'testing' }, score: 10 });
      expect(score).toBe(0);
    });

    it('returns 0 for non-string primary conditions', () => {
      const dna: TaskDNA = {
        intent: { primary: 'bugfix', secondary: ['testing'], confidence: 0.75 },
        domains: [],
        operations: [],
        complexity: { fileCount: 1, moduleCount: 1, crossCutting: false, estimatedSize: 'trivial' },
        scope: { writeRatio: {}, primaryWriteTarget: '', testWriteRatio: 0 },
      };
      const score = evaluateRuleViaSecondary(dna, { when: { 'intent.primary': { $not: 'unknown' } }, score: 5 });
      expect(score).toBe(0);
    });

    it('returns 0 when intent already matches primary (no double-counting)', () => {
      const dna: TaskDNA = {
        intent: { primary: 'testing', secondary: ['bugfix'], confidence: 0.9 },
        domains: [],
        operations: [],
        complexity: { fileCount: 2, moduleCount: 1, crossCutting: false, estimatedSize: 'small' },
        scope: { writeRatio: { 'tests/': 1 }, primaryWriteTarget: 'tests/', testWriteRatio: 1 },
      };
      // testing is NOT in secondary, it's primary — so secondary check returns 0
      const score = evaluateRuleViaSecondary(dna, { when: { 'intent.primary': 'testing' }, score: 10 });
      expect(score).toBe(0);
    });

    it('evaluateActivation scores via secondary when exclude does not match', () => {
      const config: ActivationConfig = {
        rules: [
          { name: 'testing-primary', when: { 'intent.primary': 'testing' }, score: 10 },
        ],
        exclude: [
          { name: 'not-implementation', when: { 'intent.primary': 'implementation' } },
        ],
        minScore: 3,
      };
      // primary=bugfix, secondary=[testing] — should score at 5 (50% of 10) since not excluded
      const dna: TaskDNA = {
        intent: { primary: 'bugfix', secondary: ['testing'], confidence: 0.8 },
        domains: [],
        operations: [],
        complexity: { fileCount: 3, moduleCount: 2, crossCutting: true, estimatedSize: 'medium' },
        scope: { writeRatio: { 'src/': 0.7, 'tests/': 0.3 }, primaryWriteTarget: 'src/', testWriteRatio: 0.3 },
      };
      const result = evaluateActivation(dna, config);
      expect(result.excluded).toBe(false);
      expect(result.score).toBe(5);
      expect(result.matchedRules).toContain('testing-primary(via-secondary)');
    });

    it('evaluateActivation excludes before secondary scoring for implementation intent', () => {
      const config: ActivationConfig = {
        rules: [
          { name: 'testing-primary', when: { 'intent.primary': 'testing' }, score: 10 },
        ],
        exclude: [
          { name: 'not-implementation', when: { 'intent.primary': 'implementation' }, reason: 'test-writer skip impl' },
        ],
        minScore: 5,
      };
      const dna: TaskDNA = {
        intent: { primary: 'implementation', secondary: ['testing'], confidence: 0.9 },
        domains: [],
        operations: [],
        complexity: { fileCount: 1, moduleCount: 1, crossCutting: false, estimatedSize: 'trivial' },
        scope: { writeRatio: { 'src/': 1 }, primaryWriteTarget: 'src/', testWriteRatio: 0 },
      };
      const result = evaluateActivation(dna, config);
      expect(result.excluded).toBe(true);
      expect(result.score).toBe(0);
    });
  });
});
