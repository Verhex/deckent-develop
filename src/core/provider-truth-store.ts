import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join, posix, win32 } from 'node:path';

import Database from 'better-sqlite3';

import {
  resolveGlobalScopePaths,
  type GlobalScopeEnv,
  type GlobalScopePlatform,
} from './global-scope-resolver.js';
import {
  createProviderIntegrityAuthority,
  ProviderAuthorityKeyringError,
  type ProviderAuthorityMac,
  type ProviderIntegrityAuthority,
} from './provider-authority-keyring.js';
import type { InvocationScope } from './invocation-receipt.js';
import {
  assertCapabilityCatalog,
  assertReachabilityResult,
  materializeCapabilityCatalog,
  materializeReachability,
  type CapabilityCatalog,
  type ReachabilityResult,
} from './provider-truth.js';

export interface ProviderTruthStoreOptions {
  /** Canonical project id shared with InvocationReceiptStore. This store never mints a second identity. */
  readonly projectId: string;
  /** Host-private authority key. It must never be mounted into an untrusted worker. */
  /** Production authority. Raw root-key support remains for compatibility/tests. */
  readonly integrityAuthority?: ProviderIntegrityAuthority;
  readonly integrityKey?: string | Buffer;
  readonly dbPath?: string;
  readonly now?: () => Date;
}

export const PROVIDER_TRUTH_STORE_SCHEMA_VERSION = 3;

const LEGACY_INTEGRITY_SENTINEL_INPUT = 'deckent-provider-truth-store:v2';
const INTEGRITY_SENTINEL_INPUT = 'deckent-provider-truth-store:v3';
const ROW_INTEGRITY_VERSION = 2;

const EXACT_REACHABILITY_SCOPE_INDEX_SQL = `
  CREATE INDEX idx_reachability_exact_scope
    ON reachability_results (
      tenant_id, project_id, provider, model, auth_mode, account_ref_hash,
      transport, execution_backend, endpoint_ref_hash, runtime_fingerprint,
      execution_profile_ref, capability, completed_at
    )
`;

const IMMUTABLE_TRIGGER_SQL = {
  capability_catalogs_no_update: `
    CREATE TRIGGER capability_catalogs_no_update
      BEFORE UPDATE ON capability_catalogs BEGIN
        SELECT RAISE(ABORT, 'capability catalogs are immutable');
      END
  `,
  capability_catalogs_no_delete: `
    CREATE TRIGGER capability_catalogs_no_delete
      BEFORE DELETE ON capability_catalogs BEGIN
        SELECT RAISE(ABORT, 'capability catalogs are immutable');
      END
  `,
  reachability_results_no_update: `
    CREATE TRIGGER reachability_results_no_update
      BEFORE UPDATE ON reachability_results BEGIN
        SELECT RAISE(ABORT, 'reachability results are immutable');
      END
  `,
  reachability_results_no_delete: `
    CREATE TRIGGER reachability_results_no_delete
      BEFORE DELETE ON reachability_results BEGIN
        SELECT RAISE(ABORT, 'reachability results are immutable');
      END
  `,
  capability_catalogs_active_key_insert: `
    CREATE TRIGGER capability_catalogs_active_key_insert
      BEFORE INSERT ON capability_catalogs
      WHEN NEW.integrity_version != 2 OR NEW.integrity_key_id != (
        SELECT active_key_id FROM provider_truth_authority WHERE singleton_id = 1
      ) BEGIN
        SELECT RAISE(ABORT, 'provider truth active authority is immutable');
      END
  `,
  reachability_results_active_key_insert: `
    CREATE TRIGGER reachability_results_active_key_insert
      BEFORE INSERT ON reachability_results
      WHEN NEW.integrity_version != 2 OR NEW.integrity_key_id != (
        SELECT active_key_id FROM provider_truth_authority WHERE singleton_id = 1
      ) BEGIN
        SELECT RAISE(ABORT, 'provider truth active authority is immutable');
      END
  `,
} as const;

export function resolveProviderTruthStorePath(
  platform: GlobalScopePlatform,
  env: GlobalScopeEnv,
): string {
  const scope = resolveGlobalScopePaths(platform, env);
  const pathApi = platform === 'win32' ? win32 : posix;
  return pathApi.join(scope.stateDir, 'provider-truth.db');
}

interface PayloadRow {
  readonly payload_json: string;
  readonly payload_hash: string;
  readonly integrity_key_id: string;
  readonly integrity_version: number;
}

interface CatalogRow extends PayloadRow {
  readonly catalog_id: string;
  readonly tenant_id: string;
  readonly project_id: string;
  readonly idempotency_key: string;
  readonly fetched_at: string;
}

interface ReachabilityRow extends PayloadRow {
  readonly reachability_id: string;
  readonly tenant_id: string;
  readonly project_id: string;
  readonly idempotency_key: string;
  readonly provider: string;
  readonly model: string;
  readonly auth_mode: string;
  readonly account_ref_hash: string | null;
  readonly transport: string;
  readonly execution_backend: string;
  readonly endpoint_ref_hash: string | null;
  readonly runtime_fingerprint: string | null;
  readonly execution_profile_ref: string;
  readonly capability: string;
  readonly completed_at: string;
}

export interface ProviderTruthWriteResult {
  readonly evidenceRef: string;
  readonly created: boolean;
}

export interface ExactReachabilityQuery extends InvocationScope {
  readonly provider: string;
  readonly model: string;
  readonly authMode: ReachabilityResult['auth']['mode'];
  readonly accountRefHash: string | null;
  readonly transport: ReachabilityResult['backend']['transport'];
  readonly executionBackend: ReachabilityResult['backend']['executionBackend'];
  readonly endpointRefHash: string | null;
  readonly runtimeFingerprint: string | null;
  readonly executionProfileRef: string;
  readonly capability: ReachabilityResult['probe']['capability'];
}

export class ProviderTruthStoreError extends Error {
  constructor(
    readonly code:
      | 'SCOPE_MISMATCH'
      | 'IDEMPOTENCY_CONFLICT'
      | 'INTEGRITY_FAILURE'
      | 'MIGRATION_REQUIRED'
      | 'INTEGRITY_KEY_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderTruthStoreError';
  }
}

function sqlLiteral(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(value)) {
    throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Legacy provider truth key id is invalid');
  }
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Explicit, owner-run v2→v3 migration. Immutable evidence bytes are preserved;
 * the supplied legacy key must first be imported as a retired truth key in the
 * host Provider Authority Keyring.
 */
export function migrateProviderTruthStoreV2ToV3(input: {
  readonly dbPath: string;
  readonly legacyKeyId: string;
  readonly legacyIntegrityKey: string | Buffer;
}): void {
  const legacyKey = Buffer.isBuffer(input.legacyIntegrityKey)
    ? Buffer.from(input.legacyIntegrityKey)
    : Buffer.from(input.legacyIntegrityKey, 'utf8');
  if (legacyKey.byteLength < 32) {
    throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Legacy provider truth key is too short');
  }
  const db = new Database(input.dbPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    const migrate = db.transaction(() => {
      const version = db.pragma('user_version', { simple: true }) as number;
      if (version !== 2) {
        throw new ProviderTruthStoreError('MIGRATION_REQUIRED', 'Provider truth migration requires exact schema v2');
      }
      const authority = db.prepare(`
        SELECT integrity_check FROM provider_truth_authority WHERE singleton_id = 1
      `).get() as { integrity_check: string } | undefined;
      const expected = createHmac('sha256', legacyKey).update(LEGACY_INTEGRITY_SENTINEL_INPUT).digest('hex');
      if (!authority || authority.integrity_check !== expected) {
        throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Legacy provider truth authority mismatch');
      }
      for (const table of ['capability_catalogs', 'reachability_results'] as const) {
        const rows = db.prepare(`SELECT payload_json, payload_hash FROM ${table}`).all() as Array<{
          payload_json: string;
          payload_hash: string;
        }>;
        if (rows.some(row => createHmac('sha256', legacyKey).update(row.payload_json).digest('hex')
          !== row.payload_hash)) {
          throw new ProviderTruthStoreError(
            'INTEGRITY_FAILURE',
            'Legacy provider truth evidence failed integrity verification',
          );
        }
      }
      const keyLiteral = sqlLiteral(input.legacyKeyId);
      db.exec(`
        ALTER TABLE provider_truth_authority
          ADD COLUMN active_key_id TEXT NOT NULL DEFAULT ${keyLiteral};
        ALTER TABLE provider_truth_authority
          ADD COLUMN integrity_version INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE provider_truth_authority
          ADD COLUMN authority_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE capability_catalogs
          ADD COLUMN integrity_key_id TEXT NOT NULL DEFAULT ${keyLiteral};
        ALTER TABLE capability_catalogs
          ADD COLUMN integrity_version INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE reachability_results
          ADD COLUMN integrity_key_id TEXT NOT NULL DEFAULT ${keyLiteral};
        ALTER TABLE reachability_results
          ADD COLUMN integrity_version INTEGER NOT NULL DEFAULT 1;
        CREATE TRIGGER capability_catalogs_active_key_insert
          BEFORE INSERT ON capability_catalogs
          WHEN NEW.integrity_version != 2 OR NEW.integrity_key_id != (
            SELECT active_key_id FROM provider_truth_authority WHERE singleton_id = 1
          ) BEGIN
            SELECT RAISE(ABORT, 'provider truth active authority is immutable');
          END;
        CREATE TRIGGER reachability_results_active_key_insert
          BEFORE INSERT ON reachability_results
          WHEN NEW.integrity_version != 2 OR NEW.integrity_key_id != (
            SELECT active_key_id FROM provider_truth_authority WHERE singleton_id = 1
          ) BEGIN
            SELECT RAISE(ABORT, 'provider truth active authority is immutable');
          END;
      `);
      db.pragma(`user_version = ${PROVIDER_TRUTH_STORE_SCHEMA_VERSION}`);
    });
    migrate.immediate();
  } finally {
    db.close();
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function normalizeSchemaSql(sql: string | null | undefined): string {
  return (sql ?? '').trim().replace(/;$/u, '').replace(/\s+/gu, ' ').toLowerCase();
}

function nullableEqualSql(column: string): string {
  return `((${column} IS NULL AND @${column} IS NULL) OR ${column} = @${column})`;
}

function requireIdentity(name: string, value: string): void {
  if (!value || value !== value.trim()) throw new ProviderTruthStoreError('SCOPE_MISMATCH', `${name} is required`);
}

export class ProviderTruthStore {
  readonly projectId: string;
  private readonly db: Database.Database;
  private readonly now: () => Date;
  private readonly integrityAuthority: ProviderIntegrityAuthority;

  constructor(globalStateDir: string, options: ProviderTruthStoreOptions) {
    if (!options || (!options.integrityAuthority
      && typeof options.integrityKey !== 'string' && !Buffer.isBuffer(options.integrityKey))
      || (options.integrityAuthority !== undefined && options.integrityKey !== undefined)) {
      throw new ProviderTruthStoreError(
        'INTEGRITY_FAILURE',
        'Provider truth store requires a host integrity authority',
      );
    }
    requireIdentity('projectId', options.projectId);
    this.integrityAuthority = options.integrityAuthority
      ?? createProviderIntegrityAuthority(options.integrityKey!);
    const dbPath = options.dbPath ?? join(globalStateDir, 'provider-truth.db');
    mkdirSync(dirname(dbPath), { recursive: true });
    this.now = options.now ?? (() => new Date());
    this.projectId = options.projectId;
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('synchronous = FULL');
    try {
      const schemaVersion = this.db.pragma('user_version', { simple: true }) as number;
      if (schemaVersion > PROVIDER_TRUTH_STORE_SCHEMA_VERSION) {
        throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Provider truth schema is newer than this runtime');
      }
      const existingTables = this.db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name IN (
          'provider_truth_authority', 'capability_catalogs', 'reachability_results'
        )
      `).all() as Array<{ name: string }>;
      if (existingTables.length > 0) {
        if (schemaVersion !== PROVIDER_TRUTH_STORE_SCHEMA_VERSION) {
          throw new ProviderTruthStoreError(
            'MIGRATION_REQUIRED',
            'Provider truth schema requires an explicit authority migration',
          );
        }
        this.assertSchema();
      } else {
        if (schemaVersion !== 0) {
          throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Provider truth schema is incomplete');
        }
        this.initSchema();
        this.db.pragma(`user_version = ${PROVIDER_TRUTH_STORE_SCHEMA_VERSION}`);
        this.assertSchema();
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE provider_truth_authority (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        integrity_check TEXT NOT NULL,
        active_key_id TEXT NOT NULL,
        integrity_version INTEGER NOT NULL,
        authority_revision INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS capability_catalogs (
        catalog_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        integrity_key_id TEXT NOT NULL,
        integrity_version INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, project_id, catalog_id),
        UNIQUE (tenant_id, project_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS reachability_results (
        inserted_seq INTEGER PRIMARY KEY AUTOINCREMENT,
        reachability_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        auth_mode TEXT NOT NULL,
        account_ref_hash TEXT,
        transport TEXT NOT NULL,
        execution_backend TEXT NOT NULL,
        endpoint_ref_hash TEXT,
        runtime_fingerprint TEXT,
        execution_profile_ref TEXT NOT NULL,
        capability TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        integrity_key_id TEXT NOT NULL,
        integrity_version INTEGER NOT NULL,
        UNIQUE (tenant_id, project_id, reachability_id),
        UNIQUE (tenant_id, project_id, idempotency_key)
      );
    `);
    this.db.exec(EXACT_REACHABILITY_SCOPE_INDEX_SQL);
    for (const triggerSql of Object.values(IMMUTABLE_TRIGGER_SQL)) this.db.exec(triggerSql);
    const sentinel = this.signIntegrity('authority', INTEGRITY_SENTINEL_INPUT);
    this.db.prepare(`
      INSERT INTO provider_truth_authority (
        singleton_id, integrity_check, active_key_id, integrity_version, authority_revision
      ) VALUES (1, ?, ?, ?, ?)
    `).run(
      sentinel.mac,
      sentinel.keyId,
      ROW_INTEGRITY_VERSION,
      sentinel.authorityRevision,
    );
  }

  private assertSchema(): void {
    const requiredColumns: Readonly<Record<string, readonly string[]>> = {
      provider_truth_authority: [
        'singleton_id', 'integrity_check', 'active_key_id', 'integrity_version', 'authority_revision',
      ],
      capability_catalogs: [
        'catalog_id', 'tenant_id', 'project_id', 'idempotency_key', 'fetched_at',
        'payload_json', 'payload_hash', 'integrity_key_id', 'integrity_version',
      ],
      reachability_results: [
        'inserted_seq', 'reachability_id', 'tenant_id', 'project_id', 'idempotency_key',
        'provider', 'model', 'auth_mode', 'account_ref_hash', 'transport',
        'execution_backend', 'endpoint_ref_hash', 'runtime_fingerprint',
        'execution_profile_ref', 'capability', 'completed_at', 'payload_json', 'payload_hash',
        'integrity_key_id', 'integrity_version',
      ],
    };
    for (const [table, required] of Object.entries(requiredColumns)) {
      const columns = this.db.pragma(`table_info(${table})`) as Array<{ name: string }>;
      const names = columns.map(column => column.name);
      if (names.length !== required.length || names.some((column, index) => column !== required[index])) {
        throw new ProviderTruthStoreError(
          'INTEGRITY_FAILURE',
          'Provider truth schema migration is required before this runtime can write evidence',
        );
      }
    }

    const expectedUniqueIndexes: Readonly<Record<string, readonly (readonly string[])[]>> = {
      capability_catalogs: [
        ['tenant_id', 'project_id', 'catalog_id'],
        ['tenant_id', 'project_id', 'idempotency_key'],
      ],
      reachability_results: [
        ['tenant_id', 'project_id', 'reachability_id'],
        ['tenant_id', 'project_id', 'idempotency_key'],
      ],
    };
    for (const [table, expected] of Object.entries(expectedUniqueIndexes)) {
      const indexes = this.db.pragma(`index_list(${table})`) as Array<{ name: string; unique: number }>;
      const actual = indexes
        .filter(index => index.unique === 1)
        .map(index => (this.db.pragma(`index_info(${index.name})`) as Array<{ seqno: number; name: string }>)
          .sort((left, right) => left.seqno - right.seqno)
          .map(column => column.name)
          .join('\u0000'))
        .sort();
      const canonicalExpected = expected.map(columns => columns.join('\u0000')).sort();
      if (actual.length !== canonicalExpected.length
        || actual.some((columns, index) => columns !== canonicalExpected[index])) {
        throw new ProviderTruthStoreError(
          'INTEGRITY_FAILURE',
          'Provider truth scoped uniqueness constraints are invalid',
        );
      }
    }

    const index = this.db.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_reachability_exact_scope'
    `).get() as { sql: string | null } | undefined;
    if (normalizeSchemaSql(index?.sql) !== normalizeSchemaSql(EXACT_REACHABILITY_SCOPE_INDEX_SQL)) {
      throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Provider truth scope index is invalid');
    }

    const triggers = this.db.prepare(`
      SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger'
    `).all() as Array<{ name: string; tbl_name: string; sql: string | null }>;
    for (const [name, expectedSql] of Object.entries(IMMUTABLE_TRIGGER_SQL)) {
      const trigger = triggers.find(item => item.name === name);
      if (!trigger || normalizeSchemaSql(trigger.sql) !== normalizeSchemaSql(expectedSql)) {
        throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Provider truth immutable triggers are invalid');
      }
    }

    const authority = this.db.prepare(`
      SELECT integrity_check, active_key_id, integrity_version, authority_revision
      FROM provider_truth_authority WHERE singleton_id = 1
    `).get() as {
      integrity_check: string;
      active_key_id: string;
      integrity_version: number;
      authority_revision: number;
    } | undefined;
    let authorityVerified = false;
    try {
      authorityVerified = authority !== undefined && this.verifyIntegrity(
        'authority',
        authority.active_key_id,
        authority.integrity_version === 1 ? LEGACY_INTEGRITY_SENTINEL_INPUT : INTEGRITY_SENTINEL_INPUT,
        authority.integrity_check,
        authority.integrity_version,
      );
    } catch (error) {
      if (!(error instanceof ProviderTruthStoreError)
        || error.code !== 'INTEGRITY_KEY_UNAVAILABLE') throw error;
    }
    if (!authority || !authorityVerified) {
      throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Provider truth integrity authority mismatch');
    }
    const current = this.signIntegrity('authority', INTEGRITY_SENTINEL_INPUT);
    if (current.authorityRevision < authority.authority_revision
      || (current.authorityRevision === authority.authority_revision
        && authority.active_key_id !== current.keyId)) {
      throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Provider truth authority revision is stale');
    }
    if (authority.active_key_id !== current.keyId
      || authority.integrity_version !== ROW_INTEGRITY_VERSION
      || authority.authority_revision !== current.authorityRevision) {
      this.db.prepare(`
        UPDATE provider_truth_authority
        SET integrity_check = ?, active_key_id = ?, integrity_version = ?, authority_revision = ?
        WHERE singleton_id = 1
      `).run(current.mac, current.keyId, ROW_INTEGRITY_VERSION, current.authorityRevision);
    }
  }

  private assertScope(scope: InvocationScope): void {
    requireIdentity('tenantId', scope.tenantId);
    requireIdentity('projectId', scope.projectId);
    if (scope.projectId !== this.projectId) {
      throw new ProviderTruthStoreError('SCOPE_MISMATCH', 'Provider truth project scope mismatch');
    }
  }

  putCatalog(catalog: CapabilityCatalog): ProviderTruthWriteResult {
    this.assertScope(catalog);
    assertCapabilityCatalog(catalog);
    const payloadJson = canonicalJson(catalog);
    const transaction = this.db.transaction((): ProviderTruthWriteResult => {
      this.syncAuthorityForWrite();
      const signed = this.signIntegrity('catalog', payloadJson);
      const existing = this.db.prepare(`
        SELECT * FROM capability_catalogs
        WHERE tenant_id = ? AND project_id = ? AND idempotency_key = ?
      `).get(catalog.tenantId, catalog.projectId, catalog.idempotencyKey) as
        CatalogRow | undefined;
      if (existing) {
        this.verifyCatalogRow(existing);
        if (existing.catalog_id !== catalog.catalogId || existing.payload_json !== payloadJson) {
          throw new ProviderTruthStoreError('IDEMPOTENCY_CONFLICT', 'Catalog idempotency conflict');
        }
        return { evidenceRef: `capability-catalog:${catalog.catalogId}`, created: false };
      }
      this.db.prepare(`
        INSERT INTO capability_catalogs (
          catalog_id, tenant_id, project_id, idempotency_key, fetched_at, payload_json, payload_hash,
          integrity_key_id, integrity_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        catalog.catalogId, catalog.tenantId, catalog.projectId, catalog.idempotencyKey,
        catalog.source.fetchedAt, payloadJson, signed.mac, signed.keyId, ROW_INTEGRITY_VERSION,
      );
      return { evidenceRef: `capability-catalog:${catalog.catalogId}`, created: true };
    });
    return transaction.immediate();
  }

  putReachability(result: ReachabilityResult): ProviderTruthWriteResult {
    this.assertScope(result);
    if (result.state === 'stale') {
      throw new ProviderTruthStoreError('IDEMPOTENCY_CONFLICT', 'Stale projections cannot be persisted');
    }
    assertReachabilityResult(result);
    const payloadJson = canonicalJson(result);
    const transaction = this.db.transaction((): ProviderTruthWriteResult => {
      this.syncAuthorityForWrite();
      const signed = this.signIntegrity('reachability', payloadJson);
      const existing = this.db.prepare(`
        SELECT * FROM reachability_results
        WHERE tenant_id = ? AND project_id = ? AND idempotency_key = ?
      `).get(result.tenantId, result.projectId, result.idempotencyKey) as
        ReachabilityRow | undefined;
      if (existing) {
        this.verifyReachabilityRow(existing);
        if (existing.reachability_id !== result.reachabilityId || existing.payload_json !== payloadJson) {
          throw new ProviderTruthStoreError('IDEMPOTENCY_CONFLICT', 'Reachability idempotency conflict');
        }
        return { evidenceRef: `provider-reachability:${result.reachabilityId}`, created: false };
      }
      this.db.prepare(`
        INSERT INTO reachability_results (
          reachability_id, tenant_id, project_id, idempotency_key, provider, model,
          auth_mode, account_ref_hash, transport, execution_backend, endpoint_ref_hash,
          runtime_fingerprint, execution_profile_ref, capability, completed_at, payload_json, payload_hash,
          integrity_key_id, integrity_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        result.reachabilityId, result.tenantId, result.projectId, result.idempotencyKey,
        result.provider, result.model, result.auth.mode, result.auth.accountRefHash,
        result.backend.transport, result.backend.executionBackend, result.backend.endpointRefHash,
        result.backend.runtimeFingerprint, result.backend.executionProfileRef,
        result.probe.capability, result.probe.completedAt,
        payloadJson, signed.mac, signed.keyId, ROW_INTEGRITY_VERSION,
      );
      return { evidenceRef: `provider-reachability:${result.reachabilityId}`, created: true };
    });
    return transaction.immediate();
  }

  getReachability(
    scope: InvocationScope,
    reachabilityId: string,
    at = this.now(),
  ): ReachabilityResult | null {
    this.assertScope(scope);
    const row = this.db.prepare(`
      SELECT * FROM reachability_results
      WHERE tenant_id = ? AND project_id = ? AND reachability_id = ?
    `).get(scope.tenantId, scope.projectId, reachabilityId) as ReachabilityRow | undefined;
    if (!row) return null;
    return materializeReachability(this.verifyReachabilityRow(row), at);
  }

  getCatalog(scope: InvocationScope, catalogId: string, at = this.now()): CapabilityCatalog | null {
    this.assertScope(scope);
    const row = this.db.prepare(`
      SELECT * FROM capability_catalogs
      WHERE tenant_id = ? AND project_id = ? AND catalog_id = ?
    `).get(scope.tenantId, scope.projectId, catalogId) as CatalogRow | undefined;
    if (!row) return null;
    return materializeCapabilityCatalog(this.verifyCatalogRow(row), at);
  }

  getLatestReachability(query: ExactReachabilityQuery, at = this.now()): ReachabilityResult | null {
    this.assertScope(query);
    const row = this.db.prepare(`
      SELECT * FROM reachability_results
      WHERE tenant_id = @tenant_id AND project_id = @project_id
        AND provider = @provider AND model = @model AND auth_mode = @auth_mode
        AND ${nullableEqualSql('account_ref_hash')}
        AND transport = @transport AND execution_backend = @execution_backend
        AND ${nullableEqualSql('endpoint_ref_hash')}
        AND ${nullableEqualSql('runtime_fingerprint')}
        AND execution_profile_ref = @execution_profile_ref
        AND capability = @capability
      ORDER BY completed_at DESC, inserted_seq DESC LIMIT 1
    `).get({
      tenant_id: query.tenantId,
      project_id: query.projectId,
      provider: query.provider,
      model: query.model,
      auth_mode: query.authMode,
      account_ref_hash: query.accountRefHash,
      transport: query.transport,
      execution_backend: query.executionBackend,
      endpoint_ref_hash: query.endpointRefHash,
      runtime_fingerprint: query.runtimeFingerprint,
      execution_profile_ref: query.executionProfileRef,
      capability: query.capability,
    }) as ReachabilityRow | undefined;
    if (!row) return null;
    return materializeReachability(this.verifyReachabilityRow(row), at);
  }

  /**
   * 7081 approval-carousel layer-2: account-agnostic freshness lookup for the
   * pre-approval reuse check. The evidence-preparation caller does not know
   * which account the probe would resolve to (that resolution lives inside
   * the producer's evidence sources), so its exact-scope query with
   * `accountRefHash: null` could NEVER match a row written with a real
   * account hash — the fresh row existed and the operator was still asked for
   * a new one-shot approval on every run. This variant matches every scope
   * dimension EXCEPT the account hash. It is a should-we-ask-for-approval
   * gate only: the producer's own reuse path re-validates under the full
   * exact scope (including the resolved account) before any evidence is used.
   */
  getLatestReachabilityAnyAccount(
    query: Omit<ExactReachabilityQuery, 'accountRefHash'>,
    at = this.now(),
  ): ReachabilityResult | null {
    this.assertScope(query);
    const row = this.db.prepare(`
      SELECT * FROM reachability_results
      WHERE tenant_id = @tenant_id AND project_id = @project_id
        AND provider = @provider AND model = @model AND auth_mode = @auth_mode
        AND transport = @transport AND execution_backend = @execution_backend
        AND ${nullableEqualSql('endpoint_ref_hash')}
        AND ${nullableEqualSql('runtime_fingerprint')}
        AND execution_profile_ref = @execution_profile_ref
        AND capability = @capability
      ORDER BY completed_at DESC, inserted_seq DESC LIMIT 1
    `).get({
      tenant_id: query.tenantId,
      project_id: query.projectId,
      provider: query.provider,
      model: query.model,
      auth_mode: query.authMode,
      transport: query.transport,
      execution_backend: query.executionBackend,
      endpoint_ref_hash: query.endpointRefHash,
      runtime_fingerprint: query.runtimeFingerprint,
      execution_profile_ref: query.executionProfileRef,
      capability: query.capability,
    }) as ReachabilityRow | undefined;
    if (!row) return null;
    return materializeReachability(this.verifyReachabilityRow(row), at);
  }

  private verifyReachabilityRow(row: ReachabilityRow): ReachabilityResult {
    if (!this.verifyIntegrity(
      'reachability', row.integrity_key_id, row.payload_json, row.payload_hash, row.integrity_version,
    )) {
      throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Reachability evidence hash mismatch');
    }
    const result = JSON.parse(row.payload_json) as ReachabilityResult;
    assertReachabilityResult(result);
    const matchesEnvelope = row.reachability_id === result.reachabilityId
      && row.tenant_id === result.tenantId
      && row.project_id === result.projectId
      && row.idempotency_key === result.idempotencyKey
      && row.provider === result.provider
      && row.model === result.model
      && row.auth_mode === result.auth.mode
      && row.account_ref_hash === result.auth.accountRefHash
      && row.transport === result.backend.transport
      && row.execution_backend === result.backend.executionBackend
      && row.endpoint_ref_hash === result.backend.endpointRefHash
      && row.runtime_fingerprint === result.backend.runtimeFingerprint
      && row.execution_profile_ref === result.backend.executionProfileRef
      && row.capability === result.probe.capability
      && row.completed_at === result.probe.completedAt;
    if (!matchesEnvelope) {
      throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Reachability evidence envelope mismatch');
    }
    return result;
  }

  private verifyCatalogRow(row: CatalogRow): CapabilityCatalog {
    if (!this.verifyIntegrity(
      'catalog', row.integrity_key_id, row.payload_json, row.payload_hash, row.integrity_version,
    )) {
      throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Capability catalog evidence hash mismatch');
    }
    const catalog = JSON.parse(row.payload_json) as CapabilityCatalog;
    assertCapabilityCatalog(catalog);
    if (row.catalog_id !== catalog.catalogId
      || row.tenant_id !== catalog.tenantId
      || row.project_id !== catalog.projectId
      || row.idempotency_key !== catalog.idempotencyKey
      || row.fetched_at !== catalog.source.fetchedAt) {
      throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Capability catalog evidence envelope mismatch');
    }
    return catalog;
  }

  close(): void {
    this.db.close();
  }

  private signIntegrity(kind: string, value: string): ProviderAuthorityMac {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const selected = this.integrityAuthority.sign('truth', value);
      const envelope = canonicalJson({
        domain: 'provider-truth',
        integrityVersion: ROW_INTEGRITY_VERSION,
        keyId: selected.keyId,
        kind,
        value,
      });
      const signed = this.integrityAuthority.sign('truth', envelope);
      if (signed.keyId === selected.keyId
        && signed.authorityRevision === selected.authorityRevision) return signed;
    }
    throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Provider truth authority rotated during signing');
  }

  private syncAuthorityForWrite(): void {
    const authority = this.db.prepare(`
      SELECT integrity_check, active_key_id, integrity_version, authority_revision
      FROM provider_truth_authority WHERE singleton_id = 1
    `).get() as {
      integrity_check: string;
      active_key_id: string;
      integrity_version: number;
      authority_revision: number;
    } | undefined;
    if (!authority || !this.verifyIntegrity(
      'authority',
      authority.active_key_id,
      authority.integrity_version === 1 ? LEGACY_INTEGRITY_SENTINEL_INPUT : INTEGRITY_SENTINEL_INPUT,
      authority.integrity_check,
      authority.integrity_version,
    )) {
      throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Provider truth integrity authority mismatch');
    }
    const current = this.signIntegrity('authority', INTEGRITY_SENTINEL_INPUT);
    if (current.authorityRevision < authority.authority_revision
      || (current.authorityRevision === authority.authority_revision
        && authority.active_key_id !== current.keyId)) {
      throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Provider truth authority revision is stale');
    }
    if (authority.active_key_id !== current.keyId
      || authority.integrity_version !== ROW_INTEGRITY_VERSION
      || authority.authority_revision !== current.authorityRevision) {
      this.db.prepare(`
        UPDATE provider_truth_authority
        SET integrity_check = ?, active_key_id = ?, integrity_version = ?, authority_revision = ?
        WHERE singleton_id = 1
      `).run(current.mac, current.keyId, ROW_INTEGRITY_VERSION, current.authorityRevision);
    }
  }

  private verifyIntegrity(
    kind: string,
    keyId: string,
    value: string,
    mac: string,
    version: number,
  ): boolean {
    try {
      const signedValue = version === 1
        ? value
        : canonicalJson({
          domain: 'provider-truth',
          integrityVersion: ROW_INTEGRITY_VERSION,
          keyId,
          kind,
          value,
        });
      return this.integrityAuthority.verify('truth', keyId, signedValue, mac);
    } catch (error) {
      if (error instanceof ProviderAuthorityKeyringError && error.code === 'KEYRING_UNKNOWN_KEY_ID') {
        throw new ProviderTruthStoreError(
          'INTEGRITY_KEY_UNAVAILABLE',
          'Provider truth evidence references an unavailable authority key',
        );
      }
      throw error;
    }
  }
}
