// ═══ Transport detection (SP-1 §3) ═════════════════════════════════════════
// The terminal works only with a real native-tool_use backend: Anthropic API,
// any OpenAI-compatible endpoint (OpenAI/OpenRouter/vLLM-Deckent-Core), or a
// local Ollama. Subscription CLIs are NOT used here (they stay in the
// orchestrator). Detection precedence: anthropic-api > openai-compatible >
// ollama > none (honest error). No network call — config/env inspection only.

export type TransportKind = 'anthropic-api' | 'openai-compatible' | 'ollama' | 'none';

export interface DetectedTransport {
  kind: TransportKind;
  reason: string;
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
    return { kind: 'anthropic-api', reason: 'ANTHROPIC_API_KEY ortam değişkeni mevcut' };
  }
  if (env['OPENAI_API_KEY'] || config.openai_base_url) {
    return { kind: 'openai-compatible', reason: 'OpenAI-uyumlu endpoint (OPENAI_API_KEY veya openai_base_url) mevcut' };
  }
  if (config.ollama_host) {
    return { kind: 'ollama', reason: `Yerel Ollama yapılandırıldı (${config.ollama_host})` };
  }
  return {
    kind: 'none',
    reason: 'Native-agent için API veya yerel model bağla (ANTHROPIC_API_KEY / OPENAI_API_KEY / openai_base_url / ollama_host).',
  };
}
