import { describe, it, expect } from 'vitest';
import {
  parseCoverageFromVitest,
  validateCoverage,
  isDocOnlyTask,
  validateWorkerCoverage,
} from '../../src/orchestra/coverage-validator.js';

// ─── Helpers ──────────────────────────────────────────────────────

function makeCoverageSummaryJson(lines: number, statements: number, functions: number, branches: number): string {
  return JSON.stringify({
    lines: { pct: lines, total: 100, covered: Math.round(lines) },
    statements: { pct: statements, total: 100, covered: Math.round(statements) },
    functions: { pct: functions, total: 50, covered: Math.round(functions / 2) },
    branches: { pct: branches, total: 80, covered: Math.round(branches * 0.8) },
  });
}

function makeTotalWrappedJson(lines: number, statements: number, functions: number, branches: number): string {
  return JSON.stringify({
    total: {
      lines: { pct: lines, total: 100, covered: Math.round(lines) },
      statements: { pct: statements, total: 100, covered: Math.round(statements) },
      functions: { pct: functions, total: 50, covered: Math.round(functions / 2) },
      branches: { pct: branches, total: 80, covered: Math.round(branches * 0.8) },
    },
  });
}

// ─── parseCoverageFromVitest ───────────────────────────────────────

describe('parseCoverageFromVitest', () => {
  it('returns null for empty string', () => {
    expect(parseCoverageFromVitest('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(parseCoverageFromVitest('   ')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseCoverageFromVitest('not json {')).toBeNull();
  });

  it('returns null for non-object JSON', () => {
    expect(parseCoverageFromVitest('42')).toBeNull();
    expect(parseCoverageFromVitest('"string"')).toBeNull();
    expect(parseCoverageFromVitest('null')).toBeNull();
  });

  it('parses direct coverage summary format', () => {
    const json = makeCoverageSummaryJson(85.5, 88.0, 90.0, 75.0);
    const result = parseCoverageFromVitest(json);
    expect(result).not.toBeNull();
    expect(result!.lineCoverage).toBe(85.5);
    expect(result!.statementCoverage).toBe(88.0);
    expect(result!.functionCoverage).toBe(90.0);
    expect(result!.branchCoverage).toBe(75.0);
  });

  it('calculates averageCoverage correctly', () => {
    const json = makeCoverageSummaryJson(80, 80, 80, 80);
    const result = parseCoverageFromVitest(json);
    expect(result!.averageCoverage).toBe(80);
  });

  it('parses total-wrapped format', () => {
    const json = makeTotalWrappedJson(92.0, 91.5, 89.0, 78.5);
    const result = parseCoverageFromVitest(json);
    expect(result).not.toBeNull();
    expect(result!.lineCoverage).toBe(92.0);
    expect(result!.statementCoverage).toBe(91.5);
    expect(result!.functionCoverage).toBe(89.0);
    expect(result!.branchCoverage).toBe(78.5);
  });

  it('parses coverage wrapped in coverage field', () => {
    const json = JSON.stringify({
      coverage: {
        lines: { pct: 77.5, total: 200, covered: 155 },
        statements: { pct: 79.0, total: 200, covered: 158 },
        functions: { pct: 85.0, total: 100, covered: 85 },
        branches: { pct: 70.0, total: 160, covered: 112 },
      },
    });
    const result = parseCoverageFromVitest(json);
    expect(result).not.toBeNull();
    expect(result!.lineCoverage).toBe(77.5);
  });

  it('returns null for JSON missing coverage fields', () => {
    const json = JSON.stringify({ testResults: [], numPassedTests: 5 });
    expect(parseCoverageFromVitest(json)).toBeNull();
  });

  it('returns null for partial coverage (missing branches)', () => {
    const json = JSON.stringify({
      lines: { pct: 80, total: 100, covered: 80 },
      statements: { pct: 80, total: 100, covered: 80 },
      // missing functions and branches
    });
    expect(parseCoverageFromVitest(json)).toBeNull();
  });

  it('handles 100% coverage correctly', () => {
    const json = makeCoverageSummaryJson(100, 100, 100, 100);
    const result = parseCoverageFromVitest(json);
    expect(result!.lineCoverage).toBe(100);
    expect(result!.averageCoverage).toBe(100);
  });

  it('handles 0% coverage correctly', () => {
    const json = makeCoverageSummaryJson(0, 0, 0, 0);
    const result = parseCoverageFromVitest(json);
    expect(result!.lineCoverage).toBe(0);
    expect(result!.averageCoverage).toBe(0);
  });

  it('exposes totals in result', () => {
    const json = makeCoverageSummaryJson(85, 88, 90, 75);
    const result = parseCoverageFromVitest(json);
    expect(result!.totals).toBeDefined();
    expect(result!.totals!.lines.pct).toBe(85);
  });

  it('parses coverageMap.data format', () => {
    const json = JSON.stringify({
      coverageMap: {
        data: {
          '/src/foo.ts': {
            statementMap: {
              '0': { start: { line: 1 }, end: { line: 1 } },
              '1': { start: { line: 2 }, end: { line: 2 } },
              '2': { start: { line: 3 }, end: { line: 3 } },
              '3': { start: { line: 4 }, end: { line: 4 } },
            },
            s: { '0': 1, '1': 1, '2': 0, '3': 0 }, // 2/4 = 50%
            fnMap: {
              '0': { name: 'foo' },
              '1': { name: 'bar' },
            },
            f: { '0': 1, '1': 0 }, // 1/2 = 50%
            branchMap: {
              '0': { type: 'if' },
            },
            b: { '0': [2, 0] }, // 1/2 = 50%
          },
        },
      },
    });
    const result = parseCoverageFromVitest(json);
    expect(result).not.toBeNull();
    expect(result!.statementCoverage).toBe(50);
    expect(result!.functionCoverage).toBe(50);
  });
});

// ─── validateCoverage ─────────────────────────────────────────────

describe('validateCoverage', () => {
  it('returns OK when reported matches actual exactly', () => {
    const result = validateCoverage(85, 85);
    expect(result.level).toBe('OK');
    expect(result.diff).toBe(0);
  });

  it('returns OK when diff is below threshold', () => {
    const result = validateCoverage(85, 83); // diff = 2, threshold = 5
    expect(result.level).toBe('OK');
    expect(result.diff).toBe(2);
  });

  it('returns OK when diff equals threshold exactly', () => {
    const result = validateCoverage(90, 85); // diff = 5, threshold = 5
    expect(result.level).toBe('OK');
  });

  it('returns WARNING when diff exceeds threshold', () => {
    const result = validateCoverage(90, 80); // diff = 10, threshold = 5
    expect(result.level).toBe('WARNING');
    expect(result.diff).toBe(10);
  });

  it('returns WARNING when reported is lower than actual by more than threshold', () => {
    const result = validateCoverage(70, 80); // diff = 10, threshold = 5
    expect(result.level).toBe('WARNING');
    expect(result.diff).toBe(10);
  });

  it('uses custom threshold when provided', () => {
    const result = validateCoverage(90, 82, 10); // diff = 8, threshold = 10 — OK
    expect(result.level).toBe('OK');
  });

  it('WARNING with custom threshold when exceeded', () => {
    const result = validateCoverage(90, 75, 10); // diff = 15, threshold = 10 — WARNING
    expect(result.level).toBe('WARNING');
  });

  it('includes reported and actual in result', () => {
    const result = validateCoverage(85.5, 80.0);
    expect(result.reported).toBe(85.5);
    expect(result.actual).toBe(80.0);
  });

  it('message includes coverage values', () => {
    const result = validateCoverage(90, 80);
    expect(result.message).toContain('90');
    expect(result.message).toContain('80');
  });

  it('handles edge case: both 0', () => {
    const result = validateCoverage(0, 0);
    expect(result.level).toBe('OK');
    expect(result.diff).toBe(0);
  });

  it('handles edge case: both 100', () => {
    const result = validateCoverage(100, 100);
    expect(result.level).toBe('OK');
    expect(result.diff).toBe(0);
  });
});

// ─── isDocOnlyTask ────────────────────────────────────────────────

describe('isDocOnlyTask', () => {
  it('returns false for src/ tasks', () => {
    expect(isDocOnlyTask({ directories: ['src/'] })).toBe(false);
  });

  it('returns false for tests/ tasks', () => {
    expect(isDocOnlyTask({ directories: ['tests/'] })).toBe(false);
  });

  it('returns false for lib/ tasks', () => {
    expect(isDocOnlyTask({ directories: ['lib/'] })).toBe(false);
  });

  it('returns true for docs/ only tasks', () => {
    expect(isDocOnlyTask({ directories: ['docs/'] })).toBe(true);
  });

  it('returns true for .brain/ only tasks', () => {
    expect(isDocOnlyTask({ directories: ['.brain/'] })).toBe(true);
  });

  it('returns true for README.md tasks', () => {
    expect(isDocOnlyTask({ directories: ['docs/', '.brain/'] })).toBe(true);
  });

  it('returns false when mixed src + docs', () => {
    expect(isDocOnlyTask({ directories: ['src/', 'docs/'] })).toBe(false);
  });

  it('returns false for empty directories', () => {
    expect(isDocOnlyTask({ directories: [] })).toBe(false);
  });

  it('returns true for src without trailing slash in non-src dir', () => {
    expect(isDocOnlyTask({ directories: ['documentation/'] })).toBe(true);
  });

  it('returns false for src without trailing slash', () => {
    expect(isDocOnlyTask({ directories: ['src'] })).toBe(false);
  });

  it('returns false for tests without trailing slash', () => {
    expect(isDocOnlyTask({ directories: ['tests'] })).toBe(false);
  });
});

// ─── validateWorkerCoverage ───────────────────────────────────────

describe('validateWorkerCoverage', () => {
  const srcScope = { directories: ['src/orchestra/'] };
  const docScope = { directories: ['docs/', '.brain/'] };

  it('returns null for doc-only tasks', () => {
    const result = validateWorkerCoverage({
      reportedCoverage: 0,
      vitestJsonOutput: makeCoverageSummaryJson(85, 88, 90, 75),
      taskScope: docScope,
    });
    expect(result).toBeNull();
  });

  it('returns OK with note when no vitest output provided', () => {
    const result = validateWorkerCoverage({
      reportedCoverage: 85,
      taskScope: srcScope,
    });
    expect(result).not.toBeNull();
    expect(result!.level).toBe('OK');
    expect(result!.message).toContain('No vitest JSON output');
  });

  it('returns WARNING when vitest JSON cannot be parsed', () => {
    const result = validateWorkerCoverage({
      reportedCoverage: 85,
      vitestJsonOutput: 'invalid json',
      taskScope: srcScope,
    });
    expect(result).not.toBeNull();
    expect(result!.level).toBe('WARNING');
    expect(result!.message).toContain('Could not parse');
  });

  it('returns OK when coverage matches within threshold', () => {
    const json = makeCoverageSummaryJson(85, 85, 85, 85);
    const result = validateWorkerCoverage({
      reportedCoverage: 85,
      vitestJsonOutput: json,
      taskScope: srcScope,
    });
    expect(result!.level).toBe('OK');
  });

  it('returns WARNING when coverage diverges by more than 5%', () => {
    const json = makeCoverageSummaryJson(70, 70, 70, 70);
    const result = validateWorkerCoverage({
      reportedCoverage: 90,
      vitestJsonOutput: json,
      taskScope: srcScope,
    });
    expect(result!.level).toBe('WARNING');
    expect(result!.diff).toBeGreaterThan(5);
  });

  it('uses custom threshold', () => {
    const json = makeCoverageSummaryJson(80, 80, 80, 80);
    const result = validateWorkerCoverage({
      reportedCoverage: 88,
      vitestJsonOutput: json,
      taskScope: srcScope,
      threshold: 10,
    });
    expect(result!.level).toBe('OK'); // diff = 8, threshold = 10
  });

  it('extracts line coverage from parsed vitest output for comparison', () => {
    const json = makeCoverageSummaryJson(75, 80, 85, 70);
    const result = validateWorkerCoverage({
      reportedCoverage: 75,
      vitestJsonOutput: json,
      taskScope: srcScope,
    });
    expect(result!.actual).toBe(75); // line coverage = 75
    expect(result!.level).toBe('OK');
  });
});
