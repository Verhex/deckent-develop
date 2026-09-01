import { describe, it, expect } from 'vitest';
import {
  sanitizeReadScope,
  sanitizeScope,
  isPlaceholderPath,
  isJsAccessPattern,
} from '../../src/orchestra/scope-sanitizer.js';
import { parseStructuredDirectives, maskCodeBlocks } from '../../src/orchestra/task-builder.js';

describe('scope-sanitizer v2 — code snippet false positive fix', () => {
  // Test 1: Placeholder paths rejected, real paths preserved
  it('rejects placeholder paths like src/foo.ts but keeps real paths', () => {
    const result = sanitizeScope(['src/a.ts', 'src/foo.ts', 'tests/foo.test.ts']);
    expect(result.filesWrite).toEqual(['src/a.ts']);
  });

  // Test 2: JS access patterns rejected
  it('rejects JS property access patterns like .directories and .some', () => {
    const result = sanitizeScope(['.directories', '.some', '.filter', 'src/core/config.ts']);
    expect(result.filesWrite).toEqual(['src/core/config.ts']);
  });

  // Test 3: Code block paths filtered via maskCodeBlocks + parseStructuredDirectives
  it('filters paths inside code blocks in DIRECTIVES', () => {
    const content = `# DIRECTIVES — Sprint 149

## Goal: Test

---

## Task 1: Config Update
- Model: claude-sonnet-5
- Effort: normal
- Files: src/core/config.ts
- Scope: src/core/

### Description
Update config.

\`\`\`typescript
import { loadConfig } from 'src/core/loader.ts';
const file = 'src/example/fake-path.ts';
\`\`\`

**Kanıt:** Test passes
`;
    const tasks = parseStructuredDirectives(content);
    expect(tasks.length).toBe(1);
    const filesWrite = tasks[0]!.scope.filesWrite;
    // Real file from Files: label should be present
    expect(filesWrite).toContain('src/core/config.ts');
    // Code block paths should NOT be present
    expect(filesWrite).not.toContain('src/core/loader.ts');
    expect(filesWrite).not.toContain('src/example/fake-path.ts');
  });

  // Test 4: shallow placeholders are rejected; deep exact targets are preserved
  it('rejects shallow example.ts but preserves deeply qualified targets', () => {
    expect(isPlaceholderPath('src/example.ts')).toBe(true);
    expect(isPlaceholderPath('example.ts')).toBe(true);
    expect(isPlaceholderPath('tests/example.test.ts')).toBe(true);
    expect(isPlaceholderPath('deneme/task-001/example.test.ts')).toBe(false);
    expect(isPlaceholderPath('deneme\\task-001\\example.test.ts')).toBe(false);
  });

  // Test 5: Real scope paths preserved
  it('preserves real scope paths like src/core/config.ts', () => {
    const result = sanitizeScope([
      'src/core/config.ts',
      'src/orchestra/task-builder.ts',
      'tests/core/config.test.ts',
    ]);
    expect(result.filesWrite).toEqual([
      'src/core/config.ts',
      'src/orchestra/task-builder.ts',
      'tests/core/config.test.ts',
    ]);
  });

  // Test 6: Sprint 148 T-002 replay — 4 false positives filtered
  it('Sprint 148 T-002 replay: filters .directories, .some, src/foo.ts, tests/foo.test.ts', () => {
    const result = sanitizeScope([
      '.directories',
      '.some',
      'src/foo.ts',
      'tests/foo.test.ts',
      'src/core/config.ts',
      'src/orchestra/task-builder.ts',
    ]);
    expect(result.filesWrite).toEqual([
      'src/core/config.ts',
      'src/orchestra/task-builder.ts',
    ]);
    // None of the false positives should survive
    expect(result.filesWrite).not.toContain('.directories');
    expect(result.filesWrite).not.toContain('.some');
    expect(result.filesWrite).not.toContain('src/foo.ts');
    expect(result.filesWrite).not.toContain('tests/foo.test.ts');
  });

  // Test 7: Edge case — src/foo-bar.ts PRESERVED (composite name, not placeholder)
  it('preserves composite names like src/foo-bar.ts (not a placeholder)', () => {
    const result = sanitizeScope(['src/foo-bar.ts', 'src/foo.ts']);
    expect(result.filesWrite).toEqual(['src/foo-bar.ts']);
  });

  // Test 8: maskCodeBlocks helper works correctly
  it('maskCodeBlocks replaces code block content with newlines', () => {
    const input = `Line 1
\`\`\`typescript
const x = 'src/fake.ts';
const y = 'tests/fake.test.ts';
\`\`\`
Line 6`;
    const masked = maskCodeBlocks(input);
    // Code block content should be gone
    expect(masked).not.toContain('src/fake.ts');
    expect(masked).not.toContain('tests/fake.test.ts');
    // Line count should be preserved
    expect(masked.split('\n').length).toBe(input.split('\n').length);
    // Non-code-block lines should remain
    expect(masked).toContain('Line 1');
    expect(masked).toContain('Line 6');
  });
});

describe('isPlaceholderPath edge cases', () => {
  it('rejects foo, bar, baz, qux, test as base names', () => {
    expect(isPlaceholderPath('foo.ts')).toBe(true);
    expect(isPlaceholderPath('bar.js')).toBe(true);
    expect(isPlaceholderPath('baz.test.ts')).toBe(true);
    expect(isPlaceholderPath('qux.md')).toBe(true);
  });

  it('preserves deeply qualified conventional filenames', () => {
    expect(isPlaceholderPath('src/bar.js')).toBe(true);
    expect(isPlaceholderPath('tests/baz.test.ts')).toBe(true);
    expect(sanitizeScope([
      'deneme/task-001/README.md',
      'deneme/task-001/example.test.ts',
    ]).filesWrite).toEqual([
      'deneme/task-001/README.md',
      'deneme/task-001/example.test.ts',
    ]);
  });

  it('preserves real filenames that are not placeholders', () => {
    expect(isPlaceholderPath('src/config.ts')).toBe(false);
    expect(isPlaceholderPath('src/task-builder.ts')).toBe(false);
    expect(isPlaceholderPath('src/foo-bar.ts')).toBe(false);
    expect(isPlaceholderPath('.deckent/config.json')).toBe(false);
  });
});

describe('sanitizeScope Rule-5 trackedRootFiles-aware (sprint-397 evidence: 011/012)', () => {
  const TRACKED = new Set(['README.md', 'README-TR.md', '.secrets-baseline', 'DIRECTIVES.md']);

  // 397-011 replay: README.md + README-TR.md were silently dropped as
  // "unqualified filenames" even though they were real, git-tracked root files.
  it('397-011 replay: preserves README.md and README-TR.md when tracked', () => {
    const result = sanitizeScope(
      ['README.md', 'README-TR.md', 'src/core/config.ts'],
      TRACKED,
    );
    expect(result.filesWrite).toEqual(['README.md', 'README-TR.md', 'src/core/config.ts']);
    expect(result.warnings).toEqual([]);
  });

  // 397-012 replay: .secrets-baseline was in the task JSON's WRITE authority but
  // dropped by Rule 5 before rendering.
  it('397-012 replay: preserves .secrets-baseline when tracked', () => {
    const result = sanitizeScope(['.secrets-baseline', 'src/core/config.ts'], TRACKED);
    expect(result.filesWrite).toEqual(['.secrets-baseline', 'src/core/config.ts']);
    expect(result.warnings).toEqual([]);
  });

  it('preserves DIRECTIVES.md when tracked', () => {
    const result = sanitizeScope(['DIRECTIVES.md', 'src/core/config.ts'], TRACKED);
    expect(result.filesWrite).toEqual(['DIRECTIVES.md', 'src/core/config.ts']);
  });

  it('still drops an unqualified name that is NOT in trackedRootFiles', () => {
    const result = sanitizeScope(['init.ts', 'README.md', 'src/core/config.ts'], TRACKED);
    expect(result.filesWrite).toEqual(['README.md', 'src/core/config.ts']);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('init.ts');
  });

  it('GLOBAL_PROTECTED still wins even when the file is also in trackedRootFiles', () => {
    const tracked = new Set(['config.json', 'README.md']);
    const result = sanitizeScope(['config.json', 'README.md', 'src/core/config.ts'], tracked);
    expect(result.filesWrite).toEqual(['README.md', 'src/core/config.ts']);
    expect(result.filesWrite).not.toContain('config.json');
  });

  it('F-1: a lowercase readme.md is preserved too (well-known root file, case-insensitive)', () => {
    // Pre-F-1 this pinned the exact-match drop; the well-known-root-file
    // carve-out is deliberately case-insensitive (creating "readme.md" is a
    // legitimate ecosystem convention, not a typo of the tracked README.md).
    const result = sanitizeScope(['readme.md', 'src/core/config.ts'], TRACKED);
    expect(result.filesWrite).toEqual(['readme.md', 'src/core/config.ts']);
    expect(result.warnings).toEqual([]);
  });

  it('backward-compat: omitting trackedRootFiles ≡ empty set (identical results)', () => {
    const withoutTracked = sanitizeScope(['README.md', 'init.ts', 'src/core/config.ts']);
    const withEmptyTracked = sanitizeScope(
      ['README.md', 'init.ts', 'src/core/config.ts'],
      new Set(),
    );
    expect(withoutTracked).toEqual(withEmptyTracked);
    // F-1: README.md now survives via the well-known-root-file carve-out;
    // init.ts still warns+drops (a genuinely unqualified source file).
    expect(withoutTracked.filesWrite).toEqual(['README.md', 'src/core/config.ts']);
    expect(withoutTracked.warnings.length).toBe(1);
    expect(withoutTracked.warnings[0]).toContain('init.ts');
  });

  // ─── F-1 — well-known root-file carve-out (sparse-project path-sprawl) ─────
  describe('F-1: WELL_KNOWN_ROOT_FILES carve-out', () => {
    it('preserves untracked root doc files by bare name (README-TR.md, LICENSE, CHANGELOG.md)', () => {
      const result = sanitizeScope(['README-TR.md', 'LICENSE', 'CHANGELOG.md', 'src/a.ts'], new Set());
      expect(result.filesWrite).toEqual(['README-TR.md', 'LICENSE', 'CHANGELOG.md', 'src/a.ts']);
      expect(result.warnings).toEqual([]);
    });

    it('a genuinely unqualified source file still warns + drops', () => {
      const result = sanitizeScope(['init.ts'], new Set());
      expect(result.filesWrite).toEqual([]);
      expect(result.warnings.length).toBe(1);
    });

    it('GLOBAL_PROTECTED still wins — bare package.json is dropped, never preserved', () => {
      const result = sanitizeScope(['package.json', 'src/a.ts'], new Set());
      expect(result.filesWrite).toEqual(['src/a.ts']);
    });

    it('a directory-qualified readme path is untouched by the carve-out (normal Rule-5 bypass)', () => {
      const result = sanitizeScope(['docs/README.md'], new Set());
      expect(result.filesWrite).toEqual(['docs/README.md']);
    });
  });

  it('Windows backslash path behavior unchanged regardless of trackedRootFiles', () => {
    const withTracked = sanitizeScope(['src\\core\\config.ts'], TRACKED);
    const withoutTracked = sanitizeScope(['src\\core\\config.ts']);
    expect(withTracked).toEqual(withoutTracked);
    expect(withTracked.filesWrite).toEqual(['src\\core\\config.ts']);
    expect(withTracked.warnings).toEqual([]);
  });
});

describe('sanitizeReadScope — exact project-file authority', () => {
  it('preserves exact root manifests without weakening their write protection', () => {
    const read = sanitizeReadScope([
      'package.json',
      'tsconfig.json',
      'package-lock.json',
      'npm-shrinkwrap.json',
      'src/core/config.ts',
      'foo..bar.ts',
      ' PACKAGE.JSON ',
    ]);

    expect(read.filesRead).toEqual([
      'package.json',
      'tsconfig.json',
      'package-lock.json',
      'npm-shrinkwrap.json',
      'src/core/config.ts',
      'foo..bar.ts',
    ]);
    expect(read.warnings).toEqual([]);
    expect(read.rejected).toEqual([]);
    expect(sanitizeScope([
      'package.json',
      'tsconfig.json',
      'package-lock.json',
      'npm-shrinkwrap.json',
    ]).filesWrite).toEqual([]);
  });

  it('rejects cross-platform absolute, traversal, glob, control and directory-shaped reads', () => {
    const invalid = [
      '/etc/passwd',
      'C:\\Windows\\system.ini',
      'C:relative\\file.txt',
      '\\\\server\\share\\file.txt',
      '\\\\?\\C:\\secret.txt',
      '../outside.ts',
      'src/../../outside.ts',
      'src/**/*.ts',
      'src/[ab].ts',
      'src/',
      'src\\',
      `src/${String.fromCharCode(0)}secret.ts`,
    ];

    const result = sanitizeReadScope([...invalid, 'src/core/config.ts']);
    expect(result.filesRead).toEqual(['src/core/config.ts']);
    expect(result.rejected).toEqual(invalid);
  });

  it('rejects Windows absolute write paths on non-Windows hosts too', () => {
    const result = sanitizeScope([
      'C:\\Windows\\system.ini',
      '\\\\server\\share\\file.txt',
      '\\\\?\\C:\\secret.txt',
      'src/core/config.ts',
    ]);
    expect(result.filesWrite).toEqual(['src/core/config.ts']);
    expect(result.rejected).toEqual([
      'C:\\Windows\\system.ini',
      '\\\\server\\share\\file.txt',
      '\\\\?\\C:\\secret.txt',
    ]);
  });
});

describe('isJsAccessPattern edge cases', () => {
  it('detects JS-like access patterns', () => {
    expect(isJsAccessPattern('.directories')).toBe(true);
    expect(isJsAccessPattern('.some')).toBe(true);
    expect(isJsAccessPattern('.filter')).toBe(true);
    expect(isJsAccessPattern('.length')).toBe(true);
    expect(isJsAccessPattern('.toString')).toBe(true);
  });

  it('does not flag real paths', () => {
    expect(isJsAccessPattern('.deckent/config.json')).toBe(false);
    expect(isJsAccessPattern('.brain/memory.db')).toBe(false);
    expect(isJsAccessPattern('.gitignore')).toBe(false);
    expect(isJsAccessPattern('src/core/config.ts')).toBe(false);
  });
});
