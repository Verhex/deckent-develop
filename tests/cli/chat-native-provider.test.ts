import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  buildSubscriptionPrompt,
  createSubscriptionChatAdapter,
  defaultSubscriptionSpawn,
  type ChatMessage,
  type SubscriptionSpawnFn,
} from '../../src/cli/commands/chat-native.js';
import {
  ProviderRegistry,
  ProviderNotFoundError,
  type ProviderAdapter,
} from '../../src/core/provider.js';

// ─── Mock helpers ────────────────────────────────────────────────────

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

/** Build a spawn fn that emits a fixed set of stdout chunks then closes. */
function fakeSpawn(stdoutChunks: string[], capture?: {
  binary?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
}): SubscriptionSpawnFn {
  return (binary, args, env) => {
    if (capture) {
      capture.binary = binary;
      capture.args = [...args];
      capture.env = env;
    }
    const chunks: AsyncIterable<string> = {
      async *[Symbol.asyncIterator]() {
        for (const c of stdoutChunks) yield c;
      },
    };
    const wait = Promise.resolve({ exitCode: 0 });
    return { chunks, wait };
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('createSubscriptionChatAdapter — provider resolution', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('resolves the named provider from the registry', () => {
    const claude = mockProvider('claude-tmux');
    const codex = mockProvider('codex');
    registry.registerProvider(claude);
    registry.registerProvider(codex);

    const adapter = createSubscriptionChatAdapter({
      registry,
      providerName: 'codex',
      spawnFn: fakeSpawn(['ok']),
    });

    expect(adapter).toBeDefined();
    expect(typeof adapter.send).toBe('function');
    expect(typeof adapter.stream).toBe('function');
  });

  it('falls back to the registry default when no name is given', () => {
    const claude = mockProvider('claude-tmux');
    registry.registerProvider(claude, /* setDefault */ true);

    const adapter = createSubscriptionChatAdapter({
      registry,
      spawnFn: fakeSpawn(['ok']),
    });

    expect(adapter).toBeDefined();
    expect(typeof adapter.send).toBe('function');
  });

  it('throws ProviderNotFoundError when the named provider is missing', () => {
    registry.registerProvider(mockProvider('claude-tmux'));

    expect(() =>
      createSubscriptionChatAdapter({
        registry,
        providerName: 'nope',
        spawnFn: fakeSpawn(['ok']),
      }),
    ).toThrow(ProviderNotFoundError);
  });
});

describe('createSubscriptionChatAdapter — subscription CLI path', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
    registry.registerProvider(mockProvider('claude-tmux'), true);
  });

  it('subscription env strips ANTHROPIC_API_KEY before spawning the CLI', async () => {
    const prior = process.env['ANTHROPIC_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = 'should-be-removed';
    try {
      const capture: { binary?: string; args?: string[]; env?: NodeJS.ProcessEnv } = {};
      const adapter = createSubscriptionChatAdapter({
        registry,
        spawnFn: fakeSpawn(['hello'], capture),
      });

      await adapter.send([{ role: 'user', content: 'hi' }]);

      expect(capture.binary).toBe('claude');
      expect(capture.args?.[0]).toBe('--print');
      expect(capture.env).toBeDefined();
      expect(capture.env!['ANTHROPIC_API_KEY']).toBeUndefined();
      expect(capture.env!['DECKENT_CLAUDE_API_KEY']).toBeUndefined();
    } finally {
      if (prior === undefined) delete process.env['ANTHROPIC_API_KEY'];
      else process.env['ANTHROPIC_API_KEY'] = prior;
    }
  });

  it('honors a custom binary + extraArgs override', async () => {
    const capture: { binary?: string; args?: string[] } = {};
    const adapter = createSubscriptionChatAdapter({
      registry,
      binary: 'codex',
      extraArgs: ['--quiet', '-p'],
      spawnFn: fakeSpawn(['x'], capture),
    });

    await adapter.send([{ role: 'user', content: 'go' }]);

    expect(capture.binary).toBe('codex');
    expect(capture.args?.slice(0, 2)).toEqual(['--quiet', '-p']);
  });
});

describe('createSubscriptionChatAdapter — send / stream round-trip', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
    registry.registerProvider(mockProvider('claude-tmux'), true);
  });

  it('send() concatenates stdout chunks into the response text', async () => {
    const adapter = createSubscriptionChatAdapter({
      registry,
      spawnFn: fakeSpawn(['Hel', 'lo, ', 'world']),
    });

    const response = await adapter.send([{ role: 'user', content: 'greet me' }]);

    expect(response.text).toBe('Hello, world');
    expect(response.stopReason).toBe('end_turn');
  });

  it('stream() yields each non-empty chunk then a terminal done marker', async () => {
    const adapter = createSubscriptionChatAdapter({
      registry,
      spawnFn: fakeSpawn(['one ', '', 'two ', 'three']),
    });

    const out: Array<{ text?: string; done?: { text: string; stopReason: string } }> = [];
    for await (const chunk of adapter.stream!([{ role: 'user', content: 'say it' }])) {
      out.push(chunk);
    }

    const texts = out.map((c) => c.text).filter((t): t is string => typeof t === 'string');
    expect(texts).toEqual(['one ', 'two ', 'three']);

    const last = out[out.length - 1];
    expect(last?.done).toBeDefined();
    expect(last?.done?.text).toBe('one two three');
    expect(last?.done?.stopReason).toBe('end_turn');
  });
});

describe('buildSubscriptionPrompt', () => {
  it('tags each message by role; tool turns use tool-result', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'tool', content: 'STATUS=GREEN', toolUseId: 't1' },
    ];
    const prompt = buildSubscriptionPrompt(msgs);
    expect(prompt).toContain('<user>hi</user>');
    expect(prompt).toContain('<assistant>hello</assistant>');
    expect(prompt).toContain('<tool-result>STATUS=GREEN</tool-result>');
  });
});

describe('defaultSubscriptionSpawn — smoke', () => {
  it('exposes a chunks AsyncIterable and a wait promise', () => {
    // Use a binary that exits immediately (`true` on POSIX). We don't assert
    // on stdout; this is a structural smoke test that defaultSubscriptionSpawn
    // returns the expected shape without throwing.
    const result = defaultSubscriptionSpawn('true', [], { ...process.env });
    expect(result.chunks).toBeDefined();
    expect(typeof result.chunks[Symbol.asyncIterator]).toBe('function');
    expect(result.wait).toBeInstanceOf(Promise);
  });
});
