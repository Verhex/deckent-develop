import { describe, it, expect } from 'vitest';
import {
  classifyIntent,
  detectPrimaryIntent,
  detectTags,
} from '../../src/core/intent-classifier.js';
import type { IntentType } from '../../src/core/routing-types.js';
import { ALL_INTENT_TYPES, isValidIntentType } from '../../src/core/routing-types.js';

// ─── Sprint 148 T-148-003: Intent Classifier "testing" Refactor ─────────────
// 'testing' removed as primary intent. Test work → 'test-coverage' tag in TaskDNA.tags.

describe('intent-classifier-refactor — Sprint 148', () => {
  // Test 1: tests/ scope + "types" description → primary='implementation' or 'core-dev'-like, tags include 'test-coverage'
  it('T1: tests/ scope with "nervous types runtime testing" → NOT testing, tags include test-coverage', () => {
    const dna = classifyIntent({
      title: 'nervous types runtime testing',
      description: 'nervous types runtime testing',
      scope: {
        directories: ['tests/nervous/'],
        filesRead: [],
        filesWrite: ['tests/nervous/types.test.ts'],
      },
    });

    // Primary should NOT be 'testing' — it's removed from the union
    expect(dna.intent.primary).not.toBe('testing');
    // Tags should include 'test-coverage' because scope has tests/
    expect(dna.tags).toContain('test-coverage');
  });

  // Test 2: tests/ scope + "fix flaky" → primary=bugfix, tags include 'test-coverage'
  it('T2: tests/ scope with "fix flaky race condition" → primary=bugfix, tags include test-coverage', () => {
    const dna = classifyIntent({
      title: 'fix flaky race condition',
      description: 'Fix broken race condition bug causing regression in auth module',
      scope: {
        directories: ['tests/'],
        filesRead: [],
        filesWrite: ['tests/core/race.test.ts'],
      },
    });

    expect(dna.intent.primary).toBe('bugfix');
    expect(dna.tags).toContain('test-coverage');
  });

  // Test 3: src/core/ scope + "write types" → primary='implementation', no test-coverage tag
  it('T3: src/core/ scope with "write types" → primary=implementation, NO test-coverage tag', () => {
    const dna = classifyIntent({
      title: 'write types',
      description: 'write types for core module',
      scope: {
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/types.ts'],
      },
    });

    expect(dna.intent.primary).toBe('implementation');
    expect(dna.tags).not.toContain('test-coverage');
  });

  // Test 4: src/cli/ scope + "new command" → primary (not testing)
  it('T4: src/cli/ scope with "new command" → NOT testing', () => {
    const dna = classifyIntent({
      title: 'new command',
      description: 'add new CLI command',
      scope: {
        directories: ['src/cli/'],
        filesRead: [],
        filesWrite: ['src/cli/commands/new.ts'],
      },
    });

    expect(dna.intent.primary).not.toBe('testing');
    expect(dna.tags).not.toContain('test-coverage');
  });

  // Test 5: src/mcp/ scope + "add mcp tool" → primary (not testing)
  it('T5: src/mcp/ scope with "add mcp tool" → NOT testing', () => {
    const dna = classifyIntent({
      title: 'add mcp tool',
      description: 'add new MCP tool for nervous system',
      scope: {
        directories: ['src/mcp/'],
        filesRead: [],
        filesWrite: ['src/mcp/tools/nervous.ts'],
      },
    });

    expect(dna.intent.primary).not.toBe('testing');
  });

  // Test 6: src/dashboard/ scope + "ui component" → primary (not testing)
  it('T6: src/dashboard/ scope with "ui component" → NOT testing', () => {
    const dna = classifyIntent({
      title: 'ui component',
      description: 'build dashboard ui component',
      scope: {
        directories: ['src/dashboard/'],
        filesRead: [],
        filesWrite: ['src/dashboard/components/Widget.tsx'],
      },
    });

    expect(dna.intent.primary).not.toBe('testing');
  });

  // Test 7: TypeScript strict — 'testing' is NOT a valid IntentType
  it('T7: "testing" is not a valid IntentType (union removed)', () => {
    // At compile time: `const x: IntentType = 'testing'` would be a type error
    // At runtime: isValidIntentType should return false
    expect(isValidIntentType('testing')).toBe(false);
    expect(ALL_INTENT_TYPES).not.toContain('testing');
  });

  // Test 8: Sprint 147 T-147-019 replay (integration tests) → NOT testing, has test-coverage tag
  it('T8: Sprint 147 T-147-019 replay (integration tests) → NOT testing, has test-coverage', () => {
    const dna = classifyIntent({
      title: 'integration tests for nervous system',
      description: 'Write integration tests for nervous observer and detectors',
      scope: {
        directories: ['tests/nervous/', 'tests/integration/'],
        filesRead: ['src/nervous/observer.ts'],
        filesWrite: ['tests/nervous/observer.test.ts', 'tests/integration/nervous.test.ts'],
      },
    });

    expect(dna.intent.primary).not.toBe('testing');
    expect(dna.tags).toContain('test-coverage');
  });

  // Test 9: Sprint 146 T-146-011 replay (vitest regression fix) → primary=bugfix
  it('T9: Sprint 146 T-146-011 replay (vitest regression fix) → primary=bugfix', () => {
    const dna = classifyIntent({
      title: 'vitest regression fix',
      description: 'Fix broken vitest regression in config loader. Error crashes on missing fields.',
      scope: {
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/config.ts'],
      },
    });

    expect(dna.intent.primary).toBe('bugfix');
  });

  // Test 10: TaskDNA.tags includes 'test-coverage' when scope has tests/
  it('T10: routingMeta.taskDNA.tags includes test-coverage when scope has tests/', () => {
    const dna = classifyIntent({
      title: 'Add detector unit tests',
      description: 'Comprehensive test suite for all 5 nervous detectors',
      scope: {
        directories: ['tests/nervous/detectors/'],
        filesRead: ['src/nervous/detectors/stale-worker.ts'],
        filesWrite: ['tests/nervous/detectors/stale-worker.test.ts'],
      },
    });

    // The tags array should be present and contain test-coverage
    expect(dna.tags).toBeDefined();
    expect(Array.isArray(dna.tags)).toBe(true);
    expect(dna.tags).toContain('test-coverage');
    // Primary intent should NOT be 'testing'
    expect(dna.intent.primary).not.toBe('testing');
  });

  // ─── Additional: detectTags unit tests ────────────────────────────────────

  describe('detectTags', () => {
    it('returns test-coverage when directories include tests/', () => {
      const tags = detectTags({
        directories: ['tests/core/'],
        filesRead: [],
        filesWrite: [],
      });
      expect(tags).toContain('test-coverage');
    });

    it('returns test-coverage when filesWrite includes .test.ts', () => {
      const tags = detectTags({
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/foo.ts', 'tests/core/foo.test.ts'],
      });
      expect(tags).toContain('test-coverage');
    });

    it('returns empty tags for pure source scope', () => {
      const tags = detectTags({
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/config.ts'],
      });
      expect(tags).not.toContain('test-coverage');
      expect(tags).toEqual([]);
    });

    it('returns test-coverage for .spec.ts files', () => {
      const tags = detectTags({
        directories: ['src/'],
        filesRead: [],
        filesWrite: ['src/core/foo.spec.ts'],
      });
      expect(tags).toContain('test-coverage');
    });

    it('returns test-coverage for .test.tsx files', () => {
      const tags = detectTags({
        directories: ['src/dashboard/'],
        filesRead: [],
        filesWrite: ['src/dashboard/App.test.tsx'],
      });
      expect(tags).toContain('test-coverage');
    });

    it('does not duplicate test-coverage tag', () => {
      const tags = detectTags({
        directories: ['tests/'],
        filesRead: [],
        filesWrite: ['tests/core/foo.test.ts'],
      });
      expect(tags.filter(t => t === 'test-coverage')).toHaveLength(1);
    });
  });
});
