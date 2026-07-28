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
import type { RunFlowEvent, RunProposal } from './run-flow-contract.js';
import type { Sprint } from './types.js';
import type { ActorContext } from './work-model.js';
import type { RunHandle } from '../orchestra/run-job-service.js';

export const RUN_FLOW_STORE_SCHEMA_VERSION = 1;
const SQLITE_BUSY_TIMEOUT_MS = 60_000;
const EVENT_READ_DEFAULT_LIMIT = 1_000;

type RecordKind = 'snapshot' | 'handle' | 'event' | 'plan';

export type RunFlowStoreErrorCode =
  | 'SCHEMA_UNSUPPORTED'
  | 'CANONICAL_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'CANONICAL_WRITE_FAILED'
  | 'PROJECTION_UNCERTAIN'
  | 'CORRUPT_RECORD';

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
}

/** Durable record of an actual start attempt for a flow. */
export interface StoredRunHandleRecord {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest: string;
  readonly handle: RunHandle;
  readonly startedAt: string;
  readonly pid?: number;
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
    db.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
    db.pragma('journal_mode = WAL');
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

function readRecords<T>(root: string, kind: RecordKind, flowId: string): T[] {
  if (!hasStoreEvidence(root)) return [];
  return withStore(root, (db) => {
    const rows = db.prepare(`
      SELECT payload_json, payload_hash
      FROM run_flow_records
      WHERE kind = ? AND flow_id = ?
      ORDER BY ordinal ASC
    `).all(kind, flowId) as { payload_json: string; payload_hash: string }[];
    return rows.map((row) => parsePayload<T>(row, `${kind} record`));
  });
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
  const records = readRecords<StoredPlannedSprint>(root, 'plan', flowId);
  if (!query) return records[records.length - 1];
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index]!;
    if (record.revision !== query.revision) continue;
    if (query.planDigestVersion === undefined) {
      if (record.planDigestVersion === undefined) return record;
      continue;
    }
    if (record.planDigestVersion === query.planDigestVersion && record.planDigest === query.planDigest) {
      return record;
    }
  }
  return undefined;
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
      SELECT DISTINCT flow_id FROM run_flow_records ORDER BY flow_id ASC
    `).all() as { flow_id: string }[];
    return rows.map((row) => row.flow_id);
  });
}
