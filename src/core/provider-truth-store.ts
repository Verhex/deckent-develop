import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join, posix, win32 } from 'node:path';

import Database from 'better-sqlite3';

import {
  resolveGlobalScopePaths,
  type GlobalScopeEnv,
  type GlobalScopePlatform,
} from './global-scope-resolver.js';
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
  readonly integrityKey: string | Buffer;
  readonly dbPath?: string;
  readonly now?: () => Date;
}

export const PROVIDER_TRUTH_STORE_SCHEMA_VERSION = 2;

const INTEGRITY_SENTINEL_INPUT = 'deckent-provider-truth-store:v2';

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
    readonly code: 'SCOPE_MISMATCH' | 'IDEMPOTENCY_CONFLICT' | 'INTEGRITY_FAILURE',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderTruthStoreError';
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
  private readonly integrityKey: Buffer;

  constructor(globalStateDir: string, options: ProviderTruthStoreOptions) {
    if (!options || (typeof options.integrityKey !== 'string' && !Buffer.isBuffer(options.integrityKey))) {
      throw new ProviderTruthStoreError(
        'INTEGRITY_FAILURE',
        'Provider truth store requires a host integrity authority',
      );
    }
    requireIdentity('projectId', options.projectId);
    this.integrityKey = Buffer.isBuffer(options.integrityKey)
      ? Buffer.from(options.integrityKey)
      : Buffer.from(options.integrityKey, 'utf8');
    if (this.integrityKey.byteLength < 32) {
      throw new ProviderTruthStoreError(
        'INTEGRITY_FAILURE',
        'Provider truth integrity key must be at least 32 bytes',
      );
    }
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
            'INTEGRITY_FAILURE',
            'Unsigned provider truth schema requires an explicit authority migration',
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
        integrity_check TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS capability_catalogs (
        catalog_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
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
        UNIQUE (tenant_id, project_id, reachability_id),
        UNIQUE (tenant_id, project_id, idempotency_key)
      );
    `);
    this.db.exec(EXACT_REACHABILITY_SCOPE_INDEX_SQL);
    for (const triggerSql of Object.values(IMMUTABLE_TRIGGER_SQL)) this.db.exec(triggerSql);
    this.db.prepare(`
      INSERT INTO provider_truth_authority (singleton_id, integrity_check) VALUES (1, ?)
    `).run(this.integrityHash(INTEGRITY_SENTINEL_INPUT));
  }

  private assertSchema(): void {
    const requiredColumns: Readonly<Record<string, readonly string[]>> = {
      provider_truth_authority: ['singleton_id', 'integrity_check'],
      capability_catalogs: [
        'catalog_id', 'tenant_id', 'project_id', 'idempotency_key', 'fetched_at',
        'payload_json', 'payload_hash',
      ],
      reachability_results: [
        'inserted_seq', 'reachability_id', 'tenant_id', 'project_id', 'idempotency_key',
        'provider', 'model', 'auth_mode', 'account_ref_hash', 'transport',
        'execution_backend', 'endpoint_ref_hash', 'runtime_fingerprint',
        'execution_profile_ref', 'capability', 'completed_at', 'payload_json', 'payload_hash',
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
      SELECT integrity_check FROM provider_truth_authority WHERE singleton_id = 1
    `).get() as { integrity_check: string } | undefined;
    if (!authority || authority.integrity_check !== this.integrityHash(INTEGRITY_SENTINEL_INPUT)) {
      throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Provider truth integrity authority mismatch');
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
    const payloadHash = this.integrityHash(payloadJson);
    const transaction = this.db.transaction((): ProviderTruthWriteResult => {
      const existing = this.db.prepare(`
        SELECT * FROM capability_catalogs
        WHERE tenant_id = ? AND project_id = ? AND idempotency_key = ?
      `).get(catalog.tenantId, catalog.projectId, catalog.idempotencyKey) as
        CatalogRow | undefined;
      if (existing) {
        this.verifyCatalogRow(existing);
        if (existing.catalog_id !== catalog.catalogId || existing.payload_hash !== payloadHash) {
          throw new ProviderTruthStoreError('IDEMPOTENCY_CONFLICT', 'Catalog idempotency conflict');
        }
        return { evidenceRef: `capability-catalog:${catalog.catalogId}`, created: false };
      }
      this.db.prepare(`
        INSERT INTO capability_catalogs (
          catalog_id, tenant_id, project_id, idempotency_key, fetched_at, payload_json, payload_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        catalog.catalogId, catalog.tenantId, catalog.projectId, catalog.idempotencyKey,
        catalog.source.fetchedAt, payloadJson, payloadHash,
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
    const payloadHash = this.integrityHash(payloadJson);
    const transaction = this.db.transaction((): ProviderTruthWriteResult => {
      const existing = this.db.prepare(`
        SELECT * FROM reachability_results
        WHERE tenant_id = ? AND project_id = ? AND idempotency_key = ?
      `).get(result.tenantId, result.projectId, result.idempotencyKey) as
        ReachabilityRow | undefined;
      if (existing) {
        this.verifyReachabilityRow(existing);
        if (existing.reachability_id !== result.reachabilityId || existing.payload_hash !== payloadHash) {
          throw new ProviderTruthStoreError('IDEMPOTENCY_CONFLICT', 'Reachability idempotency conflict');
        }
        return { evidenceRef: `provider-reachability:${result.reachabilityId}`, created: false };
      }
      this.db.prepare(`
        INSERT INTO reachability_results (
          reachability_id, tenant_id, project_id, idempotency_key, provider, model,
          auth_mode, account_ref_hash, transport, execution_backend, endpoint_ref_hash,
          runtime_fingerprint, execution_profile_ref, capability, completed_at, payload_json, payload_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        result.reachabilityId, result.tenantId, result.projectId, result.idempotencyKey,
        result.provider, result.model, result.auth.mode, result.auth.accountRefHash,
        result.backend.transport, result.backend.executionBackend, result.backend.endpointRefHash,
        result.backend.runtimeFingerprint, result.backend.executionProfileRef,
        result.probe.capability, result.probe.completedAt,
        payloadJson, payloadHash,
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

  private verifyReachabilityRow(row: ReachabilityRow): ReachabilityResult {
    if (this.integrityHash(row.payload_json) !== row.payload_hash) {
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
    if (this.integrityHash(row.payload_json) !== row.payload_hash) {
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

  private integrityHash(value: string): string {
    return createHmac('sha256', this.integrityKey).update(value).digest('hex');
  }
}
