import { createHash } from 'node:crypto';
import { canonicalJson } from './audit-writer.js';
import { INVOCATION_RECEIPT_SCHEMA_VERSION, type InvocationReceiptRef } from './invocation-receipt.js';
import { InvocationReceiptStore, InvocationReceiptStoreError } from './invocation-receipt-store.js';
import {
  isPlannerInvocationBinding,
  type PlannerInvocationBindingV1,
} from './run-flow-contract.js';

export { isPlannerInvocationBinding } from './run-flow-contract.js';
export type { PlannerInvocationBindingV1, PlanningEvidence } from './run-flow-contract.js';

const SHA256 = /^[a-f0-9]{64}$/u;

export type PlannerInvocationBindingIssue =
  | 'INVALID_INPUT' | 'STORE_UNAVAILABLE' | 'RECEIPT_UNAVAILABLE' | 'RECEIPT_MISMATCH'
  | 'RECEIPT_INTEGRITY_FAILURE' | 'INVOCATION_UNSETTLED'
  | 'RESULT_EVIDENCE_MISMATCH' | 'BINDING_MISMATCH';

export class PlannerInvocationBindingError extends Error {
  constructor(readonly code: PlannerInvocationBindingIssue) {
    super(code);
    this.name = 'PlannerInvocationBindingError';
  }
}

export interface CreatePlannerInvocationBindingInput {
  readonly flowId: string;
  readonly revision: number;
  readonly tenantId: string;
  readonly receiptRef: InvocationReceiptRef;
  readonly plannerResultSha256: string;
  readonly directivesSha256: string;
}

function validText(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && value.length > 0
    && value.length <= 512 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

function validProjectRoot(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim().length > 0 && !value.includes('\0');
}

function validReceiptRef(value: unknown): value is InvocationReceiptRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  return Object.keys(ref).sort().join(',') === 'invocationId,projectId,schemaVersion,tenantId'
    && ref.schemaVersion === INVOCATION_RECEIPT_SCHEMA_VERSION
    && validText(ref.invocationId) && validText(ref.projectId) && validText(ref.tenantId);
}

function validDigest(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function fail(code: PlannerInvocationBindingIssue): never {
  throw new PlannerInvocationBindingError(code);
}

export function createPlannerInvocationBinding(
  projectRoot: string,
  input: CreatePlannerInvocationBindingInput,
): PlannerInvocationBindingV1 {
  if (!validProjectRoot(projectRoot) || !input || typeof input !== 'object'
    || !validText(input.flowId) || !Number.isSafeInteger(input.revision)
    || input.revision < 1 || !validText(input.tenantId) || !validDigest(input.plannerResultSha256)
    || !validDigest(input.directivesSha256) || !validReceiptRef(input.receiptRef)) fail('INVALID_INPUT');
  let store: InvocationReceiptStore;
  try { store = new InvocationReceiptStore(projectRoot, { readOnly: true }); }
  catch { return fail('STORE_UNAVAILABLE'); }
  try {
    const ref = input.receiptRef;
    if (ref.schemaVersion !== INVOCATION_RECEIPT_SCHEMA_VERSION || ref.tenantId !== input.tenantId
      || ref.projectId !== store.projectId || !validText(ref.invocationId)) fail('RECEIPT_MISMATCH');
    let view;
    try { view = store.get(ref, ref.invocationId); }
    catch (error) {
      if (error instanceof InvocationReceiptStoreError && error.code === 'INTEGRITY_FAILURE') fail('RECEIPT_INTEGRITY_FAILURE');
      throw error;
    }
    if (!view) fail('RECEIPT_UNAVAILABLE');
    const receipt = view.receipt;
    if (receipt.runId !== `${input.flowId}:revision:${input.revision}` || receipt.taskId !== null || receipt.role !== 'brain'
      || receipt.purpose !== 'sprint-planning' || receipt.invocationId !== ref.invocationId
      || receipt.tenantId !== ref.tenantId || receipt.projectId !== ref.projectId
      || receipt.called.provider === null || receipt.called.model === null) fail('RECEIPT_MISMATCH');
    const dispatch = view.events.find(event => event.type === 'dispatch_started');
    const terminal = view.events.at(-1);
    if (!dispatch || view.transportOutcome !== 'succeeded' || view.consumerOutcome !== 'accepted'
      || terminal?.type !== 'consumer_settled') fail('INVOCATION_UNSETTLED');
    const dispatchPayload = dispatch.payload as { calledProvider?: string; calledModel?: string };
    if (dispatchPayload.calledProvider !== receipt.called.provider || dispatchPayload.calledModel !== receipt.called.model) fail('RECEIPT_MISMATCH');
    const terminalPayload = terminal.payload as { evidenceRefs?: readonly string[] };
    const expectedEvidence = `planner-result:sha256:${input.plannerResultSha256}`;
    const resultRefs = (terminalPayload.evidenceRefs ?? []).filter(refValue => refValue.startsWith('planner-result:sha256:'));
    if (resultRefs.length !== 1 || resultRefs[0] !== expectedEvidence) fail('RESULT_EVIDENCE_MISMATCH');
    const binding: PlannerInvocationBindingV1 = {
      schemaVersion: 1, flowId: input.flowId, revision: input.revision,
      receiptRef: { ...ref },
      receiptSha256: createHash('sha256').update(canonicalJson(receipt)).digest('hex'),
      terminalEventHash: terminal.hash,
      plannerResultSha256: input.plannerResultSha256,
      directivesSha256: input.directivesSha256,
    };
    return Object.freeze({ ...binding, receiptRef: Object.freeze({ ...binding.receiptRef }) });
  } finally { store.close(); }
}

export function verifyPlannerInvocationBinding(
  projectRoot: string,
  binding: PlannerInvocationBindingV1,
  expected: { readonly flowId: string; readonly revision: number; readonly tenantId: string },
): PlannerInvocationBindingV1 {
  if (!isPlannerInvocationBinding(binding) || binding.flowId !== expected.flowId
    || binding.revision !== expected.revision || binding.receiptRef.tenantId !== expected.tenantId) fail('BINDING_MISMATCH');
  const actual = createPlannerInvocationBinding(projectRoot, {
    flowId: expected.flowId, revision: expected.revision, tenantId: expected.tenantId,
    receiptRef: binding.receiptRef, plannerResultSha256: binding.plannerResultSha256,
    directivesSha256: binding.directivesSha256,
  });
  if (canonicalJson(actual) !== canonicalJson(binding)) fail('BINDING_MISMATCH');
  return actual;
}
