// ═══ Context budget — transcript window fitting (SP-1 §13 follow-up) ════════
// Small local models (Ollama, 8k–32k ctx) silently truncate an over-budget
// prompt server-side: HTTP 200, `truncated=1`, ~0 tokens of generation room —
// the turn "completes" empty and the REPL looks dead (2026-07-07 incident,
// memory: project_native_repl_model_switch_noop_and_ctx_overflow). This module
// fits the transcript into an explicit token budget CLIENT-side, so the loop
// both keeps generation room and can tell the user compaction happened.
//
// Pure + injectable: no I/O, no provider knowledge — estimation is chars/4
// (the cross-tokenizer rule of thumb; deliberately conservative via ceil).

import type { ProviderMessage } from './provider-tooluse/types.js';

/** ~4 chars per token — the cross-model rule of thumb, rounded up. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Estimate one message: content + serialized tool calls + a small per-message
 *  envelope overhead (role/framing tokens the wire formats add). */
export function estimateMessageTokens(m: ProviderMessage): number {
  let chars = m.content.length;
  if (m.toolCalls?.length) {
    for (const tc of m.toolCalls) chars += tc.name.length + JSON.stringify(tc.args).length;
  }
  return Math.ceil(chars / 4) + 4;
}

export type EffectiveContextProvenance =
  | { source: 'configured'; tokens: number; counted: true }
  | { source: 'server-reported'; tokens: number | null; counted: boolean }
  | { source: 'model-advertised'; tokens: number | null; counted: boolean };

export interface EffectiveContextResult {
  effectiveContextSize: number;
  provenance: EffectiveContextProvenance[];
}

function positiveIntegerOrNull(value: number | null): number | null {
  return value !== null && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Derive the usable context ceiling exclusively from known, positive signals. */
export function deriveEffectiveContext(input: {
  configuredContextSize: number;
  serverReportedContext: number | null;
  modelAdvertisedContext: number | null;
}): EffectiveContextResult {
  const configured = positiveIntegerOrNull(input.configuredContextSize);
  if (configured === null) throw new RangeError('configuredContextSize must be a positive integer');
  const server = positiveIntegerOrNull(input.serverReportedContext);
  const advertised = positiveIntegerOrNull(input.modelAdvertisedContext);
  const known = [configured, ...(server === null ? [] : [server]), ...(advertised === null ? [] : [advertised])];
  return {
    effectiveContextSize: Math.min(...known),
    provenance: [
      { source: 'configured', tokens: configured, counted: true },
      { source: 'server-reported', tokens: server, counted: server !== null },
      { source: 'model-advertised', tokens: advertised, counted: advertised !== null },
    ],
  };
}

export interface PromptBudgetBreakdown {
  contextTokens: number;
  systemPromptTokens: number;
  toolSchemaTokens: number;
  outputReserveTokens: number;
  contextSafetyReserveTokens: number;
  promptBudgetTokens: number;
}

/** Visible prompt-budget arithmetic used before transcript fitting. */
export function derivePromptBudget(input: {
  contextTokens: number;
  systemPrompt: string;
  toolSchemas: readonly unknown[];
  outputReserveTokens: number;
  contextSafetyReserveTokens: number;
}): PromptBudgetBreakdown {
  const nonNegative = (value: number, field: string): number => {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${field} must be a non-negative integer`);
    return value;
  };
  const contextTokens = nonNegative(input.contextTokens, 'contextTokens');
  const systemPromptTokens = estimateTokens(input.systemPrompt);
  const toolSchemaTokens = estimateTokens(JSON.stringify(input.toolSchemas));
  const outputReserveTokens = nonNegative(input.outputReserveTokens, 'outputReserveTokens');
  const contextSafetyReserveTokens = nonNegative(input.contextSafetyReserveTokens, 'contextSafetyReserveTokens');
  return {
    contextTokens,
    systemPromptTokens,
    toolSchemaTokens,
    outputReserveTokens,
    contextSafetyReserveTokens,
    promptBudgetTokens: Math.max(
      0,
      contextTokens - systemPromptTokens - toolSchemaTokens - outputReserveTokens - contextSafetyReserveTokens,
    ),
  };
}

export interface FitResult {
  /** The kept window (most-recent messages, pairing-safe). */
  messages: ProviderMessage[];
  /** How many leading messages were dropped (0 = untouched). */
  droppedCount: number;
  /** Estimated tokens of the kept window (messages only, excl. system/tools). */
  estimatedTokens: number;
}

/**
 * Fit `messages` into `budgetTokens` by dropping the OLDEST messages.
 *
 * Guarantees:
 * - The kept window never contains an orphan `tool` result — one whose
 *   assistant tool-call message was cut out of the window (provider hard
 *   error: a dangling tool_result with no matching tool_use). Per
 *   transcript.ts, every `appendAssistant(..., toolCalls)` is immediately
 *   followed by one `appendToolResult` per call with nothing interleaved, so
 *   the span from the LAST `user` message to the end of the transcript is
 *   always internally pairing-complete. That whole span is therefore kept
 *   as one atomic unit, even over budget, instead of letting a naive
 *   per-message cut land mid-pair (born-510).
 * - The kept window never opens on a `tool` result or an assistant message
 *   outside that mandatory tail span — the start is advanced to the next
 *   `user` message after a cut (older, already-resolved turns are dropped
 *   together rather than split).
 * - The final message is always kept, even if it alone exceeds the budget
 *   (an honest oversized turn beats sending the provider a malformed one).
 *   When no `user` message exists anywhere in the input (degenerate/test-only
 *   — never true for a real transcript, which always opens on `appendUser`),
 *   this guarantee widens to the WHOLE input: with no turn boundary to fall
 *   back on, the entire array is the only pairing-complete span available,
 *   so it is kept intact rather than risking a partial cut stranding a
 *   `tool` result without its owning `assistant` call.
 * - `budgetTokens <= 0` or a window already within budget → input returned
 *   unchanged (droppedCount 0).
 */
export function fitMessagesToBudget(messages: readonly ProviderMessage[], budgetTokens: number): FitResult {
  const total = messages.reduce((n, m) => n + estimateMessageTokens(m), 0);
  if (budgetTokens <= 0 || total <= budgetTokens || messages.length === 0) {
    return { messages: [...messages], droppedCount: 0, estimatedTokens: total };
  }

  // The current in-flight turn (last `user` message onward) is always
  // pairing-complete by construction — never split it. No `user` message at
  // all (degenerate/test-only input — a real transcript always opens on
  // `appendUser`) means the whole array IS that in-flight turn, so it is
  // the mandatory span in full rather than just its final message.
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') { lastUserIdx = i; break; }
  }
  const boundary = lastUserIdx >= 0 ? lastUserIdx : 0;

  // Walk backward accumulating the newest messages that fit. Everything at
  // or after `boundary` is force-included regardless of budget.
  let used = 0;
  let start = messages.length;
  while (start > 0) {
    const next = estimateMessageTokens(messages[start - 1]!);
    const mandatory = start > boundary;
    if (!mandatory && used + next > budgetTokens) break;
    used += next;
    start--;
  }

  // Pairing safety: never open the window before `boundary` on a tool result
  // or an assistant message — advance to the next user turn boundary. Never
  // advances into the mandatory tail itself (already pairing-complete).
  while (start < boundary && messages[start]!.role !== 'user') {
    used -= estimateMessageTokens(messages[start]!);
    start++;
  }

  const kept = messages.slice(start).map((m) => ({ ...m }));
  return { messages: kept, droppedCount: start, estimatedTokens: Math.max(used, 0) };
}
