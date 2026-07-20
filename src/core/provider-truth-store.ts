import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import Database from 'better-sqlite3';

import { DECKENT_DIR } from './constants.js';
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
  readonly dbPath?: string;
  readonly now?: () => Date;
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

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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

  constructor(projectRoot: string, options: ProviderTruthStoreOptions) {
    const dbPath = options.dbPath ?? join(projectRoot, DECKENT_DIR, 'runtime', 'provider-truth.db');
    mkdirSync(dirname(dbPath), { recursive: true });
    this.now = options.now ?? (() => new Date());
    requireIdentity('projectId', options.projectId);
    this.projectId = options.projectId;
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('synchronous = FULL');
    try {
      const schemaVersion = this.db.pragma('user_version', { simple: true }) as number;
      if (schemaVersion > 1) {
        throw new ProviderTruthStoreError('INTEGRITY_FAILURE', 'Provider truth schema is newer than this runtime');
      }
      const existingTruthTable = this.db.prepare(`
        SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'reachability_results'
      `).get() as { present: number } | undefined;
      if (existingTruthTable) this.assertSchema();
      this.initSchema();
      this.assertSchema();
      if (schemaVersion === 0) this.db.pragma('user_version = 1');
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS capability_catalogs (
        catalog_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        UNIQUE (tenant_id, project_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS reachability_results (
        inserted_seq INTEGER PRIMARY KEY AUTOINCREMENT,
        reachability_id TEXT NOT NULL UNIQUE,
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
        UNIQUE (tenant_id, project_id, idempotency_key)
      );

      CREATE INDEX IF NOT EXISTS idx_reachability_exact_scope
        ON reachability_results (
          tenant_id, project_id, provider, model, auth_mode, account_ref_hash,
          transport, execution_backend, endpoint_ref_hash, runtime_fingerprint,
          execution_profile_ref, capability, completed_at
        );

      CREATE TRIGGER IF NOT EXISTS capability_catalogs_no_update
        BEFORE UPDATE ON capability_catalogs BEGIN
          SELECT RAISE(ABORT, 'capability catalogs are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS capability_catalogs_no_delete
        BEFORE DELETE ON capability_catalogs BEGIN
          SELECT RAISE(ABORT, 'capability catalogs are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS reachability_results_no_update
        BEFORE UPDATE ON reachability_results BEGIN
          SELECT RAISE(ABORT, 'reachability results are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS reachability_results_no_delete
        BEFORE DELETE ON reachability_results BEGIN
          SELECT RAISE(ABORT, 'reachability results are immutable');
        END;
    `);
  }

  private assertSchema(): void {
    const columns = this.db.pragma('table_info(reachability_results)') as Array<{ name: string }>;
    const names = new Set(columns.map(column => column.name));
    for (const required of ['inserted_seq', 'execution_profile_ref', 'payload_hash']) {
      if (!names.has(required)) {
        throw new ProviderTruthStoreError(
          'INTEGRITY_FAILURE',
          'Provider truth schema migration is required before this runtime can write evidence',
        );
      }
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
    const payloadHash = sha256(payloadJson);
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
    const payloadHash = sha256(payloadJson);
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
    if (sha256(row.payload_json) !== row.payload_hash) {
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
    if (sha256(row.payload_json) !== row.payload_hash) {
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
}
