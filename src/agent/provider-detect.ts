// ═══ Transport detection (SP-1 §3) ═════════════════════════════════════════
// The terminal works only with a real native-tool_use backend: Anthropic API,
// any OpenAI-compatible endpoint (OpenAI/OpenRouter/vLLM-Deckent-Core), or a
// local Ollama. Subscription CLIs are NOT used here (they stay in the
// orchestrator). Detection precedence: anthropic-api > openai-compatible >
// ollama > none (honest error). No network call — config/env inspection only.
//
// TERMINAL-I18N-NATIVE-001 (owner decision 2026-09-03): the mechanism is
// string-free for users — it returns a typed `reasonCode` (+ technical
// `detail`) and a technical English `reason`; the sentence a person reads is
// the catalog row `native.detect.<reasonCode>` resolved by the surface in the
// session language. The Turkish sentences that lived here rendered in every
// language.

export type TransportKind = 'anthropic-api' | 'openai-compatible' | 'ollama' | 'none';

export const DETECT_REASON_CODES = ['anthropic-api-key', 'openai-compatible', 'ollama-host', 'no-transport'] as const;
export type DetectReasonCode = (typeof DETECT_REASON_CODES)[number];

export interface DetectedTransport {
  kind: TransportKind;
  /** Typed cause of the decision — the catalog key suffix (`native.detect.<code>`). */
  reasonCode: DetectReasonCode;
  /** Technical English diagnostic (logs / doctor JSON), never a user sentence. */
  reason: string;
  /** Technical detail the catalog row may interpolate (e.g. the Ollama host). */
  detail?: string;
}

export interface TransportConfig {
  openai_base_url?: string;
  ollama_host?: string;
}

export function detectTransport(
  env: Record<string, string | undefined>,
  config: TransportConfig,
): DetectedTransport {
  if (env['ANTHROPIC_API_KEY']) {
    return { kind: 'anthropic-api', reasonCode: 'anthropic-api-key', reason: 'ANTHROPIC_API_KEY present in the environment' };
  }
  if (env['OPENAI_API_KEY'] || config.openai_base_url) {
    return { kind: 'openai-compatible', reasonCode: 'openai-compatible', reason: 'OpenAI-compatible endpoint present (OPENAI_API_KEY or openai_base_url)' };
  }
  if (config.ollama_host) {
    return { kind: 'ollama', reasonCode: 'ollama-host', reason: `local Ollama configured (${config.ollama_host})`, detail: config.ollama_host };
  }
  return {
    kind: 'none',
    reasonCode: 'no-transport',
    reason: 'no native transport: set ANTHROPIC_API_KEY / OPENAI_API_KEY / openai_base_url / ollama_host',
  };
}
