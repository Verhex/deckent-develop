// ═══ Coverage Adapters — language-aware test-file signal (WM-7) ══════════════
// deckent's coverage SCORING is vitest/v8-only (it cannot parse pytest/cargo/
// ctest output). So for the evaluation gate the useful, honest signals are:
//   (1) testFilePattern — did the task write a TEST file *in this stack's
//       convention*? (objective, git-verifiable — generalizes the TS-only
//       `.test.`/`.spec.` signal that ADR-070 used).
//   (2) isCoverageMeasurable — can deckent measure a coverage % at all? If not,
//       `coverage:null` is a MEASUREMENT GAP, not a quality failure → exempt.
// coverageCommand is the command a worker would RUN (fed to verify/prompt); we
// intentionally do NOT ship a per-tool coverage-% parser here (YAGNI — the gate
// exempts non-measurable stacks rather than pretending to score them).

import type { TechStackKind } from './work-model.js';
import { COVERAGE_MEASURABLE_STACKS } from './work-model.js';

export interface CoverageAdapter {
  stack: TechStackKind;
  /** Matches a path that is a TEST file in this stack's convention. */
  testFilePattern: RegExp;
  /** The command that produces a coverage report for this stack (verify/prompt). */
  coverageCommand?: string;
}

export const COVERAGE_ADAPTERS: Record<TechStackKind, CoverageAdapter> = {
  typescript: { stack: 'typescript', testFilePattern: /\.(test|spec)\.(ts|tsx|mts|cts|js|jsx)$/i, coverageCommand: 'npx vitest run --coverage' },
  javascript: { stack: 'javascript', testFilePattern: /\.(test|spec)\.(js|jsx|mjs|cjs)$/i, coverageCommand: 'npx vitest run --coverage' },
  python: { stack: 'python', testFilePattern: /(^|\/)(test_[^/]+|[^/]+_test)\.py$/i, coverageCommand: 'pytest --cov' },
  go: { stack: 'go', testFilePattern: /_test\.go$/i, coverageCommand: 'go test -cover ./...' },
  rust: { stack: 'rust', testFilePattern: /(^|\/)tests\/[^/]+\.rs$|_test\.rs$/i, coverageCommand: 'cargo tarpaulin' },
  java: { stack: 'java', testFilePattern: /(Test|Tests|IT)\.java$/, coverageCommand: 'mvn test jacoco:report' },
  kotlin: { stack: 'kotlin', testFilePattern: /(Test|Tests)\.kt$/, coverageCommand: 'gradle test' },
  csharp: { stack: 'csharp', testFilePattern: /(Test|Tests)\.cs$/, coverageCommand: 'dotnet test --collect:"XPlat Code Coverage"' },
  swift: { stack: 'swift', testFilePattern: /Tests?\.swift$/, coverageCommand: 'swift test --enable-code-coverage' },
  cpp: { stack: 'cpp', testFilePattern: /(_test|_tests|test_)\.(cc|cpp|cxx|c\+\+)$/i, coverageCommand: 'ctest --test-dir build' },
  c: { stack: 'c', testFilePattern: /(_test|test_)\.c$/i, coverageCommand: 'ctest --test-dir build' },
  ruby: { stack: 'ruby', testFilePattern: /(_spec|_test)\.rb$/i, coverageCommand: 'bundle exec rspec' },
  php: { stack: 'php', testFilePattern: /Test\.php$/, coverageCommand: 'vendor/bin/phpunit --coverage-text' },
  dart: { stack: 'dart', testFilePattern: /_test\.dart$/i, coverageCommand: 'dart test --coverage' },
  generic: { stack: 'generic', testFilePattern: /\.(test|spec)\./i },
};

export function getCoverageAdapter(stack: TechStackKind): CoverageAdapter {
  return COVERAGE_ADAPTERS[stack] ?? COVERAGE_ADAPTERS.generic;
}

/** True when deckent can natively MEASURE a coverage % for this stack (vitest/v8). */
export function isCoverageMeasurable(stack: TechStackKind): boolean {
  return COVERAGE_MEASURABLE_STACKS.has(stack);
}

/**
 * Signal: did any changed file look like a TEST file for this stack? Generalizes
 * the ADR-070 `.test.`/`.spec.` signal to every language (Go `_test.go`, Python
 * `test_*.py`, Rust `tests/`, …). Objective + git-verifiable.
 */
export function wroteTestsForStack(filesChanged: string[] | undefined, stack: TechStackKind): boolean {
  if (!filesChanged || filesChanged.length === 0) return false;
  const pat = getCoverageAdapter(stack).testFilePattern;
  return filesChanged.some((f) => pat.test(f));
}

// ─── Extension → stack inference (signal-based, no project-root threading) ───
const EXT_TO_STACK: Record<string, TechStackKind> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.cc': 'cpp', '.cpp': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hh': 'cpp',
  '.c': 'c', '.h': 'c',
  '.rb': 'ruby',
  '.php': 'php',
  '.dart': 'dart',
};

/**
 * Infer the dominant {@link TechStackKind} from a set of changed files by their
 * extensions. Signal-based (uses only `filesChanged`, no project-root threading)
 * so it composes into the evaluation gate. Returns `'generic'` when no source
 * extension is recognised.
 */
export function inferStackFromFiles(filesChanged: string[] | undefined): TechStackKind {
  if (!filesChanged || filesChanged.length === 0) return 'generic';
  const counts = new Map<TechStackKind, number>();
  for (const f of filesChanged) {
    const dot = f.lastIndexOf('.');
    if (dot < 0) continue;
    const stack = EXT_TO_STACK[f.slice(dot).toLowerCase()];
    if (stack) counts.set(stack, (counts.get(stack) ?? 0) + 1);
  }
  let best: TechStackKind = 'generic';
  let bestN = 0;
  for (const [stack, n] of counts) {
    if (n > bestN) {
      best = stack;
      bestN = n;
    }
  }
  return best;
}
