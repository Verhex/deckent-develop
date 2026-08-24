import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ApprovalBroker } from '../../src/core/approval-broker.js';
import { ApprovalDecisionAuthority, ApprovalDecisionIngress, approvalRequestDigest, type ApprovalDecisionIntegrityAuthority, type LiveApprovalAuthentication, type LiveApprovalAuthenticator, type LiveApprovalSessionProof } from '../../src/core/approval-decision-ingress.js';
import { ProviderExecutionObservationReconciliationApprovalAuthority, ProviderExecutionObservationReconciliationApprovalError, assertProviderExecutionObservationReconciliationReplayApproval } from '../../src/core/provider-execution-observation-reconciliation-approval.js';
import { inventoryProviderExecutionObservationReconciliation, planProviderExecutionObservationReconciliation } from '../../src/core/provider-execution-observation-reconciliation.js';
import { ProviderExecutionObservationStore } from '../../src/core/provider-execution-observation-store.js';
import { claimTaskResultSettlementAttemptAtomic, createTaskResultSettlement, createTaskResultSettlementRefForAttempt, writeTaskResultSettlementAtomic, writeTaskResultSettlementAttemptAtomic, writeTaskResultSettlementClosureAtomic } from '../../src/core/task-result-settlement.js';

const NOW = new Date('2026-08-23T09:00:00.000Z');
const KEY = Buffer.from('reconciliation-approval-key');
const roots: string[] = [];

class Integrity implements ApprovalDecisionIntegrityAuthority {
  sign(payload: string) { return { keyId: 'key', mac: createHmac('sha256', KEY).update(payload).digest('hex') }; }
  verify(keyId: string, payload: string, mac: string) { return keyId === 'key' && timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(this.sign(payload).mac, 'hex')); }
}
class Authenticator implements LiveApprovalAuthenticator {
  identity: LiveApprovalAuthentication = { actorId: 'approver', tenantId: 'tenant-a', role: 'owner', sessionRef: 'session', authorityRef: 'terminal', authenticatedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 60_000).toISOString() };
  async reauthenticate() { return this.identity; }
  isSessionActive(proof: LiveApprovalSessionProof) { return proof.actorId === this.identity.actorId && proof.tenantId === this.identity.tenantId && proof.authorityRef === this.identity.authorityRef && proof.sessionRefHash === createHash('sha256').update(this.identity.sessionRef).digest('hex'); }
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'reconciliation-approval-')); roots.push(root);
  const store = new ProviderExecutionObservationStore(root, { dbPath: join(root, 'observations.db') });
  const attempt = '11111111-1111-4111-8111-111111111111';
  store.put({ source: 'provider-runtime', observation: { type: 'start', executionId: 'execution-1', taskId: 'task-1', attemptId: attempt, runId: 'generation-1', providerPrincipalDigest: 'principal', fence: 'fence', sequence: 1, observedAt: NOW.toISOString() } });
  const ref = createTaskResultSettlementRefForAttempt(root, 'task-1', attempt);
  writeTaskResultSettlementAttemptAtomic(ref, NOW.toISOString()); claimTaskResultSettlementAttemptAtomic(ref, NOW.toISOString());
  writeTaskResultSettlementAtomic(createTaskResultSettlement({ ref, exitCode: 0, settledAt: NOW.toISOString(), result: { taskId: 'task-1' } }));
  writeTaskResultSettlementClosureAtomic(ref, { containerDisposition: 'absent-after-exit', locksReleased: true, closedAt: NOW.toISOString() });
  const inventory = inventoryProviderExecutionObservationReconciliation({ projectRoot: root, relativeDatabasePath: 'observations.db' });
  const plan = planProviderExecutionObservationReconciliation({ inventory, canonicalRunId: 'generation-1' });
  const broker = new ApprovalBroker(root, { clock: () => NOW }); const integrity = new Integrity(); const auth = new Authenticator(); const decisions = new ApprovalDecisionAuthority(integrity, auth);
  const authority = new ProviderExecutionObservationReconciliationApprovalAuthority(root, broker, decisions, { now: () => NOW });
  const ingress = new ApprovalDecisionIngress({ broker, authenticator: auth, integrity, channel: 'terminal', now: () => NOW });
  const input = { plan, tenantId: 'tenant-a', requestedBy: 'operator-a', approverUserId: 'approver', generation: 'generation-1', expiresAt: new Date(NOW.getTime() + 30_000).toISOString(), requester: { role: 'brain' as const, instanceId: 'reconciliation' } };
  return { root, store, broker, integrity, auth, decisions, authority, ingress, input, inventory };
}
function apply(f: ReturnType<typeof fixture>, authority = f.authority, plan = f.input.plan) {
  return authority.apply({ requestId: f.authority.submit(f.input).id, plan, tenantId: 'tenant-a', requestedBy: 'operator-a', generation: 'generation-1', expiresAt: f.input.expiresAt });
}
function errorCode(operation: () => unknown): string {
  try { operation(); return 'NO_ERROR'; } catch (error) { expect(error).toBeInstanceOf(ProviderExecutionObservationReconciliationApprovalError); return (error as ProviderExecutionObservationReconciliationApprovalError).code; }
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('provider execution observation reconciliation approval', () => {
  it('returns a verified lineage claim only after an authenticated live allow, and is replay-safe', async () => {
    const f = fixture(); const request = f.authority.submit(f.input);
    expect(f.authority.submit(f.input).id).toBe(request.id);
    await expect(f.ingress.decide({ requestId: request.id, action: 'allow', idempotencyKey: 'reconcile-allow' })).resolves.toMatchObject({ kind: 'decided' });
    const applied = apply(f);
    expect(applied).toMatchObject({ state: 'applied', retiredCount: 1, claim: { requestId: request.id, requestDigest: approvalRequestDigest(request), subjectDigest: (request.details as { subjectDigest: string }).subjectDigest, decidedAt: NOW.toISOString(), authorityRef: 'terminal' } });
    if ('claim' in applied) {
      expect(applied.claim.decisionDigest).toMatch(/^[a-f0-9]{64}$/u);
      const decision = f.broker.getDecision(request.id);
      expect(() => assertProviderExecutionObservationReconciliationReplayApproval({
        request, decision, approvalId: request.id, planDigest: f.input.plan.planDigest, claim: applied.claim,
      })).not.toThrow();
      expect(errorCode(() => assertProviderExecutionObservationReconciliationReplayApproval({
        request, decision, approvalId: request.id, planDigest: f.input.plan.planDigest,
        claim: { ...applied.claim, decisionDigest: 'f'.repeat(64) },
      }))).toBe('REQUEST_MISMATCH');
    }
    expect(apply(f)).toMatchObject({ state: 'replayed', claim: 'claim' in applied ? applied.claim : undefined });
    f.store.close();
  });

  it('holds a direct allow with missing authorization and rejects self, stale, denied, and mismatched-batch applies', async () => {
    const missing = fixture(); const missingRequest = missing.authority.submit(missing.input);
    missing.broker.decide(missingRequest.id, { decision: 'allow', decidedBy: 'approver', channel: 'terminal', decidedAt: NOW.toISOString(), reason: '' });
    expect(apply(missing)).toEqual({ state: 'hold', reasonCode: 'missing-authorization' });
    expect(missing.store.listIntervals('principal').find(value => value.executionId === 'execution-1')?.retired).toBe(false);
    missing.store.close();

    const self = fixture(); const selfRequest = self.authority.submit({ ...self.input, requestedBy: 'approver' });
    await self.ingress.decide({ requestId: selfRequest.id, action: 'allow', idempotencyKey: 'self-allow' });
    expect(errorCode(() => self.authority.apply({ requestId: selfRequest.id, plan: self.input.plan, tenantId: 'tenant-a', requestedBy: 'approver', generation: 'generation-1', expiresAt: self.input.expiresAt }))).toBe('SELF_APPROVAL'); self.store.close();

    const stale = fixture(); const staleRequest = stale.authority.submit(stale.input);
    await stale.ingress.decide({ requestId: staleRequest.id, action: 'allow', idempotencyKey: 'stale-allow' });
    const lateAuthority = new ProviderExecutionObservationReconciliationApprovalAuthority(stale.root, stale.broker, stale.decisions, { now: () => new Date(NOW.getTime() + 31_000) });
    expect(errorCode(() => apply(stale, lateAuthority))).toBe('STALE_DECISION'); stale.store.close();

    const denied = fixture(); const deniedRequest = denied.authority.submit(denied.input);
    await denied.ingress.decide({ requestId: deniedRequest.id, action: 'deny', idempotencyKey: 'deny' });
    expect(errorCode(() => apply(denied))).toBe('DECISION_NOT_ALLOWED');
    const otherBatch = planProviderExecutionObservationReconciliation({ inventory: denied.inventory, canonicalRunId: 'other-generation' });
    expect(errorCode(() => apply(denied, denied.authority, otherBatch))).toBe('REQUEST_MISMATCH'); denied.store.close();
  });

  it('rejects exact request and decision tampering before reconciliation can apply', async () => {
    const requestTamper = fixture(); const request = requestTamper.authority.submit(requestTamper.input);
    await requestTamper.ingress.decide({ requestId: request.id, action: 'allow', idempotencyKey: 'request-tamper' });
    const requestPath = join(requestTamper.root, '.deckent', 'approvals', `${request.id}.request.json`);
    const storedRequest = JSON.parse(readFileSync(requestPath, 'utf8')) as { details: { subject: { generation: string } } };
    storedRequest.details.subject.generation = 'tampered-generation'; writeFileSync(requestPath, JSON.stringify(storedRequest));
    const reloadedRequestBroker = new ApprovalBroker(requestTamper.root, { clock: () => NOW });
    const requestAuthority = new ProviderExecutionObservationReconciliationApprovalAuthority(requestTamper.root, reloadedRequestBroker, requestTamper.decisions, { now: () => NOW });
    expect(errorCode(() => apply(requestTamper, requestAuthority))).toBe('REQUEST_MISMATCH'); requestTamper.store.close();

    const decisionTamper = fixture(); const decision = decisionTamper.authority.submit(decisionTamper.input);
    await decisionTamper.ingress.decide({ requestId: decision.id, action: 'allow', idempotencyKey: 'decision-tamper' });
    const decisionPath = join(decisionTamper.root, '.deckent', 'approvals', `${decision.id}.decision.json`);
    const storedDecision = JSON.parse(readFileSync(decisionPath, 'utf8')) as { decidedAt: string };
    storedDecision.decidedAt = new Date(NOW.getTime() + 1_000).toISOString(); writeFileSync(decisionPath, JSON.stringify(storedDecision));
    const reloadedDecisionBroker = new ApprovalBroker(decisionTamper.root, { clock: () => NOW });
    const decisionAuthority = new ProviderExecutionObservationReconciliationApprovalAuthority(decisionTamper.root, reloadedDecisionBroker, decisionTamper.decisions, { now: () => NOW });
    expect(errorCode(() => apply(decisionTamper, decisionAuthority))).toBe('DECISION_UNTRUSTED'); decisionTamper.store.close();
  });
});
