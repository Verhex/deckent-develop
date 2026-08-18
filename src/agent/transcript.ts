// src/agent/transcript.ts
// ═══ Transcript — provider-agnostic message sequence (SP-1 §13) ══════════════
// A turn is modeled as ordered string-content messages: user → assistant
// (carrying its toolCalls) → one role:'tool' result per call keyed by
// toolCallId. NOT a structured content-block array — the adapters reconstruct
// each provider's native round-trip from this normalized sequence.

import type { ProviderMessage, ToolCallRef } from './provider-tooluse/types.js';
import { fitMessagesToBudget } from './context-budget.js';
import { createHash } from 'node:crypto';

export type TurnOrigin = 'user' | 'replay' | 'system';
export interface TurnMetadata { turnId: string; origin: TurnOrigin }
export type AppendUserResult = { status: 'appended' } | { status: 'duplicate'; reason: 'immediate-user-content-hash-match' };
export interface TranscriptEntry { message: ProviderMessage; turnId: string; origin: TurnOrigin; contentHash: string }

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
 *  budget (up to the registry's largest advertised window — 1M-context Claude
 *  5 / 2M-class models, see native-transport.ts resolveContextBudgetTokens) —
 *  this is a raw memory safety net, not the live per-turn prompt fit. The old
 *  500k token net silently undercut 1M-context models once the full advertised
 *  window became the usable ceiling (owner directive 2026-08-18). */
const DEFAULT_EVICTION_POLICY: Required<TranscriptEvictionPolicy> = {
  maxTokens: 4_000_000,
  maxMessages: 4_000,
};

export class Transcript {
  private readonly messages: ProviderMessage[] = [];
  private readonly entries: TranscriptEntry[] = [];
  private readonly policy: Required<TranscriptEvictionPolicy>;
  private droppedCount = 0;
  private nextUserMetadata: TurnMetadata | undefined;

  constructor(policy: TranscriptEvictionPolicy = {}) {
    this.policy = {
      maxTokens: policy.maxTokens ?? DEFAULT_EVICTION_POLICY.maxTokens,
      maxMessages: policy.maxMessages ?? DEFAULT_EVICTION_POLICY.maxMessages,
    };
  }

  setNextUserMetadata(metadata: TurnMetadata): void { this.nextUserMetadata = metadata; }

  appendUser(content: string, metadata?: TurnMetadata): AppendUserResult {
    // Exactly-once applies ONLY to explicitly-identified production turns (the
    // session stamps turnId/origin). Metadata-less library appends keep the
    // legacy append-always behavior — a caller building a fixture transcript
    // from identical strings is not a replay.
    const explicit = metadata ?? this.nextUserMetadata;
    const effectiveMetadata = explicit ?? { turnId: 'legacy', origin: 'user' as const };
    this.nextUserMetadata = undefined;
    const contentHash = createHash('sha256').update(content).digest('hex');
    const previous = this.entries.at(-1);
    if (explicit && previous?.message.role === 'user' && previous.turnId === effectiveMetadata.turnId && previous.contentHash === contentHash) {
      return { status: 'duplicate', reason: 'immediate-user-content-hash-match' };
    }
    const message: ProviderMessage = { role: 'user', content };
    this.messages.push(message);
    this.entries.push({ message, ...effectiveMetadata, contentHash });
    this.evict();
    return { status: 'appended' };
  }

  appendAssistant(content: string, toolCalls: ToolCallRef[] = []): void {
    const m: ProviderMessage = { role: 'assistant', content };
    if (toolCalls.length > 0) m.toolCalls = toolCalls.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args }));
    this.messages.push(m);
    this.entries.push({ message: m, turnId: this.currentTurnId(), origin: 'system', contentHash: createHash('sha256').update(content).digest('hex') });
    this.evict();
  }

  appendToolResult(toolCallId: string, output: string): void {
    const message: ProviderMessage = { role: 'tool', content: output, toolCallId };
    this.messages.push(message);
    this.entries.push({ message, turnId: this.currentTurnId(), origin: 'system', contentHash: createHash('sha256').update(output).digest('hex') });
    this.evict();
  }

  /** A defensive copy — callers iterate, the loop owns the source of truth. */
  toProviderMessages(): ProviderMessage[] {
    return this.messages.map((m) => ({ ...m }));
  }

  toEntries(): TranscriptEntry[] {
    return this.entries.map((entry) => ({ ...entry, message: { ...entry.message } }));
  }

  replaceForContextEpoch(messages: readonly ProviderMessage[], turnId: string): void {
    this.messages.splice(0, this.messages.length, ...messages.map((message) => ({ ...message })));
    this.entries.splice(0, this.entries.length, ...this.messages.map((message) => ({
      message,
      turnId,
      origin: 'system' as const,
      contentHash: createHash('sha256').update(message.content).digest('hex'),
    })));
  }

  compactForContextEpoch(objective: string, checkpoint: string, turnId: string, lineageLimit = 8): void {
    const lineage = pairingSafeLineage(this.messages, lineageLimit);
    this.replaceForContextEpoch([
      { role: 'user', content: objective },
      { role: 'user', content: checkpoint },
      ...lineage,
    ], turnId);
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
    this.entries.splice(0, dropped);
  }

  private currentTurnId(): string { return this.entries.at(-1)?.turnId ?? 'legacy'; }
}

function pairingSafeLineage(messages: readonly ProviderMessage[], limit: number): ProviderMessage[] {
  if (limit <= 0) return [];
  const selected: ProviderMessage[] = [];
  const resultIds = new Set<string>();
  for (let i = messages.length - 1; i >= 0 && selected.length < limit; i--) {
    const message = messages[i]!;
    if (message.role === 'tool' && message.toolCallId) {
      resultIds.add(message.toolCallId);
      selected.unshift({ ...message });
      continue;
    }
    if (message.role === 'assistant' && message.toolCalls?.some((call) => resultIds.has(call.id))) {
      selected.unshift({ ...message, toolCalls: message.toolCalls.filter((call) => resultIds.has(call.id)) });
    }
  }
  const paired = new Set(selected.flatMap((message) => message.role === 'assistant' ? (message.toolCalls ?? []).map((call) => call.id) : []));
  return selected.filter((message) => message.role !== 'tool' || (message.toolCallId !== undefined && paired.has(message.toolCallId)));
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
