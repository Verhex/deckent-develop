// src/cli/repl/provider-evidence.ts
// ═══ TERMINAL-PROVIDER-EVIDENCE-001 — one provider-evidence store for every surface ═══
//
// RECONCILIATION L204: "model selection only inside entitlement / reachability
// / policy evidence". The Ink surface probed credentials synchronously; the
// readline surface had nothing and printed `[unknown]` forever. This store is
// the ONE place both read: bounded, cached (TTL), in-flight-deduplicated
// probes over sources that already exist —
//   · probeProviderAuth for the subscription-CLI providers (logged-in /
//     logged-out / unknown; never a secret, never a login)
//   · an HTTP ping (`/api/tags`, the same contract providers/ollama.ts
//     isAvailable uses) for the Ollama host
// and `unknown` until evidence lands: a missing probe is never a false `ok`.
// Read-only by construction — no credential or config mutation.
//
// Pure w.r.t. I/O: every source is injected (probeAuth, fetchFn, clock), so
// tests are hermetic and production wires the real ones once at boot.

import type { AuthProbeResult } from '../../core/provider-auth-probe.js';
import type { ProviderAvailability } from './picker-specs.js';

export interface ProviderEvidenceDeps {
  probeAuth: (provider: string, opts?: { timeoutMs?: number }) => Promise<AuthProbeResult>;
  fetchFn?: typeof globalThis.fetch;
  now?: () => number;
  /** Ollama base URL (no trailing slash); absent → no reachability source. */
  ollamaHost?: string;
  /** Providers reached through a subscription host CLI (probeAuth applies). */
  hostCliProviders: readonly string[];
  /** The provider universe `refresh()` covers when called without a list. */
  providers?: readonly string[];
  /** Evidence lifetime before a re-probe (default 60 s). */
  ttlMs?: number;
  /** Per-provider probe bound (default 1500 ms); an overrun leaves `unknown`. */
  timeoutMs?: number;
}

export interface ProviderEvidenceStore {
  /** Synchronous, cached: `unknown` until a refresh produced evidence. */
  get(provider: string): ProviderAvailability;
  /** Probe the listed providers (or the universe) — bounded, deduplicated, cached. */
  refresh(providers?: readonly string[]): Promise<void>;
  /** Called once per refresh that changed at least one provider's evidence. */
  subscribe(listener: () => void): () => void;
  /** Providers whose probe is still running. */
  inFlight(): string[];
  /** Evidence with its age, for a status surface. */
  snapshot(): Record<string, { availability: ProviderAvailability; ageMs: number }>;
}

interface Entry { availability: ProviderAvailability; at: number }
interface ProbeOutcome { availability: ProviderAvailability; changed: boolean }

const UNKNOWN: ProviderAvailability = { ok: 'unknown' };
const DEFAULT_TTL_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 1_500;
const OLLAMA_PROVIDER = 'ollama';

function same(a: ProviderAvailability, b: ProviderAvailability): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fromAuth(result: AuthProbeResult): ProviderAvailability {
  if (result.state === 'logged-in') return { ok: true };
  if (result.state === 'logged-out') return { ok: false, code: 'NOT_LOGGED_IN', detail: result.detail ?? '' };
  return UNKNOWN;
}

/** Resolve to `undefined` when the probe overruns `timeoutMs` (the probe keeps running; its late result still lands). */
function bounded<T>(work: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    work.then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(undefined); });
  });
}

export function createProviderEvidence(deps: ProviderEvidenceDeps): ProviderEvidenceStore {
  const now = deps.now ?? (() => Date.now());
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  const entries = new Map<string, Entry>();
  const pending = new Map<string, Promise<ProbeOutcome | undefined>>();
  // How many refresh() calls are currently awaiting a provider's probe. A
  // refresh notifies ONCE for everything it changed; a result that lands when
  // no refresh is waiting any more (an overrun probe) notifies on its own so
  // an open picker still updates.
  const waiting = new Map<string, number>();
  const listeners = new Set<() => void>();

  const notify = (): void => { for (const l of listeners) l(); };

  /** The evidence source for one provider, or null when none applies. */
  const source = (provider: string): (() => Promise<ProviderAvailability>) | null => {
    if (deps.hostCliProviders.includes(provider)) {
      return async () => fromAuth(await deps.probeAuth(provider, { timeoutMs }));
    }
    if (provider === OLLAMA_PROVIDER && deps.ollamaHost) {
      const host = deps.ollamaHost;
      return async () => {
        try {
          const res = await fetchFn(`${host}/api/tags`);
          return res.ok ? { ok: true } : { ok: false, code: 'UNREACHABLE', detail: host };
        } catch {
          return { ok: false, code: 'UNREACHABLE', detail: host };
        }
      };
    }
    return null;
  };

  const fresh = (provider: string): boolean => {
    const entry = entries.get(provider);
    return entry !== undefined && now() - entry.at <= ttlMs;
  };

  /** Start (or join) the probe. The shared promise tells every joiner whether
   *  the landed result changed the evidence; a result nobody is waiting for
   *  any more (every refresh timed out) notifies on its own. */
  const probe = (provider: string): Promise<ProbeOutcome | undefined> => {
    const running = pending.get(provider);
    if (running) return running;
    const run = source(provider);
    if (!run) return Promise.resolve(undefined);
    const full = run().then((availability) => {
      const previous = entries.get(provider)?.availability ?? UNKNOWN;
      entries.set(provider, { availability, at: now() });
      pending.delete(provider);
      const changed = !same(previous, availability);
      if (changed && (waiting.get(provider) ?? 0) === 0) notify();
      return { availability, changed };
    }, () => { pending.delete(provider); return undefined; });
    pending.set(provider, full);
    return full;
  };

  const awaitProbe = async (provider: string): Promise<ProbeOutcome | undefined> => {
    waiting.set(provider, (waiting.get(provider) ?? 0) + 1);
    try {
      return await bounded(probe(provider), timeoutMs);
    } finally {
      waiting.set(provider, (waiting.get(provider) ?? 1) - 1);
    }
  };

  return {
    get(provider) {
      return entries.get(provider)?.availability ?? UNKNOWN;
    },
    async refresh(providers) {
      const targets = providers ?? deps.providers ?? [];
      const stale = targets.filter((p) => !fresh(p));
      const outcomes = await Promise.all(stale.map((p) => awaitProbe(p)));
      if (outcomes.some((o) => o?.changed === true)) notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    inFlight() {
      return [...pending.keys()];
    },
    snapshot() {
      const out: Record<string, { availability: ProviderAvailability; ageMs: number }> = {};
      for (const [provider, entry] of entries) out[provider] = { availability: entry.availability, ageMs: now() - entry.at };
      return out;
    },
  };
}
