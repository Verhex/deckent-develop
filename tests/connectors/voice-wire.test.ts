/**
 * Task 11 — TDD: inbound voice → STT → agentic turn, reply-in-kind TTS → sendVoice
 *
 * Tests that bootstrapConnectorCommands:
 *   1. When an IncomingMessage carries raw.voice AND voiceAdapter exists AND botCapabilities.voice.stt=true:
 *      calls getFileBuffer(raw.voice.fileId) → voice.transcribe(data, mime) → routes transcribed text to chat
 *   2. reply-in-kind + voice-origin → voice.synthesize(stripped reply) → connector.sendVoice(channelId, audio)
 *      AND skips the text reply (no sendMessage for the reply body)
 *   3. tts='always' → synthesize + sendVoice regardless of origin
 *   4. text-origin turn → no sendVoice, never (even with tts=always on text turns this path is text-only)
 *   5. Transcribe failure → fall back to text path, never crash the turn
 *   6. Synthesize failure → fall back to text reply, never crash the turn
 *   7. sendVoice failure → fall back to text reply, never crash the turn
 *   8. voiceAdapter absent → no voice processing (backward-compat)
 *   9. voice disabled (stt=false) → no STT, no voice download
 */

import { describe, it, expect, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { bootstrapConnectorCommands } from '../../src/connectors/connector-bootstrap.js';
import type { IMessageConnector, IncomingMessage, MessageHandler } from '../../src/connectors/types.js';
import type { VoiceAdapter } from '../../src/connectors/voice/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'deckent-voice-wire-test-'));
}

/** Fake connector with getFileBuffer + sendVoice support. */
function fakeVoiceConnector(audioBuffer: Buffer, mime: string) {
  let handler: MessageHandler | undefined;
  return {
    id: 'telegram' as const,
    name: 'Telegram',
    start: vi.fn(async () => {}),
    startOutbound: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {}),
    onMessage: vi.fn((h: MessageHandler) => { handler = h; }),
    isHealthy: () => true,
    getFileBuffer: vi.fn(async (_fileId: string) => ({ data: audioBuffer, mime })),
    sendVoice: vi.fn(async () => {}),
    _emit: (m: IncomingMessage) => handler?.(m),
  };
}

/** Incoming message with raw.voice (inbound voice note). */
function incomingVoice(channelId: string, text: string = ''): IncomingMessage {
  return {
    id: 'msg-voice-1',
    connector: 'telegram',
    fromUser: 'u1',
    channelId,
    text,
    timestamp: new Date().toISOString(),
    raw: {
      voice: {
        fileId: 'AwABAgAD_voice_id',
        mime: 'audio/ogg',
        duration: 5,
      },
    },
  };
}

/** Incoming plain text message (no raw.voice). */
function incomingText(channelId: string, text: string): IncomingMessage {
  return {
    id: 'msg-text-1',
    connector: 'telegram',
    fromUser: 'u1',
    channelId,
    text,
    timestamp: new Date().toISOString(),
  };
}

/** Fake VoiceAdapter — transcribe → { text: "take a screenshot" }, synthesize → Buffer with audio. */
function fakeVoiceAdapter(
  transcribeResult = 'take a screenshot',
  synthesizeResult = { data: Buffer.from('audio-bytes'), mime: 'audio/ogg' },
): VoiceAdapter {
  return {
    transcribe: vi.fn(async () => ({ text: transcribeResult, language: undefined })),
    synthesize: vi.fn(async () => synthesizeResult),
  };
}

const cfg = { telegram: { enabled: true, token: 'bot:tok', chat_id: '555' } };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('voice wiring: inbound STT → agentic turn', () => {
  it('voice message: getFileBuffer called, transcribe called, chat receives transcribed text', async () => {
    const root = makeTmpRoot();
    const audioBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53]); // OGG magic bytes
    const fake = fakeVoiceConnector(audioBytes, 'audio/ogg');
    const voice = fakeVoiceAdapter('take a screenshot');

    const chatCalls: Array<{ channelId: string; text: string }> = [];
    const chat = vi.fn(async (channelId: string, text: string) => {
      chatCalls.push({ channelId, text });
      return 'Screenshot taken.';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'off' } },
    });

    fake._emit(incomingVoice('555'));

    await vi.waitFor(() => expect(chatCalls.length).toBeGreaterThan(0));

    // getFileBuffer called with the voice fileId
    expect(fake.getFileBuffer).toHaveBeenCalledWith('AwABAgAD_voice_id');
    // transcribe called with audio bytes
    expect(voice.transcribe).toHaveBeenCalledWith(audioBytes, 'audio/ogg');
    // chat received the transcribed text
    expect(chatCalls[0]!.text).toBe('take a screenshot');
  });

  it('voice + stt=false → no getFileBuffer, no transcribe, text passed unchanged', async () => {
    const root = makeTmpRoot();
    const fake = fakeVoiceConnector(Buffer.from(''), 'audio/ogg');
    const voice = fakeVoiceAdapter();

    const chatCalls: Array<{ text: string }> = [];
    const chat = vi.fn(async (_c: string, text: string) => {
      chatCalls.push({ text });
      return 'ok';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: false, tts: 'off' } },
    });

    fake._emit(incomingVoice('555', 'original text'));

    await vi.waitFor(() => expect(chatCalls.length).toBeGreaterThan(0));

    // stt disabled: no download, no transcribe
    expect(fake.getFileBuffer).not.toHaveBeenCalled();
    expect(voice.transcribe).not.toHaveBeenCalled();
    // text passed through as-is (empty because voice messages typically have no text)
    expect(chatCalls[0]!.text).toBe('original text');
  });

  it('voiceAdapter absent → voice message passes through (no download, backward-compat)', async () => {
    const root = makeTmpRoot();
    const fake = fakeVoiceConnector(Buffer.from(''), 'audio/ogg');

    const chatCalls: Array<{ text: string }> = [];
    const chat = vi.fn(async (_c: string, text: string) => {
      chatCalls.push({ text });
      return 'ok';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      // voiceAdapter NOT provided
    });

    fake._emit(incomingVoice('555', 'voice text'));

    await vi.waitFor(() => expect(chatCalls.length).toBeGreaterThan(0));

    // No voice processing — getFileBuffer NOT called
    expect(fake.getFileBuffer).not.toHaveBeenCalled();
  });

  it('transcribe failure → fall back to text path, no crash, no sendVoice', async () => {
    const root = makeTmpRoot();
    const fake = fakeVoiceConnector(Buffer.from([0x4f, 0x67, 0x67, 0x53]), 'audio/ogg');
    const voice: VoiceAdapter = {
      transcribe: vi.fn(async () => { throw new Error('STT unavailable'); }),
      synthesize: vi.fn(async () => ({ data: Buffer.from(''), mime: 'audio/ogg' })),
    };

    const chatCalls: Array<{ text: string }> = [];
    const chat = vi.fn(async (_c: string, text: string) => {
      chatCalls.push({ text });
      return 'fallback reply';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'reply-in-kind' } },
    });

    fake._emit(incomingVoice('555'));

    // Must not crash — wait a bit for the fallback path
    await new Promise((r) => setTimeout(r, 80));

    // sendVoice must NOT be called (STT failed → no voice-origin → no TTS)
    expect(fake.sendVoice).not.toHaveBeenCalled();
    // No crash: test completes normally
  });
});

describe('voice wiring: reply-in-kind TTS', () => {
  it('reply-in-kind + voice-origin → sendVoice called, no text sendMessage for reply body', async () => {
    const root = makeTmpRoot();
    const audioBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53]);
    const fake = fakeVoiceConnector(audioBytes, 'audio/ogg');
    const synthAudio = { data: Buffer.from('synth-bytes'), mime: 'audio/ogg' };
    const voice = fakeVoiceAdapter('take a screenshot', synthAudio);

    const chat = vi.fn(async () => '**Screenshot taken.** Done!');

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'reply-in-kind' } },
    });

    fake._emit(incomingVoice('555'));

    // Wait for the full STT → chat → TTS → sendVoice pipeline
    await vi.waitFor(() => expect(fake.sendVoice).toHaveBeenCalledTimes(1));

    // sendVoice called with the synthesized audio
    expect(fake.sendVoice).toHaveBeenCalledWith('555', synthAudio);

    // synthesize was called with stripped text (no markdown)
    expect(voice.synthesize).toHaveBeenCalled();
    const synthCall = (voice.synthesize as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
    // should NOT contain markdown bold markers
    expect(synthCall[0]).not.toContain('**');
    expect(synthCall[0]).toContain('Screenshot taken.');

    // no text reply sendMessage for the reply body (voice-only path)
    // (thinking ack is ok, but the reply text itself should not be sent)
    const replyBodyCalls = fake.sendMessage.mock.calls.filter(
      (c) => (c[0] as { text: string }).text?.includes('Screenshot taken'),
    );
    expect(replyBodyCalls).toHaveLength(0);
  });

  it('tts=always + voice-origin → sendVoice called', async () => {
    const root = makeTmpRoot();
    const fake = fakeVoiceConnector(Buffer.from([0x4f]), 'audio/ogg');
    const synthAudio = { data: Buffer.from('voice-reply'), mime: 'audio/mp3' };
    const voice = fakeVoiceAdapter('hello world', synthAudio);
    const chat = vi.fn(async () => 'Hello back.');

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'always' } },
    });

    fake._emit(incomingVoice('555'));

    await vi.waitFor(() => expect(fake.sendVoice).toHaveBeenCalledTimes(1));
    expect(fake.sendVoice).toHaveBeenCalledWith('555', synthAudio);
  });

  it('tts=always + text-origin → sendVoice called AND text reply NOT sent', async () => {
    // Finding 1 fix: 'always' means EVERY turn including text-origin
    const root = makeTmpRoot();
    const synthAudio = { data: Buffer.from('synth-text-origin'), mime: 'audio/ogg' };
    const fake = fakeVoiceConnector(Buffer.from([0x4f]), 'audio/ogg');
    const voice = fakeVoiceAdapter('', synthAudio);
    const chat = vi.fn(async () => 'Text-origin reply.');

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'always' } },
    });

    fake._emit(incomingText('555', 'hello'));

    // Wait for sendVoice (tts=always fires even for text-origin)
    await vi.waitFor(() => expect(fake.sendVoice).toHaveBeenCalledTimes(1));
    expect(fake.sendVoice).toHaveBeenCalledWith('555', synthAudio);

    // Text reply (the reply body) must NOT be sent — voice replaces text
    const replyBodyCalls = fake.sendMessage.mock.calls.filter(
      (c) => (c[0] as { text: string }).text?.includes('Text-origin reply'),
    );
    expect(replyBodyCalls).toHaveLength(0);
  });

  it('tts=always + voice-origin → sendVoice called AND text reply NOT sent', async () => {
    // Finding 1 fix: always mode must also skip text reply when voice succeeds
    const root = makeTmpRoot();
    const audioBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53]);
    const synthAudio = { data: Buffer.from('synth-voice-always'), mime: 'audio/ogg' };
    const fake = fakeVoiceConnector(audioBytes, 'audio/ogg');
    const voice = fakeVoiceAdapter('hello world', synthAudio);
    const chat = vi.fn(async () => 'Always-voice reply body.');

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'always' } },
    });

    fake._emit(incomingVoice('555'));

    await vi.waitFor(() => expect(fake.sendVoice).toHaveBeenCalledTimes(1));
    expect(fake.sendVoice).toHaveBeenCalledWith('555', synthAudio);

    // Text reply body must NOT be sent
    const replyBodyCalls = fake.sendMessage.mock.calls.filter(
      (c) => (c[0] as { text: string }).text?.includes('Always-voice reply body'),
    );
    expect(replyBodyCalls).toHaveLength(0);
  });

  it('tts=off → never sendVoice even for voice-origin', async () => {
    const root = makeTmpRoot();
    const fake = fakeVoiceConnector(Buffer.from([0x4f, 0x67, 0x67, 0x53]), 'audio/ogg');
    const voice = fakeVoiceAdapter('hi');
    const chat = vi.fn(async () => 'Hi back.');

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'off' } },
    });

    fake._emit(incomingVoice('555'));

    await vi.waitFor(() => expect(chat).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));

    expect(fake.sendVoice).not.toHaveBeenCalled();
  });

  it('synthesize failure → fall back to text reply, no crash', async () => {
    const root = makeTmpRoot();
    const fake = fakeVoiceConnector(Buffer.from([0x4f, 0x67, 0x67, 0x53]), 'audio/ogg');
    const voice: VoiceAdapter = {
      transcribe: vi.fn(async () => ({ text: 'hi', language: undefined })),
      synthesize: vi.fn(async () => { throw new Error('TTS unavailable'); }),
    };
    const chat = vi.fn(async () => 'Hello reply text.');

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'reply-in-kind' } },
    });

    fake._emit(incomingVoice('555'));

    // Should fall back to text reply (sendMessage), not crash
    await vi.waitFor(() => {
      const allTexts = fake.sendMessage.mock.calls.map((c) => (c[0] as { text: string }).text).join('\n');
      expect(allTexts).toContain('Hello reply text.');
    });
    // sendVoice not called (synthesize failed)
    expect(fake.sendVoice).not.toHaveBeenCalled();
  });

  it('sendVoice failure → fall back to text reply, no crash', async () => {
    const root = makeTmpRoot();
    const audioBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53]);
    const synthAudio = { data: Buffer.from('synth'), mime: 'audio/ogg' };
    const voice = fakeVoiceAdapter('hi', synthAudio);
    const sendVoiceFn = vi.fn(async () => { throw new Error('sendVoice network error'); });
    let handler: MessageHandler | undefined;
    const fake = {
      id: 'telegram' as const,
      name: 'Telegram',
      start: vi.fn(async () => {}),
      startOutbound: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      sendMessage: vi.fn(async () => {}),
      onMessage: vi.fn((h: MessageHandler) => { handler = h; }),
      isHealthy: () => true,
      getFileBuffer: vi.fn(async () => ({ data: audioBytes, mime: 'audio/ogg' })),
      sendVoice: sendVoiceFn,
      _emit: (m: IncomingMessage) => handler?.(m),
    };

    const chat = vi.fn(async () => 'Fallback text reply.');

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'reply-in-kind' } },
    });

    fake._emit(incomingVoice('555'));

    // After sendVoice throws, text reply should be sent as fallback
    await vi.waitFor(() => {
      const allTexts = fake.sendMessage.mock.calls.map((c) => (c[0] as { text: string }).text).join('\n');
      expect(allTexts).toContain('Fallback text reply.');
    });
    expect(sendVoiceFn).toHaveBeenCalled(); // was attempted
  });
});

describe('voice wiring: task 3 — detected language threaded to the turn', () => {
  it('inbound voice with language="tr" → chat receives detectedLang="tr" as 4th arg', async () => {
    const root = makeTmpRoot();
    const audioBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53]);
    const fake = fakeVoiceConnector(audioBytes, 'audio/ogg');
    // Fake adapter returns both text AND detected language
    const voice: VoiceAdapter = {
      transcribe: vi.fn(async () => ({ text: 'ekran görüntüsü al', language: 'tr' })),
      synthesize: vi.fn(async () => ({ data: Buffer.from(''), mime: 'audio/ogg' })),
    };

    const chatLangs: Array<string | undefined> = [];
    const chat = vi.fn(async (_channelId: string, _text: string, _media?: unknown, detectedLang?: string) => {
      chatLangs.push(detectedLang);
      return 'Ekran görüntüsü alındı.';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat: chat as unknown as import('../../src/connectors/chat-bridge.js').ChatResponder,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'off' } },
    });

    fake._emit(incomingVoice('555'));

    await vi.waitFor(() => expect(chatLangs.length).toBeGreaterThan(0));

    // The detected language 'tr' must be threaded into the turn
    expect(chatLangs[0]).toBe('tr');
    // Transcribed text still routed correctly
    expect((chat.mock.calls[0] as unknown[])[1]).toBe('ekran görüntüsü al');
  });

  it('inbound voice with language=undefined → chat receives detectedLang=undefined (no injection)', async () => {
    const root = makeTmpRoot();
    const fake = fakeVoiceConnector(Buffer.from([0x4f]), 'audio/ogg');
    const voice: VoiceAdapter = {
      transcribe: vi.fn(async () => ({ text: 'hello', language: undefined })),
      synthesize: vi.fn(async () => ({ data: Buffer.from(''), mime: 'audio/ogg' })),
    };

    const chatLangs: Array<string | undefined> = [];
    const chat = vi.fn(async (_channelId: string, _text: string, _media?: unknown, detectedLang?: string) => {
      chatLangs.push(detectedLang);
      return 'ok';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat: chat as unknown as import('../../src/connectors/chat-bridge.js').ChatResponder,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'off' } },
    });

    fake._emit(incomingVoice('555'));

    await vi.waitFor(() => expect(chatLangs.length).toBeGreaterThan(0));

    expect(chatLangs[0]).toBeUndefined();
  });

  it('text-origin turn → detectedLang not set (pendingVoiceLang map stays clean)', async () => {
    const root = makeTmpRoot();
    const fake = fakeVoiceConnector(Buffer.from([]), 'audio/ogg');
    const voice: VoiceAdapter = {
      transcribe: vi.fn(async () => ({ text: '', language: 'en' })),
      synthesize: vi.fn(async () => ({ data: Buffer.from(''), mime: 'audio/ogg' })),
    };

    const chatLangs: Array<string | undefined> = [];
    const chat = vi.fn(async (_channelId: string, _text: string, _media?: unknown, detectedLang?: string) => {
      chatLangs.push(detectedLang);
      return 'ok';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat: chat as unknown as import('../../src/connectors/chat-bridge.js').ChatResponder,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'off' } },
    });

    // Text-origin turn (no raw.voice)
    fake._emit(incomingText('555', 'hello'));

    await vi.waitFor(() => expect(chatLangs.length).toBeGreaterThan(0));

    // Text turns must NOT inject a detectedLang
    expect(chatLangs[0]).toBeUndefined();
    // transcribe was NOT called (no voice raw)
    expect(voice.transcribe).not.toHaveBeenCalled();
  });
});

describe('voice wiring: streaming path — voice replaces text', () => {
  /** Fake connector with full streaming caps + sendVoice. */
  function fakeStreamingVoiceConnector(audioBuffer: Buffer, mime: string) {
    let handler: MessageHandler | undefined;
    return {
      id: 'telegram' as const,
      name: 'Telegram',
      start: vi.fn(async () => {}),
      startOutbound: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      sendMessage: vi.fn(async () => {}),
      onMessage: vi.fn((h: MessageHandler) => { handler = h; }),
      isHealthy: () => true,
      getFileBuffer: vi.fn(async (_fileId: string) => ({ data: audioBuffer, mime })),
      sendVoice: vi.fn(async () => {}),
      // Streaming caps
      sendChatAction: vi.fn(async () => {}),
      sendMessageReturningId: vi.fn(async () => 'msg-placeholder-id'),
      editMessage: vi.fn(async () => {}),
      _emit: (m: IncomingMessage) => handler?.(m),
    };
  }

  it('streaming + reply-in-kind + voice-origin → sendVoice called, NO streamed text, NO sendMessage for reply body', async () => {
    // Finding 2 fix: voice-reply turns must bypass the streaming text path entirely
    const root = makeTmpRoot();
    const audioBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53]);
    const synthAudio = { data: Buffer.from('stream-voice-synth'), mime: 'audio/ogg' };
    const fake = fakeStreamingVoiceConnector(audioBytes, 'audio/ogg');
    const voice = fakeVoiceAdapter('stream hello', synthAudio);

    const chat = vi.fn(async () => 'Stream voice reply body.');
    // Streaming responder: calls onPartial a few times then returns final
    const onChatStreaming = vi.fn(async (
      _channelId: string,
      _text: string,
      onPartial: (p: string) => void,
    ) => {
      onPartial('Stream ');
      onPartial('voice ');
      onPartial('reply body.');
      return 'Stream voice reply body.';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      onChatStreaming,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'reply-in-kind' } },
    });

    fake._emit(incomingVoice('555'));

    // Wait for sendVoice — voice must be sent
    await vi.waitFor(() => expect(fake.sendVoice).toHaveBeenCalledTimes(1));
    expect(fake.sendVoice).toHaveBeenCalledWith('555', synthAudio);

    // editMessage must NOT have been called (no streaming text was sent)
    expect(fake.editMessage).not.toHaveBeenCalled();

    // sendMessageReturningId must NOT have been called (no placeholder was created)
    expect(fake.sendMessageReturningId).not.toHaveBeenCalled();

    // No text sendMessage for the reply body
    const replyBodyCalls = fake.sendMessage.mock.calls.filter(
      (c) => (c[0] as { text: string }).text?.includes('Stream voice reply body'),
    );
    expect(replyBodyCalls).toHaveLength(0);
  });

  it('streaming + reply-in-kind + voice-origin + synthesize failure → text reply sent as fallback (no crash)', async () => {
    // Finding 2: on TTS failure in streaming-voice path, fall back to sendRich (text)
    const root = makeTmpRoot();
    const audioBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53]);
    const fake = fakeStreamingVoiceConnector(audioBytes, 'audio/ogg');
    const voice: VoiceAdapter = {
      transcribe: vi.fn(async () => ({ text: 'hello stream', language: undefined })),
      synthesize: vi.fn(async () => { throw new Error('TTS down in streaming path'); }),
    };

    const chat = vi.fn(async () => 'Streaming fallback text.'); // non-streaming fallback (not called when streaming)
    const onChatStreaming = vi.fn(async () => 'Streaming fallback text.');

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      onChatStreaming,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'reply-in-kind' } },
    });

    fake._emit(incomingVoice('555'));

    // Synthesize fails → text reply fallback via sendRich (sendMessage)
    await vi.waitFor(() => {
      const allTexts = fake.sendMessage.mock.calls.map((c) => (c[0] as { text: string }).text).join('\n');
      expect(allTexts).toContain('Streaming fallback text.');
    });
    // sendVoice was not called (synthesize failed before it)
    expect(fake.sendVoice).not.toHaveBeenCalled();
  });
});
