import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acceptanceConfirmationDigest,
  deriveAcceptanceConfirmationId,
  type AcceptanceConfirmationLineage,
} from '../../src/core/acceptance-confirmation-contract.js';
import { ApprovalBroker } from '../../src/core/approval-broker.js';
import { AcceptanceReconciliationStore } from '../../src/core/acceptance-reconciliation-store.js';
import type { FederatedPendingItem } from '../../src/core/approval-inbox-federation.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import {
  createAcceptanceConfirmationRequest,
  listAcceptanceConfirmationCandidatesReadOnly,
} from '../../src/core/confirmation-store.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { openAcceptanceConfirmationComposition } from '../../src/orchestra/acceptance-confirmation-composition.js';
import { openAcceptanceConfirmationReconciler } from '../../src/orchestra/acceptance-confirmation-reconciler.js';
import { mirrorFederatedItemToBroker } from '../../src/orchestra/approval-decision-federation.js';
import type { AcceptanceRouteRecord } from '../../src/orchestra/acceptance-confirmation-service.js';

const roots: string[] = [];
const now = new Date('2026-08-22T10:00:00.000Z');
const clock = () => now;
const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
const brokerKey = 'acceptance-all-surface-broker-key-32-bytes-minimum';
const digest = (value: string): string => acceptanceConfirmationDigest(value);

function authorityReceipt(confirmationId: string, verdict: 'CONFIRMED' | 'FAILED'): string {
  return 'broker-mac:v1:' + createHmac('sha256', brokerKey)
    .update(confirmationId + ':' + verdict).digest('hex');
}
function verifyAuthority(input: {
  confirmationId: string; verdict: 'CONFIRMED' | 'FAILED'; authorityReceipt: string;
}): boolean {
  const expected = Buffer.from(authorityReceipt(input.confirmationId, input.verdict));
  const actual = Buffer.from(input.authorityReceipt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function fixture(tenantId = 'tenant-a') {
  const root = mkdtempSync(join(tmpdir(), 'acceptance-all-surface-'));
  roots.push(root);
  mkdirSync(join(root, '.brain'), { recursive: true });
  new MemoryStore(join(root, '.brain', 'memory.db')).close();
  const lineage: AcceptanceConfirmationLineage = {
    tenantId, projectId: 'project-a', sprintId: 'sprint-618', taskId: '618-003',
    attemptId: 'attempt-all-surface', generation: 1,
    evaluationDigest: digest('evaluation'), resultDigest: digest('result'),
    policyDigest: digest('policy'), sourceDigest: digest('source'),
  };
  const confirmationId = deriveAcceptanceConfirmationId(lineage);
  const route: AcceptanceRouteRecord = { confirmationId, lineage, sourceVerdict: 'UNDECIDABLE' };
  createAcceptanceConfirmationRequest(root, {
    sprintId: lineage.sprintId, taskId: lineage.taskId, itemIds: ['release-owner'],
    kind: 'security', verdict: 'UNDECIDABLE', adapter: 'human',
    statements: ['release owner confirms acceptance'],
    evidenceRequirements: ['broker authority receipt'], requestedAt: now.toISOString(),
    source: 'acceptance-matrix',
    identity: {
      attemptId: lineage.attemptId, generation: lineage.generation,
      sourceDigest: lineage.sourceDigest, evidenceDigest: digest('evidence'),
      revisionDigest: digest('revision'),
    },
    acceptanceLineage: lineage,
  }, { tenantId, projectId: lineage.projectId, lifecycle, clock });
  const federated: FederatedPendingItem = {
    origin: 'confirmation', id: confirmationId, summary: 'release acceptance',
    decideHintKey: 'approvals.federated.hint_confirmation', requestedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(), tenantId,
    lifecycleGeneration: String(lineage.generation), policySnapshotDigest: lineage.policyDigest,
    sourceRequestDigest: lineage.sourceDigest, sourceContractVersion: '1.0',
    sourceSchema: 'acceptance-confirmation',
    sourceReference: 'acceptance:' + lineage.taskId + ':' + lineage.attemptId,
  };
  return { root, route, federated };
}
function receiptProjection(root: string, confirmationId: string) {
  const store = new AcceptanceReconciliationStore(root, { adoptLegacy: false });
  try {
    const page = store.readTenantPage({ tenantId: 'tenant-a', projectId: 'project-a', limit: 10 });
    return page.receipts.filter(result => result.state === 'FOUND'
      && result.receipt.confirmationId === confirmationId);
  } finally {
    store.close();
  }
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('all-surface acceptance closure through production stores', () => {
  it('links producer, federation, authenticated decision, debt CAS, receipts, audit, and restart replay', async () => {
    const f = fixture();
    const composition = openAcceptanceConfirmationComposition({
      projectRoot: f.root, tenantId: f.route.lineage.tenantId,
      projectId: f.route.lineage.projectId, lifecycle, clock, verifyAuthority,
    });
    await expect(composition.createAndRoute(f.route)).resolves.toMatchObject({
      state: 'HOLD', reasonCode: 'VERIFIED_DECISION_UNAVAILABLE',
    });
    const candidates = listAcceptanceConfirmationCandidatesReadOnly(f.root, {
      tenantId: f.route.lineage.tenantId, projectId: f.route.lineage.projectId,
      status: 'pending', limit: 1,
    }, { lifecycle, clock });
    expect(candidates.candidates.map(row => row.request.id)).toEqual([f.route.confirmationId]);

    const settled = await composition.decideAndSettle({
      confirmationId: f.route.confirmationId, verdict: 'CONFIRMED',
      decidedBy: 'human', reason: 'approved through federated decision surface',
      authorityReceipt: authorityReceipt(f.route.confirmationId, 'CONFIRMED'),
    });
    if (settled.state !== 'DONE') throw new Error(JSON.stringify(settled));
    expect(settled).toMatchObject({
      state: 'DONE', replayed: false,
      receipt: { state: 'APPLIED', preparedReceiptDigest: expect.any(String) },
    });

    const brokerRoot = mkdtempSync(join(tmpdir(), 'acceptance-federation-surface-'));
    roots.push(brokerRoot);
    const broker = new ApprovalBroker(brokerRoot, { lifecycle, clock });
    const mirror = await mirrorFederatedItemToBroker(broker, f.federated, {
      tenantId: f.route.lineage.tenantId,
    });
    expect(mirror).toMatchObject({
      origin: 'confirmation',
      source: { reference: f.federated.sourceReference, requestDigest: f.route.lineage.sourceDigest },
      details: {
        sourceLifecycleGeneration: String(f.route.lineage.generation),
        sourcePolicySnapshotDigest: f.route.lineage.policyDigest,
        sourceRequestDigest: f.route.lineage.sourceDigest,
      },
    });

    const memory = new MemoryStore(join(f.root, '.brain', 'memory.db'));
    const debtId = 'debt-' + f.route.confirmationId;
    expect(memory.getById(debtId, { tenantId: f.route.lineage.tenantId })).toMatchObject({
      tenant_id: f.route.lineage.tenantId, status: 'resolved',
    });
    expect(memory.getHistory(debtId).map(row => row.field)).toEqual(['*', 'status', 'metadata']);
    memory.close();

    const durableReceipts = receiptProjection(f.root, f.route.confirmationId);
    expect(durableReceipts).toHaveLength(2);
    expect(durableReceipts.map(result => result.state === 'FOUND' ? result.receipt.state : 'HOLD'))
      .toEqual(expect.arrayContaining(['PREPARED', 'APPLIED']));
    composition.close();

    const restarted = openAcceptanceConfirmationReconciler({
      projectRoot: f.root, tenantId: f.route.lineage.tenantId,
      projectId: f.route.lineage.projectId, lifecycle, clock, verifyAuthority,
    });
    await expect(restarted.run({ limit: 1 })).resolves.toMatchObject({
      scanned: 1, reconciled: 0,
      observations: [{ kind: 'APPLIED', confirmationId: f.route.confirmationId }],
    });
    restarted.close();
    expect(receiptProjection(f.root, f.route.confirmationId)).toEqual(durableReceipts);
    const after = new MemoryStore(join(f.root, '.brain', 'memory.db'));
    expect(after.getHistory(debtId).map(row => row.field)).toEqual(['*', 'status', 'metadata']);
    after.close();
  });

  it('does not leak or mutate across a colliding foreign-tenant route', async () => {
    const own = fixture('tenant-a');
    const foreign = { ...own.route, lineage: { ...own.route.lineage, tenantId: 'tenant-b' } };
    const composition = openAcceptanceConfirmationComposition({
      projectRoot: own.root, tenantId: 'tenant-a', projectId: own.route.lineage.projectId,
      lifecycle, clock, verifyAuthority,
    });
    await expect(composition.createAndRoute(foreign)).resolves.toMatchObject({
      state: 'HOLD', reasonCode: 'COMPOSITION_AUTHORITY_MISMATCH',
    });
    const memory = new MemoryStore(join(own.root, '.brain', 'memory.db'));
    expect(memory.getById('debt-' + own.route.confirmationId, { tenantId: 'tenant-a' })).toBeNull();
    expect(memory.getById('debt-' + own.route.confirmationId, { tenantId: 'tenant-b' })).toBeNull();
    memory.close();
    composition.close();
  });
});
