import { describe, it, expect, vi } from 'vitest';
import { createSwitchableProvider, type ActiveSelection } from '../../src/cli/repl/provider-switch.js';
import type { ChatProviderAdapter, ProviderResponse } from '../../src/cli/commands/chat-native.js';

// born-512: an unrecognized provider name used to crash the REPL because
// `switchTo` called `rebuild(next)` unguarded. `rebuild` (production:
// buildReplProvider) throws ProviderNotFoundError for an unknown name — this
// suite pins the fix: the throw is caught, surfaced as `switchError`, and the
// previous adapter/session stays live (no crash, no silent fallback).

function fakeAdapter(tag: string, exitSpy?: () => void): ChatProviderAdapter & { exit: () => void } {
  return {
    send: async (): Promise<ProviderResponse> => ({ text: `reply-from-${tag}`, stopReason: 'end_turn' }),
    async *stream() { yield { text: `stream-${tag}`, done: { text: `stream-${tag}`, stopReason: 'end_turn' as const } }; },
    exit: () => { exitSpy?.(); },
  };
}

/** Mimics buildReplProvider: throws ProviderNotFoundError for unknown names. */
function rebuildWithValidation(sel: ActiveSelection): ChatProviderAdapter {
  if (sel.provider !== 'claude' && sel.provider !== 'codex') {
    throw new Error(`Provider not found: "${sel.provider}"`);
  }
  return fakeAdapter(`${sel.provider}:${sel.model}`);
}

describe('createSwitchableProvider — invalid provider guard (born-512)', () => {
  it('switchTo to an unknown provider does not throw', () => {
    const sw = createSwitchableProvider({ provider: 'claude', model: null }, rebuildWithValidation);
    expect(() => sw.switchTo({ provider: 'bogus-name' })).not.toThrow();
  });

  it('returns a switchError message instead of crashing', () => {
    const sw = createSwitchableProvider({ provider: 'claude', model: null }, rebuildWithValidation);
    const result = sw.switchTo({ provider: 'bogus-name' });
    expect(result.switchError).toBe('Provider not found: "bogus-name"');
  });

  it('leaves current() unchanged on a failed switch (no silent fallback)', () => {
    const sw = createSwitchableProvider({ provider: 'claude', model: 'opus' }, rebuildWithValidation);
    sw.switchTo({ provider: 'bogus-name' });
    expect(sw.current()).toEqual({ provider: 'claude', model: 'opus' });
  });

  it('the proxy keeps routing to the previous (still live) adapter after a failed switch', async () => {
    const sw = createSwitchableProvider({ provider: 'claude', model: null }, rebuildWithValidation);
    sw.switchTo({ provider: 'bogus-name' });
    const r = await sw.proxy.send([]);
    expect(r.text).toBe('reply-from-claude:null');
  });

  it('a subsequent valid switch still works after a prior failed attempt', async () => {
    const exits: string[] = [];
    const rebuild = vi.fn((sel: ActiveSelection): ChatProviderAdapter => {
      if (sel.provider !== 'claude' && sel.provider !== 'codex') {
        throw new Error(`Provider not found: "${sel.provider}"`);
      }
      return fakeAdapter(`${sel.provider}:${sel.model}`, () => exits.push(sel.provider));
    });
    const sw = createSwitchableProvider({ provider: 'claude', model: null }, rebuild);

    const failed = sw.switchTo({ provider: 'bogus-name' });
    expect(failed.switchError).toBeDefined();

    const ok = sw.switchTo({ provider: 'codex', model: 'gpt-5' });
    expect(ok.switchError).toBeUndefined();
    expect(sw.current()).toEqual({ provider: 'codex', model: 'gpt-5' });

    const r = await sw.proxy.send([]);
    expect(r.text).toBe('reply-from-codex:gpt-5');
    await new Promise((res) => setImmediate(res));
    expect(exits).toContain('claude'); // the original adapter was torn down on the eventual valid switch
  });

  it('a non-Error throw (e.g. a thrown string) is caught and stringified', () => {
    // initialAdapter supplied so construction doesn't itself invoke the
    // always-throwing rebuild — only the switchTo() call under test does.
    const sw = createSwitchableProvider(
      { provider: 'claude', model: null },
      () => { throw 'boom'; },
      fakeAdapter('claude'),
    );
    const result = sw.switchTo({ provider: 'anything' });
    expect(result.switchError).toBe('boom');
  });
});
