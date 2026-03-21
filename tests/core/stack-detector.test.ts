import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { detectProjectStack, isStackStale, refreshStack } from '../../src/core/stack-detector.js';

const ROOT = '/test/project';

function mockFileExistence(existingFiles: string[]) {
  vi.mocked(fs.existsSync).mockImplementation((p) => {
    const s = String(p);
    return existingFiles.some((f) => s.endsWith(f));
  });
}

function mockPackageJson(deps: Record<string, string>, devDeps?: Record<string, string>) {
  vi.mocked(fs.readFileSync).mockImplementation((p) => {
    const s = String(p);
    if (s.endsWith('package.json')) {
      return JSON.stringify({
        dependencies: deps,
        devDependencies: devDeps ?? {},
      });
    }
    if (s.endsWith('project-stack.json')) {
      throw new Error('ENOENT');
    }
    return '';
  });
}

describe('detectProjectStack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Language Detection ───────────────────────────────────────────────────

  it('detects TypeScript when tsconfig.json exists', () => {
    mockFileExistence(['tsconfig.json', 'package.json']);
    mockPackageJson({ typescript: '^5.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('typescript');
  });

  it('detects TypeScript when typescript dep exists', () => {
    mockFileExistence(['package.json']);
    mockPackageJson({}, { typescript: '^5.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('typescript');
  });

  it('detects JavaScript when only package.json exists with deps', () => {
    mockFileExistence(['package.json']);
    mockPackageJson({ express: '^4.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('javascript');
  });

  it('detects Rust when Cargo.toml exists', () => {
    mockFileExistence(['Cargo.toml']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('rust');
  });

  it('detects Go when go.mod exists', () => {
    mockFileExistence(['go.mod']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('go');
  });

  it('detects Python when setup.py exists', () => {
    mockFileExistence(['setup.py']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('python');
  });

  it('detects Python when pyproject.toml exists', () => {
    mockFileExistence(['pyproject.toml']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('python');
  });

  it('returns unknown when no project files found', () => {
    mockFileExistence([]);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('unknown');
  });

  // ─── Framework Detection ──────────────────────────────────────────────────

  it('detects React framework', () => {
    mockFileExistence(['package.json', 'tsconfig.json']);
    mockPackageJson({ react: '^18.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('react');
  });

  it('detects Next.js framework', () => {
    mockFileExistence(['package.json', 'tsconfig.json']);
    mockPackageJson({ next: '^14.0.0', react: '^18.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('next');
  });

  it('detects Vue framework', () => {
    mockFileExistence(['package.json']);
    mockPackageJson({ vue: '^3.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('vue');
  });

  it('detects Express framework', () => {
    mockFileExistence(['package.json']);
    mockPackageJson({ express: '^4.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('express');
  });

  it('detects Angular framework', () => {
    mockFileExistence(['package.json', 'tsconfig.json']);
    mockPackageJson({ '@angular/core': '^17.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('angular');
  });

  it('detects Svelte framework', () => {
    mockFileExistence(['package.json']);
    mockPackageJson({ svelte: '^4.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('svelte');
  });

  it('detects NestJS framework', () => {
    mockFileExistence(['package.json', 'tsconfig.json']);
    mockPackageJson({ '@nestjs/core': '^10.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('nest');
  });

  it('detects Fastify framework', () => {
    mockFileExistence(['package.json']);
    mockPackageJson({ fastify: '^4.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('fastify');
  });

  it('returns unknown framework when none detected', () => {
    mockFileExistence(['package.json']);
    mockPackageJson({ lodash: '^4.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('unknown');
  });

  // ─── Test Framework Detection ─────────────────────────────────────────────

  it('detects Vitest by dependency', () => {
    mockFileExistence(['package.json', 'tsconfig.json']);
    mockPackageJson({}, { vitest: '^1.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.testFramework).toBe('vitest');
  });

  it('detects Vitest by config file', () => {
    mockFileExistence(['package.json', 'tsconfig.json', 'vitest.config.ts']);
    mockPackageJson({});

    const stack = detectProjectStack(ROOT);
    expect(stack.testFramework).toBe('vitest');
  });

  it('detects Jest by dependency', () => {
    mockFileExistence(['package.json']);
    mockPackageJson({}, { jest: '^29.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.testFramework).toBe('jest');
  });

  it('detects Jest by config file', () => {
    mockFileExistence(['package.json', 'jest.config.js']);
    mockPackageJson({ express: '^4.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.testFramework).toBe('jest');
  });

  it('detects Mocha', () => {
    mockFileExistence(['package.json']);
    mockPackageJson({}, { mocha: '^10.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.testFramework).toBe('mocha');
  });

  it('detects pytest by pytest.ini', () => {
    mockFileExistence(['setup.py', 'pytest.ini']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const stack = detectProjectStack(ROOT);
    expect(stack.testFramework).toBe('pytest');
  });

  // ─── Build Tool Detection ────────────────────────────────────────────────

  it('detects Vite build tool', () => {
    mockFileExistence(['package.json', 'tsconfig.json']);
    mockPackageJson({}, { vite: '^5.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.buildTool).toBe('vite');
  });

  it('detects Webpack build tool', () => {
    mockFileExistence(['package.json']);
    mockPackageJson({}, { webpack: '^5.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.buildTool).toBe('webpack');
  });

  it('detects tsc for TypeScript without bundler', () => {
    mockFileExistence(['package.json', 'tsconfig.json']);
    mockPackageJson({}, { typescript: '^5.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.buildTool).toBe('tsc');
  });

  it('detects cargo for Rust', () => {
    mockFileExistence(['Cargo.toml']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const stack = detectProjectStack(ROOT);
    expect(stack.buildTool).toBe('cargo');
  });

  it('detects go build tool for Go', () => {
    mockFileExistence(['go.mod']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const stack = detectProjectStack(ROOT);
    expect(stack.buildTool).toBe('go');
  });

  // ─── Dependencies Collection ──────────────────────────────────────────────

  it('collects dependencies from package.json', () => {
    mockFileExistence(['package.json', 'tsconfig.json']);
    mockPackageJson({ react: '^18.0.0', 'react-dom': '^18.0.0' }, { vitest: '^1.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.dependencies).toContain('react');
    expect(stack.dependencies).toContain('react-dom');
    expect(stack.dependencies).toContain('vitest');
  });

  it('caps dependencies at 50', () => {
    const deps: Record<string, string> = {};
    for (let i = 0; i < 60; i++) {
      deps[`dep-${i}`] = '1.0.0';
    }
    mockFileExistence(['package.json']);
    mockPackageJson(deps);

    const stack = detectProjectStack(ROOT);
    expect(stack.dependencies.length).toBeLessThanOrEqual(50);
  });

  // ─── Cache Behavior ──────────────────────────────────────────────────────

  it('returns cached stack when not stale', () => {
    const cached = {
      language: 'typescript',
      framework: 'react',
      dependencies: ['react'],
      buildTool: 'vite',
      testFramework: 'vitest',
      detectedAt: '2026-03-22T00:00:00Z',
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 2000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('project-stack.json')) return JSON.stringify(cached);
      return '';
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('typescript');
    expect(stack.framework).toBe('react');
  });

  // ─── detectedAt field ─────────────────────────────────────────────────────

  it('includes detectedAt timestamp', () => {
    mockFileExistence(['package.json', 'tsconfig.json']);
    mockPackageJson({}, { typescript: '^5.0.0' });

    const stack = detectProjectStack(ROOT);
    expect(stack.detectedAt).toBeDefined();
    expect(typeof stack.detectedAt).toBe('string');
  });
});

// ─── isStackStale ─────────────────────────────────────────────────────────

describe('isStackStale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when cache does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(isStackStale(ROOT)).toBe(true);
  });

  it('returns true when cache stat fails', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockImplementation(() => { throw new Error('EPERM'); });
    expect(isStackStale(ROOT)).toBe(true);
  });

  it('returns false when no files are newer than cache', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('project-stack.json')) return { mtimeMs: 2000 } as fs.Stats;
      return { mtimeMs: 1000 } as fs.Stats;
    });
    expect(isStackStale(ROOT)).toBe(false);
  });

  it('returns true when package.json is newer than cache', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('project-stack.json')) return { mtimeMs: 1000 } as fs.Stats;
      if (s.endsWith('package.json')) return { mtimeMs: 2000 } as fs.Stats;
      return { mtimeMs: 500 } as fs.Stats;
    });
    expect(isStackStale(ROOT)).toBe(true);
  });

  it('returns true when tsconfig.json is newer than cache', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('project-stack.json')) return { mtimeMs: 1000 } as fs.Stats;
      if (s.endsWith('tsconfig.json')) return { mtimeMs: 2000 } as fs.Stats;
      return { mtimeMs: 500 } as fs.Stats;
    });
    expect(isStackStale(ROOT)).toBe(true);
  });

  it('ignores files that fail to stat', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    let callCount = 0;
    vi.mocked(fs.statSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('project-stack.json')) return { mtimeMs: 2000 } as fs.Stats;
      callCount++;
      if (callCount === 1) throw new Error('ENOENT');
      return { mtimeMs: 1000 } as fs.Stats;
    });
    expect(isStackStale(ROOT)).toBe(false);
  });
});

// ─── refreshStack ──────────────────────────────────────────────────────────

describe('refreshStack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forces re-detection even when cache exists', () => {
    mockFileExistence(['package.json', 'tsconfig.json', 'project-stack.json']);
    mockPackageJson({}, { typescript: '^5.0.0', vitest: '^1.0.0' });

    const stack = refreshStack(ROOT);
    expect(stack.language).toBe('typescript');
    expect(stack.testFramework).toBe('vitest');
  });

  it('tries to remove cache file before re-detection', () => {
    mockFileExistence(['package.json', 'tsconfig.json', 'project-stack.json']);
    mockPackageJson({}, { typescript: '^5.0.0' });

    refreshStack(ROOT);
    expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalled();
  });

  it('handles cache removal failure gracefully', () => {
    mockFileExistence(['package.json', 'tsconfig.json', 'project-stack.json']);
    mockPackageJson({}, { typescript: '^5.0.0' });
    vi.mocked(fs.unlinkSync).mockImplementation(() => { throw new Error('EPERM'); });

    const stack = refreshStack(ROOT);
    expect(stack.language).toBe('typescript');
  });

  it('returns fresh detection result', () => {
    mockFileExistence(['Cargo.toml']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const stack = refreshStack(ROOT);
    expect(stack.language).toBe('rust');
    expect(stack.buildTool).toBe('cargo');
  });
});

// ─── Cache Integration ─────────────────────────────────────────────────────

describe('stack cache integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes cache file after detection', () => {
    mockFileExistence(['package.json', 'tsconfig.json']);
    mockPackageJson({}, { typescript: '^5.0.0' });

    detectProjectStack(ROOT);
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalled();
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls.find(
      (c) => String(c[0]).includes('project-stack.json'),
    );
    expect(writeCall).toBeDefined();
  });

  it('cache file contains valid JSON with all stack fields', () => {
    mockFileExistence(['package.json', 'tsconfig.json']);
    mockPackageJson({ react: '^18.0.0' }, { typescript: '^5.0.0', vitest: '^1.0.0' });

    detectProjectStack(ROOT);
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls.find(
      (c) => String(c[0]).includes('project-stack.json'),
    );
    expect(writeCall).toBeDefined();
    const written = JSON.parse(writeCall![1] as string);
    expect(written).toHaveProperty('language');
    expect(written).toHaveProperty('framework');
    expect(written).toHaveProperty('dependencies');
    expect(written).toHaveProperty('buildTool');
    expect(written).toHaveProperty('testFramework');
    expect(written).toHaveProperty('detectedAt');
  });

  it('uses cached data when stat shows cache is newer than all files', () => {
    const cachedStack = {
      language: 'python',
      framework: 'django',
      dependencies: ['django'],
      buildTool: 'setuptools',
      testFramework: 'pytest',
      detectedAt: '2026-03-22T00:00:00Z',
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 5000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes('project-stack.json')) return JSON.stringify(cachedStack);
      return '';
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('python');
    expect(stack.framework).toBe('django');
  });

  it('re-detects when Cargo.toml is newer than cache', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('project-stack.json')) return { mtimeMs: 1000 } as fs.Stats;
      if (s.endsWith('Cargo.toml')) return { mtimeMs: 2000 } as fs.Stats;
      return { mtimeMs: 500 } as fs.Stats;
    });

    expect(isStackStale(ROOT)).toBe(true);
  });

  it('re-detects when go.mod is newer than cache', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('project-stack.json')) return { mtimeMs: 1000 } as fs.Stats;
      if (s.endsWith('go.mod')) return { mtimeMs: 2000 } as fs.Stats;
      return { mtimeMs: 500 } as fs.Stats;
    });

    expect(isStackStale(ROOT)).toBe(true);
  });

  it('re-detects when pyproject.toml is newer than cache', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('project-stack.json')) return { mtimeMs: 1000 } as fs.Stats;
      if (s.endsWith('pyproject.toml')) return { mtimeMs: 2000 } as fs.Stats;
      return { mtimeMs: 500 } as fs.Stats;
    });

    expect(isStackStale(ROOT)).toBe(true);
  });

  it('cache handles corrupt JSON gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 5000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes('project-stack.json')) return '{corrupt json';
      if (String(p).includes('package.json')) return JSON.stringify({ dependencies: { express: '4.0' } });
      return '';
    });

    // Should fall through to fresh detection
    const stack = detectProjectStack(ROOT);
    expect(stack).toBeDefined();
    expect(stack.language).toBeDefined();
  });

  it('cache handles missing language field gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 5000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes('project-stack.json')) return JSON.stringify({ framework: 'react' });
      if (String(p).includes('package.json')) return JSON.stringify({ dependencies: { react: '18' } });
      return '';
    });

    // Missing 'language' field means cache is invalid, should re-detect
    const stack = detectProjectStack(ROOT);
    expect(stack).toBeDefined();
  });

  it('refreshStack creates new cache timestamp', () => {
    const oldCached = {
      language: 'typescript',
      framework: 'react',
      dependencies: [],
      buildTool: 'tsc',
      testFramework: 'vitest',
      detectedAt: '2020-01-01T00:00:00Z',
    };

    mockFileExistence(['package.json', 'tsconfig.json', 'project-stack.json']);
    mockPackageJson({}, { typescript: '^5.0.0' });

    const stack = refreshStack(ROOT);
    // detectedAt should be a recent timestamp, not the old cached one
    expect(stack.detectedAt).not.toBe(oldCached.detectedAt);
  });

  it('cache write failure does not break detection', () => {
    mockFileExistence(['package.json', 'tsconfig.json']);
    mockPackageJson({}, { typescript: '^5.0.0' });
    vi.mocked(fs.writeFileSync).mockImplementation(() => { throw new Error('EACCES'); });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('typescript');
  });
});
