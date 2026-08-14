import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ExecutionTerminationLedger,
  ExecutionTerminationLedgerError,
  createDockerExecutionTerminationBindingInput,
  createNonReservableDockerExecutionTerminationBindingInput,
  type NonReservableExecutionTerminationBindingInput,
} from '../../src/core/execution-termination-ledger.js';
import {
  deriveProviderQuotaScopeRefHash,
  type ProviderLimitReservation,
} from '../../src/core/provider-limit-truth.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRefForAttempt,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementPreparedAtomic,
  type TaskResultSettlementRefV1,
} from '../../src/core/task-result-settlement.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;
const INTEGRITY_KEY = 'execution-termination-ledger-nr-test-key-000001';
const T0 = '2026-07-24T08:00:00.000Z';
const T1 = '2026-07-24T08:01:00.000Z';
const T4 = '2026-07-24T08:04:00.000Z';
const T10 = '2026-07-24T08:10:00.000Z';

interface Fixture {
  readonly base: string;
  readonly projectRoot: string;
  readonly stateRoot: string;
  readonly dbPath: string;
}

function fixture(): Fixture {
  const base = mkdtempSync(join(tmpdir(), 'deckent-termination-nr-'));
  roots.push(base);
  const projectRoot = join(base, 'project');
  const stateRoot = join(base, 'host-state');
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(stateRoot, { recursive: true });
  process.env.DECKENT_HOME = stateRoot;
  return { base, projectRoot, stateRoot, dbPath: join(stateRoot, 'terminations.db') };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
});

function reservation(
  overrides: Partial<ProviderLimitReservation> = {},
): ProviderLimitReservation {
  const base = {
    tenantId: 'tenant-alpha',
    projectId: 'project-alpha',
    reservationId: 'reservation-alpha',
    idempotencyKey: 'reservation-key-alpha',
    runId: 'run-alpha',
    taskId: 'task-alpha',
    callId: 'call-alpha',
    attemptId: '11111111-1111-4111-8111-111111111111',
    fenceTokenHash: 'd'.repeat(64),
    receiptRef: 'invocation-receipt:alpha0001',
    reachabilityEvidenceRef: 'provider-reachability:alpha0001',
    provider: 'anthropic',
    model: 'claude-fable-5',
    accountRefHash: 'a'.repeat(64),
    authMode: 'subscription',
    backend: {
      transport: 'cli',
      executionBackend: 'docker',
      endpointRefHash: 'c'.repeat(64),
    },
    estimates: [{ windowId: 'session-token-window', unit: 'tokens', amount: 10_000 }],
    estimateEvidenceRefs: ['budget-estimate:alpha0001'],
    leaseExpiresAt: T10,
    requestedAt: T0,
    snapshotEvidenceRef: 'provider-limit:snapshot-alpha',
    decision: 'allow',
    reasonCode: 'allowed',
    effectiveRemaining: { 'session-token-window': 100_000 },
    appliedPolicy: {
      policyRef: 'provider-limit-policy:alpha0001',
      warnAtRatio: 0.7,
      blockAtRatio: 0.85,
      minimumRemaining: { tokens: 1_000 },
    },
  } satisfies Omit<ProviderLimitReservation, 'quotaScopeRefHash'>;
  return {
    ...base,
    quotaScopeRefHash: deriveProviderQuotaScopeRefHash({
      tenantId: base.tenantId,
      provider: base.provider,
      accountRefHash: base.accountRefHash,
      authMode: base.authMode,
      backend: base.backend,
    }),
    ...overrides,
  };
}

function preparedSettlement(
  f: Fixture,
  admitted: ProviderLimitReservation,
): TaskResultSettlementRefV1 {
  const ref = createTaskResultSettlementRefForAttempt(
    f.projectRoot,
    admitted.taskId!,
    admitted.attemptId,
  );
  writeTaskResultSettlementAttemptAtomic(ref, T0);
  claimTaskResultSettlementAttemptAtomic(ref, T0);
  writeTaskResultSettlementPreparedAtomic(ref, admitted.model, T1);
  return ref;
}

function ledger(f: Fixture, now = T4): ExecutionTerminationLedger {
  return new ExecutionTerminationLedger(f.stateRoot, {
    dbPath: f.dbPath,
    now: () => new Date(now),
    integrityKey: INTEGRITY_KEY,
  });
}

function nonReservableIdentity(
  admitted: ProviderLimitReservation,
): NonReservableExecutionTerminationBindingInput['identity'] {
  return {
    tenantId: admitted.tenantId,
    projectId: admitted.projectId,
    runId: admitted.runId,
    taskId: admitted.taskId!,
    callId: admitted.callId,
    attemptId: admitted.attemptId,
    invocationReceiptRef: admitted.receiptRef,
    fenceTokenHash: admitted.fenceTokenHash,
    provider: 'codex',
    model: 'gpt-5.6-sol',
    accountRefHash: admitted.accountRefHash,
    quotaScopeRefHash: admitted.quotaScopeRefHash,
    authMode: 'subscription',
    transport: 'cli',
    endpointRefHash: admitted.backend.endpointRefHash,
  };
}

function bindNonReservable(
  store: ExecutionTerminationLedger,
  admitted: ProviderLimitReservation,
  ref: TaskResultSettlementRefV1,
  bindingId = 'binding-nr-alpha',
) {
  return store.putNonReservableBinding(
    createNonReservableDockerExecutionTerminationBindingInput({
      bindingId,
      identity: nonReservableIdentity(admitted),
      model: 'gpt-5.6-sol',
      settlementRef: ref,
      createdAt: T1,
    }),
  );
}

describe('execution termination ledger — non-reservable subscription arm', () => {
  it('binds a non-reservable dispatch with NO reservation identity and reads it back', () => {
    const f = fixture();
    const admitted = reservation({ model: 'gpt-5.6-sol' });
    const ref = preparedSettlement(f, admitted);
    const store = ledger(f);
    const write = bindNonReservable(store, admitted, ref);
    expect(write.created).toBe(true);
    expect(write.value.admissionMode).toBe('non_reservable_subscription');
    expect(write.value.schemaVersion).toBe(2);
    expect('providerLimitReservationId' in write.value).toBe(false);
    expect(write.value.provider).toBe('codex');
    expect(write.value.model).toBe('gpt-5.6-sol');

    const read = store.getBinding('binding-nr-alpha');
    expect(read?.admissionMode).toBe('non_reservable_subscription');
    expect(read?.bindingId).toBe('binding-nr-alpha');

    const raw = new Database(f.dbPath, { readonly: true });
    const row = raw.prepare(
      'SELECT admission_mode, reservation_id FROM execution_termination_bindings WHERE binding_id = ?',
    ).get('binding-nr-alpha') as { admission_mode: string; reservation_id: string | null };
    raw.close();
    expect(row.admission_mode).toBe('non_reservable_subscription');
    expect(row.reservation_id).toBeNull();
    store.close();
  });

  it('is idempotent — the same non-reservable binding input returns created:false', () => {
    const f = fixture();
    const admitted = reservation({ model: 'gpt-5.6-sol' });
    const ref = preparedSettlement(f, admitted);
    const store = ledger(f);
    const first = bindNonReservable(store, admitted, ref);
    const second = bindNonReservable(store, admitted, ref);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.value.bindingId).toBe(first.value.bindingId);
    store.close();
  });

  it('reserved and non-reservable arms coexist with distinct evidence refs', () => {
    const f = fixture();
    const reservedAdmitted = reservation();
    const reservedRef = preparedSettlement(f, reservedAdmitted);
    const store = ledger(f);
    const reserved = store.putBinding(createDockerExecutionTerminationBindingInput({
      bindingId: 'binding-reserved',
      reservation: reservedAdmitted,
      reservationEvidenceRef: `provider-limit-reservation:${reservedAdmitted.reservationId}`,
      settlementRef: reservedRef,
      createdAt: T1,
    }));
    expect(reserved.value.admissionMode).toBe('reserved');
    expect(reserved.value.schemaVersion).toBe(1);

    const nrAdmitted = reservation({
      taskId: 'task-beta',
      attemptId: '22222222-2222-4222-8222-222222222222',
      model: 'gpt-5.6-sol',
    });
    const nrRef = preparedSettlement(f, nrAdmitted);
    const nr = bindNonReservable(store, nrAdmitted, nrRef, 'binding-nr-beta');
    expect(nr.value.admissionMode).toBe('non_reservable_subscription');
    expect(nr.evidenceRef).not.toBe(reserved.evidenceRef);
    store.close();
  });

  it('the partial-unique index allows many NULL reservation_id rows', () => {
    const f = fixture();
    const store = ledger(f);
    const a = reservation({ taskId: 'task-a', attemptId: '33333333-3333-4333-8333-333333333333', model: 'gpt-5.6-sol' });
    const b = reservation({ taskId: 'task-b', attemptId: '44444444-4444-4444-8444-444444444444', model: 'gpt-5.6-sol' });
    bindNonReservable(store, a, preparedSettlement(f, a), 'binding-nr-a');
    // A second non-reservable binding (also NULL reservation_id) must NOT collide.
    const second = bindNonReservable(store, b, preparedSettlement(f, b), 'binding-nr-b');
    expect(second.created).toBe(true);
    store.close();
  });

  it('the DB CHECK rejects a reserved row with NULL reservation_id', () => {
    const f = fixture();
    const store = ledger(f);
    store.close();
    const raw = new Database(f.dbPath);
    expect(() => raw.prepare(`
      INSERT INTO execution_termination_bindings (
        binding_id, tenant_id, project_id, admission_mode, reservation_id, run_id, call_id,
        attempt_id, task_id, receipt_ref, execution_backend, created_at,
        payload_json, payload_hash, integrity_key_id, integrity_version
      ) VALUES ('bx','t','p','reserved',NULL,'r','c','a','tk','rr','docker','${T1}','{}','h','k',1)
    `).run()).toThrow();
    raw.close();
  });

  it('the DB CHECK rejects a non-reservable row that carries a reservation_id', () => {
    const f = fixture();
    const store = ledger(f);
    store.close();
    const raw = new Database(f.dbPath);
    expect(() => raw.prepare(`
      INSERT INTO execution_termination_bindings (
        binding_id, tenant_id, project_id, admission_mode, reservation_id, run_id, call_id,
        attempt_id, task_id, receipt_ref, execution_backend, created_at,
        payload_json, payload_hash, integrity_key_id, integrity_version
      ) VALUES ('by','t','p','non_reservable_subscription','res-1','r','c','a','tk','rr','docker','${T1}','{}','h','k',1)
    `).run()).toThrow();
    raw.close();
  });
});

describe('execution termination ledger — legacy v1 → v2 migration', () => {
  it('migrates a legacy v1 binding to reserved without rewriting payload/hash', () => {
    const f = fixture();
    const admitted = reservation();
    const ref = preparedSettlement(f, admitted);
    // Write a reserved binding under the current (v2) schema. Its payload is
    // already v1-shaped (schemaVersion:1, no admissionMode field), so we can
    // downgrade the DB to a genuine v1 layout and let the migration re-upgrade.
    const store = ledger(f);
    const written = store.putBinding(createDockerExecutionTerminationBindingInput({
      bindingId: 'binding-legacy',
      reservation: admitted,
      reservationEvidenceRef: `provider-limit-reservation:${admitted.reservationId}`,
      settlementRef: ref,
      createdAt: T1,
    }));
    const evidenceBefore = written.evidenceRef;
    store.close();

    // Snapshot the persisted row, then rebuild the bindings table with the OLD
    // v1 layout (reservation_id NOT NULL UNIQUE, no admission_mode) and set
    // user_version = 1 — a faithful pre-migration database.
    const raw = new Database(f.dbPath);
    const row = raw.prepare('SELECT * FROM execution_termination_bindings WHERE binding_id = ?')
      .get('binding-legacy') as Record<string, unknown>;
    const payloadJsonBefore = row['payload_json'] as string;
    const payloadHashBefore = row['payload_hash'] as string;
    raw.pragma('foreign_keys = OFF');
    raw.exec(`
      DROP TABLE execution_termination_bindings;
      CREATE TABLE execution_termination_bindings (
        inserted_seq INTEGER PRIMARY KEY AUTOINCREMENT,
        binding_id TEXT NOT NULL UNIQUE,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        reservation_id TEXT NOT NULL UNIQUE,
        run_id TEXT NOT NULL,
        call_id TEXT NOT NULL,
        attempt_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        receipt_ref TEXT NOT NULL,
        execution_backend TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        integrity_key_id TEXT NOT NULL,
        integrity_version INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX execution_termination_logical_binding
        ON execution_termination_bindings (tenant_id, project_id, run_id, call_id, attempt_id);
      CREATE TRIGGER execution_termination_bindings_no_update
        BEFORE UPDATE ON execution_termination_bindings BEGIN
          SELECT RAISE(ABORT, 'execution termination bindings are immutable');
        END;
      CREATE TRIGGER execution_termination_bindings_no_delete
        BEFORE DELETE ON execution_termination_bindings BEGIN
          SELECT RAISE(ABORT, 'execution termination bindings are immutable');
        END;
      CREATE TRIGGER execution_termination_bindings_active_key_insert
        BEFORE INSERT ON execution_termination_bindings
        WHEN NEW.integrity_version != 1 OR NEW.integrity_key_id != (
          SELECT active_key_id FROM execution_termination_authority WHERE singleton_id = 1
        ) BEGIN
          SELECT RAISE(ABORT, 'execution termination active authority mismatch');
        END;
    `);
    raw.prepare(`
      INSERT INTO execution_termination_bindings (
        binding_id, tenant_id, project_id, reservation_id, run_id, call_id,
        attempt_id, task_id, receipt_ref, execution_backend, created_at,
        payload_json, payload_hash, integrity_key_id, integrity_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row['binding_id'], row['tenant_id'], row['project_id'], row['reservation_id'],
      row['run_id'], row['call_id'], row['attempt_id'], row['task_id'],
      row['receipt_ref'], row['execution_backend'], row['created_at'],
      payloadJsonBefore, payloadHashBefore, row['integrity_key_id'], row['integrity_version'],
    );
    raw.pragma('user_version = 1');
    raw.pragma('foreign_keys = ON');
    raw.close();

    // Re-open through the ledger — this triggers migrateBindingsV1ToV2.
    const migrated = ledger(f);
    const binding = migrated.getBinding('binding-legacy');
    expect(binding?.admissionMode).toBe('reserved');
    expect(migrated.getBinding('binding-legacy') && evidenceBefore).toBe(evidenceBefore);

    const rawAfter = new Database(f.dbPath, { readonly: true });
    const rowAfter = rawAfter.prepare('SELECT * FROM execution_termination_bindings WHERE binding_id = ?')
      .get('binding-legacy') as Record<string, unknown>;
    const version = rawAfter.pragma('user_version', { simple: true }) as number;
    rawAfter.close();
    migrated.close();

    expect(version).toBe(2);
    expect(rowAfter['admission_mode']).toBe('reserved');
    // Hash preservation — payload + MAC are copied verbatim, never re-signed.
    expect(rowAfter['payload_json']).toBe(payloadJsonBefore);
    expect(rowAfter['payload_hash']).toBe(payloadHashBefore);
  });

  it('rejects an unknown future schema version rather than silently migrating', () => {
    const f = fixture();
    ledger(f).close();
    const raw = new Database(f.dbPath);
    raw.pragma('user_version = 99');
    raw.close();
    expect(() => ledger(f)).toThrow(ExecutionTerminationLedgerError);
  });
});
