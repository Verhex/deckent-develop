// ─── Sprint Estimate-vs-Actual Reconciler ────────────────────────────────────
// Worker Output Contract & Observability — spec §1.6.
//
// At sprint end deckent holds two cost pictures:
//   • the START-of-sprint ESTIMATE — cost-calculator `estimateSprintCost`
//     (`SprintCostEstimate`: per-task `taskDetails` + `totalApiCostUsd`), and
//   • the ACTUAL spend assembled into every worker `.result`
//     (`cost.usd`, provider-agnostic, §1.4).
//
// `reconcileSprint(estimate, results)` joins the two by `taskId` and reports:
//   • `estimatedUsd` / `actualUsd` / `variancePct` at the sprint level,
//   • per-task variance (USD + %), and
//   • optimization signals — tasks that materially over- (or under-) ran their
//     estimate, with a model-downgrade suggestion when a cheaper same-family
//     tier exists (e.g. "Task X ran 3.2× over estimate on opus → consider sonnet").
//
// Provider-agnostic by construction: it reads only the normalized `cost.usd`
// and `model` fields, so a Claude / Codex / Gemini / Ollama task reconciles
// through the same path — it never reaches for a provider-specific field.
//
// Pure module: no I/O, no spawn surface, deterministic — fully unit-testable.
// It is consumed by the sprint-finalize summary + dashboard reconciliation
// panel; `formatReconciliation` renders the ready-to-surface text block.

import { modelRegistry } from '../core/model-registry.js';

// ─── Input contracts (structural subsets — callers pass the real types) ───────
//
// These are deliberately the *minimal* shapes the reconciler needs. They are
// structurally compatible with the producers, so a caller may pass a
// `SprintCostEstimate` (cost-calculator) and a `TaskResultV1[]`
// (task-result-schema) directly with no adapter — while tests stay light
// (no need to construct a fully-valid Zod result to exercise the math).

/** Per-task estimated cost — structural subset of `SprintCostEstimate.taskDetails[]`. */
export interface EstimatedTaskCost {
  /** Task id — the join key against a result's `taskId`. */
  id: string;
  /** Model the estimate assumed for the task. */
  model: string;
  /** Provider the estimate assumed (optional — estimates may omit it). */
  provider?: string;
  /** Estimated USD for the task (0 for subscription/local/free-tier billing). */
  costUsd: number;
}

/** Sprint estimate input — structurally compatible with `SprintCostEstimate`. */
export interface ReconcileEstimate {
  /** Sprint-total estimated API USD (denominator fallback when per-task detail is absent). */
  totalApiCostUsd: number;
  /** Per-task estimated detail — cost-calculator emits this as `taskDetails` (`includeDetails:true`). */
  taskDetails?: EstimatedTaskCost[];
}

/** Per-task actual — structural subset of a finished `TaskResultV1`. */
export interface ReconcileResult {
  /** Task id — the join key against an estimate's `id`. */
  taskId: string;
  /** Model that actually served the task. */
  model: string;
  /** Provider that actually served the task. */
  provider?: string;
  /** Cross-provider actual cost (§1.4). `usd` is 0 for local/subscription billing. */
  cost: { usd: number };
  /** Optional token accounting (carried for richer downstream signals). */
  tokenUsage?: { totalTokens?: number };
}

// ─── Output contract ──────────────────────────────────────────────────────────

/** One task's estimate-vs-actual reconciliation. */
export interface PerTaskReconciliation {
  taskId: string;
  model: string;
  /** Provider that served the task, or `null` when the result omitted it. */
  provider: string | null;
  /** Estimated USD for this task (0 when there was no matching estimate). */
  estimatedUsd: number;
  /** Actual USD for this task. */
  actualUsd: number;
  /** `actualUsd − estimatedUsd`. Positive = over-run. */
  varianceUsd: number;
  /** `(actual − estimated) / estimated × 100`. `null` when there is no estimate baseline (estimated = 0). */
  variancePct: number | null;
  /** `actual / estimated`. `null` when there is no estimate baseline (estimated = 0). */
  ratio: number | null;
  /** True when actual exceeded estimated beyond the over-run tolerance. */
  overRun: boolean;
  /** True when no estimate matched this result (actual-only spend). */
  unestimated: boolean;
}

/** An advisory raised for a task that materially over-ran its estimate. */
export interface OptimizationSignal {
  taskId: string;
  model: string;
  /** How many × actual ran over estimate (e.g. 3.2). `null` when there was no estimate baseline. */
  ratio: number | null;
  /** `warn` for severe over-runs, `info` otherwise. */
  severity: 'info' | 'warn';
  /** A cheaper same-family model to consider, or `null` when no downgrade is known. */
  suggestedModel: string | null;
  /** Pre-formatted English advisory. The structured fields above let a caller re-localize. */
  message: string;
}

/** The full sprint reconciliation report (spec §1.6). */
export interface SprintReconciliation {
  /** Sprint-total estimated USD (apples-to-apples with `actualUsd` — see notes in `reconcileSprint`). */
  estimatedUsd: number;
  /** Sprint-total actual USD — the exact sum of `results[].cost.usd`. */
  actualUsd: number;
  /** `actualUsd − estimatedUsd`. */
  varianceUsd: number;
  /** Sprint-level variance %. `null` when the total estimate is 0. */
  variancePct: number | null;
  /** Per-task reconciliation, in `results` order. */
  perTask: PerTaskReconciliation[];
  /** Over-run advisories (see {@link OptimizationSignal}). */
  optimizationSignals: OptimizationSignal[];
  /** Count of results that matched an estimate. */
  matchedCount: number;
  /** Count of results with no matching estimate (estimate gap). */
  unestimatedCount: number;
  /** Count of estimated tasks that produced no result (did not run / no `.result`). */
  unmatchedEstimateCount: number;
}

/** Tunables for {@link reconcileSprint}. All have enterprise-sane defaults. */
export interface ReconcileOptions {
  /** A result must exceed estimate by more than this fraction to count as an over-run. Default 0.10 (10%). */
  overRunTolerance?: number;
  /** Minimum `actual / estimate` ratio to emit an optimization signal. Default 2.0 (2× over). */
  signalRatioThreshold?: number;
  /** Ratio at/above which a signal is `warn` rather than `info`. Default 3.0. */
  warnRatioThreshold?: number;
  /** Minimum actual USD for a task to be signal-worthy (suppresses sub-cent noise). Default 0.01. */
  signalMinUsd?: number;
  /** Model-downgrade ladder (`canonical API id → cheaper canonical API id`). */
  downgradeLadder?: Record<string, string>;
}

// ─── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_OVERRUN_TOLERANCE = 0.10;
const DEFAULT_SIGNAL_RATIO_THRESHOLD = 2.0;
const DEFAULT_WARN_RATIO_THRESHOLD = 3.0;
const DEFAULT_SIGNAL_MIN_USD = 0.01;

/**
 * Built-in same-family model-downgrade ladder — ADVISORY ONLY, never a dispatch or
 * pricing authority.
 *
 * Reconciliation prices EXCLUSIVELY from the canonical, provider-normalized
 * `result.cost.usd` (§1.4); this ladder only decorates an over-run
 * OptimizationSignal with a human-readable "consider <cheaper>" hint. It never
 * routes a task and never feeds a cost number. Even this advisory surface emits
 * exact API ids so telemetry and copy cannot reintroduce a second identity.
 * Intentionally Claude-family-scoped (premium→standard→economy): an unknown / cross-family
 * model yields NO suggestion (the over-run signal still fires — see
 * {@link suggestCheaperModel}), and callers extend other families explicitly via
 * `ReconcileOptions.downgradeLadder`.
 */
const DEFAULT_DOWNGRADE_LADDER: Readonly<Record<string, string>> = (() => {
  const standard = modelRegistry.getByProviderAndTier('claude', 'standard');
  const economy = modelRegistry.getByProviderAndTier('claude', 'economy');
  const ladder: Record<string, string> = {};
  // Key on EVERY model of a tier, not just the tier's designated one. The task
  // already ran on whatever model it ran on, so a registered model missing from
  // the ladder silently loses its suggestion while the over-run signal still
  // fires — an advisory that goes quiet exactly when it has something to say.
  // Measured when MASTER-PLAN 670 moved the claude/premium designation from
  // Opus 4.8 to Opus 5: Opus 4.8 is still GA and still dispatchable, and it lost
  // its downgrade hint. The step-down TARGET stays the designated model, since
  // that is the tier's current-generation answer.
  for (const model of modelRegistry.getByProvider('claude')) {
    if (model.tier === 'premium' && standard) ladder[model.id] = standard.id;
    else if (model.tier === 'standard' && economy) ladder[model.id] = economy.id;
  }
  return ladder;
})();

// ─── Numeric helpers ─────────────────────────────────────────────────────────

/** Coerce to a finite, non-negative USD amount; anything invalid → 0 (honest clamp). */
function sanitizeUsd(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Format a USD amount with the project-standard 4-decimal precision. */
function formatUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

/** Format an over-run ratio to one decimal place (e.g. `3.2`). */
function formatRatio(ratio: number): string {
  return ratio.toFixed(1);
}

// ─── Model downgrade ─────────────────────────────────────────────────────────

/**
 * Suggest a cheaper same-family model for `model`, or `null` when none is known.
 *
 * Resolution order: (1) direct canonical-id hit in the ladder, then (2) a
 * compatibility keyword scan for externally supplied historical text. The
 * lookup is single-step (no recursive descent) and
 * case-insensitive.
 */
export function suggestCheaperModel(
  model: string,
  ladder: Record<string, string> = DEFAULT_DOWNGRADE_LADDER,
): string | null {
  const key = model.toLowerCase();
  const direct = ladder[key];
  if (direct) return direct;
  for (const [tier, cheaper] of Object.entries(ladder)) {
    if (key.includes(tier)) return cheaper;
  }
  return null;
}

// ─── Signal construction ─────────────────────────────────────────────────────

interface SignalContext {
  taskId: string;
  model: string;
  estimatedUsd: number;
  actualUsd: number;
  ratio: number | null;
  signalRatioThreshold: number;
  warnRatioThreshold: number;
  signalMinUsd: number;
  ladder: Record<string, string>;
}

/**
 * Build an optimization signal for a task, or `null` when it does not warrant one.
 *
 * Two signal shapes, both gated by `signalMinUsd` (sub-cent tasks never signal):
 *  - **over-run** (`ratio !== null`): emitted when `ratio ≥ signalRatioThreshold`;
 *    `warn` at/above `warnRatioThreshold`, else `info`.
 *  - **unestimated spend** (`ratio === null`, i.e. estimate was 0): emitted when
 *    `actual ≥ signalMinUsd` — real money was spent against no estimate baseline.
 * Both attach a downgrade suggestion when a cheaper tier is known.
 */
function buildSignal(ctx: SignalContext): OptimizationSignal | null {
  if (ctx.actualUsd < ctx.signalMinUsd) return null;

  const suggested = suggestCheaperModel(ctx.model, ctx.ladder);
  const tail = suggested ? `; consider ${suggested}.` : '.';

  if (ctx.ratio !== null) {
    if (ctx.ratio < ctx.signalRatioThreshold) return null;
    const severity: OptimizationSignal['severity'] =
      ctx.ratio >= ctx.warnRatioThreshold ? 'warn' : 'info';
    const message =
      `Task ${ctx.taskId} ran ${formatRatio(ctx.ratio)}× over estimate on ${ctx.model} ` +
      `(est ${formatUsd(ctx.estimatedUsd)} → actual ${formatUsd(ctx.actualUsd)})${tail}`;
    return { taskId: ctx.taskId, model: ctx.model, ratio: ctx.ratio, severity, suggestedModel: suggested, message };
  }

  // No estimate baseline, but real money was spent.
  const message =
    `Task ${ctx.taskId} cost ${formatUsd(ctx.actualUsd)} on ${ctx.model} ` +
    `with no estimate baseline${tail}`;
  return { taskId: ctx.taskId, model: ctx.model, ratio: null, severity: 'info', suggestedModel: suggested, message };
}

// ─── Main reconciliation ─────────────────────────────────────────────────────

/**
 * Reconcile a sprint's start-of-sprint cost estimate against its actual spend.
 *
 * Join semantics: results are matched to estimates by `taskId`/`id`.
 *  - `actualUsd` is the **exact** sum of `results[].cost.usd` (no rounding) — so
 *    callers can rely on `actualUsd === Σ results[].cost.usd`.
 *  - `estimatedUsd` is **apples-to-apples** with `actualUsd`: the sum of the
 *    matched per-task estimates (a result with no matching estimate contributes
 *    0 to the estimate, inflating variance honestly). When the estimate carries
 *    no `taskDetails`, it falls back to `estimate.totalApiCostUsd`.
 *  - A negative variance is an under-run; a positive variance is an over-run.
 *  - Tasks that were estimated but produced no result are excluded from the
 *    totals and surfaced via `unmatchedEstimateCount`.
 *
 * Pure and total: never throws, never performs I/O.
 */
export function reconcileSprint(
  estimate: ReconcileEstimate,
  results: ReconcileResult[],
  options: ReconcileOptions = {},
): SprintReconciliation {
  const overRunTolerance = options.overRunTolerance ?? DEFAULT_OVERRUN_TOLERANCE;
  const signalRatioThreshold = options.signalRatioThreshold ?? DEFAULT_SIGNAL_RATIO_THRESHOLD;
  const warnRatioThreshold = options.warnRatioThreshold ?? DEFAULT_WARN_RATIO_THRESHOLD;
  const signalMinUsd = options.signalMinUsd ?? DEFAULT_SIGNAL_MIN_USD;
  const ladder = { ...DEFAULT_DOWNGRADE_LADDER, ...(options.downgradeLadder ?? {}) };

  const taskDetails = estimate.taskDetails ?? [];
  const hasDetail = taskDetails.length > 0;

  // taskId → estimated cost (last write wins on duplicate ids).
  const estByTask = new Map<string, EstimatedTaskCost>();
  for (const detail of taskDetails) estByTask.set(detail.id, detail);

  const perTask: PerTaskReconciliation[] = [];
  const optimizationSignals: OptimizationSignal[] = [];
  const matchedIds = new Set<string>();

  let actualUsd = 0;
  let matchedEstimateSum = 0;
  let matchedCount = 0;
  let unestimatedCount = 0;

  for (const result of results) {
    const actual = sanitizeUsd(result.cost?.usd);
    actualUsd += actual;

    const est = estByTask.get(result.taskId);
    const estimatedUsd = est ? sanitizeUsd(est.costUsd) : 0;
    const unestimated = est === undefined;
    if (est) {
      matchedCount++;
      matchedEstimateSum += estimatedUsd;
      matchedIds.add(result.taskId);
    } else {
      unestimatedCount++;
    }

    const varianceUsd = actual - estimatedUsd;
    const ratio = estimatedUsd > 0 ? actual / estimatedUsd : null;
    const variancePct = estimatedUsd > 0 ? (varianceUsd / estimatedUsd) * 100 : null;
    const overRun = estimatedUsd > 0 ? actual > estimatedUsd * (1 + overRunTolerance) : actual > 0;

    perTask.push({
      taskId: result.taskId,
      model: result.model,
      provider: result.provider ?? null,
      estimatedUsd,
      actualUsd: actual,
      varianceUsd,
      variancePct,
      ratio,
      overRun,
      unestimated,
    });

    const signal = buildSignal({
      taskId: result.taskId,
      model: result.model,
      estimatedUsd,
      actualUsd: actual,
      ratio,
      signalRatioThreshold,
      warnRatioThreshold,
      signalMinUsd,
      ladder,
    });
    if (signal) optimizationSignals.push(signal);
  }

  // Apples-to-apples estimate: matched per-task sum, else the sprint total.
  const estimatedUsd = hasDetail ? matchedEstimateSum : sanitizeUsd(estimate.totalApiCostUsd);
  const varianceUsd = actualUsd - estimatedUsd;
  const variancePct = estimatedUsd > 0 ? (varianceUsd / estimatedUsd) * 100 : null;

  let unmatchedEstimateCount = 0;
  for (const detail of taskDetails) {
    if (!matchedIds.has(detail.id)) unmatchedEstimateCount++;
  }

  return {
    estimatedUsd,
    actualUsd,
    varianceUsd,
    variancePct,
    perTask,
    optimizationSignals,
    matchedCount,
    unestimatedCount,
    unmatchedEstimateCount,
  };
}

// ─── Display formatter (ready-to-wire for sprint summary + dashboard) ─────────

/** Format a signed variance % for display, or `n/a` when there is no baseline. */
function formatVariancePct(pct: number | null): string {
  if (pct === null) return 'n/a';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * Render a reconciliation report as a human-readable text block, mirroring the
 * cost-calculator's `formatEstimate` style. Surfaced in the sprint-finalize
 * summary and the dashboard reconciliation panel.
 */
export function formatReconciliation(rec: SprintReconciliation): string {
  const lines: string[] = [];
  lines.push(`\n📊 Estimate vs Actual`);
  lines.push(`${'='.repeat(50)}`);
  lines.push(`  Estimated:           ${formatUsd(rec.estimatedUsd)}`);
  lines.push(`  Actual:              ${formatUsd(rec.actualUsd)}`);
  lines.push(`  Variance:            ${formatUsd(rec.varianceUsd)} (${formatVariancePct(rec.variancePct)})`);
  lines.push(
    `  Tasks:               ${rec.matchedCount} matched` +
      `, ${rec.unestimatedCount} unestimated, ${rec.unmatchedEstimateCount} not run`,
  );

  if (rec.optimizationSignals.length > 0) {
    lines.push(`\nOptimization signals:`);
    for (const sig of rec.optimizationSignals) {
      const icon = sig.severity === 'warn' ? '⚠' : 'ℹ';
      lines.push(`  ${icon} ${sig.message}`);
    }
  }

  return lines.join('\n');
}
