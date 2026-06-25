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
    // chat received the transcribed text — WS1 T5: instruction prepended (mirror mode: no lang detected)
    // assert that the transcribed text is still present in the turn text
    expect(chatCalls[0]!.text).toContain('take a screenshot');
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
    // text contains the original text — WS1 T5: instruction prepended (mirror mode, voice cfg present)
    expect(chatCalls[0]!.text).toContain('original text');
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
    // Transcribed text still routed correctly — WS1 T5: instruction prepended, text is within it
    const turnText = (chat.mock.calls[0] as unknown[])[1] as string;
    expect(turnText).toContain('ekran görüntüsü al');
    // Forced-tr instruction must be in the turn text
    expect(turnText).toMatch(/Reply ONLY in tr|SADECE tr/i);
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

describe('voice wiring: task 5 — reply-language instruction injection + TTS language passthrough', () => {
  /**
   * Task 5 TDD suite.
   *
   * A voice turn with detectedLang='tr' AND voiceCfg.language='auto' (or absent)
   * must:
   *  (a) Prepend the forced-tr instruction to the text the chat responder receives.
   *  (b) Pass language:'tr' to voice.synthesize (TTS language hint).
   *
   * A voice turn with voiceCfg.language='tr' (config-forced) must also prepend
   * the forced instruction even when detectedLang is absent.
   *
   * A voice turn with no detectedLang AND voiceCfg.language absent/auto must
   * prepend the mirror instruction (no specific language) and pass language:undefined
   * to synthesize.
   *
   * A text-origin turn (no voice config) must receive no instruction prepended
   * (default-off: behavior unchanged when voice config is absent).
   */

  it('forced-tr: voice detects tr → chat text has forced-tr instruction prepended + synthesize called with language:tr', async () => {
    const root = makeTmpRoot();
    const audioBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53]);
    const fake = fakeVoiceConnector(audioBytes, 'audio/ogg');
    const synthAudio = { data: Buffer.from('tr-audio'), mime: 'audio/ogg' };
    const voice: VoiceAdapter = {
      transcribe: vi.fn(async () => ({ text: 'ekran görüntüsü al', language: 'tr' })),
      synthesize: vi.fn(async () => synthAudio),
    };

    const chatTexts: string[] = [];
    const chat = vi.fn(async (_channelId: string, text: string) => {
      chatTexts.push(text);
      return 'Ekran görüntüsü alındı.';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat: chat as unknown as import('../../src/connectors/chat-bridge.js').ChatResponder,
      voiceAdapter: voice,
      // language absent (auto) → STT-detected 'tr' triggers forced mode
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'reply-in-kind' } },
    });

    fake._emit(incomingVoice('555'));

    await vi.waitFor(() => expect(chatTexts.length).toBeGreaterThan(0));

    // (a) Instruction must be prepended — contains the language tag and "ONLY"/"SADECE"
    expect(chatTexts[0]).toMatch(/Reply ONLY in tr|SADECE tr/i);
    expect(chatTexts[0]).toContain('ekran görüntüsü al');

    // (b) synthesize must have been called with language: 'tr'
    await vi.waitFor(() => expect(fake.sendVoice).toHaveBeenCalledTimes(1));
    const synthCalls = (voice.synthesize as ReturnType<typeof vi.fn>).mock.calls;
    expect(synthCalls.length).toBeGreaterThan(0);
    const synthOpts = synthCalls[0]![1] as { language?: string } | undefined;
    expect(synthOpts?.language).toBe('tr');
  });

  it('forced-tr: config language=tr + no detectedLang → chat text has forced instruction + synthesize language:tr', async () => {
    const root = makeTmpRoot();
    const audioBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53]);
    const fake = fakeVoiceConnector(audioBytes, 'audio/ogg');
    const synthAudio = { data: Buffer.from('cfg-tr-audio'), mime: 'audio/ogg' };
    const voice: VoiceAdapter = {
      // no language returned from STT
      transcribe: vi.fn(async () => ({ text: 'merhaba', language: undefined })),
      synthesize: vi.fn(async () => synthAudio),
    };

    const chatTexts: string[] = [];
    const chat = vi.fn(async (_channelId: string, text: string) => {
      chatTexts.push(text);
      return 'Merhaba!';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat: chat as unknown as import('../../src/connectors/chat-bridge.js').ChatResponder,
      voiceAdapter: voice,
      // config-level forced language
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'reply-in-kind', language: 'tr' } },
    });

    fake._emit(incomingVoice('555'));

    await vi.waitFor(() => expect(chatTexts.length).toBeGreaterThan(0));

    // Forced instruction must be in the text
    expect(chatTexts[0]).toMatch(/Reply ONLY in tr|SADECE tr/i);

    // synthesize called with language: 'tr'
    await vi.waitFor(() => expect(fake.sendVoice).toHaveBeenCalledTimes(1));
    const synthCalls = (voice.synthesize as ReturnType<typeof vi.fn>).mock.calls;
    expect(synthCalls.length).toBeGreaterThan(0);
    const synthOpts = synthCalls[0]![1] as { language?: string } | undefined;
    expect(synthOpts?.language).toBe('tr');
  });

  it('mirror: no detectedLang AND no config language → mirror instruction prepended + synthesize language:undefined', async () => {
    const root = makeTmpRoot();
    const audioBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53]);
    const fake = fakeVoiceConnector(audioBytes, 'audio/ogg');
    const synthAudio = { data: Buffer.from('mirror-audio'), mime: 'audio/ogg' };
    const voice: VoiceAdapter = {
      // no language
      transcribe: vi.fn(async () => ({ text: 'hello there', language: undefined })),
      synthesize: vi.fn(async () => synthAudio),
    };

    const chatTexts: string[] = [];
    const chat = vi.fn(async (_channelId: string, text: string) => {
      chatTexts.push(text);
      return 'Hello!';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat: chat as unknown as import('../../src/connectors/chat-bridge.js').ChatResponder,
      voiceAdapter: voice,
      // no language config → mirror mode
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'reply-in-kind' } },
    });

    fake._emit(incomingVoice('555'));

    await vi.waitFor(() => expect(chatTexts.length).toBeGreaterThan(0));

    // Mirror instruction must be in the text
    expect(chatTexts[0]).toMatch(/same language|kullandığı dilde/i);
    expect(chatTexts[0]).toContain('hello there');

    // synthesize called WITHOUT language (mirror → tag is null → undefined)
    await vi.waitFor(() => expect(fake.sendVoice).toHaveBeenCalledTimes(1));
    const synthCalls = (voice.synthesize as ReturnType<typeof vi.fn>).mock.calls;
    expect(synthCalls.length).toBeGreaterThan(0);
    const synthOpts = synthCalls[0]![1] as { language?: string } | undefined;
    // language should be undefined when mirror mode (no tag)
    expect(synthOpts?.language).toBeUndefined();
  });

  it('default-off: no voice config → no instruction prepended (text-origin, backward-compat)', async () => {
    const root = makeTmpRoot();
    const fake = fakeVoiceConnector(Buffer.from([]), 'audio/ogg');

    const chatTexts: string[] = [];
    const chat = vi.fn(async (_channelId: string, text: string) => {
      chatTexts.push(text);
      return 'ok';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat: chat as unknown as import('../../src/connectors/chat-bridge.js').ChatResponder,
      // no voiceAdapter, no botCapabilities
    });

    fake._emit(incomingText('555', 'hello world'));

    await vi.waitFor(() => expect(chatTexts.length).toBeGreaterThan(0));

    // No instruction prepended — text unchanged
    expect(chatTexts[0]).toBe('hello world');
  });
});

// ─── WS2 Task 2: per-turn modality override ───────────────────────────────────
describe('voice wiring: ws2 task 2 — per-turn modality override', () => {
  /**
   * (a) voice-origin + reply-in-kind + transcript contains "bana yaz"
   *     → override to TEXT → sendVoice NOT called, text reply IS sent
   */
  it('voice-origin + reply-in-kind + "bana yaz" in transcript → text reply, sendVoice NOT called', async () => {
    const root = makeTmpRoot();
    const audioBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53]);
    const fake = fakeVoiceConnector(audioBytes, 'audio/ogg');
    const synthAudio = { data: Buffer.from('should-not-be-sent'), mime: 'audio/ogg' };
    // Transcript contains "bana yaz" → text override
    const voice = fakeVoiceAdapter('bana yaz bunu', synthAudio);
    const chat = vi.fn(async () => 'Text reply because of bana yaz.');

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'reply-in-kind' } },
    });

    fake._emit(incomingVoice('555'));

    // Wait for chat to be called
    await vi.waitFor(() => expect(chat).toHaveBeenCalled());
    // Give the pipeline time to finish
    await new Promise((r) => setTimeout(r, 80));

    // sendVoice must NOT be called — override to text
    expect(fake.sendVoice).not.toHaveBeenCalled();
    // Text reply must be sent
    const allTexts = fake.sendMessage.mock.calls.map((c) => (c[0] as { text: string }).text).join('\n');
    expect(allTexts).toContain('Text reply because of bana yaz.');
  });

  /**
   * (b) text-origin + reply-in-kind + message contains "sesli cevap ver"
   *     → override to VOICE → sendVoice IS called
   */
  it('text-origin + reply-in-kind + "sesli cevap ver" → sendVoice called', async () => {
    const root = makeTmpRoot();
    const synthAudio = { data: Buffer.from('voice-override-reply'), mime: 'audio/ogg' };
    const fake = fakeVoiceConnector(Buffer.from([0x4f]), 'audio/ogg');
    const voice = fakeVoiceAdapter('', synthAudio);
    const chat = vi.fn(async () => 'Voice override reply.');

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'reply-in-kind' } },
    });

    // text-origin message that explicitly requests voice reply
    fake._emit(incomingText('555', 'sesli cevap ver bunu'));

    // sendVoice must be called (override to voice even though text-origin + reply-in-kind)
    await vi.waitFor(() => expect(fake.sendVoice).toHaveBeenCalledTimes(1));
    expect(fake.sendVoice).toHaveBeenCalledWith('555', synthAudio);
    // Text reply body must NOT be sent (voice replaced it)
    const replyBodyCalls = fake.sendMessage.mock.calls.filter(
      (c) => (c[0] as { text: string }).text?.includes('Voice override reply.'),
    );
    expect(replyBodyCalls).toHaveLength(0);
  });

  /**
   * (c) regression: voice-origin + reply-in-kind + NO modality phrase → still voice
   *     (default behavior preserved when no override phrase present)
   */
  it('regression: voice-origin + reply-in-kind + no phrase → still voice (default unchanged)', async () => {
    const root = makeTmpRoot();
    const audioBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53]);
    const synthAudio = { data: Buffer.from('default-voice'), mime: 'audio/ogg' };
    const fake = fakeVoiceConnector(audioBytes, 'audio/ogg');
    const voice = fakeVoiceAdapter('ekran görüntüsü al', synthAudio);
    const chat = vi.fn(async () => 'Default voice reply.');

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'reply-in-kind' } },
    });

    fake._emit(incomingVoice('555'));

    // Default: voice-origin + reply-in-kind → voice (no override phrase → unchanged)
    await vi.waitFor(() => expect(fake.sendVoice).toHaveBeenCalledTimes(1));
    expect(fake.sendVoice).toHaveBeenCalledWith('555', synthAudio);
  });

  /**
   * (d) honest-degrade still works: override=voice (text-origin + "sesli cevap ver")
   *     but synthesize throws → falls back to text reply (no crash)
   */
  it('modality-override=voice but synthesize throws → honest text fallback, no crash', async () => {
    const root = makeTmpRoot();
    const fake = fakeVoiceConnector(Buffer.from([0x4f]), 'audio/ogg');
    const voice: VoiceAdapter = {
      transcribe: vi.fn(async () => ({ text: '', language: undefined })),
      synthesize: vi.fn(async () => { throw new Error('TTS unavailable'); }),
    };
    const chat = vi.fn(async () => 'Degrade fallback text reply.');

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      voiceAdapter: voice,
      botCapabilities: { voice: { enabled: true, stt: true, tts: 'reply-in-kind' } },
    });

    // text-origin message requesting voice reply, but TTS will fail
    fake._emit(incomingText('555', 'sesli cevap ver bunu'));

    // Must fall back to text reply (synthesize failed → honest degrade)
    await vi.waitFor(() => {
      const allTexts = fake.sendMessage.mock.calls.map((c) => (c[0] as { text: string }).text).join('\n');
      expect(allTexts).toContain('Degrade fallback text reply.');
    });
    // sendVoice was never called (synthesize failed first)
    expect(fake.sendVoice).not.toHaveBeenCalled();
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
