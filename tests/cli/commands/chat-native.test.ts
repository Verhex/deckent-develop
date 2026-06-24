import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createSwitchableProvider,
  runChatNativeLoop,
  type SwitchableProviderHandle,
  type SwitchableProviderOptions,
  type SubscriptionSpawnFn,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type StreamChunk,
} from '../../../src/cli/commands/chat-native.js';
import {
  ProviderRegistry,
  ProviderNotFoundError,
  type ProviderAdapter,
} from '../../../src/core/provider.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function mockProvider(name: string): ProviderAdapter {
  return {
    name,
    supportedModels: ['opus', 'sonnet', 'haiku'] as string[],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('mock-cmd'),
  } as unknown as ProviderAdapter;
}

/** Build a spawn fn that yields a fixed stdout string per call. */
function makeSpawnFn(getResponse: () => string): SubscriptionSpawnFn {
  return () => {
    const text = getResponse();
    const chunks: AsyncIterable<string> = {
      async *[Symbol.asyncIterator]() { yield text; },
    };
    return { chunks, wait: Promise.resolve({ exitCode: 0 }) };
  };
}

function fakeDispatcher(): McpToolDispatcher {
  return { dispatch: async () => 'tool-ok' };
}

// ─── createSwitchableProvider — proxy behavior ───────────────────────

describe('createSwitchableProvider — proxy delegates to current adapter', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
    registry.registerProvider(mockProvider('claude-tmux'), /* setDefault */ true);
    registry.registerProvider(mockProvider('codex'));
  });

  it('send() on proxy uses the initial adapter', async () => {
    const spawnFn = makeSpawnFn(() => 'from-initial');
    const { provider } = createSwitchableProvider({
      initialProviderName: 'claude-tmux',
      registry,
      spawnFn,
    });

    const resp = await provider.send([{ role: 'user', content: 'hi' }]);
    expect(resp.text).toBe('from-initial');
    expect(resp.stopReason).toBe('end_turn');
  });

  it('stream() is always defined on the proxy', async () => {
    const spawnFn = makeSpawnFn(() => 'streamed');
    const { provider } = createSwitchableProvider({ registry, spawnFn });

    expect(typeof provider.stream).toBe('function');

    const chunks: StreamChunk[] = [];
    for await (const c of provider.stream!([{ role: 'user', content: 'hi' }])) {
      chunks.push(c);
    }
    expect(chunks.some((c) => c.text === 'streamed')).toBe(true);
  });

  it('send() delegates to new adapter after switchProvider()', async () => {
    let callNum = 0;
    const spawnFn = makeSpawnFn(() => {
      callNum++;
      return callNum === 1 ? 'from-claude' : 'from-codex';
    });

    const { provider, switchProvider } = createSwitchableProvider({
      initialProviderName: 'claude-tmux',
      registry,
      spawnFn,
    });

    const r1 = await provider.send([{ role: 'user', content: 'first' }]);
    expect(r1.text).toBe('from-claude');

    switchProvider('codex');

    const r2 = await provider.send([{ role: 'user', content: 'second' }]);
    expect(r2.text).toBe('from-codex');
  });

  it('stream() delegates to new adapter after switchProvider()', async () => {
    let callNum = 0;
    const spawnFn = makeSpawnFn(() => {
      callNum++;
      return callNum === 1 ? 'stream-1' : 'stream-2';
    });

    const { provider, switchProvider } = createSwitchableProvider({
      initialProviderName: 'claude-tmux',
      registry,
      spawnFn,
    });

    const collectStream = async (adapter: ChatProviderAdapter): Promise<string> => {
      let text = '';
      for await (const c of adapter.stream!([{ role: 'user', content: 'x' }])) {
        if (c.text) text += c.text;
      }
      return text;
    };

    const t1 = await collectStream(provider);
    expect(t1).toBe('stream-1');

    switchProvider('codex');

    const t2 = await collectStream(provider);
    expect(t2).toBe('stream-2');
  });
});

// ─── createSwitchableProvider — error cases ──────────────────────────

describe('createSwitchableProvider — error handling', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
    registry.registerProvider(mockProvider('claude-tmux'), true);
  });

  it('throws ProviderNotFoundError for unknown initialProviderName', () => {
    expect(() =>
      createSwitchableProvider({ initialProviderName: 'nope', registry }),
    ).toThrow(ProviderNotFoundError);
  });

  it('switchProvider() throws ProviderNotFoundError for unknown name', () => {
    const spawnFn = makeSpawnFn(() => 'ok');
    const { switchProvider } = createSwitchableProvider({ registry, spawnFn });

    expect(() => switchProvider('nope')).toThrow(ProviderNotFoundError);
  });

  it('uses registry default when initialProviderName is omitted', () => {
    const spawnFn = makeSpawnFn(() => 'default');
    expect(() => createSwitchableProvider({ registry, spawnFn })).not.toThrow();
  });
});

// ─── runChatNativeLoop + wired switchProvider ────────────────────────

describe('runChatNativeLoop — /provider switch rebuilds adapter', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
    registry.registerProvider(mockProvider('claude-tmux'), true);
    registry.registerProvider(mockProvider('codex'));
  });

  it('subsequent turns use new provider after /provider <name>', async () => {
    let callNum = 0;
    const spawnFn = makeSpawnFn(() => {
      callNum++;
      return callNum === 1 ? 'reply-from-claude' : 'reply-from-codex';
    });

    const { provider, switchProvider } = createSwitchableProvider({
      initialProviderName: 'claude-tmux',
      registry,
      spawnFn,
    });

    const outputs: string[] = [];
    await runChatNativeLoop({
      provider,
      switchProvider,
      dispatcher: fakeDispatcher(),
      input: lines('turn1', '/provider codex', 'turn2'),
      output: (t) => outputs.push(t),
    });

    // turn1 → claude, turn2 → codex (after the switch)
    expect(outputs).toContain('reply-from-claude');
    expect(outputs).toContain('reply-from-codex');
  });

  it('emits the tui.switched message after /provider <name>', async () => {
    const spawnFn = makeSpawnFn(() => 'ok');
    const { provider, switchProvider } = createSwitchableProvider({ registry, spawnFn });

    const outputs: string[] = [];
    await runChatNativeLoop({
      provider,
      switchProvider,
      dispatcher: fakeDispatcher(),
      input: lines('/provider codex'),
      output: (t) => outputs.push(t),
    });

    // Default lang='en': message is "switched to: codex"
    expect(outputs.some((o) => o.includes('codex'))).toBe(true);
  });

  it('emits switch usage hint when /provider is called with no argument', async () => {
    const spawnFn = makeSpawnFn(() => 'ok');
    const { provider, switchProvider } = createSwitchableProvider({ registry, spawnFn });

    const outputs: string[] = [];
    await runChatNativeLoop({
      provider,
      switchProvider,
      dispatcher: fakeDispatcher(),
      input: lines('/provider'),
      output: (t) => outputs.push(t),
    });

    // tui.switch_usage = "usage: /model <id> · /provider <name>. current:"
    expect(outputs.some((o) => o.includes('/provider'))).toBe(true);
  });

  it('emits error message via getMessage when switchProvider throws', async () => {
    const dummyProvider: ChatProviderAdapter = {
      send: async () => ({ text: 'irrelevant', stopReason: 'end_turn' }),
    };

    const outputs: string[] = [];
    await runChatNativeLoop({
      provider: dummyProvider,
      dispatcher: fakeDispatcher(),
      switchProvider: () => { throw new Error('provider-xyz not found'); },
      input: lines('/provider provider-xyz'),
      output: (t) => outputs.push(t),
    });

    // Error surfaced via chat.provider_error key (en: '[chat-native] error: {message}')
    expect(outputs.some((o) => o.includes('provider-xyz not found'))).toBe(true);
  });

  it('loop continues after a failed /provider switch (no crash)', async () => {
    const spawnFn = makeSpawnFn(() => 'still-using-claude');
    const { provider } = createSwitchableProvider({ registry, spawnFn });

    const outputs: string[] = [];
    await runChatNativeLoop({
      provider,
      dispatcher: fakeDispatcher(),
      // switchProvider always throws — loop must survive
      switchProvider: () => { throw new Error('bad provider'); },
      input: lines('/provider bad', 'hi'),
      output: (t) => outputs.push(t),
    });

    // Error message emitted, then 'hi' turn still processed
    expect(outputs.some((o) => o.includes('bad provider'))).toBe(true);
    expect(outputs).toContain('still-using-claude');
  });
});
