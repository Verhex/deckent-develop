import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';

import { canonicalJson } from '../core/audit-writer.js';
import type { Sha256Digest } from '../core/task-attempt-custody-store.js';
import {
  isExactAcceptedResultTerminalAuthorityV2,
  type ExactAcceptedResultTerminalAuthorityV2,
} from './exact-accepted-result-terminal-authority.js';

const REPAIR_AUTHORITY_KIND = 'exact-repair-birth-authority-v1' as const;
const REPAIR_SUPERSESSION_KIND = 'exact-repair-supersession-authority-v1' as const;
const REPAIR_FINGERPRINT_DOMAIN = 'deckent:exact-repair-failure:v1';
const REPAIR_RECEIPT_DOMAIN = 'deckent:exact-repair-birth:v1';
const REPAIR_SUPERSESSION_RECEIPT_DOMAIN = 'deckent:exact-repair-supersession:v1';
const SAFE_TASK_FRAGMENT = /[^A-Za-z0-9._-]+/gu;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const MAX_TEXT_BYTES = 4096;
const MAX_EVIDENCE_ITEMS = 1024;
const MAX_PLAIN_DEPTH = 16;
const MAX_PLAIN_NODES = 16_384;
const MAX_PLAIN_KEYS = 16_384;
const MAX_ARRAY_LENGTH = 4096;
const MAX_OBJECT_KEYS = 128;
const MAX_TOTAL_STRING_BYTES = 1024 * 1024;

export type ExactRepairKind = 'FIX' | 'XFIX';
export type ExactRepairFailureDomain = 'PRODUCT_DEFECT' | 'AUTHORITY' | 'EXECUTION';
export type ExactRepairCriterionOutcome = 'FAILED' | 'MISSING' | 'CONTRADICTED';
export type ExactRepairVerificationOutcome = 'FAILED' | 'NOT_EXECUTED';

export interface ExactRepairFailedCriterionV1 {
  readonly criterionId: string;
  readonly outcome: ExactRepairCriterionOutcome;
  /** Digest of host-parsed structured evidence, never worker prose. */
  readonly evidenceDigest: Sha256Digest;
}

export interface ExactRepairVerificationCheckV1 {
  /** Digest of the exact admitted command, not its display text. */
  readonly commandDigest: Sha256Digest;
  readonly outcome: ExactRepairVerificationOutcome;
  /** Digest of immutable host-observed command evidence. */
  readonly evidenceDigest: Sha256Digest;
}

export interface ExactRepairSemanticEvidenceV1 {
  readonly schemaVersion: 1;
  readonly kind: 'exact-repair-semantic-evidence-v1';
  /** Exact acceptance contract evaluated by the immutable evaluation artifact. */
  readonly acceptanceContractDigest: Sha256Digest;
  /** Must equal the failed terminal authority's evaluation artifact digest. */
  readonly sourceEvaluationArtifactSha256: Sha256Digest;
  readonly failedCriteria: readonly ExactRepairFailedCriterionV1[];
  readonly verificationChecks: readonly ExactRepairVerificationCheckV1[];
  /** Host-observed execution-effect evidence for the failed attempt. */
  readonly effectEvidenceDigest: Sha256Digest;
}

export interface ExactRepairTerminalBindingV1 {
  readonly identity: ExactAcceptedResultTerminalAuthorityV2['terminalResultAuthority']['identity'];
  readonly admissionReceiptDigest: Sha256Digest;
  readonly acceptedResultArtifactReceiptDigest: Sha256Digest;
  readonly acceptedResultChainDigest: Sha256Digest;
  readonly resultDigest: Sha256Digest;
  readonly settlementArtifactReceiptDigest: Sha256Digest;
  readonly settlementDigest: Sha256Digest;
  readonly evaluationArtifactReceiptDigest: Sha256Digest;
  readonly evaluationArtifactSha256: Sha256Digest;
  readonly evaluationChainDigest: Sha256Digest;
  readonly finalizerArtifactReceiptDigest: Sha256Digest;
  readonly finalizerArtifactSha256: Sha256Digest;
  readonly finalizerChainDigest: Sha256Digest;
  readonly verdict: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
}

export interface ExactRepairBirthAuthorityV1 {
  readonly schemaVersion: 1;
  readonly kind: typeof REPAIR_AUTHORITY_KIND;
  readonly repairKind: ExactRepairKind;
  readonly failureDomain: 'PRODUCT_DEFECT';
  readonly sprintId: string;
  readonly lineageRootTaskId: string;
  readonly failedTaskId: string;
  readonly targetTaskId: string;
  readonly failedTerminal: ExactRepairTerminalBindingV1;
  readonly targetTerminal: ExactRepairTerminalBindingV1 | null;
  readonly evidence: ExactRepairSemanticEvidenceV1;
  /** Stable across attempt IDs and prose/timestamp changes. */
  readonly semanticFailureFingerprint: Sha256Digest;
  readonly predecessorRepairReceiptDigest: Sha256Digest | null;
  readonly childTaskId: string;
  readonly receiptDigest: Sha256Digest;
}

export interface ExactRepairSupersededDescendantV1 {
  readonly childTaskId: string;
  readonly repairBirthReceiptDigest: Sha256Digest;
}

/**
 * Immutable decision that retires only queued repair descendants of one exact
 * accepted resolving attempt. T12 owns applying this decision at the dispatch
 * boundary; public task status is never the decision authority.
 */
export interface ExactRepairSupersessionAuthorityV1 {
  readonly schemaVersion: 1;
  readonly kind: typeof REPAIR_SUPERSESSION_KIND;
  readonly sprintId: string;
  readonly lineageRootTaskId: string;
  readonly acceptedResolvingTaskId: string;
  readonly acceptedTerminal: ExactRepairTerminalBindingV1;
  readonly supersededDescendants: readonly ExactRepairSupersededDescendantV1[];
  readonly receiptDigest: Sha256Digest;
}

export type ExactRepairBirthHoldReason =
  | 'INVALID_TERMINAL_AUTHORITY'
  | 'FAILED_ATTEMPT_NOT_NO_GO'
  | 'INVALID_SEMANTIC_EVIDENCE'
  | 'NON_PRODUCT_FAILURE_HOLD'
  | 'INVALID_REPAIR_TARGET'
  | 'TARGET_NOT_ACCEPTED'
  | 'INVALID_PREDECESSOR_AUTHORITY'
  | 'UNCHANGED_EVIDENCE_HOLD';

export type ExactRepairBirthDecision =
  | {
      readonly state: 'admitted';
      readonly authority: ExactRepairBirthAuthorityV1;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode: ExactRepairBirthHoldReason;
      readonly semanticFailureFingerprint?: Sha256Digest;
    };

export interface ResolveExactRepairBirthAuthorityInput {
  readonly repairKind: ExactRepairKind;
  readonly failureDomain: ExactRepairFailureDomain;
  readonly sprintId: string;
  readonly lineageRootTaskId: string;
  readonly failedTaskId: string;
  readonly targetTaskId: string;
  /** T11-revalidated immutable failed attempt authority. */
  readonly failedTerminalAuthority: ExactAcceptedResultTerminalAuthorityV2;
  /** Required only for XFIX; must be an accepted DONE/GO target authority. */
  readonly targetTerminalAuthority?: ExactAcceptedResultTerminalAuthorityV2 | null;
  /** Host-parsed semantics from the failed evaluation/finalizer artifacts. */
  readonly evidence: ExactRepairSemanticEvidenceV1;
  readonly predecessorRepairAuthority?: ExactRepairBirthAuthorityV1 | null;
}

export interface ResolveExactRepairSupersessionAuthorityInput {
  readonly sprintId: string;
  readonly lineageRootTaskId: string;
  readonly acceptedResolvingTaskId: string;
  readonly acceptedTerminalAuthority: ExactAcceptedResultTerminalAuthorityV2;
  /** Complete bounded repair-birth lineage visible to the canonical consumer. */
  readonly repairBirthAuthorities: readonly ExactRepairBirthAuthorityV1[];
}

export type ExactRepairSupersessionDecision =
  | { readonly state: 'admitted'; readonly authority: ExactRepairSupersessionAuthorityV1 }
  | {
      readonly state: 'hold';
      readonly reasonCode:
        | 'INVALID_ACCEPTED_TERMINAL_AUTHORITY'
        | 'INVALID_REPAIR_LINEAGE'
        | 'REPAIR_LINEAGE_LIMIT';
    };

interface PlainBudget {
  nodes: number;
  keys: number;
  stringBytes: number;
  active: WeakSet<object>;
}

function isSha256(value: unknown): value is Sha256Digest {
  return typeof value === 'string' && SHA256.test(value);
}

function isBoundedText(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value === value.normalize('NFC').trim()
    && Buffer.byteLength(value, 'utf8') <= MAX_TEXT_BYTES;
}

function consumeText(value: string, budget: PlainBudget): boolean {
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes > MAX_TEXT_BYTES) return false;
  budget.stringBytes += bytes;
  return budget.stringBytes <= MAX_TOTAL_STRING_BYTES;
}

function isBoundedPlainData(
  value: unknown,
  depth = 0,
  budget: PlainBudget = {
    nodes: 0,
    keys: 0,
    stringBytes: 0,
    active: new WeakSet<object>(),
  },
): boolean {
  budget.nodes += 1;
  if (budget.nodes > MAX_PLAIN_NODES || depth > MAX_PLAIN_DEPTH) return false;
  if (value === null) return true;
  if (typeof value === 'string') return consumeText(value, budget);
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || nodeTypes.isProxy(value)) return false;
  if (budget.active.has(value)) return false;
  budget.active.add(value);
  try {
    let keys: readonly PropertyKey[];
    let descriptors: Record<string, PropertyDescriptor>;
    try {
      keys = Reflect.ownKeys(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      return false;
    }
    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_LENGTH || keys.length !== value.length + 1) return false;
      if (!keys.every((key, index) => key === String(index) || key === 'length')) return false;
      return value.every((entry, index) => {
        const descriptor = descriptors[String(index)];
        return descriptor !== undefined
          && descriptor.get === undefined
          && descriptor.set === undefined
          && descriptor.enumerable === true
          && 'value' in descriptor
          && isBoundedPlainData(entry, depth + 1, budget);
      });
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    if (keys.length > MAX_OBJECT_KEYS) return false;
    budget.keys += keys.length;
    if (budget.keys > MAX_PLAIN_KEYS) return false;
    return keys.every(key => {
      if (typeof key !== 'string' || !consumeText(key, budget)) return false;
      const descriptor = descriptors[key];
      return descriptor !== undefined
        && descriptor.get === undefined
        && descriptor.set === undefined
        && descriptor.enumerable === true
        && 'value' in descriptor
        && isBoundedPlainData(descriptor.value, depth + 1, budget);
    });
  } finally {
    budget.active.delete(value);
  }
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  if (nodeTypes.isProxy(value)) return false;
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  const set = new Set(expected);
  return keys.length === expected.length
    && keys.every(key => typeof key === 'string' && set.has(key));
}

function digest(domain: string, value: unknown): Sha256Digest {
  return `sha256:${createHash('sha256')
    .update(domain, 'utf8')
    .update('\0', 'utf8')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function normalizeCriterion(
  value: unknown,
): ExactRepairFailedCriterionV1 | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || !hasExactKeys(value, ['criterionId', 'outcome', 'evidenceDigest'])) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.criterionId !== 'string') return null;
  const criterionId = candidate.criterionId.normalize('NFC').trim();
  if (
    !isBoundedText(criterionId)
    || !['FAILED', 'MISSING', 'CONTRADICTED'].includes(candidate.outcome as string)
    || !isSha256(candidate.evidenceDigest)
  ) return null;
  return Object.freeze({
    criterionId,
    outcome: candidate.outcome as ExactRepairCriterionOutcome,
    evidenceDigest: candidate.evidenceDigest,
  });
}

function normalizeCheck(
  value: unknown,
): ExactRepairVerificationCheckV1 | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || !hasExactKeys(value, ['commandDigest', 'outcome', 'evidenceDigest'])) return null;
  const candidate = value as Record<string, unknown>;
  if (
    !isSha256(candidate.commandDigest)
    || !['FAILED', 'NOT_EXECUTED'].includes(candidate.outcome as string)
    || !isSha256(candidate.evidenceDigest)
  ) return null;
  return Object.freeze({
    commandDigest: candidate.commandDigest,
    outcome: candidate.outcome as ExactRepairVerificationOutcome,
    evidenceDigest: candidate.evidenceDigest,
  });
}

function normalizeEvidence(
  value: ExactRepairSemanticEvidenceV1,
  failed: ExactAcceptedResultTerminalAuthorityV2,
): ExactRepairSemanticEvidenceV1 | null {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !hasExactKeys(value, [
      'schemaVersion',
      'kind',
      'acceptanceContractDigest',
      'sourceEvaluationArtifactSha256',
      'failedCriteria',
      'verificationChecks',
      'effectEvidenceDigest',
    ])
    || !isBoundedPlainData(value)
    || value.schemaVersion !== 1
    || value.kind !== 'exact-repair-semantic-evidence-v1'
    || !isSha256(value.acceptanceContractDigest)
    || !isSha256(value.sourceEvaluationArtifactSha256)
    || value.sourceEvaluationArtifactSha256
      !== failed.terminalResultAuthority.evaluationArtifact.artifactSha256
    || !Array.isArray(value.failedCriteria)
    || !Array.isArray(value.verificationChecks)
    || value.failedCriteria.length > MAX_EVIDENCE_ITEMS
    || value.verificationChecks.length > MAX_EVIDENCE_ITEMS
    || !isSha256(value.effectEvidenceDigest)
  ) return null;

  const criteria = value.failedCriteria.map(normalizeCriterion);
  const checks = value.verificationChecks.map(normalizeCheck);
  if (criteria.some(item => item === null) || checks.some(item => item === null)) return null;
  const normalizedCriteria = criteria as ExactRepairFailedCriterionV1[];
  const normalizedChecks = checks as ExactRepairVerificationCheckV1[];
  const criterionKeys = normalizedCriteria.map(item => `${item.criterionId}\0${item.outcome}\0${item.evidenceDigest}`);
  const checkKeys = normalizedChecks.map(item => `${item.commandDigest}\0${item.outcome}\0${item.evidenceDigest}`);
  if (new Set(criterionKeys).size !== criterionKeys.length
    || new Set(checkKeys).size !== checkKeys.length) return null;
  normalizedCriteria.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  normalizedChecks.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  if (normalizedCriteria.length === 0 && normalizedChecks.length === 0) return null;
  return Object.freeze({
    schemaVersion: 1,
    kind: 'exact-repair-semantic-evidence-v1',
    acceptanceContractDigest: value.acceptanceContractDigest,
    sourceEvaluationArtifactSha256: value.sourceEvaluationArtifactSha256,
    failedCriteria: Object.freeze(normalizedCriteria),
    verificationChecks: Object.freeze(normalizedChecks),
    effectEvidenceDigest: value.effectEvidenceDigest,
  });
}

function terminalBinding(
  authority: ExactAcceptedResultTerminalAuthorityV2,
): ExactRepairTerminalBindingV1 {
  const accepted = authority.acceptedAuthority;
  const terminal = authority.terminalResultAuthority;
  const decision = authority.terminalDecisionAuthority;
  return Object.freeze({
    identity: Object.freeze({ ...terminal.identity }),
    admissionReceiptDigest: terminal.admissionReceiptDigest,
    acceptedResultArtifactReceiptDigest: accepted.acceptedResultRef.artifactReceiptDigest,
    acceptedResultChainDigest: terminal.acceptedResultChainDigest,
    resultDigest: terminal.resultDigest,
    settlementArtifactReceiptDigest: terminal.settlementRef.artifactReceiptDigest,
    settlementDigest: terminal.settlementDigest,
    evaluationArtifactReceiptDigest: terminal.evaluationArtifact.artifactReceiptDigest,
    evaluationArtifactSha256: terminal.evaluationArtifact.artifactSha256,
    evaluationChainDigest: terminal.evaluationChainDigest,
    finalizerArtifactReceiptDigest: terminal.finalizerArtifact.artifactReceiptDigest,
    finalizerArtifactSha256: terminal.finalizerArtifact.artifactSha256,
    finalizerChainDigest: terminal.finalizerChainDigest,
    verdict: decision.evaluationReceipt.verdict,
  });
}

function semanticFingerprint(
  evidence: ExactRepairSemanticEvidenceV1,
): Sha256Digest {
  return digest(REPAIR_FINGERPRINT_DOMAIN, {
    acceptanceContractDigest: evidence.acceptanceContractDigest,
    failedCriteria: evidence.failedCriteria,
    verificationChecks: evidence.verificationChecks,
    effectEvidenceDigest: evidence.effectEvidenceDigest,
  });
}

function taskFragment(value: string): string | null {
  if (!isBoundedText(value)) return null;
  const safe = value.normalize('NFKC').replace(SAFE_TASK_FRAGMENT, '-').replace(/^-+|-+$/gu, '');
  return safe.length > 0 ? safe.slice(0, 64) : null;
}

function repairChildTaskId(
  lineageRootTaskId: string,
  repairKind: ExactRepairKind,
  failedTaskId: string,
  targetTaskId: string,
  fingerprint: Sha256Digest,
): string | null {
  const root = taskFragment(lineageRootTaskId);
  if (!root) return null;
  const suffix = digest('deckent:exact-repair-child-id:v1', {
    lineageRootTaskId,
    repairKind,
    failedTaskId,
    targetTaskId,
    semanticFailureFingerprint: fingerprint,
  }).slice('sha256:'.length, 'sha256:'.length + 24);
  return `${root}-${repairKind.toLowerCase()}-${suffix}`;
}

function validTerminal(
  authority: ExactAcceptedResultTerminalAuthorityV2,
  expectedTaskId: string,
): boolean {
  if (authority === null || typeof authority !== 'object' || Array.isArray(authority)) return false;
  return isExactAcceptedResultTerminalAuthorityV2(authority, authority.acceptedAuthority)
    && authority.acceptedAuthority.identity.taskId === expectedTaskId
    && authority.terminalResultAuthority.identity.taskId === expectedTaskId
    && sameJson(authority.acceptedAuthority.identity, authority.terminalResultAuthority.identity)
    && sameJson(authority.acceptedAuthority.identity, authority.terminalDecisionAuthority.identity);
}

function receiptBody(authority: Omit<ExactRepairBirthAuthorityV1, 'receiptDigest'>): unknown {
  return authority;
}

/**
 * Admit one finite FIX/XFIX birth from immutable terminal evidence. Numeric retry
 * counts, worker prose, timestamps and public result bytes are intentionally absent.
 */
export function resolveExactRepairBirthAuthority(
  input: ResolveExactRepairBirthAuthorityInput,
): ExactRepairBirthDecision {
  if (!validTerminal(input.failedTerminalAuthority, input.failedTaskId)) {
    return { state: 'hold', reasonCode: 'INVALID_TERMINAL_AUTHORITY' };
  }
  if (input.failedTerminalAuthority.terminalDecisionAuthority.evaluationReceipt.verdict !== 'NO_GO') {
    return { state: 'hold', reasonCode: 'FAILED_ATTEMPT_NOT_NO_GO' };
  }
  const evidence = normalizeEvidence(input.evidence, input.failedTerminalAuthority);
  if (!evidence) return { state: 'hold', reasonCode: 'INVALID_SEMANTIC_EVIDENCE' };
  const fingerprint = semanticFingerprint(evidence);
  if (input.failureDomain !== 'PRODUCT_DEFECT') {
    return {
      state: 'hold',
      reasonCode: 'NON_PRODUCT_FAILURE_HOLD',
      semanticFailureFingerprint: fingerprint,
    };
  }
  if (
    !isBoundedText(input.sprintId)
    || !isBoundedText(input.lineageRootTaskId)
    || !isBoundedText(input.failedTaskId)
    || !isBoundedText(input.targetTaskId)
  ) return { state: 'hold', reasonCode: 'INVALID_REPAIR_TARGET' };

  let targetTerminal: ExactRepairTerminalBindingV1 | null = null;
  if (input.repairKind === 'FIX') {
    if (input.targetTaskId !== input.failedTaskId || input.targetTerminalAuthority != null) {
      return { state: 'hold', reasonCode: 'INVALID_REPAIR_TARGET' };
    }
  } else if (input.repairKind === 'XFIX') {
    const target = input.targetTerminalAuthority;
    if (!target || input.targetTaskId === input.failedTaskId
      || !validTerminal(target, input.targetTaskId)) {
      return { state: 'hold', reasonCode: 'INVALID_REPAIR_TARGET' };
    }
    const failedIdentity = input.failedTerminalAuthority.acceptedAuthority.identity;
    const targetIdentity = target.acceptedAuthority.identity;
    if (failedIdentity.projectRootSha256 !== targetIdentity.projectRootSha256
      || failedIdentity.projectId !== targetIdentity.projectId) {
      return { state: 'hold', reasonCode: 'INVALID_REPAIR_TARGET' };
    }
    const targetVerdict = target.terminalDecisionAuthority.evaluationReceipt.verdict;
    if (targetVerdict !== 'DONE' && targetVerdict !== 'GO_WITH_TECH_DEBT') {
      return { state: 'hold', reasonCode: 'TARGET_NOT_ACCEPTED' };
    }
    targetTerminal = terminalBinding(target);
  } else {
    return { state: 'hold', reasonCode: 'INVALID_REPAIR_TARGET' };
  }

  let predecessorRepairReceiptDigest: Sha256Digest | null = null;
  if (!input.predecessorRepairAuthority && input.failedTaskId !== input.lineageRootTaskId) {
    return { state: 'hold', reasonCode: 'INVALID_PREDECESSOR_AUTHORITY' };
  }
  if (input.predecessorRepairAuthority) {
    const predecessor = input.predecessorRepairAuthority;
    const currentProject = input.failedTerminalAuthority.acceptedAuthority.identity;
    if (!isExactRepairBirthAuthorityV1(predecessor)
      || predecessor.sprintId !== input.sprintId
      || predecessor.repairKind !== input.repairKind
      || predecessor.lineageRootTaskId !== input.lineageRootTaskId
      || predecessor.childTaskId !== input.failedTaskId
      || predecessor.failedTerminal.identity.projectRootSha256 !== currentProject.projectRootSha256
      || predecessor.failedTerminal.identity.projectId !== currentProject.projectId
      || (input.repairKind === 'XFIX' && predecessor.targetTaskId !== input.targetTaskId)) {
      return { state: 'hold', reasonCode: 'INVALID_PREDECESSOR_AUTHORITY' };
    }
    if (predecessor.semanticFailureFingerprint === fingerprint) {
      return {
        state: 'hold',
        reasonCode: 'UNCHANGED_EVIDENCE_HOLD',
        semanticFailureFingerprint: fingerprint,
      };
    }
    predecessorRepairReceiptDigest = predecessor.receiptDigest;
  }

  const childTaskId = repairChildTaskId(
    input.lineageRootTaskId,
    input.repairKind,
    input.failedTaskId,
    input.targetTaskId,
    fingerprint,
  );
  if (!childTaskId) return { state: 'hold', reasonCode: 'INVALID_REPAIR_TARGET' };
  const withoutReceipt: Omit<ExactRepairBirthAuthorityV1, 'receiptDigest'> = {
    schemaVersion: 1,
    kind: REPAIR_AUTHORITY_KIND,
    repairKind: input.repairKind,
    failureDomain: 'PRODUCT_DEFECT',
    sprintId: input.sprintId,
    lineageRootTaskId: input.lineageRootTaskId,
    failedTaskId: input.failedTaskId,
    targetTaskId: input.targetTaskId,
    failedTerminal: terminalBinding(input.failedTerminalAuthority),
    targetTerminal,
    evidence,
    semanticFailureFingerprint: fingerprint,
    predecessorRepairReceiptDigest,
    childTaskId,
  };
  const authority: ExactRepairBirthAuthorityV1 = Object.freeze({
    ...withoutReceipt,
    receiptDigest: digest(REPAIR_RECEIPT_DOMAIN, receiptBody(withoutReceipt)),
  });
  return { state: 'admitted', authority };
}

/**
 * Decide which queued descendants are redundant after one exact repair attempt
 * has durably settled DONE/GO_WITH_TECH_DEBT. The returned receipt is a pure
 * decision; applying PAUSED/cancellation remains a T12 dispatch-boundary job.
 */
export function resolveExactRepairSupersessionAuthority(
  input: ResolveExactRepairSupersessionAuthorityInput,
): ExactRepairSupersessionDecision {
  if (
    !isBoundedText(input.sprintId)
    || !isBoundedText(input.lineageRootTaskId)
    || !isBoundedText(input.acceptedResolvingTaskId)
    || !validTerminal(input.acceptedTerminalAuthority, input.acceptedResolvingTaskId)
  ) return { state: 'hold', reasonCode: 'INVALID_ACCEPTED_TERMINAL_AUTHORITY' };
  const verdict = input.acceptedTerminalAuthority.terminalDecisionAuthority.evaluationReceipt.verdict;
  if (verdict !== 'DONE' && verdict !== 'GO_WITH_TECH_DEBT') {
    return { state: 'hold', reasonCode: 'INVALID_ACCEPTED_TERMINAL_AUTHORITY' };
  }
  if (!Array.isArray(input.repairBirthAuthorities)
    || input.repairBirthAuthorities.length > MAX_EVIDENCE_ITEMS) {
    return { state: 'hold', reasonCode: 'REPAIR_LINEAGE_LIMIT' };
  }

  const acceptedIdentity = input.acceptedTerminalAuthority.acceptedAuthority.identity;
  const byReceipt = new Map<Sha256Digest, ExactRepairBirthAuthorityV1>();
  for (const authority of input.repairBirthAuthorities) {
    if (!isExactRepairBirthAuthorityV1(authority)
      || authority.sprintId !== input.sprintId
      || authority.lineageRootTaskId !== input.lineageRootTaskId
      || (authority.predecessorRepairReceiptDigest === null
        && authority.failedTaskId !== authority.lineageRootTaskId)
      || authority.failedTerminal.identity.projectRootSha256 !== acceptedIdentity.projectRootSha256
      || authority.failedTerminal.identity.projectId !== acceptedIdentity.projectId
      || byReceipt.has(authority.receiptDigest)) {
      return { state: 'hold', reasonCode: 'INVALID_REPAIR_LINEAGE' };
    }
    byReceipt.set(authority.receiptDigest, authority);
  }
  for (const authority of input.repairBirthAuthorities) {
    const predecessorDigest = authority.predecessorRepairReceiptDigest;
    if (predecessorDigest === null) continue;
    const predecessor = byReceipt.get(predecessorDigest);
    if (!predecessor
      || predecessor.childTaskId !== authority.failedTaskId
      || predecessor.repairKind !== authority.repairKind
      || (authority.repairKind === 'XFIX'
        && predecessor.targetTaskId !== authority.targetTaskId)) {
      return { state: 'hold', reasonCode: 'INVALID_REPAIR_LINEAGE' };
    }
  }

  const supersededDescendants: ExactRepairSupersededDescendantV1[] = [];
  for (const candidate of input.repairBirthAuthorities) {
    let current: ExactRepairBirthAuthorityV1 | undefined = candidate;
    const visited = new Set<Sha256Digest>();
    let isDescendant = false;
    for (let depth = 0; current && depth <= input.repairBirthAuthorities.length; depth += 1) {
      if (visited.has(current.receiptDigest)) {
        return { state: 'hold', reasonCode: 'INVALID_REPAIR_LINEAGE' };
      }
      visited.add(current.receiptDigest);
      if (current.failedTaskId === input.acceptedResolvingTaskId) {
        isDescendant = true;
        break;
      }
      const predecessorDigest = current.predecessorRepairReceiptDigest;
      if (predecessorDigest === null) break;
      const predecessor = byReceipt.get(predecessorDigest);
      if (!predecessor || predecessor.childTaskId !== current.failedTaskId) {
        return { state: 'hold', reasonCode: 'INVALID_REPAIR_LINEAGE' };
      }
      current = predecessor;
    }
    if (isDescendant) {
      supersededDescendants.push(Object.freeze({
        childTaskId: candidate.childTaskId,
        repairBirthReceiptDigest: candidate.receiptDigest,
      }));
    }
  }
  supersededDescendants.sort((left, right) =>
    canonicalJson(left).localeCompare(canonicalJson(right)));
  if (new Set(supersededDescendants.map(entry => entry.childTaskId)).size
    !== supersededDescendants.length) {
    return { state: 'hold', reasonCode: 'INVALID_REPAIR_LINEAGE' };
  }

  const withoutReceipt: Omit<ExactRepairSupersessionAuthorityV1, 'receiptDigest'> = {
    schemaVersion: 1,
    kind: REPAIR_SUPERSESSION_KIND,
    sprintId: input.sprintId,
    lineageRootTaskId: input.lineageRootTaskId,
    acceptedResolvingTaskId: input.acceptedResolvingTaskId,
    acceptedTerminal: terminalBinding(input.acceptedTerminalAuthority),
    supersededDescendants: Object.freeze(supersededDescendants),
  };
  return {
    state: 'admitted',
    authority: Object.freeze({
      ...withoutReceipt,
      receiptDigest: digest(REPAIR_SUPERSESSION_RECEIPT_DOMAIN, withoutReceipt),
    }),
  };
}

function isTerminalBinding(value: unknown): value is ExactRepairTerminalBindingV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || !hasExactKeys(value, [
      'identity',
      'admissionReceiptDigest',
      'acceptedResultArtifactReceiptDigest',
      'acceptedResultChainDigest',
      'resultDigest',
      'settlementArtifactReceiptDigest',
      'settlementDigest',
      'evaluationArtifactReceiptDigest',
      'evaluationArtifactSha256',
      'evaluationChainDigest',
      'finalizerArtifactReceiptDigest',
      'finalizerArtifactSha256',
      'finalizerChainDigest',
      'verdict',
    ])) return false;
  const candidate = value as Record<string, unknown>;
  const identity = candidate.identity;
  return identity !== null
    && typeof identity === 'object'
    && !Array.isArray(identity)
    && hasExactKeys(identity, [
      'schemaVersion', 'backend', 'projectRootSha256', 'projectId', 'taskId', 'attemptId', 'generation',
    ])
    && (identity as Record<string, unknown>).schemaVersion === 2
    && (identity as Record<string, unknown>).backend === 'docker'
    && typeof (identity as Record<string, unknown>).projectRootSha256 === 'string'
    && /^[a-f0-9]{64}$/u.test((identity as Record<string, unknown>).projectRootSha256 as string)
    && isBoundedText((identity as Record<string, unknown>).projectId)
    && isBoundedText((identity as Record<string, unknown>).taskId)
    && isBoundedText((identity as Record<string, unknown>).attemptId)
    && Number.isSafeInteger((identity as Record<string, unknown>).generation)
    && Number((identity as Record<string, unknown>).generation) > 0
    && [
      'admissionReceiptDigest',
      'acceptedResultArtifactReceiptDigest',
      'acceptedResultChainDigest',
      'resultDigest',
      'settlementArtifactReceiptDigest',
      'settlementDigest',
      'evaluationArtifactReceiptDigest',
      'evaluationArtifactSha256',
      'evaluationChainDigest',
      'finalizerArtifactReceiptDigest',
      'finalizerArtifactSha256',
      'finalizerChainDigest',
    ].every(key => isSha256(candidate[key]))
    && ['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO'].includes(candidate.verdict as string);
}

/** Strict parser for persisted repair birth receipts and no-clobber comparison. */
export function isExactRepairBirthAuthorityV1(
  value: unknown,
): value is ExactRepairBirthAuthorityV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || !hasExactKeys(value, [
      'schemaVersion',
      'kind',
      'repairKind',
      'failureDomain',
      'sprintId',
      'lineageRootTaskId',
      'failedTaskId',
      'targetTaskId',
      'failedTerminal',
      'targetTerminal',
      'evidence',
      'semanticFailureFingerprint',
      'predecessorRepairReceiptDigest',
      'childTaskId',
      'receiptDigest',
    ])
    || !isBoundedPlainData(value)) return false;
  const candidate = value as ExactRepairBirthAuthorityV1;
  if (candidate.schemaVersion !== 1
    || candidate.kind !== REPAIR_AUTHORITY_KIND
    || (candidate.repairKind !== 'FIX' && candidate.repairKind !== 'XFIX')
    || candidate.failureDomain !== 'PRODUCT_DEFECT'
    || !isBoundedText(candidate.sprintId)
    || !isBoundedText(candidate.lineageRootTaskId)
    || !isBoundedText(candidate.failedTaskId)
    || !isBoundedText(candidate.targetTaskId)
    || !isTerminalBinding(candidate.failedTerminal)
    || (candidate.targetTerminal !== null && !isTerminalBinding(candidate.targetTerminal))
    || !isSha256(candidate.semanticFailureFingerprint)
    || (candidate.predecessorRepairReceiptDigest !== null
      && !isSha256(candidate.predecessorRepairReceiptDigest))
    || !isBoundedText(candidate.childTaskId)
    || !isSha256(candidate.receiptDigest)) return false;

  if (candidate.repairKind === 'FIX') {
    if (candidate.targetTaskId !== candidate.failedTaskId || candidate.targetTerminal !== null) return false;
  } else {
    if (candidate.targetTaskId === candidate.failedTaskId
      || candidate.targetTerminal === null
      || (candidate.targetTerminal.verdict !== 'DONE'
        && candidate.targetTerminal.verdict !== 'GO_WITH_TECH_DEBT')) return false;
  }
  if (candidate.failedTerminal.verdict !== 'NO_GO'
    || candidate.failedTerminal.identity.taskId !== candidate.failedTaskId
    || (candidate.predecessorRepairReceiptDigest === null
      && candidate.failedTaskId !== candidate.lineageRootTaskId)
    || (candidate.targetTerminal !== null
      && candidate.targetTerminal.identity.taskId !== candidate.targetTaskId)) return false;
  const normalizedEvidence = normalizeEvidenceShape(candidate.evidence);
  if (!normalizedEvidence || !sameJson(normalizedEvidence, candidate.evidence)) return false;
  if (normalizedEvidence.sourceEvaluationArtifactSha256
    !== candidate.failedTerminal.evaluationArtifactSha256) return false;
  if (candidate.targetTerminal !== null
    && (
      candidate.targetTerminal.identity.projectRootSha256
        !== candidate.failedTerminal.identity.projectRootSha256
      || candidate.targetTerminal.identity.projectId !== candidate.failedTerminal.identity.projectId
    )) return false;
  const fingerprint = semanticFingerprint(normalizedEvidence);
  if (fingerprint !== candidate.semanticFailureFingerprint) return false;
  const { receiptDigest, ...withoutReceipt } = candidate;
  return receiptDigest === digest(REPAIR_RECEIPT_DOMAIN, receiptBody(withoutReceipt))
    && candidate.childTaskId
      === repairChildTaskId(
        candidate.lineageRootTaskId,
        candidate.repairKind,
        candidate.failedTaskId,
        candidate.targetTaskId,
        fingerprint,
      );
}

/** Strict parser for a persisted descendant-supersession decision receipt. */
export function isExactRepairSupersessionAuthorityV1(
  value: unknown,
): value is ExactRepairSupersessionAuthorityV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || !hasExactKeys(value, [
      'schemaVersion',
      'kind',
      'sprintId',
      'lineageRootTaskId',
      'acceptedResolvingTaskId',
      'acceptedTerminal',
      'supersededDescendants',
      'receiptDigest',
    ])
    || !isBoundedPlainData(value)) return false;
  const candidate = value as ExactRepairSupersessionAuthorityV1;
  if (candidate.schemaVersion !== 1
    || candidate.kind !== REPAIR_SUPERSESSION_KIND
    || !isBoundedText(candidate.sprintId)
    || !isBoundedText(candidate.lineageRootTaskId)
    || !isBoundedText(candidate.acceptedResolvingTaskId)
    || !isTerminalBinding(candidate.acceptedTerminal)
    || candidate.acceptedTerminal.identity.taskId !== candidate.acceptedResolvingTaskId
    || (candidate.acceptedTerminal.verdict !== 'DONE'
      && candidate.acceptedTerminal.verdict !== 'GO_WITH_TECH_DEBT')
    || !Array.isArray(candidate.supersededDescendants)
    || candidate.supersededDescendants.length > MAX_EVIDENCE_ITEMS
    || !isSha256(candidate.receiptDigest)) return false;
  const normalized: ExactRepairSupersededDescendantV1[] = [];
  for (const descendant of candidate.supersededDescendants) {
    if (descendant === null || typeof descendant !== 'object' || Array.isArray(descendant)
      || !hasExactKeys(descendant, ['childTaskId', 'repairBirthReceiptDigest'])
      || !isBoundedText(descendant.childTaskId)
      || !isSha256(descendant.repairBirthReceiptDigest)) return false;
    normalized.push({
      childTaskId: descendant.childTaskId,
      repairBirthReceiptDigest: descendant.repairBirthReceiptDigest,
    });
  }
  normalized.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  if (!sameJson(normalized, candidate.supersededDescendants)
    || new Set(normalized.map(entry => entry.childTaskId)).size !== normalized.length
    || new Set(normalized.map(entry => entry.repairBirthReceiptDigest)).size !== normalized.length) {
    return false;
  }
  const { receiptDigest, ...withoutReceipt } = candidate;
  return receiptDigest === digest(REPAIR_SUPERSESSION_RECEIPT_DOMAIN, withoutReceipt);
}

function normalizeEvidenceShape(
  value: ExactRepairSemanticEvidenceV1,
): ExactRepairSemanticEvidenceV1 | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || !hasExactKeys(value, [
      'schemaVersion', 'kind', 'acceptanceContractDigest', 'sourceEvaluationArtifactSha256',
      'failedCriteria', 'verificationChecks', 'effectEvidenceDigest',
    ])
    || value.schemaVersion !== 1
    || value.kind !== 'exact-repair-semantic-evidence-v1'
    || !isSha256(value.acceptanceContractDigest)
    || !isSha256(value.sourceEvaluationArtifactSha256)
    || !isSha256(value.effectEvidenceDigest)
    || !Array.isArray(value.failedCriteria)
    || !Array.isArray(value.verificationChecks)
    || value.failedCriteria.length > MAX_EVIDENCE_ITEMS
    || value.verificationChecks.length > MAX_EVIDENCE_ITEMS) return null;
  const criteria = value.failedCriteria.map(normalizeCriterion);
  const checks = value.verificationChecks.map(normalizeCheck);
  if (criteria.some(item => item === null) || checks.some(item => item === null)) return null;
  const normalizedCriteria = criteria as ExactRepairFailedCriterionV1[];
  const normalizedChecks = checks as ExactRepairVerificationCheckV1[];
  normalizedCriteria.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  normalizedChecks.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  if (normalizedCriteria.length === 0 && normalizedChecks.length === 0) return null;
  if (new Set(normalizedCriteria.map(item => canonicalJson(item))).size !== normalizedCriteria.length
    || new Set(normalizedChecks.map(item => canonicalJson(item))).size !== normalizedChecks.length) return null;
  return {
    schemaVersion: 1,
    kind: 'exact-repair-semantic-evidence-v1',
    acceptanceContractDigest: value.acceptanceContractDigest,
    sourceEvaluationArtifactSha256: value.sourceEvaluationArtifactSha256,
    failedCriteria: normalizedCriteria,
    verificationChecks: normalizedChecks,
    effectEvidenceDigest: value.effectEvidenceDigest,
  };
}
