// ─── Coverage Validator ────────────────────────────────────────────
// Validates worker self-reported coverage against actual vitest output.

import {
  resolveTaskPromptProfile,
  type TaskProfileConfig,
} from '../core/work-model.js';

export type CoverageWarningLevel = 'OK' | 'WARNING' | 'ERROR';

export interface CoverageResult {
  level: CoverageWarningLevel;
  reported: number;
  actual: number;
  diff: number;
  message: string;
}

export interface VitestCoverageData {
  pct: number;
  total: number;
  covered: number;
}

export interface VitestCoverageSummary {
  lines: VitestCoverageData;
  statements: VitestCoverageData;
  functions: VitestCoverageData;
  branches: VitestCoverageData;
}

export interface ParsedVitestOutput {
  /** Overall line coverage percentage (0-100) */
  lineCoverage: number;
  /** Overall statement coverage percentage (0-100) */
  statementCoverage: number;
  /** Overall function coverage percentage (0-100) */
  functionCoverage: number;
  /** Overall branch coverage percentage (0-100) */
  branchCoverage: number;
  /** Average of all four metrics */
  averageCoverage: number;
  /** Raw totals coverage summary if available */
  totals?: VitestCoverageSummary;
}

/**
 * Parses vitest --reporter=json output to extract coverage metrics.
 * Supports both v8 and istanbul coverage formats.
 */
export function parseCoverageFromVitest(jsonOutput: string): ParsedVitestOutput | null {
  if (!jsonOutput || jsonOutput.trim() === '') {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonOutput);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  // safe: parsed is confirmed non-null object by typeof check above
  const obj = parsed as Record<string, unknown>;

  // vitest --reporter=json --coverage format:
  // { coverageMap: { data: { ... } } } or { coverage: { ... } }
  // Also supports direct coverage summary format from @vitest/coverage-v8:
  // { total: { lines: { pct }, statements: { pct }, functions: { pct }, branches: { pct } } }

  // Try direct totals format (c8/istanbul summary)
  const totals = extractTotals(obj);
  if (totals) {
    const avg = (totals.lines.pct + totals.statements.pct + totals.functions.pct + totals.branches.pct) / 4;
    return {
      lineCoverage: totals.lines.pct,
      statementCoverage: totals.statements.pct,
      functionCoverage: totals.functions.pct,
      branchCoverage: totals.branches.pct,
      averageCoverage: Math.round(avg * 100) / 100,
      totals,
    };
  }

  // Try vitest JSON reporter format
  if ('coverageMap' in obj && obj.coverageMap && typeof obj.coverageMap === 'object') {
    // safe: coverageMap confirmed non-null object by typeof check on line above
    const coverageMap = obj.coverageMap as Record<string, unknown>;
    const summary = buildSummaryFromCoverageMap(coverageMap);
    if (summary) {
      const avg = (summary.lines.pct + summary.statements.pct + summary.functions.pct + summary.branches.pct) / 4;
      return {
        lineCoverage: summary.lines.pct,
        statementCoverage: summary.statements.pct,
        functionCoverage: summary.functions.pct,
        branchCoverage: summary.branches.pct,
        averageCoverage: Math.round(avg * 100) / 100,
        totals: summary,
      };
    }
  }

  // Try coverage field
  if ('coverage' in obj && obj.coverage && typeof obj.coverage === 'object') {
    // safe: coverage confirmed non-null object by typeof check on line above
    const coverage = obj.coverage as Record<string, unknown>;
    const summary = extractTotals(coverage);
    if (summary) {
      const avg = (summary.lines.pct + summary.statements.pct + summary.functions.pct + summary.branches.pct) / 4;
      return {
        lineCoverage: summary.lines.pct,
        statementCoverage: summary.statements.pct,
        functionCoverage: summary.functions.pct,
        branchCoverage: summary.branches.pct,
        averageCoverage: Math.round(avg * 100) / 100,
        totals: summary,
      };
    }
  }

  return null;
}

function isCoverageData(v: unknown): v is VitestCoverageData {
  if (!v || typeof v !== 'object') return false;
  // safe: v confirmed non-null object by typeof check above
  const obj = v as Record<string, unknown>;
  return typeof obj['pct'] === 'number' &&
    typeof obj['total'] === 'number' &&
    typeof obj['covered'] === 'number';
}

function extractTotals(obj: Record<string, unknown>): VitestCoverageSummary | null {
  // Direct format: { lines: { pct, total, covered }, ... }
  // safe: isCoverageData() is a type guard that validates pct/total/covered are numbers
  if (isCoverageData(obj['lines']) && isCoverageData(obj['statements']) &&
      isCoverageData(obj['functions']) && isCoverageData(obj['branches'])) {
    return {
      lines: obj['lines'],
      statements: obj['statements'],
      functions: obj['functions'],
      branches: obj['branches'],
    };
  }

  // Nested under 'total'
  if (obj['total'] && typeof obj['total'] === 'object') {
    // safe: confirmed non-null object by typeof check above
    const total = obj['total'] as Record<string, unknown>;
    // safe: isCoverageData() is a type guard that validates pct/total/covered are numbers
    if (isCoverageData(total['lines']) && isCoverageData(total['statements']) &&
        isCoverageData(total['functions']) && isCoverageData(total['branches'])) {
      return {
        lines: total['lines'],
        statements: total['statements'],
        functions: total['functions'],
        branches: total['branches'],
      };
    }
  }

  return null;
}

function buildSummaryFromCoverageMap(coverageMap: Record<string, unknown>): VitestCoverageSummary | null {
  // coverageMap.data is { [filePath]: fileCoverage }
  const data = coverageMap['data'];
  if (!data || typeof data !== 'object') return null;

  let totalLines = 0, coveredLines = 0;
  let totalStatements = 0, coveredStatements = 0;
  let totalFunctions = 0, coveredFunctions = 0;
  let totalBranches = 0, coveredBranches = 0;

  // safe: data confirmed non-null object by typeof check above
  for (const fileData of Object.values(data as Record<string, unknown>)) {
    if (!fileData || typeof fileData !== 'object') continue;
    // safe: fileData confirmed non-null object by typeof check above
    const fd = fileData as Record<string, unknown>;

    // safe: istanbul coverage format fields — optional, guarded by null checks below
    const s = fd['s'] as Record<string, number> | undefined;
    const f = fd['f'] as Record<string, number> | undefined;
    const b = fd['b'] as Record<string, number[]> | undefined;
    const statementMap = fd['statementMap'] as Record<string, unknown> | undefined;
    const fnMap = fd['fnMap'] as Record<string, unknown> | undefined;
    const branchMap = fd['branchMap'] as Record<string, unknown> | undefined;

    if (s && statementMap) {
      const stmtKeys = Object.keys(statementMap);
      totalStatements += stmtKeys.length;
      coveredStatements += stmtKeys.filter(k => (s[k] ?? 0) > 0).length;
    }

    if (f && fnMap) {
      const fnKeys = Object.keys(fnMap);
      totalFunctions += fnKeys.length;
      coveredFunctions += fnKeys.filter(k => (f[k] ?? 0) > 0).length;
    }

    if (b && branchMap) {
      for (const key of Object.keys(branchMap)) {
        const branches = b[key] ?? [];
        totalBranches += branches.length;
        coveredBranches += branches.filter(count => count > 0).length;
      }
    }

    // Lines: count distinct line numbers from statementMap
    if (statementMap && s) {
      const lineNums = new Set<number>();
      const coveredLineNums = new Set<number>();
      for (const [key, loc] of Object.entries(statementMap)) {
        // safe: istanbul statementMap entries have start.line structure; guarded by typeof check below
        const location = loc as Record<string, Record<string, number>> | undefined;
        const lineNum = location?.['start']?.['line'];
        if (typeof lineNum === 'number') {
          lineNums.add(lineNum);
          if ((s[key] ?? 0) > 0) coveredLineNums.add(lineNum);
        }
      }
      totalLines += lineNums.size;
      coveredLines += coveredLineNums.size;
    }
  }

  if (totalStatements === 0 && totalFunctions === 0) return null;

  const linePct = totalLines === 0 ? 100 : Math.round((coveredLines / totalLines) * 10000) / 100;
  const stmtPct = totalStatements === 0 ? 100 : Math.round((coveredStatements / totalStatements) * 10000) / 100;
  const fnPct = totalFunctions === 0 ? 100 : Math.round((coveredFunctions / totalFunctions) * 10000) / 100;
  const brPct = totalBranches === 0 ? 100 : Math.round((coveredBranches / totalBranches) * 10000) / 100;

  return {
    lines: { pct: linePct, total: totalLines, covered: coveredLines },
    statements: { pct: stmtPct, total: totalStatements, covered: coveredStatements },
    functions: { pct: fnPct, total: totalFunctions, covered: coveredFunctions },
    branches: { pct: brPct, total: totalBranches, covered: coveredBranches },
  };
}

/**
 * Validates reported coverage against actual vitest-measured coverage.
 * Returns WARNING if the difference exceeds threshold (default 5%).
 */
export function validateCoverage(
  reported: number,
  actual: number,
  threshold: number = 5,
): CoverageResult {
  const diff = Math.abs(reported - actual);

  if (diff > threshold) {
    return {
      level: 'WARNING',
      reported,
      actual,
      diff,
      message: `Coverage mismatch: reported ${reported.toFixed(1)}% vs actual ${actual.toFixed(1)}% (diff ${diff.toFixed(1)}% > ${threshold}% threshold)`,
    };
  }

  return {
    level: 'OK',
    reported,
    actual,
    diff,
    message: `Coverage validated: reported ${reported.toFixed(1)}% vs actual ${actual.toFixed(1)}% (diff ${diff.toFixed(1)}%)`,
  };
}

/**
 * Returns true if a task is documentation-only (no source code directories).
 * Doc tasks skip coverage validation.
 *
 * 593-002: the directory-prefix predicate no longer lives here — it is one branch
 * of the canonical {@link resolveTaskPromptProfile} classifier (`src/core/work-model.ts`),
 * shared with the prompt compiler. Passing ONLY the `directories` signal selects
 * exactly the legacy branch (no declared kind, no injected fallback), so the
 * classification is byte-for-byte the pre-593-002 one: an empty directory list is
 * not evidence of doc work → `'code'` → `false`.
 */
export function isDocOnlyTask(
  scope: { directories: string[] },
  taskProfiles?: Partial<TaskProfileConfig>,
): boolean {
  return resolveTaskPromptProfile(
    { scope: { directories: scope?.directories ?? [] } },
    taskProfiles,
  ) === 'doc-only';
}

/**
 * Full coverage validation pipeline for a worker result.
 * Parses vitest JSON output and compares with self-reported coverage.
 * Returns null if the task is doc-only (skip validation).
 */
export function validateWorkerCoverage(opts: {
  reportedCoverage: number;
  vitestJsonOutput?: string;
  taskScope: { directories: string[] };
  threshold?: number;
}): CoverageResult | null {
  const { reportedCoverage, vitestJsonOutput, taskScope, threshold = 5 } = opts;

  // Skip validation for doc-only tasks
  if (isDocOnlyTask(taskScope)) {
    return null;
  }

  // If no vitest JSON output, we can't validate — return OK with note
  if (!vitestJsonOutput) {
    return {
      level: 'OK',
      reported: reportedCoverage,
      actual: reportedCoverage,
      diff: 0,
      message: 'No vitest JSON output available for validation — trusting self-reported coverage',
    };
  }

  const parsed = parseCoverageFromVitest(vitestJsonOutput);
  if (!parsed) {
    return {
      level: 'WARNING',
      reported: reportedCoverage,
      actual: 0,
      diff: reportedCoverage,
      message: 'Could not parse vitest JSON output — coverage could not be validated',
    };
  }

  return validateCoverage(reportedCoverage, parsed.lineCoverage, threshold);
}
