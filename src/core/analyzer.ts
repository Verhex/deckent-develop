// ─── Project Analyzer ────────────────────────────────────────────────────────
// L) This module covers ProjectAnalysis (framework, language, ci, fileCount,
//    authorCount, size, methodology). stack-detector.ts is the canonical source
//    for language/framework/testFramework/buildTool in the stack detection flow.
//    analyzer.ts is kept as a standalone module for CLI 'analyze' command output.
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type {
  ProjectAnalysis,
  DetectedFramework,
  DetectedLanguage,
  DetectedTestFramework,
  DetectedBuildTool,
  DetectedCI,
  ProjectSize,
  MethodologyRecommendation,
} from './config-types.js';
import { readJsonSafe } from './utils.js';

// N) In-memory cache for analyzeProject results (key: projectRoot)
const _analyzeCache = new Map<string, { result: ProjectAnalysis; mtime: number }>();

function getConfigMtime(root: string): number {
  try {
    return statSync(join(root, 'package.json')).mtimeMs;
  } catch {
    return 0;
  }
}

function readPackageJson(root: string): { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null {
  const pkgPath = join(root, 'package.json');
  return readJsonSafe<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(pkgPath);
}

function detectFramework(root: string): DetectedFramework {
  const pkg = readPackageJson(root);
  if (!pkg) return 'unknown';
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (allDeps['next']) return 'next';
  if (allDeps['@nestjs/core']) return 'nest';
  if (allDeps['@angular/core']) return 'angular';
  if (allDeps['svelte']) return 'svelte';
  if (allDeps['vue']) return 'vue';
  if (allDeps['react']) return 'react';
  if (allDeps['express']) return 'express';
  return 'unknown';
}

function detectLanguage(root: string): DetectedLanguage {
  const hasTs = existsSync(join(root, 'tsconfig.json'));
  const hasRust = existsSync(join(root, 'Cargo.toml'));
  const hasPython = existsSync(join(root, 'pyproject.toml')) || existsSync(join(root, 'setup.py'));
  const hasPkg = existsSync(join(root, 'package.json'));

  const count = [hasTs, hasRust, hasPython].filter(Boolean).length;
  if (count > 1) return 'mixed';
  if (hasTs) return 'typescript';
  if (hasRust) return 'rust';
  if (hasPython) return 'python';
  if (hasPkg) return 'javascript';
  return 'unknown';
}

function detectTestFramework(root: string): DetectedTestFramework {
  const pkg = readPackageJson(root);
  if (pkg) {
    const devDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (devDeps['vitest']) return 'vitest';
    if (devDeps['jest']) return 'jest';
    if (devDeps['mocha']) return 'mocha';
  }
  const pyprojectPath = join(root, 'pyproject.toml');
  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, 'utf-8');
      if (content.includes('pytest')) return 'pytest';
    } catch { /* skip */ }
  }
  return 'unknown';
}

function detectBuildTool(root: string): DetectedBuildTool {
  const pkg = readPackageJson(root);
  if (!pkg) return 'unknown';
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (allDeps['turbo']) return 'turbo';
  if (allDeps['vite']) return 'vite';
  if (allDeps['webpack']) return 'webpack';
  if (allDeps['esbuild']) return 'esbuild';
  if (existsSync(join(root, 'tsconfig.json'))) return 'tsc';
  return 'unknown';
}

function detectCI(root: string): DetectedCI {
  if (existsSync(join(root, '.github', 'workflows'))) return 'github-actions';
  if (existsSync(join(root, '.gitlab-ci.yml'))) return 'gitlab-ci';
  if (existsSync(join(root, '.circleci'))) return 'circleci';
  return 'unknown';
}

/** M) Get file count: try git first, fall back to fs-based walk. */
function getFileCount(root: string): number {
  const result = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf-8' });
  if (result.status === 0 && result.stdout) {
    const count = result.stdout.split('\n').filter(l => l.length > 0).length;
    if (count > 0) return count;
  }
  // M) Fallback: count files recursively via fs (skip node_modules, .git, dist)
  return countFilesFs(root, 0);
}

function countFilesFs(dir: string, depth: number): number {
  if (depth > 10) return 0;
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.deckent', 'coverage']);
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          count += countFilesFs(join(dir, entry.name), depth + 1);
        }
      } else {
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function getAuthorCount(root: string): number {
  const result = spawnSync('git', ['log', '--format=%aN'], { cwd: root, encoding: 'utf-8' });
  if (result.status !== 0) return 0;
  const authors = new Set(result.stdout.split('\n').filter(l => l.length > 0));
  return authors.size;
}

function classifySize(fileCount: number): ProjectSize {
  if (fileCount < 50) return 'small';
  if (fileCount < 500) return 'medium';
  return 'large';
}

function recommendMethodology(size: ProjectSize, authorCount: number, fileCount: number): MethodologyRecommendation {
  if (size === 'small' && authorCount <= 1) return 'micro-sprint';
  if (size === 'medium') return 'sprint';
  if (size === 'large' && fileCount >= 2000) return 'hybrid';
  if (size === 'large') return 'agile';
  return 'sprint';
}

/**
 * Analyze the project at the given root directory.
 *
 * M) Falls back to fs-based file counting when git is not available.
 */
export function analyzeProject(root: string): ProjectAnalysis {
  const framework = detectFramework(root);
  const language = detectLanguage(root);
  const testFramework = detectTestFramework(root);
  const buildTool = detectBuildTool(root);
  const ci = detectCI(root);
  const fileCount = getFileCount(root);
  const authorCount = getAuthorCount(root);
  const size = classifySize(fileCount);
  const methodology = recommendMethodology(size, authorCount, fileCount);

  return {
    framework,
    language,
    testFramework,
    buildTool,
    ci,
    fileCount,
    authorCount,
    size,
    methodology,
  };
}

/**
 * N) Cached version of analyzeProject. Results are stored in memory
 * keyed by projectRoot and invalidated when package.json mtime changes.
 * Prefer this for CLI commands that may be called repeatedly.
 */
export function analyzeProjectCached(root: string): ProjectAnalysis {
  const mtime = getConfigMtime(root);
  const cached = _analyzeCache.get(root);
  if (cached && cached.mtime === mtime) {
    return cached.result;
  }

  const result = analyzeProject(root);
  _analyzeCache.set(root, { result, mtime });
  return result;
}

/** Clear the analysis cache (useful for tests). */
export function clearAnalyzeCache(): void {
  _analyzeCache.clear();
}
