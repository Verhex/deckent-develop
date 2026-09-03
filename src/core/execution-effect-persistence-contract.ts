import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';

import {
  evaluateExecutionEffectContainment,
  parseExecutionEffectManifest,
  type ExecutionEffect,
  type ExecutionEffectAttemptIdentity,
  type ExecutionEffectManifest,
} from './execution-effect-containment.js';

export const EXECUTION_EFFECT_PERSISTENCE_VERSION = 1 as const;

export type ExecutionEffectPersistenceDigest = `sha256:${string}`;

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const SAFE_KEY = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compare(left, right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameCanonicalJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function digest(domain: string, value: unknown): ExecutionEffectPersistenceDigest {
  return `sha256:${createHash('sha256')
    .update(domain, 'utf8').update('\0', 'utf8').update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

export function executionEffectPersistenceRawDigest(
  bytes: Uint8Array,
): ExecutionEffectPersistenceDigest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * Restart-stable authority for one Docker workspace root.
 *
 * `rootHandleEvidenceDigest` proves the exact descriptor used by an individual
 * native capture. It is deliberately excluded here because helper containers
 * run in distinct mount namespaces and therefore produce distinct local handle
 * evidence for the same daemon-owned volume directory.
 */
export function executionEffectWorkspaceAuthorityDigestV1(
  workspaceIdentity: ExecutionEffectManifest['workspaceIdentity'],
): ExecutionEffectPersistenceDigest {
  const record = exact(workspaceIdentity, [
    'filesystemId', 'directoryId', 'rootHandleEvidenceDigest',
  ]);
  if (record === null || typeof record.filesystemId !== 'string'
    || record.filesystemId.length === 0 || typeof record.directoryId !== 'string'
    || record.directoryId.length === 0 || !isDigest(record.rootHandleEvidenceDigest)) {
    throw new TypeError('Invalid execution effect workspace authority');
  }
  return digest('execution-effect-workspace-authority-v1', Object.freeze({
    filesystemId: record.filesystemId,
    directoryId: record.directoryId,
  }));
}

export interface ExecutionEffectLandingIntentDigestInputV1 {
  readonly attemptDigest: ExecutionEffectPersistenceDigest;
  readonly baselineManifestDigest: ExecutionEffectPersistenceDigest;
  readonly finalManifestDigest: ExecutionEffectPersistenceDigest;
  readonly containmentDecisionDigest: ExecutionEffectPersistenceDigest;
  readonly planId: string;
  readonly nativeCapabilityDigest: ExecutionEffectPersistenceDigest;
}

/** Canonical authority for the exact manifest/decision/native landing intent. */
export function executionEffectLandingIntentDigestV1(
  input: ExecutionEffectLandingIntentDigestInputV1,
): ExecutionEffectPersistenceDigest {
  const record = exact(input, [
    'attemptDigest', 'baselineManifestDigest', 'finalManifestDigest',
    'containmentDecisionDigest', 'planId', 'nativeCapabilityDigest',
  ]);
  if (record === null || !isDigest(record.attemptDigest)
    || !isDigest(record.baselineManifestDigest) || !isDigest(record.finalManifestDigest)
    || !isDigest(record.containmentDecisionDigest) || !isSafeIdentifier(record.planId)
    || !isDigest(record.nativeCapabilityDigest)) {
    throw new TypeError('Invalid execution effect landing intent authority');
  }
  return digest('execution-effect-landing-intent-v1', Object.freeze({
    attemptDigest: record.attemptDigest,
    baselineManifestDigest: record.baselineManifestDigest,
    finalManifestDigest: record.finalManifestDigest,
    containmentDecisionDigest: record.containmentDecisionDigest,
    planId: record.planId,
    nativeCapabilityDigest: record.nativeCapabilityDigest,
  }));
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || nodeTypes.isProxy(value)) {
    return null;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Object.getOwnPropertySymbols(value).length !== 0) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort(compare);
  const expected = [...keys].sort(compare);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    return null;
  }
  return actual.every(key => {
    const descriptor = descriptors[key];
    return descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true;
  }) ? value as Record<string, unknown> : null;
}

function isDigest(value: unknown): value is ExecutionEffectPersistenceDigest {
  return typeof value === 'string' && DIGEST.test(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function isSafeKey(value: unknown): value is string {
  return typeof value === 'string' && SAFE_KEY.test(value);
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === 'string'
    && /^[A-Za-z0-9._:-]{1,256}$/u.test(value)
    && Buffer.byteLength(value, 'utf8') <= 256;
}

function parseAttempt(value: unknown): ExecutionEffectAttemptIdentity | null {
  const record = exact(value, ['projectId', 'taskId', 'attemptId', 'generation']);
  if (record === null
    || typeof record.projectId !== 'string' || record.projectId.length === 0
    || typeof record.taskId !== 'string' || record.taskId.length === 0
    || typeof record.attemptId !== 'string' || record.attemptId.length === 0
    || [record.projectId, record.taskId, record.attemptId]
      .some(field => Buffer.byteLength(field as string, 'utf8') > 256)
    || !Number.isSafeInteger(record.generation) || (record.generation as number) <= 0) return null;
  return Object.freeze({
    projectId: record.projectId,
    taskId: record.taskId,
    attemptId: record.attemptId,
    generation: record.generation as number,
  });
}

function sameAttempt(left: ExecutionEffectAttemptIdentity, right: ExecutionEffectAttemptIdentity): boolean {
  return left.projectId === right.projectId && left.taskId === right.taskId
    && left.attemptId === right.attemptId && left.generation === right.generation;
}

function parseCanonicalJson(bytes: Uint8Array, maxBytes: number): unknown | null {
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return null;
  let value: unknown;
  try { value = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { return null; }
  return Buffer.from(canonicalJson(value)).equals(Buffer.from(bytes)) ? value : null;
}

export interface ExecutionEffectWorkspaceResourceV1 {
  readonly version: 1;
  readonly kind: 'docker-volume';
  readonly volumeName: string;
  readonly volumeNameDigest: ExecutionEffectPersistenceDigest;
  readonly imageDigest: ExecutionEffectPersistenceDigest;
  readonly labelsDigest: ExecutionEffectPersistenceDigest;
  readonly mountPlanDigest: ExecutionEffectPersistenceDigest;
  readonly resourceInstanceDigest: ExecutionEffectPersistenceDigest;
  readonly volumeIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly absenceObservationDigest: ExecutionEffectPersistenceDigest;
  readonly creationReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly verifiedPresentObservationDigest: ExecutionEffectPersistenceDigest;
  readonly freshnessReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly snapshotInventoryDigest: ExecutionEffectPersistenceDigest;
  readonly populationReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly baselineManifestDigest: ExecutionEffectPersistenceDigest;
  readonly resourceDigest: ExecutionEffectPersistenceDigest;
}

function safeResourceName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(value)
    && Buffer.byteLength(value, 'utf8') <= 128;
}

export function createExecutionEffectWorkspaceResourceV1(input: Readonly<{
  readonly volumeName: string;
  readonly imageDigest: ExecutionEffectPersistenceDigest;
  readonly labelsDigest: ExecutionEffectPersistenceDigest;
  readonly mountPlanDigest: ExecutionEffectPersistenceDigest;
  readonly resourceInstanceDigest?: ExecutionEffectPersistenceDigest;
  readonly volumeIdentityDigest?: ExecutionEffectPersistenceDigest;
  readonly absenceObservationDigest?: ExecutionEffectPersistenceDigest;
  readonly creationReceiptDigest?: ExecutionEffectPersistenceDigest;
  readonly verifiedPresentObservationDigest?: ExecutionEffectPersistenceDigest;
  readonly freshnessReceiptDigest?: ExecutionEffectPersistenceDigest;
  readonly snapshotInventoryDigest: ExecutionEffectPersistenceDigest;
  readonly populationReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly baselineManifestDigest: ExecutionEffectPersistenceDigest;
}>): ExecutionEffectWorkspaceResourceV1 {
  const record = exact(input, [
    'volumeName', 'imageDigest', 'labelsDigest', 'mountPlanDigest', 'resourceInstanceDigest',
    'volumeIdentityDigest',
    'absenceObservationDigest', 'creationReceiptDigest', 'verifiedPresentObservationDigest',
    'freshnessReceiptDigest',
    'snapshotInventoryDigest', 'populationReceiptDigest', 'baselineManifestDigest',
  ]) ?? exact(input, [
    'volumeName', 'imageDigest', 'labelsDigest', 'mountPlanDigest', 'volumeIdentityDigest',
    'absenceObservationDigest', 'creationReceiptDigest', 'verifiedPresentObservationDigest',
    'freshnessReceiptDigest', 'snapshotInventoryDigest', 'populationReceiptDigest',
    'baselineManifestDigest',
  ]) ?? exact(input, [
    'volumeName', 'imageDigest', 'labelsDigest', 'mountPlanDigest',
    'snapshotInventoryDigest', 'populationReceiptDigest', 'baselineManifestDigest',
  ]);
  if (record === null || !safeResourceName(record.volumeName)
    || !isDigest(record.imageDigest) || !isDigest(record.labelsDigest)
    || !isDigest(record.mountPlanDigest)
    || (record.resourceInstanceDigest !== undefined && !isDigest(record.resourceInstanceDigest))
    || (record.volumeIdentityDigest !== undefined && !isDigest(record.volumeIdentityDigest))
    || (record.absenceObservationDigest !== undefined
      && !isDigest(record.absenceObservationDigest))
    || (record.creationReceiptDigest !== undefined && !isDigest(record.creationReceiptDigest))
    || (record.verifiedPresentObservationDigest !== undefined
      && !isDigest(record.verifiedPresentObservationDigest))
    || (record.freshnessReceiptDigest !== undefined && !isDigest(record.freshnessReceiptDigest))
    || !isDigest(record.snapshotInventoryDigest)
    || !isDigest(record.populationReceiptDigest) || !isDigest(record.baselineManifestDigest)) {
    throw new TypeError('Invalid execution effect workspace resource');
  }
  const legacyVolumeIdentityDigest = digest('execution-effect-workspace-legacy-volume-identity-v1', {
    volumeName: record.volumeName,
    labelsDigest: record.labelsDigest,
    mountPlanDigest: record.mountPlanDigest,
  });
  const volumeIdentityDigest = (record.volumeIdentityDigest
    ?? legacyVolumeIdentityDigest) as ExecutionEffectPersistenceDigest;
  const resourceInstanceDigest = (record.resourceInstanceDigest
    ?? volumeIdentityDigest) as ExecutionEffectPersistenceDigest;
  const absenceObservationDigest = (record.absenceObservationDigest
    ?? digest('execution-effect-workspace-legacy-absence-v1', { resourceInstanceDigest })) as
    ExecutionEffectPersistenceDigest;
  const creationReceiptDigest = (record.creationReceiptDigest
    ?? digest('execution-effect-workspace-legacy-creation-v1', {
      resourceInstanceDigest, absenceObservationDigest,
    })) as ExecutionEffectPersistenceDigest;
  const verifiedPresentObservationDigest = (record.verifiedPresentObservationDigest
    ?? digest('execution-effect-workspace-legacy-present-v1', {
      resourceInstanceDigest, volumeIdentityDigest, creationReceiptDigest,
    })) as ExecutionEffectPersistenceDigest;
  const freshnessReceiptDigest = (record.freshnessReceiptDigest
    ?? digest('execution-effect-workspace-legacy-freshness-v1', {
      resourceInstanceDigest, volumeIdentityDigest, absenceObservationDigest,
      creationReceiptDigest, verifiedPresentObservationDigest,
    })) as ExecutionEffectPersistenceDigest;
  const body = Object.freeze({
    version: 1 as const,
    kind: 'docker-volume' as const,
    volumeName: record.volumeName,
    volumeNameDigest: digest('execution-effect-workspace-volume-name-v1', record.volumeName),
    imageDigest: record.imageDigest,
    labelsDigest: record.labelsDigest,
    mountPlanDigest: record.mountPlanDigest,
    resourceInstanceDigest,
    volumeIdentityDigest,
    absenceObservationDigest,
    creationReceiptDigest,
    verifiedPresentObservationDigest,
    freshnessReceiptDigest,
    snapshotInventoryDigest: record.snapshotInventoryDigest,
    populationReceiptDigest: record.populationReceiptDigest,
    baselineManifestDigest: record.baselineManifestDigest,
  });
  return Object.freeze({
    ...body,
    resourceDigest: digest('execution-effect-workspace-resource-v1', body),
  });
}

export function parseExecutionEffectWorkspaceResourceV1(
  value: unknown,
): ExecutionEffectWorkspaceResourceV1 | null {
  const record = exact(value, [
    'version', 'kind', 'volumeName', 'volumeNameDigest', 'imageDigest', 'labelsDigest',
    'mountPlanDigest', 'resourceInstanceDigest', 'volumeIdentityDigest', 'absenceObservationDigest',
    'creationReceiptDigest', 'verifiedPresentObservationDigest', 'freshnessReceiptDigest',
    'snapshotInventoryDigest', 'populationReceiptDigest',
    'baselineManifestDigest', 'resourceDigest',
  ]);
  if (record === null || record.version !== 1 || record.kind !== 'docker-volume'
    || !isDigest(record.volumeNameDigest) || !isDigest(record.resourceDigest)) return null;
  try {
    const recreated = createExecutionEffectWorkspaceResourceV1({
      volumeName: record.volumeName as string,
      imageDigest: record.imageDigest as ExecutionEffectPersistenceDigest,
      labelsDigest: record.labelsDigest as ExecutionEffectPersistenceDigest,
      mountPlanDigest: record.mountPlanDigest as ExecutionEffectPersistenceDigest,
      resourceInstanceDigest: record.resourceInstanceDigest as ExecutionEffectPersistenceDigest,
      volumeIdentityDigest: record.volumeIdentityDigest as ExecutionEffectPersistenceDigest,
      absenceObservationDigest:
        record.absenceObservationDigest as ExecutionEffectPersistenceDigest,
      creationReceiptDigest: record.creationReceiptDigest as ExecutionEffectPersistenceDigest,
      verifiedPresentObservationDigest:
        record.verifiedPresentObservationDigest as ExecutionEffectPersistenceDigest,
      freshnessReceiptDigest: record.freshnessReceiptDigest as ExecutionEffectPersistenceDigest,
      snapshotInventoryDigest: record.snapshotInventoryDigest as ExecutionEffectPersistenceDigest,
      populationReceiptDigest: record.populationReceiptDigest as ExecutionEffectPersistenceDigest,
      baselineManifestDigest: record.baselineManifestDigest as ExecutionEffectPersistenceDigest,
    });
    return sameCanonicalJson(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

/** Attempt-private, read-only dependency volume authority captured before provider start. */
export interface ExecutionEffectDependencyResourceV1 {
  readonly version: 1;
  readonly kind: 'docker-read-only-volume';
  readonly state: 'READY';
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly attemptDigest: ExecutionEffectPersistenceDigest;
  readonly admissionReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly custodyPolicyDigest: ExecutionEffectPersistenceDigest;
  readonly imageIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly labelsDigest: ExecutionEffectPersistenceDigest;
  readonly resourceInstanceDigest: ExecutionEffectPersistenceDigest;
  readonly mountPlanDigest: ExecutionEffectPersistenceDigest;
  readonly populationReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly volumeName: string;
  readonly volumeNameDigest: ExecutionEffectPersistenceDigest;
  readonly volumeIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly readyAt: string;
  readonly resourceDigest: ExecutionEffectPersistenceDigest;
}

export function createExecutionEffectDependencyResourceV1(input: Readonly<{
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly admissionReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly custodyPolicyDigest: ExecutionEffectPersistenceDigest;
  readonly imageIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly labelsDigest: ExecutionEffectPersistenceDigest;
  readonly resourceInstanceDigest?: ExecutionEffectPersistenceDigest;
  readonly mountPlanDigest: ExecutionEffectPersistenceDigest;
  readonly populationReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly volumeName: string;
  readonly volumeIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly readyAt: string;
}>): ExecutionEffectDependencyResourceV1 {
  const record = exact(input, [
    'attempt', 'admissionReceiptDigest', 'custodyPolicyDigest', 'imageIdentityDigest',
    'labelsDigest', 'resourceInstanceDigest', 'mountPlanDigest', 'populationReceiptDigest', 'volumeName',
    'volumeIdentityDigest', 'readyAt',
  ]) ?? exact(input, [
    'attempt', 'admissionReceiptDigest', 'custodyPolicyDigest', 'imageIdentityDigest',
    'labelsDigest', 'mountPlanDigest', 'populationReceiptDigest', 'volumeName',
    'volumeIdentityDigest', 'readyAt',
  ]);
  const attempt = parseAttempt(record?.attempt);
  if (record === null || attempt === null || !isDigest(record.admissionReceiptDigest)
    || !isDigest(record.custodyPolicyDigest)
    || !isDigest(record.imageIdentityDigest) || !isDigest(record.labelsDigest)
    || (record.resourceInstanceDigest !== undefined && !isDigest(record.resourceInstanceDigest))
    || !isDigest(record.mountPlanDigest) || !isDigest(record.populationReceiptDigest)
    || !safeResourceName(record.volumeName) || !isDigest(record.volumeIdentityDigest)
    || !isTimestamp(record.readyAt)) {
    throw new TypeError('Invalid execution effect dependency resource');
  }
  const body = Object.freeze({
    version: 1 as const,
    kind: 'docker-read-only-volume' as const,
    state: 'READY' as const,
    attempt,
    attemptDigest: digest('execution-effect-attempt-v1', attempt),
    admissionReceiptDigest: record.admissionReceiptDigest,
    custodyPolicyDigest: record.custodyPolicyDigest,
    imageIdentityDigest: record.imageIdentityDigest,
    labelsDigest: record.labelsDigest,
    resourceInstanceDigest: (record.resourceInstanceDigest
      ?? record.volumeIdentityDigest) as ExecutionEffectPersistenceDigest,
    mountPlanDigest: record.mountPlanDigest,
    populationReceiptDigest: record.populationReceiptDigest,
    volumeName: record.volumeName,
    volumeNameDigest: digest('execution-effect-dependency-volume-name-v1', record.volumeName),
    volumeIdentityDigest: record.volumeIdentityDigest,
    readyAt: record.readyAt,
  });
  return Object.freeze({
    ...body,
    resourceDigest: digest('execution-effect-dependency-resource-v1', body),
  });
}

export function parseExecutionEffectDependencyResourceV1(
  value: unknown,
): ExecutionEffectDependencyResourceV1 | null {
  const record = exact(value, [
    'version', 'kind', 'state', 'attempt', 'attemptDigest', 'admissionReceiptDigest',
    'custodyPolicyDigest', 'imageIdentityDigest', 'labelsDigest', 'resourceInstanceDigest', 'mountPlanDigest',
    'populationReceiptDigest', 'volumeName', 'volumeNameDigest', 'volumeIdentityDigest',
    'readyAt', 'resourceDigest',
  ]);
  if (record === null || record.version !== 1 || record.kind !== 'docker-read-only-volume'
    || record.state !== 'READY' || !isDigest(record.attemptDigest)
    || !isDigest(record.volumeNameDigest)
    || !isDigest(record.resourceDigest)) return null;
  try {
    const recreated = createExecutionEffectDependencyResourceV1({
      attempt: record.attempt as ExecutionEffectAttemptIdentity,
      admissionReceiptDigest: record.admissionReceiptDigest as ExecutionEffectPersistenceDigest,
      custodyPolicyDigest: record.custodyPolicyDigest as ExecutionEffectPersistenceDigest,
      imageIdentityDigest: record.imageIdentityDigest as ExecutionEffectPersistenceDigest,
      labelsDigest: record.labelsDigest as ExecutionEffectPersistenceDigest,
      resourceInstanceDigest: record.resourceInstanceDigest as ExecutionEffectPersistenceDigest,
      mountPlanDigest: record.mountPlanDigest as ExecutionEffectPersistenceDigest,
      populationReceiptDigest: record.populationReceiptDigest as ExecutionEffectPersistenceDigest,
      volumeName: record.volumeName as string,
      volumeIdentityDigest: record.volumeIdentityDigest as ExecutionEffectPersistenceDigest,
      readyAt: record.readyAt as string,
    });
    return sameCanonicalJson(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export interface ExecutionEffectWorkspaceSnapshotSealV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-workspace-snapshot-seal';
  readonly state: 'SEALED';
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly attemptDigest: ExecutionEffectPersistenceDigest;
  readonly admissionReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly custodyPolicyDigest: ExecutionEffectPersistenceDigest;
  readonly writePolicyDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceIdentity: ExecutionEffectManifest['workspaceIdentity'];
  readonly workspaceIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceResource: ExecutionEffectWorkspaceResourceV1;
  readonly dependencyResource: ExecutionEffectDependencyResourceV1;
  readonly nativeCapabilityDigest: ExecutionEffectPersistenceDigest;
  readonly platform: 'linux' | 'wsl2-linux';
  readonly sealedAt: string;
  readonly sealDigest: ExecutionEffectPersistenceDigest;
}

export type CreateExecutionEffectWorkspaceSnapshotSealV1Input = Omit<
  ExecutionEffectWorkspaceSnapshotSealV1,
  'version' | 'kind' | 'state' | 'attemptDigest' | 'workspaceIdentityDigest' | 'sealDigest'
>;

function workspaceBody(value: unknown): Omit<ExecutionEffectWorkspaceSnapshotSealV1, 'sealDigest'> | null {
  const record = exact(value, [
    'version', 'kind', 'state', 'attempt', 'attemptDigest', 'admissionReceiptDigest',
    'custodyPolicyDigest', 'writePolicyDigest', 'workspaceIdentity', 'workspaceIdentityDigest',
    'workspaceResource', 'dependencyResource', 'nativeCapabilityDigest', 'platform', 'sealedAt',
  ]);
  const attempt = parseAttempt(record?.attempt);
  const workspace = exact(record?.workspaceIdentity, [
    'filesystemId', 'directoryId', 'rootHandleEvidenceDigest',
  ]);
  const workspaceResource = parseExecutionEffectWorkspaceResourceV1(record?.workspaceResource);
  const dependencyResource = parseExecutionEffectDependencyResourceV1(record?.dependencyResource);
  if (record === null || attempt === null || workspace === null
    || workspaceResource === null || dependencyResource === null
    || record.version !== 1 || record.kind !== 'execution-effect-workspace-snapshot-seal'
    || record.state !== 'SEALED' || !isDigest(record.attemptDigest)
    || !isDigest(record.admissionReceiptDigest) || !isDigest(record.custodyPolicyDigest)
    || !isDigest(record.writePolicyDigest) || !isDigest(record.workspaceIdentityDigest)
    || !isDigest(record.nativeCapabilityDigest)
    || (record.platform !== 'linux' && record.platform !== 'wsl2-linux')
    || typeof workspace.filesystemId !== 'string' || workspace.filesystemId.length === 0
    || typeof workspace.directoryId !== 'string' || workspace.directoryId.length === 0
    || workspaceResource.volumeName === dependencyResource.volumeName
    || !sameAttempt(dependencyResource.attempt, attempt)
    || dependencyResource.attemptDigest !== record.attemptDigest
    || dependencyResource.admissionReceiptDigest !== record.admissionReceiptDigest
    || dependencyResource.custodyPolicyDigest !== record.custodyPolicyDigest
    || Date.parse(dependencyResource.readyAt) > Date.parse(record.sealedAt as string)
    || !isDigest(workspace.rootHandleEvidenceDigest) || !isTimestamp(record.sealedAt)) return null;
  const attemptDigest = digest('execution-effect-attempt-v1', attempt);
  const workspaceIdentity = Object.freeze({
    filesystemId: workspace.filesystemId,
    directoryId: workspace.directoryId,
    rootHandleEvidenceDigest: workspace.rootHandleEvidenceDigest,
  });
  const workspaceIdentityDigest = digest('execution-effect-workspace-identity-v1', workspaceIdentity);
  if (record.attemptDigest !== attemptDigest || record.workspaceIdentityDigest !== workspaceIdentityDigest) {
    return null;
  }
  return Object.freeze({
    version: 1,
    kind: 'execution-effect-workspace-snapshot-seal',
    state: 'SEALED',
    attempt,
    attemptDigest,
    admissionReceiptDigest: record.admissionReceiptDigest,
    custodyPolicyDigest: record.custodyPolicyDigest,
    writePolicyDigest: record.writePolicyDigest,
    workspaceIdentity,
    workspaceResource,
    dependencyResource,
    workspaceIdentityDigest,
    nativeCapabilityDigest: record.nativeCapabilityDigest,
    platform: record.platform,
    sealedAt: record.sealedAt,
  });
}

export function createExecutionEffectWorkspaceSnapshotSealV1(
  input: CreateExecutionEffectWorkspaceSnapshotSealV1Input,
): ExecutionEffectWorkspaceSnapshotSealV1 {
  const attempt = parseAttempt(input.attempt);
  if (!attempt) throw new TypeError('Invalid execution effect workspace snapshot seal');
  const workspaceIdentity = input.workspaceIdentity;
  const body = workspaceBody({
    version: 1,
    kind: 'execution-effect-workspace-snapshot-seal',
    state: 'SEALED',
    ...input,
    attempt,
    attemptDigest: digest('execution-effect-attempt-v1', attempt),
    workspaceIdentityDigest: digest('execution-effect-workspace-identity-v1', workspaceIdentity),
  });
  if (!body) throw new TypeError('Invalid execution effect workspace snapshot seal');
  return Object.freeze({ ...body, sealDigest: digest('execution-effect-workspace-snapshot-seal-v1', body) });
}

export function parseExecutionEffectWorkspaceSnapshotSealV1(
  value: unknown,
): ExecutionEffectWorkspaceSnapshotSealV1 | null {
  const record = exact(value, [
    'version', 'kind', 'state', 'attempt', 'attemptDigest', 'admissionReceiptDigest',
    'custodyPolicyDigest', 'writePolicyDigest', 'workspaceIdentity', 'workspaceIdentityDigest',
    'workspaceResource', 'dependencyResource', 'nativeCapabilityDigest', 'platform', 'sealedAt',
    'sealDigest',
  ]);
  if (record === null || !isDigest(record.sealDigest)) return null;
  const { sealDigest: _sealDigest, ...candidate } = record;
  const body = workspaceBody(candidate);
  return body && digest('execution-effect-workspace-snapshot-seal-v1', body) === record.sealDigest
    ? Object.freeze({ ...body, sealDigest: record.sealDigest }) : null;
}

export interface ExecutionEffectWorkspaceReleaseV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-workspace-release';
  readonly state: 'RELEASED_AFTER_COMMIT';
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly attemptDigest: ExecutionEffectPersistenceDigest;
  readonly admissionReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly custodyPolicyDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceSnapshotSealDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceResourceDigest: ExecutionEffectPersistenceDigest;
  readonly dependencyResourceDigest: ExecutionEffectPersistenceDigest;
  readonly transactionDigest: ExecutionEffectPersistenceDigest;
  readonly committedJournalDigest: ExecutionEffectPersistenceDigest;
  readonly providerContainer: Readonly<{
    readonly containerName: string;
    readonly containerNameDigest: ExecutionEffectPersistenceDigest;
    readonly disposition: 'EXECUTED_DELETION' | 'RECONCILED_ABSENCE';
    readonly deletionReceiptDigest: ExecutionEffectPersistenceDigest | null;
    readonly absenceEvidenceDigest: ExecutionEffectPersistenceDigest;
  }>;
  readonly workspaceVolume: Readonly<{
    readonly volumeName: string;
    readonly volumeNameDigest: ExecutionEffectPersistenceDigest;
    readonly disposition: 'EXECUTED_DELETION' | 'RECONCILED_ABSENCE';
    readonly deletionReceiptDigest: ExecutionEffectPersistenceDigest | null;
    readonly absenceEvidenceDigest: ExecutionEffectPersistenceDigest;
  }>;
  readonly dependencyVolume: Readonly<{
    readonly volumeName: string;
    readonly volumeNameDigest: ExecutionEffectPersistenceDigest;
    readonly volumeIdentityDigest: ExecutionEffectPersistenceDigest;
    readonly disposition: 'EXECUTED_DELETION' | 'RECONCILED_ABSENCE';
    readonly deletionReceiptDigest: ExecutionEffectPersistenceDigest | null;
    readonly absenceEvidenceDigest: ExecutionEffectPersistenceDigest;
  }>;
  readonly releasedAt: string;
  readonly receiptDigest: ExecutionEffectPersistenceDigest;
}

function parseReleasedResource(
  value: unknown,
  resource: 'container' | 'volume',
): ExecutionEffectWorkspaceReleaseV1['providerContainer'] | null {
  const nameKey = resource === 'container' ? 'containerName' : 'volumeName';
  const nameDigestKey = resource === 'container' ? 'containerNameDigest' : 'volumeNameDigest';
  const record = exact(value, [
    nameKey, nameDigestKey, 'disposition', 'deletionReceiptDigest', 'absenceEvidenceDigest',
  ]);
  const name = record?.[nameKey];
  const nameDigest = record?.[nameDigestKey];
  if (record === null || !safeResourceName(name) || !isDigest(nameDigest)
    || (record.disposition !== 'EXECUTED_DELETION'
      && record.disposition !== 'RECONCILED_ABSENCE')
    || (record.disposition === 'EXECUTED_DELETION') !== isDigest(record.deletionReceiptDigest)
    || (record.disposition === 'RECONCILED_ABSENCE'
      && record.deletionReceiptDigest !== null)
    || !isDigest(record.absenceEvidenceDigest)
    || digest(`execution-effect-workspace-${resource}-name-v1`, name) !== nameDigest) return null;
  return Object.freeze({
    [nameKey]: name,
    [nameDigestKey]: nameDigest,
    disposition: record.disposition,
    deletionReceiptDigest: record.deletionReceiptDigest,
    absenceEvidenceDigest: record.absenceEvidenceDigest,
  }) as unknown as ExecutionEffectWorkspaceReleaseV1['providerContainer'];
}

export function createExecutionEffectWorkspaceReleaseV1(input: Readonly<{
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly admissionReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly custodyPolicyDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceSnapshotSealDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceResource: ExecutionEffectWorkspaceResourceV1;
  readonly dependencyResource: ExecutionEffectDependencyResourceV1;
  readonly transactionDigest: ExecutionEffectPersistenceDigest;
  readonly committedJournalDigest: ExecutionEffectPersistenceDigest;
  readonly providerContainer: Readonly<{
    readonly containerName: string;
    readonly disposition?: 'EXECUTED_DELETION' | 'RECONCILED_ABSENCE';
    readonly deletionReceiptDigest: ExecutionEffectPersistenceDigest | null;
    readonly absenceEvidenceDigest: ExecutionEffectPersistenceDigest;
  }>;
  readonly workspaceVolume: Readonly<{
    readonly volumeName: string;
    readonly disposition?: 'EXECUTED_DELETION' | 'RECONCILED_ABSENCE';
    readonly deletionReceiptDigest: ExecutionEffectPersistenceDigest | null;
    readonly absenceEvidenceDigest: ExecutionEffectPersistenceDigest;
  }>;
  readonly dependencyVolume: Readonly<{
    readonly volumeName: string;
    readonly volumeIdentityDigest: ExecutionEffectPersistenceDigest;
    readonly disposition?: 'EXECUTED_DELETION' | 'RECONCILED_ABSENCE';
    readonly deletionReceiptDigest: ExecutionEffectPersistenceDigest | null;
    readonly absenceEvidenceDigest: ExecutionEffectPersistenceDigest;
  }>;
  readonly releasedAt: string;
}>): ExecutionEffectWorkspaceReleaseV1 {
  const record = exact(input, [
    'attempt', 'admissionReceiptDigest', 'custodyPolicyDigest', 'workspaceSnapshotSealDigest',
    'workspaceResource', 'dependencyResource', 'transactionDigest', 'committedJournalDigest',
    'providerContainer', 'workspaceVolume', 'dependencyVolume', 'releasedAt',
  ]);
  const attempt = parseAttempt(record?.attempt);
  const workspaceResource = parseExecutionEffectWorkspaceResourceV1(record?.workspaceResource);
  const dependencyResource = parseExecutionEffectDependencyResourceV1(record?.dependencyResource);
  const container = exact(record?.providerContainer, [
    'containerName', 'disposition', 'deletionReceiptDigest', 'absenceEvidenceDigest',
  ]) ?? exact(record?.providerContainer, [
    'containerName', 'deletionReceiptDigest', 'absenceEvidenceDigest',
  ]);
  const volume = exact(record?.workspaceVolume, [
    'volumeName', 'disposition', 'deletionReceiptDigest', 'absenceEvidenceDigest',
  ]) ?? exact(record?.workspaceVolume, [
    'volumeName', 'deletionReceiptDigest', 'absenceEvidenceDigest',
  ]);
  const dependencyVolume = exact(record?.dependencyVolume, [
    'volumeName', 'volumeIdentityDigest', 'disposition', 'deletionReceiptDigest',
    'absenceEvidenceDigest',
  ]) ?? exact(record?.dependencyVolume, [
    'volumeName', 'volumeIdentityDigest', 'deletionReceiptDigest', 'absenceEvidenceDigest',
  ]);
  const containerDisposition = container?.disposition ?? 'EXECUTED_DELETION';
  const volumeDisposition = volume?.disposition ?? 'EXECUTED_DELETION';
  const dependencyDisposition = dependencyVolume?.disposition ?? 'EXECUTED_DELETION';
  if (record === null || attempt === null || workspaceResource === null
    || dependencyResource === null || container === null || volume === null
    || dependencyVolume === null || !safeResourceName(container.containerName)
    || !safeResourceName(volume.volumeName) || volume.volumeName !== workspaceResource.volumeName
    || !isDigest(record.admissionReceiptDigest) || !isDigest(record.custodyPolicyDigest)
    || !isDigest(record.workspaceSnapshotSealDigest) || !isDigest(record.transactionDigest)
    || !safeResourceName(dependencyVolume.volumeName)
    || dependencyVolume.volumeName !== dependencyResource.volumeName
    || dependencyVolume.volumeIdentityDigest !== dependencyResource.volumeIdentityDigest
    || dependencyVolume.volumeName === workspaceResource.volumeName
    || !isDigest(record.committedJournalDigest)
    || (containerDisposition !== 'EXECUTED_DELETION'
      && containerDisposition !== 'RECONCILED_ABSENCE')
    || (volumeDisposition !== 'EXECUTED_DELETION'
      && volumeDisposition !== 'RECONCILED_ABSENCE')
    || (dependencyDisposition !== 'EXECUTED_DELETION'
      && dependencyDisposition !== 'RECONCILED_ABSENCE')
    || (containerDisposition === 'EXECUTED_DELETION')
      !== isDigest(container.deletionReceiptDigest)
    || (volumeDisposition === 'EXECUTED_DELETION') !== isDigest(volume.deletionReceiptDigest)
    || (dependencyDisposition === 'EXECUTED_DELETION')
      !== isDigest(dependencyVolume.deletionReceiptDigest)
    || (containerDisposition === 'RECONCILED_ABSENCE'
      && container.deletionReceiptDigest !== null)
    || (volumeDisposition === 'RECONCILED_ABSENCE' && volume.deletionReceiptDigest !== null)
    || (dependencyDisposition === 'RECONCILED_ABSENCE'
      && dependencyVolume.deletionReceiptDigest !== null)
    || !isDigest(container.absenceEvidenceDigest) || !isDigest(volume.absenceEvidenceDigest)
    || !isDigest(dependencyVolume.absenceEvidenceDigest) || !isTimestamp(record.releasedAt)) {
    throw new TypeError('Invalid execution effect workspace release');
  }
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-workspace-release' as const,
    state: 'RELEASED_AFTER_COMMIT' as const,
    attempt,
    attemptDigest: digest('execution-effect-attempt-v1', attempt),
    admissionReceiptDigest: record.admissionReceiptDigest,
    custodyPolicyDigest: record.custodyPolicyDigest,
    workspaceSnapshotSealDigest: record.workspaceSnapshotSealDigest,
    workspaceResourceDigest: workspaceResource.resourceDigest,
    dependencyResourceDigest: dependencyResource.resourceDigest,
    transactionDigest: record.transactionDigest,
    committedJournalDigest: record.committedJournalDigest,
    providerContainer: Object.freeze({
      containerName: container.containerName,
      containerNameDigest: digest(
        'execution-effect-workspace-container-name-v1',
        container.containerName,
      ),
      disposition: containerDisposition as 'EXECUTED_DELETION' | 'RECONCILED_ABSENCE',
      deletionReceiptDigest:
        container.deletionReceiptDigest as ExecutionEffectPersistenceDigest | null,
      absenceEvidenceDigest: container.absenceEvidenceDigest as ExecutionEffectPersistenceDigest,
    }),
    workspaceVolume: Object.freeze({
      volumeName: volume.volumeName,
      volumeNameDigest: workspaceResource.volumeNameDigest,
      disposition: volumeDisposition as 'EXECUTED_DELETION' | 'RECONCILED_ABSENCE',
      deletionReceiptDigest:
        volume.deletionReceiptDigest as ExecutionEffectPersistenceDigest | null,
      absenceEvidenceDigest: volume.absenceEvidenceDigest as ExecutionEffectPersistenceDigest,
    }),
    dependencyVolume: Object.freeze({
      volumeName: dependencyVolume.volumeName,
      volumeNameDigest: dependencyResource.volumeNameDigest,
      volumeIdentityDigest: dependencyResource.volumeIdentityDigest,
      disposition: dependencyDisposition as 'EXECUTED_DELETION' | 'RECONCILED_ABSENCE',
      deletionReceiptDigest:
        dependencyVolume.deletionReceiptDigest as ExecutionEffectPersistenceDigest | null,
      absenceEvidenceDigest:
        dependencyVolume.absenceEvidenceDigest as ExecutionEffectPersistenceDigest,
    }),
    releasedAt: record.releasedAt,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest('execution-effect-workspace-release-v1', body),
  });
}

export function parseExecutionEffectWorkspaceReleaseV1(
  value: unknown,
): ExecutionEffectWorkspaceReleaseV1 | null {
  const record = exact(value, [
    'version', 'kind', 'state', 'attempt', 'attemptDigest', 'admissionReceiptDigest',
    'custodyPolicyDigest', 'workspaceSnapshotSealDigest', 'workspaceResourceDigest',
    'dependencyResourceDigest', 'transactionDigest', 'committedJournalDigest',
    'providerContainer', 'workspaceVolume', 'dependencyVolume', 'releasedAt', 'receiptDigest',
  ]);
  const attempt = parseAttempt(record?.attempt);
  const providerContainer = parseReleasedResource(record?.providerContainer, 'container');
  const workspaceVolume = parseReleasedResource(record?.workspaceVolume, 'volume') as
    ExecutionEffectWorkspaceReleaseV1['workspaceVolume'] | null;
  const dependencyVolumeRecord = exact(record?.dependencyVolume, [
    'volumeName', 'volumeNameDigest', 'volumeIdentityDigest', 'disposition', 'deletionReceiptDigest',
    'absenceEvidenceDigest',
  ]);
  const dependencyVolume = dependencyVolumeRecord !== null
    && safeResourceName(dependencyVolumeRecord.volumeName)
    && isDigest(dependencyVolumeRecord.volumeNameDigest)
    && dependencyVolumeRecord.volumeNameDigest
      === digest('execution-effect-dependency-volume-name-v1', dependencyVolumeRecord.volumeName)
    && isDigest(dependencyVolumeRecord.volumeIdentityDigest)
    && (dependencyVolumeRecord.disposition === 'EXECUTED_DELETION'
      || dependencyVolumeRecord.disposition === 'RECONCILED_ABSENCE')
    && (dependencyVolumeRecord.disposition === 'EXECUTED_DELETION')
      === isDigest(dependencyVolumeRecord.deletionReceiptDigest)
    && (dependencyVolumeRecord.disposition !== 'RECONCILED_ABSENCE'
      || dependencyVolumeRecord.deletionReceiptDigest === null)
    && isDigest(dependencyVolumeRecord.absenceEvidenceDigest)
    ? Object.freeze({
      volumeName: dependencyVolumeRecord.volumeName,
      volumeNameDigest: dependencyVolumeRecord.volumeNameDigest,
      volumeIdentityDigest: dependencyVolumeRecord.volumeIdentityDigest,
      disposition: dependencyVolumeRecord.disposition as
        'EXECUTED_DELETION' | 'RECONCILED_ABSENCE',
      deletionReceiptDigest:
        dependencyVolumeRecord.deletionReceiptDigest as ExecutionEffectPersistenceDigest | null,
      absenceEvidenceDigest:
        dependencyVolumeRecord.absenceEvidenceDigest as ExecutionEffectPersistenceDigest,
    }) : null;
  if (record === null || attempt === null || providerContainer === null || workspaceVolume === null
    || dependencyVolume === null
    || record.version !== 1 || record.kind !== 'execution-effect-workspace-release'
    || record.state !== 'RELEASED_AFTER_COMMIT'
    || record.attemptDigest !== digest('execution-effect-attempt-v1', attempt)
    || !isDigest(record.admissionReceiptDigest) || !isDigest(record.custodyPolicyDigest)
    || !isDigest(record.workspaceSnapshotSealDigest) || !isDigest(record.workspaceResourceDigest)
    || !isDigest(record.dependencyResourceDigest)
    || !isDigest(record.transactionDigest) || !isDigest(record.committedJournalDigest)
    || !isTimestamp(record.releasedAt) || !isDigest(record.receiptDigest)) return null;
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-workspace-release' as const,
    state: 'RELEASED_AFTER_COMMIT' as const,
    attempt,
    attemptDigest: record.attemptDigest,
    admissionReceiptDigest: record.admissionReceiptDigest,
    custodyPolicyDigest: record.custodyPolicyDigest,
    workspaceSnapshotSealDigest: record.workspaceSnapshotSealDigest,
    workspaceResourceDigest: record.workspaceResourceDigest,
    dependencyResourceDigest: record.dependencyResourceDigest,
    transactionDigest: record.transactionDigest,
    committedJournalDigest: record.committedJournalDigest,
    providerContainer,
    workspaceVolume,
    dependencyVolume,
    releasedAt: record.releasedAt,
  });
  return digest('execution-effect-workspace-release-v1', body) === record.receiptDigest
    ? Object.freeze({ ...body, receiptDigest: record.receiptDigest }) : null;
}

export interface ExecutionEffectStagedChunkRefV1 {
  readonly index: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly artifactKey: string;
  readonly artifactReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly contentDigest: ExecutionEffectPersistenceDigest;
  readonly chunkDigest: ExecutionEffectPersistenceDigest;
}

export interface ExecutionEffectStagedSourceSealV1 {
  readonly path: string;
  readonly byteLength: number;
  readonly contentDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly attemptDigest: ExecutionEffectPersistenceDigest;
  readonly admissionReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly custodyPolicyDigest: ExecutionEffectPersistenceDigest;
  readonly landingIntentDigest: ExecutionEffectPersistenceDigest;
  readonly chunks: readonly ExecutionEffectStagedChunkRefV1[];
  readonly stageAuthorityDigest: ExecutionEffectPersistenceDigest;
}

export interface ExecutionEffectLandingDerivedParentProvenanceV1 {
  readonly kind: 'DERIVED_PARENT';
  readonly path: string;
  readonly childEffectDigests: readonly ExecutionEffectPersistenceDigest[];
  readonly provenanceDigest: ExecutionEffectPersistenceDigest;
}

export function createExecutionEffectLandingDerivedParentProvenanceV1(input: Readonly<{
  readonly path: string;
  readonly childEffectDigests: readonly ExecutionEffectPersistenceDigest[];
}>): ExecutionEffectLandingDerivedParentProvenanceV1 {
  const record = exact(input, ['path', 'childEffectDigests']);
  if (record === null || !safePath(record.path) || !Array.isArray(record.childEffectDigests)
    || nodeTypes.isProxy(record.childEffectDigests) || record.childEffectDigests.length === 0) {
    throw new TypeError('Invalid execution effect derived-parent provenance');
  }
  const childEffectDigests = Object.freeze([
    ...(record.childEffectDigests as ExecutionEffectPersistenceDigest[]),
  ].sort(compare));
  if (childEffectDigests.some(value => !isDigest(value))
    || childEffectDigests.some((value, index) => index > 0
      && childEffectDigests[index - 1] === value)) {
    throw new TypeError('Invalid execution effect derived-parent provenance');
  }
  const body = Object.freeze({
    kind: 'DERIVED_PARENT' as const,
    path: record.path,
    childEffectDigests,
  });
  return Object.freeze({
    ...body,
    provenanceDigest: digest('execution-effect-landing-derived-parent-v1', {
      path: body.path,
      childEffectDigests: body.childEffectDigests,
    }),
  });
}

function parseDerivedParentProvenance(
  value: unknown,
): ExecutionEffectLandingDerivedParentProvenanceV1 | null {
  const record = exact(value, ['kind', 'path', 'childEffectDigests', 'provenanceDigest']);
  if (record === null || record.kind !== 'DERIVED_PARENT'
    || !isDigest(record.provenanceDigest)) return null;
  try {
    const created = createExecutionEffectLandingDerivedParentProvenanceV1({
      path: record.path as string,
      childEffectDigests: record.childEffectDigests as ExecutionEffectPersistenceDigest[],
    });
    return sameCanonicalJson(created, value) ? created : null;
  } catch {
    return null;
  }
}

export type ExecutionEffectLandingAuthorityEntryStateV1 =
  | Readonly<{
    readonly state: 'ABSENT';
    readonly stateDigest: ExecutionEffectPersistenceDigest;
  }>
  | Readonly<{
    readonly state: 'PRESENT';
    readonly entry: ExecutionEffectManifest['entries'][number];
    readonly objectIdentityDigest: ExecutionEffectPersistenceDigest;
    /** Native file hard-link proof is exact; directory topology has no portable nlink authority. */
    readonly linkCount: 1 | null;
    readonly stateDigest: ExecutionEffectPersistenceDigest;
  }>;

export interface ExecutionEffectLandingAuthorityPathStateV1 {
  readonly path: string;
  readonly entry: ExecutionEffectLandingAuthorityEntryStateV1;
}

export type ExecutionEffectLandingAuthorityExpectedEntryStateV1 =
  | Readonly<{
    readonly state: 'ABSENT';
    readonly stateDigest: ExecutionEffectPersistenceDigest;
  }>
  | Readonly<{
    readonly state: 'PRESENT';
    readonly entry: ExecutionEffectManifest['entries'][number];
    readonly stateDigest: ExecutionEffectPersistenceDigest;
  }>;

export interface ExecutionEffectLandingAuthorityExpectedPathStateV1 {
  readonly path: string;
  readonly entry: ExecutionEffectLandingAuthorityExpectedEntryStateV1;
}

export type ExecutionEffectLandingAuthorityParentV1 =
  | Readonly<{
    readonly path: string;
    readonly source: 'PREPARED_PREIMAGE';
    readonly entry: ExecutionEffectLandingAuthorityEntryStateV1;
  }>
  | Readonly<{
    readonly path: string;
    readonly source: 'OPERATION_POSTIMAGE';
    readonly operationIndex: number;
    readonly operationDigest: ExecutionEffectPersistenceDigest;
    readonly expectedDirectory: Extract<ExecutionEffectManifest['entries'][number], { kind: 'directory' }>;
  }>;

function safePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.normalize('NFC') === value
    && !value.startsWith('/') && !value.includes('\\') && !value.includes('\0')
    && value !== '.' && value !== '..' && !value.startsWith('../')
    && !value.split('/').some(part => part.length === 0 || part === '.' || part === '..');
}

function parseChunk(value: unknown, expectedIndex: number, expectedOffset: number): ExecutionEffectStagedChunkRefV1 | null {
  const record = exact(value, [
    'index', 'byteOffset', 'byteLength', 'artifactKey', 'artifactReceiptDigest',
    'contentDigest', 'chunkDigest',
  ]);
  if (record === null || record.index !== expectedIndex || record.byteOffset !== expectedOffset
    || !Number.isSafeInteger(record.byteLength) || (record.byteLength as number) < 0
    || !isSafeKey(record.artifactKey) || !isDigest(record.artifactReceiptDigest)
    || !isDigest(record.contentDigest) || !isDigest(record.chunkDigest)) return null;
  const body = Object.freeze({
    index: expectedIndex,
    byteOffset: expectedOffset,
    byteLength: record.byteLength as number,
    artifactKey: record.artifactKey,
    artifactReceiptDigest: record.artifactReceiptDigest,
    contentDigest: record.contentDigest,
  });
  return digest('execution-effect-staged-chunk-ref-v1', body) === record.chunkDigest
    ? Object.freeze({ ...body, chunkDigest: record.chunkDigest }) : null;
}

export function createExecutionEffectStagedChunkRefV1(input: Readonly<{
  readonly index: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly artifactKey: string;
  readonly artifactReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly contentDigest: ExecutionEffectPersistenceDigest;
}>): ExecutionEffectStagedChunkRefV1 {
  const record = exact(input, [
    'index', 'byteOffset', 'byteLength', 'artifactKey', 'artifactReceiptDigest', 'contentDigest',
  ]);
  if (record === null || !Number.isSafeInteger(record.index) || (record.index as number) < 0
    || !Number.isSafeInteger(record.byteOffset) || (record.byteOffset as number) < 0) {
    throw new TypeError('Invalid execution effect staged chunk');
  }
  const body = Object.freeze({
    index: record.index as number,
    byteOffset: record.byteOffset as number,
    byteLength: record.byteLength as number,
    artifactKey: record.artifactKey as string,
    artifactReceiptDigest: record.artifactReceiptDigest as ExecutionEffectPersistenceDigest,
    contentDigest: record.contentDigest as ExecutionEffectPersistenceDigest,
  });
  const parsed = parseChunk({
    ...body,
    chunkDigest: digest('execution-effect-staged-chunk-ref-v1', body),
  }, body.index, body.byteOffset);
  if (!parsed) throw new TypeError('Invalid execution effect staged chunk');
  return parsed;
}

export interface CreateExecutionEffectStagedSourceSealV1Input extends Omit<
  ExecutionEffectStagedSourceSealV1,
  'chunks' | 'stageAuthorityDigest'
> {
  readonly chunks: readonly Omit<
    ExecutionEffectStagedChunkRefV1,
    'index' | 'byteOffset' | 'chunkDigest'
  >[];
}

export function executionEffectStageAuthorityDigestV1(input: Readonly<{
  readonly path: string;
  readonly byteLength: number;
  readonly contentDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly attemptDigest: ExecutionEffectPersistenceDigest;
  readonly admissionReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly custodyPolicyDigest: ExecutionEffectPersistenceDigest;
  readonly landingIntentDigest: ExecutionEffectPersistenceDigest;
  readonly chunks: readonly ExecutionEffectStagedChunkRefV1[];
}>): ExecutionEffectPersistenceDigest {
  const record = exact(input, [
    'path', 'byteLength', 'contentDigest', 'workspaceIdentityDigest', 'attemptDigest',
    'admissionReceiptDigest', 'custodyPolicyDigest', 'landingIntentDigest', 'chunks',
  ]);
  if (record === null || !safePath(record.path) || !Number.isSafeInteger(record.byteLength)
    || (record.byteLength as number) < 0 || !isDigest(record.contentDigest)
    || !isDigest(record.workspaceIdentityDigest) || !isDigest(record.attemptDigest)
    || !isDigest(record.admissionReceiptDigest) || !isDigest(record.custodyPolicyDigest)
    || !isDigest(record.landingIntentDigest) || !Array.isArray(record.chunks)
    || nodeTypes.isProxy(record.chunks) || record.chunks.length === 0) {
    throw new TypeError('Invalid execution effect stage authority');
  }
  return digest('execution-effect-stage-authority-v1', Object.freeze({
    path: record.path,
    byteLength: record.byteLength,
    contentDigest: record.contentDigest,
    workspaceIdentityDigest: record.workspaceIdentityDigest,
    attemptDigest: record.attemptDigest,
    admissionReceiptDigest: record.admissionReceiptDigest,
    custodyPolicyDigest: record.custodyPolicyDigest,
    landingIntentDigest: record.landingIntentDigest,
    chunks: record.chunks,
  }));
}

export function createExecutionEffectStagedSourceSealV1(
  input: CreateExecutionEffectStagedSourceSealV1Input,
): ExecutionEffectStagedSourceSealV1 {
  let byteOffset = 0;
  const chunks = input.chunks.map((chunk, index) => {
    const parsed = createExecutionEffectStagedChunkRefV1({
      index,
      byteOffset,
      byteLength: chunk.byteLength,
      artifactKey: chunk.artifactKey,
      artifactReceiptDigest: chunk.artifactReceiptDigest,
      contentDigest: chunk.contentDigest,
    });
    byteOffset += parsed.byteLength;
    return parsed;
  });
  const sourceInput = { ...input, chunks };
  const body = parseStagedSource({
    ...sourceInput,
    stageAuthorityDigest: executionEffectStageAuthorityDigestV1(sourceInput),
  });
  if (!body) throw new TypeError('Invalid execution effect staged source');
  return body;
}

export function parseStagedSource(value: unknown): ExecutionEffectStagedSourceSealV1 | null {
  const record = exact(value, [
    'path', 'byteLength', 'contentDigest', 'workspaceIdentityDigest', 'attemptDigest',
    'admissionReceiptDigest', 'custodyPolicyDigest', 'landingIntentDigest', 'chunks',
    'stageAuthorityDigest',
  ]);
  if (record === null || !safePath(record.path) || !Number.isSafeInteger(record.byteLength)
    || (record.byteLength as number) < 0 || !isDigest(record.contentDigest)
    || !isDigest(record.workspaceIdentityDigest) || !isDigest(record.attemptDigest)
    || !isDigest(record.admissionReceiptDigest) || !isDigest(record.custodyPolicyDigest)
    || !isDigest(record.landingIntentDigest) || !Array.isArray(record.chunks)
    || record.chunks.length === 0 || !isDigest(record.stageAuthorityDigest)) return null;
  const chunks: ExecutionEffectStagedChunkRefV1[] = [];
  const keys = new Set<string>();
  let offset = 0;
  for (let index = 0; index < record.chunks.length; index += 1) {
    const chunk = parseChunk(record.chunks[index], index, offset);
    if (!chunk || keys.has(chunk.artifactKey)
      || (chunk.byteLength === 0 && record.chunks.length !== 1)) return null;
    keys.add(chunk.artifactKey);
    chunks.push(chunk);
    offset += chunk.byteLength;
    if (!Number.isSafeInteger(offset)) return null;
  }
  if (offset !== record.byteLength) return null;
  const body = Object.freeze({
    path: record.path,
    byteLength: record.byteLength as number,
    contentDigest: record.contentDigest,
    workspaceIdentityDigest: record.workspaceIdentityDigest,
    attemptDigest: record.attemptDigest,
    admissionReceiptDigest: record.admissionReceiptDigest,
    custodyPolicyDigest: record.custodyPolicyDigest,
    landingIntentDigest: record.landingIntentDigest,
    chunks: Object.freeze(chunks),
  });
  try {
    return executionEffectStageAuthorityDigestV1(body) === record.stageAuthorityDigest
      ? Object.freeze({ ...body, stageAuthorityDigest: record.stageAuthorityDigest }) : null;
  } catch {
    return null;
  }
}

export interface ExecutionEffectPersistenceOperationV1 {
  readonly version: 1;
  readonly index: number;
  readonly kind: 'ADD_DIRECTORY' | 'ADD' | 'REPLACE' | 'DELETE' | 'MODE';
  readonly path: string;
  readonly effectDigests: readonly ExecutionEffectPersistenceDigest[];
  readonly derivedParent: ExecutionEffectLandingDerivedParentProvenanceV1 | null;
  readonly stagedSource: ExecutionEffectStagedSourceSealV1 | null;
  readonly entryPreimages: readonly ExecutionEffectLandingAuthorityPathStateV1[];
  readonly entryPostimages: readonly ExecutionEffectLandingAuthorityExpectedPathStateV1[];
  readonly parentAuthorities: readonly ExecutionEffectLandingAuthorityParentV1[];
  readonly nativeReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly durabilityEvidenceDigest: ExecutionEffectPersistenceDigest;
  readonly operationDigest: ExecutionEffectPersistenceDigest;
}

function safeAuthorityPath(value: unknown): value is string {
  return value === '.' || safePath(value);
}

function parseAuthorityEntry(value: unknown): ExecutionEffectManifest['entries'][number] | null {
  if (value === null || typeof value !== 'object') return null;
  if (Reflect.get(value, 'kind') === 'directory') {
    const record = exact(value, ['path', 'kind', 'mode']);
    return record !== null && record.kind === 'directory' && safeAuthorityPath(record.path)
      && Number.isSafeInteger(record.mode) && (record.mode as number) >= 0
      && (record.mode as number) <= 0o777
      ? Object.freeze({ path: record.path, kind: 'directory' as const, mode: record.mode as number })
      : null;
  }
  const record = exact(value, ['path', 'kind', 'mode', 'size', 'contentDigest']);
  return record !== null && record.kind === 'regular-file' && safeAuthorityPath(record.path)
    && Number.isSafeInteger(record.mode) && (record.mode as number) >= 0
    && (record.mode as number) <= 0o777 && Number.isSafeInteger(record.size)
    && (record.size as number) >= 0 && isDigest(record.contentDigest)
    ? Object.freeze({
      path: record.path,
      kind: 'regular-file' as const,
      mode: record.mode as number,
      size: record.size as number,
      contentDigest: record.contentDigest,
    }) : null;
}

function parseAuthorityEntryState(value: unknown): ExecutionEffectLandingAuthorityEntryStateV1 | null {
  const absent = exact(value, ['state', 'stateDigest']);
  if (absent?.state === 'ABSENT' && isDigest(absent.stateDigest)) {
    const body = Object.freeze({ state: 'ABSENT' as const });
    return digest('execution-effect-landing-entry-state-v1', body) === absent.stateDigest
      ? Object.freeze({ ...body, stateDigest: absent.stateDigest }) : null;
  }
  const record = exact(value, [
    'state', 'entry', 'objectIdentityDigest', 'linkCount', 'stateDigest',
  ]);
  const entry = parseAuthorityEntry(record?.entry);
  if (record === null || record.state !== 'PRESENT' || entry === null
    || !isDigest(record.objectIdentityDigest)
    || (entry.kind === 'regular-file' ? record.linkCount !== 1 : record.linkCount !== null)
    || !isDigest(record.stateDigest)) return null;
  const body = Object.freeze({
    state: 'PRESENT' as const,
    entry,
    objectIdentityDigest: record.objectIdentityDigest,
    linkCount: record.linkCount as 1 | null,
  });
  return digest('execution-effect-landing-entry-state-v1', body) === record.stateDigest
    ? Object.freeze({ ...body, stateDigest: record.stateDigest }) : null;
}

function parseAuthorityExpectedEntryState(
  value: unknown,
): ExecutionEffectLandingAuthorityExpectedEntryStateV1 | null {
  const absent = exact(value, ['state', 'stateDigest']);
  if (absent?.state === 'ABSENT' && isDigest(absent.stateDigest)) {
    const body = Object.freeze({ state: 'ABSENT' as const });
    return digest('execution-effect-landing-expected-entry-state-v1', body) === absent.stateDigest
      ? Object.freeze({ ...body, stateDigest: absent.stateDigest }) : null;
  }
  const record = exact(value, ['state', 'entry', 'stateDigest']);
  const entry = parseAuthorityEntry(record?.entry);
  if (record === null || record.state !== 'PRESENT' || entry === null
    || !isDigest(record.stateDigest)) return null;
  const body = Object.freeze({ state: 'PRESENT' as const, entry });
  return digest('execution-effect-landing-expected-entry-state-v1', body) === record.stateDigest
    ? Object.freeze({ ...body, stateDigest: record.stateDigest }) : null;
}

function parseAuthorityPathState(
  value: unknown,
): ExecutionEffectLandingAuthorityPathStateV1 | null {
  const record = exact(value, ['path', 'entry']);
  const entry = parseAuthorityEntryState(record?.entry);
  return record !== null && safeAuthorityPath(record.path) && entry !== null
    ? Object.freeze({ path: record.path, entry }) : null;
}

function parseAuthorityExpectedPathState(
  value: unknown,
): ExecutionEffectLandingAuthorityExpectedPathStateV1 | null {
  const record = exact(value, ['path', 'entry']);
  const entry = parseAuthorityExpectedEntryState(record?.entry);
  return record !== null && safeAuthorityPath(record.path) && entry !== null
    ? Object.freeze({ path: record.path, entry }) : null;
}

function parseAuthorityParent(value: unknown): ExecutionEffectLandingAuthorityParentV1 | null {
  const prepared = exact(value, ['path', 'source', 'entry']);
  if (prepared?.source === 'PREPARED_PREIMAGE' && safeAuthorityPath(prepared.path)) {
    const entry = parseAuthorityEntryState(prepared.entry);
    return entry?.state === 'PRESENT' && entry.entry.kind === 'directory'
      ? Object.freeze({ path: prepared.path, source: 'PREPARED_PREIMAGE' as const, entry })
      : null;
  }
  const record = exact(value, [
    'path', 'source', 'operationIndex', 'operationDigest', 'expectedDirectory',
  ]);
  const directory = parseAuthorityEntry(record?.expectedDirectory);
  return record !== null && record.source === 'OPERATION_POSTIMAGE'
    && safeAuthorityPath(record.path) && Number.isSafeInteger(record.operationIndex)
    && (record.operationIndex as number) >= 0 && isDigest(record.operationDigest)
    && directory?.kind === 'directory' && directory.path === record.path
    ? Object.freeze({
      path: record.path,
      source: 'OPERATION_POSTIMAGE' as const,
      operationIndex: record.operationIndex as number,
      operationDigest: record.operationDigest,
      expectedDirectory: directory,
    }) : null;
}

function parseOrderedAuthorityArray<T>(
  value: unknown,
  parser: (entry: unknown) => T | null,
  path: (entry: T) => string,
): readonly T[] | null {
  if (!Array.isArray(value) || nodeTypes.isProxy(value)) return null;
  const parsed: T[] = [];
  for (const raw of value) {
    const entry = parser(raw);
    if (entry === null || (parsed.length > 0
      && compare(path(parsed[parsed.length - 1]!), path(entry)) >= 0)) return null;
    parsed.push(entry);
  }
  return Object.freeze(parsed);
}

export function executionEffectLandingOperationDigestV1(
  input: unknown,
): ExecutionEffectPersistenceDigest {
  const record = exact(input, [
    'version', 'index', 'kind', 'path', 'effectDigests', 'derivedParent', 'stagedSource',
    'entryPreimages', 'entryPostimages', 'parentAuthorities',
  ]);
  if (record === null || record.version !== 1 || !Number.isSafeInteger(record.index)
    || (record.index as number) < 0
    || !['ADD_DIRECTORY', 'ADD', 'REPLACE', 'DELETE', 'MODE'].includes(record.kind as string)
    || !safePath(record.path) || !Array.isArray(record.effectDigests)
    || record.effectDigests.some(value => !isDigest(value))
    || record.effectDigests.some((value, index, values) => index > 0
      && compare(values[index - 1] as string, value as string) >= 0)) {
    throw new TypeError('Invalid execution effect landing operation authority');
  }
  const source = record.stagedSource === null ? null : exact(record.stagedSource, ['stageAuthorityDigest']);
  const derivedParent = record.derivedParent === null
    ? null : parseDerivedParentProvenance(record.derivedParent);
  if (record.stagedSource !== null && (source === null || !isDigest(source.stageAuthorityDigest))) {
    throw new TypeError('Invalid execution effect landing staged authority');
  }
  if (!Array.isArray(record.entryPreimages) || nodeTypes.isProxy(record.entryPreimages)
    || !Array.isArray(record.entryPostimages) || nodeTypes.isProxy(record.entryPostimages)
    || !Array.isArray(record.parentAuthorities) || nodeTypes.isProxy(record.parentAuthorities)
    || ((record.kind === 'ADD' || record.kind === 'REPLACE') !== (source !== null))
    || (derivedParent === null
      ? record.derivedParent !== null || record.effectDigests.length === 0
      : record.kind !== 'ADD_DIRECTORY' || record.effectDigests.length !== 0
        || derivedParent.path !== record.path)) {
    throw new TypeError('Invalid execution effect landing operation state authority');
  }
  const body = Object.freeze({
    version: 1 as const,
    index: record.index as number,
    kind: record.kind as ExecutionEffectPersistenceOperationV1['kind'],
    path: record.path,
    effectDigests: Object.freeze([...(record.effectDigests as ExecutionEffectPersistenceDigest[])]),
    derivedParent,
    stagedSourceAuthorityDigest: source?.stageAuthorityDigest ?? null,
    entryPreimages: record.entryPreimages,
    entryPostimages: record.entryPostimages,
    parentAuthorities: record.parentAuthorities,
  });
  return digest('execution-effect-landing-operation-authority-v1', body);
}

function parseOperation(value: unknown, index: number): ExecutionEffectPersistenceOperationV1 | null {
  const record = exact(value, [
    'version', 'index', 'kind', 'path', 'effectDigests', 'derivedParent', 'stagedSource',
    'entryPreimages', 'entryPostimages', 'parentAuthorities', 'nativeReceiptDigest',
    'durabilityEvidenceDigest', 'operationDigest',
  ]);
  if (record === null || record.version !== 1 || record.index !== index
    || !['ADD_DIRECTORY', 'ADD', 'REPLACE', 'DELETE', 'MODE'].includes(record.kind as string)
    || !safePath(record.path) || !Array.isArray(record.effectDigests)
    || record.effectDigests.some(value => !isDigest(value))
    || new Set(record.effectDigests).size !== record.effectDigests.length
    || !isDigest(record.nativeReceiptDigest) || !isDigest(record.durabilityEvidenceDigest)
    || !isDigest(record.operationDigest)) return null;
  const stagedSource = record.stagedSource === null ? null : parseStagedSource(record.stagedSource);
  const derivedParent = record.derivedParent === null
    ? null : parseDerivedParentProvenance(record.derivedParent);
  if (record.stagedSource !== null && !stagedSource) return null;
  const requiresSource = record.kind === 'ADD' || record.kind === 'REPLACE';
  if (requiresSource !== (stagedSource !== null)
    || (derivedParent === null
      ? record.derivedParent !== null || record.effectDigests.length === 0
      : record.kind !== 'ADD_DIRECTORY' || record.effectDigests.length !== 0
        || derivedParent.path !== record.path)
    || (stagedSource !== null && stagedSource.path !== record.path)) return null;
  const entryPreimages = parseOrderedAuthorityArray(
    record.entryPreimages,
    parseAuthorityPathState,
    value => value.path,
  );
  const entryPostimages = parseOrderedAuthorityArray(
    record.entryPostimages,
    parseAuthorityExpectedPathState,
    value => value.path,
  );
  const parentAuthorities = parseOrderedAuthorityArray(
    record.parentAuthorities,
    parseAuthorityParent,
    value => value.path,
  );
  if (entryPreimages === null || entryPostimages === null || parentAuthorities === null) return null;
  const body = Object.freeze({
    version: 1 as const,
    index,
    kind: record.kind as ExecutionEffectPersistenceOperationV1['kind'],
    path: record.path,
    effectDigests: Object.freeze([...(record.effectDigests as ExecutionEffectPersistenceDigest[])]),
    derivedParent,
    stagedSource,
    entryPreimages,
    entryPostimages,
    parentAuthorities,
    nativeReceiptDigest: record.nativeReceiptDigest,
    durabilityEvidenceDigest: record.durabilityEvidenceDigest,
  });
  let operationDigest: ExecutionEffectPersistenceDigest;
  try {
    operationDigest = executionEffectLandingOperationDigestV1({
      version: body.version,
      index: body.index,
      kind: body.kind,
      path: body.path,
      effectDigests: body.effectDigests,
      derivedParent: body.derivedParent,
      stagedSource: body.stagedSource === null
        ? null : Object.freeze({ stageAuthorityDigest: body.stagedSource.stageAuthorityDigest }),
      entryPreimages: body.entryPreimages,
      entryPostimages: body.entryPostimages,
      parentAuthorities: body.parentAuthorities,
    });
  } catch {
    return null;
  }
  return operationDigest === record.operationDigest
    ? Object.freeze({ ...body, operationDigest: record.operationDigest }) : null;
}

export interface ExecutionEffectLandingTerminalSealV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-landing-terminal-seal';
  readonly phase: 'COMMITTED';
  readonly disposition: 'COMMITTED' | 'COMMITTED_NO_CHANGE';
  readonly workspaceSnapshotSealDigest: ExecutionEffectPersistenceDigest;
  readonly baselineManifestDigest: ExecutionEffectPersistenceDigest;
  readonly finalManifestDigest: ExecutionEffectPersistenceDigest;
  readonly effectDecisionDigest: ExecutionEffectPersistenceDigest;
  readonly planId: string;
  readonly operations: readonly ExecutionEffectPersistenceOperationV1[];
  readonly planDigest: ExecutionEffectPersistenceDigest;
  readonly transactionDigest: ExecutionEffectPersistenceDigest;
  readonly preparedJournalDigest: ExecutionEffectPersistenceDigest;
  readonly applyingJournalDigest: ExecutionEffectPersistenceDigest | null;
  readonly stepJournalDigests: readonly ExecutionEffectPersistenceDigest[];
  readonly committedJournalDigest: ExecutionEffectPersistenceDigest;
  readonly finalVerificationReceiptDigest: ExecutionEffectPersistenceDigest | null;
  readonly journalArtifacts: ExecutionEffectLandingJournalArtifactRefsV1;
  readonly receiptArtifacts: ExecutionEffectLandingReceiptArtifactRefsV1;
  readonly leaseTerminal: 'COMPLETED' | 'RELEASED_NO_CHANGE';
  readonly leaseTerminalReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly committedAt: string;
  readonly sealDigest: ExecutionEffectPersistenceDigest;
}

export interface ExecutionEffectLandingJournalArtifactRefV1 {
  readonly artifactKey: string;
  readonly artifactReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly contentDigest: ExecutionEffectPersistenceDigest;
  readonly byteLength: number;
}

export interface ExecutionEffectLandingJournalArtifactRefsV1 {
  readonly prepared: ExecutionEffectLandingJournalArtifactRefV1;
  readonly applying: ExecutionEffectLandingJournalArtifactRefV1 | null;
  readonly steps: readonly ExecutionEffectLandingJournalArtifactRefV1[];
  readonly committed: ExecutionEffectLandingJournalArtifactRefV1;
}

export interface ExecutionEffectLandingReceiptArtifactRefsV1 {
  readonly nativeReceipts: readonly ExecutionEffectLandingJournalArtifactRefV1[];
  readonly finalVerificationReceipt: ExecutionEffectLandingJournalArtifactRefV1 | null;
  readonly leaseTerminalReceipt: ExecutionEffectLandingJournalArtifactRefV1;
}

export interface ExecutionEffectLandingJournalArtifactV1
  extends ExecutionEffectLandingJournalArtifactRefV1 {
  readonly bytes: Uint8Array;
}

function parseJournalArtifactRef(
  value: unknown,
): ExecutionEffectLandingJournalArtifactRefV1 | null {
  const record = exact(value, [
    'artifactKey', 'artifactReceiptDigest', 'contentDigest', 'byteLength',
  ]);
  if (record === null || !isSafeKey(record.artifactKey)
    || !isDigest(record.artifactReceiptDigest) || !isDigest(record.contentDigest)
    || !Number.isSafeInteger(record.byteLength) || (record.byteLength as number) <= 0) return null;
  return Object.freeze({
    artifactKey: record.artifactKey,
    artifactReceiptDigest: record.artifactReceiptDigest,
    contentDigest: record.contentDigest,
    byteLength: record.byteLength as number,
  });
}

function parseJournalArtifactRefs(
  value: unknown,
): ExecutionEffectLandingJournalArtifactRefsV1 | null {
  const record = exact(value, ['prepared', 'applying', 'steps', 'committed']);
  const prepared = parseJournalArtifactRef(record?.prepared);
  const applying = record?.applying === null ? null : parseJournalArtifactRef(record?.applying);
  const committed = parseJournalArtifactRef(record?.committed);
  if (record === null || prepared === null || committed === null
    || (record.applying !== null && applying === null) || !Array.isArray(record.steps)) return null;
  const steps = record.steps.map(parseJournalArtifactRef);
  if (steps.some(item => item === null)) return null;
  const exactSteps = steps as ExecutionEffectLandingJournalArtifactRefV1[];
  const all = [prepared, ...(applying ? [applying] : []), ...exactSteps, committed];
  const keys = new Set<string>();
  const receipts = new Set<string>();
  for (const item of all) {
    if (keys.has(item.artifactKey) || receipts.has(item.artifactReceiptDigest)) return null;
    keys.add(item.artifactKey);
    receipts.add(item.artifactReceiptDigest);
  }
  return Object.freeze({
    prepared,
    applying,
    steps: Object.freeze(exactSteps),
    committed,
  });
}

function parseReceiptArtifactRefs(
  value: unknown,
): ExecutionEffectLandingReceiptArtifactRefsV1 | null {
  const record = exact(value, [
    'nativeReceipts', 'finalVerificationReceipt', 'leaseTerminalReceipt',
  ]);
  if (record === null || !Array.isArray(record.nativeReceipts)) return null;
  const nativeReceipts = record.nativeReceipts.map(parseJournalArtifactRef);
  const finalVerificationReceipt = record.finalVerificationReceipt === null
    ? null : parseJournalArtifactRef(record.finalVerificationReceipt);
  const leaseTerminalReceipt = parseJournalArtifactRef(record.leaseTerminalReceipt);
  if (nativeReceipts.some(item => item === null)
    || (record.finalVerificationReceipt !== null && finalVerificationReceipt === null)
    || leaseTerminalReceipt === null) return null;
  const concreteNative = nativeReceipts as ExecutionEffectLandingJournalArtifactRefV1[];
  const refs = [
    ...concreteNative,
    ...(finalVerificationReceipt ? [finalVerificationReceipt] : []),
    leaseTerminalReceipt,
  ];
  const keys = new Set<string>();
  const receipts = new Set<string>();
  for (const ref of refs) {
    if (keys.has(ref.artifactKey) || receipts.has(ref.artifactReceiptDigest)) return null;
    keys.add(ref.artifactKey);
    receipts.add(ref.artifactReceiptDigest);
  }
  return Object.freeze({
    nativeReceipts: Object.freeze(concreteNative),
    finalVerificationReceipt,
    leaseTerminalReceipt,
  });
}

export interface CreateExecutionEffectLandingTerminalSealV1Input extends Omit<
  ExecutionEffectLandingTerminalSealV1,
  'version' | 'kind' | 'phase' | 'planDigest' | 'transactionDigest' | 'sealDigest'
> {
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly attemptDigest: ExecutionEffectPersistenceDigest;
}

export interface ExecutionEffectLandingTransactionRefV1 {
  readonly version: 1;
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly generation: number;
  readonly attemptDigest: ExecutionEffectPersistenceDigest;
  readonly baselineManifestDigest: ExecutionEffectPersistenceDigest;
  readonly finalManifestDigest: ExecutionEffectPersistenceDigest;
  readonly containmentDecisionDigest: ExecutionEffectPersistenceDigest;
  readonly planId: string;
  readonly planDigest: ExecutionEffectPersistenceDigest;
  readonly transactionDigest: ExecutionEffectPersistenceDigest;
}

function transactionBody(input: Readonly<{
  attempt: ExecutionEffectAttemptIdentity;
  attemptDigest: ExecutionEffectPersistenceDigest;
  baselineManifestDigest: ExecutionEffectPersistenceDigest;
  finalManifestDigest: ExecutionEffectPersistenceDigest;
  effectDecisionDigest: ExecutionEffectPersistenceDigest;
  planId: string;
  planDigest: ExecutionEffectPersistenceDigest;
}>): object {
  return Object.freeze({
    version: 1,
    projectId: input.attempt.projectId,
    taskId: input.attempt.taskId,
    attemptId: input.attempt.attemptId,
    generation: input.attempt.generation,
    attemptDigest: input.attemptDigest,
    baselineManifestDigest: input.baselineManifestDigest,
    finalManifestDigest: input.finalManifestDigest,
    containmentDecisionDigest: input.effectDecisionDigest,
    planId: input.planId,
    planDigest: input.planDigest,
  });
}

export function parseExecutionEffectLandingTransactionRefV1(
  value: unknown,
): ExecutionEffectLandingTransactionRefV1 | null {
  const record = exact(value, [
    'version', 'projectId', 'taskId', 'attemptId', 'generation', 'attemptDigest',
    'baselineManifestDigest', 'finalManifestDigest', 'containmentDecisionDigest',
    'planId', 'planDigest', 'transactionDigest',
  ]);
  const attempt = parseAttempt(record === null ? null : {
    projectId: record.projectId,
    taskId: record.taskId,
    attemptId: record.attemptId,
    generation: record.generation,
  });
  if (record === null || attempt === null || record.version !== 1
    || !isDigest(record.attemptDigest) || !isDigest(record.baselineManifestDigest)
    || !isDigest(record.finalManifestDigest) || !isDigest(record.containmentDecisionDigest)
    || !isSafeIdentifier(record.planId) || !isDigest(record.planDigest)
    || !isDigest(record.transactionDigest)) return null;
  const body = transactionBody({
    attempt,
    attemptDigest: record.attemptDigest,
    baselineManifestDigest: record.baselineManifestDigest,
    finalManifestDigest: record.finalManifestDigest,
    effectDecisionDigest: record.containmentDecisionDigest,
    planId: record.planId,
    planDigest: record.planDigest,
  });
  if (digest('execution-effect-landing-transaction-v1', body) !== record.transactionDigest) {
    return null;
  }
  return Object.freeze({
    version: 1,
    projectId: attempt.projectId,
    taskId: attempt.taskId,
    attemptId: attempt.attemptId,
    generation: attempt.generation,
    attemptDigest: record.attemptDigest,
    baselineManifestDigest: record.baselineManifestDigest,
    finalManifestDigest: record.finalManifestDigest,
    containmentDecisionDigest: record.containmentDecisionDigest,
    planId: record.planId,
    planDigest: record.planDigest,
    transactionDigest: record.transactionDigest,
  });
}

export interface ExecutionEffectLandingReceiptV1 {
  readonly version: 1;
  readonly state: 'COMMITTED' | 'COMMITTED_NO_CHANGE';
  readonly transaction: ExecutionEffectLandingTransactionRefV1;
  readonly committedJournalDigest: ExecutionEffectPersistenceDigest;
  readonly leaseTerminalReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly operationReceiptDigests: readonly ExecutionEffectPersistenceDigest[];
  readonly finalVerificationReceiptDigest: ExecutionEffectPersistenceDigest | null;
  readonly receiptDigest: ExecutionEffectPersistenceDigest;
}

export interface ExecutionEffectLandingLeaseCapabilityV1 {
  readonly version: 1;
  readonly state: 'READY';
  readonly adapterId: string;
  readonly projectRootIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly capabilityDigest: ExecutionEffectPersistenceDigest;
}

export interface ExecutionEffectLandingLeaseV1 {
  readonly transactionDigest: string;
  readonly fencingTokenDigest: string;
  readonly leaseReceiptDigest: string;
}

export interface ExecutionEffectLandingBoundaryV1 {
  readonly transactionDigest: string;
  readonly fencingTokenDigest: string;
  readonly boundaryId: string;
  readonly boundaryReceiptDigest: string;
}

export interface ExecutionEffectLandingLeaseTerminalV1 {
  readonly transactionDigest: string;
  readonly terminal: 'COMPLETED' | 'RELEASED_NO_CHANGE';
  readonly committedJournalDigest: string;
  readonly terminalReceiptDigest: string;
}

export interface ExecutionEffectLandingLeaseJournalRefV1 {
  readonly phase: 'PREPARED' | 'APPLYING' | 'COMMITTED';
  readonly artifactKey: string;
  readonly artifactReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly contentDigest: ExecutionEffectPersistenceDigest;
  readonly byteLength: number;
  readonly recordDigest: ExecutionEffectPersistenceDigest;
}

export interface ExecutionEffectLandingLeaseResumeContextV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-landing-lease-resume-context';
  readonly transaction: ExecutionEffectLandingTransactionRefV1;
  /** Immutable lease snapshot published inside PREPARED before the first effect. */
  readonly priorLease: ExecutionEffectLandingLeaseV1;
  readonly prepared: ExecutionEffectLandingLeaseJournalRefV1;
  readonly applying: Readonly<{
    readonly journal: ExecutionEffectLandingLeaseJournalRefV1;
    /** Immutable boundary from the original APPLYING journal. Never rewritten on adoption. */
    readonly previousBoundary: ExecutionEffectLandingBoundaryV1;
  }> | null;
  readonly committed: Readonly<{
    readonly journal: ExecutionEffectLandingLeaseJournalRefV1;
    readonly disposition: 'COMMITTED' | 'COMMITTED_NO_CHANGE';
  }> | null;
  readonly contextDigest: ExecutionEffectPersistenceDigest;
}

export interface ExecutionEffectLandingLeaseResumeReceiptV1 {
  readonly version: 1;
  readonly state: 'ADOPTED';
  readonly contextDigest: ExecutionEffectPersistenceDigest;
  readonly transactionDigest: ExecutionEffectPersistenceDigest;
  readonly priorLeaseReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly adoptedLease: ExecutionEffectLandingLeaseV1;
  readonly currentBoundary: ExecutionEffectLandingBoundaryV1 | null;
  /** Durable lock/audit evidence only; bounded so recovery cannot exceed lock limits. */
  readonly durableEvidenceDigests: readonly ExecutionEffectPersistenceDigest[];
  readonly resumedAt: string;
  readonly receiptDigest: ExecutionEffectPersistenceDigest;
}

export interface ExecutionEffectLandingLeaseResumeResultV1 {
  readonly version: 1;
  readonly state: 'ADOPTED';
  readonly lease: ExecutionEffectLandingLeaseV1;
  /** Fresh boundary for an in-flight changed transaction; null before APPLYING/no-change. */
  readonly currentBoundary: ExecutionEffectLandingBoundaryV1 | null;
  readonly resumeReceipt: ExecutionEffectLandingLeaseResumeReceiptV1;
}

function parseLease(
  value: unknown,
  transactionDigest?: ExecutionEffectPersistenceDigest,
): ExecutionEffectLandingLeaseV1 | null {
  const record = exact(value, [
    'transactionDigest', 'fencingTokenDigest', 'leaseReceiptDigest',
  ]);
  if (record === null || !isDigest(record.transactionDigest)
    || (transactionDigest !== undefined && record.transactionDigest !== transactionDigest)
    || !isDigest(record.fencingTokenDigest) || !isDigest(record.leaseReceiptDigest)) return null;
  return Object.freeze({
    transactionDigest: record.transactionDigest,
    fencingTokenDigest: record.fencingTokenDigest,
    leaseReceiptDigest: record.leaseReceiptDigest,
  });
}

function parseBoundary(
  value: unknown,
  transactionDigest: ExecutionEffectPersistenceDigest,
  fencingTokenDigest?: ExecutionEffectPersistenceDigest,
): ExecutionEffectLandingBoundaryV1 | null {
  const record = exact(value, [
    'transactionDigest', 'fencingTokenDigest', 'boundaryId', 'boundaryReceiptDigest',
  ]);
  if (record === null || record.transactionDigest !== transactionDigest
    || !isDigest(record.fencingTokenDigest)
    || (fencingTokenDigest !== undefined && record.fencingTokenDigest !== fencingTokenDigest)
    || !isSafeIdentifier(record.boundaryId) || !isDigest(record.boundaryReceiptDigest)) return null;
  return Object.freeze({
    transactionDigest: record.transactionDigest,
    fencingTokenDigest: record.fencingTokenDigest,
    boundaryId: record.boundaryId,
    boundaryReceiptDigest: record.boundaryReceiptDigest,
  });
}

function expectedLeaseJournalKey(
  transactionDigest: ExecutionEffectPersistenceDigest,
  phase: ExecutionEffectLandingLeaseJournalRefV1['phase'],
): string {
  return `effect-landing/${transactionDigest.slice(7)}/${phase.toLowerCase()}.json`;
}

function parseLeaseJournalRef(
  value: unknown,
  transactionDigest: ExecutionEffectPersistenceDigest,
  phase: ExecutionEffectLandingLeaseJournalRefV1['phase'],
): ExecutionEffectLandingLeaseJournalRefV1 | null {
  const record = exact(value, [
    'phase', 'artifactKey', 'artifactReceiptDigest', 'contentDigest', 'byteLength',
    'recordDigest',
  ]);
  if (record === null || record.phase !== phase
    || record.artifactKey !== expectedLeaseJournalKey(transactionDigest, phase)
    || !isDigest(record.artifactReceiptDigest) || !isDigest(record.contentDigest)
    || !Number.isSafeInteger(record.byteLength) || (record.byteLength as number) <= 0
    || (record.byteLength as number) > 1_073_741_824 || !isDigest(record.recordDigest)) return null;
  return Object.freeze({
    phase,
    artifactKey: record.artifactKey,
    artifactReceiptDigest: record.artifactReceiptDigest,
    contentDigest: record.contentDigest,
    byteLength: record.byteLength as number,
    recordDigest: record.recordDigest,
  });
}

export function createExecutionEffectLandingLeaseResumeContextV1(input: Readonly<{
  readonly transaction: ExecutionEffectLandingTransactionRefV1;
  readonly priorLease: ExecutionEffectLandingLeaseV1;
  readonly prepared: ExecutionEffectLandingLeaseJournalRefV1;
  readonly applying: ExecutionEffectLandingLeaseResumeContextV1['applying'];
  readonly committed: ExecutionEffectLandingLeaseResumeContextV1['committed'];
}>): ExecutionEffectLandingLeaseResumeContextV1 {
  const inputRecord = exact(input, [
    'transaction', 'priorLease', 'prepared', 'applying', 'committed',
  ]);
  const transaction = parseExecutionEffectLandingTransactionRefV1(inputRecord?.transaction);
  if (inputRecord === null || transaction === null) {
    throw new TypeError('Invalid execution effect lease resume context');
  }
  const priorLease = parseLease(inputRecord.priorLease, transaction.transactionDigest);
  const prepared = parseLeaseJournalRef(
    inputRecord.prepared,
    transaction.transactionDigest,
    'PREPARED',
  );
  const applyingRecord = inputRecord.applying === null
    ? null : exact(inputRecord.applying, ['journal', 'previousBoundary']);
  const applyingJournal = applyingRecord === null
    ? null : parseLeaseJournalRef(
      applyingRecord.journal,
      transaction.transactionDigest,
      'APPLYING',
    );
  const previousBoundary = applyingRecord === null || priorLease === null
    ? null : parseBoundary(
      applyingRecord.previousBoundary,
      transaction.transactionDigest,
      priorLease.fencingTokenDigest as ExecutionEffectPersistenceDigest,
    );
  const committedRecord = inputRecord.committed === null
    ? null : exact(inputRecord.committed, ['journal', 'disposition']);
  const committedJournal = committedRecord === null
    ? null : parseLeaseJournalRef(
      committedRecord.journal,
      transaction.transactionDigest,
      'COMMITTED',
    );
  if (priorLease === null || prepared === null
    || (inputRecord.applying !== null && (applyingRecord === null
      || applyingJournal === null || previousBoundary === null))
    || (inputRecord.committed !== null && (committedRecord === null
      || committedJournal === null
      || (committedRecord.disposition !== 'COMMITTED'
        && committedRecord.disposition !== 'COMMITTED_NO_CHANGE')))
    || (committedRecord !== null
      && (committedRecord.disposition === 'COMMITTED') !== (applyingRecord !== null))
    || (committedRecord?.disposition === 'COMMITTED_NO_CHANGE' && applyingRecord !== null)) {
    throw new TypeError('Invalid execution effect lease resume context');
  }
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-landing-lease-resume-context' as const,
    transaction,
    priorLease,
    prepared,
    applying: applyingJournal && previousBoundary
      ? Object.freeze({ journal: applyingJournal, previousBoundary }) : null,
    committed: committedJournal && committedRecord
      ? Object.freeze({
        journal: committedJournal,
        disposition: committedRecord.disposition as 'COMMITTED' | 'COMMITTED_NO_CHANGE',
      }) : null,
  });
  return Object.freeze({
    ...body,
    contextDigest: digest('execution-effect-landing-lease-resume-context-v1', body),
  });
}

export function parseExecutionEffectLandingLeaseResumeContextV1(
  value: unknown,
): ExecutionEffectLandingLeaseResumeContextV1 | null {
  const record = exact(value, [
    'version', 'kind', 'transaction', 'priorLease', 'prepared', 'applying', 'committed',
    'contextDigest',
  ]);
  if (record === null || record.version !== 1
    || record.kind !== 'execution-effect-landing-lease-resume-context'
    || !isDigest(record.contextDigest)) return null;
  try {
    const recreated = createExecutionEffectLandingLeaseResumeContextV1({
      transaction: record.transaction as ExecutionEffectLandingTransactionRefV1,
      priorLease: record.priorLease as ExecutionEffectLandingLeaseV1,
      prepared: record.prepared as ExecutionEffectLandingLeaseJournalRefV1,
      applying: record.applying as ExecutionEffectLandingLeaseResumeContextV1['applying'],
      committed: record.committed as ExecutionEffectLandingLeaseResumeContextV1['committed'],
    });
    return recreated.contextDigest === record.contextDigest ? recreated : null;
  } catch {
    return null;
  }
}

export function createExecutionEffectLandingLeaseResumeResultV1(input: Readonly<{
  readonly context: ExecutionEffectLandingLeaseResumeContextV1;
  readonly lease: ExecutionEffectLandingLeaseV1;
  readonly currentBoundary: ExecutionEffectLandingBoundaryV1 | null;
  readonly durableEvidenceDigests: readonly ExecutionEffectPersistenceDigest[];
  readonly resumedAt: string;
}>): ExecutionEffectLandingLeaseResumeResultV1 {
  const inputRecord = exact(input, [
    'context', 'lease', 'currentBoundary', 'durableEvidenceDigests', 'resumedAt',
  ]);
  const context = parseExecutionEffectLandingLeaseResumeContextV1(inputRecord?.context);
  if (inputRecord === null || context === null) {
    throw new TypeError('Invalid execution effect lease resume result');
  }
  const lease = parseLease(inputRecord.lease, context.transaction.transactionDigest);
  const currentBoundary = inputRecord.currentBoundary === null || lease === null
    ? null : parseBoundary(
      inputRecord.currentBoundary,
      context.transaction.transactionDigest,
      lease.fencingTokenDigest as ExecutionEffectPersistenceDigest,
    );
  const evidence = inputRecord.durableEvidenceDigests;
  if (lease === null
    || (inputRecord.currentBoundary !== null && currentBoundary === null)
    || (context.applying !== null) !== (currentBoundary !== null)
    || !Array.isArray(evidence) || nodeTypes.isProxy(evidence)
    || evidence.length === 0 || evidence.length > 8
    || evidence.some(value => !isDigest(value))
    || new Set(evidence).size !== evidence.length || !isTimestamp(inputRecord.resumedAt)) {
    throw new TypeError('Invalid execution effect lease resume result');
  }
  const receiptBody = Object.freeze({
    version: 1 as const,
    state: 'ADOPTED' as const,
    contextDigest: context.contextDigest,
    transactionDigest: context.transaction.transactionDigest,
    priorLeaseReceiptDigest: context.priorLease.leaseReceiptDigest as ExecutionEffectPersistenceDigest,
    adoptedLease: lease,
    currentBoundary,
    durableEvidenceDigests: Object.freeze([...(evidence as ExecutionEffectPersistenceDigest[])]),
    resumedAt: inputRecord.resumedAt as string,
  });
  const resumeReceipt = Object.freeze({
    ...receiptBody,
    receiptDigest: digest('execution-effect-landing-lease-resume-receipt-v1', receiptBody),
  });
  return Object.freeze({
    version: 1 as const,
    state: 'ADOPTED' as const,
    lease,
    currentBoundary,
    resumeReceipt,
  });
}

export function parseExecutionEffectLandingLeaseResumeResultV1(
  value: unknown,
  context: ExecutionEffectLandingLeaseResumeContextV1,
): ExecutionEffectLandingLeaseResumeResultV1 | null {
  const parsedContext = parseExecutionEffectLandingLeaseResumeContextV1(context);
  const record = exact(value, ['version', 'state', 'lease', 'currentBoundary', 'resumeReceipt']);
  const receipt = exact(record?.resumeReceipt, [
    'version', 'state', 'contextDigest', 'transactionDigest', 'priorLeaseReceiptDigest',
    'adoptedLease', 'currentBoundary', 'durableEvidenceDigests', 'resumedAt', 'receiptDigest',
  ]);
  if (parsedContext === null || record === null || record.version !== 1
    || record.state !== 'ADOPTED' || receipt === null || receipt.version !== 1
    || receipt.state !== 'ADOPTED' || receipt.contextDigest !== parsedContext.contextDigest
    || !isDigest(receipt.receiptDigest)) return null;
  try {
    const recreated = createExecutionEffectLandingLeaseResumeResultV1({
      context: parsedContext,
      lease: record.lease as ExecutionEffectLandingLeaseV1,
      currentBoundary: record.currentBoundary as ExecutionEffectLandingBoundaryV1 | null,
      durableEvidenceDigests:
        receipt.durableEvidenceDigests as readonly ExecutionEffectPersistenceDigest[],
      resumedAt: receipt.resumedAt as string,
    });
    return sameCanonicalJson(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export interface ExecutionEffectLandingLeaseAdapterV1 {
  readonly capability: ExecutionEffectLandingLeaseCapabilityV1;
  acquire(transactionDigest: string): ExecutionEffectLandingLeaseV1;
  resume(
    context: ExecutionEffectLandingLeaseResumeContextV1,
  ): ExecutionEffectLandingLeaseResumeResultV1;
  assert(lease: ExecutionEffectLandingLeaseV1): void;
  renew(lease: ExecutionEffectLandingLeaseV1): ExecutionEffectLandingLeaseV1;
  beginBoundary(
    lease: ExecutionEffectLandingLeaseV1,
    preparedJournalDigest: string,
  ): ExecutionEffectLandingBoundaryV1;
  quarantine(
    lease: ExecutionEffectLandingLeaseV1,
    boundary: ExecutionEffectLandingBoundaryV1 | null,
    evidenceDigests: readonly string[],
  ): string;
  completeBoundary(
    lease: ExecutionEffectLandingLeaseV1,
    boundary: ExecutionEffectLandingBoundaryV1,
    committedJournalDigest: string,
  ): ExecutionEffectLandingLeaseTerminalV1;
  releaseNoChange(
    lease: ExecutionEffectLandingLeaseV1,
    committedJournalDigest: string,
  ): ExecutionEffectLandingLeaseTerminalV1;
  readTerminal(
    transactionDigest: string,
    committedJournalDigest: string,
  ): ExecutionEffectLandingLeaseTerminalV1 | null;
}

export function createExecutionEffectLandingLeaseCapabilityV1(input: Readonly<{
  readonly adapterId: string;
  readonly projectRootIdentityDigest: ExecutionEffectPersistenceDigest;
}>): ExecutionEffectLandingLeaseCapabilityV1 {
  const record = exact(input, ['adapterId', 'projectRootIdentityDigest']);
  if (record === null || typeof record.adapterId !== 'string'
    || record.adapterId.length === 0 || record.adapterId.length > 256
    || !/^[A-Za-z0-9._:-]+$/u.test(record.adapterId)
    || !isDigest(record.projectRootIdentityDigest)) {
    throw new TypeError('Invalid execution effect lease capability');
  }
  const body = Object.freeze({
    version: 1 as const,
    state: 'READY' as const,
    adapterId: record.adapterId,
    projectRootIdentityDigest: record.projectRootIdentityDigest,
  });
  return Object.freeze({
    ...body,
    capabilityDigest: digest('execution-effect-landing-lease-capability-v1', body),
  });
}

export function createExecutionEffectLandingReceiptV1(input: Omit<
  ExecutionEffectLandingReceiptV1,
  'version' | 'receiptDigest'
>): ExecutionEffectLandingReceiptV1 {
  const transaction = parseExecutionEffectLandingTransactionRefV1(input.transaction);
  if (!transaction || (input.state !== 'COMMITTED' && input.state !== 'COMMITTED_NO_CHANGE')
    || !isDigest(input.committedJournalDigest) || !isDigest(input.leaseTerminalReceiptDigest)
    || !Array.isArray(input.operationReceiptDigests)
    || input.operationReceiptDigests.some(value => !isDigest(value))
    || (input.finalVerificationReceiptDigest !== null
      && !isDigest(input.finalVerificationReceiptDigest))
    || (input.state === 'COMMITTED_NO_CHANGE') !== (input.operationReceiptDigests.length === 0)
    || (input.state === 'COMMITTED_NO_CHANGE')
      !== (input.finalVerificationReceiptDigest === null)) {
    throw new TypeError('Invalid execution effect landing receipt');
  }
  const body = Object.freeze({
    version: 1 as const,
    state: input.state,
    transaction,
    committedJournalDigest: input.committedJournalDigest,
    leaseTerminalReceiptDigest: input.leaseTerminalReceiptDigest,
    operationReceiptDigests: Object.freeze([...input.operationReceiptDigests]),
    finalVerificationReceiptDigest: input.finalVerificationReceiptDigest,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest('execution-effect-landing-receipt-v1', body),
  });
}

export function parseExecutionEffectLandingReceiptV1(
  value: unknown,
): ExecutionEffectLandingReceiptV1 | null {
  const record = exact(value, [
    'version', 'state', 'transaction', 'committedJournalDigest',
    'leaseTerminalReceiptDigest', 'operationReceiptDigests',
    'finalVerificationReceiptDigest', 'receiptDigest',
  ]);
  if (record === null || !isDigest(record.receiptDigest)) return null;
  try {
    const created = createExecutionEffectLandingReceiptV1({
      state: record.state as ExecutionEffectLandingReceiptV1['state'],
      transaction: record.transaction as ExecutionEffectLandingTransactionRefV1,
      committedJournalDigest: record.committedJournalDigest as ExecutionEffectPersistenceDigest,
      leaseTerminalReceiptDigest: record.leaseTerminalReceiptDigest as ExecutionEffectPersistenceDigest,
      operationReceiptDigests: record.operationReceiptDigests as ExecutionEffectPersistenceDigest[],
      finalVerificationReceiptDigest:
        record.finalVerificationReceiptDigest as ExecutionEffectPersistenceDigest | null,
    });
    return created.receiptDigest === record.receiptDigest ? created : null;
  } catch {
    return null;
  }
}

export function createExecutionEffectPersistenceOperationV1(input: Omit<
  ExecutionEffectPersistenceOperationV1,
  'version' | 'operationDigest'
>): ExecutionEffectPersistenceOperationV1 {
  const authorityInput = {
    version: 1 as const,
    index: input.index,
    kind: input.kind,
    path: input.path,
    effectDigests: input.effectDigests,
    derivedParent: input.derivedParent,
    stagedSource: input.stagedSource === null
      ? null : Object.freeze({ stageAuthorityDigest: input.stagedSource.stageAuthorityDigest }),
    entryPreimages: input.entryPreimages,
    entryPostimages: input.entryPostimages,
    parentAuthorities: input.parentAuthorities,
  };
  const candidate = {
    version: 1 as const,
    ...input,
    operationDigest: executionEffectLandingOperationDigestV1(authorityInput),
  };
  const parsed = parseOperation(candidate, input.index);
  if (!parsed) throw new TypeError('Invalid execution effect persistence operation');
  return parsed;
}

export function createExecutionEffectLandingTerminalSealV1(
  input: CreateExecutionEffectLandingTerminalSealV1Input,
): ExecutionEffectLandingTerminalSealV1 {
  const planDigest = digest('execution-effect-landing-plan-v1', input.operations.map(value => value.operationDigest));
  const transactionDigest = digest('execution-effect-landing-transaction-v1', transactionBody({
    ...input,
    planDigest,
  }));
  const candidate = {
    version: 1,
    kind: 'execution-effect-landing-terminal-seal',
    phase: 'COMMITTED',
    ...input,
    planDigest,
    transactionDigest,
  };
  const { attempt: _attempt, attemptDigest: _attemptDigest, ...body } = candidate;
  const sealDigest = digest('execution-effect-landing-terminal-seal-v1', body);
  const parsed = parseExecutionEffectLandingTerminalSealV1({ ...body, sealDigest }, {
    attempt: input.attempt,
    attemptDigest: input.attemptDigest,
  });
  if (!parsed) throw new TypeError('Invalid execution effect terminal seal');
  return parsed;
}

export function parseExecutionEffectLandingTerminalSealV1(
  value: unknown,
  expected: Readonly<{ attempt: ExecutionEffectAttemptIdentity; attemptDigest: ExecutionEffectPersistenceDigest }>,
): ExecutionEffectLandingTerminalSealV1 | null {
  const record = exact(value, [
    'version', 'kind', 'phase', 'disposition', 'workspaceSnapshotSealDigest',
    'baselineManifestDigest', 'finalManifestDigest', 'effectDecisionDigest', 'planId',
    'operations', 'planDigest', 'transactionDigest', 'preparedJournalDigest',
    'applyingJournalDigest', 'stepJournalDigests', 'committedJournalDigest',
    'finalVerificationReceiptDigest', 'journalArtifacts', 'receiptArtifacts',
    'leaseTerminal', 'leaseTerminalReceiptDigest',
    'committedAt', 'sealDigest',
  ]);
  const journalArtifacts = parseJournalArtifactRefs(record?.journalArtifacts);
  const receiptArtifacts = parseReceiptArtifactRefs(record?.receiptArtifacts);
  if (record === null || journalArtifacts === null || receiptArtifacts === null || record.version !== 1
    || record.kind !== 'execution-effect-landing-terminal-seal' || record.phase !== 'COMMITTED'
    || (record.disposition !== 'COMMITTED' && record.disposition !== 'COMMITTED_NO_CHANGE')
    || !isDigest(record.workspaceSnapshotSealDigest) || !isDigest(record.baselineManifestDigest)
    || !isDigest(record.finalManifestDigest) || !isDigest(record.effectDecisionDigest)
    || !isSafeIdentifier(record.planId) || !Array.isArray(record.operations)
    || !isDigest(record.planDigest) || !isDigest(record.transactionDigest)
    || !isDigest(record.preparedJournalDigest)
    || (record.applyingJournalDigest !== null && !isDigest(record.applyingJournalDigest))
    || !Array.isArray(record.stepJournalDigests)
    || record.stepJournalDigests.some(value => !isDigest(value))
    || new Set(record.stepJournalDigests).size !== record.stepJournalDigests.length
    || !isDigest(record.committedJournalDigest)
    || (record.finalVerificationReceiptDigest !== null
      && !isDigest(record.finalVerificationReceiptDigest))
    || (record.leaseTerminal !== 'COMPLETED' && record.leaseTerminal !== 'RELEASED_NO_CHANGE')
    || !isDigest(record.leaseTerminalReceiptDigest) || !isTimestamp(record.committedAt)
    || !isDigest(record.sealDigest)) return null;
  const operations: ExecutionEffectPersistenceOperationV1[] = [];
  for (let index = 0; index < record.operations.length; index += 1) {
    const operation = parseOperation(record.operations[index], index);
    if (!operation) return null;
    operations.push(operation);
  }
  const planDigest = digest('execution-effect-landing-plan-v1', operations.map(item => item.operationDigest));
  const transactionDigest = digest('execution-effect-landing-transaction-v1', transactionBody({
    attempt: expected.attempt,
    attemptDigest: expected.attemptDigest,
    baselineManifestDigest: record.baselineManifestDigest,
    finalManifestDigest: record.finalManifestDigest,
    effectDecisionDigest: record.effectDecisionDigest,
    planId: record.planId,
    planDigest,
  }));
  if (record.planDigest !== planDigest || record.transactionDigest !== transactionDigest) return null;
  const noChange = operations.length === 0;
  if (noChange !== (record.disposition === 'COMMITTED_NO_CHANGE')
    || noChange !== (record.applyingJournalDigest === null)
    || noChange !== (record.stepJournalDigests.length === 0)
    || noChange !== (record.finalVerificationReceiptDigest === null)
    || (noChange ? record.leaseTerminal !== 'RELEASED_NO_CHANGE' : record.leaseTerminal !== 'COMPLETED')
    || (!noChange && record.stepJournalDigests.length !== operations.length)) return null;
  if ((journalArtifacts.applying === null) !== noChange
    || (journalArtifacts.steps.length === 0) !== noChange
    || journalArtifacts.steps.length !== operations.length
    || receiptArtifacts.nativeReceipts.length !== operations.length
    || (receiptArtifacts.finalVerificationReceipt === null) !== noChange) return null;
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-landing-terminal-seal' as const,
    phase: 'COMMITTED' as const,
    disposition: record.disposition,
    workspaceSnapshotSealDigest: record.workspaceSnapshotSealDigest,
    baselineManifestDigest: record.baselineManifestDigest,
    finalManifestDigest: record.finalManifestDigest,
    effectDecisionDigest: record.effectDecisionDigest,
    planId: record.planId,
    operations: Object.freeze(operations),
    planDigest,
    transactionDigest,
    preparedJournalDigest: record.preparedJournalDigest,
    applyingJournalDigest: record.applyingJournalDigest as ExecutionEffectPersistenceDigest | null,
    stepJournalDigests: Object.freeze([...(record.stepJournalDigests as ExecutionEffectPersistenceDigest[])]),
    committedJournalDigest: record.committedJournalDigest,
    finalVerificationReceiptDigest: record.finalVerificationReceiptDigest as ExecutionEffectPersistenceDigest | null,
    journalArtifacts,
    receiptArtifacts,
    leaseTerminal: record.leaseTerminal,
    leaseTerminalReceiptDigest: record.leaseTerminalReceiptDigest,
    committedAt: record.committedAt,
  });
  return digest('execution-effect-landing-terminal-seal-v1', body) === record.sealDigest
    ? Object.freeze({ ...body, sealDigest: record.sealDigest }) : null;
}

export interface ExecutionEffectPersistenceArtifactV1 {
  readonly artifactKey: string;
  readonly artifactReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly bytes: Uint8Array;
}

export interface VerifiedExecutionEffectPersistenceBundleV1 {
  readonly workspace: ExecutionEffectWorkspaceSnapshotSealV1;
  readonly baseline: ExecutionEffectManifest;
  readonly final: ExecutionEffectManifest;
  readonly terminal: ExecutionEffectLandingTerminalSealV1;
  readonly decision: Extract<ReturnType<typeof evaluateExecutionEffectContainment>, { state: 'VERIFIED' }>;
  readonly decisionDigest: ExecutionEffectPersistenceDigest;
  readonly stagedArtifactRefs: readonly Readonly<{
    artifactKey: string;
    artifactReceiptDigest: ExecutionEffectPersistenceDigest;
  }>[];
}

export interface ExecutionEffectResultProjectionV1 {
  readonly version: 1;
  readonly disposition: 'COMMITTED' | 'COMMITTED_NO_CHANGE';
  readonly effectDecisionDigest: ExecutionEffectPersistenceDigest;
  readonly transactionDigest: ExecutionEffectPersistenceDigest;
  readonly effectCount: number;
  readonly decisionEffectCount: number;
  readonly effects: readonly Readonly<{
    readonly operationIndex: number;
    readonly path: string;
    readonly status: 'added' | 'modified' | 'deleted';
    readonly operationKind: ExecutionEffectPersistenceOperationV1['kind'];
    readonly entryKind: 'regular-file' | 'directory';
    readonly lineMetrics: 'REQUIRED' | 'NOT_APPLICABLE_DIRECTORY';
    readonly operationDigest: ExecutionEffectPersistenceDigest;
    readonly effectDigests: readonly ExecutionEffectPersistenceDigest[];
    readonly derivedParentProvenanceDigest: ExecutionEffectPersistenceDigest | null;
  }>[];
  readonly projectionDigest: ExecutionEffectPersistenceDigest;
}

export type CreateExecutionEffectResultProjectionV1Input = Omit<
  ExecutionEffectResultProjectionV1,
  'version' | 'effectCount' | 'projectionDigest'
>;

export function createExecutionEffectResultProjectionV1(
  input: CreateExecutionEffectResultProjectionV1Input,
): ExecutionEffectResultProjectionV1 {
  const record = exact(input, [
    'disposition', 'effectDecisionDigest', 'transactionDigest', 'decisionEffectCount', 'effects',
  ]);
  if (record === null
    || (record.disposition !== 'COMMITTED' && record.disposition !== 'COMMITTED_NO_CHANGE')
    || !isDigest(record.effectDecisionDigest) || !isDigest(record.transactionDigest)
    || !Number.isSafeInteger(record.decisionEffectCount)
    || (record.decisionEffectCount as number) < 0
    || !Array.isArray(record.effects) || nodeTypes.isProxy(record.effects)) {
    throw new TypeError('Invalid execution effect result projection');
  }
  const paths = new Set<string>();
  const effects = (record.effects as readonly unknown[]).map((value, index) => {
    const effect = exact(value, [
      'operationIndex', 'path', 'status', 'operationKind', 'operationDigest', 'effectDigests',
      'entryKind', 'lineMetrics', 'derivedParentProvenanceDigest',
    ]);
    if (effect === null || effect.operationIndex !== index || !safePath(effect.path)
      || paths.has(effect.path) || !isDigest(effect.operationDigest)
      || !Array.isArray(effect.effectDigests) || nodeTypes.isProxy(effect.effectDigests)
      || (effect.effectDigests as unknown[]).some(item => !isDigest(item))
      || new Set(effect.effectDigests as string[]).size !== effect.effectDigests.length
      || (effect.derivedParentProvenanceDigest !== null
        && !isDigest(effect.derivedParentProvenanceDigest))) {
      throw new TypeError('Invalid execution effect result projection');
    }
    const operationKind = effect.operationKind;
    const expectedStatus = operationKind === 'ADD' || operationKind === 'ADD_DIRECTORY'
      ? 'added'
      : operationKind === 'DELETE' ? 'deleted'
        : operationKind === 'REPLACE' || operationKind === 'MODE' ? 'modified' : null;
    if (expectedStatus === null || effect.status !== expectedStatus) {
      throw new TypeError('Invalid execution effect result projection');
    }
    const isDerivedParent = effect.derivedParentProvenanceDigest !== null;
    if (isDerivedParent
      ? operationKind !== 'ADD_DIRECTORY' || effect.effectDigests.length !== 0
      : effect.effectDigests.length === 0) {
      throw new TypeError('Invalid execution effect result projection');
    }
    if ((effect.entryKind !== 'regular-file' && effect.entryKind !== 'directory')
      || (operationKind === 'ADD' && effect.entryKind !== 'regular-file')
      || (operationKind === 'ADD_DIRECTORY' && effect.entryKind !== 'directory')
      || (operationKind === 'REPLACE' && effect.entryKind !== 'regular-file')
      || effect.lineMetrics !== (effect.entryKind === 'regular-file'
        ? 'REQUIRED' : 'NOT_APPLICABLE_DIRECTORY')) {
      throw new TypeError('Invalid execution effect result projection');
    }
    paths.add(effect.path);
    return Object.freeze({
      operationIndex: index,
      path: effect.path,
      status: expectedStatus,
      operationKind,
      entryKind: effect.entryKind,
      lineMetrics: effect.lineMetrics,
      operationDigest: effect.operationDigest,
      effectDigests: Object.freeze([...(effect.effectDigests as ExecutionEffectPersistenceDigest[])]),
      derivedParentProvenanceDigest:
        effect.derivedParentProvenanceDigest as ExecutionEffectPersistenceDigest | null,
    }) as ExecutionEffectResultProjectionV1['effects'][number];
  });
  const noChange = record.disposition === 'COMMITTED_NO_CHANGE';
  if (noChange !== (effects.length === 0)
    || noChange !== (record.decisionEffectCount === 0)
    || (!noChange && (record.decisionEffectCount as number) > effects.length)) {
    throw new TypeError('Invalid execution effect result projection');
  }
  const body = Object.freeze({
    version: 1 as const,
    disposition: record.disposition,
    effectDecisionDigest: record.effectDecisionDigest,
    transactionDigest: record.transactionDigest,
    effectCount: effects.length,
    decisionEffectCount: record.decisionEffectCount as number,
    effects: Object.freeze(effects),
  });
  return Object.freeze({
    ...body,
    projectionDigest: digest('execution-effect-result-projection-v1', body),
  });
}

export function parseExecutionEffectResultProjectionV1(
  value: unknown,
): ExecutionEffectResultProjectionV1 | null {
  const record = exact(value, [
    'version', 'disposition', 'effectDecisionDigest', 'transactionDigest', 'effectCount',
    'decisionEffectCount', 'effects', 'projectionDigest',
  ]);
  if (record === null || record.version !== 1 || !isDigest(record.projectionDigest)
    || !Number.isSafeInteger(record.effectCount)) return null;
  try {
    const recreated = createExecutionEffectResultProjectionV1({
      disposition: record.disposition as ExecutionEffectResultProjectionV1['disposition'],
      effectDecisionDigest: record.effectDecisionDigest as ExecutionEffectPersistenceDigest,
      transactionDigest: record.transactionDigest as ExecutionEffectPersistenceDigest,
      decisionEffectCount: record.decisionEffectCount as number,
      effects: record.effects as ExecutionEffectResultProjectionV1['effects'],
    });
    return recreated.effectCount === record.effectCount && sameCanonicalJson(recreated, value)
      ? recreated : null;
  } catch {
    return null;
  }
}

export function projectVerifiedExecutionEffectResultV1(
  bundle: VerifiedExecutionEffectPersistenceBundleV1,
): ExecutionEffectResultProjectionV1 | null {
  const recomputed = evaluateExecutionEffectContainment({
    baseline: { ok: true, manifest: bundle.baseline },
    final: { ok: true, manifest: bundle.final },
  });
  if (recomputed.state !== 'VERIFIED' || !sameCanonicalJson(recomputed, bundle.decision)
    || recomputed.decisionDigest !== bundle.decisionDigest
    || bundle.terminal.effectDecisionDigest !== bundle.decisionDigest
    || (bundle.terminal.disposition === 'COMMITTED_NO_CHANGE'
      ? bundle.terminal.operations.length !== 0 || recomputed.effects.length !== 0
      : bundle.terminal.operations.length === 0 || recomputed.effects.length === 0)) return null;
  const paths = new Set<string>();
  const effects = bundle.terminal.operations.map(operation => {
    if (paths.has(operation.path)) return null;
    paths.add(operation.path);
    const status = operation.kind === 'ADD' || operation.kind === 'ADD_DIRECTORY'
      ? 'added' as const
      : operation.kind === 'DELETE' ? 'deleted' as const : 'modified' as const;
    const authorityStates = operation.kind === 'DELETE'
      ? operation.entryPreimages : operation.entryPostimages;
    const pathState = authorityStates.find(state => state.path === operation.path);
    const entryKind = pathState?.entry.state === 'PRESENT'
      ? pathState.entry.entry.kind : null;
    if (entryKind !== 'regular-file' && entryKind !== 'directory') return null;
    return Object.freeze({
      operationIndex: operation.index,
      path: operation.path,
      status,
      operationKind: operation.kind,
      entryKind,
      lineMetrics: entryKind === 'regular-file'
        ? 'REQUIRED' as const : 'NOT_APPLICABLE_DIRECTORY' as const,
      operationDigest: operation.operationDigest,
      effectDigests: operation.effectDigests,
      derivedParentProvenanceDigest: operation.derivedParent?.provenanceDigest ?? null,
    });
  });
  if (effects.some(value => value === null)) return null;
  const exactEffects = Object.freeze(effects as Exclude<(typeof effects)[number], null>[]);
  return createExecutionEffectResultProjectionV1({
    disposition: bundle.terminal.disposition,
    effectDecisionDigest: bundle.terminal.effectDecisionDigest,
    transactionDigest: bundle.terminal.transactionDigest,
    decisionEffectCount: recomputed.effects.length,
    effects: exactEffects,
  });
}

function effectKindMatchesOperation(effect: ExecutionEffect, operation: ExecutionEffectPersistenceOperationV1): boolean {
  if (effect.path !== operation.path) return false;
  if (effect.kind === 'add') {
    return effect.after?.kind === 'regular-file' ? operation.kind === 'ADD' : operation.kind === 'ADD_DIRECTORY';
  }
  if (effect.kind === 'modify') return operation.kind === 'REPLACE';
  if (effect.kind === 'delete') return operation.kind === 'DELETE';
  return operation.kind === 'MODE' || operation.kind === 'ADD' || operation.kind === 'REPLACE';
}

function effectParentPath(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator === -1 ? '.' : path.slice(0, separator);
}

function parseJournalRecord(
  artifact: ExecutionEffectLandingJournalArtifactV1,
  keys: readonly string[],
  domain: string,
  maxJsonBytes: number,
): Record<string, unknown> | null {
  if (artifact.byteLength !== artifact.bytes.byteLength
    || artifact.contentDigest !== executionEffectPersistenceRawDigest(artifact.bytes)) return null;
  const value = parseCanonicalJson(artifact.bytes, maxJsonBytes);
  const record = exact(value, [...keys, 'recordDigest']);
  if (record === null || !isDigest(record.recordDigest)) return null;
  const { recordDigest: _recordDigest, ...body } = record;
  return digest(domain, body) === record.recordDigest ? record : null;
}

export interface ExecutionEffectLandingNativeReceiptEvidenceV1 {
  readonly version: 1;
  readonly state: 'APPLIED';
  readonly operationDigest: ExecutionEffectPersistenceDigest;
  readonly entryPreimages: readonly ExecutionEffectLandingAuthorityPathStateV1[];
  readonly entryPostimages: readonly ExecutionEffectLandingAuthorityPathStateV1[];
  readonly parentAuthorities: readonly ExecutionEffectLandingAuthorityParentV1[];
  readonly durabilityEvidenceDigest: ExecutionEffectPersistenceDigest;
  readonly receiptDigest: ExecutionEffectPersistenceDigest;
}

export function createExecutionEffectLandingNativeReceiptEvidenceV1(input: Readonly<{
  readonly operation: ExecutionEffectPersistenceOperationV1;
  readonly entryPostimages: readonly ExecutionEffectLandingAuthorityPathStateV1[];
  readonly durabilityEvidenceDigest: ExecutionEffectPersistenceDigest;
}>): ExecutionEffectLandingNativeReceiptEvidenceV1 {
  const operation = parseOperation(input.operation, input.operation.index);
  const postimages = parseOrderedAuthorityArray(
    input.entryPostimages,
    parseAuthorityPathState,
    value => value.path,
  );
  if (!operation || postimages === null || !isDigest(input.durabilityEvidenceDigest)
    || postimages.length !== operation.entryPostimages.length) {
    throw new TypeError('Invalid execution effect native receipt evidence');
  }
  for (let index = 0; index < postimages.length; index += 1) {
    const actual = postimages[index]!;
    const expected = operation.entryPostimages[index]!;
    if (actual.path !== expected.path || actual.entry.state !== expected.entry.state
      || (actual.entry.state === 'PRESENT' && expected.entry.state === 'PRESENT'
        && (!sameCanonicalJson(actual.entry.entry, expected.entry.entry)
          || (actual.entry.entry.kind === 'regular-file' && actual.entry.linkCount !== 1)
          || (actual.entry.entry.kind === 'directory' && actual.entry.linkCount !== null)))) {
      throw new TypeError('Invalid execution effect native postimage evidence');
    }
  }
  const body = Object.freeze({
    version: 1 as const,
    state: 'APPLIED' as const,
    operationDigest: operation.operationDigest,
    entryPreimages: operation.entryPreimages,
    entryPostimages: postimages,
    parentAuthorities: operation.parentAuthorities,
    durabilityEvidenceDigest: input.durabilityEvidenceDigest,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest('execution-effect-landing-native-receipt-v1', body),
  });
}

export function parseExecutionEffectLandingNativeReceiptEvidenceV1(
  value: unknown,
  operation: ExecutionEffectPersistenceOperationV1,
): ExecutionEffectLandingNativeReceiptEvidenceV1 | null {
  const record = exact(value, [
    'version', 'state', 'operationDigest', 'entryPreimages', 'entryPostimages',
    'parentAuthorities', 'durabilityEvidenceDigest', 'receiptDigest',
  ]);
  if (record === null || record.version !== 1 || record.state !== 'APPLIED'
    || record.operationDigest !== operation.operationDigest
    || !isDigest(record.durabilityEvidenceDigest) || !isDigest(record.receiptDigest)) return null;
  try {
    const recreated = createExecutionEffectLandingNativeReceiptEvidenceV1({
      operation,
      entryPostimages: record.entryPostimages as ExecutionEffectLandingAuthorityPathStateV1[],
      durabilityEvidenceDigest: record.durabilityEvidenceDigest,
    });
    return sameCanonicalJson(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export interface ExecutionEffectLandingFinalReceiptEvidenceV1 {
  readonly version: 1;
  readonly state: 'VERIFIED';
  readonly transactionDigest: ExecutionEffectPersistenceDigest;
  readonly planDigest: ExecutionEffectPersistenceDigest;
  readonly operationReceiptDigests: readonly ExecutionEffectPersistenceDigest[];
  readonly postimageSetDigest: ExecutionEffectPersistenceDigest;
  readonly durabilityEvidenceDigest: ExecutionEffectPersistenceDigest;
  readonly receiptDigest: ExecutionEffectPersistenceDigest;
}

export function createExecutionEffectLandingFinalReceiptEvidenceV1(input: Readonly<{
  readonly transactionDigest: ExecutionEffectPersistenceDigest;
  readonly planDigest: ExecutionEffectPersistenceDigest;
  readonly operations: readonly ExecutionEffectPersistenceOperationV1[];
  readonly nativeReceipts: readonly ExecutionEffectLandingNativeReceiptEvidenceV1[];
  readonly durabilityEvidenceDigest: ExecutionEffectPersistenceDigest;
}>): ExecutionEffectLandingFinalReceiptEvidenceV1 {
  if (!isDigest(input.transactionDigest) || !isDigest(input.planDigest)
    || !isDigest(input.durabilityEvidenceDigest)
    || input.operations.length === 0 || input.operations.length !== input.nativeReceipts.length) {
    throw new TypeError('Invalid execution effect final receipt evidence');
  }
  const operationReceiptDigests = input.nativeReceipts.map((receipt, index) => {
    const operation = input.operations[index];
    if (!operation || parseExecutionEffectLandingNativeReceiptEvidenceV1(receipt, operation) === null) {
      throw new TypeError('Invalid execution effect native receipt fan-in');
    }
    return receipt.receiptDigest;
  });
  const body = Object.freeze({
    version: 1 as const,
    state: 'VERIFIED' as const,
    transactionDigest: input.transactionDigest,
    planDigest: input.planDigest,
    operationReceiptDigests: Object.freeze(operationReceiptDigests),
    postimageSetDigest: digest(
      'execution-effect-landing-final-postimage-set-v1',
      input.operations.map((operation, index) => ({
        operationDigest: operation.operationDigest,
        entryPostimages: input.nativeReceipts[index]!.entryPostimages,
      })),
    ),
    durabilityEvidenceDigest: input.durabilityEvidenceDigest,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest('execution-effect-landing-final-verification-v1', body),
  });
}

export function parseExecutionEffectLandingFinalReceiptEvidenceV1(
  value: unknown,
  transactionDigest: ExecutionEffectPersistenceDigest,
  planDigest: ExecutionEffectPersistenceDigest,
  operations: readonly ExecutionEffectPersistenceOperationV1[],
  nativeReceipts: readonly ExecutionEffectLandingNativeReceiptEvidenceV1[],
): ExecutionEffectLandingFinalReceiptEvidenceV1 | null {
  const record = exact(value, [
    'version', 'state', 'transactionDigest', 'planDigest', 'operationReceiptDigests',
    'postimageSetDigest', 'durabilityEvidenceDigest', 'receiptDigest',
  ]);
  if (record === null || record.version !== 1 || record.state !== 'VERIFIED'
    || record.transactionDigest !== transactionDigest || record.planDigest !== planDigest
    || !isDigest(record.durabilityEvidenceDigest) || !isDigest(record.receiptDigest)) return null;
  try {
    const recreated = createExecutionEffectLandingFinalReceiptEvidenceV1({
      transactionDigest,
      planDigest,
      operations,
      nativeReceipts,
      durabilityEvidenceDigest: record.durabilityEvidenceDigest,
    });
    return sameCanonicalJson(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export interface ExecutionEffectLandingLeaseTerminalReceiptEvidenceV1 {
  readonly transactionDigest: ExecutionEffectPersistenceDigest;
  readonly terminal: 'COMPLETED' | 'RELEASED_NO_CHANGE';
  readonly committedJournalDigest: ExecutionEffectPersistenceDigest;
  readonly eventId: string;
  readonly quarantineId: string;
  readonly fencingToken: Readonly<{ readonly epoch: string; readonly counter: number; readonly nonce: string }>;
  readonly occurredAt: string;
  readonly evidenceRefs: readonly string[];
  readonly terminalReceiptDigest: ExecutionEffectPersistenceDigest;
}

export function executionEffectLandingDeterministicBoundaryIdV1(
  transactionDigest: ExecutionEffectPersistenceDigest,
): string {
  if (!isDigest(transactionDigest)) {
    throw new TypeError('Invalid execution effect landing transaction digest');
  }
  const bytes = createHash('sha256')
    .update('execution-effect-lock-boundary-id-v1', 'utf8')
    .update('\0', 'utf8')
    .update(transactionDigest, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
    hex.slice(16, 20), hex.slice(20, 32),
  ].join('-');
}

export function createExecutionEffectLandingLeaseTerminalReceiptEvidenceV1(input: Omit<
  ExecutionEffectLandingLeaseTerminalReceiptEvidenceV1,
  'terminalReceiptDigest'
>): ExecutionEffectLandingLeaseTerminalReceiptEvidenceV1 {
  const record = exact(input, [
    'transactionDigest', 'terminal', 'committedJournalDigest', 'eventId', 'quarantineId',
    'fencingToken', 'occurredAt', 'evidenceRefs',
  ]);
  const fencing = exact(record?.fencingToken, ['epoch', 'counter', 'nonce']);
  if (record === null || !isDigest(record.transactionDigest)
    || (record.terminal !== 'COMPLETED' && record.terminal !== 'RELEASED_NO_CHANGE')
    || !isDigest(record.committedJournalDigest) || !isSafeIdentifier(record.eventId)
    || record.quarantineId !== executionEffectLandingDeterministicBoundaryIdV1(
      record.transactionDigest as ExecutionEffectPersistenceDigest,
    ) || fencing === null
    || typeof fencing.epoch !== 'string' || fencing.epoch.length === 0
    || !Number.isSafeInteger(fencing.counter) || (fencing.counter as number) <= 0
    || typeof fencing.nonce !== 'string' || fencing.nonce.length === 0
    || !isTimestamp(record.occurredAt) || !Array.isArray(record.evidenceRefs)
    || record.evidenceRefs.length < 3 || record.evidenceRefs.length > 8
    || record.evidenceRefs.some(value => typeof value !== 'string' || value.length > 256)
    || record.evidenceRefs.some((value, index, values) => index > 0
      && compare(values[index - 1] as string, value as string) >= 0)) {
    throw new TypeError('Invalid execution effect lease terminal receipt evidence');
  }
  const required = [
    `committed-journal:${record.committedJournalDigest}`,
    `effect-terminal:${record.terminal}`,
    `effect-transaction:${record.transactionDigest}`,
  ];
  const evidenceRefs = record.evidenceRefs as string[];
  if (required.some(value => !evidenceRefs.includes(value))
    || (record.terminal === 'COMPLETED')
      !== evidenceRefs.some(value => /^effect-boundary:sha256:[a-f0-9]{64}$/u.test(value))) {
    throw new TypeError('Invalid execution effect lease terminal authority evidence');
  }
  const body = Object.freeze({
    transactionDigest: record.transactionDigest,
    terminal: record.terminal,
    committedJournalDigest: record.committedJournalDigest,
    eventId: record.eventId,
    quarantineId: record.quarantineId,
    fencingToken: Object.freeze({
      epoch: fencing.epoch,
      counter: fencing.counter as number,
      nonce: fencing.nonce,
    }),
    occurredAt: record.occurredAt,
    evidenceRefs: Object.freeze([...evidenceRefs]),
  });
  return Object.freeze({
    ...body,
    terminalReceiptDigest: digest('execution-effect-lock-terminal-receipt-v1', body),
  });
}

export function parseExecutionEffectLandingLeaseTerminalReceiptEvidenceV1(
  value: unknown,
): ExecutionEffectLandingLeaseTerminalReceiptEvidenceV1 | null {
  const record = exact(value, [
    'transactionDigest', 'terminal', 'committedJournalDigest', 'eventId', 'quarantineId',
    'fencingToken', 'occurredAt', 'evidenceRefs', 'terminalReceiptDigest',
  ]);
  if (record === null || !isDigest(record.terminalReceiptDigest)) return null;
  try {
    const recreated = createExecutionEffectLandingLeaseTerminalReceiptEvidenceV1({
      transactionDigest: record.transactionDigest as ExecutionEffectPersistenceDigest,
      terminal: record.terminal as 'COMPLETED' | 'RELEASED_NO_CHANGE',
      committedJournalDigest: record.committedJournalDigest as ExecutionEffectPersistenceDigest,
      eventId: record.eventId as string,
      quarantineId: record.quarantineId as string,
      fencingToken: record.fencingToken as ExecutionEffectLandingLeaseTerminalReceiptEvidenceV1['fencingToken'],
      occurredAt: record.occurredAt as string,
      evidenceRefs: record.evidenceRefs as string[],
    });
    return sameCanonicalJson(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

function verifyExecutionEffectLandingJournalFanInV1(
  terminal: ExecutionEffectLandingTerminalSealV1,
  expectedTransaction: ExecutionEffectLandingTransactionRefV1,
  artifacts: readonly ExecutionEffectLandingJournalArtifactV1[],
  nativeReceipts: readonly ExecutionEffectLandingNativeReceiptEvidenceV1[],
  finalReceipt: ExecutionEffectLandingFinalReceiptEvidenceV1 | null,
  maxJsonBytes: number,
): ExecutionEffectPersistenceDigest | null {
  const refs = [
    terminal.journalArtifacts.prepared,
    ...(terminal.journalArtifacts.applying ? [terminal.journalArtifacts.applying] : []),
    ...terminal.journalArtifacts.steps,
    terminal.journalArtifacts.committed,
  ];
  if (artifacts.length !== refs.length) return null;
  const byKey = new Map<string, ExecutionEffectLandingJournalArtifactV1>();
  for (const artifact of artifacts) {
    if (byKey.has(artifact.artifactKey)) return null;
    byKey.set(artifact.artifactKey, artifact);
  }
  const resolveArtifact = (
    ref: ExecutionEffectLandingJournalArtifactRefV1,
  ): ExecutionEffectLandingJournalArtifactV1 | null => {
    const artifact = byKey.get(ref.artifactKey);
    return artifact
      && artifact.artifactReceiptDigest === ref.artifactReceiptDigest
      && artifact.contentDigest === ref.contentDigest
      && artifact.byteLength === ref.byteLength
      ? artifact : null;
  };
  const preparedArtifact = resolveArtifact(terminal.journalArtifacts.prepared);
  if (!preparedArtifact) return null;
  const prepared = parseJournalRecord(preparedArtifact, [
    'version', 'kind', 'phase', 'transaction', 'operations', 'nativeCapabilityDigest',
    'journalCapabilityDigest', 'leaseCapabilityDigest', 'acquiredLease', 'preparedAt',
  ], 'execution-effect-landing-prepared-journal-v1', maxJsonBytes);
  const acquiredLease = parseLease(
    prepared?.acquiredLease,
    expectedTransaction.transactionDigest,
  );
  if (!prepared || prepared.version !== 1 || prepared.kind !== 'execution-effect-landing-prepared'
    || prepared.phase !== 'PREPARED' || !isTimestamp(prepared.preparedAt)
    || canonicalJson(prepared.transaction) !== canonicalJson(expectedTransaction)
    || !Array.isArray(prepared.operations) || prepared.operations.length !== terminal.operations.length
    || !isDigest(prepared.nativeCapabilityDigest)
    || !isDigest(prepared.journalCapabilityDigest)
    || !isDigest(prepared.leaseCapabilityDigest) || acquiredLease === null) return null;
  for (let index = 0; index < prepared.operations.length; index += 1) {
    const operation = prepared.operations[index];
    if (operation === null || typeof operation !== 'object'
      || Reflect.get(operation, 'operationDigest') !== terminal.operations[index]?.operationDigest) return null;
  }
  if (prepared.recordDigest !== terminal.preparedJournalDigest) return null;

  let previousJournalDigest = prepared.recordDigest;
  let previousTimestamp = Date.parse(prepared.preparedAt as string);
  let applying: Record<string, unknown> | null = null;
  if (terminal.journalArtifacts.applying) {
    const applyingArtifact = resolveArtifact(terminal.journalArtifacts.applying);
    if (!applyingArtifact) return null;
    applying = parseJournalRecord(applyingArtifact, [
      'version', 'kind', 'phase', 'transactionDigest', 'preparedJournalDigest',
      'boundary', 'applyingAt',
    ], 'execution-effect-landing-applying-journal-v1', maxJsonBytes);
    const boundary = applying && exact(applying.boundary, [
      'transactionDigest', 'fencingTokenDigest', 'boundaryId', 'boundaryReceiptDigest',
    ]);
    if (!applying || !boundary || applying.version !== 1
      || applying.kind !== 'execution-effect-landing-applying' || applying.phase !== 'APPLYING'
      || applying.transactionDigest !== expectedTransaction.transactionDigest
      || applying.preparedJournalDigest !== prepared.recordDigest || !isTimestamp(applying.applyingAt)
      || boundary.transactionDigest !== expectedTransaction.transactionDigest
      || boundary.fencingTokenDigest !== acquiredLease.fencingTokenDigest
      || !isSafeIdentifier(boundary.boundaryId)
      || !isDigest(boundary.boundaryReceiptDigest)
      || Date.parse(applying.applyingAt as string) < previousTimestamp
      || applying.recordDigest !== terminal.applyingJournalDigest) return null;
    previousJournalDigest = applying.recordDigest as ExecutionEffectPersistenceDigest;
    previousTimestamp = Date.parse(applying.applyingAt as string);
  }

  const nativeReceiptDigests: ExecutionEffectPersistenceDigest[] = [];
  for (let index = 0; index < terminal.journalArtifacts.steps.length; index += 1) {
    const artifact = resolveArtifact(terminal.journalArtifacts.steps[index]!);
    if (!artifact) return null;
    const step = parseJournalRecord(artifact, [
      'version', 'kind', 'phase', 'transactionDigest', 'preparedJournalDigest',
      'applyingJournalDigest', 'previousJournalDigest', 'index', 'operationDigest',
      'nativeReceipt', 'reconciledAfterCrash', 'appliedAt',
    ], 'execution-effect-landing-step-journal-v1', maxJsonBytes);
    const nativeReceipt = step && exact(step.nativeReceipt, [
      'version', 'state', 'operationDigest', 'entryPreimages', 'entryPostimages',
      'parentAuthorities', 'durabilityEvidenceDigest', 'receiptDigest',
    ]);
    if (!step || !nativeReceipt || step.version !== 1
      || step.kind !== 'execution-effect-landing-step' || step.phase !== 'STEP'
      || step.transactionDigest !== expectedTransaction.transactionDigest
      || step.preparedJournalDigest !== prepared.recordDigest
      || step.applyingJournalDigest !== applying?.recordDigest
      || step.previousJournalDigest !== previousJournalDigest || step.index !== index
      || step.operationDigest !== terminal.operations[index]?.operationDigest
      || nativeReceipt.version !== 1 || nativeReceipt.state !== 'APPLIED'
      || nativeReceipt.operationDigest !== step.operationDigest
      || !Array.isArray(nativeReceipt.entryPreimages)
      || !Array.isArray(nativeReceipt.entryPostimages)
      || !Array.isArray(nativeReceipt.parentAuthorities)
      || !isDigest(nativeReceipt.durabilityEvidenceDigest)
      || !isDigest(nativeReceipt.receiptDigest)
      || !sameCanonicalJson(nativeReceipt, nativeReceipts[index])
      || (step.reconciledAfterCrash !== true && step.reconciledAfterCrash !== false)
      || !isTimestamp(step.appliedAt)
      || Date.parse(step.appliedAt as string) < previousTimestamp
      || step.recordDigest !== terminal.stepJournalDigests[index]) return null;
    nativeReceiptDigests.push(nativeReceipt.receiptDigest);
    previousJournalDigest = step.recordDigest as ExecutionEffectPersistenceDigest;
    previousTimestamp = Date.parse(step.appliedAt as string);
  }

  const committedArtifact = resolveArtifact(terminal.journalArtifacts.committed);
  if (!committedArtifact) return null;
  const committed = parseJournalRecord(committedArtifact, [
    'version', 'kind', 'phase', 'disposition', 'transaction', 'preparedJournalDigest',
    'applyingJournalDigest', 'lastJournalDigest', 'operationReceiptDigests',
    'finalVerificationReceipt', 'committedAt',
  ], 'execution-effect-landing-committed-journal-v1', maxJsonBytes);
  if (!committed || committed.version !== 1
    || committed.kind !== 'execution-effect-landing-committed' || committed.phase !== 'COMMITTED'
    || committed.disposition !== terminal.disposition
    || canonicalJson(committed.transaction) !== canonicalJson(expectedTransaction)
    || committed.preparedJournalDigest !== prepared.recordDigest
    || committed.applyingJournalDigest !== (applying?.recordDigest ?? null)
    || committed.lastJournalDigest !== previousJournalDigest
    || !Array.isArray(committed.operationReceiptDigests)
    || canonicalJson(committed.operationReceiptDigests) !== canonicalJson(nativeReceiptDigests)
    || !isTimestamp(committed.committedAt)
    || committed.committedAt !== terminal.committedAt
    || Date.parse(committed.committedAt as string) < previousTimestamp
    || committed.recordDigest !== terminal.committedJournalDigest) return null;
  if (terminal.finalVerificationReceiptDigest === null) {
    if (committed.finalVerificationReceipt !== null || finalReceipt !== null) return null;
  } else {
    const committedFinalReceipt = exact(committed.finalVerificationReceipt, [
      'version', 'state', 'transactionDigest', 'planDigest', 'operationReceiptDigests',
      'postimageSetDigest', 'durabilityEvidenceDigest', 'receiptDigest',
    ]);
    if (!committedFinalReceipt || committedFinalReceipt.version !== 1 || committedFinalReceipt.state !== 'VERIFIED'
      || committedFinalReceipt.transactionDigest !== expectedTransaction.transactionDigest
      || committedFinalReceipt.planDigest !== expectedTransaction.planDigest
      || committedFinalReceipt.receiptDigest !== terminal.finalVerificationReceiptDigest
      || !isDigest(committedFinalReceipt.postimageSetDigest)
      || !isDigest(committedFinalReceipt.durabilityEvidenceDigest)
      || canonicalJson(committedFinalReceipt.operationReceiptDigests)
        !== canonicalJson(nativeReceiptDigests)
      || !sameCanonicalJson(committed.finalVerificationReceipt, finalReceipt)) return null;
  }
  return prepared.nativeCapabilityDigest as ExecutionEffectPersistenceDigest;
}

export function verifyExecutionEffectPersistenceBundleV1(input: Readonly<{
  workspaceBytes: Uint8Array;
  baselineBytes: Uint8Array;
  finalBytes: Uint8Array;
  terminalBytes: Uint8Array;
  stagedArtifacts: readonly ExecutionEffectPersistenceArtifactV1[];
  journalArtifacts: readonly ExecutionEffectLandingJournalArtifactV1[];
  receiptArtifacts: readonly ExecutionEffectLandingJournalArtifactV1[];
  maxJsonBytes: number;
}>): VerifiedExecutionEffectPersistenceBundleV1 | null {
  const workspaceValue = parseCanonicalJson(input.workspaceBytes, input.maxJsonBytes);
  const baselineValue = parseCanonicalJson(input.baselineBytes, input.maxJsonBytes);
  const finalValue = parseCanonicalJson(input.finalBytes, input.maxJsonBytes);
  const workspace = parseExecutionEffectWorkspaceSnapshotSealV1(workspaceValue);
  const baseline = parseExecutionEffectManifest(baselineValue);
  const final = parseExecutionEffectManifest(finalValue);
  if (!workspace || !baseline || !final || baseline.phase !== 'baseline' || final.phase !== 'final'
    || !sameAttempt(workspace.attempt, baseline.attempt) || !sameAttempt(workspace.attempt, final.attempt)
    || baseline.attemptDigest !== workspace.attemptDigest || final.attemptDigest !== workspace.attemptDigest
    || baseline.policy.digest !== workspace.writePolicyDigest || final.policy.digest !== workspace.writePolicyDigest
    || canonicalJson(baseline.workspaceIdentity) !== canonicalJson(workspace.workspaceIdentity)
    || executionEffectWorkspaceAuthorityDigestV1(final.workspaceIdentity)
      !== executionEffectWorkspaceAuthorityDigestV1(workspace.workspaceIdentity)) return null;
  const decision = evaluateExecutionEffectContainment({
    baseline: { ok: true, manifest: baseline },
    final: { ok: true, manifest: final },
  });
  if (decision.state !== 'VERIFIED') return null;
  const terminalValue = parseCanonicalJson(input.terminalBytes, input.maxJsonBytes);
  const terminal = parseExecutionEffectLandingTerminalSealV1(terminalValue, {
    attempt: workspace.attempt,
    attemptDigest: workspace.attemptDigest,
  });
  if (!terminal || terminal.workspaceSnapshotSealDigest !== workspace.sealDigest
    || terminal.baselineManifestDigest !== baseline.digest
    || workspace.workspaceResource.baselineManifestDigest !== baseline.digest
    || terminal.finalManifestDigest !== final.digest
    || terminal.effectDecisionDigest !== decision.decisionDigest) return null;
  const expectedTransaction = parseExecutionEffectLandingTransactionRefV1({
    version: 1,
    projectId: workspace.attempt.projectId,
    taskId: workspace.attempt.taskId,
    attemptId: workspace.attempt.attemptId,
    generation: workspace.attempt.generation,
    attemptDigest: workspace.attemptDigest,
    baselineManifestDigest: terminal.baselineManifestDigest,
    finalManifestDigest: terminal.finalManifestDigest,
    containmentDecisionDigest: terminal.effectDecisionDigest,
    planId: terminal.planId,
    planDigest: terminal.planDigest,
    transactionDigest: terminal.transactionDigest,
  });
  if (!expectedTransaction) return null;
  const receiptRefs = [
    ...terminal.receiptArtifacts.nativeReceipts,
    ...(terminal.receiptArtifacts.finalVerificationReceipt
      ? [terminal.receiptArtifacts.finalVerificationReceipt] : []),
    terminal.receiptArtifacts.leaseTerminalReceipt,
  ];
  if (input.receiptArtifacts.length !== receiptRefs.length) return null;
  const evidenceByKey = new Map(input.receiptArtifacts.map(artifact => [artifact.artifactKey, artifact]));
  if (evidenceByKey.size !== input.receiptArtifacts.length) return null;
  const resolveEvidence = (
    ref: ExecutionEffectLandingJournalArtifactRefV1,
  ): { artifact: ExecutionEffectLandingJournalArtifactV1; value: unknown } | null => {
    const artifact = evidenceByKey.get(ref.artifactKey);
    if (!artifact || artifact.artifactReceiptDigest !== ref.artifactReceiptDigest
      || artifact.contentDigest !== ref.contentDigest || artifact.byteLength !== ref.byteLength
      || artifact.byteLength !== artifact.bytes.byteLength
      || artifact.contentDigest !== executionEffectPersistenceRawDigest(artifact.bytes)) return null;
    const value = parseCanonicalJson(artifact.bytes, input.maxJsonBytes);
    return value === null ? null : { artifact, value };
  };
  const nativeReceipts: ExecutionEffectLandingNativeReceiptEvidenceV1[] = [];
  for (let index = 0; index < terminal.receiptArtifacts.nativeReceipts.length; index += 1) {
    const evidence = resolveEvidence(terminal.receiptArtifacts.nativeReceipts[index]!);
    const operation = terminal.operations[index];
    const receipt = evidence && operation
      ? parseExecutionEffectLandingNativeReceiptEvidenceV1(evidence.value, operation) : null;
    if (!receipt || !operation || receipt.receiptDigest !== operation.nativeReceiptDigest
      || receipt.durabilityEvidenceDigest !== operation.durabilityEvidenceDigest) return null;
    nativeReceipts.push(receipt);
  }
  const finalEvidence = terminal.receiptArtifacts.finalVerificationReceipt
    ? resolveEvidence(terminal.receiptArtifacts.finalVerificationReceipt) : null;
  const finalReceipt = finalEvidence
    ? parseExecutionEffectLandingFinalReceiptEvidenceV1(
      finalEvidence.value,
      terminal.transactionDigest,
      terminal.planDigest,
      terminal.operations,
      nativeReceipts,
    ) : null;
  if ((terminal.finalVerificationReceiptDigest === null) !== (finalReceipt === null)
    || (finalReceipt && finalReceipt.receiptDigest !== terminal.finalVerificationReceiptDigest)) return null;
  const leaseEvidence = resolveEvidence(terminal.receiptArtifacts.leaseTerminalReceipt);
  const leaseTerminal = leaseEvidence
    ? parseExecutionEffectLandingLeaseTerminalReceiptEvidenceV1(leaseEvidence.value) : null;
  if (!leaseTerminal || leaseTerminal.transactionDigest !== terminal.transactionDigest
    || leaseTerminal.committedJournalDigest !== terminal.committedJournalDigest
    || leaseTerminal.terminal !== terminal.leaseTerminal
    || leaseTerminal.terminalReceiptDigest !== terminal.leaseTerminalReceiptDigest) return null;
  const landingNativeCapabilityDigest = verifyExecutionEffectLandingJournalFanInV1(
    terminal,
    expectedTransaction,
    input.journalArtifacts,
    nativeReceipts,
    finalReceipt,
    input.maxJsonBytes,
  );
  if (landingNativeCapabilityDigest === null) return null;
  const effectByDigest = new Map(decision.effects.map(effect => [effect.digest, effect]));
  const expectedLandingIntentDigest = executionEffectLandingIntentDigestV1({
    attemptDigest: workspace.attemptDigest,
    baselineManifestDigest: baseline.digest,
    finalManifestDigest: final.digest,
    containmentDecisionDigest: decision.decisionDigest,
    planId: terminal.planId,
    nativeCapabilityDigest: landingNativeCapabilityDigest,
  });
  const consumed = new Set<string>();
  const baselineByPath = new Map(baseline.entries.map(entry => [entry.path, entry]));
  const finalByPath = new Map(final.entries.map(entry => [entry.path, entry]));
  const realDirectoryAdds = new Set(decision.effects
    .filter(effect => effect.kind === 'add' && effect.after?.kind === 'directory')
    .map(effect => effect.path));
  const expectedDerivedParents = new Map<string, ExecutionEffectPersistenceDigest[]>();
  for (const effect of decision.effects) {
    if (effect.kind !== 'add') continue;
    let parent = effectParentPath(effect.path);
    while (parent !== '.' && !baselineByPath.has(parent) && !realDirectoryAdds.has(parent)) {
      if (finalByPath.get(parent)?.kind !== 'directory') return null;
      const childEffects = expectedDerivedParents.get(parent) ?? [];
      childEffects.push(effect.digest as ExecutionEffectPersistenceDigest);
      expectedDerivedParents.set(parent, childEffects);
      parent = effectParentPath(parent);
    }
  }
  const derivedOperationIndexes = new Set<number>();
  const referencedDerivedOperationIndexes = new Set<number>();
  const expectedChunks = new Map<string, ExecutionEffectStagedChunkRefV1>();
  for (const operation of terminal.operations) {
    if (operation.derivedParent) {
      const expectedChildren = expectedDerivedParents.get(operation.path);
      let expectedProvenance: ExecutionEffectLandingDerivedParentProvenanceV1;
      try {
        expectedProvenance = createExecutionEffectLandingDerivedParentProvenanceV1({
          path: operation.path,
          childEffectDigests: expectedChildren ?? [],
        });
      } catch {
        return null;
      }
      if (!sameCanonicalJson(expectedProvenance, operation.derivedParent)
        || operation.entryPreimages.length !== 1
        || operation.entryPreimages[0]?.path !== operation.path
        || operation.entryPreimages[0]?.entry.state !== 'ABSENT'
        || operation.entryPostimages.length !== 1
        || operation.entryPostimages[0]?.path !== operation.path
        || operation.entryPostimages[0]?.entry.state !== 'PRESENT'
        || operation.entryPostimages[0]?.entry.entry.kind !== 'directory'
        || !sameCanonicalJson(operation.entryPostimages[0]?.entry.entry, finalByPath.get(operation.path))) {
        return null;
      }
      expectedDerivedParents.delete(operation.path);
      derivedOperationIndexes.add(operation.index);
    } else {
      for (const effectDigest of operation.effectDigests) {
        const effect = effectByDigest.get(effectDigest);
        if (!effect || consumed.has(effectDigest) || !effectKindMatchesOperation(effect, operation)) return null;
        consumed.add(effectDigest);
      }
    }
    for (const parent of operation.parentAuthorities) {
      if (parent.source !== 'OPERATION_POSTIMAGE') continue;
      const producer = terminal.operations[parent.operationIndex];
      if (!producer || parent.operationIndex >= operation.index
        || producer.kind !== 'ADD_DIRECTORY' || producer.path !== parent.path
        || producer.operationDigest !== parent.operationDigest) return null;
      if (producer.derivedParent) referencedDerivedOperationIndexes.add(parent.operationIndex);
    }
    if (operation.stagedSource) {
      const entry = final.entries.find(item => item.path === operation.path);
      if (!entry || entry.kind !== 'regular-file'
        || entry.size !== operation.stagedSource.byteLength
        || entry.contentDigest !== operation.stagedSource.contentDigest
        || operation.stagedSource.workspaceIdentityDigest
          !== executionEffectWorkspaceAuthorityDigestV1(workspace.workspaceIdentity)
        || operation.stagedSource.attemptDigest !== workspace.attemptDigest
        || operation.stagedSource.admissionReceiptDigest !== workspace.admissionReceiptDigest
        || operation.stagedSource.custodyPolicyDigest !== workspace.custodyPolicyDigest
        || operation.stagedSource.landingIntentDigest !== expectedLandingIntentDigest) return null;
      for (const chunk of operation.stagedSource.chunks) {
        if (expectedChunks.has(chunk.artifactKey)) return null;
        expectedChunks.set(chunk.artifactKey, chunk);
      }
    }
  }
  if (consumed.size !== decision.effects.length || expectedDerivedParents.size !== 0
    || derivedOperationIndexes.size !== referencedDerivedOperationIndexes.size
    || [...derivedOperationIndexes].some(index => !referencedDerivedOperationIndexes.has(index))
    || input.stagedArtifacts.length !== expectedChunks.size) return null;
  const refs: Array<{ artifactKey: string; artifactReceiptDigest: ExecutionEffectPersistenceDigest }> = [];
  const artifactsByKey = new Map<string, Uint8Array>();
  for (const artifact of input.stagedArtifacts) {
    const chunk = expectedChunks.get(artifact.artifactKey);
    if (!chunk || chunk.artifactReceiptDigest !== artifact.artifactReceiptDigest
      || chunk.byteLength !== artifact.bytes.byteLength
      || chunk.contentDigest !== executionEffectPersistenceRawDigest(artifact.bytes)
      || artifactsByKey.has(artifact.artifactKey)) return null;
    artifactsByKey.set(artifact.artifactKey, artifact.bytes);
    refs.push(Object.freeze({
      artifactKey: artifact.artifactKey,
      artifactReceiptDigest: artifact.artifactReceiptDigest,
    }));
  }
  for (const operation of terminal.operations) {
    if (!operation.stagedSource) continue;
    const aggregate = createHash('sha256');
    for (const chunk of operation.stagedSource.chunks) {
      const bytes = artifactsByKey.get(chunk.artifactKey);
      if (!bytes) return null;
      aggregate.update(bytes);
    }
    if (`sha256:${aggregate.digest('hex')}` !== operation.stagedSource.contentDigest) return null;
  }
  return Object.freeze({
    workspace,
    baseline,
    final,
    terminal,
    decision,
    decisionDigest: decision.decisionDigest as ExecutionEffectPersistenceDigest,
    stagedArtifactRefs: Object.freeze(refs.sort((left, right) => compare(left.artifactKey, right.artifactKey))),
  });
}

export interface TaskAttemptEffectLandingBindingV2 {
  readonly version: 2;
  readonly kind: 'task-attempt-effect-landing-binding';
  readonly identity: ExecutionEffectAttemptIdentity;
  readonly admissionReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly custodyPolicyDigest: ExecutionEffectPersistenceDigest;
  readonly landingArtifactKey: string;
  readonly landingArtifactReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly landingReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly effectLandingChainDigest: ExecutionEffectPersistenceDigest;
  readonly readyLifecycleAuthorityDigest: ExecutionEffectPersistenceDigest;
  readonly disposition: 'COMMITTED' | 'COMMITTED_NO_CHANGE';
  readonly effectDecisionDigest: ExecutionEffectPersistenceDigest;
  readonly transactionDigest: ExecutionEffectPersistenceDigest;
  readonly bindingDigest: ExecutionEffectPersistenceDigest;
}

function bindingBody(value: unknown): Omit<TaskAttemptEffectLandingBindingV2, 'bindingDigest'> | null {
  const record = exact(value, [
    'version', 'kind', 'identity', 'admissionReceiptDigest', 'custodyPolicyDigest',
    'landingArtifactKey', 'landingArtifactReceiptDigest', 'landingReceiptDigest',
    'effectLandingChainDigest', 'readyLifecycleAuthorityDigest', 'disposition',
    'effectDecisionDigest', 'transactionDigest',
  ]);
  const identity = parseAttempt(record?.identity);
  if (record === null || !identity || record.version !== 2
    || record.kind !== 'task-attempt-effect-landing-binding'
    || !isDigest(record.admissionReceiptDigest) || !isDigest(record.custodyPolicyDigest)
    || !isSafeKey(record.landingArtifactKey) || !isDigest(record.landingArtifactReceiptDigest)
    || !isDigest(record.landingReceiptDigest) || !isDigest(record.effectLandingChainDigest)
    || !isDigest(record.readyLifecycleAuthorityDigest)
    || (record.disposition !== 'COMMITTED' && record.disposition !== 'COMMITTED_NO_CHANGE')
    || !isDigest(record.effectDecisionDigest) || !isDigest(record.transactionDigest)) return null;
  return Object.freeze({
    version: 2,
    kind: 'task-attempt-effect-landing-binding',
    identity,
    admissionReceiptDigest: record.admissionReceiptDigest,
    custodyPolicyDigest: record.custodyPolicyDigest,
    landingArtifactKey: record.landingArtifactKey,
    landingArtifactReceiptDigest: record.landingArtifactReceiptDigest,
    landingReceiptDigest: record.landingReceiptDigest,
    effectLandingChainDigest: record.effectLandingChainDigest,
    readyLifecycleAuthorityDigest: record.readyLifecycleAuthorityDigest,
    disposition: record.disposition,
    effectDecisionDigest: record.effectDecisionDigest,
    transactionDigest: record.transactionDigest,
  });
}

export function createTaskAttemptEffectLandingBindingV2(
  input: Omit<TaskAttemptEffectLandingBindingV2, 'version' | 'kind' | 'bindingDigest'>,
): TaskAttemptEffectLandingBindingV2 {
  const body = bindingBody({ version: 2, kind: 'task-attempt-effect-landing-binding', ...input });
  if (!body) throw new TypeError('Invalid task-attempt effect landing binding');
  return Object.freeze({ ...body, bindingDigest: digest('task-attempt-effect-landing-binding-v2', body) });
}

export function parseTaskAttemptEffectLandingBindingV2(
  value: unknown,
): TaskAttemptEffectLandingBindingV2 | null {
  const record = exact(value, [
    'version', 'kind', 'identity', 'admissionReceiptDigest', 'custodyPolicyDigest',
    'landingArtifactKey', 'landingArtifactReceiptDigest', 'landingReceiptDigest',
    'effectLandingChainDigest', 'readyLifecycleAuthorityDigest', 'disposition',
    'effectDecisionDigest', 'transactionDigest',
    'bindingDigest',
  ]);
  if (!record || !isDigest(record.bindingDigest)) return null;
  const { bindingDigest: _bindingDigest, ...candidate } = record;
  const body = bindingBody(candidate);
  return body && digest('task-attempt-effect-landing-binding-v2', body) === record.bindingDigest
    ? Object.freeze({ ...body, bindingDigest: record.bindingDigest }) : null;
}

export function extractTaskAttemptEffectLandingBindingV2(
  value: unknown,
): TaskAttemptEffectLandingBindingV2 | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const attemptCustody = Reflect.get(value, 'attemptCustody');
  if (attemptCustody === null || typeof attemptCustody !== 'object' || Array.isArray(attemptCustody)) return null;
  return parseTaskAttemptEffectLandingBindingV2(Reflect.get(attemptCustody, 'effectLanding'));
}
