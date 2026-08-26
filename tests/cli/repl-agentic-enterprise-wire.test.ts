import { describe, it, expect, vi } from 'vitest';

import {
  runChatNativeLoop,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ProviderResponse,
} from '../../src/cli/commands/chat-native.js';
import type { AgenticAction } from "../../src/cli/commands/agentic-confirm.js";

// Sprint 222 T-222-007 — runChatNativeLoop agentic-dispatch + enterprise-bridge
// runtime-wire tests.
//
// Verifies the unified intercept chain inside runChatNativeLoop:
//   1. /cost /audit /rbac /flow → dispatchEnterpriseSlash (subprocess bridge)
//   2. /status /recall /plan /sprint → resolveSlash → MCP dispatcher
//   3. natural-language ("durum ne") with agenticDispatch=true →
//      classifyAgenticIntent → dispatchAgenticIntent → MCP dispatcher
//   4. plain chat → provider.send
//
// Caller: src/cli/commands/chat-native.ts (def files chat-enterprise-bridge.ts,
// chat-agentic-dispatch.ts, chat-slash-registry.ts excluded from kanıt grep).

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
    agenticConfirm: async () => true,
    ...overrides,
  };
}

describe('runChatNativeLoop — agentic + enterprise wire (T-222-007)', () => {
  it('/cost → dispatchEnterpriseSlash invoked (provider NOT called)', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();
    const enterpriseSpawn = vi.fn(async () => 'cost: claude/sonnet $3.00/MTok');

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/cost'),
      output,
      enterpriseSpawn,
    }));

    // Enterprise bridge fired; provider + MCP dispatcher stayed idle.
    expect(enterpriseSpawn).toHaveBeenCalledTimes(1);
    expect(enterpriseSpawn).toHaveBeenCalledWith(['cost', 'show']);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('cost: claude/sonnet $3.00/MTok');
    expect(transcript).toEqual([
      { role: 'user', content: '/cost' },
      { role: 'assistant', content: 'cost: claude/sonnet $3.00/MTok' },
    ]);
  });

  it('/cost --json → enterprise spawnFn gets the extra args appended', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();
    const enterpriseSpawn = vi.fn(async () => '{"model":"sonnet"}');

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/cost --json'),
      output,
      enterpriseSpawn,
    }));

    expect(enterpriseSpawn).toHaveBeenCalledTimes(1);
    expect(enterpriseSpawn).toHaveBeenCalledWith(['cost', 'show', '--json']);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('{"model":"sonnet"}');
  });

  it('/audit → enterprise dispatched (audit subcommand)', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();
    const enterpriseSpawn = vi.fn(async () => 'audit: PASS');

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/audit'),
      output,
      enterpriseSpawn,
    }));

    expect(enterpriseSpawn).toHaveBeenCalledTimes(1);
    expect(enterpriseSpawn).toHaveBeenCalledWith(['audit']);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('audit: PASS');
  });

  it('"durum ne" (agenticDispatch: true) → classifyAgenticIntent + dispatchAgenticIntent fire', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher('STATUS=GREEN sprint=222');
    const output = vi.fn();
    const enterpriseSpawn = vi.fn(async () => 'should-not-fire');

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('durum ne'),
      output,
      agenticDispatch: true,
      enterpriseSpawn,
    }));

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith('deckent_status', { root: '.' });
    expect(sendSpy).not.toHaveBeenCalled();
    expect(enterpriseSpawn).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('STATUS=GREEN sprint=222');
    expect(transcript).toEqual([
      { role: 'user', content: 'durum ne' },
      { role: 'assistant', content: 'STATUS=GREEN sprint=222' },
    ]);
  });

  it('plain chat "merhaba" → provider called, neither enterprise nor agentic dispatch fires', async () => {
    const { adapter, sendSpy } = queuedProvider([
      { text: 'hi back', stopReason: 'end_turn' },
    ]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();
    const enterpriseSpawn = vi.fn(async () => 'should-not-fire');

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('merhaba'),
      output,
      agenticDispatch: true,
      enterpriseSpawn,
    }));

    expect(enterpriseSpawn).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('/recall docker (registry agentic) → deckent_memory_query dispatched, enterprise NOT called', async () => {
    // Regression guard: the registry path (resolveSlash → agentic action) must
    // still work AFTER the enterprise wire was inserted before it.
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher('{"found":2}');
    const output = vi.fn();
    const enterpriseSpawn = vi.fn(async () => 'should-not-fire');

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/recall docker'),
      output,
      enterpriseSpawn,
    }));

    expect(enterpriseSpawn).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const [tool, args] = dispatchSpy.mock.calls[0]!;
    expect(tool).toBe('deckent_memory_query');
    expect(args).toEqual({ query: 'docker' });
  });

  it('/foobar (unknown slash) → falls through to provider, enterprise NOT called', async () => {
    // Unknown slash: not enterprise, not in registry → resolveSlash returns
    // 'none' → provider called. Confirms enterprise dispatch does not swallow
    // arbitrary unknown slashes.
    const { adapter, sendSpy } = queuedProvider([
      { text: 'I do not know /foobar', stopReason: 'end_turn' },
    ]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();
    const enterpriseSpawn = vi.fn(async () => 'should-not-fire');

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/foobar'),
      output,
      enterpriseSpawn,
    }));

    expect(enterpriseSpawn).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});

// WIRE-013: physically merged from tests/cli/repl-agentic-wire.test.ts.
{
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
    for (const item of items)
        yield item;
}

function queuedProvider(responses: ProviderResponse[]): {
    adapter: ChatProviderAdapter;
    sendSpy: ReturnType<typeof vi.fn>;
} {
    const remaining = [...responses];
    const sendSpy = vi.fn(async () => {
        const next = remaining.shift();
        if (!next)
            throw new Error('queuedProvider: response queue exhausted');
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
}
