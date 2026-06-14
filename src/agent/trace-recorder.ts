// src/agent/trace-recorder.ts
// ═══ Trace recorder (SP-2) ══════════════════════════════════════════════════
// Maps a native-agent ProviderMessage[] transcript into an OpenAI-messages
// training example (the unsloth/LLaMA-Factory tool-calling SFT shape) and
// appends it as one JSONL line. Local-only (.deckent/traces/, gitignored);
// nothing is uploaded. The ProviderMessage shape is ALREADY the OpenAI
// round-trip shape (M2) — this is a thin, pure mapping + an fs append.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ProviderMessage } from './provider-tooluse/types.js';

export interface TraceMeta { source: string; model: string; ts: string; }
export interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}
export interface TrainingExample { messages: OpenAiMessage[]; meta: TraceMeta; }

function toOpenAiMessage(m: ProviderMessage): OpenAiMessage {
  if (m.role === 'tool') return { role: 'tool', content: m.content, tool_call_id: m.toolCallId ?? '' };
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content,
      tool_calls: m.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } })),
    };
  }
  return { role: m.role, content: m.content };
}

/** Build a training example: a system message + the mapped transcript. */
export function toTrainingExample(system: string, transcript: ProviderMessage[], meta: TraceMeta): TrainingExample {
  return { messages: [{ role: 'system', content: system }, ...transcript.map(toOpenAiMessage)], meta };
}

/** Append one example as a JSONL line (creates the dir + file as needed). */
export function appendTrace(filePath: string, example: TrainingExample): void {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(example) + '\n', 'utf-8');
}
