import { describe, it, expect, vi } from 'vitest';

import {
  runChatNativeLoop,
  runProviderTurn,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ProviderResponse,
  type StreamChunk,
} from '../../src/cli/commands/chat-native.js';

// ─── Helpers ────────────────────────────────────────────────────────

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function streamingProvider(
  chunks: StreamChunk[][],
): { adapter: ChatProviderAdapter; sendSpy: ReturnType<typeof vi.fn> } {
  const remaining = [...chunks];
  const sendSpy = vi.fn(async () => {
    throw new Error('send() should not be called when stream() exists');
  });
  const adapter: ChatProviderAdapter = {
    send: sendSpy,
    async *stream() {
      const next = remaining.shift();
      if (!next) throw new Error('streamingProvider: chunk queue exhausted');
      for (const c of next) yield c;
    },
  };
  return { adapter, sendSpy };
}

function nullDispatcher(): McpToolDispatcher {
  return { dispatch: vi.fn(async () => 'unused') };
}

function baseOpts(overrides: Partial<ChatNativeOptions> & {
  provider: ChatProviderAdapter;
  dispatcher: McpToolDispatcher;
  input: AsyncIterable<string>;
}): ChatNativeOptions {
  return { output: vi.fn(), ...overrides };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('runChatNativeLoop — streaming response (Path C F2-003)', () => {
  it('stream chunk flow: each text chunk writes to output incrementally', async () => {
    const { adapter } = streamingProvider([[
      { text: 'Hel' },
      { text: 'lo ' },
      { text: 'world' },
      { done: { text: 'Hello world', stopReason: 'end_turn' } },
    ]]);
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher: nullDispatcher(),
      input: lines('hi'),
      output,
    }));

    const textWrites = output.mock.calls.map((c) => c[0]);
    expect(textWrites).toContain('Hel');
    expect(textWrites).toContain('lo ');
    expect(textWrites).toContain('world');
    expect(textWrites.length).toBeGreaterThanOrEqual(3);
  });

  it('full response assembles: concatenated chunks match transcript assistant turn', async () => {
    const { adapter } = streamingProvider([[
      { text: 'part1-' },
      { text: 'part2-' },
      { text: 'part3', done: { text: 'part1-part2-part3', stopReason: 'end_turn' } },
    ]]);
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher: nullDispatcher(),
      input: lines('say it'),
      output,
    }));

    const assistantTurn = transcript.find((t) => t.role === 'assistant');
    expect(assistantTurn?.content).toBe('part1-part2-part3');
  });

  it('empty stream: only done chunk → no text output but assistant turn recorded', async () => {
    const { adapter } = streamingProvider([[
      { done: { text: '', stopReason: 'end_turn' } },
    ]]);
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher: nullDispatcher(),
      input: lines('silent'),
      output,
    }));

    expect(output).not.toHaveBeenCalled();
    const assistantTurn = transcript.find((t) => t.role === 'assistant');
    expect(assistantTurn).toBeDefined();
    expect(assistantTurn?.content).toBe('');
  });

  it('mid-stream error: stream throws → error propagates from loop', async () => {
    const adapter: ChatProviderAdapter = {
      send: vi.fn(),
      async *stream() {
        yield { text: 'good chunk ' };
        throw new Error('boom-mid-stream');
      },
    };
    const output = vi.fn();

    await expect(
      runChatNativeLoop(baseOpts({
        provider: adapter,
        dispatcher: nullDispatcher(),
        input: lines('trigger error'),
        output,
      })),
    ).rejects.toThrow('boom-mid-stream');

    expect(output).toHaveBeenCalledWith('good chunk ');
  });

  it('fallback: provider without stream() still uses send() (regression guard)', async () => {
    const fixedResponse: ProviderResponse = { text: 'classic', stopReason: 'end_turn' };
    const adapter: ChatProviderAdapter = { send: vi.fn(async () => fixedResponse) };

    const result = await runProviderTurn(adapter, [], vi.fn());

    expect(result).toEqual(fixedResponse);
    expect(adapter.send).toHaveBeenCalledTimes(1);
  });
});
