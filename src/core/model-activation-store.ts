// ═══ Model Activation Store (MODEL-ACTIVATION-001) ═══════════════════════════
//
// `model-auto-detect.ts` discovers which models a provider ACTUALLY offers for a
// given auth mode and registers every one of them. There was no notion of
// ACTIVATION, so a detected model was automatically eligible — measured
// 2026-08-09 on a codex session: `o3`, `gpt-5.5`, `gpt-4.1`, `o4-mini`,
// `gpt-5-mini`, `gpt-4.1-mini` sat beside the `gpt-5.6` family, and the AI
// planner assigned `gpt-5-mini` to the first dogfood run's economy task.
//
// This store is the owner's answer to "which of the detected models may actually
// be used". It is deliberately a SEPARATE, purpose-built database
// (`.deckent/models.db`, owner's choice) rather than config text: model/provider
// management is a first-class product surface for the end user (dual-lens law),
// and the same store governs our own dogfood runs.
//
// Default-preserving by construction: a model with NO record is ACTIVE. Adding
// the store therefore changes nothing until the owner deactivates something —
// no silent behaviour change on upgrade.
//
// ADR-D-005: better-sqlite3 is already an admitted dependency (memory-store,
// provider-execution-observation-store). ADR-G-036: model ids are DATA here —
// this module never names one.

import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Schema version of `.deckent/models.db`.
 *   v1 → `model_activation` only (deactivation list).
 *   v2 → adds `provider_policy` (OWNER-MODEL-POLICY-001): a provider may switch
 *        from the default `implicit-active` mode (a detected model is eligible
 *        unless explicitly deactivated) to `explicit-active` (ONLY the owner's
 *        active records are executable; a newly detected/catalog model can never
 *        auto-enter the pool). v1 stores migrate forward in place — no data loss,
 *        no behaviour change until the owner records a policy.
 */
export const MODEL_ACTIVATION_STORE_SCHEMA_VERSION = 2;

/**
 * Provider-scoped activation policy mode (OWNER-MODEL-POLICY-001).
 * - `implicit-active` (default, byte-compatible): a model with no record is
 *   eligible; only an explicit `active=false` record removes it.
 * - `explicit-active`: ONLY models with an `active=true` record are eligible;
 *   every other detected/catalog model — present or future — is inert in the
 *   execution pool, planning, routing, forceModel and dispatch surfaces.
 */
export type ProviderPolicyMode = 'implicit-active' | 'explicit-active';

export const PROVIDER_POLICY_MODES: readonly ProviderPolicyMode[] = [
  'implicit-active',
  'explicit-active',
] as const;

/** The default mode for any provider without a recorded policy. */
export const DEFAULT_PROVIDER_POLICY_MODE: ProviderPolicyMode = 'implicit-active';

function isProviderPolicyMode(value: unknown): value is ProviderPolicyMode {
  return value === 'implicit-active' || value === 'explicit-active';
}

export class ModelActivationStoreError extends Error {
  readonly code: 'SCHEMA_MISMATCH' | 'INVALID_INPUT';
  constructor(code: ModelActivationStoreError['code'], message: string) {
    super(message);
    this.name = 'ModelActivationStoreError';
    this.code = code;
  }
}

/** One owner decision about a detected model. */
export interface ModelActivationRecord {
  readonly provider: string;
  readonly modelId: string;
  readonly active: boolean;
  readonly updatedAt: string;
  /** Who made the call — an operator id, or a subsystem name. */
  readonly actor: string;
}

/** One owner decision about a provider's activation policy mode. */
export interface ProviderPolicyRecord {
  readonly provider: string;
  readonly mode: ProviderPolicyMode;
  readonly updatedAt: string;
  /** Who made the call — an operator id, or a subsystem name. */
  readonly actor: string;
}

export interface ModelActivationStoreOptions {
  /** Override the database location (tests). */
  readonly dbPath?: string;
  /** Open without creating: a missing file yields an empty, read-only view. */
  readonly readOnly?: boolean;
  /** Re-throw policy-table read errors at a final execution boundary. */
  readonly strictRead?: boolean;
  /** Clock override for deterministic tests. */
  readonly now?: () => string;
}

function assertNonEmpty(value: string, field: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new ModelActivationStoreError('INVALID_INPUT', `${field} must be a non-empty string`);
  }
  return trimmed;
}

export class ModelActivationStore {
  private readonly db: Database.Database;
  private readonly now: () => string;
  private readonly strictRead: boolean;
  private readonly openedSchemaVersion: number;

  constructor(projectRoot: string, options: ModelActivationStoreOptions = {}) {
    this.now = options.now ?? ((): string => new Date().toISOString());
    this.strictRead = options.strictRead === true;
    const dbPath = options.dbPath ?? join(projectRoot, '.deckent', 'models.db');
    if (!options.readOnly) mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath, options.readOnly
      ? { readonly: true, fileMustExist: true }
      : undefined);
    if (!options.readOnly) {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = FULL');
    }
    const version = this.db.pragma('user_version', { simple: true }) as number;
    this.openedSchemaVersion = version;
    // Forward-incompatible ONLY: a store written by a newer deckent than we
    // understand must never be silently downgraded. Any version at-or-below the
    // current one is migrated in place (read-write) or tolerated (read-only) —
    // a v1 store keeps its `model_activation` rows and simply gains
    // `provider_policy` on the next read-write open.
    if (version > MODEL_ACTIVATION_STORE_SCHEMA_VERSION) {
      this.db.close();
      throw new ModelActivationStoreError(
        'SCHEMA_MISMATCH',
        `Unsupported model activation store schema: ${version}`,
      );
    }
    if (options.readOnly) return;
    // Idempotent create — covers a fresh store (user_version 0) and forward
    // migration of a v1 store (adds provider_policy; model_activation untouched).
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS model_activation (
        provider TEXT NOT NULL,
        model_id TEXT NOT NULL,
        active INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        actor TEXT NOT NULL,
        PRIMARY KEY (provider, model_id)
      );
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_policy (
        provider TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        actor TEXT NOT NULL
      );
    `);
    this.db.pragma(`user_version = ${MODEL_ACTIVATION_STORE_SCHEMA_VERSION}`);
  }

  /** Record an owner decision. Idempotent per (provider, modelId). */
  setActivation(provider: string, modelId: string, active: boolean, actor = 'owner'): void {
    const p = assertNonEmpty(provider, 'provider');
    const m = assertNonEmpty(modelId, 'modelId');
    this.db.prepare(`
      INSERT INTO model_activation (provider, model_id, active, updated_at, actor)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (provider, model_id) DO UPDATE SET
        active = excluded.active,
        updated_at = excluded.updated_at,
        actor = excluded.actor
    `).run(p, m, active ? 1 : 0, this.now(), assertNonEmpty(actor, 'actor'));
  }

  /**
   * Is this model eligible? **A model with no record is ACTIVE** — the store is
   * an opt-in denial list, so installing it never silently narrows an existing
   * project's pool.
   */
  isActive(provider: string, modelId: string): boolean {
    const row = this.db.prepare(
      'SELECT active FROM model_activation WHERE provider = ? AND model_id = ?',
    ).get(provider, modelId) as { active: number } | undefined;
    return row === undefined ? true : row.active === 1;
  }

  /** Every recorded decision, ordered for stable display. */
  list(): ModelActivationRecord[] {
    const rows = this.db.prepare(`
      SELECT provider, model_id, active, updated_at, actor
      FROM model_activation
      ORDER BY provider, model_id
    `).all() as Array<{
      provider: string; model_id: string; active: number; updated_at: string; actor: string;
    }>;
    if (this.strictRead && rows.some((row) =>
      typeof row.provider !== 'string' || row.provider.trim().length === 0
      || typeof row.model_id !== 'string' || row.model_id.trim().length === 0
      || (row.active !== 0 && row.active !== 1))) {
      throw new ModelActivationStoreError(
        'INVALID_INPUT',
        'Invalid model activation row in owner authority store',
      );
    }
    return rows.map((r) => ({
      provider: r.provider,
      modelId: r.model_id,
      active: r.active === 1,
      updatedAt: r.updated_at,
      actor: r.actor,
    }));
  }

  /** Drop a decision, restoring the default (active). */
  clearActivation(provider: string, modelId: string): boolean {
    const info = this.db.prepare(
      'DELETE FROM model_activation WHERE provider = ? AND model_id = ?',
    ).run(provider, modelId);
    return info.changes > 0;
  }

  /**
   * Record the owner's activation policy MODE for a provider
   * (OWNER-MODEL-POLICY-001). Idempotent per provider. Recording
   * `implicit-active` explicitly is allowed — it makes the owner decision
   * auditable and behaves identically to having no row.
   */
  setProviderPolicy(provider: string, mode: ProviderPolicyMode, actor = 'owner'): void {
    const p = assertNonEmpty(provider, 'provider');
    if (!isProviderPolicyMode(mode)) {
      throw new ModelActivationStoreError(
        'INVALID_INPUT',
        `mode must be one of ${PROVIDER_POLICY_MODES.join(', ')}`,
      );
    }
    this.db.prepare(`
      INSERT INTO provider_policy (provider, mode, updated_at, actor)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (provider) DO UPDATE SET
        mode = excluded.mode,
        updated_at = excluded.updated_at,
        actor = excluded.actor
    `).run(p, mode, this.now(), assertNonEmpty(actor, 'actor'));
  }

  /** The recorded policy mode for a provider; the default when unrecorded. */
  getProviderPolicy(provider: string): ProviderPolicyMode {
    return this.readProviderPolicyRow(provider)?.mode ?? DEFAULT_PROVIDER_POLICY_MODE;
  }

  private readProviderPolicyRow(provider: string): { mode: ProviderPolicyMode } | undefined {
    // A v1 store (read-only, pre-migration) has no `provider_policy` table; a
    // missing table means "no policy recorded", NOT an error — fail-safe to the
    // default so activation reads never break on an old DB.
    let row: { mode: string } | undefined;
    try {
      row = this.db.prepare('SELECT mode FROM provider_policy WHERE provider = ?').get(provider) as
        { mode: string } | undefined;
    } catch (error) {
      if (this.strictRead && this.openedSchemaVersion >= 2) throw error;
      return undefined;
    }
    if (row === undefined) return undefined;
    return isProviderPolicyMode(row.mode) ? { mode: row.mode } : undefined;
  }

  /** Every recorded provider policy, ordered for stable display. */
  listProviderPolicies(): ProviderPolicyRecord[] {
    let rows: Array<{ provider: string; mode: string; updated_at: string; actor: string }> = [];
    try {
      rows = this.db.prepare(`
        SELECT provider, mode, updated_at, actor
        FROM provider_policy
        ORDER BY provider
      `).all() as typeof rows;
    } catch (error) {
      if (this.strictRead && this.openedSchemaVersion >= 2) throw error;
      return [];
    }
    if (this.strictRead && rows.some((row) =>
      typeof row.provider !== 'string' || row.provider.trim().length === 0
      || !isProviderPolicyMode(row.mode))) {
      throw new ModelActivationStoreError(
        'INVALID_INPUT',
        'Invalid provider policy row in owner authority store',
      );
    }
    return rows
      .filter((r) => isProviderPolicyMode(r.mode))
      .map((r) => ({
        provider: r.provider,
        mode: r.mode as ProviderPolicyMode,
        updatedAt: r.updated_at,
        actor: r.actor,
      }));
  }

  /**
   * Is this model EXECUTABLE under the owner's provider policy? This is the
   * hard-limit authority every selection/dispatch boundary consults:
   *   - explicit-active provider → true ONLY when an `active=true` record exists.
   *   - implicit-active provider → true unless an `active=false` record exists
   *     (identical to {@link isActive}; a model with no record stays eligible).
   */
  isExecutable(provider: string, modelId: string): boolean {
    if (this.getProviderPolicy(provider) === 'explicit-active') {
      const row = this.db.prepare(
        'SELECT active FROM model_activation WHERE provider = ? AND model_id = ?',
      ).get(provider, modelId) as { active: number } | undefined;
      return row !== undefined && row.active === 1;
    }
    return this.isActive(provider, modelId);
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Read the deactivated set without holding a connection open — the shape the
 * registration path wants. Fail-safe: an absent or unreadable store yields an
 * empty set, so model discovery NEVER breaks because of this feature.
 */
export function readInactiveModels(
  projectRoot: string,
  options: ModelActivationStoreOptions = {},
): ReadonlySet<string> {
  const inactive = new Set<string>();
  let store: ModelActivationStore | undefined;
  try {
    store = new ModelActivationStore(projectRoot, { ...options, readOnly: true });
    for (const record of store.list()) {
      if (!record.active) inactive.add(activationKey(record.provider, record.modelId));
    }
  } catch {
    // No store yet (the common case) or an unreadable one: nothing is deactivated.
  } finally {
    store?.close();
  }
  return inactive;
}

/**
 * An immutable, in-memory snapshot of the owner's model-activation decisions
 * (OWNER-MODEL-POLICY-001). Resolved ONCE from the store at provider bootstrap
 * and then consulted per-call by every selection/dispatch boundary — the
 * per-call cost is a Set lookup, never a SQLite hit. `snapshotDigest` is a
 * content hash of the whole decision set, bound to plan + dispatch evidence so a
 * run can prove exactly which active-set governed it.
 */
export interface ModelActivationPolicy {
  /** Executable under the owner's provider policy (the hard-limit authority). */
  isExecutable(provider: string, modelId: string): boolean;
  /** The mode governing a provider (default `implicit-active`). */
  providerMode(provider: string): ProviderPolicyMode;
  /** Providers the owner has switched to `explicit-active`. */
  readonly explicitProviders: ReadonlySet<string>;
  /** Every model with an `active=true` record, sorted for stability. */
  readonly activeModels: ReadonlyArray<{ readonly provider: string; readonly modelId: string }>;
  /** sha256 of the canonical decision set — stable across identical stores. */
  readonly snapshotDigest: string;
}

/** The fail-safe policy digest: nothing recorded → every provider implicit-active. */
const EMPTY_POLICY_DIGEST = createHash('sha256')
  .update('model-activation-policy v2 [] []')
  .digest('hex');

function buildPolicy(
  records: readonly ModelActivationRecord[],
  policies: readonly ProviderPolicyRecord[],
): ModelActivationPolicy {
  const explicitProviders = new Set<string>(
    policies.filter((p) => p.mode === 'explicit-active').map((p) => p.provider),
  );
  const activeKeys = new Set<string>();
  const deactivatedKeys = new Set<string>();
  const activeModels: Array<{ provider: string; modelId: string }> = [];
  for (const r of records) {
    if (r.active) {
      activeKeys.add(activationKey(r.provider, r.modelId));
      activeModels.push({ provider: r.provider, modelId: r.modelId });
    } else {
      deactivatedKeys.add(activationKey(r.provider, r.modelId));
    }
  }
  activeModels.sort((a, b) =>
    a.provider === b.provider ? a.modelId.localeCompare(b.modelId) : a.provider.localeCompare(b.provider));

  // Canonical, sort-stable serialization → identical stores hash identically.
  const canonicalActivations = records
    .map((r) => [r.provider, r.modelId, r.active ? 1 : 0] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1));
  const canonicalPolicies = policies
    .map((p) => [p.provider, p.mode] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const snapshotDigest = createHash('sha256')
    .update('model-activation-policy v2 ')
    .update(JSON.stringify(canonicalPolicies))
    .update(' ')
    .update(JSON.stringify(canonicalActivations))
    .digest('hex');

  return {
    explicitProviders,
    activeModels,
    snapshotDigest,
    providerMode(provider: string): ProviderPolicyMode {
      return explicitProviders.has(provider) ? 'explicit-active' : 'implicit-active';
    },
    isExecutable(provider: string, modelId: string): boolean {
      const key = activationKey(provider, modelId);
      if (explicitProviders.has(provider)) return activeKeys.has(key);
      return !deactivatedKeys.has(key);
    },
  };
}

/** The fail-safe, all-implicit-active policy (absent/unreadable store). */
export function emptyModelActivationPolicy(): ModelActivationPolicy {
  return {
    explicitProviders: new Set<string>(),
    activeModels: [],
    snapshotDigest: EMPTY_POLICY_DIGEST,
    providerMode: () => DEFAULT_PROVIDER_POLICY_MODE,
    isExecutable: () => true,
  };
}

/**
 * Resolve the owner's activation decisions into an immutable in-memory policy
 * WITHOUT holding a connection open. Fail-safe: an absent or unreadable store
 * yields {@link emptyModelActivationPolicy} (every model executable), so bootstrap
 * never breaks because of this feature — the exact same guarantee
 * {@link readInactiveModels} gives the discovery path.
 */
export function resolveActiveModelPolicy(
  projectRoot: string,
  options: ModelActivationStoreOptions = {},
): ModelActivationPolicy {
  let store: ModelActivationStore | undefined;
  try {
    store = new ModelActivationStore(projectRoot, { ...options, readOnly: true });
    return buildPolicy(store.list(), store.listProviderPolicies());
  } catch {
    return emptyModelActivationPolicy();
  } finally {
    store?.close();
  }
}

/**
 * Project-scoped final execution decision. Selection pools cache an immutable
 * activation snapshot at provider bootstrap, but a fresh CLI/MCP/native entry
 * must not become executable merely because that process has not bootstrapped
 * the process-wide registry yet. Every side-effecting ingress uses this helper
 * as the final, multi-project-safe store read; the returned digest lets callers
 * bind diagnostics to the exact owner decision set they enforced.
 */
export interface ProjectModelExecutionAuthority {
  readonly state: 'ready' | 'hold';
  readonly executable: boolean;
  readonly providerMode: ProviderPolicyMode;
  readonly snapshotDigest: string;
  readonly reasonCode: 'MODEL_ACTIVATION_AUTHORITY_UNAVAILABLE' | null;
}

const MODEL_ACTIVATION_AUTHORITY_UNAVAILABLE_DIGEST = createHash('sha256')
  .update('model-activation-execution-authority unavailable v1')
  .digest('hex');

export function resolveProjectModelExecutionAuthority(
  projectRoot: string,
  provider: string,
  modelId: string,
  options: ModelActivationStoreOptions = {},
): ProjectModelExecutionAuthority {
  const dbPath = options.dbPath ?? join(projectRoot, '.deckent', 'models.db');
  let store: ModelActivationStore | undefined;
  try {
    store = new ModelActivationStore(projectRoot, {
      ...options,
      dbPath,
      readOnly: true,
      strictRead: true,
    });
    const policy = buildPolicy(store.list(), store.listProviderPolicies());
    return {
      state: 'ready',
      executable: policy.isExecutable(provider, modelId),
      providerMode: policy.providerMode(provider),
      snapshotDigest: policy.snapshotDigest,
      reasonCode: null,
    };
  } catch {
    // A truly absent store is the documented implicit-active default. Inspect
    // after the failed open so a concurrent create never slips through an
    // exists-then-open race; every non-ENOENT state is a fail-closed HOLD.
    try {
      statSync(dbPath);
    } catch (presenceError) {
      if ((presenceError as NodeJS.ErrnoException).code === 'ENOENT') {
        const policy = emptyModelActivationPolicy();
        return {
          state: 'ready',
          executable: policy.isExecutable(provider, modelId),
          providerMode: policy.providerMode(provider),
          snapshotDigest: policy.snapshotDigest,
          reasonCode: null,
        };
      }
    }
    return {
      state: 'hold',
      executable: false,
      providerMode: DEFAULT_PROVIDER_POLICY_MODE,
      snapshotDigest: MODEL_ACTIVATION_AUTHORITY_UNAVAILABLE_DIGEST,
      reasonCode: 'MODEL_ACTIVATION_AUTHORITY_UNAVAILABLE',
    };
  } finally {
    store?.close();
  }
}

/** Stable composite key for the (provider, modelId) pair. */
export function activationKey(provider: string, modelId: string): string {
  return `${provider}\u0000${modelId}`;
}
