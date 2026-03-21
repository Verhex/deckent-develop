import { describe, it, expect } from 'vitest';
import { ChangeCategorizer } from '../../../src/cli/helpers/change-categorizer.js';
import type { FileChange, ChangeCategory } from '../../../src/cli/helpers/change-categorizer.js';

function makeFile(overrides: Partial<FileChange> = {}): FileChange {
  return {
    filePath: 'src/main.ts',
    linesAdded: 10,
    linesRemoved: 2,
    ...overrides,
  };
}

describe('ChangeCategorizer', () => {
  const categorizer = new ChangeCategorizer();

  // ─── detectCategory ───────────────────────────────────────────────

  describe('detectCategory', () => {
    it('detects test files by /tests/ path', () => {
      expect(categorizer.detectCategory('tests/core/config.test.ts')).toBe('test');
    });

    it('detects test files by .test. suffix', () => {
      expect(categorizer.detectCategory('src/foo.test.ts')).toBe('test');
    });

    it('detects test files by .spec. suffix', () => {
      expect(categorizer.detectCategory('src/bar.spec.ts')).toBe('test');
    });

    it('detects test files by /test/ path', () => {
      expect(categorizer.detectCategory('test/unit/foo.ts')).toBe('test');
    });

    it('detects config files by tsconfig pattern', () => {
      expect(categorizer.detectCategory('tsconfig.json')).toBe('config');
    });

    it('detects config files by package.json', () => {
      expect(categorizer.detectCategory('package.json')).toBe('config');
    });

    it('detects config files by yaml extension', () => {
      expect(categorizer.detectCategory('config/settings.yaml')).toBe('config');
    });

    it('detects config files by yml extension', () => {
      expect(categorizer.detectCategory('config.yml')).toBe('config');
    });

    it('detects docs by .md extension', () => {
      expect(categorizer.detectCategory('README.md')).toBe('docs');
    });

    it('detects docs by /docs/ path', () => {
      expect(categorizer.detectCategory('docs/guide.txt')).toBe('docs');
    });

    it('detects build files by Dockerfile', () => {
      expect(categorizer.detectCategory('Dockerfile')).toBe('build');
    });

    it('detects build files by .github/ path', () => {
      expect(categorizer.detectCategory('.github/workflows/ci.yml')).toBe('build');
    });

    it('detects build files by .sh extension', () => {
      expect(categorizer.detectCategory('scripts/deploy.sh')).toBe('build');
    });

    it('defaults to source for .ts files', () => {
      expect(categorizer.detectCategory('src/core/brain.ts')).toBe('source');
    });

    it('defaults to source for .js files', () => {
      expect(categorizer.detectCategory('src/index.js')).toBe('source');
    });
  });

  // ─── categorize ───────────────────────────────────────────────────

  describe('categorize', () => {
    it('groups files by category', () => {
      const files = [
        makeFile({ filePath: 'src/main.ts' }),
        makeFile({ filePath: 'tests/main.test.ts' }),
        makeFile({ filePath: 'README.md' }),
      ];
      const result = categorizer.categorize(files);
      expect(result.get('source')).toHaveLength(1);
      expect(result.get('test')).toHaveLength(1);
      expect(result.get('docs')).toHaveLength(1);
    });

    it('returns empty map for empty input', () => {
      const result = categorizer.categorize([]);
      expect(result.size).toBe(0);
    });

    it('puts multiple source files in same category', () => {
      const files = [
        makeFile({ filePath: 'src/a.ts' }),
        makeFile({ filePath: 'src/b.ts' }),
      ];
      const result = categorizer.categorize(files);
      expect(result.get('source')).toHaveLength(2);
    });
  });

  // ─── formatCategorized ────────────────────────────────────────────

  describe('formatCategorized', () => {
    it('returns "No changes" for empty map', () => {
      const result = categorizer.formatCategorized(new Map());
      expect(result).toBe('No changes');
    });

    it('formats source category with header', () => {
      const map = new Map<ChangeCategory, FileChange[]>([
        ['source', [makeFile({ filePath: 'src/main.ts', linesAdded: 20, linesRemoved: 5 })]],
      ]);
      const result = categorizer.formatCategorized(map);
      expect(result).toContain('SOURCE');
      expect(result).toContain('1 files');
      expect(result).toContain('+20');
      expect(result).toContain('-5');
    });

    it('shows multiple categories in correct order', () => {
      const map = new Map<ChangeCategory, FileChange[]>([
        ['test', [makeFile({ filePath: 'tests/a.test.ts' })]],
        ['source', [makeFile({ filePath: 'src/a.ts' })]],
      ]);
      const result = categorizer.formatCategorized(map);
      const sourceIdx = result.indexOf('SOURCE');
      const testIdx = result.indexOf('TEST');
      expect(sourceIdx).toBeLessThan(testIdx);
    });

    it('sums lines across files in a category', () => {
      const map = new Map<ChangeCategory, FileChange[]>([
        ['source', [
          makeFile({ filePath: 'src/a.ts', linesAdded: 10, linesRemoved: 2 }),
          makeFile({ filePath: 'src/b.ts', linesAdded: 20, linesRemoved: 3 }),
        ]],
      ]);
      const result = categorizer.formatCategorized(map);
      expect(result).toContain('+30');
      expect(result).toContain('-5');
    });

    it('skips empty categories', () => {
      const map = new Map<ChangeCategory, FileChange[]>([
        ['source', [makeFile()]],
        ['test', []],
      ]);
      const result = categorizer.formatCategorized(map);
      expect(result).toContain('SOURCE');
      expect(result).not.toContain('TEST');
    });
  });
});
