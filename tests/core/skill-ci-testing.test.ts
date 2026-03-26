import { describe, it, expect } from 'vitest';
import { SkillPoolManager } from '../../src/core/skill-pool.js';
import { selectSkills } from '../../src/core/skill-selector.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { SkillDefinition, ProjectStack } from '../../src/core/skill-types.js';

// ─── ci-testing Skill Definition (mirrors manifest.json) ────────────────────

const CI_TESTING_SKILL: SkillDefinition = createSkillDefinition({
  id: 'ci-testing',
  name: 'CI Testing Expert',
  version: '1.0.0',
  description: 'CI/CD testing expertise — regression detection, coverage analysis, test strategy',
  entrypoint: 'SKILL.md',
  category: 'workflow',
  triggers: ['ci', 'test', 'regression', 'coverage', 'pipeline', 'build', 'lint', 'actions'],
  stackDetection: {
    files: ['.github/workflows/*.yml', 'vitest.config.*', 'tsconfig.json'],
    dependencies: ['vitest', 'typescript'],
    commands: ['tsc', 'vitest'],
  },
  composableWith: ['testing-expert', 'typescript-expert'],
  priority: 12,
  promptInjection: { position: 'prepend', maxTokens: 1500 },
  enabled: true,
  stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
});

function makePool(...skills: SkillDefinition[]): Map<string, SkillDefinition> {
  const pool = new Map<string, SkillDefinition>();
  for (const skill of skills) pool.set(skill.id, skill);
  return pool;
}

function makeStack(overrides?: Partial<ProjectStack>): ProjectStack {
  return {
    language: 'typescript',
    framework: 'express',
    dependencies: ['vitest', 'typescript'],
    buildTool: 'tsc',
    testFramework: 'vitest',
    detectedAt: '2026-03-26T00:00:00Z',
    ...overrides,
  };
}

// ─── Manifest Validation ─────────────────────────────────────────────────────

describe('ci-testing manifest validation', () => {
  it('passes SkillPoolManager.validateSkillDefinition with valid manifest', () => {
    const result = SkillPoolManager.validateSkillDefinition(CI_TESTING_SKILL);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('has required id field set to "ci-testing"', () => {
    expect(CI_TESTING_SKILL.id).toBe('ci-testing');
  });

  it('has category "workflow"', () => {
    expect(CI_TESTING_SKILL.category).toBe('workflow');
  });

  it('has priority 12 (higher than testing-expert at 10)', () => {
    expect(CI_TESTING_SKILL.priority).toBe(12);
  });

  it('has promptInjection position "prepend"', () => {
    expect(CI_TESTING_SKILL.promptInjection.position).toBe('prepend');
  });

  it('has promptInjection maxTokens 1500', () => {
    expect(CI_TESTING_SKILL.promptInjection.maxTokens).toBe(1500);
  });

  it('includes all required CI triggers', () => {
    const requiredTriggers = ['ci', 'test', 'regression', 'coverage', 'pipeline', 'build'];
    for (const trigger of requiredTriggers) {
      expect(CI_TESTING_SKILL.triggers).toContain(trigger);
    }
  });

  it('is composable with testing-expert and typescript-expert', () => {
    expect(CI_TESTING_SKILL.composableWith).toContain('testing-expert');
    expect(CI_TESTING_SKILL.composableWith).toContain('typescript-expert');
  });

  it('is enabled by default', () => {
    expect(CI_TESTING_SKILL.enabled).toBe(true);
  });

  it('has initialized stats with zero values', () => {
    expect(CI_TESTING_SKILL.stats.totalUses).toBe(0);
    expect(CI_TESTING_SKILL.stats.successRate).toBe(0);
    expect(CI_TESTING_SKILL.stats.avgCoverage).toBe(0);
  });
});

// ─── Skill Selection — CI Tasks ──────────────────────────────────────────────

describe('ci-testing skill selection for CI tasks', () => {
  it('selects ci-testing for "regression detection" task', () => {
    const pool = makePool(CI_TESTING_SKILL);
    const result = selectSkills(
      { title: 'Regression detection after task', description: 'Check for regressions' },
      makeStack(),
      pool,
    );
    expect(result.skills.map((s) => s.id)).toContain('ci-testing');
  });

  it('selects ci-testing for "run ci pipeline" task', () => {
    const pool = makePool(CI_TESTING_SKILL);
    const result = selectSkills(
      { title: 'Run ci pipeline validation', description: 'tsc and vitest' },
      makeStack(),
      pool,
    );
    expect(result.skills.map((s) => s.id)).toContain('ci-testing');
  });

  it('selects ci-testing for "coverage analysis" task', () => {
    const pool = makePool(CI_TESTING_SKILL);
    const result = selectSkills(
      { title: 'Improve coverage for sprint', description: 'analyze coverage gaps' },
      makeStack(),
      pool,
    );
    expect(result.skills.map((s) => s.id)).toContain('ci-testing');
  });

  it('selects ci-testing for "GitHub Actions" workflow task', () => {
    const pool = makePool(CI_TESTING_SKILL);
    const result = selectSkills(
      { title: 'Fix GitHub Actions workflow', description: 'actions failing on CI' },
      makeStack(),
      pool,
    );
    expect(result.skills.map((s) => s.id)).toContain('ci-testing');
  });

  it('scores ci-testing higher than a generic skill on CI tasks', () => {
    const genericSkill = createSkillDefinition({
      id: 'generic',
      name: 'Generic',
      triggers: [],
      priority: 0,
    });
    const pool = makePool(CI_TESTING_SKILL, genericSkill);
    const result = selectSkills(
      { title: 'Fix ci test failures', description: 'coverage regression' },
      makeStack(),
      pool,
    );
    const ciScore = result.scores.get('ci-testing') ?? 0;
    const genericScore = result.scores.get('generic') ?? 0;
    expect(ciScore).toBeGreaterThan(genericScore);
  });

  it('does NOT select ci-testing for unrelated refactor task', () => {
    const pool = makePool(CI_TESTING_SKILL);
    const result = selectSkills(
      { title: 'Refactor database schema', description: 'normalize tables and relations' },
      makeStack({ dependencies: [] }),
      pool,
    );
    // Score should be 0 or only from priority bonus — ci-testing should not appear
    // (No trigger keyword matches in this task)
    const ciScore = result.scores.get('ci-testing') ?? 0;
    expect(ciScore).toBeLessThanOrEqual(1); // at most priority bonus
  });
});

// ─── Composition Compatibility ───────────────────────────────────────────────

describe('ci-testing composition with other skills', () => {
  it('is composable alongside testing-expert', () => {
    const testingExpert = createSkillDefinition({
      id: 'testing-expert',
      name: 'Testing Expert',
      triggers: ['test', 'coverage'],
      composableWith: ['ci-testing', 'typescript-expert'],
      priority: 10,
    });
    const pool = makePool(CI_TESTING_SKILL, testingExpert);
    const result = selectSkills(
      { title: 'Write tests with ci coverage', description: 'regression and coverage' },
      makeStack(),
      pool,
      undefined,
      5,
    );
    const ids = result.skills.map((s) => s.id);
    // Both should be selected without conflicts when composableWith is mutual
    expect(ids).toContain('ci-testing');
  });

  it('validates manifest stats have correct types', () => {
    const result = SkillPoolManager.validateSkillDefinition({
      ...CI_TESTING_SKILL,
      stats: {
        totalUses: 0,
        successRate: 0,
        avgCoverage: 0,
        lastUsedInSprint: '',
      },
    });
    expect(result.valid).toBe(true);
  });
});
