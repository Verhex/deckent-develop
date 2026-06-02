import { describe, it, expect, vi } from 'vitest';

import {
  runChatNativeLoop,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ProviderResponse,
} from '../../src/cli/commands/chat-native.js';
import type { AgenticAction } from '../../src/cli/commands/agentic-confirm.js';

// Sprint 221 T-221-002 — runChatNativeLoop agentic-dispatch wire tests.
//
// These tests verify that when `agenticDispatch: true` is passed, the loop
// classifies each line via classifyAgenticIntent and, on match, dispatches
// the corresponding deckent_* MCP tool through the supplied dispatcher
// INSTEAD of forwarding the line to the provider. The risky-confirm gate
// is injected so we can drive both approve/decline paths deterministically.
// Caller: src/cli/commands/chat-native.ts (def chat-agentic-dispatch.ts +
// agentic-confirm.ts excluded from kanıt grep).

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
    agenticDispatch: true,
    // Default confirm = auto-approve so tests focused on dispatch path
    // are not blocked on stdin. The risky-gate test overrides this.
    agenticConfirm: async () => true,
    ...overrides,
  };
}

describe('runChatNativeLoop — agentic dispatch wire (T-221-002)', () => {
  it('status intent → dispatcher.dispatch called, provider NOT called', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher('STATUS=GREEN sprint=221');
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('sprint durumu ne'),
      output,
    }));

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith('deckent_status', { root: '.' });
    expect(sendSpy).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('STATUS=GREEN sprint=221');
    // Transcript records user + assistant so multi-turn context survives.
    expect(transcript).toEqual([
      { role: 'user', content: 'sprint durumu ne' },
      { role: 'assistant', content: 'STATUS=GREEN sprint=221' },
    ]);
  });

  it('plain chat ("hello") → dispatcher NOT called, provider called', async () => {
    const { adapter, sendSpy } = queuedProvider([
      { text: 'hi back', stopReason: 'end_turn' },
    ]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('hello there friend'),
      output,
    }));

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(transcript).toEqual([
      { role: 'user', content: 'hello there friend' },
      { role: 'assistant', content: 'hi back' },
    ]);
  });

  it('recall intent → dispatcher.dispatch deckent_memory_query with extracted query', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher('{"found":3}');
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('hafızada docker ara'),
      output,
    }));

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const [tool, args] = dispatchSpy.mock.calls[0]!;
    expect(tool).toBe('deckent_memory_query');
    expect((args as Record<string, unknown>).query).toContain('docker');
    expect(sendSpy).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('{"found":3}');
  });

  it('risky intent ("sprint planla") + declined confirm → dispatcher NOT called, cancel echoed', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();
    const confirmSpy = vi.fn(async () => false);

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('sprint planla'),
      output,
      agenticConfirm: confirmSpy,
    }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const action = confirmSpy.mock.calls[0]![0] as AgenticAction;
    expect(action.name).toBe('deckent_plan');
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('[agentic] cancelled: deckent_plan');
    expect(transcript).toEqual([]);
  });

  it('risky intent ("sprint planla") + approved confirm → dispatcher called', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher('plan-ok');
    const output = vi.fn();
    const confirmSpy = vi.fn(async () => true);

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('sprint planla'),
      output,
      agenticConfirm: confirmSpy,
    }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith('deckent_plan', { mode: 'auto' });
    expect(sendSpy).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('plan-ok');
  });

  it('agenticDispatch: false (default) → backward-compatible, agentic intents fall through to provider', async () => {
    // Explicit guard against accidentally changing the default. Pre-existing
    // chat-native-* tests rely on default-false to keep inputs like
    // "check status" / "how are we doing?" hitting the provider.
    const { adapter, sendSpy } = queuedProvider([
      { text: 'provider replied', stopReason: 'end_turn' },
    ]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();

    await runChatNativeLoop({
      provider: adapter,
      dispatcher,
      input: lines('sprint durumu ne'),
      output,
      // agenticDispatch intentionally omitted — relies on default
    });

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(output).toHaveBeenCalledWith('provider replied');
  });
});
