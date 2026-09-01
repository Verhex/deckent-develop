import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

import { print, printError } from '../../src/cli/helpers/output.js';
import {
  registerTaskSettlement,
  type TaskSettlementCommandDto,
} from '../../src/cli/commands/task-settlement.js';
import { InvocationReceiptStore } from '../../src/core/invocation-receipt-store.js';
import {
  openTaskSettlementAuthority,
  openTaskSettlementProjection,
  type OpenTaskSettlementAuthorityResult,
  type TaskSettlementProbeSnapshot,
  type TaskSettlementProbeInput,
} from '../../src/core/task-settlement-authority.js';

const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-task-settle-cli-'));
  roots.push(root);
  mkdirSync(join(root, '.tasks'), { recursive: true });
  writeFileSync(join(root, '.tasks', 'task-run-1.json'), JSON.stringify({
    id: 'run-1',
    title: 'legacy one-shot',
    description: 'legacy one-shot',
    model: 'claude-sonnet-5',
    provider: 'claude',
    backend: 'docker',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['./'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'done', noGoCriteria: 'failed', techDebtAcceptable: 'none' },
    status: 'PENDING',
    createdAt: '2026-07-27T10:00:00.000Z',
  }, null, 2), 'utf-8');
  return root;
}

function writePendingTask(
  root: string,
  id: string,
  overrides: Record<string, unknown> = {},
): string {
  const path = join(root, '.tasks', `task-${id}.json`);
  writeFileSync(path, JSON.stringify({
    id,
    title: id,
    description: id,
    model: 'claude-sonnet-5',
    provider: 'claude',
    backend: 'docker',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['./'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'done', noGoCriteria: 'failed', techDebtAcceptable: 'none' },
    status: 'PENDING',
    createdAt: '2026-07-27T10:00:00.000Z',
    ...overrides,
  }, null, 2), 'utf-8');
  return path;
}

function absenceSnapshot(taskId: string, revision: string) {
  return {
    platform: 'test',
    observedAt: '2026-07-27T11:00:00.000Z',
    observations: [
      { kind: 'heartbeat' as const, state: 'absent' as const, evidenceRef: `hb:${taskId}:${revision}` },
      { kind: 'log' as const, state: 'absent' as const, evidenceRef: `log:${taskId}:${revision}` },
      { kind: 'result' as const, state: 'absent' as const, evidenceRef: `result:${taskId}:${revision}` },
      { kind: 'worker-process' as const, state: 'absent' as const, evidenceRef: `process:${taskId}:${revision}` },
      { kind: 'backend-attempt' as const, state: 'absent' as const, evidenceRef: `backend:${taskId}:${revision}` },
    ],
  };
}

function productionOpener(
  root: string,
  inspect?: (input: TaskSettlementProbeInput) => Promise<TaskSettlementProbeSnapshot>,
): OpenTaskSettlementAuthorityResult {
  let latestSnapshot: TaskSettlementProbeSnapshot | undefined;
  return openTaskSettlementAuthority(root, {
    processProbe: {
      async inspect(input) {
        latestSnapshot = inspect
          ? await inspect(input)
          : absenceSnapshot(input.taskId, 'absent');
        return latestSnapshot.observations.find(
          observation => observation.kind === 'worker-process',
        )!;
      },
    },
    backendProbe: {
      async inspect(input) {
        const snapshot = latestSnapshot ?? (inspect
          ? await inspect(input)
          : absenceSnapshot(input.taskId, 'absent'));
        latestSnapshot = undefined;
        return snapshot.observations.find(
          observation => observation.kind === 'backend-attempt',
        )!;
      },
    },
    now: () => '2026-07-27T11:00:00.000Z',
  });
}

function declareEventlessReceipt(root: string): string {
  const opened = productionOpener(root);
  const declaration = opened.authority.declareTaskExecution({
    tenantId: 'local',
    projectId: opened.projectId,
    taskId: 'run-1',
    runId: 'run-1',
    provider: 'claude',
    model: 'claude-sonnet-5',
    executionBackend: 'docker',
    createdAt: '2026-07-27T10:00:00.000Z',
  });
  opened.close();
  return declaration.receiptRef.invocationId;
}

async function run(root: string, args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerTaskSettlement(program, {
    resolveProjectRootFn: () => root,
    openAuthority: productionOpener,
    now: () => '2026-07-27T11:00:00.000Z',
  });
  await program.parseAsync(['node', 'deckent', ...args]);
}

function lastJson(): TaskSettlementCommandDto {
  const value = vi.mocked(print).mock.calls.at(-1)?.[0];
  if (typeof value !== 'string') throw new Error('missing JSON output');
  return JSON.parse(value) as TaskSettlementCommandDto;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
});

afterEach(() => {
  process.exitCode = undefined;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('task settle CLI authority', () => {
  it('is dry-run by default and appends no immutable receipt', async () => {
    const root = fixture();
    await run(root, ['task', 'settle', 'run-1', '--json']);

    expect(lastJson()).toMatchObject({
      schemaVersion: 1,
      command: 'task.settle',
      mode: 'dry-run',
      taskId: 'run-1',
      decision: 'hold',
      reasonCode: 'attestation-required',
      requestedPreDispatchReasonCode: null,
      settledPreDispatchReasonCode: null,
      rawStatus: 'PENDING',
      effectiveStatus: 'PENDING',
      applied: false,
      receiptRef: null,
    });

    const ledger = new InvocationReceiptStore(root);
    expect(ledger.scanTaskReceipts({
      tenantId: 'local',
      projectId: ledger.projectId,
      taskId: 'run-1',
    })).toEqual([]);
    ledger.close();
  });

  it('evaluates an explicit attestation without mutation when --apply is absent', async () => {
    const root = fixture();
    await run(root, [
      'task', 'settle', 'run-1',
      '--operator', 'operator@example.test',
      '--attestation-reason', 'reviewed bounded absence evidence',
      '--json',
    ]);

    expect(lastJson()).toMatchObject({
      mode: 'dry-run',
      decision: 'eligible',
      reasonCode: 'legacy-attestation-verified',
      applied: false,
    });
    const ledger = new InvocationReceiptStore(root);
    expect(ledger.scanTaskReceipts({
      tenantId: 'local',
      projectId: ledger.projectId,
      taskId: 'run-1',
    })).toEqual([]);
    ledger.close();
  });

  it('requires both attestation flags before --apply and never opens authority', async () => {
    const root = fixture();
    const openAuthority = vi.fn(productionOpener);
    const program = new Command();
    program.exitOverride();
    registerTaskSettlement(program, {
      resolveProjectRootFn: () => root,
      openAuthority,
    });

    await program.parseAsync([
      'node', 'deckent', 'task', 'settle', 'run-1',
      '--apply',
      '--operator', 'operator-1',
    ]);

    expect(openAuthority).not.toHaveBeenCalled();
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('rejects an untyped or sentinel pre-dispatch reason before opening authority', async () => {
    const root = fixture();
    const openAuthority = vi.fn(productionOpener);
    const program = new Command();
    program.exitOverride();
    registerTaskSettlement(program, {
      resolveProjectRootFn: () => root,
      openAuthority,
    });

    await program.parseAsync([
      'node', 'deckent', 'task', 'settle', 'run-1',
      '--apply',
      '--operator', 'operator-1',
      '--attestation-reason', 'reviewed',
      '--reason-code', 'legacy_operator_attestation',
    ]);

    expect(openAuthority).not.toHaveBeenCalled();
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('not an allowed pre-dispatch reason'),
      }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('requires a typed reason only for a declared eventless receipt', async () => {
    const root = fixture();
    declareEventlessReceipt(root);

    await run(root, [
      'task', 'settle', 'run-1',
      '--apply',
      '--operator', 'operator-1',
      '--attestation-reason', 'reviewed',
      '--json',
    ]);

    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('--reason-code is required'),
      }),
    );
    const ledger = new InvocationReceiptStore(root);
    const views = ledger.scanTaskReceipts({
      tenantId: 'local',
      projectId: ledger.projectId,
      taskId: 'run-1',
    });
    expect(views).toHaveLength(1);
    expect(views[0]!.events).toEqual([]);
    ledger.close();
  });

  it('settles and idempotently replays a declared eventless receipt with a typed reason', async () => {
    const root = fixture();
    const invocationId = declareEventlessReceipt(root);
    const rawOperator = 'operator-private@example.test';
    const rawAttestation = 'private operator statement that must never persist';
    const command = [
      'task', 'settle', 'run-1',
      '--apply',
      '--operator', rawOperator,
      '--attestation-reason', rawAttestation,
      '--reason-code', 'provider_authority_rejected',
      '--json',
    ];

    await run(root, command);

    expect(lastJson()).toMatchObject({
      mode: 'apply',
      applied: true,
      decision: 'already-settled',
      requestedPreDispatchReasonCode: 'provider_authority_rejected',
      settledPreDispatchReasonCode: 'provider_authority_rejected',
      effectiveStatus: 'NOT_DISPATCHED',
      receiptRef: { invocationId },
    });
    let ledger = new InvocationReceiptStore(root);
    let views = ledger.scanTaskReceipts({
      tenantId: 'local',
      projectId: ledger.projectId,
      taskId: 'run-1',
    });
    expect(views).toHaveLength(1);
    expect(views[0]!.events).toHaveLength(2);
    expect(views[0]!.events[0]).toMatchObject({
      type: 'dispatch_rejected',
      payload: { reasonCode: 'provider_authority_rejected' },
    });
    const serialized = JSON.stringify(views);
    expect(serialized).not.toContain(rawOperator);
    expect(serialized).not.toContain(rawAttestation);
    ledger.close();

    vi.clearAllMocks();
    const conflictingReplay = command.map(value =>
      value === 'provider_authority_rejected' ? 'fallback_exhausted' : value);
    await run(root, conflictingReplay);

    expect(lastJson()).toMatchObject({
      applied: false,
      decision: 'already-settled',
      requestedPreDispatchReasonCode: 'fallback_exhausted',
      settledPreDispatchReasonCode: null,
      effectiveStatus: 'NOT_DISPATCHED',
    });
    ledger = new InvocationReceiptStore(root);
    views = ledger.scanTaskReceipts({
      tenantId: 'local',
      projectId: ledger.projectId,
      taskId: 'run-1',
    });
    expect(views[0]!.events).toHaveLength(2);
    expect(views[0]!.events[0]).toMatchObject({
      type: 'dispatch_rejected',
      payload: { reasonCode: 'provider_authority_rejected' },
    });
    ledger.close();
  });

  it('atomically settles legacy absence while preserving raw task JSON', async () => {
    const root = fixture();
    const taskPath = join(root, '.tasks', 'task-run-1.json');
    const before = readFileSync(taskPath, 'utf-8');

    await run(root, [
      'task', 'settle', 'run-1',
      '--apply',
      '--operator', 'operator@example.test',
      '--attestation-reason', 'reviewed bounded absence evidence',
      '--json',
    ]);

    const dto = lastJson();
    expect(dto).toMatchObject({
      mode: 'apply',
      decision: 'already-settled',
      effectiveStatus: 'NOT_DISPATCHED',
      applied: true,
    });
    expect(dto.receiptRef?.invocationId).toMatch(/^legacy-settlement:/);
    expect(readFileSync(taskPath, 'utf-8')).toBe(before);

    const projectionHandle = openTaskSettlementProjection(root);
    const projection = projectionHandle.projectTaskExecutionState('run-1', 'PENDING');
    expect(projection).toMatchObject({
      rawStatus: 'PENDING',
      effectiveStatus: 'NOT_DISPATCHED',
    });
    const ledger = new InvocationReceiptStore(root);
    const views = ledger.scanTaskReceipts({
      tenantId: 'local',
      projectId: ledger.projectId,
      taskId: 'run-1',
    });
    expect(views).toHaveLength(1);
    const serialized = JSON.stringify(views);
    expect(serialized).not.toContain('operator@example.test');
    expect(serialized).not.toContain('reviewed bounded absence evidence');
    ledger.close();
    projectionHandle.close();
  });

  it.each([
    ['461-001', { sprintId: 'sprint-461' }],
    ['xv-1785188583830-xverify', { type: 'audit' }],
  ])(
    'canonically settles planned %s without mutating its raw task projection',
    async (taskId, overrides) => {
      const root = fixture();
      const taskPath = writePendingTask(root, taskId, overrides);
      const before = readFileSync(taskPath, 'utf-8');

      await run(root, [
        'task', 'settle', taskId,
        '--apply',
        '--operator', 'owner-1',
        '--attestation-reason', 'planned projection was never dispatched',
        '--reason-code', 'execution_admission_rejected',
        '--json',
      ]);

      expect(lastJson()).toMatchObject({
        taskId,
        applied: true,
        decision: 'already-settled',
        effectiveStatus: 'NOT_DISPATCHED',
        settledPreDispatchReasonCode: 'execution_admission_rejected',
      });
      expect(readFileSync(taskPath, 'utf-8')).toBe(before);

      const ledger = new InvocationReceiptStore(root);
      expect(ledger.scanTaskReceipts({
        tenantId: 'local',
        projectId: ledger.projectId,
        taskId,
      })).toHaveLength(1);
      ledger.close();
    },
  );

  it('optionally preserves a precise typed cause for legacy settlement without raw operator text', async () => {
    const root = fixture();
    const rawOperator = 'legacy-private-operator';
    const rawStatement = 'private legacy investigation statement';

    await run(root, [
      'task', 'settle', 'run-1',
      '--apply',
      '--operator', rawOperator,
      '--attestation-reason', rawStatement,
      '--reason-code', 'budget_capability_unsupported',
      '--json',
    ]);

    expect(lastJson()).toMatchObject({
      applied: true,
      requestedPreDispatchReasonCode: 'budget_capability_unsupported',
      settledPreDispatchReasonCode: 'budget_capability_unsupported',
      effectiveStatus: 'NOT_DISPATCHED',
    });
    const ledger = new InvocationReceiptStore(root);
    const views = ledger.scanTaskReceipts({
      tenantId: 'local',
      projectId: ledger.projectId,
      taskId: 'run-1',
    });
    expect(views[0]!.events[0]).toMatchObject({
      type: 'dispatch_rejected',
      payload: { reasonCode: 'budget_capability_unsupported' },
    });
    const serialized = JSON.stringify(views);
    expect(serialized).not.toContain(rawOperator);
    expect(serialized).not.toContain(rawStatement);
    ledger.close();
  });

  it('uses one attestation snapshot and one apply re-check without a third probe', async () => {
    const root = fixture();
    const inspect = vi.fn(async (input: { taskId: string }) =>
      absenceSnapshot(input.taskId, 'stable'));
    const openAuthority = (projectRoot: string): OpenTaskSettlementAuthorityResult =>
      productionOpener(projectRoot, inspect);
    const program = new Command();
    program.exitOverride();
    registerTaskSettlement(program, {
      resolveProjectRootFn: () => root,
      openAuthority,
      now: () => '2026-07-27T11:00:00.000Z',
    });

    await program.parseAsync([
      'node', 'deckent', 'task', 'settle', 'run-1',
      '--apply',
      '--operator', 'operator-1',
      '--attestation-reason', 'stable bounded evidence',
      '--json',
    ]);

    expect(inspect).toHaveBeenCalledTimes(2);
    expect(lastJson()).toMatchObject({
      applied: true,
      effectiveStatus: 'NOT_DISPATCHED',
    });
  });

  it('fails closed when absence evidence drifts during the apply re-check', async () => {
    const root = fixture();
    let revision = 0;
    const inspect = vi.fn(async (input: { taskId: string }) =>
      absenceSnapshot(input.taskId, revision++ === 0 ? 'first' : 'drifted'));
    const openAuthority = (projectRoot: string): OpenTaskSettlementAuthorityResult =>
      productionOpener(projectRoot, inspect);
    const program = new Command();
    program.exitOverride();
    registerTaskSettlement(program, {
      resolveProjectRootFn: () => root,
      openAuthority,
      now: () => '2026-07-27T11:00:00.000Z',
    });

    await program.parseAsync([
      'node', 'deckent', 'task', 'settle', 'run-1',
      '--apply',
      '--operator', 'operator-1',
      '--attestation-reason', 'stable bounded evidence',
      '--json',
    ]);

    expect(inspect).toHaveBeenCalledTimes(2);
    expect(lastJson()).toMatchObject({
      applied: false,
      decision: 'hold',
      reasonCode: 'attestation-evidence-mismatch',
      effectiveStatus: 'PENDING',
    });
    const ledger = new InvocationReceiptStore(root);
    expect(ledger.scanTaskReceipts({
      tenantId: 'local',
      projectId: ledger.projectId,
      taskId: 'run-1',
    })).toEqual([]);
    ledger.close();
  });

  it('rejects traversal-like task identifiers before any file read', async () => {
    const root = fixture();
    await run(root, ['task', 'settle', '../run-1', '--json']);
    expect(printError).toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('never settles a normal Docker dispatch from a public result projection', async () => {
    const root = fixture();
    const opened = productionOpener(root);
    const declaration = opened.authority.declareTaskExecution({
      tenantId: 'local',
      projectId: opened.projectId,
      taskId: 'run-1',
      runId: 'run-1',
      provider: 'claude',
      model: 'claude-sonnet-5',
      executionBackend: 'docker',
      createdAt: '2026-07-27T10:00:00.000Z',
    });
    opened.authority.markDispatchStarted({
      tenantId: 'local',
      projectId: opened.projectId,
      invocationId: declaration.receiptRef.invocationId,
      attempt: 1,
      executionEvidenceRef: 'public-result-must-not-authorize',
      calledProvider: 'claude',
      calledModel: 'claude-sonnet-5',
      occurredAt: '2026-07-27T10:01:00.000Z',
    });
    opened.close();
    writeFileSync(join(root, '.tasks', 'task-run-1.result'), JSON.stringify({
      taskId: 'run-1',
      selfAssessment: 'DONE',
    }));

    await run(root, ['task', 'settle', 'run-1', '--from-result', '--json']);

    expect(lastJson()).toMatchObject({
      applied: false,
      decision: 'hold',
      reasonCode: 'unsupported-task-domain',
      effectiveStatus: 'PENDING',
    });
    const ledger = new InvocationReceiptStore(root);
    const view = ledger.get(declaration.receiptRef, declaration.receiptRef.invocationId);
    expect(view?.events.map(event => event.type)).toEqual(['dispatch_started']);
    ledger.close();
  });
});
