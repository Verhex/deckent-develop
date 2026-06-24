import { describe, it, expect, vi } from 'vitest';
import { makeOpenAIVoiceAdapter, createOpenAIVoiceAdapter } from '../../../src/connectors/voice/openai-voice.js';
import { createVoiceAdapter } from '../../../src/connectors/voice/types.js';

// ─── Fake OpenAI client ───────────────────────────────────────────────────────

function makeFakeOpenAIClient(opts: {
  transcribeResult?: string;
  synthesizeBuffer?: ArrayBuffer;
  synthesizeMime?: string;
}) {
  return {
    audio: {
      transcriptions: {
        create: vi.fn(async (_params: unknown) => ({ text: opts.transcribeResult ?? 'transcribed text' })),
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
  it('calls openai.audio.transcriptions.create with a file-like object and returns the text', async () => {
    const fakeClient = makeFakeOpenAIClient({ transcribeResult: 'hello openai' });
    const adapter = makeOpenAIVoiceAdapter(fakeClient as never);

    const audio = Buffer.from('fake-audio');
    const result = await adapter.transcribe(audio, 'audio/webm');

    expect(result).toBe('hello openai');
    expect(fakeClient.audio.transcriptions.create).toHaveBeenCalledOnce();
    const call = fakeClient.audio.transcriptions.create.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toHaveProperty('model');
    expect(call).toHaveProperty('file');
  });

  it('returns the transcription text from the response', async () => {
    const fakeClient = makeFakeOpenAIClient({ transcribeResult: 'another result' });
    const adapter = makeOpenAIVoiceAdapter(fakeClient as never);
    expect(await adapter.transcribe(Buffer.from('x'), 'audio/mp4')).toBe('another result');
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
