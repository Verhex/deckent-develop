import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runChatNativeLoop,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ProviderResponse,
} from '../../src/cli/commands/chat-native.js';

// Sprint 222 T-222-005 — runChatNativeLoop slash-registry wire tests.
//
// Verifies that the slash-registry (buildSlashRegistry + resolveSlash +
// renderHelp from chat-slash-registry.ts) is called from inside the loop so
// /help renders the catalog INSTANTLY (no provider round-trip — was 15.9s)
// and /status, /recall, /sprint dispatch through the MCP dispatcher.
// Caller: src/cli/commands/chat-native.ts (def chat-slash-registry.ts
// excluded from kanıt grep).

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function queuedProvider(responses: ProviderResponse[]): {
  adapter: ChatProviderAdapter;
  sendSpy: ReturnType<typeof vi.fn>;
} {
  const remaining = [...responses];
  const sendSpy = vi.fn(async () => {
    const next = remaining.shift();
    if (!next) throw new Error('queuedProvider: response queue exhausted');
    return next;
  });
  return { adapter: { send: sendSpy }, sendSpy };
}

function fakeDispatcher(canned: string = 'tool-ok'): {
  dispatcher: McpToolDispatcher;
  dispatchSpy: ReturnType<typeof vi.fn>;
} {
  const dispatchSpy = vi.fn(async () => canned);
  return { dispatcher: { dispatch: dispatchSpy }, dispatchSpy };
}

function baseOpts(overrides: Partial<ChatNativeOptions> & {
  provider: ChatProviderAdapter;
  dispatcher: McpToolDispatcher;
  input: AsyncIterable<string>;
}): ChatNativeOptions {
  return {
    output: vi.fn(),
    // Auto-approve risky-confirm so /plan and similar dispatch without stdin.
    agenticConfirm: async () => true,
    ...overrides,
  };
}

describe('runChatNativeLoop — slash-registry wire (T-222-005)', () => {
  it('/help renders the registry list and does NOT call the provider', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/help'),
      output,
    }));

    // Provider untouched; the 15.9s claude round-trip is gone.
    expect(sendSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    // Help line was emitted — must include the header and at least one slash.
    expect(output).toHaveBeenCalledTimes(1);
    const helpText = output.mock.calls[0]![0] as string;
    expect(helpText).toContain('Komutlar:');
    expect(helpText).toContain('/help');
    expect(helpText).toContain('/status');
    // /help is a meta command — no transcript turns recorded.
    expect(transcript).toEqual([]);
  });

  it('/runs (SURF-3 inbox) renders the read-only list and does NOT call the provider', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();
    const root = mkdtempSync(join(tmpdir(), 'inbox-loop-'));

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/runs'),
      output,
      projectRoot: root,
    }));

    // Provider + dispatcher untouched — the inbox is a pure read-only scan.
    expect(sendSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    // Empty project → the honest empty notice (default en).
    expect(output).toHaveBeenCalledTimes(1);
    expect(output.mock.calls[0]![0]).toContain('No runs yet');
    expect(transcript).toEqual([{ role: 'user', content: '/runs' }]);
    rmSync(root, { recursive: true, force: true });
  });

  it('/status dispatches deckent_status through the MCP dispatcher (NOT provider)', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher('STATUS=GREEN sprint=222');
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/status'),
      output,
    }));

    expect(sendSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith('deckent_status', { root: '.' });
    expect(output).toHaveBeenCalledWith('STATUS=GREEN sprint=222');
    expect(transcript).toEqual([
      { role: 'user', content: '/status' },
      { role: 'assistant', content: 'STATUS=GREEN sprint=222' },
    ]);
  });

  it('unknown slash /foobar falls through to the provider (not swallowed)', async () => {
    const { adapter, sendSpy } = queuedProvider([
      { text: 'I do not know /foobar', stopReason: 'end_turn' },
    ]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/foobar'),
      output,
    }));

    // Unknown slash → resolveSlash returns 'none' → normal provider path.
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(transcript).toEqual([
      { role: 'user', content: '/foobar' },
      { role: 'assistant', content: 'I do not know /foobar' },
    ]);
  });

  it('/clear still empties the transcript (handleReplCommand path preserved)', async () => {
    // After the wire, /clear MUST still work — handleReplCommand catches it
    // BEFORE resolveSlash gets a chance, so this is a regression guard.
    const { adapter, sendSpy } = queuedProvider([
      { text: 'one', stopReason: 'end_turn' },
      { text: 'two', stopReason: 'end_turn' },
    ]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('first', '/clear', 'second'),
      output,
    }));

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(transcript).toEqual([
      { role: 'user', content: 'second' },
      { role: 'assistant', content: 'two' },
    ]);
  });

  it('/recall <query> extracts trailing words as the deckent_memory_query arg', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher('{"found":2}');
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/recall docker heartbeat'),
      output,
    }));

    expect(sendSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const [tool, args] = dispatchSpy.mock.calls[0]!;
    expect(tool).toBe('deckent_memory_query');
    expect(args).toEqual({ query: 'docker heartbeat' });
    expect(output).toHaveBeenCalledWith('{"found":2}');
  });
});
