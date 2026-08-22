import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acceptanceConfirmationDigest, deriveAcceptanceConfirmationId,
  type AcceptanceConfirmationLineage } from '../../src/core/acceptance-confirmation-contract.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import { createAcceptanceConfirmationRequest, settleConfirmation } from '../../src/core/confirmation-store.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { openAcceptanceConfirmationComposition } from '../../src/orchestra/acceptance-confirmation-composition.js';
import type { AcceptanceRouteRecord } from '../../src/orchestra/acceptance-confirmation-service.js';
const roots: string[] = []; const clock = () => new Date('2026-08-22T12:00:00.000Z');
const hash = (value: string) => acceptanceConfirmationDigest(value);
const brokerKey = 'broker-mac-test-key-that-is-at-least-32-bytes';
function brokerReceipt(confirmationId: string, verdict: 'CONFIRMED' | 'FAILED'): string {
  const payload = `${confirmationId}:${verdict}`;
  return `broker-mac:v1:${createHmac('sha256', brokerKey).update(payload).digest('hex')}`;
}
function verifyBrokerAuthority(decision: {
  confirmationId: string; verdict: 'CONFIRMED' | 'FAILED'; authorityReceipt: string;
}): boolean {
  const expected = brokerReceipt(decision.confirmationId, decision.verdict);
  const actual = Buffer.from(decision.authorityReceipt);
  const canonical = Buffer.from(expected);
  return actual.length === canonical.length && timingSafeEqual(actual, canonical);
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'acceptance-composition-')); roots.push(root);
  mkdirSync(join(root, '.brain'), { recursive: true }); new MemoryStore(join(root, '.brain', 'memory.db')).close();
  const lineage: AcceptanceConfirmationLineage = { tenantId: 'tenant-a', projectId: 'project-a',
    attemptId: 'attempt-1', generation: 1, sprintId: 'sprint-616', taskId: '616-008',
    evaluationDigest: hash('evaluation'), resultDigest: hash('result'), policyDigest: hash('policy'), sourceDigest: hash('source') };
  const confirmationId = deriveAcceptanceConfirmationId(lineage);
  createAcceptanceConfirmationRequest(root, { sprintId: lineage.sprintId, taskId: lineage.taskId,
    itemIds: ['owner'], kind: 'security', verdict: 'UNDECIDABLE', adapter: 'human', statements: ['owner confirmation'],
    evidenceRequirements: ['receipt'], requestedAt: clock().toISOString(), source: 'acceptance-matrix',
    identity: { attemptId: lineage.attemptId, generation: lineage.generation, sourceDigest: lineage.sourceDigest,
      evidenceDigest: hash('evidence'), revisionDigest: hash('revision') }, acceptanceLineage: lineage,
  }, { tenantId: lineage.tenantId, projectId: lineage.projectId,
    lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }), clock });
  return { root, route: { confirmationId, lineage, sourceVerdict: 'UNDECIDABLE' } as AcceptanceRouteRecord };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('acceptance confirmation production composition', () => {
  it('settles only through the production decideAndSettle adapter with broker MAC authority', async () => {
    const f = fixture();
    const composition = openAcceptanceConfirmationComposition({ projectRoot: f.root,
      tenantId: 'tenant-a', projectId: 'project-a', lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
      clock, verifyAuthority: verifyBrokerAuthority });
    await expect(composition.createAndRoute(f.route)).resolves.toMatchObject({
      state: 'HOLD', reasonCode: 'VERIFIED_DECISION_UNAVAILABLE',
    });

    const authorityReceipt = brokerReceipt(f.route.confirmationId, 'CONFIRMED');
    const applied = await composition.decideAndSettle({
      confirmationId: f.route.confirmationId, verdict: 'CONFIRMED', decidedBy: 'human',
      reason: 'authenticated broker decision', authorityReceipt,
    });
    expect(applied).toMatchObject({ state: 'DONE', replayed: false,
      receipt: { state: 'APPLIED', preparedReceiptDigest: expect.any(String) } });
    await expect(composition.decideAndSettle({
      confirmationId: f.route.confirmationId, verdict: 'CONFIRMED', decidedBy: 'human',
      reason: 'authenticated broker decision', authorityReceipt,
    })).resolves.toEqual({ ...applied, replayed: true });
    composition.close();
  });
  it('refuses a raw store settlement whose receipt has no broker MAC authority', async () => {
    const f = fixture();
    const composition = openAcceptanceConfirmationComposition({ projectRoot: f.root,
      tenantId: 'tenant-a', projectId: 'project-a', lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
      clock, verifyAuthority: verifyBrokerAuthority });
    await composition.createAndRoute(f.route);
    settleConfirmation(f.root, f.route.confirmationId, { verdict: 'CONFIRMED', decidedBy: 'human', reason: 'raw bypass',
      receipt: 'unverifiable-boolean-authority', decidedAt: clock().toISOString() },
    { lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }), clock });

    await expect(composition.settle(f.route.confirmationId)).resolves.toEqual({
      state: 'DENIED', reasonCode: 'AUTHORITY_VERIFICATION_FAILED',
      receiptRef: `${f.route.confirmationId}:prepared`,
    });
    const memory = new MemoryStore(join(f.root, '.brain', 'memory.db'));
    expect(memory.getById(`debt-${f.route.confirmationId}`)).toMatchObject({ status: 'active' });
    memory.close(); composition.close();
  });
  it('owns real stores and closes deterministically', async () => {
    const f = fixture(); const composition = openAcceptanceConfirmationComposition({ projectRoot: f.root,
      tenantId: 'tenant-a', projectId: 'project-a', lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
      clock, verifyAuthority: verifyBrokerAuthority });
    expect(composition.authority).toMatchObject({ tenantId: 'tenant-a', projectId: 'project-a' });
    await expect(composition.createAndRoute(f.route)).resolves.toMatchObject({ state: 'HOLD', reasonCode: 'VERIFIED_DECISION_UNAVAILABLE' });
    await expect(composition.decideAndSettle({ confirmationId: f.route.confirmationId, verdict: 'CONFIRMED',
      decidedBy: 'human', reason: 'approved',
      authorityReceipt: brokerReceipt(f.route.confirmationId, 'CONFIRMED') }))
      .resolves.toMatchObject({ state: 'DONE', replayed: false, receipt: { state: 'APPLIED' } });
    await expect(composition.reconciler.reconcile(f.route.confirmationId)).resolves.toMatchObject({ state: 'DONE', replayed: true });
    composition.close(); composition.close();
    await expect(composition.reconciler.reconcile(f.route.confirmationId)).resolves.toMatchObject({ state: 'HOLD', reasonCode: 'COMPOSITION_CLOSED' });
  });
  it('fails closed for foreign tenant before debt mutation', async () => {
    const f = fixture(); const composition = openAcceptanceConfirmationComposition({ projectRoot: f.root,
      tenantId: 'tenant-b', projectId: 'project-a', lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
      clock, verifyAuthority: () => true });
    await expect(composition.createAndRoute(f.route)).resolves.toMatchObject({ state: 'HOLD', reasonCode: 'COMPOSITION_AUTHORITY_MISMATCH' });
    const memory = new MemoryStore(join(f.root, '.brain', 'memory.db'));
    expect(memory.getById(`debt-${f.route.confirmationId}`)).toBeNull(); memory.close(); composition.close();
  });
});
