// ─── CI Reporter ─────────────────────────────────────────────────
// Extracted from sprint-reporter.ts — CI baseline, health, trend, learning integration
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  BRAIN_DIR, MEMORY_FILE, RETRO_FILE, MEMORY_MAX_LINES, RETRO_MAX_LINES,
} from '../core/constants.js';
import { debugLog } from '../core/utils.js';
import {
  analyzeCiLearnings,
  buildCiLearningsSection,
  writeCiLearnings,
  type CiLearningResult,
} from '../core/ci-learning.js';
import { trimMemoryWithHeader } from './sprint-retro-writer.js';

// ═══ CI Health RETRO Integration ══════════════════════════════════

/** A single CI trend data point from a sprint CI report */
export interface CiTrendEntry {
  sprintId: string;
  testCount: number;
  testFailed: number;
  coverage: number;
  tscPassed: boolean;
  timestamp: string;
}

/** CI trend analysis across multiple sprints */
export interface CiTrend {
  entries: CiTrendEntry[];
  testCountTrend: 'increasing' | 'decreasing' | 'stable';
  coverageTrend: 'increasing' | 'decreasing' | 'stable';
  totalRegressions: number;
}

/**
 * Read CI reports from the last N sprints and build trend data.
 * Reports are read from .brain/ci-report-*.json files.
 */
export function readCiReportTrend(projectRoot: string, maxSprints = 5): CiTrend {
  const brainDir = join(projectRoot, BRAIN_DIR);
  const empty: CiTrend = { entries: [], testCountTrend: 'stable', coverageTrend: 'stable', totalRegressions: 0 };
  if (!existsSync(brainDir)) return empty;

  let reportFiles: string[];
  try {
    reportFiles = readdirSync(brainDir)
      .filter(f => f.startsWith('ci-report-') && f.endsWith('.json'))
      .sort()
      .slice(-maxSprints);
  } catch (e) {
    debugLog('getCiTrend:readdirSync', e);
    return empty;
  }

  const entries: CiTrendEntry[] = [];
  for (const file of reportFiles) {
    try {
      const raw = readFileSync(join(brainDir, file), 'utf-8');
      const report = JSON.parse(raw) as {
        sprintId?: string;
        result?: { testCount?: number; testFailed?: number; coverage?: number };
        tscPassed?: boolean;
        timestamp?: string;
      };
      if (!report.sprintId || !report.result) continue;
      entries.push({
        sprintId: report.sprintId,
        testCount: report.result.testCount ?? 0,
        testFailed: report.result.testFailed ?? 0,
        coverage: report.result.coverage ?? 0,
        tscPassed: report.tscPassed ?? true,
        timestamp: report.timestamp ?? '',
      });
    } catch (e) { debugLog('getCiHistory:parseCiReport', e); }
  }

  const totalRegressions = entries.reduce((sum, e) => sum + e.testFailed, 0);

  if (entries.length < 2) {
    return { entries, testCountTrend: 'stable', coverageTrend: 'stable', totalRegressions };
  }

  const first = entries[0]!;
  const last = entries[entries.length - 1]!;

  const testDelta = last.testCount - first.testCount;
  const testCountTrend: CiTrend['testCountTrend'] =
    testDelta > 0 ? 'increasing' : testDelta < 0 ? 'decreasing' : 'stable';

  const coverageDelta = last.coverage - first.coverage;
  const coverageTrend: CiTrend['coverageTrend'] =
    coverageDelta > 0.5 ? 'increasing' : coverageDelta < -0.5 ? 'decreasing' : 'stable';

  return { entries, testCountTrend, coverageTrend, totalRegressions };
}

/**
 * Format a CI Health section for inclusion in RETRO.md.
 * Returns markdown lines including the "## CI Health" header and table.
 * Returns an empty array if report is null.
 */
export function formatCiHealthSection(report: {
  tscPassed: boolean;
  result: { testCount: number; testPassed: number; testFailed: number; coverage: number };
  delta: { newTests: number; regressions: number; coverageDelta: number };
  buildPassed: boolean;
} | null): string[] {
  if (!report) return [];

  const coverageSign = report.delta.coverageDelta >= 0 ? '+' : '';
  const coverageStr = `${report.result.coverage.toFixed(1)}% (${coverageSign}${report.delta.coverageDelta.toFixed(1)}%)`;
  const regressionLabel = report.delta.regressions === 0
    ? '0 regressions'
    : `${report.delta.regressions} regression${report.delta.regressions !== 1 ? 's' : ''}`;

  return [
    '',
    '## CI Health',
    '| What | Value |',
    '|------|-------|',
    `| tsc --noEmit | ${report.tscPassed ? 'PASS' : 'FAIL'} |`,
    `| Tests | ${report.result.testPassed}/${report.result.testCount} (${regressionLabel}) |`,
    `| New tests | +${report.delta.newTests} |`,
    `| Coverage | ${coverageStr} |`,
    `| Build | ${report.buildPassed ? 'PASS' : 'FAIL'} |`,
  ];
}

/**
 * Append a CI Health section to the existing RETRO.md file.
 * Reads the CI report for sprintId and appends a formatted markdown table.
 * Idempotent — skips if section already exists, retro file missing, or report not found.
 */
export function appendCiHealthToRetro(projectRoot: string, sprintId: string): void {
  const retroPath = join(projectRoot, BRAIN_DIR, RETRO_FILE);
  if (!existsSync(retroPath)) return;

  const reportPath = join(projectRoot, BRAIN_DIR, `ci-report-${sprintId}.json`);
  if (!existsSync(reportPath)) return;

  let report: {
    tscPassed: boolean;
    result: { testCount: number; testPassed: number; testFailed: number; coverage: number };
    delta: { newTests: number; regressions: number; coverageDelta: number };
    buildPassed: boolean;
  } | null = null;

  try {
    report = JSON.parse(readFileSync(reportPath, 'utf-8'));
  } catch (e) {
    debugLog('appendCiHealthSection:readReport', e);
    return;
  }

  const ciSection = formatCiHealthSection(report);
  if (ciSection.length === 0) return;

  const existing = readFileSync(retroPath, 'utf-8');
  if (existing.includes('## CI Health')) return; // Already has CI section

  const combined = existing.trimEnd() + '\n' + ciSection.join('\n') + '\n';
  const retroLines = combined.split('\n');
  writeFileSync(
    retroPath,
    retroLines.slice(0, RETRO_MAX_LINES).join('\n'),
    'utf-8',
  );
}

// ═══ CI Learning Integration ══════════════════════════════════════

/**
 * Run CI learning analysis and append CI Learnings section to MEMORY.md.
 * Called during sprint retrospective to capture cross-sprint CI insights.
 *
 * 1. Reads last N sprint CI reports
 * 2. Detects failure patterns
 * 3. Generates suggestions and config recommendations
 * 4. Writes ci-learnings.json to .brain/
 * 5. Appends CI Learnings section to MEMORY.md (idempotent)
 *
 * Non-fatal — errors are logged to stderr but never abort the sprint.
 */
export function runCiLearningAnalysis(projectRoot: string, maxSprints = 5): CiLearningResult | null {
  try {
    const result = analyzeCiLearnings(projectRoot, maxSprints);

    // Write analysis results to .brain/ci-learnings.json
    writeCiLearnings(projectRoot, result);

    // Append CI Learnings section to MEMORY.md
    if (result.reports.length > 0) {
      appendCiLearningsToMemory(projectRoot, result);
    }

    return result;
  } catch (err) {
    process.stderr.write(
      `[ci-learning] Analysis failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return null;
  }
}

/**
 * Append CI Learnings section to MEMORY.md.
 * Replaces existing "## CI Learnings" section if present.
 * Idempotent — safe to call multiple times.
 */
export function appendCiLearningsToMemory(projectRoot: string, result: CiLearningResult): void {
  const memoryPath = join(projectRoot, BRAIN_DIR, MEMORY_FILE);
  if (!existsSync(memoryPath)) return;

  const ciSection = buildCiLearningsSection(result.reports, result.patterns);
  if (!ciSection) return;

  const existing = readFileSync(memoryPath, 'utf-8');

  // Replace existing CI Learnings section
  const ciLearningsHeader = '## CI Learnings';
  if (existing.includes(ciLearningsHeader)) {
    // Find the section and replace it
    const headerIdx = existing.indexOf(ciLearningsHeader);
    const beforeSection = existing.slice(0, headerIdx);

    // Find end of section (next ## or end of file)
    const afterHeaderStart = headerIdx + ciLearningsHeader.length;
    const nextSectionMatch = existing.slice(afterHeaderStart).match(/\n## /);
    const afterSection = nextSectionMatch
      ? existing.slice(afterHeaderStart + (nextSectionMatch.index ?? existing.length))
      : '';

    const newContent = beforeSection.trimEnd() + '\n' + ciSection + '\n' + afterSection.trimStart();
    const lines = newContent.split('\n');
    const trimmed = trimMemoryWithHeader(lines, MEMORY_MAX_LINES);
    writeFileSync(memoryPath, trimmed, 'utf-8');
    return;
  }

  // Append at end
  const newContent = existing.trimEnd() + '\n' + ciSection + '\n';
  const lines = newContent.split('\n');
  const trimmed = trimMemoryWithHeader(lines, MEMORY_MAX_LINES);
  writeFileSync(memoryPath, trimmed, 'utf-8');
}

// Re-export CI learning types for consumers
export type { CiLearningResult } from '../core/ci-learning.js';
