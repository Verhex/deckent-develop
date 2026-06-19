import { describe, it, expect } from 'vitest';
import type { PlannerTask } from '../../src/core/types.js';
import { validateGoCriteriaScope } from '../../src/orchestra/planner.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return {
    title: 'Test task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Test',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/authority-matrix.ts'] },
    dependencies: [],
    goNogo: {
      goCriteria: 'Implementation complete',
      noGoCriteria: 'Build fails',
      techDebtAcceptable: 'None',
    },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('validateGoCriteriaScope', () => {
  describe('no test/build signal in goCriteria', () => {
    it('returns sufficient=true with no warnings when goCriteria has no test signal', () => {
      const task = makeTask({
        goNogo: {
          goCriteria: 'Implementation is correct and code is clean',
          noGoCriteria: 'Any breakage',
          techDebtAcceptable: 'None',
        },
      });
      const result = validateGoCriteriaScope(task);
      expect(result.sufficient).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
      expect(result.autoExpandedFiles).toHaveLength(0);
    });

    it('returns sufficient=true when goCriteria is empty', () => {
      const task = makeTask({
        goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      });
      const result = validateGoCriteriaScope(task);
      expect(result.sufficient).toBe(true);
    });
  });

  describe('explicit test path referenced in goCriteria — path missing from scope', () => {
    it('warns when goCriteria mentions a test path not in filesWrite', () => {
      // Task 303 ENT-1 pattern: goCriteria references engine-wiring test,
      // but filesWrite only has authority-matrix.ts (the source file)
      const task = makeTask({
        scope: {
          directories: ['src/orchestra/', 'src/nervous/'],
          filesRead: [],
          filesWrite: ['src/nervous/authority-matrix.ts'],
        },
        goNogo: {
          goCriteria: 'tests/nervous/runtime-loop.test.ts passes; engine-wiring tests pass',
          noGoCriteria: 'Build fails',
          techDebtAcceptable: 'None',
        },
      });
      const result = validateGoCriteriaScope(task);
      expect(result.sufficient).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('runtime-loop.test.ts'))).toBe(true);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.autoExpandedFiles).toContain('tests/nervous/runtime-loop.test.ts');
    });

    it('warns when goCriteria mentions multiple test paths and none are in scope', () => {
      const task = makeTask({
        scope: {
          directories: ['src/orchestra/'],
          filesRead: [],
          filesWrite: ['src/orchestra/planner.ts'],
        },
        goNogo: {
          goCriteria: 'tests/orchestra/planner.test.ts and tests/orchestra/scope-w2-sufficiency.test.ts pass',
          noGoCriteria: 'Build fails',
          techDebtAcceptable: 'None',
        },
      });
      const result = validateGoCriteriaScope(task);
      expect(result.sufficient).toBe(false);
      expect(result.autoExpandedFiles).toHaveLength(2);
      expect(result.autoExpandedFiles).toContain('tests/orchestra/planner.test.ts');
      expect(result.autoExpandedFiles).toContain('tests/orchestra/scope-w2-sufficiency.test.ts');
    });

    it('is sufficient when the test path IS in filesWrite', () => {
      const task = makeTask({
        scope: {
          directories: ['src/orchestra/', 'tests/orchestra/'],
          filesRead: [],
          filesWrite: [
            'src/orchestra/authority-matrix.ts',
            'tests/orchestra/runtime-loop.test.ts',
          ],
        },
        goNogo: {
          goCriteria: 'tests/orchestra/runtime-loop.test.ts passes',
          noGoCriteria: 'Build fails',
          techDebtAcceptable: 'None',
        },
      });
      const result = validateGoCriteriaScope(task);
      expect(result.sufficient).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.autoExpandedFiles).toHaveLength(0);
    });

    it('is sufficient when the test path is covered by scope.directories', () => {
      const task = makeTask({
        scope: {
          directories: ['src/orchestra/', 'tests/orchestra/'],
          filesRead: [],
          filesWrite: ['src/orchestra/authority-matrix.ts'],
        },
        goNogo: {
          goCriteria: 'tests/orchestra/runtime-loop.test.ts passes',
          noGoCriteria: 'Build fails',
          techDebtAcceptable: 'None',
        },
      });
      const result = validateGoCriteriaScope(task);
      expect(result.sufficient).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('generic test/build signal without explicit path', () => {
    it('warns when goCriteria has "tests pass" but scope has no test dir or test file', () => {
      const task = makeTask({
        scope: {
          directories: ['src/orchestra/'],
          filesRead: [],
          filesWrite: ['src/orchestra/authority-matrix.ts'],
        },
        goNogo: {
          goCriteria: 'engine-wiring tests pass',
          noGoCriteria: 'Build fails',
          techDebtAcceptable: 'None',
        },
      });
      const result = validateGoCriteriaScope(task);
      expect(result.sufficient).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('test/build signal');
      expect(result.suggestions.length).toBeGreaterThan(0);
      // Generic signal — no auto-expand files (no explicit path to expand)
      expect(result.autoExpandedFiles).toHaveLength(0);
    });

    it('warns when goCriteria has "vitest" but scope has no test coverage', () => {
      const task = makeTask({
        scope: {
          directories: ['src/core/'],
          filesRead: [],
          filesWrite: ['src/core/routing-engine.ts'],
        },
        goNogo: {
          goCriteria: 'npx vitest run succeeds',
          noGoCriteria: 'Tests fail',
          techDebtAcceptable: 'None',
        },
      });
      const result = validateGoCriteriaScope(task);
      expect(result.sufficient).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('is sufficient when goCriteria has "tests pass" and scope includes a test directory', () => {
      const task = makeTask({
        scope: {
          directories: ['src/orchestra/', 'tests/orchestra/'],
          filesRead: [],
          filesWrite: ['src/orchestra/authority-matrix.ts'],
        },
        goNogo: {
          goCriteria: 'engine-wiring tests pass',
          noGoCriteria: 'Build fails',
          techDebtAcceptable: 'None',
        },
      });
      const result = validateGoCriteriaScope(task);
      expect(result.sufficient).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('is sufficient when goCriteria has "build" signal and scope includes a test file', () => {
      const task = makeTask({
        scope: {
          directories: ['src/orchestra/'],
          filesRead: [],
          filesWrite: [
            'src/orchestra/authority-matrix.ts',
            'tests/orchestra/authority-matrix.test.ts',
          ],
        },
        goNogo: {
          goCriteria: 'tsc --noEmit and build succeed',
          noGoCriteria: 'Build fails',
          techDebtAcceptable: 'None',
        },
      });
      // "build" alone without test signal doesn't require test coverage per se,
      // but having test files in scope satisfies the check
      const result = validateGoCriteriaScope(task);
      expect(result.sufficient).toBe(true);
    });

    it('is sufficient when "coverage" keyword present and test directory in scope', () => {
      const task = makeTask({
        scope: {
          directories: ['src/', 'tests/'],
          filesRead: [],
          filesWrite: ['src/orchestra/planner.ts'],
        },
        goNogo: {
          goCriteria: 'coverage ≥ 80%',
          noGoCriteria: 'Coverage drops',
          techDebtAcceptable: 'None',
        },
      });
      const result = validateGoCriteriaScope(task);
      expect(result.sufficient).toBe(true);
    });
  });

  describe('result shape', () => {
    it('always returns all four fields', () => {
      const task = makeTask();
      const result = validateGoCriteriaScope(task);
      expect(result).toHaveProperty('sufficient');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('autoExpandedFiles');
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(Array.isArray(result.autoExpandedFiles)).toBe(true);
    });

    it('warnings and suggestions have equal length when explicit test paths are missing', () => {
      const task = makeTask({
        scope: {
          directories: ['src/orchestra/'],
          filesRead: [],
          filesWrite: ['src/orchestra/authority-matrix.ts'],
        },
        goNogo: {
          goCriteria: 'tests/orchestra/runtime-loop.test.ts and tests/orchestra/planner.test.ts pass',
          noGoCriteria: 'Fail',
          techDebtAcceptable: '',
        },
      });
      const result = validateGoCriteriaScope(task);
      expect(result.warnings.length).toBe(result.suggestions.length);
      expect(result.warnings.length).toBe(result.autoExpandedFiles.length);
    });
  });

  describe('edge cases', () => {
    it('handles undefined goNogo gracefully', () => {
      const task = makeTask();
      // @ts-expect-error — testing runtime robustness
      task.goNogo = undefined;
      expect(() => validateGoCriteriaScope(task)).not.toThrow();
      const result = validateGoCriteriaScope(task);
      expect(result.sufficient).toBe(true);
    });

    it('handles missing scope gracefully', () => {
      const task = makeTask({
        goNogo: {
          goCriteria: 'tests pass',
          noGoCriteria: 'Fail',
          techDebtAcceptable: '',
        },
      });
      // @ts-expect-error — testing runtime robustness
      task.scope = undefined;
      expect(() => validateGoCriteriaScope(task)).not.toThrow();
      const result = validateGoCriteriaScope(task);
      expect(result.sufficient).toBe(false);
    });

    it('does not mutate the input task', () => {
      const filesWrite = ['src/orchestra/authority-matrix.ts'];
      const task = makeTask({
        scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite },
        goNogo: {
          goCriteria: 'tests/orchestra/runtime-loop.test.ts passes',
          noGoCriteria: 'Fail',
          techDebtAcceptable: '',
        },
      });
      const originalFilesWrite = [...filesWrite];
      validateGoCriteriaScope(task);
      expect(task.scope.filesWrite).toEqual(originalFilesWrite);
    });
  });
});
