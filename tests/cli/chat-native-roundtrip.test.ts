import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createSubscriptionChatAdapter,
  runChatNativeLoop,
  type ChatMessage,
  type McpToolDispatcher,
  type SubscriptionSpawnFn,
} from '../../src/cli/commands/chat-native.js';
import {
  ProviderRegistry,
  ProviderNotFoundError,
  type ProviderAdapter,
} from '../../src/core/provider.js';

// Sprint 211 Task 211-001: round-trip integration tests for chat-native loop
// + createSubscriptionChatAdapter wiring. Validates the FULL user → loop →
// subscription adapter → spawn → stdout → loop → transcript path with
// dependency-injected spawn (no real CLI execution). Companion to
// chat-native-provider.test.ts which unit-tests the adapter alone.

function mockProvider(name: string): ProviderAdapter {
  return {
    name,
    supportedModels: ['opus', 'sonnet', 'haiku'],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('mock-cmd'),
  };
}

interface SpawnCapture {
  binary?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  callCount: number;
}

/** Build a spawn fn that yields a scripted set of stdout chunks per call. */
function scriptedSpawn(scripts: string[][], capture?: SpawnCapture): SubscriptionSpawnFn {
  let invocation = 0;
  return (binary, args, env) => {
    if (capture) {
      capture.binary = binary;
      capture.args = [...args];
      capture.env = env;
      capture.callCount += 1;
    }
    const myChunks = scripts[invocation] ?? scripts[scripts.length - 1] ?? [];
    invocation += 1;
    const chunks: AsyncIterable<string> = {
      async *[Symbol.asyncIterator]() {
        for (const c of myChunks) yield c;
      },
    };
    return { chunks, wait: Promise.resolve({ exitCode: 0 }) };
  };
}

async function* singleUserTurn(line: string): AsyncIterable<string> {
  yield line;
}

describe('chat-native round-trip — adapter resolution against ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('resolves adapter from named provider and exposes ChatProviderAdapter shape', () => {
    registry.registerProvider(mockProvider('claude-tmux'), true);
    registry.registerProvider(mockProvider('codex'));

    const adapter = createSubscriptionChatAdapter({
      registry,
      providerName: 'codex',
      spawnFn: scriptedSpawn([['ok']]),
    });

    expect(adapter).toBeDefined();
    expect(typeof adapter.send).toBe('function');
    expect(typeof adapter.stream).toBe('function');
  });

  it('hata: throws ProviderNotFoundError when registry lookup misses', () => {
    registry.registerProvider(mockProvider('claude-tmux'), true);

    expect(() =>
      createSubscriptionChatAdapter({
        registry,
        providerName: 'missing-provider',
        spawnFn: scriptedSpawn([['unused']]),
      }),
    ).toThrow(ProviderNotFoundError);
  });
});

describe('chat-native round-trip — full loop end-to-end with subscription adapter', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
    registry.registerProvider(mockProvider('claude-tmux'), true);
  });

  it('runs user → adapter → stdout → transcript round-trip with no tools', async () => {
    const capture: SpawnCapture = { callCount: 0 };
    const adapter = createSubscriptionChatAdapter({
      registry,
      spawnFn: scriptedSpawn([['Hel', 'lo, ', 'human']], capture),
    });
    const noopDispatcher: McpToolDispatcher = {
      dispatch: vi.fn().mockResolvedValue(''),
    };
    const outputs: string[] = [];

    const transcript = await runChatNativeLoop({
      provider: adapter,
      dispatcher: noopDispatcher,
      input: singleUserTurn('hi there'),
      output: (line) => outputs.push(line),
      maxTurns: 5,
    });

    // Each non-empty stream chunk forwarded incrementally to output, then the
    // loop ALSO emits assistantText only when there is no stream (the adapter
    // here implements stream → loop must not duplicate the final text).
    expect(outputs).toEqual(['Hel', 'lo, ', 'human']);
    expect(transcript[0]).toEqual({ role: 'user', content: 'hi there' });
    const assistantTurn = transcript.find((m) => m.role === 'assistant');
    expect(assistantTurn?.content).toBe('Hello, human');
    expect(capture.callCount).toBe(1);
    expect(noopDispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('subscription path: spawns the claude binary with --print and stripped API keys', async () => {
    const prior = process.env['ANTHROPIC_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = 'leak-me-not';
    try {
      const capture: SpawnCapture = { callCount: 0 };
      const adapter = createSubscriptionChatAdapter({
        registry,
        spawnFn: scriptedSpawn([['ok']], capture),
      });
      const dispatcher: McpToolDispatcher = { dispatch: vi.fn() };

      await runChatNativeLoop({
        provider: adapter,
        dispatcher,
        input: singleUserTurn('ping'),
        output: () => {},
        maxTurns: 1,
      });

      expect(capture.binary).toBe('claude');
      expect(capture.args?.[0]).toBe('--print');
      // Prompt must round-trip through buildSubscriptionPrompt (last arg).
      expect(capture.args?.[capture.args.length - 1]).toContain('<user>ping</user>');
      expect(capture.env).toBeDefined();
      expect(capture.env!['ANTHROPIC_API_KEY']).toBeUndefined();
      expect(capture.env!['DECKENT_CLAUDE_API_KEY']).toBeUndefined();
    } finally {
      if (prior === undefined) delete process.env['ANTHROPIC_API_KEY'];
      else process.env['ANTHROPIC_API_KEY'] = prior;
    }
  });

  it('honors custom binary + extraArgs override (e.g. for codex CLI)', async () => {
    const capture: SpawnCapture = { callCount: 0 };
    const adapter = createSubscriptionChatAdapter({
      registry,
      binary: 'codex',
      extraArgs: ['exec', '--quiet'],
      spawnFn: scriptedSpawn([['done']], capture),
    });
    const dispatcher: McpToolDispatcher = { dispatch: vi.fn() };

    await runChatNativeLoop({
      provider: adapter,
      dispatcher,
      input: singleUserTurn('go'),
      output: () => {},
      maxTurns: 1,
    });

    expect(capture.binary).toBe('codex');
    expect(capture.args?.slice(0, 2)).toEqual(['exec', '--quiet']);
  });

  it('round-trip survives multiple sequential user turns sharing one adapter', async () => {
    const capture: SpawnCapture = { callCount: 0 };
    const adapter = createSubscriptionChatAdapter({
      registry,
      spawnFn: scriptedSpawn(
        [
          ['answer-1'],
          ['answer-2'],
        ],
        capture,
      ),
    });
    const dispatcher: McpToolDispatcher = { dispatch: vi.fn() };
    const outputs: string[] = [];

    async function* twoTurns(): AsyncIterable<string> {
      yield 'first';
      yield 'second';
    }

    const transcript = await runChatNativeLoop({
      provider: adapter,
      dispatcher,
      input: twoTurns(),
      output: (l) => outputs.push(l),
      maxTurns: 5,
    });

    expect(capture.callCount).toBe(2);
    const userTurns = transcript.filter((m) => m.role === 'user').map((m) => m.content);
    const assistantTurns = transcript
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content);
    expect(userTurns).toEqual(['first', 'second']);
    expect(assistantTurns).toEqual(['answer-1', 'answer-2']);
    expect(outputs).toEqual(['answer-1', 'answer-2']);
  });
});

describe('chat-native round-trip — registry default fallback', () => {
  it('uses registry default when no providerName is given', async () => {
    const registry = new ProviderRegistry();
    const claudeMock = mockProvider('claude-tmux');
    registry.registerProvider(claudeMock, true);
    const capture: SpawnCapture = { callCount: 0 };

    const adapter = createSubscriptionChatAdapter({
      registry,
      spawnFn: scriptedSpawn([['fallback-ok']], capture),
    });
    const dispatcher: McpToolDispatcher = { dispatch: vi.fn() };

    const transcript = await runChatNativeLoop({
      provider: adapter,
      dispatcher,
      input: singleUserTurn('hello default'),
      output: () => {},
      maxTurns: 1,
    });

    const assistantTurn = transcript.find((m) => m.role === 'assistant') as ChatMessage | undefined;
    expect(assistantTurn?.content).toBe('fallback-ok');
    expect(capture.callCount).toBe(1);
  });
});
