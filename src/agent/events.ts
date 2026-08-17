// ═══ AgentEvent — the view-facing event stream (SP-1 §9) ════════════════════
// The agent core (M2 Part 2 loop) emits these; any view (Ink/web/IDE/headless)
// consumes them. Transport-neutral: in-proc AsyncIterable, SSE/WS, or NDJSON.

import type { ToolPermissionTier } from './tools/types.js';
import type { ApprovalMode } from './permission-types.js';

export interface TextDeltaEvent { type: 'text-delta'; text: string; }
export interface ToolProposedEvent { type: 'tool-proposed'; id: string; tool: string; args: Record<string, unknown>; }
export interface PermissionRequestEvent { type: 'permission-request'; id: string; tool: string; resource: string; tier: ToolPermissionTier; }
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
export interface ToolResultEvent { type: 'tool-result'; id: string; tool: string; ok: boolean; output: string; }
export interface TurnEndEvent { type: 'turn-end'; }
export interface UsageEvent { type: 'usage'; inputTokens: number; outputTokens: number; }
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
  | BudgetCheckpointRequestEvent
  | ErrorEvent
  | NoticeEvent;

/** A turn is over once a terminal event is emitted. */
export function isTerminalEvent(e: AgentEvent): boolean {
  return e.type === 'turn-end' || e.type === 'error';
}
