// ─── Project Analyzer ────────────────────────────────────────────────────────
// L) This module covers ProjectAnalysis (framework, language, ci, fileCount,
//    authorCount, size, methodology). Stack detection (language/framework/
//    testFramework/buildTool) is delegated to stack-detector.ts via
//    detectProjectStack(). analyzer.ts adds CI detection, git-based file/author
//    counts, size classification, and methodology recommendation.
import { existsSync, statSync, readdirSync } from 'node:fs';
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
import { detectProjectStack } from './stack-detector.js';

// N) In-memory cache for analyzeProject results (key: projectRoot)
const _analyzeCache = new Map<string, { result: ProjectAnalysis; mtime: number }>();

function getConfigMtime(root: string): number {
  try {
    return statSync(join(root, 'package.json')).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Check if multiple language ecosystems coexist (TypeScript + Rust or Python).
 * Returns 'mixed' when two or more language markers are present simultaneously.
 */
function detectMixedLanguage(root: string): boolean {
  const hasTs = existsSync(join(root, 'tsconfig.json'));
  const hasRust = existsSync(join(root, 'Cargo.toml'));
  const hasPython = existsSync(join(root, 'pyproject.toml')) || existsSync(join(root, 'setup.py'));
  return [hasTs, hasRust, hasPython].filter(Boolean).length > 1;
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
 * Delegates language/framework/testFramework/buildTool detection to
 * detectProjectStack() (stack-detector.ts), then appends CI detection,
 * git-based file/author counts, size classification, and methodology.
 *
 * M) Falls back to fs-based file counting when git is not available.
 */
export function analyzeProject(root: string): ProjectAnalysis {
  const stack = detectProjectStack(root);
  // 'mixed' language is unique to analyzer — stack-detector returns primary language
  const language: DetectedLanguage = detectMixedLanguage(root) ? 'mixed' : (stack.language as DetectedLanguage);
  const ci = detectCI(root);
  const fileCount = getFileCount(root);
  const authorCount = getAuthorCount(root);
  const size = classifySize(fileCount);
  const methodology = recommendMethodology(size, authorCount, fileCount);

  return {
    framework: stack.framework as DetectedFramework,
    language,
    testFramework: stack.testFramework as DetectedTestFramework,
    buildTool: stack.buildTool as DetectedBuildTool,
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
