// ═══ AgentEvent — the view-facing event stream (SP-1 §9) ════════════════════
// The agent core (M2 Part 2 loop) emits these; any view (Ink/web/IDE/headless)
// consumes them. Transport-neutral: in-proc AsyncIterable, SSE/WS, or NDJSON.

import type { NativeToolApprovalClassification, ToolPermissionTier } from './tools/types.js';
import type { ApprovalMode } from './permission-types.js';
import type { ProviderAdmissionDecision } from './provider-tooluse/types.js';
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
  readonly purpose: 'turn' | 'checkpoint';
}
export type GenerationRecoveryClassification =
  | 'OUTPUT_LIMIT'
  | 'EMPTY_VISIBLE_AFTER_REASONING'
  | 'TRANSPORT_EMPTY';
/** Privacy-safe generation recovery provenance. Hidden reasoning content is
 * never carried; only the fact that activity was observed crosses the loop. */
export interface GenerationRecoveryEvent {
  type: 'generation-recovery';
  classification: GenerationRecoveryClassification;
  continuationIndex: number;
  maxContinuations: number;
  hiddenReasoningObserved: boolean;
  action: 'continue' | 'hold';
}
/** `code` is a stable machine-readable id ('empty-response' | …) so views can
 *  localize known failure classes; `message` stays the English default for
 *  views without a localizer. */
export interface ErrorEvent { type: 'error'; message: string; code?: string; }
/** Non-terminal honest signal ('truncated' | 'context-compacted' | …): the turn
 *  continues, but the view must tell the user something degraded — silence here
 *  is what turned a full context window into a "model stopped replying" mystery. */
export interface NoticeEvent { type: 'notice'; code: string; message: string; }
/** NATIVE-AGENT-HORIZON-001: the loop asks the session layer to take a scratch
 *  checkpoint (cadence or no-progress). Data-only — the session/view decides
 *  how to fulfil and render it. */
export interface BudgetCheckpointRequestEvent {
  type: 'budget-checkpoint-request';
  reason: 'cadence-rounds' | 'cadence-toolcalls' | 'no-progress' | 'token-pressure';
  rounds: number;
  toolCalls: number;
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
  | BudgetCheckpointRequestEvent
  | ErrorEvent
  | NoticeEvent;

/** A turn is over once a terminal event is emitted. */
export function isTerminalEvent(e: AgentEvent): boolean {
  return e.type === 'turn-end' || e.type === 'error';
}
