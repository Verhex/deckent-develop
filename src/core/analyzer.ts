// ─── Project Analyzer ────────────────────────────────────────────────────────
// A) Thin wrapper around stack-detector.ts. Delegates language/framework/
//    testFramework/buildTool detection to detectProjectStack(), then adds
//    CI detection, git-based file/author counts, LOC counting, size
//    classification, methodology, and config suggestions.
import { existsSync, statSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
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
  AnalyzerSuggestion,
} from './config-types.js';
import { detectProjectStack } from './stack-detector.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const ANALYZER_CACHE_FILE = '.deckent/analyzer-cache.json';

const CACHE_CHECK_FILES = [
  'package.json',
  'tsconfig.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
];

// N) In-memory cache for analyzeProject results (key: projectRoot)
const _analyzeCache = new Map<string, { result: ProjectAnalysis; mtime: number }>();

// ─── Cache helpers ──────────────────────────────────────────────────────────

function getConfigMtime(root: string): number {
  let maxMtime = 0;
  for (const file of CACHE_CHECK_FILES) {
    try {
      const mtime = statSync(join(root, file)).mtimeMs;
      if (mtime > maxMtime) maxMtime = mtime;
    } catch {
      // File doesn't exist
    }
  }
  return maxMtime;
}

// C) Disk-based analyzer cache
function readDiskCache(root: string): ProjectAnalysis | null {
  const cachePath = join(root, ANALYZER_CACHE_FILE);
  try {
    if (!existsSync(cachePath)) return null;
    const cacheStat = statSync(cachePath);
    const configMtime = getConfigMtime(root);
    if (configMtime > cacheStat.mtimeMs) return null; // stale
    const raw = readFileSync(cachePath, 'utf8');
    const data = JSON.parse(raw) as ProjectAnalysis;
    if (data && typeof data === 'object' && data.framework) return data;
  } catch {
    // Cache read failure
  }
  return null;
}

function writeDiskCache(root: string, result: ProjectAnalysis): void {
  const cachePath = join(root, ANALYZER_CACHE_FILE);
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(result, null, 2), 'utf8');
  } catch {
    // Cache write failure is non-fatal
  }
}

// ─── CI Detection ───────────────────────────────────────────────────────────

function detectCI(root: string): DetectedCI {
  if (existsSync(join(root, '.github', 'workflows'))) return 'github-actions';
  if (existsSync(join(root, '.gitlab-ci.yml'))) return 'gitlab-ci';
  if (existsSync(join(root, '.circleci'))) return 'circleci';
  return 'unknown';
}

// ─── File / Author / LOC Counting ───────────────────────────────────────────

/** B) Get file count: try git first, fall back to fs-based walk. */
function getFileCount(root: string): number {
  const result = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf-8' });
  if (result.status === 0 && result.stdout) {
    const count = result.stdout.split('\n').filter(l => l.length > 0).length;
    if (count > 0) return count;
  }
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

/** B) Get author count: try git first, fall back to 1 if git unavailable. */
function getAuthorCount(root: string): number {
  const result = spawnSync('git', ['log', '--format=%aN'], { cwd: root, encoding: 'utf-8' });
  if (result.status === 0 && result.stdout) {
    const authors = new Set(result.stdout.split('\n').filter(l => l.length > 0));
    if (authors.size > 0) return authors.size;
  }
  // B) Fallback: if .git dir exists but log failed, assume at least 1 author
  if (existsSync(join(root, '.git'))) return 1;
  return 0;
}

/** D) Count total lines of code (LOC) via git or fs walk. */
function getLOCCount(root: string): number {
  // Try git-based LOC count (fast)
  const result = spawnSync(
    'git', ['ls-files'],
    { cwd: root, encoding: 'utf-8' },
  );
  if (result.status === 0 && result.stdout) {
    const files = result.stdout.split('\n').filter(l => l.length > 0);
    return countLinesOfFiles(root, files);
  }
  // Fallback: count via fs walk
  return countLinesFs(root, 0);
}

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
  '.vue', '.svelte', '.css', '.scss', '.html',
]);

function countLinesOfFiles(root: string, files: string[]): number {
  let total = 0;
  const skipDirs = ['node_modules/', 'dist/', 'build/', 'coverage/', '.deckent/'];
  for (const file of files) {
    if (skipDirs.some(d => file.startsWith(d))) continue;
    const ext = file.substring(file.lastIndexOf('.'));
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    try {
      const content = readFileSync(join(root, file), 'utf8');
      total += content.split('\n').length;
    } catch {
      // File read failure
    }
    if (total > 500_000) break; // safety cap
  }
  return total;
}

function countLinesFs(dir: string, depth: number): number {
  if (depth > 10) return 0;
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.deckent', 'coverage']);
  let total = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          total += countLinesFs(join(dir, entry.name), depth + 1);
        }
      } else {
        const ext = entry.name.substring(entry.name.lastIndexOf('.'));
        if (!SOURCE_EXTENSIONS.has(ext)) continue;
        try {
          const content = readFileSync(join(dir, entry.name), 'utf8');
          total += content.split('\n').length;
        } catch {
          // File read failure
        }
      }
      if (total > 500_000) break;
    }
  } catch {
    // Dir read failure
  }
  return total;
}

// ─── Size & Methodology ─────────────────────────────────────────────────────

/** D) LOC-enhanced size classification. Uses both fileCount and LOC. */
function classifySize(fileCount: number, locCount: number): ProjectSize {
  // LOC takes priority when available, file count as fallback
  if (locCount > 0) {
    if (locCount < 2000) return 'small';
    if (locCount < 50000) return 'medium';
    return 'large';
  }
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

// ─── H) Config Suggestions ──────────────────────────────────────────────────

function generateAnalyzerSuggestions(
  analysis: Omit<ProjectAnalysis, 'configSuggestions'>,
): AnalyzerSuggestion[] {
  const suggestions: AnalyzerSuggestion[] = [];

  if (analysis.size === 'large' && analysis.authorCount > 3) {
    suggestions.push({
      field: 'max_workers',
      value: '4',
      reason: 'Large project with multiple authors benefits from more parallel workers',
    });
  }

  if (analysis.size === 'small') {
    suggestions.push({
      field: 'mode',
      value: 'economic',
      reason: 'Small project can use economic mode to conserve resources',
    });
  }

  if (analysis.detectedLanguages.length > 1) {
    suggestions.push({
      field: 'brain_planning',
      value: 'ai',
      reason: 'Multi-language project benefits from AI-powered planning',
    });
  }

  if (analysis.ci === 'unknown') {
    suggestions.push({
      field: 'ci',
      value: 'github-actions',
      reason: 'No CI detected — consider adding GitHub Actions for automated testing',
    });
  }

  if (analysis.testFramework === 'unknown') {
    suggestions.push({
      field: 'testFramework',
      value: analysis.language === 'python' ? 'pytest' : 'vitest',
      reason: 'No test framework detected — consider adding one for quality assurance',
    });
  }

  return suggestions;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * A) Analyze the project at the given root directory.
 * Thin wrapper around detectProjectStack() — delegates stack detection,
 * then adds CI, file/author/LOC counts, size, methodology, and suggestions.
 */
export function analyzeProject(root: string): ProjectAnalysis {
  const stack = detectProjectStack(root);

  // A) Use detectedLanguages from stack-detector (E) instead of duplicate logic
  const detectedLanguages = stack.detectedLanguages ?? [stack.language];
  const isMixed = detectedLanguages.length > 1;
  const language: DetectedLanguage = isMixed ? 'mixed' : (stack.language as DetectedLanguage);

  const ci = detectCI(root);
  const fileCount = getFileCount(root);
  const locCount = getLOCCount(root);
  const authorCount = getAuthorCount(root);
  const size = classifySize(fileCount, locCount);
  const methodology = recommendMethodology(size, authorCount, fileCount);
  const subProjects = stack.subProjects ?? [];

  const partial = {
    framework: stack.framework as DetectedFramework,
    language,
    detectedLanguages,
    testFramework: stack.testFramework as DetectedTestFramework,
    buildTool: stack.buildTool as DetectedBuildTool,
    ci,
    fileCount,
    locCount,
    authorCount,
    size,
    methodology,
    subProjects,
  };

  const configSuggestions = generateAnalyzerSuggestions(partial);

  return { ...partial, configSuggestions };
}

/**
 * N) Cached version of analyzeProject. Uses both in-memory and disk cache.
 * Results are invalidated when any config file mtime changes.
 */
export function analyzeProjectCached(root: string): ProjectAnalysis {
  const mtime = getConfigMtime(root);
  const cached = _analyzeCache.get(root);
  if (cached && cached.mtime === mtime) {
    return cached.result;
  }

  // C) Try disk cache before full re-analysis
  const diskCached = readDiskCache(root);
  if (diskCached) {
    _analyzeCache.set(root, { result: diskCached, mtime });
    return diskCached;
  }

  const result = analyzeProject(root);
  _analyzeCache.set(root, { result, mtime });
  writeDiskCache(root, result);
  return result;
}

/** Clear the analysis cache (useful for tests). */
export function clearAnalyzeCache(): void {
  _analyzeCache.clear();
}
