import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acceptanceConfirmationDigest,
  deriveAcceptanceConfirmationId,
  type AcceptanceConfirmationLineage,
  type AcceptanceConfirmationReceipt,
} from '../../src/core/acceptance-confirmation-contract.js';
import {
  ACCEPTANCE_RECONCILIATION_MAX_PAGE_SIZE,
  openAcceptanceConfirmationReconciler,
  runAcceptanceConfirmationReconciliation,
  type AcceptanceReceiptState,
  type IndexedAcceptanceConfirmation,
} from '../../src/orchestra/acceptance-confirmation-reconciler.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import { createAcceptanceConfirmationRequest, settleConfirmation } from '../../src/core/confirmation-store.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { openAcceptanceConfirmationComposition } from '../../src/orchestra/acceptance-confirmation-composition.js';
import type {
  AcceptanceConfirmationPort,
  AcceptanceDebtPort,
  AcceptanceReconciliationPort,
  AcceptanceRouteRecord,
  VerifiedAcceptanceDecision,
} from '../../src/orchestra/acceptance-confirmation-service.js';

const hash = (value: string) => acceptanceConfirmationDigest(value);
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function makeRoute(seed: string): AcceptanceRouteRecord {
  const lineage: AcceptanceConfirmationLineage = {
    tenantId: 'tenant-a', projectId: 'project-a', attemptId: `attempt-${seed}`, generation: 1,
    sprintId: 'sprint-617', taskId: `task-${seed}`, evaluationDigest: hash(`evaluation-${seed}`),
    resultDigest: hash(`result-${seed}`), policyDigest: hash(`policy-${seed}`), sourceDigest: hash(`source-${seed}`),
  };
  return { confirmationId: deriveAcceptanceConfirmationId(lineage), lineage, sourceVerdict: 'UNDECIDABLE' };
}

function harness(
  rows: readonly IndexedAcceptanceConfirmation[],
  routes: readonly AcceptanceRouteRecord[],
  initial: Record<string, AcceptanceReceiptState> = {},
  nextCursor: string | null = null,
) {
  const byId = new Map(routes.map(route => [route.confirmationId, route]));
  const states = new Map(Object.entries(initial));
  const receipts = new Map<string, AcceptanceConfirmationReceipt>();
  const transitions: string[] = [];
  const confirmations: AcceptanceConfirmationPort = {
    createFirstWriterWins: vi.fn(),
    readFresh: vi.fn(async id => {
      const route = byId.get(id); if (!route) return undefined;
      const decision: VerifiedAcceptanceDecision = {
        confirmationId: id, lineage: route.lineage, verdict: 'CONFIRMED',
        decidedAt: '2026-08-22T10:00:00.000Z', authorityReceipt: `signed-${id}`,
      };
      return { route, decision };
    }),
  };
  const debts: AcceptanceDebtPort = {
    createFirstWriterWins: vi.fn(),
    transitionExact: vi.fn(async input => { transitions.push(input.route.confirmationId); return 'applied'; }),
  };
  const receiptPort: AcceptanceReconciliationPort = {
    appendFirstWriterWins: vi.fn(async receipt => {
      const key = `${receipt.confirmationId}:${receipt.state}`;
      const found = receipts.get(key);
      if (found) return { state: 'replayed' as const, receipt: found };
      receipts.set(key, structuredClone(receipt));
      states.set(receipt.confirmationId, receipt.state);
      return { state: 'created' as const, receipt };
    }),
    read: vi.fn(async (id, state) => receipts.get(`${id}:${state}`)),
  };
  const confirmationsIndex = { scanTenantPartition: vi.fn(async () => ({ rows, nextCursor })) };
  const receiptStates = {
    readTenantPage: vi.fn(async ({ tenantId, confirmationIds }: {
      tenantId: string; confirmationIds: readonly string[];
    }) => confirmationIds.flatMap(confirmationId => {
      const state = states.get(confirmationId) ?? 'MISSING';
      return state === 'APPLIED'
        ? [{ tenantId, confirmationId, state: 'PREPARED' as const }, { tenantId, confirmationId, state }]
        : [{ tenantId, confirmationId, state }];
    })),
  };
  return {
    deps: {
      confirmations: confirmationsIndex, receiptStates,
      service: { confirmations, debts, receipts: receiptPort, verifyAuthority: vi.fn(() => true) },
    },
    confirmationsIndex, receiptStates, states, transitions,
  };
}

describe('acceptance confirmation restart reconciler', () => {
  it('drains and replay-skips a bounded keyset through the default production composition', async () => {
    const root = mkdtempSync(join(tmpdir(), 'acceptance-reconciler-')); roots.push(root);
    mkdirSync(join(root, '.brain'), { recursive: true });
    new MemoryStore(join(root, '.brain', 'memory.db')).close();
    const route = makeRoute('production');
    const clock = () => new Date('2026-08-22T12:00:00.000Z');
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    createAcceptanceConfirmationRequest(root, {
      sprintId: route.lineage.sprintId, taskId: route.lineage.taskId, itemIds: ['owner'], kind: 'security',
      verdict: 'UNDECIDABLE', adapter: 'human', statements: ['owner confirmation'], evidenceRequirements: ['receipt'],
      requestedAt: clock().toISOString(), source: 'acceptance-matrix',
      identity: { attemptId: route.lineage.attemptId, generation: route.lineage.generation,
        sourceDigest: route.lineage.sourceDigest, evidenceDigest: hash('evidence'), revisionDigest: hash('revision') },
      acceptanceLineage: route.lineage,
    }, { tenantId: 'tenant-a', projectId: 'project-a', lifecycle, clock });

    const authority = { projectRoot: root, tenantId: 'tenant-a', projectId: 'project-a', lifecycle, clock,
      verifyAuthority: () => true } as const;
    const producer = openAcceptanceConfirmationComposition(authority);
    await expect(producer.createAndRoute(route)).resolves.toMatchObject({
      state: 'HOLD', reasonCode: 'VERIFIED_DECISION_UNAVAILABLE',
    });
    producer.close();
    const prepare = openAcceptanceConfirmationReconciler({ projectRoot: root, tenantId: 'tenant-a',
      projectId: 'project-a', lifecycle, clock, verifyAuthority: () => true });
    // Pending rows are not candidates for the settled-only restart drain.
    await expect(prepare.run({ limit: 1 })).resolves.toMatchObject({ scanned: 0, reconciled: 0 });
    prepare.close();
    settleConfirmation(root, route.confirmationId, { verdict: 'CONFIRMED', decidedBy: 'human', reason: 'approved',
      receipt: 'authority-receipt', decidedAt: clock().toISOString() }, { lifecycle, clock });

    const first = openAcceptanceConfirmationReconciler({ projectRoot: root, tenantId: 'tenant-a',
      projectId: 'project-a', lifecycle, clock, verifyAuthority: () => true });
    await expect(first.run({ limit: 1 })).resolves.toMatchObject({ scanned: 1, reconciled: 1, exhausted: true });
    first.close();

    const restart = openAcceptanceConfirmationReconciler({ projectRoot: root, tenantId: 'tenant-a',
      projectId: 'project-a', lifecycle, clock, verifyAuthority: () => true });
    const replay = await restart.run({ limit: 1 });
    expect(replay).toMatchObject({ scanned: 1, reconciled: 0, exhausted: true });
    expect(replay.observations).toContainEqual({ kind: 'APPLIED', confirmationId: route.confirmationId });
    restart.close();
  });
  it('drains terminal candidates once and coalesces receipt projections across restart replay', async () => {
    const a = makeRoute('a'); const b = makeRoute('b');
    const h = harness([
      { tenantId: 'tenant-a', confirmationId: b.confirmationId, terminalState: 'TERMINAL' },
      { tenantId: 'tenant-a', confirmationId: a.confirmationId, terminalState: 'TERMINAL' },
      { tenantId: 'tenant-a', confirmationId: b.confirmationId, terminalState: 'TERMINAL' },
    ], [a, b], { [b.confirmationId]: 'PREPARED' });

    await expect(runAcceptanceConfirmationReconciliation(h.deps, { tenantId: 'tenant-a', limit: 3 }))
      .resolves.toMatchObject({ reconciled: 2, scanned: 3, exhausted: true });
    expect(h.transitions).toEqual([a.confirmationId, b.confirmationId].sort());
    expect(h.states.get(a.confirmationId)).toBe('APPLIED');
    expect(h.states.get(b.confirmationId)).toBe('APPLIED');

    const restart = await runAcceptanceConfirmationReconciliation(h.deps, { tenantId: 'tenant-a', limit: 3 });
    expect(restart.reconciled).toBe(0);
    expect(restart.observations.filter(row => row.kind === 'APPLIED')).toHaveLength(2);
    expect(h.transitions).toHaveLength(2);
  });

  it('keeps non-terminal, corrupt, foreign, and applied observations typed and effect-free', async () => {
    const done = makeRoute('done');
    const h = harness([
      { tenantId: 'tenant-a', confirmationId: 'pending', terminalState: 'PENDING' },
      { tenantId: 'tenant-a', confirmationId: 'unclear', terminalState: 'UNCLEAR' },
      { tenantId: 'tenant-a', confirmationId: 'bad', terminalState: 'CORRUPT' },
      { tenantId: 'tenant-b', confirmationId: 'foreign', terminalState: 'TERMINAL' },
      { tenantId: 'tenant-a', confirmationId: done.confirmationId, terminalState: 'TERMINAL' },
    ], [done], { [done.confirmationId]: 'APPLIED' });

    const result = await runAcceptanceConfirmationReconciliation(h.deps, { tenantId: 'tenant-a', limit: 5 });
    expect(result.reconciled).toBe(0);
    expect(result.observations).toEqual(expect.arrayContaining([
      { kind: 'PENDING', confirmationId: 'pending' },
      { kind: 'UNCLEAR', confirmationId: 'unclear' },
      { kind: 'CORRUPT', confirmationId: 'bad' },
      { kind: 'FOREIGN_TENANT', confirmationId: 'foreign', observedTenantId: 'tenant-b' },
      { kind: 'APPLIED', confirmationId: done.confirmationId },
    ]));
    expect(h.transitions).toEqual([]);
  });

  it('uses a bounded tenant keyset and rejects cursor regression before effects', async () => {
    const own = makeRoute('own');
    const h = harness([
      { tenantId: 'tenant-a', confirmationId: own.confirmationId, terminalState: 'TERMINAL' },
    ], [own], {}, 'tenant-a/2');
    const result = await runAcceptanceConfirmationReconciliation(h.deps, {
      tenantId: 'tenant-a', cursor: 'tenant-a/1', limit: 1,
    });
    expect(h.confirmationsIndex.scanTenantPartition).toHaveBeenCalledWith({
      tenantId: 'tenant-a', after: 'tenant-a/1', limit: 1,
    });
    expect(result).toMatchObject({ cursor: 'tenant-a/2', exhausted: false, scanned: 1 });

    const stalled = harness([], [], {}, 'tenant-a/1');
    await expect(runAcceptanceConfirmationReconciliation(stalled.deps, {
      tenantId: 'tenant-a', cursor: 'tenant-a/1', limit: 1,
    })).rejects.toThrow('non-monotonic cursor');
    expect(stalled.receiptStates.readTenantPage).not.toHaveBeenCalled();
  });

  it('rejects unbounded and oversized pages before mutation', async () => {
    const empty = harness([], []);
    await expect(runAcceptanceConfirmationReconciliation(empty.deps, {
      tenantId: 'tenant-a', limit: ACCEPTANCE_RECONCILIATION_MAX_PAGE_SIZE + 1,
    })).rejects.toThrow('limit must be');
    expect(empty.confirmationsIndex.scanTenantPartition).not.toHaveBeenCalled();

    const routes = [makeRoute('0'), makeRoute('1'), makeRoute('2')];
    const oversized = harness(routes.map(route => ({
      tenantId: 'tenant-a', confirmationId: route.confirmationId, terminalState: 'TERMINAL' as const,
    })), routes);
    await expect(runAcceptanceConfirmationReconciliation(oversized.deps, { tenantId: 'tenant-a', limit: 2 }))
      .rejects.toThrow('exceeded its bounded page');
    expect(oversized.transitions).toEqual([]);
  });

  it('propagates a typed HOLD without uncertain closure', async () => {
    const route = makeRoute('hold');
    const h = harness([
      { tenantId: 'tenant-a', confirmationId: route.confirmationId, terminalState: 'TERMINAL' },
    ], [route]);
    vi.mocked(h.deps.service.confirmations.readFresh).mockResolvedValue(undefined);
    const result = await runAcceptanceConfirmationReconciliation(h.deps, { tenantId: 'tenant-a', limit: 1 });
    expect(result).toMatchObject({ reconciled: 0, held: 1 });
    expect(result.outcomes[0]?.result).toEqual({
      state: 'HOLD', reasonCode: 'VERIFIED_DECISION_UNAVAILABLE',
      receiptRef: `${route.confirmationId}:prepared`,
    });
    expect(h.transitions).toEqual([]);
  });
});
