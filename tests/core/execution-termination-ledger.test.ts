import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ExecutionTerminationLedger,
  ExecutionTerminationLedgerError,
  createDockerExecutionTerminationBindingInput,
  createProviderLimitTerminationEvidenceVerifier,
  resolveExecutionTerminationAdapter,
  resolveExecutionTerminationLedgerPath,
} from '../../src/core/execution-termination-ledger.js';
import { ProviderAuthorityKeyring } from '../../src/core/provider-authority-keyring.js';
import {
  createExecutionLandingCheckpoint,
  writeExecutionAttemptRetirementAtomic,
  writeExecutionLandingCheckpointAtomic,
  type CreateExecutionLandingCheckpointInput,
} from '../../src/core/execution-landing-checkpoint.js';
import {
  createProviderLimitResult,
  deriveProviderQuotaScopeRefHash,
  type ProviderLimitObservation,
  type ProviderLimitReservation,
  type ProviderLimitReservationRequest,
} from '../../src/core/provider-limit-truth.js';
import { ProviderLimitStore } from '../../src/core/provider-limit-store.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRefForAttempt,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementPreparedAtomic,
  writeTaskResultSettlementLandedRetirementAtomic,
  type TaskResultSettlementRefV1,
} from '../../src/core/task-result-settlement.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;
const INTEGRITY_KEY = 'execution-termination-ledger-test-key-0000000001';
const T0 = '2026-07-24T08:00:00.000Z';
const T1 = '2026-07-24T08:01:00.000Z';
const T2 = '2026-07-24T08:02:00.000Z';
const T3 = '2026-07-24T08:03:00.000Z';
const T4 = '2026-07-24T08:04:00.000Z';
const T5 = '2026-07-24T08:05:00.000Z';
const T10 = '2026-07-24T08:10:00.000Z';

interface Fixture {
  readonly base: string;
  readonly projectRoot: string;
  readonly stateRoot: string;
  readonly dbPath: string;
}

function fixture(): Fixture {
  const base = mkdtempSync(join(tmpdir(), 'deckent-termination-ledger-'));
  roots.push(base);
  const projectRoot = join(base, 'project');
  const stateRoot = join(base, 'host-state');
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(stateRoot, { recursive: true });
  process.env.DECKENT_HOME = stateRoot;
  return {
    base,
    projectRoot,
    stateRoot,
    dbPath: join(stateRoot, 'execution-terminations.db'),
  };
}

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

function reservationRequest(
  admitted: ProviderLimitReservation,
): ProviderLimitReservationRequest {
  const {
    snapshotEvidenceRef: _snapshotEvidenceRef,
    decision: _decision,
    reasonCode: _reasonCode,
    effectiveRemaining: _effectiveRemaining,
    appliedPolicy: _appliedPolicy,
    ...request
  } = admitted;
  return request;
}

function preparedSettlement(
  f: Fixture,
  admitted = reservation(),
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

function ledger(
  f: Fixture,
  now = T4,
  integrityKey = INTEGRITY_KEY,
): ExecutionTerminationLedger {
  return new ExecutionTerminationLedger(f.stateRoot, {
    dbPath: f.dbPath,
    now: () => new Date(now),
    integrityKey,
  });
}

function bind(
  store: ExecutionTerminationLedger,
  admitted: ProviderLimitReservation,
  ref: TaskResultSettlementRefV1,
  bindingId = 'binding-alpha',
) {
  return store.putBinding(createDockerExecutionTerminationBindingInput({
    bindingId,
    reservation: admitted,
    reservationEvidenceRef: `provider-limit-reservation:${admitted.reservationId}`,
    settlementRef: ref,
    createdAt: T1,
  }));
}

function closeWithoutDispatch(ref: TaskResultSettlementRefV1): void {
  writeTaskResultSettlementAtomic(createTaskResultSettlement({
    ref,
    exitCode: 1,
    settledAt: T2,
    result: { taskId: ref.taskId, selfAssessment: 'NO_GO' },
  }));
  writeTaskResultSettlementClosureAtomic(ref, {
    containerDisposition: 'not-dispatched',
    locksReleased: true,
    closedAt: T3,
  });
}

function closeAfterDispatch(ref: TaskResultSettlementRefV1): void {
  writeTaskResultSettlementDispatchAtomic(ref, 'e'.repeat(64), T2);
  writeTaskResultSettlementAtomic(createTaskResultSettlement({
    ref,
    exitCode: 0,
    settledAt: T3,
    result: { taskId: ref.taskId, selfAssessment: 'DONE' },
  }));
  writeTaskResultSettlementClosureAtomic(ref, {
    containerDisposition: 'stopped-removed',
    locksReleased: true,
    closedAt: T4,
  });
}

function landAfterDispatch(f: Fixture, ref: TaskResultSettlementRefV1): void {
  writeTaskResultSettlementDispatchAtomic(ref, 'e'.repeat(64), T2);
  const input: CreateExecutionLandingCheckpointInput = {
    taskId: ref.taskId,
    attemptId: ref.attemptId,
    tenantId: 'tenant-alpha',
    originalRequestDigest: '1'.repeat(64),
    taskDigest: '2'.repeat(64),
    role: 'worker',
    kind: 'code-development',
    admissionMode: 'unattended',
    identity: {
      configuredProvider: 'anthropic',
      configuredModel: 'claude-fable-5',
      requestedProvider: 'anthropic',
      requestedModel: 'claude-fable-5',
      resolvedProvider: 'anthropic',
      resolvedModel: 'claude-fable-5',
      calledProvider: 'anthropic',
      calledModel: 'claude-fable-5',
      backend: 'docker',
      auth: 'subscription',
      fallbackReason: null,
    },
    policyDigest: '3'.repeat(64),
    landingPolicy: { reserve_ratio: 0.25 },
    hardBudget: { maxTokens: 1_000, maxCacheReadTokens: 800 },
    cumulativeUsage: {
      turns: 2,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 500,
      cacheCreationTokens: 50,
      totalTokens: 700,
      maxContextTokens: 650,
    },
    attemptFence: 'fence-alpha',
    providerSequence: {
      firstSequence: 1,
      lastSequence: 4,
      eventCount: 4,
      eventDigest: '4'.repeat(64),
    },
    semanticState: {
      summary: 'The attempt reached its owner-authored landing threshold.',
      completedWork: ['Immutable termination binding was written.'],
      remainingWork: ['Continue from the immutable checkpoint.'],
      nextAction: 'Claim the continuation attempt.',
      unresolvedRisks: [],
    },
    scope: {
      filesRead: ['src/core/execution-termination-ledger.ts'],
      filesWrite: ['src/core/execution-termination-ledger.ts'],
    },
    diskDiffRefs: [`disk-diff:sha256:${'5'.repeat(64)}`],
    evidenceRefs: [`budget-usage:sha256:${'6'.repeat(64)}`],
    acceptanceCriteria: 'The continuation must cite this retirement authority.',
    landingRequestedAt: T2,
    landedAt: T3,
  };
  const checkpoint = createExecutionLandingCheckpoint(f.projectRoot, input);
  writeExecutionLandingCheckpointAtomic(f.projectRoot, checkpoint);
  writeExecutionAttemptRetirementAtomic(f.projectRoot, checkpoint.checkpoint, {
    checkpointSha256: checkpoint.checkpointSha256,
    runtimeDisposition: 'stopped-removed',
    resourcesReleased: true,
    evidenceRefs: [`runtime-release:sha256:${'7'.repeat(64)}`],
    retiredAt: T4,
  });
  writeTaskResultSettlementLandedRetirementAtomic(ref);
}

afterEach(() => {
  process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('ExecutionTerminationLedger', () => {
  it('resolves one host-global path across supported platform roots', () => {
    expect(resolveExecutionTerminationLedgerPath('linux', { HOME: '/home/alp' }))
      .toBe('/home/alp/.local/state/deckent/execution-terminations.db');
    expect(resolveExecutionTerminationLedgerPath('wsl', { HOME: '/home/alp' }))
      .toBe('/home/alp/.local/state/deckent/execution-terminations.db');
    expect(resolveExecutionTerminationLedgerPath('darwin', { HOME: '/Users/alp' }))
      .toBe('/Users/alp/Library/Application Support/deckent/execution-terminations.db');
    expect(resolveExecutionTerminationLedgerPath('win32', {
      USERPROFILE: 'C:\\Users\\alp',
      LOCALAPPDATA: 'D:\\Local',
    })).toBe('D:\\Local\\deckent\\execution-terminations.db');
  });

  it('holds every backend without an equivalent durable adapter', () => {
    expect(resolveExecutionTerminationAdapter('docker')).toEqual({
      decision: 'ready',
      executionBackend: 'docker',
      evidenceContract: 'task-result-settlement-v1',
    });
    for (const backend of ['host-subprocess', 'tmux', 'api', 'in-process'] as const) {
      expect(resolveExecutionTerminationAdapter(backend)).toEqual({
        decision: 'hold',
        executionBackend: backend,
        reasonCode: 'termination_adapter_unsupported',
        evidenceContract: null,
      });
    }
  });

  it('persists an exact pre-dispatch binding and released terminal across restart', () => {
    const f = fixture();
    const admitted = reservation();
    const ref = preparedSettlement(f, admitted);
    const first = ledger(f);
    const bindingWrite = bind(first, admitted, ref);
    expect(bindingWrite.created).toBe(true);
    expect(bindingWrite.value).toMatchObject({
      tenantId: admitted.tenantId,
      projectId: admitted.projectId,
      runId: admitted.runId,
      taskId: admitted.taskId,
      callId: admitted.callId,
      attemptId: admitted.attemptId,
      invocationReceiptRef: admitted.receiptRef,
      providerLimitReservationId: admitted.reservationId,
      fenceTokenHash: admitted.fenceTokenHash,
      provider: admitted.provider,
      model: admitted.model,
      executionBackend: 'docker',
    });
    expect(bind(first, admitted, ref)).toEqual({
      ...bindingWrite,
      created: false,
    });
    closeWithoutDispatch(ref);
    const terminalWrite = first.recordDockerTerminal({
      terminalId: 'terminal-alpha',
      bindingId: bindingWrite.value.bindingId,
      settlementRef: ref,
      capacityDisposition: 'released',
    });
    expect(terminalWrite.value).toMatchObject({
      capacityDisposition: 'released',
      terminalOutcome: 'closed',
      contained: true,
      occurredAt: T3,
      recordedAt: T4,
    });
    first.close();

    const reopened = ledger(f, T5);
    expect(reopened.getBinding('binding-alpha')).toEqual(bindingWrite.value);
    expect(reopened.getTerminalByEvidenceRef(terminalWrite.evidenceRef)).toEqual({
      ...terminalWrite,
      created: false,
    });
    expect(reopened.recordDockerTerminal({
      terminalId: 'terminal-alpha',
      bindingId: bindingWrite.value.bindingId,
      settlementRef: ref,
      capacityDisposition: 'released',
    })).toEqual({
      ...terminalWrite,
      created: false,
    });
    const verify = createProviderLimitTerminationEvidenceVerifier(reopened);
    expect(verify({
      evidenceRef: terminalWrite.evidenceRef,
      authorityRef: terminalWrite.authorityRef,
      reservation: admitted,
      event: {
        eventId: 'release-event-alpha',
        type: 'released',
        occurredAt: T5,
        fenceTokenHash: admitted.fenceTokenHash,
        evidenceRef: 'release-evidence:alpha0001',
        terminationEvidenceRef: terminalWrite.evidenceRef,
        terminationAuthorityRef: terminalWrite.authorityRef,
      },
    })).toBe(true);
    reopened.close();
  });

  it('never releases a dispatched execution and records it only as consumed', () => {
    const f = fixture();
    const admitted = reservation();
    const ref = preparedSettlement(f, admitted);
    const store = ledger(f, T5);
    bind(store, admitted, ref);
    closeAfterDispatch(ref);

    expect(() => store.recordDockerTerminal({
      terminalId: 'terminal-release',
      bindingId: 'binding-alpha',
      settlementRef: ref,
      capacityDisposition: 'released',
    })).toThrowError(ExecutionTerminationLedgerError);

    const consumed = store.recordDockerTerminal({
      terminalId: 'terminal-consumed',
      bindingId: 'binding-alpha',
      settlementRef: ref,
      capacityDisposition: 'consumed',
    });
    expect(consumed.value).toMatchObject({
      capacityDisposition: 'consumed',
      terminalOutcome: 'closed',
      occurredAt: T4,
    });
    store.close();
  });

  it('accepts LANDED retirement only as consumed after durable dispatch', () => {
    const f = fixture();
    const admitted = reservation();
    const ref = preparedSettlement(f, admitted);
    const store = ledger(f, T5);
    bind(store, admitted, ref);
    landAfterDispatch(f, ref);
    expect(() => store.recordDockerTerminal({
      terminalId: 'terminal-release',
      bindingId: 'binding-alpha',
      settlementRef: ref,
      capacityDisposition: 'released',
    })).toThrowError(ExecutionTerminationLedgerError);
    expect(store.recordDockerTerminal({
      terminalId: 'terminal-landed',
      bindingId: 'binding-alpha',
      settlementRef: ref,
      capacityDisposition: 'consumed',
    }).value).toMatchObject({
      capacityDisposition: 'consumed',
      terminalOutcome: 'landed',
      occurredAt: T4,
    });
    store.close();
  });

  it('rejects post-dispatch binding, cross-reservation release and late ledger publication', () => {
    const f = fixture();
    const admitted = reservation();
    const ref = preparedSettlement(f, admitted);
    writeTaskResultSettlementDispatchAtomic(ref, 'e'.repeat(64), T2);
    expect(() => createDockerExecutionTerminationBindingInput({
      bindingId: 'binding-alpha',
      reservation: admitted,
      reservationEvidenceRef: 'provider-limit-reservation:alpha',
      settlementRef: ref,
      createdAt: T3,
    })).toThrowError(ExecutionTerminationLedgerError);

    const secondFixture = fixture();
    const secondRef = preparedSettlement(secondFixture, admitted);
    const store = ledger(secondFixture);
    bind(store, admitted, secondRef);
    closeWithoutDispatch(secondRef);
    const terminal = store.recordDockerTerminal({
      terminalId: 'terminal-alpha',
      bindingId: 'binding-alpha',
      settlementRef: secondRef,
      capacityDisposition: 'released',
    });
    const verify = createProviderLimitTerminationEvidenceVerifier(store);
    const release = {
      eventId: 'release-event-alpha',
      type: 'released' as const,
      occurredAt: T5,
      fenceTokenHash: admitted.fenceTokenHash,
      evidenceRef: 'release-evidence:alpha0001',
      terminationEvidenceRef: terminal.evidenceRef,
      terminationAuthorityRef: terminal.authorityRef,
    };
    expect(verify({
      evidenceRef: terminal.evidenceRef,
      authorityRef: terminal.authorityRef,
      reservation: reservation({
        projectId: 'project-foreign',
        reservationId: 'reservation-foreign',
      }),
      event: release,
    })).toBe(false);
    expect(verify({
      evidenceRef: terminal.evidenceRef,
      authorityRef: terminal.authorityRef,
      reservation: admitted,
      event: { ...release, occurredAt: T3 },
    })).toBe(false);
    store.close();
  });

  it('rejects a conflicting second terminal and cross-binding settlement evidence', () => {
    const f = fixture();
    const admitted = reservation();
    const ref = preparedSettlement(f, admitted);
    const store = ledger(f);
    bind(store, admitted, ref);
    closeWithoutDispatch(ref);
    store.recordDockerTerminal({
      terminalId: 'terminal-alpha',
      bindingId: 'binding-alpha',
      settlementRef: ref,
      capacityDisposition: 'released',
    });
    expect(() => store.recordDockerTerminal({
      terminalId: 'terminal-second',
      bindingId: 'binding-alpha',
      settlementRef: ref,
      capacityDisposition: 'released',
    })).toThrowError(ExecutionTerminationLedgerError);

    const foreign = reservation({
      reservationId: 'reservation-foreign',
      idempotencyKey: 'reservation-key-foreign',
      callId: 'call-foreign',
      attemptId: '22222222-2222-4222-8222-222222222222',
    });
    const foreignRef = preparedSettlement(f, foreign);
    closeWithoutDispatch(foreignRef);
    expect(() => store.recordDockerTerminal({
      terminalId: 'terminal-foreign',
      bindingId: 'binding-alpha',
      settlementRef: foreignRef,
      capacityDisposition: 'released',
    })).toThrowError(ExecutionTerminationLedgerError);
    store.close();
  });

  it('detects payload tampering after an immutable database trigger is bypassed', () => {
    const f = fixture();
    const admitted = reservation();
    const ref = preparedSettlement(f, admitted);
    const store = ledger(f);
    bind(store, admitted, ref);
    store.close();

    const raw = new Database(f.dbPath);
    raw.exec('DROP TRIGGER execution_termination_bindings_no_update');
    raw.prepare(`
      UPDATE execution_termination_bindings
      SET payload_json = replace(payload_json, 'project-alpha', 'project-tampered')
      WHERE binding_id = 'binding-alpha'
    `).run();
    raw.close();

    const reopened = ledger(f);
    expect(() => reopened.getBinding('binding-alpha')).toThrowError(
      ExecutionTerminationLedgerError,
    );
    reopened.close();
  });

  it('keeps historical binding signatures verifiable across authority rotation', () => {
    const f = fixture();
    const keyringDir = join(f.base, 'keyring');
    const created = ProviderAuthorityKeyring.create({
      dataDir: keyringDir,
      now: () => new Date(T0),
      keyringIdFactory: () => 'authority-ring-alpha',
      keyIdFactory: () => 'authority-key-alpha',
      randomBytesFactory: size => Buffer.alloc(size, 7),
    });
    const admitted = reservation();
    const ref = preparedSettlement(f, admitted);
    const first = new ExecutionTerminationLedger(f.stateRoot, {
      dbPath: f.dbPath,
      now: () => new Date(T4),
      integrityAuthority: created.keyring,
    });
    const bindingWrite = bind(first, admitted, ref);
    first.close();

    created.keyring.rotate({
      expectedRevisionHash: created.keyring.snapshot().revisionHash,
      now: () => new Date(T2),
      keyIdFactory: () => 'authority-key-bravo',
      randomBytesFactory: size => Buffer.alloc(size, 9),
    });
    closeWithoutDispatch(ref);
    const reopened = new ExecutionTerminationLedger(f.stateRoot, {
      dbPath: f.dbPath,
      now: () => new Date(T4),
      integrityAuthority: created.keyring,
    });
    expect(reopened.getBinding(bindingWrite.value.bindingId)).toEqual(bindingWrite.value);
    const terminal = reopened.recordDockerTerminal({
      terminalId: 'terminal-alpha',
      bindingId: bindingWrite.value.bindingId,
      settlementRef: ref,
      capacityDisposition: 'released',
    });
    expect(terminal.value.authorityRevision).toBe(2);
    expect(terminal.authorityRef)
      .toMatch(/^execution-termination-authority:[a-f0-9]{64}$/);
    reopened.close();
  });

  it('acts as the exact ProviderLimitStore release verifier without a permissive callback', () => {
    const f = fixture();
    const expected = reservation();
    const terminationLedger = ledger(f);
    const limitStore = new ProviderLimitStore(f.stateRoot, {
      dbPath: join(f.stateRoot, 'provider-limits.db'),
      now: () => new Date(T5),
      integrityKey: INTEGRITY_KEY,
      policyResolver: () => expected.appliedPolicy,
      terminationEvidenceVerifier: createProviderLimitTerminationEvidenceVerifier(terminationLedger),
    });
    const observation: ProviderLimitObservation = {
      tenantId: expected.tenantId,
      projectId: expected.projectId,
      idempotencyKey: 'snapshot-key-alpha',
      provider: expected.provider,
      accountRefHash: expected.accountRefHash,
      quotaScopeRefHash: expected.quotaScopeRefHash,
      authMode: expected.authMode,
      backend: expected.backend,
      state: 'known',
      requiredWindowIds: ['session-token-window'],
      windows: [{
        windowId: 'session-token-window',
        kind: 'session',
        model: expected.model,
        unit: 'tokens',
        consumed: 0,
        remaining: 100_000,
        limit: 100_000,
        reset: { state: 'known', at: T10, displayRefHash: null },
      }],
      source: {
        kind: 'provider-api',
        authority: 'authoritative',
        operatorApprovalRef: null,
        evidenceRef: 'limit-source:alpha0001',
        fetchedAt: T0,
        expiresAt: T10,
        incorporatedReservationEventRefs: [],
      },
    };
    limitStore.putSnapshot(createProviderLimitResult(
      observation,
      expected.appliedPolicy,
      { idFactory: () => 'snapshot-alpha' },
    ));
    const admitted = limitStore.reserve(reservationRequest(expected));
    expect(admitted).toEqual(expected);

    const ref = preparedSettlement(f, admitted);
    const bindingWrite = bind(terminationLedger, admitted, ref);
    closeWithoutDispatch(ref);
    const terminal = terminationLedger.recordDockerTerminal({
      terminalId: 'terminal-alpha',
      bindingId: bindingWrite.value.bindingId,
      settlementRef: ref,
      capacityDisposition: 'released',
    });
    limitStore.appendReservationEvent({
      tenantId: admitted.tenantId,
      projectId: admitted.projectId,
      provider: admitted.provider,
      accountRefHash: admitted.accountRefHash,
      quotaScopeRefHash: admitted.quotaScopeRefHash,
      authMode: admitted.authMode,
    }, admitted.reservationId, {
      eventId: 'release-event-alpha',
      type: 'released',
      occurredAt: T5,
      fenceTokenHash: admitted.fenceTokenHash,
      evidenceRef: 'release-evidence:alpha0001',
      terminationEvidenceRef: terminal.evidenceRef,
      terminationAuthorityRef: terminal.authorityRef,
    });
    expect(limitStore.getReservation({
      tenantId: admitted.tenantId,
      projectId: admitted.projectId,
      provider: admitted.provider,
      accountRefHash: admitted.accountRefHash,
      quotaScopeRefHash: admitted.quotaScopeRefHash,
      authMode: admitted.authMode,
    }, admitted.reservationId)?.state).toBe('released');
    limitStore.close();
    terminationLedger.close();
  });
});
