// ─── Task Analyzer ─────────────────────────────────────────────────────────
// Analyzes task metadata to infer type, complexity, keywords, and duration.
import type { TaskScope } from '../core/types.js';
import type { TaskAnalysis, TaskType } from '../core/decision-types.js';

// ─── Keyword Pattern Maps ──────────────────────────────────────────────────

const TYPE_PATTERNS: Array<{ type: TaskType; patterns: RegExp }> = [
  { type: 'test',     patterns: /\b(tests?|spec|coverage|vitest|jest|unit\s*test|integration\s*test|e2e)\b/i },
  { type: 'doc',      patterns: /\b(doc|readme|changelog|guide|documentation|jsdoc|typedoc)\b/i },
  { type: 'security', patterns: /\b(security|auth|jwt|csrf|xss|sanitize|encrypt|credential|permission|rbac|oauth)\b/i },
  { type: 'refactor', patterns: /\b(refactor|rename|extract|split|cleanup|reorganize|decouple|migrate|consolidate)\b/i },
  { type: 'devops',   patterns: /\b(docker|ci|deploy|pipeline|github\s*actions|workflow|release|publish|k8s|kubernetes|helm)\b/i },
  { type: 'config',   patterns: /\b(config|settings|env|environment|\.env|dotenv|options|preferences)\b/i },
];

// ─── Keyword Extraction ────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'may', 'might', 'must', 'can', 'could',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
  'into', 'about', 'between', 'through', 'after', 'before', 'during',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'some', 'any',
  'no', 'if', 'then', 'than', 'when', 'where', 'how', 'what', 'which', 'who',
  'up', 'out', 'off', 'new', 'add', 'create', 'update', 'fix', 'implement',
]);

function extractKeywords(text: string): string[] {
  if (!text) return [];
  const tokens = text
    .toLowerCase()
    .split(/[\s\-_.,;:!?()[\]{}"'`/\\|@#$%^&*+=<>~]+/)
    .filter((t) => t.length >= 2)
    .filter((t) => !STOPWORDS.has(t));
  return [...new Set(tokens)];
}

// ─── Complexity Calculation ────────────────────────────────────────────────

const COMPLEXITY_KEYWORDS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b(architect|orchestrat|cross.?cutting|breaking)\b/i, weight: 2 },
  { pattern: /\b(integration|end.?to.?end|e2e|multi.?module)\b/i, weight: 1.5 },
  { pattern: /\b(migration|redesign|overhaul)\b/i, weight: 2 },
  { pattern: /\b(simple|trivial|minor|small)\b/i, weight: -1 },
  { pattern: /\b(stub|placeholder|skeleton)\b/i, weight: -0.5 },
];

function calculateScopeWeight(scope: TaskScope): number {
  const dirCount = scope.directories.length;
  const fileWriteCount = scope.filesWrite.length;
  const fileReadCount = scope.filesRead.length;
  return dirCount * 2 + fileWriteCount + fileReadCount * 0.5;
}

function calculateComplexity(text: string, scope: TaskScope): number {
  const dirCount = scope.directories.length;

  // Base from directory count: 0-3 dirs = low (1-3), 4-6 = medium (4-6), 7+ = high (7-9)
  let base: number;
  if (dirCount <= 3) {
    base = Math.max(1, dirCount);
  } else if (dirCount <= 6) {
    base = dirCount;
  } else {
    base = Math.min(9, dirCount);
  }

  // Keyword signals
  let kwAdjust = 0;
  for (const { pattern, weight } of COMPLEXITY_KEYWORDS) {
    if (pattern.test(text)) {
      kwAdjust += weight;
    }
  }

  // File write count bonus
  const fileBonus = scope.filesWrite.length > 10 ? 2 : scope.filesWrite.length > 5 ? 1 : 0;

  const raw = base + kwAdjust + fileBonus;
  return Math.max(0, Math.min(10, Math.round(raw)));
}

// ─── Duration Estimation ───────────────────────────────────────────────────

const BASE_DURATION_MS: Record<TaskType, number> = {
  code:     300_000,   // 5 min
  test:     180_000,   // 3 min
  doc:      120_000,   // 2 min
  security: 360_000,   // 6 min
  refactor: 300_000,   // 5 min
  devops:   240_000,   // 4 min
  config:   120_000,   // 2 min
};

function estimateDuration(type: TaskType, complexity: number): number {
  const base = BASE_DURATION_MS[type];
  // Scale by complexity: complexity 5 = 1x, 10 = 2x, 0 = 0.5x
  const multiplier = 0.5 + (complexity / 10) * 1.5;
  return Math.round(base * multiplier);
}

// ─── TaskAnalyzer ──────────────────────────────────────────────────────────

export class TaskAnalyzer {
  /**
   * Analyze a task to infer type, complexity, keywords, and estimated duration.
   */
  analyze(task: { title: string; description: string; scope: TaskScope }): TaskAnalysis {
    const text = `${task.title} ${task.description}`;
    const type = this.inferType(text);
    const complexity = calculateComplexity(text, task.scope);
    const keywords = extractKeywords(text);
    const scopeWeight = calculateScopeWeight(task.scope);
    const estimatedDurationMs = estimateDuration(type, complexity);

    return {
      type,
      complexity,
      keywords,
      scopeWeight,
      estimatedDurationMs,
    };
  }

  /**
   * Infer the task type from text using keyword pattern matching.
   * Returns 'code' as default if no pattern matches.
   */
  inferType(text: string): TaskType {
    for (const { type, patterns } of TYPE_PATTERNS) {
      if (patterns.test(text)) {
        return type;
      }
    }
    return 'code';
  }
}
