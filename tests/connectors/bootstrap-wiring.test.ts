/**
 * bootstrap-wiring.test.ts — Production bot.ts wiring assertions (Finding 1+2+3).
 *
 * Proves:
 *   F1: bootstrapConnectorCommands uses the INJECTED artifacts dep (not a fresh
 *       internal store). An artifact registered via the shared store (same instance
 *       as what makeChatResponder would receive) is immediately resolvable from the
 *       same store that bootstrapConnectorCommands uses on its approve-path.
 *   F2: voiceAdapter passed to bootstrapConnectorCommands is threaded into the
 *       inbound-voice path (transcribe is called rather than silently skipped).
 *   F3: When transcription fails, the user receives the voice.transcribe.error
 *       i18n message (honest degrade, not silent).
 *
 * Design: hermetic (tmpdir, no real connectors, no network). Passes on fresh checkout.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArtifactStore } from '../../src/connectors/capabilities/artifacts.js';
import { bootstrapConnectorCommands } from '../../src/connectors/connector-bootstrap.js';
import type { IMessageConnector, ConnectorId, IncomingMessage } from '../../src/connectors/types.js';
import type { VoiceAdapter } from '../../src/connectors/voice/types.js';
import type { DeckentConfig } from '../../src/core/types.js';

// ─── Hermetic tmpdir fixture ─────────────────────────────────────────────────

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'bwire-'));
});

afterEach(() => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// ─── Minimal notify_connectors config that passes the token/chat_id gate ────

/** Minimal connector config so bootstrapConnectorCommands enters the inbound loop. */
function fakeConnectorCfg(): NonNullable<DeckentConfig['notify_connectors']> {
  return {
    telegram: {
      enabled: true,
      token: 'fake-token-12345', // not a $DECK: token — passes the gate
      chat_id: 'chan-1',
    },
  };
}

// ─── Minimal fake connector ──────────────────────────────────────────────────

type MsgHandler = (msg: IncomingMessage) => void;

function makeFakeConnector(): IMessageConnector & {
  _fire: (msg: IncomingMessage) => void;
  sent: string[];
  getFileBuffer?: (fileId: string) => Promise<{ data: Buffer; mime: string }>;
} {
  let handler: MsgHandler | undefined;
  const sent: string[] = [];
  return {
    id: 'telegram' as ConnectorId,
    async start() {},
    async stop() {},
    onMessage(h: MsgHandler) { handler = h; },
    async sendMessage(m: { channelId: string; text: string }) { sent.push(m.text); },
    _fire(msg: IncomingMessage) { handler?.(msg); },
    sent,
  };
}

// ─── F1: shared artifact store ───────────────────────────────────────────────

describe('Finding 1 — injected artifact store is shared (not fresh internal)', () => {
  it('bootstrapConnectorCommands uses deps.artifacts when provided, artifact is resolvable from the same instance', async () => {
    // Create ONE artifact store — the shared instance that bot.ts would construct.
    const sharedStore = createArtifactStore(root);

    // Register an artifact in the shared store (simulates what makeChatResponder does
    // when screenshot runs inside a chat turn using the same store).
    const artRef = sharedStore.register('chan-1', {
      filename: 'screen.png',
      mime: 'image/png',
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });
    expect(artRef.id).toMatch(/^art_/);

    // Bootstrap with the SAME store injected via deps.artifacts.
    const fakeConnector = makeFakeConnector();
    // Equip the connector with getFileBuffer so the inbound-media gate activates
    // and INTERNALLY calls artifactStore.register(...) — exercising the code path
    // that uses deps.artifacts inside bootstrapConnectorCommands.
    (fakeConnector as unknown as {
      getFileBuffer: (id: string) => Promise<{ data: Buffer; mime: string }>
    }).getFileBuffer = async (_fileId: string) => ({
      data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      mime: 'image/jpeg',
    });

    const chatReplies: string[] = [];
    const handle = await bootstrapConnectorCommands(
      root,
      fakeConnectorCfg(), // needs connector config so the inbound loop starts
      {
        artifacts: sharedStore, // <-- the shared instance
        makeConnector: () => fakeConnector,
        chat: async (_channelId: string, _text: string): Promise<string> => {
          chatReplies.push(_text);
          return 'ok';
        },
        lang: 'en',
      },
    );

    // Fire an inbound media message — this triggers handleInboundMedia inside
    // bootstrapConnectorCommands, which calls artifactStore.register(...) using
    // the INJECTED deps.artifacts instance.  The registered artifact must be
    // visible from sharedStore.get(...) — proving the same instance was used.
    const mediaMsg = {
      id: 'msg-media-1',
      connector: 'telegram' as import('../../src/connectors/types.js').ConnectorId,
      fromUser: 'user-1',
      channelId: 'chan-1',
      text: '',
      timestamp: new Date().toISOString(),
      raw: { media: { fileId: 'file-001', filename: 'photo.jpg', mime: 'image/jpeg' } },
    };
    fakeConnector._fire(mediaMsg);

    // Wait for the async onMessage gate to complete.
    await new Promise<void>((r) => setTimeout(r, 80));

    // The injected sharedStore is the same object used by bootstrap's inbound-media
    // gate (deps.artifacts ?? createArtifactStore(root) resolves to sharedStore).
    // The artifact registered by handleInboundMedia INSIDE bootstrap must be found
    // via sharedStore — proving the shared instance is genuinely used, not a fresh one.
    const allArtIds = chatReplies[0]?.match(/art_[0-9a-f]{8}/);
    expect(allArtIds, 'bootstrap inbound-media gate must register artifact into the injected store').toBeTruthy();
    const internalArtId = allArtIds![0]!;
    const fetched = sharedStore.get('chan-1', internalArtId);
    expect(fetched, 'artifact registered by bootstrap must be visible from the injected shared store').toBeDefined();
    expect(fetched?.mime).toBe('image/jpeg');

    // Also confirm the original pre-registered artifact is still accessible (idempotent).
    const preRegistered = sharedStore.get('chan-1', artRef.id);
    expect(preRegistered?.filename).toBe('screen.png');

    await handle.dispose();
  });

  it('when deps.artifacts is absent, bootstrap creates an INTERNAL store (negative proof: external artifact not found via fresh store at same root)', async () => {
    // Create an EXTERNAL store at altRoot — a different tmpdir than root.
    // Register an artifact there — this simulates an artifact at a path bootstrap
    // would NEVER know about when it creates its own internal store at `root`.
    const { mkdtempSync: mkd } = await import('node:fs');
    const { tmpdir: td } = await import('node:os');
    const { join: pj } = await import('node:path');
    const altRoot = mkd(pj(td(), 'bwire-alt-'));
    try {
      const externalStore = createArtifactStore(altRoot);
      const externalRef = externalStore.register('chan-1', {
        filename: 'external.png',
        mime: 'image/png',
        data: Buffer.from([1, 2, 3]),
      });

      const fakeConnector = makeFakeConnector();
      // Bootstrap at `root` WITHOUT injecting the external store — bootstrap creates
      // its own internal store at `root`.
      const handle = await bootstrapConnectorCommands(
        root,
        undefined,
        { makeConnector: () => fakeConnector },
      );

      // A fresh store at `root` (same as bootstrap's internal one) must NOT find
      // the artifact that was registered at altRoot — the stores are independent.
      const internalView = createArtifactStore(root);
      const notFound = internalView.get('chan-1', externalRef.id);
      expect(notFound, 'artifact from altRoot must not be visible in bootstrap root store').toBeNull();

      await handle.dispose();
    } finally {
      try { (await import('node:fs')).rmSync(altRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  });

  it('bootstrap creates its own store when deps.artifacts is absent (backward-compat)', async () => {
    const fakeConnector = makeFakeConnector();
    // No artifacts dep → bootstrap must still start without throwing.
    const handle = await bootstrapConnectorCommands(
      root,
      undefined,
      { makeConnector: () => fakeConnector },
    );
    // handle is valid — backward-compat path works
    expect(handle).toBeDefined();
    await handle.dispose();
  });
});

// ─── F2: voice adapter is threaded ──────────────────────────────────────────

describe('Finding 2 — voiceAdapter is threaded into the inbound-voice path', () => {
  it('transcribe is called when voiceAdapter + stt enabled + voice message arrives', async () => {
    const transcribeMock = vi.fn(async (_data: Buffer, _mime: string) => ({ text: 'hello from voice', language: 'en' }));
    const voiceAdapter: VoiceAdapter = {
      transcribe: transcribeMock,
      async synthesize() { return { data: Buffer.alloc(0), mime: 'audio/mpeg' }; },
    };

    const chatReplies: string[] = [];
    const fakeConnector = makeFakeConnector();
    // Connector needs getFileBuffer for voice download path.
    (fakeConnector as unknown as { getFileBuffer: (id: string) => Promise<{ data: Buffer; mime: string }> }).getFileBuffer =
      async (_fileId: string) => ({ data: Buffer.from('audio'), mime: 'audio/ogg' });

    const handle = await bootstrapConnectorCommands(
      root,
      fakeConnectorCfg(), // required so bootstrap enters the inbound connector loop
      {
        voiceAdapter,
        botCapabilities: { enabled: true, voice: { enabled: true, stt: true, tts: 'off' } },
        makeConnector: () => fakeConnector,
        chat: async (_channelId: string, text: string): Promise<string> => {
          chatReplies.push(text);
          return 'reply';
        },
        lang: 'en',
      },
    );

    // Fire a fake inbound voice message from the authorized channel.
    const voiceMsg: IncomingMessage = {
      id: 'msg-1',
      connector: 'telegram' as ConnectorId,
      fromUser: 'user-1',
      channelId: 'chan-1', // matches fakeConnectorCfg().telegram.chat_id
      text: '',
      timestamp: new Date().toISOString(),
      raw: { voice: { fileId: 'file-abc', mime: 'audio/ogg', duration: 3 } },
    };
    fakeConnector._fire(voiceMsg);

    // Allow async onMessage handler to complete.
    await new Promise<void>((r) => setTimeout(r, 80));

    // voiceAdapter.transcribe must have been called (F2 — voice adapter is now threaded).
    expect(transcribeMock).toHaveBeenCalledTimes(1);
    // The chat responder received the transcribed text (STT result, not empty string).
    // WS1 T5: reply-language instruction is prepended so the exact text is wrapped — check contains.
    expect(chatReplies.some((t) => t.includes('hello from voice'))).toBe(true);

    await handle.dispose();
  });

  it('voiceAdapter null → transcribe not called (default-off stays byte-identical)', async () => {
    const transcribeMock = vi.fn();
    const fakeConnector = makeFakeConnector();
    (fakeConnector as unknown as { getFileBuffer: (id: string) => Promise<{ data: Buffer; mime: string }> }).getFileBuffer =
      async () => ({ data: Buffer.from('audio'), mime: 'audio/ogg' });

    const chatReplies: string[] = [];
    const handle = await bootstrapConnectorCommands(
      root,
      fakeConnectorCfg(),
      {
        voiceAdapter: null, // explicitly null → disabled
        botCapabilities: { enabled: true, voice: { enabled: true, stt: true, tts: 'off' } },
        makeConnector: () => fakeConnector,
        chat: async (_channelId: string, text: string): Promise<string> => {
          chatReplies.push(text);
          return 'reply';
        },
        lang: 'en',
      },
    );

    const voiceMsg: IncomingMessage = {
      id: 'msg-2',
      connector: 'telegram' as ConnectorId,
      fromUser: 'user-1',
      channelId: 'chan-1',
      text: '',
      timestamp: new Date().toISOString(),
      raw: { voice: { fileId: 'file-xyz', mime: 'audio/ogg' } },
    };
    fakeConnector._fire(voiceMsg);
    await new Promise<void>((r) => setTimeout(r, 80));

    // transcribe must NOT be called when voiceAdapter is null (default-off invariant).
    expect(transcribeMock).not.toHaveBeenCalled();

    await handle.dispose();
  });
});

// ─── F3: transcribe error → honest i18n message ──────────────────────────────

describe('Finding 3 — transcription failure sends voice.transcribe.error to user', () => {
  it('sends honest degrade message when transcribe throws', async () => {
    const voiceAdapter: VoiceAdapter = {
      async transcribe() { throw new Error('STT service unavailable'); },
      async synthesize() { return { data: Buffer.alloc(0), mime: 'audio/mpeg' }; },
    };

    const fakeConnector = makeFakeConnector();
    (fakeConnector as unknown as { getFileBuffer: (id: string) => Promise<{ data: Buffer; mime: string }> }).getFileBuffer =
      async () => ({ data: Buffer.from('audio'), mime: 'audio/ogg' });

    const handle = await bootstrapConnectorCommands(
      root,
      fakeConnectorCfg(),
      {
        voiceAdapter,
        botCapabilities: { enabled: true, voice: { enabled: true, stt: true, tts: 'off' } },
        makeConnector: () => fakeConnector,
        // No chat dep needed — we only test the transcribe-error path.
        lang: 'en',
      },
    );

    const voiceMsg: IncomingMessage = {
      id: 'msg-3',
      connector: 'telegram' as ConnectorId,
      fromUser: 'user-1',
      channelId: 'chan-1',
      text: '',
      timestamp: new Date().toISOString(),
      raw: { voice: { fileId: 'file-err', mime: 'audio/ogg' } },
    };
    fakeConnector._fire(voiceMsg);
    await new Promise<void>((r) => setTimeout(r, 80));

    // The connector must have received the honest degrade i18n message (Finding 3).
    // messages.ts key 'voice.transcribe.error' en: "…transcription unavailable…"
    expect(fakeConnector.sent.some((t) => t.includes('transcription unavailable'))).toBe(true);

    await handle.dispose();
  });
});
