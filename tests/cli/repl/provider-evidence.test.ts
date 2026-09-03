// tests/cli/repl/provider-evidence.test.ts
// ═══ TERMINAL-PROVIDER-EVIDENCE-001 — one provider-evidence store for every surface ═══
//
// Owner decision (2026-09-03): the readline surface printed `[unknown]` for
// every provider because it had no credential / reachability probe, while
// the Ink surface probed synchronously. Both now read ONE evidence store:
// bounded, cached (TTL), in-flight-deduplicated probes over the sources that
// already exist — probeProviderAuth for the subscription CLIs, an HTTP ping
// for Ollama — and `unknown` until evidence lands (never a false `ok`).
// Read-only probes: no credential mutation, no login. Hermetic (fakes + clock).

import { describe, it, expect } from 'vitest';
import { createProviderEvidence, type ProviderEvidenceDeps } from '../../../src/cli/repl/provider-evidence.js';
import type { AuthProbeResult } from '../../../src/core/provider-auth-probe.js';

function deps(over: Partial<ProviderEvidenceDeps> = {}): ProviderEvidenceDeps & { calls: string[]; clock: { now: number } } {
  const calls: string[] = [];
  const clock = { now: 1_000 };
  const auth = async (provider: string): Promise<AuthProbeResult> => {
    calls.push(`auth:${provider}`);
    if (provider === 'claude') return { state: 'logged-in', present: true, authenticated: true, method: 'subscription' };
    if (provider === 'codex') return { state: 'logged-out', detail: 'no session', present: true, authenticated: false, method: 'none' };
    return { state: 'unknown', detail: 'no contract', present: 'unknown', authenticated: 'unknown', method: 'none' };
  };
  const fetchFn = (async (url: string) => {
    calls.push(`fetch:${url}`);
    if (url.startsWith('http://ok')) return { ok: true } as Response;
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof globalThis.fetch;
  return {
    calls,
    clock,
    probeAuth: auth,
    fetchFn,
    now: () => clock.now,
    ollamaHost: 'http://ok:11434',
    hostCliProviders: ['claude', 'codex', 'gemini', 'cursor'],
    ttlMs: 30_000,
    timeoutMs: 500,
    ...over,
  };
}

describe('createProviderEvidence', () => {
  it('reports unknown before any evidence and never invents ok', () => {
    const store = createProviderEvidence(deps());
    expect(store.get('claude')).toEqual({ ok: 'unknown' });
    expect(store.get('ollama')).toEqual({ ok: 'unknown' });
    expect(store.get('openrouter')).toEqual({ ok: 'unknown' });
  });

  it('refresh turns the auth probe into ok / typed blocked / unknown per provider', async () => {
    const d = deps();
    const store = createProviderEvidence(d);
    await store.refresh(['claude', 'codex', 'gemini']);
    expect(store.get('claude')).toEqual({ ok: true });
    expect(store.get('codex')).toEqual({ ok: false, code: 'NOT_LOGGED_IN', detail: 'no session' });
    expect(store.get('gemini')).toEqual({ ok: 'unknown' });
    expect(d.calls).toEqual(['auth:claude', 'auth:codex', 'auth:gemini']);
  });

  it('pings the Ollama host: reachable → ok, refused → typed UNREACHABLE naming the host', async () => {
    const ok = createProviderEvidence(deps());
    await ok.refresh(['ollama']);
    expect(ok.get('ollama')).toEqual({ ok: true });
    const down = createProviderEvidence(deps({ ollamaHost: 'http://down:11434' }));
    await down.refresh(['ollama']);
    expect(down.get('ollama')).toEqual({ ok: false, code: 'UNREACHABLE', detail: 'http://down:11434' });
  });

  it('a provider with no evidence source stays unknown without any probe call', async () => {
    const d = deps();
    const store = createProviderEvidence(d);
    await store.refresh(['openrouter', 'deepseek']);
    expect(store.get('openrouter')).toEqual({ ok: 'unknown' });
    expect(d.calls).toEqual([]);
  });

  it('caches within the TTL and re-probes after it', async () => {
    const d = deps();
    const store = createProviderEvidence(d);
    await store.refresh(['claude']);
    await store.refresh(['claude']);
    expect(d.calls).toEqual(['auth:claude']);
    d.clock.now += 30_001;
    await store.refresh(['claude']);
    expect(d.calls).toEqual(['auth:claude', 'auth:claude']);
  });

  it('deduplicates an in-flight probe for the same provider', async () => {
    let release: (() => void) | undefined;
    const d = deps({
      probeAuth: () => new Promise<AuthProbeResult>((resolve) => { release = () => resolve({ state: 'logged-in', present: true, authenticated: true, method: 'subscription' }); }),
    });
    const store = createProviderEvidence(d);
    const a = store.refresh(['claude']);
    const b = store.refresh(['claude']);
    expect(store.inFlight()).toEqual(['claude']);
    release!();
    await Promise.all([a, b]);
    expect(store.get('claude')).toEqual({ ok: true });
    expect(store.inFlight()).toEqual([]);
  });

  it('a probe that exceeds the bound leaves the provider unknown (never blocks the surface)', async () => {
    const d = deps({ probeAuth: () => new Promise(() => { /* never */ }), timeoutMs: 20 });
    const store = createProviderEvidence(d);
    await store.refresh(['claude']);
    expect(store.get('claude')).toEqual({ ok: 'unknown' });
  });

  it('a throwing probe is evidence of nothing: unknown, not blocked', async () => {
    const d = deps({ probeAuth: async () => { throw new Error('boom'); } });
    const store = createProviderEvidence(d);
    await store.refresh(['claude']);
    expect(store.get('claude')).toEqual({ ok: 'unknown' });
  });

  it('notifies subscribers once per refresh that changed something', async () => {
    const d = deps();
    const store = createProviderEvidence(d);
    let events = 0;
    const off = store.subscribe(() => { events += 1; });
    await store.refresh(['claude', 'ollama']);
    expect(events).toBe(1);
    await store.refresh(['claude']); // cached → nothing changed
    expect(events).toBe(1);
    off();
    d.clock.now += 60_000;
    await store.refresh(['claude']);
    expect(events).toBe(1);
  });

  it('two overlapping refreshes that both waited on one changed probe each notify once; a late-landing result notifies on its own', async () => {
    let release: (() => void) | undefined;
    const d = deps({
      probeAuth: () => new Promise<AuthProbeResult>((resolve) => { release = () => resolve({ state: 'logged-in', present: true, authenticated: true, method: 'subscription' }); }),
      timeoutMs: 20,
    });
    const store = createProviderEvidence(d);
    let events = 0;
    store.subscribe(() => { events += 1; });
    // both refreshes overrun the bound → 0 notifications yet, evidence still unknown
    await Promise.all([store.refresh(['claude']), store.refresh(['claude'])]);
    expect(events).toBe(0);
    expect(store.get('claude')).toEqual({ ok: 'unknown' });
    release!();
    await new Promise((r) => setTimeout(r, 0));
    // the late result lands with nobody waiting → exactly one notification
    expect(events).toBe(1);
    expect(store.get('claude')).toEqual({ ok: true });
  });

  it('snapshot exposes the evidence with its age for a status surface', async () => {
    const d = deps();
    const store = createProviderEvidence(d);
    await store.refresh(['claude']);
    d.clock.now += 5_000;
    expect(store.snapshot()).toEqual({ claude: { availability: { ok: true }, ageMs: 5_000 } });
  });
});
