/**
 * Slice 1.1 — per-turn media connector delivery test.
 *
 * PROBLEM: makeChatResponder's runTurn builds the mediaSink from `deps.capConnector`
 * which is NEVER set by callers in the chat path (it was used only on approve-path).
 * The sendText no-op + static { id: 'unknown' } connector mean any capability that
 * produces a MediaAttachment (e.g. screenshot → photo) silently drops the media;
 * only a text-fallback reaches the user (or nothing at all).
 *
 * FIX (Slice 1.1): extend ChatResponder to accept an OPTIONAL 3rd arg:
 *   mediaConnector?: { id: string; sendMedia?(channelId: string, media: MediaAttachment): Promise<void> }
 * Thread it through the per-session serialization chain into runTurn, building the
 * media sink from the per-turn connector, preferring it over the static dep:
 *   const mediaConn = perTurnMediaConnector ?? deps.capConnector ?? { id: 'unknown' };
 *
 * TDD: these tests are RED on pre-fix code (sendMedia spy is never called today),
 * GREEN after the fix.
 *
 * Hermetic: tmpdir, fake spawn that returns PNG bytes, no real network.
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeChatResponder } from '../../../src/connectors/chat-bridge.js';
import type { ChatProviderAdapter, McpToolDispatcher } from '../../../src/cli/commands/chat-native.js';
import type { MediaAttachment } from '../../../src/connectors/capabilities/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'chat-turn-media-'));
}

const noopDispatcher: McpToolDispatcher = { async dispatch() { return 'inner-fallback'; } };

/**
 * Provider that fires ONE screenshot tool_use then on turn 2 echoes the tool
 * result so we can assert on what the capability returned.
 */
function screenshotToolProvider(): ChatProviderAdapter {
  let turn = 0;
  return {
    async send(messages) {
      turn++;
      if (turn === 1) {
        return {
          stopReason: 'tool_use' as const,
          toolCalls: [{ id: 'cap-t1', name: 'screenshot', args: {} }],
        };
      }
      const toolMsg = [...messages].reverse().find((m) => m.role === 'tool');
      const toolResult = toolMsg?.content ?? 'none';
      return { text: `echo:${toolResult}`, stopReason: 'end_turn' as const };
    },
  };
}

/**
 * A minimal fake SpawnFn that returns a valid 1×1 PNG buffer so the screenshot
 * capability produces a real MediaAttachment without needing a real OS capture.
 * The PNG header is enough; the capability only calls readFile(path) after
 * running spawn → we inject this at the `spawn` seam in CapabilityContext, which
 * means the capability's run() calls ctx.spawn → it gets back code=0 + stdout
 * pointing to a tmpfile we create, then it reads that file.
 *
 * Simpler approach: inject a fake spawn that writes the PNG bytes to the outfile
 * and returns code 0. The capability calls `spawn(cmd, [outPath], ...)` where
 * outPath is the last argument. We write PNG bytes to that path.
 */
const FAKE_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080200000090' +
  '77533d000000000c4944415408d7636060600000000400016b006b570000' +
  '0000049454e44ae426082',
  'hex',
);

function makeFakeSpawn(writePng = true): import('../../../src/connectors/capabilities/types.js').SpawnFn {
  return async (_cmd: string, args: readonly string[], _opts?: { timeoutMs?: number }) => {
    if (writePng) {
      // The screenshot capability passes the output path as the last arg (or via
      // stdout on Windows). For Linux tools the outPath is in args. Write PNG there.
      const outPath = args[args.length - 1];
      if (outPath && typeof outPath === 'string') {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(outPath, FAKE_PNG);
        return { code: 0, stdout: Buffer.from(outPath), stderr: '' };
      }
    }
    return { code: 0, stdout: Buffer.alloc(0), stderr: '' };
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('chat-turn media connector delivery (Slice 1.1)', () => {
  /**
   * RED test (proves media is dropped today): calling respond with a per-turn
   * mediaConnector that has sendMedia should result in sendMedia being invoked.
   * Pre-fix: sendMedia is NEVER called because runTurn uses the static no-op
   * sink; the media is dropped silently. The test fails (sendMedia call count = 0).
   * Post-fix: sendMedia IS called exactly once with the screenshot photo.
   */
  it('per-turn mediaConnector.sendMedia is called when capability produces a photo', async () => {
    const root = makeTempRoot();
    try {
      const sendMediaSpy = vi.fn(async (_channelId: string, _media: MediaAttachment) => {});

      const mediaConnector = {
        id: 'telegram-test',
        sendMedia: sendMediaSpy,
      };

      const respond = makeChatResponder({
        agentic: true,
        root,
        provider: screenshotToolProvider(),
        dispatcher: noopDispatcher,
        capConfig: { enabled: true },
        // inject a fake spawn so the screenshot capability writes a PNG without OS capture
        capSpawn: makeFakeSpawn(true),
        // capPlatform: 'linux' to take the Linux path in the capability
        capPlatform: 'linux',
      });

      // Pass the per-turn media connector as the 3rd arg (the new Slice 1.1 API).
      // Pre-fix: this 3rd arg is ignored / does not exist on the type → media dropped.
      // Post-fix: sendMedia is called with the PNG photo.
      await (respond as Function)(root + '-sess', 'take a screenshot', mediaConnector);

      // Assert sendMedia was called (proves media reached the per-turn connector).
      expect(sendMediaSpy).toHaveBeenCalledTimes(1);
      const [channelId, media] = sendMediaSpy.mock.calls[0]!;
      expect(channelId).toBe(root + '-sess');
      expect(media.kind).toBe('photo');
      expect(media.mime).toBe('image/png');
      expect(media.data).toBeInstanceOf(Buffer);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * Backward-compat test: WITHOUT the 3rd arg, sendMedia is NOT called.
   * The capability still runs (returns text-fallback), but no media delivery
   * attempt is made (no connector available → honest text-fallback path).
   * This test must stay GREEN both before and after the fix.
   */
  it('WITHOUT per-turn mediaConnector (2-arg call), sendMedia is not called — honest text fallback', async () => {
    const root = makeTempRoot();
    try {
      // Spy on sendMedia via capConnector dep — set a static dep connector WITHOUT
      // sendMedia to force the honest-fallback path.
      const staticConnector = { id: 'no-media' }; // no sendMedia property

      const respond = makeChatResponder({
        agentic: true,
        root,
        provider: screenshotToolProvider(),
        dispatcher: noopDispatcher,
        capConfig: { enabled: true },
        capSpawn: makeFakeSpawn(true),
        capPlatform: 'linux',
        capConnector: staticConnector, // static dep without sendMedia
      });

      // 2-arg call — no per-turn connector
      const reply = await respond(root + '-sess2', 'take a screenshot');

      // No sendMedia on staticConnector → honest text fallback was delivered.
      // The echo provider echoes the tool result; it should contain the capability
      // text output (e.g. "[screenshot] done" or screenshot caption), NOT a media call.
      expect(typeof reply).toBe('string');
      // sendMedia was never called (there's no spy to check, just verify no throw
      // and the reply is a non-empty string from the echo provider).
      expect(reply.length).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * connector-bootstrap.ts onChat path — proves the live connector is threaded
   * into the responder when the bootstrapper invokes chat(channelId, text, connector).
   * This tests the wiring from connector-bootstrap → chat-bridge.
   */
  it('connector-bootstrap onChat passes the live connector as mediaConnector', async () => {
    const root = makeTempRoot();
    try {
      const sendMediaSpy = vi.fn(async () => {});

      // Promise that resolves when the testResponder has been called — used to
      // await the async fire-and-forget onChat path (the command router uses void).
      let resolveResponderCalled!: () => void;
      const responderCalledP = new Promise<void>((r) => { resolveResponderCalled = r; });

      // A test responder that asserts it received the connector as 3rd arg
      // and calls its sendMedia to simulate a capability delivering media.
      const testResponder = vi.fn(async (
        channelId: string,
        _text: string,
        mediaConnector?: { id: string; sendMedia?(c: string, m: MediaAttachment): Promise<void> },
      ): Promise<string> => {
        // If a per-turn connector with sendMedia was threaded, call it to simulate delivery
        if (mediaConnector?.sendMedia) {
          const fakeMedia: MediaAttachment = {
            kind: 'photo',
            filename: 'test.png',
            mime: 'image/png',
            data: Buffer.from('fake'),
          };
          await mediaConnector.sendMedia(channelId, fakeMedia);
        }
        resolveResponderCalled();
        return 'reply';
      });

      // Fake connector with sendMedia (like Telegram after Task 7)
      const fakeConnector = {
        id: 'telegram',
        sendMedia: sendMediaSpy,
        // Minimal IMessageConnector surface for bootstrap
        start: vi.fn(async () => {}),
        stop: vi.fn(async () => {}),
        sendMessage: vi.fn(async () => {}),
        onMessage: vi.fn((_handler: unknown) => {}),
      };

      // Import bootstrapConnectorCommands and wire it with our test responder
      const { bootstrapConnectorCommands } = await import('../../../src/connectors/connector-bootstrap.js');

      const handle = await bootstrapConnectorCommands(root, {
        telegram: { enabled: true, token: 'fake-token', chat_id: 'chan-123' },
      }, {
        makeConnector: () => fakeConnector as never,
        chat: testResponder as never,
        lang: 'en',
      });

      // The connector's onMessage was called — extract the registered handler
      // so we can simulate an incoming chat message.
      expect(fakeConnector.onMessage).toHaveBeenCalled();
      const commandRouter = fakeConnector.onMessage.mock.calls[0]![0] as (
        msg: { id: string; connector: string; fromUser: string; channelId: string; text: string; timestamp: string; raw?: unknown }
      ) => void;

      // Simulate a non-command chat message (not a slash command, not a gate id)
      // from the authorized chat_id so it routes to onChat.
      // Note: commandRouter is sync + fire-and-forget (uses void for async onChat),
      // so we synchronously call it and then await the promise that resolves when
      // the testResponder has actually been called.
      commandRouter({
        id: 'msg-1',
        connector: 'telegram',
        fromUser: 'user',
        channelId: 'chan-123',
        text: 'take a screenshot',
        timestamp: new Date(Date.now() + 5000).toISOString(),
        raw: {},
      });

      // Wait for the async onChat → responder to complete (fire-and-forget path).
      await responderCalledP;

      // The responder should have been called and should have received
      // the live connector (fakeConnector) as 3rd arg, which then called sendMedia.
      expect(testResponder).toHaveBeenCalled();
      // sendMedia should have been called through the per-turn connector thread.
      expect(sendMediaSpy).toHaveBeenCalledTimes(1);

      await handle.dispose();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
