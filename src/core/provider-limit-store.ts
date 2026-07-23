import { createHash, createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join, posix, win32 } from 'node:path';

import Database from 'better-sqlite3';

import {
  assertProviderLimitReservationRequest,
  assertProviderLimitReservation,
  assertProviderLimitReservationEvent,
  applyProviderLimitPolicy,
  assertProviderLimitResult,
  materializeProviderLimitResult,
  type ProviderLimitReservation,
  type ProviderLimitReservationEvent,
  type ProviderLimitReservationRequest,
  type ProviderLimitResult,
} from './provider-limit-truth.js';
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

export const PROVIDER_LIMIT_STORE_SCHEMA_VERSION = 2;
const PROVIDER_LIMIT_SENTINEL_INPUT = 'deckent-provider-limit-store:v2';
const ROW_INTEGRITY_VERSION = 2;

export interface ProviderLimitStoreOptions {
  readonly dbPath?: string;
  readonly now?: () => Date;
  /** Global tenant/account policy authority. Missing policy fails every write/admission closed. */
  readonly policyResolver: (scope: ProviderLimitSnapshotQuery) => ProviderLimitResult['policy'] | null;
  /** Host-coordinator secret; never mounted into an untrusted worker. */
  readonly integrityAuthority?: ProviderIntegrityAuthority;
  readonly integrityKey?: string | Buffer;
  /** Host-owned durable runtime/cancellation evidence authority. */
  readonly terminationEvidenceVerifier: (input: {
    readonly evidenceRef: string;
    readonly authorityRef: string;
    readonly reservation: ProviderLimitReservation;
    readonly event: ProviderLimitReservationEvent;
  }) => boolean;
}

export interface ProviderLimitSnapshotQuery {
  readonly tenantId: string;
  readonly provider: string;
  readonly accountRefHash: string | null;
  readonly quotaScopeRefHash: string;
  readonly authMode: ProviderLimitResult['authMode'];
}

export interface ProviderLimitReservationQuery extends ProviderLimitSnapshotQuery {
  readonly projectId: string;
}

export interface StoredProviderLimitReservationEvent extends ProviderLimitReservationEvent {
  readonly reservationId: string;
  readonly sequence: number;
  readonly previousHash: string | null;
  readonly hash: string;
}

export interface ProviderLimitReservationView {
  readonly reservation: ProviderLimitReservation;
  readonly events: readonly StoredProviderLimitReservationEvent[];
  readonly state:
    | 'rejected'
    | 'admitted'
    | 'dispatched'
    | 'consumed'
    | 'released'
    | 'expired-unreconciled';
}

export interface ProviderLimitReservationWrite {
  readonly reservation: ProviderLimitReservation;
  readonly created: boolean;
}

export interface ProviderLimitReservationEventWrite {
  readonly event: StoredProviderLimitReservationEvent;
  readonly created: boolean;
}

export interface ProviderLimitExecutionGrant {
  readonly reservationId: string;
  readonly dispatchEventRef: string;
  readonly dispatchEventHash: string;
}

export type ProviderLimitDispatchClaim =
  | { readonly claimed: true; readonly executionGrant: ProviderLimitExecutionGrant }
  | { readonly claimed: false; readonly existingDispatchEvidenceRef: string };

interface SnapshotRow {
  readonly limit_result_id: string;
  readonly tenant_id: string;
  readonly project_id: string;
  readonly idempotency_key: string;
  readonly provider: string;
  readonly account_ref_hash: string | null;
  readonly quota_scope_ref_hash: string;
  readonly auth_mode: string;
  readonly transport: string;
  readonly execution_backend: string;
  readonly endpoint_ref_hash: string | null;
  readonly fetched_at: string;
  readonly expires_at: string;
  readonly payload_json: string;
  readonly payload_hash: string;
  readonly integrity_key_id: string;
  readonly integrity_version: number;
}

interface ReservationRow {
  readonly reservation_id: string;
  readonly tenant_id: string;
  readonly project_id: string;
  readonly idempotency_key: string;
  readonly run_id: string;
  readonly call_id: string;
  readonly attempt_id: string;
  readonly provider: string;
  readonly model: string;
  readonly account_ref_hash: string | null;
  readonly quota_scope_ref_hash: string;
  readonly auth_mode: string;
  readonly transport: string;
  readonly execution_backend: string;
  readonly endpoint_ref_hash: string | null;
  readonly decision: string;
  readonly requested_at: string;
  readonly lease_expires_at: string;
  readonly payload_json: string;
  readonly payload_hash: string;
  readonly integrity_key_id: string;
  readonly integrity_version: number;
}

interface ReservationEventRow {
  readonly event_id: string;
  readonly reservation_id: string;
  readonly sequence: number;
  readonly event_type: string;
  readonly occurred_at: string;
  readonly payload_json: string;
  readonly payload_hash: string;
  readonly previous_hash: string | null;
  readonly event_hash: string;
  readonly integrity_key_id: string;
  readonly integrity_version: number;
}

interface ActiveReservationRow extends ReservationRow {
  readonly terminal_event_id: string | null;
  readonly terminal_sequence: number | null;
  readonly terminal_event_type: string | null;
  readonly terminal_occurred_at: string | null;
  readonly terminal_payload_json: string | null;
  readonly terminal_payload_hash: string | null;
  readonly terminal_previous_hash: string | null;
  readonly terminal_event_hash: string | null;
  readonly terminal_integrity_key_id: string | null;
  readonly terminal_integrity_version: number | null;
}

export class ProviderLimitStoreError extends Error {
  constructor(
    readonly code:
      | 'IDEMPOTENCY_CONFLICT'
      | 'INTEGRITY_FAILURE'
      | 'LOGICAL_WINNER_EXISTS'
      | 'RESERVATION_NOT_FOUND'
      | 'RESERVATION_SETTLED'
      | 'MIGRATION_REQUIRED'
      | 'INTEGRITY_KEY_UNAVAILABLE',
    message: string,
    readonly evidenceRef: string | null = null,
  ) {
    super(message);
    this.name = 'ProviderLimitStoreError';
  }
}

function sqlLiteral(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(value)) {
    throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Legacy provider limit key id is invalid');
  }
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Explicit v1→v2 migration. Evidence/event-chain bytes stay unchanged and are
 * bound to a retired raw-v1 limit key previously imported into the keyring.
 */
export function migrateProviderLimitStoreV1ToV2(input: {
  readonly dbPath: string;
  readonly legacyKeyId: string;
  readonly legacyIntegrityKey: string | Buffer;
}): void {
  const legacyKey = Buffer.isBuffer(input.legacyIntegrityKey)
    ? Buffer.from(input.legacyIntegrityKey)
    : Buffer.from(input.legacyIntegrityKey, 'utf8');
  if (legacyKey.byteLength < 32) {
    throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Legacy provider limit key is too short');
  }
  const db = new Database(input.dbPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    const migrate = db.transaction(() => {
      const version = db.pragma('user_version', { simple: true }) as number;
      if (version !== 1) {
        throw new ProviderLimitStoreError('MIGRATION_REQUIRED', 'Provider limit migration requires exact schema v1');
      }
      const legacyMac = (value: string): string => createHmac('sha256', legacyKey).update(value).digest('hex');
      for (const table of ['provider_limit_snapshots', 'provider_limit_reservations'] as const) {
        const rows = db.prepare(`SELECT payload_json, payload_hash FROM ${table}`).all() as Array<{
          payload_json: string;
          payload_hash: string;
        }>;
        if (rows.some(row => legacyMac(row.payload_json) !== row.payload_hash)) {
          throw new ProviderLimitStoreError(
            'INTEGRITY_FAILURE',
            'Legacy provider limit evidence failed integrity verification',
          );
        }
      }
      const events = db.prepare(`
        SELECT event_id, reservation_id, sequence, event_type, occurred_at,
          payload_json, payload_hash, previous_hash, event_hash
        FROM provider_limit_reservation_events
        ORDER BY reservation_id, sequence
      `).all() as ReservationEventRow[];
      for (const event of events) {
        if (legacyMac(event.payload_json) !== event.payload_hash
          || legacyMac(canonicalJson({
            reservationId: event.reservation_id,
            sequence: event.sequence,
            eventId: event.event_id,
            type: event.event_type,
            occurredAt: event.occurred_at,
            payloadHash: event.payload_hash,
            previousHash: event.previous_hash,
          })) !== event.event_hash) {
          throw new ProviderLimitStoreError(
            'INTEGRITY_FAILURE',
            'Legacy provider limit event chain failed integrity verification',
          );
        }
      }
      const keyLiteral = sqlLiteral(input.legacyKeyId);
      const sentinel = createHmac('sha256', legacyKey).update('deckent-provider-limit-store:v1').digest('hex');
      db.exec(`
        CREATE TABLE provider_limit_authority (
          singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
          integrity_check TEXT NOT NULL,
          active_key_id TEXT NOT NULL,
          integrity_version INTEGER NOT NULL,
          authority_revision INTEGER NOT NULL
        );
        INSERT INTO provider_limit_authority (
          singleton_id, integrity_check, active_key_id, integrity_version, authority_revision
        ) VALUES (1, '${sentinel}', ${keyLiteral}, 1, 0);
        ALTER TABLE provider_limit_snapshots
          ADD COLUMN integrity_key_id TEXT NOT NULL DEFAULT ${keyLiteral};
        ALTER TABLE provider_limit_snapshots
          ADD COLUMN integrity_version INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE provider_limit_reservations
          ADD COLUMN integrity_key_id TEXT NOT NULL DEFAULT ${keyLiteral};
        ALTER TABLE provider_limit_reservations
          ADD COLUMN integrity_version INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE provider_limit_reservation_events
          ADD COLUMN integrity_key_id TEXT NOT NULL DEFAULT ${keyLiteral};
        ALTER TABLE provider_limit_reservation_events
          ADD COLUMN integrity_version INTEGER NOT NULL DEFAULT 1;
        CREATE TRIGGER provider_limit_snapshots_active_key_insert
          BEFORE INSERT ON provider_limit_snapshots
          WHEN NEW.integrity_version != 2 OR NEW.integrity_key_id != (
            SELECT active_key_id FROM provider_limit_authority WHERE singleton_id = 1
          ) BEGIN
            SELECT RAISE(ABORT, 'provider limit active authority is immutable');
          END;
        CREATE TRIGGER provider_limit_reservations_active_key_insert
          BEFORE INSERT ON provider_limit_reservations
          WHEN NEW.integrity_version != 2 OR NEW.integrity_key_id != (
            SELECT active_key_id FROM provider_limit_authority WHERE singleton_id = 1
          ) BEGIN
            SELECT RAISE(ABORT, 'provider limit active authority is immutable');
          END;
        CREATE TRIGGER provider_limit_events_active_key_insert
          BEFORE INSERT ON provider_limit_reservation_events
          WHEN NEW.integrity_version != 2 OR NEW.integrity_key_id != (
            SELECT active_key_id FROM provider_limit_authority WHERE singleton_id = 1
          ) BEGIN
            SELECT RAISE(ABORT, 'provider limit active authority is immutable');
          END;
      `);
      db.pragma(`user_version = ${PROVIDER_LIMIT_STORE_SCHEMA_VERSION}`);
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

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function reservationEvidenceRef(reservationId: string): string {
  return `provider-limit-reservation:${sha256(reservationId)}`;
}

function requestFromReservation(reservation: ProviderLimitReservation): ProviderLimitReservationRequest {
  const {
    snapshotEvidenceRef: _snapshotEvidenceRef,
    decision: _decision,
    reasonCode: _reasonCode,
    effectiveRemaining: _effectiveRemaining,
    appliedPolicy: _appliedPolicy,
    ...request
  } = reservation;
  return request;
}

function reservationEventPayload(event: ProviderLimitReservationEvent): Record<string, unknown> {
  return {
    type: event.type,
    actual: event.actual ?? null,
    fenceTokenHash: event.fenceTokenHash,
    evidenceRef: event.evidenceRef,
    terminationEvidenceRef: event.terminationEvidenceRef ?? null,
    terminationAuthorityRef: event.terminationAuthorityRef ?? null,
  };
}

export function resolveProviderLimitStorePath(
  platform: GlobalScopePlatform,
  env: GlobalScopeEnv,
): string {
  const scope = resolveGlobalScopePaths(platform, env);
  const pathApi = platform === 'win32' ? win32 : posix;
  return pathApi.join(scope.stateDir, 'provider-limits.db');
}

export class ProviderLimitStore {
  private readonly db: Database.Database;
  private readonly now: () => Date;
  private readonly policyResolver: ProviderLimitStoreOptions['policyResolver'];
  private readonly terminationEvidenceVerifier: ProviderLimitStoreOptions['terminationEvidenceVerifier'];
  private readonly integrityAuthority: ProviderIntegrityAuthority;

  constructor(globalStateDir: string, options: ProviderLimitStoreOptions) {
    if (!options || typeof options.policyResolver !== 'function'
      || typeof options.terminationEvidenceVerifier !== 'function'
      || (!options.integrityAuthority
        && typeof options.integrityKey !== 'string' && !Buffer.isBuffer(options.integrityKey))
      || (options.integrityAuthority !== undefined && options.integrityKey !== undefined)) {
      throw new ProviderLimitStoreError(
        'INTEGRITY_FAILURE',
        'Provider limit store requires policy, termination-evidence and integrity authorities',
      );
    }
    const dbPath = options.dbPath ?? join(globalStateDir, 'provider-limits.db');
    mkdirSync(dirname(dbPath), { recursive: true });
    this.now = options.now ?? (() => new Date());
    this.policyResolver = options.policyResolver;
    this.terminationEvidenceVerifier = options.terminationEvidenceVerifier;
    this.integrityAuthority = options.integrityAuthority
      ?? createProviderIntegrityAuthority(options.integrityKey!);
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('synchronous = FULL');
    try {
      const version = this.db.pragma('user_version', { simple: true }) as number;
      if (version > PROVIDER_LIMIT_STORE_SCHEMA_VERSION) {
        throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit schema is newer than this runtime');
      }
      const existing = this.db.prepare(`
        SELECT 1 AS present FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'provider_limit_%' LIMIT 1
      `).get() as { present: number } | undefined;
      if (existing && version !== PROVIDER_LIMIT_STORE_SCHEMA_VERSION) {
        throw new ProviderLimitStoreError(
          'MIGRATION_REQUIRED',
          'Provider limit schema migration is required through the explicit authority migrator',
        );
      }
      if (existing) {
        this.assertSchema();
      } else {
        this.initSchema();
        this.db.pragma(`user_version = ${PROVIDER_LIMIT_STORE_SCHEMA_VERSION}`);
        this.assertSchema();
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  private initSchema(): void {
    const sentinel = this.signIntegrity('authority', PROVIDER_LIMIT_SENTINEL_INPUT);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_limit_authority (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        integrity_check TEXT NOT NULL,
        active_key_id TEXT NOT NULL,
        integrity_version INTEGER NOT NULL,
        authority_revision INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS provider_limit_snapshots (
        inserted_seq INTEGER PRIMARY KEY AUTOINCREMENT,
        limit_result_id TEXT NOT NULL UNIQUE,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        provider TEXT NOT NULL,
        account_ref_hash TEXT,
        quota_scope_ref_hash TEXT NOT NULL,
        auth_mode TEXT NOT NULL,
        transport TEXT NOT NULL,
        execution_backend TEXT NOT NULL,
        endpoint_ref_hash TEXT,
        fetched_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        integrity_key_id TEXT NOT NULL,
        integrity_version INTEGER NOT NULL,
        UNIQUE (tenant_id, provider, quota_scope_ref_hash, auth_mode, idempotency_key)
      );

      CREATE INDEX IF NOT EXISTS idx_provider_limit_snapshot_scope
        ON provider_limit_snapshots (
          tenant_id, provider, quota_scope_ref_hash, auth_mode, fetched_at, inserted_seq
        );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_limit_snapshot_idempotency
        ON provider_limit_snapshots (
          tenant_id, provider, quota_scope_ref_hash, auth_mode, idempotency_key
        );

      CREATE TABLE IF NOT EXISTS provider_limit_reservations (
        inserted_seq INTEGER PRIMARY KEY AUTOINCREMENT,
        reservation_id TEXT NOT NULL UNIQUE,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        run_id TEXT NOT NULL,
        call_id TEXT NOT NULL,
        attempt_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        account_ref_hash TEXT,
        quota_scope_ref_hash TEXT NOT NULL,
        auth_mode TEXT NOT NULL,
        transport TEXT NOT NULL,
        execution_backend TEXT NOT NULL,
        endpoint_ref_hash TEXT,
        decision TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        lease_expires_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        integrity_key_id TEXT NOT NULL,
        integrity_version INTEGER NOT NULL,
        UNIQUE (tenant_id, provider, quota_scope_ref_hash, auth_mode, idempotency_key)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_limit_reservation_idempotency
        ON provider_limit_reservations (
          tenant_id, provider, quota_scope_ref_hash, auth_mode, idempotency_key
        );

      CREATE INDEX IF NOT EXISTS idx_provider_limit_reservation_active_scope
        ON provider_limit_reservations (
          tenant_id, provider, quota_scope_ref_hash, auth_mode, decision, lease_expires_at
        );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_limit_reservation_logical_winner
        ON provider_limit_reservations (
          tenant_id, project_id, run_id, call_id, attempt_id
        ) WHERE decision = 'allow';

      CREATE TABLE IF NOT EXISTS provider_limit_reservation_events (
        event_id TEXT PRIMARY KEY,
        reservation_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        previous_hash TEXT,
        event_hash TEXT NOT NULL,
        integrity_key_id TEXT NOT NULL,
        integrity_version INTEGER NOT NULL,
        UNIQUE (reservation_id, sequence),
        FOREIGN KEY (reservation_id) REFERENCES provider_limit_reservations (reservation_id)
      );

      CREATE TRIGGER IF NOT EXISTS provider_limit_snapshots_no_update
        BEFORE UPDATE ON provider_limit_snapshots BEGIN
          SELECT RAISE(ABORT, 'provider limit snapshots are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS provider_limit_snapshots_no_delete
        BEFORE DELETE ON provider_limit_snapshots BEGIN
          SELECT RAISE(ABORT, 'provider limit snapshots are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS provider_limit_reservations_no_update
        BEFORE UPDATE ON provider_limit_reservations BEGIN
          SELECT RAISE(ABORT, 'provider limit reservations are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS provider_limit_reservations_no_delete
        BEFORE DELETE ON provider_limit_reservations BEGIN
          SELECT RAISE(ABORT, 'provider limit reservations are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS provider_limit_events_no_update
        BEFORE UPDATE ON provider_limit_reservation_events BEGIN
          SELECT RAISE(ABORT, 'provider limit reservation events are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS provider_limit_events_no_delete
        BEFORE DELETE ON provider_limit_reservation_events BEGIN
          SELECT RAISE(ABORT, 'provider limit reservation events are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS provider_limit_snapshots_active_key_insert
        BEFORE INSERT ON provider_limit_snapshots
        WHEN NEW.integrity_version != 2 OR NEW.integrity_key_id != (
          SELECT active_key_id FROM provider_limit_authority WHERE singleton_id = 1
        ) BEGIN
          SELECT RAISE(ABORT, 'provider limit active authority is immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS provider_limit_reservations_active_key_insert
        BEFORE INSERT ON provider_limit_reservations
        WHEN NEW.integrity_version != 2 OR NEW.integrity_key_id != (
          SELECT active_key_id FROM provider_limit_authority WHERE singleton_id = 1
        ) BEGIN
          SELECT RAISE(ABORT, 'provider limit active authority is immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS provider_limit_events_active_key_insert
        BEFORE INSERT ON provider_limit_reservation_events
        WHEN NEW.integrity_version != 2 OR NEW.integrity_key_id != (
          SELECT active_key_id FROM provider_limit_authority WHERE singleton_id = 1
        ) BEGIN
          SELECT RAISE(ABORT, 'provider limit active authority is immutable');
        END;
    `);
    this.db.prepare(`
      INSERT OR IGNORE INTO provider_limit_authority (
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
    const required: Readonly<Record<string, readonly string[]>> = {
      provider_limit_authority: [
        'singleton_id', 'integrity_check', 'active_key_id', 'integrity_version', 'authority_revision',
      ],
      provider_limit_snapshots: [
        'inserted_seq', 'limit_result_id', 'quota_scope_ref_hash', 'transport',
        'execution_backend', 'endpoint_ref_hash', 'payload_hash',
        'integrity_key_id', 'integrity_version',
      ],
      provider_limit_reservations: [
        'inserted_seq', 'reservation_id', 'run_id', 'call_id', 'attempt_id', 'model',
        'quota_scope_ref_hash', 'transport',
        'execution_backend', 'endpoint_ref_hash', 'payload_hash',
        'integrity_key_id', 'integrity_version',
      ],
      provider_limit_reservation_events: [
        'event_id', 'reservation_id', 'event_hash', 'integrity_key_id', 'integrity_version',
      ],
    };
    for (const [table, columns] of Object.entries(required)) {
      const rows = this.db.pragma(`table_info(${table})`) as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>;
      const names = new Set(rows.map(row => row.name));
      if (columns.some(column => !names.has(column))) {
        throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit schema migration is required');
      }
      for (const column of rows.filter(row => columns.includes(row.name))) {
        if (!column.type || (column.name !== 'inserted_seq' && column.notnull !== 1
          && column.pk !== 1 && !['endpoint_ref_hash'].includes(column.name))) {
          throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit schema constraints are invalid');
        }
      }
    }

    const requiredIndexes = new Map<string, {
      unique: boolean;
      columns: readonly string[];
      predicate?: string;
    }>([
      ['idx_provider_limit_snapshot_scope', {
        unique: false,
        columns: ['tenant_id', 'provider', 'quota_scope_ref_hash', 'auth_mode', 'fetched_at', 'inserted_seq'],
      }],
      ['idx_provider_limit_snapshot_idempotency', {
        unique: true,
        columns: ['tenant_id', 'provider', 'quota_scope_ref_hash', 'auth_mode', 'idempotency_key'],
      }],
      ['idx_provider_limit_reservation_idempotency', {
        unique: true,
        columns: ['tenant_id', 'provider', 'quota_scope_ref_hash', 'auth_mode', 'idempotency_key'],
      }],
      ['idx_provider_limit_reservation_active_scope', {
        unique: false,
        columns: [
          'tenant_id', 'provider', 'quota_scope_ref_hash', 'auth_mode', 'decision', 'lease_expires_at',
        ],
      }],
      ['idx_provider_limit_reservation_logical_winner', {
        unique: true,
        columns: ['tenant_id', 'project_id', 'run_id', 'call_id', 'attempt_id'],
        predicate: "where decision = 'allow'",
      }],
    ]);
    const indexes = this.db.prepare(`
      SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL
    `).all() as Array<{ name: string; sql: string | null }>;
    for (const [name, expected] of requiredIndexes) {
      const index = indexes.find(item => item.name === name);
      const columns = index
        ? (this.db.pragma(`index_info(${name})`) as Array<{ name: string | null }>).map(item => item.name)
        : [];
      const normalizedSql = (index?.sql ?? '').replace(/\s+/gu, ' ').trim().toLowerCase();
      if (!index || (expected.unique && !/^create unique index\b/iu.test(normalizedSql))
        || (expected.predicate !== undefined && !normalizedSql.endsWith(expected.predicate))
        || columns.join('\u0000') !== expected.columns.join('\u0000')) {
        throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit schema indexes are invalid');
      }
    }
    const hasUniqueColumns = (table: string, expected: readonly string[]): boolean => {
      const list = this.db.pragma(`index_list(${table})`) as Array<{ name: string; unique: number }>;
      return list.some(index => {
        if (index.unique !== 1) return false;
        const columns = this.db.pragma(`index_info(${index.name})`) as Array<{ name: string | null }>;
        return columns.map(column => column.name).join('\u0000') === expected.join('\u0000');
      });
    };
    if (!hasUniqueColumns('provider_limit_snapshots', ['limit_result_id'])
      || !hasUniqueColumns('provider_limit_reservations', ['reservation_id'])
      || !hasUniqueColumns('provider_limit_reservation_events', ['event_id'])
      || !hasUniqueColumns('provider_limit_reservation_events', ['reservation_id', 'sequence'])) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit schema uniqueness is invalid');
    }
    const foreignKeys = this.db.pragma('foreign_key_list(provider_limit_reservation_events)') as Array<{
      table: string;
      from: string;
      to: string;
    }>;
    if (!foreignKeys.some(key => key.table === 'provider_limit_reservations'
      && key.from === 'reservation_id' && key.to === 'reservation_id')) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit schema foreign key is invalid');
    }
    const requiredTriggers = new Map([
      ['provider_limit_snapshots_no_update', ['provider_limit_snapshots', 'update']],
      ['provider_limit_snapshots_no_delete', ['provider_limit_snapshots', 'delete']],
      ['provider_limit_reservations_no_update', ['provider_limit_reservations', 'update']],
      ['provider_limit_reservations_no_delete', ['provider_limit_reservations', 'delete']],
      ['provider_limit_events_no_update', ['provider_limit_reservation_events', 'update']],
      ['provider_limit_events_no_delete', ['provider_limit_reservation_events', 'delete']],
      ['provider_limit_snapshots_active_key_insert', ['provider_limit_snapshots', 'insert']],
      ['provider_limit_reservations_active_key_insert', ['provider_limit_reservations', 'insert']],
      ['provider_limit_events_active_key_insert', ['provider_limit_reservation_events', 'insert']],
    ] as const);
    const triggers = this.db.prepare(`
      SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger'
    `).all() as Array<{ name: string; tbl_name: string; sql: string | null }>;
    if ([...requiredTriggers].some(([name, [table, operation]]) => {
      const trigger = triggers.find(item => item.name === name);
      const normalized = (trigger?.sql ?? '').replace(/\s+/gu, ' ').toLowerCase();
      return !trigger || trigger.tbl_name !== table
        || !normalized.includes(`before ${operation} on ${table}`)
        || !normalized.includes("raise(abort, '")
        || !normalized.includes('immutable');
    })) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit schema triggers are invalid');
    }
    const authority = this.db.prepare(`
      SELECT integrity_check, active_key_id, integrity_version, authority_revision
      FROM provider_limit_authority WHERE singleton_id = 1
    `).get() as {
      integrity_check: string;
      active_key_id: string;
      integrity_version: number;
      authority_revision: number;
    } | undefined;
    const sentinelInput = authority?.integrity_version === 1
      ? 'deckent-provider-limit-store:v1'
      : PROVIDER_LIMIT_SENTINEL_INPUT;
    let authorityVerified = false;
    try {
      authorityVerified = authority !== undefined && this.verifyIntegrity(
        'authority',
        authority.active_key_id,
        sentinelInput,
        authority.integrity_check,
        authority.integrity_version,
      );
    } catch (error) {
      if (!(error instanceof ProviderLimitStoreError)
        || error.code !== 'INTEGRITY_KEY_UNAVAILABLE') throw error;
    }
    if (!authority || !authorityVerified) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit integrity authority mismatch');
    }
    const current = this.signIntegrity('authority', PROVIDER_LIMIT_SENTINEL_INPUT);
    if (current.authorityRevision < authority.authority_revision
      || (current.authorityRevision === authority.authority_revision
        && authority.active_key_id !== current.keyId)) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit authority revision is stale');
    }
    if (authority.active_key_id !== current.keyId
      || authority.integrity_version !== ROW_INTEGRITY_VERSION
      || authority.authority_revision !== current.authorityRevision) {
      this.db.prepare(`
        UPDATE provider_limit_authority
        SET integrity_check = ?, active_key_id = ?, integrity_version = ?, authority_revision = ?
        WHERE singleton_id = 1
      `).run(current.mac, current.keyId, ROW_INTEGRITY_VERSION, current.authorityRevision);
    }
  }

  putSnapshot(result: ProviderLimitResult): { evidenceRef: string; created: boolean } {
    if (result.state === 'stale' || result.reasonCode === 'evidence_not_yet_valid') {
      throw new ProviderLimitStoreError('IDEMPOTENCY_CONFLICT', 'Read-time limit projections cannot be persisted');
    }
    assertProviderLimitResult(result);
    const authoritative = applyProviderLimitPolicy(result, this.requirePolicy(result));
    if (Date.parse(result.source.fetchedAt) > this.now().getTime()) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Future-dated provider limit evidence cannot be persisted');
    }
    const payloadJson = canonicalJson(authoritative);
    const transaction = this.db.transaction(() => {
      this.syncAuthorityForWrite();
      const signed = this.signIntegrity('snapshot', payloadJson);
      this.verifyIncorporatedEvents(authoritative);
      const existing = this.db.prepare(`
        SELECT * FROM provider_limit_snapshots
        WHERE tenant_id = @tenant_id AND provider = @provider
          AND quota_scope_ref_hash = @quota_scope_ref_hash AND auth_mode = @auth_mode
          AND ((account_ref_hash IS NULL AND @account_ref_hash IS NULL)
            OR account_ref_hash = @account_ref_hash)
          AND idempotency_key = @idempotency_key
      `).get({
        tenant_id: authoritative.tenantId,
        provider: authoritative.provider,
        account_ref_hash: authoritative.accountRefHash,
        quota_scope_ref_hash: authoritative.quotaScopeRefHash,
        auth_mode: authoritative.authMode,
        idempotency_key: authoritative.idempotencyKey,
      }) as SnapshotRow | undefined;
      if (existing) {
        const persisted = this.verifySnapshotRow(existing);
        if (persisted.limitResultId !== authoritative.limitResultId || existing.payload_json !== payloadJson) {
          throw new ProviderLimitStoreError('IDEMPOTENCY_CONFLICT', 'Provider limit snapshot idempotency conflict');
        }
        return { evidenceRef: `provider-limit:${authoritative.limitResultId}`, created: false };
      }
      this.db.prepare(`
        INSERT INTO provider_limit_snapshots (
          limit_result_id, tenant_id, project_id, idempotency_key, provider,
          account_ref_hash, quota_scope_ref_hash, auth_mode, transport, execution_backend,
          endpoint_ref_hash, fetched_at, expires_at, payload_json, payload_hash,
          integrity_key_id, integrity_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        authoritative.limitResultId, authoritative.tenantId, authoritative.projectId,
        authoritative.idempotencyKey, authoritative.provider, authoritative.accountRefHash,
        authoritative.quotaScopeRefHash, authoritative.authMode, authoritative.backend.transport,
        authoritative.backend.executionBackend, authoritative.backend.endpointRefHash,
        authoritative.source.fetchedAt, authoritative.source.expiresAt,
        payloadJson, signed.mac, signed.keyId, ROW_INTEGRITY_VERSION,
      );
      return { evidenceRef: `provider-limit:${authoritative.limitResultId}`, created: true };
    });
    return transaction.immediate();
  }

  getLatestSnapshot(query: ProviderLimitSnapshotQuery, at = this.now()): ProviderLimitResult | null {
    const row = this.selectLatestSnapshot(query);
    return row ? materializeProviderLimitResult(this.verifySnapshotRow(row), at) : null;
  }

  reserve(request: ProviderLimitReservationRequest): ProviderLimitReservation {
    return this.reserveWithStatus(request).reservation;
  }

  reserveWithStatus(request: ProviderLimitReservationRequest): ProviderLimitReservationWrite {
    assertProviderLimitReservationRequest(request);
    const now = this.now();
    const payloadRequestHash = sha256(canonicalJson(request));
    const transaction = this.db.transaction((): ProviderLimitReservationWrite => {
      this.syncAuthorityForWrite();
      const existing = this.db.prepare(`
        SELECT * FROM provider_limit_reservations
        WHERE tenant_id = @tenant_id AND provider = @provider
          AND quota_scope_ref_hash = @quota_scope_ref_hash AND auth_mode = @auth_mode
          AND ((account_ref_hash IS NULL AND @account_ref_hash IS NULL)
            OR account_ref_hash = @account_ref_hash)
          AND idempotency_key = @idempotency_key
      `).get({
        tenant_id: request.tenantId,
        provider: request.provider,
        account_ref_hash: request.accountRefHash,
        quota_scope_ref_hash: request.quotaScopeRefHash,
        auth_mode: request.authMode,
        idempotency_key: request.idempotencyKey,
      }) as ReservationRow | undefined;
      if (existing) {
        const persisted = this.verifyReservationRow(existing);
        if (sha256(canonicalJson(requestFromReservation(persisted))) !== payloadRequestHash
          || persisted.reservationId !== request.reservationId) {
          throw new ProviderLimitStoreError('IDEMPOTENCY_CONFLICT', 'Provider limit reservation conflict');
        }
        return { reservation: persisted, created: false };
      }
      if (Date.parse(request.requestedAt) > now.getTime()
        || Date.parse(request.leaseExpiresAt) <= now.getTime()) {
        throw new ProviderLimitStoreError(
          'INTEGRITY_FAILURE', 'Provider limit reservation lease is not currently valid',
        );
      }

      const snapshotRow = this.selectLatestSnapshot(request);
      const snapshot = snapshotRow
        ? applyProviderLimitPolicy(
          materializeProviderLimitResult(this.verifySnapshotRow(snapshotRow), now),
          this.requirePolicy(request),
        )
        : null;
      let decision: ProviderLimitReservation['decision'] = 'hold';
      let reasonCode: ProviderLimitReservation['reasonCode'] = 'snapshot_missing';
      let snapshotEvidenceRef: string | null = null;
      const effectiveRemaining: Record<string, number> = {};

      if (snapshot) {
        snapshotEvidenceRef = `provider-limit:${snapshot.limitResultId}`;
        if (snapshot.state !== 'known' || snapshot.decision !== 'allow') {
          reasonCode = 'snapshot_not_usable';
        } else if (Date.parse(request.leaseExpiresAt) > Date.parse(snapshot.source.expiresAt)) {
          reasonCode = 'lease_outlives_snapshot';
        } else if (request.estimates.length !== snapshot.requiredWindowIds.length
          || request.estimates.some(estimate => !snapshot.requiredWindowIds.includes(estimate.windowId))) {
          reasonCode = 'estimate_scope_mismatch';
        } else {
          const windows = new Map(snapshot.windows.map(window => [window.windowId, window]));
          const reserved = this.activeReservedAmounts(
            request,
            new Set(snapshot.source.incorporatedReservationEventRefs),
          );
          reasonCode = 'allowed';
          decision = 'allow';
          for (const estimate of request.estimates) {
            const window = windows.get(estimate.windowId);
            if (!window || window.remaining === null) {
              decision = 'hold';
              reasonCode = 'window_missing';
              break;
            }
            if (window.unit !== estimate.unit) {
              decision = 'hold';
              reasonCode = 'unit_mismatch';
              break;
            }
            if (window.model !== null && window.model !== request.model) {
              decision = 'hold';
              reasonCode = 'model_mismatch';
              break;
            }
            const remaining = Math.max(0, window.remaining - (reserved.get(estimate.windowId) ?? 0));
            effectiveRemaining[estimate.windowId] = remaining;
            if (remaining < estimate.amount) {
              decision = 'hold';
              reasonCode = 'insufficient_remaining';
              break;
            }
            const projectedRemaining = remaining - estimate.amount;
            const floor = snapshot.policy.minimumRemaining[window.unit];
            const projectedRatio = window.limit === null || window.limit <= 0
              ? null : (window.limit - projectedRemaining) / window.limit;
            if ((floor !== undefined && projectedRemaining <= floor)
              || (projectedRatio !== null && projectedRatio >= snapshot.policy.blockAtRatio)) {
              decision = 'hold';
              reasonCode = 'policy_block';
              break;
            }
          }
        }
      }

      const reservation: ProviderLimitReservation = {
        ...request,
        snapshotEvidenceRef,
        decision,
        reasonCode,
        effectiveRemaining,
        appliedPolicy: snapshot?.policy ?? this.requirePolicy(request),
      };
      assertProviderLimitReservation(reservation);
      const payloadJson = canonicalJson(reservation);
      const signed = this.signIntegrity('reservation', payloadJson);
      try {
        this.db.prepare(`
          INSERT INTO provider_limit_reservations (
            reservation_id, tenant_id, project_id, idempotency_key, run_id, call_id, attempt_id,
            provider, account_ref_hash,
            model, quota_scope_ref_hash, auth_mode, transport, execution_backend, endpoint_ref_hash,
            decision, requested_at, lease_expires_at, payload_json, payload_hash,
            integrity_key_id, integrity_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          request.reservationId, request.tenantId, request.projectId, request.idempotencyKey,
          request.runId, request.callId, request.attemptId,
          request.provider, request.accountRefHash, request.model, request.quotaScopeRefHash, request.authMode,
          request.backend.transport, request.backend.executionBackend, request.backend.endpointRefHash, decision,
          request.requestedAt, request.leaseExpiresAt, payloadJson,
          signed.mac, signed.keyId, ROW_INTEGRITY_VERSION,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (decision === 'allow' && message.includes('provider_limit_reservations.tenant_id')
          && message.includes('provider_limit_reservations.attempt_id')) {
          const winnerRow = this.db.prepare(`
            SELECT * FROM provider_limit_reservations
            WHERE tenant_id = ? AND project_id = ? AND run_id = ? AND call_id = ?
              AND attempt_id = ? AND decision = 'allow'
            ORDER BY inserted_seq ASC LIMIT 1
          `).get(
            request.tenantId, request.projectId, request.runId, request.callId, request.attemptId,
          ) as ReservationRow | undefined;
          if (!winnerRow) throw error;
          const winner = this.verifyReservationRow(winnerRow);
          throw new ProviderLimitStoreError(
            'LOGICAL_WINNER_EXISTS',
            'A provider limit winner already exists for this logical invocation',
            reservationEvidenceRef(winner.reservationId),
          );
        }
        throw error;
      }
      return { reservation, created: true };
    });
    return transaction.immediate();
  }

  appendReservationEvent(
    query: ProviderLimitReservationQuery,
    reservationId: string,
    event: ProviderLimitReservationEvent,
  ): StoredProviderLimitReservationEvent {
    return this.appendReservationEventWithStatus(query, reservationId, event).event;
  }

  appendReservationEventWithStatus(
    query: ProviderLimitReservationQuery,
    reservationId: string,
    event: ProviderLimitReservationEvent,
  ): ProviderLimitReservationEventWrite {
    assertProviderLimitReservationEvent(event);
    const transaction = this.db.transaction((): ProviderLimitReservationEventWrite => {
      this.syncAuthorityForWrite();
      const row = this.db.prepare(`
        SELECT * FROM provider_limit_reservations
        WHERE reservation_id = @reservation_id AND tenant_id = @tenant_id AND project_id = @project_id
          AND provider = @provider AND quota_scope_ref_hash = @quota_scope_ref_hash
          AND auth_mode = @auth_mode
          AND ((account_ref_hash IS NULL AND @account_ref_hash IS NULL)
            OR account_ref_hash = @account_ref_hash)
      `).get({
        reservation_id: reservationId,
        tenant_id: query.tenantId,
        project_id: query.projectId,
        provider: query.provider,
        account_ref_hash: query.accountRefHash,
        quota_scope_ref_hash: query.quotaScopeRefHash,
        auth_mode: query.authMode,
      }) as ReservationRow | undefined;
      if (!row) throw new ProviderLimitStoreError('RESERVATION_NOT_FOUND', 'Provider limit reservation not found');
      const reservation = this.verifyReservationRow(row);
      if (reservation.decision !== 'allow') {
        throw new ProviderLimitStoreError('RESERVATION_SETTLED', 'Rejected reservation cannot be settled');
      }
      const duplicate = this.db.prepare(`
        SELECT * FROM provider_limit_reservation_events WHERE event_id = ?
      `).get(event.eventId) as ReservationEventRow | undefined;
      if (duplicate) {
        const stored = this.eventFromRow(duplicate);
        if (stored.reservationId !== reservationId
          || stored.occurredAt !== event.occurredAt
          || sha256(canonicalJson(reservationEventPayload(stored)))
            !== sha256(canonicalJson(reservationEventPayload(event)))) {
          throw new ProviderLimitStoreError('IDEMPOTENCY_CONFLICT', 'Reservation event conflict');
        }
        if (stored.type === 'released' && !this.terminationEvidenceVerifier({
          evidenceRef: stored.terminationEvidenceRef!,
          authorityRef: stored.terminationAuthorityRef!,
          reservation,
          event: stored,
        })) {
          throw new ProviderLimitStoreError(
            'INTEGRITY_FAILURE',
            'Persisted termination/cancellation evidence is no longer verifiable',
          );
        }
        return { event: stored, created: false };
      }
      const previous = this.db.prepare(`
        SELECT * FROM provider_limit_reservation_events
        WHERE reservation_id = ? ORDER BY sequence DESC LIMIT 1
      `).get(reservationId) as ReservationEventRow | undefined;
      const previousEvent = previous ? this.eventFromRow(previous) : null;
      if (previousEvent?.type === 'consumed' || previousEvent?.type === 'released') {
        throw new ProviderLimitStoreError('RESERVATION_SETTLED', 'Provider limit reservation is already settled');
      }
      if (event.type === 'consumed' && previousEvent?.type !== 'dispatched') {
        throw new ProviderLimitStoreError(
          'INTEGRITY_FAILURE', 'Provider usage cannot be consumed before dispatch is durable',
        );
      }
      if (event.type === 'dispatched' && previousEvent !== null) {
        throw new ProviderLimitStoreError('RESERVATION_SETTLED', 'Provider limit reservation is already dispatched');
      }
      const occurredAt = Date.parse(event.occurredAt);
      const now = this.now().getTime();
      if (occurredAt < Date.parse(reservation.requestedAt)
        || occurredAt > now
        || (previousEvent !== null && occurredAt < Date.parse(previousEvent.occurredAt))
        || (event.type === 'dispatched' && occurredAt >= Date.parse(reservation.leaseExpiresAt))) {
        throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Reservation event timestamp is outside its lease history');
      }
      const estimates = new Map(reservation.estimates.map(item => [item.windowId, item]));
      if (event.type === 'consumed' && event.actual?.length !== estimates.size) {
        throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Actual usage must settle every reserved window');
      }
      if (event.fenceTokenHash !== reservation.fenceTokenHash) {
        throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Reservation event fencing token mismatch');
      }
      if (event.type === 'released' && !this.terminationEvidenceVerifier({
        evidenceRef: event.terminationEvidenceRef!, authorityRef: event.terminationAuthorityRef!,
        reservation, event,
      })) {
        throw new ProviderLimitStoreError(
          'INTEGRITY_FAILURE', 'Provider termination/cancellation evidence is not durably verified',
        );
      }
      for (const actual of event.actual ?? []) {
        const estimate = estimates.get(actual.windowId);
        if (!estimate || estimate.unit !== actual.unit) {
          throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Actual usage does not match reserved window scope');
        }
      }
      const payloadJson = canonicalJson(reservationEventPayload(event));
      const payloadSigned = this.signIntegrity('reservation-event-payload', payloadJson);
      const sequence = (previousEvent?.sequence ?? 0) + 1;
      const previousHash = previousEvent?.hash ?? null;
      const eventEnvelope = canonicalJson({
        reservationId, sequence, eventId: event.eventId, type: event.type,
        occurredAt: event.occurredAt, payloadHash: payloadSigned.mac, previousHash,
      });
      const eventSigned = this.signIntegrity('reservation-event-chain', eventEnvelope);
      if (eventSigned.keyId !== payloadSigned.keyId) {
        throw new ProviderLimitStoreError(
          'INTEGRITY_FAILURE',
          'Provider limit authority rotated during event signing',
        );
      }
      this.db.prepare(`
        INSERT INTO provider_limit_reservation_events (
          event_id, reservation_id, sequence, event_type, occurred_at,
          payload_json, payload_hash, previous_hash, event_hash,
          integrity_key_id, integrity_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        event.eventId, reservationId, sequence, event.type, event.occurredAt,
        payloadJson, payloadSigned.mac, previousHash, eventSigned.mac,
        eventSigned.keyId, ROW_INTEGRITY_VERSION,
      );
      return {
        event: { ...event, reservationId, sequence, previousHash, hash: eventSigned.mac },
        created: true,
      };
    });
    return transaction.immediate();
  }

  claimDispatch(
    query: ProviderLimitReservationQuery,
    reservationId: string,
    event: ProviderLimitReservationEvent,
  ): ProviderLimitDispatchClaim {
    if (event.type !== 'dispatched') {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Dispatch claim requires a dispatched event');
    }
    try {
      const write = this.appendReservationEventWithStatus(query, reservationId, event);
      if (write.created) {
        return {
          claimed: true,
          executionGrant: {
            reservationId,
            dispatchEventRef: `provider-limit-reservation-event:${write.event.eventId}`,
            dispatchEventHash: write.event.hash,
          },
        };
      }
      return {
        claimed: false,
        existingDispatchEvidenceRef: `provider-limit-reservation-event:${write.event.eventId}`,
      };
    } catch (error) {
      if (!(error instanceof ProviderLimitStoreError) || error.code !== 'RESERVATION_SETTLED') throw error;
      const view = this.getReservation(query, reservationId);
      const grant = view?.events.find(item => item.type === 'dispatched');
      if (!grant) throw error;
      return {
        claimed: false,
        existingDispatchEvidenceRef: `provider-limit-reservation-event:${grant.eventId}`,
      };
    }
  }

  getReservation(
    query: ProviderLimitReservationQuery,
    reservationId: string,
    at = this.now(),
  ): ProviderLimitReservationView | null {
    const row = this.db.prepare(`
      SELECT * FROM provider_limit_reservations
      WHERE reservation_id = @reservation_id AND tenant_id = @tenant_id AND project_id = @project_id
        AND provider = @provider AND quota_scope_ref_hash = @quota_scope_ref_hash
        AND auth_mode = @auth_mode
        AND ((account_ref_hash IS NULL AND @account_ref_hash IS NULL)
          OR account_ref_hash = @account_ref_hash)
    `).get({
      reservation_id: reservationId,
      tenant_id: query.tenantId,
      project_id: query.projectId,
      provider: query.provider,
      account_ref_hash: query.accountRefHash,
      quota_scope_ref_hash: query.quotaScopeRefHash,
      auth_mode: query.authMode,
    }) as ReservationRow | undefined;
    if (!row) return null;
    const reservation = this.verifyReservationRow(row);
    const events = (this.db.prepare(`
      SELECT * FROM provider_limit_reservation_events
      WHERE reservation_id = ? ORDER BY sequence ASC
    `).all(reservationId) as ReservationEventRow[]).map(event => this.eventFromRow(event));
    this.assertReservationLifecycle(reservation, events);
    const terminal = events.at(-1)?.type;
    const state = reservation.decision === 'hold' ? 'rejected'
      : terminal === 'consumed' ? 'consumed'
          : terminal === 'released' ? 'released'
            : at.getTime() >= Date.parse(reservation.leaseExpiresAt) ? 'expired-unreconciled'
              : terminal === 'dispatched' ? 'dispatched' : 'admitted';
    return { reservation, events, state };
  }

  private selectLatestSnapshot(query: ProviderLimitSnapshotQuery): SnapshotRow | undefined {
    return this.db.prepare(`
      SELECT * FROM provider_limit_snapshots
      WHERE tenant_id = @tenant_id AND provider = @provider
        AND quota_scope_ref_hash = @quota_scope_ref_hash AND auth_mode = @auth_mode
        AND ((account_ref_hash IS NULL AND @account_ref_hash IS NULL)
          OR account_ref_hash = @account_ref_hash)
      ORDER BY fetched_at DESC, inserted_seq DESC LIMIT 1
    `).get({
      tenant_id: query.tenantId,
      provider: query.provider,
      account_ref_hash: query.accountRefHash,
      quota_scope_ref_hash: query.quotaScopeRefHash,
      auth_mode: query.authMode,
    }) as SnapshotRow | undefined;
  }

  private activeReservedAmounts(
    query: ProviderLimitSnapshotQuery,
    incorporatedEventRefs: ReadonlySet<string>,
  ): Map<string, number> {
    const rows = this.db.prepare(`
      SELECT r.*,
        e.event_id AS terminal_event_id,
        e.sequence AS terminal_sequence,
        e.event_type AS terminal_event_type,
        e.occurred_at AS terminal_occurred_at,
        e.payload_json AS terminal_payload_json,
        e.payload_hash AS terminal_payload_hash,
        e.previous_hash AS terminal_previous_hash,
        e.event_hash AS terminal_event_hash,
        e.integrity_key_id AS terminal_integrity_key_id,
        e.integrity_version AS terminal_integrity_version
      FROM provider_limit_reservations r
      LEFT JOIN provider_limit_reservation_events e ON e.reservation_id = r.reservation_id
      WHERE r.tenant_id = @tenant_id AND r.provider = @provider
        AND r.quota_scope_ref_hash = @quota_scope_ref_hash AND r.auth_mode = @auth_mode
        AND ((r.account_ref_hash IS NULL AND @account_ref_hash IS NULL)
          OR r.account_ref_hash = @account_ref_hash)
        AND r.decision = 'allow'
      ORDER BY r.inserted_seq ASC, e.sequence ASC
    `).all({
      tenant_id: query.tenantId,
      provider: query.provider,
      account_ref_hash: query.accountRefHash,
      quota_scope_ref_hash: query.quotaScopeRefHash,
      auth_mode: query.authMode,
    }) as ActiveReservationRow[];
    const lifecycles = new Map<string, {
      reservation: ProviderLimitReservation;
      events: StoredProviderLimitReservationEvent[];
    }>();
    for (const row of rows) {
      let lifecycle = lifecycles.get(row.reservation_id);
      if (!lifecycle) {
        lifecycle = { reservation: this.verifyReservationRow(row), events: [] };
        lifecycles.set(row.reservation_id, lifecycle);
      }
      if (row.terminal_event_id !== null) {
        lifecycle.events.push(this.eventFromRow({
          event_id: row.terminal_event_id,
          reservation_id: lifecycle.reservation.reservationId,
          sequence: row.terminal_sequence!,
          event_type: row.terminal_event_type!,
          occurred_at: row.terminal_occurred_at!,
          payload_json: row.terminal_payload_json!,
          payload_hash: row.terminal_payload_hash!,
          previous_hash: row.terminal_previous_hash,
          event_hash: row.terminal_event_hash!,
          integrity_key_id: row.terminal_integrity_key_id!,
          integrity_version: row.terminal_integrity_version!,
        }));
      }
    }
    const totals = new Map<string, number>();
    for (const { reservation, events } of lifecycles.values()) {
      this.assertReservationLifecycle(reservation, events);
      const terminal = events.at(-1);
      if (terminal?.type === 'released') continue;
      if (terminal?.type === 'consumed'
        && incorporatedEventRefs.has(`provider-limit-reservation-event:${terminal.eventId}`)) {
        continue;
      }
      const amounts = terminal?.type === 'consumed'
        ? terminal.actual ?? []
        : reservation.estimates;
      for (const amount of amounts) {
        totals.set(amount.windowId, (totals.get(amount.windowId) ?? 0) + amount.amount);
      }
    }
    return totals;
  }

  private assertReservationLifecycle(
    reservation: ProviderLimitReservation,
    events: readonly StoredProviderLimitReservationEvent[],
  ): void {
    if (events.length > 2) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit lifecycle has excess events');
    }
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index]!;
      const previous = events[index - 1];
      if (event.sequence !== index + 1 || event.previousHash !== (previous?.hash ?? null)) {
        throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit event chain is not contiguous');
      }
      if (event.fenceTokenHash !== reservation.fenceTokenHash
        || Date.parse(event.occurredAt) < Date.parse(reservation.requestedAt)
        || (event.type === 'dispatched'
          && Date.parse(event.occurredAt) >= Date.parse(reservation.leaseExpiresAt))
        || (previous !== undefined && Date.parse(event.occurredAt) < Date.parse(previous.occurredAt))) {
        throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit lifecycle scope is invalid');
      }
      if (index === 0 && event.type === 'consumed') {
        throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit lifecycle consumed before dispatch');
      }
      if (index === 1 && (previous?.type !== 'dispatched'
        || (event.type !== 'consumed' && event.type !== 'released'))) {
        throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit lifecycle transition is invalid');
      }
      if (event.type === 'released' && !this.terminationEvidenceVerifier({
        evidenceRef: event.terminationEvidenceRef!, authorityRef: event.terminationAuthorityRef!,
        reservation, event,
      })) {
        throw new ProviderLimitStoreError(
          'INTEGRITY_FAILURE', 'Persisted termination/cancellation evidence is no longer verifiable',
        );
      }
    }
  }

  private verifySnapshotRow(row: SnapshotRow): ProviderLimitResult {
    if (!this.verifyIntegrity(
      'snapshot', row.integrity_key_id, row.payload_json, row.payload_hash, row.integrity_version,
    )) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit snapshot hash mismatch');
    }
    const result = JSON.parse(row.payload_json) as ProviderLimitResult;
    assertProviderLimitResult(result);
    if (row.limit_result_id !== result.limitResultId || row.tenant_id !== result.tenantId
      || row.project_id !== result.projectId || row.idempotency_key !== result.idempotencyKey
      || row.provider !== result.provider || row.account_ref_hash !== result.accountRefHash
      || row.quota_scope_ref_hash !== result.quotaScopeRefHash || row.auth_mode !== result.authMode
      || row.transport !== result.backend.transport
      || row.execution_backend !== result.backend.executionBackend
      || row.endpoint_ref_hash !== result.backend.endpointRefHash
      || row.fetched_at !== result.source.fetchedAt
      || row.expires_at !== result.source.expiresAt) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit snapshot envelope mismatch');
    }
    return result;
  }

  private verifyIncorporatedEvents(snapshot: ProviderLimitResult): void {
    const prefix = 'provider-limit-reservation-event:';
    for (const eventRef of snapshot.source.incorporatedReservationEventRefs) {
      if (!eventRef.startsWith(prefix)) {
        throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Invalid incorporated reservation event reference');
      }
      const eventId = eventRef.slice(prefix.length);
      const eventRow = this.db.prepare(`
        SELECT * FROM provider_limit_reservation_events WHERE event_id = ?
      `).get(eventId) as ReservationEventRow | undefined;
      if (!eventRow) {
        throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Incorporated reservation event does not exist');
      }
      const event = this.eventFromRow(eventRow);
      if (event.type !== 'consumed' || Date.parse(event.occurredAt) > Date.parse(snapshot.source.fetchedAt)) {
        throw new ProviderLimitStoreError(
          'INTEGRITY_FAILURE', 'Provider snapshot cannot incorporate this reservation event',
        );
      }
      const reservationRow = this.db.prepare(`
        SELECT * FROM provider_limit_reservations WHERE reservation_id = ?
      `).get(event.reservationId) as ReservationRow | undefined;
      if (!reservationRow) {
        throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Incorporated reservation is missing');
      }
      const reservation = this.verifyReservationRow(reservationRow);
      if (reservation.tenantId !== snapshot.tenantId || reservation.provider !== snapshot.provider
        || reservation.accountRefHash !== snapshot.accountRefHash
        || reservation.quotaScopeRefHash !== snapshot.quotaScopeRefHash
        || reservation.authMode !== snapshot.authMode) {
        throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Incorporated reservation scope mismatch');
      }
      if (!snapshot.evidenceRefs.includes(event.evidenceRef)
        || !snapshot.evidenceRefs.includes(reservation.receiptRef)) {
        throw new ProviderLimitStoreError(
          'INTEGRITY_FAILURE', 'Provider snapshot lacks usage and invocation coverage evidence',
        );
      }
    }
  }

  private requirePolicy(scope: ProviderLimitSnapshotQuery): ProviderLimitResult['policy'] {
    const policy = this.policyResolver(scope);
    if (policy === null) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit policy authority is unavailable');
    }
    return policy;
  }

  private verifyReservationRow(row: ReservationRow): ProviderLimitReservation {
    if (!this.verifyIntegrity(
      'reservation', row.integrity_key_id, row.payload_json, row.payload_hash, row.integrity_version,
    )) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit reservation hash mismatch');
    }
    const reservation = JSON.parse(row.payload_json) as ProviderLimitReservation;
    assertProviderLimitReservation(reservation);
    if (row.reservation_id !== reservation.reservationId || row.tenant_id !== reservation.tenantId
      || row.project_id !== reservation.projectId || row.idempotency_key !== reservation.idempotencyKey
      || row.run_id !== reservation.runId || row.call_id !== reservation.callId
      || row.attempt_id !== reservation.attemptId
      || row.provider !== reservation.provider || row.account_ref_hash !== reservation.accountRefHash
      || row.model !== reservation.model
      || row.quota_scope_ref_hash !== reservation.quotaScopeRefHash || row.auth_mode !== reservation.authMode
      || row.transport !== reservation.backend.transport
      || row.execution_backend !== reservation.backend.executionBackend
      || row.endpoint_ref_hash !== reservation.backend.endpointRefHash
      || row.decision !== reservation.decision
      || row.requested_at !== reservation.requestedAt || row.lease_expires_at !== reservation.leaseExpiresAt) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit reservation envelope mismatch');
    }
    return reservation;
  }

  private eventFromRow(row: ReservationEventRow): StoredProviderLimitReservationEvent {
    const payload = JSON.parse(row.payload_json) as {
      type: ProviderLimitReservationEvent['type'];
      actual: ProviderLimitReservationEvent['actual'] | null;
      fenceTokenHash: string;
      evidenceRef: string;
      terminationEvidenceRef: string | null;
      terminationAuthorityRef: string | null;
    };
    if (!this.verifyIntegrity(
      'reservation-event-payload',
      row.integrity_key_id,
      row.payload_json,
      row.payload_hash,
      row.integrity_version,
    )) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit event payload hash mismatch');
    }
    const actual = payload.actual ?? undefined;
    const terminationEvidenceRef = payload.terminationEvidenceRef ?? null;
    const terminationAuthorityRef = payload.terminationAuthorityRef ?? null;
    const event: ProviderLimitReservationEvent = {
      eventId: row.event_id,
      type: row.event_type as ProviderLimitReservationEvent['type'],
      occurredAt: row.occurred_at,
      fenceTokenHash: payload.fenceTokenHash,
      evidenceRef: payload.evidenceRef,
      ...(terminationEvidenceRef === null ? {} : { terminationEvidenceRef }),
      ...(terminationAuthorityRef === null ? {} : { terminationAuthorityRef }),
      ...(actual === undefined ? {} : { actual }),
    };
    if (payload.type !== event.type) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit event envelope mismatch');
    }
    assertProviderLimitReservationEvent(event);
    if (!this.verifyIntegrity(
      'reservation-event-payload',
      row.integrity_key_id,
      canonicalJson(reservationEventPayload(event)),
      row.payload_hash,
      row.integrity_version,
    )) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit event hash mismatch');
    }
    const eventEnvelope = canonicalJson({
      reservationId: row.reservation_id, sequence: row.sequence, eventId: row.event_id,
      type: row.event_type, occurredAt: row.occurred_at,
      payloadHash: row.payload_hash, previousHash: row.previous_hash,
    });
    if (!this.verifyIntegrity(
      'reservation-event-chain',
      row.integrity_key_id,
      eventEnvelope,
      row.event_hash,
      row.integrity_version,
    )) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit event chain mismatch');
    }
    return {
      ...event,
      reservationId: row.reservation_id,
      sequence: row.sequence,
      previousHash: row.previous_hash,
      hash: row.event_hash,
    };
  }

  close(): void {
    this.db.close();
  }

  private signIntegrity(kind: string, value: string): ProviderAuthorityMac {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const selected = this.integrityAuthority.sign('limit', value);
      const envelope = canonicalJson({
        domain: 'provider-limit',
        integrityVersion: ROW_INTEGRITY_VERSION,
        keyId: selected.keyId,
        kind,
        value,
      });
      const signed = this.integrityAuthority.sign('limit', envelope);
      if (signed.keyId === selected.keyId
        && signed.authorityRevision === selected.authorityRevision) return signed;
    }
    throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit authority rotated during signing');
  }

  private syncAuthorityForWrite(): void {
    const authority = this.db.prepare(`
      SELECT integrity_check, active_key_id, integrity_version, authority_revision
      FROM provider_limit_authority WHERE singleton_id = 1
    `).get() as {
      integrity_check: string;
      active_key_id: string;
      integrity_version: number;
      authority_revision: number;
    } | undefined;
    const sentinelInput = authority?.integrity_version === 1
      ? 'deckent-provider-limit-store:v1'
      : PROVIDER_LIMIT_SENTINEL_INPUT;
    if (!authority || !this.verifyIntegrity(
      'authority',
      authority.active_key_id,
      sentinelInput,
      authority.integrity_check,
      authority.integrity_version,
    )) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit integrity authority mismatch');
    }
    const current = this.signIntegrity('authority', PROVIDER_LIMIT_SENTINEL_INPUT);
    if (current.authorityRevision < authority.authority_revision
      || (current.authorityRevision === authority.authority_revision
        && authority.active_key_id !== current.keyId)) {
      throw new ProviderLimitStoreError('INTEGRITY_FAILURE', 'Provider limit authority revision is stale');
    }
    if (authority.active_key_id !== current.keyId
      || authority.integrity_version !== ROW_INTEGRITY_VERSION
      || authority.authority_revision !== current.authorityRevision) {
      this.db.prepare(`
        UPDATE provider_limit_authority
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
      if (version !== 1 && version !== ROW_INTEGRITY_VERSION) return false;
      const signedValue = version === 1
        ? value
        : canonicalJson({
          domain: 'provider-limit',
          integrityVersion: ROW_INTEGRITY_VERSION,
          keyId,
          kind,
          value,
        });
      return this.integrityAuthority.verify('limit', keyId, signedValue, mac);
    } catch (error) {
      if (error instanceof ProviderAuthorityKeyringError && error.code === 'KEYRING_UNKNOWN_KEY_ID') {
        throw new ProviderLimitStoreError(
          'INTEGRITY_KEY_UNAVAILABLE',
          'Provider limit evidence references an unavailable authority key',
        );
      }
      throw error;
    }
  }
}
