// ─── Stack Detector ─────────────────────────────────────────────────────────
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectStack } from './skill-types.js';
import { readJsonSafe } from './utils.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const CACHE_FILE = '.deckent/project-stack.json';
const CACHE_CHECK_FILES = [
  'package.json',
  'tsconfig.json',
  'Cargo.toml',
  'go.mod',
  'setup.py',
  'pyproject.toml',
];

// ─── detectProjectStack ────────────────────────────────────────────────────

/**
 * Detect the project's technology stack by examining project files.
 * Results are cached to .deckent/project-stack.json.
 * On subsequent calls, returns cached data unless stale.
 */
export function detectProjectStack(projectRoot: string): ProjectStack {
  const cachePath = path.join(projectRoot, CACHE_FILE);

  // Try reading from cache first
  if (!isStackStale(projectRoot)) {
    const cached = readJsonSafe<ProjectStack>(cachePath);
    if (cached && typeof cached === 'object' && cached.language) {
      return cached;
    }
  }

  const stack = detectFresh(projectRoot);

  // Write cache
  try {
    const cacheDir = path.dirname(cachePath);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(stack, null, 2), 'utf8');
  } catch {
    // Cache write failure is non-fatal
  }

  return stack;
}

// ─── isStackStale ─────────────────────────────────────────────────────────

/**
 * Check if the cached project-stack.json is stale by comparing mtime
 * of monitored files (package.json, tsconfig.json, etc.) against the cache file.
 */
export function isStackStale(projectRoot: string): boolean {
  const cachePath = path.join(projectRoot, CACHE_FILE);

  if (!fs.existsSync(cachePath)) return true;

  let cacheStat: fs.Stats;
  try {
    cacheStat = fs.statSync(cachePath);
  } catch {
    return true;
  }

  const cacheMtime = cacheStat.mtimeMs;

  for (const file of CACHE_CHECK_FILES) {
    const filePath = path.join(projectRoot, file);
    try {
      const fileStat = fs.statSync(filePath);
      if (fileStat.mtimeMs > cacheMtime) return true;
    } catch {
      // File doesn't exist, not a staleness indicator
    }
  }

  return false;
}

// ─── refreshStack ──────────────────────────────────────────────────────────

/**
 * Force re-detection of the project stack, ignoring cache.
 */
export function refreshStack(projectRoot: string): ProjectStack {
  const cachePath = path.join(projectRoot, CACHE_FILE);

  // Remove existing cache to force re-detection
  try {
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
  } catch {
    // Removal failure is non-fatal
  }

  return detectProjectStack(projectRoot);
}

// ─── Internal: fresh detection ─────────────────────────────────────────────

function detectFresh(projectRoot: string): ProjectStack {
  let language = 'unknown';
  let framework = 'unknown';
  const dependencies: string[] = [];
  let buildTool = 'unknown';
  let testFramework = 'unknown';

  // Read package.json
  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg: Record<string, unknown> = readJsonSafe<Record<string, unknown>>(pkgPath) ?? {};

  const allDeps = {
    ...(pkg['dependencies'] as Record<string, string> | undefined) ?? {},
    ...(pkg['devDependencies'] as Record<string, string> | undefined) ?? {},
  };
  const depNames = Object.keys(allDeps);
  dependencies.push(...depNames);

  // Language detection
  const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath) || depNames.includes('typescript')) {
    language = 'typescript';
  } else if (fs.existsSync(pkgPath) && depNames.length > 0) {
    language = 'javascript';
  } else if (fs.existsSync(path.join(projectRoot, 'setup.py')) || fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
    language = 'python';
  } else if (fs.existsSync(path.join(projectRoot, 'Cargo.toml'))) {
    language = 'rust';
  } else if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
    language = 'go';
  } else if (fs.existsSync(pkgPath)) {
    language = 'javascript';
  }

  // Framework detection
  if (depNames.includes('next')) framework = 'next';
  else if (depNames.includes('react')) framework = 'react';
  else if (depNames.includes('vue')) framework = 'vue';
  else if (depNames.includes('@angular/core')) framework = 'angular';
  else if (depNames.includes('svelte')) framework = 'svelte';
  else if (depNames.includes('@nestjs/core')) framework = 'nest';
  else if (depNames.includes('express')) framework = 'express';
  else if (depNames.includes('fastify')) framework = 'fastify';
  else if (depNames.includes('django')) framework = 'django';
  else if (depNames.includes('flask')) framework = 'flask';
  else if (depNames.includes('fastapi')) framework = 'fastapi';

  // Test framework detection
  if (depNames.includes('vitest') || fs.existsSync(path.join(projectRoot, 'vitest.config.ts')) || fs.existsSync(path.join(projectRoot, 'vitest.config.js'))) {
    testFramework = 'vitest';
  } else if (depNames.includes('jest') || fs.existsSync(path.join(projectRoot, 'jest.config.ts')) || fs.existsSync(path.join(projectRoot, 'jest.config.js'))) {
    testFramework = 'jest';
  } else if (depNames.includes('mocha')) {
    testFramework = 'mocha';
  } else if (depNames.includes('pytest') || fs.existsSync(path.join(projectRoot, 'pytest.ini'))) {
    testFramework = 'pytest';
  }

  // Build tool detection
  if (depNames.includes('vite')) buildTool = 'vite';
  else if (depNames.includes('webpack')) buildTool = 'webpack';
  else if (depNames.includes('esbuild')) buildTool = 'esbuild';
  else if (depNames.includes('turbo')) buildTool = 'turbo';
  else if (language === 'typescript') buildTool = 'tsc';
  else if (language === 'rust') buildTool = 'cargo';
  else if (language === 'go') buildTool = 'go';
  else if (language === 'python') buildTool = 'setuptools';

  return {
    language,
    framework,
    dependencies: depNames.slice(0, 50), // Cap at 50 to keep cache reasonable
    buildTool,
    testFramework,
    detectedAt: new Date().toISOString(),
  };
}
