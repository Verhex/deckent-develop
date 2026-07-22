// ─── Ollama Model Catalog ───────────────────────────────────────────────────
// Local LLM provider definitions, zero cost (Sprint 202 F1 P0).
// Extracted from `model-registry.ts` so Pure-Ollama/provider-free config can
// resolve `getByProviderAndTier('ollama', tier)` without depending on the
// adapter side-effect path.
//
// Kept OUT of `BUILTIN_MODELS` on purpose: hard-coded test expectations
// elsewhere rely on the 13-model / 3-provider invariant. The `OllamaAdapter`
// constructor (src/providers/ollama.ts) calls `registerOllamaModels()` to
// insert these entries into the singleton registry only when the adapter
// module is loaded. Consumers that never import OllamaAdapter remain
// byte-identical to the pre-Ollama registry.
//
import type { ModelDefinition } from './model-registry.js';

/** Tier→local-model catalog for the Ollama provider.
 *  premium → qwen2.5-coder:32b (coding-tuned, large context)
 *  standard → qwen2.5-coder:7b (coding-tuned, balanced)
 *  standard → llama3:8b (general-purpose fallback at same tier)
 *  economy → llama3.2:3b (small, fast, low resource)
 *  All entries have cost=0 (local inference, no third-party billing). */
export const OLLAMA_BUILTIN_MODELS: readonly ModelDefinition[] = [
  {
    id: 'qwen2.5-coder:32b',
    apiId: 'qwen2.5-coder:32b',
    provider: 'ollama',
    tier: 'premium',
    contextWindow: 128_000,
    costPerMillion: { input: 0, output: 0 },
    capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: false },
    status: 'ga',
  },
  {
    id: 'qwen2.5-coder:7b',
    apiId: 'qwen2.5-coder:7b',
    provider: 'ollama',
    tier: 'standard',
    contextWindow: 32_768,
    costPerMillion: { input: 0, output: 0 },
    capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: false },
    status: 'ga',
  },
  {
    id: 'llama3:8b',
    apiId: 'llama3:8b',
    provider: 'ollama',
    tier: 'standard',
    contextWindow: 8_192,
    costPerMillion: { input: 0, output: 0 },
    capabilities: { streaming: true, toolUse: false, vision: false, codeExecution: false, reasoning: false },
    status: 'ga',
  },
  {
    id: 'llama3.2:3b',
    apiId: 'llama3.2:3b',
    provider: 'ollama',
    tier: 'economy',
    contextWindow: 8_192,
    costPerMillion: { input: 0, output: 0 },
    capabilities: { streaming: true, toolUse: false, vision: false, codeExecution: false, reasoning: false },
    status: 'ga',
  },
] as const;
