import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Build isolation', () => {
  const root = resolve(import.meta.dirname, '..', '..');

  describe('tsconfig.json', () => {
    const tsconfig = JSON.parse(
      readFileSync(resolve(root, 'tsconfig.json'), 'utf-8'),
    );

    it('excludes src/dashboard from compilation', () => {
      expect(tsconfig.exclude).toContain('src/dashboard');
    });

    it('still excludes node_modules, dist, and tests', () => {
      expect(tsconfig.exclude).toContain('node_modules');
      expect(tsconfig.exclude).toContain('dist');
      expect(tsconfig.exclude).toContain('tests');
    });
  });

  describe('vitest.config.ts', () => {
    const vitestConfig = readFileSync(
      resolve(root, 'vitest.config.ts'),
      'utf-8',
    );

    it('excludes src/dashboard/** from coverage', () => {
      expect(vitestConfig).toContain("'src/dashboard/**'");
    });
  });

  describe('.gitignore', () => {
    const gitignore = readFileSync(resolve(root, '.gitignore'), 'utf-8');

    it('ignores src/dashboard/node_modules', () => {
      expect(gitignore).toContain('src/dashboard/node_modules');
    });

    it('ignores src/dashboard/dist', () => {
      expect(gitignore).toContain('src/dashboard/dist');
    });
  });
});
