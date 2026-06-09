import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { detectProjectStack, isStackStale, refreshStack, detectFullStack, STACK_COMMANDS } from '../../src/core/stack-detector.js';

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

  it('caps dependencies at 200', () => {
    const deps: Record<string, string> = {};
    for (let i = 0; i < 250; i++) {
      deps[`dep-${i}`] = '1.0.0';
    }
    mockFileExistence(['package.json']);
    mockPackageJson(deps);

    const stack = detectProjectStack(ROOT);
    expect(stack.dependencies.length).toBeLessThanOrEqual(200);
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

  it('does not log statSync failures for absent monitored build files', () => {
    // B4: isStackStale must not spam stderr/ERRORS.md when optional build
    // files (Cargo.toml, go.mod, ...) are simply absent — expected, not an error.
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const prevDebug = process.env['DECKENT_DEBUG'];
    process.env['DECKENT_DEBUG'] = '1';
    try {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockImplementation((p) => {
        if (String(p).endsWith('project-stack.json')) {
          return { mtimeMs: 9999 } as fs.Stats;
        }
        throw new Error('ENOENT: no such file or directory');
      });

      isStackStale(ROOT);

      const logged = stderrSpy.mock.calls
        .map((c) => String(c[0]))
        .filter((line) => line.includes('isStackStale:statSyncFile'));
      expect(logged).toEqual([]);
    } finally {
      if (prevDebug === undefined) delete process.env['DECKENT_DEBUG'];
      else process.env['DECKENT_DEBUG'] = prevDebug;
      stderrSpy.mockRestore();
    }
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

// ─── Extended Language Detection ──────────────────────────────────────────

describe('detectProjectStack — extended languages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false, mtimeMs: 1000 } as unknown as fs.Stats);
  });

  // ─── Python Extended ────────────────────────────────────────────────────

  it('detects Python when requirements.txt exists', () => {
    mockFileExistence(['requirements.txt']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('python');
  });

  it('detects Python when Pipfile exists', () => {
    mockFileExistence(['Pipfile']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('python');
  });

  it('detects Django framework via manage.py', () => {
    mockFileExistence(['pyproject.toml', 'manage.py']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('python');
    expect(stack.framework).toBe('django');
  });

  it('detects Flask framework from requirements.txt', () => {
    mockFileExistence(['requirements.txt']);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('requirements.txt')) return 'flask==2.3.0\nrequests==2.28.0';
      throw new Error('ENOENT');
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('flask');
  });

  it('detects FastAPI framework from pyproject.toml', () => {
    mockFileExistence(['pyproject.toml']);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('pyproject.toml')) return '[project]\ndependencies = ["fastapi>=0.100"]';
      throw new Error('ENOENT');
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('fastapi');
  });

  it('detects pytest via conftest.py for Python', () => {
    mockFileExistence(['requirements.txt', 'conftest.py']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const stack = detectProjectStack(ROOT);
    expect(stack.testFramework).toBe('pytest');
  });

  it('falls back to unittest when no pytest indicators for Python', () => {
    mockFileExistence(['requirements.txt']);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('requirements.txt')) return 'requests==2.28.0';
      throw new Error('ENOENT');
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.testFramework).toBe('unittest');
  });

  // ─── Java ───────────────────────────────────────────────────────────────

  it('detects Java with Maven (pom.xml)', () => {
    mockFileExistence(['pom.xml']);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('pom.xml')) return '<project><dependencies></dependencies></project>';
      throw new Error('ENOENT');
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('java');
    expect(stack.buildTool).toBe('maven');
  });

  it('detects Java with Gradle (build.gradle)', () => {
    mockFileExistence(['build.gradle']);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('build.gradle')) return 'apply plugin: "java"';
      throw new Error('ENOENT');
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('java');
    expect(stack.buildTool).toBe('gradle');
  });

  it('detects Spring framework from pom.xml', () => {
    mockFileExistence(['pom.xml']);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('pom.xml')) return '<dependency>spring-boot-starter-web</dependency>';
      throw new Error('ENOENT');
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('spring');
  });

  it('detects JUnit test framework from pom.xml', () => {
    mockFileExistence(['pom.xml']);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('pom.xml')) return '<dependency>junit-jupiter</dependency>';
      throw new Error('ENOENT');
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.testFramework).toBe('junit');
  });

  // ─── C/C++ ──────────────────────────────────────────────────────────────

  it('detects C project with CMakeLists.txt (no CXX hints)', () => {
    mockFileExistence(['CMakeLists.txt']);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('CMakeLists.txt')) return 'project(myapp)\nadd_executable(myapp main.c)';
      throw new Error('ENOENT');
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('c');
    expect(stack.buildTool).toBe('cmake');
    expect(stack.testFramework).toBe('ctest');
  });

  it('detects C++ project with CMakeLists.txt with CXX', () => {
    mockFileExistence(['CMakeLists.txt']);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('CMakeLists.txt')) return 'project(myapp CXX)\nadd_executable(myapp main.cpp)';
      throw new Error('ENOENT');
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('cpp');
    expect(stack.buildTool).toBe('cmake');
  });

  it('detects C project with Makefile and .c files', () => {
    mockFileExistence(['Makefile']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    vi.mocked(fs.readdirSync).mockReturnValue(['main.c', 'util.h'] as unknown as fs.Dirent[]);

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('c');
    expect(stack.buildTool).toBe('make');
  });

  it('detects C++ project with meson.build', () => {
    mockFileExistence(['meson.build']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    vi.mocked(fs.readdirSync).mockReturnValue(['main.cpp'] as unknown as fs.Dirent[]);

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('cpp');
    expect(stack.buildTool).toBe('meson');
  });

  // ─── Go ─────────────────────────────────────────────────────────────────

  it('detects Go test framework when _test.go files exist', () => {
    mockFileExistence(['go.mod']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    vi.mocked(fs.readdirSync).mockReturnValue(['main.go', 'main_test.go'] as unknown as fs.Dirent[]);

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('go');
    expect(stack.buildTool).toBe('go');
    expect(stack.testFramework).toBe('go_test');
  });

  // ─── Rust ───────────────────────────────────────────────────────────────

  it('detects Rust with cargo_test framework', () => {
    mockFileExistence(['Cargo.toml']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('rust');
    expect(stack.buildTool).toBe('cargo');
    expect(stack.testFramework).toBe('cargo_test');
  });
});

// ─── STACK_COMMANDS ───────────────────────────────────────────────────────

describe('STACK_COMMANDS', () => {
  it('has entries for all expected stacks', () => {
    expect(STACK_COMMANDS).toHaveProperty('typescript');
    expect(STACK_COMMANDS).toHaveProperty('python');
    expect(STACK_COMMANDS).toHaveProperty('java_maven');
    expect(STACK_COMMANDS).toHaveProperty('java_gradle');
    expect(STACK_COMMANDS).toHaveProperty('c_cmake');
    expect(STACK_COMMANDS).toHaveProperty('c_make');
    expect(STACK_COMMANDS).toHaveProperty('go');
    expect(STACK_COMMANDS).toHaveProperty('rust');
  });

  it('each entry has build, test, lint fields', () => {
    for (const key of Object.keys(STACK_COMMANDS)) {
      expect(STACK_COMMANDS[key]).toHaveProperty('build');
      expect(STACK_COMMANDS[key]).toHaveProperty('test');
      expect(STACK_COMMANDS[key]).toHaveProperty('lint');
    }
  });

  it('rust commands are correct', () => {
    expect(STACK_COMMANDS['rust'].build).toBe('cargo build');
    expect(STACK_COMMANDS['rust'].test).toBe('cargo test');
    expect(STACK_COMMANDS['rust'].lint).toBe('cargo clippy');
  });

  it('go commands are correct', () => {
    expect(STACK_COMMANDS['go'].build).toBe('go build ./...');
    expect(STACK_COMMANDS['go'].test).toBe('go test ./...');
    expect(STACK_COMMANDS['go'].lint).toBe('golangci-lint run');
  });
});

// ─── detectFullStack ──────────────────────────────────────────────────────

describe('detectFullStack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.readdirSync).mockReturnValue([]);
  });

  it('returns commands for TypeScript project', () => {
    mockFileExistence(['package.json', 'tsconfig.json']);
    mockPackageJson({}, { typescript: '^5.0.0' });

    const result = detectFullStack(ROOT);
    expect(result.language).toBe('typescript');
    expect(result.commands.build).toBe('npx tsc');
    expect(result.commands.test).toBe('npx vitest run');
    expect(result.commands.lint).toBe('npx eslint');
  });

  it('returns commands for Rust project', () => {
    mockFileExistence(['Cargo.toml']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const result = detectFullStack(ROOT);
    expect(result.language).toBe('rust');
    expect(result.commands.build).toBe('cargo build');
    expect(result.commands.test).toBe('cargo test');
    expect(result.commands.lint).toBe('cargo clippy');
  });

  it('returns commands for Go project', () => {
    mockFileExistence(['go.mod']);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const result = detectFullStack(ROOT);
    expect(result.language).toBe('go');
    expect(result.commands.build).toBe('go build ./...');
    expect(result.commands.test).toBe('go test ./...');
  });

  it('returns commands for Java Maven project', () => {
    mockFileExistence(['pom.xml']);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).endsWith('pom.xml')) return '<project></project>';
      throw new Error('ENOENT');
    });

    const result = detectFullStack(ROOT);
    expect(result.language).toBe('java');
    expect(result.buildTool).toBe('maven');
    expect(result.commands.build).toBe('mvn compile');
    expect(result.commands.test).toBe('mvn test');
  });

  it('returns commands for Java Gradle project', () => {
    mockFileExistence(['build.gradle']);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).endsWith('build.gradle')) return 'apply plugin: "java"';
      throw new Error('ENOENT');
    });

    const result = detectFullStack(ROOT);
    expect(result.language).toBe('java');
    expect(result.buildTool).toBe('gradle');
    expect(result.commands.build).toBe('gradle build');
    expect(result.commands.test).toBe('gradle test');
  });

  it('returns commands for C CMake project', () => {
    mockFileExistence(['CMakeLists.txt']);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).endsWith('CMakeLists.txt')) return 'project(myapp)\nadd_executable(myapp main.c)';
      throw new Error('ENOENT');
    });

    const result = detectFullStack(ROOT);
    expect(result.language).toBe('c');
    expect(result.commands.build).toBe('cmake --build build');
    expect(result.commands.test).toBe('ctest --test-dir build');
  });

  it('returns commands for Python project', () => {
    mockFileExistence(['requirements.txt']);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).endsWith('requirements.txt')) return 'flask==2.3.0';
      throw new Error('ENOENT');
    });

    const result = detectFullStack(ROOT);
    expect(result.language).toBe('python');
    expect(result.commands.build).toBe('');
    expect(result.commands.test).toBe('pytest');
    expect(result.commands.lint).toBe('ruff check');
  });

  it('returns empty commands for unknown language', () => {
    mockFileExistence([]);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    const result = detectFullStack(ROOT);
    expect(result.language).toBe('unknown');
    expect(result.commands.build).toBe('');
    expect(result.commands.test).toBe('');
    expect(result.commands.lint).toBe('');
  });

  it('includes framework and testFramework in result', () => {
    mockFileExistence(['pom.xml']);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).endsWith('pom.xml')) return '<dependency>spring-boot-starter-web</dependency><dependency>junit</dependency>';
      throw new Error('ENOENT');
    });

    const result = detectFullStack(ROOT);
    expect(result.framework).toBe('spring');
    expect(result.testFramework).toBe('junit');
  });
});

// ─── Monorepo / Sub-project Language Detection ────────────────────────────

describe('monorepo / sub-project language detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false, mtimeMs: 1000 } as unknown as fs.Stats);
  });

  it('detects React from sub-project package.json at arbitrary sub-directory', () => {
    // Root has no React dep; a sub-dir 'apps/frontend' has React
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s.endsWith('tsconfig.json') || s.endsWith('package.json');
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('project-stack.json')) throw new Error('ENOENT');
      if (s.includes('/frontend/package.json')) {
        return JSON.stringify({ dependencies: { react: '^18.0.0' } });
      }
      // Root or intermediate package.json — no React
      return JSON.stringify({ devDependencies: { typescript: '^5.0.0' } });
    });
    vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
      const s = String(p);
      if ((opts as { withFileTypes?: boolean })?.withFileTypes) {
        if (s === ROOT) return [{ name: 'frontend', isDirectory: () => true }] as any;
        return [] as any;
      }
      return [] as any;
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.framework).toBe('react');
    expect(stack.language).toBe('typescript');
  });

  it('adds rust to detectedLanguages when a sub-project has Cargo.toml', () => {
    // Root: TypeScript; packages/backend: Rust
    mockFileExistence(['package.json', 'tsconfig.json', 'packages/backend/Cargo.toml']);
    mockPackageJson({}, { typescript: '^5.0.0' });
    vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
      const s = String(p);
      if ((opts as { withFileTypes?: boolean })?.withFileTypes) {
        if (s === ROOT) return [{ name: 'packages', isDirectory: () => true }] as any;
        if (s.endsWith('/packages')) return [{ name: 'backend', isDirectory: () => true }] as any;
        return [] as any;
      }
      return [] as any;
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.detectedLanguages).toContain('rust');
    expect(stack.detectedLanguages).toContain('typescript');
  });

  it('adds python to detectedLanguages when a sub-project has pyproject.toml', () => {
    // Root: TypeScript; services/api: Python
    mockFileExistence(['package.json', 'tsconfig.json', 'services/api/pyproject.toml']);
    mockPackageJson({}, { typescript: '^5.0.0' });
    vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
      const s = String(p);
      if ((opts as { withFileTypes?: boolean })?.withFileTypes) {
        if (s === ROOT) return [{ name: 'services', isDirectory: () => true }] as any;
        if (s.endsWith('/services')) return [{ name: 'api', isDirectory: () => true }] as any;
        return [] as any;
      }
      return [] as any;
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.detectedLanguages).toContain('python');
    expect(stack.detectedLanguages).toContain('typescript');
  });

  it('detects multiple sub-project languages in a monorepo layout', () => {
    // Root: TypeScript; backend: Rust; analytics: Python
    mockFileExistence([
      'package.json', 'tsconfig.json',
      'backend/Cargo.toml',
      'analytics/pyproject.toml',
    ]);
    mockPackageJson({}, { typescript: '^5.0.0' });
    vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
      const s = String(p);
      if ((opts as { withFileTypes?: boolean })?.withFileTypes) {
        if (s === ROOT) {
          return [
            { name: 'backend', isDirectory: () => true },
            { name: 'analytics', isDirectory: () => true },
          ] as any;
        }
        return [] as any;
      }
      return [] as any;
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.detectedLanguages).toContain('typescript');
    expect(stack.detectedLanguages).toContain('rust');
    expect(stack.detectedLanguages).toContain('python');
  });

  it('detects Java sub-project (pom.xml) in monorepo', () => {
    // Root: TypeScript; java-service: Java
    mockFileExistence(['package.json', 'tsconfig.json', 'java-service/pom.xml']);
    mockPackageJson({}, { typescript: '^5.0.0' });
    vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
      const s = String(p);
      if ((opts as { withFileTypes?: boolean })?.withFileTypes) {
        if (s === ROOT) return [{ name: 'java-service', isDirectory: () => true }] as any;
        return [] as any;
      }
      return [] as any;
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.detectedLanguages).toContain('java');
    expect(stack.detectedLanguages).toContain('typescript');
  });

  it('does not add duplicate languages when sub-project matches root language', () => {
    // Root: TypeScript; sub-project: also TypeScript (via Cargo.toml missing, just package.json)
    mockFileExistence(['package.json', 'tsconfig.json']);
    mockPackageJson({}, { typescript: '^5.0.0' });
    vi.mocked(fs.readdirSync).mockImplementation((p, opts) => {
      const s = String(p);
      if (!(opts as { withFileTypes?: boolean })?.withFileTypes) return [] as any;
      if (s === ROOT) return [{ name: 'packages', isDirectory: () => true }] as any;
      return [];
    });

    const stack = detectProjectStack(ROOT);
    // typescript should appear exactly once in detectedLanguages
    const tsCount = (stack.detectedLanguages ?? []).filter(l => l === 'typescript').length;
    expect(tsCount).toBe(1);
  });
});

// ─── IDENTITY.md Language feed ────────────────────────────────────────────

describe('IDENTITY.md Language feed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false, mtimeMs: 1000 } as unknown as fs.Stats);
  });

  function mockWithIdentity(identityContent: string | null, existingFiles: string[] = [], pkgDeps: Record<string, string> = {}) {
    const allFiles = identityContent !== null
      ? [...existingFiles, '.deckent/workspace/IDENTITY.md']
      : existingFiles;
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return allFiles.some((f) => s.endsWith(f));
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('IDENTITY.md') && identityContent !== null) return identityContent;
      if (s.endsWith('package.json') && Object.keys(pkgDeps).length > 0) {
        return JSON.stringify({ dependencies: pkgDeps });
      }
      throw new Error('ENOENT');
    });
  }

  it('uses Language: from IDENTITY.md when file is present', () => {
    mockWithIdentity('# Identity\nLanguage: TypeScript (ESM)\nTest: vitest\n', ['package.json']);

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('typescript');
  });

  it('normalizes TypeScript (ESM) to typescript', () => {
    mockWithIdentity('Language: TypeScript (ESM)\n');

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('typescript');
  });

  it('normalizes Python 3 to python', () => {
    mockWithIdentity('Language: Python 3\n');

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('python');
  });

  it('normalizes Go to go', () => {
    mockWithIdentity('Language: Go\n');

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('go');
  });

  it('normalizes Rust to rust', () => {
    mockWithIdentity('Language: Rust\n');

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('rust');
  });

  it('IDENTITY.md takes precedence over heuristic (Cargo.toml present but IDENTITY says typescript)', () => {
    mockWithIdentity('Language: TypeScript (ESM)\n', ['Cargo.toml']);

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('typescript');
  });

  it('falls back to heuristic when IDENTITY.md is absent', () => {
    mockWithIdentity(null, ['Cargo.toml']);

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('rust');
  });

  it('falls back to heuristic when IDENTITY.md has no Language: line', () => {
    mockWithIdentity('# Identity\nName: my-project\nVersion: 1.0.0\n', ['Cargo.toml']);

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('rust');
  });

  it('falls back to heuristic when IDENTITY.md has unrecognized language', () => {
    mockWithIdentity('Language: COBOL\n', ['Cargo.toml']);

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('rust');
  });

  it('handles readFileSync error on IDENTITY.md gracefully', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s.endsWith('IDENTITY.md') || s.endsWith('Cargo.toml');
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('IDENTITY.md')) throw new Error('EPERM');
      throw new Error('ENOENT');
    });

    const stack = detectProjectStack(ROOT);
    expect(stack.language).toBe('rust');
  });
});
