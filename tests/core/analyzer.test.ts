import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { analyzeProject } from '../../src/core/analyzer.js';

function mockPkg(deps: Record<string, string> = {}, devDeps: Record<string, string> = {}): string {
  return JSON.stringify({ dependencies: deps, devDependencies: devDeps });
}

function setupGitMocks(fileCount: number, authors: string[]): void {
  vi.mocked(spawnSync).mockImplementation((cmd, args) => {
    if (cmd === 'git' && args?.[0] === 'ls-files') {
      const files = Array.from({ length: fileCount }, (_, i) => `file-${i}.ts`).join('\n');
      return { status: 0, stdout: files, stderr: '', pid: 1, output: [], signal: null };
    }
    if (cmd === 'git' && args?.[0] === 'log') {
      return { status: 0, stdout: authors.join('\n') + '\n', stderr: '', pid: 1, output: [], signal: null };
    }
    return { status: 1, stdout: '', stderr: '', pid: 1, output: [], signal: null };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no files exist, git returns nothing
  vi.mocked(existsSync).mockReturnValue(false);
  vi.mocked(readFileSync).mockReturnValue('{}');
  setupGitMocks(0, []);
});

describe('analyzeProject', () => {
  // ─── Framework Detection ──────────────────────────────────────────

  describe('framework detection', () => {
    it('detects next (takes priority over react)', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockPkg({ next: '14.0.0', react: '18.0.0' }));

      const result = analyzeProject('/test');
      expect(result.framework).toBe('next');
    });

    it('detects react', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockPkg({ react: '18.0.0' }));

      const result = analyzeProject('/test');
      expect(result.framework).toBe('react');
    });

    it('detects express', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockPkg({ express: '4.18.0' }));

      const result = analyzeProject('/test');
      expect(result.framework).toBe('express');
    });

    it('detects nest', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockPkg({ '@nestjs/core': '10.0.0' }));

      const result = analyzeProject('/test');
      expect(result.framework).toBe('nest');
    });

    it('detects vue', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockPkg({ vue: '3.0.0' }));

      const result = analyzeProject('/test');
      expect(result.framework).toBe('vue');
    });

    it('detects angular', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockPkg({ '@angular/core': '17.0.0' }));

      const result = analyzeProject('/test');
      expect(result.framework).toBe('angular');
    });

    it('detects svelte', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockPkg({ svelte: '4.0.0' }));

      const result = analyzeProject('/test');
      expect(result.framework).toBe('svelte');
    });

    it('returns unknown when no framework found', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockPkg({ lodash: '4.0.0' }));

      const result = analyzeProject('/test');
      expect(result.framework).toBe('unknown');
    });
  });

  // ─── Language Detection ───────────────────────────────────────────

  describe('language detection', () => {
    it('detects typescript', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('tsconfig.json') || String(p).endsWith('package.json'));
      vi.mocked(readFileSync).mockReturnValue(mockPkg());

      const result = analyzeProject('/test');
      expect(result.language).toBe('typescript');
    });

    it('detects rust', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('Cargo.toml'));

      const result = analyzeProject('/test');
      expect(result.language).toBe('rust');
    });

    it('detects python via pyproject.toml', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('pyproject.toml'));
      vi.mocked(readFileSync).mockReturnValue('[tool.pytest]');

      const result = analyzeProject('/test');
      expect(result.language).toBe('python');
    });

    it('detects javascript (package.json without tsconfig)', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('package.json'));
      vi.mocked(readFileSync).mockReturnValue(mockPkg());

      const result = analyzeProject('/test');
      expect(result.language).toBe('javascript');
    });

    it('detects mixed (multiple language markers)', () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        const s = String(p);
        return s.endsWith('tsconfig.json') || s.endsWith('Cargo.toml') || s.endsWith('package.json');
      });
      vi.mocked(readFileSync).mockReturnValue(mockPkg());

      const result = analyzeProject('/test');
      expect(result.language).toBe('mixed');
    });

    it('returns unknown when no language markers', () => {
      const result = analyzeProject('/test');
      expect(result.language).toBe('unknown');
    });
  });

  // ─── Test Framework Detection ─────────────────────────────────────

  describe('test framework detection', () => {
    it('detects vitest', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('package.json'));
      vi.mocked(readFileSync).mockReturnValue(mockPkg({}, { vitest: '1.0.0' }));

      const result = analyzeProject('/test');
      expect(result.testFramework).toBe('vitest');
    });

    it('detects jest', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('package.json'));
      vi.mocked(readFileSync).mockReturnValue(mockPkg({}, { jest: '29.0.0' }));

      const result = analyzeProject('/test');
      expect(result.testFramework).toBe('jest');
    });

    it('detects mocha', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('package.json'));
      vi.mocked(readFileSync).mockReturnValue(mockPkg({}, { mocha: '10.0.0' }));

      const result = analyzeProject('/test');
      expect(result.testFramework).toBe('mocha');
    });

    it('detects pytest from pyproject.toml', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('pyproject.toml'));
      vi.mocked(readFileSync).mockReturnValue('[tool.pytest.ini_options]\nminversion = "7.0"');

      const result = analyzeProject('/test');
      expect(result.testFramework).toBe('pytest');
    });
  });

  // ─── Build Tool Detection ────────────────────────────────────────

  describe('build tool detection', () => {
    it('detects vite', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('package.json'));
      vi.mocked(readFileSync).mockReturnValue(mockPkg({}, { vite: '5.0.0' }));

      const result = analyzeProject('/test');
      expect(result.buildTool).toBe('vite');
    });

    it('detects webpack', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('package.json'));
      vi.mocked(readFileSync).mockReturnValue(mockPkg({}, { webpack: '5.0.0' }));

      const result = analyzeProject('/test');
      expect(result.buildTool).toBe('webpack');
    });

    it('falls back to tsc when tsconfig exists', () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        const s = String(p);
        return s.endsWith('package.json') || s.endsWith('tsconfig.json');
      });
      vi.mocked(readFileSync).mockReturnValue(mockPkg());

      const result = analyzeProject('/test');
      expect(result.buildTool).toBe('tsc');
    });
  });

  // ─── CI Detection ────────────────────────────────────────────────

  describe('CI detection', () => {
    it('detects github-actions', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('.github/workflows'));

      const result = analyzeProject('/test');
      expect(result.ci).toBe('github-actions');
    });

    it('detects gitlab-ci', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('.gitlab-ci.yml'));

      const result = analyzeProject('/test');
      expect(result.ci).toBe('gitlab-ci');
    });

    it('detects circleci', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('.circleci'));

      const result = analyzeProject('/test');
      expect(result.ci).toBe('circleci');
    });
  });

  // ─── Size & Methodology ──────────────────────────────────────────

  describe('size classification and methodology', () => {
    it('small project with 1 author → micro-sprint', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      setupGitMocks(30, ['Alice']);

      const result = analyzeProject('/test');
      expect(result.size).toBe('small');
      expect(result.methodology).toBe('micro-sprint');
    });

    it('medium project → sprint', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      setupGitMocks(200, ['Alice', 'Bob']);

      const result = analyzeProject('/test');
      expect(result.size).toBe('medium');
      expect(result.methodology).toBe('sprint');
    });

    it('large project under 2000 files → agile', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      setupGitMocks(800, ['Alice', 'Bob', 'Charlie']);

      const result = analyzeProject('/test');
      expect(result.size).toBe('large');
      expect(result.methodology).toBe('agile');
    });

    it('large project with 2000+ files → hybrid', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      setupGitMocks(2500, ['Alice', 'Bob', 'Charlie', 'Dave']);

      const result = analyzeProject('/test');
      expect(result.size).toBe('large');
      expect(result.methodology).toBe('hybrid');
    });
  });

  // ─── Resilience ──────────────────────────────────────────────────

  describe('resilience', () => {
    it('handles missing package.json gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      setupGitMocks(10, ['Alice']);

      const result = analyzeProject('/test');
      expect(result.framework).toBe('unknown');
      expect(result.buildTool).toBe('unknown');
      expect(result.testFramework).toBe('unknown');
    });

    it('handles malformed package.json', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('package.json'));
      vi.mocked(readFileSync).mockReturnValue('not valid json{{{');
      setupGitMocks(10, ['Alice']);

      const result = analyzeProject('/test');
      expect(result.framework).toBe('unknown');
    });

    it('handles git command failure', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(spawnSync).mockReturnValue({
        status: 128,
        stdout: '',
        stderr: 'fatal: not a git repository',
        pid: 1,
        output: [],
        signal: null,
      });

      const result = analyzeProject('/test');
      expect(result.fileCount).toBe(0);
      expect(result.authorCount).toBe(0);
    });
  });
});
