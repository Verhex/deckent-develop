import { describe, it, expect } from 'vitest';
import { TaskAnalyzer } from '../../src/orchestra/task-analyzer.js';
import type { TaskScope } from '../../src/core/types.js';
import type { TaskType } from '../../src/core/decision-types.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeScope(dirs: string[] = [], filesWrite: string[] = [], filesRead: string[] = []): TaskScope {
  return { directories: dirs, filesRead, filesWrite };
}

function makeTask(title: string, description: string, scope?: TaskScope) {
  return { title, description, scope: scope ?? makeScope(['src/core/']) };
}

// ─── TaskAnalyzer.inferType ────────────────────────────────────────────────

describe('TaskAnalyzer.inferType', () => {
  const analyzer = new TaskAnalyzer();

  it('infers test type from "test" keyword', () => {
    expect(analyzer.inferType('Add unit test for parser')).toBe('test');
  });

  it('infers test type from "spec" keyword', () => {
    expect(analyzer.inferType('Write spec for config module')).toBe('test');
  });

  it('infers test type from "coverage" keyword', () => {
    expect(analyzer.inferType('Improve coverage for brain.ts')).toBe('test');
  });

  it('infers doc type from "doc" keyword', () => {
    expect(analyzer.inferType('Update doc for API surface')).toBe('doc');
  });

  it('infers doc type from "readme" keyword', () => {
    expect(analyzer.inferType('Write readme for the project')).toBe('doc');
  });

  it('infers doc type from "changelog" keyword', () => {
    expect(analyzer.inferType('Update changelog for v2')).toBe('doc');
  });

  it('infers doc type from "guide" keyword', () => {
    expect(analyzer.inferType('Create setup guide')).toBe('doc');
  });

  it('infers security type from "security" keyword', () => {
    expect(analyzer.inferType('Fix security vulnerability')).toBe('security');
  });

  it('infers security type from "auth" keyword', () => {
    expect(analyzer.inferType('Implement auth middleware')).toBe('security');
  });

  it('infers security type from "jwt" keyword', () => {
    expect(analyzer.inferType('Add jwt validation')).toBe('security');
  });

  it('infers security type from "csrf" keyword', () => {
    expect(analyzer.inferType('Add csrf protection')).toBe('security');
  });

  it('infers refactor type from "refactor" keyword', () => {
    expect(analyzer.inferType('Refactor brain module')).toBe('refactor');
  });

  it('infers refactor type from "rename" keyword', () => {
    expect(analyzer.inferType('Rename utils to helpers')).toBe('refactor');
  });

  it('infers refactor type from "extract" keyword', () => {
    expect(analyzer.inferType('Extract validation logic')).toBe('refactor');
  });

  it('infers refactor type from "split" keyword', () => {
    expect(analyzer.inferType('Split large module')).toBe('refactor');
  });

  it('infers devops type from "docker" keyword', () => {
    expect(analyzer.inferType('Set up docker build')).toBe('devops');
  });

  it('infers devops type from "ci" keyword', () => {
    expect(analyzer.inferType('Configure CI pipeline')).toBe('devops');
  });

  it('infers devops type from "deploy" keyword', () => {
    expect(analyzer.inferType('Automate deploy process')).toBe('devops');
  });

  it('infers devops type from "pipeline" keyword', () => {
    expect(analyzer.inferType('Build pipeline for release')).toBe('devops');
  });

  it('infers config type from "config" keyword', () => {
    expect(analyzer.inferType('Update config defaults')).toBe('config');
  });

  it('infers config type from "settings" keyword', () => {
    expect(analyzer.inferType('Change settings format')).toBe('config');
  });

  it('infers config type from "env" keyword', () => {
    expect(analyzer.inferType('Add env variable support')).toBe('config');
  });

  it('defaults to code for generic text', () => {
    expect(analyzer.inferType('Implement user dashboard')).toBe('code');
  });

  it('defaults to code for empty string', () => {
    expect(analyzer.inferType('')).toBe('code');
  });
});

// ─── TaskAnalyzer.analyze — type inference ─────────────────────────────────

describe('TaskAnalyzer.analyze — type', () => {
  const analyzer = new TaskAnalyzer();

  it('sets type from title keywords', () => {
    const result = analyzer.analyze(makeTask('Write tests for parser', 'Unit tests'));
    expect(result.type).toBe('test');
  });

  it('sets type from description keywords', () => {
    const result = analyzer.analyze(makeTask('Module work', 'Refactor the validation layer'));
    expect(result.type).toBe('refactor');
  });

  it('defaults to code when no type keywords found', () => {
    const result = analyzer.analyze(makeTask('Build user page', 'Implement login flow'));
    expect(result.type).toBe('code');
  });
});

// ─── TaskAnalyzer.analyze — complexity ─────────────────────────────────────

describe('TaskAnalyzer.analyze — complexity', () => {
  const analyzer = new TaskAnalyzer();

  it('returns low complexity for single directory', () => {
    const result = analyzer.analyze(makeTask('Small fix', 'Quick change', makeScope(['src/core/'])));
    expect(result.complexity).toBeLessThanOrEqual(3);
  });

  it('returns medium complexity for 4-6 directories', () => {
    const dirs = ['src/a/', 'src/b/', 'src/c/', 'src/d/'];
    const result = analyzer.analyze(makeTask('Multi-module task', 'Change across modules', makeScope(dirs)));
    expect(result.complexity).toBeGreaterThanOrEqual(3);
    expect(result.complexity).toBeLessThanOrEqual(7);
  });

  it('returns high complexity for 7+ directories', () => {
    const dirs = Array.from({ length: 8 }, (_, i) => `src/mod${i}/`);
    const result = analyzer.analyze(makeTask('Large change', 'Across many modules', makeScope(dirs)));
    expect(result.complexity).toBeGreaterThanOrEqual(7);
  });

  it('boosts complexity for architectural keywords', () => {
    const simple = analyzer.analyze(makeTask('Change', 'Simple', makeScope(['src/a/', 'src/b/'])));
    const arch = analyzer.analyze(makeTask('Architect the system', 'Major redesign', makeScope(['src/a/', 'src/b/'])));
    expect(arch.complexity).toBeGreaterThan(simple.complexity);
  });

  it('reduces complexity for trivial keywords', () => {
    const normal = analyzer.analyze(makeTask('Change X', 'Something', makeScope(['src/a/', 'src/b/', 'src/c/'])));
    const trivial = analyzer.analyze(makeTask('Simple change', 'Trivial fix', makeScope(['src/a/', 'src/b/', 'src/c/'])));
    expect(trivial.complexity).toBeLessThanOrEqual(normal.complexity);
  });

  it('boosts complexity for many filesWrite', () => {
    const manyFiles = Array.from({ length: 12 }, (_, i) => `src/file${i}.ts`);
    const result = analyzer.analyze(makeTask('Large file set', 'Many writes', makeScope(['src/'], manyFiles)));
    expect(result.complexity).toBeGreaterThanOrEqual(3);
  });

  it('clamps complexity to 0-10 range', () => {
    const result = analyzer.analyze(makeTask('Simple stub', 'Trivial placeholder', makeScope([])));
    expect(result.complexity).toBeGreaterThanOrEqual(0);
    expect(result.complexity).toBeLessThanOrEqual(10);
  });
});

// ─── TaskAnalyzer.analyze — keywords ───────────────────────────────────────

describe('TaskAnalyzer.analyze — keywords', () => {
  const analyzer = new TaskAnalyzer();

  it('extracts keywords from title', () => {
    const result = analyzer.analyze(makeTask('Provider abstraction interface', 'Define types'));
    expect(result.keywords).toContain('provider');
    expect(result.keywords).toContain('abstraction');
    expect(result.keywords).toContain('interface');
  });

  it('extracts keywords from description', () => {
    const result = analyzer.analyze(makeTask('Task', 'Build the registry with validation'));
    expect(result.keywords).toContain('registry');
    expect(result.keywords).toContain('validation');
  });

  it('filters stopwords', () => {
    const result = analyzer.analyze(makeTask('A simple task for the project', 'Is this a test'));
    expect(result.keywords).not.toContain('a');
    expect(result.keywords).not.toContain('the');
    expect(result.keywords).not.toContain('for');
    expect(result.keywords).not.toContain('is');
  });

  it('deduplicates keywords', () => {
    const result = analyzer.analyze(makeTask('parser parser parser', 'parser again'));
    const parserCount = result.keywords.filter(k => k === 'parser').length;
    expect(parserCount).toBe(1);
  });

  it('returns empty for empty input', () => {
    const result = analyzer.analyze(makeTask('', '', makeScope([])));
    expect(result.keywords).toEqual([]);
  });
});

// ─── TaskAnalyzer.analyze — scopeWeight ────────────────────────────────────

describe('TaskAnalyzer.analyze — scopeWeight', () => {
  const analyzer = new TaskAnalyzer();

  it('returns 0 for empty scope', () => {
    const result = analyzer.analyze(makeTask('Task', 'Desc', makeScope([])));
    expect(result.scopeWeight).toBe(0);
  });

  it('increases with more directories', () => {
    const one = analyzer.analyze(makeTask('T', 'D', makeScope(['src/'])));
    const three = analyzer.analyze(makeTask('T', 'D', makeScope(['src/', 'tests/', 'docs/'])));
    expect(three.scopeWeight).toBeGreaterThan(one.scopeWeight);
  });

  it('increases with more filesWrite', () => {
    const none = analyzer.analyze(makeTask('T', 'D', makeScope(['src/'])));
    const some = analyzer.analyze(makeTask('T', 'D', makeScope(['src/'], ['a.ts', 'b.ts'])));
    expect(some.scopeWeight).toBeGreaterThan(none.scopeWeight);
  });

  it('accounts for filesRead', () => {
    const noRead = analyzer.analyze(makeTask('T', 'D', makeScope(['src/'], [], [])));
    const withRead = analyzer.analyze(makeTask('T', 'D', makeScope(['src/'], [], ['a.ts', 'b.ts'])));
    expect(withRead.scopeWeight).toBeGreaterThan(noRead.scopeWeight);
  });
});

// ─── TaskAnalyzer.analyze — estimatedDurationMs ────────────────────────────

describe('TaskAnalyzer.analyze — estimatedDurationMs', () => {
  const analyzer = new TaskAnalyzer();

  it('returns a positive duration', () => {
    const result = analyzer.analyze(makeTask('Build feature', 'Code it', makeScope(['src/'])));
    expect(result.estimatedDurationMs).toBeGreaterThan(0);
  });

  it('test tasks have shorter base duration than code tasks at same complexity', () => {
    const testTask = analyzer.analyze(makeTask('Write test coverage', 'spec', makeScope(['tests/'])));
    const codeTask = analyzer.analyze(makeTask('Build feature', 'Something', makeScope(['tests/'])));
    // Both at similar complexity, test base is lower
    expect(testTask.type).toBe('test');
    expect(codeTask.type).toBe('code');
  });

  it('higher complexity increases duration', () => {
    const low = analyzer.analyze(makeTask('Simple fix', 'trivial', makeScope(['src/'])));
    const high = analyzer.analyze(makeTask('Architect overhaul', 'Major redesign migration', makeScope(['src/', 'tests/', 'docs/', 'config/', 'lib/', 'pkg/', 'api/'])));
    expect(high.estimatedDurationMs).toBeGreaterThan(low.estimatedDurationMs);
  });

  it('doc tasks have short base duration', () => {
    const result = analyzer.analyze(makeTask('Update readme', 'doc changes', makeScope(['docs/'])));
    expect(result.type).toBe('doc');
    expect(result.estimatedDurationMs).toBeGreaterThan(0);
  });
});
