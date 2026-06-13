// src/agent/transcript.ts
// ═══ Transcript — provider-agnostic message sequence (SP-1 §13) ══════════════
// A turn is modeled as ordered string-content messages: user → assistant
// (carrying its toolCalls) → one role:'tool' result per call keyed by
// toolCallId. NOT a structured content-block array — the adapters reconstruct
// each provider's native round-trip from this normalized sequence.

import type { ProviderMessage, ToolCallRef } from './provider-tooluse/types.js';

export class Transcript {
  private readonly messages: ProviderMessage[] = [];

  appendUser(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  appendAssistant(content: string, toolCalls: ToolCallRef[] = []): void {
    const m: ProviderMessage = { role: 'assistant', content };
    if (toolCalls.length > 0) m.toolCalls = toolCalls.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args }));
    this.messages.push(m);
  }

  appendToolResult(toolCallId: string, output: string): void {
    this.messages.push({ role: 'tool', content: output, toolCallId });
  }

  /** A defensive copy — callers iterate, the loop owns the source of truth. */
  toProviderMessages(): ProviderMessage[] {
    return this.messages.map((m) => ({ ...m }));
  }
}
