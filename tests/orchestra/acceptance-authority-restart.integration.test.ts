import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  acceptanceConfirmationDigest,
  deriveAcceptanceConfirmationId,
  type AcceptanceConfirmationLineage,
} from '../../src/core/acceptance-confirmation-contract.js';
import {
  captureCrossVerifyEvidenceSnapshotAtomic,
  claimCrossVerifyEvidenceSnapshotAtomic,
  crossVerifyVerdictReceiptRef,
  readCrossVerifyVerdictReceipt,
  writeCrossVerifyVerdictReceiptAtomic,
} from '../../src/core/cross-verify-evidence-broker.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import { createAcceptanceConfirmationRequest, settleConfirmation } from '../../src/core/confirmation-store.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { AcceptanceReconciliationStore } from '../../src/core/acceptance-reconciliation-store.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRefForAttempt,
  taskResultSettlementActiveClaimDigest,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementPreparedAtomic,
} from '../../src/core/task-result-settlement.js';
import { openAcceptanceConfirmationComposition } from '../../src/orchestra/acceptance-confirmation-composition.js';
import { openAcceptanceConfirmationReconciler } from '../../src/orchestra/acceptance-confirmation-reconciler.js';
import type { AcceptanceRouteRecord } from '../../src/orchestra/acceptance-confirmation-service.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;
const at = new Date('2026-08-22T12:00:00.000Z');
const clock = () => at;
const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
const brokerKey = 'restart-human-broker-mac-key-32-bytes-minimum';
const digest = (value: string): string => acceptanceConfirmationDigest(value);

interface Fixture {
  readonly root: string;
  readonly route: AcceptanceRouteRecord;
}

function fixture(seed: string, projectId = 'project-a'): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'acceptance-authority-restart-'));
  roots.push(root);
  mkdirSync(join(root, '.brain'), { recursive: true });
  new MemoryStore(join(root, '.brain', 'memory.db')).close();
  const lineage: AcceptanceConfirmationLineage = {
    tenantId: 'tenant-a', projectId, sprintId: 'sprint-619', taskId: `task-${seed}`,
    attemptId: `attempt-${seed}`, generation: 1,
    evaluationDigest: digest(`evaluation:${seed}`), resultDigest: digest(`result:${seed}`),
    policyDigest: digest('policy'), sourceDigest: digest(`source:${seed}`),
  };
  const confirmationId = deriveAcceptanceConfirmationId(lineage);
  createAcceptanceConfirmationRequest(root, {
    sprintId: lineage.sprintId, taskId: lineage.taskId, itemIds: ['release-owner'],
    kind: 'security', verdict: 'UNDECIDABLE', adapter: 'human',
    statements: ['release owner confirms acceptance'], evidenceRequirements: ['authority receipt'],
    requestedAt: at.toISOString(), source: 'acceptance-matrix',
    identity: {
      attemptId: lineage.attemptId, generation: lineage.generation, sourceDigest: lineage.sourceDigest,
      evidenceDigest: digest(`evidence:${seed}`), revisionDigest: digest(`revision:${seed}`),
    },
    acceptanceLineage: lineage,
  }, { tenantId: lineage.tenantId, projectId, lifecycle, clock });
  return { root, route: { confirmationId, lineage, sourceVerdict: 'UNDECIDABLE' } };
}

function brokerReceipt(confirmationId: string): string {
  return `broker-mac:v1:${createHmac('sha256', brokerKey)
    .update(`${confirmationId}:CONFIRMED`).digest('hex')}`;
}

function verifyBroker(input: {
  confirmationId: string; verdict: 'CONFIRMED' | 'FAILED'; authorityReceipt: string;
}): boolean {
  const expected = Buffer.from(input.verdict === 'CONFIRMED' ? brokerReceipt(input.confirmationId) : '');
  const actual = Buffer.from(input.authorityReceipt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function typedHostReceipt(f: Fixture): {
  readonly receiptRef: string;
  readonly verify: (input: {
    confirmationId: string; verdict: 'CONFIRMED' | 'FAILED'; authorityReceipt: string;
  }) => boolean;
} {
  const stateRoot = mkdtempSync(join(tmpdir(), 'acceptance-host-authority-'));
  roots.push(stateRoot);
  process.env.DECKENT_HOME = stateRoot;
  writeFileSync(join(f.root, 'authority-evidence.txt'), `${f.route.confirmationId}\n`);
  const settlementRef = createTaskResultSettlementRefForAttempt(
    f.root, f.route.lineage.taskId, randomUUID(),
  );
  writeTaskResultSettlementAttemptAtomic(settlementRef, '2026-08-22T11:59:55.000Z');
  claimTaskResultSettlementAttemptAtomic(settlementRef, '2026-08-22T11:59:56.000Z');
  const claim = claimCrossVerifyEvidenceSnapshotAtomic({
    projectRoot: f.root, settlementRef,
    fenceTokenHash: taskResultSettlementActiveClaimDigest(settlementRef),
    relativePaths: ['authority-evidence.txt'],
  });
  const evidence = captureCrossVerifyEvidenceSnapshotAtomic({
    projectRoot: f.root, settlementRef, claim,
  });
  writeTaskResultSettlementPreparedAtomic(settlementRef, 'different-provider-verifier');
  writeTaskResultSettlementDispatchAtomic(settlementRef, 'd'.repeat(64), '2026-08-22T11:59:57.000Z');
  writeTaskResultSettlementAtomic(createTaskResultSettlement({
    ref: settlementRef, exitCode: 0, settledAt: '2026-08-22T11:59:58.000Z',
    result: { taskId: settlementRef.taskId, selfAssessment: 'DONE' },
  }));
  writeTaskResultSettlementClosureAtomic(settlementRef, {
    containerDisposition: 'stopped-removed', locksReleased: true,
  });
  const verdict = writeCrossVerifyVerdictReceiptAtomic({
    projectRoot: f.root, settlementRef, claimSha256: claim.claimSha256,
    evidenceManifestSha256: evidence.manifestSha256, effectiveVerdict: 'CONFIRMED',
    disposition: 'allow', adjudicationReceiptSha256: createHash('sha256')
      .update(f.route.confirmationId).digest('hex'),
    outputSha256: createHash('sha256').update(`CONFIRMED:${f.route.confirmationId}`).digest('hex'),
    outputByteLength: f.route.confirmationId.length,
  });
  const receiptRef = crossVerifyVerdictReceiptRef(verdict);
  return {
    receiptRef,
    verify: input => {
      const durable = readCrossVerifyVerdictReceipt(f.root, settlementRef);
      return input.confirmationId === f.route.confirmationId
        && input.verdict === 'CONFIRMED'
        && input.authorityReceipt === receiptRef
        && durable?.receipt.assurance === 'typed-host-adjudicated'
        && durable.receipt.effectiveVerdict === input.verdict
        && durable.receipt.disposition === 'allow';
    },
  };
}

function receipts(f: Fixture) {
  const store = new AcceptanceReconciliationStore(f.root, { adoptLegacy: false });
  try {
    return store.readTenantPage({
      tenantId: f.route.lineage.tenantId, projectId: f.route.lineage.projectId, limit: 10,
    }).receipts;
  } finally {
    store.close();
  }
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('acceptance authority restart production composition', () => {
  it.each(['human-broker-mac', 'llm-typed-host-receipt'] as const)(
    'restarts after a bound %s decision and durably reaches PREPARED, debt CAS, APPLIED and audit',
    async authorityKind => {
      const f = fixture(authorityKind);
      const authority = authorityKind === 'human-broker-mac'
        ? { receipt: brokerReceipt(f.route.confirmationId), verify: verifyBroker }
        : (() => { const host = typedHostReceipt(f); return { receipt: host.receiptRef, verify: host.verify }; })();
      const producer = openAcceptanceConfirmationComposition({
        projectRoot: f.root, tenantId: f.route.lineage.tenantId,
        projectId: f.route.lineage.projectId, lifecycle, clock, verifyAuthority: authority.verify,
      });
      await expect(producer.createAndRoute(f.route)).resolves.toMatchObject({
        state: 'HOLD', reasonCode: 'VERIFIED_DECISION_UNAVAILABLE',
      });
      producer.close();
      settleConfirmation(f.root, f.route.confirmationId, {
        verdict: 'CONFIRMED', decidedBy: 'human',
        reason: 'authority-bound acceptance', receipt: authority.receipt, decidedAt: at.toISOString(),
      }, { lifecycle, clock });

      const restarted = openAcceptanceConfirmationReconciler({
        projectRoot: f.root, tenantId: f.route.lineage.tenantId,
        projectId: f.route.lineage.projectId, lifecycle, clock, verifyAuthority: authority.verify,
      });
      await expect(restarted.run({ limit: 1 })).resolves.toMatchObject({
        scanned: 1, reconciled: 1, observations: [],
      });
      restarted.close();

      expect(receipts(f).map(result => result.state === 'FOUND' ? result.receipt.state : 'HOLD'))
        .toEqual(['PREPARED', 'APPLIED']);
      const memory = new MemoryStore(join(f.root, '.brain', 'memory.db'));
      const debtId = `debt-${f.route.confirmationId}`;
      expect(memory.getById(debtId, { tenantId: f.route.lineage.tenantId }))
        .toMatchObject({ status: 'resolved', tenant_id: f.route.lineage.tenantId });
      expect(memory.getHistory(debtId).map(row => row.field)).toEqual(['*', 'status', 'metadata']);
      memory.close();

      const duplicateTick = openAcceptanceConfirmationReconciler({
        projectRoot: f.root, tenantId: f.route.lineage.tenantId,
        projectId: f.route.lineage.projectId, lifecycle, clock, verifyAuthority: authority.verify,
      });
      await expect(duplicateTick.run({ limit: 1 })).resolves.toMatchObject({
        scanned: 1, reconciled: 0,
        observations: [{ kind: 'APPLIED', confirmationId: f.route.confirmationId }],
      });
      duplicateTick.close();
      expect(receipts(f)).toHaveLength(2);
    },
  );

  it('returns typed HOLD for a corrupt authority binding and does not leak across project authority', async () => {
    const own = fixture('corrupt-binding');
    const foreign = fixture('foreign-binding', 'project-b');
    const producer = openAcceptanceConfirmationComposition({
      projectRoot: own.root, tenantId: 'tenant-a', projectId: 'project-a',
      lifecycle, clock, verifyAuthority: verifyBroker,
    });
    await producer.createAndRoute(own.route);
    settleConfirmation(own.root, own.route.confirmationId, {
      verdict: 'CONFIRMED', decidedBy: 'human', reason: 'receipt belongs to another confirmation',
      receipt: brokerReceipt(foreign.route.confirmationId), decidedAt: at.toISOString(),
    }, { lifecycle, clock });
    await expect(producer.settle(own.route.confirmationId)).resolves.toEqual({
      state: 'DENIED', reasonCode: 'AUTHORITY_VERIFICATION_FAILED',
      receiptRef: `${own.route.confirmationId}:prepared`,
    });
    await expect(producer.createAndRoute(foreign.route)).resolves.toMatchObject({
      state: 'HOLD', reasonCode: 'COMPOSITION_AUTHORITY_MISMATCH',
    });
    producer.close();
    expect(receipts(own)).toHaveLength(0);
    const memory = new MemoryStore(join(own.root, '.brain', 'memory.db'));
    expect(memory.getById(`debt-${own.route.confirmationId}`, { tenantId: 'tenant-a' }))
      .toMatchObject({ status: 'active' });
    expect(memory.getById(`debt-${foreign.route.confirmationId}`, { tenantId: 'tenant-a' })).toBeNull();
    memory.close();
  });
});
