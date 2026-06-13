// ═══ ProviderAdapter — one normalized backend interface (SP-1 §3, §5) ═══════
// OpenAI-compatible-first: Anthropic tool_use, OpenAI fn-calling, Ollama
// tool-calling, vLLM tool-parser all implement THIS shape. The loop never
// touches a provider's raw schema — only normalized ProviderEvents.

import type { NativeToolSchema } from '../tools/registry.js';

export interface ToolCallRef {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ProviderMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** present on role:'tool' — correlates the result to a prior tool-call id. */
  toolCallId?: string;
  /** present on role:'assistant' — the tool calls this turn made (native
   *  round-trip). content stays a string; this is a sibling, not a block-array. */
  toolCalls?: ToolCallRef[];
}

export interface ProviderRequest {
  /** Composed system prompt (identity.ts). */
  system: string;
  messages: ProviderMessage[];
  /** Registry native schemas (registry.toNativeSchemas()). */
  tools: NativeToolSchema[];
  /** Wire model id (API-pinned, e.g. 'claude-fable-5'). */
  model: string;
}

export interface ProviderTextDelta { type: 'text-delta'; text: string; }
export interface ProviderToolCall { type: 'tool-call'; id: string; name: string; args: Record<string, unknown>; }
export interface ProviderUsage { type: 'usage'; inputTokens: number; outputTokens: number; }
export interface ProviderDone { type: 'done'; }
export type ProviderEvent = ProviderTextDelta | ProviderToolCall | ProviderUsage | ProviderDone;

/** Every LLM backend (Anthropic/OpenAI-compat/Ollama) implements this. */
export interface ProviderAdapter {
  readonly name: string;
  send(req: ProviderRequest): AsyncIterable<ProviderEvent>;
}

const ROLES: ReadonlySet<string> = new Set(['user', 'assistant', 'tool']);

/** Validate a ProviderRequest; returns the first violation or null (ADR-010). */
export function validateProviderRequest(req: unknown): string | null {
  if (!req || typeof req !== 'object') return 'request must be an object';
  const r = req as Partial<ProviderRequest>;
  if (typeof r.system !== 'string') return 'system must be a string';
  if (typeof r.model !== 'string' || r.model.length === 0) return 'model must be a non-empty string';
  if (!Array.isArray(r.messages)) return 'messages must be an array';
  for (const m of r.messages) {
    if (!m || typeof m !== 'object') return 'each message must be an object';
    if (!ROLES.has((m as ProviderMessage).role)) return `message role must be one of ${[...ROLES].join('|')}`;
    if (typeof (m as ProviderMessage).content !== 'string') return 'message content must be a string';
  }
  if (!Array.isArray(r.tools)) return 'tools must be an array';
  return null;
}
