// ─── CI Learning — Sprint-to-Sprint Learning ───────────────────────────────
// Analyzes CI reports across sprints to detect failure patterns,
// generate proactive suggestions, and recommend config changes.

import { join } from 'node:path';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { BRAIN_DIR } from './constants.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single CI report read from .brain/ci-report-{sprintId}.json */
export interface CiReportData {
  sprintId: string;
  baseline: { testCount: number; coverage: number };
  result: {
    testCount: number;
    testPassed: number;
    testFailed: number;
    coverage: number;
  };
  delta: {
    newTests: number;
    regressions: number;
    coverageDelta: number;
  };
  tscPassed: boolean;
  buildPassed: boolean;
  timestamp: string;
}

/** A file that frequently causes regressions */
export interface RegressionHotspot {
  file: string;
  regressionCount: number;
  sprintIds: string[];
}

/** A detected failure pattern across sprints */
export interface FailurePattern {
  category: 'tsc' | 'test' | 'coverage' | 'build' | 'regression';
  description: string;
  occurrences: number;
  sprintIds: string[];
  severity: 'low' | 'medium' | 'high';
}

/** A proactive suggestion based on detected patterns */
export interface CiSuggestion {
  type: 'warning' | 'recommendation' | 'config';
  message: string;
  basedOn: string;
  priority: 'low' | 'medium' | 'high';
}

/** Config change suggestion */
export interface ConfigSuggestion {
  key: string;
  currentValue?: unknown;
  suggestedValue: unknown;
  reason: string;
}

/** Full CI learning analysis result */
export interface CiLearningResult {
  reports: CiReportData[];
  patterns: FailurePattern[];
  suggestions: CiSuggestion[];
  configSuggestions: ConfigSuggestion[];
  summary: string;
}

// ─── Report Reading ─────────────────────────────────────────────────────────

/**
 * Read all CI reports from .brain/ directory, sorted by sprint ID.
 * Returns at most `maxSprints` most recent reports.
 */
export function readCiReports(projectRoot: string, maxSprints = 5): CiReportData[] {
  const brainDir = join(projectRoot, BRAIN_DIR);
  if (!existsSync(brainDir)) return [];

  let files: string[];
  try {
    files = readdirSync(brainDir)
      .filter(f => f.startsWith('ci-report-') && f.endsWith('.json'))
      .sort()
      .slice(-maxSprints);
  } catch {
    return [];
  }

  const reports: CiReportData[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(brainDir, file), 'utf-8');
      const data = JSON.parse(raw) as Partial<CiReportData>;
      if (data.sprintId && data.result) {
        reports.push({
          sprintId: data.sprintId,
          baseline: data.baseline ?? { testCount: 0, coverage: 0 },
          result: {
            testCount: data.result.testCount ?? 0,
            testPassed: data.result.testPassed ?? 0,
            testFailed: data.result.testFailed ?? 0,
            coverage: data.result.coverage ?? 0,
          },
          delta: data.delta ?? { newTests: 0, regressions: 0, coverageDelta: 0 },
          tscPassed: data.tscPassed ?? true,
          buildPassed: data.buildPassed ?? true,
          timestamp: data.timestamp ?? '',
        });
      }
    } catch { /* skip malformed */ }
  }

  return reports;
}

// ─── Failure Pattern Detection ──────────────────────────────────────────────

/**
 * Detect failure patterns from CI reports.
 * Analyzes tsc failures, test regressions, coverage drops, and build failures.
 */
export function detectFailurePatterns(reports: CiReportData[]): FailurePattern[] {
  const patterns: FailurePattern[] = [];
  if (reports.length === 0) return patterns;

  // TSC failure pattern
  const tscFailSprints = reports.filter(r => !r.tscPassed);
  if (tscFailSprints.length > 0) {
    patterns.push({
      category: 'tsc',
      description: `tsc --noEmit failed in ${tscFailSprints.length}/${reports.length} sprint(s)`,
      occurrences: tscFailSprints.length,
      sprintIds: tscFailSprints.map(r => r.sprintId),
      severity: tscFailSprints.length >= 3 ? 'high' : tscFailSprints.length >= 2 ? 'medium' : 'low',
    });
  }

  // Test regression pattern
  const regressionSprints = reports.filter(r => r.delta.regressions > 0);
  if (regressionSprints.length > 0) {
    const totalRegressions = regressionSprints.reduce((sum, r) => sum + r.delta.regressions, 0);
    patterns.push({
      category: 'regression',
      description: `${totalRegressions} total regression(s) across ${regressionSprints.length} sprint(s)`,
      occurrences: totalRegressions,
      sprintIds: regressionSprints.map(r => r.sprintId),
      severity: totalRegressions >= 5 ? 'high' : totalRegressions >= 2 ? 'medium' : 'low',
    });
  }

  // Coverage drop pattern
  const coverageDropSprints = reports.filter(r => r.delta.coverageDelta < -0.5);
  if (coverageDropSprints.length > 0) {
    const totalDrop = coverageDropSprints.reduce((sum, r) => sum + r.delta.coverageDelta, 0);
    patterns.push({
      category: 'coverage',
      description: `Coverage dropped in ${coverageDropSprints.length} sprint(s) (total: ${totalDrop.toFixed(1)}%)`,
      occurrences: coverageDropSprints.length,
      sprintIds: coverageDropSprints.map(r => r.sprintId),
      severity: Math.abs(totalDrop) >= 3 ? 'high' : Math.abs(totalDrop) >= 1 ? 'medium' : 'low',
    });
  }

  // Build failure pattern
  const buildFailSprints = reports.filter(r => !r.buildPassed);
  if (buildFailSprints.length > 0) {
    patterns.push({
      category: 'build',
      description: `Build failed in ${buildFailSprints.length}/${reports.length} sprint(s)`,
      occurrences: buildFailSprints.length,
      sprintIds: buildFailSprints.map(r => r.sprintId),
      severity: buildFailSprints.length >= 2 ? 'high' : 'medium',
    });
  }

  // Test count decline (no new tests added for consecutive sprints)
  const noNewTestSprints = reports.filter(r => r.delta.newTests === 0);
  if (noNewTestSprints.length >= 3) {
    patterns.push({
      category: 'test',
      description: `No new tests added in ${noNewTestSprints.length} consecutive sprint(s)`,
      occurrences: noNewTestSprints.length,
      sprintIds: noNewTestSprints.map(r => r.sprintId),
      severity: 'medium',
    });
  }

  return patterns;
}

// ─── Proactive Suggestions ──────────────────────────────────────────────────

/**
 * Generate proactive suggestions based on detected patterns and CI report trends.
 */
export function generateSuggestions(
  reports: CiReportData[],
  patterns: FailurePattern[],
): CiSuggestion[] {
  const suggestions: CiSuggestion[] = [];
  if (reports.length === 0) return suggestions;

  // TSC-related suggestions
  const tscPattern = patterns.find(p => p.category === 'tsc');
  if (tscPattern && tscPattern.occurrences >= 2) {
    suggestions.push({
      type: 'warning',
      message: `tsc --noEmit has failed in ${tscPattern.occurrences} recent sprint(s) — consider running tsc before each task`,
      basedOn: `TSC failures in ${tscPattern.sprintIds.join(', ')}`,
      priority: 'high',
    });
  }

  // Regression suggestions
  const regressionPattern = patterns.find(p => p.category === 'regression');
  if (regressionPattern && regressionPattern.occurrences >= 2) {
    suggestions.push({
      type: 'warning',
      message: 'Multiple regressions detected — ensure mock updates when adding new exports',
      basedOn: `${regressionPattern.occurrences} regression(s) in ${regressionPattern.sprintIds.join(', ')}`,
      priority: 'high',
    });
  }

  // Coverage decline suggestions
  const coveragePattern = patterns.find(p => p.category === 'coverage');
  if (coveragePattern) {
    suggestions.push({
      type: 'recommendation',
      message: 'Coverage is declining — enforce test requirements for new code changes',
      basedOn: `Coverage drops in ${coveragePattern.sprintIds.join(', ')}`,
      priority: coveragePattern.severity === 'high' ? 'high' : 'medium',
    });
  }

  // Coverage trend analysis from reports
  if (reports.length >= 2) {
    const first = reports[0]!;
    const last = reports[reports.length - 1]!;
    const coverageDelta = last.result.coverage - first.result.coverage;

    if (coverageDelta < -2) {
      suggestions.push({
        type: 'warning',
        message: `Coverage dropped from ${first.result.coverage.toFixed(1)}% to ${last.result.coverage.toFixed(1)}% — test writing discipline needed`,
        basedOn: `Coverage trend across ${reports.length} sprints`,
        priority: 'high',
      });
    } else if (coverageDelta > 2) {
      suggestions.push({
        type: 'recommendation',
        message: `Coverage improved from ${first.result.coverage.toFixed(1)}% to ${last.result.coverage.toFixed(1)}% — keep up the good work`,
        basedOn: `Coverage trend across ${reports.length} sprints`,
        priority: 'low',
      });
    }
  }

  // Build failure suggestions
  const buildPattern = patterns.find(p => p.category === 'build');
  if (buildPattern) {
    suggestions.push({
      type: 'warning',
      message: 'Build failures detected — verify tsc compilation before marking tasks done',
      basedOn: `Build failures in ${buildPattern.sprintIds.join(', ')}`,
      priority: 'high',
    });
  }

  // No new tests suggestion
  const testPattern = patterns.find(p => p.category === 'test');
  if (testPattern) {
    suggestions.push({
      type: 'recommendation',
      message: 'No new tests added in recent sprints — consider making test creation mandatory for new features',
      basedOn: `No new tests in ${testPattern.sprintIds.join(', ')}`,
      priority: 'medium',
    });
  }

  return suggestions;
}

// ─── Config Suggestions ─────────────────────────────────────────────────────

/**
 * Generate config change suggestions based on detected patterns and reports.
 */
export function generateConfigSuggestions(
  reports: CiReportData[],
  patterns: FailurePattern[],
): ConfigSuggestion[] {
  const suggestions: ConfigSuggestion[] = [];
  if (reports.length === 0) return suggestions;

  // High regression rate → block on test fail
  const regressionPattern = patterns.find(p => p.category === 'regression');
  if (regressionPattern && regressionPattern.severity === 'high') {
    suggestions.push({
      key: 'ci_guardian.block_on_test_fail',
      suggestedValue: true,
      reason: `${regressionPattern.occurrences} regressions detected — blocking on test failure would prevent regressions from accumulating`,
    });
  }

  // Coverage declining → set minimum coverage
  const coveragePattern = patterns.find(p => p.category === 'coverage');
  if (coveragePattern && coveragePattern.severity !== 'low') {
    // Find the lowest coverage in recent reports
    const minCoverage = Math.min(...reports.map(r => r.result.coverage));
    const suggestedMin = Math.max(Math.floor(minCoverage) - 2, 80);
    suggestions.push({
      key: 'ci_guardian.min_coverage',
      suggestedValue: suggestedMin,
      reason: `Coverage declined in ${coveragePattern.occurrences} sprint(s) — setting a floor of ${suggestedMin}% prevents further drops`,
    });
  }

  // Repeated TSC failures → ensure block_on_tsc_fail is enabled
  const tscPattern = patterns.find(p => p.category === 'tsc');
  if (tscPattern && tscPattern.occurrences >= 2) {
    suggestions.push({
      key: 'ci_guardian.block_on_tsc_fail',
      suggestedValue: true,
      reason: `tsc failed in ${tscPattern.occurrences} sprint(s) — ensure sprint is blocked on tsc failure`,
    });
  }

  // All green for many sprints → can relax pre-sprint check
  const allGreen = reports.every(r => r.tscPassed && r.buildPassed && r.delta.regressions === 0);
  if (allGreen && reports.length >= 3) {
    suggestions.push({
      key: 'ci_guardian.pre_sprint_check',
      currentValue: true,
      suggestedValue: true,
      reason: `All ${reports.length} recent sprints passed CI — pre-sprint checks are working well, keep them enabled`,
    });
  }

  return suggestions;
}

// ─── MEMORY.md Integration ──────────────────────────────────────────────────

/**
 * Build a CI Learnings line for MEMORY.md from a CI report.
 * Format: "Sprint 062: 85 new tests, 0 regressions, mock update pattern detected"
 */
export function buildCiLearningLine(report: CiReportData, patterns: FailurePattern[]): string {
  const parts: string[] = [];

  // New tests
  parts.push(`${report.delta.newTests} new tests`);

  // Regressions
  parts.push(`${report.delta.regressions} regressions`);

  // Coverage delta
  if (report.delta.coverageDelta !== 0) {
    const sign = report.delta.coverageDelta > 0 ? '+' : '';
    parts.push(`coverage ${sign}${report.delta.coverageDelta.toFixed(1)}%`);
  }

  // TSC status
  if (!report.tscPassed) {
    parts.push('tsc failed');
  }

  // Detected patterns for this sprint
  const sprintPatterns = patterns.filter(p => p.sprintIds.includes(report.sprintId));
  for (const p of sprintPatterns.slice(0, 2)) {
    if (p.category === 'regression') {
      parts.push('regression pattern detected');
    } else if (p.category === 'coverage') {
      parts.push('coverage decline detected');
    }
  }

  return `- ${report.sprintId}: ${parts.join(', ')}`;
}

/**
 * Build a full CI Learnings section for MEMORY.md.
 */
export function buildCiLearningsSection(reports: CiReportData[], patterns: FailurePattern[]): string {
  if (reports.length === 0) return '';

  const lines: string[] = ['## CI Learnings'];
  for (const report of reports) {
    lines.push(buildCiLearningLine(report, patterns));
  }
  return lines.join('\n');
}

// ─── Full Analysis ──────────────────────────────────────────────────────────

/**
 * Run the full CI learning analysis.
 * Reads CI reports, detects patterns, generates suggestions and config recommendations.
 */
export function analyzeCiLearnings(projectRoot: string, maxSprints = 5): CiLearningResult {
  const reports = readCiReports(projectRoot, maxSprints);
  const patterns = detectFailurePatterns(reports);
  const suggestions = generateSuggestions(reports, patterns);
  const configSuggestions = generateConfigSuggestions(reports, patterns);

  // Build summary
  const summaryParts: string[] = [];
  if (reports.length === 0) {
    summaryParts.push('No CI reports found');
  } else {
    summaryParts.push(`Analyzed ${reports.length} sprint CI report(s)`);
    if (patterns.length > 0) {
      summaryParts.push(`${patterns.length} pattern(s) detected`);
    }
    if (suggestions.length > 0) {
      summaryParts.push(`${suggestions.length} suggestion(s) generated`);
    }
    if (configSuggestions.length > 0) {
      summaryParts.push(`${configSuggestions.length} config change(s) recommended`);
    }
  }

  return {
    reports,
    patterns,
    suggestions,
    configSuggestions,
    summary: summaryParts.join('. ') + '.',
  };
}

/**
 * Write CI learning results to a JSON file for later reference.
 * Saved to .brain/ci-learnings.json.
 */
export function writeCiLearnings(projectRoot: string, result: CiLearningResult): void {
  const brainDir = join(projectRoot, BRAIN_DIR);
  const filePath = join(brainDir, 'ci-learnings.json');

  const serializable = {
    analyzedAt: new Date().toISOString(),
    reportCount: result.reports.length,
    sprintIds: result.reports.map(r => r.sprintId),
    patterns: result.patterns,
    suggestions: result.suggestions,
    configSuggestions: result.configSuggestions,
    summary: result.summary,
  };

  try {
    writeFileSync(filePath, JSON.stringify(serializable, null, 2), 'utf-8');
  } catch {
    // Non-fatal — log to stderr
    process.stderr.write('[ci-learning] Failed to write ci-learnings.json\n');
  }
}
