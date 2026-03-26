import { describe, it, expect } from 'vitest';
import {
  classifyIntent,
  detectPrimaryIntent,
  detectDomains,
  detectOperations,
  analyzeComplexity,
  analyzeWriteScope,
  detectSecondaryIntents,
} from '../../src/core/intent-classifier.js';

describe('intent-classifier', () => {
  describe('classifyIntent — full pipeline', () => {
    it('classifies security task correctly', () => {
      const dna = classifyIntent({
        title: 'Security audit for authentication module',
        description: 'Check for JWT vulnerabilities and XSS issues',
        scope: {
          directories: ['src/auth/', 'src/security/'],
          filesRead: [],
          filesWrite: ['src/auth/login.ts', 'src/auth/jwt.ts'],
        },
      });

      expect(dna.intent.primary).toBe('security');
      expect(dna.intent.confidence).toBeGreaterThan(0.5);
      expect(dna.domains.some(d => d.name === 'auth')).toBe(true);
    });

    it('classifies implementation task — NOT testing even with "test" in description', () => {
      // This is the critical regression test for the detectTaskType ordering bug
      const dna = classifyIntent({
        title: 'start Kalan — Sandbox, Zero-Config, Fix Timeout',
        description: '7 kalan start önerisi. Test: 10+ test',
        scope: {
          directories: ['src/cli/commands/', 'src/orchestra/', 'tests/'],
          filesRead: [],
          filesWrite: ['src/cli/commands/start.ts', 'src/orchestra/sprint-controller.ts'],
        },
      });

      expect(dna.intent.primary).toBe('implementation');
      expect(dna.intent.primary).not.toBe('testing');
      expect(dna.scope.testWriteRatio).toBe(0);
    });

    it('classifies pure testing task correctly', () => {
      const dna = classifyIntent({
        title: 'Write unit tests for auth module',
        description: 'Add vitest coverage for login and JWT validation',
        scope: {
          directories: ['tests/auth/'],
          filesRead: ['src/auth/login.ts'],
          filesWrite: ['tests/auth/login.test.ts', 'tests/auth/jwt.test.ts'],
        },
      });

      expect(dna.intent.primary).toBe('testing');
      expect(dna.scope.testWriteRatio).toBe(1);
    });

    it('classifies documentation task correctly', () => {
      const dna = classifyIntent({
        title: 'Update API documentation',
        description: 'Add README and changelog entries',
        scope: {
          directories: ['docs/'],
          filesRead: [],
          filesWrite: ['docs/api.md', 'docs/CHANGELOG.md'],
        },
      });

      expect(dna.intent.primary).toBe('documentation');
    });

    it('classifies bugfix task correctly', () => {
      const dna = classifyIntent({
        title: 'Fix crash in config loader',
        description: 'Error when loading config with missing fields. Regression from sprint 060.',
        scope: {
          directories: ['src/core/'],
          filesRead: [],
          filesWrite: ['src/core/config.ts'],
        },
      });

      expect(dna.intent.primary).toBe('bugfix');
    });

    it('classifies refactoring task correctly', () => {
      const dna = classifyIntent({
        title: 'Refactor sprint controller — extract methods',
        description: 'Simplify and restructure the sprint controller by extracting helper functions',
        scope: {
          directories: ['src/orchestra/'],
          filesRead: [],
          filesWrite: ['src/orchestra/sprint-controller.ts'],
        },
      });

      expect(dna.intent.primary).toBe('refactor');
    });

    it('detects secondary intents', () => {
      const dna = classifyIntent({
        title: 'Implement auth module with tests',
        description: 'Build JWT authentication. Write comprehensive test coverage.',
        scope: {
          directories: ['src/auth/', 'tests/auth/'],
          filesRead: [],
          filesWrite: ['src/auth/jwt.ts', 'tests/auth/jwt.test.ts'],
        },
      });

      // Primary is implementation (more src/ writes)
      expect(dna.intent.secondary).toContain('testing');
    });
  });

  describe('detectPrimaryIntent', () => {
    it('returns implementation for source-heavy task with "test" keyword', () => {
      const result = detectPrimaryIntent(
        'implement new feature. test: 10+ tests required',
        {
          directories: ['src/cli/', 'tests/'],
          filesRead: [],
          filesWrite: ['src/cli/command.ts'],
        },
      );
      expect(result.intent).toBe('implementation');
    });

    it('returns testing for test-heavy writes', () => {
      const result = detectPrimaryIntent(
        'write unit tests',
        {
          directories: ['tests/'],
          filesRead: [],
          filesWrite: ['tests/core/foo.test.ts', 'tests/core/bar.test.ts'],
        },
      );
      expect(result.intent).toBe('testing');
    });

    it('returns unknown for empty input', () => {
      const result = detectPrimaryIntent('', { directories: [], filesRead: [], filesWrite: [] });
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });

  describe('detectDomains', () => {
    it('extracts domains from scope directories', () => {
      const domains = detectDomains({
        directories: ['src/auth/', 'src/api/'],
        filesRead: [],
        filesWrite: ['src/auth/login.ts'],
      });

      expect(domains.some(d => d.name === 'auth')).toBe(true);
      expect(domains.some(d => d.name === 'api')).toBe(true);
    });

    it('extracts domain from file paths', () => {
      const domains = detectDomains({
        directories: [],
        filesRead: [],
        filesWrite: ['src/orchestra/sprint-controller.ts'],
      });

      expect(domains.some(d => d.name === 'orchestra')).toBe(true);
    });

    it('returns empty for no meaningful domains', () => {
      const domains = detectDomains({
        directories: [],
        filesRead: [],
        filesWrite: [],
      });

      expect(domains).toEqual([]);
    });

    it('filters out generic names', () => {
      const domains = detectDomains({
        directories: ['src/utils/', 'src/helpers/'],
        filesRead: [],
        filesWrite: [],
      });

      expect(domains.some(d => d.name === 'utils')).toBe(false);
      expect(domains.some(d => d.name === 'helpers')).toBe(false);
    });
  });

  describe('detectOperations', () => {
    it('detects create operations', () => {
      const ops = detectOperations(
        'create new authentication endpoint',
        { directories: ['src/'], filesRead: [], filesWrite: ['src/auth.ts'] },
      );
      expect(ops.some(o => o.type === 'create')).toBe(true);
    });

    it('detects modify operations from read+write scope', () => {
      const ops = detectOperations(
        'update login handler',
        { directories: [], filesRead: ['src/auth.ts'], filesWrite: ['src/auth.ts'] },
      );
      expect(ops.some(o => o.type === 'modify')).toBe(true);
    });

    it('detects test operations', () => {
      const ops = detectOperations(
        'add test coverage for validation',
        { directories: ['tests/'], filesRead: [], filesWrite: [] },
      );
      expect(ops.some(o => o.type === 'test')).toBe(true);
    });
  });

  describe('analyzeComplexity', () => {
    it('trivial: single file, single module', () => {
      const result = analyzeComplexity({
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/config.ts'],
      });
      expect(result.estimatedSize).toBe('trivial');
      expect(result.crossCutting).toBe(false);
    });

    it('medium: few files, few modules', () => {
      const result = analyzeComplexity({
        directories: ['src/core/', 'src/orchestra/'],
        filesRead: [],
        filesWrite: ['src/core/types.ts', 'src/orchestra/planner.ts', 'src/orchestra/builder.ts'],
      });
      expect(result.estimatedSize).toBe('medium');
      expect(result.crossCutting).toBe(true);
    });

    it('large: many files or modules', () => {
      const result = analyzeComplexity({
        directories: ['src/core/', 'src/orchestra/', 'src/cli/'],
        filesRead: [],
        filesWrite: [
          'src/core/a.ts', 'src/core/b.ts', 'src/core/c.ts',
          'src/orchestra/d.ts', 'src/orchestra/e.ts',
          'src/cli/f.ts',
        ],
      });
      expect(result.estimatedSize).toBe('large');
    });
  });

  describe('analyzeWriteScope', () => {
    it('calculates write ratio correctly', () => {
      const result = analyzeWriteScope({
        directories: [],
        filesRead: [],
        filesWrite: ['src/a.ts', 'src/b.ts', 'tests/a.test.ts'],
      });
      expect(result.writeRatio['src/']).toBeCloseTo(0.67, 1);
      expect(result.writeRatio['tests/']).toBeCloseTo(0.33, 1);
      expect(result.testWriteRatio).toBeCloseTo(0.33, 1);
    });

    it('returns 0 testWriteRatio for pure source writes', () => {
      const result = analyzeWriteScope({
        directories: [],
        filesRead: [],
        filesWrite: ['src/core/config.ts', 'src/orchestra/planner.ts'],
      });
      expect(result.testWriteRatio).toBe(0);
      expect(result.primaryWriteTarget).toBe('src/');
    });

    it('returns 1 testWriteRatio for pure test writes', () => {
      const result = analyzeWriteScope({
        directories: [],
        filesRead: [],
        filesWrite: ['tests/core/config.test.ts'],
      });
      expect(result.testWriteRatio).toBe(1);
      expect(result.primaryWriteTarget).toBe('tests/');
    });

    it('handles empty filesWrite using directories fallback', () => {
      const result = analyzeWriteScope({
        directories: ['src/core/', 'tests/core/'],
        filesRead: [],
        filesWrite: [],
      });
      expect(result.primaryWriteTarget).toBe('src/core/');
    });
  });

  describe('detectSecondaryIntents', () => {
    it('detects testing as secondary when primary is implementation', () => {
      const secondary = detectSecondaryIntents(
        'implement feature with tests',
        { directories: ['src/', 'tests/'], filesRead: [], filesWrite: [] },
        'implementation',
      );
      expect(secondary).toContain('testing');
    });

    it('does not include primary intent in secondary', () => {
      const secondary = detectSecondaryIntents(
        'write tests for coverage',
        { directories: ['tests/'], filesRead: [], filesWrite: [] },
        'testing',
      );
      expect(secondary).not.toContain('testing');
    });

    it('detects security as secondary', () => {
      const secondary = detectSecondaryIntents(
        'implement login with jwt authentication',
        { directories: ['src/auth/'], filesRead: [], filesWrite: [] },
        'implementation',
      );
      expect(secondary).toContain('security');
    });
  });
});
