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

// ═══ Sprint 212 Task 212-001 — Prompt Evolution Retro Wire ═════════════
//
// F5 evolutionary modules were implemented + tested in earlier sprints but
// shipped with **zero external callers** — dormant code, runtime-invisible.
// This wire makes `wirePromptEvolutionFromOutcomes` a real retro consumer:
// sprint-reporter reads the sprint outcome file and produces a markdown
// suggestion block. SUGGESTION-ONLY — no agent prompt mutation, no disk
// write to anything but the eventual retro document (caller's responsibility).
//
// Mirrors the Sprint 192 liveness/deferred section pattern: a `collect*`
// helper that pulls data, plus a `build*Section` helper that renders the
// markdown contract surface. The heading "Prompt Evolution Suggestion" is
// the stable hook downstream retro readers key off.
//
// @see ADR-035 / ADR-037 — wiring respects RBAC: sprint-reporter is in
//      orchestra (Brain-side), prompt-evolution is a sibling pure helper.

import {
  wirePromptEvolutionFromOutcomes,
  type PromptEvolutionResult,
} from './prompt-evolution.js';

export type { PromptEvolutionResult } from './prompt-evolution.js';

/** Arguments accepted by {@link collectPromptEvolutionSuggestion}. */
export interface PromptEvolutionSuggestionInput {
  /** Project root — the directory that owns `.deckent/routing/outcomes`. */
  projectRoot: string;
  /** Sprint id used as the outcome filename stem (e.g. `sprint-212`). */
  sprintId: string;
  /**
   * Seed prompt for the evolution pass. Retro callers can pass the empty
   * string when they only want the change list + evolved suffix.
   */
  basePrompt?: string;
}

/**
 * Read sprint outcomes from disk and produce a prompt-evolution suggestion.
 *
 * This is the **external caller** that the dormant
 * {@link wirePromptEvolutionFromOutcomes} has been missing — it lifts the
 * F5 evolutionary loop out of test-only scope into the live RETRO phase.
 *
 * Pure with respect to disk: it READS the routing outcomes file but writes
 * nothing. The returned {@link PromptEvolutionResult} is a suggestion that
 * downstream retro consumers may render via
 * {@link buildPromptEvolutionSection}.
 */
export function collectPromptEvolutionSuggestion(
  input: PromptEvolutionSuggestionInput,
): PromptEvolutionResult {
  return wirePromptEvolutionFromOutcomes({
    projectRoot: input.projectRoot,
    sprintId: input.sprintId,
    basePrompt: input.basePrompt ?? '',
  });
}

/**
 * Format a {@link PromptEvolutionResult} as a retro markdown section.
 *
 * The "Prompt Evolution Suggestion" heading is the contract surface —
 * retro readers and downstream tooling key off this exact string. The
 * section is always rendered (even when no changes were suggested) so
 * reviewers can distinguish "no signal this sprint" from "F5 wire missing".
 */
export function buildPromptEvolutionSection(
  result: PromptEvolutionResult,
): string {
  const percent = Math.round(result.successRate * 100);
  const changeLine =
    result.changes.length === 0
      ? '- Suggested changes: none'
      : `- Suggested changes: ${result.changes.join(', ')}`;
  const lines = [
    '## Prompt Evolution Suggestion',
    '',
    `- Outcomes considered: ${result.outcomeCount}`,
    `- Success rate: ${percent}%`,
    changeLine,
  ];
  if (result.changes.length > 0 && result.evolvedPrompt.trim().length > 0) {
    lines.push('', '### Evolved Prompt (suggestion — not applied)', '', result.evolvedPrompt);
  }
  return lines.join('\n') + '\n';
}

// ═══ Sprint 212 Task 212-005 — Specialization Drift Retro Wire ══════════
//
// `specialization-drift.ts` (`SpecializationDriftDetector`) was implemented
// and tested but had **zero external callers** — dormant code, invisible at
// runtime. This wire makes it a live retro consumer: sprint-reporter reads
// per-agent task execution data and surfaces drift scores + recommendations
// in the sprint retro. SUGGESTION-ONLY — no agent mutation, no disk writes.
//
// Mirrors the Sprint 192 liveness/deferred and Sprint 212 prompt-evolution
// section pattern: a pure `collect*` helper + a `build*Section` formatter.
// The "Specialization Drift" heading is the stable contract surface.
//
// @see ADR-041 — Agent Taxonomy (horizontal skills vs vertical agents)

import {
  SpecializationDriftDetector,
  type DriftReport,
  type RecentResult,
} from '../agents/specialization-drift.js';

export type { DriftReport, RecentResult } from '../agents/specialization-drift.js';

/** Input descriptor for a single agent's drift analysis. */
export interface AgentDriftInput {
  /** The agent's identifier (e.g. `refactorer`). */
  agentId: string;
  /** Keywords declaring the agent's intended specialization. */
  triggerKeywords: string[];
  /** Recent task results used to infer the agent's actual work domain. */
  recentResults: RecentResult[];
}

/**
 * Detect specialization drift for a list of agents.
 *
 * This is the **external caller** that makes the dormant
 * {@link SpecializationDriftDetector} live: sprint-reporter calls it during
 * the RETRO phase to flag agents whose recent task execution diverges from
 * their declared trigger keywords.
 *
 * Pure function — no side effects, no I/O. Returns one {@link DriftReport}
 * per input entry; empty input returns an empty array.
 */
export function collectSpecializationDriftReports(
  agents: AgentDriftInput[],
): DriftReport[] {
  const detector = new SpecializationDriftDetector();
  return agents.map(({ agentId, triggerKeywords, recentResults }) =>
    detector.detect(agentId, triggerKeywords, recentResults),
  );
}

/**
 * Format an array of {@link DriftReport}s as a retro markdown section.
 *
 * The "Specialization Drift" heading is the contract surface for retro
 * readers and downstream tooling. The section is always rendered (even
 * when the input is empty) so reviewers can distinguish "all agents
 * aligned" from "drift analysis not run".
 */
export function buildSpecializationDriftSection(reports: DriftReport[]): string {
  const lines = ['## Specialization Drift', ''];

  if (reports.length === 0) {
    lines.push('- No agent drift data available.');
    return lines.join('\n') + '\n';
  }

  for (const r of reports) {
    const pct = Math.round(r.driftScore * 100);
    lines.push(
      `- **${r.agentId}**: drift ${pct}% — recommendation: ${r.recommendation}`,
    );
  }

  return lines.join('\n') + '\n';
}

// ═══ Sprint 273 Task 273-004 — Limit Burn Retro Row ══════════════
//
// Best-effort: ledger is called with try/catch so a transcript-read failure
// never blocks retro generation. When the limit burn cannot be computed
// (no transcript dir, ledger error, zero records), the function returns null
// and the caller omits the row silently.
//
// ADR-008: sprint-reporter (orchestra) imports from core — direction is compat.
// ADR-010: no new runtime deps (limit-ledger.ts uses only Node built-ins).

import { debugLog } from '../core/utils.js';
import { parseTranscriptUsage } from '../core/limit-ledger.js';
import type { LedgerPrices, LedgerOpts, UsageRecord } from '../core/limit-ledger.js';
import {
  summarizeSprint, buildTranscriptTaskMap, filterTaskMapToSprint, evaluateCacheGate,
} from '../core/limit-ledger-report.js';
import type { CacheGateReport } from '../core/limit-ledger-report.js';
import { buildLedgerPrices } from '../core/cost-config-loader.js';

/** Injectable options for {@link buildLimitBurnRow} — used in tests. */
export interface LimitBurnOpts {
  /** Override transcript parser (injectable for hermetic tests). */
  parseUsage?: (opts?: { root?: string }) => Promise<UsageRecord[]>;
  /** Override sprint summarizer (injectable for hermetic tests). */
  summarize?: typeof summarizeSprint;
  prices?: LedgerPrices;
  /**
   * Injectable cache-gate evaluator (pre-bound with taskMap) for hermetic tests.
   * Called best-effort — errors are caught and the gate field is omitted silently.
   * When not provided, the cache-gate field is omitted from the output row.
   */
  evaluateGate?: (records: UsageRecord[]) => CacheGateReport;
}

/**
 * Build an optional Metrics-table row for the "Limit burn" line.
 *
 * Calls the transcript ledger best-effort (try/catch) and formats:
 *   `| Limit burn | $X.XX eşdeğer (task-başı $Y.YY, boot-cw %Z%) |`
 *
 * Returns `null` when ledger is unavailable or returns no records —
 * callers should omit the row silently in that case.
 *
 * @param root      Project root (used to load cost-config prices)
 * @param taskCount Number of tasks in the sprint (for per-task average)
 * @param opts      Injectable overrides for hermetic testing
 */
export async function buildLimitBurnRow(
  root: string,
  taskCount: number,
  opts: LimitBurnOpts = {},
): Promise<string | null> {
  try {
    // Default parses the global CC transcripts dir (~/.claude/projects) —
    // LedgerOpts.root is the TRANSCRIPTS root, not the project root, so the
    // project root must never be forwarded here (it would read the wrong dir
    // and always yield zero records).
    const parseFn = opts.parseUsage ?? (() => parseTranscriptUsage({}));
    const summarizeFn = opts.summarize ?? summarizeSprint;

    const records = await parseFn({});
    if (records.length === 0) return null;

    // Empty prices would zero every cost and silently drop the row —
    // default to the project's cost-config price map.
    const summary = summarizeFn(records, {}, opts.prices ?? buildLedgerPrices(root));
    const total = summary.totals.limitCost;
    if (total <= 0) return null;

    const perTask = taskCount > 0 ? total / taskCount : 0;
    const bootstrapSum = summary.tasks.reduce((s, t) => s + t.bootstrapCw, 0);
    const bootShare =
      summary.totals.cacheWrite > 0
        ? Math.round((bootstrapSum / summary.totals.cacheWrite) * 100)
        : 0;

    // Sprint-wide hit rate: cacheRead / (in + cacheRead)
    const hitRateDenom = summary.totals.in + summary.totals.cacheRead;
    const hitRatePct = hitRateDenom > 0
      ? Math.round((summary.totals.cacheRead / hitRateDenom) * 100)
      : 0;

    // Best-effort cache-gate from injectable evaluator
    let gateStr = '';
    if (opts.evaluateGate) {
      try {
        const gate = opts.evaluateGate(records);
        if (gate.applicable) {
          gateStr = `, cache-gate ${gate.pass ? 'PASS' : 'FAIL'}`;
        }
      } catch (e) {
        debugLog('buildLimitBurnRow gate', e);
      }
    }

    const fmt = (n: number) => `$${n.toFixed(2)}`;
    return `| Limit burn | ${fmt(total)} eşdeğer (task-başı ${fmt(perTask)}, boot-cw %${bootShare}%, hit-rate %${hitRatePct}%${gateStr}) |`;
  } catch (e) {
    debugLog('buildLimitBurnRow', e);
    return null;
  }
}

/** Injectable options for {@link buildSprintLimitBurnRow} — used in tests. */
export interface SprintLimitBurnOpts extends LimitBurnOpts {
  /** Override transcript task-map builder (injectable for hermetic tests). */
  buildTaskMap?: (opts: LedgerOpts) => Promise<Record<string, string>>;
}

/**
 * Build the retro "Limit burn" row scoped to a single sprint.
 *
 * Production entry point for the retro pipeline (finalizeSprint). Assembles
 * the pieces buildLimitBurnRow leaves to its caller:
 *   1. Parses the global CC transcripts dir (NOT the project root).
 *   2. Maps sessions → tasks and filters to this sprint's task IDs — so the
 *      row reports the sprint's burn, not all-history burn.
 *   3. Loads prices from cost-config (empty prices would zero the row out).
 *   4. Evaluates the cache-gate against the sprint-scoped task map.
 *
 * Returns null when the sprint has no mapped transcript sessions or on any
 * ledger error — callers omit the row silently (retro must never be blocked).
 *
 * @param projectRoot Project root (cost-config prices)
 * @param sprintId    Sprint ID — accepts both "sprint-281" and "281"
 * @param taskCount   Number of tasks in the sprint (for per-task average)
 * @param opts        Injectable overrides for hermetic testing
 */
export async function buildSprintLimitBurnRow(
  projectRoot: string,
  sprintId: string,
  taskCount: number,
  opts: SprintLimitBurnOpts = {},
): Promise<string | null> {
  try {
    const parseFn = opts.parseUsage ?? (() => parseTranscriptUsage({}));
    const records = await parseFn({});
    if (records.length === 0) return null;

    const mapFn = opts.buildTaskMap ?? buildTranscriptTaskMap;
    const sprintMap = filterTaskMapToSprint(await mapFn({}), sprintId);
    if (Object.keys(sprintMap).length === 0) return null;

    const prices = opts.prices ?? buildLedgerPrices(projectRoot);

    return buildLimitBurnRow(projectRoot, taskCount, {
      parseUsage: async () => records,
      summarize: opts.summarize ?? ((recs, _taskMap, p) => summarizeSprint(recs, sprintMap, p)),
      prices,
      evaluateGate: opts.evaluateGate ?? ((recs) => evaluateCacheGate(recs, sprintMap)),
    });
  } catch (e) {
    debugLog('buildSprintLimitBurnRow', e);
    return null;
  }
}

// ═══ TT554 Task 418-001 — METERING-TRUTH reporter guards ═════════════
//
// The live metrics path (`calculateMetrics` in sprint-metrics.ts — outside this
// task's write scope) carries two truth bugs the 418 trace-audit caught:
//
//   • Coverage = NaN%  — `results.reduce((s, r) => s + r.coverage, 0) / results.length`
//     only guards `results.length > 0`; a single result whose `coverage` is
//     undefined / NaN poisons the whole average into NaN.
//   • Total-Tasks conflation (5-vs-4) — `Math.max(sprint.tasks.length,
//     evaluations.size)` reports ATTEMPTS (retries + injected fix tasks swell the
//     evaluations map) as the distinct TASK count.
//
// These pure guards fix both, mirroring the `computeSprintMetrics` precedent above
// (guarded helpers added directly to the barrel). Wiring them into the live
// `calculateMetrics` is a follow-up (that file is read-only for this task) — until
// then the live path still emits the bug; see the task .result docImpact line.

/** A result contributing a coverage number to the sprint average. */
export interface CoverageContributor {
  coverage?: number;
}

/**
 * Average coverage across results, counting ONLY finite coverage values. Returns 0
 * when no result carries a finite coverage — NEVER `NaN` (the sprint-metrics bug: a
 * single `undefined` / `NaN` coverage poisons the reduce). Pure, side-effect-free.
 */
export function computeSafeCoveragePercent(results: readonly CoverageContributor[]): number {
  let sum = 0;
  let count = 0;
  for (const r of results) {
    const c = r?.coverage;
    if (typeof c === 'number' && Number.isFinite(c)) {
      sum += c;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

/** Distinct-task vs attempt counts for the sprint metrics table. */
export interface TaskAttemptCounts {
  /** Distinct tasks the sprint planned (never inflated by retries). */
  tasks: number;
  /** Total attempts observed (results / evaluations — retries + injected fixes). */
  attempts: number;
}

/**
 * Separate the distinct TASK count from the ATTEMPT count. The live path collapsed
 * both into `Math.max(tasks, evaluations.size)`, so a 4-task sprint with one retry
 * printed "5 tasks". `tasks` stays the sprint's own planned count; `attempts` is the
 * larger of the evaluation / result counts (each retry or injected fix is an attempt,
 * not a new task). Pure.
 */
export function resolveTaskVsAttempt(
  sprintTaskCount: number,
  evaluationCount: number,
  resultCount: number,
): TaskAttemptCounts {
  return {
    tasks: Math.max(0, sprintTaskCount),
    attempts: Math.max(0, evaluationCount, resultCount),
  };
}

/** A result carrying the REAL files-changed / cost fields the reporter should surface. */
export interface FilesChangedCostContributor {
  filesChanged?: string[];
  linesAdded?: number;
  linesRemoved?: number;
  cost?: { usd?: number };
}

/** Ground-truth files-changed + cost aggregates for the sprint metrics table. */
export interface FilesChangedCostSummary {
  /** Distinct files touched across all results (deduped — one file, one count). */
  filesChanged: number;
  /** Total real lines added across results. */
  linesAdded: number;
  /** Total real lines removed across results. */
  linesRemoved: number;
  /** Total real USD across results that carry a `cost.usd` (host-side enriched). */
  costUsd: number;
}

/**
 * Aggregate the REAL files-changed and cost fields from collected results so the
 * metrics table can show ground truth instead of the hardcoded-0 placeholders
 * (`SprintMetrics.crossAssignments`/`contextLinesUsed` are literal `0`s). The
 * per-task real fields already flow into each `TaskResult` host-side —
 * `result.filesChanged`/`linesAdded`/`linesRemoved` from git ground-truth
 * (result-collector.ts LP-10) and `result.cost.usd` from `enrichResultCost`
 * (calculateActualCost) — so this only needs to SUM them for the report.
 *
 * `filesChanged` is a DISTINCT file count (the same file touched by two tasks counts
 * once); `costUsd` sums `result.cost.usd`. Missing / non-finite fields are skipped —
 * never NaN. Pure, side-effect-free.
 */
export function computeFilesChangedAndCost(
  results: readonly FilesChangedCostContributor[],
): FilesChangedCostSummary {
  const files = new Set<string>();
  let linesAdded = 0;
  let linesRemoved = 0;
  let costUsd = 0;
  for (const r of results) {
    for (const f of r?.filesChanged ?? []) {
      if (typeof f === 'string' && f) files.add(f);
    }
    if (typeof r?.linesAdded === 'number' && Number.isFinite(r.linesAdded)) linesAdded += r.linesAdded;
    if (typeof r?.linesRemoved === 'number' && Number.isFinite(r.linesRemoved)) linesRemoved += r.linesRemoved;
    const usd = r?.cost?.usd;
    if (typeof usd === 'number' && Number.isFinite(usd)) costUsd += usd;
  }
  return { filesChanged: files.size, linesAdded, linesRemoved, costUsd };
}

// ═══ MET668B Task 419-002 — Files-Changed / Cost live retro section ═══════════
//
// 418-001 added `computeFilesChangedAndCost` as a pure seam but left it UN-wired: the
// live metrics table still shows the hardcoded-0 placeholders (SprintMetrics
// `crossAssignments`/`contextLinesUsed` are literal 0s and SprintMetrics has no
// files/cost field at all; `calculateMetrics` is read-only for this task). This renders
// the REAL aggregate from the collected results (canlı-kaynak) so finalizeSprint can
// append it to the retro — mirroring the buildLivenessStatsSection / Limit-Burn wire
// pattern above. It REUSES the 418-001 seam; no new aggregation is invented.
//
// The optional `helperCostUsd` surfaces the previously off-ledger auxiliary-call cost
// (MET668B part 1, buildHelperLedger.totalUsd) on its OWN line, kept SEPARATE from the
// per-task cost sum so the two are never conflated in the display either (no double-count).

/** Options for {@link buildFilesChangedCostSection}. */
export interface FilesChangedCostSectionOptions {
  /**
   * Previously off-ledger helper-call USD (buildHelperLedger total). Rendered as its OWN
   * line plus a combined total — omitted (no helper/total lines) when absent or ≤ 0.
   */
  helperCostUsd?: number;
}

/**
 * Render the REAL files-changed + cost aggregate as a retro markdown section.
 *
 * The "## Files Changed & Cost" heading is the contract surface downstream retro readers
 * key off. Always rendered (even for an empty sprint → all-zero) so reviewers can
 * distinguish "no work / no cost" from "section missing / still on placeholders".
 */
export function buildFilesChangedCostSection(
  results: readonly FilesChangedCostContributor[],
  opts?: FilesChangedCostSectionOptions,
): string {
  const s = computeFilesChangedAndCost(results);
  const lines = [
    '## Files Changed & Cost',
    '',
    `- Files changed: ${s.filesChanged}`,
    `- Lines: +${s.linesAdded} / -${s.linesRemoved}`,
    `- Task cost: $${s.costUsd.toFixed(4)}`,
  ];
  const helper = opts?.helperCostUsd;
  if (typeof helper === 'number' && Number.isFinite(helper) && helper > 0) {
    lines.push(`- Helper-call cost (auxiliary, was off-ledger): $${helper.toFixed(4)}`);
    // Combined figure is ADVISORY only. The auxiliary cost may overlap the task cost in the
    // intermittent opus envelope quirk (top-level output_tokens absent → capture folds helper
    // output at the primary rate; born-562 forbids fixing that in the capture path). The two
    // component lines above stay authoritative and separate — only this sum can over-count.
    lines.push(
      `- Total cost (task + auxiliary — advisory; auxiliary may overlap when top-level output absent): ` +
      `$${(s.costUsd + helper).toFixed(4)}`,
    );
  }
  return lines.join('\n') + '\n';
}
