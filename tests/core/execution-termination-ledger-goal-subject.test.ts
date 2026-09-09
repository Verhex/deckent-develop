import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { ExecutionTerminationLedger, createDockerExecutionTerminationBindingInput, createNonReservableDockerExecutionTerminationBindingInput, EXECUTION_TERMINATION_LEDGER_DB_VERSION, type ExecutionTerminationBindingInput } from '../../src/core/execution-termination-ledger.js';
import { deriveProviderQuotaScopeRefHash, type ProviderLimitReservation } from '../../src/core/provider-limit-truth.js';
import { createGoalResultSettlementRefForAttempt, writeTaskResultSettlementAttemptAtomic, claimTaskResultSettlementAttemptAtomic, writeTaskResultSettlementPreparedAtomic } from '../../src/core/task-result-settlement.js';
import type { GoalExecutionCustodySubjectV1 } from '../../src/core/execution-custody-subject.js';
const T0 = '2026-07-24T08:00:00.000Z';
const T10 = '2026-07-24T08:10:00.000Z';
const T1 = '2026-07-24T08:01:00.000Z';
const roots: string[] = [];
const stores: ExecutionTerminationLedger[] = [];
const originalHome = process.env.DECKENT_HOME;
const key = 'goal-termination-test-integrity-key-00000001';
const subject: GoalExecutionCustodySubjectV1 = {
  kind: 'goal', goalId: 'goal-1', missionId: 'mission-1', purpose: 'goal-authoring',
  round: 1, invocationId: 'invocation-1', attemptId: '11111111-1111-4111-8111-111111111111',
};
function open(root: string): ExecutionTerminationLedger {
  const store = new ExecutionTerminationLedger(root, { integrityKey: key, now: () => new Date(T1) });
  stores.push(store); return store;
}
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-goal-termination-')); roots.push(root); return root;
}
afterEach(() => {
  if (originalHome === undefined) delete process.env.DECKENT_HOME; else process.env.DECKENT_HOME = originalHome;
  for (const store of stores.splice(0)) { try { store.close(); } catch { /* already closed for restart */ } }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
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

function input(patch: Partial<ProviderLimitReservation> = {}): ExecutionTerminationBindingInput {
  return {
    bindingId: 'goal-binding', subject,
    reservation: reservation({ taskId: null, runId: subject.missionId, callId: 'goal-authoring:1', ...patch }),
    reservationEvidenceRef: 'provider-limit-reservation:goal',
    runtime: { executionBackend: 'docker', evidenceRef: 'prepared:goal', evidenceDigest: 'e'.repeat(64) },
    createdAt: T1,
  };
}
function nonReservable() {
  const admitted = input().reservation;
  return {
    admissionMode: 'non_reservable_subscription' as const, bindingId: 'goal-non-reservable',
    identity: {
      subject, tenantId: admitted.tenantId, projectId: admitted.projectId, runId: admitted.runId,
      callId: admitted.callId, attemptId: admitted.attemptId, invocationReceiptRef: admitted.receiptRef,
      fenceTokenHash: admitted.fenceTokenHash, provider: admitted.provider, model: admitted.model,
      accountRefHash: admitted.accountRefHash, quotaScopeRefHash: admitted.quotaScopeRefHash,
      authMode: admitted.authMode, transport: admitted.backend.transport, endpointRefHash: admitted.backend.endpointRefHash,
    }, runtime: input().runtime, createdAt: T1,
  };
}
describe('goal termination ledger subjects', () => {
  it('connects real goal prepared metadata to both pre-dispatch binding producers', () => {
    const root = fixture(); process.env.DECKENT_HOME = root;
    const ref = createGoalResultSettlementRefForAttempt(fixture(), subject);
    writeTaskResultSettlementAttemptAtomic(ref, T0);
    claimTaskResultSettlementAttemptAtomic(ref, T0);
    writeTaskResultSettlementPreparedAtomic(ref, input().reservation.model, T0);
    const ledger = open(root);
    const binding = ledger.putBinding(createDockerExecutionTerminationBindingInput({
      bindingId: 'prepared-goal', reservation: input().reservation,
      reservationEvidenceRef: input().reservationEvidenceRef, settlementRef: ref, createdAt: T1,
    }));
    expect(binding.value.subject).toEqual(subject);
    expect(binding.value.runtimeEvidenceRef).toContain(createHash('sha256').update('\u0000goal-invocation:invocation-1').digest('hex'));
    const nr = nonReservable();
    // Separate ledger root avoids the exact logical-binding uniqueness constraint.
    expect(open(fixture()).putNonReservableBinding(createNonReservableDockerExecutionTerminationBindingInput({
      bindingId: nr.bindingId, identity: nr.identity, model: nr.identity.model, settlementRef: ref, createdAt: T1,
    })).value.subject).toEqual(subject);
    expect(() => ledger.recordDockerTerminal({ terminalId: 'goal-terminal', bindingId: binding.value.bindingId,
      settlementRef: ref, capacityDisposition: 'released',
    })).toThrow(expect.objectContaining({ code: 'EVIDENCE_UNAVAILABLE' }));
    expect(() => ledger.recordDockerTerminal({ terminalId: 'other-goal-terminal', bindingId: binding.value.bindingId,
      settlementRef: { ...ref, subject: { ...subject, goalId: 'other' } }, capacityDisposition: 'released',
    })).toThrow(expect.objectContaining({ code: 'EVIDENCE_MISMATCH' }));
  });

  it.each(['reserved', 'non_reservable_subscription'] as const)('persists %s goal identity without a fake task', mode => {
    const root = fixture(); const ledger = open(root);
    const written = mode === 'reserved' ? ledger.putBinding(input()) : ledger.putNonReservableBinding(nonReservable());
    expect(written.value).toMatchObject({ schemaVersion: 3, admissionMode: mode, taskId: null, subject });
    const db = new Database(join(root, 'execution-terminations.db'), { readonly: true });
    const row = db.prepare('SELECT * FROM execution_termination_bindings').get() as Record<string, unknown>;
    expect(row.subject_kind).toBe('goal'); expect(row.subject_key).toBe('\u0000goal-invocation:invocation-1');
    expect(row.task_id).toBeNull(); expect(JSON.parse(row.payload_json as string)).not.toHaveProperty('admissionMode');
    db.close(); ledger.close();
    expect(open(root).getBinding(written.value.bindingId)).toEqual(written.value);
  });
  it.each([{ runId: 'wrong' }, { callId: 'goal-authoring:2' }, { attemptId: 'other' }, { taskId: 'fake' }])(
    'rejects goal/reservation mismatch %#', patch => {
      expect(() => open(fixture()).putBinding(input(patch))).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    },
  );
  it('rejects nullable task identity without a goal subject and mixed non-reservable identity', () => {
    const { subject: _subject, ...missing } = input(); const ledger = open(fixture());
    expect(() => ledger.putBinding(missing)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    const nr = nonReservable();
    expect(() => ledger.putNonReservableBinding({ ...nr, identity: { ...nr.identity, taskId: 'fake' } } as never))
      .toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });
  it('binds non-reservable goal identity to mission, call and attempt', () => {
    const ledger = open(fixture()); const nr = nonReservable();
    for (const patch of [{ runId: 'other' }, { callId: 'other' }, { attemptId: 'other' }]) {
      expect(() => ledger.putNonReservableBinding({ ...nr, identity: { ...nr.identity, ...patch } }))
        .toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    }
  });
  it('rejects a different goal subject under the same binding id', () => {
    const ledger = open(fixture()); ledger.putBinding(input());
    expect(() => ledger.putBinding({ ...input(), subject: { ...subject, goalId: 'other' } }))
      .toThrow(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));
  });
  it('migrates a v2 task row to v3 without changing payload, MAC, digest or evidenceRef', () => {
    const root = fixture(); const store = open(root);
    const { subject: _subject, ...legacyInput } = input(); legacyInput.reservation = reservation();
    const before = store.putBinding(legacyInput); store.close();
    const raw = new Database(join(root, 'execution-terminations.db'));
    const rowBefore = raw.prepare('SELECT * FROM execution_termination_bindings').get() as Record<string, unknown>;
    // Rebuild the exact v2 column/constraint layout, retaining the signed legacy row.
    raw.exec(`
      DROP TRIGGER execution_termination_bindings_no_update;
      DROP TRIGGER execution_termination_bindings_no_delete;
      DROP TRIGGER execution_termination_bindings_active_key_insert;
      CREATE TABLE legacy_bindings (
        inserted_seq INTEGER PRIMARY KEY AUTOINCREMENT, binding_id TEXT NOT NULL UNIQUE,
        tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, admission_mode TEXT NOT NULL DEFAULT 'reserved',
        reservation_id TEXT, run_id TEXT NOT NULL, call_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
        task_id TEXT NOT NULL, receipt_ref TEXT NOT NULL, execution_backend TEXT NOT NULL,
        created_at TEXT NOT NULL, payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL,
        integrity_key_id TEXT NOT NULL, integrity_version INTEGER NOT NULL,
        CHECK ((admission_mode = 'reserved' AND reservation_id IS NOT NULL)
          OR (admission_mode = 'non_reservable_subscription' AND reservation_id IS NULL))
      );
      INSERT INTO legacy_bindings SELECT inserted_seq, binding_id, tenant_id, project_id, admission_mode,
        reservation_id, run_id, call_id, attempt_id, task_id, receipt_ref, execution_backend, created_at,
        payload_json, payload_hash, integrity_key_id, integrity_version FROM execution_termination_bindings;
      DROP TABLE execution_termination_bindings;
      ALTER TABLE legacy_bindings RENAME TO execution_termination_bindings;
      PRAGMA user_version = 2;
    `); raw.close();
    const migrated = open(root);
    expect(migrated.getBinding(before.value.bindingId)).toEqual(before.value);
    expect(migrated.putBinding(legacyInput)).toEqual({ ...before, created: false });
    const afterDb = new Database(join(root, 'execution-terminations.db'), { readonly: true });
    const rowAfter = afterDb.prepare('SELECT * FROM execution_termination_bindings').get() as Record<string, unknown>;
    expect(afterDb.pragma('user_version', { simple: true })).toBe(EXECUTION_TERMINATION_LEDGER_DB_VERSION);
    expect(rowAfter.subject_kind).toBe('task'); expect(rowAfter.subject_key).toBeNull();
    for (const field of Object.keys(rowBefore).filter(field => !['subject_kind', 'subject_key'].includes(field))) {
      expect(rowAfter[field]).toBe(rowBefore[field]);
    }
    const digest = createHash('sha256').update(rowAfter.payload_json as string).digest('hex');
    expect(before.evidenceRef).toBe(`execution-termination-binding:${digest}`);
    expect(afterDb.pragma('foreign_key_check')).toEqual([]); afterDb.close();
  });
  it('rejects goal subject envelope tampering even when its payload MAC is untouched', () => {
    const root = fixture(); const ledger = open(root); ledger.putBinding(input()); ledger.close();
    const db = new Database(join(root, 'execution-terminations.db'));
    db.exec("DROP TRIGGER execution_termination_bindings_no_update; UPDATE execution_termination_bindings SET subject_key = 'goal-invocation:other'");
    db.close(); expect(() => open(root).getBinding('goal-binding')).toThrow(expect.objectContaining({ code: 'INTEGRITY_FAILURE' }));
  });
  it.each(['goal', 'task'] as const)('rejects %s reserved-to-non-reservable envelope tampering', kind => {
    const root = fixture(); const ledger = open(root);
    const { subject: _subject, ...taskInput } = input();
    taskInput.reservation = reservation();
    const written = ledger.putBinding(kind === 'goal' ? input() : taskInput);
    ledger.close();
    const db = new Database(join(root, 'execution-terminations.db'));
    db.exec(`DROP TRIGGER execution_termination_bindings_no_update;
      UPDATE execution_termination_bindings
      SET admission_mode = 'non_reservable_subscription', reservation_id = NULL`);
    db.close();
    expect(() => open(root).getBinding(written.value.bindingId))
      .toThrow(expect.objectContaining({ code: 'INTEGRITY_FAILURE' }));
  });

});
