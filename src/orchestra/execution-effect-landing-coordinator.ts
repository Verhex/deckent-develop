import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { posix } from 'node:path';
import { types as nodeTypes } from 'node:util';

import {
  evaluateExecutionEffectContainment,
  parseExecutionEffectManifest,
  type ExecutionEffect,
  type ExecutionEffectContainmentDecision,
  type ExecutionEffectManifest,
  type ExecutionEffectManifestEntry,
} from '../core/execution-effect-containment.js';
import {
  createExecutionEffectLandingLeaseResumeContextV1,
  createExecutionEffectLandingDerivedParentProvenanceV1,
  createExecutionEffectLandingReceiptV1,
  createExecutionEffectStagedChunkRefV1,
  executionEffectLandingIntentDigestV1,
  executionEffectLandingOperationDigestV1,
  executionEffectStageAuthorityDigestV1,
  parseExecutionEffectLandingLeaseResumeResultV1,
  type ExecutionEffectPersistenceDigest,
  type ExecutionEffectLandingBoundaryV1,
  type ExecutionEffectLandingDerivedParentProvenanceV1,
  type ExecutionEffectLandingLeaseAdapterV1,
  type ExecutionEffectLandingLeaseCapabilityV1,
  type ExecutionEffectLandingLeaseJournalRefV1,
  type ExecutionEffectLandingLeaseResumeContextV1,
  type ExecutionEffectLandingLeaseResumeResultV1,
  type ExecutionEffectLandingLeaseTerminalV1,
  type ExecutionEffectLandingLeaseV1,
  type ExecutionEffectLandingReceiptV1,
  type ExecutionEffectLandingTransactionRefV1,
} from '../core/execution-effect-persistence-contract.js';

export {
  createExecutionEffectLandingLeaseCapabilityV1,
  createExecutionEffectLandingLeaseResumeContextV1,
  createExecutionEffectLandingLeaseResumeResultV1,
  executionEffectLandingIntentDigestV1,
  parseExecutionEffectLandingLeaseResumeContextV1,
  parseExecutionEffectLandingLeaseResumeResultV1,
}
  from '../core/execution-effect-persistence-contract.js';

export type {
  ExecutionEffectLandingBoundaryV1,
  ExecutionEffectLandingIntentDigestInputV1,
  ExecutionEffectLandingLeaseAdapterV1,
  ExecutionEffectLandingLeaseCapabilityV1,
  ExecutionEffectLandingLeaseJournalRefV1,
  ExecutionEffectLandingLeaseResumeContextV1,
  ExecutionEffectLandingLeaseResumeReceiptV1,
  ExecutionEffectLandingLeaseResumeResultV1,
  ExecutionEffectLandingLeaseTerminalV1,
  ExecutionEffectLandingLeaseV1,
  ExecutionEffectLandingReceiptV1,
  ExecutionEffectLandingTransactionRefV1,
} from '../core/execution-effect-persistence-contract.js';

export const EXECUTION_EFFECT_LANDING_VERSION = 1 as const;
export const EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS = 100_000 as const;
export const EXECUTION_EFFECT_LANDING_HARD_MAX_PLAN_ENVELOPE_BYTES = 16 * 1024 * 1024;

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,256}$/u;
const MAX_JOURNAL_BYTES = 1_073_741_824;
const MAX_OPERATIONS = EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS;

const objectEntries = Object.entries;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const reflectApply = Reflect.apply;
const weakMapGet = WeakMap.prototype.get;
const weakMapDelete = WeakMap.prototype.delete;
const weakMapSet = WeakMap.prototype.set;

function compareCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${objectEntries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareCodePoint(left, right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(domain: string, value: unknown): ExecutionEffectPersistenceDigest {
  return `sha256:${createHash('sha256')
    .update(domain, 'utf8')
    .update('\0', 'utf8')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function exactDataObject(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || nodeTypes.isProxy(value)) return false;
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== objectPrototype && prototype !== null) return false;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  if (reflectOwnKeys(value).some(key => typeof key === 'symbol')) return false;
  const actual = objectKeys(descriptors).sort(compareCodePoint);
  const expected = [...keys].sort(compareCodePoint);
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
    && actual.every(key => {
      const descriptor = descriptors[key]!;
      return 'value' in descriptor && descriptor.enumerable === true;
    });
}

function safeDataTree(value: unknown, depth = 0, budget = { remaining: 2_000_000 }): boolean {
  if (depth > 128 || budget.remaining <= 0) return false;
  budget.remaining -= 1;
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || typeof value === 'number') return true;
  if (typeof value !== 'object' || nodeTypes.isProxy(value)) return false;
  const prototype = objectGetPrototypeOf(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || reflectOwnKeys(value).some(key => typeof key === 'symbol')) {
      return false;
    }
    const descriptors = objectGetOwnPropertyDescriptors(value);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !('value' in descriptor)
        || !safeDataTree(descriptor.value, depth + 1, budget)) return false;
    }
    return objectKeys(descriptors).length === value.length + 1;
  }
  if (prototype !== objectPrototype && prototype !== null) return false;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  if (reflectOwnKeys(value).some(key => typeof key === 'symbol')) return false;
  for (const descriptor of Object.values(descriptors)) {
    if (!('value' in descriptor) || !safeDataTree(descriptor.value, depth + 1, budget)) return false;
  }
  return true;
}

function safeId(value: unknown): value is string {
  return typeof value === 'string'
    && SAFE_ID.test(value)
    && Buffer.byteLength(value, 'utf8') <= 256;
}

function isDigest(value: unknown): value is ExecutionEffectPersistenceDigest {
  return typeof value === 'string' && DIGEST.test(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(Date.parse(value)).toISOString() === value;
}

function hostTimestamp(): string {
  return new Date().toISOString();
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function parentPath(path: string): string {
  const parent = posix.dirname(path);
  return parent === '' ? '.' : parent;
}

function safeRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) return false;
  if (value === '.') return true;
  if (value.startsWith('/') || value.includes('\\') || /^[A-Za-z]:/u.test(value)) return false;
  return posix.normalize(value) === value
    && value !== '..'
    && !value.startsWith('../')
    && value.normalize('NFC') === value;
}

function safeArtifactKey(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value);
}

export type ExecutionEffectLandingHoldCode =
  | 'INVALID_INPUT'
  | 'AUTHORITY_MISMATCH'
  | 'MANIFEST_MISMATCH'
  | 'PLAN_UNSUPPORTED'
  | 'ADAPTER_UNSUPPORTED'
  | 'LEASE_UNAVAILABLE'
  | 'PREIMAGE_MISMATCH'
  | 'JOURNAL_CONFLICT'
  | 'JOURNAL_MALFORMED'
  | 'NATIVE_EFFECT_UNCERTAIN'
  | 'CRASH_PREFIX_AMBIGUOUS'
  | 'TRANSACTION_QUARANTINED'
  | 'SESSION_INVALID';

export interface ExecutionEffectLandingHoldV1 {
  readonly version: typeof EXECUTION_EFFECT_LANDING_VERSION;
  readonly state: 'HOLD';
  readonly code: ExecutionEffectLandingHoldCode;
  readonly stage: 'prepare' | 'apply' | 'reconcile' | 'read';
  readonly transactionDigest: string | null;
  readonly evidenceDigests: readonly string[];
  readonly holdDigest: string;
}

function hold(
  code: ExecutionEffectLandingHoldCode,
  stage: ExecutionEffectLandingHoldV1['stage'],
  transactionDigest: string | null,
  evidenceDigests: readonly string[] = [],
): ExecutionEffectLandingHoldV1 {
  const canonicalEvidence = objectFreeze(
    [...new Set(evidenceDigests.filter(isDigest))].sort(compareCodePoint),
  );
  const body = objectFreeze({
    version: EXECUTION_EFFECT_LANDING_VERSION,
    state: 'HOLD' as const,
    code,
    stage,
    transactionDigest,
    evidenceDigests: canonicalEvidence,
  });
  return objectFreeze({
    ...body,
    holdDigest: digest('execution-effect-landing-hold-v1', body),
  });
}

export interface ExecutionEffectLandingCapabilityV1 {
  readonly version: typeof EXECUTION_EFFECT_LANDING_VERSION;
  readonly state: 'READY';
  readonly adapterId: string;
  readonly platform: 'linux' | 'wsl';
  readonly projectRootIdentityDigest: string;
  readonly workspaceIdentityDigest: string;
  readonly attemptDigest: string;
  readonly admissionReceiptDigest: string;
  readonly custodyPolicyDigest: string;
  readonly nativeContractDigest: string;
  /** Stable Store-backed staging authority root, never an ephemeral inode identity. */
  readonly stagingRootIdentityDigest: string;
  readonly maxStagedChunkBytes: number;
  readonly maxOperations: number;
  readonly maxPlanEnvelopeBytes: number;
  readonly capabilityDigest: string;
}

export type ExecutionEffectLandingEntryStateV1 =
  | Readonly<{
    readonly state: 'ABSENT';
    readonly stateDigest: string;
  }>
  | Readonly<{
    readonly state: 'PRESENT';
    readonly entry: ExecutionEffectManifestEntry;
    readonly objectIdentityDigest: string;
    readonly linkCount: 1 | null;
    readonly stateDigest: string;
  }>;

export interface ExecutionEffectLandingPathStateV1 {
  readonly path: string;
  readonly entry: ExecutionEffectLandingEntryStateV1;
}

export type ExecutionEffectLandingExpectedEntryStateV1 =
  | Readonly<{
    readonly state: 'ABSENT';
    readonly stateDigest: string;
  }>
  | Readonly<{
    readonly state: 'PRESENT';
    readonly entry: ExecutionEffectManifestEntry;
    readonly stateDigest: string;
  }>;

export interface ExecutionEffectLandingExpectedPathStateV1 {
  readonly path: string;
  readonly entry: ExecutionEffectLandingExpectedEntryStateV1;
}

export interface ExecutionEffectLandingStagedSourceV1 {
  readonly version: typeof EXECUTION_EFFECT_LANDING_VERSION;
  readonly path: string;
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly workspaceIdentityDigest: string;
  readonly attemptDigest: string;
  readonly admissionReceiptDigest: string;
  readonly custodyPolicyDigest: string;
  readonly landingIntentDigest: string;
  readonly chunks: readonly ExecutionEffectLandingStagedChunkV1[];
  readonly stageAuthorityDigest: string;
}

export interface ExecutionEffectLandingStagedChunkV1 {
  readonly index: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly artifactClass: 'execution-effect-staged-content';
  readonly artifactKey: string;
  readonly contentDigest: string;
  readonly artifactReceiptDigest: string;
  readonly chunkDigest: string;
}

export type ExecutionEffectLandingParentAuthorityV1 =
  | Readonly<{
    readonly path: string;
    readonly source: 'PREPARED_PREIMAGE';
    readonly entry: ExecutionEffectLandingEntryStateV1;
  }>
  | Readonly<{
    readonly path: string;
    readonly source: 'OPERATION_POSTIMAGE';
    readonly operationIndex: number;
    readonly operationDigest: string;
    readonly expectedDirectory: ExecutionEffectManifestEntry;
  }>;

export interface ExecutionEffectLandingOperationV1 {
  readonly version: typeof EXECUTION_EFFECT_LANDING_VERSION;
  readonly index: number;
  readonly kind: 'ADD_DIRECTORY' | 'ADD' | 'REPLACE' | 'DELETE' | 'MODE';
  readonly path: string;
  readonly effectDigests: readonly string[];
  readonly derivedParent: ExecutionEffectLandingDerivedParentProvenanceV1 | null;
  readonly stagedSource: ExecutionEffectLandingStagedSourceV1 | null;
  readonly entryPreimages: readonly ExecutionEffectLandingPathStateV1[];
  readonly entryPostimages: readonly ExecutionEffectLandingExpectedPathStateV1[];
  readonly parentAuthorities: readonly ExecutionEffectLandingParentAuthorityV1[];
  readonly operationDigest: string;
}

export interface ExecutionEffectLandingNativeMutationReceiptV1 {
  readonly version: typeof EXECUTION_EFFECT_LANDING_VERSION;
  readonly state: 'APPLIED';
  readonly operationDigest: string;
  readonly entryPreimages: readonly ExecutionEffectLandingPathStateV1[];
  readonly entryPostimages: readonly ExecutionEffectLandingPathStateV1[];
  readonly parentAuthorities: readonly ExecutionEffectLandingParentAuthorityV1[];
  readonly durabilityEvidenceDigest: string;
  readonly receiptDigest: string;
}

export type ExecutionEffectLandingNativeReconcileResultV1 =
  | Readonly<{ readonly state: 'NOT_APPLIED' }>
  | Readonly<{
    readonly state: 'APPLIED';
    readonly receipt: ExecutionEffectLandingNativeMutationReceiptV1;
  }>
  | Readonly<{
    readonly state: 'AMBIGUOUS';
    readonly evidenceDigest: string;
  }>;

/**
 * Production implementations must root every operation in already-open,
 * identity-pinned project/workspace directory handles. Implementations may not
 * resolve these relative paths through a path-based fallback. `applyOperation`
 * is one no-follow CAS: every entry and parent preimage is compared before the
 * namespace effect, and file plus parent durability is confirmed before return.
 */
export interface ExecutionEffectLandingNativeAdapterV1 {
  readonly capability: ExecutionEffectLandingCapabilityV1;
  inspectProjectEntry(path: string): ExecutionEffectLandingEntryStateV1;
  stageSource(input: Readonly<{
    readonly path: string;
    readonly entry: ExecutionEffectManifestEntry;
    readonly workspaceIdentityDigest: string;
    readonly landingIntentDigest: string;
  }>): Promise<ExecutionEffectLandingStagedSourceV1>;
  verifyStagedSource(source: ExecutionEffectLandingStagedSourceV1): boolean;
  applyOperation(
    input: Readonly<{
      readonly operation: ExecutionEffectLandingOperationV1;
      readonly dependencyReceipts: readonly ExecutionEffectLandingNativeMutationReceiptV1[];
    }>,
  ): ExecutionEffectLandingNativeMutationReceiptV1;
  reconcileOperation(
    input: Readonly<{
      readonly operation: ExecutionEffectLandingOperationV1;
      readonly dependencyReceipts: readonly ExecutionEffectLandingNativeMutationReceiptV1[];
    }>,
  ): ExecutionEffectLandingNativeReconcileResultV1;
  verifyTransactionPostimages(input: Readonly<{
    readonly transaction: ExecutionEffectLandingTransactionRefV1;
    readonly operations: readonly ExecutionEffectLandingOperationV1[];
    readonly operationReceipts: readonly ExecutionEffectLandingNativeMutationReceiptV1[];
  }>): ExecutionEffectLandingFinalVerificationReceiptV1;
}

export interface ExecutionEffectLandingFinalVerificationReceiptV1 {
  readonly version: typeof EXECUTION_EFFECT_LANDING_VERSION;
  readonly state: 'VERIFIED';
  readonly transactionDigest: string;
  readonly planDigest: string;
  readonly operationReceiptDigests: readonly string[];
  readonly postimageSetDigest: string;
  readonly durabilityEvidenceDigest: string;
  readonly receiptDigest: string;
}

export interface ExecutionEffectLandingJournalCapabilityV1 {
  readonly version: typeof EXECUTION_EFFECT_LANDING_VERSION;
  readonly state: 'READY';
  readonly adapterId: string;
  readonly projectRootIdentityDigest: string;
  readonly capabilityDigest: string;
}

export interface ExecutionEffectLandingJournalArtifactV1 {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly publicationReceiptDigest: string;
}

/** Host-private, no-replace, durable publication. `readImmutable` must reread
 * the durable authority, not a process cache or public task projection. */
export interface ExecutionEffectLandingJournalAdapterV1 {
  readonly capability: ExecutionEffectLandingJournalCapabilityV1;
  publishImmutable(input: Readonly<{
    readonly key: string;
    readonly bytes: Uint8Array;
    readonly contentDigest: string;
  }>): ExecutionEffectLandingJournalArtifactV1;
  readImmutable(key: string): ExecutionEffectLandingJournalArtifactV1 | null;
}

export interface ExecutionEffectLandingAdaptersV1 {
  readonly native: ExecutionEffectLandingNativeAdapterV1;
  readonly journal: ExecutionEffectLandingJournalAdapterV1;
  readonly lease: ExecutionEffectLandingLeaseAdapterV1;
}

interface PreparedJournalV1 {
  readonly version: typeof EXECUTION_EFFECT_LANDING_VERSION;
  readonly kind: 'execution-effect-landing-prepared';
  readonly phase: 'PREPARED';
  readonly transaction: ExecutionEffectLandingTransactionRefV1;
  readonly operations: readonly ExecutionEffectLandingOperationV1[];
  readonly nativeCapabilityDigest: string;
  readonly journalCapabilityDigest: string;
  readonly leaseCapabilityDigest: string;
  readonly acquiredLease: ExecutionEffectLandingLeaseV1;
  readonly preparedAt: string;
  readonly recordDigest: string;
}

export interface ExecutionEffectLandingLocatorV1 {
  readonly version: typeof EXECUTION_EFFECT_LANDING_VERSION;
  readonly kind: 'execution-effect-landing-locator';
  readonly state: 'DURABLE';
  readonly transaction: ExecutionEffectLandingTransactionRefV1;
  readonly preparedJournalDigest: string;
  readonly preparedJournalContentDigest: string;
  readonly preparedJournalPublicationReceiptDigest: string;
  readonly nativeCapabilityDigest: string;
  readonly journalCapabilityDigest: string;
  readonly leaseCapabilityDigest: string;
  readonly publishedAt: string;
  readonly locatorDigest: string;
}

interface ApplyingJournalV1 {
  readonly version: typeof EXECUTION_EFFECT_LANDING_VERSION;
  readonly kind: 'execution-effect-landing-applying';
  readonly phase: 'APPLYING';
  readonly transactionDigest: string;
  readonly preparedJournalDigest: string;
  readonly boundary: ExecutionEffectLandingBoundaryV1;
  readonly applyingAt: string;
  readonly recordDigest: string;
}

interface StepJournalV1 {
  readonly version: typeof EXECUTION_EFFECT_LANDING_VERSION;
  readonly kind: 'execution-effect-landing-step';
  readonly phase: 'STEP';
  readonly transactionDigest: string;
  readonly preparedJournalDigest: string;
  readonly applyingJournalDigest: string;
  readonly previousJournalDigest: string;
  readonly index: number;
  readonly operationDigest: string;
  readonly nativeReceipt: ExecutionEffectLandingNativeMutationReceiptV1;
  readonly reconciledAfterCrash: boolean;
  readonly appliedAt: string;
  readonly recordDigest: string;
}

interface CommittedJournalV1 {
  readonly version: typeof EXECUTION_EFFECT_LANDING_VERSION;
  readonly kind: 'execution-effect-landing-committed';
  readonly phase: 'COMMITTED';
  readonly disposition: 'COMMITTED' | 'COMMITTED_NO_CHANGE';
  readonly transaction: ExecutionEffectLandingTransactionRefV1;
  readonly preparedJournalDigest: string;
  readonly applyingJournalDigest: string | null;
  readonly lastJournalDigest: string;
  readonly operationReceiptDigests: readonly string[];
  readonly finalVerificationReceipt: ExecutionEffectLandingFinalVerificationReceiptV1 | null;
  readonly committedAt: string;
  readonly recordDigest: string;
}

declare const executionEffectLandingSessionBrand: unique symbol;
export type PreparedExecutionEffectLandingSessionV1 = object & {
  readonly [executionEffectLandingSessionBrand]: true;
};

interface SessionAuthority {
  readonly transaction: ExecutionEffectLandingTransactionRefV1;
  readonly prepared: PreparedJournalV1;
  readonly preparedArtifact: ExecutionEffectLandingJournalArtifactV1;
  readonly locator: ExecutionEffectLandingLocatorV1;
  readonly locatorArtifact: ExecutionEffectLandingJournalArtifactV1;
  readonly lease: ExecutionEffectLandingLeaseV1;
  readonly adapters: SnapshottedAdapters;
}

const sessionAuthority = new WeakMap<object, SessionAuthority>();

interface SnapshottedAdapters {
  readonly native: ExecutionEffectLandingNativeAdapterV1;
  readonly journal: ExecutionEffectLandingJournalAdapterV1;
  readonly lease: ExecutionEffectLandingLeaseAdapterV1;
}

interface SnapshottedReadAdapters {
  readonly journal: ExecutionEffectLandingJournalAdapterV1;
  readonly lease: Pick<
    ExecutionEffectLandingLeaseAdapterV1,
    'capability' | 'readTerminal'
  >;
}

export type PrepareExecutionEffectLandingResultV1 =
  | Readonly<{
    readonly state: 'PREPARED';
    readonly transaction: ExecutionEffectLandingTransactionRefV1;
    readonly preparedJournalDigest: string;
    readonly locatorDigest: string;
    readonly session: PreparedExecutionEffectLandingSessionV1;
  }>
  | ExecutionEffectLandingHoldV1;

export type ExecutionEffectLandingOutcomeV1 =
  | ExecutionEffectLandingReceiptV1
  | ExecutionEffectLandingHoldV1;

export interface PrepareExecutionEffectLandingV1Input {
  readonly planId: string;
  readonly baseline: ExecutionEffectManifest;
  readonly final: ExecutionEffectManifest;
  readonly decision: ExecutionEffectContainmentDecision;
  readonly adapters?: ExecutionEffectLandingAdaptersV1;
}

export interface ReconcileExecutionEffectLandingV1Input {
  readonly transaction: ExecutionEffectLandingTransactionRefV1;
  readonly adapters?: ExecutionEffectLandingAdaptersV1;
}

export interface ReadExecutionEffectLandingLocatorV1Input {
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly generation: number;
  readonly attemptDigest: string;
  readonly baselineManifestDigest: string;
  readonly finalManifestDigest: string;
  readonly containmentDecisionDigest: string;
  readonly planId: string;
  readonly nativeCapabilityDigest: string;
  readonly adapters?: ExecutionEffectLandingAdaptersV1;
}

export type ReadExecutionEffectLandingLocatorResultV1 =
  | Readonly<{
    readonly state: 'LOCATED';
    readonly transaction: ExecutionEffectLandingTransactionRefV1;
    readonly preparedJournalDigest: string;
    readonly locatorDigest: string;
  }>
  | ExecutionEffectLandingHoldV1;

export interface ReadExecutionEffectLandingReceiptV1Input {
  readonly transaction: ExecutionEffectLandingTransactionRefV1;
  readonly adapters?: Pick<ExecutionEffectLandingAdaptersV1, 'journal' | 'lease'>;
}

function capabilityBody(value: ExecutionEffectLandingCapabilityV1): object {
  return {
    version: value.version,
    state: value.state,
    adapterId: value.adapterId,
    platform: value.platform,
    projectRootIdentityDigest: value.projectRootIdentityDigest,
    workspaceIdentityDigest: value.workspaceIdentityDigest,
    attemptDigest: value.attemptDigest,
    admissionReceiptDigest: value.admissionReceiptDigest,
    custodyPolicyDigest: value.custodyPolicyDigest,
    nativeContractDigest: value.nativeContractDigest,
    stagingRootIdentityDigest: value.stagingRootIdentityDigest,
    maxStagedChunkBytes: value.maxStagedChunkBytes,
    maxOperations: value.maxOperations,
    maxPlanEnvelopeBytes: value.maxPlanEnvelopeBytes,
  };
}

function validateNativeCapability(value: unknown): ExecutionEffectLandingCapabilityV1 | null {
  if (!exactDataObject(value, [
    'version', 'state', 'adapterId', 'platform', 'projectRootIdentityDigest',
    'workspaceIdentityDigest', 'attemptDigest', 'admissionReceiptDigest',
    'custodyPolicyDigest', 'nativeContractDigest', 'stagingRootIdentityDigest',
    'maxStagedChunkBytes', 'maxOperations', 'maxPlanEnvelopeBytes', 'capabilityDigest',
  ])) return null;
  if (value.version !== 1 || value.state !== 'READY' || !safeId(value.adapterId)
    || (value.platform !== 'linux' && value.platform !== 'wsl')
    || !isDigest(value.projectRootIdentityDigest)
    || !isDigest(value.workspaceIdentityDigest)
    || !isDigest(value.attemptDigest) || !isDigest(value.admissionReceiptDigest)
    || !isDigest(value.custodyPolicyDigest) || !isDigest(value.nativeContractDigest)
    || !isDigest(value.stagingRootIdentityDigest)
    || !Number.isSafeInteger(value.maxStagedChunkBytes)
    || (value.maxStagedChunkBytes as number) <= 0
    || !Number.isSafeInteger(value.maxOperations) || (value.maxOperations as number) <= 0
    || (value.maxOperations as number) > EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS
    || !Number.isSafeInteger(value.maxPlanEnvelopeBytes)
    || (value.maxPlanEnvelopeBytes as number) <= 0
    || (value.maxPlanEnvelopeBytes as number)
      > EXECUTION_EFFECT_LANDING_HARD_MAX_PLAN_ENVELOPE_BYTES
    || !isDigest(value.capabilityDigest)) return null;
  const snapshot = objectFreeze({
    version: 1 as const,
    state: 'READY' as const,
    adapterId: value.adapterId,
    platform: value.platform,
    projectRootIdentityDigest: value.projectRootIdentityDigest,
    workspaceIdentityDigest: value.workspaceIdentityDigest,
    attemptDigest: value.attemptDigest,
    admissionReceiptDigest: value.admissionReceiptDigest,
    custodyPolicyDigest: value.custodyPolicyDigest,
    nativeContractDigest: value.nativeContractDigest,
    stagingRootIdentityDigest: value.stagingRootIdentityDigest,
    maxStagedChunkBytes: value.maxStagedChunkBytes as number,
    maxOperations: value.maxOperations as number,
    maxPlanEnvelopeBytes: value.maxPlanEnvelopeBytes as number,
    capabilityDigest: value.capabilityDigest,
  });
  return digest('execution-effect-landing-native-capability-v1', capabilityBody(snapshot))
    === snapshot.capabilityDigest ? snapshot : null;
}

function validateSimpleCapability(
  value: unknown,
  domain: 'execution-effect-landing-journal-capability-v1',
): ExecutionEffectLandingJournalCapabilityV1 | null;
function validateSimpleCapability(
  value: unknown,
  domain: 'execution-effect-landing-lease-capability-v1',
): ExecutionEffectLandingLeaseCapabilityV1 | null;
function validateSimpleCapability(
  value: unknown,
  domain: string,
): ExecutionEffectLandingJournalCapabilityV1 | ExecutionEffectLandingLeaseCapabilityV1 | null {
  if (!exactDataObject(value, [
    'version', 'state', 'adapterId', 'projectRootIdentityDigest', 'capabilityDigest',
  ])) return null;
  if (value.version !== 1 || value.state !== 'READY' || !safeId(value.adapterId)
    || !isDigest(value.projectRootIdentityDigest) || !isDigest(value.capabilityDigest)) return null;
  const body = objectFreeze({
    version: 1 as const,
    state: 'READY' as const,
    adapterId: value.adapterId,
    projectRootIdentityDigest: value.projectRootIdentityDigest,
  });
  return digest(domain, body) === value.capabilityDigest
    ? objectFreeze({ ...body, capabilityDigest: value.capabilityDigest })
    : null;
}

export function executionEffectLandingWorkspaceIdentityDigestV1(
  workspaceIdentity: ExecutionEffectManifest['workspaceIdentity'],
): string {
  if (!exactDataObject(workspaceIdentity, [
    'filesystemId', 'directoryId', 'rootHandleEvidenceDigest',
  ]) || typeof workspaceIdentity.filesystemId !== 'string'
    || typeof workspaceIdentity.directoryId !== 'string'
    || !isDigest(workspaceIdentity.rootHandleEvidenceDigest)) {
    throw new TypeError('Invalid execution effect workspace identity');
  }
  return digest('execution-effect-workspace-identity-v1', {
    filesystemId: workspaceIdentity.filesystemId,
    directoryId: workspaceIdentity.directoryId,
    rootHandleEvidenceDigest: workspaceIdentity.rootHandleEvidenceDigest,
  });
}

export function createExecutionEffectLandingNativeCapabilityV1(
  input: Omit<ExecutionEffectLandingCapabilityV1, 'version' | 'state' | 'capabilityDigest'>,
): ExecutionEffectLandingCapabilityV1 {
  if (!exactDataObject(input, [
    'adapterId', 'platform', 'projectRootIdentityDigest', 'workspaceIdentityDigest',
    'attemptDigest', 'admissionReceiptDigest', 'custodyPolicyDigest', 'nativeContractDigest',
    'stagingRootIdentityDigest', 'maxStagedChunkBytes', 'maxOperations',
    'maxPlanEnvelopeBytes',
  ]) || !safeId(input.adapterId) || (input.platform !== 'linux' && input.platform !== 'wsl')
    || !isDigest(input.projectRootIdentityDigest) || !isDigest(input.workspaceIdentityDigest)
    || !isDigest(input.attemptDigest) || !isDigest(input.admissionReceiptDigest)
    || !isDigest(input.custodyPolicyDigest) || !isDigest(input.nativeContractDigest)
    || !isDigest(input.stagingRootIdentityDigest)
    || !Number.isSafeInteger(input.maxStagedChunkBytes) || input.maxStagedChunkBytes <= 0
    || !Number.isSafeInteger(input.maxOperations) || input.maxOperations <= 0
    || input.maxOperations > EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS
    || !Number.isSafeInteger(input.maxPlanEnvelopeBytes) || input.maxPlanEnvelopeBytes <= 0
    || input.maxPlanEnvelopeBytes > EXECUTION_EFFECT_LANDING_HARD_MAX_PLAN_ENVELOPE_BYTES) {
    throw new TypeError('Invalid execution effect native capability');
  }
  const body = objectFreeze({
    version: 1 as const,
    state: 'READY' as const,
    adapterId: input.adapterId,
    platform: input.platform,
    projectRootIdentityDigest: input.projectRootIdentityDigest,
    workspaceIdentityDigest: input.workspaceIdentityDigest,
    attemptDigest: input.attemptDigest,
    admissionReceiptDigest: input.admissionReceiptDigest,
    custodyPolicyDigest: input.custodyPolicyDigest,
    nativeContractDigest: input.nativeContractDigest,
    stagingRootIdentityDigest: input.stagingRootIdentityDigest,
    maxStagedChunkBytes: input.maxStagedChunkBytes,
    maxOperations: input.maxOperations,
    maxPlanEnvelopeBytes: input.maxPlanEnvelopeBytes,
  });
  return objectFreeze({
    ...body,
    capabilityDigest: digest('execution-effect-landing-native-capability-v1', body),
  });
}

function createSimpleCapability(
  input: Readonly<{ readonly adapterId: string; readonly projectRootIdentityDigest: string }>,
  domain: string,
): ExecutionEffectLandingJournalCapabilityV1 {
  if (!exactDataObject(input, ['adapterId', 'projectRootIdentityDigest'])
    || !safeId(input.adapterId) || !isDigest(input.projectRootIdentityDigest)) {
    throw new TypeError('Invalid execution effect capability');
  }
  const body = objectFreeze({
    version: 1 as const,
    state: 'READY' as const,
    adapterId: input.adapterId,
    projectRootIdentityDigest: input.projectRootIdentityDigest,
  });
  return objectFreeze({ ...body, capabilityDigest: digest(domain, body) });
}

export function createExecutionEffectLandingJournalCapabilityV1(
  input: Readonly<{ readonly adapterId: string; readonly projectRootIdentityDigest: string }>,
): ExecutionEffectLandingJournalCapabilityV1 {
  return createSimpleCapability(input, 'execution-effect-landing-journal-capability-v1');
}

function method(value: Record<string, unknown>, key: string): ((...args: unknown[]) => unknown) | null {
  const descriptor = objectGetOwnPropertyDescriptors(value)[key];
  return descriptor && 'value' in descriptor && typeof descriptor.value === 'function'
    ? descriptor.value as (...args: unknown[]) => unknown
    : null;
}

function snapshotAdapters(value: unknown): SnapshottedAdapters | null {
  if (!exactDataObject(value, ['native', 'journal', 'lease'])) return null;
  const nativeValue = value.native;
  const journalValue = value.journal;
  const leaseValue = value.lease;
  if (!exactDataObject(nativeValue, [
    'capability', 'inspectProjectEntry', 'stageSource', 'verifyStagedSource',
    'applyOperation', 'reconcileOperation', 'verifyTransactionPostimages',
  ]) || !exactDataObject(journalValue, ['capability', 'publishImmutable', 'readImmutable'])
    || !exactDataObject(leaseValue, [
      'capability', 'acquire', 'resume', 'assert', 'renew', 'beginBoundary',
      'quarantine', 'completeBoundary', 'releaseNoChange', 'readTerminal',
    ])) return null;
  const nativeCapability = validateNativeCapability(nativeValue.capability);
  const journalCapability = validateSimpleCapability(
    journalValue.capability,
    'execution-effect-landing-journal-capability-v1',
  );
  const leaseCapability = validateSimpleCapability(
    leaseValue.capability,
    'execution-effect-landing-lease-capability-v1',
  );
  if (!nativeCapability || !journalCapability || !leaseCapability
    || nativeCapability.projectRootIdentityDigest !== journalCapability.projectRootIdentityDigest
    || nativeCapability.projectRootIdentityDigest !== leaseCapability.projectRootIdentityDigest) {
    return null;
  }
  const inspect = method(nativeValue, 'inspectProjectEntry');
  const stage = method(nativeValue, 'stageSource');
  const verifySource = method(nativeValue, 'verifyStagedSource');
  const apply = method(nativeValue, 'applyOperation');
  const reconcile = method(nativeValue, 'reconcileOperation');
  const verifyPostimages = method(nativeValue, 'verifyTransactionPostimages');
  const publish = method(journalValue, 'publishImmutable');
  const read = method(journalValue, 'readImmutable');
  const acquire = method(leaseValue, 'acquire');
  const resume = method(leaseValue, 'resume');
  const assert = method(leaseValue, 'assert');
  const renew = method(leaseValue, 'renew');
  const begin = method(leaseValue, 'beginBoundary');
  const quarantine = method(leaseValue, 'quarantine');
  const complete = method(leaseValue, 'completeBoundary');
  const release = method(leaseValue, 'releaseNoChange');
  const verify = method(leaseValue, 'readTerminal');
  if (!inspect || !stage || !verifySource || !apply || !reconcile || !verifyPostimages
    || !publish || !read || !acquire || !resume
    || !assert || !renew || !begin || !quarantine || !complete || !release || !verify) return null;
  return objectFreeze({
    native: objectFreeze({
      capability: nativeCapability,
      inspectProjectEntry: (path: string) => reflectApply(inspect, undefined, [path]) as ExecutionEffectLandingEntryStateV1,
      stageSource: async (input: Readonly<{ readonly path: string; readonly entry: ExecutionEffectManifestEntry; readonly workspaceIdentityDigest: string; readonly landingIntentDigest: string }>) => await reflectApply(stage, undefined, [input]) as ExecutionEffectLandingStagedSourceV1,
      verifyStagedSource: (source: ExecutionEffectLandingStagedSourceV1) => reflectApply(verifySource, undefined, [source]) as boolean,
      applyOperation: (input: Readonly<{ readonly operation: ExecutionEffectLandingOperationV1; readonly dependencyReceipts: readonly ExecutionEffectLandingNativeMutationReceiptV1[] }>) => reflectApply(apply, undefined, [input]) as ExecutionEffectLandingNativeMutationReceiptV1,
      reconcileOperation: (input: Readonly<{ readonly operation: ExecutionEffectLandingOperationV1; readonly dependencyReceipts: readonly ExecutionEffectLandingNativeMutationReceiptV1[] }>) => reflectApply(reconcile, undefined, [input]) as ExecutionEffectLandingNativeReconcileResultV1,
      verifyTransactionPostimages: (input: Readonly<{ readonly transaction: ExecutionEffectLandingTransactionRefV1; readonly operations: readonly ExecutionEffectLandingOperationV1[]; readonly operationReceipts: readonly ExecutionEffectLandingNativeMutationReceiptV1[] }>) => reflectApply(verifyPostimages, undefined, [input]) as ExecutionEffectLandingFinalVerificationReceiptV1,
    }),
    journal: objectFreeze({
      capability: journalCapability,
      publishImmutable: (input: Readonly<{ readonly key: string; readonly bytes: Uint8Array; readonly contentDigest: string }>) => reflectApply(publish, undefined, [input]) as ExecutionEffectLandingJournalArtifactV1,
      readImmutable: (key: string) => reflectApply(read, undefined, [key]) as ExecutionEffectLandingJournalArtifactV1 | null,
    }),
    lease: objectFreeze({
      capability: leaseCapability,
      acquire: (tx: string) => reflectApply(acquire, undefined, [tx]) as ExecutionEffectLandingLeaseV1,
      resume: (context: ExecutionEffectLandingLeaseResumeContextV1) => reflectApply(
        resume,
        undefined,
        [context],
      ) as ExecutionEffectLandingLeaseResumeResultV1,
      assert: (lease: ExecutionEffectLandingLeaseV1) => { reflectApply(assert, undefined, [lease]); },
      renew: (lease: ExecutionEffectLandingLeaseV1) => reflectApply(renew, undefined, [lease]) as ExecutionEffectLandingLeaseV1,
      beginBoundary: (lease: ExecutionEffectLandingLeaseV1, prepared: string) => reflectApply(begin, undefined, [lease, prepared]) as ExecutionEffectLandingBoundaryV1,
      quarantine: (lease: ExecutionEffectLandingLeaseV1, boundary: ExecutionEffectLandingBoundaryV1 | null, evidence: readonly string[]) => reflectApply(quarantine, undefined, [lease, boundary, evidence]) as string,
      completeBoundary: (lease: ExecutionEffectLandingLeaseV1, boundary: ExecutionEffectLandingBoundaryV1, committed: string) => reflectApply(complete, undefined, [lease, boundary, committed]) as ExecutionEffectLandingLeaseTerminalV1,
      releaseNoChange: (lease: ExecutionEffectLandingLeaseV1, committed: string) => reflectApply(release, undefined, [lease, committed]) as ExecutionEffectLandingLeaseTerminalV1,
      readTerminal: (transaction: string, committed: string) => reflectApply(verify, undefined, [transaction, committed]) as ExecutionEffectLandingLeaseTerminalV1 | null,
    }),
  });
}

function snapshotReadAdapters(value: unknown): SnapshottedReadAdapters | null {
  if (!exactDataObject(value, ['journal', 'lease'])) return null;
  const journalValue = value.journal;
  const leaseValue = value.lease;
  if (!exactDataObject(journalValue, ['capability', 'publishImmutable', 'readImmutable'])
    || !exactDataObject(leaseValue, [
      'capability', 'acquire', 'resume', 'assert', 'renew', 'beginBoundary',
      'quarantine', 'completeBoundary', 'releaseNoChange', 'readTerminal',
    ])) return null;
  const journalCapability = validateSimpleCapability(
    journalValue.capability,
    'execution-effect-landing-journal-capability-v1',
  );
  const leaseCapability = validateSimpleCapability(
    leaseValue.capability,
    'execution-effect-landing-lease-capability-v1',
  );
  const publish = method(journalValue, 'publishImmutable');
  const read = method(journalValue, 'readImmutable');
  const readTerminal = method(leaseValue, 'readTerminal');
  if (!journalCapability || !leaseCapability || !publish || !read || !readTerminal
    || journalCapability.projectRootIdentityDigest
      !== leaseCapability.projectRootIdentityDigest) return null;
  return objectFreeze({
    journal: objectFreeze({
      capability: journalCapability,
      publishImmutable: (input: Readonly<{ readonly key: string; readonly bytes: Uint8Array; readonly contentDigest: string }>) => reflectApply(publish, undefined, [input]) as ExecutionEffectLandingJournalArtifactV1,
      readImmutable: (key: string) => reflectApply(read, undefined, [key]) as ExecutionEffectLandingJournalArtifactV1 | null,
    }),
    lease: objectFreeze({
      capability: leaseCapability,
      readTerminal: (transaction: string, committed: string) => reflectApply(
        readTerminal,
        undefined,
        [transaction, committed],
      ) as ExecutionEffectLandingLeaseTerminalV1 | null,
    }),
  });
}

function snapshotEntry(value: unknown): ExecutionEffectManifestEntry | null {
  if (!exactDataObject(value, value !== null && typeof value === 'object'
    && Reflect.getOwnPropertyDescriptor(value, 'kind')?.value === 'regular-file'
    ? ['path', 'kind', 'mode', 'size', 'contentDigest']
    : ['path', 'kind', 'mode'])) return null;
  if (!safeRelativePath(value.path)) return null;
  if (value.kind === 'directory') {
    return Number.isSafeInteger(value.mode) && (value.mode as number) >= 0
      && (value.mode as number) <= 0o777
      ? objectFreeze({ path: value.path, kind: 'directory', mode: value.mode as number })
      : null;
  }
  if (value.kind === 'regular-file') {
    if (!Number.isSafeInteger(value.mode) || (value.mode as number) < 0
      || (value.mode as number) > 0o777 || !Number.isSafeInteger(value.size)
      || (value.size as number) < 0 || !isDigest(value.contentDigest)) return null;
    return objectFreeze({
      path: value.path,
      kind: 'regular-file',
      mode: value.mode as number,
      size: value.size as number,
      contentDigest: value.contentDigest,
    });
  }
  return null;
}

function snapshotManifest(value: ExecutionEffectManifest): ExecutionEffectManifest | null {
  return safeDataTree(value) ? parseExecutionEffectManifest(value) : null;
}

function snapshotState(value: unknown): ExecutionEffectLandingEntryStateV1 | null {
  if (exactDataObject(value, ['state', 'stateDigest']) && value.state === 'ABSENT'
    && isDigest(value.stateDigest)) {
    const body = objectFreeze({ state: 'ABSENT' as const });
    return digest('execution-effect-landing-entry-state-v1', body) === value.stateDigest
      ? objectFreeze({ ...body, stateDigest: value.stateDigest }) : null;
  }
  if (!exactDataObject(value, ['state', 'entry', 'objectIdentityDigest', 'linkCount', 'stateDigest'])
    || value.state !== 'PRESENT' || !isDigest(value.objectIdentityDigest)
    || !isDigest(value.stateDigest)) {
    return null;
  }
  const entry = snapshotEntry(value.entry);
  if (!entry || (entry.kind === 'regular-file' ? value.linkCount !== 1 : value.linkCount !== null)) {
    return null;
  }
  const body = objectFreeze({
    state: 'PRESENT' as const,
    entry,
    objectIdentityDigest: value.objectIdentityDigest,
    linkCount: value.linkCount as 1 | null,
  });
  return digest('execution-effect-landing-entry-state-v1', body) === value.stateDigest
    ? objectFreeze({ ...body, stateDigest: value.stateDigest }) : null;
}

export function createExecutionEffectLandingEntryStateV1(
  input: Readonly<{
    readonly entry: ExecutionEffectManifestEntry | null;
    readonly objectIdentityDigest?: string;
    readonly linkCount?: number | null;
  }>,
): ExecutionEffectLandingEntryStateV1 {
  if (!exactDataObject(input, input.entry === null
    ? ['entry']
    : ['entry', 'objectIdentityDigest', 'linkCount'])) {
    throw new TypeError('Invalid execution effect entry-state input');
  }
  if (input.entry === null) {
    const body = objectFreeze({ state: 'ABSENT' as const });
    return objectFreeze({
      ...body,
      stateDigest: digest('execution-effect-landing-entry-state-v1', body),
    });
  }
  const entry = snapshotEntry(input.entry);
  if (!entry || !isDigest(input.objectIdentityDigest)
    || (entry.kind === 'regular-file' ? input.linkCount !== 1 : input.linkCount !== null)) {
    throw new TypeError('Invalid execution effect present entry-state input');
  }
  const body = objectFreeze({
    state: 'PRESENT' as const,
    entry,
    objectIdentityDigest: input.objectIdentityDigest,
    linkCount: input.linkCount as 1 | null,
  });
  return objectFreeze({
    ...body,
    stateDigest: digest('execution-effect-landing-entry-state-v1', body),
  });
}

function pathState(path: string, entry: ExecutionEffectLandingEntryStateV1): ExecutionEffectLandingPathStateV1 {
  return objectFreeze({ path, entry });
}

function expectedState(entry: ExecutionEffectManifestEntry | undefined): ExecutionEffectLandingExpectedEntryStateV1 {
  const body = entry === undefined
    ? objectFreeze({ state: 'ABSENT' as const })
    : objectFreeze({ state: 'PRESENT' as const, entry });
  return objectFreeze({
    ...body,
    stateDigest: digest('execution-effect-landing-expected-entry-state-v1', body),
  });
}

function expectedPathState(
  path: string,
  entry: ExecutionEffectLandingExpectedEntryStateV1,
): ExecutionEffectLandingExpectedPathStateV1 {
  return objectFreeze({ path, entry });
}

function snapshotExpectedState(value: unknown): ExecutionEffectLandingExpectedEntryStateV1 | null {
  if (exactDataObject(value, ['state', 'stateDigest']) && value.state === 'ABSENT'
    && isDigest(value.stateDigest)) {
    const expected = expectedState(undefined);
    return expected.stateDigest === value.stateDigest ? expected : null;
  }
  if (!exactDataObject(value, ['state', 'entry', 'stateDigest']) || value.state !== 'PRESENT'
    || !isDigest(value.stateDigest)) return null;
  const entry = snapshotEntry(value.entry);
  if (!entry) return null;
  const expected = expectedState(entry);
  return expected.stateDigest === value.stateDigest ? expected : null;
}

function snapshotExpectedPathState(value: unknown): ExecutionEffectLandingExpectedPathStateV1 | null {
  if (!exactDataObject(value, ['path', 'entry']) || !safeRelativePath(value.path)) return null;
  const entry = snapshotExpectedState(value.entry);
  return entry ? expectedPathState(value.path, entry) : null;
}

function snapshotStagedSource(value: unknown): ExecutionEffectLandingStagedSourceV1 | null {
  if (!exactDataObject(value, [
    'version', 'path', 'contentDigest', 'byteLength', 'workspaceIdentityDigest',
    'attemptDigest', 'admissionReceiptDigest', 'custodyPolicyDigest', 'landingIntentDigest',
    'chunks', 'stageAuthorityDigest',
  ]) || value.version !== 1 || !safeRelativePath(value.path)
    || !isDigest(value.contentDigest) || !Number.isSafeInteger(value.byteLength)
    || (value.byteLength as number) < 0 || !isDigest(value.workspaceIdentityDigest)
    || !isDigest(value.attemptDigest) || !isDigest(value.admissionReceiptDigest)
    || !isDigest(value.custodyPolicyDigest) || !isDigest(value.landingIntentDigest)
    || !Array.isArray(value.chunks) || value.chunks.length === 0
    || value.chunks.length > MAX_OPERATIONS || !isDigest(value.stageAuthorityDigest)) {
    return null;
  }
  const chunks: ExecutionEffectLandingStagedChunkV1[] = [];
  const artifactKeys = new Set<string>();
  let byteOffset = 0;
  for (let index = 0; index < value.chunks.length; index += 1) {
    const raw = value.chunks[index];
    if (!exactDataObject(raw, [
      'index', 'byteOffset', 'byteLength', 'artifactClass', 'artifactKey', 'contentDigest',
      'artifactReceiptDigest', 'chunkDigest',
    ]) || raw.index !== index || raw.byteOffset !== byteOffset
      || !Number.isSafeInteger(raw.byteLength) || (raw.byteLength as number) < 0
      || ((raw.byteLength as number) === 0 && value.chunks.length !== 1)
      || raw.artifactClass !== 'execution-effect-staged-content'
      || !safeArtifactKey(raw.artifactKey) || !isDigest(raw.contentDigest)
      || !isDigest(raw.artifactReceiptDigest)
      || !isDigest(raw.chunkDigest)
      || artifactKeys.has(raw.artifactKey)) return null;
    const authority = createExecutionEffectStagedChunkRefV1({
      index,
      byteOffset,
      byteLength: raw.byteLength as number,
      artifactKey: raw.artifactKey,
      contentDigest: raw.contentDigest as ExecutionEffectPersistenceDigest,
      artifactReceiptDigest: raw.artifactReceiptDigest as ExecutionEffectPersistenceDigest,
    });
    if (authority.chunkDigest !== raw.chunkDigest) return null;
    chunks.push(objectFreeze({
      ...authority,
      artifactClass: 'execution-effect-staged-content' as const,
    }));
    artifactKeys.add(raw.artifactKey);
    byteOffset += raw.byteLength as number;
    if (!Number.isSafeInteger(byteOffset)) return null;
  }
  if (byteOffset !== value.byteLength) {
    return null;
  }
  const body = objectFreeze({
    version: 1 as const,
    path: value.path,
    contentDigest: value.contentDigest,
    byteLength: value.byteLength as number,
    workspaceIdentityDigest: value.workspaceIdentityDigest,
    attemptDigest: value.attemptDigest,
    admissionReceiptDigest: value.admissionReceiptDigest,
    custodyPolicyDigest: value.custodyPolicyDigest,
    landingIntentDigest: value.landingIntentDigest,
    chunks: objectFreeze(chunks),
  });
  let stageAuthorityDigest: string;
  try {
    stageAuthorityDigest = executionEffectStageAuthorityDigestV1({
      path: body.path,
      byteLength: body.byteLength,
      contentDigest: body.contentDigest as ExecutionEffectPersistenceDigest,
      workspaceIdentityDigest: body.workspaceIdentityDigest as ExecutionEffectPersistenceDigest,
      attemptDigest: body.attemptDigest as ExecutionEffectPersistenceDigest,
      admissionReceiptDigest: body.admissionReceiptDigest as ExecutionEffectPersistenceDigest,
      custodyPolicyDigest: body.custodyPolicyDigest as ExecutionEffectPersistenceDigest,
      landingIntentDigest: body.landingIntentDigest as ExecutionEffectPersistenceDigest,
      chunks: body.chunks.map(chunk => objectFreeze({
        index: chunk.index,
        byteOffset: chunk.byteOffset,
        byteLength: chunk.byteLength,
        artifactKey: chunk.artifactKey,
        artifactReceiptDigest: chunk.artifactReceiptDigest as ExecutionEffectPersistenceDigest,
        contentDigest: chunk.contentDigest as ExecutionEffectPersistenceDigest,
        chunkDigest: chunk.chunkDigest as ExecutionEffectPersistenceDigest,
      })),
    });
  } catch {
    return null;
  }
  return stageAuthorityDigest === value.stageAuthorityDigest
    ? objectFreeze({ ...body, stageAuthorityDigest }) : null;
}

export function createExecutionEffectLandingStagedSourceV1(
  input: Omit<ExecutionEffectLandingStagedSourceV1, 'version' | 'stageAuthorityDigest'>,
): ExecutionEffectLandingStagedSourceV1 {
  if (!exactDataObject(input, [
    'path', 'contentDigest', 'byteLength', 'workspaceIdentityDigest', 'attemptDigest',
    'admissionReceiptDigest', 'custodyPolicyDigest', 'landingIntentDigest', 'chunks',
  ])) throw new TypeError('Invalid staged source input');
  const body = objectFreeze({
    version: 1 as const,
    path: input.path,
    contentDigest: input.contentDigest,
    byteLength: input.byteLength,
    workspaceIdentityDigest: input.workspaceIdentityDigest,
    attemptDigest: input.attemptDigest,
    admissionReceiptDigest: input.admissionReceiptDigest,
    custodyPolicyDigest: input.custodyPolicyDigest,
    landingIntentDigest: input.landingIntentDigest,
    chunks: input.chunks,
  });
  const stableChunks = body.chunks.map(chunk => objectFreeze({
    index: chunk.index,
    byteOffset: chunk.byteOffset,
    byteLength: chunk.byteLength,
    artifactKey: chunk.artifactKey,
    artifactReceiptDigest: chunk.artifactReceiptDigest as ExecutionEffectPersistenceDigest,
    contentDigest: chunk.contentDigest as ExecutionEffectPersistenceDigest,
    chunkDigest: chunk.chunkDigest as ExecutionEffectPersistenceDigest,
  }));
  const candidate = objectFreeze({
    ...body,
    stageAuthorityDigest: executionEffectStageAuthorityDigestV1({
      path: body.path,
      byteLength: body.byteLength,
      contentDigest: body.contentDigest as ExecutionEffectPersistenceDigest,
      workspaceIdentityDigest: body.workspaceIdentityDigest as ExecutionEffectPersistenceDigest,
      attemptDigest: body.attemptDigest as ExecutionEffectPersistenceDigest,
      admissionReceiptDigest: body.admissionReceiptDigest as ExecutionEffectPersistenceDigest,
      custodyPolicyDigest: body.custodyPolicyDigest as ExecutionEffectPersistenceDigest,
      landingIntentDigest: body.landingIntentDigest as ExecutionEffectPersistenceDigest,
      chunks: stableChunks,
    }),
  });
  const validated = snapshotStagedSource(candidate);
  if (!validated) throw new TypeError('Invalid staged source input');
  return validated;
}

export function createExecutionEffectLandingStagedChunkV1(
  input: Omit<ExecutionEffectLandingStagedChunkV1, 'artifactClass' | 'chunkDigest'>,
): ExecutionEffectLandingStagedChunkV1 {
  if (!exactDataObject(input, [
    'index', 'byteOffset', 'byteLength', 'artifactKey', 'contentDigest',
    'artifactReceiptDigest',
  ]) || !Number.isSafeInteger(input.index) || input.index < 0
    || !Number.isSafeInteger(input.byteOffset) || input.byteOffset < 0
    || !Number.isSafeInteger(input.byteLength) || input.byteLength < 0
    || !safeArtifactKey(input.artifactKey) || !isDigest(input.contentDigest)
    || !isDigest(input.artifactReceiptDigest)) {
    throw new TypeError('Invalid staged chunk input');
  }
  const authority = createExecutionEffectStagedChunkRefV1({
    index: input.index,
    byteOffset: input.byteOffset,
    byteLength: input.byteLength,
    artifactKey: input.artifactKey,
    contentDigest: input.contentDigest as ExecutionEffectPersistenceDigest,
    artifactReceiptDigest: input.artifactReceiptDigest as ExecutionEffectPersistenceDigest,
  });
  return objectFreeze({
    ...authority,
    artifactClass: 'execution-effect-staged-content' as const,
  });
}

function snapshotParentAuthority(value: unknown): ExecutionEffectLandingParentAuthorityV1 | null {
  if (exactDataObject(value, ['path', 'source', 'entry'])
    && value.source === 'PREPARED_PREIMAGE' && safeRelativePath(value.path)) {
    const entry = snapshotState(value.entry);
    return entry && entry.state === 'PRESENT' && entry.entry.kind === 'directory'
      ? objectFreeze({ path: value.path, source: 'PREPARED_PREIMAGE' as const, entry })
      : null;
  }
  if (!exactDataObject(value, [
    'path', 'source', 'operationIndex', 'operationDigest', 'expectedDirectory',
  ]) || value.source !== 'OPERATION_POSTIMAGE' || !safeRelativePath(value.path)
    || !Number.isSafeInteger(value.operationIndex) || (value.operationIndex as number) < 0
    || !isDigest(value.operationDigest)) return null;
  const directory = snapshotEntry(value.expectedDirectory);
  return directory?.kind === 'directory' && directory.path === value.path
    ? objectFreeze({
      path: value.path,
      source: 'OPERATION_POSTIMAGE' as const,
      operationIndex: value.operationIndex as number,
      operationDigest: value.operationDigest,
      expectedDirectory: directory,
    }) : null;
}

function snapshotPathState(value: unknown): ExecutionEffectLandingPathStateV1 | null {
  if (!exactDataObject(value, ['path', 'entry']) || !safeRelativePath(value.path)) return null;
  const entry = snapshotState(value.entry);
  return entry ? pathState(value.path, entry) : null;
}

function stateMatchesEntry(
  state: ExecutionEffectLandingEntryStateV1,
  expected: ExecutionEffectManifestEntry | undefined,
): boolean {
  if (expected === undefined) return state.state === 'ABSENT';
  return state.state === 'PRESENT' && sameJson(state.entry, expected)
    && (expected.kind === 'regular-file' ? state.linkCount === 1 : state.linkCount === null);
}

function validateEffectBundle(
  baselineValue: ExecutionEffectManifest,
  finalValue: ExecutionEffectManifest,
  decision: ExecutionEffectContainmentDecision,
): { baseline: ExecutionEffectManifest; final: ExecutionEffectManifest; decision: Extract<ExecutionEffectContainmentDecision, { state: 'VERIFIED' }> } | null {
  const baseline = snapshotManifest(baselineValue);
  const final = snapshotManifest(finalValue);
  if (!baseline || !final || baseline.phase !== 'baseline' || final.phase !== 'final'
    || !safeDataTree(decision) || decision.state !== 'VERIFIED') return null;
  const recomputed = evaluateExecutionEffectContainment({
    baseline: { ok: true, manifest: baseline },
    final: { ok: true, manifest: final },
  });
  if (recomputed.state !== 'VERIFIED' || !sameJson(recomputed, decision)) return null;
  return { baseline, final, decision: recomputed };
}

interface OperationSeed {
  readonly kind: ExecutionEffectLandingOperationV1['kind'];
  readonly path: string;
  readonly effectDigests: readonly string[];
  readonly derivedParent: ExecutionEffectLandingDerivedParentProvenanceV1 | null;
}

function operationSeeds(effects: readonly ExecutionEffect[]): readonly OperationSeed[] | null {
  const primary = new Map<string, ExecutionEffect>();
  const modes = new Map<string, ExecutionEffect>();
  for (const effect of effects) {
    if (effect.kind === 'mode') {
      if (modes.has(effect.path)) return null;
      modes.set(effect.path, effect);
    } else {
      if (primary.has(effect.path)) return null;
      primary.set(effect.path, effect);
    }
  }
  const seeds: OperationSeed[] = [];
  for (const effect of primary.values()) {
    const mode = modes.get(effect.path);
    if (mode) modes.delete(effect.path);
    seeds.push(objectFreeze({
      kind: effect.kind === 'add'
        ? effect.after?.kind === 'directory' ? 'ADD_DIRECTORY' : 'ADD'
        : effect.kind === 'modify' ? 'REPLACE'
          : 'DELETE',
      path: effect.path,
      effectDigests: objectFreeze([effect.digest, ...(mode ? [mode.digest] : [])].sort(compareCodePoint)),
      derivedParent: null,
    }));
  }
  for (const effect of modes.values()) {
    seeds.push(objectFreeze({
      kind: 'MODE', path: effect.path,
      effectDigests: objectFreeze([effect.digest]),
      derivedParent: null,
    }));
  }
  const rank: Record<OperationSeed['kind'], number> = {
    DELETE: 0, ADD_DIRECTORY: 1, ADD: 2, REPLACE: 3, MODE: 4,
  };
  const depth = (path: string): number => path.split('/').length;
  return objectFreeze(seeds.sort((left, right) => rank[left.kind] - rank[right.kind]
    || (left.kind === 'DELETE' ? depth(right.path) - depth(left.path) : 0)
    || (left.kind === 'ADD' ? depth(left.path) - depth(right.path) : 0)
    || compareCodePoint(left.path, right.path)));
}

function inspect(
  adapter: ExecutionEffectLandingNativeAdapterV1,
  path: string,
): ExecutionEffectLandingEntryStateV1 | null {
  try {
    return snapshotState(adapter.inspectProjectEntry(path));
  } catch {
    return null;
  }
}

function canonicalPathStates(
  values: readonly ExecutionEffectLandingPathStateV1[],
): readonly ExecutionEffectLandingPathStateV1[] {
  return objectFreeze([...values].sort((left, right) => compareCodePoint(left.path, right.path)));
}

function canonicalExpectedPathStates(
  values: readonly ExecutionEffectLandingExpectedPathStateV1[],
): readonly ExecutionEffectLandingExpectedPathStateV1[] {
  return objectFreeze([...values].sort((left, right) => compareCodePoint(left.path, right.path)));
}

async function buildOperations(
  baseline: ExecutionEffectManifest,
  final: ExecutionEffectManifest,
  effects: readonly ExecutionEffect[],
  native: ExecutionEffectLandingNativeAdapterV1,
  workspaceIdentityDigest: string,
  landingIntentDigest: string,
): Promise<readonly ExecutionEffectLandingOperationV1[] | null> {
  const seeds = operationSeeds(effects);
  if (!seeds) return null;
  const before = new Map(baseline.entries.map(entry => [entry.path, entry]));
  const after = new Map(final.entries.map(entry => [entry.path, entry]));
  const expandedSeeds = [...seeds];
  const derivedParents = new Map<string, string[]>();
  const realDirectoryAdds = new Set(
    seeds.filter(seed => seed.kind === 'ADD_DIRECTORY').map(seed => seed.path),
  );
  for (const seed of seeds) {
    if (seed.kind !== 'ADD' && seed.kind !== 'ADD_DIRECTORY') continue;
    let candidate = parentPath(seed.path);
    while (candidate !== '.' && !before.has(candidate) && !realDirectoryAdds.has(candidate)) {
      if (after.get(candidate)?.kind !== 'directory') return null;
      const evidence = derivedParents.get(candidate) ?? [];
      evidence.push(...seed.effectDigests);
      derivedParents.set(candidate, evidence);
      candidate = parentPath(candidate);
    }
  }
  for (const [path, evidence] of derivedParents) {
    const derivedParent = createExecutionEffectLandingDerivedParentProvenanceV1({
      path,
      childEffectDigests: [...new Set(evidence)].sort(compareCodePoint) as ExecutionEffectPersistenceDigest[],
    });
    expandedSeeds.push(objectFreeze({
      kind: 'ADD_DIRECTORY' as const,
      path,
      effectDigests: objectFreeze([]),
      derivedParent,
    }));
  }
  const rank: Record<OperationSeed['kind'], number> = {
    DELETE: 0, ADD_DIRECTORY: 1, ADD: 2, REPLACE: 3, MODE: 4,
  };
  const depth = (path: string): number => path.split('/').length;
  expandedSeeds.sort((left, right) => rank[left.kind] - rank[right.kind]
    || (left.kind === 'DELETE' ? depth(right.path) - depth(left.path) : 0)
    || (left.kind === 'ADD_DIRECTORY' ? depth(left.path) - depth(right.path) : 0)
    || compareCodePoint(left.path, right.path));
  const operations: ExecutionEffectLandingOperationV1[] = [];
  const directoryAdds = new Map<string, ExecutionEffectLandingOperationV1>();
  for (let index = 0; index < expandedSeeds.length; index += 1) {
    const seed = expandedSeeds[index]!;
    if (seed.path === '.') return null;
    const affected = [seed.path];
    const preimages: ExecutionEffectLandingPathStateV1[] = [];
    const postimages: ExecutionEffectLandingExpectedPathStateV1[] = [];
    for (const path of affected) {
      const observed = inspect(native, path);
      if (!observed || !stateMatchesEntry(observed, before.get(path))) return null;
      preimages.push(pathState(path, observed));
      const expectedAfter = after.get(path);
      postimages.push(expectedPathState(path, expectedState(expectedAfter)));
    }
    let stagedSource: ExecutionEffectLandingStagedSourceV1 | null = null;
    const finalEntry = after.get(seed.path);
    if ((seed.kind === 'ADD' || seed.kind === 'REPLACE')
      && finalEntry?.kind === 'regular-file') {
      try {
        stagedSource = snapshotStagedSource(await native.stageSource(objectFreeze({
          path: seed.path,
          entry: finalEntry,
          workspaceIdentityDigest,
          landingIntentDigest,
        })));
        if (!stagedSource || stagedSource.path !== seed.path
          || stagedSource.contentDigest !== finalEntry.contentDigest
          || stagedSource.byteLength !== finalEntry.size
          || stagedSource.workspaceIdentityDigest !== workspaceIdentityDigest
          || stagedSource.attemptDigest !== native.capability.attemptDigest
          || stagedSource.admissionReceiptDigest !== native.capability.admissionReceiptDigest
          || stagedSource.custodyPolicyDigest !== native.capability.custodyPolicyDigest
          || stagedSource.landingIntentDigest !== landingIntentDigest
          || stagedSource.chunks.some(chunk =>
            chunk.byteLength > native.capability.maxStagedChunkBytes)
          || native.verifyStagedSource(stagedSource) !== true) return null;
      } catch {
        return null;
      }
    }
    const parents = [...new Set(affected.map(parentPath))].sort(compareCodePoint);
    const parentAuthorities: ExecutionEffectLandingParentAuthorityV1[] = [];
    for (const path of parents) {
      const observed = inspect(native, path);
      if (observed?.state === 'PRESENT' && observed.entry.kind === 'directory') {
        parentAuthorities.push(objectFreeze({
          path, source: 'PREPARED_PREIMAGE' as const, entry: observed,
        }));
        continue;
      }
      const parentAdd = directoryAdds.get(path);
      const expectedDirectory = after.get(path);
      if (observed?.state !== 'ABSENT' || !parentAdd || expectedDirectory?.kind !== 'directory') {
        return null;
      }
      parentAuthorities.push(objectFreeze({
        path,
        source: 'OPERATION_POSTIMAGE' as const,
        operationIndex: parentAdd.index,
        operationDigest: parentAdd.operationDigest,
        expectedDirectory,
      }));
    }
    const operationBody = objectFreeze({
      version: 1 as const,
      index,
      kind: seed.kind,
      path: seed.path,
      effectDigests: seed.effectDigests,
      derivedParent: seed.derivedParent,
      stagedSource,
      entryPreimages: canonicalPathStates(preimages),
      entryPostimages: canonicalExpectedPathStates(postimages),
      parentAuthorities: objectFreeze(parentAuthorities),
    });
    const operation = objectFreeze({
      ...operationBody,
      operationDigest: executionEffectLandingOperationDigestV1({
        ...operationBody,
        stagedSource: operationBody.stagedSource === null ? null : objectFreeze({
          stageAuthorityDigest: operationBody.stagedSource.stageAuthorityDigest,
        }),
      }),
    });
    operations.push(operation);
    if (seed.kind === 'ADD_DIRECTORY' && finalEntry?.kind === 'directory') {
      directoryAdds.set(seed.path, operation);
    }
  }
  return objectFreeze(operations);
}

function revalidatePreparedAuthority(
  operations: readonly ExecutionEffectLandingOperationV1[],
  native: ExecutionEffectLandingNativeAdapterV1,
): boolean {
  try {
    for (const operation of operations) {
      if (operation.stagedSource && native.verifyStagedSource(operation.stagedSource) !== true) {
        return false;
      }
      for (const preimage of operation.entryPreimages) {
        const current = snapshotState(native.inspectProjectEntry(preimage.path));
        if (!current || !sameJson(current, preimage.entry)) return false;
      }
      for (const parent of operation.parentAuthorities) {
        const current = snapshotState(native.inspectProjectEntry(parent.path));
        if (parent.source === 'PREPARED_PREIMAGE') {
          if (!current || !sameJson(current, parent.entry)) return false;
        } else if (!current || current.state !== 'ABSENT') {
          return false;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

function validateLease(
  value: unknown,
  transactionDigest: string,
): ExecutionEffectLandingLeaseV1 | null {
  if (!exactDataObject(value, ['transactionDigest', 'fencingTokenDigest', 'leaseReceiptDigest'])
    || value.transactionDigest !== transactionDigest || !isDigest(value.fencingTokenDigest)
    || !isDigest(value.leaseReceiptDigest)) return null;
  return objectFreeze({
    transactionDigest, fencingTokenDigest: value.fencingTokenDigest,
    leaseReceiptDigest: value.leaseReceiptDigest,
  });
}

function validateBoundary(
  value: unknown,
  lease: ExecutionEffectLandingLeaseV1,
): ExecutionEffectLandingBoundaryV1 | null {
  if (!exactDataObject(value, [
    'transactionDigest', 'fencingTokenDigest', 'boundaryId', 'boundaryReceiptDigest',
  ]) || value.transactionDigest !== lease.transactionDigest
    || value.fencingTokenDigest !== lease.fencingTokenDigest || !safeId(value.boundaryId)
    || !isDigest(value.boundaryReceiptDigest)) return null;
  return objectFreeze({
    transactionDigest: value.transactionDigest,
    fencingTokenDigest: value.fencingTokenDigest,
    boundaryId: value.boundaryId,
    boundaryReceiptDigest: value.boundaryReceiptDigest,
  });
}

function journalKey(transactionDigest: string, phase: string): string {
  return `effect-landing/${transactionDigest.slice(7)}/${phase}.json`;
}

function locatorKey(attemptDigest: string): string {
  const keyDigest = digest('execution-effect-landing-locator-key-v1', { attemptDigest });
  return `effect-landing/${keyDigest.slice(7)}/prepared.json`;
}

function leaseJournalRef(
  phase: ExecutionEffectLandingLeaseJournalRefV1['phase'],
  artifact: ExecutionEffectLandingJournalArtifactV1,
  recordDigest: string,
): ExecutionEffectLandingLeaseJournalRefV1 | null {
  if (!isDigest(recordDigest)) return null;
  return objectFreeze({
    phase,
    artifactKey: artifact.key,
    artifactReceiptDigest: artifact.publicationReceiptDigest as ExecutionEffectPersistenceDigest,
    contentDigest: artifact.contentDigest as ExecutionEffectPersistenceDigest,
    byteLength: artifact.byteLength,
    recordDigest: recordDigest as ExecutionEffectPersistenceDigest,
  });
}

function resumeContext(
  transaction: ExecutionEffectLandingTransactionRefV1,
  prepared: PreparedJournalV1,
  preparedArtifact: ExecutionEffectLandingJournalArtifactV1,
  applying: Readonly<{
    readonly record: ApplyingJournalV1;
    readonly artifact: ExecutionEffectLandingJournalArtifactV1;
  }> | null,
  committed: Readonly<{
    readonly record: CommittedJournalV1;
    readonly artifact: ExecutionEffectLandingJournalArtifactV1;
  }> | null,
): ExecutionEffectLandingLeaseResumeContextV1 | null {
  const preparedRef = leaseJournalRef(
    'PREPARED',
    preparedArtifact,
    prepared.recordDigest,
  );
  const applyingRef = applying
    ? leaseJournalRef('APPLYING', applying.artifact, applying.record.recordDigest) : null;
  const committedRef = committed
    ? leaseJournalRef('COMMITTED', committed.artifact, committed.record.recordDigest) : null;
  if (!preparedRef || (applying && !applyingRef) || (committed && !committedRef)) return null;
  try {
    return createExecutionEffectLandingLeaseResumeContextV1({
      transaction,
      priorLease: prepared.acquiredLease,
      prepared: preparedRef,
      applying: applying && applyingRef
        ? objectFreeze({
          journal: applyingRef,
          previousBoundary: applying.record.boundary,
        }) : null,
      committed: committed && committedRef
        ? objectFreeze({
          journal: committedRef,
          disposition: committed.record.disposition,
        }) : null,
    });
  } catch {
    return null;
  }
}

function adoptLease(
  adapter: ExecutionEffectLandingLeaseAdapterV1,
  context: ExecutionEffectLandingLeaseResumeContextV1,
): ExecutionEffectLandingLeaseResumeResultV1 | null {
  try {
    return parseExecutionEffectLandingLeaseResumeResultV1(adapter.resume(context), context);
  } catch {
    return null;
  }
}

function artifactSnapshot(value: unknown): ExecutionEffectLandingJournalArtifactV1 | null {
  if (!exactDataObject(value, [
    'key', 'bytes', 'contentDigest', 'byteLength', 'publicationReceiptDigest',
  ]) || typeof value.key !== 'string' || !isDigest(value.contentDigest)
    || !Number.isSafeInteger(value.byteLength) || (value.byteLength as number) < 0
    || (value.byteLength as number) > MAX_JOURNAL_BYTES || !isDigest(value.publicationReceiptDigest)
    || !(value.bytes instanceof Uint8Array) || nodeTypes.isProxy(value.bytes)
    || value.bytes.byteLength !== value.byteLength) return null;
  const bytes = Uint8Array.from(value.bytes);
  const contentDigest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  return contentDigest === value.contentDigest
    ? objectFreeze({
      key: value.key,
      bytes,
      contentDigest,
      byteLength: value.byteLength as number,
      publicationReceiptDigest: value.publicationReceiptDigest,
    }) : null;
}

function publishRecord<TRecord extends
  | { readonly recordDigest: string }
  | { readonly locatorDigest: string }>(
  journal: ExecutionEffectLandingJournalAdapterV1,
  key: string,
  record: TRecord,
): ExecutionEffectLandingJournalArtifactV1 | null {
  const bytes = Buffer.from(canonicalJson(record), 'utf8');
  const contentDigest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  let published: unknown;
  try {
    published = journal.publishImmutable(objectFreeze({ key, bytes: Uint8Array.from(bytes), contentDigest }));
  } catch {
    return null;
  }
  const artifact = artifactSnapshot(published);
  if (!artifact || artifact.key !== key || artifact.contentDigest !== contentDigest
    || !Buffer.from(artifact.bytes).equals(bytes)) return null;
  let durable: unknown;
  try { durable = journal.readImmutable(key); } catch { return null; }
  const reread = artifactSnapshot(durable);
  return reread && sameJson(reread, artifact) && Buffer.from(reread.bytes).equals(bytes)
    ? reread : null;
}

function readJsonArtifact(
  journal: ExecutionEffectLandingJournalAdapterV1,
  key: string,
): { artifact: ExecutionEffectLandingJournalArtifactV1; value: unknown } | null {
  let raw: unknown;
  try { raw = journal.readImmutable(key); } catch { return null; }
  const artifact = artifactSnapshot(raw);
  if (!artifact || artifact.key !== key) return null;
  try {
    const text = Buffer.from(artifact.bytes).toString('utf8');
    const value = JSON.parse(text) as unknown;
    if (canonicalJson(value) !== text) return null;
    return { artifact, value };
  } catch {
    return null;
  }
}

function recordWithDigest<TBody extends object>(domain: string, body: TBody): TBody & { readonly recordDigest: string } {
  return objectFreeze({ ...body, recordDigest: digest(domain, body) });
}

function transactionSnapshot(value: unknown): ExecutionEffectLandingTransactionRefV1 | null {
  if (!exactDataObject(value, [
    'version', 'projectId', 'taskId', 'attemptId', 'generation', 'attemptDigest',
    'baselineManifestDigest', 'finalManifestDigest', 'containmentDecisionDigest',
    'planId', 'planDigest', 'transactionDigest',
  ]) || value.version !== 1 || !safeId(value.projectId) || !safeId(value.taskId)
    || !safeId(value.attemptId) || !Number.isSafeInteger(value.generation)
    || (value.generation as number) <= 0 || !isDigest(value.attemptDigest)
    || !isDigest(value.baselineManifestDigest) || !isDigest(value.finalManifestDigest)
    || !isDigest(value.containmentDecisionDigest) || !safeId(value.planId)
    || !isDigest(value.planDigest) || !isDigest(value.transactionDigest)) return null;
  const body = objectFreeze({
    version: 1 as const,
    projectId: value.projectId,
    taskId: value.taskId,
    attemptId: value.attemptId,
    generation: value.generation as number,
    attemptDigest: value.attemptDigest,
    baselineManifestDigest: value.baselineManifestDigest,
    finalManifestDigest: value.finalManifestDigest,
    containmentDecisionDigest: value.containmentDecisionDigest,
    planId: value.planId,
    planDigest: value.planDigest,
  });
  return digest('execution-effect-landing-transaction-v1', body) === value.transactionDigest
    ? objectFreeze({ ...body, transactionDigest: value.transactionDigest }) : null;
}

function operationSnapshot(value: unknown): ExecutionEffectLandingOperationV1 | null {
  if (!exactDataObject(value, [
    'version', 'index', 'kind', 'path', 'effectDigests', 'derivedParent',
    'stagedSource', 'entryPreimages', 'entryPostimages', 'parentAuthorities',
    'operationDigest',
  ]) || value.version !== 1 || !Number.isSafeInteger(value.index) || (value.index as number) < 0
    || !['ADD_DIRECTORY', 'ADD', 'REPLACE', 'DELETE', 'MODE'].includes(value.kind as string)
    || !safeRelativePath(value.path)
    || !Array.isArray(value.effectDigests) || !Array.isArray(value.entryPreimages)
    || !Array.isArray(value.entryPostimages) || !Array.isArray(value.parentAuthorities)
    || !isDigest(value.operationDigest)) return null;
  const effectDigests = [...value.effectDigests];
  if (effectDigests.some(item => !isDigest(item))
    || effectDigests.some((item, index) => index > 0 && compareCodePoint(effectDigests[index - 1] as string, item as string) >= 0)) return null;
  let derivedParent: ExecutionEffectLandingDerivedParentProvenanceV1 | null = null;
  if (value.derivedParent !== null) {
    try {
      if (!exactDataObject(value.derivedParent, [
        'kind', 'path', 'childEffectDigests', 'provenanceDigest',
      ]) || value.derivedParent.kind !== 'DERIVED_PARENT'
        || !Array.isArray(value.derivedParent.childEffectDigests)) return null;
      derivedParent = createExecutionEffectLandingDerivedParentProvenanceV1({
        path: value.derivedParent.path as string,
        childEffectDigests:
          value.derivedParent.childEffectDigests as ExecutionEffectPersistenceDigest[],
      });
      if (!sameJson(derivedParent, value.derivedParent)) return null;
    } catch {
      return null;
    }
  }
  if (derivedParent === null
    ? value.derivedParent !== null || effectDigests.length === 0
    : value.kind !== 'ADD_DIRECTORY' || effectDigests.length !== 0
      || derivedParent.path !== value.path) return null;
  const snapshotStates = (raw: unknown[]): readonly ExecutionEffectLandingPathStateV1[] | null => {
    const values: ExecutionEffectLandingPathStateV1[] = [];
    for (const item of raw) {
      const state = snapshotPathState(item);
      if (!state || (values.length > 0 && compareCodePoint(values[values.length - 1]!.path, state.path) >= 0)) return null;
      values.push(state);
    }
    return objectFreeze(values);
  };
  const pre = snapshotStates(value.entryPreimages);
  const postValues: ExecutionEffectLandingExpectedPathStateV1[] = [];
  for (const raw of value.entryPostimages) {
    const state = snapshotExpectedPathState(raw);
    if (!state || (postValues.length > 0
      && compareCodePoint(postValues[postValues.length - 1]!.path, state.path) >= 0)) return null;
    postValues.push(state);
  }
  const post = objectFreeze(postValues);
  const parents: ExecutionEffectLandingParentAuthorityV1[] = [];
  for (const raw of value.parentAuthorities) {
    const authority = snapshotParentAuthority(raw);
    if (!authority || (parents.length > 0
      && compareCodePoint(parents[parents.length - 1]!.path, authority.path) >= 0)) return null;
    parents.push(authority);
  }
  const stagedSource = value.stagedSource === null ? null : snapshotStagedSource(value.stagedSource);
  if (!pre || !post || !stagedSource && value.stagedSource !== null) return null;
  const body = objectFreeze({
    version: 1 as const,
    index: value.index as number,
    kind: value.kind as ExecutionEffectLandingOperationV1['kind'],
    path: value.path,
    effectDigests: objectFreeze(effectDigests as string[]),
    derivedParent,
    stagedSource,
    entryPreimages: pre,
    entryPostimages: post,
    parentAuthorities: objectFreeze(parents),
  });
  return executionEffectLandingOperationDigestV1({
    ...body,
    stagedSource: body.stagedSource === null ? null : objectFreeze({
      stageAuthorityDigest: body.stagedSource.stageAuthorityDigest,
    }),
  }) === value.operationDigest
    ? objectFreeze({ ...body, operationDigest: value.operationDigest }) : null;
}

function preparedSnapshot(value: unknown): PreparedJournalV1 | null {
  if (!exactDataObject(value, [
    'version', 'kind', 'phase', 'transaction', 'operations', 'nativeCapabilityDigest',
    'journalCapabilityDigest', 'leaseCapabilityDigest', 'acquiredLease', 'preparedAt',
    'recordDigest',
  ]) || value.version !== 1 || value.kind !== 'execution-effect-landing-prepared'
    || value.phase !== 'PREPARED' || !Array.isArray(value.operations)
    || value.operations.length > MAX_OPERATIONS || !isDigest(value.nativeCapabilityDigest)
    || !isDigest(value.journalCapabilityDigest) || !isDigest(value.leaseCapabilityDigest)
    || !validTimestamp(value.preparedAt) || !isDigest(value.recordDigest)) return null;
  const transaction = transactionSnapshot(value.transaction);
  if (!transaction) return null;
  const acquiredLease = validateLease(value.acquiredLease, transaction.transactionDigest);
  if (!acquiredLease) return null;
  const operations: ExecutionEffectLandingOperationV1[] = [];
  for (let index = 0; index < value.operations.length; index += 1) {
    const operation = operationSnapshot(value.operations[index]);
    if (!operation || operation.index !== index) return null;
    operations.push(operation);
  }
  if (digest('execution-effect-landing-plan-v1', operations.map(operation => operation.operationDigest))
    !== transaction.planDigest) return null;
  const body = objectFreeze({
    version: 1 as const,
    kind: 'execution-effect-landing-prepared' as const,
    phase: 'PREPARED' as const,
    transaction,
    operations: objectFreeze(operations),
    nativeCapabilityDigest: value.nativeCapabilityDigest,
    journalCapabilityDigest: value.journalCapabilityDigest,
    leaseCapabilityDigest: value.leaseCapabilityDigest,
    acquiredLease,
    preparedAt: value.preparedAt,
  });
  return digest('execution-effect-landing-prepared-journal-v1', body) === value.recordDigest
    ? objectFreeze({ ...body, recordDigest: value.recordDigest }) : null;
}

function readPrepared(
  transaction: ExecutionEffectLandingTransactionRefV1,
  adapters: SnapshottedAdapters,
): { prepared: PreparedJournalV1; artifact: ExecutionEffectLandingJournalArtifactV1 } | null {
  const read = readJsonArtifact(adapters.journal, journalKey(transaction.transactionDigest, 'prepared'));
  const prepared = read ? preparedSnapshot(read.value) : null;
  if (!read || !prepared || !sameJson(prepared.transaction, transaction)
    || prepared.nativeCapabilityDigest !== adapters.native.capability.capabilityDigest
    || prepared.journalCapabilityDigest !== adapters.journal.capability.capabilityDigest
    || prepared.leaseCapabilityDigest !== adapters.lease.capability.capabilityDigest) return null;
  return { prepared, artifact: read.artifact };
}

function locatorSnapshot(value: unknown): ExecutionEffectLandingLocatorV1 | null {
  if (!exactDataObject(value, [
    'version', 'kind', 'state', 'transaction', 'preparedJournalDigest',
    'preparedJournalContentDigest', 'preparedJournalPublicationReceiptDigest',
    'nativeCapabilityDigest', 'journalCapabilityDigest', 'leaseCapabilityDigest',
    'publishedAt', 'locatorDigest',
  ]) || value.version !== 1 || value.kind !== 'execution-effect-landing-locator'
    || value.state !== 'DURABLE' || !isDigest(value.preparedJournalDigest)
    || !isDigest(value.preparedJournalContentDigest)
    || !isDigest(value.preparedJournalPublicationReceiptDigest)
    || !isDigest(value.nativeCapabilityDigest) || !isDigest(value.journalCapabilityDigest)
    || !isDigest(value.leaseCapabilityDigest) || !validTimestamp(value.publishedAt)
    || !isDigest(value.locatorDigest)) return null;
  const transaction = transactionSnapshot(value.transaction);
  if (!transaction) return null;
  const body = objectFreeze({
    version: 1 as const,
    kind: 'execution-effect-landing-locator' as const,
    state: 'DURABLE' as const,
    transaction,
    preparedJournalDigest: value.preparedJournalDigest,
    preparedJournalContentDigest: value.preparedJournalContentDigest,
    preparedJournalPublicationReceiptDigest: value.preparedJournalPublicationReceiptDigest,
    nativeCapabilityDigest: value.nativeCapabilityDigest,
    journalCapabilityDigest: value.journalCapabilityDigest,
    leaseCapabilityDigest: value.leaseCapabilityDigest,
    publishedAt: value.publishedAt,
  });
  return digest('execution-effect-landing-locator-v1', body) === value.locatorDigest
    ? objectFreeze({ ...body, locatorDigest: value.locatorDigest }) : null;
}

function readLocator(
  adapters: SnapshottedAdapters,
): Readonly<{
  readonly locator: ExecutionEffectLandingLocatorV1;
  readonly artifact: ExecutionEffectLandingJournalArtifactV1;
  readonly prepared: PreparedJournalV1;
  readonly preparedArtifact: ExecutionEffectLandingJournalArtifactV1;
}> | null {
  const read = readJsonArtifact(
    adapters.journal,
    locatorKey(adapters.native.capability.attemptDigest),
  );
  const locator = read ? locatorSnapshot(read.value) : null;
  if (!read || !locator
    || locator.nativeCapabilityDigest !== adapters.native.capability.capabilityDigest
    || locator.journalCapabilityDigest !== adapters.journal.capability.capabilityDigest
    || locator.leaseCapabilityDigest !== adapters.lease.capability.capabilityDigest) return null;
  const durable = readPrepared(locator.transaction, adapters);
  if (!durable || durable.prepared.recordDigest !== locator.preparedJournalDigest
    || durable.artifact.contentDigest !== locator.preparedJournalContentDigest
    || durable.artifact.publicationReceiptDigest
      !== locator.preparedJournalPublicationReceiptDigest) return null;
  return objectFreeze({
    locator,
    artifact: read.artifact,
    prepared: durable.prepared,
    preparedArtifact: durable.artifact,
  });
}

function ensureLocator(
  adapters: SnapshottedAdapters,
  prepared: PreparedJournalV1,
  preparedArtifact: ExecutionEffectLandingJournalArtifactV1,
): Readonly<{
  readonly locator: ExecutionEffectLandingLocatorV1;
  readonly artifact: ExecutionEffectLandingJournalArtifactV1;
}> | null {
  const existing = readLocator(adapters);
  if (existing) {
    return sameJson(existing.locator.transaction, prepared.transaction)
      && existing.locator.preparedJournalDigest === prepared.recordDigest
      && existing.locator.preparedJournalContentDigest === preparedArtifact.contentDigest
      && existing.locator.preparedJournalPublicationReceiptDigest
        === preparedArtifact.publicationReceiptDigest
      ? objectFreeze({ locator: existing.locator, artifact: existing.artifact }) : null;
  }
  const body = objectFreeze({
    version: 1 as const,
    kind: 'execution-effect-landing-locator' as const,
    state: 'DURABLE' as const,
    transaction: prepared.transaction,
    preparedJournalDigest: prepared.recordDigest,
    preparedJournalContentDigest: preparedArtifact.contentDigest,
    preparedJournalPublicationReceiptDigest: preparedArtifact.publicationReceiptDigest,
    nativeCapabilityDigest: prepared.nativeCapabilityDigest,
    journalCapabilityDigest: prepared.journalCapabilityDigest,
    leaseCapabilityDigest: prepared.leaseCapabilityDigest,
    publishedAt: hostTimestamp(),
  });
  const locator = objectFreeze({
    ...body,
    locatorDigest: digest('execution-effect-landing-locator-v1', body),
  });
  const artifact = publishRecord(
    adapters.journal,
    locatorKey(prepared.transaction.attemptDigest),
    locator,
  );
  if (!artifact) return null;
  const durable = readLocator(adapters);
  return durable && sameJson(durable.locator, locator)
    && durable.artifact.contentDigest === artifact.contentDigest
    && durable.artifact.publicationReceiptDigest === artifact.publicationReceiptDigest
    ? objectFreeze({ locator: durable.locator, artifact: durable.artifact }) : null;
}

function validateReceipt(
  value: unknown,
  operation: ExecutionEffectLandingOperationV1,
): ExecutionEffectLandingNativeMutationReceiptV1 | null {
  if (!exactDataObject(value, [
    'version', 'state', 'operationDigest', 'entryPreimages', 'entryPostimages',
    'parentAuthorities', 'durabilityEvidenceDigest', 'receiptDigest',
  ]) || value.version !== 1 || value.state !== 'APPLIED'
    || value.operationDigest !== operation.operationDigest
    || !Array.isArray(value.entryPreimages) || !Array.isArray(value.entryPostimages)
    || !Array.isArray(value.parentAuthorities) || !isDigest(value.durabilityEvidenceDigest)
    || !isDigest(value.receiptDigest)) return null;
  const snapshot = (raw: unknown[]): readonly ExecutionEffectLandingPathStateV1[] | null => {
    const result = raw.map(snapshotPathState);
    return result.some(item => item === null)
      ? null : objectFreeze(result as ExecutionEffectLandingPathStateV1[]);
  };
  const pre = snapshot(value.entryPreimages);
  const post = snapshot(value.entryPostimages);
  const parents: ExecutionEffectLandingParentAuthorityV1[] = [];
  for (const raw of value.parentAuthorities) {
    const authority = snapshotParentAuthority(raw);
    if (!authority) return null;
    parents.push(authority);
  }
  if (!pre || !post || !sameJson(pre, operation.entryPreimages)
    || !sameJson(post.map(item => ({ path: item.path, entry: item.entry.state === 'PRESENT' ? item.entry.entry : null })),
      operation.entryPostimages.map(item => ({ path: item.path, entry: item.entry.state === 'PRESENT' ? item.entry.entry : null })))
    || post.some(item => item.entry.state === 'PRESENT'
      && item.entry.entry.kind === 'regular-file' && item.entry.linkCount !== 1)
    || !sameJson(parents, operation.parentAuthorities)) return null;
  if ((operation.kind === 'ADD' || operation.kind === 'REPLACE')
    && operation.entryPostimages.some(item => item.entry.state === 'PRESENT'
      && item.entry.entry.kind === 'regular-file')
    && operation.stagedSource === null) return null;
  if (operation.kind === 'MODE') {
    const before = pre[0]?.entry;
    const after = post[0]?.entry;
    if (!before || !after || before.state !== 'PRESENT' || after.state !== 'PRESENT'
      || before.objectIdentityDigest !== after.objectIdentityDigest) return null;
  }
  const body = objectFreeze({
    version: 1 as const,
    state: 'APPLIED' as const,
    operationDigest: operation.operationDigest,
    entryPreimages: pre,
    entryPostimages: post,
    parentAuthorities: objectFreeze(parents),
    durabilityEvidenceDigest: value.durabilityEvidenceDigest,
  });
  return digest('execution-effect-landing-native-receipt-v1', body) === value.receiptDigest
    ? objectFreeze({ ...body, receiptDigest: value.receiptDigest }) : null;
}

export function createExecutionEffectLandingNativeMutationReceiptV1(
  input: Readonly<{
    readonly operation: ExecutionEffectLandingOperationV1;
    readonly entryPostimages: readonly ExecutionEffectLandingPathStateV1[];
    readonly durabilityEvidenceDigest: string;
  }>,
): ExecutionEffectLandingNativeMutationReceiptV1 {
  if (!exactDataObject(input, ['operation', 'entryPostimages', 'durabilityEvidenceDigest'])
    || !isDigest(input.durabilityEvidenceDigest) || !Array.isArray(input.entryPostimages)) {
    throw new TypeError('Invalid native mutation receipt input');
  }
  const operation = operationSnapshot(input.operation);
  if (!operation) throw new TypeError('Invalid native mutation operation');
  const postimages: ExecutionEffectLandingPathStateV1[] = [];
  for (const raw of input.entryPostimages) {
    const state = snapshotPathState(raw);
    if (!state) throw new TypeError('Invalid native mutation postimage');
    postimages.push(state);
  }
  const body = objectFreeze({
    version: 1 as const,
    state: 'APPLIED' as const,
    operationDigest: operation.operationDigest,
    entryPreimages: operation.entryPreimages,
    entryPostimages: objectFreeze(postimages),
    parentAuthorities: operation.parentAuthorities,
    durabilityEvidenceDigest: input.durabilityEvidenceDigest,
  });
  const candidate = objectFreeze({
    ...body,
    receiptDigest: digest('execution-effect-landing-native-receipt-v1', body),
  });
  const validated = validateReceipt(candidate, operation);
  if (!validated) throw new TypeError('Invalid native mutation receipt input');
  return validated;
}

function snapshotFinalVerification(
  value: unknown,
  transaction: ExecutionEffectLandingTransactionRefV1,
  receiptDigests: readonly string[],
): ExecutionEffectLandingFinalVerificationReceiptV1 | null {
  if (!exactDataObject(value, [
    'version', 'state', 'transactionDigest', 'planDigest', 'operationReceiptDigests',
    'postimageSetDigest', 'durabilityEvidenceDigest', 'receiptDigest',
  ]) || value.version !== 1 || value.state !== 'VERIFIED'
    || value.transactionDigest !== transaction.transactionDigest
    || value.planDigest !== transaction.planDigest
    || !Array.isArray(value.operationReceiptDigests)
    || !isDigest(value.postimageSetDigest) || !isDigest(value.durabilityEvidenceDigest)
    || !isDigest(value.receiptDigest)) return null;
  if (!sameJson(value.operationReceiptDigests, receiptDigests)) return null;
  const body = objectFreeze({
    version: 1 as const,
    state: 'VERIFIED' as const,
    transactionDigest: transaction.transactionDigest,
    planDigest: transaction.planDigest,
    operationReceiptDigests: objectFreeze(receiptDigests),
    postimageSetDigest: value.postimageSetDigest,
    durabilityEvidenceDigest: value.durabilityEvidenceDigest,
  });
  return digest('execution-effect-landing-final-verification-v1', body) === value.receiptDigest
    ? objectFreeze({ ...body, receiptDigest: value.receiptDigest }) : null;
}


function validateFinalVerification(
  value: unknown,
  transaction: ExecutionEffectLandingTransactionRefV1,
  operations: readonly ExecutionEffectLandingOperationV1[],
  receipts: readonly ExecutionEffectLandingNativeMutationReceiptV1[],
): ExecutionEffectLandingFinalVerificationReceiptV1 | null {
  const snapshot = snapshotFinalVerification(
    value,
    transaction,
    receipts.map(receipt => receipt.receiptDigest),
  );
  if (!snapshot) return null;
  const expectedPostimageSetDigest = digest(
    'execution-effect-landing-final-postimage-set-v1',
    operations.map((operation, index) => ({
      operationDigest: operation.operationDigest,
      entryPostimages: receipts[index]?.entryPostimages ?? null,
    })),
  );
  return snapshot.postimageSetDigest === expectedPostimageSetDigest ? snapshot : null;
}

export function createExecutionEffectLandingFinalVerificationReceiptV1(
  input: Readonly<{
    readonly transaction: ExecutionEffectLandingTransactionRefV1;
    readonly operations: readonly ExecutionEffectLandingOperationV1[];
    readonly operationReceipts: readonly ExecutionEffectLandingNativeMutationReceiptV1[];
    readonly durabilityEvidenceDigest: string;
  }>,
): ExecutionEffectLandingFinalVerificationReceiptV1 {
  if (!exactDataObject(input, [
    'transaction', 'operations', 'operationReceipts', 'durabilityEvidenceDigest',
  ]) || !isDigest(input.durabilityEvidenceDigest)) {
    throw new TypeError('Invalid final verification input');
  }
  const transaction = transactionSnapshot(input.transaction);
  if (!transaction || !Array.isArray(input.operations) || !Array.isArray(input.operationReceipts)) {
    throw new TypeError('Invalid final verification input');
  }
  const operations = input.operations.map(operationSnapshot);
  if (operations.some(operation => operation === null)) {
    throw new TypeError('Invalid final verification operation');
  }
  const receipts = input.operationReceipts.map((receipt, index) =>
    validateReceipt(receipt, operations[index] as ExecutionEffectLandingOperationV1));
  if (receipts.some(receipt => receipt === null)) {
    throw new TypeError('Invalid final verification receipt');
  }
  const concreteOperations = operations as ExecutionEffectLandingOperationV1[];
  const concreteReceipts = receipts as ExecutionEffectLandingNativeMutationReceiptV1[];
  const receiptDigests = concreteReceipts.map(receipt => receipt.receiptDigest);
  const body = objectFreeze({
    version: 1 as const,
    state: 'VERIFIED' as const,
    transactionDigest: transaction.transactionDigest,
    planDigest: transaction.planDigest,
    operationReceiptDigests: objectFreeze(receiptDigests),
    postimageSetDigest: digest(
      'execution-effect-landing-final-postimage-set-v1',
      concreteOperations.map((operation, index) => ({
        operationDigest: operation.operationDigest,
        entryPostimages: concreteReceipts[index]!.entryPostimages,
      })),
    ),
    durabilityEvidenceDigest: input.durabilityEvidenceDigest,
  });
  return objectFreeze({
    ...body,
    receiptDigest: digest('execution-effect-landing-final-verification-v1', body),
  });
}

function applyingSnapshot(value: unknown, prepared: PreparedJournalV1): ApplyingJournalV1 | null {
  if (!exactDataObject(value, [
    'version', 'kind', 'phase', 'transactionDigest', 'preparedJournalDigest',
    'boundary', 'applyingAt', 'recordDigest',
  ]) || value.version !== 1 || value.kind !== 'execution-effect-landing-applying'
    || value.phase !== 'APPLYING' || value.transactionDigest !== prepared.transaction.transactionDigest
    || value.preparedJournalDigest !== prepared.recordDigest || !validTimestamp(value.applyingAt)
    || !isDigest(value.recordDigest)) return null;
  const boundary = validateBoundary(value.boundary, prepared.acquiredLease);
  if (!boundary) return null;
  const body = objectFreeze({
    version: 1 as const,
    kind: 'execution-effect-landing-applying' as const,
    phase: 'APPLYING' as const,
    transactionDigest: value.transactionDigest,
    preparedJournalDigest: value.preparedJournalDigest,
    boundary,
    applyingAt: value.applyingAt,
  });
  return digest('execution-effect-landing-applying-journal-v1', body) === value.recordDigest
    ? objectFreeze({ ...body, recordDigest: value.recordDigest }) : null;
}

function stepSnapshot(
  value: unknown,
  prepared: PreparedJournalV1,
  applying: ApplyingJournalV1,
  previousJournalDigest: string,
  index: number,
): StepJournalV1 | null {
  if (!exactDataObject(value, [
    'version', 'kind', 'phase', 'transactionDigest', 'preparedJournalDigest',
    'applyingJournalDigest', 'previousJournalDigest', 'index', 'operationDigest',
    'nativeReceipt', 'reconciledAfterCrash', 'appliedAt', 'recordDigest',
  ]) || value.version !== 1 || value.kind !== 'execution-effect-landing-step'
    || value.phase !== 'STEP' || value.transactionDigest !== prepared.transaction.transactionDigest
    || value.preparedJournalDigest !== prepared.recordDigest
    || value.applyingJournalDigest !== applying.recordDigest
    || value.previousJournalDigest !== previousJournalDigest || value.index !== index
    || typeof value.reconciledAfterCrash !== 'boolean' || !validTimestamp(value.appliedAt)
    || !isDigest(value.recordDigest)) return null;
  const operation = prepared.operations[index];
  if (!operation || value.operationDigest !== operation.operationDigest) return null;
  const nativeReceipt = validateReceipt(value.nativeReceipt, operation);
  if (!nativeReceipt) return null;
  const body = objectFreeze({
    version: 1 as const,
    kind: 'execution-effect-landing-step' as const,
    phase: 'STEP' as const,
    transactionDigest: value.transactionDigest,
    preparedJournalDigest: value.preparedJournalDigest,
    applyingJournalDigest: value.applyingJournalDigest,
    previousJournalDigest: value.previousJournalDigest,
    index,
    operationDigest: value.operationDigest,
    nativeReceipt,
    reconciledAfterCrash: value.reconciledAfterCrash,
    appliedAt: value.appliedAt,
  });
  return digest('execution-effect-landing-step-journal-v1', body) === value.recordDigest
    ? objectFreeze({ ...body, recordDigest: value.recordDigest }) : null;
}

function committedSnapshot(value: unknown, prepared: PreparedJournalV1): CommittedJournalV1 | null {
  if (!exactDataObject(value, [
    'version', 'kind', 'phase', 'disposition', 'transaction', 'preparedJournalDigest',
    'applyingJournalDigest', 'lastJournalDigest', 'operationReceiptDigests',
    'finalVerificationReceipt', 'committedAt', 'recordDigest',
  ]) || value.version !== 1 || value.kind !== 'execution-effect-landing-committed'
    || value.phase !== 'COMMITTED'
    || (value.disposition !== 'COMMITTED' && value.disposition !== 'COMMITTED_NO_CHANGE')
    || !sameJson(value.transaction, prepared.transaction)
    || value.preparedJournalDigest !== prepared.recordDigest
    || (value.applyingJournalDigest !== null && !isDigest(value.applyingJournalDigest))
    || !isDigest(value.lastJournalDigest) || !Array.isArray(value.operationReceiptDigests)
    || value.operationReceiptDigests.some(item => !isDigest(item))
    || !validTimestamp(value.committedAt) || !isDigest(value.recordDigest)) return null;
  const finalVerificationReceipt = value.finalVerificationReceipt === null
    ? null
    : snapshotFinalVerification(
      value.finalVerificationReceipt,
      prepared.transaction,
      value.operationReceiptDigests as string[],
    );
  if (value.disposition === 'COMMITTED' && !finalVerificationReceipt) return null;
  if (value.disposition === 'COMMITTED_NO_CHANGE' && value.finalVerificationReceipt !== null) return null;
  const body = objectFreeze({
    version: 1 as const,
    kind: 'execution-effect-landing-committed' as const,
    phase: 'COMMITTED' as const,
    disposition: value.disposition,
    transaction: prepared.transaction,
    preparedJournalDigest: value.preparedJournalDigest,
    applyingJournalDigest: value.applyingJournalDigest as string | null,
    lastJournalDigest: value.lastJournalDigest,
    operationReceiptDigests: objectFreeze([...value.operationReceiptDigests] as string[]),
    finalVerificationReceipt,
    committedAt: value.committedAt,
  });
  return digest('execution-effect-landing-committed-journal-v1', body) === value.recordDigest
    ? objectFreeze({ ...body, recordDigest: value.recordDigest }) : null;
}

interface VerifiedCommittedJournalChainV1 {
  readonly applying: ApplyingJournalV1 | null;
  readonly applyingArtifact: ExecutionEffectLandingJournalArtifactV1 | null;
  readonly operationReceipts: readonly ExecutionEffectLandingNativeMutationReceiptV1[];
}

function verifyCommittedJournalChain(
  journal: ExecutionEffectLandingJournalAdapterV1,
  prepared: PreparedJournalV1,
  committed: CommittedJournalV1,
): VerifiedCommittedJournalChainV1 | null {
  const transactionDigest = prepared.transaction.transactionDigest;
  if (prepared.operations.length === 0) {
    const unexpectedApplying = readJsonArtifact(
      journal,
      journalKey(transactionDigest, 'applying'),
    );
    const unexpectedStep = readJsonArtifact(
      journal,
      journalKey(transactionDigest, 'step-0000000'),
    );
    return unexpectedApplying === null
      && unexpectedStep === null
      && committed.disposition === 'COMMITTED_NO_CHANGE'
      && committed.applyingJournalDigest === null
      && committed.lastJournalDigest === prepared.recordDigest
      && committed.operationReceiptDigests.length === 0
      && committed.finalVerificationReceipt === null
      ? objectFreeze({
        applying: null,
        applyingArtifact: null,
        operationReceipts: objectFreeze([]),
      }) : null;
  }
  const applyingRead = readJsonArtifact(
    journal,
    journalKey(transactionDigest, 'applying'),
  );
  const applying = applyingRead ? applyingSnapshot(applyingRead.value, prepared) : null;
  if (!applyingRead || !applying || committed.disposition !== 'COMMITTED'
    || committed.applyingJournalDigest !== applying.recordDigest) return null;
  let previous = applying.recordDigest;
  const receiptDigests: string[] = [];
  const operationReceipts: ExecutionEffectLandingNativeMutationReceiptV1[] = [];
  for (let index = 0; index < prepared.operations.length; index += 1) {
    const stepRead = readJsonArtifact(
      journal,
      journalKey(transactionDigest, `step-${String(index).padStart(7, '0')}`),
    );
    const step = stepRead
      ? stepSnapshot(stepRead.value, prepared, applying, previous, index)
      : null;
    if (!step) return null;
    previous = step.recordDigest;
    receiptDigests.push(step.nativeReceipt.receiptDigest);
    operationReceipts.push(step.nativeReceipt);
  }
  const suffix = readJsonArtifact(
    journal,
    journalKey(
      transactionDigest,
      `step-${String(prepared.operations.length).padStart(7, '0')}`,
    ),
  );
  return suffix === null
    && committed.lastJournalDigest === previous
    && sameJson(committed.operationReceiptDigests, receiptDigests)
    && committed.finalVerificationReceipt !== null
    && sameJson(
      committed.finalVerificationReceipt.operationReceiptDigests,
      receiptDigests,
    )
    ? objectFreeze({
      applying,
      applyingArtifact: applyingRead.artifact,
      operationReceipts: objectFreeze(operationReceipts),
    }) : null;
}

function terminalSnapshot(
  value: unknown,
  transaction: ExecutionEffectLandingTransactionRefV1,
  committedDigest: string,
): ExecutionEffectLandingLeaseTerminalV1 | null {
  if (!exactDataObject(value, [
    'transactionDigest', 'terminal', 'committedJournalDigest', 'terminalReceiptDigest',
  ]) || value.transactionDigest !== transaction.transactionDigest
    || (value.terminal !== 'COMPLETED' && value.terminal !== 'RELEASED_NO_CHANGE')
    || value.committedJournalDigest !== committedDigest || !isDigest(value.terminalReceiptDigest)) {
    return null;
  }
  return objectFreeze({
    transactionDigest: value.transactionDigest,
    terminal: value.terminal,
    committedJournalDigest: value.committedJournalDigest,
    terminalReceiptDigest: value.terminalReceiptDigest,
  });
}

function makeReceipt(
  committed: CommittedJournalV1,
  terminal: ExecutionEffectLandingLeaseTerminalV1,
): ExecutionEffectLandingReceiptV1 {
  return createExecutionEffectLandingReceiptV1({
    state: committed.disposition,
    transaction: committed.transaction,
    committedJournalDigest: committed.recordDigest as ExecutionEffectPersistenceDigest,
    leaseTerminalReceiptDigest: terminal.terminalReceiptDigest as ExecutionEffectPersistenceDigest,
    operationReceiptDigests: committed.operationReceiptDigests as ExecutionEffectPersistenceDigest[],
    finalVerificationReceiptDigest:
      committed.finalVerificationReceipt?.receiptDigest as ExecutionEffectPersistenceDigest | undefined
      ?? null,
  });
}

function quarantineSafely(
  adapters: SnapshottedAdapters,
  lease: ExecutionEffectLandingLeaseV1,
  boundary: ExecutionEffectLandingBoundaryV1 | null,
  evidence: readonly string[],
): readonly string[] {
  try {
    const receipt = adapters.lease.quarantine(lease, boundary, evidence);
    return isDigest(receipt) ? objectFreeze([...evidence, receipt].filter(isDigest)) : evidence;
  } catch {
    return evidence;
  }
}

interface BoundedLandingEvidenceV1 {
  readonly transactionDigest: string;
  readonly preparedJournalDigest: string;
  leaseReceiptDigest: string;
  boundaryReceiptDigest: string | null;
  applyingJournalDigest: string | null;
  count: number;
  fanInDigest: string;
}

function createBoundedLandingEvidence(
  transactionDigest: string,
  preparedJournalDigest: string,
  leaseReceiptDigest: string,
  initial: readonly string[] = [],
): BoundedLandingEvidenceV1 {
  const evidence: BoundedLandingEvidenceV1 = {
    transactionDigest,
    preparedJournalDigest,
    leaseReceiptDigest,
    boundaryReceiptDigest: null,
    applyingJournalDigest: null,
    count: 0,
    fanInDigest: digest('execution-effect-landing-evidence-fan-in-v1', {
      transactionDigest,
      preparedJournalDigest,
      count: 0,
    }),
  };
  for (const evidenceDigest of initial) appendBoundedLandingEvidence(evidence, evidenceDigest);
  return evidence;
}

function appendBoundedLandingEvidence(
  evidence: BoundedLandingEvidenceV1,
  evidenceDigest: string,
): void {
  if (!isDigest(evidenceDigest)) return;
  evidence.count += 1;
  evidence.fanInDigest = digest('execution-effect-landing-evidence-fan-in-v1', {
    transactionDigest: evidence.transactionDigest,
    count: evidence.count,
    previousFanInDigest: evidence.fanInDigest,
    evidenceDigest,
  });
}

function boundedLandingEvidenceDigests(
  evidence: BoundedLandingEvidenceV1,
  errorDigest: string,
): readonly string[] {
  const countDigest = digest('execution-effect-landing-evidence-count-v1', {
    transactionDigest: evidence.transactionDigest,
    count: evidence.count,
  });
  return objectFreeze([...new Set([
    evidence.transactionDigest,
    evidence.preparedJournalDigest,
    evidence.leaseReceiptDigest,
    evidence.boundaryReceiptDigest,
    evidence.applyingJournalDigest,
    evidence.fanInDigest,
    countDigest,
    errorDigest,
  ].filter((value): value is string => value !== null && isDigest(value)))].slice(0, 8));
}

export function readExecutionEffectLandingLocatorV1(
  input: ReadExecutionEffectLandingLocatorV1Input,
): ReadExecutionEffectLandingLocatorResultV1 {
  if ((!exactDataObject(input, [
    'projectId', 'taskId', 'attemptId', 'generation', 'attemptDigest',
    'baselineManifestDigest', 'finalManifestDigest', 'containmentDecisionDigest',
    'planId', 'nativeCapabilityDigest', 'adapters',
  ]) && !exactDataObject(input, [
    'projectId', 'taskId', 'attemptId', 'generation', 'attemptDigest',
    'baselineManifestDigest', 'finalManifestDigest', 'containmentDecisionDigest',
    'planId', 'nativeCapabilityDigest',
  ])) || !safeId(input.projectId) || !safeId(input.taskId) || !safeId(input.attemptId)
    || !Number.isSafeInteger(input.generation) || input.generation <= 0
    || !isDigest(input.attemptDigest) || !isDigest(input.baselineManifestDigest)
    || !isDigest(input.finalManifestDigest) || !isDigest(input.containmentDecisionDigest)
    || !safeId(input.planId) || !isDigest(input.nativeCapabilityDigest)) {
    return hold('INVALID_INPUT', 'read', null);
  }
  const adapters = snapshotAdapters(input.adapters);
  if (!adapters || adapters.native.capability.capabilityDigest !== input.nativeCapabilityDigest) {
    return hold('ADAPTER_UNSUPPORTED', 'read', null);
  }
  const durable = readLocator(adapters);
  if (!durable) return hold('JOURNAL_MALFORMED', 'read', null);
  const transaction = durable.locator.transaction;
  if (transaction.projectId !== input.projectId || transaction.taskId !== input.taskId
    || transaction.attemptId !== input.attemptId || transaction.generation !== input.generation
    || transaction.attemptDigest !== input.attemptDigest
    || transaction.baselineManifestDigest !== input.baselineManifestDigest
    || transaction.finalManifestDigest !== input.finalManifestDigest
    || transaction.containmentDecisionDigest !== input.containmentDecisionDigest
    || transaction.planId !== input.planId) {
    return hold('AUTHORITY_MISMATCH', 'read', transaction.transactionDigest, [
      durable.locator.locatorDigest,
    ]);
  }
  return objectFreeze({
    state: 'LOCATED' as const,
    transaction,
    preparedJournalDigest: durable.prepared.recordDigest,
    locatorDigest: durable.locator.locatorDigest,
  });
}

export async function prepareExecutionEffectLandingV1(
  input: PrepareExecutionEffectLandingV1Input,
): Promise<PrepareExecutionEffectLandingResultV1> {
  const validShape = exactDataObject(input, ['planId', 'baseline', 'final', 'decision', 'adapters'])
    || exactDataObject(input, ['planId', 'baseline', 'final', 'decision']);
  if (!validShape
    || !safeId(input.planId)) return hold('INVALID_INPUT', 'prepare', null);
  const adapters = snapshotAdapters(input.adapters);
  if (!adapters) return hold('ADAPTER_UNSUPPORTED', 'prepare', null);
  const bundle = validateEffectBundle(input.baseline, input.final, input.decision);
  if (!bundle) return hold('MANIFEST_MISMATCH', 'prepare', null);
  if (adapters.native.capability.attemptDigest !== bundle.baseline.attemptDigest
    || bundle.decision.effects.length > adapters.native.capability.maxOperations
    || bundle.decision.effects.length > EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS) {
    return hold('PLAN_UNSUPPORTED', 'prepare', null, [
      adapters.native.capability.capabilityDigest,
    ]);
  }
  const workspaceIdentityDigest = digest(
    'execution-effect-workspace-identity-v1',
    bundle.final.workspaceIdentity,
  );
  if (adapters.native.capability.workspaceIdentityDigest !== workspaceIdentityDigest) {
    return hold('AUTHORITY_MISMATCH', 'prepare', null, [
      adapters.native.capability.capabilityDigest,
    ]);
  }
  const attemptDigest = bundle.baseline.attemptDigest;
  const baselineManifestDigest = bundle.baseline.digest;
  const finalManifestDigest = bundle.final.digest;
  const containmentDecisionDigest = bundle.decision.decisionDigest;
  if (!isDigest(attemptDigest) || !isDigest(baselineManifestDigest)
    || !isDigest(finalManifestDigest) || !isDigest(containmentDecisionDigest)) {
    return hold('MANIFEST_MISMATCH', 'prepare', null);
  }
  const nativeCapabilityDigest = adapters.native.capability.capabilityDigest;
  if (!isDigest(nativeCapabilityDigest)) return hold('ADAPTER_UNSUPPORTED', 'prepare', null);
  const landingIntentDigest = executionEffectLandingIntentDigestV1({
    attemptDigest,
    baselineManifestDigest,
    finalManifestDigest,
    containmentDecisionDigest,
    planId: input.planId,
    nativeCapabilityDigest,
  });
  const operations = await buildOperations(
    bundle.baseline,
    bundle.final,
    bundle.decision.effects,
    adapters.native,
    workspaceIdentityDigest,
    landingIntentDigest,
  );
  if (!operations) return hold('PREIMAGE_MISMATCH', 'prepare', null);
  if (operations.length > adapters.native.capability.maxOperations
    || operations.length > EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS) {
    return hold('PLAN_UNSUPPORTED', 'prepare', null, [
      adapters.native.capability.capabilityDigest,
    ]);
  }
  const planDigest = digest(
    'execution-effect-landing-plan-v1',
    operations.map(operation => operation.operationDigest),
  );
  const txBody = objectFreeze({
    version: 1 as const,
    projectId: bundle.baseline.attempt.projectId,
    taskId: bundle.baseline.attempt.taskId,
    attemptId: bundle.baseline.attempt.attemptId,
    generation: bundle.baseline.attempt.generation,
    attemptDigest: bundle.baseline.attemptDigest as ExecutionEffectPersistenceDigest,
    baselineManifestDigest: bundle.baseline.digest as ExecutionEffectPersistenceDigest,
    finalManifestDigest: bundle.final.digest as ExecutionEffectPersistenceDigest,
    containmentDecisionDigest: bundle.decision.decisionDigest as ExecutionEffectPersistenceDigest,
    planId: input.planId,
    planDigest,
  });
  const transaction: ExecutionEffectLandingTransactionRefV1 = objectFreeze({
    ...txBody,
    transactionDigest: digest('execution-effect-landing-transaction-v1', txBody),
  });
  const planEnvelopeBytes = Buffer.byteLength(canonicalJson(objectFreeze({
    version: 1 as const,
    transaction,
    operations,
    nativeCapabilityDigest: adapters.native.capability.capabilityDigest,
  })), 'utf8');
  if (planEnvelopeBytes > adapters.native.capability.maxPlanEnvelopeBytes
    || planEnvelopeBytes > EXECUTION_EFFECT_LANDING_HARD_MAX_PLAN_ENVELOPE_BYTES) {
    return hold('PLAN_UNSUPPORTED', 'prepare', transaction.transactionDigest, [
      adapters.native.capability.capabilityDigest,
      digest('execution-effect-landing-plan-envelope-v1', {
        planEnvelopeBytes,
        maxPlanEnvelopeBytes: adapters.native.capability.maxPlanEnvelopeBytes,
      }),
    ]);
  }
  const existingPrepared = readPrepared(transaction, adapters);
  if (existingPrepared) {
    if (!sameJson(existingPrepared.prepared.operations, operations)) {
      return hold('JOURNAL_CONFLICT', 'prepare', transaction.transactionDigest, [
        existingPrepared.prepared.recordDigest,
      ]);
    }
    let hasMutationJournal = false;
    try {
      hasMutationJournal = adapters.journal.readImmutable(
        journalKey(transaction.transactionDigest, 'applying'),
      ) !== null || adapters.journal.readImmutable(
        journalKey(transaction.transactionDigest, 'committed'),
      ) !== null;
    } catch {
      return hold('JOURNAL_MALFORMED', 'prepare', transaction.transactionDigest, [
        existingPrepared.prepared.recordDigest,
      ]);
    }
    if (hasMutationJournal) {
      const durableLocator = readLocator(adapters);
      if (!durableLocator
        || !sameJson(durableLocator.locator.transaction, transaction)
        || durableLocator.prepared.recordDigest !== existingPrepared.prepared.recordDigest) {
        return hold('JOURNAL_MALFORMED', 'prepare', transaction.transactionDigest, [
          existingPrepared.prepared.recordDigest,
        ]);
      }
      return hold('CRASH_PREFIX_AMBIGUOUS', 'prepare', transaction.transactionDigest, [
        existingPrepared.prepared.recordDigest,
        durableLocator.locator.locatorDigest,
      ]);
    }
    const located = ensureLocator(
      adapters,
      existingPrepared.prepared,
      existingPrepared.artifact,
    );
    if (!located) {
      return hold('JOURNAL_CONFLICT', 'prepare', transaction.transactionDigest, [
        existingPrepared.prepared.recordDigest,
      ]);
    }
    let resumedLease: ExecutionEffectLandingLeaseV1 | null = null;
    try {
      adapters.lease.assert(existingPrepared.prepared.acquiredLease);
      resumedLease = existingPrepared.prepared.acquiredLease;
    } catch {
      const context = resumeContext(
        transaction,
        existingPrepared.prepared,
        existingPrepared.artifact,
        null,
        null,
      );
      const adopted = context ? adoptLease(adapters.lease, context) : null;
      if (!context || !adopted || adopted.currentBoundary !== null) {
        return hold('LEASE_UNAVAILABLE', 'prepare', transaction.transactionDigest, [
          existingPrepared.prepared.recordDigest,
          located.locator.locatorDigest,
        ]);
      }
      resumedLease = adopted.lease;
    }
    const session = objectFreeze({}) as PreparedExecutionEffectLandingSessionV1;
    reflectApply(weakMapSet, sessionAuthority, [session, objectFreeze({
      transaction,
      prepared: existingPrepared.prepared,
      preparedArtifact: existingPrepared.artifact,
      locator: located.locator,
      locatorArtifact: located.artifact,
      lease: resumedLease,
      adapters,
    })]);
    return objectFreeze({
      state: 'PREPARED' as const,
      transaction,
      preparedJournalDigest: existingPrepared.prepared.recordDigest,
      locatorDigest: located.locator.locatorDigest,
      session,
    });
  }
  let lease: ExecutionEffectLandingLeaseV1 | null = null;
  try {
    lease = validateLease(adapters.lease.acquire(transaction.transactionDigest), transaction.transactionDigest);
    if (!lease) throw new Error('lease');
    adapters.lease.assert(lease);
    if (!revalidatePreparedAuthority(operations, adapters.native)) {
      const evidence = quarantineSafely(adapters, lease, null, [
        transaction.transactionDigest,
      ]);
      return hold('PREIMAGE_MISMATCH', 'prepare', transaction.transactionDigest, evidence);
    }
    const preparedBody = objectFreeze({
      version: 1 as const,
      kind: 'execution-effect-landing-prepared' as const,
      phase: 'PREPARED' as const,
      transaction,
      operations,
      nativeCapabilityDigest: adapters.native.capability.capabilityDigest,
      journalCapabilityDigest: adapters.journal.capability.capabilityDigest,
      leaseCapabilityDigest: adapters.lease.capability.capabilityDigest,
      acquiredLease: lease,
      preparedAt: hostTimestamp(),
    });
    const prepared = recordWithDigest('execution-effect-landing-prepared-journal-v1', preparedBody);
    const artifact = publishRecord(
      adapters.journal,
      journalKey(transaction.transactionDigest, 'prepared'),
      prepared,
    );
    if (!artifact) {
      const evidence = quarantineSafely(adapters, lease, null, [prepared.recordDigest]);
      return hold('JOURNAL_CONFLICT', 'prepare', transaction.transactionDigest, evidence);
    }
    const located = ensureLocator(adapters, prepared, artifact);
    if (!located) {
      return hold('JOURNAL_CONFLICT', 'prepare', transaction.transactionDigest, [
        prepared.recordDigest,
        artifact.contentDigest,
        lease.leaseReceiptDigest,
      ]);
    }
    const session = objectFreeze({}) as PreparedExecutionEffectLandingSessionV1;
    reflectApply(weakMapSet, sessionAuthority, [session, objectFreeze({
      transaction,
      prepared,
      preparedArtifact: artifact,
      locator: located.locator,
      locatorArtifact: located.artifact,
      lease,
      adapters,
    })]);
    return objectFreeze({
      state: 'PREPARED' as const,
      transaction,
      preparedJournalDigest: prepared.recordDigest,
      locatorDigest: located.locator.locatorDigest,
      session,
    });
  } catch {
    const evidence = lease
      ? quarantineSafely(adapters, lease, null, [lease.leaseReceiptDigest])
      : [];
    return hold('LEASE_UNAVAILABLE', 'prepare', transaction.transactionDigest, evidence);
  }
}

function publishApplying(
  authority: SessionAuthority,
  boundary: ExecutionEffectLandingBoundaryV1,
): { applying: ApplyingJournalV1; artifact: ExecutionEffectLandingJournalArtifactV1 } | null {
  const body = objectFreeze({
    version: 1 as const,
    kind: 'execution-effect-landing-applying' as const,
    phase: 'APPLYING' as const,
    transactionDigest: authority.transaction.transactionDigest,
    preparedJournalDigest: authority.prepared.recordDigest,
    boundary,
    applyingAt: hostTimestamp(),
  });
  const applying = recordWithDigest('execution-effect-landing-applying-journal-v1', body);
  const artifact = publishRecord(
    authority.adapters.journal,
    journalKey(authority.transaction.transactionDigest, 'applying'),
    applying,
  );
  return artifact ? { applying, artifact } : null;
}

function publishStep(
  authority: SessionAuthority,
  applying: ApplyingJournalV1,
  previousJournalDigest: string,
  operation: ExecutionEffectLandingOperationV1,
  receipt: ExecutionEffectLandingNativeMutationReceiptV1,
  reconciledAfterCrash: boolean,
): StepJournalV1 | null {
  const body = objectFreeze({
    version: 1 as const,
    kind: 'execution-effect-landing-step' as const,
    phase: 'STEP' as const,
    transactionDigest: authority.transaction.transactionDigest,
    preparedJournalDigest: authority.prepared.recordDigest,
    applyingJournalDigest: applying.recordDigest,
    previousJournalDigest,
    index: operation.index,
    operationDigest: operation.operationDigest,
    nativeReceipt: receipt,
    reconciledAfterCrash,
    appliedAt: hostTimestamp(),
  });
  const step = recordWithDigest('execution-effect-landing-step-journal-v1', body);
  const artifact = publishRecord(
    authority.adapters.journal,
    journalKey(authority.transaction.transactionDigest, `step-${String(operation.index).padStart(7, '0')}`),
    step,
  );
  return artifact ? step : null;
}

function publishCommitted(
  authority: SessionAuthority,
  applying: ApplyingJournalV1 | null,
  lastJournalDigest: string,
  receipts: readonly string[],
  finalVerificationReceipt: ExecutionEffectLandingFinalVerificationReceiptV1 | null,
): CommittedJournalV1 | null {
  const disposition = authority.prepared.operations.length === 0
    ? 'COMMITTED_NO_CHANGE' as const : 'COMMITTED' as const;
  const body = objectFreeze({
    version: 1 as const,
    kind: 'execution-effect-landing-committed' as const,
    phase: 'COMMITTED' as const,
    disposition,
    transaction: authority.transaction,
    preparedJournalDigest: authority.prepared.recordDigest,
    applyingJournalDigest: applying?.recordDigest ?? null,
    lastJournalDigest,
    operationReceiptDigests: objectFreeze([...receipts]),
    finalVerificationReceipt,
    committedAt: hostTimestamp(),
  });
  const committed = recordWithDigest('execution-effect-landing-committed-journal-v1', body);
  const artifact = publishRecord(
    authority.adapters.journal,
    journalKey(authority.transaction.transactionDigest, 'committed'),
    committed,
  );
  return artifact ? committed : null;
}

function runApply(
  authority: SessionAuthority,
  applyingInput: ApplyingJournalV1 | null,
  reconcile: boolean,
  resumedBoundary: ExecutionEffectLandingBoundaryV1 | null = null,
  resumeEvidence: readonly string[] = [],
): ExecutionEffectLandingOutcomeV1 {
  const { adapters, transaction, prepared } = authority;
  let lease = authority.lease;
  let boundary: ExecutionEffectLandingBoundaryV1 | null = resumedBoundary;
  let applying = applyingInput;
  let committedPublished = false;
  const evidence = createBoundedLandingEvidence(
    transaction.transactionDigest,
    prepared.recordDigest,
    lease.leaseReceiptDigest,
    resumeEvidence,
  );
  try {
    if (applying !== null && boundary === null) throw new Error('resume-boundary');
    adapters.lease.assert(lease);
    const renewed = validateLease(
      adapters.lease.renew(lease),
      transaction.transactionDigest,
    );
    if (!renewed) throw new Error('lease-renewal');
    lease = renewed;
    evidence.leaseReceiptDigest = lease.leaseReceiptDigest;
    appendBoundedLandingEvidence(evidence, lease.leaseReceiptDigest);
    adapters.lease.assert(lease);
    if (prepared.operations.length === 0) {
      const committed = publishCommitted(authority, null, prepared.recordDigest, [], null);
      if (!committed) throw new Error('journal');
      committedPublished = true;
      const terminal = terminalSnapshot(
        adapters.lease.releaseNoChange(lease, committed.recordDigest),
        transaction,
        committed.recordDigest,
      );
      const durableTerminal = terminalSnapshot(
        adapters.lease.readTerminal(transaction.transactionDigest, committed.recordDigest),
        transaction,
        committed.recordDigest,
      );
      if (!terminal || terminal.terminal !== 'RELEASED_NO_CHANGE'
        || !durableTerminal || !sameJson(terminal, durableTerminal)) throw new Error('terminal');
      return makeReceipt(committed, durableTerminal);
    }
    if (!boundary) {
      boundary = validateBoundary(
        adapters.lease.beginBoundary(lease, prepared.recordDigest),
        lease,
      );
      if (!boundary) throw new Error('boundary');
      evidence.boundaryReceiptDigest = boundary.boundaryReceiptDigest;
      appendBoundedLandingEvidence(evidence, boundary.boundaryReceiptDigest);
    }
    if (!applying) {
      const published = publishApplying(authority, boundary);
      if (!published) throw new Error('journal');
      applying = published.applying;
    }
    evidence.applyingJournalDigest = applying.recordDigest;
    appendBoundedLandingEvidence(evidence, applying.recordDigest);
    let previous = applying.recordDigest;
    const nativeReceipts: ExecutionEffectLandingNativeMutationReceiptV1[] = [];
    for (const operation of prepared.operations) {
      const key = journalKey(transaction.transactionDigest, `step-${String(operation.index).padStart(7, '0')}`);
      const existing = readJsonArtifact(adapters.journal, key);
      if (existing) {
        const step = stepSnapshot(existing.value, prepared, applying, previous, operation.index);
        if (!step) throw new Error('journal');
        previous = step.recordDigest;
        nativeReceipts.push(step.nativeReceipt);
        continue;
      }
      let nativeReceipt: ExecutionEffectLandingNativeMutationReceiptV1 | null = null;
      let reconciledAfterCrash = false;
      const dependencyReceipts = objectFreeze(operation.parentAuthorities
        .filter(parent => parent.source === 'OPERATION_POSTIMAGE')
        .map(parent => nativeReceipts[parent.operationIndex])
        .filter((receipt): receipt is ExecutionEffectLandingNativeMutationReceiptV1 => receipt !== undefined));
      if (dependencyReceipts.length !== operation.parentAuthorities
        .filter(parent => parent.source === 'OPERATION_POSTIMAGE').length) throw new Error('dependency');
      if (reconcile) {
        const observed = adapters.native.reconcileOperation(objectFreeze({
          operation,
          dependencyReceipts,
        }));
        if (!exactDataObject(observed, observed !== null && typeof observed === 'object'
          && Reflect.getOwnPropertyDescriptor(observed, 'state')?.value === 'APPLIED'
          ? ['state', 'receipt']
          : Reflect.getOwnPropertyDescriptor(observed as object, 'state')?.value === 'AMBIGUOUS'
            ? ['state', 'evidenceDigest'] : ['state'])) throw new Error('native');
        if (observed.state === 'AMBIGUOUS') {
          if (isDigest(observed.evidenceDigest)) {
            appendBoundedLandingEvidence(evidence, observed.evidenceDigest);
          }
          throw new Error('ambiguous');
        }
        if (observed.state === 'APPLIED') {
          nativeReceipt = validateReceipt(observed.receipt, operation);
          reconciledAfterCrash = true;
        }
      }
      if (!nativeReceipt) {
        nativeReceipt = validateReceipt(adapters.native.applyOperation(objectFreeze({
          operation,
          dependencyReceipts,
        })), operation);
      }
      if (!nativeReceipt) throw new Error('native');
      const step = publishStep(
        authority, applying, previous, operation, nativeReceipt, reconciledAfterCrash,
      );
      if (!step) throw new Error('journal');
      previous = step.recordDigest;
      nativeReceipts.push(nativeReceipt);
      appendBoundedLandingEvidence(evidence, step.recordDigest);
      appendBoundedLandingEvidence(evidence, nativeReceipt.receiptDigest);
    }
    const finalVerification = validateFinalVerification(
      adapters.native.verifyTransactionPostimages(objectFreeze({
        transaction,
        operations: prepared.operations,
        operationReceipts: objectFreeze(nativeReceipts),
      })),
      transaction,
      prepared.operations,
      nativeReceipts,
    );
    if (!finalVerification) throw new Error('final-verification');
    appendBoundedLandingEvidence(evidence, finalVerification.receiptDigest);
    const committed = publishCommitted(
      authority,
      applying,
      previous,
      nativeReceipts.map(receipt => receipt.receiptDigest),
      finalVerification,
    );
    if (!committed) throw new Error('journal');
    committedPublished = true;
    const terminal = terminalSnapshot(
      adapters.lease.completeBoundary(lease, boundary, committed.recordDigest),
      transaction,
      committed.recordDigest,
    );
    const durableTerminal = terminalSnapshot(
      adapters.lease.readTerminal(transaction.transactionDigest, committed.recordDigest),
      transaction,
      committed.recordDigest,
    );
    if (!terminal || terminal.terminal !== 'COMPLETED'
      || !durableTerminal || !sameJson(terminal, durableTerminal)) throw new Error('terminal');
    return makeReceipt(committed, durableTerminal);
  } catch (error) {
    const errorDigest = digest('execution-effect-landing-runtime-error-v1', {
      name: error instanceof Error ? error.name : 'unknown',
      committedPublished,
    });
    appendBoundedLandingEvidence(evidence, errorDigest);
    const quarantined = quarantineSafely(
      adapters,
      lease,
      boundary,
      boundedLandingEvidenceDigests(evidence, errorDigest),
    );
    return hold(
      committedPublished ? 'TRANSACTION_QUARANTINED'
        : reconcile ? 'CRASH_PREFIX_AMBIGUOUS' : 'NATIVE_EFFECT_UNCERTAIN',
      reconcile ? 'reconcile' : 'apply',
      transaction.transactionDigest,
      quarantined,
    );
  }
}

export async function applyExecutionEffectLandingV1(
  session: PreparedExecutionEffectLandingSessionV1,
): Promise<ExecutionEffectLandingOutcomeV1> {
  if (session === null || typeof session !== 'object' || nodeTypes.isProxy(session)) {
    return hold('SESSION_INVALID', 'apply', null);
  }
  const authority = reflectApply(weakMapGet, sessionAuthority, [session]) as SessionAuthority | undefined;
  if (!authority) return hold('SESSION_INVALID', 'apply', null);
  reflectApply(weakMapDelete, sessionAuthority, [session]);
  const durable = readLocator(authority.adapters);
  if (!durable || !sameJson(durable.locator, authority.locator)
    || durable.artifact.contentDigest !== authority.locatorArtifact.contentDigest
    || durable.artifact.publicationReceiptDigest
      !== authority.locatorArtifact.publicationReceiptDigest
    || durable.prepared.recordDigest !== authority.prepared.recordDigest
    || durable.preparedArtifact.contentDigest !== authority.preparedArtifact.contentDigest) {
    return hold('JOURNAL_MALFORMED', 'apply', authority.transaction.transactionDigest);
  }
  return runApply(authority, null, false);
}

export async function reconcileExecutionEffectLandingV1(
  input: ReconcileExecutionEffectLandingV1Input,
): Promise<ExecutionEffectLandingOutcomeV1> {
  if (!exactDataObject(input, ['transaction', 'adapters'])
    && !exactDataObject(input, ['transaction'])) {
    return hold('INVALID_INPUT', 'reconcile', null);
  }
  const transaction = transactionSnapshot(input.transaction);
  const adapters = snapshotAdapters(input.adapters);
  if (!transaction || !adapters) return hold('ADAPTER_UNSUPPORTED', 'reconcile', transaction?.transactionDigest ?? null);
  const located = readLocator(adapters);
  if (!located || !sameJson(located.locator.transaction, transaction)) {
    return hold('JOURNAL_MALFORMED', 'reconcile', transaction.transactionDigest);
  }
  const durable = objectFreeze({
    prepared: located.prepared,
    artifact: located.preparedArtifact,
  });
  const committedRead = readJsonArtifact(
    adapters.journal,
    journalKey(transaction.transactionDigest, 'committed'),
  );
  if (committedRead) {
    const committed = committedSnapshot(committedRead.value, durable.prepared);
    const chain = committed
      ? verifyCommittedJournalChain(adapters.journal, durable.prepared, committed) : null;
    if (!committed || !chain) {
      return hold('JOURNAL_MALFORMED', 'reconcile', transaction.transactionDigest);
    }
    const expectedTerminal = committed.disposition === 'COMMITTED'
      ? 'COMPLETED' : 'RELEASED_NO_CHANGE';
    let existingTerminal: ExecutionEffectLandingLeaseTerminalV1 | null = null;
    try {
      existingTerminal = terminalSnapshot(
        adapters.lease.readTerminal(transaction.transactionDigest, committed.recordDigest),
        transaction,
        committed.recordDigest,
      );
    } catch {
      existingTerminal = null;
    }
    if (existingTerminal?.terminal === expectedTerminal) {
      return makeReceipt(committed, existingTerminal);
    }
    if (existingTerminal !== null) {
      return hold('TRANSACTION_QUARANTINED', 'reconcile', transaction.transactionDigest, [
        committed.recordDigest,
        existingTerminal.terminalReceiptDigest,
      ]);
    }
    const context = resumeContext(
      transaction,
      durable.prepared,
      durable.artifact,
      chain.applying && chain.applyingArtifact
        ? { record: chain.applying, artifact: chain.applyingArtifact } : null,
      { record: committed, artifact: committedRead.artifact },
    );
    const adopted = context ? adoptLease(adapters.lease, context) : null;
    if (!context || !adopted) {
      return hold('LEASE_UNAVAILABLE', 'reconcile', transaction.transactionDigest, [
        durable.prepared.recordDigest,
        committed.recordDigest,
      ]);
    }
    const evidence = createBoundedLandingEvidence(
      transaction.transactionDigest,
      durable.prepared.recordDigest,
      adopted.lease.leaseReceiptDigest,
      [
        context.contextDigest,
        adopted.resumeReceipt.receiptDigest,
        ...adopted.resumeReceipt.durableEvidenceDigests,
        committed.recordDigest,
      ],
    );
    let verificationDigest: string | null = null;
    try {
      adapters.lease.assert(adopted.lease);
      if (committed.disposition === 'COMMITTED') {
        if (!adopted.currentBoundary || !committed.finalVerificationReceipt) {
          throw new Error('resume-boundary');
        }
        const verification = validateFinalVerification(
          adapters.native.verifyTransactionPostimages(objectFreeze({
            transaction,
            operations: durable.prepared.operations,
            operationReceipts: chain.operationReceipts,
          })),
          transaction,
          durable.prepared.operations,
          chain.operationReceipts,
        );
        if (!verification
          || verification.postimageSetDigest
            !== committed.finalVerificationReceipt.postimageSetDigest) {
          throw new Error('final-verification');
        }
        verificationDigest = verification.receiptDigest;
        appendBoundedLandingEvidence(evidence, verification.receiptDigest);
      } else if (adopted.currentBoundary !== null) {
        throw new Error('no-change-boundary');
      }
      const completed = committed.disposition === 'COMMITTED'
        ? adapters.lease.completeBoundary(
          adopted.lease,
          adopted.currentBoundary as ExecutionEffectLandingBoundaryV1,
          committed.recordDigest,
        )
        : adapters.lease.releaseNoChange(adopted.lease, committed.recordDigest);
      const terminal = terminalSnapshot(completed, transaction, committed.recordDigest);
      const reread = terminalSnapshot(
        adapters.lease.readTerminal(transaction.transactionDigest, committed.recordDigest),
        transaction,
        committed.recordDigest,
      );
      if (!terminal || terminal.terminal !== expectedTerminal
        || !reread || !sameJson(terminal, reread)) throw new Error('terminal');
      return makeReceipt(committed, reread);
    } catch (error) {
      if (verificationDigest) appendBoundedLandingEvidence(evidence, verificationDigest);
      const errorDigest = digest('execution-effect-landing-recovery-error-v1', {
        transactionDigest: transaction.transactionDigest,
        name: error instanceof Error ? error.name : 'unknown',
        committedJournalDigest: committed.recordDigest,
      });
      appendBoundedLandingEvidence(evidence, errorDigest);
      const quarantined = quarantineSafely(
        adapters,
        adopted.lease,
        adopted.currentBoundary,
        boundedLandingEvidenceDigests(evidence, errorDigest),
      );
      return hold(
        'TRANSACTION_QUARANTINED',
        'reconcile',
        transaction.transactionDigest,
        quarantined,
      );
    }
  }
  const applyingRead = readJsonArtifact(
    adapters.journal,
    journalKey(transaction.transactionDigest, 'applying'),
  );
  const applying = applyingRead ? applyingSnapshot(applyingRead.value, durable.prepared) : null;
  if (applyingRead && !applying) return hold('JOURNAL_MALFORMED', 'reconcile', transaction.transactionDigest);
  const context = resumeContext(
    transaction,
    durable.prepared,
    durable.artifact,
    applying && applyingRead ? { record: applying, artifact: applyingRead.artifact } : null,
    null,
  );
  const adopted = context ? adoptLease(adapters.lease, context) : null;
  if (!context || !adopted) {
    return hold('LEASE_UNAVAILABLE', 'reconcile', transaction.transactionDigest, [
      ...(applying ? [applying.boundary.boundaryReceiptDigest] : []),
    ]);
  }
  const authority: SessionAuthority = objectFreeze({
    transaction,
    prepared: durable.prepared,
    preparedArtifact: durable.artifact,
    locator: located.locator,
    locatorArtifact: located.artifact,
    lease: adopted.lease,
    adapters,
  });
  return runApply(
    authority,
    applying,
    true,
    adopted.currentBoundary,
    [
      context.contextDigest,
      adopted.resumeReceipt.receiptDigest,
      ...adopted.resumeReceipt.durableEvidenceDigests,
    ],
  );
}

export function readExecutionEffectLandingReceiptV1(
  input: ReadExecutionEffectLandingReceiptV1Input,
): ExecutionEffectLandingOutcomeV1 {
  if (!exactDataObject(input, ['transaction', 'adapters'])
    && !exactDataObject(input, ['transaction'])) return hold('INVALID_INPUT', 'read', null);
  const transaction = transactionSnapshot(input.transaction);
  const adapters = snapshotReadAdapters(input.adapters);
  if (!transaction || !adapters) return hold('ADAPTER_UNSUPPORTED', 'read', transaction?.transactionDigest ?? null);
  const { journal, lease } = adapters;
  const locatorRead = readJsonArtifact(journal, locatorKey(transaction.attemptDigest));
  const locator = locatorRead ? locatorSnapshot(locatorRead.value) : null;
  const preparedRead = readJsonArtifact(journal, journalKey(transaction.transactionDigest, 'prepared'));
  const prepared = preparedRead ? preparedSnapshot(preparedRead.value) : null;
  if (!locatorRead || !locator || !sameJson(locator.transaction, transaction)
    || locator.journalCapabilityDigest !== journal.capability.capabilityDigest
    || locator.leaseCapabilityDigest !== lease.capability.capabilityDigest
    || !preparedRead || !prepared || !sameJson(prepared.transaction, transaction)
    || locator.preparedJournalDigest !== prepared.recordDigest
    || locator.preparedJournalContentDigest !== preparedRead.artifact.contentDigest
    || locator.preparedJournalPublicationReceiptDigest
      !== preparedRead.artifact.publicationReceiptDigest
    || locator.nativeCapabilityDigest !== prepared.nativeCapabilityDigest
    || prepared.journalCapabilityDigest !== journal.capability.capabilityDigest
    || prepared.leaseCapabilityDigest !== lease.capability.capabilityDigest) {
    return hold('JOURNAL_MALFORMED', 'read', transaction.transactionDigest);
  }
  const committedRead = readJsonArtifact(journal, journalKey(transaction.transactionDigest, 'committed'));
  const committed = committedRead ? committedSnapshot(committedRead.value, prepared) : null;
  if (!committed || !verifyCommittedJournalChain(journal, prepared, committed)) {
    return hold('JOURNAL_MALFORMED', 'read', transaction.transactionDigest);
  }
  let terminal: ExecutionEffectLandingLeaseTerminalV1 | null = null;
  try {
    terminal = terminalSnapshot(
      lease.readTerminal(transaction.transactionDigest, committed.recordDigest),
      transaction,
      committed.recordDigest,
    );
  } catch {
    terminal = null;
  }
  const expectedTerminal = committed.disposition === 'COMMITTED'
    ? 'COMPLETED' : 'RELEASED_NO_CHANGE';
  if (!terminal || terminal.terminal !== expectedTerminal) {
    return hold('TRANSACTION_QUARANTINED', 'read', transaction.transactionDigest, [committed.recordDigest]);
  }
  return makeReceipt(committed, terminal);
}
