import { readFileSync, existsSync } from 'node:fs';
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
} from './types.js';

function readPackageJson(root: string): { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null {
  const pkgPath = join(root, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    return null;
  }
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
  // Check for pytest in pyproject.toml
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

function getFileCount(root: string): number {
  const result = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf-8' });
  if (result.status !== 0) return 0;
  return result.stdout.split('\n').filter(l => l.length > 0).length;
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
