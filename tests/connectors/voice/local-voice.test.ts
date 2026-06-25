import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeLocalVoiceAdapter } from '../../../src/connectors/voice/local-voice.js';
import { createVoiceAdapter } from '../../../src/connectors/voice/types.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeFetch(opts: {
  ok?: boolean;
  status?: number;
  json?: unknown;
  arrayBuffer?: ArrayBuffer;
  contentType?: string;
}): typeof globalThis.fetch {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const { ok = true, status = 200, json, arrayBuffer, contentType = 'audio/wav' } = opts;
    return {
      ok,
      status,
      headers: { get: (h: string) => (h === 'content-type' ? contentType : null) },
      json: async () => json,
      arrayBuffer: async () => arrayBuffer ?? new ArrayBuffer(0),
    } as unknown as Response;
  });
}

// ─── makeLocalVoiceAdapter — transcribe ──────────────────────────────────────

describe('makeLocalVoiceAdapter — transcribe', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns { text, language } from a stubbed {text, language} STT response', async () => {
    const fetchMock = makeFetch({ json: { text: 'merhaba', language: 'tr' } });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = makeLocalVoiceAdapter({ stt_url: 'http://localhost:9000/stt', tts_url: 'http://localhost:9000/tts' });
    const audio = Buffer.from('fake-audio-bytes');
    const result = await adapter.transcribe(audio, 'audio/webm');

    expect(result).toEqual({ text: 'merhaba', language: 'tr' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:9000/stt');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('audio/webm');
    expect(init.body).toBe(audio);
  });

  it('appends ?language=<hint> to stt_url when stt_language is set', async () => {
    const fetchMock = makeFetch({ json: { text: 'merhaba', language: 'tr' } });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = makeLocalVoiceAdapter({
      stt_url: 'http://localhost:9000/stt',
      tts_url: 'http://localhost:9000/tts',
      stt_language: 'tr',
    });
    await adapter.transcribe(Buffer.from('fake'), 'audio/webm');

    const [url] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('?language=tr');
  });

  it('does NOT append ?language= when stt_language is absent (auto-detect)', async () => {
    const fetchMock = makeFetch({ json: { text: 'hello', language: 'en' } });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = makeLocalVoiceAdapter({ stt_url: 'http://localhost:9000/stt', tts_url: 'http://localhost:9000/tts' });
    await adapter.transcribe(Buffer.from('fake'), 'audio/webm');

    const [url] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('?language=');
  });

  it('throws when stt endpoint returns non-ok status', async () => {
    vi.stubGlobal('fetch', makeFetch({ ok: false, status: 503 }));
    const adapter = makeLocalVoiceAdapter({ stt_url: 'http://localhost:9000/stt', tts_url: 'http://localhost:9000/tts' });
    await expect(adapter.transcribe(Buffer.from('x'), 'audio/wav')).rejects.toThrow('stt 503');
  });
});

// ─── makeLocalVoiceAdapter — synthesize ──────────────────────────────────────

describe('makeLocalVoiceAdapter — synthesize', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('POSTs {text, voice} to tts_url and returns audio bytes + content-type', async () => {
    const pcmBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]).buffer;
    const fetchMock = makeFetch({ arrayBuffer: pcmBytes, contentType: 'audio/ogg' });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = makeLocalVoiceAdapter({ stt_url: 'http://localhost:9000/stt', tts_url: 'http://localhost:9000/tts', tts_voice: 'en-US' });
    const result = await adapter.synthesize('hello', { voice: 'en-GB' });

    expect(result.mime).toBe('audio/ogg');
    expect(Buffer.isBuffer(result.data)).toBe(true);
    expect(result.data.byteLength).toBe(4);

    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:9000/tts');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.text).toBe('hello');
    expect(body.voice).toBe('en-GB');   // opts.voice takes precedence over tts_voice
  });

  it('falls back to tts_voice config when no opts.voice supplied', async () => {
    const fetchMock = makeFetch({ arrayBuffer: new ArrayBuffer(2), contentType: 'audio/wav' });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = makeLocalVoiceAdapter({ stt_url: 'http://localhost:9000/stt', tts_url: 'http://localhost:9000/tts', tts_voice: 'fr-FR' });
    await adapter.synthesize('bonjour');

    const [, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.voice).toBe('fr-FR');
  });

  it('throws when tts endpoint returns non-ok status', async () => {
    vi.stubGlobal('fetch', makeFetch({ ok: false, status: 500 }));
    const adapter = makeLocalVoiceAdapter({ stt_url: 'http://localhost:9000/stt', tts_url: 'http://localhost:9000/tts' });
    await expect(adapter.synthesize('x')).rejects.toThrow('tts 500');
  });

  it('uses audio/wav as fallback mime when content-type header is absent', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(1),
    } as unknown as Response));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = makeLocalVoiceAdapter({ stt_url: 'http://localhost:9000/stt', tts_url: 'http://localhost:9000/tts' });
    const result = await adapter.synthesize('test');
    expect(result.mime).toBe('audio/wav');
  });
});

// ─── createVoiceAdapter — local provider ─────────────────────────────────────

describe('createVoiceAdapter — local provider', () => {
  it('returns null when enabled is false', () => {
    const adapter = createVoiceAdapter({ enabled: false, provider: 'local', local: { stt_url: 'http://x', tts_url: 'http://y' } }, {});
    expect(adapter).toBeNull();
  });

  it('returns null when local urls are missing', () => {
    const adapter = createVoiceAdapter({ enabled: true, provider: 'local', local: {} }, {});
    expect(adapter).toBeNull();
  });

  it('returns null when local block is absent', () => {
    const adapter = createVoiceAdapter({ enabled: true, provider: 'local' }, {});
    expect(adapter).toBeNull();
  });

  it('returns a VoiceAdapter when local is properly configured', () => {
    const adapter = createVoiceAdapter({ enabled: true, provider: 'local', local: { stt_url: 'http://stt', tts_url: 'http://tts' } }, {});
    expect(adapter).not.toBeNull();
    expect(typeof adapter!.transcribe).toBe('function');
    expect(typeof adapter!.synthesize).toBe('function');
  });
});
