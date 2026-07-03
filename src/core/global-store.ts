import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { posix, win32 } from 'node:path';
import { z, type ZodType } from 'zod';
import type { GlobalScopePaths } from './global-scope-resolver.js';

/**
 * GLOBAL-STORE (Sıra-200 ONB-GLOBAL dilim-2; on top of 361-008's
 * `global-scope-resolver.ts` — design doc: docs/design/onb-global-install.md
 * §4 layer table, §6 resolver core).
 *
 * A generic, versioned JSON store layer over the directories
 * {@link resolveGlobalScopePaths} computes. Each store is defined by a
 * {@link GlobalStoreDefinition}: which role-dir it lives under
 * (config/data/cache/state), its file name, a zod schema for its current
 * payload shape, an ordered migration chain, and a default (empty) payload.
 *
 * Guarantees:
 *   - **Atomic write** — `save()` writes to a sibling `.<uuid>.tmp` file then
 *     `renameSync`s it into place (best-effort tmp cleanup on rename
 *     failure), mirroring `approval-broker.ts`'s `atomicWriteJson`. A torn
 *     write is never observable — readers see either the old file or the
 *     fully-written new one.
 *   - **Fail-soft reads** — a missing, unreadable, corrupt, schema-invalid,
 *     or unmigratable file NEVER throws from `load()`; it yields the
 *     definition's `defaultData()` plus a `source` tag explaining why,
 *     mirroring `tool-schema-override.ts`'s `loadToolOverridesConfig`. Only
 *     `save()` propagates genuine I/O errors (disk full, permission denied)
 *     — "bozuk-dosya fail-soft" governs damaged *reads*, not silenced writes.
 *   - **Migration skeleton** — `definition.migrations` is an ordered list of
 *     single-version-step transforms (`fromVersion -> fromVersion + 1`)
 *     applied to the raw (pre-validation) payload before the current
 *     schema's `safeParse`. Every concrete store below ships at version 1
 *     with an empty chain (nothing to migrate from yet); the chain mechanism
 *     itself is exercised in tests/core/global-store.test.ts so a future
 *     version bump has a proven seam to land in.
 *
 * Intentionally UNWIRED (like the resolver it sits on): `credentials.ts`,
 * `model-catalog.ts`, and the limits ledger keep their existing storage —
 * migrating those owner modules onto `GlobalStore` is separate, future work
 * (design doc §8 "Born work-items" / ONB-GLOBAL-WIRE). The three concrete
 * definitions below are therefore self-contained first-cut contracts, not
 * imports of those modules' existing types — decoupling this slice from
 * modules outside its write scope.
 *
 * Scope discipline: this module never touches project-scope state
 * (`.brain/`, `.tasks/`, `.deckent/` under a project root) — every path it
 * computes descends from a caller-supplied {@link GlobalScopePaths}, which
 * only ever describes the global (user-machine-wide) scope. Config
 * precedence (`src/core/config.ts`) is untouched.
 *
 * ADR-D-004 (Layer-1 Import Direction) C1: `core/` MUST NOT import
 * `orchestra/cli/api/mcp`. This module only imports node builtins, zod, and
 * the sibling `core/global-scope-resolver.ts` — clean.
 */

/** Which {@link GlobalScopePaths} role-dir a store's file lives under. */
export type GlobalStoreRole = 'config' | 'data' | 'cache' | 'state';

/** Selects the role-dir from an already-resolved {@link GlobalScopePaths}. */
export function globalStoreDir(paths: GlobalScopePaths, role: GlobalStoreRole): string {
  switch (role) {
    case 'config':
      return paths.configDir;
    case 'data':
      return paths.dataDir;
    case 'cache':
      return paths.cacheDir;
    case 'state':
      return paths.stateDir;
  }
}

/**
 * Joins a store's role-dir with `fileName` using the platform-correct path
 * API — `path.win32` for `'win32'`, `path.posix` otherwise — selected by the
 * *injected* `paths.platform`, never the host's `process.platform`. Mirrors
 * `global-scope-resolver.ts`'s own backend-selection rule so this join stays
 * deterministic cross-host (a win32 path resolved on a Linux CI runner is
 * byte-identical to one resolved on real Windows). Pure — no fs access.
 */
export function globalStoreFilePath(
  paths: GlobalScopePaths,
  role: GlobalStoreRole,
  fileName: string,
): string {
  const pathApi = paths.platform === 'win32' ? win32 : posix;
  return pathApi.join(globalStoreDir(paths, role), fileName);
}

/** One version-upgrade step: transforms raw (pre-validation) payload data at
 *  `fromVersion` into raw payload data at `fromVersion + 1`. Operates on
 *  `unknown` — migrations run BEFORE schema validation, so a migration must
 *  not assume its input already matches any particular shape beyond what it
 *  itself produced at the prior step. */
export interface GlobalStoreMigration {
  readonly fromVersion: number;
  migrate(data: unknown): unknown;
}

/** Declares one versioned JSON store: where it lives, its current schema,
 *  how to upgrade older on-disk versions, and its empty/default payload. */
export interface GlobalStoreDefinition<T> {
  readonly role: GlobalStoreRole;
  readonly fileName: string;
  /** Current schema version this module understands. Must be >= 1. */
  readonly version: number;
  /** Validates the payload AFTER migrations have run, at `version`. */
  readonly dataSchema: ZodType<T>;
  /** Ordered upgrade steps; a store starting at `version` needs none. */
  readonly migrations?: readonly GlobalStoreMigration[];
  /** The payload used when no file exists, or as the fail-soft fallback. */
  defaultData(): T;
}

/** Why {@link GlobalStore.load} returned the value it did. */
export type GlobalStoreLoadSource = 'file' | 'default-missing' | 'default-corrupt';

export interface GlobalStoreLoadResult<T> {
  readonly data: T;
  readonly source: GlobalStoreLoadSource;
  /** Present only when `source === 'default-corrupt'` — human-readable
   *  diagnostic (never thrown; callers may log it). */
  readonly warning?: string;
}

interface GlobalStoreEnvelope {
  readonly version: number;
  readonly data: unknown;
}

function isEnvelope(value: unknown): value is GlobalStoreEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof (value as Record<string, unknown>).version === 'number' &&
    'data' in value
  );
}

/** Versioned, atomic-write, fail-soft-read JSON store over one role-dir file. */
export class GlobalStore<T> {
  constructor(
    private readonly paths: GlobalScopePaths,
    private readonly definition: GlobalStoreDefinition<T>,
  ) {}

  /** Absolute path this store reads from / writes to. */
  get filePath(): string {
    return globalStoreFilePath(this.paths, this.definition.role, this.definition.fileName);
  }

  /**
   * Loads and validates this store's payload. Never throws: a missing file
   * yields `defaultData()`/`'default-missing'`; any parse error, malformed
   * envelope, unmigratable version, or schema-validation failure yields
   * `defaultData()`/`'default-corrupt'` with a `warning`.
   */
  load(): GlobalStoreLoadResult<T> {
    const filePath = this.filePath;
    if (!existsSync(filePath)) {
      return { data: this.definition.defaultData(), source: 'default-missing' };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (error) {
      return this.corrupt(filePath, error);
    }

    if (!isEnvelope(raw)) {
      return this.corrupt(filePath, 'not a versioned { version, data } envelope');
    }

    const migrated = this.migrate(raw.version, raw.data);
    if (migrated === MIGRATION_FAILED) {
      return this.corrupt(
        filePath,
        `no migration path from version ${raw.version} to ${this.definition.version}`,
      );
    }

    const parsed = this.definition.dataSchema.safeParse(migrated);
    if (!parsed.success) {
      return this.corrupt(filePath, parsed.error.message);
    }

    return { data: parsed.data, source: 'file' };
  }

  /**
   * Atomically persists `data` at the current schema version. Creates the
   * role-dir (and any missing ancestors) first. I/O failures (disk full,
   * permission denied) propagate — only reads are fail-soft.
   */
  save(data: T): void {
    const filePath = this.filePath;
    mkdirSync(globalStoreDir(this.paths, this.definition.role), { recursive: true });
    const envelope: GlobalStoreEnvelope = { version: this.definition.version, data };
    const tmpPath = `${filePath}.${randomUUID()}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(envelope, null, 2) + '\n', 'utf-8');
    try {
      renameSync(tmpPath, filePath);
    } catch (error) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Best-effort cleanup — the rename error below is what the caller needs.
      }
      throw error;
    }
  }

  private corrupt(filePath: string, cause: unknown): GlobalStoreLoadResult<T> {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return {
      data: this.definition.defaultData(),
      source: 'default-corrupt',
      warning: `${filePath}: ${reason}`,
    };
  }

  /** Walks `definition.migrations` from `fromVersion` up to `definition.version`,
   *  one step at a time. Returns {@link MIGRATION_FAILED} when a required step
   *  is missing or `fromVersion` is newer than this module understands. */
  private migrate(fromVersion: number, data: unknown): unknown | typeof MIGRATION_FAILED {
    if (fromVersion === this.definition.version) return data;
    if (fromVersion > this.definition.version) return MIGRATION_FAILED;

    const stepByFromVersion = new Map(
      (this.definition.migrations ?? []).map((step) => [step.fromVersion, step] as const),
    );

    let current = data;
    for (let version = fromVersion; version < this.definition.version; version += 1) {
      const step = stepByFromVersion.get(version);
      if (!step) return MIGRATION_FAILED;
      current = step.migrate(current);
    }
    return current;
  }
}

const MIGRATION_FAILED = Symbol('global-store-migration-failed');

// ─── Concrete store definitions ──────────────────────────────────────────────
// Self-contained schemas (see module doc) — first-cut contracts for the three
// stores named in the design doc's layer table, not yet consumed by any
// owner module.

/** Last-known auth-verification status per provider — NOT the credentials/
 *  secrets themselves (those stay in `credentials.ts`'s data-role store).
 *  Rebuildable by re-verifying against the provider, hence `role: 'cache'`. */
export interface AuthStatusCacheEntry {
  readonly providerId: string;
  readonly authenticated: boolean;
  readonly accountLabel?: string;
  readonly lastVerifiedAt: string;
  readonly lastError?: string;
}

export interface AuthStatusCacheData {
  readonly entries: Readonly<Record<string, AuthStatusCacheEntry>>;
}

const authStatusCacheEntrySchema = z
  .object({
    providerId: z.string().min(1),
    authenticated: z.boolean(),
    accountLabel: z.string().optional(),
    lastVerifiedAt: z.string(),
    lastError: z.string().optional(),
  })
  .strict();

const authStatusCacheDataSchema: ZodType<AuthStatusCacheData> = z
  .object({ entries: z.record(authStatusCacheEntrySchema) })
  .strict();

export const AUTH_STATUS_CACHE_DEFINITION: GlobalStoreDefinition<AuthStatusCacheData> = {
  role: 'cache',
  fileName: 'auth-status-cache.json',
  version: 1,
  dataSchema: authStatusCacheDataSchema,
  migrations: [],
  defaultData: () => ({ entries: {} }),
};

/** First-cut, decoupled skeleton for a future global model-catalog cache —
 *  independent of `model-catalog.ts`'s `CachedCatalog` type (that module's
 *  migration onto `GlobalStore` is separate, future wiring work). */
export interface ModelCatalogCacheModelEntry {
  readonly id: string;
  readonly provider: string;
  readonly tier?: string;
  readonly status?: string;
}

export interface ModelCatalogCacheData {
  readonly fetchedAt: string | null;
  readonly source: 'remote' | 'bundled' | 'none';
  readonly models: readonly ModelCatalogCacheModelEntry[];
}

const modelCatalogCacheModelEntrySchema = z
  .object({
    id: z.string().min(1),
    provider: z.string().min(1),
    tier: z.string().optional(),
    status: z.string().optional(),
  })
  .strict();

const modelCatalogCacheDataSchema: ZodType<ModelCatalogCacheData> = z
  .object({
    fetchedAt: z.string().nullable(),
    source: z.enum(['remote', 'bundled', 'none']),
    models: z.array(modelCatalogCacheModelEntrySchema),
  })
  .strict();

export const MODEL_CATALOG_CACHE_DEFINITION: GlobalStoreDefinition<ModelCatalogCacheData> = {
  role: 'cache',
  fileName: 'model-catalog-cache.json',
  version: 1,
  dataSchema: modelCatalogCacheDataSchema,
  migrations: [],
  defaultData: () => ({ fetchedAt: null, source: 'none', models: [] }),
};

/** Per-account usage/limits snapshot. Role is deliberately `'state'`, NOT
 *  `'cache'` — the design doc (§4.1) classifies "Limits / usage ledgers" as
 *  state ("should survive; loss = degraded history, not breakage"), despite
 *  this task's informal "limits-cache" name. Honoring the layer table's role
 *  classification over the literal name, per task instruction. */
export interface LimitsCacheAccountEntry {
  readonly accountId: string;
  readonly planTier?: string;
  readonly usedUnits?: number;
  readonly limitUnits?: number;
  readonly windowResetAt?: string;
  readonly lastUpdatedAt: string;
}

export interface LimitsCacheData {
  readonly accounts: Readonly<Record<string, LimitsCacheAccountEntry>>;
}

const limitsCacheAccountEntrySchema = z
  .object({
    accountId: z.string().min(1),
    planTier: z.string().optional(),
    usedUnits: z.number().optional(),
    limitUnits: z.number().optional(),
    windowResetAt: z.string().optional(),
    lastUpdatedAt: z.string(),
  })
  .strict();

const limitsCacheDataSchema: ZodType<LimitsCacheData> = z
  .object({ accounts: z.record(limitsCacheAccountEntrySchema) })
  .strict();

export const LIMITS_CACHE_DEFINITION: GlobalStoreDefinition<LimitsCacheData> = {
  role: 'state',
  fileName: 'limits-cache.json',
  version: 1,
  dataSchema: limitsCacheDataSchema,
  migrations: [],
  defaultData: () => ({ accounts: {} }),
};
