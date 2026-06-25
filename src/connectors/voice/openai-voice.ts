// ─── OpenAI Voice Adapter ─────────────────────────────────────────────────────
// Whisper transcription + TTS synthesis via the openai SDK.
// openai is an optionalDependency — loaded dynamically (Function-indirection
// mirrors the grammy/nodemailer pattern) so tsc/unit-tests pass without it.
//
// Unit tests inject a fake client via makeOpenAIVoiceAdapter() directly.
// Production path: createOpenAIVoiceAdapter(deck) dynamically loads the SDK.

import type { VoiceAdapter } from './types.js';

// ─── Type shims (not imported from openai — keep tsc happy without the pkg) ──

type OpenAIClient = {
  audio: {
    transcriptions: {
      create(params: {
        model: string;
        file: { name: string; [k: string]: unknown };
        response_format?: string;
      }): Promise<{ text: string; language?: string }>;
    };
    speech: {
      create(params: {
        model: string;
        input: string;
        voice: string;
      }): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
    };
  };
};

// ─── Adapter factory (injected client — used in unit tests) ──────────────────

/**
 * Construct a VoiceAdapter from an already-constructed OpenAI client.
 * This is the testable entry-point — tests inject a fake client here.
 */
export function makeOpenAIVoiceAdapter(client: OpenAIClient): VoiceAdapter {
  return {
    async transcribe(audio: Buffer, mime: string): Promise<{ text: string; language?: string }> {
      // The openai SDK accepts a File-like object with name + arrayBuffer.
      // We construct a minimal shim from the Buffer so no DOM File is needed.
      const ext = mime.split('/')[1] ?? 'wav';
      const fileShim = {
        name: `audio.${ext}`,
        arrayBuffer: async () =>
          audio.buffer.slice(
            audio.byteOffset,
            audio.byteOffset + audio.byteLength,
          ) as ArrayBuffer,
      };
      // verbose_json includes the detected language in the response
      const result = await client.audio.transcriptions.create({
        model: 'whisper-1',
        file: fileShim as never,
        response_format: 'verbose_json',
      });
      return { text: result.text, language: result.language };
    },

    async synthesize(
      text: string,
      opts?: { voice?: string },
    ): Promise<{ data: Buffer; mime: string }> {
      const response = await client.audio.speech.create({
        model: 'tts-1',
        input: text,
        voice: opts?.voice ?? 'alloy',
      });
      return {
        data: Buffer.from(await response.arrayBuffer()),
        mime: 'audio/mpeg',
      };
    },
  };
}

// ─── Dynamic loader (production path) ────────────────────────────────────────

type OpenAIConstructor = new (opts: { apiKey: string }) => OpenAIClient;

async function loadOpenAI(): Promise<OpenAIConstructor> {
  try {
    const moduleName = 'openai';
    const mod = await (Function('m', 'return import(m)')(moduleName) as Promise<{ default: unknown; OpenAI: unknown }>);
    // SDK exports OpenAI as both default and named export
    const Ctor = (mod.OpenAI ?? mod.default) as OpenAIConstructor;
    if (typeof Ctor !== 'function') throw new Error('unexpected openai module shape');
    return Ctor;
  } catch {
    throw new Error('openai package not installed. Run: npm install openai');
  }
}

/**
 * Create an OpenAI-backed VoiceAdapter from deck secrets.
 * Returns null when OPENAI_API_KEY is absent or empty.
 * Dynamically loads the openai package — safe when not installed (null is returned
 * before the load attempt because key guard runs first).
 */
export async function createOpenAIVoiceAdapter(
  deck: Record<string, string>,
): Promise<VoiceAdapter | null> {
  const apiKey = deck['OPENAI_API_KEY'];
  if (!apiKey) return null;

  const OpenAI = await loadOpenAI();
  const client = new OpenAI({ apiKey }) as unknown as OpenAIClient;
  return makeOpenAIVoiceAdapter(client);
}
