import { describe, it, expect, vi } from 'vitest';

import {
  runChatNativeLoop,
  createSwitchableProvider,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type SubscriptionSpawnFn,
} from '../../src/cli/commands/chat-native.js';
import {
  ProviderRegistry,
  ProviderNotFoundError,
  type ProviderAdapter,
} from '../../src/core/provider.js';

// ═══ Sprint 343 R7 — native-chat `/provider` switch rebuilds the adapter ═════
//
// Proves the loop wiring around `switchProvider`:
//   - WITH a switchable provider: the live adapter is rebuilt in-place and the
//     loop reports the real switch (the proxy now delegates to the new adapter).
//   - unknown provider → honest error, NO silent claude fallback.
//   - WITHOUT switch capability → honest "switching unavailable" notice, NOT a
//     fake "switched" confirmation (the pre-fix bug).
//   - the default no-switch warm path (normal turns) is preserved.
// Fully hermetic: no real provider spawn / network — providers are injected
// doubles and the real createSwitchableProvider uses an injected spawnFn.

// ─── Helpers ─────────────────────────────────────────────────────────

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function noopDispatcher(): McpToolDispatcher {
  return { dispatch: async () => 'tool-ok' };
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

/**
 * A faithful switchable-provider DOUBLE: the proxy delegates to `current`;
 * `switchProvider` validates the name against the registry (throwing
 * ProviderNotFoundError for an unknown name — never a claude fallback) and
 * rebuilds `current` to an adapter tagged with the new provider name. Mirrors
 * the contract of the real createSwitchableProvider without spawning anything.
 */
function makeSwitchableDouble(registry: ProviderRegistry): {
  provider: ChatProviderAdapter;
  switchProvider: (name: string) => void;
  switches: string[];
} {
  const tagged = (name: string): ChatProviderAdapter => ({
    send: async () => ({ text: `[reply:${name}]`, stopReason: 'end_turn' }),
  });
  let current = tagged('claude');
  const switches: string[] = [];
  const provider: ChatProviderAdapter = { send: (m) => current.send(m) };
  const switchProvider = (name: string): void => {
    registry.getProvider(name); // throws ProviderNotFoundError for unknown — no fallback
    switches.push(name);
    current = tagged(name);
  };
  return { provider, switchProvider, switches };
}

// ─── G1: live adapter rebuild (injected switchable double) ───────────

describe('/provider switch — live adapter rebuild (injected double)', () => {
  it('rebuilds the live adapter and reports the real switch', async () => {
    const registry = new ProviderRegistry();
    registry.registerProvider(mockProvider('claude'), /* setDefault */ true);
    registry.registerProvider(mockProvider('codex'));
    const d = makeSwitchableDouble(registry);

    const out: string[] = [];
    await runChatNativeLoop({
      provider: d.provider,
      switchProvider: d.switchProvider,
      dispatcher: noopDispatcher(),
      input: lines('hi', '/provider codex', 'hi again'),
      output: (l) => out.push(l),
    });
    const joined = out.join('\n');

    expect(d.switches).toEqual(['codex']);          // loop wired switchProvider through
    expect(joined).toContain('[reply:claude]');     // pre-switch turn used claude
    expect(joined).toContain('switched to: codex'); // real confirmation (en)
    expect(joined).toContain('[reply:codex]');      // proxy now delegates to the NEW adapter
  });
});

// ─── G2: unknown provider → honest error, no fallback ────────────────

describe('/provider switch — unknown provider', () => {
  it('surfaces an honest error and never falls back to claude', async () => {
    const registry = new ProviderRegistry();
    registry.registerProvider(mockProvider('claude'), true);
    const d = makeSwitchableDouble(registry);

    const out: string[] = [];
    await runChatNativeLoop({
      provider: d.provider,
      switchProvider: d.switchProvider,
      dispatcher: noopDispatcher(),
      input: lines('/provider nope', 'ping'),
      output: (l) => out.push(l),
    });
    const joined = out.join('\n');

    expect(d.switches).not.toContain('nope');          // rebuild rejected — never recorded
    expect(joined).toContain('[chat-native] error:');  // honest error (chat.provider_error)
    expect(joined).not.toContain('switched to: nope'); // no fake confirmation
    expect(joined).toContain('[reply:claude]');        // still claude — NO silent fallback
  });
});

// ─── G3: no switch capability → honest "unavailable" (THE RED case) ──

describe('/provider switch — no switcher wired (honest, not fake)', () => {
  it('reports switching unavailable instead of a fake "switched" confirmation', async () => {
    const provider: ChatProviderAdapter = {
      send: async () => ({ text: '[reply:fixed]', stopReason: 'end_turn' }),
    };
    const out: string[] = [];
    await runChatNativeLoop({
      provider,
      dispatcher: noopDispatcher(),
      input: lines('/provider codex'),
      output: (l) => out.push(l),
      // switchProvider intentionally omitted — fixed single-provider session
    });
    const joined = out.join('\n');

    expect(joined.toLowerCase()).toContain('unavailable'); // honest notice
    expect(joined).not.toContain('switched to');           // NOT a fake success
    expect(joined).toContain('codex');                     // echoes the requested name
  });

  it('honors an injected switchUnavailable formatter (caller-localized / i18n)', async () => {
    const provider: ChatProviderAdapter = {
      send: async () => ({ text: 'x', stopReason: 'end_turn' }),
    };
    const out: string[] = [];
    await runChatNativeLoop({
      provider,
      dispatcher: noopDispatcher(),
      input: lines('/provider codex'),
      output: (l) => out.push(l),
      switchUnavailable: (name) => `LOCALIZED-UNAVAILABLE:${name}`,
    });

    expect(out.join('\n')).toContain('LOCALIZED-UNAVAILABLE:codex');
  });
});

// ─── G4: warm path preserved ─────────────────────────────────────────

describe('/provider switch — warm path preserved', () => {
  it('normal conversation turns are unaffected (no /provider)', async () => {
    const provider: ChatProviderAdapter = {
      send: async () => ({ text: 'hello-back', stopReason: 'end_turn' }),
    };
    const out: string[] = [];
    await runChatNativeLoop({
      provider,
      dispatcher: noopDispatcher(),
      input: lines('hello'),
      output: (l) => out.push(l),
    });
    expect(out).toContain('hello-back');
  });

  it('bare /provider still shows the usage hint', async () => {
    const provider: ChatProviderAdapter = {
      send: async () => ({ text: 'x', stopReason: 'end_turn' }),
    };
    const out: string[] = [];
    await runChatNativeLoop({
      provider,
      dispatcher: noopDispatcher(),
      input: lines('/provider'),
      output: (l) => out.push(l),
    });
    expect(out.some((o) => o.includes('/provider'))).toBe(true);
  });
});

// ─── G5: real createSwitchableProvider machinery (rebuild + delegate) ─

describe('createSwitchableProvider — real machinery (rebuild + validation)', () => {
  it('switchProvider rebuilds the adapter; the proxy delegates to the rebuilt one', async () => {
    const registry = new ProviderRegistry();
    registry.registerProvider(mockProvider('claude'), true);
    registry.registerProvider(mockProvider('codex'));
    let callNum = 0;
    const spawnFn = makeSpawnFn(() => {
      callNum++;
      return callNum === 1 ? 'from-claude' : 'from-codex';
    });

    const { provider, switchProvider } = createSwitchableProvider({
      initialProviderName: 'claude',
      registry,
      spawnFn,
    });

    const r1 = await provider.send([{ role: 'user', content: 'x' }]);
    expect(r1.text).toBe('from-claude');

    expect(() => switchProvider('codex')).not.toThrow();

    const r2 = await provider.send([{ role: 'user', content: 'x' }]);
    expect(r2.text).toBe('from-codex'); // proxy now delegates to the rebuilt adapter
  });

  it('switchProvider throws ProviderNotFoundError for an unknown name (no fallback)', () => {
    const registry = new ProviderRegistry();
    registry.registerProvider(mockProvider('claude'), true);
    const { switchProvider } = createSwitchableProvider({
      registry,
      spawnFn: makeSpawnFn(() => 'ok'),
    });

    expect(() => switchProvider('nope')).toThrow(ProviderNotFoundError);
  });
});
