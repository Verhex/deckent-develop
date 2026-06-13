// src/agent/provider-tooluse/ollama.ts
// ═══ Ollama adapter (SP-1 §3) ═══════════════════════════════════════════════
// Ollama serves an OpenAI-compatible /v1/chat/completions, so this is a thin
// wrapper over createOpenAIAdapter pointed at {host}/v1, with name 'ollama'.
// No API key (local). Reuse keeps one streaming/tool-call code path.

import { createOpenAIAdapter } from './openai.js';
import type { ProviderAdapter } from './types.js';

export interface OllamaAdapterOptions {
  host: string;              // e.g. 'http://127.0.0.1:11434'
  fetchImpl?: typeof fetch;
}

export function createOllamaAdapter(opts: OllamaAdapterOptions): ProviderAdapter {
  return createOpenAIAdapter({
    baseUrl: `${opts.host}/v1`,
    name: 'ollama',
    fetchImpl: opts.fetchImpl,
  });
}
