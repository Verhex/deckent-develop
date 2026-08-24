import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { providerObservationJson, type ProviderObservationReconciliationProjection } from '../../src/cli/commands/provider-observations.js';
import { buildNoActiveStatusJson } from '../../src/cli/commands/status.js';
import { ApprovalBroker } from '../../src/core/approval-broker.js';
import {
  ApprovalDecisionAuthority,
  ApprovalDecisionIngress,
  type ApprovalDecisionIntegrityAuthority,
  type LiveApprovalAuthentication,
  type LiveApprovalAuthenticator,
  type LiveApprovalSessionProof,
} from '../../src/core/approval-decision-ingress.js';
import { ProviderExecutionObservationReconciliationApprovalAuthority } from '../../src/core/provider-execution-observation-reconciliation-approval.js';
import { publishProviderExecutionObservationReconciliationReceipt, readProviderExecutionObservationReconciliationReceipt } from '../../src/core/provider-execution-observation-reconciliation-receipt-store.js';
import { inventoryProviderExecutionObservationReconciliation, planProviderExecutionObservationReconciliation } from '../../src/core/provider-execution-observation-reconciliation.js';
import { PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH, ProviderExecutionObservationStore } from '../../src/core/provider-execution-observation-store.js';
import { publishCanonicalRunStatusReadModel } from '../../src/core/run-status-read-model.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRefForAttempt,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
} from '../../src/core/task-result-settlement.js';

const NOW = new Date('2026-08-23T12:00:00.000Z');
const RUN_IDS = ['production-run-alpha', 'production-run-beta', 'production-run-gamma'] as const;
const PRINCIPAL = 'production-provider-principal';
const KEY = Buffer.from('production-reconciliation-approval-key');
const roots: string[] = [];
const originalHome = process.env.DECKENT_HOME;

class Integrity implements ApprovalDecisionIntegrityAuthority {
  sign(payload: string) { return { keyId: 'integration-key', mac: createHmac('sha256', KEY).update(payload).digest('hex') }; }
  verify(keyId: string, payload: string, mac: string) {
    const expected = this.sign(payload).mac;
    return keyId === 'integration-key' && mac.length === expected.length
      && timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'));
  }
}

class Authenticator implements LiveApprovalAuthenticator {
  readonly identity: LiveApprovalAuthentication = {
    actorId: 'independent-operator', tenantId: 'tenant-production', role: 'owner',
    sessionRef: 'integration-session', authorityRef: 'integration-terminal',
    authenticatedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 120_000).toISOString(),
  };
  async reauthenticate() { return this.identity; }
  isSessionActive(proof: LiveApprovalSessionProof) { return proof.actorId === this.identity.actorId && proof.tenantId === this.identity.tenantId; }
}

function attemptId(index: number): string { return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`; }
function putStart(store: ProviderExecutionObservationStore, input: { readonly executionId: string; readonly taskId: string; readonly attemptId: string; readonly runId: string }): void {
  store.put({ source: 'provider-runtime', observation: {
    type: 'start', ...input, providerPrincipalDigest: PRINCIPAL, fence: `fence-${input.executionId}`,
    sequence: 1, observedAt: NOW.toISOString(),
  } });
}
function closeAttempt(root: string, taskId: string, attempt: string, exitCode: number): void {
  const ref = createTaskResultSettlementRefForAttempt(root, taskId, attempt);
  writeTaskResultSettlementAttemptAtomic(ref, NOW.toISOString());
  claimTaskResultSettlementAttemptAtomic(ref, new Date(NOW.getTime() + 1_000).toISOString());
  writeTaskResultSettlementAtomic(createTaskResultSettlement({
    ref, exitCode, settledAt: new Date(NOW.getTime() + 2_000).toISOString(),
    result: { taskId, selfAssessment: exitCode === 0 ? 'DONE' : 'NO_GO' },
  }));
  writeTaskResultSettlementClosureAtomic(ref, { containerDisposition: 'absent-after-exit', locksReleased: true, closedAt: new Date(NOW.getTime() + 3_000).toISOString() });
}

afterEach(() => {
  if (originalHome === undefined) delete process.env.DECKENT_HOME; else process.env.DECKENT_HOME = originalHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('production provider-observation reconciliation fan-in', () => {
  it('fans in fifteen settled executions across runs without deleting or synthesizing end observations', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-production-reconciliation-'));
    const home = mkdtempSync(join(tmpdir(), 'deckent-production-reconciliation-home-'));
    roots.push(root, home); process.env.DECKENT_HOME = home;
    const store = new ProviderExecutionObservationStore(root);
    const dbPath = join(root, PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH);

    for (let index = 1; index <= 15; index += 1) {
      const runId = RUN_IDS[(index - 1) % RUN_IDS.length]!;
      const taskId = `owned-task-${index}`; const attempt = attemptId(index);
      putStart(store, { executionId: `owned-execution-${String(index).padStart(2, '0')}`, taskId, attemptId: attempt, runId });
      closeAttempt(root, taskId, attempt, index === 15 ? 1 : 0);
    }
    for (let index = 16; index <= 19; index += 1) putStart(store, {
      executionId: `legacy-execution-${index}`, taskId: `legacy-task-${index}`, attemptId: attemptId(index), runId: RUN_IDS[0],
    });
    const mutation = new Database(dbPath);
    mutation.prepare("UPDATE provider_execution_intervals SET run_id = NULL WHERE execution_id LIKE 'legacy-execution-%'").run();
    mutation.close();

    // COMPLETE and ABORTED terminal observations remain forensic history, never open candidates.
    for (const [index, outcome] of [[20, 'completed'], [21, 'aborted']] as const) {
      const executionId = `${outcome}-execution`;
      putStart(store, { executionId, taskId: `${outcome}-task`, attemptId: attemptId(index), runId: 'terminal-regression-run' });
      store.put({ source: 'provider-runtime', observation: {
        type: 'end', executionId, taskId: `${outcome}-task`, attemptId: attemptId(index), runId: 'terminal-regression-run',
        providerPrincipalDigest: PRINCIPAL, fence: `fence-${executionId}`, sequence: 2,
        observedAt: new Date(NOW.getTime() + index * 1_000).toISOString(), outcome,
      } });
    }

    const beforeDryRunBytes = readFileSync(dbPath);
    const inspection = inventoryProviderExecutionObservationReconciliation({ projectRoot: root });
    const plan = planProviderExecutionObservationReconciliation({ inventory: inspection });
    const dryRun: ProviderObservationReconciliationProjection = { operation: 'reconcile', mode: 'dry-run', inspection, plan };
    expect(plan.runIds).toEqual([...RUN_IDS]);
    expect(plan.candidates).toHaveLength(15);
    expect(inspection.activeOpenCount).toBe(19);
    expect(plan.activeOpenCount - plan.candidates.length).toBe(4);
    expect(JSON.parse(providerObservationJson(dryRun, root))).toMatchObject({ operation: 'reconcile', mode: 'dry-run', plan: { runCount: 3, candidateCount: 15, holdCount: 4 } });
    expect(readFileSync(dbPath)).toEqual(beforeDryRunBytes);

    const broker = new ApprovalBroker(root, { clock: () => NOW });
    const integrity = new Integrity(); const authenticator = new Authenticator();
    const authority = new ProviderExecutionObservationReconciliationApprovalAuthority(root, broker, new ApprovalDecisionAuthority(integrity, authenticator), { now: () => NOW });
    const ingress = new ApprovalDecisionIngress({ broker, authenticator, integrity, channel: 'terminal', now: () => NOW });
    const expiresAt = new Date(NOW.getTime() + 60_000).toISOString();
    const approvalInput = {
      plan, tenantId: 'tenant-production', requestedBy: 'brain-reconciler', approverUserId: 'independent-operator',
      generation: 'production-fan-in', expiresAt, requester: { role: 'brain' as const, instanceId: 'production-fan-in' },
    };
    const approval = authority.submit(approvalInput);
    await ingress.decide({ requestId: approval.id, action: 'allow', idempotencyKey: 'production-fan-in-allow' });

    const beforeApply = new Database(dbPath, { readonly: true });
    const rowCount = (beforeApply.prepare('SELECT count(*) AS count FROM provider_execution_intervals').get() as { count: number }).count;
    beforeApply.close();
    const applied = authority.apply({ requestId: approval.id, plan, tenantId: approvalInput.tenantId, requestedBy: approvalInput.requestedBy, generation: approvalInput.generation, expiresAt });
    expect(applied).toMatchObject({ state: 'applied', beforeActiveOpenCount: 19, afterActiveOpenCount: 4, retiredCount: 15 });

    // The persisted status model consumes the same reader used by CLI/API/MCP.
    // Reconciliation keeps all 19 rows for forensics, but only the four
    // authority-less legacy intervals remain active on the product surface.
    publishCanonicalRunStatusReadModel(root);
    const status = buildNoActiveStatusJson(root);
    const activeProjected = (status.providerConcurrency as Array<{
      readonly currentAttained: number; readonly unresolvedOpenIntervals: number;
    }>).reduce((total, item) => total + item.currentAttained + item.unresolvedOpenIntervals, 0);
    expect(activeProjected).toBe(4);

    const published = publishProviderExecutionObservationReconciliationReceipt({
      projectRoot: root, tenantId: approvalInput.tenantId, environmentId: 'production', plan, result: applied,
      verifiedAt: new Date(NOW.getTime() + 30_000).toISOString(),
    });
    const receipt = readProviderExecutionObservationReconciliationReceipt({
      projectRoot: root, tenantId: approvalInput.tenantId, environmentId: 'production', receiptId: published.receipt.receiptId,
      expectedPlanDigest: plan.planDigest, fresh: true,
    });
    expect(receipt).toMatchObject({ state: 'applied', retiredCount: 15, approvalClaim: { requestId: approval.id } });
    expect(receipt.retiredExecutions).toHaveLength(15);

    const after = new ProviderExecutionObservationStore(root, { readOnly: true });
    const rows = after.listIntervals(PRINCIPAL);
    expect(rows.filter(row => row.executionId.startsWith('owned-execution-')).every(row => row.retired && row.end === null)).toBe(true);
    expect(rows.filter(row => row.ownership === 'legacy-unowned' && !row.retired && row.end === null)).toHaveLength(4);
    expect(rows.filter(row => row.executionId === 'completed-execution' || row.executionId === 'aborted-execution').every(row => row.end !== null && !row.retired)).toBe(true);
    after.close();
    const afterApply = new Database(dbPath, { readonly: true });
    expect((afterApply.prepare('SELECT count(*) AS count FROM provider_execution_intervals').get() as { count: number }).count).toBe(rowCount);
    expect((afterApply.prepare("SELECT count(*) AS count FROM provider_execution_intervals WHERE execution_id LIKE 'owned-execution-%' AND end_json IS NOT NULL").get() as { count: number }).count).toBe(0);
    afterApply.close();

    // Replay is a no-op; a legitimate unrelated write must not invalidate the receipt's exact retired preimage.
    expect(authority.apply({ requestId: approval.id, plan, tenantId: approvalInput.tenantId, requestedBy: approvalInput.requestedBy, generation: approvalInput.generation, expiresAt })).toMatchObject({ state: 'replayed', retiredCount: 0 });
    putStart(store, { executionId: 'later-unrelated', taskId: 'later-task', attemptId: attemptId(22), runId: 'later-run' });
    closeAttempt(root, 'later-task', attemptId(22), 0);
    expect(readProviderExecutionObservationReconciliationReceipt({
      projectRoot: root, tenantId: approvalInput.tenantId, environmentId: 'production', receiptId: receipt.receiptId,
      expectedPlanDigest: plan.planDigest, fresh: true,
    })).toEqual(receipt);
    store.close();
  });
});
