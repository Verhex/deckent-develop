import { describe, it, expect, vi } from 'vitest';
import { createSwitchableProvider, type ActiveSelection } from '../../src/cli/repl/provider-switch.js';
import type { ChatProviderAdapter, ProviderResponse } from '../../src/cli/commands/chat-native.js';

// Fake adapter that records its selection so we can assert which one is live.
function fakeAdapter(tag: string, exitSpy?: () => void): ChatProviderAdapter & { exit: () => void } {
  return {
    send: async (): Promise<ProviderResponse> => ({ text: `reply-from-${tag}`, stopReason: 'end_turn' }),
    async *stream() { yield { text: `stream-${tag}`, done: { text: `stream-${tag}`, stopReason: 'end_turn' as const } }; },
    exit: () => { exitSpy?.(); },
  };
}

describe('createSwitchableProvider (E3)', () => {
  it('delegates send/stream to the initial adapter', async () => {
    const sw = createSwitchableProvider({ provider: 'claude', model: null }, () => fakeAdapter('claude'));
    const r = await sw.proxy.send([]);
    expect(r.text).toBe('reply-from-claude');
    expect(sw.current()).toEqual({ provider: 'claude', model: null });
  });

  it('switchTo rebuilds, tears down the previous adapter, and routes to the new one', async () => {
    const exits: string[] = [];
    const rebuild = vi.fn((sel: ActiveSelection) => fakeAdapter(`${sel.provider}:${sel.model}`, () => exits.push(sel.provider)));
    const sw = createSwitchableProvider({ provider: 'claude', model: 'opus' }, rebuild);

    sw.switchTo({ provider: 'codex', model: 'gpt-5' });
    expect(sw.current()).toEqual({ provider: 'codex', model: 'gpt-5' });
    const r = await sw.proxy.send([]);
    expect(r.text).toBe('reply-from-codex:gpt-5'); // routes to the NEW adapter
    await new Promise((res) => setImmediate(res));
    expect(exits).toContain('claude'); // previous adapter torn down
  });

  it('switchTo with only a model keeps the current provider', () => {
    const sw = createSwitchableProvider({ provider: 'claude', model: 'opus' }, (s) => fakeAdapter(`${s.provider}`));
    sw.switchTo({ model: 'sonnet' });
    expect(sw.current()).toEqual({ provider: 'claude', model: 'sonnet' });
  });

  it('proxy.stream falls back to send() for a non-streaming adapter', async () => {
    const nonStreaming: ChatProviderAdapter = { send: async () => ({ text: 'one-shot', stopReason: 'end_turn' }) };
    const sw = createSwitchableProvider({ provider: 'codex', model: null }, () => nonStreaming);
    const chunks: string[] = [];
    for await (const c of sw.proxy.stream!([])) { if (c.text) chunks.push(c.text); }
    expect(chunks).toEqual(['one-shot']);
  });

  it('exit tears down the active adapter', async () => {
    let exited = false;
    const sw = createSwitchableProvider({ provider: 'claude', model: null }, () => fakeAdapter('claude', () => { exited = true; }));
    await sw.exit();
    expect(exited).toBe(true);
  });
});
