import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmodSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { acceptanceConfirmationDigest, canonicalAcceptanceConfirmationJson, deriveAcceptanceConfirmationId,
  parseAcceptanceConfirmationLineage, type AcceptanceConfirmationLineage } from './acceptance-confirmation-contract.js';
import { crossVerifyVerdictReceiptRef, readCrossVerifyVerdictReceipt, readCrossVerifyEvidenceBlobBytes,
  readCrossVerifyEvidenceClaimReceipt, readCrossVerifyEvidenceReceipt } from './cross-verify-evidence-broker.js';
import { canonicalJson } from './audit-writer.js';
import { deriveCrossVerifyAdjudicationV2, digestCrossVerifyAdjudicationContractV2, parseCrossVerifyClaimV2 } from './cross-verify-adjudication.js';
import { DeckentError } from './errors.js';
import { readClosedTaskResultSettlement, readTaskProviderActualCallReceipt,
  readTaskProviderTerminalUsageReceipt, readTaskResultSettlementExecutionContract,
  type TaskResultSettlementRefV1 } from './task-result-settlement.js';
import { parseCrossVerifyAdjudicationOutputV2, frameTerminalAdjudicationProtocol } from './cross-verify-prompt.js';
import { EXACT_ACCEPTANCE_BINDING_RELATIVE_PATH, EXACT_ACCEPTANCE_CLAIM_RELATIVE_PATH,
  createExactAcceptanceAdjudicationContractV2,
  digestExactAcceptanceEvidenceV2,
  parseExactAcceptanceVerificationBindingV2,
  type ExactAcceptanceVerificationBindingV2 } from './exact-acceptance-verification-contract.js';

const VERSION = 1 as const;
const DIGEST_RE = /^[a-f0-9]{64}$/;
const RECEIPT_REF_RE = /^cross-verify-verdict:sha256:[a-f0-9]{64}$/;

export interface LlmAcceptanceDecisionBindingV1 {
  readonly version: typeof VERSION; readonly kind: 'llm-acceptance-decision-binding';
  readonly confirmationId: string; readonly lineage: AcceptanceConfirmationLineage;
  readonly verdict: 'CONFIRMED' | 'FAILED'; readonly receiptRef: string;
  readonly settlementRef: TaskResultSettlementRefV1; readonly bindingSha256: string;
  readonly exactBinding?: ExactAcceptanceVerificationBindingV2;
}
export interface AcceptanceAuthorityDecision {
  readonly confirmationId: string; readonly lineage: AcceptanceConfirmationLineage;
  readonly verdict: 'CONFIRMED' | 'QUALIFIED' | 'FAILED'; readonly decidedAt: string;
  readonly authorityReceipt: string;
}
export type AcceptanceDecisionAuthorityFactory =
  | { readonly branch: 'human'; verify(decision: AcceptanceAuthorityDecision): boolean | Promise<boolean> }
  | { readonly branch: 'llm'; readonly projectRoot: string;
      readonly readExactBinding?: () => ExactAcceptanceVerificationBindingV2 | null };

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
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new DeckentError('ACCEPTANCE_CONFIRMATION_ID_INVALID', 'invalid acceptance confirmation id');
  }
  return join(root, '.deckent', 'private', 'acceptance-decision-authority', `${id}.json`);
};
const sameRef = (a: TaskResultSettlementRefV1, b: TaskResultSettlementRefV1): boolean =>
  a.schemaVersion === b.schemaVersion && a.taskId === b.taskId && a.backend === b.backend
  && a.projectRootSha256 === b.projectRootSha256 && a.attemptId === b.attemptId;
const expectedVerdict = (verdict: AcceptanceAuthorityDecision['verdict']) => verdict === 'CONFIRMED' ? 'CONFIRMED' : 'REFUTED';

function parseBinding(value: unknown): LlmAcceptanceDecisionBindingV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DeckentError('ACCEPTANCE_AUTHORITY_BINDING_INVALID', 'invalid authority binding');
  }
  const record = value as Record<string, unknown>;
  const expected = ['bindingSha256', 'confirmationId', 'kind', 'lineage', 'receiptRef', 'settlementRef', 'verdict', 'version',
    ...(Object.hasOwn(record, 'exactBinding') ? ['exactBinding'] : [])].sort();
  if (canonical(Object.keys(record).sort()) !== canonical(expected) || record.version !== VERSION
    || record.kind !== 'llm-acceptance-decision-binding' || typeof record.confirmationId !== 'string'
    || (record.verdict !== 'CONFIRMED' && record.verdict !== 'FAILED') || typeof record.receiptRef !== 'string'
    || !RECEIPT_REF_RE.test(record.receiptRef)
    || typeof record.bindingSha256 !== 'string' || !DIGEST_RE.test(record.bindingSha256)) {
    throw new DeckentError('ACCEPTANCE_AUTHORITY_BINDING_SCHEMA_INVALID', 'invalid authority binding schema');
  }
  const binding = record as unknown as LlmAcceptanceDecisionBindingV1;
  const { bindingSha256: _digest, ...payload } = binding;
  if (!sameBytes(binding.bindingSha256, sha256(canonical(payload)))) {
    throw new DeckentError('ACCEPTANCE_AUTHORITY_BINDING_DIGEST_MISMATCH', 'authority binding digest mismatch');
  }
  return binding;
}

export function writeLlmAcceptanceDecisionBindingFirstWriterWins(input: {
  readonly projectRoot: string; readonly confirmationId: string; readonly lineage: AcceptanceConfirmationLineage;
  readonly verdict: 'CONFIRMED' | 'FAILED'; readonly receiptRef: string; readonly settlementRef: TaskResultSettlementRefV1;
  readonly exactBinding?: ExactAcceptanceVerificationBindingV2;
}): LlmAcceptanceDecisionBindingV1 {
  const receipt = readCrossVerifyVerdictReceipt(input.projectRoot, input.settlementRef);
  if (crossVerifyVerdictReceiptRef(receipt) !== input.receiptRef || !sameRef(receipt.receipt, input.settlementRef)
    || receipt.receipt.effectiveVerdict !== expectedVerdict(input.verdict))
    throw new DeckentError('ACCEPTANCE_LLM_AUTHORITY_EVIDENCE_MISMATCH', 'LLM authority evidence mismatch');
  if (input.exactBinding && !verifyExactEvidence(input.projectRoot, input, input.exactBinding)) {
    throw new DeckentError('ACCEPTANCE_LLM_AUTHORITY_EVIDENCE_MISMATCH', 'Exact semantic acceptance authority evidence mismatch');
  }
  const payload = { version: VERSION, kind: 'llm-acceptance-decision-binding' as const,
    confirmationId: input.confirmationId, lineage: input.lineage, verdict: input.verdict,
    receiptRef: input.receiptRef, settlementRef: input.settlementRef,
    ...(input.exactBinding ? { exactBinding: input.exactBinding } : {}) };
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
    // The stored record cannot serve as its own independent expected producer authority.
    if (binding.exactBinding) return false;
    const receipt = readCrossVerifyVerdictReceipt(projectRoot, binding.settlementRef);
    return sameRef(receipt.receipt, binding.settlementRef)
      && receipt.receipt.effectiveVerdict === expectedVerdict(binding.verdict)
      && binding.receiptRef === `cross-verify-verdict:sha256:${receipt.verdictReceiptSha256}`
      && crossVerifyVerdictReceiptRef(receipt) === binding.receiptRef;
  } catch { return false; }
}

/**
 * Exact V2 confirmation requires an independently re-issued current producer binding.
 * A genuine verifier receipt is not authority to attach arbitrary semantic lineage.
 */
export function verifyExactLlmAcceptanceDecision(
  projectRoot: string,
  decision: AcceptanceAuthorityDecision,
  expectedBinding: ExactAcceptanceVerificationBindingV2,
): boolean {
  try {
    const parsedExpected = parseExactAcceptanceVerificationBindingV2(expectedBinding);
    if (!parsedExpected) return false;
    const binding = readLlmAcceptanceDecisionBinding(projectRoot, decision.confirmationId);
    return binding.exactBinding !== undefined
      && canonicalAcceptanceConfirmationJson(binding.exactBinding) === canonicalAcceptanceConfirmationJson(parsedExpected)
      && canonicalAcceptanceConfirmationJson(binding.lineage) === canonicalAcceptanceConfirmationJson(decision.lineage)
      && binding.verdict === decision.verdict && binding.receiptRef === decision.authorityReceipt
      && verifyExactEvidence(projectRoot, binding, parsedExpected);
  } catch { return false; }
}

function verifyExactEvidence(
  projectRoot: string,
  decision: Pick<LlmAcceptanceDecisionBindingV1, 'confirmationId' | 'lineage' | 'verdict' | 'receiptRef' | 'settlementRef'>,
  expected: ExactAcceptanceVerificationBindingV2,
): boolean {
  try {
    if (!parseExactAcceptanceVerificationBindingV2(expected)) return false;
    const parsed = parseAcceptanceConfirmationLineage(expected.lineage);
    const { bindingDigest, ...payload } = expected;
    if (!parsed.ok || expected.schemaVersion !== 2
      || expected.kind !== 'exact-acceptance-verification-binding-v2'
      || !DIGEST_RE.test(bindingDigest) || acceptanceConfirmationDigest(payload) !== bindingDigest
      || deriveAcceptanceConfirmationId(parsed.value) !== expected.confirmationId
      || expected.confirmationId !== decision.confirmationId
      || canonicalAcceptanceConfirmationJson(expected.lineage) !== canonicalAcceptanceConfirmationJson(decision.lineage)
      || expected.acceptedAuthority.identity.projectRootSha256 !== decision.settlementRef.projectRootSha256
      || expected.acceptedAuthority.identity.taskId !== expected.lineage.taskId
      || expected.acceptedAuthority.identity.attemptId !== expected.lineage.attemptId
      || expected.acceptedAuthority.identity.generation !== expected.lineage.generation) return false;
    const contract = readTaskResultSettlementExecutionContract(decision.settlementRef);
    const closed = readClosedTaskResultSettlement(decision.settlementRef);
    const actual = readTaskProviderActualCallReceipt(decision.settlementRef);
    const usage = readTaskProviderTerminalUsageReceipt(decision.settlementRef);
    const verdict = readCrossVerifyVerdictReceipt(projectRoot, decision.settlementRef);
    const claim = readCrossVerifyEvidenceClaimReceipt(projectRoot, decision.settlementRef);
    if (!contract || contract.schemaVersion !== 2 || !closed || closed.exitCode !== 0 || !actual || !usage
      || usage.counters.totalTokens <= 0
      || actual.provider === expected.producerProvider || contract.provider !== actual.provider
      || contract.tenantId !== expected.lineage.tenantId || contract.projectId !== expected.lineage.projectId
      || contract.fenceTokenHash !== verdict.receipt.fenceTokenHash
      || contract.adjudication.producerSettlementDigest !== `sha256:${bindingDigest}`
      || contract.adjudication.claimDigest !== expected.semanticClaimDigest
      || claim.claim.immutableSourceBindingDigest !== bindingDigest
      || contract.adjudication.evidenceBrokerManifestSha256 !== verdict.receipt.evidenceManifestSha256
      || contract.adjudication.evidenceBrokerRef !== `cross-verify-evidence-manifest:sha256:${verdict.receipt.evidenceManifestSha256}`
      || crossVerifyVerdictReceiptRef(verdict) !== decision.receiptRef
      || verdict.receipt.effectiveVerdict !== expectedVerdict(decision.verdict)
      || !sameRef(verdict.receipt, decision.settlementRef)) return false;
    const envelope = readCrossVerifyEvidenceBlobBytes(projectRoot, decision.settlementRef, EXACT_ACCEPTANCE_BINDING_RELATIVE_PATH);
    if (!Buffer.from(envelope).equals(Buffer.from(canonicalAcceptanceConfirmationJson(expected), 'utf8'))) return false;
    const projection = closed.result['hostTerminalProjection'];
    if (!projection || typeof projection !== 'object' || Array.isArray(projection)) return false;
    const host = projection as Record<string, unknown>;
    const notes = closed.result['notes'];
    if (host.version !== 1 || host.protocol !== 'xverify-v1' || host.observedBy !== 'host' || typeof notes !== 'string') return false;
    const output = frameTerminalAdjudicationProtocol(notes);
    if (output === null || sha256(output) !== verdict.receipt.outputSha256
      || Buffer.byteLength(output, 'utf8') !== verdict.receipt.outputByteLength) return false;
    const parsedOutput = parseCrossVerifyAdjudicationOutputV2(output);
    const semanticClaim = JSON.parse(Buffer.from(readCrossVerifyEvidenceBlobBytes(
      projectRoot, decision.settlementRef, EXACT_ACCEPTANCE_CLAIM_RELATIVE_PATH,
    )).toString('utf8')) as unknown;
    const snapshot = readCrossVerifyEvidenceReceipt(projectRoot, decision.settlementRef);
    if (digestExactAcceptanceEvidenceV2(snapshot.manifest.entries) !== expected.evidenceDigest) return false;
    const semanticContract = createExactAcceptanceAdjudicationContractV2(parseCrossVerifyClaimV2(semanticClaim), snapshot.manifest.entries);
    if (semanticContract.claimDigest !== expected.semanticClaimDigest
      || semanticContract.evidenceManifestDigest !== contract.adjudication.evidenceManifestDigest
      || digestCrossVerifyAdjudicationContractV2(semanticContract) !== contract.adjudication.adjudicationContractDigest) return false;
    const adjudication = deriveCrossVerifyAdjudicationV2({ contract: semanticContract,
      response: parsedOutput.response, responseParseError: parsedOutput.error,
      executionOutcome: 'completed', providerDeclaredVerdict: parsedOutput.providerDeclaredVerdict });
    return adjudication.verdict.toUpperCase() === expectedVerdict(decision.verdict)
      && adjudication.verdict !== 'unclear'
      && sha256(canonicalJson(adjudication)) === verdict.receipt.adjudicationReceiptSha256;
  } catch { return false; }
}
export function createAcceptanceDecisionAuthorityVerifier(factory: AcceptanceDecisionAuthorityFactory) {
  return (decision: AcceptanceAuthorityDecision): boolean | Promise<boolean> => {
    if (factory.branch === 'human') return factory.verify(decision);
    if (!factory.readExactBinding) return verifyLlmAcceptanceDecision(factory.projectRoot, decision);
    try {
      const expected = factory.readExactBinding();
      return expected !== null && verifyExactLlmAcceptanceDecision(factory.projectRoot, decision, expected);
    } catch { return false; }
  };
}
