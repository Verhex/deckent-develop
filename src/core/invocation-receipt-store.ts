import Database from 'better-sqlite3';
import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DECKENT_DIR } from './constants.js';
import {
  INVOCATION_RECEIPT_SCHEMA_VERSION,
  type InvocationDeclarationResult,
  type InvocationEvent,
  type InvocationReceipt,
  type InvocationReceiptLedger,
  type InvocationReceiptRef,
  type InvocationReceiptView,
  type InvocationScope,
  type StoredInvocationEvent,
} from './invocation-receipt.js';

interface InvocationRow {
  invocation_id: string;
  tenant_id: string;
  project_id: string;
  payload_json: string;
  payload_hash: string;
}

interface EventRow {
  event_id: string;
  invocation_id: string;
  sequence: number;
  event_type: InvocationEvent['type'];
  occurred_at: string;
  payload_json: string;
  payload_hash: string;
  prev_hash: string | null;
  event_hash: string;
}

export interface InvocationReceiptStoreOptions {
  readonly dbPath?: string;
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

export class InvocationReceiptStoreError extends Error {
  constructor(
    readonly code: 'SCOPE_MISMATCH' | 'IDEMPOTENCY_CONFLICT' | 'INVOCATION_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'InvocationReceiptStoreError';
  }
}

function canonicalJson(value: unknown): string {
  const normalize = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(normalize);
    if (current && typeof current === 'object') {
      return Object.fromEntries(
        Object.entries(current as Record<string, unknown>)
          .filter(([, entry]) => entry !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    }
    return current;
  };
  return JSON.stringify(normalize(value));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function requireIdentity(label: string, value: string): void {
  if (!value.trim()) {
    throw new InvocationReceiptStoreError('SCOPE_MISMATCH', `${label} must be non-empty`);
  }
}

export class InvocationReceiptStore implements InvocationReceiptLedger {
  readonly projectId: string;
  private readonly db: DatabaseType;
  private readonly idFactory: () => string;
  private readonly now: () => string;
  private readonly selectInvocation: Statement;
  private readonly selectInvocationByKey: Statement;
  private readonly selectEvent: Statement;
  private readonly selectEvents: Statement;

  constructor(projectRoot: string, options: InvocationReceiptStoreOptions = {}) {
    const canonicalRoot = realpathSync.native(projectRoot);
    const rootDigest = sha256(canonicalRoot);
    const dbPath = options.dbPath ?? join(projectRoot, DECKENT_DIR, 'runtime', 'invocations.db');
    mkdirSync(dirname(dbPath), { recursive: true });
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('synchronous = FULL');
    this.initSchema();
    this.projectId = this.bindProject(rootDigest);
    this.selectInvocation = this.db.prepare(`
      SELECT invocation_id, tenant_id, project_id, payload_json, payload_hash
      FROM invocations
      WHERE tenant_id = @tenant_id AND project_id = @project_id AND invocation_id = @invocation_id
    `);
    this.selectInvocationByKey = this.db.prepare(`
      SELECT invocation_id, tenant_id, project_id, payload_json, payload_hash
      FROM invocations
      WHERE tenant_id = @tenant_id AND project_id = @project_id AND idempotency_key = @idempotency_key
    `);
    this.selectEvent = this.db.prepare(`
      SELECT event_id, invocation_id, sequence, event_type, occurred_at,
             payload_json, payload_hash, prev_hash, event_hash
      FROM invocation_events
      WHERE tenant_id = @tenant_id AND project_id = @project_id AND event_id = @event_id
    `);
    this.selectEvents = this.db.prepare(`
      SELECT event_id, invocation_id, sequence, event_type, occurred_at,
             payload_json, payload_hash, prev_hash, event_hash
      FROM invocation_events
      WHERE tenant_id = @tenant_id AND project_id = @project_id AND invocation_id = @invocation_id
      ORDER BY sequence ASC
    `);
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS invocation_project_bindings (
        root_digest TEXT PRIMARY KEY,
        project_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invocations (
        invocation_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (tenant_id, project_id, idempotency_key),
        UNIQUE (tenant_id, project_id, invocation_id)
      );

      CREATE TABLE IF NOT EXISTS invocation_events (
        event_id TEXT PRIMARY KEY,
        invocation_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        prev_hash TEXT,
        event_hash TEXT NOT NULL,
        UNIQUE (invocation_id, sequence),
        FOREIGN KEY (tenant_id, project_id, invocation_id)
          REFERENCES invocations (tenant_id, project_id, invocation_id)
      );

      CREATE INDEX IF NOT EXISTS idx_invocations_scope_created
        ON invocations (tenant_id, project_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_invocation_events_scope_invocation
        ON invocation_events (tenant_id, project_id, invocation_id, sequence);

      CREATE TRIGGER IF NOT EXISTS invocations_no_update
        BEFORE UPDATE ON invocations BEGIN
          SELECT RAISE(ABORT, 'invocations are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS invocations_no_delete
        BEFORE DELETE ON invocations BEGIN
          SELECT RAISE(ABORT, 'invocations are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS invocation_events_no_update
        BEFORE UPDATE ON invocation_events BEGIN
          SELECT RAISE(ABORT, 'invocation events are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS invocation_events_no_delete
        BEFORE DELETE ON invocation_events BEGIN
          SELECT RAISE(ABORT, 'invocation events are immutable');
        END;
    `);
  }

  private bindProject(rootDigest: string): string {
    const projectId = this.idFactory();
    this.db.prepare(`
      INSERT INTO invocation_project_bindings (root_digest, project_id, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT (root_digest) DO NOTHING
    `).run(rootDigest, projectId, this.now());
    const binding = this.db.prepare(
      'SELECT project_id FROM invocation_project_bindings WHERE root_digest = ?',
    ).get(rootDigest) as { project_id: string } | undefined;
    if (!binding) {
      throw new InvocationReceiptStoreError('INVOCATION_NOT_FOUND', 'Project binding was not persisted');
    }
    return binding.project_id;
  }

  private assertScope(scope: InvocationScope): void {
    requireIdentity('tenantId', scope.tenantId);
    requireIdentity('projectId', scope.projectId);
    if (scope.projectId !== this.projectId) {
      throw new InvocationReceiptStoreError(
        'SCOPE_MISMATCH',
        'Receipt project scope does not match this store binding',
      );
    }
  }

  declare(receipt: InvocationReceipt): InvocationDeclarationResult {
    const scope = { tenantId: receipt.tenantId, projectId: receipt.projectId };
    this.assertScope(scope);
    requireIdentity('invocationId', receipt.invocationId);
    requireIdentity('idempotencyKey', receipt.idempotencyKey);
    if (receipt.schemaVersion !== INVOCATION_RECEIPT_SCHEMA_VERSION) {
      throw new InvocationReceiptStoreError('IDEMPOTENCY_CONFLICT', 'Unsupported receipt schema version');
    }
    const payloadJson = canonicalJson(receipt);
    const payloadHash = sha256(payloadJson);
    const declareTransaction = this.db.transaction((): InvocationDeclarationResult => {
      const existing = this.selectInvocationByKey.get({
        tenant_id: receipt.tenantId,
        project_id: receipt.projectId,
        idempotency_key: receipt.idempotencyKey,
      }) as InvocationRow | undefined;
      if (existing) {
        const persisted = JSON.parse(existing.payload_json) as InvocationReceipt;
        const retryPayloadHash = sha256(canonicalJson({ ...receipt, createdAt: persisted.createdAt }));
        if (existing.payload_hash !== retryPayloadHash || existing.invocation_id !== receipt.invocationId) {
          throw new InvocationReceiptStoreError(
            'IDEMPOTENCY_CONFLICT',
            'Invocation idempotency key already exists with different immutable content',
          );
        }
        return { ref: this.toRef(receipt), created: false };
      }
      this.db.prepare(`
        INSERT INTO invocations (
          invocation_id, tenant_id, project_id, idempotency_key, schema_version,
          payload_json, payload_hash, created_at
        ) VALUES (
          @invocation_id, @tenant_id, @project_id, @idempotency_key, @schema_version,
          @payload_json, @payload_hash, @created_at
        )
      `).run({
        invocation_id: receipt.invocationId,
        tenant_id: receipt.tenantId,
        project_id: receipt.projectId,
        idempotency_key: receipt.idempotencyKey,
        schema_version: receipt.schemaVersion,
        payload_json: payloadJson,
        payload_hash: payloadHash,
        created_at: receipt.createdAt,
      });
      return { ref: this.toRef(receipt), created: true };
    });
    return declareTransaction.immediate();
  }

  append(scope: InvocationScope, invocationId: string, event: InvocationEvent): StoredInvocationEvent {
    this.assertScope(scope);
    const semanticJson = canonicalJson({ type: event.type, payload: event.payload });
    const payloadHash = sha256(semanticJson);
    const appendTransaction = this.db.transaction((): StoredInvocationEvent => {
      const invocation = this.selectInvocation.get({
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        invocation_id: invocationId,
      }) as InvocationRow | undefined;
      if (!invocation) {
        throw new InvocationReceiptStoreError('INVOCATION_NOT_FOUND', 'Invocation not found in scope');
      }
      const duplicate = this.selectEvent.get({
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        event_id: event.eventId,
      }) as EventRow | undefined;
      if (duplicate) {
        if (duplicate.invocation_id !== invocationId || duplicate.payload_hash !== payloadHash) {
          throw new InvocationReceiptStoreError(
            'IDEMPOTENCY_CONFLICT',
            'Invocation event id already exists with different immutable content',
          );
        }
        return this.eventFromRow(duplicate);
      }
      const previous = this.db.prepare(`
        SELECT sequence, event_hash FROM invocation_events
        WHERE tenant_id = ? AND project_id = ? AND invocation_id = ?
        ORDER BY sequence DESC LIMIT 1
      `).get(scope.tenantId, scope.projectId, invocationId) as
        { sequence: number; event_hash: string } | undefined;
      const sequence = (previous?.sequence ?? 0) + 1;
      const occurredAt = event.occurredAt ?? this.now();
      const previousHash = previous?.event_hash ?? null;
      const eventHash = sha256(canonicalJson({
        invocationId,
        sequence,
        eventId: event.eventId,
        eventType: event.type,
        occurredAt,
        payloadHash,
        previousHash,
      }));
      this.db.prepare(`
        INSERT INTO invocation_events (
          event_id, invocation_id, tenant_id, project_id, sequence, event_type,
          occurred_at, payload_json, payload_hash, prev_hash, event_hash
        ) VALUES (
          @event_id, @invocation_id, @tenant_id, @project_id, @sequence, @event_type,
          @occurred_at, @payload_json, @payload_hash, @prev_hash, @event_hash
        )
      `).run({
        event_id: event.eventId,
        invocation_id: invocationId,
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        sequence,
        event_type: event.type,
        occurred_at: occurredAt,
        payload_json: canonicalJson(event.payload),
        payload_hash: payloadHash,
        prev_hash: previousHash,
        event_hash: eventHash,
      });
      return {
        eventId: event.eventId,
        invocationId,
        sequence,
        type: event.type,
        occurredAt,
        payload: event.payload,
        payloadHash,
        previousHash,
        hash: eventHash,
      };
    });
    return appendTransaction.immediate();
  }

  get(scope: InvocationScope, invocationId: string): InvocationReceiptView | null {
    this.assertScope(scope);
    const row = this.selectInvocation.get({
      tenant_id: scope.tenantId,
      project_id: scope.projectId,
      invocation_id: invocationId,
    }) as InvocationRow | undefined;
    if (!row) return null;
    const receipt = JSON.parse(row.payload_json) as InvocationReceipt;
    const events = (this.selectEvents.all({
      tenant_id: scope.tenantId,
      project_id: scope.projectId,
      invocation_id: invocationId,
    }) as EventRow[]).map(event => this.eventFromRow(event));
    let transportOutcome: InvocationReceiptView['transportOutcome'] = 'not_dispatched';
    let consumerOutcome: InvocationReceiptView['consumerOutcome'] = 'unknown';
    if (events.some(event => event.type === 'dispatch_started')) transportOutcome = 'unknown';
    for (const event of events) {
      if (event.type === 'transport_settled') {
        const payload = event.payload as Extract<InvocationEvent, { type: 'transport_settled' }>['payload'];
        transportOutcome = payload.outcome;
      }
      if (event.type === 'consumer_settled') {
        const payload = event.payload as Extract<InvocationEvent, { type: 'consumer_settled' }>['payload'];
        consumerOutcome = payload.outcome;
      }
    }
    return { receipt, events, transportOutcome, consumerOutcome };
  }

  close(): void {
    if (this.db.open) this.db.close();
  }

  private toRef(receipt: InvocationReceipt): InvocationReceiptRef {
    return {
      schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
      invocationId: receipt.invocationId,
      tenantId: receipt.tenantId,
      projectId: receipt.projectId,
    };
  }

  private eventFromRow(row: EventRow): StoredInvocationEvent {
    return {
      eventId: row.event_id,
      invocationId: row.invocation_id,
      sequence: row.sequence,
      type: row.event_type,
      occurredAt: row.occurred_at,
      payload: JSON.parse(row.payload_json) as InvocationEvent['payload'],
      payloadHash: row.payload_hash,
      previousHash: row.prev_hash,
      hash: row.event_hash,
    };
  }
}
