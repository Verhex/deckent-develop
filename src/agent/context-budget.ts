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
  // all (degenerate/test-only input) falls back to the single-final-message
  // guarantee this function has always made.
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') { lastUserIdx = i; break; }
  }
  const boundary = lastUserIdx >= 0 ? lastUserIdx : messages.length - 1;

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
