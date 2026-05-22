// ─── Sprint Reporter (Thin Barrel) ───────────────────────────────
// This file was split into 4 focused modules in Sprint 134 (Task 134-009).
// All public exports are re-exported here so consumers don't need to change imports.
//
// Modules:
//   sprint-metrics.ts      — metric calculation, aggregation, comparison, coverage
//   sprint-retro-writer.ts — retro generation, learnings, memory, decay
//   sprint-docs-updater.ts — managed-docs, project identity, sprint log, debt, archive
//   ci-reporter.ts         — CI baseline, health, trend, learning integration

// ═══ sprint-metrics.ts ═══════════════════════════════════════════
export {
  formatTokenCount,
  buildTokenUsageSection,
  calculateMetrics,
  compareWithPreviousSprint,
  readPreviousSprintMetrics,
  formatDuration,
  formatDurationShort,
  calculateSelfHealingRate,
  countFirstTryTasks,
  countNewTestFiles,
  countSelfHealedTasks,
  buildAgentPerformance,
  formatAgentPerformanceTable,
  buildSkillPerformance,
  formatSkillPerformanceTable,
  generateConfigSuggestions,
  detectRecurringFileErrors,
  buildBrainInsights,
  extractSprintNumber,
} from './sprint-metrics.js';

export type {
  SprintComparison,
  AgentPerformanceRow,
  SkillPerformanceRow,
  SelfHealingRate,
  ConfigSuggestion,
} from './sprint-metrics.js';

// ═══ sprint-retro-writer.ts ═════════════════════════════════════
export {
  trimMemoryWithHeader,
  formatHumanRetro,
  buildRetroHighlights,
  buildRetroIssues,
  buildRetroLearnings,
  writeRetrospective,
  formatHumanSprintComplete,
  buildWhatWentWell,
  buildWhatNeedsAttention,
  formatRubricScoresSection,
} from './sprint-retro-writer.js';

export type {
  HumanRetroData,
  SprintCompleteData,
} from './sprint-retro-writer.js';

// ═══ sprint-docs-updater.ts ═════════════════════════════════════
export {
  writeSprintLog,
  updateProjectDocs,
  autoResolveDebt,
  autoDraftDecisions,
  collectSprintFiles,
  archiveDirectives,
  emergencyRestoreDirectives,
  archiveOrphanTasks,
} from './sprint-docs-updater.js';

// ═══ ci-reporter.ts ═════════════════════════════════════════════
export {
  readCiReportTrend,
  formatCiHealthSection,
  appendCiHealthToRetro,
  runCiLearningAnalysis,
  appendCiLearningsToMemory,
} from './ci-reporter.js';

export type {
  CiTrendEntry,
  CiTrend,
  CiLearningResult,
} from './ci-reporter.js';

// ═══ post-sprint-smoke.ts (Sprint 182 W2-3 — verify task pattern) ═══
// Verify tasks run AFTER the sprint COMPLETE phase via a gated smoke runner.
// Resolves the Sprint 181 race where verify tasks could fire before primary
// (W1) deliverables had landed on disk. See ADR-035 / ADR-045 / ADR-047.
export {
  classifyVerifyTasks,
  shouldTriggerPostSprintSmoke,
  collectUpstreamDeliverables,
  runPostSprintSmoke,
} from './post-sprint-smoke.js';

export type {
  VerifyTaskCandidate,
  SmokeTaskResult,
  PostSprintSmokeResult,
  PostSprintSmokeOptions,
  SmokeRunnerFn,
} from './post-sprint-smoke.js';

// ═══ Sprint 168 Cluster C0d — Math Guards (BUG-FF) ═══════════════
//
// Sprint 167 finalize produced the cosmetic regression:
//   | Duration | -1dk -1sn |    ← negative arithmetic (start null defaulted later than end)
//   | Coverage | NaN%      |    ← 0/0 division (read-only audit, no source change)
//
// `computeSprintMetrics` is a pure, side-effect-free helper that callers can use
// to compute `durationMs` and `coverageRatio` with safe guards:
//   • durationMs    = Math.max(0, endMs - startMs)           — never negative
//   • coverageRatio = totalLines > 0 ? coveredLines/totalLines : null   — never NaN
//
// Display contract (consumer responsibility):
//   • coverageRatio === null  → render "N/A" (e.g. `ratio == null ? 'N/A' : (ratio*100).toFixed(2)+'%'`)
//   • durationMs   === 0      → render "0s" / "<1s" instead of negative noise
//
// @see docs/superpowers/specs/2026-05-14-sprint-168-design.md §C0d
// @see docs/audits/sprint-167/T5-brain-debug-phase1.md §1.8 BUG-FF
// @see docs/audits/sprint-167/T5-brain-debug-phase2.md §Cluster D

/** Input arguments for {@link computeSprintMetrics}. */
export interface SprintMetricsInput {
  /** Sprint start timestamp in milliseconds (epoch ms). */
  startMs: number;
  /** Sprint end timestamp in milliseconds (epoch ms). */
  endMs: number;
  /** Total source lines counted for coverage (denominator). */
  totalLines: number;
  /** Covered source lines counted for coverage (numerator). */
  coveredLines: number;
}

/** Guarded sprint metrics output from {@link computeSprintMetrics}. */
export interface GuardedSprintMetrics {
  /** Non-negative duration in milliseconds. */
  durationMs: number;
  /** Coverage ratio in [0, 1], or `null` when totalLines = 0 (display as "N/A"). */
  coverageRatio: number | null;
}

/**
 * Compute sprint metrics with math guards (BUG-FF closure).
 *
 * Pure function — no side effects, no I/O. Safe to call with edge-case input
 * (start > end, zero totalLines, NaN inputs). Returns a non-negative duration
 * and a `null` coverage signal when the denominator is zero (so callers can
 * render "N/A" instead of "NaN%").
 *
 * @param input - {@link SprintMetricsInput} — start/end timestamps and line counts
 * @returns {@link GuardedSprintMetrics} with `durationMs ≥ 0` and `coverageRatio ∈ [0,1] | null`
 *
 * @example
 * // Sprint 167 reproduction (start > end → negative arithmetic)
 * computeSprintMetrics({ startMs: 1000, endMs: 500, totalLines: 100, coveredLines: 50 });
 * // → { durationMs: 0, coverageRatio: 0.5 }
 *
 * @example
 * // Read-only audit sprint (0/0 NaN → null)
 * computeSprintMetrics({ startMs: 0, endMs: 100, totalLines: 0, coveredLines: 0 });
 * // → { durationMs: 100, coverageRatio: null }   // display "N/A"
 */
export function computeSprintMetrics(input: SprintMetricsInput): GuardedSprintMetrics {
  const { startMs, endMs, totalLines, coveredLines } = input;
  const durationMs = Math.max(0, endMs - startMs);
  const coverageRatio = totalLines > 0 ? coveredLines / totalLines : null;
  return { durationMs, coverageRatio };
}
