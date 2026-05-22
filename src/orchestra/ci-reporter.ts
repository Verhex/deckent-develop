// ─── CI Reporter ─────────────────────────────────────────────────
// Extracted from sprint-reporter.ts — CI baseline, health, trend, learning integration
import { readFileSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  BRAIN_DIR,
} from '../core/constants.js';
import { debugLog } from '../core/utils.js';
import {
  analyzeCiLearnings,
  buildCiLearningsSection,
  writeCiLearnings,
  type CiLearningResult,
} from '../core/ci-learning.js';
import type { MemoryStore } from '../core/memory-store.js';

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
 * Append a CI Health section to DB retro entry.
 * Upserts a 'retro' entry with CI Health content via MemoryStore.
 * Requires store — no-op without it (V2: DB is single source of truth).
 * Idempotent — skips if entry already exists or report not found.
 */
export function appendCiHealthToRetro(projectRoot: string, sprintId: string, store?: MemoryStore): void {
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

  // DB-first: upsert retro entry with CI Health content
  if (!store) return; // V2: no store = no write (DB is single source of truth)

  try {
    const retroId = `retro-ci-health-${sprintId}`;
    const existing = store.getById(retroId);
    if (existing) return; // Already exists — idempotent
    store.upsert({
      id: retroId,
      type: 'retro',
      title: `CI Health — ${sprintId}`,
      content: ciSection.join('\n'),
      source: 'brain',
      sprint_id: sprintId,
      sprint_num: parseInt(sprintId.replace(/\D/g, '') || '0', 10),
      tags: ['ci-health', 'retro'],
    }, 'ci-reporter');
  } catch (e) {
    debugLog('appendCiHealthToRetro:store', e);
  }
}

// ═══ CI Learning Integration ══════════════════════════════════════

/**
 * Run CI learning analysis and upsert the CI Learnings entry into memory.db.
 * Called during sprint retrospective to capture cross-sprint CI insights.
 *
 * 1. Reads last N sprint CI reports
 * 2. Detects failure patterns
 * 3. Generates suggestions and config recommendations
 * 4. Writes ci-learnings.json to .brain/
 * 5. Upserts the CI Learnings `memory` entry to memory.db (B8: DB-first)
 *
 * Non-fatal — errors are logged to stderr but never abort the sprint.
 */
export function runCiLearningAnalysis(projectRoot: string, maxSprints = 5, store?: MemoryStore): CiLearningResult | null {
  try {
    const result = analyzeCiLearnings(projectRoot, maxSprints);

    // Write analysis results to .brain/ci-learnings.json
    writeCiLearnings(projectRoot, result);

    // Append CI Learnings section to DB or MEMORY.md
    if (result.reports.length > 0) {
      appendCiLearningsToMemory(projectRoot, result, store);
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
 * Append CI Learnings to DB via MemoryStore.
 * Requires store — no-op without it (V2: DB is single source of truth).
 * Idempotent — safe to call multiple times (upsert by id).
 */
export function appendCiLearningsToMemory(_projectRoot: string, result: CiLearningResult, store?: MemoryStore): void {
  const ciSection = buildCiLearningsSection(result.reports, result.patterns);
  if (!ciSection) return;

  // DB-first: upsert memory entry with CI Learnings content
  if (!store) return; // V2: no store = no write (DB is single source of truth)

  try {
    store.upsert({
      id: 'ci-learnings-latest',
      type: 'memory',
      title: 'CI Learnings',
      content: ciSection,
      source: 'brain',
      tags: ['ci-learnings', 'memory'],
    }, 'ci-reporter');
  } catch (e) {
    debugLog('appendCiLearningsToMemory:store', e);
  }
}

// Re-export CI learning types for consumers
export type { CiLearningResult } from '../core/ci-learning.js';
