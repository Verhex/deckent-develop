import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import {
  acquireCleanMaintenanceLock,
  assertCleanMaintenanceLock,
  beginCleanMaintenanceIrreversibleBoundary,
  completeCleanMaintenanceIrreversibleBoundary,
  inspectActiveExecutions,
  quarantineCleanMaintenanceLock,
  recoverQuarantinedCleanMaintenanceLock,
  releaseCleanMaintenanceLock,
  renewCleanMaintenanceLock,
} from '../../scripts/clean.mjs';
import {
  EXECUTION_LOCK_RECOVERY_ATTESTATION_SCHEMA_VERSION,
  acquireExecutionLock,
  checkExecutionLock,
  recoverQuarantinedExecutionLock,
  releaseExecutionLock,
  type ExecutionLockInfo,
} from '../../src/core/file-lock.js';

const REPO_ROOT = process.cwd();
const temporaryRoots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-clean-admission-'));
  temporaryRoots.push(root);
  return root;
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

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8');
}

function writeTask(root: string, id: string, status: string): void {
  writeJson(join(root, '.tasks', `task-${id}.json`), {
    id,
    title: id,
    description: id,
    status,
    createdAt: '2026-07-27T00:00:00.000Z',
  });
}

function writeTaskExecutionFence(
  root: string,
  taskId: string,
  options: {
    actor?: 'dispatch' | 'settlement';
    pid?: number;
    acquiredAt?: string;
    directory?: '.locks' | '.deckent/locks';
    owner?: string;
    filePath?: string;
    fileName?: string;
  } = {},
): string {
  const filePath = options.filePath ?? `deckent-task-execution://${taskId}`;
  const directory = join(root, options.directory ?? '.locks');
  const fileName = options.fileName ?? `${sha256(filePath).slice(0, 32)}.spawnlock`;
  const path = join(directory, fileName);
  writeJson(path, {
    filePath,
    taskId: options.owner
      ?? `${options.actor ?? 'dispatch'}:${options.pid ?? 42}:00000000-0000-4000-8000-000000000001`,
    acquiredAt: options.acquiredAt ?? '2026-07-27T00:00:00.000Z',
  });
  return path;
}

function writeDedicatedTaskExecutionLock(
  root: string,
  taskId: string,
  options: {
    actor?: 'dispatch' | 'settlement';
    ownerId?: string;
    pid?: number;
    acquiredAt?: string;
    renewedAt?: string;
    leaseDurationMs?: number;
    fencingToken?: number;
    fencingNonce?: string;
    authorityEpoch?: string;
    fileName?: string;
    value?: Record<string, unknown>;
  } = {},
): string {
  const directory = join(root, '.locks');
  const fileName = options.fileName ?? `${sha256(taskId)}.executionlock`;
  const path = join(directory, fileName);
  const authorityEpoch =
    options.authorityEpoch ?? '10000000-0000-4000-8000-000000000001';
  const value: Record<string, unknown> = options.value ?? {
    schemaVersion: 3,
    taskId,
    actor: options.actor ?? 'dispatch',
    ownerId: options.ownerId ?? '00000000-0000-4000-8000-000000000001',
    pid: options.pid ?? 42,
    hostInstanceId: 'test-host',
    bootSessionId: 'test-boot',
    processSessionId: '00000000-0000-4000-8000-000000000002',
    fencingToken: {
      epoch: authorityEpoch,
      counter: options.fencingToken ?? 1,
      nonce: options.fencingNonce ?? '0'.repeat(32),
    },
    acquiredAt: options.acquiredAt ?? '2026-07-27T00:00:00.000Z',
    renewedAt: options.renewedAt ?? options.acquiredAt
      ?? '2026-07-27T00:00:00.000Z',
    leaseDurationMs: options.leaseDurationMs ?? 30_000,
  };
  mkdirSync(directory, { recursive: true });
  writeFileSync(path, JSON.stringify(value), 'utf8');
  if (options.value === undefined) {
    writeFileSync(
      join(directory, 'execution-lock-authority.sentinel.json'),
      JSON.stringify({
        schemaVersion: 1,
        authorityEpoch,
        createdAt: '2026-07-27T00:00:00.000Z',
      }),
      'utf8',
    );
    const dbPath = join(directory, 'execution-lock-authority.sqlite3');
    const db = new Database(dbPath);
    db.pragma('journal_mode = DELETE');
    db.pragma('synchronous = FULL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS execution_lock_meta (
        singleton INTEGER NOT NULL PRIMARY KEY CHECK(singleton = 1),
        meta_version INTEGER NOT NULL CHECK(meta_version = 3),
        authority_epoch TEXT NOT NULL CHECK(length(authority_epoch) = 36),
        fencing_counter INTEGER NOT NULL CHECK(fencing_counter >= 0)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS execution_lock_active (
        task_id TEXT NOT NULL PRIMARY KEY,
        owner_id TEXT NOT NULL UNIQUE,
        fencing_epoch TEXT NOT NULL CHECK(length(fencing_epoch) = 36),
        fencing_counter INTEGER NOT NULL CHECK(fencing_counter > 0),
        fencing_nonce TEXT NOT NULL CHECK(
          length(fencing_nonce) = 32
          AND fencing_nonce NOT GLOB '*[^0-9a-f]*'
        ),
        payload_json TEXT NOT NULL,
        UNIQUE(fencing_epoch, fencing_counter, fencing_nonce)
      ) STRICT, WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS execution_lock_quarantine (
        task_id TEXT NOT NULL PRIMARY KEY,
        quarantine_id TEXT NOT NULL UNIQUE CHECK(length(quarantine_id) = 36),
        owner_id TEXT NOT NULL UNIQUE CHECK(length(owner_id) = 36),
        fencing_epoch TEXT NOT NULL CHECK(length(fencing_epoch) = 36),
        fencing_counter INTEGER NOT NULL CHECK(fencing_counter > 0),
        fencing_nonce TEXT NOT NULL CHECK(
          length(fencing_nonce) = 32
          AND fencing_nonce NOT GLOB '*[^0-9a-f]*'
        ),
        state TEXT NOT NULL CHECK(state IN ('in-flight', 'quarantined')),
        reason TEXT NOT NULL CHECK(reason IN (
          'irreversible-boundary',
          'partial-mutation',
          'heartbeat-fault',
          'release-fault',
          'authority-uncertain',
          'legacy-v2-active'
        )),
        entered_at TEXT NOT NULL,
        quarantined_at TEXT,
        payload_json TEXT NOT NULL,
        CHECK(
          (state = 'in-flight'
            AND reason = 'irreversible-boundary'
            AND quarantined_at IS NULL)
          OR
          (state = 'quarantined'
            AND reason <> 'irreversible-boundary'
            AND quarantined_at IS NOT NULL)
        ),
        UNIQUE(fencing_epoch, fencing_counter, fencing_nonce)
      ) STRICT, WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS execution_lock_quarantine_audit (
        event_id TEXT NOT NULL PRIMARY KEY CHECK(length(event_id) = 36),
        action TEXT NOT NULL CHECK(action IN (
          'boundary-entered',
          'quarantined',
          'completed',
          'recovered'
        )),
        quarantine_id TEXT NOT NULL CHECK(length(quarantine_id) = 36),
        task_id TEXT NOT NULL,
        owner_id TEXT NOT NULL CHECK(length(owner_id) = 36),
        fencing_epoch TEXT NOT NULL CHECK(length(fencing_epoch) = 36),
        fencing_counter INTEGER NOT NULL CHECK(fencing_counter > 0),
        fencing_nonce TEXT NOT NULL CHECK(
          length(fencing_nonce) = 32
          AND fencing_nonce NOT GLOB '*[^0-9a-f]*'
        ),
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        UNIQUE(quarantine_id, action)
      ) STRICT, WITHOUT ROWID;
      CREATE UNIQUE INDEX IF NOT EXISTS execution_lock_quarantine_one_terminal
        ON execution_lock_quarantine_audit(quarantine_id)
        WHERE action IN ('completed', 'recovered');
      CREATE TRIGGER IF NOT EXISTS execution_lock_quarantine_monotonic_update
      BEFORE UPDATE ON execution_lock_quarantine
      WHEN NOT (
        NEW.task_id = OLD.task_id
        AND NEW.quarantine_id = OLD.quarantine_id
        AND NEW.owner_id = OLD.owner_id
        AND NEW.fencing_epoch = OLD.fencing_epoch
        AND NEW.fencing_counter = OLD.fencing_counter
        AND NEW.fencing_nonce = OLD.fencing_nonce
        AND NEW.entered_at = OLD.entered_at
        AND (
          (
            OLD.state = 'in-flight'
            AND NEW.state = 'in-flight'
            AND NEW.reason = OLD.reason
            AND OLD.quarantined_at IS NULL
            AND NEW.quarantined_at IS NULL
          )
          OR
          (
            OLD.state = 'in-flight'
            AND NEW.state = 'quarantined'
            AND OLD.quarantined_at IS NULL
            AND NEW.quarantined_at IS NOT NULL
          )
        )
      )
      BEGIN
        SELECT RAISE(ABORT, 'execution lock quarantine transition is not monotonic');
      END;
      CREATE TRIGGER IF NOT EXISTS execution_lock_quarantine_terminal_delete
      BEFORE DELETE ON execution_lock_quarantine
      WHEN NOT EXISTS (
        SELECT 1
          FROM execution_lock_quarantine_audit
         WHERE quarantine_id = OLD.quarantine_id
           AND task_id = OLD.task_id
           AND owner_id = OLD.owner_id
           AND fencing_epoch = OLD.fencing_epoch
           AND fencing_counter = OLD.fencing_counter
           AND fencing_nonce = OLD.fencing_nonce
           AND action IN ('completed', 'recovered')
      )
      BEGIN
        SELECT RAISE(ABORT, 'execution lock quarantine delete requires terminal audit');
      END;
      CREATE TRIGGER IF NOT EXISTS execution_lock_quarantine_audit_no_update
      BEFORE UPDATE ON execution_lock_quarantine_audit
      BEGIN
        SELECT RAISE(ABORT, 'execution lock quarantine audit is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS execution_lock_quarantine_audit_no_delete
      BEFORE DELETE ON execution_lock_quarantine_audit
      BEGIN
        SELECT RAISE(ABORT, 'execution lock quarantine audit is append-only');
      END;
      PRAGMA user_version = 3;
    `);
    db.prepare(`
      INSERT OR IGNORE INTO execution_lock_meta(
        singleton, meta_version, authority_epoch, fencing_counter
      ) VALUES (1, 3, ?, 0)
    `).run(authorityEpoch);
    db.prepare(`
      UPDATE execution_lock_meta
       SET fencing_counter = MAX(fencing_counter, ?)
       WHERE singleton = 1
    `).run(options.fencingToken ?? 1);
    db.prepare(`
      INSERT INTO execution_lock_active(
        task_id, owner_id, fencing_epoch, fencing_counter, fencing_nonce,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      value.taskId,
      value.ownerId,
      authorityEpoch,
      options.fencingToken ?? 1,
      options.fencingNonce ?? '0'.repeat(32),
      JSON.stringify(value),
    );
    db.close();
  }
  return path;
}

function seedLegacyV2DedicatedExecutionLock(
  root: string,
  taskId: string,
): ExecutionLockInfo {
  const projectionPath = writeDedicatedTaskExecutionLock(root, taskId, {
    ownerId: '30000000-0000-4000-8000-000000000003',
    authorityEpoch: '40000000-0000-4000-8000-000000000004',
    fencingToken: 9,
    fencingNonce: '2'.repeat(32),
  });
  const current = JSON.parse(
    readFileSync(projectionPath, 'utf8'),
  ) as ExecutionLockInfo;
  const legacy = { ...current, schemaVersion: 2 };
  writeFileSync(projectionPath, JSON.stringify(legacy), 'utf8');
  const db = new Database(
    join(root, '.locks', 'execution-lock-authority.sqlite3'),
  );
  db.exec(`
    DROP TABLE execution_lock_quarantine_audit;
    DROP TABLE execution_lock_quarantine;
    ALTER TABLE execution_lock_meta RENAME TO execution_lock_meta_v3;
    CREATE TABLE execution_lock_meta (
      singleton INTEGER NOT NULL PRIMARY KEY CHECK(singleton = 1),
      meta_version INTEGER NOT NULL CHECK(meta_version = 2),
      authority_epoch TEXT NOT NULL CHECK(length(authority_epoch) = 36),
      fencing_counter INTEGER NOT NULL CHECK(fencing_counter >= 0)
    ) STRICT;
    INSERT INTO execution_lock_meta(
      singleton, meta_version, authority_epoch, fencing_counter
    )
    SELECT singleton, 2, authority_epoch, fencing_counter
      FROM execution_lock_meta_v3;
    DROP TABLE execution_lock_meta_v3;
    PRAGMA user_version = 2;
  `);
  db.prepare(`
    UPDATE execution_lock_active
       SET payload_json = ?
     WHERE task_id = ?
  `).run(JSON.stringify(legacy), taskId);
  db.close();
  return current;
}

function openReceiptDatabase(root: string): {
  db: Database.Database;
  projectId: string;
} {
  const dbPath = join(root, '.deckent', 'runtime', 'invocations.db');
  mkdirSync(join(root, '.deckent', 'runtime'), { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE invocation_project_bindings (
      root_digest TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE invocations (
      invocation_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE invocation_events (
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
      event_hash TEXT NOT NULL
    );
  `);
  const projectId = 'project-clean-admission';
  db.prepare(`
    INSERT INTO invocation_project_bindings (root_digest, project_id, created_at)
    VALUES (?, ?, ?)
  `).run(
    sha256(realpathSync.native(root)),
    projectId,
    '2026-07-27T00:00:00.000Z',
  );
  return { db, projectId };
}

function openMissionDatabase(root: string): Database.Database {
  const path = join(root, '.deckent', 'autonomous', 'autonomous.db');
  mkdirSync(join(root, '.deckent', 'autonomous'), { recursive: true });
  const db = new Database(path);
  db.exec(`
    CREATE TABLE missions (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL
    );
    CREATE TABLE work_items (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      claimed_at TEXT,
      claimed_by TEXT
    );
    CREATE TABLE mission_engine_lease (
      singleton_id INTEGER PRIMARY KEY,
      owner_id TEXT NOT NULL,
      epoch INTEGER NOT NULL,
      lease_token_hash TEXT NOT NULL,
      acquired_at TEXT NOT NULL,
      renewed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      expires_at_ms INTEGER NOT NULL
    );
  `);
  return db;
}

function writeRunFlowEvents(
  root: string,
  flowId: string,
  events: Record<string, unknown>[],
): void {
  const path = join(
    root,
    '.deckent',
    'runtime',
    'run-flow-store',
    `${flowId}.events.jsonl`,
  );
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(
    path,
    `${events.map((event, index) => JSON.stringify({
      schemaVersion: 1,
      flowId,
      timestamp: `2026-07-27T00:00:${String(index).padStart(2, '0')}.000Z`,
      ...event,
      sequence: index + 1,
    })).join('\n')}\n`,
    'utf-8',
  );
}

function runFlowApprovalOpening(flowId: string): Record<string, unknown>[] {
  return [
    {
      type: 'PROPOSAL_SUBMITTED',
      proposal: {
        flowId,
        tenant: 'tenant-clean-admission',
        project: 'project-clean-admission',
        actor: { id: 'operator' },
        origin: 'cli',
        revision: 1,
        intentSummary: `run ${flowId}`,
      },
    },
    { type: 'PREVIEW_STARTED', revision: 1 },
    {
      type: 'PREVIEW_READY',
      preview: {
        flowId,
        revision: 1,
        planDigest: 'plan-digest',
        taskSummaries: [{ title: 'Task', summary: 'Task summary' }],
        policyDecision: 'allow',
        gateResult: 'pass',
      },
    },
  ];
}

function writeRunFlowHandle(root: string, flowId: string, pid?: number): void {
  const path = join(
    root,
    '.deckent',
    'runtime',
    'run-flow-store',
    `${flowId}.handle.jsonl`,
  );
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify({
    flowId,
    revision: 1,
    planDigest: 'plan-digest',
    handle: {
      flowId,
      jobId: `flow-${flowId}-r1`,
      logRef: `flow-${flowId}-r1.log`,
    },
    startedAt: '2026-07-27T00:00:05.000Z',
    ...(pid === undefined ? {} : { pid }),
  })}\n`, 'utf-8');
}

function insertNotDispatchedReceipt(
  db: Database.Database,
  projectId: string,
  taskId: string,
  suffix: string,
  options: {
    tamperHeadHash?: boolean;
    consumerOutcome?: string;
    consumerOccurredAt?: string;
  } = {},
): void {
  const invocationId = `invocation-${suffix}`;
  const tenantId = 'tenant-clean-admission';
  const selection = {
    provider: null,
    model: null,
    source: 'none',
    reasonCode: 'execution_admission_rejected',
  };
  const receipt = {
    schemaVersion: 1,
    invocationId,
    idempotencyKey: `idempotency-${suffix}`,
    tenantId,
    projectId,
    runId: `run-${suffix}`,
    taskId,
    callId: `call-${suffix}`,
    role: 'worker',
    purpose: 'worker-execution',
    configured: selection,
    requested: selection,
    resolved: selection,
    called: selection,
    backend: { transport: 'local-runtime', executionBackend: 'in-process' },
    auth: { mode: 'local', accountRefHash: null },
    fallbackChain: [],
    reachability: { state: 'known', evidenceRef: null },
    limits: { state: 'known', evidenceRefs: [] },
    createdAt: '2026-07-27T00:00:00.000Z',
  };
  const receiptJson = canonicalJson(receipt);
  db.prepare(`
    INSERT INTO invocations (
      invocation_id, tenant_id, project_id, idempotency_key, schema_version,
      payload_json, payload_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    invocationId,
    tenantId,
    projectId,
    receipt.idempotencyKey,
    1,
    receiptJson,
    sha256(receiptJson),
    receipt.createdAt,
  );

  const eventInputs = [
    {
      eventId: `dispatch-rejected-${suffix}`,
      eventType: 'dispatch_rejected',
      occurredAt: '2026-07-27T00:00:01.000Z',
      payload: {
        reasonCode: 'execution_admission_rejected',
        evidenceRefs: [`authority:${suffix}`],
      },
    },
    {
      eventId: `consumer-settled-${suffix}`,
      eventType: 'consumer_settled',
      occurredAt: options.consumerOccurredAt ?? '2026-07-27T00:00:01.000Z',
      payload: {
        outcome: options.consumerOutcome ?? 'accepted',
        reasonCode: 'execution_admission_rejected',
        taskDisposition: 'not_dispatched',
        evidenceRefs: [`authority:${suffix}`],
      },
    },
  ];
  let previousHash: string | null = null;
  for (const [index, event] of eventInputs.entries()) {
    const sequence = index + 1;
    const payloadJson = canonicalJson(event.payload);
    const payloadHash = sha256(canonicalJson({
      type: event.eventType,
      payload: event.payload,
    }));
    const eventHash = sha256(canonicalJson({
      invocationId,
      sequence,
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      payloadHash,
      previousHash,
    }));
    db.prepare(`
      INSERT INTO invocation_events (
        event_id, invocation_id, tenant_id, project_id, sequence, event_type,
        occurred_at, payload_json, payload_hash, prev_hash, event_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.eventId,
      invocationId,
      tenantId,
      projectId,
      sequence,
      event.eventType,
      event.occurredAt,
      payloadJson,
      payloadHash,
      previousHash,
      options.tamperHeadHash && sequence === 2 ? '0'.repeat(64) : eventHash,
    );
    previousHash = eventHash;
  }
}

interface TestInvocationEvent {
  eventId: string;
  eventType: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

function rewriteReceipt(
  db: Database.Database,
  invocationId: string,
  mutate: (receipt: Record<string, unknown>) => void,
): void {
  const row = db.prepare(`
    SELECT payload_json
    FROM invocations
    WHERE invocation_id = ?
  `).get(invocationId) as { payload_json: string };
  const receipt = JSON.parse(row.payload_json) as Record<string, unknown>;
  mutate(receipt);
  const payloadJson = canonicalJson(receipt);
  db.prepare(`
    UPDATE invocations
    SET payload_json = ?, payload_hash = ?
    WHERE invocation_id = ?
  `).run(payloadJson, sha256(payloadJson), invocationId);
}

function replaceInvocationEvents(
  db: Database.Database,
  invocationId: string,
  events: readonly TestInvocationEvent[],
): void {
  const scope = db.prepare(`
    SELECT tenant_id, project_id
    FROM invocations
    WHERE invocation_id = ?
  `).get(invocationId) as { tenant_id: string; project_id: string };
  db.prepare('DELETE FROM invocation_events WHERE invocation_id = ?').run(invocationId);
  let previousHash: string | null = null;
  for (const [index, event] of events.entries()) {
    const sequence = index + 1;
    const payload = JSON.parse(JSON.stringify(event.payload)) as Record<string, unknown>;
    if (
      event.eventType === 'transport_settled'
      && typeof payload.reconciliation === 'object'
      && payload.reconciliation !== null
      && (payload.reconciliation as Record<string, unknown>).dispatchEventHash
        === '$PREVIOUS_HASH'
    ) {
      (payload.reconciliation as Record<string, unknown>).dispatchEventHash = previousHash;
    }
    const payloadJson = canonicalJson(payload);
    const payloadHash = sha256(canonicalJson({ type: event.eventType, payload }));
    const eventHash = sha256(canonicalJson({
      invocationId,
      sequence,
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      payloadHash,
      previousHash,
    }));
    db.prepare(`
      INSERT INTO invocation_events (
        event_id, invocation_id, tenant_id, project_id, sequence, event_type,
        occurred_at, payload_json, payload_hash, prev_hash, event_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.eventId,
      invocationId,
      scope.tenant_id,
      scope.project_id,
      sequence,
      event.eventType,
      event.occurredAt,
      payloadJson,
      payloadHash,
      previousHash,
      eventHash,
    );
    previousHash = eventHash;
  }
}

function rewriteInvocationEvents(
  db: Database.Database,
  invocationId: string,
  mutate: (events: TestInvocationEvent[]) => void,
): void {
  const rows = db.prepare(`
    SELECT event_id, event_type, occurred_at, payload_json
    FROM invocation_events
    WHERE invocation_id = ?
    ORDER BY sequence ASC
  `).all(invocationId) as {
    event_id: string;
    event_type: string;
    occurred_at: string;
    payload_json: string;
  }[];
  const events = rows.map(row => ({
    eventId: row.event_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
  }));
  mutate(events);
  replaceInvocationEvents(db, invocationId, events);
}

function rewriteAsLegacyAttestation(
  db: Database.Database,
  invocationId: string,
  taskPath: string,
  overrides: {
    taskContentDigest?: string;
    taskCreatedAt?: string;
  } = {},
): void {
  rewriteInvocationEvents(db, invocationId, events => {
    const evidenceRefs = ['absence:a', 'absence:b'];
    events[0]!.payload = {
      reasonCode: 'legacy_operator_attestation',
      evidenceRefs,
      attestation: {
        attestationKind: 'legacy-reconciliation',
        operatorRefHash: 'a'.repeat(64),
        attestedAt: events[0]!.occurredAt,
        reasonCode: 'legacy_operator_attestation',
        statementDigest: 'b'.repeat(64),
        taskContentDigest: overrides.taskContentDigest
          ?? sha256(readFileSync(taskPath)),
        taskCreatedAt: overrides.taskCreatedAt
          ?? '2026-07-27T00:00:00.000Z',
        observedAbsenceEvidenceRefs: evidenceRefs,
      },
    };
    events[1]!.payload = {
      outcome: 'accepted',
      reasonCode: 'legacy_operator_attestation',
      taskDisposition: 'not_dispatched',
      evidenceRefs,
    };
  });
}

function reasonCodes(report: ReturnType<typeof inspectActiveExecutions>): string[] {
  return report.reasons.map((reason: { code: string }) => reason.code);
}

function runNode(
  scriptPath: string,
  cwd: string,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd,
      env: {
        ...process.env,
        DECKENT_TEST_HERMETICITY: '0',
        NODE_PATH: join(REPO_ROOT, 'node_modules'),
        VITEST: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', rejectPromise);
    child.on('close', code => resolvePromise({ code, output }));
  });
}

function waitForJsonFile(
  path: string,
  child: ReturnType<typeof spawn>,
  stderr: () => string,
): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, rejectPromise) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timeout !== undefined) clearTimeout(timeout);
      child.off('error', onError);
      child.off('close', onClose);
    };
    const onError = (error: Error) => {
      cleanup();
      rejectPromise(error);
    };
    const onClose = (code: number | null) => {
      cleanup();
      rejectPromise(new Error(
        `maintenance child closed (${String(code)}): ${stderr()}`,
      ));
    };
    const poll = () => {
      if (existsSync(path)) {
        try {
          const message = JSON.parse(readFileSync(path, 'utf8'));
          cleanup();
          resolvePromise(message);
        } catch (error) {
          cleanup();
          rejectPromise(error);
        }
        return;
      }
      timeout = setTimeout(poll, 10);
    };
    child.once('error', onError);
    child.once('close', onClose);
    poll();
  });
}

function spawnMaintenanceOwner(root: string): {
  child: ReturnType<typeof spawn>;
  readyPath: string;
  releasePath: string;
  stderr: () => string;
} {
  const cleanUrl =
    pathToFileURL(join(REPO_ROOT, 'scripts', 'clean.mjs')).href;
  const readyPath = join(root, '.maintenance-owner-ready.json');
  const releasePath = join(root, '.maintenance-owner-release');
  const source = `
    import { existsSync, writeFileSync } from 'node:fs';
    import {
      acquireCleanMaintenanceLock,
      releaseCleanMaintenanceLock
    } from ${JSON.stringify(cleanUrl)};
    const [root, readyPath, releasePath] = process.argv.slice(-3);
    let lock;
    try {
      lock = acquireCleanMaintenanceLock(root);
      writeFileSync(
        readyPath,
        JSON.stringify({ type: 'acquired', lock }),
        'utf8'
      );
    } catch (error) {
      writeFileSync(
        readyPath,
        JSON.stringify({
          type: 'failed',
          code: error?.code ?? 'unknown'
        }),
        'utf8'
      );
      process.exitCode = 4;
    }
    const poll = lock === undefined ? undefined : setInterval(() => {
      if (!existsSync(releasePath)) return;
      clearInterval(poll);
      try {
        const released = releaseCleanMaintenanceLock(root, lock);
        process.exitCode = released ? 0 : 2;
      } catch (error) {
        process.stderr.write(String(error?.code ?? error) + '\\n');
        process.exitCode = 3;
      }
    }, 10);
  `;
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      source,
      root,
      readyPath,
      releasePath,
    ],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        DECKENT_TEST_HERMETICITY: '0',
        VITEST: 'false',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  let childStderr = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', chunk => {
    childStderr += chunk;
  });
  return {
    child,
    readyPath,
    releasePath,
    stderr: () => childStderr,
  };
}

function runMaintenanceAttempt(
  root: string,
): Promise<{ code: number | null; message: Record<string, unknown> }> {
  const cleanUrl =
    pathToFileURL(join(REPO_ROOT, 'scripts', 'clean.mjs')).href;
  const resultPath = join(root, '.maintenance-attempt-result.json');
  const source = `
    import { writeFileSync } from 'node:fs';
    import {
      acquireCleanMaintenanceLock,
      releaseCleanMaintenanceLock
    } from ${JSON.stringify(cleanUrl)};
    const [root, resultPath] = process.argv.slice(-2);
    try {
      const lock = acquireCleanMaintenanceLock(root);
      releaseCleanMaintenanceLock(root, lock);
      writeFileSync(resultPath, JSON.stringify({ type: 'acquired' }), 'utf8');
    } catch (error) {
      writeFileSync(resultPath, JSON.stringify({
        type: 'blocked',
        code: error?.code ?? 'unknown'
      }), 'utf8');
      process.exitCode = 4;
    }
  `;
  const child = spawn(
    process.execPath,
    ['--input-type=module', '--eval', source, root, resultPath],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        DECKENT_TEST_HERMETICITY: '0',
        VITEST: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return new Promise((resolvePromise, rejectPromise) => {
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', chunk => {
      stderr += chunk;
    });
    child.once('error', rejectPromise);
    child.once('close', code => {
      try {
        resolvePromise({
          code,
          message: JSON.parse(readFileSync(resultPath, 'utf8')),
        });
      } catch (error) {
        rejectPromise(new Error(
          `maintenance attempt output invalid (${String(code)}): ${stderr}`,
          { cause: error },
        ));
      }
    });
  });
}

function readRetainedMaintenanceGeneration(root: string): {
  active: {
    task_id: string;
    owner_id: string;
    fencing_epoch: string;
    fencing_counter: number;
    fencing_nonce: string;
    payload_json: string;
  };
  payload: ExecutionLockInfo;
  projection: ExecutionLockInfo;
} {
  const db = new Database(
    join(root, '.locks', 'execution-lock-authority.sqlite3'),
    { readonly: true },
  );
  const rows = db.prepare(`
    SELECT
      task_id,
      owner_id,
      fencing_epoch,
      fencing_counter,
      fencing_nonce,
      payload_json
    FROM execution_lock_active
  `).all() as {
    task_id: string;
    owner_id: string;
    fencing_epoch: string;
    fencing_counter: number;
    fencing_nonce: string;
    payload_json: string;
  }[];
  db.close();
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error(
      `expected one retained maintenance generation, received ${rows.length}`,
    );
  }
  const active = rows[0];
  const payload = JSON.parse(active.payload_json) as ExecutionLockInfo;
  const projectionPath = join(
    root,
    '.locks',
    `${sha256('__deckent_project_maintenance__')}.executionlock`,
  );
  const projection = JSON.parse(
    readFileSync(projectionPath, 'utf8'),
  ) as typeof payload;
  return { active, payload, projection };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('clean active-execution admission', () => {
  it('allows a clean clone with no runtime directory or receipt database', () => {
    const report = inspectActiveExecutions(fixtureRoot());

    expect(report.decision).toBe('ALLOW');
    expect(report.code).toBe('CLEAN_ACTIVE_EXECUTION_CLEAR');
    expect(report.reasons).toEqual([]);
  });

  it('owns and releases the canonical v3 maintenance generation with epoch/counter/nonce fencing', () => {
    const root = fixtureRoot();
    const lock = acquireCleanMaintenanceLock(root);

    expect(lock).toEqual(expect.objectContaining({
      schemaVersion: 3,
      taskId: '__deckent_project_maintenance__',
      actor: 'maintenance',
      fencingToken: {
        epoch: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
        ),
        counter: 1,
        nonce: expect.stringMatching(/^[0-9a-f]{32}$/u),
      },
    }));
    expect(reasonCodes(inspectActiveExecutions(root, {
      processProbe: () => 'alive',
    }))).toContain('E_CLEAN_PROJECT_MAINTENANCE_ACTIVE');
    expect(() => releaseCleanMaintenanceLock(
      root,
      {
        ...lock,
        ownerId: '00000000-0000-4000-8000-000000000099',
      },
    )).toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST/u);
    expect(releaseCleanMaintenanceLock(root, lock)).toBe(true);
    expect(inspectActiveExecutions(root).decision).toBe('ALLOW');

    const sentinel = JSON.parse(readFileSync(
      join(root, '.locks', 'execution-lock-authority.sentinel.json'),
      'utf8',
    )) as { authorityEpoch: string };
    const db = new Database(
      join(root, '.locks', 'execution-lock-authority.sqlite3'),
      { readonly: true },
    );
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    expect(db.prepare(`
      SELECT authority_epoch, fencing_counter
        FROM execution_lock_meta
       WHERE singleton = 1
    `).get()).toEqual({
      authority_epoch: sentinel.authorityEpoch,
      fencing_counter: 1,
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM execution_lock_active').get())
      .toEqual({ count: 0 });
    db.close();
  });

  it('validates live quarantine audits with a fixed JOIN query shape', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'scripts', 'clean.mjs'),
      'utf8',
    );
    const loader = source.slice(
      source.indexOf('function loadCleanExecutionQuarantineAudits'),
      source.indexOf('function loadCleanExecutionQuarantineRows'),
    );

    expect(loader).toContain(
      'JOIN execution_lock_quarantine AS quarantine',
    );
    expect(loader).not.toContain(' IN (');
    expect(loader).not.toContain('.all(...');
    const pageLoader = source.slice(
      source.indexOf('function loadCleanExecutionActivePage'),
      source.indexOf('function loadCleanExecutionActiveRow'),
    );
    expect(pageLoader).toContain('WHERE task_id > ?');
    expect(pageLoader).toContain('LIMIT ?');
    expect(source).not.toContain(
      'activeRows.length > EVIDENCE_LIMITS.executionLockFiles',
    );
  });

  it('inspects more than two thousand canonical execution rows without an arbitrary authority limit', () => {
    const root = fixtureRoot();
    const seed = acquireCleanMaintenanceLock(root);
    expect(releaseCleanMaintenanceLock(root, seed)).toBe(true);
    const dbPath = join(
      root,
      '.locks',
      'execution-lock-authority.sqlite3',
    );
    const db = new Database(dbPath);
    const epoch = (db.prepare(`
      SELECT authority_epoch
        FROM execution_lock_meta
       WHERE singleton = 1
    `).get() as { authority_epoch: string }).authority_epoch;
    const insert = db.prepare(`
      INSERT INTO execution_lock_active(
        task_id, owner_id, fencing_epoch, fencing_counter, fencing_nonce,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const locks: ExecutionLockInfo[] = [];
    for (let index = 0; index < 2_101; index++) {
      const counter = index + 2;
      const taskId = `scale-${index.toString().padStart(4, '0')}`;
      const ownerId =
        `10000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
      const nonce = counter.toString(16).padStart(32, '0');
      locks.push({
        schemaVersion: 3,
        taskId,
        actor: 'dispatch',
        ownerId,
        pid: 42,
        hostInstanceId: 'scale-host',
        bootSessionId: 'scale-boot',
        processSessionId: 'scale-process',
        fencingToken: { epoch, counter, nonce },
        acquiredAt: '2026-07-27T00:00:00.000Z',
        renewedAt: '2026-07-27T00:00:00.000Z',
        leaseDurationMs: 30_000,
      });
    }
    db.transaction(() => {
      for (const lock of locks) {
        insert.run(
          lock.taskId,
          lock.ownerId,
          lock.fencingToken.epoch,
          lock.fencingToken.counter,
          lock.fencingToken.nonce,
          JSON.stringify(lock),
        );
      }
      db.prepare(`
        UPDATE execution_lock_meta
           SET fencing_counter = ?
         WHERE singleton = 1
      `).run(locks.at(-1)!.fencingToken.counter);
    })();
    db.close();
    for (const lock of locks) {
      writeFileSync(
        join(root, '.locks', `${sha256(lock.taskId)}.executionlock`),
        JSON.stringify(lock),
        'utf8',
      );
    }

    const report = inspectActiveExecutions(root, {
      nowMs: Date.parse('2026-07-27T00:00:01.000Z'),
      processProbe: () => 'alive',
    });
    expect(report.decision).toBe('HOLD');
    expect(report.inspected.executionLockFiles).toBe(2_101);
    expect(reasonCodes(report)).not.toContain(
      'E_CLEAN_EXECUTIONLOCK_EVIDENCE_LIMIT',
    );
    expect(reasonCodes(report)).not.toContain(
      'E_CLEAN_EXECUTIONLOCK_STATE_INVALID',
    );
    expect(reasonCodes(report)).toContain(
      'E_CLEAN_TASK_EXECUTION_FENCE_ORPHAN',
    );
  });

  it('exposes exact full-fence boundary, renewal, assertion, and completion APIs', () => {
    const root = fixtureRoot();
    const base = Date.parse('2026-07-27T12:00:00.000Z');
    const lock = acquireCleanMaintenanceLock(root, {
      now: () => base,
      leaseDurationMs: 100,
    });
    const boundary = beginCleanMaintenanceIrreversibleBoundary(
      root,
      lock,
      { evidenceRefs: ['clean:dist-delete'] },
      { now: () => base + 1 },
    );

    expect(boundary).toMatchObject({
      state: 'in-flight',
      reason: 'irreversible-boundary',
      lock,
    });
    expect(checkExecutionLock(root, lock.taskId)).toEqual({
      state: 'quarantined',
      lock,
      quarantine: boundary,
    });
    expect(reasonCodes(inspectActiveExecutions(root)))
      .toContain('E_CLEAN_EXECUTIONLOCK_QUARANTINED');
    expect(() => releaseCleanMaintenanceLock(root, lock))
      .toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED/u);
    expect(() => acquireCleanMaintenanceLock(root, {
      now: () => base + 101,
      livenessProbe: () => 'dead',
    })).toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED/u);
    expect(() => assertCleanMaintenanceLock(root, lock)).not.toThrow();

    const renewed = renewCleanMaintenanceLock(root, lock, {
      now: () => base + 20,
    });
    expect(renewed.renewedAt).toBe('2026-07-27T12:00:00.020Z');
    expect(() => completeCleanMaintenanceIrreversibleBoundary(
      root,
      lock,
      {
        quarantineId: boundary.quarantineId,
        evidenceRefs: ['clean:dist-content-verified'],
      },
    )).toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST/u);

    expect(completeCleanMaintenanceIrreversibleBoundary(
      root,
      renewed,
      {
        quarantineId: boundary.quarantineId,
        evidenceRefs: ['clean:dist-content-verified'],
      },
      { now: () => base + 30 },
    )).toMatchObject({
      audit: expect.objectContaining({ action: 'completed' }),
      projectionCleanup: 'completed',
    });
    expect(checkExecutionLock(root, lock.taskId)).toEqual({ state: 'absent' });
    expect(inspectActiveExecutions(root).decision).toBe('ALLOW');
  });

  it('reclaims exact-owner crashed staging only after owner-death proof', () => {
    const root = fixtureRoot();
    const base = Date.parse('2026-07-27T12:00:00.000Z');
    const lock = acquireCleanMaintenanceLock(root, {
      now: () => base,
      leaseDurationMs: 100,
    });
    const stagingPath = join(
      root,
      '.locks',
      `${sha256(lock.taskId)}.executionlock.tmp-${lock.ownerId}`,
    );
    writeFileSync(stagingPath, '{"partial":', 'utf8');

    expect(() => acquireCleanMaintenanceLock(root, {
      now: () => base + 101,
      livenessProbe: () => 'alive',
    })).toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_HELD/u);
    expect(readFileSync(stagingPath, 'utf8')).toBe('{"partial":');

    const recovered = acquireCleanMaintenanceLock(root, {
      now: () => base + 101,
      livenessProbe: () => 'dead',
    });
    expect(recovered.fencingToken.counter)
      .toBeGreaterThan(lock.fencingToken.counter);
    expect(existsSync(stagingPath)).toBe(false);
    expect(releaseCleanMaintenanceLock(root, recovered)).toBe(true);
  });

  it('surfaces committed clean renewal and release projection uncertainty', () => {
    const renewalRoot = fixtureRoot();
    const base = Date.parse('2026-07-27T12:00:00.000Z');
    const renewal = acquireCleanMaintenanceLock(renewalRoot, {
      now: () => base,
    });
    const renewalLocks = join(renewalRoot, '.locks');
    const retiredRenewalLocks =
      join(renewalRoot, '.locks-renew-retired');
    let renewalFailure: unknown;
    try {
      renewCleanMaintenanceLock(renewalRoot, renewal, {
        now: () => base + 10,
        projectionPublisher: () => {
          renameSync(renewalLocks, retiredRenewalLocks);
          mkdirSync(renewalLocks);
          throw new Error('injected renewal projection fault');
        },
      });
    } catch (error) {
      renewalFailure = error;
    }
    expect(renewalFailure).toEqual(expect.objectContaining({
      code: 'E_CLEAN_MAINTENANCE_RENEWAL_UNCERTAIN',
      canonicalCommitState: 'committed',
      recoveryLock: expect.objectContaining({
        ownerId: renewal.ownerId,
        renewedAt: '2026-07-27T12:00:00.010Z',
      }),
    }));

    const releaseRoot = fixtureRoot();
    const release = acquireCleanMaintenanceLock(releaseRoot);
    const releaseLocks = join(releaseRoot, '.locks');
    const retiredReleaseLocks =
      join(releaseRoot, '.locks-release-retired');
    let releaseFailure: unknown;
    try {
      releaseCleanMaintenanceLock(releaseRoot, release, {
        releaseCommitObserver: () => {
          renameSync(releaseLocks, retiredReleaseLocks);
          mkdirSync(releaseLocks);
        },
      });
    } catch (error) {
      releaseFailure = error;
    }
    expect(releaseFailure).toEqual(expect.objectContaining({
      code: 'E_CLEAN_MAINTENANCE_RELEASE_UNCERTAIN',
      canonicalCommitState: 'committed',
      recoveryLock: release,
    }));
    const releasedDb = new Database(join(
      retiredReleaseLocks,
      'execution-lock-authority.sqlite3',
    ), { readonly: true });
    expect(releasedDb.prepare(`
      SELECT COUNT(*) AS count
        FROM execution_lock_active
       WHERE task_id = ?
    `).get(release.taskId)).toEqual({ count: 0 });
    releasedDb.close();
  });

  it('keeps a committed clean completion authoritative when projection cleanup is uncertain', () => {
    const root = fixtureRoot();
    const base = Date.parse('2026-07-27T12:00:00.000Z');
    const lock = acquireCleanMaintenanceLock(root, { now: () => base });
    const boundary = beginCleanMaintenanceIrreversibleBoundary(
      root,
      lock,
      { evidenceRefs: ['clean:dist-delete'] },
      { now: () => base + 1 },
    );
    const projectionPath = join(
      root,
      '.locks',
      `${sha256(lock.taskId)}.executionlock`,
    );

    const completed = completeCleanMaintenanceIrreversibleBoundary(
      root,
      lock,
      {
        quarantineId: boundary.quarantineId,
        evidenceRefs: ['clean:dist-content-verified'],
      },
      {
        now: () => base + 2,
        terminalCommitObserver: () => {
          rmSync(projectionPath, { force: true });
          mkdirSync(projectionPath);
        },
      },
    );

    expect(completed).toMatchObject({
      audit: expect.objectContaining({ action: 'completed' }),
      projectionCleanup: 'uncertain',
    });
    const db = new Database(
      join(root, '.locks', 'execution-lock-authority.sqlite3'),
      { readonly: true },
    );
    expect(db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM execution_lock_active) AS active,
        (SELECT COUNT(*) FROM execution_lock_quarantine) AS quarantine
    `).get()).toEqual({ active: 0, quarantine: 0 });
    expect(db.prepare(`
      SELECT action
        FROM execution_lock_quarantine_audit
       WHERE quarantine_id = ?
       ORDER BY occurred_at, action
    `).all(boundary.quarantineId)).toEqual([
      { action: 'boundary-entered' },
      { action: 'completed' },
    ]);
    db.close();

    expect(inspectActiveExecutions(root).decision).toBe('HOLD');
    rmSync(projectionPath, { recursive: true, force: true });
    expect(checkExecutionLock(root, lock.taskId)).toEqual({ state: 'absent' });
    expect(inspectActiveExecutions(root).decision).toBe('ALLOW');
  });

  it('writes clean quarantine bytes that core verifies and explicitly recovers', () => {
    const root = fixtureRoot();
    const base = Date.parse('2026-07-27T12:00:00.000Z');
    const lock = acquireCleanMaintenanceLock(root, { now: () => base });
    const boundary = beginCleanMaintenanceIrreversibleBoundary(
      root,
      lock,
      { evidenceRefs: ['clean:dist-delete'] },
      { now: () => base + 1 },
    );
    const quarantine = quarantineCleanMaintenanceLock(
      root,
      lock,
      {
        reason: 'partial-mutation',
        evidenceRefs: ['clean:partial-delete'],
      },
      { now: () => base + 2 },
    );

    expect(quarantine).toMatchObject({
      quarantineId: boundary.quarantineId,
      state: 'quarantined',
      reason: 'partial-mutation',
    });
    expect(checkExecutionLock(root, lock.taskId)).toEqual({
      state: 'quarantined',
      lock,
      quarantine,
    });
    expect(() => renewCleanMaintenanceLock(root, lock))
      .toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED/u);

    const recovered = recoverQuarantinedExecutionLock(
      root,
      lock,
      {
        schemaVersion: EXECUTION_LOCK_RECOVERY_ATTESTATION_SCHEMA_VERSION,
        quarantineId: quarantine.quarantineId,
        fencingToken: lock.fencingToken,
        operatorId: 'clean-recovery-operator',
        justification: 'Verified the partial dist deletion disposition',
        evidenceRefs: ['approval:clean-recovery-001'],
        attestedAt: new Date(base + 3).toISOString(),
      },
      {
        now: () => base + 3,
        recoveryAttestationVerifier: context =>
          context.quarantineDigest.length === 64
          && context.quarantine.quarantineId === quarantine.quarantineId,
      },
    );
    expect(recovered).toMatchObject({
      audit: expect.objectContaining({ action: 'recovered' }),
      projectionCleanup: 'completed',
    });
    expect(checkExecutionLock(root, lock.taskId)).toEqual({ state: 'absent' });
    expect(inspectActiveExecutions(root).decision).toBe('ALLOW');
  });

  it('recovers an exact clean maintenance quarantine only with fresh verified attestation', () => {
    const root = fixtureRoot();
    const base = Date.parse('2026-07-27T12:30:00.000Z');
    const lock = acquireCleanMaintenanceLock(root, { now: () => base });
    const boundary = beginCleanMaintenanceIrreversibleBoundary(
      root,
      lock,
      { evidenceRefs: ['build:dist-swap'] },
      { now: () => base + 1 },
    );
    const quarantine = quarantineCleanMaintenanceLock(
      root,
      lock,
      {
        reason: 'partial-mutation',
        evidenceRefs: ['build:journal:run-001'],
      },
      { now: () => base + 2 },
    );
    const attestation = {
      schemaVersion: EXECUTION_LOCK_RECOVERY_ATTESTATION_SCHEMA_VERSION,
      quarantineId: boundary.quarantineId,
      fencingToken: lock.fencingToken,
      operatorId: 'transactional-build-recovery',
      justification: 'Verified the retained old and new dist manifests',
      evidenceRefs: ['approval:build-recovery-001', 'build:journal:run-001'],
      attestedAt: new Date(base + 3).toISOString(),
    };

    expect(() => recoverQuarantinedCleanMaintenanceLock(
      root,
      lock,
      attestation,
    )).toThrowError(/E_CLEAN_MAINTENANCE_RECOVERY_VERIFIER_REQUIRED/u);
    expect(() => recoverQuarantinedCleanMaintenanceLock(
      root,
      lock,
      {
        ...attestation,
        attestedAt: new Date(base + 1).toISOString(),
      },
      {
        now: () => base + 3,
        recoveryAttestationVerifier: () => true,
      },
    )).toThrowError(/E_CLEAN_MAINTENANCE_RECOVERY_ATTESTATION_INVALID/u);
    expect(() => recoverQuarantinedCleanMaintenanceLock(
      root,
      lock,
      { ...attestation, attestedAt: new Date(base - 15 * 60 * 1_000 - 1).toISOString() },
      {
        now: () => base,
        recoveryAttestationVerifier: () => true,
      },
    )).toThrowError(/E_CLEAN_MAINTENANCE_RECOVERY_ATTESTATION_INVALID/u);

    const recovered = recoverQuarantinedCleanMaintenanceLock(
      root,
      lock,
      attestation,
      {
        now: () => base + 3,
        recoveryAttestationVerifier: context =>
          context.quarantineDigest.length === 64
          && context.quarantine.quarantineId === quarantine.quarantineId
          && context.attestation.operatorId === 'transactional-build-recovery',
      },
    );

    expect(recovered).toMatchObject({
      recovered: quarantine,
      audit: expect.objectContaining({
        action: 'recovered',
        payload: attestation,
      }),
      projectionCleanup: 'completed',
    });
    expect(checkExecutionLock(root, lock.taskId)).toEqual({ state: 'absent' });
    expect(inspectActiveExecutions(root).decision).toBe('ALLOW');
  });

  it('commits clean v2 migration before returning quarantined admission HOLD', () => {
    const root = fixtureRoot();
    const taskId = 'legacy-clean-migration';
    const expected = seedLegacyV2DedicatedExecutionLock(root, taskId);

    expect(() => acquireCleanMaintenanceLock(root))
      .toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED/u);
    expect(checkExecutionLock(root, taskId)).toEqual({
      state: 'quarantined',
      lock: expected,
      quarantine: expect.objectContaining({
        state: 'quarantined',
        reason: 'legacy-v2-active',
        lock: expected,
      }),
    });
    const report = inspectActiveExecutions(root);
    expect(reasonCodes(report)).toContain(
      'E_CLEAN_EXECUTIONLOCK_QUARANTINED',
    );

    const db = new Database(
      join(root, '.locks', 'execution-lock-authority.sqlite3'),
    );
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    const firstRows = db.prepare(`
      SELECT quarantine_id, payload_json
        FROM execution_lock_quarantine
    `).all();
    const firstAudits = db.prepare(`
      SELECT event_id, payload_json
        FROM execution_lock_quarantine_audit
       ORDER BY event_id
    `).all();
    db.close();

    expect(() => acquireCleanMaintenanceLock(root))
      .toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED/u);
    const replay = new Database(
      join(root, '.locks', 'execution-lock-authority.sqlite3'),
      { readonly: true },
    );
    expect(replay.prepare(`
      SELECT quarantine_id, payload_json
        FROM execution_lock_quarantine
    `).all()).toEqual(firstRows);
    expect(replay.prepare(`
      SELECT event_id, payload_json
        FROM execution_lock_quarantine_audit
       ORDER BY event_id
    `).all()).toEqual(firstAudits);
    replay.close();
  });

  it('rolls back clean v2 migration atomically when a later row is malformed', () => {
    const root = fixtureRoot();
    const taskId = 'legacy-clean-atomic-rollback';
    seedLegacyV2DedicatedExecutionLock(root, taskId);
    const dbPath = join(
      root,
      '.locks',
      'execution-lock-authority.sqlite3',
    );
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO execution_lock_active(
        task_id, owner_id, fencing_epoch, fencing_counter, fencing_nonce,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'legacy-clean-malformed',
      '50000000-0000-4000-8000-000000000005',
      '40000000-0000-4000-8000-000000000004',
      10,
      '3'.repeat(32),
      '{"schemaVersion":2',
    );
    const before = db.prepare(`
      SELECT task_id, payload_json
        FROM execution_lock_active
       ORDER BY task_id
    `).all();
    db.close();

    expect(() => acquireCleanMaintenanceLock(root))
      .toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_INVALID/u);
    const after = new Database(dbPath, { readonly: true });
    expect(after.pragma('user_version', { simple: true })).toBe(2);
    expect(after.prepare(`
      SELECT task_id, payload_json
        FROM execution_lock_active
       ORDER BY task_id
    `).all()).toEqual(before);
    expect(after.prepare(`
      SELECT COUNT(*) AS count
        FROM sqlite_master
       WHERE name IN (
         'execution_lock_quarantine',
         'execution_lock_quarantine_audit'
       )
    `).get()).toEqual({ count: 0 });
    after.close();
  });

  it('fails closed when a named v3 quarantine guard is missing', () => {
    const root = fixtureRoot();
    const lock = acquireCleanMaintenanceLock(root);
    releaseCleanMaintenanceLock(root, lock);
    const db = new Database(
      join(root, '.locks', 'execution-lock-authority.sqlite3'),
    );
    db.exec('DROP TRIGGER execution_lock_quarantine_audit_no_delete');
    db.close();

    expect(checkExecutionLock(root, lock.taskId)).toEqual(
      expect.objectContaining({
        state: 'malformed',
        reason: 'invalid-projection',
      }),
    );
    expect(reasonCodes(inspectActiveExecutions(root)))
      .toContain('E_CLEAN_EXECUTIONLOCK_STATE_INVALID');
    expect(() => acquireCleanMaintenanceLock(root))
      .toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_INVALID/u);
  });

  it('fails closed for missing or mismatched v3 DB/sentinel authority state', () => {
    const sentinelOnly = fixtureRoot();
    mkdirSync(join(sentinelOnly, '.locks'), { recursive: true });
    writeFileSync(
      join(
        sentinelOnly,
        '.locks',
        'execution-lock-authority.sentinel.json',
      ),
      JSON.stringify({
        schemaVersion: 1,
        authorityEpoch: '10000000-0000-4000-8000-000000000001',
        createdAt: '2026-07-27T00:00:00.000Z',
      }),
      'utf8',
    );

    const dbOnly = fixtureRoot();
    mkdirSync(join(dbOnly, '.locks'), { recursive: true });
    new Database(join(
      dbOnly,
      '.locks',
      'execution-lock-authority.sqlite3',
    )).close();

    const epochMismatch = fixtureRoot();
    const lock = acquireCleanMaintenanceLock(epochMismatch);
    releaseCleanMaintenanceLock(epochMismatch, lock);
    const mismatchDb = new Database(join(
      epochMismatch,
      '.locks',
      'execution-lock-authority.sqlite3',
    ));
    mismatchDb.prepare(`
      UPDATE execution_lock_meta
         SET authority_epoch = ?
       WHERE singleton = 1
    `).run('20000000-0000-4000-8000-000000000002');
    mismatchDb.close();

    for (const root of [sentinelOnly, dbOnly]) {
      const report = inspectActiveExecutions(root);
      expect(report.decision).toBe('HOLD');
      expect(report.reasons).toEqual(expect.arrayContaining([
        expect.objectContaining({ detailCode: 'AUTHORITY_STATE_MISSING' }),
      ]));
    }
    expect(inspectActiveExecutions(epochMismatch).reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detailCode: 'AUTHORITY_EPOCH_MISMATCH',
        }),
      ]),
    );
  });

  it('fails closed when DB, sentinel, or projection authority has another hard link', () => {
    const dbRoot = fixtureRoot();
    const dbLock = acquireCleanMaintenanceLock(dbRoot);
    releaseCleanMaintenanceLock(dbRoot, dbLock);
    linkSync(
      join(dbRoot, '.locks', 'execution-lock-authority.sqlite3'),
      join(dbRoot, 'db-hardlink'),
    );

    const sentinelRoot = fixtureRoot();
    const sentinelLock = acquireCleanMaintenanceLock(sentinelRoot);
    releaseCleanMaintenanceLock(sentinelRoot, sentinelLock);
    linkSync(
      join(
        sentinelRoot,
        '.locks',
        'execution-lock-authority.sentinel.json',
      ),
      join(sentinelRoot, 'sentinel-hardlink'),
    );

    const projectionRoot = fixtureRoot();
    writeTask(projectionRoot, 'hardlinked-projection', 'DRAFT');
    const projectionPath = writeDedicatedTaskExecutionLock(
      projectionRoot,
      'hardlinked-projection',
    );
    linkSync(projectionPath, join(projectionRoot, 'projection-hardlink'));

    for (const root of [dbRoot, sentinelRoot, projectionRoot]) {
      const report = inspectActiveExecutions(root, {
        processProbe: () => 'alive',
      });
      expect(report.decision).toBe('HOLD');
      expect(reasonCodes(report)).toContain(
        'E_CLEAN_EXECUTIONLOCK_STATE_INVALID',
      );
    }
  });

  it('serializes both cross-process orderings: execution-first HOLDs clean, clean-first blocks execution', async () => {
    const executionFirstRoot = fixtureRoot();
    const execution = acquireExecutionLock(
      executionFirstRoot,
      'execution-first',
      'dispatch',
    );
    try {
      const attempt = await runMaintenanceAttempt(executionFirstRoot);
      expect(attempt.code).toBe(4);
      expect(attempt.message).toEqual({
        type: 'blocked',
        code: 'E_CLEAN_PROJECT_ACTIVE',
      });
    } finally {
      releaseExecutionLock(
        executionFirstRoot,
        'execution-first',
        execution.ownerId,
      );
    }

    const cleanFirstRoot = fixtureRoot();
    const owner = spawnMaintenanceOwner(cleanFirstRoot);
    const acquired = await waitForJsonFile(
      owner.readyPath,
      owner.child,
      owner.stderr,
    );
    expect(acquired.type).toBe('acquired');
    try {
      expect(() => acquireExecutionLock(
        cleanFirstRoot,
        'blocked-by-clean',
        'dispatch',
      )).toThrowError(expect.objectContaining({
        reason: 'maintenance-held',
      }));
    } finally {
      const closed = new Promise<number | null>((resolvePromise) => {
        owner.child.once('close', resolvePromise);
      });
      writeFileSync(owner.releasePath, 'release', 'utf8');
      expect(await closed).toBe(0);
    }
  });

  it('rejects cross-process authority bootstrap after .locks generation replacement', async () => {
    const root = fixtureRoot();
    const lock = acquireCleanMaintenanceLock(root);
    const locksDir = join(root, '.locks');
    const retiredLocksDir = join(root, '.locks-generation-retired');
    renameSync(locksDir, retiredLocksDir);
    mkdirSync(locksDir);

    const attempt = await runMaintenanceAttempt(root);
    expect(attempt).toEqual({
      code: 4,
      message: {
        type: 'blocked',
        code: 'E_CLEAN_MAINTENANCE_AUTHORITY_EPOCH_MISMATCH',
      },
    });
    expect(readdirSync(locksDir)).toEqual([]);
    expect(() => releaseCleanMaintenanceLock(root, lock))
      .toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_EPOCH_MISMATCH/u);
    const retainedDb = new Database(join(
      retiredLocksDir,
      'execution-lock-authority.sqlite3',
    ), { readonly: true });
    expect(retainedDb.prepare(`
      SELECT owner_id
        FROM execution_lock_active
       WHERE task_id = ?
    `).get(lock.taskId)).toEqual({ owner_id: lock.ownerId });
    retainedDb.close();
  });

  it('fails closed for a receipt-less raw PENDING task', () => {
    const root = fixtureRoot();
    writeTask(root, 'pending-without-receipt', 'PENDING');

    const report = inspectActiveExecutions(root);

    expect(report.decision).toBe('HOLD');
    expect(reasonCodes(report)).toContain('E_CLEAN_TASK_RECEIPT_MISSING');
    expect(report.projections).toEqual([]);
  });

  it('projects an exact receipt-backed rejection settlement to NOT_DISPATCHED', () => {
    const root = fixtureRoot();
    writeTask(root, 'receipt-terminal', 'PENDING');
    const { db, projectId } = openReceiptDatabase(root);
    insertNotDispatchedReceipt(db, projectId, 'receipt-terminal', 'terminal');
    db.close();

    const report = inspectActiveExecutions(root);

    expect(report.decision).toBe('ALLOW');
    expect(report.projections).toEqual([
      expect.objectContaining({
        id: 'receipt-terminal',
        rawStatus: 'PENDING',
        effectiveStatus: 'NOT_DISPATCHED',
        authority: 'invocation-receipt',
      }),
    ]);
    expect(report.projections[0]!.evidenceRefs)
      .toContain('invocation:invocation-terminal');
    expect(report.projections[0]!.evidenceRefs)
      .toContain(
        'event-head:sha256:e6ea6f02cf3582b418745ed48b88e42722c5ad9fca383a5ce66b9e5c9a4cae67',
      );
  });

  it('rejects rehashed NOT_DISPATCHED cause, evidence, or timestamp mismatches', () => {
    const cases: {
      name: string;
      mutate: (events: TestInvocationEvent[]) => void;
    }[] = [
      {
        name: 'reason-mismatch',
        mutate: events => {
          events[1]!.payload.reasonCode = 'not_dispatched_settled';
        },
      },
      {
        name: 'evidence-mismatch',
        mutate: events => {
          events[1]!.payload.evidenceRefs = ['authority:other'];
        },
      },
      {
        name: 'timestamp-mismatch',
        mutate: events => {
          events[1]!.occurredAt = '2026-07-27T00:00:02.000Z';
        },
      },
    ];

    for (const testCase of cases) {
      const root = fixtureRoot();
      writeTask(root, testCase.name, 'PENDING');
      const { db, projectId } = openReceiptDatabase(root);
      insertNotDispatchedReceipt(db, projectId, testCase.name, testCase.name);
      rewriteInvocationEvents(db, `invocation-${testCase.name}`, testCase.mutate);
      db.close();

      const report = inspectActiveExecutions(root);
      expect(
        reasonCodes(report),
        `case ${testCase.name}`,
      ).toContain('E_CLEAN_RECEIPT_INTEGRITY');
      expect(report.reasons, `case ${testCase.name}`).toEqual(expect.arrayContaining([
        expect.objectContaining({ detailCode: 'EVENT_SEMANTICS' }),
      ]));
      expect(report.projections, `case ${testCase.name}`).toEqual([]);
    }
  });

  it('binds legacy attestation to exact current task bytes and createdAt', () => {
    const cases = [
      {
        name: 'legacy-digest-mismatch',
        overrides: { taskContentDigest: 'f'.repeat(64) },
        mutateTaskAfterAttestation: false,
        detailCode: 'LEGACY_ATTESTATION_TASK_DIGEST_MISMATCH',
      },
      {
        name: 'legacy-created-at-mismatch',
        overrides: { taskCreatedAt: '2026-07-26T00:00:00.000Z' },
        mutateTaskAfterAttestation: false,
        detailCode: 'LEGACY_ATTESTATION_TASK_CREATED_AT_MISMATCH',
      },
      {
        name: 'legacy-exact-byte-drift',
        overrides: {},
        mutateTaskAfterAttestation: true,
        detailCode: 'LEGACY_ATTESTATION_TASK_DIGEST_MISMATCH',
      },
    ];

    for (const testCase of cases) {
      const root = fixtureRoot();
      const taskPath = join(root, '.tasks', `task-${testCase.name}.json`);
      writeTask(root, testCase.name, 'PENDING');
      const { db, projectId } = openReceiptDatabase(root);
      insertNotDispatchedReceipt(db, projectId, testCase.name, testCase.name);
      rewriteAsLegacyAttestation(
        db,
        `invocation-${testCase.name}`,
        taskPath,
        testCase.overrides,
      );
      if (testCase.mutateTaskAfterAttestation === true) {
        writeFileSync(
          taskPath,
          `${readFileSync(taskPath, 'utf8')}\n`,
          'utf8',
        );
      }
      db.close();

      const report = inspectActiveExecutions(root);
      expect(report.decision).toBe('HOLD');
      expect(reasonCodes(report)).toContain('E_CLEAN_TASK_RECEIPT_DISK_CONFLICT');
      expect(report.reasons).toEqual(expect.arrayContaining([
        expect.objectContaining({ detailCode: testCase.detailCode }),
      ]));
      expect(report.projections).toEqual([]);
    }
  });

  it('holds tampered, semantically non-terminal, and multiple matching receipts', () => {
    const tamperedRoot = fixtureRoot();
    writeTask(tamperedRoot, 'tampered', 'PENDING');
    const tampered = openReceiptDatabase(tamperedRoot);
    insertNotDispatchedReceipt(
      tampered.db,
      tampered.projectId,
      'tampered',
      'tampered',
      { tamperHeadHash: true },
    );
    tampered.db.close();

    const rejectedRoot = fixtureRoot();
    writeTask(rejectedRoot, 'consumer-rejected', 'PENDING');
    const rejected = openReceiptDatabase(rejectedRoot);
    insertNotDispatchedReceipt(
      rejected.db,
      rejected.projectId,
      'consumer-rejected',
      'consumer-rejected',
      { consumerOutcome: 'rejected' },
    );
    rejected.db.close();

    const timestampRoot = fixtureRoot();
    writeTask(timestampRoot, 'timestamp-conflict', 'PENDING');
    const timestampConflict = openReceiptDatabase(timestampRoot);
    insertNotDispatchedReceipt(
      timestampConflict.db,
      timestampConflict.projectId,
      'timestamp-conflict',
      'timestamp-conflict',
      { consumerOccurredAt: '2026-07-27T00:00:02.000Z' },
    );
    timestampConflict.db.close();

    const duplicateRoot = fixtureRoot();
    writeTask(duplicateRoot, 'duplicate', 'PENDING');
    const duplicate = openReceiptDatabase(duplicateRoot);
    insertNotDispatchedReceipt(duplicate.db, duplicate.projectId, 'duplicate', 'duplicate-a');
    insertNotDispatchedReceipt(duplicate.db, duplicate.projectId, 'duplicate', 'duplicate-b');
    duplicate.db.close();

    expect(reasonCodes(inspectActiveExecutions(tamperedRoot)))
      .toContain('E_CLEAN_RECEIPT_INTEGRITY');
    expect(reasonCodes(inspectActiveExecutions(rejectedRoot)))
      .toContain('E_CLEAN_RECEIPT_INTEGRITY');
    expect(reasonCodes(inspectActiveExecutions(timestampRoot)))
      .toContain('E_CLEAN_RECEIPT_INTEGRITY');
    expect(reasonCodes(inspectActiveExecutions(duplicateRoot)))
      .toContain('E_CLEAN_TASK_RECEIPT_AMBIGUOUS');
  });

  it('rejects a canonical-hashed but structurally incomplete receipt envelope', () => {
    const root = fixtureRoot();
    writeTask(root, 'incomplete-receipt', 'PENDING');
    const { db, projectId } = openReceiptDatabase(root);
    insertNotDispatchedReceipt(db, projectId, 'incomplete-receipt', 'incomplete');
    const row = db.prepare(`
      SELECT payload_json
      FROM invocations
      WHERE invocation_id = ?
    `).get('invocation-incomplete') as { payload_json: string };
    const incomplete = JSON.parse(row.payload_json) as Record<string, unknown>;
    delete incomplete.backend;
    const incompleteJson = canonicalJson(incomplete);
    db.prepare(`
      UPDATE invocations
      SET payload_json = ?, payload_hash = ?
      WHERE invocation_id = ?
    `).run(incompleteJson, sha256(incompleteJson), 'invocation-incomplete');
    db.close();

    const report = inspectActiveExecutions(root);

    expect(report.decision).toBe('HOLD');
    expect(reasonCodes(report)).toContain('E_CLEAN_RECEIPT_INTEGRITY');
    expect(report.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ detailCode: 'RECEIPT_ENVELOPE' }),
    ]));
  });

  it('holds when a settled view has any additional matching receipt authority', () => {
    const root = fixtureRoot();
    writeTask(root, 'one-settled', 'PENDING');
    const { db, projectId } = openReceiptDatabase(root);
    insertNotDispatchedReceipt(db, projectId, 'one-settled', 'settled');
    insertNotDispatchedReceipt(db, projectId, 'one-settled', 'rejected-head');
    db.prepare(`
      DELETE FROM invocation_events
      WHERE invocation_id = ? AND sequence = 2
    `).run('invocation-rejected-head');
    db.close();

    const malformedRoot = fixtureRoot();
    writeTask(malformedRoot, 'settled-plus-malformed', 'PENDING');
    const malformed = openReceiptDatabase(malformedRoot);
    insertNotDispatchedReceipt(
      malformed.db,
      malformed.projectId,
      'settled-plus-malformed',
      'settled-valid',
    );
    insertNotDispatchedReceipt(
      malformed.db,
      malformed.projectId,
      'settled-plus-malformed',
      'settled-malformed',
    );
    rewriteReceipt(malformed.db, 'invocation-settled-malformed', receipt => {
      (receipt.called as Record<string, unknown>).unknown = true;
    });
    malformed.db.close();

    const report = inspectActiveExecutions(root);
    const malformedReport = inspectActiveExecutions(malformedRoot);

    expect(report.decision).toBe('HOLD');
    expect(reasonCodes(report)).toContain('E_CLEAN_TASK_RECEIPT_AMBIGUOUS');
    expect(report.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ detailCode: 'MULTIPLE_TASK_RECEIPTS' }),
    ]));
    expect(report.projections).toEqual([]);
    expect(malformedReport.decision).toBe('HOLD');
    expect(reasonCodes(malformedReport)).toContain('E_CLEAN_RECEIPT_INTEGRITY');
    expect(malformedReport.projections).toEqual([]);
  });

  it('accepts all V1 endpointRefHash compatibility forms', () => {
    const root = fixtureRoot();
    const { db, projectId } = openReceiptDatabase(root);
    for (const suffix of ['endpoint-absent', 'endpoint-null', 'endpoint-sha']) {
      writeTask(root, suffix, 'PENDING');
      insertNotDispatchedReceipt(db, projectId, suffix, suffix);
    }
    rewriteReceipt(db, 'invocation-endpoint-null', receipt => {
      (receipt.backend as Record<string, unknown>).endpointRefHash = null;
    });
    rewriteReceipt(db, 'invocation-endpoint-sha', receipt => {
      (receipt.backend as Record<string, unknown>).endpointRefHash = 'a'.repeat(64);
    });
    db.close();

    const report = inspectActiveExecutions(root);

    expect(report.decision).toBe('ALLOW');
    expect(report.reasons).toEqual([]);
    expect(report.projections.map(projection => projection.id)).toEqual([
      'endpoint-absent',
      'endpoint-null',
      'endpoint-sha',
    ]);
  });

  it('rejects rehashed receipt unknown keys, non-canonical strings, and fallback overflow', () => {
    const cases: {
      name: string;
      mutate: (receipt: Record<string, unknown>) => void;
    }[] = [
      {
        name: 'top-unknown',
        mutate: receipt => { receipt.unknown = true; },
      },
      {
        name: 'selection-unknown',
        mutate: receipt => {
          (receipt.configured as Record<string, unknown>).unknown = true;
        },
      },
      {
        name: 'backend-unknown',
        mutate: receipt => {
          (receipt.backend as Record<string, unknown>).unknown = true;
        },
      },
      {
        name: 'auth-unknown',
        mutate: receipt => {
          (receipt.auth as Record<string, unknown>).unknown = true;
        },
      },
      {
        name: 'reachability-unknown',
        mutate: receipt => {
          (receipt.reachability as Record<string, unknown>).unknown = true;
        },
      },
      {
        name: 'limits-unknown',
        mutate: receipt => {
          (receipt.limits as Record<string, unknown>).unknown = true;
        },
      },
      {
        name: 'fallback-unknown',
        mutate: receipt => {
          receipt.fallbackChain = [{
            sequence: 1,
            fromProvider: null,
            fromModel: null,
            toProvider: 'codex',
            toModel: 'gpt-5.6',
            reasonCode: 'provider_resolution_fallback',
            reachabilityRef: null,
            limitEvidenceRefs: [],
            unknown: true,
          }];
        },
      },
      {
        name: 'fallback-overflow',
        mutate: receipt => {
          receipt.fallbackChain = Array.from({ length: 17 }, (_, index) => ({
            sequence: index + 1,
            fromProvider: null,
            fromModel: null,
            toProvider: 'codex',
            toModel: 'gpt-5.6',
            reasonCode: 'provider_resolution_fallback',
            reachabilityRef: null,
            limitEvidenceRefs: [],
          }));
        },
      },
      {
        name: 'whitespace-identity',
        mutate: receipt => { receipt.callId = ' call-with-padding '; },
      },
      {
        name: 'endpoint-invalid',
        mutate: receipt => {
          (receipt.backend as Record<string, unknown>).endpointRefHash = 'not-a-sha';
        },
      },
    ];

    for (const testCase of cases) {
      const root = fixtureRoot();
      writeTask(root, testCase.name, 'PENDING');
      const { db, projectId } = openReceiptDatabase(root);
      insertNotDispatchedReceipt(db, projectId, testCase.name, testCase.name);
      rewriteReceipt(db, `invocation-${testCase.name}`, testCase.mutate);
      db.close();

      const report = inspectActiveExecutions(root);
      expect(
        reasonCodes(report),
        `case ${testCase.name}`,
      ).toContain('E_CLEAN_RECEIPT_INTEGRITY');
      expect(report.projections, `case ${testCase.name}`).toEqual([]);
    }
  });

  it('accepts semantically valid variants across the full InvocationEvent union', () => {
    const attestationRoot = fixtureRoot();
    writeTask(attestationRoot, 'valid-attestation', 'PENDING');
    const attestationDb = openReceiptDatabase(attestationRoot);
    insertNotDispatchedReceipt(
      attestationDb.db,
      attestationDb.projectId,
      'valid-attestation',
      'valid-attestation',
    );
    rewriteAsLegacyAttestation(
      attestationDb.db,
      'invocation-valid-attestation',
      join(attestationRoot, '.tasks', 'task-valid-attestation.json'),
    );
    attestationDb.db.close();

    const dispatchedRoot = fixtureRoot();
    writeTask(dispatchedRoot, 'valid-dispatched', 'PENDING');
    const dispatchedDb = openReceiptDatabase(dispatchedRoot);
    insertNotDispatchedReceipt(
      dispatchedDb.db,
      dispatchedDb.projectId,
      'valid-dispatched',
      'valid-dispatched',
    );
    rewriteReceipt(dispatchedDb.db, 'invocation-valid-dispatched', receipt => {
      for (const key of ['configured', 'requested', 'resolved', 'called']) {
        const selection = receipt[key] as Record<string, unknown>;
        selection.provider = 'codex';
        selection.model = 'gpt-5.6';
      }
    });
    replaceInvocationEvents(dispatchedDb.db, 'invocation-valid-dispatched', [
      {
        eventId: 'dispatch-started-valid',
        eventType: 'dispatch_started',
        occurredAt: '2026-07-27T00:00:01.000Z',
        payload: {
          attempt: 1,
          executionEvidenceRef: 'process:42',
          calledProvider: 'codex',
          calledModel: 'gpt-5.6',
        },
      },
      {
        eventId: 'transport-settled-valid',
        eventType: 'transport_settled',
        occurredAt: '2026-07-27T00:00:02.000Z',
        payload: {
          outcome: 'succeeded',
          exitCode: 0,
          signal: null,
          reasonCode: 'coordinator_restart_orphan',
          durationMs: 1,
          reconciliation: {
            evidenceRef: 'recovery:bounded',
            dispatchEventHash: '$PREVIOUS_HASH',
          },
        },
      },
      {
        eventId: 'consumer-settled-valid',
        eventType: 'consumer_settled',
        occurredAt: '2026-07-27T00:00:03.000Z',
        payload: {
          outcome: 'accepted',
          reasonCode: 'none',
          taskDisposition: 'done',
          evidenceRefs: ['result:sha256:valid'],
        },
      },
    ]);
    dispatchedDb.db.close();

    const attestationReport = inspectActiveExecutions(attestationRoot);
    const dispatchedReport = inspectActiveExecutions(dispatchedRoot);
    expect(attestationReport.decision).toBe('ALLOW');
    expect(attestationReport.projections).toHaveLength(1);
    expect(reasonCodes(dispatchedReport)).toContain('E_CLEAN_TASK_RECEIPT_NONTERMINAL');
    expect(reasonCodes(dispatchedReport)).not.toContain('E_CLEAN_RECEIPT_INTEGRITY');
  });

  it('rejects rehashed semantic forgeries for every InvocationEvent member', () => {
    const cases: {
      name: string;
      prepare: (db: Database.Database, invocationId: string) => void;
      events: TestInvocationEvent[];
    }[] = [
      {
        name: 'dispatch-started-fractional-attempt',
        prepare: () => undefined,
        events: [{
          eventId: 'dispatch-started-invalid',
          eventType: 'dispatch_started',
          occurredAt: '2026-07-27T00:00:01.000Z',
          payload: { attempt: 1.5 },
        }],
      },
      {
        name: 'dispatch-started-called-identity-mismatch',
        prepare: (db, invocationId) => {
          rewriteReceipt(db, invocationId, receipt => {
            for (const key of ['resolved', 'called']) {
              const selection = receipt[key] as Record<string, unknown>;
              selection.provider = 'codex';
              selection.model = 'gpt-5.6';
            }
          });
        },
        events: [{
          eventId: 'dispatch-started-identity-invalid',
          eventType: 'dispatch_started',
          occurredAt: '2026-07-27T00:00:01.000Z',
          payload: {
            attempt: 1,
            calledProvider: 'gemini',
            calledModel: 'gemini-3',
          },
        }],
      },
      {
        name: 'dispatch-rejected-unknown-key',
        prepare: () => undefined,
        events: [{
          eventId: 'dispatch-rejected-invalid',
          eventType: 'dispatch_rejected',
          occurredAt: '2026-07-27T00:00:01.000Z',
          payload: {
            reasonCode: 'execution_admission_rejected',
            evidenceRefs: ['authority:invalid'],
            unknown: true,
          },
        }],
      },
      {
        name: 'dispatch-rejected-non-predispatch-reason',
        prepare: () => undefined,
        events: [{
          eventId: 'dispatch-rejected-reason-invalid',
          eventType: 'dispatch_rejected',
          occurredAt: '2026-07-27T00:00:01.000Z',
          payload: { reasonCode: 'spawn_error' },
        }],
      },
      {
        name: 'dispatch-rejected-bad-attestation',
        prepare: () => undefined,
        events: [{
          eventId: 'dispatch-rejected-attestation-invalid',
          eventType: 'dispatch_rejected',
          occurredAt: '2026-07-27T00:00:01.000Z',
          payload: {
            reasonCode: 'legacy_operator_attestation',
            evidenceRefs: ['absence:a'],
            attestation: {
              attestationKind: 'legacy-reconciliation',
              operatorRefHash: 'a'.repeat(64),
              attestedAt: '2026-07-27T00:00:02.000Z',
              reasonCode: 'legacy_operator_attestation',
              statementDigest: 'b'.repeat(64),
              taskContentDigest: 'c'.repeat(64),
              taskCreatedAt: '2026-07-27T00:00:00.000Z',
              observedAbsenceEvidenceRefs: ['absence:a'],
            },
          },
        }],
      },
      {
        name: 'transport-settled-non-null-signal-type',
        prepare: () => undefined,
        events: [
          {
            eventId: 'dispatch-started-for-signal',
            eventType: 'dispatch_started',
            occurredAt: '2026-07-27T00:00:01.000Z',
            payload: { attempt: 1 },
          },
          {
            eventId: 'transport-settled-signal-invalid',
            eventType: 'transport_settled',
            occurredAt: '2026-07-27T00:00:02.000Z',
            payload: {
              outcome: 'failed',
              exitCode: 1,
              signal: 9,
              reasonCode: 'nonzero_exit',
              durationMs: 1,
            },
          },
        ],
      },
      {
        name: 'transport-settled-reconciliation-mismatch',
        prepare: () => undefined,
        events: [
          {
            eventId: 'dispatch-started-for-reconciliation',
            eventType: 'dispatch_started',
            occurredAt: '2026-07-27T00:00:01.000Z',
            payload: { attempt: 1 },
          },
          {
            eventId: 'transport-settled-reconciliation-invalid',
            eventType: 'transport_settled',
            occurredAt: '2026-07-27T00:00:02.000Z',
            payload: {
              outcome: 'unknown',
              exitCode: null,
              signal: null,
              reasonCode: 'coordinator_restart_orphan',
              durationMs: 0,
              reconciliation: {
                evidenceRef: 'recovery:mismatch',
                dispatchEventHash: 'f'.repeat(64),
              },
            },
          },
        ],
      },
      {
        name: 'consumer-settled-noncanonical-evidence',
        prepare: () => undefined,
        events: [
          {
            eventId: 'dispatch-rejected-for-consumer',
            eventType: 'dispatch_rejected',
            occurredAt: '2026-07-27T00:00:01.000Z',
            payload: {
              reasonCode: 'execution_admission_rejected',
              evidenceRefs: ['authority:invalid'],
            },
          },
          {
            eventId: 'consumer-settled-evidence-invalid',
            eventType: 'consumer_settled',
            occurredAt: '2026-07-27T00:00:01.000Z',
            payload: {
              outcome: 'accepted',
              reasonCode: 'not_dispatched_settled',
              taskDisposition: 'not_dispatched',
              evidenceRefs: ['z:evidence', 'a:evidence'],
            },
          },
        ],
      },
    ];

    for (const testCase of cases) {
      const root = fixtureRoot();
      writeTask(root, testCase.name, 'PENDING');
      const { db, projectId } = openReceiptDatabase(root);
      insertNotDispatchedReceipt(db, projectId, testCase.name, testCase.name);
      const invocationId = `invocation-${testCase.name}`;
      testCase.prepare(db, invocationId);
      replaceInvocationEvents(db, invocationId, testCase.events);
      db.close();

      const report = inspectActiveExecutions(root);
      expect(
        reasonCodes(report),
        `case ${testCase.name}`,
      ).toContain('E_CLEAN_RECEIPT_INTEGRITY');
      expect(report.reasons, `case ${testCase.name}`).toEqual(expect.arrayContaining([
        expect.objectContaining({ detailCode: 'EVENT_SEMANTICS' }),
      ]));
      expect(report.projections, `case ${testCase.name}`).toEqual([]);
    }
  });

  it('rejects rehashed event chronology before the receipt or predecessor', () => {
    const cases = [
      {
        name: 'before-receipt',
        mutate: (events: TestInvocationEvent[]) => {
          events[0]!.occurredAt = '2026-07-26T23:59:59.999Z';
          events[1]!.occurredAt = '2026-07-26T23:59:59.999Z';
        },
      },
      {
        name: 'before-predecessor',
        mutate: (events: TestInvocationEvent[]) => {
          events[1]!.occurredAt = '2026-07-27T00:00:00.500Z';
        },
      },
    ];

    for (const testCase of cases) {
      const root = fixtureRoot();
      writeTask(root, testCase.name, 'PENDING');
      const { db, projectId } = openReceiptDatabase(root);
      insertNotDispatchedReceipt(db, projectId, testCase.name, testCase.name);
      rewriteInvocationEvents(db, `invocation-${testCase.name}`, testCase.mutate);
      db.close();

      const report = inspectActiveExecutions(root);
      expect(
        reasonCodes(report),
        `case ${testCase.name}`,
      ).toContain('E_CLEAN_RECEIPT_INTEGRITY');
      expect(report.reasons, `case ${testCase.name}`).toEqual(expect.arrayContaining([
        expect.objectContaining({ detailCode: 'EVENT_SEMANTICS' }),
      ]));
    }
  });

  it('requires every raw task snapshot to carry a valid createdAt authority', () => {
    for (const [name, createdAt] of [
      ['created-at-missing', undefined],
      ['created-at-invalid', 'not-a-timestamp'],
    ] as const) {
      const root = fixtureRoot();
      writeJson(join(root, '.tasks', `task-${name}.json`), {
        id: name,
        status: 'PENDING',
        ...(createdAt === undefined ? {} : { createdAt }),
      });

      const report = inspectActiveExecutions(root);

      expect(report.decision).toBe('HOLD');
      expect(reasonCodes(report)).toContain('E_CLEAN_TASK_STATE_INVALID');
      expect(report.reasons).toEqual(expect.arrayContaining([
        expect.objectContaining({ detailCode: 'INVALID_SHAPE' }),
      ]));
      expect(report.projections).toEqual([]);
    }
  });

  it('ignores attempt-private task JSON sidecars during task-state inspection', () => {
    const root = fixtureRoot();
    writeJson(
      join(root, '.tasks', 'task-xv-1-xverify.landing-proposal.json'),
      {
        version: 1,
        taskId: 'xv-1-xverify',
        attemptId: '00000000-0000-4000-8000-000000000001',
        sequence: 1,
      },
    );

    const report = inspectActiveExecutions(root);

    expect(report.decision).toBe('ALLOW');
    expect(report.inspected.taskFiles).toBe(0);
    expect(reasonCodes(report)).not.toContain('E_CLEAN_TASK_STATE_INVALID');
    expect(report.projections).toEqual([]);
  });

  it('holds active, stale, and unknown task execution fences across lock roots', () => {
    const cases = [
      {
        name: 'fence-active',
        state: 'alive' as const,
        directory: '.locks' as const,
        code: 'E_CLEAN_TASK_EXECUTION_FENCE_ACTIVE',
      },
      {
        name: 'fence-stale',
        state: 'dead' as const,
        directory: '.deckent/locks' as const,
        code: 'E_CLEAN_TASK_EXECUTION_FENCE_STALE',
      },
      {
        name: 'fence-unknown',
        state: 'unknown' as const,
        directory: '.locks' as const,
        code: 'E_CLEAN_TASK_EXECUTION_FENCE_STATE_UNKNOWN',
      },
      {
        name: 'fence-age-stale',
        state: 'alive' as const,
        directory: '.locks' as const,
        acquiredAt: '2026-07-26T23:00:00.000Z',
        code: 'E_CLEAN_TASK_EXECUTION_FENCE_STALE',
      },
    ];

    for (const testCase of cases) {
      const root = fixtureRoot();
      writeTask(root, testCase.name, 'DRAFT');
      writeTaskExecutionFence(root, testCase.name, {
        actor: testCase.name === 'fence-stale' ? 'settlement' : 'dispatch',
        directory: testCase.directory,
        ...('acquiredAt' in testCase
          ? { acquiredAt: testCase.acquiredAt }
          : {}),
      });

      const report = inspectActiveExecutions(root, {
        processProbe: () => testCase.state,
        nowMs: Date.parse('2026-07-27T00:01:00.000Z'),
      });

      expect(report.decision).toBe('HOLD');
      expect(reasonCodes(report), `case ${testCase.name}`).toContain(testCase.code);
      if (testCase.name === 'fence-age-stale') {
        expect(report.reasons).toEqual(expect.arrayContaining([
          expect.objectContaining({ detailCode: 'AGE_EXCEEDED' }),
        ]));
      }
      expect(report.projections).toEqual([]);
      expect(report.inspected.spawnLockFiles).toBe(1);
    }
  });

  it('holds malformed and orphan task execution fence evidence with typed reasons', () => {
    const orphanRoot = fixtureRoot();
    writeTaskExecutionFence(orphanRoot, 'fence-orphan');

    const invalidOwnerRoot = fixtureRoot();
    writeTask(invalidOwnerRoot, 'fence-invalid-owner', 'DRAFT');
    writeTaskExecutionFence(invalidOwnerRoot, 'fence-invalid-owner', {
      owner: 'dispatch:not-a-pid:not-a-uuid',
    });

    const invalidLogicalKeyRoot = fixtureRoot();
    writeTaskExecutionFence(invalidLogicalKeyRoot, 'fence-invalid-key', {
      filePath: 'deckent-task-execution:/fence-invalid-key',
    });

    const malformedRoot = fixtureRoot();
    const malformedPath = join(malformedRoot, '.locks', 'malformed.spawnlock');
    mkdirSync(join(malformedRoot, '.locks'), { recursive: true });
    writeFileSync(malformedPath, '{not-json', 'utf8');

    const orphanReport = inspectActiveExecutions(orphanRoot, {
      processProbe: () => 'dead',
      nowMs: Date.parse('2026-07-27T00:01:00.000Z'),
    });
    const invalidOwnerReport = inspectActiveExecutions(invalidOwnerRoot, {
      processProbe: () => 'alive',
      nowMs: Date.parse('2026-07-27T00:01:00.000Z'),
    });
    const malformedReport = inspectActiveExecutions(malformedRoot, {
      nowMs: Date.parse('2026-07-27T00:01:00.000Z'),
    });
    const invalidLogicalKeyReport = inspectActiveExecutions(invalidLogicalKeyRoot, {
      processProbe: () => 'alive',
      nowMs: Date.parse('2026-07-27T00:01:00.000Z'),
    });

    expect(reasonCodes(orphanReport))
      .toContain('E_CLEAN_TASK_EXECUTION_FENCE_ORPHAN');
    expect(reasonCodes(invalidOwnerReport))
      .toContain('E_CLEAN_TASK_EXECUTION_FENCE_INVALID');
    expect(invalidOwnerReport.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ detailCode: 'INVALID_OWNER' }),
    ]));
    expect(reasonCodes(malformedReport)).toContain('E_CLEAN_SPAWNLOCK_STATE_INVALID');
    expect(malformedReport.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ detailCode: 'INVALID_JSON' }),
    ]));
    expect(reasonCodes(invalidLogicalKeyReport))
      .toContain('E_CLEAN_TASK_EXECUTION_FENCE_INVALID');
    expect(invalidLogicalKeyReport.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ detailCode: 'INVALID_LOGICAL_KEY' }),
    ]));
  });

  it('holds canonical dedicated execution locks for alive, dead, and unknown owners', () => {
    const cases = [
      {
        name: 'execution-lock-active',
        processState: 'alive' as const,
        code: 'E_CLEAN_TASK_EXECUTION_FENCE_ACTIVE',
      },
      {
        name: 'execution-lock-dead',
        processState: 'dead' as const,
        code: 'E_CLEAN_TASK_EXECUTION_FENCE_STALE',
        detailCode: 'OWNER_DEAD',
      },
      {
        name: 'execution-lock-unknown',
        processState: 'unknown' as const,
        code: 'E_CLEAN_TASK_EXECUTION_FENCE_STATE_UNKNOWN',
      },
      {
        name: 'execution-lock-expired-alive',
        processState: 'alive' as const,
        code: 'E_CLEAN_TASK_EXECUTION_FENCE_ACTIVE',
        detailCode: 'LEASE_EXPIRED',
        renewedAt: '2026-07-27T00:00:00.000Z',
      },
    ];

    for (const testCase of cases) {
      const root = fixtureRoot();
      writeTask(root, testCase.name, 'DRAFT');
      writeDedicatedTaskExecutionLock(root, testCase.name, {
        actor: testCase.processState === 'dead' ? 'settlement' : 'dispatch',
        renewedAt: testCase.renewedAt ?? '2026-07-27T00:00:45.000Z',
      });

      const report = inspectActiveExecutions(root, {
        processProbe: () => testCase.processState,
        nowMs: Date.parse('2026-07-27T00:01:00.000Z'),
      });

      expect(report.decision).toBe('HOLD');
      expect(reasonCodes(report), `case ${testCase.name}`).toContain(testCase.code);
      if (testCase.detailCode) {
        expect(report.reasons).toEqual(expect.arrayContaining([
          expect.objectContaining({ detailCode: testCase.detailCode }),
        ]));
      }
      expect(report.inspected.executionLockFiles).toBe(1);
    }
  });

  it('fails closed for malformed, misnamed, future, and orphan dedicated execution locks', () => {
    const malformedRoot = fixtureRoot();
    writeDedicatedTaskExecutionLock(malformedRoot, 'execution-lock-malformed', {
      value: { schemaVersion: 1, taskId: 'execution-lock-malformed' },
    });

    const misnamedRoot = fixtureRoot();
    writeTask(misnamedRoot, 'execution-lock-misnamed', 'DRAFT');
    writeDedicatedTaskExecutionLock(misnamedRoot, 'execution-lock-misnamed', {
      fileName: `${'0'.repeat(64)}.executionlock`,
    });

    const futureRoot = fixtureRoot();
    writeTask(futureRoot, 'execution-lock-future', 'DRAFT');
    writeDedicatedTaskExecutionLock(futureRoot, 'execution-lock-future', {
      acquiredAt: '2026-07-27T00:02:00.000Z',
      renewedAt: '2026-07-27T00:02:00.000Z',
    });

    const orphanRoot = fixtureRoot();
    writeDedicatedTaskExecutionLock(orphanRoot, 'execution-lock-orphan');

    const malformedReport = inspectActiveExecutions(malformedRoot);
    const misnamedReport = inspectActiveExecutions(misnamedRoot);
    const futureReport = inspectActiveExecutions(futureRoot, {
      processProbe: () => 'alive',
      nowMs: Date.parse('2026-07-27T00:01:00.000Z'),
    });
    const orphanReport = inspectActiveExecutions(orphanRoot, {
      processProbe: () => 'dead',
      nowMs: Date.parse('2026-07-27T00:01:00.000Z'),
    });

    expect(reasonCodes(malformedReport)).toContain('E_CLEAN_EXECUTIONLOCK_STATE_INVALID');
    expect(reasonCodes(misnamedReport)).toContain('E_CLEAN_EXECUTIONLOCK_STATE_INVALID');
    expect(reasonCodes(futureReport)).toContain('E_CLEAN_EXECUTIONLOCK_STATE_INVALID');
    expect(futureReport.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ detailCode: 'FUTURE_TIMESTAMP' }),
    ]));
    expect(reasonCodes(orphanReport)).toContain('E_CLEAN_TASK_EXECUTION_FENCE_ORPHAN');
  });

  it('holds active or resumable task, worker, sprint, process, and bot evidence', () => {
    const root = fixtureRoot();
    writeTask(root, 'paused-task', 'PAUSED');
    writeJson(join(root, '.tasks', 'task-paused-task.hb'), {
      workerId: 'worker-paused',
      taskId: 'paused-task',
      status: 'PAUSED',
      timestamp: '2026-07-27T00:00:00.000Z',
    });
    writeJson(join(root, '.deckent', 'sprint-active.json'), {
      sprintId: 'sprint-active',
    });
    writeJson(join(root, '.deckent', 'state', 'active-sprint.json'), {
      jobId: 'sprint-mcp-launch',
      source: 'mcp',
      childPid: process.pid,
      ipcDir: join(root, '.deckent', 'sprint-mcp-launch-ipc'),
      startedAt: '2026-07-27T00:00:00.000Z',
    });
    writeJson(join(root, '.deckent', 'autonomous', 'backlog.json'), {
      _version: '1.0',
      entries: [{
        id: 'process-running',
        kind: 'process',
        status: 'running',
      }],
    });
    writeFileSync(join(root, '.deckent', 'bot.pid'), String(process.pid), 'utf-8');

    const report = inspectActiveExecutions(root, { processProbe: () => 'alive' });

    expect(report.decision).toBe('HOLD');
    expect(reasonCodes(report)).toEqual(expect.arrayContaining([
      'E_CLEAN_TASK_ACTIVE',
      'E_CLEAN_WORKER_ACTIVE',
      'E_CLEAN_SPRINT_MARKER_STALE',
      'E_CLEAN_SPRINT_COORDINATOR_ACTIVE',
      'E_CLEAN_PROCESS_ACTIVE',
      'E_CLEAN_BOT_ACTIVE',
    ]));
  });

  it('holds active RunFlow/jobs and autonomous-v2 mission execution authorities', () => {
    const root = fixtureRoot();
    writeJson(join(root, '.deckent', 'runtime', 'jobs', 'job-running.json'), {
      jobId: 'job-running',
      status: 'RUNNING',
      startedAt: '2026-07-27T00:00:00.000Z',
    });
    writeRunFlowEvents(root, 'flow-starting', [
      ...runFlowApprovalOpening('flow-starting'),
      {
        type: 'APPROVAL_GRANTED',
        revision: 1,
        planDigest: 'plan-digest',
        approvedBy: { id: 'operator' },
      },
      { type: 'START_REQUESTED', revision: 1, planDigest: 'plan-digest' },
    ]);
    const missionDb = openMissionDatabase(root);
    missionDb.prepare('INSERT INTO missions (id, status) VALUES (?, ?)')
      .run('mission-active', 'active');
    missionDb.prepare(`
      INSERT INTO work_items (
        id, mission_id, kind, status, claimed_at, claimed_by
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'mission-item-running',
      'mission-active',
      'process',
      'running',
      '2026-07-27T00:00:00.000Z',
      'mission-engine',
    );
    missionDb.prepare(`
      INSERT INTO mission_engine_lease (
        singleton_id, owner_id, epoch, lease_token_hash, acquired_at,
        renewed_at, expires_at, expires_at_ms
      ) VALUES (1, ?, 1, ?, ?, ?, ?, ?)
    `).run(
      'mission-engine',
      'a'.repeat(64),
      '2026-07-27T00:00:00.000Z',
      '2026-07-27T00:00:01.000Z',
      '2026-07-27T00:10:00.000Z',
      Date.parse('2026-07-27T00:10:00.000Z'),
    );
    missionDb.close();

    const report = inspectActiveExecutions(root, {
      processProbe: () => 'dead',
      nowMs: Date.parse('2026-07-27T00:05:00.000Z'),
    });

    expect(report.decision).toBe('HOLD');
    expect(reasonCodes(report)).toEqual(expect.arrayContaining([
      'E_CLEAN_RUN_JOB_STATE_UNKNOWN',
      'E_CLEAN_RUN_FLOW_ACTIVE',
      'E_CLEAN_MISSION_WORK_ACTIVE',
      'E_CLEAN_MISSION_ENGINE_ACTIVE',
    ]));
  });

  it('allows queued/approval RunFlow and mission work with no live execution lease', () => {
    const root = fixtureRoot();
    writeJson(join(root, '.deckent', 'runtime', 'jobs', 'job-queued.json'), {
      jobId: 'job-queued',
      status: 'PENDING',
      startedAt: '2026-07-27T00:00:00.000Z',
    });
    writeRunFlowEvents(root, 'flow-approved', [
      ...runFlowApprovalOpening('flow-approved'),
      {
        type: 'APPROVAL_GRANTED',
        revision: 1,
        planDigest: 'plan-digest',
        approvedBy: { id: 'operator' },
      },
    ]);
    const missionDb = openMissionDatabase(root);
    missionDb.prepare('INSERT INTO missions (id, status) VALUES (?, ?)')
      .run('mission-queued', 'active');
    missionDb.prepare(`
      INSERT INTO work_items (
        id, mission_id, kind, status, claimed_at, claimed_by
      ) VALUES (?, ?, ?, ?, NULL, NULL)
    `).run('mission-item-pending', 'mission-queued', 'process', 'pending');
    missionDb.prepare(`
      INSERT INTO work_items (
        id, mission_id, kind, status, claimed_at, claimed_by
      ) VALUES (?, ?, ?, ?, NULL, NULL)
    `).run('mission-item-parked', 'mission-queued', 'task', 'parked');
    missionDb.prepare(`
      INSERT INTO mission_engine_lease (
        singleton_id, owner_id, epoch, lease_token_hash, acquired_at,
        renewed_at, expires_at, expires_at_ms
      ) VALUES (1, ?, 1, ?, ?, ?, ?, ?)
    `).run(
      'mission-engine-expired',
      'b'.repeat(64),
      '2026-07-27T00:00:00.000Z',
      '2026-07-27T00:00:01.000Z',
      '2026-07-27T00:01:00.000Z',
      Date.parse('2026-07-27T00:01:00.000Z'),
    );
    missionDb.close();

    const report = inspectActiveExecutions(root, {
      processProbe: () => 'dead',
      nowMs: Date.parse('2026-07-27T00:05:00.000Z'),
    });

    expect(report.decision).toBe('ALLOW');
    expect(report.reasons).toEqual([]);
  });

  it('reconciles mixed historical jobs, dead RunFlow pids, and terminal mission claims without false HOLDs', () => {
    const root = fixtureRoot();
    writeJson(join(root, '.deckent', 'runtime', 'jobs', 'sprint-777.json'), {
      status: 'COMPLETE',
      sprintId: 'sprint-777',
      completedAt: '2026-07-27T00:01:00.000Z',
      completionRecord: {
        flowId: 'flow-terminal-job',
        verdictSummary: { done: 1, techDebt: 0, noGo: 0 },
        taskSummary: [],
      },
    });
    writeJson(join(root, '.deckent', 'runtime', 'jobs', 'sprint-1776429182356.json'), {
      jobId: 'sprint-1776429182356',
      status: 'COMPLETE',
      startedAt: '1776429182356',
      completedAt: '2026-04-17T14:24:53.734Z',
      sprintId: 'sprint-144',
    });
    writeJson(join(root, '.deckent', 'runtime', 'jobs', 'run-historical.json'), {
      jobId: 'run-historical',
      status: 'RUNNING',
      startedAt: '2026-07-26T00:00:00.000Z',
    });
    writeRunFlowHandle(root, 'flow-terminal-job');

    writeRunFlowEvents(root, 'flow-dead', [
      ...runFlowApprovalOpening('flow-dead'),
      {
        type: 'APPROVAL_GRANTED',
        revision: 1,
        planDigest: 'plan-digest',
        approvedBy: { id: 'operator' },
      },
      { type: 'START_REQUESTED', revision: 1, planDigest: 'plan-digest' },
      {
        type: 'RUN_STARTED',
        handle: {
          flowId: 'flow-dead',
          jobId: 'flow-flow-dead-r1',
          logRef: 'flow-flow-dead-r1.log',
        },
      },
    ]);
    writeRunFlowHandle(root, 'flow-dead', 999_999);

    const missionDb = openMissionDatabase(root);
    missionDb.prepare('INSERT INTO missions (id, status) VALUES (?, ?)')
      .run('mission-terminal', 'completed');
    missionDb.prepare(`
      INSERT INTO work_items (
        id, mission_id, kind, status, claimed_at, claimed_by
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'mission-item-done',
      'mission-terminal',
      'task',
      'done',
      '2026-07-27T00:00:00.000Z',
      'mission-engine',
    );
    missionDb.prepare(`
      INSERT INTO work_items (
        id, mission_id, kind, status, claimed_at, claimed_by
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'mission-item-failed',
      'mission-terminal',
      'process',
      'failed',
      '2026-07-27T00:00:00.000Z',
      'mission-engine',
    );
    missionDb.close();

    const report = inspectActiveExecutions(root, {
      processProbe: () => 'dead',
      nowMs: Date.parse('2026-07-27T00:05:00.000Z'),
    });

    expect(report.decision).toBe('ALLOW');
    expect(report.reasons).toEqual([]);
    expect(report.projections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'run-job',
        id: 'run-historical',
        effectiveStatus: 'STALE',
      }),
      expect.objectContaining({
        surface: 'run-flow',
        id: 'flow-dead',
        effectiveStatus: 'STALE_DEAD',
      }),
    ]));
  });

  it('holds a live RunFlow pid and an invalid event transition', () => {
    const liveRoot = fixtureRoot();
    writeRunFlowEvents(liveRoot, 'flow-live', [
      ...runFlowApprovalOpening('flow-live'),
      {
        type: 'APPROVAL_GRANTED',
        revision: 1,
        planDigest: 'plan-digest',
        approvedBy: { id: 'operator' },
      },
      { type: 'START_REQUESTED', revision: 1, planDigest: 'plan-digest' },
      {
        type: 'RUN_STARTED',
        handle: {
          flowId: 'flow-live',
          jobId: 'flow-flow-live-r1',
          logRef: 'flow-flow-live-r1.log',
        },
      },
    ]);
    writeRunFlowHandle(liveRoot, 'flow-live', 42);

    const invalidRoot = fixtureRoot();
    writeRunFlowEvents(invalidRoot, 'flow-invalid', [
      runFlowApprovalOpening('flow-invalid')[0]!,
      {
        type: 'RUN_STARTED',
        handle: {
          flowId: 'flow-invalid',
          jobId: 'flow-flow-invalid-r1',
          logRef: 'flow-flow-invalid-r1.log',
        },
      },
    ]);

    const liveReport = inspectActiveExecutions(liveRoot, {
      processProbe: () => 'alive',
    });
    const invalidReport = inspectActiveExecutions(invalidRoot);

    expect(reasonCodes(liveReport)).toContain('E_CLEAN_RUN_FLOW_ACTIVE');
    expect(reasonCodes(invalidReport)).toContain('E_CLEAN_RUN_FLOW_STATE_INVALID');
    expect(invalidReport.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ detailCode: 'INVALID_EVENT_TRANSITION' }),
    ]));
  });

  it('does not false-HOLD draft/terminal tasks, dead pid files, or queued backlog entries', () => {
    const root = fixtureRoot();
    writeTask(root, 'draft-task', 'DRAFT');
    writeTask(root, 'done-task', 'DONE');
    writeJson(join(root, '.tasks', 'task-done-task.hb'), {
      workerId: 'worker-done',
      taskId: 'done-task',
      status: 'DONE',
      pid: 999_999,
      timestamp: '2026-07-27T00:00:00.000Z',
    });
    writeJson(join(root, '.deckent', 'sprint-state.json'), {
      sprintId: 'sprint-terminal',
      status: 'ABORTED',
      phase: 'EXECUTE',
    });
    writeJson(join(root, '.deckent', 'autonomous', 'backlog.json'), {
      _version: '1.0',
      entries: [
        { id: 'queued', kind: 'process', status: 'pending' },
        { id: 'parked', kind: 'task', status: 'parked' },
        { id: 'done', kind: 'sprint', status: 'done' },
        { id: 'failed', kind: 'capability', status: 'failed' },
      ],
    });
    writeFileSync(join(root, '.deckent', 'bot.pid'), '999999', 'utf-8');

    const report = inspectActiveExecutions(root, { processProbe: () => 'dead' });

    expect(report.decision).toBe('ALLOW');
    expect(report.reasons).toEqual([]);
  });

  it('classifies dead MCP launch anchors and unbound sprint markers as stale HOLDs', () => {
    const root = fixtureRoot();
    writeJson(join(root, '.deckent', 'sprint-active.json'), {
      sprintId: 'sprint-unbound',
    });
    writeJson(join(root, '.deckent', 'state', 'active-sprint.json'), {
      jobId: 'sprint-dead-child',
      source: 'mcp',
      childPid: 999_999,
      ipcDir: join(root, '.deckent', 'sprint-dead-child-ipc'),
      startedAt: '2026-07-27T00:00:00.000Z',
    });

    const report = inspectActiveExecutions(root, { processProbe: () => 'dead' });

    expect(report.decision).toBe('HOLD');
    expect(reasonCodes(report)).toEqual(expect.arrayContaining([
      'E_CLEAN_SPRINT_ANCHOR_STALE',
      'E_CLEAN_SPRINT_MARKER_STALE',
    ]));
  });

  it('holds maintenance across the real direct clean mutation and releases only its exact generation', async () => {
    const root = fixtureRoot();
    const scriptPath = join(root, 'scripts', 'clean.mjs');
    const removedPath = join(root, 'dist', 'cli', 'entry.js');
    const preservedPath = join(root, 'dist', 'dashboard', 'index.html');
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'dist', 'cli'), { recursive: true });
    mkdirSync(join(root, 'dist', 'dashboard'), { recursive: true });
    copyFileSync(join(REPO_ROOT, 'scripts', 'clean.mjs'), scriptPath);
    writeFileSync(removedPath, 'remove-me', 'utf8');
    writeFileSync(preservedPath, 'preserve-me', 'utf8');

    const result = await runNode(scriptPath, root);
    const envelope = JSON.parse(result.output.trim()) as {
      decision: string;
      code: string;
      removed: number;
    };

    if (process.platform !== 'linux') {
      expect(result.code).toBe(1);
      expect(envelope).toEqual(expect.objectContaining({
        decision: 'HOLD',
        code: 'E_CLEAN_IDENTITY_STABLE_DELETE_UNSUPPORTED',
      }));
      expect(readFileSync(removedPath, 'utf8')).toBe('remove-me');
      expect(readFileSync(preservedPath, 'utf8')).toBe('preserve-me');
      return;
    }
    expect(result.code).toBe(0);
    expect(envelope).toEqual(expect.objectContaining({
      decision: 'ALLOW',
      code: 'CLEAN_COMPLETED',
      removed: 1,
    }));
    expect(existsSync(removedPath)).toBe(false);
    expect(readFileSync(preservedPath, 'utf8')).toBe('preserve-me');
    expect(inspectActiveExecutions(root).decision).toBe('ALLOW');
    const db = new Database(
      join(root, '.locks', 'execution-lock-authority.sqlite3'),
      { readonly: true },
    );
    expect(db.prepare('SELECT COUNT(*) AS count FROM execution_lock_active').get())
      .toEqual({ count: 0 });
    db.close();
  });

  it.skipIf(process.platform !== 'linux')(
    'unlinks top-level and nested symlinks without traversing their targets',
    async () => {
      const root = fixtureRoot();
      const externalRoot = fixtureRoot();
      const scriptPath = join(root, 'scripts', 'clean.mjs');
      const nestedLink = join(root, 'dist', 'cli', 'nested-external');
      const topLevelLink = join(root, 'dist', 'top-level-external');
      const externalSentinel = join(externalRoot, 'sentinel.txt');
      const preservedPath = join(
        root,
        'dist',
        'dashboard',
        'index.html',
      );
      mkdirSync(join(root, 'scripts'), { recursive: true });
      mkdirSync(join(nestedLink, '..'), { recursive: true });
      mkdirSync(join(preservedPath, '..'), { recursive: true });
      writeFileSync(externalSentinel, 'external-must-survive', 'utf8');
      writeFileSync(preservedPath, 'dashboard-must-survive', 'utf8');
      symlinkSync(externalRoot, nestedLink, 'dir');
      symlinkSync(externalRoot, topLevelLink, 'dir');
      copyFileSync(join(REPO_ROOT, 'scripts', 'clean.mjs'), scriptPath);

      const result = await runNode(scriptPath, root);
      const envelope = JSON.parse(result.output.trim()) as {
        decision: string;
        code: string;
        removed: number;
      };

      expect(result.code).toBe(0);
      expect(envelope).toEqual(expect.objectContaining({
        decision: 'ALLOW',
        code: 'CLEAN_COMPLETED',
        removed: 2,
      }));
      expect(readFileSync(externalSentinel, 'utf8'))
        .toBe('external-must-survive');
      expect(existsSync(nestedLink)).toBe(false);
      expect(existsSync(topLevelLink)).toBe(false);
      expect(readFileSync(preservedPath, 'utf8'))
        .toBe('dashboard-must-survive');
    },
  );

  it.skipIf(process.platform !== 'linux')(
    'retains the exact maintenance generation after a partial clean mutation fails',
    async () => {
    const root = fixtureRoot();
    const scriptPath = join(root, 'scripts', 'clean.mjs');
    const runnerPath = join(root, 'partial-clean-runner.mjs');
    const resultPath = join(root, '.partial-clean-result.json');
    const removedPath = join(root, 'dist', 'a-removed', 'entry.js');
    const retainedPath = join(root, 'dist', 'b-retained', 'entry.js');
    const preservedPath = join(root, 'dist', 'dashboard', 'index.html');
    mkdirSync(join(root, 'scripts'), { recursive: true });
    for (const path of [removedPath, retainedPath, preservedPath]) {
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, path, 'utf8');
    }
    copyFileSync(join(REPO_ROOT, 'scripts', 'clean.mjs'), scriptPath);
    writeFileSync(runnerPath, `
      import { rmSync, writeFileSync } from 'node:fs';
      import { cleanDist } from './scripts/clean.mjs';
      let calls = 0;
      try {
        cleanDist({
          removeEntry(path, options) {
            calls += 1;
            if (calls === 2) {
              const error = new Error('injected-partial-clean-failure');
              error.code = 'E_TEST_REMOVE_ENTRY';
              throw error;
            }
            rmSync(path, options);
          }
        });
        writeFileSync(
          ${JSON.stringify(resultPath)},
          JSON.stringify({ code: 'unexpected-success', calls }),
          'utf8'
        );
        process.exitCode = 9;
      } catch (error) {
        writeFileSync(
          ${JSON.stringify(resultPath)},
          JSON.stringify({
            code: error?.code ?? 'unknown',
            report: error?.report,
            calls
          }),
          'utf8'
        );
        process.exitCode = 1;
      }
    `, 'utf8');

    const result = await runNode(runnerPath, root);
    if (!existsSync(resultPath)) {
      throw new Error(
        `partial clean runner emitted no result: ${JSON.stringify(result)}`,
      );
    }
    const envelope = JSON.parse(readFileSync(resultPath, 'utf8')) as {
      code: string;
      calls: number;
      report: {
        reasons: { code: string; detailCode?: string }[];
      };
    };

    expect(result.code).toBe(1);
    expect(envelope).toEqual(expect.objectContaining({
      code: 'E_CLEAN_MUTATION_AUTHORITY_RETAINED',
      calls: 2,
    }));
    expect(envelope.report.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'E_CLEAN_MAINTENANCE_AUTHORITY_HOLD',
        detailCode: 'E_CLEAN_MUTATION_AUTHORITY_RETAINED',
      }),
    ]));
    expect(existsSync(removedPath)).toBe(false);
    expect(readFileSync(retainedPath, 'utf8')).toBe(retainedPath);
    expect(readFileSync(preservedPath, 'utf8')).toBe(preservedPath);

    const { active, payload, projection } =
      readRetainedMaintenanceGeneration(root);

    expect(active.task_id).toBe('__deckent_project_maintenance__');
    expect(projection).toEqual(payload);
    expect(active).toEqual(expect.objectContaining({
      owner_id: payload.ownerId,
      fencing_epoch: payload.fencingToken.epoch,
      fencing_counter: payload.fencingToken.counter,
      fencing_nonce: payload.fencingToken.nonce,
    }));
    expect(checkExecutionLock(root, payload.taskId)).toEqual(
      expect.objectContaining({
        state: 'quarantined',
        quarantine: expect.objectContaining({
          state: 'quarantined',
          reason: 'partial-mutation',
          lock: payload,
        }),
      }),
    );
    expect(() => acquireExecutionLock(
      root,
      'blocked-after-partial-clean',
      'dispatch',
    )).toThrowError(expect.objectContaining({
      reason: 'quarantined',
    }));
    expect(() => releaseCleanMaintenanceLock(root, payload))
      .toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED/u);
    },
  );

  it.skipIf(process.platform !== 'linux')(
    'retains authority when a pre-mutation callback mutates and throws',
    async () => {
      const root = fixtureRoot();
      const scriptPath = join(root, 'scripts', 'clean.mjs');
      const runnerPath = join(root, 'callback-failure-clean-runner.mjs');
      const resultPath = join(root, '.callback-failure-result.json');
      const removedPath = join(root, 'dist', 'a-removed', 'entry.js');
      const retainedPath = join(root, 'dist', 'b-retained', 'entry.js');
      const preservedPath = join(
        root,
        'dist',
        'dashboard',
        'index.html',
      );
      mkdirSync(join(root, 'scripts'), { recursive: true });
      for (const path of [removedPath, retainedPath, preservedPath]) {
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, path, 'utf8');
      }
      copyFileSync(join(REPO_ROOT, 'scripts', 'clean.mjs'), scriptPath);
      writeFileSync(runnerPath, `
        import { rmSync, writeFileSync } from 'node:fs';
        import { cleanDist } from './scripts/clean.mjs';
        try {
          cleanDist({
            beforeMutation() {
              rmSync(
                ${JSON.stringify(join(root, 'dist', 'a-removed'))},
                { recursive: true, force: true }
              );
              const error = new Error('callback-mutated-then-failed');
              error.code = 'E_TEST_BEFORE_MUTATION';
              throw error;
            }
          });
          process.exitCode = 9;
        } catch (error) {
          writeFileSync(
            ${JSON.stringify(resultPath)},
            JSON.stringify({
              code: error?.code ?? 'unknown',
              report: error?.report
            }),
            'utf8'
          );
          process.exitCode = 1;
        }
      `, 'utf8');

      const result = await runNode(runnerPath, root);
      if (!existsSync(resultPath)) {
        throw new Error(
          `callback failure runner emitted no result: ${JSON.stringify(result)}`,
        );
      }
      const envelope = JSON.parse(readFileSync(resultPath, 'utf8')) as {
        code: string;
        report: {
          reasons: { code: string; detailCode?: string }[];
        };
      };

      expect(result.code).toBe(1);
      expect(envelope.code).toBe('E_CLEAN_MUTATION_AUTHORITY_RETAINED');
      expect(envelope.report.reasons).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'E_CLEAN_MUTATION_FAILED',
          detailCode: 'E_TEST_BEFORE_MUTATION',
        }),
      ]));
      expect(existsSync(removedPath)).toBe(false);
      expect(readFileSync(retainedPath, 'utf8')).toBe(retainedPath);
      const { active, payload, projection } =
        readRetainedMaintenanceGeneration(root);
      expect(projection).toEqual(payload);
      expect(() => acquireExecutionLock(
        root,
        'blocked-after-callback-failure',
        'dispatch',
      )).toThrowError(expect.objectContaining({
        reason: 'quarantined',
      }));
      expect(() => releaseCleanMaintenanceLock(root, payload))
        .toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED/u);
    },
  );

  it.skipIf(process.platform !== 'linux')(
    'surfaces an uncertain pinned-directory handle close as a typed hold',
    async () => {
      const root = fixtureRoot();
      const scriptPath = join(root, 'scripts', 'clean.mjs');
      const runnerPath = join(root, 'close-failure-clean-runner.mjs');
      const resultPath = join(root, '.close-failure-result.json');
      const retainedPath = join(root, 'dist', 'cli', 'entry.js');
      const preservedPath = join(
        root,
        'dist',
        'dashboard',
        'index.html',
      );
      mkdirSync(join(root, 'scripts'), { recursive: true });
      for (const path of [retainedPath, preservedPath]) {
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, path, 'utf8');
      }
      copyFileSync(join(REPO_ROOT, 'scripts', 'clean.mjs'), scriptPath);
      writeFileSync(runnerPath, `
        import { closeSync, writeFileSync } from 'node:fs';
        import { cleanDist } from './scripts/clean.mjs';
        try {
          cleanDist({
            beforeRemoveEntry(path) {
              const parts = path.split('/');
              const fdIndex = parts.indexOf('fd');
              const fd = Number(parts[fdIndex + 1]);
              if (fdIndex < 0 || !Number.isSafeInteger(fd)) {
                throw new Error('fd-path-not-found');
              }
              closeSync(fd);
            }
          });
          process.exitCode = 9;
        } catch (error) {
          writeFileSync(
            ${JSON.stringify(resultPath)},
            JSON.stringify({
              code: error?.code ?? 'unknown',
              report: error?.report
            }),
            'utf8'
          );
          process.exitCode = 1;
        }
      `, 'utf8');

      const result = await runNode(runnerPath, root);
      if (!existsSync(resultPath)) {
        throw new Error(
          `close failure runner emitted no result: ${JSON.stringify(result)}`,
        );
      }
      const envelope = JSON.parse(readFileSync(resultPath, 'utf8')) as {
        code: string;
        report: {
          reasons: { code: string; detailCode?: string }[];
        };
      };

      expect(result.code).toBe(1);
      expect(envelope.code).toBe('E_CLEAN_MUTATION_AUTHORITY_RETAINED');
      expect(envelope.report.reasons).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'E_CLEAN_MUTATION_FAILED',
          detailCode: 'E_CLEAN_DIRECTORY_HANDLE_CLOSE_UNCERTAIN',
        }),
      ]));
      expect(readFileSync(retainedPath, 'utf8')).toBe(retainedPath);
      const { payload } = readRetainedMaintenanceGeneration(root);
      expect(() => acquireExecutionLock(
        root,
        'blocked-after-close-failure',
        'dispatch',
      )).toThrowError(expect.objectContaining({
        reason: 'quarantined',
      }));
      expect(() => releaseCleanMaintenanceLock(root, payload))
        .toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED/u);
    },
  );

  it.skipIf(process.platform !== 'linux')(
    'keeps deletion rooted at the pinned dist identity across a parent symlink swap',
    async () => {
      const root = fixtureRoot();
      const externalRoot = fixtureRoot();
      const scriptPath = join(root, 'scripts', 'clean.mjs');
      const runnerPath = join(root, 'parent-swap-clean-runner.mjs');
      const resultPath = join(root, '.parent-swap-clean-result.json');
      const originalDist = join(root, 'dist-original');
      const externalSentinels = [
        join(externalRoot, 'a-removed', 'external-sentinel.txt'),
        join(externalRoot, 'b-removed', 'external-sentinel.txt'),
      ];
      const originalEntries = [
        join(root, 'dist', 'a-removed', 'entry.js'),
        join(root, 'dist', 'b-removed', 'entry.js'),
      ];
      const preservedPath = join(
        root,
        'dist',
        'dashboard',
        'index.html',
      );
      mkdirSync(join(root, 'scripts'), { recursive: true });
      for (const path of [
        ...externalSentinels,
        ...originalEntries,
        preservedPath,
      ]) {
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, `sentinel:${path}`, 'utf8');
      }
      copyFileSync(join(REPO_ROOT, 'scripts', 'clean.mjs'), scriptPath);
      writeFileSync(runnerPath, `
        import {
          renameSync,
          symlinkSync,
          writeFileSync
        } from 'node:fs';
        import { cleanDist } from './scripts/clean.mjs';
        let calls = 0;
        try {
          cleanDist({
            beforeRemoveEntry() {
              calls += 1;
              if (calls === 1) {
                renameSync(
                  ${JSON.stringify(join(root, 'dist'))},
                  ${JSON.stringify(originalDist)}
                );
                symlinkSync(
                  ${JSON.stringify(externalRoot)},
                  ${JSON.stringify(join(root, 'dist'))},
                  'dir'
                );
              }
            }
          });
          writeFileSync(
            ${JSON.stringify(resultPath)},
            JSON.stringify({ code: 'unexpected-success', calls }),
            'utf8'
          );
          process.exitCode = 9;
        } catch (error) {
          writeFileSync(
            ${JSON.stringify(resultPath)},
            JSON.stringify({
              code: error?.code ?? 'unknown',
              report: error?.report,
              calls
            }),
            'utf8'
          );
          process.exitCode = 1;
        }
      `, 'utf8');

      const result = await runNode(runnerPath, root);
      if (!existsSync(resultPath)) {
        throw new Error(
          `parent swap runner emitted no result: ${JSON.stringify(result)}`,
        );
      }
      const envelope = JSON.parse(readFileSync(resultPath, 'utf8')) as {
        code: string;
        calls: number;
        report: {
          reasons: { code: string; detailCode?: string }[];
        };
      };

      expect(result.code).toBe(1);
      expect(envelope).toEqual(expect.objectContaining({
        code: 'E_CLEAN_MUTATION_AUTHORITY_RETAINED',
        calls: 2,
      }));
      expect(envelope.report.reasons).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'E_CLEAN_MUTATION_FAILED',
          detailCode: 'E_CLEAN_DIST_IDENTITY_CHANGED',
        }),
      ]));
      for (const sentinel of externalSentinels) {
        expect(readFileSync(sentinel, 'utf8')).toBe(`sentinel:${sentinel}`);
      }
      for (const entry of originalEntries) {
        expect(existsSync(join(
          originalDist,
          entry.slice(join(root, 'dist').length + 1),
        ))).toBe(false);
      }
      expect(readFileSync(
        join(originalDist, 'dashboard', 'index.html'),
        'utf8',
      )).toBe(`sentinel:${preservedPath}`);
      expect(realpathSync(join(root, 'dist'))).toBe(
        realpathSync(externalRoot),
      );

      const { active, payload, projection } =
        readRetainedMaintenanceGeneration(root);
      expect(projection).toEqual(payload);
      expect(active).toEqual(expect.objectContaining({
        owner_id: payload.ownerId,
        fencing_epoch: payload.fencingToken.epoch,
        fencing_counter: payload.fencingToken.counter,
        fencing_nonce: payload.fencingToken.nonce,
      }));
      expect(() => acquireExecutionLock(
        root,
        'blocked-after-parent-swap',
        'dispatch',
      )).toThrowError(expect.objectContaining({
        reason: 'quarantined',
      }));
      expect(() => releaseCleanMaintenanceLock(root, payload))
        .toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED/u);
    },
  );

  it.skipIf(process.platform !== 'linux')(
    'keeps authority on the module-owned project identity across a root replacement',
    async () => {
      const root = fixtureRoot();
      const movedRoot = `${root}-moved`;
      temporaryRoots.push(movedRoot);
      const scriptPath = join(root, 'scripts', 'clean.mjs');
      const runnerPath = join(root, 'root-swap-clean-runner.mjs');
      const resultPath = join(root, '.root-swap-clean-result.json');
      const oldEntries = [
        join(root, 'dist', 'a-removed', 'entry.js'),
        join(root, 'dist', 'b-removed', 'entry.js'),
      ];
      const oldPreserved = join(
        root,
        'dist',
        'dashboard',
        'index.html',
      );
      const replacementSentinel = join(
        root,
        'dist',
        'a-removed',
        'replacement-sentinel.txt',
      );
      mkdirSync(join(root, 'scripts'), { recursive: true });
      for (const path of [...oldEntries, oldPreserved]) {
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, `old:${path}`, 'utf8');
      }
      copyFileSync(join(REPO_ROOT, 'scripts', 'clean.mjs'), scriptPath);
      writeFileSync(runnerPath, `
        import {
          mkdirSync,
          renameSync,
          writeFileSync
        } from 'node:fs';
        import { cleanDist } from './scripts/clean.mjs';
        let calls = 0;
        try {
          cleanDist({
            beforeRemoveEntry() {
              calls += 1;
              if (calls !== 1) return;
              renameSync(
                ${JSON.stringify(root)},
                ${JSON.stringify(movedRoot)}
              );
              mkdirSync(
                ${JSON.stringify(join(root, 'dist', 'a-removed'))},
                { recursive: true }
              );
              writeFileSync(
                ${JSON.stringify(replacementSentinel)},
                'replacement-must-survive',
                'utf8'
              );
            }
          });
          process.exitCode = 9;
        } catch (error) {
          writeFileSync(
            ${JSON.stringify(resultPath)},
            JSON.stringify({
              code: error?.code ?? 'unknown',
              report: error?.report,
              calls
            }),
            'utf8'
          );
          process.exitCode = 1;
        }
      `, 'utf8');

      const result = await runNode(runnerPath, root);
      const envelope = JSON.parse(readFileSync(resultPath, 'utf8')) as {
        code: string;
        calls: number;
        report: {
          reasons: { code: string; detailCode?: string }[];
        };
      };

      expect(result.code).toBe(1);
      expect(envelope).toEqual(expect.objectContaining({
        code: 'E_CLEAN_MUTATION_AUTHORITY_RETAINED',
        calls: 2,
      }));
      expect(envelope.report.reasons).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'E_CLEAN_MUTATION_FAILED',
          detailCode: 'E_CLEAN_PROJECT_ROOT_IDENTITY_CHANGED',
        }),
      ]));
      expect(readFileSync(replacementSentinel, 'utf8'))
        .toBe('replacement-must-survive');
      for (const entry of oldEntries) {
        expect(existsSync(join(
          movedRoot,
          entry.slice(root.length + 1),
        ))).toBe(false);
      }
      expect(readFileSync(
        join(movedRoot, 'dist', 'dashboard', 'index.html'),
        'utf8',
      )).toBe(`old:${oldPreserved}`);

      const { payload, projection } =
        readRetainedMaintenanceGeneration(movedRoot);
      expect(projection).toEqual(payload);
      expect(() => acquireExecutionLock(
        movedRoot,
        'blocked-after-root-swap',
        'dispatch',
      )).toThrowError(expect.objectContaining({
        reason: 'quarantined',
      }));
      expect(() => releaseCleanMaintenanceLock(movedRoot, payload))
        .toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED/u);
    },
  );

  it.skipIf(process.platform !== 'linux')(
    'rechecks legacy execution evidence at the final pre-mutation boundary',
    async () => {
      const root = fixtureRoot();
      const scriptPath = join(root, 'scripts', 'clean.mjs');
      const runnerPath = join(root, 'late-writer-clean-runner.mjs');
      const resultPath = join(root, '.late-writer-clean-result.json');
      const distSentinel = join(root, 'dist', 'cli', 'entry.js');
      mkdirSync(join(root, 'scripts'), { recursive: true });
      mkdirSync(join(distSentinel, '..'), { recursive: true });
      writeFileSync(distSentinel, 'must-survive', 'utf8');
      copyFileSync(join(REPO_ROOT, 'scripts', 'clean.mjs'), scriptPath);
      writeFileSync(runnerPath, `
        import { mkdirSync, writeFileSync } from 'node:fs';
        import { cleanDist } from './scripts/clean.mjs';
        let boundaryEntered = false;
        try {
          cleanDist({
            beforeMutation() {
              boundaryEntered = true;
              mkdirSync(
                ${JSON.stringify(join(root, '.tasks'))},
                { recursive: true }
              );
              writeFileSync(
                ${JSON.stringify(join(
                  root,
                  '.tasks',
                  'task-late-writer.json',
                ))},
                JSON.stringify({
                  id: 'late-writer',
                  status: 'PENDING',
                  createdAt: '2026-07-27T00:00:00.000Z'
                }),
                'utf8'
              );
            }
          });
          writeFileSync(
            ${JSON.stringify(resultPath)},
            JSON.stringify({ code: 'unexpected-success', boundaryEntered }),
            'utf8'
          );
          process.exitCode = 9;
        } catch (error) {
          writeFileSync(
            ${JSON.stringify(resultPath)},
            JSON.stringify({
              code: error?.code ?? 'unknown',
              report: error?.report,
              boundaryEntered
            }),
            'utf8'
          );
          process.exitCode = 1;
        }
      `, 'utf8');

      const result = await runNode(runnerPath, root);
      if (!existsSync(resultPath)) {
        throw new Error(
          `late writer runner emitted no result: ${JSON.stringify(result)}`,
        );
      }
      const envelope = JSON.parse(readFileSync(resultPath, 'utf8')) as {
        code: string;
        boundaryEntered: boolean;
        report: {
          reasons: { code: string; subject: string }[];
        };
      };

      expect(result.code).toBe(1);
      expect(envelope).toEqual(expect.objectContaining({
        code: 'E_CLEAN_MUTATION_AUTHORITY_RETAINED',
        boundaryEntered: true,
      }));
      expect(envelope.report.reasons).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'E_CLEAN_TASK_RECEIPT_MISSING',
          subject: 'late-writer',
        }),
      ]));
      expect(readFileSync(distSentinel, 'utf8')).toBe('must-survive');
      const { payload, projection } =
        readRetainedMaintenanceGeneration(root);
      expect(projection).toEqual(payload);
      expect(() => acquireExecutionLock(
        root,
        'blocked-after-late-writer',
        'dispatch',
      )).toThrowError(expect.objectContaining({
        reason: 'quarantined',
      }));
      expect(() => releaseCleanMaintenanceLock(root, payload))
        .toThrowError(/E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED/u);
    },
  );

  it('refuses before deleting dist and emits a stable JSON reason envelope', async () => {
    const root = fixtureRoot();
    const scriptPath = join(root, 'scripts', 'clean.mjs');
    const sentinel = join(root, 'dist', 'cli', 'entry.js');
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'dist', 'cli'), { recursive: true });
    copyFileSync(join(REPO_ROOT, 'scripts', 'clean.mjs'), scriptPath);
    writeFileSync(sentinel, 'must-survive', 'utf-8');
    writeTask(root, 'pending-direct-clean', 'PENDING');

    const result = await runNode(scriptPath, root);
    const envelope = JSON.parse(result.output.trim()) as {
      schemaVersion: number;
      decision: string;
      code: string;
      reasons: { code: string }[];
    };

    expect(result.code).toBe(1);
    if (process.platform !== 'linux') {
      expect(envelope).toEqual(expect.objectContaining({
        schemaVersion: 1,
        decision: 'HOLD',
        code: 'E_CLEAN_IDENTITY_STABLE_DELETE_UNSUPPORTED',
      }));
      expect(readFileSync(sentinel, 'utf-8')).toBe('must-survive');
      return;
    }
    expect(envelope).toEqual(expect.objectContaining({
      schemaVersion: 1,
      decision: 'HOLD',
      code: 'E_CLEAN_ACTIVE_EXECUTION_HOLD',
    }));
    expect(envelope.reasons.map(reason => reason.code))
      .toContain('E_CLEAN_TASK_RECEIPT_MISSING');
    expect(existsSync(sentinel)).toBe(true);
    expect(readFileSync(sentinel, 'utf-8')).toBe('must-survive');
  });
});
