import { describe, it, expect } from 'vitest';
import { sanitizeScope, isPlaceholderPath, isJsAccessPattern } from '../../src/orchestra/scope-sanitizer.js';
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
- Model: sonnet
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

  // Test 4: Placeholder path detection (example.ts)
  it('rejects example.ts as placeholder', () => {
    expect(isPlaceholderPath('src/example.ts')).toBe(true);
    expect(isPlaceholderPath('example.ts')).toBe(true);
    expect(isPlaceholderPath('tests/example.test.ts')).toBe(true);
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
    expect(isPlaceholderPath('src/bar.js')).toBe(true);
    expect(isPlaceholderPath('tests/baz.test.ts')).toBe(true);
    expect(isPlaceholderPath('qux.md')).toBe(true);
  });

  it('preserves real filenames that are not placeholders', () => {
    expect(isPlaceholderPath('src/config.ts')).toBe(false);
    expect(isPlaceholderPath('src/task-builder.ts')).toBe(false);
    expect(isPlaceholderPath('src/foo-bar.ts')).toBe(false);
    expect(isPlaceholderPath('.deckent/config.json')).toBe(false);
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
