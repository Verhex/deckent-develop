// ─── Intent Classifier ──────────────────────────────────────────────────────
// Layer 1: Classify task intent from scope/description into TaskDNA.
// Replaces the broken detectTaskType() with weighted, multi-signal analysis.

import type { TaskScope } from './task-types.js';
import type { TaskDNA, IntentType, OperationType, TaskSize } from './routing-types.js';

// ─── Intent Keywords ────────────────────────────────────────────────────────

const INTENT_KEYWORDS: Record<IntentType, string[]> = {
  security: ['security', 'auth', 'authentication', 'jwt', 'csrf', 'xss', 'injection', 'vulnerability', 'encryption', 'owasp', 'permission', 'acl', 'rbac'],
  bugfix: ['fix', 'bug', 'error', 'crash', 'regression', 'broken', 'issue', 'defect', 'patch', 'hotfix', 'wire', 'runtime'],
  testing: ['test', 'spec', 'coverage', 'vitest', 'jest', 'mock', 'stub', 'assertion', 'e2e', 'integration test', 'unit test'],
  refactor: ['refactor', 'cleanup', 'restructure', 'simplify', 'extract', 'split', 'merge', 'consolidate', 'rename', 'reorganize'],
  documentation: ['doc', 'documentation', 'doc update', 'readme', 'changelog', 'comment', 'jsdoc', 'guide', 'tutorial', 'api doc', 'güncelleme', 'dokümantasyon'],
  performance: ['performance', 'optimize', 'speed', 'latency', 'cache', 'profil', 'benchmark', 'bottleneck', 'memory leak'],
  design: ['ui', 'ux', 'layout', 'component', 'style', 'css', 'theme', 'responsive', 'animation'],
  devops: ['ci', 'cd', 'pipeline', 'deploy', 'docker', 'kubernetes', 'workflow', 'github actions', 'infrastructure'],
  config: ['config', 'setting', 'env', 'environment', 'option', 'flag', 'parameter'],
  migration: ['migrate', 'migration', 'upgrade', 'version', 'schema', 'transform', 'convert'],
  implementation: ['implement', 'add', 'create', 'build', 'feature', 'endpoint', 'command', 'module', 'function', 'adaptive', 'timeout', 'estimator', 'engine', 'validator'],
  unknown: [],
};

// ─── Operation Keywords ─────────────────────────────────────────────────────

const OPERATION_KEYWORDS: Record<OperationType, string[]> = {
  create: ['create', 'add', 'new', 'implement', 'build', 'introduce'],
  modify: ['modify', 'update', 'change', 'improve', 'enhance', 'adjust', 'fix'],
  delete: ['delete', 'remove', 'drop', 'clean', 'prune'],
  rename: ['rename', 'move', 'relocate'],
  test: ['test', 'spec', 'coverage', 'verify', 'assert', 'validate'],
  document: ['doc', 'document', 'comment', 'readme', 'changelog', 'explain'],
  configure: ['config', 'configure', 'setup', 'init', 'setting', 'env'],
};

// ─── Scope-based Intent Signals ─────────────────────────────────────────────

const SCOPE_INTENT_SIGNALS: Array<{ pattern: RegExp; intent: IntentType; weight: number }> = [
  { pattern: /^\.github\/|^ci\/|^\.circleci/i, intent: 'devops', weight: 3 },
  { pattern: /security|auth/i, intent: 'security', weight: 2 },
  { pattern: /docs?\//i, intent: 'documentation', weight: 2 },
  { pattern: /\.md$/i, intent: 'documentation', weight: 2 }, // .md file writes signal documentation
  { pattern: /test/i, intent: 'testing', weight: 1 }, // lower weight — testing often secondary
];

// ─── Main API ───────────────────────────────────────────────────────────────

/**
 * Classify a task into a TaskDNA structure.
 * Combines text analysis with scope analysis for accurate intent detection.
 */
export function classifyIntent(task: {
  title: string;
  description: string;
  scope: TaskScope;
}): TaskDNA {
  const text = `${task.title} ${task.description}`.toLowerCase();
  const scope = task.scope;

  const scopeAnalysis = analyzeWriteScope(scope);
  const primaryResult = detectPrimaryIntent(text, scope, scopeAnalysis);
  const secondary = detectSecondaryIntents(text, scope, primaryResult.intent, scopeAnalysis);
  const domains = detectDomains(scope);
  const operations = detectOperations(text, scope);
  const complexity = analyzeComplexity(scope);

  return {
    intent: {
      primary: primaryResult.intent,
      secondary,
      confidence: primaryResult.confidence,
    },
    domains,
    operations,
    complexity,
    scope: scopeAnalysis,
  };
}

// ─── Primary Intent Detection ───────────────────────────────────────────────

interface IntentScore {
  intent: IntentType;
  score: number;
}

export function detectPrimaryIntent(
  text: string,
  scope: TaskScope,
  scopeAnalysis?: TaskDNA['scope'],
): { intent: IntentType; confidence: number } {
  const analysis = scopeAnalysis ?? analyzeWriteScope(scope);
  const scores: IntentScore[] = [];

  // Score each intent type by keyword matches
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (intent === 'unknown') continue;
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score += 2;
    }
    if (score > 0) scores.push({ intent: intent as IntentType, score });
  }

  // Scope-based signals (boost/debunk)
  for (const signal of SCOPE_INTENT_SIGNALS) {
    const dirs = [...scope.directories, ...scope.filesWrite];
    for (const d of dirs) {
      if (signal.pattern.test(d)) {
        const existing = scores.find(s => s.intent === signal.intent);
        if (existing) {
          existing.score += signal.weight;
        } else {
          scores.push({ intent: signal.intent, score: signal.weight });
        }
      }
    }
  }

  // CRITICAL FIX: Write ratio analysis prevents the detectTaskType ordering bug.
  // If most writes go to src/, it's implementation even if "test" keyword appears.
  if (analysis.testWriteRatio < 0.3 && analysis.writeRatio['src/'] !== undefined) {
    // Most writes are source code — boost implementation, debunk testing
    const implScore = scores.find(s => s.intent === 'implementation');
    if (implScore) {
      implScore.score += 3;
    } else {
      scores.push({ intent: 'implementation', score: 3 });
    }
    const testScore = scores.find(s => s.intent === 'testing');
    if (testScore) testScore.score = Math.max(0, testScore.score - 2);
  }

  // If most writes are tests and no strong source signal
  if (analysis.testWriteRatio >= 0.5) {
    const testScore = scores.find(s => s.intent === 'testing');
    if (testScore) {
      testScore.score += 3;
    } else {
      scores.push({ intent: 'testing', score: 3 });
    }
  }

  // If most writes are docs (docs/ directory or root-level .md files)
  const docRatio = Object.entries(analysis.writeRatio)
    .filter(([k]) => k.startsWith('docs/') || k === 'docs/')
    .reduce((sum, [, v]) => sum + v, 0);
  // Also check for .md-heavy writes at any level (root .md files don't have a dir prefix)
  const mdFileCount = scope.filesWrite.filter(f => f.endsWith('.md')).length;
  const mdRatio = scope.filesWrite.length > 0 ? mdFileCount / scope.filesWrite.length : 0;
  if (docRatio >= 0.5 || mdRatio >= 0.5) {
    const docScore = scores.find(s => s.intent === 'documentation');
    if (docScore) {
      docScore.score += 3;
    } else {
      scores.push({ intent: 'documentation', score: 3 });
    }
    // Debunk testing when most writes are doc files
    const testScore = scores.find(s => s.intent === 'testing');
    if (testScore && mdRatio >= 0.5) testScore.score = Math.max(0, testScore.score - 2);
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  if (scores.length === 0) {
    // No signals at all — default to implementation if there are source files
    if (scope.filesWrite.some(f => f.startsWith('src/')) || scope.directories.some(d => d.startsWith('src/'))) {
      return { intent: 'implementation', confidence: 0.3 };
    }
    return { intent: 'unknown', confidence: 0 };
  }

  const top = scores[0]!;
  const second = scores[1];

  // Confidence based on gap between top-1 and top-2
  let confidence: number;
  if (!second || second.score === 0) {
    confidence = Math.min(0.95, 0.5 + top.score * 0.05);
  } else {
    const gap = top.score - second.score;
    const ratio = gap / top.score;
    confidence = Math.min(0.95, 0.3 + ratio * 0.5 + top.score * 0.03);
  }

  return { intent: top.intent, confidence: Math.round(confidence * 100) / 100 };
}

// ─── Secondary Intents ──────────────────────────────────────────────────────

export function detectSecondaryIntents(
  text: string,
  scope: TaskScope,
  primary: IntentType,
  scopeAnalysis?: TaskDNA['scope'],
): IntentType[] {
  const analysis = scopeAnalysis ?? analyzeWriteScope(scope);
  const secondary: IntentType[] = [];

  // If task has actual test work (scope signal or significant writes) but primary isn't testing.
  // Intentionally excludes keyword-only matches: "Test: 10+ tests" in DIRECTIVES descriptions
  // should NOT trigger test-writer for implementation tasks.
  if (primary !== 'testing') {
    const hasTestScope = scope.directories.some(d => d.includes('test')) ||
      scope.filesWrite.some(f => f.includes('.test.') || f.includes('.spec.') || f.startsWith('tests/') || f.startsWith('test/'));
    const hasSignificantTestWork = analysis.testWriteRatio >= 0.2;
    if (hasSignificantTestWork || hasTestScope) {
      secondary.push('testing');
    }
  }

  // If task touches docs but primary isn't documentation
  if (primary !== 'documentation') {
    const hasDocKeywords = INTENT_KEYWORDS.documentation.some(kw => text.includes(kw));
    const hasDocScope = scope.directories.some(d => d.includes('doc'));
    if (hasDocKeywords || hasDocScope) {
      secondary.push('documentation');
    }
  }

  // If task mentions security but primary isn't security
  if (primary !== 'security') {
    const hasSecKeywords = INTENT_KEYWORDS.security.some(kw => text.includes(kw));
    if (hasSecKeywords) secondary.push('security');
  }

  // If task mentions config/migration but primary isn't those
  if (primary !== 'config' && primary !== 'migration') {
    const hasConfigKeywords = INTENT_KEYWORDS.config.some(kw => text.includes(kw));
    if (hasConfigKeywords) secondary.push('config');
  }

  return secondary;
}

// ─── Domain Detection ───────────────────────────────────────────────────────

/**
 * Extract domain names from scope directories and files.
 * e.g., src/auth/login.ts → domain "auth"
 *        src/orchestra/sprint-controller.ts → domain "orchestra"
 */
export function detectDomains(scope: TaskScope): Array<{ name: string; weight: number }> {
  const domainCounts = new Map<string, number>();
  const allPaths = [...scope.directories, ...scope.filesWrite, ...scope.filesRead];
  const total = allPaths.length || 1;

  for (const p of allPaths) {
    const domain = extractDomainFromPath(p);
    if (domain) {
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    }
  }

  return [...domainCounts.entries()]
    .map(([name, count]) => ({ name, weight: Math.round((count / total) * 100) / 100 }))
    .sort((a, b) => b.weight - a.weight);
}

function extractDomainFromPath(filePath: string): string | null {
  // Remove common prefixes
  const cleaned = filePath
    .replace(/^(src|tests|test|lib|packages)\//, '')
    .replace(/^(cli|commands|helpers)\//, 'cli/');

  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  // First meaningful directory segment
  const domain = parts[0]!;
  // Filter out file extensions and generic names
  if (domain.includes('.')) return null;
  if (['index', 'utils', 'helpers', 'types', 'constants'].includes(domain)) return null;

  return domain;
}

// ─── Operation Detection ────────────────────────────────────────────────────

export function detectOperations(
  text: string,
  scope: TaskScope,
): Array<{ type: OperationType; weight: number }> {
  const opScores = new Map<OperationType, number>();

  for (const [op, keywords] of Object.entries(OPERATION_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score++;
    }
    if (score > 0) opScores.set(op as OperationType, score);
  }

  // Scope signals: if filesWrite has new files vs modifying existing
  if (scope.filesWrite.length > 0 && scope.filesRead.length === 0) {
    opScores.set('create', (opScores.get('create') ?? 0) + 1);
  }
  if (scope.filesWrite.length > 0 && scope.filesRead.length > 0) {
    opScores.set('modify', (opScores.get('modify') ?? 0) + 1);
  }

  const total = [...opScores.values()].reduce((sum, s) => sum + s, 0) || 1;
  return [...opScores.entries()]
    .map(([type, score]) => ({ type, weight: Math.round((score / total) * 100) / 100 }))
    .sort((a, b) => b.weight - a.weight);
}

// ─── Complexity Analysis ────────────────────────────────────────────────────

export function analyzeComplexity(scope: TaskScope): TaskDNA['complexity'] {
  const fileCount = scope.filesWrite.length;

  // Count unique top-level modules from directories
  const modules = new Set<string>();
  for (const dir of scope.directories) {
    const cleaned = dir.replace(/^(src|tests|test|lib)\//, '');
    const topModule = cleaned.split('/')[0];
    if (topModule) modules.add(topModule);
  }
  const moduleCount = modules.size;

  const crossCutting = moduleCount >= 2;

  let estimatedSize: TaskSize;
  if (fileCount <= 1 && moduleCount <= 1) {
    estimatedSize = 'trivial';
  } else if (fileCount <= 2 && moduleCount <= 1) {
    estimatedSize = 'small';
  } else if (fileCount <= 5 && moduleCount <= 2) {
    estimatedSize = 'medium';
  } else if (fileCount <= 10 || moduleCount <= 3) {
    estimatedSize = 'large';
  } else {
    estimatedSize = 'epic';
  }

  return { fileCount, moduleCount, crossCutting, estimatedSize };
}

// ─── Write Scope Analysis ───────────────────────────────────────────────────

export function analyzeWriteScope(scope: TaskScope): TaskDNA['scope'] {
  const writes = scope.filesWrite;
  const total = writes.length || 1;

  // Count writes per top-level directory prefix
  const dirCounts = new Map<string, number>();
  let testWrites = 0;

  for (const file of writes) {
    // Extract top-level dir (e.g., "src/", "tests/", "docs/", "./" for root)
    const slash = file.indexOf('/');
    const prefix = slash >= 0 ? file.slice(0, slash + 1) : './';
    dirCounts.set(prefix, (dirCounts.get(prefix) ?? 0) + 1);

    // Count test files
    if (file.startsWith('tests/') || file.startsWith('test/') || file.includes('.test.') || file.includes('.spec.')) {
      testWrites++;
    }
  }

  const writeRatio: Record<string, number> = {};
  for (const [dir, count] of dirCounts) {
    writeRatio[dir] = Math.round((count / total) * 100) / 100;
  }

  // Primary write target = dir with most writes
  let primaryWriteTarget = '';
  let maxCount = 0;
  for (const [dir, count] of dirCounts) {
    if (count > maxCount) {
      maxCount = count;
      primaryWriteTarget = dir;
    }
  }

  // Also check directories if no filesWrite
  if (writes.length === 0 && scope.directories.length > 0) {
    // Use directories as fallback signal
    for (const dir of scope.directories) {
      const slash = dir.indexOf('/');
      const prefix = slash >= 0 ? dir.slice(0, slash + 1) : dir;
      if (prefix && !writeRatio[prefix]) {
        writeRatio[prefix] = 1 / scope.directories.length;
      }
    }
    primaryWriteTarget = scope.directories[0] ?? '';
  }

  return {
    writeRatio,
    primaryWriteTarget,
    testWriteRatio: Math.round((testWrites / total) * 100) / 100,
  };
}
