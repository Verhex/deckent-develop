/**
 * `deckent usage` — Token/limit consumption view from Claude Code transcripts
 *
 * Default: last-7-day model-level table (calls, in/out/cw tokens, limit-$ equiv, cache hit%)
 * --sprint <N>: per-task breakdown for sprint N (uses limit-ledger-report sprint aggregation)
 * --since/--until: ISO window override
 * --json: machine-readable output
 * --lineage: archived-evidence lineage-authority projection (exact attempt totals, logical
 *   task denominators, cache fields, typed unavailable billing) — independent of the
 *   transcript-ledger branch below; see core/lineage-usage-authority.ts (486-004)
 *
 * Uses transcript-ledger ground-truth (parseTranscriptUsage) — worker self-estimates in
 * .result files are 3-5× lower; this command surfaces the real numbers.
 *
 * F1-TOK Faz 1 — Sprint 273 Task 273-003
 * CLI usage lineage projection — 486-010
 */

import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { loadConfig, DEFAULT_PROMPT_CONFIG } from '../../core/config.js';
import { DeckentError } from '../../core/errors.js';
import { parseTranscriptUsage, limitCost, resolveModelPrice } from '../../core/limit-ledger.js';
import type { UsageRecord, LedgerOpts, LedgerPrices } from '../../core/limit-ledger.js';
import { summarizeSprint, buildTranscriptTaskMap, evaluateCacheGate } from '../../core/limit-ledger-report.js';
import type { SprintUsageSummary, CacheGateReport } from '../../core/limit-ledger-report.js';
import { buildLedgerPrices } from '../../core/cost-config-loader.js';
import {
  discoverSprintArchiveIds,
  resolveTaskArtifactReadDirs,
} from '../../core/sprint-archive.js';
import { aggregateLineageUsageAuthority } from '../../core/lineage-usage-authority.js';
import { comparePromptCostCanary, type PromptCostCanaryDecision, type PromptCostCanaryPlan, type PromptCostCanarySample } from '../../core/prompt-cost-canary.js';
import { readPromptCostCanaryArchiveCohort, type PromptCostCanaryArchiveReadResult, type PromptCostCanaryCohortSample } from '../../core/prompt-cost-canary-archive.js';
import {
  discoverPromptCostCanaryReceipts,
  promptCostCanaryDecisionDigest,
  PromptCostCanaryReceiptStoreError,
  publishPromptCostCanaryReceipt,
  type PromptCostCanaryComparisonDecision,
  type PromptCostCanaryReceipt,
  type PublishPromptCostCanaryReceiptResult,
} from '../../core/prompt-cost-canary-receipt-store.js';
import type {
  LineageUsageAuthorityInput,
  LineageUsageAuthorityTask,
  LineageUsageAttempt,
  LineageBillingAuthority,
} from '../../core/lineage-usage-authority.js';

// ─── Injectable deps ────────────────────────────────────────────────────────

export interface UsageDeps {
  parseFn?: (opts: LedgerOpts) => Promise<UsageRecord[]>;
  buildTaskMapFn?: (opts: LedgerOpts) => Promise<Record<string, string>>;
  costPricesFn?: (root: string) => LedgerPrices;
  configFn?: (root: string) => Promise<{ language?: string; usage?: { weekly_budget_equiv?: number } }>;
  /** `--lineage` mode: archived task/result evidence, never the transcript ledger. */
  lineageInputFn?: (
    root: string,
    sprintTaskIdPrefix?: string,
  ) => LineageUsageAuthorityInput | Promise<LineageUsageAuthorityInput>;
  canaryArchiveFn?: (input: { projectRoot: string; sprintIds: readonly [string, string] }) => PromptCostCanaryArchiveReadResult;
  canaryCompareFn?: (plan: PromptCostCanaryPlan) => PromptCostCanaryDecision;
  canaryPublishFn?: (input: { projectRoot: string; environmentId: string; tenantId: string; decision: PromptCostCanaryComparisonDecision; publishedAt: string }) => PublishPromptCostCanaryReceiptResult;
  canaryDiscoverFn?: (input: { projectRoot: string; environmentId: string; tenantId: string }) => readonly PromptCostCanaryReceipt[];
  nowFn?: () => string;
}

// ─── Build task map (session file → task ID) ─────────────────────────────────
// Shared implementation lives in core/limit-ledger-report.ts so the retro
// Limit-burn row and the mid-sprint cost guard use the same mapping.

const defaultBuildTaskMap = buildTranscriptTaskMap;

// ─── Default cost prices builder ─────────────────────────────────────────────
// Shared implementation lives in core/cost-config-loader.ts (buildLedgerPrices).

const defaultCostPrices = buildLedgerPrices;

// ─── Default config reader ────────────────────────────────────────────────────

async function defaultConfigFn(
  root: string,
): Promise<{ language?: string; usage?: { weekly_budget_equiv?: number } }> {
  // Read language from loadConfig (handles 3-layer merge)
  const cfg = await loadConfig(root).catch(() => ({ language: 'en' as const }));
  // Read usage.weekly_budget_equiv from raw .deckent/config.json (optional extension field)
  let weeklyBudget: number | undefined;
  const rawPath = join(root, '.deckent', 'config.json');
  if (existsSync(rawPath)) {
    try {
      const { readFileSync } = await import('node:fs');
      const raw = JSON.parse(readFileSync(rawPath, 'utf-8')) as Record<string, unknown>;
      const usageSection = raw['usage'] as Record<string, unknown> | undefined;
      const val = usageSection?.['weekly_budget_equiv'];
      if (typeof val === 'number' && val > 0) weeklyBudget = val;
    } catch {
      // ignore — field is optional
    }
  }
  return {
    language: (cfg as Record<string, unknown>)['language'] as string | undefined,
    usage: weeklyBudget !== undefined ? { weekly_budget_equiv: weeklyBudget } : undefined,
  };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtPct(r: number): string {
  return `${Math.round(r * 100)}%`;
}

// ─── Per-model aggregation ────────────────────────────────────────────────────

interface ModelSummary {
  model: string;
  calls: number;
  in: number;
  out: number;
  cacheRead: number;
  cacheWrite: number;
  limitCostVal: number;
  hitRate: number;
}

function aggregateByModel(records: UsageRecord[], prices: LedgerPrices): ModelSummary[] {
  const groups = new Map<string, UsageRecord[]>();
  for (const r of records) {
    let arr = groups.get(r.model);
    if (!arr) { arr = []; groups.set(r.model, arr); }
    arr.push(r);
  }
  const out: ModelSummary[] = [];
  for (const [model, recs] of groups) {
    let totalIn = 0, totalOut = 0, totalCr = 0, totalCw = 0;
    for (const r of recs) {
      totalIn += r.in; totalOut += r.out; totalCr += r.cacheRead; totalCw += r.cacheWrite;
    }
    out.push({
      model,
      calls: recs.length,
      in: totalIn,
      out: totalOut,
      cacheRead: totalCr,
      cacheWrite: totalCw,
      limitCostVal: limitCost(recs, prices),
      hitRate: totalIn + totalCr > 0 ? totalCr / (totalIn + totalCr) : 0,
    });
  }
  return out.sort((a, b) => b.limitCostVal - a.limitCostVal);
}

// ─── Default 7-day window ────────────────────────────────────────────────────

function sevenDaysAgoISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ─── Lineage projection (--lineage) ──────────────────────────────────────────
// Consumes core/lineage-usage-authority.ts (486-004) over ARCHIVED task/result
// evidence, never the transcript ledger above. `Task` (core/task-types.ts) has
// no native `billingAuthority` field, so it is derived per archived task from
// its own settled result's `cost.billingMode` — the only place this system
// already records how an attempt was billed.

const ARCHIVED_TASK_FILE = /^task-([\w-]{1,100})\.json$/;

function mapBillingModeToAuthority(mode: unknown): LineageBillingAuthority {
  switch (mode) {
    case 'api': return 'metered';
    case 'subscription': return 'subscription';
    case 'free_tier': return 'free-tier';
    case 'local': return 'local';
    default: return 'unknown';
  }
}

/** A task id with more than one distinct billing mode across its archived attempts is hybrid. */
function deriveTaskBillingAuthority(modes: readonly unknown[]): LineageBillingAuthority {
  const mapped = new Set(modes.map(mapBillingModeToAuthority));
  if (mapped.size === 0) return 'unknown';
  if (mapped.size > 1) return 'hybrid';
  return [...mapped][0]!;
}

function readJsonRecordSafe(path: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function numberField(record: Record<string, unknown> | undefined, key: string): number {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function buildArchivedAttempt(
  taskId: string,
  fixForTaskId: string | undefined,
  result: Record<string, unknown>,
): LineageUsageAttempt {
  const tokenUsage = result['tokenUsage'] as Record<string, unknown> | undefined;
  const cost = result['cost'] as Record<string, unknown> | undefined;
  const providerBilling = result['providerBilling'] as Record<string, unknown> | undefined;
  const invoicedRaw = providerBilling?.['providerReportedUsd'];
  return {
    id: taskId,
    taskId,
    fixForTaskId,
    inputTokens: numberField(tokenUsage, 'inputTokens'),
    outputTokens: numberField(tokenUsage, 'outputTokens'),
    cacheReadTokens: numberField(tokenUsage, 'cacheReadTokens'),
    cacheCreationTokens: numberField(tokenUsage, 'cacheCreationTokens'),
    // `cost.usd` is a calculated reference value (never an invoice — see
    // lineage-usage-authority.ts's own header comment).
    referenceCostUsd: numberField(cost, 'usd'),
    invoicedCostUsd: typeof invoicedRaw === 'number' && Number.isFinite(invoicedRaw) ? invoicedRaw : undefined,
  };
}

/**
 * Default archive reader: `.deckent/archive/sprints/<sprint-id>/task-<id>.json`
 * paired with `task-<id>.result`. A task file with no matching result file
 * contributes a task entry (billing authority resolves to 'unknown') but no
 * attempt — honest absence of settled evidence, never a fabricated zero.
 */
function defaultReadArchivedLineageInput(
  root: string,
  sprintTaskIdPrefix?: string,
): LineageUsageAuthorityInput {
  const tasks: LineageUsageAuthorityTask[] = [];
  const attempts: LineageUsageAttempt[] = [];
  const listFiles = (directory: string): string[] => {
    const files: string[] = [];
    const pending = [directory];
    while (pending.length > 0) {
      const current = pending.pop()!;
      let entries;
      try { entries = readdirSync(current, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        const path = join(current, entry.name);
        if (entry.isDirectory()) pending.push(path);
        else if (entry.isFile()) files.push(path);
      }
    }
    return files;
  };
  const seenTaskIds = new Set<string>();
  for (const sprintId of discoverSprintArchiveIds(root)) {
    const files = resolveTaskArtifactReadDirs(root, sprintId).flatMap(listFiles);
    const resultByTaskId = new Map<string, Record<string, unknown>>();
    for (const path of files) {
      const filename = basename(path);
      if (!filename.startsWith('task-') || (!filename.endsWith('.result') && !filename.endsWith('.result.json'))) continue;
      const result = readJsonRecordSafe(path);
      if (typeof result?.['taskId'] === 'string' && !resultByTaskId.has(result['taskId'])) {
        resultByTaskId.set(result['taskId'], result);
      }
    }

    for (const path of files) {
      const filename = basename(path);
      const match = ARCHIVED_TASK_FILE.exec(filename);
      if (!match) continue;
      const taskId = match[1]!;
      if (sprintTaskIdPrefix && !taskId.startsWith(sprintTaskIdPrefix)) continue;
      if (seenTaskIds.has(taskId)) continue;

      const taskRecord = readJsonRecordSafe(path);
      if (!taskRecord || taskRecord['id'] !== taskId) continue;
      seenTaskIds.add(taskId);
      const fixForTaskId = typeof taskRecord['fixForTaskId'] === 'string'
        ? taskRecord['fixForTaskId'] as string
        : undefined;
      const resultRecord = resultByTaskId.get(taskId) ?? null;

      const billingMode = (resultRecord?.['cost'] as Record<string, unknown> | undefined)?.['billingMode'];
      tasks.push({ id: taskId, billingAuthority: deriveTaskBillingAuthority([billingMode]) });

      if (resultRecord) {
        attempts.push(buildArchivedAttempt(taskId, fixForTaskId, resultRecord));
      }
    }
  }

  return { tasks: Object.freeze(tasks), attempts: Object.freeze(attempts) };
}

function lineageLabel(key: string, lang: string, vars?: Record<string, string>): string {
  return getMessage(`usage.lineage_${key}`, lang, vars);
}

// PROMOTE/REJECT policy is config-owned (prompt.canary_thresholds +
// prompt.canary_cost_authority, KANUN 10); the strict defaults live in
// core/config.ts as the single source — on any config-load failure this
// resolver falls back to those same defaults, never to caller literals.
interface CanaryPolicy {
  readonly thresholds: PromptCostCanaryPlan['thresholds'];
  readonly costAuthorityPolicy: 'auto' | 'provider-usd-strict';
}

async function resolveCanaryPolicy(root: string): Promise<CanaryPolicy> {
  const cfg = await loadConfig(root).catch(() => null);
  const configured = cfg?.prompt?.canary_thresholds;
  const defaults = DEFAULT_PROMPT_CONFIG.canary_thresholds;
  return {
    thresholds: {
      minimumQualityPassRate: configured?.minimumQualityPassRate ?? defaults.minimumQualityPassRate!,
      maximumQualityPassRateRegression: configured?.maximumQualityPassRateRegression ?? defaults.maximumQualityPassRateRegression!,
      maximumCostPerLineageIncreaseRatio: configured?.maximumCostPerLineageIncreaseRatio ?? defaults.maximumCostPerLineageIncreaseRatio!,
      minimumCacheHitRatio: configured?.minimumCacheHitRatio ?? defaults.minimumCacheHitRatio!,
      maximumCacheHitRatioRegression: configured?.maximumCacheHitRatioRegression ?? defaults.maximumCacheHitRatioRegression!,
    },
    costAuthorityPolicy: cfg?.prompt?.canary_cost_authority ?? DEFAULT_PROMPT_CONFIG.canary_cost_authority,
  };
}

export type UsageCanaryReasonCode = PromptCostCanaryDecision['reasonCodes'][number]
  | 'archive_evidence_rejected' | 'provider_reported_usd_unavailable'
  | 'cache_measurement_unavailable';

interface UsageCanaryProjection {
  readonly schema: 'deckent.usage-canary'; readonly version: 1; readonly baselineSprint: string; readonly candidateSprint: string;
  readonly decision: { readonly disposition: 'PROMOTE' | 'HOLD' | 'REJECT'; readonly costAuthority: 'provider-reported-usd' | 'token-total' | null; readonly reasonCodes: readonly UsageCanaryReasonCode[]; readonly planDigest: string | null; readonly kernelDecisionDigest: string | null };
  readonly measuredHitRatio: { readonly denominator: 'inputTokens+cacheReadTokens+cacheCreationTokens'; readonly baseline: number | null; readonly candidate: number | null; readonly delta: number | null };
  readonly providerReportedUsd: { readonly baseline: UsdProjection; readonly candidate: UsdProjection; readonly delta: number | null };
  readonly qualityParity: { readonly baselinePassRate: number | null; readonly candidatePassRate: number | null; readonly delta: number | null };
}
type UsdPricingClass = 'provider-reported' | 'subscription-unpriced' | 'partial' | 'unmeasured';
interface UsdProjection { readonly available: boolean; readonly pricing: UsdPricingClass; readonly sampleCount: number; readonly availableSampleCount: number; readonly exactUsd: number | null }
export interface UsageCanaryOutput extends UsageCanaryProjection {
  readonly mode: 'dry-run' | 'applied'; readonly decisionDigest: string;
  readonly receipt: null | { readonly state: 'created' | 'existing-identical'; readonly receiptId: string; readonly decisionDigest: string };
}

function cohortIdentity(
  samples: readonly PromptCostCanaryCohortSample[],
  sprintId: string,
  featureComparisonId: string,
) {
  const unique = (values: readonly string[]) => [...new Set(values)].sort().join('+') || 'unavailable';
  return { cohortId: sprintId, comparisonId: 'deckent-usage-canary-v1',
    providerId: unique(samples.map(sample => sample.provider)), modelId: unique(samples.map(sample => sample.model)),
    billingClass: unique(samples.map(sample => `${sample.billingSource.billingMode ?? 'unknown'}:${sample.billingSource.tokenSource}:${sample.billingSource.pricingSource}`)),
    // The ordered A/B pair (not one side alone) is the comparison identity.
    // This permits an intentional feature toggle while binding both exact
    // plan-time snapshots into the kernel plan/decision digest.
    featureId: featureComparisonId };
}

function homogeneousFeatureDigest(samples: readonly PromptCostCanaryCohortSample[]): string | null {
  const values = [...new Set(samples.map(sample => sample.featureDigest))];
  return values.length === 1 ? values[0]! : null;
}

function featureComparisonId(baseline: string, candidate: string): string {
  return `sha256:${createHash('sha256').update(JSON.stringify([baseline, candidate]), 'utf8').digest('hex')}`;
}

function kernelSample(
  sample: PromptCostCanaryCohortSample,
  costAuthority: 'provider-reported-usd' | 'token-total',
): PromptCostCanarySample {
  return { logicalLineageId: sample.logicalLineageId, inputTokens: sample.tokenUsage.inputTokens,
    cacheReadTokens: sample.tokenUsage.cacheReadTokens, cacheCreationTokens: sample.tokenUsage.cacheCreationTokens,
    outputTokens: sample.tokenUsage.outputTokens,
    providerReportedUsd: costAuthority === 'token-total' ? null : sample.providerReportedUsd.usd!,
    ...(sample.durationMs === null ? {} : { durationMs: sample.durationMs }),
    qualityVerdict: sample.verdict === 'NO_GO' ? 'FAIL' : 'PASS' };
}

function usdProjection(samples: readonly PromptCostCanaryCohortSample[]): UsdProjection {
  const available = samples.filter(sample => sample.providerReportedUsd.available && sample.providerReportedUsd.usd !== null);
  const complete = samples.length > 0 && available.length === samples.length;
  const pricing: UsdPricingClass = samples.length === 0 ? 'unmeasured'
    : complete ? 'provider-reported'
      : available.length === 0 ? 'subscription-unpriced' : 'partial';
  return { available: complete, pricing, sampleCount: samples.length, availableSampleCount: available.length,
    exactUsd: complete ? available.reduce((sum, sample) => sum + sample.providerReportedUsd.usd!, 0) : null };
}

function hasMeasuredCacheDenominator(samples: readonly PromptCostCanaryCohortSample[]): boolean {
  return samples.length > 0 && samples.every(sample =>
    sample.tokenUsage.inputTokens + sample.tokenUsage.cacheReadTokens
      + sample.tokenUsage.cacheCreationTokens > 0);
}

function holdProjection(baselineSprint: string, candidateSprint: string, reasonCode: UsageCanaryReasonCode,
  baselineSamples: readonly PromptCostCanaryCohortSample[] = [], candidateSamples: readonly PromptCostCanaryCohortSample[] = []): UsageCanaryProjection {
  return { schema: 'deckent.usage-canary', version: 1, baselineSprint, candidateSprint,
    decision: { disposition: 'HOLD', costAuthority: null, reasonCodes: [reasonCode], planDigest: null, kernelDecisionDigest: null },
    measuredHitRatio: { denominator: 'inputTokens+cacheReadTokens+cacheCreationTokens', baseline: null, candidate: null, delta: null },
    providerReportedUsd: { baseline: usdProjection(baselineSamples), candidate: usdProjection(candidateSamples), delta: null },
    qualityParity: { baselinePassRate: null, candidatePassRate: null, delta: null } };
}

async function runUsageCanary(options: UsageCommandOptions, deps: UsageDeps, root: string, lang: string): Promise<void> {
  const baselineSprint = options.baselineSprint!; const candidateSprint = options.candidateSprint!;
  const archive = (deps.canaryArchiveFn ?? readPromptCostCanaryArchiveCohort)({ projectRoot: root, sprintIds: [baselineSprint, candidateSprint] });
  let projection: UsageCanaryProjection;
  if (!archive.ok) projection = holdProjection(baselineSprint, candidateSprint, 'archive_evidence_rejected');
  else {
    const baselineSamples = archive.samples.filter(sample => sample.sprintId === baselineSprint);
    const candidateSamples = archive.samples.filter(sample => sample.sprintId === candidateSprint);
    const baselineUsd = usdProjection(baselineSamples); const candidateUsd = usdProjection(candidateSamples);
    const baselineFeature = homogeneousFeatureDigest(baselineSamples);
    const candidateFeature = homogeneousFeatureDigest(candidateSamples);
    const policy = await resolveCanaryPolicy(root);
    // Cost-authority resolution (owner decision 2026-08-25): full provider USD
    // on both arms keeps USD authority; two fully-unpriced (subscription) arms
    // settle on token-total under the `auto` policy; any partial/mixed pricing
    // stays a typed HOLD — evidence classes are never blended.
    const costAuthority: 'provider-reported-usd' | 'token-total' | null
      = baselineUsd.available && candidateUsd.available ? 'provider-reported-usd'
        : policy.costAuthorityPolicy === 'auto'
          && baselineUsd.pricing === 'subscription-unpriced' && candidateUsd.pricing === 'subscription-unpriced'
          ? 'token-total' : null;
    if (costAuthority === null) projection = holdProjection(baselineSprint, candidateSprint, 'provider_reported_usd_unavailable', baselineSamples, candidateSamples);
    else if (baselineFeature === null || candidateFeature === null) {
      projection = holdProjection(baselineSprint, candidateSprint, 'feature_mismatch', baselineSamples, candidateSamples);
    }
    else if (!hasMeasuredCacheDenominator(baselineSamples) || !hasMeasuredCacheDenominator(candidateSamples)) {
      projection = holdProjection(baselineSprint, candidateSprint, 'cache_measurement_unavailable', baselineSamples, candidateSamples);
    }
    else {
      const featureId = featureComparisonId(baselineFeature, candidateFeature);
      const kernel = (deps.canaryCompareFn ?? comparePromptCostCanary)({ version: 1,
        baseline: { identity: cohortIdentity(baselineSamples, baselineSprint, featureId), samples: baselineSamples.map(sample => kernelSample(sample, costAuthority)) },
        candidate: { identity: cohortIdentity(candidateSamples, candidateSprint, featureId), samples: candidateSamples.map(sample => kernelSample(sample, costAuthority)) },
        thresholds: policy.thresholds,
        ...(costAuthority === 'token-total' ? { costAuthority } : {}) });
      projection = { schema: 'deckent.usage-canary', version: 1, baselineSprint, candidateSprint,
        decision: { disposition: kernel.disposition, costAuthority, reasonCodes: kernel.reasonCodes, planDigest: kernel.planDigest, kernelDecisionDigest: kernel.decisionDigest },
        measuredHitRatio: { denominator: 'inputTokens+cacheReadTokens+cacheCreationTokens', baseline: kernel.baseline.cacheHitRatio, candidate: kernel.candidate.cacheHitRatio, delta: kernel.deltas.cacheHitRatio },
        providerReportedUsd: { baseline: baselineUsd, candidate: candidateUsd, delta: kernel.deltas.providerReportedUsd },
        qualityParity: { baselinePassRate: kernel.baseline.qualityPassRate, candidatePassRate: kernel.candidate.qualityPassRate, delta: kernel.deltas.qualityPassRate } };
    }
  }
  const receiptDecision = projection as unknown as PromptCostCanaryComparisonDecision;
  const decisionDigest = promptCostCanaryDecisionDigest(receiptDecision);
  if (options.apply && options.decisionDigest !== decisionDigest) {
    throw new DeckentError(
      'USAGE_CANARY_APPLY_DIGEST_MISMATCH',
      getMessage('usage.canary.apply_digest_mismatch', lang),
    );
  }
  const receiptScope = { projectRoot: root, environmentId: options.environment ?? 'default', tenantId: options.tenant ?? 'default' };
  let published: null | Pick<PublishPromptCostCanaryReceiptResult, 'state' | 'receipt'> = null;
  if (options.apply) {
    let existing: PromptCostCanaryReceipt | undefined;
    // Injected publishers remain self-contained unless their test/adapter also
    // injects discovery. Production first consults fresh durable bytes so a
    // repeated apply of one digest is idempotent despite wall-clock drift.
    if (!deps.canaryPublishFn || deps.canaryDiscoverFn) {
      try {
        existing = [...(deps.canaryDiscoverFn ?? discoverPromptCostCanaryReceipts)(receiptScope)]
          .filter(receipt => receipt.decisionDigest === decisionDigest)
          .sort((left, right) => left.publishedAt.localeCompare(right.publishedAt)
            || left.receiptId.localeCompare(right.receiptId))[0];
      } catch (error) {
        if (!(error instanceof PromptCostCanaryReceiptStoreError) || error.code !== 'RECEIPT_NOT_FOUND') throw error;
      }
    }
    published = existing
      ? { state: 'existing-identical', receipt: existing }
      : (deps.canaryPublishFn ?? publishPromptCostCanaryReceipt)({
        ...receiptScope, decision: receiptDecision,
        publishedAt: (deps.nowFn ?? (() => new Date().toISOString()))(),
      });
  }
  const output: UsageCanaryOutput = { ...projection, mode: published ? 'applied' : 'dry-run', decisionDigest,
    receipt: published ? { state: published.state, receiptId: published.receipt.receiptId, decisionDigest: published.receipt.decisionDigest } : null };
  print(options.json ? JSON.stringify(output, null, 2) : getMessage('usage.canary.summary', lang,
    { mode: output.mode, decision: output.decision.disposition, digest: output.decisionDigest,
      authority: output.decision.costAuthority ?? 'unresolved' }));
}

// ─── Run command ──────────────────────────────────────────────────────────────

export interface UsageCommandOptions {
  sprint?: string;
  since?: string;
  until?: string;
  json?: boolean;
  lineage?: boolean;
  baselineSprint?: string;
  candidateSprint?: string;
  apply?: boolean;
  decisionDigest?: string;
  environment?: string;
  tenant?: string;
}

export async function runUsageCommand(
  options: UsageCommandOptions,
  deps: UsageDeps = {},
): Promise<void> {
  const root = resolveProjectRoot();
  const configFn = deps.configFn ?? defaultConfigFn;
  const cfg = await configFn(root);
  const lang = getLanguage(cfg.language);
  const hasBaseline = options.baselineSprint !== undefined;
  const hasCandidate = options.candidateSprint !== undefined;
  if (hasBaseline !== hasCandidate) {
    throw new DeckentError(
      'USAGE_CANARY_BOTH_SPRINTS_REQUIRED',
      getMessage('usage.canary.both_sprints_required', lang),
    );
  }
  if (!hasBaseline && (options.decisionDigest || options.environment || options.tenant)) {
    throw new DeckentError(
      'USAGE_CANARY_SCOPE_REQUIRES_COMPARISON',
      getMessage('usage.canary.scope_requires_comparison', lang),
    );
  }
  if (hasBaseline && (options.sprint || options.since || options.until || options.lineage)) {
    throw new DeckentError(
      'USAGE_CANARY_MUTUALLY_EXCLUSIVE',
      getMessage('usage.canary.mutually_exclusive', lang),
    );
  }
  if (options.apply && !hasBaseline) {
    throw new DeckentError(
      'USAGE_CANARY_APPLY_REQUIRES_COMPARISON',
      getMessage('usage.canary.apply_requires_comparison', lang),
    );
  }
  if (hasBaseline) { await runUsageCanary(options, deps, root, lang); return; }

  // ─── Lineage mode (--lineage) ──────────────────────────────────────
  // Archived task/result evidence only — never falls through to the
  // transcript-ledger branch below (that authority is out of scope for this
  // projection by design; see docImpact note above LINEAGE_LABELS).
  if (options.lineage) {
    const lineageInputFn = deps.lineageInputFn ?? defaultReadArchivedLineageInput;
    const sprintTaskIdPrefix = options.sprint ? `${options.sprint}-` : undefined;
    const input = await lineageInputFn(root, sprintTaskIdPrefix);
    const aggregates = aggregateLineageUsageAuthority(input);

    if (options.json) {
      print(JSON.stringify(aggregates, null, 2));
      return;
    }

    if (aggregates.length === 0) {
      print(getMessage('usage.no_data', lang));
      return;
    }

    const headers = [
      getMessage('usage.col_task', lang),
      lineageLabel('col_attempts', lang),
      lineageLabel('col_in', lang),
      lineageLabel('col_out', lang),
      lineageLabel('col_cache_r', lang),
      lineageLabel('col_cache_c', lang),
      lineageLabel('col_ref_usd', lang),
      lineageLabel('col_billed', lang),
    ];

    // Exact integer/decimal values throughout — this projection's whole point
    // is exact attempt totals, so no fmtTokens K/M-abbreviation and no forced
    // 2-decimal rounding like the transcript-window table below.
    const rows = aggregates.map((aggregate) => [
      aggregate.logicalRootTaskId,
      String(aggregate.attempts.length),
      String(aggregate.tokenUsage.inputTokens),
      String(aggregate.tokenUsage.outputTokens),
      String(aggregate.tokenUsage.cacheReadTokens),
      String(aggregate.tokenUsage.cacheCreationTokens),
      `$${aggregate.referenceCostUsd}`,
      aggregate.billedUsd.state === 'known'
        ? `$${aggregate.billedUsd.usd}`
        : `${lineageLabel('billed_unknown', lang)} (${aggregate.billedUsd.reason})`,
    ]);

    print(lineageLabel('header', lang));
    print('');
    print(formatTable(headers, rows));
    print('');
    const totalAttempts = aggregates.reduce((sum, aggregate) => sum + aggregate.attempts.length, 0);
    print(lineageLabel('denominator', lang, {
      logical: String(aggregates.length),
      attempts: String(totalAttempts),
    }));
    return;
  }

  const parseFn = deps.parseFn ?? parseTranscriptUsage;
  const costPricesFn = deps.costPricesFn ?? defaultCostPrices;
  const buildTaskMapFn = deps.buildTaskMapFn ?? defaultBuildTaskMap;

  // ─── Window defaults ──────────────────────────────────────────────
  const since = options.since ?? (options.sprint ? undefined : sevenDaysAgoISO());
  const until = options.until;

  const ledgerOpts: LedgerOpts = { since, until };

  // ─── Parse transcripts ────────────────────────────────────────────
  const records = await parseFn(ledgerOpts);

  if (records.length === 0) {
    if (options.json) {
      print('[]');
      return;
    }
    print(getMessage('usage.no_data', lang));
    return;
  }

  const prices = costPricesFn(root);

  // ─── Unknown-model guard ──────────────────────────────────────────
  // A model that resolves to no price contributes $0 to every cost column.
  // That silence hid a 2.4× under-report for 8 sprints (stale cost-config
  // keys vs drifting transcript model IDs, 2026-06-11 analysis) — surface
  // it loudly instead.
  if (!options.json) {
    const unresolved = [...new Set(records.map((r) => r.model))]
      .filter((m) => resolveModelPrice(prices, m) === null)
      .sort();
    if (unresolved.length > 0) {
      print(getMessage('usage.unknown_models', lang, { models: unresolved.join(', ') }));
    }
  }

  // ─── Sprint mode ──────────────────────────────────────────────────
  if (options.sprint) {
    const sprintNum = options.sprint;
    const allTaskMap = await buildTaskMapFn(ledgerOpts);

    // Filter to sprint N tasks only (taskId starts with "{N}-")
    const prefix = `${sprintNum}-`;
    const filteredMap: Record<string, string> = {};
    for (const [sessionFile, taskId] of Object.entries(allTaskMap)) {
      if (taskId.startsWith(prefix)) filteredMap[sessionFile] = taskId;
    }

    const summary: SprintUsageSummary = summarizeSprint(records, filteredMap, prices);
    const cacheGate: CacheGateReport = evaluateCacheGate(records, filteredMap);

    if (options.json) {
      print(JSON.stringify({ ...summary, cacheGate }, null, 2));
      return;
    }

    if (summary.tasks.length === 0) {
      print(getMessage('usage.no_sprint_data', lang, { sprint: sprintNum }));
      return;
    }

    print(getMessage('usage.header_sprint', lang, { sprint: sprintNum }));
    print('');

    const headers = [
      getMessage('usage.col_task', lang),
      getMessage('usage.col_model', lang),
      getMessage('usage.col_calls', lang),
      getMessage('usage.col_output', lang),
      getMessage('usage.col_cw', lang),
      getMessage('usage.col_boot_cw', lang),
      getMessage('usage.col_cost', lang),
    ];

    const rows = summary.tasks.map((t) => [
      t.taskId,
      t.model,
      String(t.calls),
      fmtTokens(t.out),
      fmtTokens(t.cacheWrite),
      fmtTokens(t.bootstrapCw),
      fmtCost(t.limitCost),
    ]);

    // Totals row
    const tot = summary.totals;
    rows.push([
      getMessage('usage.totals', lang),
      '',
      String(tot.calls),
      fmtTokens(tot.out),
      fmtTokens(tot.cacheWrite),
      '',
      fmtCost(tot.limitCost),
    ]);

    print(formatTable(headers, rows));

    // Cache gate line
    print('');
    if (!cacheGate.applicable) {
      print(getMessage('usage.cache_gate_na', lang));
    } else {
      const status = cacheGate.pass ? 'PASS' : 'FAIL';
      const share = Math.round(cacheGate.warmShare * 100).toString();
      const taskId = cacheGate.warmTaskId ?? '?';
      print(getMessage('usage.cache_gate', lang, { status, share, taskId }));
    }
    return;
  }

  // ─── Default window mode ──────────────────────────────────────────
  const modelSummaries = aggregateByModel(records, prices);

  if (options.json) {
    print(JSON.stringify(modelSummaries, null, 2));
    return;
  }

  // Header
  if (since && !until) {
    print(getMessage('usage.header_window', lang, { days: '7' }));
  } else if (since && until) {
    print(getMessage('usage.header_since_until', lang, { since, until }));
  } else {
    print(getMessage('usage.header_window', lang, { days: '7' }));
  }
  print('');

  const headers = [
    getMessage('usage.col_model', lang),
    getMessage('usage.col_calls', lang),
    getMessage('usage.col_input', lang),
    getMessage('usage.col_output', lang),
    getMessage('usage.col_cw', lang),
    getMessage('usage.col_cost', lang),
    getMessage('usage.col_hit_rate', lang),
  ];

  let totalCalls = 0, totalIn = 0, totalOut = 0, totalCw = 0, totalCost = 0, totalCr = 0;
  const rows = modelSummaries.map((m) => {
    totalCalls += m.calls;
    totalIn += m.in;
    totalOut += m.out;
    totalCw += m.cacheWrite;
    totalCr += m.cacheRead;
    totalCost += m.limitCostVal;
    return [
      m.model,
      String(m.calls),
      fmtTokens(m.in),
      fmtTokens(m.out),
      fmtTokens(m.cacheWrite),
      fmtCost(m.limitCostVal),
      fmtPct(m.hitRate),
    ];
  });

  // Totals row
  const totalHitRate = totalIn + totalCr > 0 ? totalCr / (totalIn + totalCr) : 0;
  rows.push([
    getMessage('usage.totals', lang),
    String(totalCalls),
    fmtTokens(totalIn),
    fmtTokens(totalOut),
    fmtTokens(totalCw),
    fmtCost(totalCost),
    fmtPct(totalHitRate),
  ]);

  print(formatTable(headers, rows));

  // Optional weekly budget reference line
  const budgetEquiv = cfg.usage?.weekly_budget_equiv;
  if (typeof budgetEquiv === 'number') {
    print('');
    print(getMessage('usage.budget_ref', lang, { budget: budgetEquiv.toFixed(0) }));
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerUsage(program: Command): void {
  program
    .command('usage')
    .description(getMessage('cli.usage.desc', getLanguage(undefined)))
    .option('--sprint <N>', getMessage('usage.option.sprint', getLanguage(undefined)))
    .option('--since <ISO>', getMessage('usage.option.since', getLanguage(undefined)))
    .option('--until <ISO>', getMessage('usage.option.until', getLanguage(undefined)))
    .option('--json', getMessage('usage.option.json', getLanguage(undefined)))
    .option('--lineage', getMessage('usage.option.lineage', getLanguage(undefined)))
    .option('--baseline-sprint <id>', getMessage('usage.option.baseline_sprint', getLanguage(undefined)))
    .option('--candidate-sprint <id>', getMessage('usage.option.candidate_sprint', getLanguage(undefined)))
    .option('--apply', getMessage('usage.option.apply', getLanguage(undefined)))
    .option('--decision-digest <sha256>', getMessage('usage.option.decision_digest', getLanguage(undefined)))
    .option('--environment <id>', getMessage('usage.option.environment', getLanguage(undefined)))
    .option('--tenant <id>', getMessage('usage.option.tenant', getLanguage(undefined)))
    .action(async (opts) => {
      await runUsageCommand(opts);
    });
}
