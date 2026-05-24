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
  appendRetroSection,
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

// ═══ Sprint 192 Task 192-008 — Liveness Stats Telemetry ═════════════
//
// Sprint 191 hotfix (07f07c9a) introduced a 5-layer worker-liveness gate
// in runEvaluatePhase that now emits two structured events instead of
// blindly writing synthetic NO_GO results:
//
//   • BRAIN→WORKER:NEVER_DISPATCHED  → task that never reached dispatcher
//   • BRAIN→WORKER:TIMEOUT_EXTEND    → heartbeat-fresh task got +5min grant
//
// To make the hotfix impact data-verifiable, sprint-reporter exposes a
// pure event-stream parser + a markdown formatter. Retro consumers (the
// scope.filesWrite-restricted sprint-retro-writer wire is a follow-up;
// out of this task's scope) concatenate the formatted section into the
// sprint retro document. See `.tasks/task-192-008.plan` for the wiring
// follow-up note.

import { readEvents, CHANNELS } from './event-stream.js';
import { TaskEvaluation } from '../core/task-types.js';

/** Aggregated counts derived from the sprint event stream. */
export interface LivenessStats {
  /** Tasks the dispatcher never reached (max_workers saturation, etc.). */
  neverDispatched: number;
  /** Runtime extensions granted to heartbeat-fresh tasks (Sprint 145 T-019). */
  extensionsGranted: number;
}

/**
 * Read the structured event stream for a sprint and aggregate liveness
 * telemetry counts.
 *
 * Pure with respect to the event log only (no mutations). Returns zero
 * counts when the event file is missing or empty so callers can render
 * the section unconditionally.
 */
export function collectLivenessStats(
  projectRoot: string,
  sprintId: string,
): LivenessStats {
  const neverDispatched = readEvents(projectRoot, sprintId, {
    channel: CHANNELS.NEVER_DISPATCHED,
  }).length;
  const extensionsGranted = readEvents(projectRoot, sprintId, {
    channel: CHANNELS.TIMEOUT_EXTEND,
  }).length;
  return { neverDispatched, extensionsGranted };
}

/**
 * Format {@link LivenessStats} as a retro markdown section.
 *
 * The "Liveness Stats" heading is the contract surface — retro readers
 * and downstream tooling key off this exact string. The section is
 * always rendered (even when both counts are zero) so reviewers can
 * distinguish "hotfix observed no triggers" from "hotfix not present".
 */
export function buildLivenessStatsSection(stats: LivenessStats): string {
  const lines = [
    '## Liveness Stats',
    '',
    `- Never dispatched: ${stats.neverDispatched} task${stats.neverDispatched === 1 ? '' : 's'}`,
    `- Extensions granted: ${stats.extensionsGranted} task${stats.extensionsGranted === 1 ? '' : 's'}`,
  ];
  return lines.join('\n') + '\n';
}

// ═══ Sprint 192 Task 192-010 — Deferred Task Telemetry (W-INTEGRITY I-4) ══
//
// `TaskEvaluation.DEFERRED` marks tasks the dispatcher never reached before
// the EVALUATE gate fired (max_workers saturation, wave throughput limits).
// Distinct from PAUSED (depends-on-NO_GO) — DEFERRED does NOT cascade a
// downstream fix (see debt-manager.handleCrossDependencies which filters
// only NO_GO). Retro must surface the count so reviewers can attribute
// "incomplete sprint" to saturation rather than worker failure.

/** Aggregated DEFERRED counts derived from the per-task evaluation map. */
export interface DeferredStats {
  /** Tasks evaluated as DEFERRED (dispatcher saturation, no fix cascade). */
  deferred: number;
}

/**
 * Count DEFERRED evaluations from a per-task evaluation map.
 *
 * Pure function. PAUSED tasks (TaskStatus, depends-on-NO_GO) are NOT counted
 * here — they remain in the existing cascade pipeline. Only `TaskEvaluation.DEFERRED`
 * contributes to this metric.
 */
export function collectDeferredStats(
  evaluations: Map<string, TaskEvaluation>,
): DeferredStats {
  let deferred = 0;
  for (const ev of evaluations.values()) {
    if (ev === TaskEvaluation.DEFERRED) deferred += 1;
  }
  return { deferred };
}

/**
 * Format {@link DeferredStats} as a retro markdown section.
 *
 * The "Deferred Tasks" heading is the contract surface for downstream tooling
 * and sprint-reporter consumers. Section is always rendered so reviewers can
 * distinguish "zero saturation" from "section missing".
 */
export function buildDeferredSection(stats: DeferredStats): string {
  const lines = [
    '## Deferred Tasks',
    '',
    `- Deferred: ${stats.deferred} task${stats.deferred === 1 ? '' : 's'} (dispatcher saturation, no cascade)`,
  ];
  return lines.join('\n') + '\n';
}
