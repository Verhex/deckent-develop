import { types as nodeTypes } from 'node:util';

import type {
  ExactAcceptedTaskResultAuthorityMetadata,
  ExactTaskResultAuthorityMetadata,
} from './task-result-authority.js';
import type { ExactTaskTerminalDecisionAuthorityV2 } from './task-settlement-projection.js';

/** T11-owned terminal settlement authority over one exact accepted result. */
export interface ExactAcceptedResultTerminalAuthorityV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-accepted-result-terminal-authority-v2';
  readonly acceptedAuthority: ExactAcceptedTaskResultAuthorityMetadata;
  /** Must originate from readExactSettledTaskResult/core custody inspection. */
  readonly terminalResultAuthority: ExactTaskResultAuthorityMetadata;
  /** Must originate from the T11 receipt parser over that exact artifact. */
  readonly terminalDecisionAuthority: ExactTaskTerminalDecisionAuthorityV2;
}

export type SettleExactAcceptedResultOutcome =
  | {
      readonly state: 'settled';
      readonly authority: ExactAcceptedResultTerminalAuthorityV2;
    }
  | {
      readonly state: 'route-required';
      readonly reasonCode?: string;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode: string;
    };

export type SettleExactAcceptedResult = (input: {
  readonly acceptedAuthority: ExactAcceptedTaskResultAuthorityMetadata;
}) => SettleExactAcceptedResultOutcome | Promise<SettleExactAcceptedResultOutcome>;

export type RevalidateExactAcceptedResultTerminalAuthority = (input: {
  readonly taskId: string;
  readonly expectedAcceptedAuthority: ExactAcceptedTaskResultAuthorityMetadata;
  readonly expectedTerminalAuthority: ExactAcceptedResultTerminalAuthorityV2;
}) =>
  | {
      readonly state: 'current';
      readonly terminalAuthority: ExactAcceptedResultTerminalAuthorityV2;
    }
  | { readonly state: 'hold'; readonly reasonCode: string }
  | Promise<
      | {
          readonly state: 'current';
          readonly terminalAuthority: ExactAcceptedResultTerminalAuthorityV2;
        }
      | { readonly state: 'hold'; readonly reasonCode: string }
    >;

function isSha256Digest(value: unknown): value is `sha256:${string}` {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

const EXACT_AUTHORITY_MAX_DEPTH = 12;
const EXACT_AUTHORITY_MAX_NODES = 4096;
const EXACT_AUTHORITY_MAX_KEYS_PER_OBJECT = 64;
const EXACT_AUTHORITY_MAX_TOTAL_KEYS = 512;
const EXACT_AUTHORITY_MAX_STRING_BYTES = 32 * 1024;
const EXACT_AUTHORITY_MAX_TOTAL_STRING_BYTES = 256 * 1024;

interface ExactAuthorityPlainDataBudget {
  nodes: number;
  keys: number;
  stringBytes: number;
  active: WeakSet<object>;
}

function consumeExactAuthorityString(
  value: string,
  budget: ExactAuthorityPlainDataBudget,
): boolean {
  if (value.length > EXACT_AUTHORITY_MAX_STRING_BYTES) return false;
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes > EXACT_AUTHORITY_MAX_STRING_BYTES) return false;
  budget.stringBytes += bytes;
  return budget.stringBytes <= EXACT_AUTHORITY_MAX_TOTAL_STRING_BYTES;
}

function isPlainData(
  value: unknown,
  depth = 0,
  budget: ExactAuthorityPlainDataBudget = {
    nodes: 0,
    keys: 0,
    stringBytes: 0,
    active: new WeakSet<object>(),
  },
): boolean {
  budget.nodes += 1;
  if (budget.nodes > EXACT_AUTHORITY_MAX_NODES || depth > EXACT_AUTHORITY_MAX_DEPTH) {
    return false;
  }
  if (value === null) return true;
  if (typeof value === 'string') return consumeExactAuthorityString(value, budget);
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || Array.isArray(value) || nodeTypes.isProxy(value)) return false;
  if (budget.active.has(value)) return false;
  budget.active.add(value);
  try {
    let keys: readonly PropertyKey[];
    try {
      keys = Reflect.ownKeys(value);
    } catch {
      return false;
    }
    if (keys.length > EXACT_AUTHORITY_MAX_KEYS_PER_OBJECT) return false;
    budget.keys += keys.length;
    if (budget.keys > EXACT_AUTHORITY_MAX_TOTAL_KEYS) return false;
    for (const key of keys) {
      if (typeof key !== 'string' || !consumeExactAuthorityString(key, budget)) return false;
    }

    let prototype: object | null;
    let descriptors: Record<string, PropertyDescriptor>;
    try {
      prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return false;
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      return false;
    }
    return keys.every(key => {
      const descriptor = descriptors[key as string];
      return descriptor !== undefined
        && descriptor.get === undefined
        && descriptor.set === undefined
        && descriptor.enumerable === true
        && 'value' in descriptor
        && isPlainData(descriptor.value, depth + 1, budget);
    });
  } finally {
    budget.active.delete(value);
  }
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  if (nodeTypes.isProxy(value)) return false;
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  if (keys.length !== expected.length) return false;
  const expectedKeys = new Set(expected);
  return keys.every(key => typeof key === 'string' && expectedKeys.has(key));
}

/** Bounded plain-data guard shared by collector revalidation envelopes. */
export function isBoundedExactAuthorityPlainData(value: unknown): boolean {
  return isPlainData(value);
}

/** Exact enumerable string-key guard shared by collector revalidation envelopes. */
export function hasExactAuthorityKeys(
  value: object,
  expected: readonly string[],
): boolean {
  return exactKeys(value, expected);
}

function isPositiveByteLength(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isExactCustodyIdentity(value: unknown): boolean {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !exactKeys(value, [
      'schemaVersion',
      'backend',
      'projectRootSha256',
      'projectId',
      'taskId',
      'attemptId',
      'generation',
    ])
    || !isPlainData(value)
  ) return false;
  const identity = value as Record<string, unknown>;
  return identity.schemaVersion === 2
    && identity.backend === 'docker'
    && typeof identity.projectRootSha256 === 'string'
    && /^[a-f0-9]{64}$/u.test(identity.projectRootSha256)
    && typeof identity.projectId === 'string'
    && identity.projectId.length > 0
    && typeof identity.taskId === 'string'
    && identity.taskId.length > 0
    && typeof identity.attemptId === 'string'
    && identity.attemptId.length > 0
    && Number.isSafeInteger(identity.generation)
    && Number(identity.generation) > 0;
}

function isExactAuthorityArtifact(value: unknown): boolean {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !exactKeys(value, [
      'artifactReceiptDigest',
      'chainDigest',
      'artifactSha256',
      'byteLength',
    ])
    || !isPlainData(value)
  ) return false;
  const artifact = value as Record<string, unknown>;
  return isSha256Digest(artifact.artifactReceiptDigest)
    && isSha256Digest(artifact.chainDigest)
    && isSha256Digest(artifact.artifactSha256)
    && isPositiveByteLength(artifact.byteLength);
}

function isExactAcceptedAuthorityMetadata(
  value: unknown,
): value is ExactAcceptedTaskResultAuthorityMetadata {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !exactKeys(value, [
      'executionMode',
      'identity',
      'admissionReceiptDigest',
      'acceptedResultRef',
      'acceptedResultChainDigest',
      'resultDigest',
    ])
    || !isPlainData(value)
  ) return false;
  const accepted = value as Record<string, unknown>;
  const ref = accepted.acceptedResultRef;
  if (
    !isExactCustodyIdentity(accepted.identity)
    || ref === null
    || typeof ref !== 'object'
    || Array.isArray(ref)
    || !exactKeys(ref, [
      'schemaVersion',
      'kind',
      'identity',
      'artifactKey',
      'artifactReceiptDigest',
    ])
    || !isPlainData(ref)
  ) return false;
  const acceptedRef = ref as Record<string, unknown>;
  return accepted.executionMode === 'normal-docker'
    && isSha256Digest(accepted.admissionReceiptDigest)
    && acceptedRef.schemaVersion === 2
    && acceptedRef.kind === 'task-accepted-result-v2-ref'
    && isExactCustodyIdentity(acceptedRef.identity)
    && JSON.stringify(acceptedRef.identity) === JSON.stringify(accepted.identity)
    && typeof acceptedRef.artifactKey === 'string'
    && acceptedRef.artifactKey.length > 0
    && isSha256Digest(acceptedRef.artifactReceiptDigest)
    && isSha256Digest(accepted.acceptedResultChainDigest)
    && isSha256Digest(accepted.resultDigest);
}

function isExactTerminalAuthorityMetadata(
  value: unknown,
): value is ExactTaskResultAuthorityMetadata {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !exactKeys(value, [
      'executionMode',
      'identity',
      'admissionReceiptDigest',
      'settlementRef',
      'settlementDigest',
      'resultDigest',
      'acceptedResultChainDigest',
      'evaluationChainDigest',
      'finalizerChainDigest',
      'evaluationArtifact',
      'finalizerArtifact',
    ])
    || !isPlainData(value)
  ) return false;
  const terminal = value as Record<string, unknown>;
  const ref = terminal.settlementRef;
  if (
    !isExactCustodyIdentity(terminal.identity)
    || ref === null
    || typeof ref !== 'object'
    || Array.isArray(ref)
    || !exactKeys(ref, [
      'schemaVersion',
      'kind',
      'identity',
      'artifactKey',
      'artifactReceiptDigest',
    ])
    || !isPlainData(ref)
  ) return false;
  const settlementRef = ref as Record<string, unknown>;
  return terminal.executionMode === 'normal-docker'
    && isSha256Digest(terminal.admissionReceiptDigest)
    && settlementRef.schemaVersion === 2
    && settlementRef.kind === 'task-result-settlement-v2-ref'
    && isExactCustodyIdentity(settlementRef.identity)
    && JSON.stringify(settlementRef.identity) === JSON.stringify(terminal.identity)
    && typeof settlementRef.artifactKey === 'string'
    && settlementRef.artifactKey.length > 0
    && isSha256Digest(settlementRef.artifactReceiptDigest)
    && isSha256Digest(terminal.settlementDigest)
    && isSha256Digest(terminal.resultDigest)
    && isSha256Digest(terminal.acceptedResultChainDigest)
    && isSha256Digest(terminal.evaluationChainDigest)
    && isSha256Digest(terminal.finalizerChainDigest)
    && isExactAuthorityArtifact(terminal.evaluationArtifact)
    && isExactAuthorityArtifact(terminal.finalizerArtifact);
}

/**
 * Strict, bounded parser predicate for the single exact accepted-result terminal
 * authority. Callers must still re-read the referenced Store artifacts before
 * using the value; structural validity is not durable freshness.
 */
export function isExactAcceptedResultTerminalAuthorityV2(
  value: unknown,
  expected: ExactAcceptedTaskResultAuthorityMetadata,
): value is ExactAcceptedResultTerminalAuthorityV2 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  if (!exactKeys(value, [
    'schemaVersion',
    'kind',
    'acceptedAuthority',
    'terminalResultAuthority',
    'terminalDecisionAuthority',
  ]) || !isPlainData(value)) return false;
  const candidate = value as Partial<ExactAcceptedResultTerminalAuthorityV2>;
  const terminal = candidate.terminalResultAuthority;
  const decision = candidate.terminalDecisionAuthority;
  return candidate.schemaVersion === 2
    && candidate.kind === 'exact-accepted-result-terminal-authority-v2'
    && isExactAcceptedAuthorityMetadata(candidate.acceptedAuthority)
    && JSON.stringify(candidate.acceptedAuthority) === JSON.stringify(expected)
    && isExactTerminalAuthorityMetadata(terminal)
    && decision !== undefined
    && decision !== null
    && typeof decision === 'object'
    && exactKeys(decision, [
      'schemaVersion',
      'kind',
      'identity',
      'evaluationReceipt',
      'finalizerReceipt',
    ])
    && decision.schemaVersion === 2
    && decision.kind === 'exact-task-terminal-decision-authority-v2'
    && exactKeys(decision.evaluationReceipt, [
      'verdict',
      'artifactReceiptDigest',
      'artifactSha256',
      'byteLength',
      'chainDigest',
    ])
    && exactKeys(decision.finalizerReceipt, [
      'state',
      'artifactReceiptDigest',
      'artifactSha256',
      'byteLength',
      'chainDigest',
    ])
    && isExactCustodyIdentity(decision.identity)
    && JSON.stringify(terminal.identity) === JSON.stringify(expected.identity)
    && terminal.admissionReceiptDigest === expected.admissionReceiptDigest
    && terminal.acceptedResultChainDigest === expected.acceptedResultChainDigest
    && terminal.resultDigest === expected.resultDigest
    && isSha256Digest(terminal.settlementDigest)
    && JSON.stringify(terminal.settlementRef.identity) === JSON.stringify(expected.identity)
    && JSON.stringify(decision.identity) === JSON.stringify(expected.identity)
    && (
      decision.evaluationReceipt.verdict === 'DONE'
      || decision.evaluationReceipt.verdict === 'GO_WITH_TECH_DEBT'
      || decision.evaluationReceipt.verdict === 'NO_GO'
    )
    && decision.evaluationReceipt.artifactReceiptDigest
      === terminal.evaluationArtifact.artifactReceiptDigest
    && decision.evaluationReceipt.artifactSha256
      === terminal.evaluationArtifact.artifactSha256
    && decision.evaluationReceipt.byteLength === terminal.evaluationArtifact.byteLength
    && decision.evaluationReceipt.chainDigest === terminal.evaluationChainDigest
    && decision.evaluationReceipt.chainDigest === terminal.evaluationArtifact.chainDigest
    && decision.finalizerReceipt.state === 'terminal-ready'
    && decision.finalizerReceipt.artifactReceiptDigest
      === terminal.finalizerArtifact.artifactReceiptDigest
    && decision.finalizerReceipt.artifactSha256 === terminal.finalizerArtifact.artifactSha256
    && decision.finalizerReceipt.byteLength === terminal.finalizerArtifact.byteLength
    && decision.finalizerReceipt.chainDigest === terminal.finalizerChainDigest
    && decision.finalizerReceipt.chainDigest === terminal.finalizerArtifact.chainDigest;
}
