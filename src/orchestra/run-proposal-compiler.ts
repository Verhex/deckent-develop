// ─── run-proposal-compiler — TERM-FLOW-UNIFY Sprint-2 dilim (424-001) ──────
//                              + N678A planner-core mount (429-001, born-678)
//
// docs/analysis/term-flow-unify-design-2026-07-11.md ("Organ nakli olacak
// parçalar"): directives-builder.ts stays the code-repo proposal ADAPTER —
// this module is that adapter's other end. It turns a domain-general
// `RunProposal` (core/run-flow-contract.ts, sprint-422 contract — no
// DIRECTIVES/files/scope fields by design) into a `DirectiveBuildIntent` and
// then calls the UNCHANGED `buildDirectives()` to render markdown. Zero
// modification to directives-builder.ts — it is called, never touched.
//
// born-678 (P0): the original 424-001 slice stopped at a single-task
// TODO-SCAFFOLD (`compileRunProposalIntent`'s own comment called real
// decomposition "an explicit native-flow follow-up") — the prompt-gate
// correctly rejected that, so a RunProposal never became a runnable plan.
// This slice replaces the scaffold with an INJECTABLE planner-seam
// (`RunProposalPlanner`): production delegates to the same AI/structured
// planner core sprint-planner.ts itself uses for NL splitting
// (`callZeroConfigPlanner`, orchestra/planner.ts) to turn `intentSummary`
// into a REAL multi-task plan (task decomposition + file scope + per-task
// verifiable goCriteria/nogo). Tests inject a hermetic fake planner instead
// — never a real AI/provider call. A planner failure is a typed
// `RunProposalPlanError`, never a silent fall-back to a scaffold.
//
// `buildPlanNlIntent` (cli/commands/plan-nl.ts) draws the same single-task
// scaffold boundary for a raw NL goal string — it stays canonical-dead here;
// this module does not import or revive it, it goes straight to the
// planner core instead.
//
// Proposal metadata (flowId/tenant/project/actor/origin/revision) is folded
// into each task's description as plain traceability prose — never as a
// "Label: value" line — so it can never collide with directives-builder's
// RESERVED_LABEL_RE / heading guards (assertSafeField, buildTaskBlock).

import type { RunProposal } from '../core/run-flow-contract.js';
import type { DeckentConfig, PlannerResult, PlannerTask } from '../core/types.js';
import { resolveBrainModel } from '../core/config.js';
import { buildDirectives, type DirectiveBuildIntent, type DirectiveBuildTask } from './directives-builder.js';
import { callZeroConfigPlanner } from './planner.js';

export interface RunProposalCompileResult {
  readonly intent: DirectiveBuildIntent;
  readonly directivesMarkdown: string;
}

/**
 * Injectable NL -> plan seam. Production default (`defaultRunProposalPlanner`)
 * calls the real AI/structured planner core; tests inject a hermetic fake that
 * returns a canned `PlannerResult` — never a real subprocess/provider call.
 * The optional `config` param (Task 431-003) lets a caller drive the planner's
 * model choice via `resolveBrainModel(config)`; omitted by every fake planner
 * that ignores it, so existing single-param injected planners stay assignable.
 */
export type RunProposalPlanner = (proposal: RunProposal, config?: DeckentConfig) => PlannerResult;

/**
 * Thrown when NL -> plan compilation fails to produce a real, usable plan —
 * the planner core threw, returned nothing, or returned zero tasks. Never
 * swallowed into a TODO scaffold (born-678): a proposal that cannot be
 * planned is a typed failure for the caller to handle, not a silently
 * degraded placeholder task.
 */
export class RunProposalPlanError extends Error {
  public readonly flowId: string;

  constructor(flowId: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RunProposalPlanError';
    this.flowId = flowId;
  }
}

function describeActor(proposal: RunProposal): string {
  const { actor } = proposal;
  return actor.role ? `${actor.id} (${actor.role})` : actor.id;
}

function traceabilityLine(proposal: RunProposal): string {
  return (
    `RunProposal metadata — flowId=${proposal.flowId}, revision=${proposal.revision}, ` +
    `tenant=${proposal.tenant}, project=${proposal.project}, actor=${describeActor(proposal)}, ` +
    `origin=${proposal.origin}.`
  );
}

/**
 * Production planner: delegates to the SAME AI/structured planner core
 * sprint-planner.ts uses for zero-config NL splitting (`callZeroConfigPlanner`
 * — buildZeroConfigPlanPrompt + provider spawn + parsePlannerResponse),
 * scoped to this proposal's `intentSummary`. A null/empty result throws the
 * typed `RunProposalPlanError` directly (error-registry lint: no generic
 * throws in orchestra/) — `compileRunProposalIntent` still guarantees ANY
 * planner failure (this default OR an injected one) surfaces as the same
 * typed class, so both paths honor the "never scaffold" contract.
 *
 * Model selection (Task 431-003, born-683 continuation): `resolveBrainModel(config)`
 * replaces the former bare `'sonnet'` literal. `config` is left WITHOUT a default
 * value on purpose — every current call site omits it, and `resolveBrainModel(undefined)`
 * already falls back to `DEFAULT_MODES['balanced'].brain_model` = `'sonnet'`, so existing
 * behavior is reproduced exactly. Do not default `config` to `createDefaultConfig()`: that
 * resolves `mode: 'performance'` -> `brain_model: 'opus'`, a silent regression.
 */
function defaultRunProposalPlanner(proposal: RunProposal, config?: DeckentConfig): PlannerResult {
  const description = proposal.intentSummary.trim();
  const result = callZeroConfigPlanner(description, resolveBrainModel(config), proposal.project);
  if (!result) {
    throw new RunProposalPlanError(
      proposal.flowId,
      'AI planner core returned no usable plan (provider unavailable, timed out, or produced an ' +
        'unparseable response).',
    );
  }
  return result;
}

/** Map one real, AI-decomposed `PlannerTask` to a `DirectiveBuildTask` — no TODO placeholders. */
function toDirectiveTask(task: PlannerTask, proposal: RunProposal): DirectiveBuildTask {
  return {
    title: task.title,
    desc: `${task.description}\n\n${traceabilityLine(proposal)}\n\nReason: ${task.reason}`,
    files: [...task.scope.filesWrite],
    scope: [...task.scope.directories],
    deps: [...task.dependencies],
    model: task.model,
    effort: task.effort,
    skills: task.forceSkills,
    goCriteria: [task.goNogo.goCriteria],
    nogo: [task.goNogo.noGoCriteria],
  };
}

/**
 * Map a `RunProposal` to a real, multi-task {@link DirectiveBuildIntent} via
 * the injectable planner seam (`planner` defaults to the production AI/
 * structured planner core — see {@link defaultRunProposalPlanner}). Throws
 * {@link RunProposalPlanError} rather than degrading to a scaffold when the
 * planner cannot produce at least one real task. The optional `config`
 * (Task 431-003) is forwarded to `planner` untouched, driving
 * `resolveBrainModel(config)` in the production default.
 */
export function compileRunProposalIntent(
  proposal: RunProposal,
  planner: RunProposalPlanner = defaultRunProposalPlanner,
  config?: DeckentConfig,
): DirectiveBuildIntent {
  let plan: PlannerResult;
  try {
    plan = planner(proposal, config);
  } catch (e) {
    if (e instanceof RunProposalPlanError) throw e;
    throw new RunProposalPlanError(
      proposal.flowId,
      `run-proposal-compiler: planner failed to produce a real plan for flowId=${proposal.flowId}: ` +
        `${e instanceof Error ? e.message : String(e)} — refusing to fall back to a TODO scaffold.`,
      { cause: e },
    );
  }
  if (!plan.tasks || plan.tasks.length === 0) {
    throw new RunProposalPlanError(
      proposal.flowId,
      `run-proposal-compiler: planner returned zero tasks for flowId=${proposal.flowId} — ` +
        'a real plan must contain at least one task.',
    );
  }

  return {
    title: `RunProposal ${proposal.flowId}`,
    goal: proposal.intentSummary.trim(),
    tasks: plan.tasks.map((task) => toDirectiveTask(task, proposal)),
  };
}

/**
 * Compile a `RunProposal` straight to DIRECTIVES.md markdown. Calls
 * buildDirectives() purely (in-memory, no fs) — this function never writes
 * DIRECTIVES.md or any other file itself; that stays the caller's job. The
 * optional `config` (Task 431-003) is forwarded to `compileRunProposalIntent`.
 */
export function compileRunProposal(
  proposal: RunProposal,
  planner: RunProposalPlanner = defaultRunProposalPlanner,
  config?: DeckentConfig,
): RunProposalCompileResult {
  const intent = compileRunProposalIntent(proposal, planner, config);
  const directivesMarkdown = buildDirectives(intent);
  return { intent, directivesMarkdown };
}
