import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmodSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { AcceptanceConfirmationLineage } from './acceptance-confirmation-contract.js';
import { crossVerifyVerdictReceiptRef, readCrossVerifyVerdictReceipt } from './cross-verify-evidence-broker.js';
import type { TaskResultSettlementRefV1 } from './task-result-settlement.js';

const VERSION = 1 as const;
const DIGEST_RE = /^[a-f0-9]{64}$/;
const RECEIPT_REF_RE = /^cross-verify-verdict:sha256:[a-f0-9]{64}$/;

export interface LlmAcceptanceDecisionBindingV1 {
  readonly version: typeof VERSION; readonly kind: 'llm-acceptance-decision-binding';
  readonly confirmationId: string; readonly lineage: AcceptanceConfirmationLineage;
  readonly verdict: 'CONFIRMED' | 'FAILED'; readonly receiptRef: string;
  readonly settlementRef: TaskResultSettlementRefV1; readonly bindingSha256: string;
}
export interface AcceptanceAuthorityDecision {
  readonly confirmationId: string; readonly lineage: AcceptanceConfirmationLineage;
  readonly verdict: 'CONFIRMED' | 'QUALIFIED' | 'FAILED'; readonly decidedAt: string;
  readonly authorityReceipt: string;
}
export type AcceptanceDecisionAuthorityFactory =
  | { readonly branch: 'human'; verify(decision: AcceptanceAuthorityDecision): boolean | Promise<boolean> }
  | { readonly branch: 'llm'; readonly projectRoot: string };

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
};
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const sameBytes = (a: string, b: string): boolean => { const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y); };
const bindingPath = (root: string, id: string): string => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('invalid acceptance confirmation id');
  return join(root, '.deckent', 'private', 'acceptance-decision-authority', `${id}.json`);
};
const sameRef = (a: TaskResultSettlementRefV1, b: TaskResultSettlementRefV1): boolean =>
  a.schemaVersion === b.schemaVersion && a.taskId === b.taskId && a.backend === b.backend
  && a.projectRootSha256 === b.projectRootSha256 && a.attemptId === b.attemptId;
const expectedVerdict = (verdict: AcceptanceAuthorityDecision['verdict']) => verdict === 'CONFIRMED' ? 'CONFIRMED' : 'REFUTED';

function parseBinding(value: unknown): LlmAcceptanceDecisionBindingV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid authority binding');
  const record = value as Record<string, unknown>;
  const expected = ['bindingSha256', 'confirmationId', 'kind', 'lineage', 'receiptRef', 'settlementRef', 'verdict', 'version'].sort();
  if (canonical(Object.keys(record).sort()) !== canonical(expected) || record.version !== VERSION
    || record.kind !== 'llm-acceptance-decision-binding' || typeof record.confirmationId !== 'string'
    || (record.verdict !== 'CONFIRMED' && record.verdict !== 'FAILED') || typeof record.receiptRef !== 'string'
    || !RECEIPT_REF_RE.test(record.receiptRef)
    || typeof record.bindingSha256 !== 'string' || !DIGEST_RE.test(record.bindingSha256)) throw new Error('invalid authority binding schema');
  const binding = record as unknown as LlmAcceptanceDecisionBindingV1;
  const { bindingSha256: _digest, ...payload } = binding;
  if (!sameBytes(binding.bindingSha256, sha256(canonical(payload)))) throw new Error('authority binding digest mismatch');
  return binding;
}

export function writeLlmAcceptanceDecisionBindingFirstWriterWins(input: {
  readonly projectRoot: string; readonly confirmationId: string; readonly lineage: AcceptanceConfirmationLineage;
  readonly verdict: 'CONFIRMED' | 'FAILED'; readonly receiptRef: string; readonly settlementRef: TaskResultSettlementRefV1;
}): LlmAcceptanceDecisionBindingV1 {
  const receipt = readCrossVerifyVerdictReceipt(input.projectRoot, input.settlementRef);
  if (crossVerifyVerdictReceiptRef(receipt) !== input.receiptRef || !sameRef(receipt.receipt, input.settlementRef)
    || receipt.receipt.effectiveVerdict !== expectedVerdict(input.verdict))
    throw new Error('LLM authority evidence mismatch');
  const payload = { version: VERSION, kind: 'llm-acceptance-decision-binding' as const,
    confirmationId: input.confirmationId, lineage: input.lineage, verdict: input.verdict,
    receiptRef: input.receiptRef, settlementRef: input.settlementRef };
  const binding: LlmAcceptanceDecisionBindingV1 = Object.freeze({ ...payload, bindingSha256: sha256(canonical(payload)) });
  const path = bindingPath(input.projectRoot, input.confirmationId); mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700); const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, `${canonical(binding)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try { linkSync(temp, path); } catch (error) {
      const current = readLlmAcceptanceDecisionBinding(input.projectRoot, input.confirmationId);
      if (!sameBytes(canonical(current), canonical(binding))) throw error;
    }
  } finally { try { unlinkSync(temp); } catch { /* absent */ } }
  return readLlmAcceptanceDecisionBinding(input.projectRoot, input.confirmationId);
}

export function readLlmAcceptanceDecisionBinding(projectRoot: string, confirmationId: string): LlmAcceptanceDecisionBindingV1 {
  return parseBinding(JSON.parse(readFileSync(bindingPath(projectRoot, confirmationId), 'utf8')));
}
export function verifyLlmAcceptanceDecision(projectRoot: string, decision: AcceptanceAuthorityDecision): boolean {
  try {
    const binding = readLlmAcceptanceDecisionBinding(projectRoot, decision.confirmationId);
    if (canonical(binding.lineage) !== canonical(decision.lineage) || binding.verdict !== decision.verdict
      || binding.receiptRef !== decision.authorityReceipt) return false;
    const receipt = readCrossVerifyVerdictReceipt(projectRoot, binding.settlementRef);
    return sameRef(receipt.receipt, binding.settlementRef)
      && receipt.receipt.effectiveVerdict === expectedVerdict(binding.verdict)
      && binding.receiptRef === `cross-verify-verdict:sha256:${receipt.verdictReceiptSha256}`
      && crossVerifyVerdictReceiptRef(receipt) === binding.receiptRef;
  } catch { return false; }
}
export function createAcceptanceDecisionAuthorityVerifier(factory: AcceptanceDecisionAuthorityFactory) {
  return (decision: AcceptanceAuthorityDecision): boolean | Promise<boolean> => factory.branch === 'human'
    ? factory.verify(decision) : verifyLlmAcceptanceDecision(factory.projectRoot, decision);
}
