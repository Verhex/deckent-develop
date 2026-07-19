// ═══ run-flow-contract — TERM-FLOW-UNIFY Sprint-1 dilim (422-001) ══════════
//
// docs/analysis/term-flow-unify-design-2026-07-11.md ("Net Öneri"): the typed
// contract for the host-owned RunFlow state machine that will eventually sit
// between the native-REPL conversational front-door and the actual
// plan→digest→approve→exact-snapshot→detached-run→completion pipeline. THIS
// slice defines the contract + a pure reducer only (see run-flow-reducer.ts,
// src/orchestra/) — no UI, no tool-bridge, no production caller. Gated behind
// the (currently unread) `terminal.run_flow_v2` config flag, default off.
//
// Domain-general by design (doc "Sonuç"): `RunProposal` sits on the canonical
// work-model axis (core/work-model.ts) — `ActorContext`/`RequestOrigin` are
// reused rather than re-invented — NOT on the code-repo/DIRECTIVES axis.
// DIRECTIVES/task-file/scope specifics remain a future code-repo ADAPTER's
// job (an adapter that turns a `RunProposal` into a `DirectiveBuildIntent`,
// e.g. via directives-builder.ts), never a field on this contract itself.
//
// Zero fs / env / Date.now / crypto.randomUUID here — every identifier and
// timestamp in this file's types is caller-supplied data, never generated.

import type { ActorContext, RequestOrigin } from './work-model.js';

// ═══ State ═══════════════════════════════════════════════════════════════

/**
 * The Net Öneri state set, verbatim:
 * COLLECTING → PROPOSAL_READY → PREVIEWING → AWAITING_APPROVAL → APPROVED →
 * STARTING → DETACHED_RUNNING → COMPLETED | FAILED | CANCELLED | BLOCKED.
 * The last four are terminal — see `isTerminalRunFlowState`.
 */
export type RunFlowState =
  | 'COLLECTING'
  | 'PROPOSAL_READY'
  | 'PREVIEWING'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'STARTING'
  | 'DETACHED_RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'BLOCKED';

/** No transition ever leaves one of these — the reducer rejects every event
 *  targeting a terminal-state context with a typed error (see run-flow-reducer.ts). */
export const RUN_FLOW_TERMINAL_STATES: ReadonlySet<RunFlowState> = new Set<RunFlowState>([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'BLOCKED',
]);

export function isTerminalRunFlowState(state: RunFlowState): boolean {
  return RUN_FLOW_TERMINAL_STATES.has(state);
}

// ═══ Payload types ═══════════════════════════════════════════════════════

/**
 * What the conversational front-door hands the coordinator to kick off a
 * flow — a typed proposal, never a raw tool-call sequence (design-doc
 * Option 3: "model yalnız typed RunProposal üretir").
 */
export interface RunProposal {
  readonly flowId: string;
  readonly tenant: string;
  readonly project: string;
  readonly actor: ActorContext;
  readonly origin: RequestOrigin;
  /** Monotonic per-flowId proposal revision — the CAS key half shared with `PlanPreview.planDigest`. */
  readonly revision: number;
  /** Domain-general NL summary of the intent — no code-repo/DIRECTIVES fields here (see file header). */
  readonly intentSummary: string;
}

export type RunFlowPolicyDecision = 'allow' | 'deny' | 'needs-approval';
export type RunFlowGateResult = 'pass' | 'fail' | 'skipped';

export interface RunFlowTaskSummary {
  readonly title: string;
  readonly summary: string;
}

/**
 * The actual (Brain-produced) plan preview, content-addressed by
 * `planDigest` — the CAS anchor approval and start both check against.
 */
export interface PlanPreview {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest: string;
  readonly taskSummaries: readonly RunFlowTaskSummary[];
  readonly policyDecision: RunFlowPolicyDecision;
  readonly gateResult: RunFlowGateResult;
  readonly estimatedCostUsd?: number;
  /** born-684: gate 'fail' dediğinde NEDENİ de yüzeye taşınır — onay-kararı
   *  körce verilmesin. Kısa insan-okur satırlar ("BLOCK 431-002 · g6-...: msg");
   *  planDigest payload'ına DAHİL DEĞİL (additive, CAS-nötr). */
  readonly gateFindings?: readonly string[];
  /**
   * Dogfood-449 B1 (born-698a'nın scope-ikizi): detached-child'ın PLAN fazı
   * pre-spawn SCOPE gate'inde de FAIL-CLOSED — ön-kapı aynı kararı burada
   * aynalar ki onay, sessizce ölecek bir koşuyu başlatamasın (dogfood-449'da
   * 3 ölü-koşu; ölüm yalnız .deckent/recently-works/ logunda görünüyordu).
   * 'skipped' = gate koşamadı (git yok) — child ile aynı şekilde fail-open.
   * planDigest payload'ına DAHİL DEĞİL (additive, CAS-nötr).
   */
  readonly scopeGateResult?: RunFlowGateResult;
  /** Gate'in kendi blok mesajı (verbatim) — yalnız scopeGateResult 'fail' iken. */
  readonly scopeGateMessage?: string;
  /** True: write-suspect'ler vardı ama --force-scope ile bilinçli geçildi. */
  readonly scopeGateOverridden?: boolean;
}

/**
 * Committed once approval succeeds. `revision`/`planDigest` here are the
 * exact-snapshot CAS fields `START_REQUESTED` must match — this is what lets
 * start "consume the approved snapshot" instead of re-running a fresh plan
 * (design doc's core complaint about today's B flow).
 */
export interface ApprovedPlanSnapshot {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest: string;
  readonly approvedBy: ActorContext;
  readonly approvedAt: string;
}

/** Correlator for the detached run once it has actually spawned. */
export interface RunHandle {
  readonly flowId: string;
  readonly jobId: string;
  readonly logRef: string;
}

// ═══ Events (versioned) ══════════════════════════════════════════════════

export const RUN_FLOW_EVENT_SCHEMA_VERSION = 1 as const;

interface RunFlowEventBase {
  readonly schemaVersion: typeof RUN_FLOW_EVENT_SCHEMA_VERSION;
  readonly flowId: string;
  /** Caller-supplied ISO-8601 timestamp — the reducer never calls Date.now(). */
  readonly timestamp: string;
  /** Optional command-dedup key — lets a store/adapter recognize a retried/replayed command. */
  readonly commandId?: string;
  /**
   * Optional store-assigned monotonic sequence for this event within its flow.
   * Purity contract: this field is assigned ONLY by the store; the reducer never
   * produces or reads it — sequence alanını YALNIZ store atar, reducer ASLA üretmez/okumaz.
   */
  readonly sequence?: number;
}

export type RunFlowEvent =
  | (RunFlowEventBase & { readonly type: 'PROPOSAL_SUBMITTED'; readonly proposal: RunProposal })
  | (RunFlowEventBase & { readonly type: 'PREVIEW_STARTED'; readonly revision: number })
  | (RunFlowEventBase & { readonly type: 'PREVIEW_READY'; readonly preview: PlanPreview })
  | (RunFlowEventBase & {
      readonly type: 'APPROVAL_GRANTED';
      readonly revision: number;
      readonly planDigest: string;
      readonly approvedBy: ActorContext;
    })
  | (RunFlowEventBase & { readonly type: 'APPROVAL_REJECTED'; readonly revision: number; readonly reason?: string })
  | (RunFlowEventBase & { readonly type: 'START_REQUESTED'; readonly revision: number; readonly planDigest: string })
  | (RunFlowEventBase & { readonly type: 'RUN_STARTED'; readonly handle: RunHandle })
  | (RunFlowEventBase & { readonly type: 'RUN_COMPLETED'; readonly summary?: string })
  | (RunFlowEventBase & { readonly type: 'RUN_FAILED'; readonly error: string })
  | (RunFlowEventBase & { readonly type: 'FLOW_ABORTED'; readonly reason?: string });

export type RunFlowEventType = RunFlowEvent['type'];

// ═══ Reducer aggregate (context) ════════════════════════════════════════

/**
 * The reducer's full state — richer than the bare `RunFlowState` enum
 * because `START_REQUESTED` must CAS-check against the committed
 * `approvedSnapshot`, and `RUN_STARTED` needs somewhere to attach the
 * eventual `RunHandle`. Every field beyond `state`/`flowId` is optional and
 * populated only once the corresponding stage has actually been reached.
 */
export interface RunFlowContext {
  readonly state: RunFlowState;
  /** Undefined until the first `PROPOSAL_SUBMITTED` event assigns it. */
  readonly flowId?: string;
  readonly proposal?: RunProposal;
  readonly preview?: PlanPreview;
  readonly approvedSnapshot?: ApprovedPlanSnapshot;
  readonly handle?: RunHandle;
  /** Populated when `state === 'CANCELLED'`. */
  readonly cancelReason?: 'rejected' | 'aborted';
  /** Populated when `state === 'BLOCKED'` — human-readable conflict description. */
  readonly blockedReason?: string;
  /** Populated when `state === 'FAILED'`. */
  readonly failureReason?: string;
  /** Timestamp of the last event that produced this context — caller-supplied, never generated here. */
  readonly updatedAt?: string;
}

/** Fresh, pre-proposal seed context. Frozen — the reducer never mutates in place, only spreads. */
export const INITIAL_RUN_FLOW_CONTEXT: Readonly<RunFlowContext> = Object.freeze({
  state: 'COLLECTING',
});

export function createInitialRunFlowContext(): RunFlowContext {
  return { ...INITIAL_RUN_FLOW_CONTEXT };
}

// ═══ Typed errors ════════════════════════════════════════════════════════

/**
 * Thrown for a genuinely invalid transition — an event that cannot apply to
 * the context's current state under ANY circumstance (a caller/programming
 * bug, not a business conflict). Distinct from `BLOCKED`, which is a normal
 * *returned* state for a detected revision/digest conflict (see
 * run-flow-reducer.ts) — "geçersiz-geçiş = typed-hata (sessiz no-op YASAK)".
 */
export class RunFlowTransitionError extends Error {
  public readonly flowId: string | undefined;
  public readonly fromState: RunFlowState;
  public readonly eventType: RunFlowEventType;

  constructor(flowId: string | undefined, fromState: RunFlowState, eventType: RunFlowEventType, message: string) {
    super(message);
    this.name = 'RunFlowTransitionError';
    this.flowId = flowId;
    this.fromState = fromState;
    this.eventType = eventType;
  }
}
