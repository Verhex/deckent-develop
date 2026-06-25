import { describe, it, expect, vi } from 'vitest';
import { makeOpenAIVoiceAdapter, createOpenAIVoiceAdapter } from '../../../src/connectors/voice/openai-voice.js';
import { createVoiceAdapter } from '../../../src/connectors/voice/types.js';

// ─── Fake OpenAI client ───────────────────────────────────────────────────────

function makeFakeOpenAIClient(opts: {
  transcribeResult?: string;
  transcribeLanguage?: string;
  synthesizeBuffer?: ArrayBuffer;
  synthesizeMime?: string;
}) {
  return {
    audio: {
      transcriptions: {
        create: vi.fn(async (_params: unknown) => ({
          text: opts.transcribeResult ?? 'transcribed text',
          language: opts.transcribeLanguage,
        })),
      },
      speech: {
        create: vi.fn(async (_params: unknown) => ({
          arrayBuffer: async () => opts.synthesizeBuffer ?? new ArrayBuffer(4),
        })),
      },
    },
  };
}

// ─── makeOpenAIVoiceAdapter — transcribe ─────────────────────────────────────

describe('makeOpenAIVoiceAdapter — transcribe', () => {
  it('calls openai.audio.transcriptions.create with verbose_json and returns { text, language }', async () => {
    const fakeClient = makeFakeOpenAIClient({ transcribeResult: 'hello openai', transcribeLanguage: 'en' });
    const adapter = makeOpenAIVoiceAdapter(fakeClient as never);

    const audio = Buffer.from('fake-audio');
    const result = await adapter.transcribe(audio, 'audio/webm');

    expect(result).toEqual({ text: 'hello openai', language: 'en' });
    expect(fakeClient.audio.transcriptions.create).toHaveBeenCalledOnce();
    const call = fakeClient.audio.transcriptions.create.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toHaveProperty('model');
    expect(call).toHaveProperty('file');
    expect(call['response_format']).toBe('verbose_json');
  });

  it('returns { text, language } — language may be undefined when not in response', async () => {
    const fakeClient = makeFakeOpenAIClient({ transcribeResult: 'another result' });
    const adapter = makeOpenAIVoiceAdapter(fakeClient as never);
    const result = await adapter.transcribe(Buffer.from('x'), 'audio/mp4');
    expect(result).toEqual({ text: 'another result', language: undefined });
  });
});

// ─── makeOpenAIVoiceAdapter — synthesize ─────────────────────────────────────

describe('makeOpenAIVoiceAdapter — synthesize', () => {
  it('calls openai.audio.speech.create and returns buffer + mime', async () => {
    const pcmBytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const fakeClient = makeFakeOpenAIClient({ synthesizeBuffer: pcmBytes });
    const adapter = makeOpenAIVoiceAdapter(fakeClient as never);

    const result = await adapter.synthesize('hello', { voice: 'nova' });

    expect(Buffer.isBuffer(result.data)).toBe(true);
    expect(result.data.byteLength).toBe(4);
    expect(result.mime).toBe('audio/mpeg');

    expect(fakeClient.audio.speech.create).toHaveBeenCalledOnce();
    const call = fakeClient.audio.speech.create.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toHaveProperty('model');
    expect(call.input).toBe('hello');
    expect(call.voice).toBe('nova');
  });

  it('uses default voice when none supplied', async () => {
    const fakeClient = makeFakeOpenAIClient({});
    const adapter = makeOpenAIVoiceAdapter(fakeClient as never);
    await adapter.synthesize('test');
    const call = fakeClient.audio.speech.create.mock.calls[0][0] as Record<string, unknown>;
    expect(call.voice).toBe('alloy');
  });
});

// ─── createOpenAIVoiceAdapter — null when key missing ────────────────────────

describe('createOpenAIVoiceAdapter', () => {
  it('returns null when OPENAI_API_KEY is absent', async () => {
    const result = await createOpenAIVoiceAdapter({});
    expect(result).toBeNull();
  });

  it('returns null when OPENAI_API_KEY is empty string', async () => {
    const result = await createOpenAIVoiceAdapter({ OPENAI_API_KEY: '' });
    expect(result).toBeNull();
  });
});

// ─── Full mock round-trip (Pillar-1 hardening — Task 6) ──────────────────────
// Verifies the exact SDK call shapes for both STT and TTS, including:
//   • file-shim has `name` property (ogg → "audio.ogg")
//   • file-shim does NOT set [Symbol.iterator]: undefined (Pillar-1 fix held)
//   • default TTS voice is 'alloy' (pinned)
//   • synthesize returns Buffer(len>0) with mime

describe('makeOpenAIVoiceAdapter — full round-trip', () => {
  it('transcribe(buf, audio/ogg) → "hi": file-shim name set, no undefined iterator', async () => {
    let capturedFile: Record<string, unknown> | null = null;
    const fakeClient = {
      audio: {
        transcriptions: {
          create: vi.fn(async (params: Record<string, unknown>) => {
            capturedFile = params['file'] as Record<string, unknown>;
            return { text: 'hi' };
          }),
        },
        speech: {
          create: vi.fn(async (_: unknown) => ({
            arrayBuffer: async () => new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer,
          })),
        },
      },
    };
    const adapter = makeOpenAIVoiceAdapter(fakeClient as never);
    const buf = Buffer.from('fake-ogg-audio-bytes');

    // Part 1: transcribe
    const { text } = await adapter.transcribe(buf, 'audio/ogg');
    expect(text).toBe('hi');
    expect(capturedFile).not.toBeNull();
    // file-shim must have a name (required by openai SDK)
    expect(capturedFile!['name']).toBe('audio.ogg');
    // Pillar-1 fix: the shim must NOT have Symbol.iterator explicitly set to `undefined`.
    // A plain object has no Symbol.iterator at all; if it were present and === undefined,
    // the SDK would attempt iteration and fail.  We assert it is NOT an own property
    // (absent is fine; a real function is fine; deliberately-set-to-undefined is the bug).
    const ownSymbols = Object.getOwnPropertySymbols(capturedFile!);
    const hasIteratorAsOwn = ownSymbols.includes(Symbol.iterator);
    if (hasIteratorAsOwn) {
      // If the symbol is an own property, it must be a real function (not undefined)
      const iteratorValue = (capturedFile as Record<symbol, unknown>)[Symbol.iterator];
      expect(typeof iteratorValue).toBe('function');
    }
    // else: no own Symbol.iterator — this is the correct Pillar-1 state

    // Part 2: synthesize — default voice 'alloy' (pinned), Buffer(len>0), mime
    const result = await adapter.synthesize('hi');
    expect(Buffer.isBuffer(result.data)).toBe(true);
    expect(result.data.byteLength).toBeGreaterThan(0);
    expect(result.mime).toBeTruthy();
    const synthCall = fakeClient.audio.speech.create.mock.calls[0][0] as Record<string, unknown>;
    expect(synthCall['voice']).toBe('alloy');
    expect(synthCall['input']).toBe('hi');
  });
});

// ─── createVoiceAdapter — openai provider ────────────────────────────────────

describe('createVoiceAdapter — openai provider', () => {
  it('returns null when enabled is false', () => {
    const adapter = createVoiceAdapter({ enabled: false, provider: 'openai' }, { OPENAI_API_KEY: 'sk-test' });
    expect(adapter).toBeNull();
  });

  it('returns null when OPENAI_API_KEY is absent from deck', () => {
    const adapter = createVoiceAdapter({ enabled: true, provider: 'openai' }, {});
    expect(adapter).toBeNull();
  });

  it('returns a VoiceAdapter (lazy) when key is present — does NOT attempt to load openai in sync path', () => {
    // createVoiceAdapter is sync and returns a lazy wrapper; it must not throw even if openai is not installed
    const adapter = createVoiceAdapter({ enabled: true, provider: 'openai' }, { OPENAI_API_KEY: 'sk-test-key' });
    // The adapter object itself must exist (lazy wrapper)
    expect(adapter).not.toBeNull();
    expect(typeof adapter!.transcribe).toBe('function');
    expect(typeof adapter!.synthesize).toBe('function');
  });
});
