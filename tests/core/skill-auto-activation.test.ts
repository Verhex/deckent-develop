import { describe, it, expect } from 'vitest';
import { selectSkills } from '../../src/core/skill-selector.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { SkillDefinition, ProjectStack } from '../../src/core/skill-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePool(...defs: Array<Partial<SkillDefinition> & { id: string; name: string }>): Map<string, SkillDefinition> {
  const pool = new Map<string, SkillDefinition>();
  for (const def of defs) {
    const skill = createSkillDefinition(def);
    pool.set(skill.id, skill);
  }
  return pool;
}

function makeStack(overrides?: Partial<ProjectStack>): ProjectStack {
  return {
    language: 'typescript',
    framework: 'express',
    dependencies: ['express', 'typescript', 'vitest'],
    buildTool: 'tsc',
    testFramework: 'vitest',
    detectedAt: '2026-04-20T00:00:00Z',
    ...overrides,
  };
}

function poolWithTestingExpert(...extra: Array<Partial<SkillDefinition> & { id: string; name: string }>): Map<string, SkillDefinition> {
  return makePool(
    {
      id: 'testing-expert',
      name: 'Testing Expert',
      category: 'workflow',
      triggers: ['test', 'coverage', 'spec', 'mock'],
      composableWith: ['typescript-expert', 'react-specialist', 'python-expert', 'api-builder'],
      priority: 10,
    },
    ...extra,
  );
}

// ─── Auto-Activation Tests ─────────────────────────────────────────────────

describe('testing-expert auto-activation heuristic', () => {
  it('auto-activates testing-expert when scope.directories includes tests/', () => {
    // Arrange: task with tests/nervous/ in scope, no test-related keywords in title
    const pool = poolWithTestingExpert();
    const task = {
      title: 'Nervous types runtime extension',
      description: 'Extend nervous types',
      scope: { directories: ['tests/nervous/'] },
    };

    // Act
    const result = selectSkills(task, makeStack(), pool);

    // Assert
    const skillIds = result.skills.map(s => s.id);
    expect(skillIds).toContain('testing-expert');
  });

  it('auto-activates testing-expert when filesWrite contains .test.ts files', () => {
    // Arrange: task writing test files alongside source files
    const pool = poolWithTestingExpert();
    const task = {
      title: 'Add foo module',
      description: 'Implement foo',
      scope: { directories: ['src/'], filesWrite: ['src/foo.ts', 'tests/foo.test.ts'] },
    };

    // Act
    const result = selectSkills(task, makeStack(), pool);

    // Assert
    const skillIds = result.skills.map(s => s.id);
    expect(skillIds).toContain('testing-expert');
  });

  it('does NOT auto-activate testing-expert when scope has no tests', () => {
    // Arrange: task with only src/core/ scope, no test files
    // Use a pool where testing-expert has priority=0 and no trigger match
    // so it scores 0 via normal path, and auto-activation should not trigger either
    const pool = makePool({
      id: 'testing-expert',
      name: 'Testing Expert',
      category: 'workflow',
      triggers: ['test', 'coverage', 'spec', 'mock'],
      composableWith: [],
      priority: 0,
    });
    const task = {
      title: 'Update config',
      description: 'Modify configuration',
      scope: { directories: ['src/core/'], filesWrite: ['src/core/types.ts'] },
    };
    const stackNoVitest = makeStack({ dependencies: ['express', 'typescript'] });

    // Act
    const result = selectSkills(task, stackNoVitest, pool);

    // Assert: testing-expert should NOT be included — no triggers match, no test scope
    const skillIds = result.skills.map(s => s.id);
    expect(skillIds).not.toContain('testing-expert');
  });

  it('respects manifest activation rules (primary path) even without test scope', () => {
    // Arrange: task with "test" in description triggers via scoring, not auto-activation
    const pool = poolWithTestingExpert();
    const task = {
      title: 'Write test coverage report',
      description: 'Generate test coverage analysis',
      scope: { directories: ['src/core/'] },
    };

    // Act
    const result = selectSkills(task, makeStack(), pool);

    // Assert: testing-expert activated via trigger keyword matching (primary path), not auto-activation
    const skillIds = result.skills.map(s => s.id);
    expect(skillIds).toContain('testing-expert');
  });

  it('prevents duplicate testing-expert when already selected by scoring', () => {
    // Arrange: task has both test triggers AND test scope — testing-expert should appear once
    const pool = poolWithTestingExpert();
    const task = {
      title: 'Add test coverage for nervous module',
      description: 'Write comprehensive tests with mocking',
      scope: { directories: ['tests/nervous/'], filesWrite: ['tests/nervous/observer.test.ts'] },
    };

    // Act
    const result = selectSkills(task, makeStack(), pool);

    // Assert: testing-expert appears exactly once
    const testingExpertCount = result.skills.filter(s => s.id === 'testing-expert').length;
    expect(testingExpertCount).toBe(1);
  });
});
