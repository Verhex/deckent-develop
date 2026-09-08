import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/core/audit-writer.js';
import type { InvocationReceipt } from '../../src/core/invocation-receipt.js';
import { InvocationReceiptStore } from '../../src/core/invocation-receipt-store.js';
import {
  createPlannerInvocationBinding, PlannerInvocationBindingError, verifyPlannerInvocationBinding,
} from '../../src/core/planner-invocation-binding.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function fixture(options: { resultRef?: string; extraResultRef?: string; accepted?: boolean; receipt?: Partial<InvocationReceipt>; settle?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'deckent-planner-binding-')); roots.push(root);
  const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a', now: () => '2026-09-08T00:00:00.000Z' });
  const result = digest('normalized-result');
  const receipt: InvocationReceipt = {
    schemaVersion: 1, invocationId: 'inv-plan', idempotencyKey: 'flow-a:1', tenantId: 'tenant-a', projectId: store.projectId,
    runId: 'flow-a:revision:1', taskId: null, callId: 'call-plan', role: 'brain', purpose: 'sprint-planning',
    configured: { provider: 'claude', model: 'claude-fable-5', source: 'config', reasonCode: 'none' },
    requested: { provider: 'claude', model: 'claude-fable-5', source: 'directive', reasonCode: 'none' },
    resolved: { provider: 'codex', model: 'gpt-5.6-sol', source: 'fallback', reasonCode: 'provider_resolution_fallback' },
    called: { provider: 'codex', model: 'gpt-5.6-sol', source: 'wire', reasonCode: 'provider_resolution_fallback' },
    backend: { transport: 'cli', executionBackend: 'host-subprocess' }, auth: { mode: 'subscription', accountRefHash: null }, fallbackChain: [],
    reachability: { state: 'known', evidenceRef: 'reachability:fixture' }, limits: { state: 'known', evidenceRefs: ['limit:fixture'] }, createdAt: '2026-09-08T00:00:00.000Z', ...options.receipt,
  };
  store.declare(receipt);
  store.append(receipt, receipt.invocationId, { eventId: 'dispatch', type: 'dispatch_started', payload: { attempt: 1, calledProvider: 'codex', calledModel: 'gpt-5.6-sol' } });
  if (options.settle !== false) {
    store.append(receipt, receipt.invocationId, { eventId: 'transport', type: 'transport_settled', payload: { outcome: 'succeeded', exitCode: 0, signal: null, reasonCode: 'none', durationMs: 1 } });
    store.append(receipt, receipt.invocationId, { eventId: 'consumer', type: 'consumer_settled', payload: { outcome: options.accepted === false ? 'rejected' : 'accepted', reasonCode: options.accepted === false ? 'validation_failed' : 'none', evidenceRefs: [options.resultRef ?? `planner-result:sha256:${result}`, ...(options.extraResultRef ? [options.extraResultRef] : [])] } });
  }
  const ref = { schemaVersion: 1 as const, invocationId: receipt.invocationId, tenantId: receipt.tenantId, projectId: receipt.projectId };
  store.close();
  return { root, result, ref, receipt };
}

describe('planner invocation binding', () => {
  const expectCode = (operation: () => unknown, code: string) => {
    try { operation(); throw new Error('expected operation to fail'); }
    catch (error) { expect(error).toBeInstanceOf(PlannerInvocationBindingError); expect((error as PlannerInvocationBindingError).code).toBe(code); }
  };
  it('binds and re-verifies an accepted fallback invocation without equating configured and called identity', () => {
    const f = fixture();
    const binding = createPlannerInvocationBinding(f.root, { flowId: 'flow-a', revision: 1, tenantId: 'tenant-a', receiptRef: f.ref, plannerResultSha256: f.result, directivesSha256: digest('directives') });
    expect(binding.receiptSha256).toBe(digest(canonicalJson(f.receipt)));
    expect(binding.terminalEventHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(binding)).toBe(true);
    expect(verifyPlannerInvocationBinding(f.root, binding, { flowId: 'flow-a', revision: 1, tenantId: 'tenant-a' })).toEqual(binding);
    expect(() => verifyPlannerInvocationBinding(f.root, { ...binding, terminalEventHash: digest('tamper') }, { flowId: 'flow-a', revision: 1, tenantId: 'tenant-a' })).toThrowError(PlannerInvocationBindingError);
  });

  it('fails closed for missing stores, foreign scope, rejected settlement and wrong result evidence', () => {
    const missing = mkdtempSync(join(tmpdir(), 'deckent-planner-missing-')); roots.push(missing);
    const f = fixture();
    const input = { flowId: 'flow-a', revision: 1, tenantId: 'tenant-a', receiptRef: f.ref, plannerResultSha256: f.result, directivesSha256: digest('directives') };
    expectCode(() => createPlannerInvocationBinding(missing, input), 'STORE_UNAVAILABLE');
    expect(existsSync(join(missing, '.deckent', 'runtime', 'invocations.db'))).toBe(false);
    expectCode(() => createPlannerInvocationBinding(f.root, { ...input, receiptRef: undefined as never }), 'INVALID_INPUT');
    expectCode(() => createPlannerInvocationBinding(f.root, { ...input, tenantId: 'tenant-b' }), 'RECEIPT_MISMATCH');
    const rejected = fixture({ accepted: false });
    expectCode(() => createPlannerInvocationBinding(rejected.root, { ...input, receiptRef: rejected.ref }), 'INVOCATION_UNSETTLED');
    const wrong = fixture({ resultRef: `planner-result:sha256:${digest('other')}` });
    expectCode(() => createPlannerInvocationBinding(wrong.root, { ...input, receiptRef: wrong.ref }), 'RESULT_EVIDENCE_MISMATCH');
    const ambiguous = fixture({ extraResultRef: `planner-result:sha256:${digest('sibling')}` });
    expectCode(() => createPlannerInvocationBinding(ambiguous.root, { ...input, receiptRef: ambiguous.ref }), 'RESULT_EVIDENCE_MISMATCH');
    const open = fixture({ settle: false });
    expectCode(() => createPlannerInvocationBinding(open.root, { ...input, receiptRef: open.ref }), 'INVOCATION_UNSETTLED');
  });

  it.each([
    ['wrong run', { runId: 'flow-other:revision:1' }],
    ['task-owned', { taskId: 'task-1' }],
    ['wrong role', { role: 'worker' as const, purpose: 'worker-execution' as const, taskId: 'task-1' }],
    ['wrong purpose', { purpose: 'goal-authoring' as const }],
  ])('rejects %s receipt identity', (_name, receipt) => {
    const f = fixture({ receipt });
    expectCode(() => createPlannerInvocationBinding(f.root, { flowId: 'flow-a', revision: 1, tenantId: 'tenant-a', receiptRef: f.ref, plannerResultSha256: f.result, directivesSha256: digest('directives') }), 'RECEIPT_MISMATCH');
  });

  it('maps persisted receipt corruption into the safe binding taxonomy', () => {
    const f = fixture();
    const db = new Database(join(f.root, '.deckent', 'runtime', 'invocations.db'));
    db.exec('DROP TRIGGER invocations_no_update');
    db.prepare("UPDATE invocations SET payload_hash = ? WHERE invocation_id = ?").run('0'.repeat(64), f.ref.invocationId);
    db.close();
    expectCode(() => createPlannerInvocationBinding(f.root, { flowId: 'flow-a', revision: 1, tenantId: 'tenant-a', receiptRef: f.ref, plannerResultSha256: f.result, directivesSha256: digest('directives') }), 'RECEIPT_INTEGRITY_FAILURE');
  });
});
import Database from 'better-sqlite3';
