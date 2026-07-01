// ─── TERM-FLOW — Golden-Flow Orchestrator (Sprint 354, Task 354-007) ───────
//
// Single pure orchestrator for the simple-task golden flow: NL goal → intent →
// plan-preview → approve → start → evaluate-summary. Every external effect
// (deriving intent from the goal, prompting for approval, actually starting a
// sprint, evaluating its result) is an injected seam — this module performs
// zero LLM calls, zero process exec, and zero file I/O of its own. The one
// piece of real logic it owns is the directives-builder call used to render
// the plan-preview markdown; buildDirectives() is already pure/in-memory (no
// writer exists on that path), so calling it here satisfies the "READ-ONLY
// kullan" requirement by construction — a real DIRECTIVES.md is never touched.
//
// Step-by-step progress is emitted through `seams.onEvent` in a TERM-LIVE-feed
// shape (`running`/`next` human-readable labels + ISO timestamp) so a future
// REPL/dashboard wiring task can drive the live footer directly from these
// events. This module does not import cli/ (ADR-D-004 C2: orchestra MUST NOT
// import cli/), so the event shape is defined locally rather than reusing
// LiveFooterState — it is compatible by convention, not by type.
//
// Cancellation is checked at every stage boundary via `seams.signal`
// (AbortSignal, mirroring autonomous/runtime-loop.ts's convention) and via the
// approve-seam's own reject path — both collapse to the same
// `{ status: 'cancelled', stage, reason }` outcome so callers handle one shape.
//
// Wiring the real seams (LLM intent-derivation, sprint start, evaluation) is an
// explicit follow-up — this module stays generic over the start/evaluate result
// shapes so it never needs to know about concrete sprint-controller types.

import { buildDirectives, type DirectiveBuildIntent } from './directives-builder.js';

// ═══ Types ═══════════════════════════════════════════════════════════════

export type GoldenFlowStage = 'intent' | 'plan' | 'approve' | 'start' | 'evaluate';

/** Why a flow ended in `cancelled` — signal-based abort vs. an explicit approve-reject. */
export type GoldenFlowCancelReason = 'aborted' | 'rejected';

export type GoldenFlowEventStatus = 'start' | 'done' | 'cancelled' | 'error';

/** TERM-LIVE-feed-shaped progress event — see file header for the compatibility note. */
export interface GoldenFlowEvent {
  stage: GoldenFlowStage;
  status: GoldenFlowEventStatus;
  reason?: GoldenFlowCancelReason;
  /** What's currently running / just finished, human-readable. */
  running?: string;
  /** What happens next, human-readable. */
  next?: GoldenFlowStage;
  timestamp: string;
  error?: string;
}

export interface GoldenFlowPlanPreviewTask {
  title: string;
  files: string[];
  scope: string[];
  goCriteria: string[];
}

/** Read-only preview payload rendered from directives-builder — never persisted to disk. */
export interface GoldenFlowPlanPreview {
  directivesMarkdown: string;
  taskCount: number;
  tasks: GoldenFlowPlanPreviewTask[];
}

/**
 * Injectable seam bag — defaults wire nothing real (unlike connect-wizard's
 * createDefaultConnectProbes): this task's nogo forbids an actual LLM call or
 * actual sprint start from this module, so every seam is caller-supplied.
 */
export interface GoldenFlowSeams<TStart, TEvaluate> {
  /** LLM seam — NL goal to structured directive intent. Faked in tests. */
  deriveIntent: (goal: string) => Promise<DirectiveBuildIntent> | DirectiveBuildIntent;
  /** Approval seam for the plan preview. `false` = reject → clean cancel. */
  approvePlan: (preview: GoldenFlowPlanPreview) => Promise<boolean> | boolean;
  /** Exec seam — starts the approved plan. Never called before approval or after cancel. */
  startSprint: (preview: GoldenFlowPlanPreview, intent: DirectiveBuildIntent) => Promise<TStart> | TStart;
  /** Evaluate seam — turns the start-result into a final summary. */
  evaluateSprint: (startResult: TStart) => Promise<TEvaluate> | TEvaluate;
  /** Step-by-step progress sink, TERM-LIVE-feed-shaped. Optional. */
  onEvent?: (event: GoldenFlowEvent) => void;
  /** Cancellation checkpoint polled before every stage. */
  signal?: AbortSignal;
  /** Deterministic clock for event timestamps — defaults to `() => new Date()`. */
  now?: () => Date;
}

export type GoldenFlowResult<TStart, TEvaluate> =
  | {
      status: 'completed';
      intent: DirectiveBuildIntent;
      preview: GoldenFlowPlanPreview;
      start: TStart;
      evaluate: TEvaluate;
    }
  | { status: 'cancelled'; stage: GoldenFlowStage; reason: GoldenFlowCancelReason };

// ═══ Plan Preview (builder-seam, READ-ONLY) ═════════════════════════════

/**
 * Renders the plan-preview payload from a structured intent. Calls
 * buildDirectives() purely to obtain markdown text held in memory — this
 * function never writes DIRECTIVES.md or any other file.
 */
export function buildPlanPreview(intent: DirectiveBuildIntent): GoldenFlowPlanPreview {
  const directivesMarkdown = buildDirectives(intent);
  return {
    directivesMarkdown,
    taskCount: intent.tasks.length,
    tasks: intent.tasks.map((task) => ({
      title: task.title,
      files: [...task.files],
      scope: [...task.scope],
      goCriteria: [...task.goCriteria],
    })),
  };
}

// ═══ Orchestrator ════════════════════════════════════════════════════════

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type Emit = (event: Omit<GoldenFlowEvent, 'timestamp'>) => void;

/** Shared start/done/error event envelope for the four single-outcome stages. */
async function runStage<T>(
  emit: Emit,
  stage: GoldenFlowStage,
  running: string,
  next: GoldenFlowStage | undefined,
  work: () => Promise<T> | T,
): Promise<T> {
  emit({ stage, status: 'start', running, next });
  try {
    const result = await work();
    emit({ stage, status: 'done', running, next });
    return result;
  } catch (err) {
    emit({ stage, status: 'error', running, error: toErrorMessage(err) });
    throw err;
  }
}

/**
 * Run the simple-task golden flow: goal → intent → plan-preview → approve →
 * start → evaluate. Every effectful step is an injected seam (see
 * {@link GoldenFlowSeams}); this function itself performs no I/O beyond the
 * in-memory buildDirectives() call inside {@link buildPlanPreview}.
 */
export async function runGoldenFlow<TStart = unknown, TEvaluate = unknown>(
  goal: string,
  seams: GoldenFlowSeams<TStart, TEvaluate>,
): Promise<GoldenFlowResult<TStart, TEvaluate>> {
  const now = seams.now ?? (() => new Date());
  const emit: Emit = (event) => {
    seams.onEvent?.({ ...event, timestamp: now().toISOString() });
  };
  const cancelledOnAbort = (stage: GoldenFlowStage): GoldenFlowResult<TStart, TEvaluate> => {
    emit({ stage, status: 'cancelled', reason: 'aborted' });
    return { status: 'cancelled', stage, reason: 'aborted' };
  };

  if (seams.signal?.aborted) return cancelledOnAbort('intent');
  const intent = await runStage(emit, 'intent', 'Deriving intent from goal', 'plan', () =>
    seams.deriveIntent(goal),
  );

  if (seams.signal?.aborted) return cancelledOnAbort('plan');
  const preview = await runStage(emit, 'plan', 'Building plan preview', 'approve', () =>
    buildPlanPreview(intent),
  );

  if (seams.signal?.aborted) return cancelledOnAbort('approve');
  emit({ stage: 'approve', status: 'start', running: 'Awaiting plan approval', next: 'start' });
  let approved: boolean;
  try {
    approved = await seams.approvePlan(preview);
  } catch (err) {
    emit({ stage: 'approve', status: 'error', error: toErrorMessage(err) });
    throw err;
  }
  if (!approved) {
    emit({ stage: 'approve', status: 'cancelled', reason: 'rejected' });
    return { status: 'cancelled', stage: 'approve', reason: 'rejected' };
  }
  emit({ stage: 'approve', status: 'done', running: 'Plan approved', next: 'start' });

  if (seams.signal?.aborted) return cancelledOnAbort('start');
  const start = await runStage(emit, 'start', 'Starting sprint', 'evaluate', () =>
    seams.startSprint(preview, intent),
  );

  if (seams.signal?.aborted) return cancelledOnAbort('evaluate');
  const evaluate = await runStage(emit, 'evaluate', 'Evaluating sprint result', undefined, () =>
    seams.evaluateSprint(start),
  );

  return { status: 'completed', intent, preview, start, evaluate };
}
