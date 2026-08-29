import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InvocationReceiptStore } from '../../src/core/invocation-receipt-store.js';
import {
  createTaskSettlementProbe,
  openTaskSettlementAuthority,
  inspectLinuxProcWorker,
  openTaskSettlementProjection,
  type InspectTaskSettlementInput,
  type LinuxProcWorkerInspectionAdapter,
  type TaskSettlementEvidenceProbe,
  type TaskSettlementProbeInput,
} from '../../src/core/task-settlement-authority.js';

const roots: string[] = [];
const authorityHandles: Array<{ close(): void }> = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-task-settlement-'));
  roots.push(value);
  return value;
}

const createdAt = '2026-07-27T10:31:06.632Z';

function taskContent(taskId = 'run-100-0'): string {
  return JSON.stringify({ id: taskId, status: 'PENDING', createdAt });
}

function writeCanonicalTask(projectRoot: string, taskId = 'run-100-0'): string {
  const content = taskContent(taskId);
  mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
  writeFileSync(join(projectRoot, '.tasks', `task-${taskId}.json`), content);
  return content;
}

function evidenceRefs(): readonly string[] {
  return [
    'evidence:backend-attempt:absent',
    'evidence:heartbeat:absent',
    'evidence:log:absent',
    'evidence:result:absent',
    'evidence:worker-process:absent',
  ];
}

function absenceProbe(): TaskSettlementEvidenceProbe {
  return {
    async inspect() {
      return {
        platform: 'test',
        observedAt: '2026-07-27T12:00:00.000Z',
        observations: [
          { kind: 'heartbeat', state: 'absent', evidenceRef: 'evidence:heartbeat:absent' },
          { kind: 'log', state: 'absent', evidenceRef: 'evidence:log:absent' },
          { kind: 'result', state: 'absent', evidenceRef: 'evidence:result:absent' },
          { kind: 'worker-process', state: 'absent', evidenceRef: 'evidence:worker-process:absent' },
          { kind: 'backend-attempt', state: 'absent', evidenceRef: 'evidence:backend-attempt:absent' },
        ],
      };
    },
  };
}

function productionAuthority(
  projectRoot: string,
  options: {
    readonly workerState?: 'absent' | 'present' | 'unknown' | 'unsupported';
    readonly backendState?: 'absent' | 'present' | 'unknown' | 'unsupported';
    readonly now?: () => string;
    readonly beforeProcessInspect?: () => void | Promise<void>;
    readonly onInspect?: () => void;
  } = {},
) {
  const opened = openTaskSettlementAuthority(projectRoot, {
    processProbe: {
      async inspect() {
        options.onInspect?.();
        await options.beforeProcessInspect?.();
        const state = options.workerState ?? 'absent';
        return {
          kind: 'worker-process',
          state,
          evidenceRef: `evidence:worker-process:${state}`,
        };
      },
    },
    backendProbe: {
      async inspect() {
        const state = options.backendState ?? 'absent';
        return {
          kind: 'backend-attempt',
          state,
          evidenceRef: `evidence:backend-attempt:${state}`,
        };
      },
    },
    ...(options.now ? { now: options.now } : {}),
  });
  authorityHandles.push(opened);
  return opened;
}

const linuxProcInput: TaskSettlementProbeInput = {
  tenantId: 'tenant-a',
  projectId: 'project-a',
  taskId: 'run-100-0',
  runId: 'run-100',
  executionBackend: 'host-subprocess',
};

function linuxProcAdapter(
  overrides: Partial<LinuxProcWorkerInspectionAdapter> = {},
): LinuxProcWorkerInspectionAdapter {
  return {
    platform: 'linux',
    currentPid: 99_999,
    async listProcessIds() {
      return [];
    },
    async readCommandLine() {
      return '';
    },
    nowMs: () => 1_000,
    ...overrides,
  };
}

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

function input(
  store: InvocationReceiptStore,
  overrides: Partial<InspectTaskSettlementInput> = {},
): InspectTaskSettlementInput {
  return {
    tenantId: 'tenant-a',
    projectId: store.projectId,
    taskId: 'run-100-0',
    runId: 'run-100',
    executionBackend: 'docker',
    rawStatus: 'PENDING',
    taskContent: taskContent(),
    taskCreatedAt: createdAt,
    ...overrides,
  };
}

afterEach(() => {
  for (const handle of authorityHandles.splice(0)) handle.close();
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('TaskSettlementAuthority', () => {
  it('declares a deterministic pre-dispatch receipt across restart/idFactory drift', () => {
    const projectRoot = root();
    let opened = productionAuthority(projectRoot, {
      now: () => '2026-07-27T12:00:00.000Z',
    });
    const first = opened.authority.declareTaskExecution({
      tenantId: 'tenant-a',
      projectId: opened.projectId,
      taskId: 'run-100-0',
      runId: 'run-100',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      executionBackend: 'docker',
    });
    opened.close();

    opened = productionAuthority(projectRoot, {
      now: () => '2026-07-27T12:05:00.000Z',
    });
    const replay = opened.authority.declareTaskExecution({
      tenantId: 'tenant-a',
      projectId: opened.projectId,
      taskId: 'run-100-0',
      runId: 'run-100',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      executionBackend: 'docker',
    });

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.receiptRef).toEqual(first.receiptRef);
    expect(replay.receipt.createdAt).toBe(first.receipt.createdAt);
    opened.close();
  });

  it('keeps production ledger and snapshot verification behind a frozen factory facade', async () => {
    const projectRoot = root();
    const rogueLedger = {
      projectId: 'rogue-project',
      declareTaskReceiptAtomic: vi.fn(),
      scanTaskReceipts: vi.fn(() => []),
    };
    const rogueVerifier = { verify: vi.fn(() => true) };
    const opened = openTaskSettlementAuthority(projectRoot, {
      processProbe: {
        async inspect() {
          return {
            kind: 'worker-process',
            state: 'absent',
            evidenceRef: 'evidence:worker-process:absent',
          };
        },
      },
      backendProbe: {
        async inspect() {
          return {
            kind: 'backend-attempt',
            state: 'absent',
            evidenceRef: 'evidence:backend-attempt:absent',
          };
        },
      },
      ledger: rogueLedger,
      taskSnapshotVerifier: rogueVerifier,
    } as never);
    authorityHandles.push(opened);

    expect(Object.isFrozen(opened.authority)).toBe(true);
    expect(opened.authority.constructor).toBe(Object);
    expect(opened.projectId).not.toBe('rogue-project');
    const initial = await opened.authority.plan({
      tenantId: 'tenant-a',
      projectId: opened.projectId,
      taskId: 'run-100-0',
      runId: 'run-100',
      executionBackend: 'docker',
      rawStatus: 'PENDING',
      taskContent: taskContent(),
      taskCreatedAt: createdAt,
    });
    await expect(opened.authority.settleNotDispatched({
      tenantId: 'tenant-a',
      projectId: opened.projectId,
      taskId: 'run-100-0',
      runId: 'run-100',
      executionBackend: 'docker',
      rawStatus: 'PENDING',
      taskContent: taskContent(),
      taskCreatedAt: createdAt,
      apply: true,
      operatorAttestation: {
        operatorId: 'operator-a',
        attestedAt: '2026-07-27T12:00:00.000Z',
        reason: 'No dispatch.',
        evidenceRefs: initial.evidenceRefs,
      },
    })).resolves.toMatchObject({
      decision: 'hold',
      reasonCode: 'task-content-mismatch',
    });
    expect(rogueLedger.declareTaskReceiptAtomic).not.toHaveBeenCalled();
    expect(rogueLedger.scanTaskReceipts).not.toHaveBeenCalled();
    expect(rogueVerifier.verify).not.toHaveBeenCalled();
    const runtimeModule = await import('../../src/core/task-settlement-authority.js');
    expect(Object.hasOwn(runtimeModule, 'TaskSettlementAuthority')).toBe(false);
  });

  it('dry-runs by default, then atomically settles a typed pre-dispatch rejection', async () => {
    const projectRoot = root();
    const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
    writeCanonicalTask(projectRoot);
    const authority = productionAuthority(projectRoot).authority;
    const settlementOccurredAt = '2026-07-27T12:04:05.678Z';
    const declaration = authority.declareTaskExecution({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskId: 'run-100-0',
      runId: 'run-100',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      executionBackend: 'docker',
      createdAt,
    });
    const base = {
      ...input(store),
      receiptRef: declaration.receiptRef,
      reasonCode: 'budget_capability_unsupported' as const,
      occurredAt: settlementOccurredAt,
    };

    const preview = await authority.settleNotDispatched(base);
    expect(preview).toMatchObject({
      decision: 'eligible',
      effectiveStatus: 'PENDING',
      reasonCode: 'receipt-ready-for-rejection',
    });
    expect(store.get(declaration.receiptRef, declaration.receiptRef.invocationId)?.events)
      .toHaveLength(0);

    const applied = await authority.settleNotDispatched({ ...base, apply: true });
    expect(applied).toMatchObject({
      decision: 'already-settled',
      effectiveStatus: 'NOT_DISPATCHED',
    });
    const view = store.get(declaration.receiptRef, declaration.receiptRef.invocationId);
    expect(view?.events.map(event => event.type))
      .toEqual(['dispatch_rejected', 'consumer_settled']);
    expect(view?.events.map(event => event.occurredAt))
      .toEqual([settlementOccurredAt, settlementOccurredAt]);
    expect(view?.taskDisposition).toBe('not_dispatched');
    expect(view?.events[1]?.previousHash).toBe(view?.events[0]?.hash);

    const replay = await authority.settleNotDispatched({ ...base, apply: true });
    expect(replay.decision).toBe('already-settled');
    expect(store.get(declaration.receiptRef, declaration.receiptRef.invocationId)?.events)
      .toHaveLength(2);
    store.close();
  });

  // ─── F5: abandoned-dispatch reconciliation (owner design, 2026-08-28) ──────
  //
  // A one-shot dispatch whose worker dies leaves a dispatch_started head. settleNotDispatched
  // must refuse it (NOT_DISPATCHED would be false), and before this path existed no operator
  // surface could terminalize it — the receipt stayed non-terminal and blocked canonical clean.
  //
  // The separation these cases pin: a pending result-settlement is CONTROL-PLANE attempt
  // authority about this exact receipt, never runtime liveness; the real backend adapter is
  // asked independently and must be absent on top of the ordinary absence set.
  function dispatchStarted(
    authority: ReturnType<typeof productionAuthority>['authority'],
    store: InvocationReceiptStore,
  ) {
    const declaration = authority.declareTaskExecution({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskId: 'run-100-0',
      runId: 'run-100',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      executionBackend: 'host-subprocess',
      createdAt,
    });
    authority.markDispatchStarted({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      invocationId: declaration.receiptRef.invocationId,
      attempt: 1,
      executionEvidenceRef: 'evidence:dispatch:1',
      calledProvider: 'codex',
      calledModel: 'gpt-5.6-sol',
      occurredAt: '2026-07-27T12:00:00.000Z',
    });
    return declaration;
  }

  const attestation = {
    operatorId: 'operator-1',
    reason: 'worker died without a result',
    attestedAt: '2026-07-27T12:10:00.000Z',
  };

  it('settles an abandoned dispatch as manual_review_required and replays idempotently', async () => {
    const projectRoot = root();
    const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
    writeCanonicalTask(projectRoot);
    const authority = productionAuthority(projectRoot).authority;
    const declaration = dispatchStarted(authority, store);
    const base = { ...input(store, { executionBackend: 'host-subprocess' }), receiptRef: declaration.receiptRef };

    const held = await authority.settleAbandonedDispatch(base);
    expect(held.decision).toBe('hold');
    expect(held.reasonCode).toBe('attestation-required');

    const attested = {
      ...base,
      operatorAttestation: { ...attestation, evidenceRefs: held.evidenceRefs },
    };
    const preview = await authority.settleAbandonedDispatch(attested);
    expect(preview).toMatchObject({ decision: 'eligible', reasonCode: 'dispatch-abandoned' });
    // Dry-run mutates nothing.
    expect(store.get(declaration.receiptRef, declaration.receiptRef.invocationId)?.events)
      .toHaveLength(1);

    const applied = await authority.settleAbandonedDispatch({ ...attested, apply: true });
    expect(applied.effectiveStatus).toBe('MANUAL_REVIEW_REQUIRED');
    const view = store.get(declaration.receiptRef, declaration.receiptRef.invocationId);
    expect(view?.events.map(event => event.type))
      .toEqual(['dispatch_started', 'transport_settled', 'consumer_settled']);
    expect(view?.taskDisposition).toBe('manual_review_required');
    expect(view?.events.at(-1)?.payload).toMatchObject({
      reasonCode: 'abandoned_dispatch_reconciled',
      outcome: 'unknown',
    });

    const replay = await authority.settleAbandonedDispatch({ ...attested, apply: true });
    expect(replay.effectiveStatus).toBe('MANUAL_REVIEW_REQUIRED');
    expect(store.get(declaration.receiptRef, declaration.receiptRef.invocationId)?.events)
      .toHaveLength(3);
    store.close();
  });

  it('refuses while the real backend adapter still reports runtime liveness', async () => {
    const projectRoot = root();
    const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
    writeCanonicalTask(projectRoot);
    const authority = productionAuthority(projectRoot, { backendState: 'present' }).authority;
    const declaration = dispatchStarted(authority, store);
    const held = await authority.settleAbandonedDispatch({
      ...input(store, { executionBackend: 'host-subprocess' }),
      receiptRef: declaration.receiptRef,
    });
    expect(held.decision).toBe('hold');
    expect(held.reasonCode).toBe('dispatch-still-live');
    expect(store.get(declaration.receiptRef, declaration.receiptRef.invocationId)?.events)
      .toHaveLength(1);
    store.close();
  });

  it.each([['unknown'], ['unsupported']] as const)(
    'holds instead of settling when the backend probe is %s',
    async state => {
      const projectRoot = root();
      const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
      writeCanonicalTask(projectRoot);
      const authority = productionAuthority(projectRoot, { backendState: state }).authority;
      const declaration = dispatchStarted(authority, store);
      const held = await authority.settleAbandonedDispatch({
        ...input(store),
        receiptRef: declaration.receiptRef,
        apply: true,
        operatorAttestation: { ...attestation, evidenceRefs: ['evidence:x'] },
      });
      expect(held.decision).toBe('hold');
      expect(store.get(declaration.receiptRef, declaration.receiptRef.invocationId)?.events)
        .toHaveLength(1);
      store.close();
    },
  );

  it('refuses an eventless receipt — that shape belongs to settleNotDispatched', async () => {
    const projectRoot = root();
    const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
    writeCanonicalTask(projectRoot);
    const authority = productionAuthority(projectRoot).authority;
    const declaration = authority.declareTaskExecution({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskId: 'run-100-0',
      runId: 'run-100',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      executionBackend: 'host-subprocess',
      createdAt,
    });
    const held = await authority.settleAbandonedDispatch({
      ...input(store, { executionBackend: 'host-subprocess' }),
      receiptRef: declaration.receiptRef,
    });
    expect(held.decision).toBe('hold');
    expect(held.reasonCode).toBe('terminal-conflict');
    store.close();
  });

  it('refuses when the operator attestation does not bind this evidence snapshot', async () => {
    const projectRoot = root();
    const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
    writeCanonicalTask(projectRoot);
    const authority = productionAuthority(projectRoot).authority;
    const declaration = dispatchStarted(authority, store);
    const held = await authority.settleAbandonedDispatch({
      ...input(store),
      receiptRef: declaration.receiptRef,
      apply: true,
      operatorAttestation: {
        ...attestation,
        evidenceRefs: ['evidence:some-other-snapshot'],
      },
    });
    expect(held.decision).toBe('hold');
    expect(store.get(declaration.receiptRef, declaration.receiptRef.invocationId)?.events)
      .toHaveLength(1);
    store.close();
  });

  it('captures the default settlement timestamp once for both atomic events', async () => {
    const projectRoot = root();
    const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
    writeCanonicalTask(projectRoot);
    const occurredAt = '2026-07-27T12:06:07.890Z';
    const now = vi.fn(() => occurredAt);
    const authority = productionAuthority(projectRoot, { now }).authority;
    const declaration = authority.declareTaskExecution({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskId: 'run-100-0',
      runId: 'run-100',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      executionBackend: 'docker',
      createdAt,
    });

    await authority.settleNotDispatched({
      ...input(store),
      receiptRef: declaration.receiptRef,
      reasonCode: 'execution_admission_rejected',
      apply: true,
    });

    const view = store.get(declaration.receiptRef, declaration.receiptRef.invocationId);
    expect(view?.events.map(event => event.occurredAt)).toEqual([occurredAt, occurredAt]);
    store.close();
  });

  it('preserves a stored rejection timestamp when appending its consumer settlement', async () => {
    const projectRoot = root();
    const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
    writeCanonicalTask(projectRoot);
    const declarationAuthority = productionAuthority(projectRoot).authority;
    const declaration = declarationAuthority.declareTaskExecution({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskId: 'run-100-0',
      runId: 'run-100',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      executionBackend: 'docker',
      createdAt,
    });
    const rejectedAt = '2026-07-27T12:08:09.012Z';
    store.append(declaration.receiptRef, declaration.receiptRef.invocationId, {
      eventId: 'dispatch-rejected-existing',
      type: 'dispatch_rejected',
      occurredAt: rejectedAt,
      payload: {
        reasonCode: 'provider_authority_rejected',
        evidenceRefs: evidenceRefs(),
      },
    });
    const now = vi.fn(() => '2026-07-27T12:09:10.123Z');
    const authority = productionAuthority(projectRoot, { now }).authority;
    const base = {
      ...input(store),
      receiptRef: declaration.receiptRef,
      apply: true,
    };

    await expect(authority.settleNotDispatched({
      ...base,
      reasonCode: 'budget_capability_unsupported',
    })).rejects.toThrow('TASK_SETTLEMENT_REASON_CONFLICT');
    expect(store.get(declaration.receiptRef, declaration.receiptRef.invocationId)?.events)
      .toHaveLength(1);

    await expect(authority.settleNotDispatched({
      ...base,
      occurredAt: '2026-07-27T12:10:11.234Z',
    })).rejects.toThrow('TASK_SETTLEMENT_TIMESTAMP_CONFLICT');
    expect(store.get(declaration.receiptRef, declaration.receiptRef.invocationId)?.events)
      .toHaveLength(1);

    await authority.settleNotDispatched(base);
    const view = store.get(declaration.receiptRef, declaration.receiptRef.invocationId);
    expect(view?.events.map(event => event.occurredAt)).toEqual([rejectedAt, rejectedAt]);
    store.close();
  });

  it('rejects an invalid settlement timestamp before probing or mutation', async () => {
    const projectRoot = root();
    const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
    const inspect = vi.fn();
    const authority = productionAuthority(projectRoot, { onInspect: inspect }).authority;

    await expect(authority.settleNotDispatched({
      ...input(store),
      occurredAt: 'not-a-timestamp',
      apply: true,
    })).rejects.toThrow('TASK_SETTLEMENT_INVALID_TIMESTAMP');
    expect(inspect).not.toHaveBeenCalled();
    expect(store.scanTaskReceipts({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskId: 'run-100-0',
      purpose: 'worker-execution',
    })).toEqual([]);
    store.close();
  });

  it('never converts an explicit missing receipt reference into a legacy settlement', async () => {
    const projectRoot = root();
    const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
    const authority = productionAuthority(projectRoot).authority;
    const result = await authority.inspectTaskSettlement({
      ...input(store),
      receiptRef: {
        schemaVersion: 1,
        invocationId: 'missing-invocation',
        tenantId: 'tenant-a',
        projectId: store.projectId,
      },
      operatorAttestation: {
        operatorId: 'operator-a',
        attestedAt: '2026-07-27T12:00:00.000Z',
        reason: 'No dispatch.',
        evidenceRefs: evidenceRefs(),
      },
    });

    expect(result).toMatchObject({
      decision: 'hold',
      reasonCode: 'receipt-missing',
      effectiveStatus: 'PENDING',
    });
    expect(store.scanTaskReceipts({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskId: 'run-100-0',
      purpose: 'worker-execution',
    })).toEqual([]);
    store.close();
  });

  it('requires exact freshly-probed legacy attestation and persists only hashes', async () => {
    const projectRoot = root();
    const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
    writeCanonicalTask(projectRoot);
    const authority = productionAuthority(projectRoot).authority;
    const base = input(store);

    const initial = await authority.inspectTaskSettlement(base);
    expect(initial).toMatchObject({
      decision: 'hold',
      reasonCode: 'attestation-required',
    });
    const mismatch = await authority.inspectTaskSettlement({
      ...base,
      operatorAttestation: {
        operatorId: 'operator@example.test',
        attestedAt: '2026-07-27T12:00:00.000Z',
        reason: 'Provider dispatch never began.',
        evidenceRefs: ['caller-invented:evidence'],
      },
    });
    expect(mismatch.reasonCode).toBe('attestation-evidence-mismatch');

    const settled = await authority.settleNotDispatched({
      ...base,
      apply: true,
      operatorAttestation: {
        operatorId: 'operator@example.test',
        attestedAt: '2026-07-27T12:00:00.000Z',
        reason: 'Provider dispatch never began.',
        evidenceRefs: initial.evidenceRefs,
      },
    });
    expect(settled.effectiveStatus).toBe('NOT_DISPATCHED');
    const [view] = store.scanTaskReceipts({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskId: 'run-100-0',
      purpose: 'worker-execution',
    });
    const rejection = view?.events[0]?.payload as {
      attestation?: { operatorRefHash?: string; statementDigest?: string };
    };
    expect(rejection.attestation?.operatorRefHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(rejection.attestation?.statementDigest).toMatch(/^[a-f0-9]{64}$/u);
    store.close();
    const bytes = readFileSync(join(projectRoot, '.deckent', 'runtime', 'invocations.db'));
    expect(bytes.includes(Buffer.from('operator@example.test'))).toBe(false);
    expect(bytes.includes(Buffer.from('Provider dispatch never began.'))).toBe(false);
  });

  it('fails closed before mutation when no current task snapshot verifier is available', async () => {
    const projectRoot = root();
    const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
    const authority = productionAuthority(projectRoot).authority;
    const initial = await authority.plan(input(store));

    const result = await authority.settleNotDispatched({
      ...input(store),
      apply: true,
      operatorAttestation: {
        operatorId: 'operator-a',
        attestedAt: '2026-07-27T12:00:00.000Z',
        reason: 'No dispatch.',
        evidenceRefs: initial.evidenceRefs,
      },
    });

    expect(result).toMatchObject({
      decision: 'hold',
      reasonCode: 'task-content-mismatch',
      effectiveStatus: 'PENDING',
    });
    expect(store.scanTaskReceipts({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskId: 'run-100-0',
      purpose: 'worker-execution',
    })).toEqual([]);
    store.close();
  });

  it('allows only an explicit receipt-backed ephemeral one-shot before Task JSON publication', async () => {
    const projectRoot = root();
    const opened = openTaskSettlementAuthority(projectRoot, {
      processProbe: {
        async inspect() {
          return {
            kind: 'worker-process',
            state: 'absent',
            evidenceRef: 'process:absent',
          };
        },
      },
      backendProbe: {
        async inspect() {
          return {
            kind: 'backend-attempt',
            state: 'absent',
            evidenceRef: 'backend:absent',
          };
        },
      },
      now: () => '2026-07-27T12:00:00.000Z',
    });
    const declaration = opened.authority.declareTaskExecution({
      tenantId: 'local',
      projectId: opened.projectId,
      taskId: 'run-100-0',
      runId: 'run-100',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      executionBackend: 'docker',
      createdAt,
    });
    const base = {
      tenantId: 'local',
      projectId: opened.projectId,
      taskId: 'run-100-0',
      runId: 'run-100',
      executionBackend: 'docker' as const,
      rawStatus: 'PENDING',
      taskContent: taskContent(),
      taskCreatedAt: createdAt,
      receiptRef: declaration.receiptRef,
      reasonCode: 'budget_capability_unsupported' as const,
      apply: true,
    };

    await expect(opened.authority.settleNotDispatched(base)).resolves.toMatchObject({
      decision: 'hold',
      reasonCode: 'task-content-mismatch',
    });
    await expect(opened.authority.settleNotDispatched({
      ...base,
      taskSnapshotOrigin: 'ephemeral-memory',
    })).resolves.toMatchObject({
      decision: 'already-settled',
      effectiveStatus: 'NOT_DISPATCHED',
    });
    opened.close();
  });

  it('production authority rejects task bytes changed while the absence probe is pending', async () => {
    const projectRoot = root();
    const tasksDir = join(projectRoot, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    const rawContent = taskContent();
    const taskPath = join(tasksDir, 'task-run-100-0.json');
    writeFileSync(taskPath, rawContent, 'utf8');
    let probeCalls = 0;
    let signalSecondProbe!: () => void;
    let releaseSecondProbe!: () => void;
    const secondProbeStarted = new Promise<void>(resolve => {
      signalSecondProbe = resolve;
    });
    const secondProbeRelease = new Promise<void>(resolve => {
      releaseSecondProbe = resolve;
    });
    const opened = openTaskSettlementAuthority(projectRoot, {
      processProbe: {
        async inspect() {
          probeCalls++;
          if (probeCalls === 2) {
            signalSecondProbe();
            await secondProbeRelease;
          }
          return {
            kind: 'worker-process',
            state: 'absent',
            evidenceRef: 'process:absent',
          };
        },
      },
      backendProbe: {
        async inspect() {
          return {
            kind: 'backend-attempt',
            state: 'absent',
            evidenceRef: 'backend:absent',
          };
        },
      },
      now: () => '2026-07-27T12:00:00.000Z',
    });
    const base = {
      tenantId: 'local',
      projectId: opened.projectId,
      taskId: 'run-100-0',
      runId: 'run-100',
      executionBackend: 'docker' as const,
      rawStatus: 'PENDING',
      taskContent: rawContent,
      taskCreatedAt: createdAt,
    };
    const initial = await opened.authority.plan(base);
    expect(initial).toMatchObject({
      decision: 'hold',
      reasonCode: 'attestation-required',
    });

    const settlement = opened.authority.settleNotDispatched({
      ...base,
      apply: true,
      operatorAttestation: {
        operatorId: 'operator-a',
        attestedAt: '2026-07-27T12:00:00.000Z',
        reason: 'No dispatch.',
        evidenceRefs: initial.evidenceRefs,
      },
    });
    await secondProbeStarted;
    writeFileSync(
      taskPath,
      JSON.stringify({ id: 'run-100-0', status: 'EXECUTING', createdAt }),
      'utf8',
    );
    releaseSecondProbe();

    await expect(settlement).resolves.toMatchObject({
      decision: 'hold',
      reasonCode: 'task-content-mismatch',
      effectiveStatus: 'PENDING',
    });
    opened.close();
    const store = new InvocationReceiptStore(projectRoot);
    expect(store.scanTaskReceipts({
      tenantId: 'local',
      projectId: store.projectId,
      taskId: 'run-100-0',
      purpose: 'worker-execution',
    })).toEqual([]);
    store.close();
  });

  it('revalidates the task snapshot inside the receipt transaction precondition', async () => {
    const projectRoot = root();
    const tasksDir = join(projectRoot, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    const rawContent = taskContent();
    const taskPath = join(tasksDir, 'task-run-100-0.json');
    writeFileSync(taskPath, rawContent, 'utf8');
    const store = new InvocationReceiptStore(projectRoot);
    let probeCalls = 0;
    const opened = productionAuthority(projectRoot, {
      beforeProcessInspect() {
        probeCalls++;
        if (probeCalls === 2) {
          writeFileSync(
            taskPath,
            JSON.stringify({ id: 'run-100-0', status: 'EXECUTING', createdAt }),
            'utf8',
          );
        }
      },
      now: () => '2026-07-27T12:00:00.000Z',
    });
    const base = {
      tenantId: 'local',
      projectId: opened.projectId,
      taskId: 'run-100-0',
      runId: 'run-100',
      executionBackend: 'docker' as const,
      rawStatus: 'PENDING',
      taskContent: rawContent,
      taskCreatedAt: createdAt,
    };
    const initial = await opened.authority.plan(base);

    await expect(opened.authority.settleNotDispatched({
      ...base,
      apply: true,
      operatorAttestation: {
        operatorId: 'operator-a',
        attestedAt: '2026-07-27T12:00:00.000Z',
        reason: 'No dispatch.',
        evidenceRefs: initial.evidenceRefs,
      },
    })).resolves.toMatchObject({
      decision: 'hold',
      reasonCode: 'task-content-mismatch',
      effectiveStatus: 'PENDING',
    });
    expect(store.scanTaskReceipts({
      tenantId: 'local',
      projectId: store.projectId,
      taskId: 'run-100-0',
      purpose: 'worker-execution',
    })).toEqual([]);
    opened.close();
    store.close();
  });

  it('atomically loses legacy reconciliation when a dispatch receipt wins the race', async () => {
    const projectRoot = root();
    const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
    writeCanonicalTask(projectRoot);
    const competingAuthority = productionAuthority(projectRoot).authority;
    let injected = false;
    let armed = false;
    const authority = productionAuthority(projectRoot, {
      beforeProcessInspect() {
        if (!armed || injected) return;
        injected = true;
        const declaration = competingAuthority.declareTaskExecution({
          tenantId: 'tenant-a',
          projectId: store.projectId,
          taskId: 'run-100-0',
          runId: 'run-100',
          provider: 'codex',
          model: 'gpt-5.6-sol',
          executionBackend: 'docker',
          createdAt,
        });
        competingAuthority.markDispatchStarted({
          ...declaration.receiptRef,
          attempt: 1,
          executionEvidenceRef: 'dispatch:won-race',
          calledProvider: 'codex',
          calledModel: 'gpt-5.6-sol',
        });
      },
    }).authority;
    const initial = await authority.plan(input(store));
    armed = true;

    const result = await authority.settleNotDispatched({
      ...input(store),
      apply: true,
      reasonCode: 'budget_capability_unsupported',
      operatorAttestation: {
        operatorId: 'operator-a',
        attestedAt: '2026-07-27T12:00:00.000Z',
        reason: 'No dispatch.',
        evidenceRefs: initial.evidenceRefs,
      },
    });

    expect(result).toMatchObject({
      decision: 'hold',
      reasonCode: 'dispatch-started',
      effectiveStatus: 'PENDING',
    });
    const views = store.scanTaskReceipts({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskId: 'run-100-0',
      purpose: 'worker-execution',
    });
    expect(views).toHaveLength(1);
    expect(views[0]?.events.map(event => event.type)).toEqual(['dispatch_started']);
    store.close();
  });

  it('rejects a NOT_DISPATCHED consumer that rewrites rejection cause or evidence', () => {
    const projectRoot = root();
    const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
    const authority = productionAuthority(projectRoot).authority;
    const declaration = authority.declareTaskExecution({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskId: 'run-100-0',
      runId: 'run-100',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      executionBackend: 'docker',
      createdAt,
    });
    const occurredAt = '2026-07-27T12:00:00.000Z';
    store.append(declaration.receiptRef, declaration.receiptRef.invocationId, {
      eventId: 'rejection-cause',
      type: 'dispatch_rejected',
      occurredAt,
      payload: {
        reasonCode: 'budget_capability_unsupported',
        evidenceRefs: ['authority:budget'],
      },
    });

    expect(() => store.append(
      declaration.receiptRef,
      declaration.receiptRef.invocationId,
      {
        eventId: 'consumer-forgery',
        type: 'consumer_settled',
        occurredAt,
        payload: {
          outcome: 'accepted',
          reasonCode: 'no_provider',
          taskDisposition: 'not_dispatched',
          evidenceRefs: ['authority:forged'],
        },
      },
    )).toThrow(/exact rejection cause/u);
    expect(store.get(declaration.receiptRef, declaration.receiptRef.invocationId)?.events)
      .toHaveLength(1);
    store.close();
  });

  it.each([
    ['present', 'active-execution-evidence'],
    ['unsupported', 'probe-unsupported'],
    ['unknown', 'absence-evidence-incomplete'],
  ] as const)('fails closed for %s worker evidence', async (state, reasonCode) => {
    const projectRoot = root();
    const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
    const authority = productionAuthority(projectRoot, { workerState: state }).authority;
    const result = await authority.inspectTaskSettlement({
      ...input(store),
      operatorAttestation: {
        operatorId: 'operator-a',
        attestedAt: '2026-07-27T12:00:00.000Z',
        reason: 'No dispatch.',
        evidenceRefs: evidenceRefs(),
      },
    });
    expect(result).toMatchObject({ decision: 'hold', reasonCode });
    store.close();
  });

  it('projects one dispatched terminal, rejects contradictions, and replays idempotently', async () => {
    const projectRoot = root();
    const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
    const authority = productionAuthority(projectRoot).authority;
    const declaration = authority.declareTaskExecution({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskId: 'run-100-0',
      runId: 'run-100',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      executionBackend: 'docker',
    });
    authority.markDispatchStarted({
      ...declaration.receiptRef,
      attempt: 1,
      executionEvidenceRef: 'docker-attempt:one',
      calledProvider: 'codex',
      calledModel: 'gpt-5.6-sol',
    });
    const terminalInput = {
      ...declaration.receiptRef,
      outcome: 'succeeded',
      exitCode: 0,
      signal: null,
      reasonCode: 'none',
      durationMs: 10,
      consumerOutcome: 'accepted',
      taskDisposition: 'done',
    } as const;
    expect(() => authority.settleDispatched({
      ...terminalInput,
      outcome: 'failed',
      reasonCode: 'nonzero_exit',
    })).toThrow('TASK_SETTLEMENT_DISPOSITION_OUTCOME_MISMATCH');
    expect(store.get(declaration.receiptRef, declaration.receiptRef.invocationId)?.events)
      .toHaveLength(1);

    authority.settleDispatched(terminalInput);
    authority.settleDispatched(terminalInput);
    expect(store.get(declaration.receiptRef, declaration.receiptRef.invocationId)?.events)
      .toHaveLength(3);
    expect(authority.projectTaskExecutionState(
      'run-100-0',
      'PENDING',
      { tenantId: 'tenant-a', projectId: store.projectId },
    )).toMatchObject({ effectiveStatus: 'DONE', reasonCode: 'projected' });

    expect(() => authority.declareTaskExecution({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskId: 'run-100-0',
      runId: 'run-101',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      executionBackend: 'docker',
    })).toThrow(/authority owner/u);
    store.declare({
      ...declaration.receipt,
      invocationId: 'historical-conflicting-receipt',
      idempotencyKey: 'historical-conflicting-key',
      runId: 'run-101',
      callId: 'historical-conflicting-call',
    });
    expect(await authority.inspectTaskSettlement(input(store))).toMatchObject({
      decision: 'hold',
      reasonCode: 'receipt-ambiguous',
      effectiveStatus: 'PENDING',
    });
    expect(authority.projectTaskExecutionState(
      'run-100-0',
      'PENDING',
      { tenantId: 'tenant-a', projectId: store.projectId },
    )).toMatchObject({
      effectiveStatus: 'PENDING',
      reasonCode: 'ambiguous-receipts',
    });
    store.close();
  });

  it.each(['../escape', 'bad/id', 'nul\u0000id', 'x'.repeat(101)])(
    'rejects unsafe task identity before probing: %s',
    async taskId => {
      const projectRoot = root();
      const store = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-a' });
      const inspect = vi.fn();
      const authority = productionAuthority(projectRoot, { onInspect: inspect }).authority;
      await expect(authority.inspectTaskSettlement({
        ...input(store),
        taskId,
        taskContent: taskContent(taskId),
      })).rejects.toThrow();
      expect(inspect).not.toHaveBeenCalled();
      store.close();
    },
  );

  it('opens an absent receipt store read-only without creating state', () => {
    const projectRoot = root();
    const projection = openTaskSettlementProjection(projectRoot);
    expect(projection).toMatchObject({ projectId: null, diagnostic: 'store-absent' });
    expect(projection.projectTaskExecutionState('run-100-0', 'PENDING'))
      .toMatchObject({ effectiveStatus: 'PENDING', reasonCode: 'store-absent' });
    projection.close();
    expect(() => readFileSync(join(projectRoot, '.deckent', 'runtime', 'invocations.db')))
      .toThrow();
  });

  it('bulk-projects mixed tenants in deterministic input order', () => {
    const projectRoot = root();
    const opened = productionAuthority(projectRoot);
    const settle = (
      tenantId: string,
      terminal: {
        outcome: 'succeeded' | 'failed';
        exitCode: number;
        reasonCode: 'none' | 'nonzero_exit';
        consumerOutcome: 'accepted' | 'rejected';
        taskDisposition: 'done' | 'no_go';
      },
    ) => {
      const declaration = opened.authority.declareTaskExecution({
        tenantId,
        projectId: opened.projectId,
        taskId: 'run-100-0',
        runId: `run-${tenantId}`,
        provider: 'codex',
        model: 'gpt-5.6-sol',
        executionBackend: 'docker',
      });
      opened.authority.markDispatchStarted({
        ...declaration.receiptRef,
        attempt: 1,
        executionEvidenceRef: `dispatch:${tenantId}`,
        calledProvider: 'codex',
        calledModel: 'gpt-5.6-sol',
      });
      opened.authority.settleDispatched({
        ...declaration.receiptRef,
        ...terminal,
        signal: null,
        durationMs: 10,
      });
    };
    settle('tenant-a', {
      outcome: 'succeeded',
      exitCode: 0,
      reasonCode: 'none',
      consumerOutcome: 'accepted',
      taskDisposition: 'done',
    });
    settle('tenant-b', {
      outcome: 'failed',
      exitCode: 1,
      reasonCode: 'nonzero_exit',
      consumerOutcome: 'rejected',
      taskDisposition: 'no_go',
    });

    const projection = openTaskSettlementProjection(projectRoot);
    const bulkScan = vi.spyOn(InvocationReceiptStore.prototype, 'scanProjectTaskReceiptsBulk');
    const projected = projection.projectTaskExecutionStates([
      { taskId: 'run-100-0', rawStatus: 'PENDING', tenantId: 'tenant-b' },
      { taskId: 'run-404-0', rawStatus: 'PENDING', tenantId: 'tenant-a' },
      { taskId: 'run-100-0', rawStatus: 'PENDING', tenantId: 'tenant-a' },
      { taskId: 'run-100-0', rawStatus: 'PENDING', tenantId: 'tenant-b' },
    ]);
    expect(projected.map(item => [item.effectiveStatus, item.reasonCode])).toEqual([
      ['NO_GO', 'projected'],
      ['PENDING', 'no-terminal-receipt'],
      ['DONE', 'projected'],
      ['NO_GO', 'projected'],
    ]);
    expect(bulkScan).toHaveBeenCalledOnce();
    bulkScan.mockRestore();
    projection.close();
  });

  it('validates bulk projection requests identically when the store is absent', () => {
    const projection = openTaskSettlementProjection(root());
    expect(() => projection.projectTaskExecutionStates([
      { taskId: 'run-100-0', rawStatus: 'PENDING', tenantId: ' tenant-a' },
    ])).toThrow('TASK_SETTLEMENT_INVALID_SCOPE');
    expect(() => projection.projectTaskExecutionStates([
      { taskId: 'run-100-0', rawStatus: 'PENDING', extra: true },
    ] as never)).toThrow('TASK_SETTLEMENT_INVALID_PROJECTION_INPUT');
    projection.close();
  });

  it('production probe uses injected async process/backend adapters and canonical evidence', async () => {
    const projectRoot = root();
    const probe = createTaskSettlementProbe(projectRoot, {
      processProbe: {
        async inspect() {
          return {
            kind: 'worker-process',
            state: 'absent',
            evidenceRef: 'process:absent',
          };
        },
      },
      backendProbe: {
        async inspect() {
          return {
            kind: 'backend-attempt',
            state: 'absent',
            evidenceRef: 'backend:absent',
          };
        },
      },
      now: () => '2026-07-27T12:00:00.000Z',
    });
    const snapshot = await probe.inspect({
      tenantId: 'tenant-a',
      projectId: 'project-a',
      taskId: 'run-100-0',
      runId: 'run-100',
      executionBackend: 'docker',
    });
    expect(snapshot.observations).toHaveLength(5);
    expect(snapshot.observations.every(observation => observation.state === 'absent'))
      .toBe(true);
  });

  it.each([
    ['heartbeat', 'hb'],
    ['log', 'log'],
    ['result', 'result'],
  ] as const)('detects canonical task-%s artifacts as present', async (kind, extension) => {
    const projectRoot = root();
    const tasksDir = join(projectRoot, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, `task-${linuxProcInput.taskId}.${extension}`), 'evidence');
    const probe = createTaskSettlementProbe(projectRoot, {
      processProbe: {
        async inspect() {
          return {
            kind: 'worker-process',
            state: 'absent',
            evidenceRef: 'process:absent',
          };
        },
      },
      backendProbe: {
        async inspect() {
          return {
            kind: 'backend-attempt',
            state: 'absent',
            evidenceRef: 'backend:absent',
          };
        },
      },
      now: () => '2026-07-27T12:00:00.000Z',
    });

    const snapshot = await probe.inspect(linuxProcInput);

    expect(snapshot.observations.find(observation => observation.kind === kind))
      .toMatchObject({ state: 'present' });
  });

  it('keeps complete Linux absence evidence stable across unrelated process and race churn', async () => {
    const projectRoot = root();
    let scan = 0;
    const commands = new Map([
      ['101', 'node unrelated-service.js'],
      ['102', 'bash unrelated-job.sh'],
      ['103', 'sleep 60'],
    ]);
    const adapter = linuxProcAdapter({
      async listProcessIds() {
        scan++;
        return scan === 1 ? ['101', '102'] : ['101', '102', '103', '104'];
      },
      async readCommandLine(pid) {
        if (pid === '104') throw errno('ENOENT');
        return commands.get(pid) ?? '';
      },
    });
    const probe = createTaskSettlementProbe(projectRoot, {
      processProbe: {
        inspect: input => inspectLinuxProcWorker(input, { adapter }),
      },
      now: () => '2026-07-27T12:00:00.000Z',
    });

    const first = await probe.inspect(linuxProcInput);
    const second = await probe.inspect(linuxProcInput);
    const firstProcess = first.observations.find(item => item.kind === 'worker-process');
    const secondProcess = second.observations.find(item => item.kind === 'worker-process');
    const firstBackend = first.observations.find(item => item.kind === 'backend-attempt');
    const secondBackend = second.observations.find(item => item.kind === 'backend-attempt');

    expect(firstProcess).toMatchObject({ state: 'absent' });
    expect(secondProcess).toEqual(firstProcess);
    expect(firstBackend).toMatchObject({ state: 'absent' });
    expect(secondBackend).toEqual(firstBackend);
  });

  it('reports any task-matching Linux worker as present with identity-bound evidence', async () => {
    const adapter = linuxProcAdapter({
      async listProcessIds() {
        return ['101', '102'];
      },
      async readCommandLine(pid) {
        return pid === '102'
          ? 'node dist/agents/worker.js agentic-worker-entry run-100-0'
          : 'node unrelated-service.js';
      },
    });

    const observation = await inspectLinuxProcWorker(linuxProcInput, { adapter });

    expect(observation).toMatchObject({
      kind: 'worker-process',
      state: 'present',
    });
    expect(observation.evidenceRef)
      .toMatch(/^task-process:linux-proc:present:sha256:[a-f0-9]{64}$/u);
  });

  it('fails closed when any enumerated Linux process is unreadable', async () => {
    const adapter = linuxProcAdapter({
      async listProcessIds() {
        return ['101', '102'];
      },
      async readCommandLine(pid) {
        if (pid === '102') throw errno('EACCES');
        return 'node unrelated-service.js';
      },
    });

    const observation = await inspectLinuxProcWorker(linuxProcInput, { adapter });

    expect(observation).toMatchObject({
      kind: 'worker-process',
      state: 'unknown',
    });
  });

  it('fails closed when Linux process enumeration exceeds its configured bound', async () => {
    const adapter = linuxProcAdapter({
      async listProcessIds() {
        return ['101', '102'];
      },
    });

    const observation = await inspectLinuxProcWorker(linuxProcInput, {
      adapter,
      maxEntries: 1,
    });

    expect(observation).toMatchObject({
      kind: 'worker-process',
      state: 'unknown',
    });
  });

  it.each([
    ['EACCES', 'unknown'],
    ['ENOENT', 'unsupported'],
  ] as const)(
    'fails closed when Linux process enumeration errors with %s',
    async (code, expectedState) => {
      const adapter = linuxProcAdapter({
        async listProcessIds() {
          throw errno(code);
        },
      });

      await expect(inspectLinuxProcWorker(linuxProcInput, { adapter }))
        .resolves.toMatchObject({
          kind: 'worker-process',
          state: expectedState,
        });
    },
  );
});
