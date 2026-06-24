// ─── VoiceAdapter — interface + config + factory ─────────────────────────────
// Phase C, Task 9. Local-first; OpenAI is the optional cloud adapter.
// createVoiceAdapter is synchronous: both providers return lazy wrappers that
// import the real implementation on the first actual call.

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface VoiceAdapter {
  /** Transcribe audio bytes to text.  mime = input audio MIME (e.g. 'audio/webm'). */
  transcribe(audio: Buffer, mime: string): Promise<string>;
  /** Synthesize text to audio bytes. Returns raw bytes + MIME type of the output. */
  synthesize(text: string, opts?: { voice?: string }): Promise<{ data: Buffer; mime: string }>;
}

export interface VoiceConfig {
  /** Enable voice processing (default: false — flag-gated, must be explicit opt-in). */
  enabled?: boolean;
  /** Enable speech-to-text transcription path (default: false). */
  stt?: boolean;
  /** Text-to-speech output policy.
   *  'off'          — never synthesize (default).
   *  'always'       — always synthesize replies.
   *  'reply-in-kind'— synthesize only when the inbound message was a voice message. */
  tts?: 'off' | 'always' | 'reply-in-kind';
  /** Voice backend provider.
   *  'local'  — HTTP client POSTing to a local wrapper (stt_url/tts_url). No network dep.
   *  'openai' — Whisper transcription + TTS synthesis. Requires OPENAI_API_KEY in deck. */
  provider?: 'local' | 'openai';
  /** Local voice wrapper URLs (required when provider='local'). */
  local?: {
    /** STT endpoint: POST <audio bytes> (Content-Type=mime) → 200 { text: string }. */
    stt_url?: string;
    /** TTS endpoint: POST { text, voice? } → 200 <audio bytes> (audio/<...>). */
    tts_url?: string;
    /** Default voice name forwarded to the TTS endpoint when none is specified per-call. */
    tts_voice?: string;
  };
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a VoiceAdapter from config + deck secrets.
 * Returns null synchronously when disabled or misconfigured.
 * Both adapters are lazy wrappers — real implementation is loaded on first call.
 *
 * Null when:
 *  - cfg.enabled is falsy
 *  - provider is 'local' but stt_url or tts_url is absent
 *  - provider is 'openai' but OPENAI_API_KEY is absent from deck
 */
export function createVoiceAdapter(
  cfg: VoiceConfig,
  deck: Record<string, string>,
): VoiceAdapter | null {
  if (!cfg.enabled) return null;

  const provider = cfg.provider ?? 'local';

  if (provider === 'local') {
    const local = cfg.local;
    if (!local?.stt_url || !local?.tts_url) return null;
    // Capture config for the lazy wrapper (ESM — no require())
    const localCfg = local;
    return {
      async transcribe(audio, mime) {
        const { makeLocalVoiceAdapter } = await import('./local-voice.js');
        return makeLocalVoiceAdapter(localCfg).transcribe(audio, mime);
      },
      async synthesize(text, opts) {
        const { makeLocalVoiceAdapter } = await import('./local-voice.js');
        return makeLocalVoiceAdapter(localCfg).synthesize(text, opts);
      },
    };
  }

  if (provider === 'openai') {
    const apiKey = deck['OPENAI_API_KEY'];
    if (!apiKey) return null;
    return makeLazyOpenAIAdapter(apiKey);
  }

  return null;
}

// ─── Lazy OpenAI proxy ───────────────────────────────────────────────────────

/**
 * Returns a VoiceAdapter whose methods resolve the real OpenAI adapter on first
 * call and then delegate. This keeps createVoiceAdapter synchronous while
 * deferring the dynamic import to the actual usage site.
 */
function makeLazyOpenAIAdapter(apiKey: string): VoiceAdapter {
  let resolved: VoiceAdapter | null = null;

  async function getAdapter(): Promise<VoiceAdapter> {
    if (resolved) return resolved;
    const { createOpenAIVoiceAdapter } = await import('./openai-voice.js');
    const adapter = await createOpenAIVoiceAdapter({ OPENAI_API_KEY: apiKey });
    if (!adapter) throw new Error('Failed to create OpenAI voice adapter — check OPENAI_API_KEY');
    resolved = adapter;
    return resolved;
  }

  return {
    async transcribe(audio, mime) {
      return (await getAdapter()).transcribe(audio, mime);
    },
    async synthesize(text, opts) {
      return (await getAdapter()).synthesize(text, opts);
    },
  };
}
