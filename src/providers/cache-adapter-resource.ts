// ═══ ProviderCacheAdapter — Archetype C: EXPLICIT-RESOURCE ═══════════════
// Spec: docs/superpowers/specs/2026-06-26-worker-prompt-provider-cache-architecture-design.md
//       (Pillar 3, archetype table row C + "Archetype-C hazard").
//
// Providers in this archetype expose a server-side cache RESOURCE with an
// explicit lifecycle: you POST the stable prefix to create a cache (the server
// stores it and BILLS STORAGE BY TIME), receive a handle, REFERENCE that handle
// on subsequent generate calls (so the prefix is not re-sent), then DELETE the
// resource when done.
//   - Gemini `CachedContent`  — storage billed $1–4.5 / M-token / hour (default 1h TTL)
//   - Kimi/Moonshot explicit  — ¥24/M create + ¥10 / M-token / MINUTE storage + ¥0.02/hit
//
// The hazard (spec §Pillar 3): on a parallel fan-out, a cache left alive keeps
// billing. So the adapter MUST run create → reference → **delete**, and the
// delete must survive an exception in the "use" step (try/finally), or storage
// cost compounds silently. This module makes that guarantee structural.
//
// ── Self-contained by design ────────────────────────────────────────────
// The canonical `ProviderCacheAdapter` interface (+ archetypes A/B/D/E) is being
// authored concurrently by sibling Task 330-017 in `./cache-adapter.ts`. That
// file does not exist yet and this task declares no dependency on it; `tsc`
// compiles `src/` and would fail on a missing import. To stay build-independent
// under parallel-spawn, this module defines its own forward-compatible contract
// types (matching the spec contract verbatim), so consolidation with
// `cache-adapter.ts` on integration is a mechanical import re-point — no
// behavioural change. Zero imports ⇒ zero cross-task build coupling.
//
// Pure of ambient I/O: all network + audit + time access is injected behind
// ports, so the test mocks them (no real network, no wall-clock flake).

// ─── Shared cache contract (mirrors Task 330-017 `cache-adapter.ts`) ──────

/** The five provider cache archetypes (spec Pillar 3). */
export type CacheArchetype =
  | 'IMPLICIT-AUTO'
  | 'EXPLICIT-MARKER'
  | 'EXPLICIT-RESOURCE'
  | 'LOCAL-KV'
  | 'NONE';

/**
 * The tiered, byte-stable prompt artifact (spec Pillar 2).
 * - `t0` global contract (deepest, most-reused cache layer)
 * - `t1` tenant/project stable prefix (ADR operative-state, persona, skills)
 * - `t2` volatile tail (task id, description, scope, goNogo) — NEVER cached
 *
 * For archetype C the cached resource holds `t0 + t1`; only `t2` is re-sent
 * on each referencing call.
 */
export interface SegmentedPrompt {
  readonly t0: string;
  readonly t1: string;
  readonly t2: string;
}

/**
 * Realized provider payload produced by an adapter. For archetype C a
 * referencing payload carries `cachedContentHandle` and only the `t2` tail in
 * `prompt`; an uncached fallback carries the full prompt and no handle.
 */
export interface ProviderCachePayload {
  /** Text to actually send to the provider on this call. */
  readonly prompt: string;
  /** Handle of the server-side cache resource being referenced, when any. */
  readonly cachedContentHandle?: string;
  /** Tenant-scoped cache key (multi-tenant isolation, spec Pillar 2). */
  readonly tenantKey?: string;
}

/** Provenance of cache-usage numbers — measured vs not-reported (never fabricated). */
export type CacheUsageSource = 'provider-adapter' | 'unmeasured';

/**
 * Cache-specific token usage extracted from a provider's raw response. A field
 * the provider did not report is left 0 with `source: 'unmeasured'` — deckent
 * never invents a cache number it did not measure.
 */
export interface CacheUsage {
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  readonly source: CacheUsageSource;
}

/**
 * Base adapter contract realized per provider archetype. `emit` produces the
 * provider payload from the segmented artifact; `extractCacheUsage` reads the
 * provider's verify field back out. Archetype C extends this with the explicit
 * create→reference→delete lifecycle ({@link ResourceCacheAdapter}).
 */
export interface ProviderCacheAdapter {
  readonly archetype: CacheArchetype;
  emit(segmented: SegmentedPrompt, tenantKey?: string): ProviderCachePayload;
  extractCacheUsage(raw: string): CacheUsage;
}

// ─── Archetype-C ports (injected — keep the adapter network/time/IO-free) ──

/** Request to create a server-side cache resource. */
export interface CreateCacheRequest {
  /** Stable prefix to cache (archetype C: `t0 + t1`). */
  readonly content: string;
  /** Tenant-scoped key for per-tenant isolation (prevents cross-tenant bleed). */
  readonly tenantKey?: string;
  /**
   * Server-side time-to-live in seconds. A safety net: even if an explicit
   * delete is missed, the provider reaps the resource at TTL — belt-and-
   * suspenders against leaked storage on top of the explicit delete.
   */
  readonly ttlSeconds?: number;
  /** Idempotency-Key so a retried create does not double-bill (safe retries). */
  readonly idempotencyKey?: string;
}

/** Result of a successful cache-resource creation. */
export interface CreateCacheResult {
  /** Provider handle/name of the created cache resource. */
  readonly id: string;
  /** Tokens the provider counted into the cached content, when reported. */
  readonly cachedTokenCount?: number;
}

/**
 * Network seam for the provider's cache-resource API. The adapter never talks
 * to a socket directly; a concrete client wraps Gemini `cachedContents` /
 * Moonshot `/v1/caching`. Tests inject a recording/throwing fake.
 */
export interface CacheResourceClient {
  create(req: CreateCacheRequest): Promise<CreateCacheResult>;
  delete(handleId: string): Promise<void>;
}

/** Final disposition of a cache resource recorded to the ledger. */
export type CacheLedgerOutcome = 'deleted' | 'delete-failed';

/**
 * One storage-lifecycle audit record. `storageMillis` is the wall-clock window
 * the resource was billable; `outcome` distinguishes a clean teardown from a
 * leak that needs operator attention.
 */
export interface CacheLedgerEntry {
  readonly provider: string;
  readonly handleId: string;
  readonly tenantKey?: string;
  readonly createdAt: string;
  readonly deletedAt: string;
  readonly storageMillis: number;
  readonly outcome: CacheLedgerOutcome;
  /** Present only on `delete-failed` — the underlying delete error message. */
  readonly error?: string;
}

/** Audit sink for storage-duration records (spec: "best-effort delete + ledger"). */
export interface CacheStorageLedger {
  record(entry: CacheLedgerEntry): void;
}

/** Monotonic-ish millisecond clock; injectable so storageMillis is deterministic in tests. */
export type Clock = () => number;

/** Construction options for {@link ResourceCacheAdapter}. */
export interface ResourceCacheAdapterOptions {
  /** Provider label for ledger entries, e.g. 'gemini' | 'kimi'. */
  readonly provider: string;
  /** Network seam for the cache-resource API. */
  readonly client: CacheResourceClient;
  /** Storage-duration audit sink. */
  readonly ledger: CacheStorageLedger;
  /** Default server-side TTL (seconds) for created resources. Default 3600 (1h). */
  readonly defaultTtlSeconds?: number;
  /** Millisecond clock (default `Date.now`). */
  readonly clock?: Clock;
  /**
   * Escalation hook fired when a billed cache could NOT be deleted (leak). The
   * delete-failure is never silently swallowed: it is both recorded to the
   * ledger AND surfaced here.
   */
  readonly onLeak?: (entry: CacheLedgerEntry) => void;
}

/** Per-run options for {@link ResourceCacheAdapter.run}/`createCache`. */
export interface ResourceRunOptions {
  readonly tenantKey?: string;
  readonly ttlSeconds?: number;
  /** Idempotency-Key for the create call (safe retries). */
  readonly idempotencyKey?: string;
}

/** Live reference to a created cache resource, plus the bookkeeping for teardown. */
export interface CacheHandle {
  readonly id: string;
  readonly tenantKey?: string;
  readonly createdAtMs: number;
  readonly cachedTokenCount?: number;
}

// ─── Typed error ──────────────────────────────────────────────────────────

/** Raised when the cache-resource API fails. `phase` tells create from delete. */
export class CacheResourceError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly phase: 'create' | 'delete',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CacheResourceError';
  }
}

// ─── Adapter ────────────────────────────────────────────────────────────

const DEFAULT_TTL_SECONDS = 3600;

/** Stringify an unknown thrown value for ledger/error messages. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : JSON.stringify(err);
}

/** Read a non-negative integer off an arbitrary parsed value, else undefined. */
function readCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

/**
 * Archetype-C cache adapter: explicit create → reference → delete with a
 * delete-guard that survives exceptions, plus storage-duration ledgering.
 */
export class ResourceCacheAdapter implements ProviderCacheAdapter {
  readonly archetype: CacheArchetype = 'EXPLICIT-RESOURCE';

  private readonly provider: string;
  private readonly client: CacheResourceClient;
  private readonly ledger: CacheStorageLedger;
  private readonly defaultTtlSeconds: number;
  private readonly clock: Clock;
  private readonly onLeak?: (entry: CacheLedgerEntry) => void;

  constructor(opts: ResourceCacheAdapterOptions) {
    this.provider = opts.provider;
    this.client = opts.client;
    this.ledger = opts.ledger;
    this.defaultTtlSeconds = opts.defaultTtlSeconds ?? DEFAULT_TTL_SECONDS;
    this.clock = opts.clock ?? Date.now;
    this.onLeak = opts.onLeak;
  }

  /**
   * Uncached fallback payload: the full prompt inlined, no cache handle. Used
   * when the caller does not (or cannot) take the resource-cache path; the base
   * `ProviderCacheAdapter.emit` contract. The real economic path is {@link run}.
   */
  emit(segmented: SegmentedPrompt, tenantKey?: string): ProviderCachePayload {
    const payload: ProviderCachePayload = {
      prompt: segmented.t0 + segmented.t1 + segmented.t2,
    };
    return tenantKey === undefined ? payload : { ...payload, tenantKey };
  }

  /**
   * Build the REFERENCING payload: only the volatile `t2` tail is sent; the
   * stable `t0 + t1` prefix lives in the server-side resource addressed by
   * `handle`. This is the whole economic point of archetype C — the cached
   * prefix is never re-transmitted.
   */
  referencePayload(segmented: SegmentedPrompt, handle: CacheHandle): ProviderCachePayload {
    const payload: ProviderCachePayload = {
      prompt: segmented.t2,
      cachedContentHandle: handle.id,
    };
    return handle.tenantKey === undefined ? payload : { ...payload, tenantKey: handle.tenantKey };
  }

  /**
   * Create the server-side cache resource holding the stable prefix (`t0 + t1`).
   * Throws {@link CacheResourceError} (phase 'create') on failure — nothing was
   * created, so there is nothing to leak; the caller decides fallback.
   */
  async createCache(segmented: SegmentedPrompt, opts: ResourceRunOptions = {}): Promise<CacheHandle> {
    const createdAtMs = this.clock();
    let result: CreateCacheResult;
    try {
      result = await this.client.create({
        content: segmented.t0 + segmented.t1,
        tenantKey: opts.tenantKey,
        ttlSeconds: opts.ttlSeconds ?? this.defaultTtlSeconds,
        idempotencyKey: opts.idempotencyKey,
      });
    } catch (err) {
      throw new CacheResourceError(
        `cache create failed for provider "${this.provider}": ${errorMessage(err)}`,
        this.provider,
        'create',
        err,
      );
    }
    return {
      id: result.id,
      tenantKey: opts.tenantKey,
      createdAtMs,
      cachedTokenCount: result.cachedTokenCount,
    };
  }

  /**
   * Best-effort teardown of a billed resource. NEVER throws — a throw here would
   * mask the caller's real work (or its error) inside `run`'s finally. On
   * failure the leak is NOT swallowed: it is recorded to the ledger
   * (`outcome: 'delete-failed'`) AND escalated via `onLeak`.
   */
  async bestEffortDelete(handle: CacheHandle): Promise<void> {
    const deletedAtMs = this.clock();
    const base = {
      provider: this.provider,
      handleId: handle.id,
      tenantKey: handle.tenantKey,
      createdAt: new Date(handle.createdAtMs).toISOString(),
      deletedAt: new Date(deletedAtMs).toISOString(),
      storageMillis: Math.max(0, deletedAtMs - handle.createdAtMs),
    } as const;
    try {
      await this.client.delete(handle.id);
      this.ledger.record({ ...base, outcome: 'deleted' });
    } catch (err) {
      const entry: CacheLedgerEntry = {
        ...base,
        outcome: 'delete-failed',
        error: errorMessage(err),
      };
      this.ledger.record(entry);
      this.onLeak?.(entry);
    }
  }

  /**
   * Run a generate call against a freshly-created cache resource with a
   * guaranteed teardown: create → reference → `use` → delete. The delete runs in
   * a `finally`, so it fires even when `use` throws — the exception still
   * propagates, but no billed storage is leaked. `use` receives the referencing
   * payload (tail + handle).
   */
  async run<T>(
    segmented: SegmentedPrompt,
    opts: ResourceRunOptions,
    use: (payload: ProviderCachePayload) => Promise<T>,
  ): Promise<T> {
    const handle = await this.createCache(segmented, opts);
    try {
      return await use(this.referencePayload(segmented, handle));
    } finally {
      await this.bestEffortDelete(handle);
    }
  }

  /**
   * Extract cache usage from a provider's raw generate response.
   *   - Gemini: `usageMetadata.cachedContentTokenCount` → cacheReadTokens
   *   - Kimi/Moonshot (OpenAI-shaped): `usage.prompt_tokens_details.cached_tokens`
   *     or `usage.cached_tokens` → cacheReadTokens
   * A response with no recognized cache field (or malformed JSON) yields zeros
   * with `source: 'unmeasured'` — never a fabricated number.
   */
  extractCacheUsage(raw: string): CacheUsage {
    const unmeasured: CacheUsage = {
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      source: 'unmeasured',
    };
    if (typeof raw !== 'string' || raw.trim() === '') return unmeasured;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return unmeasured;
    }
    if (parsed === null || typeof parsed !== 'object') return unmeasured;
    const obj = parsed as Record<string, unknown>;

    // Gemini CachedContent shape.
    const usageMetadata = obj['usageMetadata'];
    if (usageMetadata !== null && typeof usageMetadata === 'object') {
      const gm = usageMetadata as Record<string, unknown>;
      const cacheRead = readCount(gm['cachedContentTokenCount']);
      if (cacheRead !== undefined) {
        return { cacheReadTokens: cacheRead, cacheCreationTokens: 0, source: 'provider-adapter' };
      }
    }

    // Kimi/Moonshot (OpenAI-shaped) usage.
    const usage = obj['usage'];
    if (usage !== null && typeof usage === 'object') {
      const u = usage as Record<string, unknown>;
      const details = u['prompt_tokens_details'];
      const nested =
        details !== null && typeof details === 'object'
          ? readCount((details as Record<string, unknown>)['cached_tokens'])
          : undefined;
      const cacheRead = nested ?? readCount(u['cached_tokens']);
      if (cacheRead !== undefined) {
        return { cacheReadTokens: cacheRead, cacheCreationTokens: 0, source: 'provider-adapter' };
      }
    }

    return unmeasured;
  }
}
