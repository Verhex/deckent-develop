import { describe, it, expect, vi } from 'vitest';

import {
  classifyAgenticIntent,
  dispatchAgenticIntent,
} from '../../src/cli/commands/chat-agentic-dispatch.js';
import type { McpToolDispatcher } from '../../src/cli/commands/chat-native.js';

// ─── helpers ────────────────────────────────────────────────────────

function mkDispatcher(impl?: (name: string, args: Record<string, unknown>) => Promise<string> | string): {
  dispatcher: McpToolDispatcher;
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn(async (name: string, args: Record<string, unknown>) => {
    return impl ? await impl(name, args) : `mock:${name}:${JSON.stringify(args)}`;
  });
  return { dispatcher: { dispatch: spy }, spy };
}

// ─── tests ──────────────────────────────────────────────────────────

describe('classifyAgenticIntent — pure intent rules', () => {
  it('maps Turkish "sprint durumu ne" → deckent_status', () => {
    const intent = classifyAgenticIntent('sprint durumu ne');
    expect(intent.tool).toBe('deckent_status');
    if (intent.tool === 'deckent_status') {
      expect(intent.args).toEqual({ root: '.' });
    }
  });

  it('maps "son sprinti göster" → deckent_history', () => {
    const intent = classifyAgenticIntent("son sprinti göster");
    expect(intent.tool).toBe('deckent_history');
  });

  it('maps "hafızada rbac ara" → deckent_memory_query with query', () => {
    const intent = classifyAgenticIntent('hafızada rbac ara');
    expect(intent.tool).toBe('deckent_memory_query');
    if (intent.tool === 'deckent_memory_query') {
      expect(intent.args['query']).toBe('rbac');
    }
  });

  it('maps "plan" / "sprint planla" → deckent_plan with mode auto', () => {
    const intent = classifyAgenticIntent('sprint planla');
    expect(intent.tool).toBe('deckent_plan');
    if (intent.tool === 'deckent_plan') {
      expect(intent.args).toEqual({ mode: 'auto' });
    }
  });

  it('returns no_match for unrelated input', () => {
    const intent = classifyAgenticIntent('hello there friend');
    expect(intent.tool).toBeNull();
    if (intent.tool === null) {
      expect(intent.reason).toBe('no_match');
    }
  });

  it('returns no_match for empty/whitespace input', () => {
    expect(classifyAgenticIntent('').tool).toBeNull();
    expect(classifyAgenticIntent('   \n  ').tool).toBeNull();
  });
});

describe('dispatchAgenticIntent — McpToolDispatcher round-trip', () => {
  it('status intent → dispatches deckent_status and returns its output', async () => {
    const { dispatcher, spy } = mkDispatcher(async () => 'STATUS=GREEN sprint=219');

    const result = await dispatchAgenticIntent('sprint durumu nasıl', dispatcher);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('deckent_status', { root: '.' });
    expect(result.matched).toBe(true);
    expect(result.tool).toBe('deckent_status');
    expect(result.output).toBe('STATUS=GREEN sprint=219');
  });

  it('recall intent → dispatches deckent_memory_query with extracted query', async () => {
    const { dispatcher, spy } = mkDispatcher(async (_name, args) => {
      return JSON.stringify({ q: args.query, found: 2 });
    });

    const result = await dispatchAgenticIntent('hafızada adr-037 ara', dispatcher);

    expect(spy).toHaveBeenCalledTimes(1);
    const [tool, args] = spy.mock.calls[0]!;
    expect(tool).toBe('deckent_memory_query');
    expect((args as Record<string, unknown>).query).toContain('adr-037');
    expect(result.matched).toBe(true);
    expect(result.output).toContain('found');
  });

  it('unknown intent → graceful no_match, dispatcher NOT called', async () => {
    const { dispatcher, spy } = mkDispatcher();

    const result = await dispatchAgenticIntent('tell me a joke about cats', dispatcher);

    expect(spy).not.toHaveBeenCalled();
    expect(result.matched).toBe(false);
    expect(result.tool).toBeUndefined();
    expect(result.output).toContain('no matching intent');
  });

  it('handles multiple distinct intents — each call routes to its own tool', async () => {
    const { dispatcher, spy } = mkDispatcher();

    const a = await dispatchAgenticIntent('sprint durumu ne', dispatcher);
    const b = await dispatchAgenticIntent('son sprintleri göster', dispatcher);
    const c = await dispatchAgenticIntent('sprint planla', dispatcher);

    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls[0]![0]).toBe('deckent_status');
    expect(spy.mock.calls[1]![0]).toBe('deckent_history');
    expect(spy.mock.calls[2]![0]).toBe('deckent_plan');

    expect(a.matched).toBe(true);
    expect(b.matched).toBe(true);
    expect(c.matched).toBe(true);
    expect(a.tool).toBe('deckent_status');
    expect(b.tool).toBe('deckent_history');
    expect(c.tool).toBe('deckent_plan');
  });

  it('English intents — "status" / "history" / "search" also map correctly', async () => {
    const { dispatcher, spy } = mkDispatcher();

    await dispatchAgenticIntent('what is the status', dispatcher);
    await dispatchAgenticIntent('show me sprint history', dispatcher);
    await dispatchAgenticIntent('search memory for docker', dispatcher);

    expect(spy.mock.calls[0]![0]).toBe('deckent_status');
    expect(spy.mock.calls[1]![0]).toBe('deckent_history');
    expect(spy.mock.calls[2]![0]).toBe('deckent_memory_query');
  });
});
