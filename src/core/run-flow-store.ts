// ═══ run-flow-store — canonical durable RunFlow authority ════════════════
//
// SQLite is the canonical multi-process authority. The historical per-flow
// JSONL files remain compatibility projections only: they are imported once,
// rebuilt/reconciled from canonical rows when uncertain, and never consulted
// by public reads after migration. A projection failure therefore cannot make
// a committed canonical mutation retryable; callers receive a typed error
// carrying `canonicalCommitState: 'committed'`.

import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import Database from 'better-sqlite3';

import { RUNTIME_DIR } from './constants.js';
import type { ExecutionPlanDigestContext } from './execution-plan-digest.js';
import {
  isTerminalStartAttemptState,
  type RunFlowEvent,
  type RunHandle as ContractRunHandle,
  type RunFlowPlanLineageRecord,
  type RunProposal,
  type StartAttemptLineage,
  type StartAttemptOwner,
  type StartAttemptProcessIdentity,
  type StartAttemptRecord,
  type StartAttemptSettlement,
  type StartAttemptState,
} from './run-flow-contract.js';
import type { Sprint } from './types.js';
import type { ActorContext } from './work-model.js';

export const RUN_FLOW_STORE_SCHEMA_VERSION = 2;
const SQLITE_BUSY_TIMEOUT_MS = 60_000;
const SQLITE_JOURNAL_MODE_TRANSITION_ATTEMPTS = 12;
const SQLITE_JOURNAL_MODE_BACKOFF_BASE_MS = 5;
const SQLITE_JOURNAL_MODE_BACKOFF_MAX_MS = 100;
const SQLITE_JOURNAL_MODE_WAITER = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
const EVENT_READ_DEFAULT_LIMIT = 1_000;
const START_ATTEMPT_READ_DEFAULT_LIMIT = 200;
const START_ATTEMPT_READ_MAX_LIMIT = 1_000;
const START_ATTEMPT_STATES = new Set<StartAttemptState>([
  'PREPARED',
  'PROCESS_SPAWNED',
  'ADMITTED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'BLOCKED',
  'UNKNOWN',
]);

type RecordKind = 'snapshot' | 'handle' | 'event' | 'plan';

export type RunFlowStoreErrorCode =
  | 'SCHEMA_UNSUPPORTED'
  | 'JOURNAL_MODE_TRANSITION_BUSY'
  | 'JOURNAL_MODE_CONFIGURATION_FAILED'
  | 'CANONICAL_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'CANONICAL_WRITE_FAILED'
  | 'PROJECTION_UNCERTAIN'
  | 'CORRUPT_RECORD'
  | 'START_ATTEMPT_NOT_FOUND'
  | 'START_ATTEMPT_CAS_MISMATCH'
  | 'START_ATTEMPT_ID_CONFLICT'
  | 'START_ATTEMPT_STATE_CONFLICT';

export class RunFlowStoreError extends Error {
  constructor(
    readonly code: RunFlowStoreErrorCode,
    message: string,
    readonly canonicalCommitState: 'not-committed' | 'committed',
    readonly recoveryRef?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'RunFlowStoreError';
  }
}

/** Durable form of an approved plan, including the exact planned Sprint. */
export interface StoredApprovedSnapshot {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest: string;
  readonly planDigestVersion?: number;
  readonly planDigestContext?: ExecutionPlanDigestContext;
  readonly approvedBy: ActorContext;
  readonly approvedAt: string;
  readonly sprint: Sprint;
  readonly proposal?: RunProposal;
  readonly planLineage?: RunFlowPlanLineageRecord;
}

/** Durable record of an actual start attempt for a flow. */
export interface StoredRunHandleRecord {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest: string;
  readonly handle: ContractRunHandle;
  readonly startedAt: string;
  readonly pid?: number;
  readonly startToken?: string | null;
  readonly gitBase?: string;
}

/** Exact planned Sprint captured at preview time. */
export interface StoredPlannedSprint {
  readonly flowId: string;
  readonly revision: number;
  readonly sprint: unknown;
  readonly planDigest?: string;
  readonly planDigestVersion?: number;
  readonly planDigestContext?: ExecutionPlanDigestContext;
  readonly proposal?: RunProposal;
  readonly lineage?: RunFlowPlanLineageRecord;
}

export interface PrepareStartAttemptInput {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest: string;
  readonly attemptId: string;
  readonly preparedAt: string;
  readonly lineage: StartAttemptLineage;
  readonly owner: StartAttemptOwner;
  /**
   * Required when advancing beyond generation zero. It is the explicit CAS
   * authority to create a new generation after a terminal predecessor.
   */
  readonly expectedPrevious?: {
    readonly generation: number;
    readonly attemptId: string;
  };
}

export interface PrepareStartAttemptResult {
  readonly applied: boolean;
  readonly attempt: StartAttemptRecord;
}

export interface StartAttemptCas {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest: string;
  readonly generation: number;
  readonly attemptId: string;
  /** Capability minted at PREPARED and handed to the exact child. */
  readonly ownerNonce: string;
}

export interface RecordStartAttemptProcessInput extends StartAttemptCas {
  readonly process: StartAttemptProcessIdentity;
  readonly spawnedAt: string;
}

export interface AdmitStartAttemptInput extends StartAttemptCas {
  readonly process: StartAttemptProcessIdentity;
  readonly handle: ContractRunHandle;
  readonly admittedAt: string;
  readonly gitBase?: string;
}

export interface SettleStartAttemptInput extends StartAttemptCas {
  readonly settlement: StartAttemptSettlement;
  readonly authority:
    | { readonly kind: 'owner-capability' }
    | { readonly kind: 'effect-unknown' }
    | {
        readonly kind: 'process-recovery';
        readonly observedOwnership: 'dead' | 'reused';
        readonly observedAt: string;
      }
    | {
        readonly kind: 'preparer-recovery';
        readonly observedOwnership: 'dead' | 'reused';
        readonly observedAt: string;
      };
}

export interface ListStartAttemptsOptions {
  /** Exclusive deterministic cursor. */
  readonly afterFlowId?: string;
  /** Defaults to 200; hard-capped at 1,000. */
  readonly limit?: number;
  /** Optional current-state filter. */
  readonly states?: readonly StartAttemptState[];
}

export interface ListStartAttemptsResult {
  readonly attempts: readonly StartAttemptRecord[];
  readonly nextCursor?: string;
}

export interface ReadFlowEventsOptions {
  /** Return only events whose canonical sequence is greater than this cursor. */
  readonly afterSequence?: number;
  /** Bounded page size. Omit to preserve the historical unbounded read API. */
  readonly limit?: number;
}

export interface AppendFlowEventsOptions {
  /** Optimistic CAS against the canonical event head. */
  readonly expectedLastSequence?: number;
}

export interface AppendFlowEventsResult {
  readonly applied: boolean;
  readonly events: readonly RunFlowEvent[];
  readonly firstSequence: number;
  readonly lastSequence: number;
}

interface RecordRow {
  readonly payload_json: string;
  readonly payload_hash: string;
  readonly ordinal: number;
  readonly sequence: number | null;
}

interface CommandRow {
  readonly payload_hash: string;
  readonly first_sequence: number;
  readonly last_sequence: number;
  readonly event_count: number;
}

interface ProjectionStateRow {
  readonly projected_ordinal: number;
}

function storeDir(root: string): string {
  return join(root, RUNTIME_DIR, 'run-flow-store');
}

function databasePath(root: string): string {
  return join(storeDir(root), 'run-flow-authority.sqlite');
}

function projectionPath(root: string, flowId: string, kind: RecordKind): string {
  const suffix: Record<RecordKind, string> = {
    snapshot: '.snapshot.jsonl',
    handle: '.handle.jsonl',
    event: '.events.jsonl',
    plan: '.plan.jsonl',
  };
  return join(storeDir(root), `${flowId}${suffix[kind]}`);
}

function projectionIntentPath(root: string, flowId: string, kind: RecordKind): string {
  return `${projectionPath(root, flowId, kind)}.projection-intent`;
}

function hasStoreEvidence(root: string): boolean {
  const dbPath = databasePath(root);
  if (existsSync(dbPath)) return true;
  const dir = storeDir(root);
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).some((name) => classifyLegacyFile(name) !== undefined);
  } catch {
    return false;
  }
}

function hashPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hashSerializedPayload(payloadJson: string): string {
  return createHash('sha256').update(payloadJson).digest('hex');
}

function assertPayloadHash(row: { payload_json: string; payload_hash: string }, label: string): void {
  if (hashSerializedPayload(row.payload_json) !== row.payload_hash) {
    throw new RunFlowStoreError(
      'CORRUPT_RECORD',
      `run-flow-store: canonical ${label} payload hash does not match`,
      'not-committed',
    );
  }
}

function parsePayload<T>(row: { payload_json: string; payload_hash?: string }, label: string): T {
  if (row.payload_hash !== undefined) assertPayloadHash(row as { payload_json: string; payload_hash: string }, label);
  try {
    return JSON.parse(row.payload_json) as T;
  } catch (cause) {
    throw new RunFlowStoreError(
      'CORRUPT_RECORD',
      `run-flow-store: canonical ${label} payload is not valid JSON`,
      'not-committed',
      undefined,
      { cause },
    );
  }
}

function immediate<T>(db: Database.Database, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.inTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

function initialiseSchema(db: Database.Database): void {
  const observedVersion = db.pragma('user_version', { simple: true }) as number;
  if (observedVersion === RUN_FLOW_STORE_SCHEMA_VERSION) return;
  if (observedVersion > RUN_FLOW_STORE_SCHEMA_VERSION) {
    throw new RunFlowStoreError(
      'SCHEMA_UNSUPPORTED',
      `run-flow-store: schema v${observedVersion} is newer than supported v${RUN_FLOW_STORE_SCHEMA_VERSION}`,
      'not-committed',
    );
  }

  immediate(db, () => {
    const version = db.pragma('user_version', { simple: true }) as number;
    if (version > RUN_FLOW_STORE_SCHEMA_VERSION) {
      throw new RunFlowStoreError(
        'SCHEMA_UNSUPPORTED',
        `run-flow-store: schema v${version} is newer than supported v${RUN_FLOW_STORE_SCHEMA_VERSION}`,
        'not-committed',
      );
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS run_flow_records (
        kind TEXT NOT NULL CHECK (kind IN ('snapshot', 'handle', 'event', 'plan')),
        flow_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal > 0),
        sequence INTEGER,
        command_id TEXT,
        event_type TEXT,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('canonical', 'legacy-jsonl')),
        PRIMARY KEY (kind, flow_id, ordinal),
        CHECK (
          (kind = 'event' AND sequence = ordinal AND event_type IS NOT NULL)
          OR
          (kind <> 'event' AND sequence IS NULL AND command_id IS NULL AND event_type IS NULL)
        )
      ) WITHOUT ROWID;

      CREATE UNIQUE INDEX IF NOT EXISTS run_flow_event_sequence_uq
        ON run_flow_records(flow_id, sequence)
        WHERE kind = 'event';
      CREATE INDEX IF NOT EXISTS run_flow_records_latest_idx
        ON run_flow_records(kind, flow_id, ordinal DESC);
      CREATE INDEX IF NOT EXISTS run_flow_event_command_idx
        ON run_flow_records(flow_id, command_id, ordinal)
        WHERE kind = 'event' AND command_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS run_flow_commands (
        flow_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        first_sequence INTEGER NOT NULL,
        last_sequence INTEGER NOT NULL,
        event_count INTEGER NOT NULL CHECK (event_count > 0),
        committed_at TEXT NOT NULL,
        PRIMARY KEY (flow_id, command_id)
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS run_flow_projection_state (
        kind TEXT NOT NULL,
        flow_id TEXT NOT NULL,
        projected_ordinal INTEGER NOT NULL CHECK (projected_ordinal >= 0),
        projected_at TEXT NOT NULL,
        PRIMARY KEY (kind, flow_id)
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS run_flow_store_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS run_flow_migration_issues (
        source_file TEXT NOT NULL,
        line_number INTEGER NOT NULL,
        reason TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        PRIMARY KEY (source_file, line_number)
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS run_flow_start_attempt_identities (
        flow_id TEXT NOT NULL,
        generation INTEGER NOT NULL CHECK (generation > 0),
        attempt_id TEXT NOT NULL UNIQUE,
        revision INTEGER NOT NULL CHECK (revision > 0),
        plan_digest TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        lineage_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (flow_id, generation)
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS run_flow_start_attempt_journal (
        flow_id TEXT NOT NULL,
        generation INTEGER NOT NULL CHECK (generation > 0),
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        revision INTEGER NOT NULL CHECK (revision > 0),
        plan_digest TEXT NOT NULL,
        attempt_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK (
          state IN (
            'PREPARED', 'PROCESS_SPAWNED', 'ADMITTED',
            'COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED', 'UNKNOWN'
          )
        ),
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        PRIMARY KEY (flow_id, generation, sequence),
        FOREIGN KEY (flow_id, generation)
          REFERENCES run_flow_start_attempt_identities(flow_id, generation)
      ) WITHOUT ROWID;

      CREATE INDEX IF NOT EXISTS run_flow_start_attempt_latest_idx
        ON run_flow_start_attempt_journal(flow_id, generation DESC, sequence DESC);
      CREATE INDEX IF NOT EXISTS run_flow_start_attempt_state_idx
        ON run_flow_start_attempt_journal(state, flow_id, generation DESC, sequence DESC);
      CREATE INDEX IF NOT EXISTS run_flow_start_attempt_id_idx
        ON run_flow_start_attempt_journal(attempt_id, sequence DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS run_flow_start_attempt_idempotency_uq
        ON run_flow_start_attempt_identities(tenant_id, idempotency_key);
    `);

    if (version < RUN_FLOW_STORE_SCHEMA_VERSION) {
      db.pragma(`user_version = ${RUN_FLOW_STORE_SCHEMA_VERSION}`);
    }
  });
}

function classifyLegacyFile(name: string): { flowId: string; kind: RecordKind } | undefined {
  const suffixes: readonly [string, RecordKind][] = [
    ['.snapshot.jsonl', 'snapshot'],
    ['.handle.jsonl', 'handle'],
    ['.events.jsonl', 'event'],
    ['.plan.jsonl', 'plan'],
  ];
  for (const [suffix, kind] of suffixes) {
    if (name.length > suffix.length && name.endsWith(suffix)) {
      return { flowId: name.slice(0, -suffix.length), kind };
    }
  }
  return undefined;
}

function eventBatchHash(events: readonly RunFlowEvent[]): string {
  const withoutSequences = events.map((event) => {
    const { sequence: _sequence, timestamp: _timestamp, ...rest } = event;
    return rest;
  });
  return hashPayload(withoutSequences);
}

function recordMigrationIssue(
  db: Database.Database,
  sourceFile: string,
  lineNumber: number,
  reason: string,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO run_flow_migration_issues(source_file, line_number, reason, observed_at)
    VALUES (?, ?, ?, ?)
  `).run(sourceFile, lineNumber, reason, new Date().toISOString());
}

/**
 * One-time, transactionally fenced legacy JSONL import. Valid records preserve
 * their per-kind order; malformed/mismatched lines remain on disk and receive
 * explicit migration-issue evidence instead of being silently authoritative.
 */
function migrateLegacyJsonl(db: Database.Database, root: string): void {
  const observed = db.prepare(`
    SELECT value FROM run_flow_store_meta WHERE key = 'legacy_jsonl_migration_v1'
  `).get() as { value: string } | undefined;
  if (observed) return;

  immediate(db, () => {
    const completed = db.prepare(`
      SELECT value FROM run_flow_store_meta WHERE key = 'legacy_jsonl_migration_v1'
    `).get() as { value: string } | undefined;
    if (completed) return;

    const dir = storeDir(root);
    const entries = existsSync(dir) ? readdirSync(dir).sort() : [];
    let imported = 0;
    let malformed = 0;

    for (const name of entries) {
      const classified = classifyLegacyFile(name);
      if (!classified) continue;
      const fullPath = join(dir, name);
      let raw: string;
      try {
        raw = readFileSync(fullPath, 'utf8');
      } catch (error) {
        malformed += 1;
        recordMigrationIssue(db, name, 0, `read-failed:${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      const lines = raw.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const trimmed = lines[index]!.trim();
        if (trimmed.length === 0) continue;

        let payload: Record<string, unknown>;
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('record is not an object');
          }
          payload = parsed as Record<string, unknown>;
        } catch (error) {
          malformed += 1;
          recordMigrationIssue(
            db,
            name,
            index + 1,
            `invalid-json:${error instanceof Error ? error.message : String(error)}`,
          );
          continue;
        }

        if (payload.flowId !== classified.flowId) {
          malformed += 1;
          recordMigrationIssue(db, name, index + 1, 'flow-id-mismatch');
          continue;
        }

        const currentHead = db.prepare(`
          SELECT COALESCE(MAX(ordinal), 0) AS head
          FROM run_flow_records WHERE kind = ? AND flow_id = ?
        `).get(classified.kind, classified.flowId) as { head: number };

        let ordinal = currentHead.head + 1;
        let sequence: number | null = null;
        let commandId: string | null = null;
        let eventType: string | null = null;
        if (classified.kind === 'event') {
          const candidate = payload.sequence;
          sequence = Number.isSafeInteger(candidate) && Number(candidate) > 0
            ? Number(candidate)
            : ordinal;
          ordinal = sequence;
          commandId = typeof payload.commandId === 'string' ? payload.commandId : null;
          eventType = typeof payload.type === 'string' ? payload.type : null;
          if (eventType === null) {
            malformed += 1;
            recordMigrationIssue(db, name, index + 1, 'event-type-missing');
            continue;
          }
        }

        try {
          db.prepare(`
            INSERT INTO run_flow_records(
              kind, flow_id, ordinal, sequence, command_id, event_type,
              payload_json, payload_hash, created_at, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'legacy-jsonl')
          `).run(
            classified.kind,
            classified.flowId,
            ordinal,
            sequence,
            commandId,
            eventType,
            JSON.stringify(payload),
            hashPayload(payload),
            typeof payload.timestamp === 'string'
              ? payload.timestamp
              : typeof payload.approvedAt === 'string'
                ? payload.approvedAt
                : typeof payload.startedAt === 'string'
                  ? payload.startedAt
                  : new Date().toISOString(),
          );
          imported += 1;
        } catch (error) {
          malformed += 1;
          recordMigrationIssue(
            db,
            name,
            index + 1,
            `canonical-conflict:${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    const commandGroups = db.prepare(`
      SELECT flow_id, command_id
      FROM run_flow_records
      WHERE kind = 'event' AND command_id IS NOT NULL
      GROUP BY flow_id, command_id
    `).all() as { flow_id: string; command_id: string }[];

    for (const group of commandGroups) {
      const rows = db.prepare(`
        SELECT payload_json, payload_hash, sequence
        FROM run_flow_records
        WHERE kind = 'event' AND flow_id = ? AND command_id = ?
        ORDER BY sequence ASC
      `).all(group.flow_id, group.command_id) as { payload_json: string; payload_hash: string; sequence: number }[];
      const events = rows.map((row) => parsePayload<RunFlowEvent>(row, 'legacy event'));
      db.prepare(`
        INSERT OR IGNORE INTO run_flow_commands(
          flow_id, command_id, payload_hash, first_sequence, last_sequence, event_count, committed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        group.flow_id,
        group.command_id,
        eventBatchHash(events),
        rows[0]!.sequence,
        rows[rows.length - 1]!.sequence,
        rows.length,
        new Date().toISOString(),
      );
    }

    db.prepare(`
      INSERT INTO run_flow_store_meta(key, value) VALUES ('legacy_jsonl_migration_v1', ?)
    `).run(JSON.stringify({ imported, malformed, completedAt: new Date().toISOString() }));
  });
}

function openStore(root: string): Database.Database {
  const dir = storeDir(root);
  mkdirSync(dir, { recursive: true });
  const db = new Database(databasePath(root));
  try {
    configureWalJournalMode(db);
    db.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = FULL');
    initialiseSchema(db);
    migrateLegacyJsonl(db, root);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function isSqliteJournalModeContention(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED';
}

function readJournalMode(db: Database.Database): string {
  const mode = db.pragma('journal_mode', { simple: true });
  if (typeof mode !== 'string' || mode.trim().length === 0) {
    throw new RunFlowStoreError(
      'JOURNAL_MODE_CONFIGURATION_FAILED',
      `run-flow-store: SQLite returned an invalid journal mode '${String(mode)}'`,
      'not-committed',
    );
  }
  return mode.trim().toLowerCase();
}

function configureWalJournalMode(db: Database.Database): void {
  try {
    // The transition retry policy is bounded independently from the mutation
    // busy timeout configured after WAL is established.
    db.pragma('busy_timeout = 0');
  } catch (cause) {
    throw new RunFlowStoreError(
      'JOURNAL_MODE_CONFIGURATION_FAILED',
      'run-flow-store: failed to configure the SQLite journal transition policy',
      'not-committed',
      undefined,
      { cause },
    );
  }

  let lastContention: unknown;
  try {
    if (readJournalMode(db) === 'wal') return;
  } catch (cause) {
    if (cause instanceof RunFlowStoreError) throw cause;
    if (!isSqliteJournalModeContention(cause)) {
      throw new RunFlowStoreError(
        'JOURNAL_MODE_CONFIGURATION_FAILED',
        'run-flow-store: failed to inspect SQLite journal mode',
        'not-committed',
        undefined,
        { cause },
      );
    }
    lastContention = cause;
  }

  let backoffMs = SQLITE_JOURNAL_MODE_BACKOFF_BASE_MS;
  for (let attempt = 1; attempt <= SQLITE_JOURNAL_MODE_TRANSITION_ATTEMPTS; attempt += 1) {
    try {
      const transitionedMode = db.pragma('journal_mode = WAL', { simple: true });
      if (
        typeof transitionedMode !== 'string'
        || transitionedMode.trim().toLowerCase() !== 'wal'
      ) {
        throw new RunFlowStoreError(
          'JOURNAL_MODE_CONFIGURATION_FAILED',
          `run-flow-store: SQLite refused WAL journal mode and reported '${String(transitionedMode)}'`,
          'not-committed',
        );
      }
      return;
    } catch (cause) {
      if (cause instanceof RunFlowStoreError) throw cause;
      if (!isSqliteJournalModeContention(cause)) {
        throw new RunFlowStoreError(
          'JOURNAL_MODE_CONFIGURATION_FAILED',
          'run-flow-store: failed to configure SQLite WAL journal mode',
          'not-committed',
          undefined,
          { cause },
        );
      }
      lastContention = cause;
      if (attempt === SQLITE_JOURNAL_MODE_TRANSITION_ATTEMPTS) break;
      Atomics.wait(SQLITE_JOURNAL_MODE_WAITER, 0, 0, backoffMs);
      const doubledBackoffMs = backoffMs * 2;
      backoffMs = doubledBackoffMs < SQLITE_JOURNAL_MODE_BACKOFF_MAX_MS
        ? doubledBackoffMs
        : SQLITE_JOURNAL_MODE_BACKOFF_MAX_MS;
    }
  }

  throw new RunFlowStoreError(
    'JOURNAL_MODE_TRANSITION_BUSY',
    'run-flow-store: SQLite WAL journal transition remained busy after bounded retries',
    'not-committed',
    undefined,
    { cause: lastContention },
  );
}

function withStore<T>(root: string, operation: (db: Database.Database) => T): T {
  const db = openStore(root);
  try {
    return operation(db);
  } finally {
    db.close();
  }
}

function durableAtomicReplace(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(tmpPath, 'wx', 0o600);
    writeFileSync(fd, content, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(tmpPath, path);
    const dirFd = openSync(dirname(path), 'r');
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch (error) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Preserve the original projection error.
      }
    }
    try {
      unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup; canonical state is unaffected.
    }
    throw error;
  }
}

function durableAppend(path: string, content: string): void {
  const fd = openSync(path, 'a', 0o600);
  try {
    writeFileSync(fd, content, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function projectionHasCompleteTail(path: string, projectedOrdinal: number): boolean {
  if (!existsSync(path)) return false;
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    if (size === 0) return projectedOrdinal === 0;
    const tail = Buffer.allocUnsafe(1);
    return readSync(fd, tail, 0, 1, size - 1) === 1 && tail[0] === 0x0a;
  } finally {
    closeSync(fd);
  }
}

/**
 * Serialize a compatibility projection behind SQLite's write lock. An intent
 * marker survives every crash window. A later writer seeing that marker
 * rebuilds the projection atomically from canonical rows before appending.
 * Steady-state projection is O(delta); recovery is intentionally O(history).
 */
function reconcileProjection(db: Database.Database, root: string, flowId: string, kind: RecordKind): void {
  const path = projectionPath(root, flowId, kind);
  const intentPath = projectionIntentPath(root, flowId, kind);
  const intentToken = randomUUID();
  let committed = false;
  try {
    immediate(db, () => {
      const rows = db.prepare(`
        SELECT payload_json, payload_hash, ordinal, sequence
        FROM run_flow_records
        WHERE kind = ? AND flow_id = ?
        ORDER BY ordinal ASC
      `).all(kind, flowId) as RecordRow[];
      const head = rows[rows.length - 1]?.ordinal ?? 0;
      const state = db.prepare(`
        SELECT projected_ordinal
        FROM run_flow_projection_state
        WHERE kind = ? AND flow_id = ?
      `).get(kind, flowId) as ProjectionStateRow | undefined;

      if (state?.projected_ordinal === head && existsSync(path) && !existsSync(intentPath)) return;

      const hadRecoveryIntent = existsSync(intentPath);
      durableAtomicReplace(
        intentPath,
        JSON.stringify({ kind, flowId, targetOrdinal: head, token: intentToken }) + '\n',
      );

      const mustRebuild =
        hadRecoveryIntent
        || state === undefined
        || !projectionHasCompleteTail(path, state?.projected_ordinal ?? 0)
        || state.projected_ordinal > head;
      if (mustRebuild || state === undefined) {
        for (const row of rows) assertPayloadHash(row, `${kind} projection`);
        durableAtomicReplace(path, rows.map((row) => row.payload_json).join('\n') + (rows.length > 0 ? '\n' : ''));
      } else {
        const delta = rows.filter((row) => row.ordinal > state.projected_ordinal);
        if (delta.length > 0) {
          for (const row of delta) assertPayloadHash(row, `${kind} projection`);
          durableAppend(path, delta.map((row) => row.payload_json).join('\n') + '\n');
        }
      }

      db.prepare(`
        INSERT INTO run_flow_projection_state(kind, flow_id, projected_ordinal, projected_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(kind, flow_id) DO UPDATE SET
          projected_ordinal = excluded.projected_ordinal,
          projected_at = excluded.projected_at
      `).run(kind, flowId, head, new Date().toISOString());
    });
    committed = true;
  } catch (cause) {
    throw new RunFlowStoreError(
      'PROJECTION_UNCERTAIN',
      `run-flow-store: canonical ${kind} mutation committed but compatibility projection is uncertain`,
      'committed',
      intentPath,
      { cause },
    );
  } finally {
    if (committed) {
      try {
        const currentIntent = JSON.parse(readFileSync(intentPath, 'utf8')) as { token?: unknown };
        // Never remove a newer process's crash-recovery marker.
        if (currentIntent.token === intentToken) unlinkSync(intentPath);
      } catch {
        // A stale intent forces a safe full rebuild on the next mutation.
      }
    }
  }
}

function appendRecord(root: string, kind: Exclude<RecordKind, 'event'>, flowId: string, payload: unknown): void {
  withStore(root, (db) => {
    try {
      immediate(db, () => {
        const head = db.prepare(`
          SELECT COALESCE(MAX(ordinal), 0) AS head
          FROM run_flow_records WHERE kind = ? AND flow_id = ?
        `).get(kind, flowId) as { head: number };
        const ordinal = head.head + 1;
        const payloadJson = JSON.stringify(payload);
        db.prepare(`
          INSERT INTO run_flow_records(
            kind, flow_id, ordinal, sequence, command_id, event_type,
            payload_json, payload_hash, created_at, source
          ) VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?, ?, 'canonical')
        `).run(kind, flowId, ordinal, payloadJson, hashPayload(payload), new Date().toISOString());
      });
    } catch (cause) {
      if (cause instanceof RunFlowStoreError) throw cause;
      throw new RunFlowStoreError(
        'CANONICAL_WRITE_FAILED',
        `run-flow-store: failed to commit canonical ${kind} record for flow '${flowId}'`,
        'not-committed',
        undefined,
        { cause },
      );
    }
    reconcileProjection(db, root, flowId, kind);
  });
}

interface StartAttemptPayloadRow {
  readonly payload_json: string;
  readonly payload_hash: string;
}

function assertNonEmptyBounded(value: string, label: string, maxLength = 4_096): void {
  if (value.trim().length === 0 || value.length > maxLength) {
    throw new RunFlowStoreError(
      'CANONICAL_WRITE_FAILED',
      `run-flow-store: ${label} must be non-empty and at most ${maxLength} characters`,
      'not-committed',
    );
  }
}

function assertStartAttemptCas(cas: StartAttemptCas): void {
  assertNonEmptyBounded(cas.flowId, 'start-attempt flowId');
  assertNonEmptyBounded(cas.planDigest, 'start-attempt planDigest');
  assertNonEmptyBounded(cas.attemptId, 'start-attempt attemptId');
  assertNonEmptyBounded(cas.ownerNonce, 'start-attempt ownerNonce');
  if (!Number.isSafeInteger(cas.revision) || cas.revision <= 0) {
    throw new RunFlowStoreError(
      'CANONICAL_WRITE_FAILED',
      'run-flow-store: start-attempt revision must be a positive safe integer',
      'not-committed',
    );
  }
  if (!Number.isSafeInteger(cas.generation) || cas.generation <= 0) {
    throw new RunFlowStoreError(
      'CANONICAL_WRITE_FAILED',
      'run-flow-store: start-attempt generation must be a positive safe integer',
      'not-committed',
    );
  }
}

function assertTimestamp(value: string, label: string): void {
  if (value.trim().length === 0 || !Number.isFinite(Date.parse(value))) {
    throw new RunFlowStoreError(
      'CANONICAL_WRITE_FAILED',
      `run-flow-store: ${label} must be an ISO-8601 timestamp`,
      'not-committed',
    );
  }
}

function assertProcessIdentity(processIdentity: StartAttemptProcessIdentity, label: string): void {
  if (!Number.isSafeInteger(processIdentity.pid) || processIdentity.pid <= 0) {
    throw new RunFlowStoreError(
      'CANONICAL_WRITE_FAILED',
      `run-flow-store: ${label} pid must be a positive safe integer`,
      'not-committed',
    );
  }
  if (processIdentity.evidence === 'verified') {
    if (processIdentity.startToken === null) {
      throw new RunFlowStoreError(
        'CANONICAL_WRITE_FAILED',
        `run-flow-store: ${label} verified identity requires a start token`,
        'not-committed',
      );
    }
    assertNonEmptyBounded(processIdentity.startToken, `${label} startToken`);
    return;
  }
  if (processIdentity.evidence !== 'unavailable' || processIdentity.startToken !== null) {
    throw new RunFlowStoreError(
      'CANONICAL_WRITE_FAILED',
      `run-flow-store: ${label} unavailable identity must carry a null start token`,
      'not-committed',
    );
  }
}

function assertStartAttemptOwner(owner: StartAttemptOwner): void {
  assertProcessIdentity(owner.process, 'start-attempt owner');
  assertNonEmptyBounded(owner.ownerNonce, 'start-attempt ownerNonce');
  assertTimestamp(owner.leaseUntil, 'start-attempt leaseUntil');
}

function assertStartAttemptLineage(lineage: StartAttemptLineage): void {
  assertNonEmptyBounded(lineage.tenantId, 'start-attempt tenantId');
  assertNonEmptyBounded(lineage.projectId, 'start-attempt projectId');
  assertNonEmptyBounded(lineage.correlationId, 'start-attempt correlationId');
  assertNonEmptyBounded(lineage.idempotencyKey, 'start-attempt idempotencyKey');
  assertNonEmptyBounded(lineage.parentPlanLineageHash, 'start-attempt parentPlanLineageHash');
  assertNonEmptyBounded(lineage.parentCorrelationId, 'start-attempt parentCorrelationId');
  assertNonEmptyBounded(lineage.authorizationAuthority, 'start-attempt authorizationAuthority');
  assertNonEmptyBounded(lineage.actor.id, 'start-attempt actor.id');
  if (lineage.causationId !== undefined) {
    assertNonEmptyBounded(lineage.causationId, 'start-attempt causationId');
  }
  if (lineage.sourceId !== undefined) {
    assertNonEmptyBounded(lineage.sourceId, 'start-attempt sourceId');
  }
}

function startAttemptLineageHash(lineage: StartAttemptLineage): string {
  return hashPayload({
    tenantId: lineage.tenantId,
    projectId: lineage.projectId,
    actor: lineage.actor,
    origin: lineage.origin,
    correlationId: lineage.correlationId,
    idempotencyKey: lineage.idempotencyKey,
    parentPlanLineageHash: lineage.parentPlanLineageHash,
    parentCorrelationId: lineage.parentCorrelationId,
    authorizationAuthority: lineage.authorizationAuthority,
    causationId: lineage.causationId ?? null,
    sourceId: lineage.sourceId ?? null,
  });
}

function sameProcessIdentity(
  left: StartAttemptProcessIdentity | undefined,
  right: StartAttemptProcessIdentity,
): boolean {
  return left?.pid === right.pid
    && left.startToken === right.startToken
    && left.evidence === right.evidence;
}

function latestStartAttemptInDb(db: Database.Database, flowId: string): StartAttemptRecord | undefined {
  const row = db.prepare(`
    SELECT payload_json, payload_hash
    FROM run_flow_start_attempt_journal
    WHERE flow_id = ?
    ORDER BY generation DESC, sequence DESC
    LIMIT 1
  `).get(flowId) as StartAttemptPayloadRow | undefined;
  return row ? parsePayload<StartAttemptRecord>(row, 'start-attempt journal') : undefined;
}

function startAttemptByIdInDb(db: Database.Database, attemptId: string): StartAttemptRecord | undefined {
  const row = db.prepare(`
    SELECT payload_json, payload_hash
    FROM run_flow_start_attempt_journal
    WHERE attempt_id = ?
    ORDER BY sequence DESC
    LIMIT 1
  `).get(attemptId) as StartAttemptPayloadRow | undefined;
  return row ? parsePayload<StartAttemptRecord>(row, 'start-attempt journal') : undefined;
}

function startAttemptByIdempotencyInDb(
  db: Database.Database,
  tenantId: string,
  idempotencyKey: string,
): StartAttemptRecord | undefined {
  const identity = db.prepare(`
    SELECT flow_id, generation
    FROM run_flow_start_attempt_identities
    WHERE tenant_id = ? AND idempotency_key = ?
  `).get(tenantId, idempotencyKey) as { flow_id: string; generation: number } | undefined;
  if (!identity) return undefined;
  const row = db.prepare(`
    SELECT payload_json, payload_hash
    FROM run_flow_start_attempt_journal
    WHERE flow_id = ? AND generation = ?
    ORDER BY sequence DESC
    LIMIT 1
  `).get(identity.flow_id, identity.generation) as StartAttemptPayloadRow | undefined;
  return row ? parsePayload<StartAttemptRecord>(row, 'start-attempt idempotency journal') : undefined;
}

function assertAttemptMatches(actual: StartAttemptRecord | undefined, expected: StartAttemptCas): StartAttemptRecord {
  if (!actual) {
    throw new RunFlowStoreError(
      'START_ATTEMPT_NOT_FOUND',
      `run-flow-store: start attempt '${expected.attemptId}' was not found`,
      'not-committed',
    );
  }
  if (
    actual.flowId !== expected.flowId
    || actual.revision !== expected.revision
    || actual.planDigest !== expected.planDigest
    || actual.generation !== expected.generation
    || actual.attemptId !== expected.attemptId
    || actual.owner.ownerNonce !== expected.ownerNonce
  ) {
    throw new RunFlowStoreError(
      'START_ATTEMPT_CAS_MISMATCH',
      `run-flow-store: start attempt '${expected.attemptId}' does not match its expected exact-plan CAS`,
      'not-committed',
    );
  }
  return actual;
}

function assertLatestAttemptGeneration(
  db: Database.Database,
  expected: StartAttemptCas,
): StartAttemptRecord {
  const byId = assertAttemptMatches(startAttemptByIdInDb(db, expected.attemptId), expected);
  const latest = latestStartAttemptInDb(db, expected.flowId);
  if (!latest || latest.generation !== expected.generation || latest.attemptId !== expected.attemptId) {
    throw new RunFlowStoreError(
      'START_ATTEMPT_CAS_MISMATCH',
      `run-flow-store: generation ${expected.generation} is no longer current for flow '${expected.flowId}'`,
      'not-committed',
    );
  }
  return byId;
}

function appendStartAttemptState(db: Database.Database, record: StartAttemptRecord): void {
  const sequenceRow = db.prepare(`
    SELECT COALESCE(MAX(sequence), 0) AS head
    FROM run_flow_start_attempt_journal
    WHERE flow_id = ? AND generation = ?
  `).get(record.flowId, record.generation) as { head: number };
  const payloadJson = JSON.stringify(record);
  db.prepare(`
    INSERT INTO run_flow_start_attempt_journal(
      flow_id, generation, sequence, revision, plan_digest, attempt_id,
      state, payload_json, payload_hash, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.flowId,
    record.generation,
    sequenceRow.head + 1,
    record.revision,
    record.planDigest,
    record.attemptId,
    record.state,
    payloadJson,
    hashSerializedPayload(payloadJson),
    record.updatedAt,
  );
}

function appendNonEventRecordInDb(
  db: Database.Database,
  kind: Exclude<RecordKind, 'event'>,
  flowId: string,
  payload: unknown,
): void {
  const head = db.prepare(`
    SELECT COALESCE(MAX(ordinal), 0) AS head
    FROM run_flow_records WHERE kind = ? AND flow_id = ?
  `).get(kind, flowId) as { head: number };
  const payloadJson = JSON.stringify(payload);
  db.prepare(`
    INSERT INTO run_flow_records(
      kind, flow_id, ordinal, sequence, command_id, event_type,
      payload_json, payload_hash, created_at, source
    ) VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?, ?, 'canonical')
  `).run(kind, flowId, head.head + 1, payloadJson, hashSerializedPayload(payloadJson), new Date().toISOString());
}

export function saveApprovedSnapshot(root: string, snapshot: StoredApprovedSnapshot): void {
  appendRecord(root, 'snapshot', snapshot.flowId, snapshot);
}

export function loadApprovedSnapshot(root: string, flowId: string): StoredApprovedSnapshot | undefined {
  if (!hasStoreEvidence(root)) return undefined;
  return withStore(root, (db) => {
    const row = db.prepare(`
      SELECT payload_json, payload_hash FROM run_flow_records
      WHERE kind = 'snapshot' AND flow_id = ?
      ORDER BY ordinal DESC LIMIT 1
    `).get(flowId) as { payload_json: string; payload_hash: string } | undefined;
    return row ? parsePayload<StoredApprovedSnapshot>(row, 'approved snapshot') : undefined;
  });
}

export function savePlannedSprint(
  root: string,
  flowId: string,
  record: Omit<StoredPlannedSprint, 'flowId'>,
): void {
  appendRecord(root, 'plan', flowId, { flowId, ...record });
}

export function loadPlannedSprint(
  root: string,
  flowId: string,
  query?: { revision: number; planDigest: string; planDigestVersion?: number },
): StoredPlannedSprint | undefined {
  if (!hasStoreEvidence(root)) return undefined;
  return withStore(root, (db) => {
    let row: StartAttemptPayloadRow | undefined;
    if (!query) {
      row = db.prepare(`
        SELECT payload_json, payload_hash
        FROM run_flow_records
        WHERE kind = 'plan' AND flow_id = ?
        ORDER BY ordinal DESC
        LIMIT 1
      `).get(flowId) as StartAttemptPayloadRow | undefined;
    } else if (query.planDigestVersion === undefined) {
      row = db.prepare(`
        SELECT payload_json, payload_hash
        FROM run_flow_records
        WHERE kind = 'plan'
          AND flow_id = ?
          AND CAST(json_extract(payload_json, '$.revision') AS INTEGER) = ?
          AND json_type(payload_json, '$.planDigestVersion') IS NULL
        ORDER BY ordinal DESC
        LIMIT 1
      `).get(flowId, query.revision) as StartAttemptPayloadRow | undefined;
    } else {
      row = db.prepare(`
        SELECT payload_json, payload_hash
        FROM run_flow_records
        WHERE kind = 'plan'
          AND flow_id = ?
          AND CAST(json_extract(payload_json, '$.revision') AS INTEGER) = ?
          AND CAST(json_extract(payload_json, '$.planDigestVersion') AS INTEGER) = ?
          AND json_extract(payload_json, '$.planDigest') = ?
        ORDER BY ordinal DESC
        LIMIT 1
      `).get(
        flowId,
        query.revision,
        query.planDigestVersion,
        query.planDigest,
      ) as StartAttemptPayloadRow | undefined;
    }
    return row ? parsePayload<StoredPlannedSprint>(row, 'planned sprint') : undefined;
  });
}

export function saveRunHandle(root: string, record: StoredRunHandleRecord): void {
  appendRecord(root, 'handle', record.flowId, record);
}

export function loadRunHandle(root: string, flowId: string): StoredRunHandleRecord | undefined {
  if (!hasStoreEvidence(root)) return undefined;
  return withStore(root, (db) => {
    const row = db.prepare(`
      SELECT payload_json, payload_hash FROM run_flow_records
      WHERE kind = 'handle' AND flow_id = ?
      ORDER BY ordinal DESC LIMIT 1
    `).get(flowId) as { payload_json: string; payload_hash: string } | undefined;
    return row ? parsePayload<StoredRunHandleRecord>(row, 'run handle') : undefined;
  });
}

/**
 * Atomically reserve the next start-effect generation. A newer generation can
 * only follow the exact terminal predecessor named by expectedPrevious.
 */
export function prepareStartAttempt(
  root: string,
  input: PrepareStartAttemptInput,
): PrepareStartAttemptResult {
  assertNonEmptyBounded(input.flowId, 'start-attempt flowId');
  assertNonEmptyBounded(input.planDigest, 'start-attempt planDigest');
  assertNonEmptyBounded(input.attemptId, 'start-attempt attemptId');
  assertTimestamp(input.preparedAt, 'start-attempt preparedAt');
  assertStartAttemptLineage(input.lineage);
  assertStartAttemptOwner(input.owner);
  if (!Number.isSafeInteger(input.revision) || input.revision <= 0) {
    throw new RunFlowStoreError(
      'CANONICAL_WRITE_FAILED',
      'run-flow-store: start-attempt revision must be a positive safe integer',
      'not-committed',
    );
  }

  return withStore(root, (db) => {
    try {
      return immediate(db, () => {
        const idempotencyReplay = startAttemptByIdempotencyInDb(
          db,
          input.lineage.tenantId,
          input.lineage.idempotencyKey,
        );
        if (idempotencyReplay) {
          if (
            idempotencyReplay.flowId !== input.flowId
            || idempotencyReplay.revision !== input.revision
            || idempotencyReplay.planDigest !== input.planDigest
            || startAttemptLineageHash(idempotencyReplay.lineage) !== startAttemptLineageHash(input.lineage)
          ) {
            throw new RunFlowStoreError(
              'START_ATTEMPT_ID_CONFLICT',
              `run-flow-store: idempotencyKey '${input.lineage.idempotencyKey}' is already bound to another exact-plan authority`,
              'not-committed',
            );
          }
          return { applied: false, attempt: idempotencyReplay };
        }

        const replay = startAttemptByIdInDb(db, input.attemptId);
        if (replay) {
          if (
            replay.flowId !== input.flowId
            || replay.revision !== input.revision
            || replay.planDigest !== input.planDigest
            || startAttemptLineageHash(replay.lineage) !== startAttemptLineageHash(input.lineage)
          ) {
            throw new RunFlowStoreError(
              'START_ATTEMPT_ID_CONFLICT',
              `run-flow-store: attemptId '${input.attemptId}' is already bound to another exact-plan CAS`,
              'not-committed',
            );
          }
          return { applied: false, attempt: replay };
        }

        const previous = latestStartAttemptInDb(db, input.flowId);
        let generation = 1;
        if (!previous) {
          if (input.expectedPrevious !== undefined) {
            throw new RunFlowStoreError(
              'START_ATTEMPT_CAS_MISMATCH',
              `run-flow-store: flow '${input.flowId}' has no predecessor for the supplied retry CAS`,
              'not-committed',
            );
          }
        } else {
          if (
            input.expectedPrevious?.generation !== previous.generation
            || input.expectedPrevious?.attemptId !== previous.attemptId
          ) {
            throw new RunFlowStoreError(
              'START_ATTEMPT_CAS_MISMATCH',
              `run-flow-store: the predecessor CAS moved for flow '${input.flowId}'`,
              'not-committed',
            );
          }
          if (!isTerminalStartAttemptState(previous.state)) {
            throw new RunFlowStoreError(
              'START_ATTEMPT_STATE_CONFLICT',
              `run-flow-store: flow '${input.flowId}' already has active attempt '${previous.attemptId}' in ${previous.state}`,
              'not-committed',
            );
          }
          generation = previous.generation + 1;
        }

        db.prepare(`
          INSERT INTO run_flow_start_attempt_identities(
            flow_id, generation, attempt_id, revision, plan_digest,
            tenant_id, correlation_id, idempotency_key, lineage_hash, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          input.flowId,
          generation,
          input.attemptId,
          input.revision,
          input.planDigest,
          input.lineage.tenantId,
          input.lineage.correlationId,
          input.lineage.idempotencyKey,
          startAttemptLineageHash(input.lineage),
          input.preparedAt,
        );
        const attempt: StartAttemptRecord = {
          flowId: input.flowId,
          revision: input.revision,
          planDigest: input.planDigest,
          generation,
          attemptId: input.attemptId,
          state: 'PREPARED',
          createdAt: input.preparedAt,
          updatedAt: input.preparedAt,
          lineage: {
            ...input.lineage,
            actor: { ...input.lineage.actor },
          },
          owner: {
            process: { ...input.owner.process },
            ownerNonce: input.owner.ownerNonce,
            leaseUntil: input.owner.leaseUntil,
          },
        };
        appendStartAttemptState(db, attempt);
        return { applied: true, attempt };
      });
    } catch (cause) {
      if (cause instanceof RunFlowStoreError) throw cause;
      throw new RunFlowStoreError(
        'CANONICAL_WRITE_FAILED',
        `run-flow-store: failed to prepare a start attempt for flow '${input.flowId}'`,
        'not-committed',
        undefined,
        { cause },
      );
    }
  });
}

export function loadLatestStartAttempt(root: string, flowId: string): StartAttemptRecord | undefined {
  if (!hasStoreEvidence(root)) return undefined;
  return withStore(root, (db) => latestStartAttemptInDb(db, flowId));
}

export function loadStartAttempt(root: string, attemptId: string): StartAttemptRecord | undefined {
  if (!hasStoreEvidence(root)) return undefined;
  return withStore(root, (db) => startAttemptByIdInDb(db, attemptId));
}

/** Bounded, deterministic latest-attempt scan for recovery/sweep callers. */
export function listStartAttempts(
  root: string,
  options: ListStartAttemptsOptions = {},
): ListStartAttemptsResult {
  if (!hasStoreEvidence(root)) return { attempts: [] };
  const limit = options.limit ?? START_ATTEMPT_READ_DEFAULT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > START_ATTEMPT_READ_MAX_LIMIT) {
    throw new RunFlowStoreError(
      'CANONICAL_WRITE_FAILED',
      `run-flow-store: start-attempt list limit must be between 1 and ${START_ATTEMPT_READ_MAX_LIMIT}`,
      'not-committed',
    );
  }
  const states = options.states ? [...new Set(options.states)] : [];
  if (states.some((state) => !START_ATTEMPT_STATES.has(state))) {
    throw new RunFlowStoreError(
      'CANONICAL_WRITE_FAILED',
      'run-flow-store: start-attempt state filter contains an unsupported state',
      'not-committed',
    );
  }
  const after = options.afterFlowId ?? '';
  const stateClause = states.length > 0
    ? `AND current.state IN (${states.map(() => '?').join(', ')})`
    : '';
  return withStore(root, (db) => {
    const rows = db.prepare(`
      WITH current AS (
        SELECT journal.flow_id, journal.state, journal.payload_json, journal.payload_hash
        FROM run_flow_start_attempt_journal AS journal
        WHERE NOT EXISTS (
          SELECT 1
          FROM run_flow_start_attempt_journal AS newer
          WHERE newer.flow_id = journal.flow_id
            AND (
              newer.generation > journal.generation
              OR (
                newer.generation = journal.generation
                AND newer.sequence > journal.sequence
              )
            )
        )
      )
      SELECT payload_json, payload_hash
      FROM current
      WHERE current.flow_id > ?
        ${stateClause}
      ORDER BY current.flow_id ASC
      LIMIT ?
    `).all(after, ...states, limit + 1) as StartAttemptPayloadRow[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const attempts = pageRows.map((row) =>
      parsePayload<StartAttemptRecord>(row, 'start-attempt list'));
    return {
      attempts,
      ...(hasMore && attempts.length > 0
        ? { nextCursor: attempts[attempts.length - 1]!.flowId }
        : {}),
    };
  });
}

/** Persist process birth only after its PID generation has been captured. */
export function recordStartAttemptProcessSpawned(
  root: string,
  input: RecordStartAttemptProcessInput,
): { readonly applied: boolean; readonly attempt: StartAttemptRecord } {
  assertStartAttemptCas(input);
  assertTimestamp(input.spawnedAt, 'start-attempt spawnedAt');
  assertProcessIdentity(input.process, 'start-attempt process');

  return withStore(root, (db) => {
    try {
      return immediate(db, () => {
        const current = assertLatestAttemptGeneration(db, input);
        if (current.state === 'PROCESS_SPAWNED') {
          if (sameProcessIdentity(current.process, input.process)) {
            return { applied: false, attempt: current };
          }
          throw new RunFlowStoreError(
            'START_ATTEMPT_STATE_CONFLICT',
            `run-flow-store: attempt '${input.attemptId}' already recorded another process generation`,
            'not-committed',
          );
        }
        if (current.state !== 'PREPARED') {
          throw new RunFlowStoreError(
            'START_ATTEMPT_STATE_CONFLICT',
            `run-flow-store: attempt '${input.attemptId}' cannot enter PROCESS_SPAWNED from ${current.state}`,
            'not-committed',
          );
        }
        if (Date.parse(input.spawnedAt) > Date.parse(current.owner.leaseUntil)) {
          throw new RunFlowStoreError(
            'START_ATTEMPT_STATE_CONFLICT',
            `run-flow-store: attempt '${input.attemptId}' preparer lease expired before process birth was recorded`,
            'not-committed',
          );
        }
        const attempt: StartAttemptRecord = {
          ...current,
          state: 'PROCESS_SPAWNED',
          process: { ...input.process },
          updatedAt: input.spawnedAt,
        };
        appendStartAttemptState(db, attempt);
        return { applied: true, attempt };
      });
    } catch (cause) {
      if (cause instanceof RunFlowStoreError) throw cause;
      throw new RunFlowStoreError(
        'CANONICAL_WRITE_FAILED',
        `run-flow-store: failed to record process birth for attempt '${input.attemptId}'`,
        'not-committed',
        undefined,
        { cause },
      );
    }
  });
}

/**
 * Publish ADMITTED and the legacy-compatible handle in one SQLite transaction.
 * Compatibility projection follows the canonical commit and is retry-safe.
 */
export function admitStartAttempt(
  root: string,
  input: AdmitStartAttemptInput,
): { readonly applied: boolean; readonly attempt: StartAttemptRecord } {
  assertStartAttemptCas(input);
  assertTimestamp(input.admittedAt, 'start-attempt admittedAt');
  assertProcessIdentity(input.process, 'start-attempt process');
  if (input.handle.flowId !== input.flowId) {
    throw new RunFlowStoreError(
      'START_ATTEMPT_CAS_MISMATCH',
      `run-flow-store: run handle flowId does not match attempt '${input.attemptId}'`,
      'not-committed',
    );
  }

  return withStore(root, (db) => {
    let result: { readonly applied: boolean; readonly attempt: StartAttemptRecord };
    try {
      result = immediate(db, () => {
        const current = assertLatestAttemptGeneration(db, input);
        if (current.state === 'ADMITTED') {
          if (
            sameProcessIdentity(current.process, input.process)
            && JSON.stringify(current.handle) === JSON.stringify(input.handle)
          ) {
            return { applied: false, attempt: current };
          }
          throw new RunFlowStoreError(
            'START_ATTEMPT_STATE_CONFLICT',
            `run-flow-store: attempt '${input.attemptId}' already admitted different authority`,
            'not-committed',
          );
        }
        if (
          current.state !== 'PROCESS_SPAWNED'
          || !sameProcessIdentity(current.process, input.process)
        ) {
          throw new RunFlowStoreError(
            'START_ATTEMPT_STATE_CONFLICT',
            `run-flow-store: attempt '${input.attemptId}' is not owned by the supplied spawned process`,
            'not-committed',
          );
        }
        const attempt: StartAttemptRecord = {
          ...current,
          state: 'ADMITTED',
          handle: { ...input.handle },
          updatedAt: input.admittedAt,
        };
        appendStartAttemptState(db, attempt);
        const handleRecord: StoredRunHandleRecord = {
          flowId: input.flowId,
          revision: input.revision,
          planDigest: input.planDigest,
          handle: input.handle,
          startedAt: input.admittedAt,
          pid: input.process.pid,
          startToken: input.process.startToken,
          ...(input.gitBase !== undefined ? { gitBase: input.gitBase } : {}),
        };
        appendNonEventRecordInDb(db, 'handle', input.flowId, handleRecord);
        return { applied: true, attempt };
      });
    } catch (cause) {
      if (cause instanceof RunFlowStoreError) throw cause;
      throw new RunFlowStoreError(
        'CANONICAL_WRITE_FAILED',
        `run-flow-store: failed to admit attempt '${input.attemptId}'`,
        'not-committed',
        undefined,
        { cause },
      );
    }
    if (result.applied) reconcileProjection(db, root, input.flowId, 'handle');
    return result;
  });
}

export function settleStartAttempt(
  root: string,
  input: SettleStartAttemptInput,
): { readonly applied: boolean; readonly attempt: StartAttemptRecord } {
  assertStartAttemptCas(input);
  assertTimestamp(input.settlement.settledAt, 'start-attempt settledAt');
  assertNonEmptyBounded(input.settlement.code, 'start-attempt settlement code');
  if (!isTerminalStartAttemptState(input.settlement.state)) {
    throw new RunFlowStoreError(
      'CANONICAL_WRITE_FAILED',
      'run-flow-store: start-attempt settlement must be terminal',
      'not-committed',
    );
  }
  if (
    input.authority.kind === 'process-recovery'
    || input.authority.kind === 'preparer-recovery'
  ) {
    assertTimestamp(input.authority.observedAt, 'start-attempt recovery observedAt');
    if (input.settlement.state !== 'FAILED' && input.settlement.state !== 'UNKNOWN') {
      throw new RunFlowStoreError(
        'CANONICAL_WRITE_FAILED',
        'run-flow-store: process recovery may settle only FAILED or UNKNOWN',
        'not-committed',
      );
    }
  }

  return withStore(root, (db) => {
    try {
      return immediate(db, () => {
        const current = assertLatestAttemptGeneration(db, input);
        if (input.authority.kind === 'effect-unknown' && current.state !== 'PREPARED') {
          throw new RunFlowStoreError(
            'START_ATTEMPT_STATE_CONFLICT',
            `run-flow-store: effect-unknown settlement requires PREPARED, found ${current.state}`,
            'not-committed',
          );
        }
        if (input.authority.kind === 'process-recovery' && current.process === undefined) {
          throw new RunFlowStoreError(
            'START_ATTEMPT_STATE_CONFLICT',
            `run-flow-store: process recovery requires a recorded process for attempt '${input.attemptId}'`,
            'not-committed',
          );
        }
        if (input.authority.kind === 'preparer-recovery' && current.state !== 'PREPARED') {
          throw new RunFlowStoreError(
            'START_ATTEMPT_STATE_CONFLICT',
            `run-flow-store: preparer recovery requires PREPARED, found ${current.state}`,
            'not-committed',
          );
        }
        if (isTerminalStartAttemptState(current.state)) {
          if (JSON.stringify(current.settlement) === JSON.stringify(input.settlement)) {
            return { applied: false, attempt: current };
          }
          throw new RunFlowStoreError(
            'START_ATTEMPT_STATE_CONFLICT',
            `run-flow-store: attempt '${input.attemptId}' is already terminal as ${current.state}`,
            'not-committed',
          );
        }
        if (input.settlement.state === 'COMPLETED' && current.state !== 'ADMITTED') {
          throw new RunFlowStoreError(
            'START_ATTEMPT_STATE_CONFLICT',
            `run-flow-store: attempt '${input.attemptId}' cannot complete before ADMITTED`,
            'not-committed',
          );
        }
        const attempt: StartAttemptRecord = {
          ...current,
          state: input.settlement.state,
          settlement: { ...input.settlement },
          updatedAt: input.settlement.settledAt,
        };
        appendStartAttemptState(db, attempt);
        return { applied: true, attempt };
      });
    } catch (cause) {
      if (cause instanceof RunFlowStoreError) throw cause;
      throw new RunFlowStoreError(
        'CANONICAL_WRITE_FAILED',
        `run-flow-store: failed to settle attempt '${input.attemptId}'`,
        'not-committed',
        undefined,
        { cause },
      );
    }
  });
}

/**
 * Append an entire command's event batch in one SQLite transaction. The
 * expected head is a cross-process CAS; commandId is a durable idempotency
 * journal for the whole batch, not a uniqueness rule on individual events.
 */
export function appendFlowEvents(
  root: string,
  flowId: string,
  events: readonly RunFlowEvent[],
  options: AppendFlowEventsOptions = {},
): AppendFlowEventsResult {
  if (events.length === 0) {
    throw new RunFlowStoreError(
      'CANONICAL_WRITE_FAILED',
      'run-flow-store: an event batch must contain at least one event',
      'not-committed',
    );
  }
  if (events.some((event) => event.flowId !== flowId)) {
    throw new RunFlowStoreError(
      'CANONICAL_WRITE_FAILED',
      `run-flow-store: event batch contains a flowId different from '${flowId}'`,
      'not-committed',
    );
  }
  const commandIds = new Set(events.map((event) => event.commandId).filter((value): value is string => value !== undefined));
  if (commandIds.size > 1 || (commandIds.size === 1 && events.some((event) => event.commandId === undefined))) {
    throw new RunFlowStoreError(
      'CANONICAL_WRITE_FAILED',
      'run-flow-store: every event in a batch must carry the same commandId or all omit it',
      'not-committed',
    );
  }

  return withStore(root, (db) => {
    const commandId = commandIds.values().next().value as string | undefined;
    const payloadHash = eventBatchHash(events);
    let result: AppendFlowEventsResult;

    try {
      result = immediate(db, () => {
        if (commandId !== undefined) {
          const existing = db.prepare(`
            SELECT payload_hash, first_sequence, last_sequence, event_count
            FROM run_flow_commands WHERE flow_id = ? AND command_id = ?
          `).get(flowId, commandId) as CommandRow | undefined;
          if (existing) {
            if (existing.payload_hash !== payloadHash || existing.event_count !== events.length) {
              throw new RunFlowStoreError(
                'IDEMPOTENCY_CONFLICT',
                `run-flow-store: commandId '${commandId}' was already committed with a different event batch`,
                'not-committed',
              );
            }
            const rows = db.prepare(`
              SELECT payload_json, payload_hash FROM run_flow_records
              WHERE kind = 'event' AND flow_id = ? AND sequence BETWEEN ? AND ?
              ORDER BY sequence ASC
            `).all(flowId, existing.first_sequence, existing.last_sequence) as {
              payload_json: string;
              payload_hash: string;
            }[];
            return {
              applied: false,
              events: rows.map((row) => parsePayload<RunFlowEvent>(row, 'idempotent event batch')),
              firstSequence: existing.first_sequence,
              lastSequence: existing.last_sequence,
            };
          }
        }

        const headRow = db.prepare(`
          SELECT COALESCE(MAX(sequence), 0) AS head
          FROM run_flow_records WHERE kind = 'event' AND flow_id = ?
        `).get(flowId) as { head: number };
        if (options.expectedLastSequence !== undefined && headRow.head !== options.expectedLastSequence) {
          throw new RunFlowStoreError(
            'CANONICAL_CONFLICT',
            `run-flow-store: flow '${flowId}' head moved from expected ${options.expectedLastSequence} to ${headRow.head}`,
            'not-committed',
          );
        }

        const assigned = events.map((event, index) => ({
          ...event,
          sequence: headRow.head + index + 1,
        })) as RunFlowEvent[];

        const insert = db.prepare(`
          INSERT INTO run_flow_records(
            kind, flow_id, ordinal, sequence, command_id, event_type,
            payload_json, payload_hash, created_at, source
          ) VALUES ('event', ?, ?, ?, ?, ?, ?, ?, ?, 'canonical')
        `);
        for (const event of assigned) {
          const payloadJson = JSON.stringify(event);
          insert.run(
            flowId,
            event.sequence,
            event.sequence,
            event.commandId ?? null,
            event.type,
            payloadJson,
            hashPayload(event),
            event.timestamp,
          );
        }

        const firstSequence = assigned[0]!.sequence!;
        const lastSequence = assigned[assigned.length - 1]!.sequence!;
        if (commandId !== undefined) {
          db.prepare(`
            INSERT INTO run_flow_commands(
              flow_id, command_id, payload_hash, first_sequence, last_sequence, event_count, committed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            flowId,
            commandId,
            payloadHash,
            firstSequence,
            lastSequence,
            assigned.length,
            new Date().toISOString(),
          );
        }
        return { applied: true, events: assigned, firstSequence, lastSequence };
      });
    } catch (cause) {
      if (cause instanceof RunFlowStoreError) throw cause;
      throw new RunFlowStoreError(
        'CANONICAL_WRITE_FAILED',
        `run-flow-store: failed to commit canonical event batch for flow '${flowId}'`,
        'not-committed',
        undefined,
        { cause },
      );
    }

    if (result.applied) reconcileProjection(db, root, flowId, 'event');
    return result;
  });
}

/** Backward-compatible one-event append, now transactionally multi-process safe. */
export function appendFlowEvent(root: string, flowId: string, event: RunFlowEvent): number {
  return appendFlowEvents(root, flowId, [event]).lastSequence;
}

export function readFlowEventHead(root: string, flowId: string): number {
  if (!hasStoreEvidence(root)) return 0;
  return withStore(root, (db) => {
    const row = db.prepare(`
      SELECT COALESCE(MAX(sequence), 0) AS head
      FROM run_flow_records WHERE kind = 'event' AND flow_id = ?
    `).get(flowId) as { head: number };
    return row.head;
  });
}

export function readFlowEvents(
  root: string,
  flowId: string,
  options: ReadFlowEventsOptions = {},
): RunFlowEvent[] {
  if (!hasStoreEvidence(root)) return [];
  return withStore(root, (db) => {
    const after = options.afterSequence ?? 0;
    if (!Number.isSafeInteger(after) || after < 0) {
      throw new RunFlowStoreError(
        'CANONICAL_WRITE_FAILED',
        'run-flow-store: afterSequence must be a non-negative safe integer',
        'not-committed',
      );
    }
    if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit <= 0)) {
      throw new RunFlowStoreError(
        'CANONICAL_WRITE_FAILED',
        'run-flow-store: limit must be a positive safe integer',
        'not-committed',
      );
    }
    const limit = options.limit ?? Number.MAX_SAFE_INTEGER;
    const rows = db.prepare(`
      SELECT payload_json, payload_hash FROM run_flow_records
      WHERE kind = 'event' AND flow_id = ? AND sequence > ?
      ORDER BY sequence ASC LIMIT ?
    `).all(flowId, after, limit) as { payload_json: string; payload_hash: string }[];
    return rows.map((row) => parsePayload<RunFlowEvent>(row, 'event'));
  });
}

/** Bounded canonical cursor iterator used by million-scale rehydration paths. */
export function* iterateFlowEvents(
  root: string,
  flowId: string,
  pageSize = EVENT_READ_DEFAULT_LIMIT,
): Generator<RunFlowEvent, void, undefined> {
  let cursor = 0;
  while (true) {
    const page = readFlowEvents(root, flowId, { afterSequence: cursor, limit: pageSize });
    if (page.length === 0) return;
    for (const event of page) {
      yield event;
      cursor = event.sequence!;
    }
    if (page.length < pageSize) return;
  }
}

/** Enumerate every flow with any canonical record, including plan-only flows. */
export function listFlowIds(root: string): string[] {
  if (!hasStoreEvidence(root)) return [];
  return withStore(root, (db) => {
    const rows = db.prepare(`
      SELECT flow_id FROM run_flow_records
      UNION
      SELECT flow_id FROM run_flow_start_attempt_identities
      ORDER BY flow_id ASC
    `).all() as { flow_id: string }[];
    return rows.map((row) => row.flow_id);
  });
}
