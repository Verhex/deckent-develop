import { describe, it, expect, vi } from 'vitest';

import {
  runChatNativeLoop,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ProviderResponse,
} from '../../src/cli/commands/chat-native.js';

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
