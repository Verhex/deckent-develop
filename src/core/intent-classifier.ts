// ─── Intent Classifier ──────────────────────────────────────────────────────
// Layer 1: Classify task intent from scope/description into TaskDNA.
// Replaces the broken detectTaskType() with weighted, multi-signal analysis.

import { containsWord } from './word-match.js';
import type { TaskScope } from './task-types.js';
import type { TaskDNA, IntentType, SubIntentType, OperationType, TaskSize } from './routing-types.js';

// ─── Intent Keywords ────────────────────────────────────────────────────────

const INTENT_KEYWORDS: Record<IntentType, string[]> = {
  security: ['security', 'auth', 'authentication', 'jwt', 'csrf', 'xss', 'injection', 'vulnerability', 'encryption', 'owasp', 'permission', 'acl', 'rbac'],
  // ROUTE-W1 (Sprint 303): 'wire'/'runtime' dropped — they signal integration/implementation
  // ("wire X into the runtime loop"), not a defect, and were pulling refactor/impl tasks to
  // bug-fixer. 'broken' stays (a genuine bug signal) but is context-gated by the
  // refactor-to-spec block in detectPrimaryIntent (a spelled-out structural edit suppresses bugfix).
  bugfix: ['fix', 'bug', 'error', 'crash', 'regression', 'broken', 'issue', 'defect', 'patch', 'hotfix'],
  // 'testing' removed as primary intent — Sprint 148 taxonomy reform
  // Test work is now tracked via 'test-coverage' tag in TaskDNA.tags
  refactor: ['refactor', 'cleanup', 'restructure', 'simplify', 'extract', 'split', 'merge', 'consolidate', 'rename', 'reorganize'],
  documentation: ['doc', 'documentation', 'doc update', 'readme', 'changelog', 'comment', 'jsdoc', 'guide', 'tutorial', 'api doc', 'güncelleme', 'dokümantasyon'],
  performance: ['performance', 'optimize', 'speed', 'latency', 'cache', 'profil', 'benchmark', 'bottleneck', 'memory leak'],
  design: ['ui', 'ux', 'layout', 'component', 'style', 'css', 'theme', 'responsive', 'animation'],
  devops: ['ci', 'cd', 'pipeline', 'deploy', 'docker', 'kubernetes', 'workflow', 'github actions', 'infrastructure'],
  config: ['config', 'setting', 'env', 'environment', 'option', 'flag', 'parameter'],
  migration: ['migrate', 'migration', 'upgrade', 'version', 'schema', 'transform', 'convert'],
  architecture: ['architecture', 'adr', 'design pattern', 'roadmap', 'system design', 'module structure', 'dependency graph'],
  implementation: ['implement', 'add', 'create', 'build', 'feature', 'endpoint', 'command', 'module', 'function', 'adaptive', 'timeout', 'estimator', 'engine', 'validator', 'types'],
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
  // devops: CI configs (.github/, ci/, .circleci/) + container/orchestration assets
  { pattern: /^\.github\/|^ci\/|^\.circleci/i, intent: 'devops', weight: 3 },
  { pattern: /(^|\/)docker\/|Dockerfile|(^|\/)k8s\/|(^|\/)kubernetes\/|(^|\/)helm\//i, intent: 'devops', weight: 3 },
  // security: weight 3 (was 2) so a security-scoped task beats the implementation-default fallback
  { pattern: /security|(^|\/)auth\//i, intent: 'security', weight: 3 },
  // design / frontend: dashboard, components, frontend, ui paths
  { pattern: /(^|\/)dashboard\/|(^|\/)components?\/|(^|\/)frontend\/|(^|\/)ui\//i, intent: 'design', weight: 4 },
  // data / migration: db, models, schema paths — closest existing IntentType is 'migration';
  // data-engineer agent also activates via domains.$contains('database')
  { pattern: /(^|\/)db\/|(^|\/)database\/|(^|\/)models?\/|(^|\/)schemas?\//i, intent: 'migration', weight: 2 },
  { pattern: /docs?\//i, intent: 'documentation', weight: 2 },
  { pattern: /\.md$/i, intent: 'documentation', weight: 2 }, // .md file writes signal documentation
  { pattern: /test/i, intent: 'implementation', weight: 1 }, // test scope → implementation (test-coverage tag added separately)
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
  const tags = detectTags(scope);
  const subIntent = detectSubIntent(text, scope, primaryResult.intent);

  return {
    intent: {
      primary: primaryResult.intent,
      secondary,
      confidence: primaryResult.confidence,
    },
    subIntent,
    tags,
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
      // U1-G1 (PCOMP-8): word-boundary matching — raw includes() let 'ci'
      // match inside "içindeki" and 'cd' inside a flowId hex (A1-İz#2).
      if (containsWord(text, kw)) score += 2;
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

  // ROUTE-1 B1: a comment / code-structure SWEEP is a refactor operation — not a
  // documentation edit (authoring prose) and not a feature build. A touch-up verb
  // co-occurring with a code-structure noun scores refactor ≥ 4 so it (a) trips the
  // hasStrongNonImplSignal gate below — suppressing the generic src/-write
  // implementation boost — and (b) outranks the bare `comment` documentation hit.
  const CLEANUP_VERB = /\b(clean(?:up)?|stale|dead|remove|delete|rename|simplif\w+|tidy|sweep|prune|dedupe|deduplicate)\b/;
  const CODE_STRUCT_NOUN = /\b(comments?|jsdoc|imports?|whitespace|formatting|lint|unused)\b/;
  if (CLEANUP_VERB.test(text) && CODE_STRUCT_NOUN.test(text)) {
    const r = scores.find((s) => s.intent === 'refactor');
    if (r) r.score += 4;
    else scores.push({ intent: 'refactor', score: 4 });
  }

  // ROUTE-W1: a refactor-to-spec task spells out BOTH the operation AND the target
  // structure (e.g. "remove the threshold branch → use a waitMs ternary; add the string to
  // a Set"). Root-cause + fix are already given, so this is a mechanical structural edit —
  // NOT a bug investigation (5-Whys / bisect would be dead-weight). When an operation verb
  // co-occurs with a code-structure noun on a SMALL scope (1–2 writes), boost refactor (≥4
  // trips the hasStrongNonImplSignal gate below AND outranks an incidental bugfix hit) and
  // suppress any incidental bugfix score so a stray 'broken'/'fix' token cannot pull a
  // spelled-out structural edit to bug-fixer.
  const REFACTOR_OP_VERB = /\b(remove|delete|clean(?:up)?|simplif\w+|replace|inline|extract|collapse|consolidate)\b/;
  const STRUCT_NOUN = /\b(ternary|loop|set|map|object|array|switch|enum)\b/;
  const isRefactorToSpec =
    REFACTOR_OP_VERB.test(text) &&
    STRUCT_NOUN.test(text) &&
    scope.filesWrite.length >= 1 &&
    scope.filesWrite.length <= 2;
  if (isRefactorToSpec) {
    const r = scores.find((s) => s.intent === 'refactor');
    if (r) r.score += 4;
    else scores.push({ intent: 'refactor', score: 4 });
    const b = scores.find((s) => s.intent === 'bugfix');
    if (b) b.score = Math.max(0, b.score - 4);
  }

  // CRITICAL FIX: Write ratio analysis prevents the detectTaskType ordering bug.
  // If most writes go to src/, it's implementation even if "test" keyword appears.
  // Sprint 209: gate the default-implementation boost so a strong scope signal
  // (security/design/devops/etc. with score ≥ 3) wins instead of being drowned
  // out by the implementation default. This is the key fix for routing
  // diversification — refactorer no longer rides the "everything is
  // implementation" fallback into every domain-specific task.
  const hasStrongNonImplSignal = scores.some(s => s.intent !== 'implementation' && s.score >= 3);
  if (
    !hasStrongNonImplSignal &&
    analysis.testWriteRatio < 0.3 &&
    analysis.writeRatio['src/'] !== undefined
  ) {
    // Most writes are source code — boost implementation
    const implScore = scores.find(s => s.intent === 'implementation');
    if (implScore) {
      implScore.score += 3;
    } else {
      scores.push({ intent: 'implementation', score: 3 });
    }
  }

  // If most writes are tests — boost implementation (test-coverage tag handles routing)
  if (analysis.testWriteRatio >= 0.5) {
    const implScore = scores.find(s => s.intent === 'implementation');
    if (implScore) {
      implScore.score += 2;
    } else {
      scores.push({ intent: 'implementation', score: 2 });
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

  const rounded = Math.round(confidence * 100) / 100;
  // U1-G1c (PCOMP-8): STRUCTURAL demotion for 'documentation' — a task whose
  // write targets are majority CODE files is not a documentation task no matter
  // what its prose says (word-boundary matching removed the substring noise
  // that used to inflate 'implementation' and mask this: real fixture — codex
  // CLI-adapter work with one docs/ file classified as documentation). Doc
  // stays primary only when doc-writes dominate (symmetric to the
  // testWriteRatio signal at the scope layer).
  if (top.intent === 'documentation') {
    const writes = scope.filesWrite;
    if (writes.length > 0) {
      const docWrites = writes.filter(f => /(^|\/)docs?\//.test(f) || /\.(md|mdx|rst|txt)$/i.test(f)).length;
      if (docWrites / writes.length < 0.5) {
      return { intent: 'implementation', confidence: rounded };
      }
    }
  }
  // U1-G1b (PCOMP-8): a LOW-CONFIDENCE specialist intent must not steer persona
  // routing — sprint-442's whole misroute chain started with a weak specialist
  // classification. Generic intents stay as-is (implementation is the safe
  // default the rest of the pipeline is calibrated for); specialists demote.
  const GENERIC_INTENTS = new Set(['implementation', 'refactor', 'unknown', 'bugfix']);
  if (rounded < 0.5 && !GENERIC_INTENTS.has(top.intent)) {
    return { intent: 'implementation', confidence: rounded };
  }
  return { intent: top.intent, confidence: rounded };
}

// ─── Secondary Intents ──────────────────────────────────────────────────────

export function detectSecondaryIntents(
  text: string,
  scope: TaskScope,
  primary: IntentType,
  scopeAnalysis?: TaskDNA['scope'],
): IntentType[] {
  // scopeAnalysis kept in signature for backward compat (callers may pass it)
  void scopeAnalysis;
  const secondary: IntentType[] = [];

  // Testing removed as primary/secondary intent (Sprint 148 taxonomy reform).
  // Test work is now indicated via 'test-coverage' tag in TaskDNA.tags.

  // If task touches docs but primary isn't documentation
  if (primary !== 'documentation') {
    const hasDocKeywords = INTENT_KEYWORDS.documentation.some(kw => containsWord(text, kw));
    const hasDocScope = scope.directories.some(d => d.includes('doc'));
    if (hasDocKeywords || hasDocScope) {
      secondary.push('documentation');
    }
  }

  // If task mentions security but primary isn't security
  if (primary !== 'security') {
    const hasSecKeywords = INTENT_KEYWORDS.security.some(kw => containsWord(text, kw));
    if (hasSecKeywords) secondary.push('security');
  }

  // If task mentions config/migration but primary isn't those
  if (primary !== 'config' && primary !== 'migration') {
    const hasConfigKeywords = INTENT_KEYWORDS.config.some(kw => containsWord(text, kw));
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
      if (containsWord(text, kw)) score++; // U1-G1: word-boundary (bkz. yukarı)
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

// ─── Sub-Intent Detection (V3) ─────────────────────────────────────────────

/**
 * V3 sub-intent detection for fine-grained routing within core-dev tasks.
 * Detects sub-domain from scope paths and description keywords.
 * Only applies when primary intent is 'implementation' (core-dev).
 */

const SUB_INTENT_SIGNALS: Array<{ pattern: RegExp; subIntent: SubIntentType }> = [
  { pattern: /types?\.ts|type-?defs?|interfaces?/i, subIntent: 'types' },
  { pattern: /config|settings?|defaults?|options?/i, subIntent: 'config' },
  { pattern: /rout(ing|er)|route/i, subIntent: 'routing' },
  { pattern: /observer|watch|monitor|nervous/i, subIntent: 'observer' },
  { pattern: /registry|registr(ies|ar)/i, subIntent: 'registry' },
  { pattern: /dispatch(er)?|notify|notification/i, subIntent: 'dispatcher' },
];

export function detectSubIntent(
  text: string,
  scope: TaskScope,
  primary: IntentType,
): SubIntentType | undefined {
  // Sub-intents only apply to implementation (core-dev) tasks
  if (primary !== 'implementation') return undefined;

  const allPaths = [...scope.directories, ...scope.filesWrite, ...scope.filesRead];
  const combined = `${text} ${allPaths.join(' ')}`.toLowerCase();

  // Score each sub-intent signal
  const scores = new Map<SubIntentType, number>();
  for (const signal of SUB_INTENT_SIGNALS) {
    const matches = combined.match(signal.pattern);
    if (matches) {
      scores.set(signal.subIntent, (scores.get(signal.subIntent) ?? 0) + 1);
    }
  }

  if (scores.size === 0) return undefined;

  // Return the highest-scoring sub-intent
  let best: SubIntentType | undefined;
  let bestScore = 0;
  for (const [subIntent, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      best = subIntent;
    }
  }

  return best;
}

// ─── Tag Detection ─────────────────────────────────────────────────────────

/**
 * Detect cross-cutting tags from scope analysis.
 * 'test-coverage' is added when the task touches test directories or test files.
 * This replaces the former 'testing' primary intent for routing purposes.
 */
export function detectTags(scope: TaskScope): string[] {
  const tags: string[] = [];

  const scopeHasTests = scope.directories.some(d =>
    d.startsWith('tests/') || d.startsWith('test/') || d === 'tests' || d === 'test',
  );
  const writesTest = scope.filesWrite.some(f =>
    f.endsWith('.test.ts') || f.endsWith('.spec.ts') || f.endsWith('.test.tsx'),
  );

  if (scopeHasTests || writesTest) {
    tags.push('test-coverage');
  }

  return tags;
}
