// ─── plan-preview-service — TERM-FLOW-UNIFY Sprint-2 dilim (424-001) ───────
//
// docs/analysis/term-flow-unify-design-2026-07-11.md: today's A and B flows
// each render a plan-preview that is NOT the actual Brain plan (A: markdown
// text from DirectiveBuildIntent only; B: real plan text with no digest at
// all) — and neither binds preview to execution by content hash, a TOCTOU
// risk the design calls out explicitly. This module is the single shared
// fix: it calls the REAL plan-generation core (`planSprint`, re-exported via
// `./brain.js` — the same module CLI `plan` and MCP `deckent_plan` already
// import, so existing tests that mock that module transparently cover calls
// routed through here too) and derives a content-addressed `planDigest` from
// its result.
//
// DOMAIN-STATE READ-ONLY by construction, not just by convention: `PlanPreviewOptions`
// has no `dryRun`/`asDraft` field at all — there is nothing a caller could
// pass to make this service write a task file. `planSprint` is always
// invoked with `dryRun: true` (sprint-planner.ts's own write-guard), so
// `.tasks/task-*.json` is never touched from this path. Append-only operational
// evidence (InvocationReceipt/audit ledger) is still persisted because an AI
// preview is a real, potentially billable provider call. Preview receipts use
// a unique attempt identity, so they cannot replay-block the later real plan.
//
// `planDigest` deliberately excludes `sprint.id`/`task.id` (those depend on
// `getNextSprintId`'s filesystem-counter state, not on DIRECTIVES content)
// — only `taskSummaries`/`gateResult`/`policyDecision` (all pure functions
// of the planned tasks + prompt-gate outcome) are hashed, so identical
// DIRECTIVES always produce an identical digest regardless of how many
// prior sprints exist on disk.

import { createHash } from 'node:crypto';
import { planSprint } from './brain.js';
import { canonicalJson } from '../core/audit-writer.js';
import type {
  BrainContext, BrainPlanningMode, ResolvedConfig, Sprint, SprintSizeRecommendation,
} from '../core/types.js';
import type {
  RunFlowGateResult, RunFlowPolicyDecision, RunFlowTaskSummary,
} from '../core/run-flow-contract.js';

export interface PlanPreviewOptions {
  mode?: BrainPlanningMode;
  acknowledgePromptGate?: boolean;
}

export interface PlanPreviewResult {
  /** The real planned sprint (tasks, reasoning, planningMode, promptGate) — never persisted here. */
  readonly sprint: Sprint;
  /** sha256(canonicalJson({taskSummaries, gateResult, policyDecision})), hex-encoded. */
  readonly planDigest: string;
  readonly taskSummaries: readonly RunFlowTaskSummary[];
  readonly gateResult: RunFlowGateResult;
  readonly policyDecision: RunFlowPolicyDecision;
  /** born-684: promptGate bulgularının insan-okur özeti (digest-dışı). */
  readonly gateFindings: readonly string[];
}

function computeTaskSummaries(sprint: Sprint): RunFlowTaskSummary[] {
  return sprint.tasks.map((task) => ({ title: task.title, summary: task.description }));
}

function computeGateResult(sprint: Sprint): RunFlowGateResult {
  if (!sprint.promptGate) return 'skipped';
  return sprint.promptGate.ok ? 'pass' : 'fail';
}

/** born-684: gate-bulgularını kısa insan-okur satırlara indir (digest-dışı). */
function computeGateFindings(sprint: Sprint): readonly string[] {
  if (!sprint.promptGate) return [];
  return sprint.promptGate.findings.map(
    (f) => `${f.level.toUpperCase()} ${f.taskId} · ${f.lint}: ${f.message}`,
  );
}

function computePolicyDecision(gateResult: RunFlowGateResult): RunFlowPolicyDecision {
  return gateResult === 'fail' ? 'needs-approval' : 'allow';
}

function computePlanDigest(
  taskSummaries: readonly RunFlowTaskSummary[],
  gateResult: RunFlowGateResult,
  policyDecision: RunFlowPolicyDecision,
): string {
  const payload = { taskSummaries, gateResult, policyDecision };
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

/**
 * Generate a read-only plan preview from the real plan-generation core. This
 * is the ONLY plan-preview code path — CLI `plan` (--dry-run branch) and MCP
 * `deckent_plan` both delegate here instead of calling `planSprint` ad hoc.
 */
export async function generatePlanPreview(
  root: string,
  config: ResolvedConfig,
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  options?: PlanPreviewOptions,
): Promise<PlanPreviewResult> {
  const sprint = await planSprint(root, config, context, recommendation, {
    mode: options?.mode,
    acknowledgePromptGate: options?.acknowledgePromptGate,
    dryRun: true,
  });

  const taskSummaries = computeTaskSummaries(sprint);
  const gateResult = computeGateResult(sprint);
  const policyDecision = computePolicyDecision(gateResult);
  const planDigest = computePlanDigest(taskSummaries, gateResult, policyDecision);

  return { sprint, planDigest, taskSummaries, gateResult, policyDecision, gateFindings: computeGateFindings(sprint) };
}
