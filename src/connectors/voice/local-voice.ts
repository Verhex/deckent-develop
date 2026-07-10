// ─── Local Voice Adapter ──────────────────────────────────────────────────────
// HTTP client for a local STT/TTS wrapper (deckent voice contract).
// Uses Node built-in fetch — no additional runtime dependency.
//
// STT contract: POST {stt_url}   body=<audio bytes> Content-Type=<mime> → 200 { text: string }
// TTS contract: POST {tts_url}   body={ text, voice? } JSON             → 200 <audio bytes>
//
// Both throw on non-2xx (caller is responsible for skipping honestly).

import type { VoiceAdapter, VoiceConfig } from './types.js';

export function makeLocalVoiceAdapter(
  local: NonNullable<VoiceConfig['local']>,
): VoiceAdapter {
  return {
    async transcribe(audio: Buffer, mime: string): Promise<{ text: string; language?: string }> {
      const url = new URL(local.stt_url!);
      if (local.stt_language) url.searchParams.set('language', local.stt_language);
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'content-type': mime },
        // Buffer's `.buffer` is typed ArrayBufferLike (ArrayBuffer | SharedArrayBuffer); a DOM-lib
        // tsconfig's ArrayBufferView<ArrayBuffer> wants the narrower ArrayBuffer, so Buffer fails
        // structural assignability to BodyInit there even though it IS a valid body at runtime
        // (Buffer is a Uint8Array subclass). Cast keeps the exact same object/bytes on the wire —
        // `new Uint8Array(audio)` would type-check too but copies, changing the sent body's identity.
        // `Uint8Array<ArrayBuffer>` (not the DOM-only `BodyInit` name) resolves under both a
        // DOM-lib tsconfig and a Node-only one (root has no "DOM" lib, so `BodyInit` is unnamed there).
        body: audio as unknown as Uint8Array<ArrayBuffer>,
      });
      if (!res.ok) throw new Error(`stt ${res.status}`);
      const body = (await res.json()) as { text: string; language?: string };
      return { text: body.text, language: body.language };
    },

    async synthesize(
      text: string,
      opts?: { voice?: string; language?: string },
    ): Promise<{ data: Buffer; mime: string }> {
      const res = await fetch(local.tts_url!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: opts?.voice ?? local.tts_voice,
          ...(opts?.language ? { language: opts.language } : {}),
        }),
      });
      if (!res.ok) throw new Error(`tts ${res.status}`);
      return {
        data: Buffer.from(await res.arrayBuffer()),
        mime: res.headers.get('content-type') ?? 'audio/wav',
      };
    },
  };
}
