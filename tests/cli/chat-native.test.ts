import { describe, it, expect, vi } from 'vitest';

import {
  parseToolCallFromText,
  runChatNativeLoop,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ProviderResponse,
  type ToolCall,
} from '../../src/cli/commands/chat-native.js';

// ─── Helpers ────────────────────────────────────────────────────────

/** Build an async-iterable from a fixed list of REPL lines. */
async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

/** Provider stub that returns a queued response per call to send(). */
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

/** Dispatcher stub that records calls and returns a canned result. */
function fakeDispatcher(result: string = 'tool-ok'): {
  dispatcher: McpToolDispatcher;
  dispatchSpy: ReturnType<typeof vi.fn>;
} {
  const dispatchSpy = vi.fn(async (_name: string, _args: Record<string, unknown>) => result);
  return { dispatcher: { dispatch: dispatchSpy }, dispatchSpy };
}

function baseOpts(overrides: Partial<ChatNativeOptions> & {
  provider: ChatProviderAdapter;
  dispatcher: McpToolDispatcher;
  input: AsyncIterable<string>;
}): ChatNativeOptions {
  return {
    output: vi.fn(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('runChatNativeLoop — outer loop structure', () => {
  it('exits cleanly with empty input iterator (no provider call)', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines(),
      output,
    }));

    expect(transcript).toEqual([]);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(output).not.toHaveBeenCalled();
  });

  it('end_turn flow: provider response goes straight to output, no dispatch', async () => {
    const { adapter, sendSpy } = queuedProvider([
      { text: 'hello back', stopReason: 'end_turn' },
    ]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('hello'),
      output,
    }));

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('hello back');
    expect(transcript).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hello back' },
    ]);
  });
});

describe('runChatNativeLoop — tool-use round-trip', () => {
  it('dispatches a tool call then sends result back and ends the turn', async () => {
    const toolCall: ToolCall = { id: 't1', name: 'deckent_status', args: { root: '.' } };
    const { adapter, sendSpy } = queuedProvider([
      { toolCalls: [toolCall], stopReason: 'tool_use' },
      { text: 'status is green', stopReason: 'end_turn' },
    ]);
    const { dispatcher, dispatchSpy } = fakeDispatcher('STATUS=GREEN');
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('check status'),
      output,
    }));

    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(dispatchSpy).toHaveBeenCalledWith('deckent_status', { root: '.' });
    expect(output).toHaveBeenCalledWith('status is green');

    // Transcript should record user → assistant(tool_use) → tool → assistant(end).
    expect(transcript.map(t => t.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(transcript[2]).toMatchObject({ role: 'tool', content: 'STATUS=GREEN', toolUseId: 't1' });
    expect(transcript[1].toolCalls).toEqual([toolCall]);
  });

  it('aborts the inner tool chain when maxToolHops is hit', async () => {
    const loopCall: ToolCall = { id: 'tn', name: 'deckent_status', args: {} };
    // Provider keeps requesting tool_use; dispatcher should still only be
    // called maxToolHops times before the loop logs and breaks.
    const responses: ProviderResponse[] = Array.from({ length: 10 }, () => ({
      toolCalls: [loopCall], stopReason: 'tool_use' as const,
    }));
    const { adapter } = queuedProvider(responses);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('loop please'),
      output,
      maxToolHops: 2,
    }));

    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    expect(output).toHaveBeenCalledWith(expect.stringContaining('maxToolHops (2)'));
  });
});

describe('runChatNativeLoop — exit semantics', () => {
  it(':exit terminates the outer loop before any provider call', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher } = fakeDispatcher();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines(':exit', 'this should be ignored'),
      output: vi.fn(),
    }));

    expect(sendSpy).not.toHaveBeenCalled();
    expect(transcript).toEqual([]);
  });
});

describe('parseToolCallFromText', () => {
  it('returns a typed ToolCall when given a tagged JSON block', () => {
    const text = 'Reasoning…\n<tool_use>{"id":"abc","name":"deckent_status","args":{"root":"."}}</tool_use>';
    const parsed = parseToolCallFromText(text);
    expect(parsed).toEqual({ id: 'abc', name: 'deckent_status', args: { root: '.' } });
  });

  it('returns null for plain text or malformed JSON', () => {
    expect(parseToolCallFromText('just chatting')).toBeNull();
    expect(parseToolCallFromText('<tool_use>{ not json</tool_use>')).toBeNull();
    expect(parseToolCallFromText('<tool_use>{"name":"x"}</tool_use>')).toBeNull(); // missing id
  });
});
