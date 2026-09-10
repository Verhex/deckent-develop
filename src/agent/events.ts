// ═══ AgentEvent — the view-facing event stream (SP-1 §9) ════════════════════
// The agent core (M2 Part 2 loop) emits these; any view (Ink/web/IDE/headless)
// consumes them. Transport-neutral: in-proc AsyncIterable, SSE/WS, or NDJSON.

import type { ReferenceDigestProgress } from './reference-digest-types.js';
import type { NativeToolApprovalClassification, ToolPermissionTier } from './tools/types.js';
import type { ApprovalMode } from './permission-types.js';
import type { ProviderAdmissionDecision, RequestMeasurementQuality } from './provider-tooluse/types.js';
import type { NativePermissionInvocation } from './native-permission-binding.js';

export interface TextDeltaEvent { type: 'text-delta'; text: string; }
export interface ToolProposedEvent { type: 'tool-proposed'; id: string; tool: string; args: Record<string, unknown>; }
export interface PermissionRequestEvent {
  readonly type: 'permission-request';
  readonly id: string;
  readonly tool: string;
  readonly resource: string;
  readonly tier: ToolPermissionTier;
  /** Producer-owned, non-secret authorization classification for the broker. */
  readonly approval: NativeToolApprovalClassification;
  /** Deep-frozen safe display/request projection; raw args remain session-owned. */
  readonly maskedArgs: Readonly<Record<string, unknown>>;
  /** Immutable session-owned identity of this exact proposed invocation. */
  readonly invocation: NativePermissionInvocation;
}
export interface PermissionAutoDecisionEvent {
  type: 'permission-auto-decision';
  tool: string;
  resource: string;
  resourceClass: 'safe-read' | 'modify' | 'destructive' | 'non-shell';
  decision: 'allow' | 'deny';
  matchedRule: string | null;
  mode: ApprovalMode;
  tier: ToolPermissionTier;
  grantLifetime: 'none' | 'session' | 'always';
  floor: boolean;
}
export interface ToolExecutingEvent { type: 'tool-executing'; id: string; tool: string; }
export interface ToolResultEvent { type: 'tool-result'; id: string; tool: string; ok: boolean; output: string; code?: string; }
export interface TurnEndEvent { type: 'turn-end'; }
export interface UsageEvent { type: 'usage'; inputTokens: number; outputTokens: number; }
export interface RequestMeasurementEvent {
  readonly type: 'request-measurement';
  readonly decision: ProviderAdmissionDecision;
  readonly purpose: 'turn' | 'checkpoint' | 'reference-map' | 'reference-reduce' | 'reference-interim';
}
export type GenerationRecoveryClassification =
  | 'OUTPUT_LIMIT'
  | 'EMPTY_VISIBLE_AFTER_REASONING'
  | 'TRANSPORT_EMPTY';
/** Privacy-safe generation recovery provenance. Hidden reasoning content is
 * never carried; only the fact that activity was observed crosses the loop. */
/** 7108 — the two reasoning-exhaustion recovery actions join the classic
 *  continuation pair: ONE bounded retry of the SAME request, either with hidden
 *  reasoning switched off (descriptor-toggleable) or with a raised, config-bounded
 *  ceiling. `hold` after such a retry is the typed end of the turn. */
export type GenerationRecoveryAction = 'continue' | 'hold' | 'retry-reasoning-off' | 'retry-raised-ceiling';
export interface GenerationRecoveryEvent {
  type: 'generation-recovery';
  classification: GenerationRecoveryClassification;
  continuationIndex: number;
  maxContinuations: number;
  hiddenReasoningObserved: boolean;
  action: GenerationRecoveryAction;
}
/** 7108 — live hidden-reasoning progress (metadata only, privacy contract
 *  7086/RCA §3: character counts, never the reasoning text) so a view can show
 *  a collapsed "thinking… ~N tokens" indicator while nothing visible streams. */
export interface ReasoningActivityEvent {
  type: 'reasoning-activity';
  /** Characters observed in this delta. */
  chars: number;
  /** Characters observed since the current provider request started. */
  cumulativeChars: number;
}
/** Localization variables for a coded signal: plain values the view interpolates
 *  into the catalog row (`{code}`, `{retries}`, …). Never secrets, never prompt text. */
export type SignalVars = Readonly<Record<string, string>>;
/** `code` is a stable machine-readable id ('empty-response' | …) so views can
 *  localize known failure classes; `message` stays the English default for
 *  views without a localizer. */
export interface ErrorEvent { type: 'error'; message: string; code?: string; vars?: SignalVars; }
/** Non-terminal honest signal ('truncated' | 'context-compacted' | …): the turn
 *  continues, but the view must tell the user something degraded — silence here
 *  is what turned a full context window into a "model stopped replying" mystery. */
export interface NoticeEvent { type: 'notice'; code: string; message: string; vars?: SignalVars; }
/** NATIVE-AGENT-HORIZON-001: the loop asks the session layer to take a scratch
 *  checkpoint (cadence or no-progress). Data-only — the session/view decides
 *  how to fulfil and render it. */
/** Typed justification when token-pressure is measured from context share. */
export interface BudgetCheckpointPressure {
  readonly retainedTokens: number;
  readonly capTokens: number;
  readonly windowTokens: number;
  readonly quality: RequestMeasurementQuality;
  /** `tool-results` = retained tool bodies; `full-request` = admission overflow. */
  readonly scope: 'tool-results' | 'full-request';
}

export interface BudgetCheckpointRequestEvent {
  type: 'budget-checkpoint-request';
  reason: 'cadence-rounds' | 'cadence-toolcalls' | 'no-progress' | 'token-pressure';
  rounds: number;
  toolCalls: number;
  /** Present for measured token-pressure checkpoints from the loop's share math. */
  pressure?: BudgetCheckpointPressure;
}

/** 7114 — host-enforced interim deliverable lifecycle (counts only, never
 *  text). `required`: the loop injected the interim-answer host turn (the view
 *  shows a localized notice); `delivered`: a visible answer of at least the
 *  configured size landed and the counters reset; `continued`: the model
 *  answered a request with text only and the loop appended one continue
 *  host turn instead of ending the turn. */
export interface InterimDeliverableEvent {
  type: 'interim-deliverable';
  /** `overdue` = the wall-clock bound passed while a round was still streaming;
   *  the host reports it honestly and never claims an answer it cannot force. */
  phase: 'required' | 'delivered' | 'continued' | 'overdue';
  /** 7114-b — which ask this is: a routine interim, the honest final answer the
   *  per-turn tool ceiling forces, or the stop on a repeatedly failing target. */
  demand?: 'interim' | 'final' | 'failure-stop';
  /** failure-stop only: the exact target (tool + resource) that kept failing. */
  target?: string;
  attempts?: number;
  /** Tool calls executed in the WHOLE turn (the per-turn ceiling's own count). */
  toolCallsThisTurn?: number;
  trigger?: 'tool-calls' | 'elapsed';
  /** Tool calls executed since the last deliverable (at the moment of the event). */
  toolCalls: number;
  /** Milliseconds since the last deliverable (at the moment of the event). */
  elapsedMs: number;
}

/** 7113 D — live host progress of one large-reference digest program. Carries
 *  the host's own projection (journal phase, verified sections, settled usage,
 *  deadline); no source bytes and no model text ever ride this event. */
export interface ReferenceProgressEvent {
  type: 'reference-progress';
  progress: ReferenceDigestProgress;
}

export type AgentEvent =
  | TextDeltaEvent
  | ToolProposedEvent
  | PermissionRequestEvent
  | PermissionAutoDecisionEvent
  | ToolExecutingEvent
  | ToolResultEvent
  | TurnEndEvent
  | UsageEvent
  | RequestMeasurementEvent
  | GenerationRecoveryEvent
  | ReasoningActivityEvent
  | BudgetCheckpointRequestEvent
  | InterimDeliverableEvent
  | ReferenceProgressEvent
  | ErrorEvent
  | NoticeEvent;

/** A turn is over once a terminal event is emitted. */
export function isTerminalEvent(e: AgentEvent): boolean {
  return e.type === 'turn-end' || e.type === 'error';
}
