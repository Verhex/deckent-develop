// src/agent/transcript.ts
// ═══ Transcript — provider-agnostic message sequence (SP-1 §13) ══════════════
// A turn is modeled as ordered string-content messages: user → assistant
// (carrying its toolCalls) → one role:'tool' result per call keyed by
// toolCallId. NOT a structured content-block array — the adapters reconstruct
// each provider's native round-trip from this normalized sequence.

import type { ProviderMessage, ToolCallRef } from './provider-tooluse/types.js';
import { fitMessagesToBudget } from './context-budget.js';

/**
 * Eviction policy for the Transcript's OWN backing store (born-546) — distinct
 * from `context-budget.ts`'s `fitMessagesToBudget`, which only trims the
 * per-request PROMPT snapshot. Without this, `Transcript.messages` grows
 * unbounded for the lifetime of a session even though every provider request
 * is already fit to a much smaller budget.
 * - `maxTokens` (size-based): delegates to `fitMessagesToBudget` (born-510) —
 *   same pairing-safe algorithm, same guarantees.
 * - `maxMessages` (age/count-based): guards the case a token budget alone
 *   would only cap at a very large message count — many small messages
 *   (short chat turns, terse tool results) can grow the array indefinitely
 *   while staying well under any token ceiling.
 * `<= 0` (or omitted, via the defaults below) disables that axis.
 */
export interface TranscriptEvictionPolicy {
  /** Max estimated tokens retained before the oldest turns are evicted. */
  maxTokens?: number;
  /** Max message count retained before the oldest turns are evicted. */
  maxMessages?: number;
}

/** Both ceilings sit well above any single provider's per-request context
 *  budget (24k-160k tokens, see native-transport.ts resolveContextBudgetTokens)
 *  — this is a raw memory safety net, not the live per-turn prompt fit. */
const DEFAULT_EVICTION_POLICY: Required<TranscriptEvictionPolicy> = {
  maxTokens: 500_000,
  maxMessages: 4_000,
};

export class Transcript {
  private readonly messages: ProviderMessage[] = [];
  private readonly policy: Required<TranscriptEvictionPolicy>;
  private droppedCount = 0;

  constructor(policy: TranscriptEvictionPolicy = {}) {
    this.policy = {
      maxTokens: policy.maxTokens ?? DEFAULT_EVICTION_POLICY.maxTokens,
      maxMessages: policy.maxMessages ?? DEFAULT_EVICTION_POLICY.maxMessages,
    };
  }

  appendUser(content: string): void {
    this.messages.push({ role: 'user', content });
    this.evict();
  }

  appendAssistant(content: string, toolCalls: ToolCallRef[] = []): void {
    const m: ProviderMessage = { role: 'assistant', content };
    if (toolCalls.length > 0) m.toolCalls = toolCalls.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args }));
    this.messages.push(m);
    this.evict();
  }

  appendToolResult(toolCallId: string, output: string): void {
    this.messages.push({ role: 'tool', content: output, toolCallId });
    this.evict();
  }

  /** A defensive copy — callers iterate, the loop owns the source of truth. */
  toProviderMessages(): ProviderMessage[] {
    return this.messages.map((m) => ({ ...m }));
  }

  /** Total messages evicted from this transcript so far (diagnostics). */
  droppedMessageCount(): number {
    return this.droppedCount;
  }

  /**
   * Enforce the eviction policy in place, pairing-safe (born-510 pattern):
   * never strand a `tool` result whose owning `assistant` tool-call message
   * was dropped. The size axis reuses `fitMessagesToBudget` verbatim; the
   * count axis applies the identical boundary rule (the in-flight turn — the
   * last `user` message onward — is always force-kept, and a cut never opens
   * on anything but a `user` message).
   */
  private evict(): void {
    const n = this.messages.length;
    if (n === 0) return;
    const { maxTokens, maxMessages } = this.policy;

    let kept: readonly ProviderMessage[] = this.messages;
    if (maxTokens > 0) kept = fitMessagesToBudget(kept, maxTokens).messages;
    if (maxMessages > 0 && kept.length > maxMessages) kept = cutByCount(kept, maxMessages);

    const dropped = n - kept.length;
    if (dropped <= 0) return;
    this.droppedCount += dropped;
    this.messages.splice(0, dropped);
  }
}

/** Drop the oldest messages down to `maxMessages`, pairing-safe: the window
 *  never opens before the last `user` message's index on anything but a
 *  `user` message (mirrors fitMessagesToBudget's boundary rule exactly). */
function cutByCount(messages: readonly ProviderMessage[], maxMessages: number): ProviderMessage[] {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') { lastUserIdx = i; break; }
  }
  const boundary = lastUserIdx >= 0 ? lastUserIdx : 0;

  let start = Math.min(messages.length - maxMessages, boundary);
  while (start < boundary && messages[start]!.role !== 'user') start++;

  return start > 0 ? messages.slice(start) : [...messages];
}
