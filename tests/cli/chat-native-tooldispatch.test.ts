import { describe, it, expect, vi } from 'vitest';

import {
  createMcpToolDispatcher,
  runChatNativeLoop,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type McpToolEntry,
  type McpToolRegistry,
  type ProviderResponse,
  type ToolCall,
} from '../../src/cli/commands/chat-native.js';

// ─── Helpers ────────────────────────────────────────────────────────

/** Build a duck-typed McpToolRegistry from a plain {name: invoke} map. */
function mkRegistry(
  entries: Record<string, (args: Record<string, unknown>) => Promise<string | object> | string | object>,
): McpToolRegistry {
  const map = new Map<string, McpToolEntry>();
  for (const [name, invoke] of Object.entries(entries)) {
    map.set(name, { name, invoke });
  }
  return {
    get: (name) => map.get(name),
    list: () => [...map.keys()],
  };
}

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

function baseOpts(overrides: Partial<ChatNativeOptions> & Pick<ChatNativeOptions, 'provider' | 'dispatcher' | 'input'>): ChatNativeOptions {
  return { output: vi.fn(), ...overrides };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('createMcpToolDispatcher — direct unit', () => {
  it('dispatches a known tool through the registry and returns its string result', async () => {
    const invoke = vi.fn(async (args: Record<string, unknown>) => `status:${JSON.stringify(args)}`);
    const registry = mkRegistry({ deckent_status: invoke });
    const dispatcher = createMcpToolDispatcher({ registry });

    const out = await dispatcher.dispatch('deckent_status', { root: '.' });

    expect(invoke).toHaveBeenCalledWith({ root: '.' });
    expect(out).toBe('status:{"root":"."}');
  });

  it('returns [mcp-error] for unknown tool names instead of throwing', async () => {
    const registry = mkRegistry({ deckent_status: () => 'ok' });
    const dispatcher = createMcpToolDispatcher({ registry });

    await expect(dispatcher.dispatch('deckent_unknown', {})).resolves.toBe(
      '[mcp-error] unknown tool: deckent_unknown',
    );
  });

  it('serializes non-string registry output via JSON.stringify', async () => {
    const registry = mkRegistry({
      deckent_memory_query: async () => ({ results: [{ id: 'adr-001', title: 'TS+ESM' }], count: 1 }),
    });
    const dispatcher = createMcpToolDispatcher({ registry });

    const out = await dispatcher.dispatch('deckent_memory_query', { query: 'esm' });

    expect(out).toBe(JSON.stringify({ results: [{ id: 'adr-001', title: 'TS+ESM' }], count: 1 }));
  });

  it('captures invoke errors as tagged error strings (no throw)', async () => {
    const registry = mkRegistry({
      deckent_status: async () => {
        throw new Error('db is locked');
      },
    });
    const dispatcher = createMcpToolDispatcher({ registry });

    await expect(dispatcher.dispatch('deckent_status', {})).resolves.toBe(
      '[mcp-error] deckent_status: db is locked',
    );
  });

  it('enforces allowList — disallowed tool returns [mcp-error] without invoking', async () => {
    const invoke = vi.fn(async () => 'should-not-run');
    const registry = mkRegistry({ deckent_kill: invoke });
    const dispatcher = createMcpToolDispatcher({
      registry,
      allowList: ['deckent_status', 'deckent_memory_query'],
    });

    const out = await dispatcher.dispatch('deckent_kill', { target: 'all' });

    expect(out).toBe('[mcp-error] tool not allowed: deckent_kill');
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('createMcpToolDispatcher — chat loop integration', () => {
  it('feeds a real registry-backed tool result back into the chat loop transcript', async () => {
    const toolCall: ToolCall = { id: 't1', name: 'deckent_status', args: { root: '.' } };
    const { adapter, sendSpy } = queuedProvider([
      { toolCalls: [toolCall], stopReason: 'tool_use' },
      { text: 'status looks good', stopReason: 'end_turn' },
    ]);

    const invoke = vi.fn(async () => 'STATUS=GREEN sprint=211');
    const registry = mkRegistry({ deckent_status: invoke });
    const dispatcher = createMcpToolDispatcher({ registry });

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('how are we doing?'),
    }));

    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledWith({ root: '.' });

    expect(transcript.map((t) => t.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(transcript[2]).toMatchObject({
      role: 'tool',
      content: 'STATUS=GREEN sprint=211',
      toolUseId: 't1',
    });
    expect(transcript[3]).toMatchObject({ role: 'assistant', content: 'status looks good' });
  });

  it('handles multiple tool calls in one turn sequentially', async () => {
    const callA: ToolCall = { id: 'a', name: 'deckent_status', args: {} };
    const callB: ToolCall = { id: 'b', name: 'deckent_memory_query', args: { query: 'rbac' } };
    const { adapter } = queuedProvider([
      { toolCalls: [callA, callB], stopReason: 'tool_use' },
      { text: 'combined ok', stopReason: 'end_turn' },
    ]);

    const statusInvoke = vi.fn(async () => 'STATUS=GREEN');
    const memInvoke = vi.fn(async () => '[adr-037] rbac matrix');
    const registry = mkRegistry({
      deckent_status: statusInvoke,
      deckent_memory_query: memInvoke,
    });
    const dispatcher = createMcpToolDispatcher({ registry });

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('do both please'),
    }));

    expect(statusInvoke).toHaveBeenCalledTimes(1);
    expect(memInvoke).toHaveBeenCalledWith({ query: 'rbac' });

    // user → assistant(tool_use w/ 2 calls) → tool(a) → tool(b) → assistant(end)
    expect(transcript.map((t) => t.role)).toEqual(['user', 'assistant', 'tool', 'tool', 'assistant']);
    expect(transcript[2]).toMatchObject({ role: 'tool', content: 'STATUS=GREEN', toolUseId: 'a' });
    expect(transcript[3]).toMatchObject({ role: 'tool', content: '[adr-037] rbac matrix', toolUseId: 'b' });
  });

  it('round-trips an unknown tool name without breaking the loop', async () => {
    const bogus: ToolCall = { id: 'x', name: 'deckent_does_not_exist', args: {} };
    const { adapter } = queuedProvider([
      { toolCalls: [bogus], stopReason: 'tool_use' },
      { text: 'recovered', stopReason: 'end_turn' },
    ]);

    const registry = mkRegistry({ deckent_status: async () => 'ok' });
    const dispatcher = createMcpToolDispatcher({ registry });

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('try unknown'),
    }));

    expect(transcript.map((t) => t.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(transcript[2]).toMatchObject({
      role: 'tool',
      content: '[mcp-error] unknown tool: deckent_does_not_exist',
      toolUseId: 'x',
    });
    expect(transcript[3]).toMatchObject({ role: 'assistant', content: 'recovered' });
  });
});
