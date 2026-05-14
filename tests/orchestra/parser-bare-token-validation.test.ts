/**
 * Sprint 168 C0c RC1 — Parser bare token validation tests.
 *
 * Sprint 167 cascade root layer: DIRECTIVES Files: parser accepted bare
 * extension tokens like ".ts" or ".md" as filesWrite entries, causing
 * scope.filesWrite arrays polluted with non-path strings.
 *
 * validateScopeFilesWrite() rejects bare extension tokens + basename-only
 * paths, returns { valid, errors, sanitized } so callers can sanitize
 * before persisting the task scope.
 */
import { describe, it, expect } from 'vitest';
import { validateScopeFilesWrite } from '../../src/orchestra/task-builder.js';

describe('validateScopeFilesWrite (Sprint 168 C0c RC1)', () => {
  it('rejects bare extension tokens', () => {
    const result = validateScopeFilesWrite(['.ts', '.md', 'foo/bar.ts']);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Bare token detected: .ts');
    expect(result.errors).toContain('Bare token detected: .md');
    expect(result.sanitized).toEqual(['foo/bar.ts']);
  });

  it('accepts full paths', () => {
    const result = validateScopeFilesWrite(['.audit/sprint-168/T1.md', 'src/core/foo.ts']);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.sanitized).toEqual(['.audit/sprint-168/T1.md', 'src/core/foo.ts']);
  });

  it('rejects basename-only paths (no separator)', () => {
    const result = validateScopeFilesWrite(['foo.ts', 'bar.md']);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Basename without path: foo.ts');
    expect(result.errors).toContain('Basename without path: bar.md');
    expect(result.sanitized).toEqual([]);
  });

  it('rejects all blocklist tokens (.ts, .md, .test, test.ts, .json, .txt)', () => {
    const result = validateScopeFilesWrite(['.ts', '.md', '.test', 'test.ts', '.json', '.txt']);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(6);
    expect(result.sanitized).toEqual([]);
  });

  it('returns empty sanitized array on empty input', () => {
    const result = validateScopeFilesWrite([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.sanitized).toEqual([]);
  });

  it('mixed valid + invalid — partial sanitization', () => {
    const result = validateScopeFilesWrite([
      '.ts',                     // bare token — rejected
      'src/orchestra/x.ts',      // full path — kept
      'README.md',               // basename only — rejected
      'docs/guide.md',           // full path — kept
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.sanitized).toEqual(['src/orchestra/x.ts', 'docs/guide.md']);
  });
});
