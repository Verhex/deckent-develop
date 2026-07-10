import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeLocalVoiceAdapter } from '../../src/connectors/voice/local-voice.js';

// born-599 — VOICE-BODYINIT regression guard.
//
// local-voice.ts:22 forwards a Buffer as fetch's `body` via a type-only cast
// (`audio as unknown as Uint8Array<ArrayBuffer>`), not a `new Uint8Array(buffer)` copy —
// the copy form would type-check equally well but silently changes what's actually sent
// (a fresh object/buffer instead of the original bytes-in-place). This test locks in that
// the EXACT same Buffer reference — same bytes, same identity, zero re-encoding — reaches
// fetch, so a future "helpful" refactor to a copying wrapper gets caught here.

function makeFetch(): typeof globalThis.fetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'audio/wav' },
    json: async () => ({ text: 'ok' }),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response));
}

describe('VOICE-BODYINIT — Buffer forwarded to fetch body as-is', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('forwards the exact same Buffer reference as fetch body (no copy)', async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal('fetch', fetchMock);

    const adapter = makeLocalVoiceAdapter({ stt_url: 'http://localhost:9000/stt', tts_url: 'http://localhost:9000/tts' });
    const audio = Buffer.from([0x01, 0x02, 0x03, 0xff, 0x00]);
    await adapter.transcribe(audio, 'audio/webm');

    const [, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(audio);
  });

  it('sends identical bytes for binary audio payloads (including 0x00 / 0xff edge bytes)', async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal('fetch', fetchMock);

    const adapter = makeLocalVoiceAdapter({ stt_url: 'http://localhost:9000/stt', tts_url: 'http://localhost:9000/tts' });
    const audio = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    await adapter.transcribe(audio, 'audio/webm');

    const [, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const sentBody = init.body as unknown as Buffer;
    expect(Buffer.isBuffer(sentBody)).toBe(true);
    expect(Buffer.compare(sentBody, audio)).toBe(0);
  });

  it('does not mutate the Buffer content-type/byteLength when handed to fetch', async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal('fetch', fetchMock);

    const adapter = makeLocalVoiceAdapter({ stt_url: 'http://localhost:9000/stt', tts_url: 'http://localhost:9000/tts' });
    const audio = Buffer.from('deckent-voice-bodyinit-fixture');
    const originalByteLength = audio.byteLength;
    await adapter.transcribe(audio, 'audio/webm');

    expect(audio.byteLength).toBe(originalByteLength);
    const [, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.body as Buffer).byteLength).toBe(originalByteLength);
  });
});
