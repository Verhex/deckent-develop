import { describe, it, expect } from 'vitest';
import { normalizePath, toUnixPath, assertPathEquals, joinUnix } from './paths.js';

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('src\\foo\\bar.ts')).toBe('src/foo/bar.ts');
  });

  it('passes through forward slashes unchanged', () => {
    expect(normalizePath('src/foo/bar.ts')).toBe('src/foo/bar.ts');
  });

  it('handles mixed slashes', () => {
    expect(normalizePath('src\\foo/bar\\baz.ts')).toBe('src/foo/bar/baz.ts');
  });

  it('handles empty string', () => {
    expect(normalizePath('')).toBe('');
  });

  it('handles absolute Windows-style paths', () => {
    expect(normalizePath('C:\\Users\\dev\\project')).toBe('C:/Users/dev/project');
  });

  it('handles paths with no separators', () => {
    expect(normalizePath('file.ts')).toBe('file.ts');
  });

  it('handles trailing backslash', () => {
    expect(normalizePath('src\\folder\\')).toBe('src/folder/');
  });
});

describe('toUnixPath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(toUnixPath('src\\foo\\bar.ts')).toBe('src/foo/bar.ts');
  });

  it('passes through forward slashes unchanged', () => {
    expect(toUnixPath('src/foo/bar.ts')).toBe('src/foo/bar.ts');
  });

  it('handles empty string', () => {
    expect(toUnixPath('')).toBe('');
  });

  it('produces same result as normalizePath for backslash paths', () => {
    const p = 'a\\b\\c';
    expect(toUnixPath(p)).toBe(normalizePath(p));
  });
});

describe('assertPathEquals', () => {
  it('passes when paths are identical forward-slash paths', () => {
    expect(() => assertPathEquals('src/foo/bar.ts', 'src/foo/bar.ts')).not.toThrow();
  });

  it('passes when actual has backslashes and expected has forward slashes', () => {
    expect(() => assertPathEquals('src\\foo\\bar.ts', 'src/foo/bar.ts')).not.toThrow();
  });

  it('passes when both have backslashes', () => {
    expect(() => assertPathEquals('src\\foo\\bar.ts', 'src\\foo\\bar.ts')).not.toThrow();
  });

  it('throws when paths differ after normalization', () => {
    expect(() => assertPathEquals('src/foo/bar.ts', 'src/baz/bar.ts')).toThrow();
  });

  it('throws when filenames differ', () => {
    expect(() => assertPathEquals('src/foo/bar.ts', 'src/foo/baz.ts')).toThrow();
  });
});

describe('joinUnix', () => {
  it('joins segments with forward slashes', () => {
    expect(joinUnix('src', 'foo', 'bar.ts')).toBe('src/foo/bar.ts');
  });

  it('normalizes backslashes in segments', () => {
    expect(joinUnix('src\\foo', 'bar.ts')).toBe('src/foo/bar.ts');
  });

  it('collapses repeated slashes', () => {
    expect(joinUnix('src/', '/foo', 'bar.ts')).toBe('src/foo/bar.ts');
  });

  it('works with a single segment', () => {
    expect(joinUnix('file.ts')).toBe('file.ts');
  });
});
