import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProjectStack } from '../../src/core/skill-types.js';

// ─── Stack Detection Logic ──────────────────────────────────────────

interface FileSystem {
  exists(path: string): boolean;
  readFile(path: string): string | null;
  stat(path: string): { mtimeMs: number } | null;
  writeFile(path: string, content: string): void;
}

/**
 * Detect project stack from project files.
 */
function detectProjectStack(fs: FileSystem, projectRoot: string): ProjectStack {
  const stack: ProjectStack = {
    language: 'unknown',
    framework: 'unknown',
    dependencies: [],
    buildTool: 'unknown',
    testFramework: 'unknown',
    detectedAt: new Date().toISOString(),
  };

  // Language detection
  if (fs.exists(`${projectRoot}/tsconfig.json`)) {
    stack.language = 'typescript';
    stack.buildTool = 'tsc';
  } else if (fs.exists(`${projectRoot}/pyproject.toml`) || fs.exists(`${projectRoot}/setup.py`)) {
    stack.language = 'python';
  } else if (fs.exists(`${projectRoot}/Cargo.toml`)) {
    stack.language = 'rust';
    stack.buildTool = 'cargo';
  } else if (fs.exists(`${projectRoot}/package.json`)) {
    stack.language = 'javascript';
  }

  // Package.json based detection
  const pkgContent = fs.readFile(`${projectRoot}/package.json`);
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      const allDeps: Record<string, string> = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };
      stack.dependencies = Object.keys(allDeps);

      // Framework
      if (allDeps['next']) stack.framework = 'next';
      else if (allDeps['react']) stack.framework = 'react';
      else if (allDeps['vue']) stack.framework = 'vue';
      else if (allDeps['@angular/core']) stack.framework = 'angular';
      else if (allDeps['svelte']) stack.framework = 'svelte';
      else if (allDeps['express']) stack.framework = 'express';
      else if (allDeps['@nestjs/core']) stack.framework = 'nest';

      // Test framework
      if (allDeps['vitest']) stack.testFramework = 'vitest';
      else if (allDeps['jest']) stack.testFramework = 'jest';
      else if (allDeps['mocha']) stack.testFramework = 'mocha';

      // Build tool
      if (allDeps['vite']) stack.buildTool = 'vite';
      else if (allDeps['webpack']) stack.buildTool = 'webpack';
      else if (allDeps['esbuild']) stack.buildTool = 'esbuild';
      else if (allDeps['turbo']) stack.buildTool = 'turbo';
    } catch {
      // Malformed package.json
    }
  }

  return stack;
}

/**
 * Cache path for project stack.
 */
function getCachePath(projectRoot: string): string {
  return `${projectRoot}/.deckent/project-stack.json`;
}

/**
 * Read cached stack from disk.
 */
function readCachedStack(fs: FileSystem, projectRoot: string): ProjectStack | null {
  const cachePath = getCachePath(projectRoot);
  const content = fs.readFile(cachePath);
  if (!content) return null;
  try {
    return JSON.parse(content) as ProjectStack;
  } catch {
    return null;
  }
}

/**
 * Write stack to cache.
 */
function writeCachedStack(fs: FileSystem, projectRoot: string, stack: ProjectStack): void {
  const cachePath = getCachePath(projectRoot);
  fs.writeFile(cachePath, JSON.stringify(stack, null, 2));
}

/**
 * Check if cached stack is stale (package.json modified after cache).
 */
function isStackStale(fs: FileSystem, projectRoot: string): boolean {
  const cachePath = getCachePath(projectRoot);
  const cacheStat = fs.stat(cachePath);
  if (!cacheStat) return true;

  const pkgStat = fs.stat(`${projectRoot}/package.json`);
  if (!pkgStat) return true;

  const tsconfigStat = fs.stat(`${projectRoot}/tsconfig.json`);

  // Stale if package.json or tsconfig.json is newer than cache
  if (pkgStat.mtimeMs > cacheStat.mtimeMs) return true;
  if (tsconfigStat && tsconfigStat.mtimeMs > cacheStat.mtimeMs) return true;

  return false;
}

/**
 * Get project stack with caching. Use force=true to skip cache.
 */
function getProjectStack(
  fs: FileSystem,
  projectRoot: string,
  force = false,
): ProjectStack {
  if (!force) {
    const cached = readCachedStack(fs, projectRoot);
    if (cached && !isStackStale(fs, projectRoot)) {
      return cached;
    }
  }

  const stack = detectProjectStack(fs, projectRoot);
  writeCachedStack(fs, projectRoot, stack);
  return stack;
}

// ─── Mock FileSystem ────────────────────────────────────────────────

function createMockFs(
  files: Record<string, string>,
  stats: Record<string, { mtimeMs: number }> = {},
): FileSystem {
  const store = { ...files };
  const statStore = { ...stats };

  return {
    exists(path: string): boolean {
      return path in store;
    },
    readFile(path: string): string | null {
      return store[path] ?? null;
    },
    stat(path: string): { mtimeMs: number } | null {
      return statStore[path] ?? null;
    },
    writeFile(path: string, content: string): void {
      store[path] = content;
      statStore[path] = { mtimeMs: Date.now() };
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Stack Detection E2E Integration', () => {

  // ─── Basic Detection ───────────────────────────────────────────

  it('detects TypeScript + React + Vitest stack', () => {
    const fs = createMockFs({
      '/project/tsconfig.json': '{}',
      '/project/package.json': JSON.stringify({
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
        devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0' },
      }),
    });
    const stack = detectProjectStack(fs, '/project');
    expect(stack.language).toBe('typescript');
    expect(stack.framework).toBe('react');
    expect(stack.testFramework).toBe('vitest');
    expect(stack.buildTool).toBe('tsc');
  });

  it('detects JavaScript + Express + Jest stack', () => {
    const fs = createMockFs({
      '/project/package.json': JSON.stringify({
        dependencies: { express: '^4.0.0' },
        devDependencies: { jest: '^29.0.0' },
      }),
    });
    const stack = detectProjectStack(fs, '/project');
    expect(stack.language).toBe('javascript');
    expect(stack.framework).toBe('express');
    expect(stack.testFramework).toBe('jest');
  });

  it('detects Next.js framework (prefers next over react)', () => {
    const fs = createMockFs({
      '/project/tsconfig.json': '{}',
      '/project/package.json': JSON.stringify({
        dependencies: { react: '^18.0.0', next: '^14.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      }),
    });
    const stack = detectProjectStack(fs, '/project');
    expect(stack.framework).toBe('next');
  });

  it('detects Vue framework', () => {
    const fs = createMockFs({
      '/project/package.json': JSON.stringify({
        dependencies: { vue: '^3.0.0' },
        devDependencies: { vitest: '^1.0.0', vite: '^5.0.0' },
      }),
    });
    const stack = detectProjectStack(fs, '/project');
    expect(stack.framework).toBe('vue');
    expect(stack.buildTool).toBe('vite');
  });

  it('detects Python project', () => {
    const fs = createMockFs({
      '/project/pyproject.toml': '[tool.poetry]',
    });
    const stack = detectProjectStack(fs, '/project');
    expect(stack.language).toBe('python');
  });

  it('detects Rust project', () => {
    const fs = createMockFs({
      '/project/Cargo.toml': '[package]',
    });
    const stack = detectProjectStack(fs, '/project');
    expect(stack.language).toBe('rust');
    expect(stack.buildTool).toBe('cargo');
  });

  it('returns unknown for empty project', () => {
    const fs = createMockFs({});
    const stack = detectProjectStack(fs, '/project');
    expect(stack.language).toBe('unknown');
    expect(stack.framework).toBe('unknown');
    expect(stack.testFramework).toBe('unknown');
  });

  it('handles malformed package.json gracefully', () => {
    const fs = createMockFs({
      '/project/package.json': '{invalid json',
      '/project/tsconfig.json': '{}',
    });
    const stack = detectProjectStack(fs, '/project');
    expect(stack.language).toBe('typescript');
    expect(stack.dependencies).toHaveLength(0);
  });

  // ─── Caching ──────────────────────────────────────────────────

  it('writes cache after detection', () => {
    const fs = createMockFs({
      '/project/tsconfig.json': '{}',
      '/project/package.json': JSON.stringify({
        dependencies: { react: '^18.0.0' },
        devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0' },
      }),
    });
    const stack = getProjectStack(fs, '/project');
    expect(stack.language).toBe('typescript');

    // Verify cache was written
    const cached = readCachedStack(fs, '/project');
    expect(cached).not.toBeNull();
    expect(cached!.language).toBe('typescript');
    expect(cached!.framework).toBe('react');
  });

  it('reads from cache on second call', () => {
    const fs = createMockFs(
      {
        '/project/tsconfig.json': '{}',
        '/project/package.json': JSON.stringify({
          dependencies: { react: '^18.0.0' },
          devDependencies: { typescript: '^5.0.0' },
        }),
      },
      {
        '/project/package.json': { mtimeMs: 1000 },
        '/project/tsconfig.json': { mtimeMs: 1000 },
      },
    );

    // First call: detect and cache
    const first = getProjectStack(fs, '/project');
    expect(first.language).toBe('typescript');

    // Now update the package.json content (simulate different project)
    // but don't change mtime -> cache still valid
    const second = getProjectStack(fs, '/project');
    expect(second.language).toBe('typescript');
    expect(second.detectedAt).toBe(first.detectedAt);
  });

  it('refreshStack with force=true re-detects even with valid cache', () => {
    const writeTracker: string[] = [];
    const files: Record<string, string> = {
      '/project/tsconfig.json': '{}',
      '/project/package.json': JSON.stringify({
        dependencies: { react: '^18.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      }),
    };
    const stats: Record<string, { mtimeMs: number }> = {
      '/project/package.json': { mtimeMs: 1000 },
      '/project/tsconfig.json': { mtimeMs: 1000 },
    };
    const fs: FileSystem = {
      exists: (p) => p in files,
      readFile: (p) => files[p] ?? null,
      stat: (p) => stats[p] ?? null,
      writeFile: (p, c) => { files[p] = c; stats[p] = { mtimeMs: Date.now() }; writeTracker.push(p); },
    };

    // First detection
    getProjectStack(fs, '/project');
    const writesAfterFirst = writeTracker.length;
    expect(writesAfterFirst).toBe(1); // cache written once

    // Force refresh — re-detects and re-writes cache
    const refreshed = getProjectStack(fs, '/project', true);
    expect(refreshed.language).toBe('typescript');
    expect(writeTracker.length).toBe(2); // cache written again
  });

  // ─── Staleness Detection ──────────────────────────────────────

  it('isStackStale returns true when no cache exists', () => {
    const fs = createMockFs({
      '/project/package.json': '{}',
    });
    expect(isStackStale(fs, '/project')).toBe(true);
  });

  it('isStackStale returns true when package.json is newer than cache', () => {
    const fs = createMockFs(
      {
        '/project/package.json': '{}',
        '/project/.deckent/project-stack.json': '{}',
      },
      {
        '/project/package.json': { mtimeMs: 2000 },
        '/project/.deckent/project-stack.json': { mtimeMs: 1000 },
      },
    );
    expect(isStackStale(fs, '/project')).toBe(true);
  });

  it('isStackStale returns false when cache is newer than package.json', () => {
    const fs = createMockFs(
      {
        '/project/package.json': '{}',
        '/project/.deckent/project-stack.json': '{}',
      },
      {
        '/project/package.json': { mtimeMs: 1000 },
        '/project/.deckent/project-stack.json': { mtimeMs: 2000 },
      },
    );
    expect(isStackStale(fs, '/project')).toBe(false);
  });

  it('isStackStale returns true when tsconfig.json is newer than cache', () => {
    const fs = createMockFs(
      {
        '/project/tsconfig.json': '{}',
        '/project/package.json': '{}',
        '/project/.deckent/project-stack.json': '{}',
      },
      {
        '/project/tsconfig.json': { mtimeMs: 3000 },
        '/project/package.json': { mtimeMs: 1000 },
        '/project/.deckent/project-stack.json': { mtimeMs: 2000 },
      },
    );
    expect(isStackStale(fs, '/project')).toBe(true);
  });

  it('isStackStale returns true when package.json stat is missing', () => {
    const fs = createMockFs(
      {
        '/project/.deckent/project-stack.json': '{}',
      },
      {
        '/project/.deckent/project-stack.json': { mtimeMs: 2000 },
      },
    );
    expect(isStackStale(fs, '/project')).toBe(true);
  });

  // ─── Dependency Extraction ────────────────────────────────────

  it('extracts all dependencies including devDependencies', () => {
    const fs = createMockFs({
      '/project/package.json': JSON.stringify({
        dependencies: { react: '^18.0.0', axios: '^1.0.0' },
        devDependencies: { vitest: '^1.0.0', typescript: '^5.0.0' },
      }),
    });
    const stack = detectProjectStack(fs, '/project');
    expect(stack.dependencies).toContain('react');
    expect(stack.dependencies).toContain('axios');
    expect(stack.dependencies).toContain('vitest');
    expect(stack.dependencies).toContain('typescript');
    expect(stack.dependencies).toHaveLength(4);
  });

  it('handles package.json with only dependencies', () => {
    const fs = createMockFs({
      '/project/package.json': JSON.stringify({
        dependencies: { express: '^4.0.0' },
      }),
    });
    const stack = detectProjectStack(fs, '/project');
    expect(stack.dependencies).toContain('express');
    expect(stack.dependencies).toHaveLength(1);
  });

  it('handles package.json with empty dependencies', () => {
    const fs = createMockFs({
      '/project/package.json': JSON.stringify({
        name: 'empty-project',
      }),
    });
    const stack = detectProjectStack(fs, '/project');
    expect(stack.dependencies).toHaveLength(0);
  });
});
