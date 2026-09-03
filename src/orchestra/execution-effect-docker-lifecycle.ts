import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';

import {
  EXECUTION_EFFECT_CAPTURE_HARD_LIMITS,
  createExecutionEffectManifestFromNativeCaptureV1,
  evaluateExecutionEffectContainment,
  parseExecutionEffectManifest,
  type ExecutionEffectAttemptIdentity,
  type ExecutionEffectCaptureLimits,
  type ExecutionEffectContainmentDecision,
  type ExecutionEffectManifest,
  type ExecutionEffectNativeCaptureEntryV1,
  type ExecutionEffectNativeCaptureTreeV1,
} from '../core/execution-effect-containment.js';
import {
  createExecutionEffectDependencyResourceV1,
  createExecutionEffectWorkspaceReleaseV1,
  createExecutionEffectWorkspaceResourceV1,
  createExecutionEffectWorkspaceSnapshotSealV1,
  parseExecutionEffectDependencyResourceV1,
  parseExecutionEffectLandingReceiptV1,
  parseExecutionEffectWorkspaceResourceV1,
  parseExecutionEffectWorkspaceSnapshotSealV1,
  parseExecutionEffectWorkspaceReleaseV1,
  type ExecutionEffectDependencyResourceV1,
  type ExecutionEffectLandingReceiptV1,
  type ExecutionEffectPersistenceDigest,
  type ExecutionEffectWorkspaceReleaseV1,
  type ExecutionEffectWorkspaceResourceV1,
  type ExecutionEffectWorkspaceSnapshotSealV1,
} from '../core/execution-effect-persistence-contract.js';
import {
  EXECUTION_EFFECT_PORTABLE_PATH_LIMITS,
  compileExecutionEffectWritePolicy,
  isExecutionEffectProtectedPath,
  parseExecutionEffectPortablePath,
  parseExecutionEffectWritePolicy,
  type ExecutionEffectWritePolicy,
} from '../core/execution-write-scope-policy.js';

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const WORKSPACE_VOLUME_NAME = /^deckent-xw-[a-f0-9]{48}$/u;
const DEPENDENCY_VOLUME_NAME = /^deckent-xd-[a-f0-9]{48}$/u;
const VOLUME_NAME = /^deckent-x[wd]-[a-f0-9]{48}$/u;
const CONTAINER_NAME = /^deckent-x-[A-Za-z0-9_.-]{1,96}$/u;
const IMAGE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._/+-]{0,432}@sha256:[a-f0-9]{64}$/u;
const LABEL_KEY = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const MAX_LABELS = 64;
const MAX_LABEL_VALUE_BYTES = 1_024;
const MAX_IMAGE_REFERENCE_BYTES = 512;
const RESOURCE_INSTANCE_NONCE = /^[a-f0-9]{64}$/u;
const RESOURCE_INSTANCE_LABEL = 'io.deckent.execution-effect.resource-instance' as const;
const RESOURCE_KIND_LABEL = 'io.deckent.execution-effect.resource-kind' as const;
const STORE_ARTIFACT_KEY = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const PROVIDER_MOUNT_TARGET = '/workspace' as const;
const HELPER_MOUNT_TARGET = '/workspace' as const;
const DEPENDENCY_IMAGE_SOURCE = '/app/node_modules' as const;
const DEPENDENCY_PROVIDER_TARGET = '/workspace/node_modules' as const;
const DEPENDENCY_POPULATION_TARGET = '/dependencies' as const;
const DOCKER_DAEMON_TIMESTAMP = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/u;

type Digest = ExecutionEffectPersistenceDigest;

function compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
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

function digest(domain: string, value: unknown): Digest {
  return `sha256:${createHash('sha256')
    .update(domain, 'utf8').update('\0', 'utf8').update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function isDigest(value: unknown): value is Digest {
  return typeof value === 'string' && DIGEST.test(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

/** Docker daemon identity timestamp: validated but preserved byte-for-byte, including nanos/offset. */
export function isExecutionEffectDockerDaemonTimestampV1(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 35
    || Buffer.byteLength(value, 'utf8') !== value.length) return false;
  const match = DOCKER_DAEMON_TIMESTAMP.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const local = new Date(Date.UTC(year, month - 1, day, hour));
  return local.getUTCFullYear() === year && local.getUTCMonth() === month - 1
    && local.getUTCDate() === day && local.getUTCHours() === hour;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
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
    return descriptor !== undefined && descriptor.enumerable === true && 'value' in descriptor;
  }) ? value as Record<string, unknown> : null;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function snapshotAttempt(value: unknown): ExecutionEffectAttemptIdentity | null {
  const record = exactRecord(value, ['projectId', 'taskId', 'attemptId', 'generation']);
  if (record === null
    || typeof record.projectId !== 'string' || record.projectId.length === 0
    || typeof record.taskId !== 'string' || record.taskId.length === 0
    || typeof record.attemptId !== 'string' || record.attemptId.length === 0
    || [record.projectId, record.taskId, record.attemptId]
      .some(part => Buffer.byteLength(part as string, 'utf8') > 256)
    || !Number.isSafeInteger(record.generation) || (record.generation as number) <= 0) return null;
  return Object.freeze({
    projectId: record.projectId,
    taskId: record.taskId,
    attemptId: record.attemptId,
    generation: record.generation as number,
  });
}

function sameAttempt(
  left: ExecutionEffectAttemptIdentity,
  right: ExecutionEffectAttemptIdentity,
): boolean {
  return left.projectId === right.projectId && left.taskId === right.taskId
    && left.attemptId === right.attemptId && left.generation === right.generation;
}

function timestampAtOrAfter(value: string, lowerBound: string): boolean {
  return Date.parse(value) >= Date.parse(lowerBound);
}

function snapshotCaptureLimits(value: unknown): ExecutionEffectCaptureLimits | null {
  const record = exactRecord(value, [
    'maxEntries', 'maxFileBytes', 'maxTotalBytes', 'maxDepth', 'maxPathBytes',
    'maxNameBytes', 'maxManifestBytes',
  ]);
  if (record === null) return null;
  const hard = EXECUTION_EFFECT_CAPTURE_HARD_LIMITS;
  for (const key of Object.keys(hard) as (keyof ExecutionEffectCaptureLimits)[]) {
    const observed = record[key];
    if (!Number.isSafeInteger(observed) || (observed as number) <= 0
      || (observed as number) > hard[key]) return null;
  }
  if ((record.maxFileBytes as number) > (record.maxTotalBytes as number)
    || (record.maxNameBytes as number) > (record.maxPathBytes as number)) return null;
  return Object.freeze({
    maxEntries: record.maxEntries as number,
    maxFileBytes: record.maxFileBytes as number,
    maxTotalBytes: record.maxTotalBytes as number,
    maxDepth: record.maxDepth as number,
    maxPathBytes: record.maxPathBytes as number,
    maxNameBytes: record.maxNameBytes as number,
    maxManifestBytes: record.maxManifestBytes as number,
  });
}

function snapshotWorkspaceIdentity(
  value: unknown,
): ExecutionEffectManifest['workspaceIdentity'] | null {
  const record = exactRecord(value, [
    'filesystemId', 'directoryId', 'rootHandleEvidenceDigest',
  ]);
  if (record === null || typeof record.filesystemId !== 'string'
    || record.filesystemId.length === 0 || Buffer.byteLength(record.filesystemId, 'utf8') > 256
    || typeof record.directoryId !== 'string' || record.directoryId.length === 0
    || Buffer.byteLength(record.directoryId, 'utf8') > 256
    || !isDigest(record.rootHandleEvidenceDigest)) return null;
  return Object.freeze({
    filesystemId: record.filesystemId,
    directoryId: record.directoryId,
    rootHandleEvidenceDigest: record.rootHandleEvidenceDigest,
  });
}

function snapshotLabels(value: unknown): Readonly<Record<string, string>> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || nodeTypes.isProxy(value)) {
    return null;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Object.getOwnPropertySymbols(value).length !== 0) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort(compare);
  if (keys.length === 0 || keys.length > MAX_LABELS) return null;
  const labels: Record<string, string> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!LABEL_KEY.test(key) || descriptor === undefined || !('value' in descriptor)
      || descriptor.enumerable !== true || typeof descriptor.value !== 'string'
      || descriptor.value.length === 0 || descriptor.value.includes('\0')
      || Buffer.byteLength(descriptor.value, 'utf8') > MAX_LABEL_VALUE_BYTES) return null;
    labels[key] = descriptor.value;
  }
  return Object.freeze(labels);
}

function snapshotInventoryPaths(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || nodeTypes.isProxy(value)
    || value.length > EXECUTION_EFFECT_PORTABLE_PATH_LIMITS.maxEntries
    || Object.getOwnPropertySymbols(value).length !== 0) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expectedKeys = [
    ...Array.from({ length: value.length }, (_, index) => String(index)),
    'length',
  ];
  if (Object.keys(descriptors).length !== expectedKeys.length
    || expectedKeys.some(key => descriptors[key] === undefined)) return null;
  const paths: string[] = [];
  const portableKeys = new Set<string>();
  let totalBytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true
      || typeof descriptor.value !== 'string') return null;
    const parsed = parseExecutionEffectPortablePath(descriptor.value);
    if (!parsed || parsed.path !== descriptor.value || isExecutionEffectProtectedPath(parsed.path)
      || portableKeys.has(parsed.key)) return null;
    totalBytes += Buffer.byteLength(parsed.path, 'utf8');
    if (!Number.isSafeInteger(totalBytes)
      || totalBytes > EXECUTION_EFFECT_PORTABLE_PATH_LIMITS.maxTotalPathBytes) return null;
    portableKeys.add(parsed.key);
    paths.push(parsed.path);
  }
  return Object.freeze(paths.sort(compare));
}

const PUBLIC_ENV_EXAMPLES = new Set([
  '.env.example', '.env.sample', '.env.template', '.env.defaults',
]);
const EXACT_SENSITIVE_NAMES = new Set([
  '.env', '.envrc', '.npmrc', '.pypirc', '.netrc', '_netrc',
  'credentials', 'credentials.json', 'secrets.json', 'token', 'token.json',
  'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519',
]);
const SENSITIVE_EXTENSIONS = new Set([
  '.pem', '.key', '.p12', '.pfx', '.jks', '.keystore', '.kdbx',
]);

function isSensitiveInventoryPath(path: string): boolean {
  const lowerPath = path.toLowerCase();
  const basename = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  if (PUBLIC_ENV_EXAMPLES.has(basename)) return false;
  if (EXACT_SENSITIVE_NAMES.has(basename) || basename.startsWith('.env.')) return true;
  const extension = basename.includes('.') ? basename.slice(basename.lastIndexOf('.')) : '';
  if (SENSITIVE_EXTENSIONS.has(extension)) return true;
  if (lowerPath === '.docker/config.json' || lowerPath.endsWith('/.docker/config.json')
    || lowerPath === '.aws/credentials' || lowerPath.endsWith('/.aws/credentials')
    || lowerPath === '.kube/config' || lowerPath.endsWith('/.kube/config')
    || lowerPath === '.config/gcloud/application_default_credentials.json'
    || lowerPath.endsWith('/.config/gcloud/application_default_credentials.json')) return true;
  return /^(?:.*[._-])?(?:credential|secret|token)s?\.json$/u.test(basename);
}

export type ExecutionEffectDockerInventoryAdmissionV1 =
  | Readonly<{
    readonly version: 1;
    readonly kind: 'execution-effect-docker-inventory-admission';
    readonly state: 'ADMITTED';
    readonly paths: readonly string[];
    readonly pathCount: number;
    readonly totalPathBytes: number;
    readonly inventoryDigest: Digest;
    readonly rejectedPathCount: 0;
    readonly rejectedPathsDigest: Digest;
    readonly receiptDigest: Digest;
  }>
  | Readonly<{
    readonly version: 1;
    readonly kind: 'execution-effect-docker-inventory-admission';
    readonly state: 'HOLD';
    readonly code: 'INVALID_INVENTORY' | 'SENSITIVE_PATH_DENIED';
    readonly pathCount: number;
    readonly rejectedPathCount: number;
    readonly rejectedPathsDigest: Digest;
    readonly receiptDigest: Digest;
  }>;

/** Path-only admission. It never opens, reads, logs, or returns rejected file contents. */
export function screenExecutionEffectDockerWorkspaceInventoryV1(
  value: unknown,
): ExecutionEffectDockerInventoryAdmissionV1 {
  const paths = snapshotInventoryPaths(value);
  if (paths === null) {
    const body = Object.freeze({
      version: 1 as const,
      kind: 'execution-effect-docker-inventory-admission' as const,
      state: 'HOLD' as const,
      code: 'INVALID_INVENTORY' as const,
      pathCount: Array.isArray(value) && Number.isSafeInteger(value.length) ? value.length : 0,
      rejectedPathCount: 0,
      rejectedPathsDigest: digest('execution-effect-docker-rejected-inventory-paths-v1', []),
    });
    return Object.freeze({
      ...body,
      receiptDigest: digest('execution-effect-docker-inventory-admission-v1', body),
    });
  }
  const rejected = paths.filter(isSensitiveInventoryPath);
  const rejectedPathsDigest = digest('execution-effect-docker-rejected-inventory-paths-v1', rejected);
  if (rejected.length > 0) {
    const body = Object.freeze({
      version: 1 as const,
      kind: 'execution-effect-docker-inventory-admission' as const,
      state: 'HOLD' as const,
      code: 'SENSITIVE_PATH_DENIED' as const,
      pathCount: paths.length,
      rejectedPathCount: rejected.length,
      rejectedPathsDigest,
    });
    return Object.freeze({
      ...body,
      receiptDigest: digest('execution-effect-docker-inventory-admission-v1', body),
    });
  }
  const totalPathBytes = paths.reduce(
    (total, path) => total + Buffer.byteLength(path, 'utf8'),
    0,
  );
  const inventoryBody = Object.freeze({
    paths,
    pathCount: paths.length,
    totalPathBytes,
  });
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-inventory-admission' as const,
    state: 'ADMITTED' as const,
    paths,
    pathCount: paths.length,
    totalPathBytes,
    inventoryDigest: digest('execution-effect-docker-workspace-inventory-v1', inventoryBody),
    rejectedPathCount: 0 as const,
    rejectedPathsDigest,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest('execution-effect-docker-inventory-admission-v1', body),
  });
}

export interface ExecutionEffectDockerWorkspacePlanV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-workspace-plan';
  readonly imageReference: string;
  readonly imageDigest: Digest;
  readonly volumeName: string;
  readonly workspaceLabels: Readonly<Record<string, string>>;
  readonly workspaceLabelsDigest: Digest;
  readonly workspaceResourceInstanceNonce: string;
  readonly workspaceResourceInstanceDigest: Digest;
  readonly dependencyLabels: Readonly<Record<string, string>>;
  readonly dependencyLabelsDigest: Digest;
  readonly dependencyResourceInstanceNonce: string;
  readonly dependencyResourceInstanceDigest: Digest;
  readonly mountPlan: Readonly<{
    readonly type: 'volume';
    readonly providerTarget: typeof PROVIDER_MOUNT_TARGET;
    readonly providerAccess: 'read-write';
    readonly helperTarget: typeof HELPER_MOUNT_TARGET;
    readonly helperAccess: 'read-only';
  }>;
  readonly mountPlanDigest: Digest;
  readonly dependencyPlan: Readonly<{
    readonly sourceAuthority: 'image-owned-read-only-volume';
    readonly imageSource: typeof DEPENDENCY_IMAGE_SOURCE;
    readonly volumeName: string;
    readonly populationTarget: typeof DEPENDENCY_POPULATION_TARGET;
    readonly providerTarget: typeof DEPENDENCY_PROVIDER_TARGET;
    readonly providerAccess: 'read-only';
    readonly networkAccess: 'none';
    readonly manifestScope: 'excluded-mount-overlay';
  }>;
  readonly dependencyPlanDigest: Digest;
  readonly inventoryPaths: readonly string[];
  readonly inventoryPathCount: number;
  readonly inventoryTotalPathBytes: number;
  readonly inventoryDigest: Digest;
  readonly inventoryAdmissionReceiptDigest: Digest;
  readonly inventoryRejectedPathCount: 0;
  readonly inventoryRejectedPathsDigest: Digest;
  readonly planDigest: Digest;
}

export function createExecutionEffectDockerWorkspacePlanV1(input: Readonly<{
  readonly imageReference: string;
  readonly imageDigest: Digest;
  readonly volumeName: string;
  readonly baseLabels: Readonly<Record<string, string>>;
  readonly workspaceResourceInstanceNonce: string;
  readonly dependencyResourceInstanceNonce: string;
  readonly mountPlan: ExecutionEffectDockerWorkspacePlanV1['mountPlan'];
  readonly dependencyPlan: ExecutionEffectDockerWorkspacePlanV1['dependencyPlan'];
  readonly inventoryPaths: readonly string[];
}>): ExecutionEffectDockerWorkspacePlanV1 {
  const record = exactRecord(input, [
    'imageReference', 'imageDigest', 'volumeName', 'baseLabels',
    'workspaceResourceInstanceNonce', 'dependencyResourceInstanceNonce',
    'mountPlan', 'dependencyPlan', 'inventoryPaths',
  ]);
  const baseLabels = snapshotLabels(record?.baseLabels);
  const workspaceLabels = baseLabels ? snapshotLabels(Object.freeze({
    ...baseLabels,
    [RESOURCE_INSTANCE_LABEL]: record?.workspaceResourceInstanceNonce,
    [RESOURCE_KIND_LABEL]: 'workspace',
  })) : null;
  const dependencyLabels = baseLabels ? snapshotLabels(Object.freeze({
    ...baseLabels,
    [RESOURCE_INSTANCE_LABEL]: record?.dependencyResourceInstanceNonce,
    [RESOURCE_KIND_LABEL]: 'dependency',
  })) : null;
  const mount = exactRecord(record?.mountPlan, [
    'type', 'providerTarget', 'providerAccess', 'helperTarget', 'helperAccess',
  ]);
  const dependency = exactRecord(record?.dependencyPlan, [
    'sourceAuthority', 'imageSource', 'volumeName', 'populationTarget', 'providerTarget',
    'providerAccess', 'networkAccess', 'manifestScope',
  ]);
  const inventoryAdmission = screenExecutionEffectDockerWorkspaceInventoryV1(record?.inventoryPaths);
  const admittedInventory = inventoryAdmission.state === 'ADMITTED' ? inventoryAdmission : null;
  const paths = admittedInventory?.paths ?? null;
  if (record === null || typeof record.imageReference !== 'string'
    || !IMAGE_REFERENCE.test(record.imageReference)
    || Buffer.byteLength(record.imageReference, 'utf8') > MAX_IMAGE_REFERENCE_BYTES
    || !record.imageReference.endsWith(`@${String(record.imageDigest)}`)
    || !isDigest(record.imageDigest) || typeof record.volumeName !== 'string'
    || !WORKSPACE_VOLUME_NAME.test(record.volumeName) || baseLabels === null
    || Object.hasOwn(baseLabels, RESOURCE_INSTANCE_LABEL)
    || Object.hasOwn(baseLabels, RESOURCE_KIND_LABEL) || workspaceLabels === null
    || dependencyLabels === null || paths === null
    || typeof record.workspaceResourceInstanceNonce !== 'string'
    || !RESOURCE_INSTANCE_NONCE.test(record.workspaceResourceInstanceNonce)
    || typeof record.dependencyResourceInstanceNonce !== 'string'
    || !RESOURCE_INSTANCE_NONCE.test(record.dependencyResourceInstanceNonce)
    || record.workspaceResourceInstanceNonce === record.dependencyResourceInstanceNonce
    || mount === null || mount.type !== 'volume'
    || mount.providerTarget !== PROVIDER_MOUNT_TARGET || mount.providerAccess !== 'read-write'
    || mount.helperTarget !== HELPER_MOUNT_TARGET || mount.helperAccess !== 'read-only'
    || dependency === null || dependency.sourceAuthority !== 'image-owned-read-only-volume'
    || dependency.imageSource !== DEPENDENCY_IMAGE_SOURCE
    || typeof dependency.volumeName !== 'string'
    || !DEPENDENCY_VOLUME_NAME.test(dependency.volumeName)
    || dependency.volumeName === record.volumeName
    || dependency.populationTarget !== DEPENDENCY_POPULATION_TARGET
    || dependency.providerTarget !== DEPENDENCY_PROVIDER_TARGET
    || dependency.providerAccess !== 'read-only' || dependency.networkAccess !== 'none'
    || dependency.manifestScope !== 'excluded-mount-overlay') {
    throw new TypeError('Invalid execution effect Docker workspace plan');
  }
  const workspaceLabelsDigest = digest('execution-effect-docker-workspace-labels-v1', workspaceLabels);
  const dependencyLabelsDigest = digest(
    'execution-effect-docker-dependency-labels-v1', dependencyLabels,
  );
  const workspaceResourceInstanceDigest = digest(
    'execution-effect-docker-workspace-resource-instance-v1',
    record.workspaceResourceInstanceNonce,
  );
  const dependencyResourceInstanceDigest = digest(
    'execution-effect-docker-dependency-resource-instance-v1',
    record.dependencyResourceInstanceNonce,
  );
  const mountPlan = Object.freeze({
    type: 'volume' as const,
    providerTarget: PROVIDER_MOUNT_TARGET,
    providerAccess: 'read-write' as const,
    helperTarget: HELPER_MOUNT_TARGET,
    helperAccess: 'read-only' as const,
  });
  const mountPlanDigest = digest('execution-effect-docker-mount-plan-v1', mountPlan);
  const dependencyPlan = Object.freeze({
    sourceAuthority: 'image-owned-read-only-volume' as const,
    imageSource: DEPENDENCY_IMAGE_SOURCE,
    volumeName: dependency.volumeName,
    populationTarget: DEPENDENCY_POPULATION_TARGET,
    providerTarget: DEPENDENCY_PROVIDER_TARGET,
    providerAccess: 'read-only' as const,
    networkAccess: 'none' as const,
    manifestScope: 'excluded-mount-overlay' as const,
  });
  const dependencyPlanDigest = digest('execution-effect-docker-dependency-plan-v1', {
    imageDigest: record.imageDigest,
    dependencyPlan,
  });
  const inventoryTotalPathBytes = admittedInventory!.totalPathBytes;
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-workspace-plan' as const,
    imageReference: record.imageReference,
    imageDigest: record.imageDigest,
    volumeName: record.volumeName,
    workspaceLabels,
    workspaceLabelsDigest,
    workspaceResourceInstanceNonce: record.workspaceResourceInstanceNonce,
    workspaceResourceInstanceDigest,
    dependencyLabels,
    dependencyLabelsDigest,
    dependencyResourceInstanceNonce: record.dependencyResourceInstanceNonce,
    dependencyResourceInstanceDigest,
    mountPlan,
    mountPlanDigest,
    dependencyPlan,
    dependencyPlanDigest,
    inventoryPaths: paths,
    inventoryPathCount: paths.length,
    inventoryTotalPathBytes,
    inventoryDigest: admittedInventory!.inventoryDigest,
    inventoryAdmissionReceiptDigest: admittedInventory!.receiptDigest,
    inventoryRejectedPathCount: 0 as const,
    inventoryRejectedPathsDigest: admittedInventory!.rejectedPathsDigest,
  });
  return Object.freeze({
    ...body,
    planDigest: digest('execution-effect-docker-workspace-plan-v1', body),
  });
}

function parseWorkspacePlan(value: unknown): ExecutionEffectDockerWorkspacePlanV1 | null {
  const record = exactRecord(value, [
    'version', 'kind', 'imageReference', 'imageDigest', 'volumeName', 'workspaceLabels',
    'workspaceLabelsDigest', 'workspaceResourceInstanceNonce',
    'workspaceResourceInstanceDigest', 'dependencyLabels', 'dependencyLabelsDigest',
    'dependencyResourceInstanceNonce', 'dependencyResourceInstanceDigest',
    'mountPlan', 'mountPlanDigest', 'dependencyPlan', 'dependencyPlanDigest',
    'inventoryPaths', 'inventoryPathCount', 'inventoryTotalPathBytes', 'inventoryDigest',
    'inventoryAdmissionReceiptDigest', 'inventoryRejectedPathCount',
    'inventoryRejectedPathsDigest', 'planDigest',
  ]);
  if (record === null || record.version !== 1
    || record.kind !== 'execution-effect-docker-workspace-plan'
    || !isDigest(record.workspaceLabelsDigest) || !isDigest(record.workspaceResourceInstanceDigest)
    || !isDigest(record.dependencyLabelsDigest)
    || !isDigest(record.dependencyResourceInstanceDigest) || !isDigest(record.mountPlanDigest)
    || !isDigest(record.dependencyPlanDigest) || !isDigest(record.inventoryDigest)
    || !isDigest(record.inventoryAdmissionReceiptDigest) || record.inventoryRejectedPathCount !== 0
    || !isDigest(record.inventoryRejectedPathsDigest) || !isDigest(record.planDigest)) return null;
  try {
    const recreated = createExecutionEffectDockerWorkspacePlanV1({
      imageReference: record.imageReference as string,
      imageDigest: record.imageDigest as Digest,
      volumeName: record.volumeName as string,
      baseLabels: Object.freeze(Object.fromEntries(
        Object.entries(record.workspaceLabels as Readonly<Record<string, string>>)
          .filter(([key]) => key !== RESOURCE_INSTANCE_LABEL && key !== RESOURCE_KIND_LABEL),
      )),
      workspaceResourceInstanceNonce: record.workspaceResourceInstanceNonce as string,
      dependencyResourceInstanceNonce: record.dependencyResourceInstanceNonce as string,
      mountPlan: record.mountPlan as ExecutionEffectDockerWorkspacePlanV1['mountPlan'],
      dependencyPlan: record.dependencyPlan as ExecutionEffectDockerWorkspacePlanV1['dependencyPlan'],
      inventoryPaths: record.inventoryPaths as readonly string[],
    });
    return sameCanonical(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export interface ExecutionEffectDockerImageObservationV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-image-observation';
  readonly state: 'VERIFIED';
  readonly authorityDigest: Digest;
  readonly imageReference: string;
  readonly imageDigest: Digest;
  readonly imageIdentityDigest: Digest;
  readonly observedAt: string;
  readonly receiptDigest: Digest;
}

export function createExecutionEffectDockerImageObservationV1(input: Omit<
  ExecutionEffectDockerImageObservationV1,
  'version' | 'kind' | 'state' | 'receiptDigest'
>): ExecutionEffectDockerImageObservationV1 {
  const record = exactRecord(input, [
    'authorityDigest', 'imageReference', 'imageDigest', 'imageIdentityDigest', 'observedAt',
  ]);
  if (record === null || !isDigest(record.authorityDigest)
    || typeof record.imageReference !== 'string' || !IMAGE_REFERENCE.test(record.imageReference)
    || Buffer.byteLength(record.imageReference, 'utf8') > MAX_IMAGE_REFERENCE_BYTES
    || !isDigest(record.imageDigest) || !record.imageReference.endsWith(`@${record.imageDigest}`)
    || !isDigest(record.imageIdentityDigest)
    || !isTimestamp(record.observedAt)) throw new TypeError('Invalid Docker image observation');
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-image-observation' as const,
    state: 'VERIFIED' as const,
    authorityDigest: record.authorityDigest,
    imageReference: record.imageReference,
    imageDigest: record.imageDigest,
    imageIdentityDigest: record.imageIdentityDigest,
    observedAt: record.observedAt,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest('execution-effect-docker-image-observation-v1', body),
  }) as ExecutionEffectDockerImageObservationV1;
}

function parseImageObservation(value: unknown): ExecutionEffectDockerImageObservationV1 | null {
  const record = exactRecord(value, [
    'version', 'kind', 'state', 'authorityDigest', 'imageReference', 'imageDigest',
    'imageIdentityDigest', 'observedAt', 'receiptDigest',
  ]);
  if (record === null || record.version !== 1
    || record.kind !== 'execution-effect-docker-image-observation'
    || record.state !== 'VERIFIED' || !isDigest(record.receiptDigest)) return null;
  try {
    const recreated = createExecutionEffectDockerImageObservationV1({
      authorityDigest: record.authorityDigest as Digest,
      imageReference: record.imageReference as string,
      imageDigest: record.imageDigest as Digest,
      imageIdentityDigest: record.imageIdentityDigest as Digest,
      observedAt: record.observedAt as string,
    });
    return sameCanonical(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export interface ExecutionEffectDockerDependencyAuthorityReceiptV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-dependency-authority-receipt';
  readonly state: 'READY';
  readonly authorityDigest: Digest;
  readonly imageObservationReceiptDigest: Digest;
  readonly imageIdentityDigest: Digest;
  readonly dependencyPlanDigest: Digest;
  readonly labelsDigest: Digest;
  readonly resourceInstanceDigest: Digest;
  readonly volumeName: string;
  readonly volumeIdentityDigest: Digest;
  readonly absenceObservationDigest: Digest;
  readonly creationReceiptDigest: Digest;
  readonly verifiedInspectDigest: Digest;
  readonly populationReceiptDigest: Digest;
  readonly dependencyTreeDigest: Digest;
  readonly daemonCreatedAt: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly receiptDigest: Digest;
}

export function createExecutionEffectDockerDependencyAuthorityReceiptV1(input: Omit<
  ExecutionEffectDockerDependencyAuthorityReceiptV1,
  'version' | 'kind' | 'state' | 'receiptDigest'
>): ExecutionEffectDockerDependencyAuthorityReceiptV1 {
  const record = exactRecord(input, [
    'authorityDigest', 'imageObservationReceiptDigest', 'imageIdentityDigest',
    'dependencyPlanDigest', 'labelsDigest', 'resourceInstanceDigest', 'volumeName',
    'volumeIdentityDigest', 'absenceObservationDigest', 'creationReceiptDigest',
    'verifiedInspectDigest', 'populationReceiptDigest', 'dependencyTreeDigest', 'daemonCreatedAt', 'startedAt',
    'completedAt',
  ]);
  if (record === null || !isDigest(record.authorityDigest)
    || !isDigest(record.imageObservationReceiptDigest) || !isDigest(record.imageIdentityDigest)
    || !isDigest(record.dependencyPlanDigest) || !isDigest(record.labelsDigest)
    || !isDigest(record.resourceInstanceDigest)
    || typeof record.volumeName !== 'string' || !DEPENDENCY_VOLUME_NAME.test(record.volumeName)
    || !isDigest(record.volumeIdentityDigest) || !isDigest(record.absenceObservationDigest)
    || !isDigest(record.creationReceiptDigest) || !isDigest(record.verifiedInspectDigest)
    || !isDigest(record.populationReceiptDigest) || !isDigest(record.dependencyTreeDigest)
    || !isExecutionEffectDockerDaemonTimestampV1(record.daemonCreatedAt)
    || !isTimestamp(record.startedAt)
    || !isTimestamp(record.completedAt)
    || !timestampAtOrAfter(record.completedAt, record.startedAt)) {
    throw new TypeError('Invalid Docker dependency authority receipt');
  }
  if (record.volumeIdentityDigest !== executionEffectDockerVolumeIdentityDigestV1({
    volumeName: record.volumeName as string,
    labelsDigest: record.labelsDigest as Digest,
    resourceInstanceDigest: record.resourceInstanceDigest as Digest,
    mountPlanDigest: record.dependencyPlanDigest as Digest,
    daemonCreatedAt: record.daemonCreatedAt as string,
  })) throw new TypeError('Invalid Docker dependency volume identity digest');
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-dependency-authority-receipt' as const,
    state: 'READY' as const,
    authorityDigest: record.authorityDigest,
    imageObservationReceiptDigest: record.imageObservationReceiptDigest,
    imageIdentityDigest: record.imageIdentityDigest,
    dependencyPlanDigest: record.dependencyPlanDigest,
    labelsDigest: record.labelsDigest,
    resourceInstanceDigest: record.resourceInstanceDigest,
    volumeName: record.volumeName,
    volumeIdentityDigest: record.volumeIdentityDigest,
    absenceObservationDigest: record.absenceObservationDigest,
    creationReceiptDigest: record.creationReceiptDigest,
    verifiedInspectDigest: record.verifiedInspectDigest,
    populationReceiptDigest: record.populationReceiptDigest,
    dependencyTreeDigest: record.dependencyTreeDigest,
    daemonCreatedAt: record.daemonCreatedAt,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest('execution-effect-docker-dependency-authority-receipt-v1', body),
  }) as ExecutionEffectDockerDependencyAuthorityReceiptV1;
}

function parseDependencyAuthorityReceipt(
  value: unknown,
): ExecutionEffectDockerDependencyAuthorityReceiptV1 | null {
  const record = exactRecord(value, [
    'version', 'kind', 'state', 'authorityDigest', 'imageObservationReceiptDigest',
    'imageIdentityDigest', 'dependencyPlanDigest', 'labelsDigest', 'resourceInstanceDigest', 'volumeName',
    'volumeIdentityDigest', 'absenceObservationDigest',
    'creationReceiptDigest', 'verifiedInspectDigest', 'populationReceiptDigest',
    'dependencyTreeDigest', 'daemonCreatedAt', 'startedAt', 'completedAt', 'receiptDigest',
  ]);
  if (record === null || record.version !== 1
    || record.kind !== 'execution-effect-docker-dependency-authority-receipt'
    || record.state !== 'READY' || !isDigest(record.receiptDigest)) return null;
  try {
    const recreated = createExecutionEffectDockerDependencyAuthorityReceiptV1({
      authorityDigest: record.authorityDigest as Digest,
      imageObservationReceiptDigest: record.imageObservationReceiptDigest as Digest,
      imageIdentityDigest: record.imageIdentityDigest as Digest,
      dependencyPlanDigest: record.dependencyPlanDigest as Digest,
      labelsDigest: record.labelsDigest as Digest,
      resourceInstanceDigest: record.resourceInstanceDigest as Digest,
      volumeName: record.volumeName as string,
      volumeIdentityDigest: record.volumeIdentityDigest as Digest,
      absenceObservationDigest: record.absenceObservationDigest as Digest,
      creationReceiptDigest: record.creationReceiptDigest as Digest,
      verifiedInspectDigest: record.verifiedInspectDigest as Digest,
      populationReceiptDigest: record.populationReceiptDigest as Digest,
      dependencyTreeDigest: record.dependencyTreeDigest as Digest,
      daemonCreatedAt: record.daemonCreatedAt as string,
      startedAt: record.startedAt as string,
      completedAt: record.completedAt as string,
    });
    return sameCanonical(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export type ExecutionEffectDockerVolumeObservationV1 =
  | Readonly<{
    readonly version: 1;
    readonly kind: 'execution-effect-docker-volume-observation';
    readonly state: 'ABSENT';
    readonly authorityDigest: Digest;
    readonly volumeName: string;
    readonly resourceInstanceDigest: Digest;
    readonly observedAt: string;
    readonly observationDigest: Digest;
  }>
  | Readonly<{
    readonly version: 1;
    readonly kind: 'execution-effect-docker-volume-observation';
    readonly state: 'PRESENT';
    readonly authorityDigest: Digest;
    readonly volumeName: string;
    readonly driver: 'local';
    readonly scope: 'local';
    readonly labelsDigest: Digest;
    readonly resourceInstanceDigest: Digest;
    readonly mountPlanDigest: Digest;
    readonly volumeIdentityDigest: Digest;
    readonly daemonCreatedAt: string;
    readonly observedAt: string;
    readonly observationDigest: Digest;
  }>;

export function executionEffectDockerVolumeIdentityDigestV1(input: Readonly<{
  readonly volumeName: string;
  readonly labelsDigest: Digest;
  readonly resourceInstanceDigest: Digest;
  readonly mountPlanDigest: Digest;
  readonly daemonCreatedAt: string;
}>): Digest {
  const record = exactRecord(input, [
    'volumeName', 'labelsDigest', 'resourceInstanceDigest', 'mountPlanDigest', 'daemonCreatedAt',
  ]);
  if (!record || !VOLUME_NAME.test(record.volumeName as string)
    || !isDigest(record.labelsDigest) || !isDigest(record.resourceInstanceDigest)
    || !isDigest(record.mountPlanDigest)
    || !isExecutionEffectDockerDaemonTimestampV1(record.daemonCreatedAt)) {
    throw new TypeError('Invalid Docker volume identity authority');
  }
  return digest('execution-effect-docker-volume-identity-v1', Object.freeze({
    volumeName: record.volumeName,
    labelsDigest: record.labelsDigest,
    resourceInstanceDigest: record.resourceInstanceDigest,
    mountPlanDigest: record.mountPlanDigest,
    daemonCreatedAt: record.daemonCreatedAt,
  }));
}

/**
 * Stable identity for the canonical root of one daemon-verified workspace volume.
 * Native root identities remain capture-local because Linux mount ids are namespace-local.
 */
export function executionEffectDockerWorkspaceDirectoryIdentityDigestV1(input: Readonly<{
  readonly volumeIdentityDigest: Digest;
}>): Digest {
  const record = exactRecord(input, ['volumeIdentityDigest']);
  if (!record || !isDigest(record.volumeIdentityDigest)) {
    throw new TypeError('Invalid Docker workspace directory identity authority');
  }
  return digest('execution-effect-docker-workspace-directory-identity-v1', Object.freeze({
    volumeIdentityDigest: record.volumeIdentityDigest,
    mountTarget: HELPER_MOUNT_TARGET,
    rootPath: '.',
  }));
}

export function createExecutionEffectDockerVolumeObservationV1(input: Readonly<{
  readonly state: 'ABSENT' | 'PRESENT';
  readonly authorityDigest: Digest;
  readonly volumeName: string;
  readonly resourceInstanceDigest: Digest;
  readonly driver?: 'local';
  readonly scope?: 'local';
  readonly labelsDigest?: Digest;
  readonly mountPlanDigest?: Digest;
  readonly volumeIdentityDigest?: Digest;
  readonly daemonCreatedAt?: string;
  readonly observedAt: string;
}>): ExecutionEffectDockerVolumeObservationV1 {
  const absent = exactRecord(input, [
    'state', 'authorityDigest', 'volumeName', 'resourceInstanceDigest', 'observedAt',
  ]);
  const present = exactRecord(input, [
    'state', 'authorityDigest', 'volumeName', 'driver', 'scope', 'labelsDigest',
    'resourceInstanceDigest',
    'mountPlanDigest', 'volumeIdentityDigest', 'daemonCreatedAt', 'observedAt',
  ]);
  if (!isDigest(input.authorityDigest) || !VOLUME_NAME.test(input.volumeName)
    || !isDigest(input.resourceInstanceDigest)
    || !isTimestamp(input.observedAt)) throw new TypeError('Invalid Docker volume observation');
  if (input.state === 'ABSENT' && absent !== null) {
    const body = Object.freeze({
      version: 1 as const,
      kind: 'execution-effect-docker-volume-observation' as const,
      state: 'ABSENT' as const,
      authorityDigest: input.authorityDigest,
      volumeName: input.volumeName,
      resourceInstanceDigest: input.resourceInstanceDigest,
      observedAt: input.observedAt,
    });
    return Object.freeze({
      ...body,
      observationDigest: digest('execution-effect-docker-volume-observation-v1', body),
    });
  }
  if (input.state !== 'PRESENT' || present === null || input.driver !== 'local'
    || input.scope !== 'local' || !isDigest(input.labelsDigest)
    || !isDigest(input.mountPlanDigest) || !isDigest(input.volumeIdentityDigest)
    || !isExecutionEffectDockerDaemonTimestampV1(input.daemonCreatedAt)) {
    throw new TypeError('Invalid Docker volume observation');
  }
  if (input.volumeIdentityDigest !== executionEffectDockerVolumeIdentityDigestV1({
    volumeName: input.volumeName,
    labelsDigest: input.labelsDigest,
    resourceInstanceDigest: input.resourceInstanceDigest,
    mountPlanDigest: input.mountPlanDigest,
    daemonCreatedAt: input.daemonCreatedAt,
  })) throw new TypeError('Invalid Docker volume identity digest');
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-volume-observation' as const,
    state: 'PRESENT' as const,
    authorityDigest: input.authorityDigest,
    volumeName: input.volumeName,
    driver: 'local' as const,
    scope: 'local' as const,
    labelsDigest: input.labelsDigest,
    resourceInstanceDigest: input.resourceInstanceDigest,
    mountPlanDigest: input.mountPlanDigest,
    volumeIdentityDigest: input.volumeIdentityDigest,
    daemonCreatedAt: input.daemonCreatedAt,
    observedAt: input.observedAt,
  });
  return Object.freeze({
    ...body,
    observationDigest: digest('execution-effect-docker-volume-observation-v1', body),
  });
}

export function parseExecutionEffectDockerVolumeObservationV1(
  value: unknown,
): ExecutionEffectDockerVolumeObservationV1 | null {
  const state = exactRecord(value, [
    'version', 'kind', 'state', 'authorityDigest', 'volumeName', 'resourceInstanceDigest', 'observedAt',
    'observationDigest',
  ])?.state ?? exactRecord(value, [
    'version', 'kind', 'state', 'authorityDigest', 'volumeName', 'driver', 'scope',
    'labelsDigest', 'resourceInstanceDigest', 'mountPlanDigest', 'volumeIdentityDigest', 'daemonCreatedAt', 'observedAt',
    'observationDigest',
  ])?.state;
  const record = state === 'ABSENT'
    ? exactRecord(value, [
      'version', 'kind', 'state', 'authorityDigest', 'volumeName', 'resourceInstanceDigest', 'observedAt',
      'observationDigest',
    ])
    : exactRecord(value, [
      'version', 'kind', 'state', 'authorityDigest', 'volumeName', 'driver', 'scope',
      'labelsDigest', 'resourceInstanceDigest', 'mountPlanDigest', 'volumeIdentityDigest', 'daemonCreatedAt', 'observedAt',
      'observationDigest',
    ]);
  if (record === null || record.version !== 1
    || record.kind !== 'execution-effect-docker-volume-observation'
    || !isDigest(record.observationDigest)) return null;
  try {
    const recreated = state === 'ABSENT'
      ? createExecutionEffectDockerVolumeObservationV1({
        state: 'ABSENT',
        authorityDigest: record.authorityDigest as Digest,
        volumeName: record.volumeName as string,
        resourceInstanceDigest: record.resourceInstanceDigest as Digest,
        observedAt: record.observedAt as string,
      })
      : createExecutionEffectDockerVolumeObservationV1({
        state: 'PRESENT',
        authorityDigest: record.authorityDigest as Digest,
        volumeName: record.volumeName as string,
        driver: record.driver as 'local',
        scope: record.scope as 'local',
        labelsDigest: record.labelsDigest as Digest,
        resourceInstanceDigest: record.resourceInstanceDigest as Digest,
        mountPlanDigest: record.mountPlanDigest as Digest,
        volumeIdentityDigest: record.volumeIdentityDigest as Digest,
        daemonCreatedAt: record.daemonCreatedAt as string,
        observedAt: record.observedAt as string,
      });
    return sameCanonical(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export interface ExecutionEffectDockerVolumeCreationReceiptV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-volume-creation-receipt';
  readonly state: 'CREATED';
  readonly authorityDigest: Digest;
  readonly absenceObservationDigest: Digest;
  readonly volumeName: string;
  readonly labelsDigest: Digest;
  readonly resourceInstanceDigest: Digest;
  readonly mountPlanDigest: Digest;
  readonly volumeIdentityDigest: Digest;
  readonly createRequestedAt: string;
  readonly createCompletedAt: string;
  readonly daemonCreatedAt: string;
  readonly receiptDigest: Digest;
}

export function createExecutionEffectDockerVolumeCreationReceiptV1(input: Omit<
  ExecutionEffectDockerVolumeCreationReceiptV1,
  'version' | 'kind' | 'state' | 'receiptDigest'
>): ExecutionEffectDockerVolumeCreationReceiptV1 {
  const record = exactRecord(input, [
    'authorityDigest', 'absenceObservationDigest', 'volumeName', 'labelsDigest',
    'resourceInstanceDigest',
    'mountPlanDigest', 'volumeIdentityDigest', 'createRequestedAt', 'createCompletedAt',
    'daemonCreatedAt',
  ]);
  if (record === null || !isDigest(record.authorityDigest)
    || !isDigest(record.absenceObservationDigest) || !VOLUME_NAME.test(record.volumeName as string)
    || !isDigest(record.labelsDigest) || !isDigest(record.resourceInstanceDigest)
    || !isDigest(record.mountPlanDigest)
    || !isDigest(record.volumeIdentityDigest) || !isTimestamp(record.createRequestedAt)
    || !isTimestamp(record.createCompletedAt)
    || !isExecutionEffectDockerDaemonTimestampV1(record.daemonCreatedAt)
    || !timestampAtOrAfter(record.createCompletedAt, record.createRequestedAt)) {
    throw new TypeError('Invalid Docker volume creation receipt');
  }
  if (record.volumeIdentityDigest !== executionEffectDockerVolumeIdentityDigestV1({
    volumeName: record.volumeName as string,
    labelsDigest: record.labelsDigest as Digest,
    resourceInstanceDigest: record.resourceInstanceDigest as Digest,
    mountPlanDigest: record.mountPlanDigest as Digest,
    daemonCreatedAt: record.daemonCreatedAt as string,
  })) throw new TypeError('Invalid Docker volume creation identity digest');
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-volume-creation-receipt' as const,
    state: 'CREATED' as const,
    authorityDigest: record.authorityDigest,
    absenceObservationDigest: record.absenceObservationDigest,
    volumeName: record.volumeName as string,
    labelsDigest: record.labelsDigest,
    resourceInstanceDigest: record.resourceInstanceDigest,
    mountPlanDigest: record.mountPlanDigest,
    volumeIdentityDigest: record.volumeIdentityDigest,
    createRequestedAt: record.createRequestedAt as string,
    createCompletedAt: record.createCompletedAt as string,
    daemonCreatedAt: record.daemonCreatedAt as string,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest('execution-effect-docker-volume-creation-receipt-v1', body),
  }) as ExecutionEffectDockerVolumeCreationReceiptV1;
}

function parseVolumeCreationReceipt(
  value: unknown,
): ExecutionEffectDockerVolumeCreationReceiptV1 | null {
  const record = exactRecord(value, [
    'version', 'kind', 'state', 'authorityDigest', 'absenceObservationDigest', 'volumeName',
    'labelsDigest', 'resourceInstanceDigest', 'mountPlanDigest', 'volumeIdentityDigest',
    'createRequestedAt', 'createCompletedAt', 'daemonCreatedAt', 'receiptDigest',
  ]);
  if (record === null || record.version !== 1
    || record.kind !== 'execution-effect-docker-volume-creation-receipt'
    || record.state !== 'CREATED' || !isDigest(record.receiptDigest)) return null;
  try {
    const recreated = createExecutionEffectDockerVolumeCreationReceiptV1({
      authorityDigest: record.authorityDigest as Digest,
      absenceObservationDigest: record.absenceObservationDigest as Digest,
      volumeName: record.volumeName as string,
      labelsDigest: record.labelsDigest as Digest,
      resourceInstanceDigest: record.resourceInstanceDigest as Digest,
      mountPlanDigest: record.mountPlanDigest as Digest,
      volumeIdentityDigest: record.volumeIdentityDigest as Digest,
      createRequestedAt: record.createRequestedAt as string,
      createCompletedAt: record.createCompletedAt as string,
      daemonCreatedAt: record.daemonCreatedAt as string,
    });
    return sameCanonical(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export type ExecutionEffectDockerLifecycleCaptureOperationV1 =
  | 'POPULATION_BASELINE'
  | 'BASELINE_REVALIDATION'
  | 'FINAL_QUIESCENCE_FIRST'
  | 'FINAL_QUIESCENCE_SECOND';

export interface ExecutionEffectDockerLifecycleCaptureReceiptV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-lifecycle-capture-receipt';
  readonly state: 'VERIFIED';
  readonly operation: ExecutionEffectDockerLifecycleCaptureOperationV1;
  readonly authorityDigest: Digest;
  readonly phase: 'baseline' | 'final';
  readonly volumeName: string;
  readonly volumeIdentityDigest: Digest;
  readonly workspaceIdentity: ExecutionEffectManifest['workspaceIdentity'];
  readonly nativeManifestDigest: Digest;
  readonly manifestStateDigest: Digest;
  readonly rootObjectIdentityDigest: Digest;
  readonly entryCount: number;
  readonly totalBytes: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly deadlineAt: string;
  readonly receiptDigest: Digest;
}

export function createExecutionEffectDockerLifecycleCaptureReceiptV1(input: Omit<
  ExecutionEffectDockerLifecycleCaptureReceiptV1,
  'version' | 'kind' | 'state' | 'receiptDigest'
>): ExecutionEffectDockerLifecycleCaptureReceiptV1 {
  const record = exactRecord(input, [
    'operation', 'authorityDigest', 'phase', 'volumeName', 'volumeIdentityDigest',
    'workspaceIdentity', 'nativeManifestDigest', 'manifestStateDigest',
    'rootObjectIdentityDigest', 'entryCount', 'totalBytes', 'startedAt', 'completedAt',
    'deadlineAt',
  ]);
  const workspaceIdentity = snapshotWorkspaceIdentity(record?.workspaceIdentity);
  const operation = record?.operation;
  const phase = record?.phase;
  if (record === null || workspaceIdentity === null
    || (operation !== 'POPULATION_BASELINE' && operation !== 'BASELINE_REVALIDATION'
      && operation !== 'FINAL_QUIESCENCE_FIRST' && operation !== 'FINAL_QUIESCENCE_SECOND')
    || (phase !== 'baseline' && phase !== 'final')
    || operation.startsWith('FINAL_QUIESCENCE_') !== (phase === 'final')
    || !isDigest(record.authorityDigest) || !VOLUME_NAME.test(record.volumeName as string)
    || !isDigest(record.volumeIdentityDigest) || !isDigest(record.nativeManifestDigest)
    || !isDigest(record.manifestStateDigest)
    || !isDigest(record.rootObjectIdentityDigest)
    || workspaceIdentity.filesystemId !== record.volumeIdentityDigest
    || workspaceIdentity.directoryId
      !== executionEffectDockerWorkspaceDirectoryIdentityDigestV1({
        volumeIdentityDigest: record.volumeIdentityDigest as Digest,
      })
    || workspaceIdentity.rootHandleEvidenceDigest !== record.rootObjectIdentityDigest
    || !Number.isSafeInteger(record.entryCount) || (record.entryCount as number) < 0
    || (record.entryCount as number) > EXECUTION_EFFECT_CAPTURE_HARD_LIMITS.maxEntries
    || !Number.isSafeInteger(record.totalBytes) || (record.totalBytes as number) < 0
    || (record.totalBytes as number) > EXECUTION_EFFECT_CAPTURE_HARD_LIMITS.maxTotalBytes
    || !isTimestamp(record.startedAt) || !isTimestamp(record.completedAt)
    || !isTimestamp(record.deadlineAt)
    || !timestampAtOrAfter(record.completedAt, record.startedAt)
    || !timestampAtOrAfter(record.deadlineAt, record.completedAt)) {
    throw new TypeError('Invalid Docker lifecycle capture receipt');
  }
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-lifecycle-capture-receipt' as const,
    state: 'VERIFIED' as const,
    operation,
    authorityDigest: record.authorityDigest,
    phase,
    volumeName: record.volumeName as string,
    volumeIdentityDigest: record.volumeIdentityDigest,
    workspaceIdentity,
    nativeManifestDigest: record.nativeManifestDigest,
    manifestStateDigest: record.manifestStateDigest,
    rootObjectIdentityDigest: record.rootObjectIdentityDigest,
    entryCount: record.entryCount as number,
    totalBytes: record.totalBytes as number,
    startedAt: record.startedAt as string,
    completedAt: record.completedAt as string,
    deadlineAt: record.deadlineAt as string,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest('execution-effect-docker-lifecycle-capture-receipt-v1', body),
  }) as ExecutionEffectDockerLifecycleCaptureReceiptV1;
}

function parseCaptureReceipt(
  value: unknown,
): ExecutionEffectDockerLifecycleCaptureReceiptV1 | null {
  const record = exactRecord(value, [
    'version', 'kind', 'state', 'operation', 'authorityDigest', 'phase', 'volumeName',
    'volumeIdentityDigest', 'workspaceIdentity', 'nativeManifestDigest',
    'manifestStateDigest', 'rootObjectIdentityDigest', 'entryCount', 'totalBytes',
    'startedAt', 'completedAt', 'deadlineAt', 'receiptDigest',
  ]);
  if (record === null || record.version !== 1
    || record.kind !== 'execution-effect-docker-lifecycle-capture-receipt'
    || record.state !== 'VERIFIED' || !isDigest(record.receiptDigest)) return null;
  try {
    const recreated = createExecutionEffectDockerLifecycleCaptureReceiptV1({
      operation: record.operation as ExecutionEffectDockerLifecycleCaptureOperationV1,
      authorityDigest: record.authorityDigest as Digest,
      phase: record.phase as 'baseline' | 'final',
      volumeName: record.volumeName as string,
      volumeIdentityDigest: record.volumeIdentityDigest as Digest,
      workspaceIdentity: record.workspaceIdentity as ExecutionEffectManifest['workspaceIdentity'],
      nativeManifestDigest: record.nativeManifestDigest as Digest,
      manifestStateDigest: record.manifestStateDigest as Digest,
      rootObjectIdentityDigest: record.rootObjectIdentityDigest as Digest,
      entryCount: record.entryCount as number,
      totalBytes: record.totalBytes as number,
      startedAt: record.startedAt as string,
      completedAt: record.completedAt as string,
      deadlineAt: record.deadlineAt as string,
    });
    return sameCanonical(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export interface ExecutionEffectDockerPopulationReceiptV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-population-receipt';
  readonly state: 'POPULATED';
  readonly authorityDigest: Digest;
  readonly volumeName: string;
  readonly volumeIdentityDigest: Digest;
  readonly inventoryDigest: Digest;
  readonly inventoryAdmissionReceiptDigest: Digest;
  readonly dependencyPlanDigest: Digest;
  readonly dependencyAuthorityReceiptDigest: Digest;
  readonly rejectedPathCount: 0;
  readonly rejectedPathsDigest: Digest;
  readonly captureReceiptDigest: Digest;
  readonly populatedPathCount: number;
  readonly sourcePreManifestDigest: Digest;
  readonly destinationManifestDigest: Digest;
  readonly sourcePostManifestDigest: Digest;
  readonly manifestEntryCount: number;
  readonly manifestTotalBytes: number;
  readonly completedAt: string;
  readonly receiptDigest: Digest;
}

export function createExecutionEffectDockerPopulationReceiptV1(input: Omit<
  ExecutionEffectDockerPopulationReceiptV1,
  'version' | 'kind' | 'state' | 'receiptDigest'
>): ExecutionEffectDockerPopulationReceiptV1 {
  const record = exactRecord(input, [
    'authorityDigest', 'volumeName', 'volumeIdentityDigest', 'inventoryDigest',
    'inventoryAdmissionReceiptDigest', 'dependencyPlanDigest', 'dependencyAuthorityReceiptDigest',
    'rejectedPathCount', 'rejectedPathsDigest', 'captureReceiptDigest', 'populatedPathCount',
    'sourcePreManifestDigest', 'destinationManifestDigest', 'sourcePostManifestDigest',
    'manifestEntryCount', 'manifestTotalBytes',
    'completedAt',
  ]);
  if (record === null || !isDigest(record.authorityDigest)
    || !VOLUME_NAME.test(record.volumeName as string) || !isDigest(record.volumeIdentityDigest)
    || !isDigest(record.inventoryDigest) || !isDigest(record.inventoryAdmissionReceiptDigest)
    || !isDigest(record.dependencyPlanDigest) || record.rejectedPathCount !== 0
    || !isDigest(record.dependencyAuthorityReceiptDigest)
    || !isDigest(record.rejectedPathsDigest) || !isDigest(record.captureReceiptDigest)
    || !Number.isSafeInteger(record.populatedPathCount) || (record.populatedPathCount as number) < 0
    || (record.populatedPathCount as number) > EXECUTION_EFFECT_PORTABLE_PATH_LIMITS.maxEntries
    || !isDigest(record.sourcePreManifestDigest) || !isDigest(record.destinationManifestDigest)
    || !isDigest(record.sourcePostManifestDigest)
    || record.sourcePreManifestDigest !== record.destinationManifestDigest
    || record.destinationManifestDigest !== record.sourcePostManifestDigest
    || !Number.isSafeInteger(record.manifestEntryCount)
    || (record.manifestEntryCount as number) < 0
    || (record.manifestEntryCount as number) > EXECUTION_EFFECT_CAPTURE_HARD_LIMITS.maxEntries
    || !Number.isSafeInteger(record.manifestTotalBytes)
    || (record.manifestTotalBytes as number) < 0
    || (record.manifestTotalBytes as number) > EXECUTION_EFFECT_CAPTURE_HARD_LIMITS.maxTotalBytes
    || !isTimestamp(record.completedAt)) throw new TypeError('Invalid Docker population receipt');
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-population-receipt' as const,
    state: 'POPULATED' as const,
    authorityDigest: record.authorityDigest,
    volumeName: record.volumeName as string,
    volumeIdentityDigest: record.volumeIdentityDigest,
    inventoryDigest: record.inventoryDigest,
    inventoryAdmissionReceiptDigest: record.inventoryAdmissionReceiptDigest,
    dependencyPlanDigest: record.dependencyPlanDigest,
    dependencyAuthorityReceiptDigest: record.dependencyAuthorityReceiptDigest,
    rejectedPathCount: 0 as const,
    rejectedPathsDigest: record.rejectedPathsDigest,
    captureReceiptDigest: record.captureReceiptDigest,
    populatedPathCount: record.populatedPathCount as number,
    sourcePreManifestDigest: record.sourcePreManifestDigest,
    destinationManifestDigest: record.destinationManifestDigest,
    sourcePostManifestDigest: record.sourcePostManifestDigest,
    manifestEntryCount: record.manifestEntryCount as number,
    manifestTotalBytes: record.manifestTotalBytes as number,
    completedAt: record.completedAt as string,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest('execution-effect-docker-population-receipt-v1', body),
  }) as ExecutionEffectDockerPopulationReceiptV1;
}

function parsePopulationReceipt(value: unknown): ExecutionEffectDockerPopulationReceiptV1 | null {
  const record = exactRecord(value, [
    'version', 'kind', 'state', 'authorityDigest', 'volumeName', 'volumeIdentityDigest',
    'inventoryDigest', 'inventoryAdmissionReceiptDigest', 'dependencyPlanDigest',
    'dependencyAuthorityReceiptDigest', 'rejectedPathCount', 'rejectedPathsDigest',
    'captureReceiptDigest', 'populatedPathCount', 'sourcePreManifestDigest',
    'destinationManifestDigest', 'sourcePostManifestDigest', 'manifestEntryCount',
    'manifestTotalBytes', 'completedAt', 'receiptDigest',
  ]);
  if (record === null || record.version !== 1
    || record.kind !== 'execution-effect-docker-population-receipt'
    || record.state !== 'POPULATED' || !isDigest(record.receiptDigest)) return null;
  try {
    const recreated = createExecutionEffectDockerPopulationReceiptV1({
      authorityDigest: record.authorityDigest as Digest,
      volumeName: record.volumeName as string,
      volumeIdentityDigest: record.volumeIdentityDigest as Digest,
      inventoryDigest: record.inventoryDigest as Digest,
      inventoryAdmissionReceiptDigest: record.inventoryAdmissionReceiptDigest as Digest,
      dependencyPlanDigest: record.dependencyPlanDigest as Digest,
      dependencyAuthorityReceiptDigest: record.dependencyAuthorityReceiptDigest as Digest,
      rejectedPathCount: record.rejectedPathCount as 0,
      rejectedPathsDigest: record.rejectedPathsDigest as Digest,
      captureReceiptDigest: record.captureReceiptDigest as Digest,
      populatedPathCount: record.populatedPathCount as number,
      sourcePreManifestDigest: record.sourcePreManifestDigest as Digest,
      destinationManifestDigest: record.destinationManifestDigest as Digest,
      sourcePostManifestDigest: record.sourcePostManifestDigest as Digest,
      manifestEntryCount: record.manifestEntryCount as number,
      manifestTotalBytes: record.manifestTotalBytes as number,
      completedAt: record.completedAt as string,
    });
    return sameCanonical(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export interface ExecutionEffectDockerRawCaptureV1 {
  readonly workspaceIdentity: ExecutionEffectManifest['workspaceIdentity'];
  readonly rootEntry: ExecutionEffectNativeCaptureEntryV1;
  readonly nativeCapture: ExecutionEffectNativeCaptureTreeV1;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly deadlineAt: string;
  readonly receipt: ExecutionEffectDockerLifecycleCaptureReceiptV1;
}

export interface ExecutionEffectDockerPopulationResultV1 {
  readonly populationReceipt: ExecutionEffectDockerPopulationReceiptV1;
  readonly capture: ExecutionEffectDockerRawCaptureV1;
}

export type ExecutionEffectDockerExclusiveAttachmentPhaseV1 =
  | 'PRE_PROVIDER_START'
  | 'POST_PROVIDER_STOP';

export interface ExecutionEffectDockerExclusiveAttachmentReceiptV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-exclusive-attachment-receipt';
  readonly state: 'QUIESCENT';
  readonly phase: ExecutionEffectDockerExclusiveAttachmentPhaseV1;
  readonly authorityDigest: Digest;
  readonly workspaceVolumeName: string;
  readonly workspaceVolumeIdentityDigest: Digest;
  readonly dependencyVolumeName: string;
  readonly dependencyVolumeIdentityDigest: Digest;
  readonly attachedContainerCount: 0;
  readonly attachedContainerIdentitySetDigest: Digest;
  readonly observedAt: string;
  readonly receiptDigest: Digest;
}

export function createExecutionEffectDockerExclusiveAttachmentReceiptV1(input: Omit<
  ExecutionEffectDockerExclusiveAttachmentReceiptV1,
  'version' | 'kind' | 'state' | 'attachedContainerCount'
  | 'attachedContainerIdentitySetDigest' | 'receiptDigest'
>): ExecutionEffectDockerExclusiveAttachmentReceiptV1 {
  const record = exactRecord(input, [
    'phase', 'authorityDigest', 'workspaceVolumeName', 'workspaceVolumeIdentityDigest',
    'dependencyVolumeName', 'dependencyVolumeIdentityDigest', 'observedAt',
  ]);
  if (record === null
    || (record.phase !== 'PRE_PROVIDER_START' && record.phase !== 'POST_PROVIDER_STOP')
    || !isDigest(record.authorityDigest)
    || typeof record.workspaceVolumeName !== 'string'
    || !WORKSPACE_VOLUME_NAME.test(record.workspaceVolumeName)
    || !isDigest(record.workspaceVolumeIdentityDigest)
    || typeof record.dependencyVolumeName !== 'string'
    || !DEPENDENCY_VOLUME_NAME.test(record.dependencyVolumeName)
    || !isDigest(record.dependencyVolumeIdentityDigest)
    || !isTimestamp(record.observedAt)) {
    throw new TypeError('Invalid Docker exclusive attachment receipt');
  }
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-exclusive-attachment-receipt' as const,
    state: 'QUIESCENT' as const,
    phase: record.phase,
    authorityDigest: record.authorityDigest,
    workspaceVolumeName: record.workspaceVolumeName,
    workspaceVolumeIdentityDigest: record.workspaceVolumeIdentityDigest,
    dependencyVolumeName: record.dependencyVolumeName,
    dependencyVolumeIdentityDigest: record.dependencyVolumeIdentityDigest,
    attachedContainerCount: 0 as const,
    attachedContainerIdentitySetDigest: digest(
      'execution-effect-docker-attached-container-identity-set-v1',
      [],
    ),
    observedAt: record.observedAt,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest('execution-effect-docker-exclusive-attachment-receipt-v1', body),
  }) as ExecutionEffectDockerExclusiveAttachmentReceiptV1;
}

function parseExclusiveAttachmentReceipt(
  value: unknown,
): ExecutionEffectDockerExclusiveAttachmentReceiptV1 | null {
  const record = exactRecord(value, [
    'version', 'kind', 'state', 'phase', 'authorityDigest', 'workspaceVolumeName',
    'workspaceVolumeIdentityDigest', 'dependencyVolumeName', 'dependencyVolumeIdentityDigest',
    'attachedContainerCount', 'attachedContainerIdentitySetDigest', 'observedAt', 'receiptDigest',
  ]);
  if (record === null || record.version !== 1
    || record.kind !== 'execution-effect-docker-exclusive-attachment-receipt'
    || record.state !== 'QUIESCENT' || record.attachedContainerCount !== 0
    || !isDigest(record.attachedContainerIdentitySetDigest) || !isDigest(record.receiptDigest)) {
    return null;
  }
  try {
    const recreated = createExecutionEffectDockerExclusiveAttachmentReceiptV1({
      phase: record.phase as ExecutionEffectDockerExclusiveAttachmentPhaseV1,
      authorityDigest: record.authorityDigest as Digest,
      workspaceVolumeName: record.workspaceVolumeName as string,
      workspaceVolumeIdentityDigest: record.workspaceVolumeIdentityDigest as Digest,
      dependencyVolumeName: record.dependencyVolumeName as string,
      dependencyVolumeIdentityDigest: record.dependencyVolumeIdentityDigest as Digest,
      observedAt: record.observedAt as string,
    });
    return sameCanonical(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export interface ExecutionEffectDockerQuiescenceSealV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-quiescence-seal';
  readonly state: 'SEALED';
  readonly authorityDigest: Digest;
  readonly attachmentReceiptDigest: Digest;
  readonly firstCaptureReceiptDigest: Digest;
  readonly secondCaptureReceiptDigest: Digest;
  readonly manifestStateDigest: Digest;
  readonly sealedAt: string;
  readonly sealDigest: Digest;
}

export function createExecutionEffectDockerQuiescenceSealV1(input: Readonly<{
  readonly authorityDigest: Digest;
  readonly attachmentReceiptDigest: Digest;
  readonly firstCaptureReceiptDigest: Digest;
  readonly secondCaptureReceiptDigest: Digest;
  readonly firstManifestStateDigest: Digest;
  readonly secondManifestStateDigest: Digest;
  readonly sealedAt: string;
}>): ExecutionEffectDockerQuiescenceSealV1 {
  const record = exactRecord(input, [
    'authorityDigest', 'attachmentReceiptDigest', 'firstCaptureReceiptDigest',
    'secondCaptureReceiptDigest', 'firstManifestStateDigest', 'secondManifestStateDigest', 'sealedAt',
  ]);
  if (record === null || !isDigest(record.authorityDigest)
    || !isDigest(record.attachmentReceiptDigest) || !isDigest(record.firstCaptureReceiptDigest)
    || !isDigest(record.secondCaptureReceiptDigest) || !isDigest(record.firstManifestStateDigest)
    || record.secondManifestStateDigest !== record.firstManifestStateDigest
    || !isTimestamp(record.sealedAt)) throw new TypeError('Invalid Docker quiescence seal');
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-quiescence-seal' as const,
    state: 'SEALED' as const,
    authorityDigest: record.authorityDigest,
    attachmentReceiptDigest: record.attachmentReceiptDigest,
    firstCaptureReceiptDigest: record.firstCaptureReceiptDigest,
    secondCaptureReceiptDigest: record.secondCaptureReceiptDigest,
    manifestStateDigest: record.firstManifestStateDigest,
    sealedAt: record.sealedAt,
  });
  return Object.freeze({
    ...body,
    sealDigest: digest('execution-effect-docker-quiescence-seal-v1', body),
  }) as ExecutionEffectDockerQuiescenceSealV1;
}

function parseQuiescenceSeal(value: unknown): ExecutionEffectDockerQuiescenceSealV1 | null {
  const record = exactRecord(value, [
    'version', 'kind', 'state', 'authorityDigest', 'attachmentReceiptDigest',
    'firstCaptureReceiptDigest', 'secondCaptureReceiptDigest', 'manifestStateDigest',
    'sealedAt', 'sealDigest',
  ]);
  if (record === null || record.version !== 1
    || record.kind !== 'execution-effect-docker-quiescence-seal' || record.state !== 'SEALED'
    || !isDigest(record.sealDigest)) return null;
  try {
    const recreated = createExecutionEffectDockerQuiescenceSealV1({
      authorityDigest: record.authorityDigest as Digest,
      attachmentReceiptDigest: record.attachmentReceiptDigest as Digest,
      firstCaptureReceiptDigest: record.firstCaptureReceiptDigest as Digest,
      secondCaptureReceiptDigest: record.secondCaptureReceiptDigest as Digest,
      firstManifestStateDigest: record.manifestStateDigest as Digest,
      secondManifestStateDigest: record.manifestStateDigest as Digest,
      sealedAt: record.sealedAt as string,
    });
    return sameCanonical(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export interface ExecutionEffectDockerLifecycleAdapterV1 {
  /** Restart-only observation for a durable ALLOCATING write-ahead authority. */
  inspectAllocationResources?(input: Readonly<{
    readonly authorityDigest: Digest;
    readonly workspacePlan: ExecutionEffectDockerWorkspacePlanV1;
  }>): Promise<unknown>;
  inspectImage(input: Readonly<{
    readonly authorityDigest: Digest;
    readonly imageReference: string;
    readonly expectedImageDigest: Digest;
    readonly dependencyPlanDigest: Digest;
  }>): Promise<unknown>;
  prepareDependencies(input: Readonly<{
    readonly authorityDigest: Digest;
    readonly imageReference: string;
    readonly imageDigest: Digest;
    readonly imageIdentityDigest: Digest;
    readonly imageObservationReceiptDigest: Digest;
    readonly labels: Readonly<Record<string, string>>;
    readonly labelsDigest: Digest;
    readonly resourceInstanceDigest: Digest;
    readonly dependencyPlan: ExecutionEffectDockerWorkspacePlanV1['dependencyPlan'];
    readonly dependencyPlanDigest: Digest;
  }>): Promise<unknown>;
  verifyExclusiveAttachments(input: Readonly<{
    readonly phase: ExecutionEffectDockerExclusiveAttachmentPhaseV1;
    readonly authorityDigest: Digest;
    readonly workspaceVolumeName: string;
    readonly workspaceVolumeIdentityDigest: Digest;
    readonly dependencyVolumeName: string;
    readonly dependencyVolumeIdentityDigest: Digest;
    readonly workspacePlan: ExecutionEffectDockerWorkspacePlanV1;
    readonly dependencyAuthority: ExecutionEffectDockerDependencyAuthorityReceiptV1;
    readonly expectedAttachedContainerIdentityDigests: readonly [];
  }>): Promise<unknown>;
  inspectVolume(input: Readonly<{
    readonly phase: 'EXPECT_ABSENT' | 'VERIFY_CREATED';
    readonly authorityDigest: Digest;
    readonly plan: ExecutionEffectDockerWorkspacePlanV1;
    readonly creationReceiptDigest: Digest | null;
  }>): Promise<unknown>;
  /** Restart-only live identity observation; normal preparation never calls this method. */
  inspectDependencyVolume?(input: Readonly<{
    readonly authorityDigest: Digest;
    readonly workspacePlan: ExecutionEffectDockerWorkspacePlanV1;
    readonly dependencyAuthority: ExecutionEffectDockerDependencyAuthorityReceiptV1;
  }>): Promise<unknown>;
  createVolume(input: Readonly<{
    readonly authorityDigest: Digest;
    readonly plan: ExecutionEffectDockerWorkspacePlanV1;
    readonly absenceObservationDigest: Digest;
  }>): Promise<unknown>;
  populateWorkspace(input: Readonly<{
    readonly platform: 'linux' | 'wsl2-linux';
    readonly authorityDigest: Digest;
    readonly plan: ExecutionEffectDockerWorkspacePlanV1;
    readonly attempt: ExecutionEffectAttemptIdentity;
    readonly admissionReceiptDigest: Digest;
    readonly custodyPolicyDigest: Digest;
    readonly writePolicy: ExecutionEffectWritePolicy;
    readonly volumeIdentityDigest: Digest;
    readonly dependencyAuthorityReceiptDigest: Digest;
    readonly captureLimits: ExecutionEffectCaptureLimits;
  }>): Promise<unknown>;
  captureWorkspace(input: Readonly<{
    readonly platform: 'linux' | 'wsl2-linux';
    readonly operation:
      | 'BASELINE_REVALIDATION'
      | 'FINAL_QUIESCENCE_FIRST'
      | 'FINAL_QUIESCENCE_SECOND';
    readonly authorityDigest: Digest;
    readonly plan: ExecutionEffectDockerWorkspacePlanV1;
    readonly attempt: ExecutionEffectAttemptIdentity;
    readonly admissionReceiptDigest: Digest;
    readonly custodyPolicyDigest: Digest;
    readonly writePolicy: ExecutionEffectWritePolicy;
    readonly workspaceSnapshot: ExecutionEffectWorkspaceSnapshotSealV1;
    readonly expectedWorkspaceStateDigest: Digest | null;
    readonly captureLimits: ExecutionEffectCaptureLimits;
  }>): Promise<unknown>;
}

/**
 * Capture receipts attest the native object identities observed inside one helper container.
 * Linux mount ids are namespace-local, so those identities legitimately change when the same
 * Docker volume is reopened by the next helper container.  The revalidation digest therefore
 * binds the stable Docker volume identity and the complete logical tree state, while each raw
 * capture keeps its own native identity evidence and digest for race/tamper validation.
 */
export function executionEffectDockerManifestStateDigestV1(
  manifest: ExecutionEffectManifest,
): Digest {
  return digest('execution-effect-docker-manifest-state-v1', {
    version: manifest.version,
    phaseIndependentAttemptDigest: manifest.attemptDigest,
    workspaceVolumeIdentityDigest: manifest.workspaceIdentity.filesystemId,
    captureSemantics: {
      adapter: manifest.captureAuthority.adapter,
      platform: manifest.captureAuthority.platform,
      traversal: manifest.captureAuthority.traversal,
      sameFilesystem: manifest.captureAuthority.sameFilesystem,
      mountBoundaryPolicy: manifest.captureAuthority.mountBoundaryPolicy,
      hardlinkPolicy: manifest.captureAuthority.hardlinkPolicy,
      cancellationState: manifest.captureAuthority.cancellationState,
    },
    captureLimits: manifest.captureAuthority.limits,
    landingSemantics: manifest.landingSemantics,
    writePolicyDigest: manifest.policy.digest,
    entries: manifest.entries,
  });
}

export interface ExecutionEffectDockerLifecycleClockV1 {
  nowIso(): string;
}

interface SnapshottedAdapters {
  readonly inspectImage: ExecutionEffectDockerLifecycleAdapterV1['inspectImage'];
  readonly prepareDependencies: ExecutionEffectDockerLifecycleAdapterV1['prepareDependencies'];
  readonly verifyExclusiveAttachments:
    ExecutionEffectDockerLifecycleAdapterV1['verifyExclusiveAttachments'];
  readonly inspectVolume: ExecutionEffectDockerLifecycleAdapterV1['inspectVolume'];
  readonly createVolume: ExecutionEffectDockerLifecycleAdapterV1['createVolume'];
  readonly populateWorkspace: ExecutionEffectDockerLifecycleAdapterV1['populateWorkspace'];
  readonly captureWorkspace: ExecutionEffectDockerLifecycleAdapterV1['captureWorkspace'];
  readonly adapterThis: ExecutionEffectDockerLifecycleAdapterV1;
  readonly nowIso: ExecutionEffectDockerLifecycleClockV1['nowIso'];
  readonly clockThis: ExecutionEffectDockerLifecycleClockV1;
}

function methodDescriptor(value: object, key: string): ((...args: never[]) => unknown) | null {
  let current: object | null = value;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor !== undefined) {
      return 'value' in descriptor && typeof descriptor.value === 'function'
        ? descriptor.value as (...args: never[]) => unknown : null;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return null;
}

function snapshotAdapters(
  adapter: ExecutionEffectDockerLifecycleAdapterV1,
  clock: ExecutionEffectDockerLifecycleClockV1,
): SnapshottedAdapters | null {
  if (adapter === null || typeof adapter !== 'object' || nodeTypes.isProxy(adapter)
    || clock === null || typeof clock !== 'object' || nodeTypes.isProxy(clock)) return null;
  let inspectImage: ((...args: never[]) => unknown) | null;
  let inspectVolume: ((...args: never[]) => unknown) | null;
  let prepareDependencies: ((...args: never[]) => unknown) | null;
  let verifyExclusiveAttachments: ((...args: never[]) => unknown) | null;
  let createVolume: ((...args: never[]) => unknown) | null;
  let populateWorkspace: ((...args: never[]) => unknown) | null;
  let captureWorkspace: ((...args: never[]) => unknown) | null;
  let nowIso: ((...args: never[]) => unknown) | null;
  try {
    inspectImage = methodDescriptor(adapter, 'inspectImage');
    inspectVolume = methodDescriptor(adapter, 'inspectVolume');
    prepareDependencies = methodDescriptor(adapter, 'prepareDependencies');
    verifyExclusiveAttachments = methodDescriptor(adapter, 'verifyExclusiveAttachments');
    createVolume = methodDescriptor(adapter, 'createVolume');
    populateWorkspace = methodDescriptor(adapter, 'populateWorkspace');
    captureWorkspace = methodDescriptor(adapter, 'captureWorkspace');
    nowIso = methodDescriptor(clock, 'nowIso');
  } catch {
    return null;
  }
  if (!inspectImage || !prepareDependencies || !verifyExclusiveAttachments || !inspectVolume
    || !createVolume || !populateWorkspace || !captureWorkspace || !nowIso) {
    return null;
  }
  return Object.freeze({
    inspectImage: inspectImage as ExecutionEffectDockerLifecycleAdapterV1['inspectImage'],
    prepareDependencies:
      prepareDependencies as ExecutionEffectDockerLifecycleAdapterV1['prepareDependencies'],
    verifyExclusiveAttachments: verifyExclusiveAttachments as
      ExecutionEffectDockerLifecycleAdapterV1['verifyExclusiveAttachments'],
    inspectVolume: inspectVolume as ExecutionEffectDockerLifecycleAdapterV1['inspectVolume'],
    createVolume: createVolume as ExecutionEffectDockerLifecycleAdapterV1['createVolume'],
    populateWorkspace: populateWorkspace as ExecutionEffectDockerLifecycleAdapterV1['populateWorkspace'],
    captureWorkspace: captureWorkspace as ExecutionEffectDockerLifecycleAdapterV1['captureWorkspace'],
    adapterThis: adapter,
    nowIso: nowIso as ExecutionEffectDockerLifecycleClockV1['nowIso'],
    clockThis: clock,
  });
}

function readClock(adapters: SnapshottedAdapters, lowerBound: string): string | null {
  let value: unknown;
  try { value = Reflect.apply(adapters.nowIso, adapters.clockThis, []); } catch { return null; }
  return isTimestamp(value) && timestampAtOrAfter(value, lowerBound) ? value : null;
}

export type ExecutionEffectDockerLifecycleHoldCode =
  | 'UNSUPPORTED_PLATFORM'
  | 'INVALID_INPUT'
  | 'ADAPTER_UNAVAILABLE'
  | 'CLOCK_INVALID'
  | 'VOLUME_NOT_ABSENT'
  | 'DEPENDENCY_AUTHORITY_UNAVAILABLE'
  | 'VOLUME_CREATE_REJECTED'
  | 'VOLUME_INSPECT_MISMATCH'
  | 'POPULATION_HOLD'
  | 'ATTACHMENT_HOLD'
  | 'CAPTURE_HOLD'
  | 'QUIESCENCE_HOLD'
  | 'AUTHORITY_MISMATCH'
  | 'CONTAINMENT_HOLD'
  | 'SESSION_INVALID'
  | 'LANDING_NOT_COMMITTED'
  | 'RELEASE_EVIDENCE_INVALID';

export interface ExecutionEffectDockerLifecycleHoldV1 {
  readonly state: 'HOLD';
  readonly code: ExecutionEffectDockerLifecycleHoldCode;
  readonly evidenceDigest: Digest;
  readonly containmentDecision: ExecutionEffectContainmentDecision | null;
}

function hold(
  code: ExecutionEffectDockerLifecycleHoldCode,
  evidence: unknown,
  containmentDecision: ExecutionEffectContainmentDecision | null = null,
): ExecutionEffectDockerLifecycleHoldV1 {
  return Object.freeze({
    state: 'HOLD' as const,
    code,
    evidenceDigest: digest('execution-effect-docker-lifecycle-hold-v1', { code, evidence }),
    containmentDecision,
  });
}

export interface PrepareExecutionEffectDockerWorkspaceV1Input {
  readonly platform: 'linux' | 'wsl' | 'darwin' | 'win32';
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly admissionReceiptDigest: Digest;
  readonly custodyPolicyDigest: Digest;
  readonly admittedAt: string;
  readonly filesWrite: readonly string[];
  readonly nativeCapabilityDigest: Digest;
  readonly workspacePlan: ExecutionEffectDockerWorkspacePlanV1;
  readonly captureLimits: ExecutionEffectCaptureLimits;
}

export interface ExecutionEffectDockerDurableAllocationReceiptV1 {
  readonly state: 'ALLOCATING';
  readonly artifactKey: string;
  readonly artifactReceiptDigest: Digest;
  readonly contentDigest: Digest;
  readonly byteLength: number;
  readonly capturedAt: string;
  readonly semanticAuthorityDigest: Digest;
  readonly durableAuthorityDigest: Digest;
}

export interface ExecutionEffectDockerVerifiedAllocationPublicationV1 {
  readonly authority: ExecutionEffectDockerAllocatingLifecycleAuthorityV1;
  readonly artifact: ExecutionEffectDockerDurableAllocationReceiptV1;
}

export interface ExecutionEffectDockerAllocationDurabilityPortV1 {
  readVerifiedAllocatingLifecycleAuthority(input: Readonly<{
    readonly semanticAuthorityDigest: Digest;
  }>): ExecutionEffectDockerVerifiedAllocationPublicationV1 | null;
}

declare const allocatedWorkspaceBrand: unique symbol;
export type AllocatedExecutionEffectDockerWorkspaceV1 = object & {
  readonly [allocatedWorkspaceBrand]: true;
};

declare const durableAllocationBrand: unique symbol;
export type DurablyAllocatedExecutionEffectDockerWorkspaceV1 = object & {
  readonly [durableAllocationBrand]: true;
};

declare const preparedWorkspaceBrand: unique symbol;
export type PreparedExecutionEffectDockerWorkspaceV1 = object & {
  readonly [preparedWorkspaceBrand]: true;
};

declare const providerWorkspaceBrand: unique symbol;
export type AuthorizedExecutionEffectDockerProviderV1 = object & {
  readonly [providerWorkspaceBrand]: true;
};

declare const landingWorkspaceBrand: unique symbol;
export type CapturedExecutionEffectDockerLandingV1 = object & {
  readonly [landingWorkspaceBrand]: true;
};

interface PreparedAuthority {
  readonly platform: 'linux' | 'wsl2-linux';
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly admissionReceiptDigest: Digest;
  readonly custodyPolicyDigest: Digest;
  readonly admittedAt: string;
  readonly writePolicy: ExecutionEffectWritePolicy;
  readonly nativeCapabilityDigest: Digest;
  readonly workspacePlan: ExecutionEffectDockerWorkspacePlanV1;
  readonly captureLimits: ExecutionEffectCaptureLimits;
  readonly preparationAuthorityDigest: Digest;
  readonly imageObservation: ExecutionEffectDockerImageObservationV1;
  readonly dependencyAuthority: ExecutionEffectDockerDependencyAuthorityReceiptV1;
  readonly absenceObservation: Extract<ExecutionEffectDockerVolumeObservationV1, { state: 'ABSENT' }>;
  readonly creationReceipt: ExecutionEffectDockerVolumeCreationReceiptV1;
  readonly presentObservation: Extract<ExecutionEffectDockerVolumeObservationV1, { state: 'PRESENT' }>;
  readonly populationReceipt: ExecutionEffectDockerPopulationReceiptV1;
  readonly baselineManifest: ExecutionEffectManifest;
  readonly workspaceResource: ExecutionEffectWorkspaceResourceV1;
  readonly workspaceSnapshot: ExecutionEffectWorkspaceSnapshotSealV1;
  readonly adapters: SnapshottedAdapters;
}

interface ProviderAuthority extends PreparedAuthority {
  readonly preProviderAttachmentReceipt: ExecutionEffectDockerExclusiveAttachmentReceiptV1;
  readonly baselineRevalidationReceipt: ExecutionEffectDockerLifecycleCaptureReceiptV1;
  readonly providerStartAuthorityDigest: Digest;
  readonly authorizedAt: string;
}

interface LandingAuthority extends ProviderAuthority {
  readonly providerStopped: ExecutionEffectDockerProviderStoppedReceiptV1;
  readonly postProviderAttachmentReceipt: ExecutionEffectDockerExclusiveAttachmentReceiptV1;
  readonly quiescenceSeal: ExecutionEffectDockerQuiescenceSealV1;
  readonly firstFinalCaptureReceipt: ExecutionEffectDockerLifecycleCaptureReceiptV1;
  readonly finalCaptureReceipt: ExecutionEffectDockerLifecycleCaptureReceiptV1;
  readonly finalManifest: ExecutionEffectManifest;
  readonly decision: Extract<ExecutionEffectContainmentDecision, { state: 'VERIFIED' }>;
  readonly landingAuthorityDigest: Digest;
}

interface ExecutionEffectDockerLifecycleAuthorityCommonV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-lifecycle-authority';
  readonly platform: 'linux' | 'wsl2-linux';
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly admissionReceiptDigest: Digest;
  readonly custodyPolicyDigest: Digest;
  readonly admittedAt: string;
  readonly writePolicy: ExecutionEffectWritePolicy;
  readonly nativeCapabilityDigest: Digest;
  readonly workspacePlan: ExecutionEffectDockerWorkspacePlanV1;
  readonly captureLimits: ExecutionEffectCaptureLimits;
  readonly preparationAuthorityDigest: Digest;
  readonly imageObservation: ExecutionEffectDockerImageObservationV1;
  readonly dependencyAuthority: ExecutionEffectDockerDependencyAuthorityReceiptV1;
  readonly absenceObservation: Extract<ExecutionEffectDockerVolumeObservationV1, { state: 'ABSENT' }>;
  readonly creationReceipt: ExecutionEffectDockerVolumeCreationReceiptV1;
  readonly presentObservation: Extract<ExecutionEffectDockerVolumeObservationV1, { state: 'PRESENT' }>;
  readonly populationReceipt: ExecutionEffectDockerPopulationReceiptV1;
  readonly baselineManifest: ExecutionEffectManifest;
  readonly workspaceResource: ExecutionEffectWorkspaceResourceV1;
  readonly workspaceSnapshot: ExecutionEffectWorkspaceSnapshotSealV1;
}

export interface ExecutionEffectDockerAllocatingLifecycleAuthorityV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-lifecycle-authority';
  readonly state: 'ALLOCATING';
  readonly platform: 'linux' | 'wsl2-linux';
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly admissionReceiptDigest: Digest;
  readonly custodyPolicyDigest: Digest;
  readonly admittedAt: string;
  readonly writePolicy: ExecutionEffectWritePolicy;
  readonly nativeCapabilityDigest: Digest;
  readonly workspacePlan: ExecutionEffectDockerWorkspacePlanV1;
  readonly captureLimits: ExecutionEffectCaptureLimits;
  readonly preparationAuthorityDigest: Digest;
  readonly predecessorAuthorityDigest: null;
  readonly authorityDigest: Digest;
}

export interface ExecutionEffectDockerPreparedLifecycleAuthorityV1
  extends ExecutionEffectDockerLifecycleAuthorityCommonV1 {
  readonly state: 'PREPARED';
  readonly predecessorAuthorityDigest: Digest;
  readonly authorityDigest: Digest;
}

export interface ExecutionEffectDockerProviderLifecycleAuthorityV1
  extends ExecutionEffectDockerLifecycleAuthorityCommonV1 {
  readonly state: 'PROVIDER_START_AUTHORIZED';
  readonly predecessorAuthorityDigest: Digest;
  readonly preProviderAttachmentReceipt: ExecutionEffectDockerExclusiveAttachmentReceiptV1;
  readonly baselineRevalidationReceipt: ExecutionEffectDockerLifecycleCaptureReceiptV1;
  readonly providerStartAuthorityDigest: Digest;
  readonly authorizedAt: string;
  readonly authorityDigest: Digest;
}

export interface ExecutionEffectDockerReadyLifecycleAuthorityV1
  extends ExecutionEffectDockerLifecycleAuthorityCommonV1 {
  readonly state: 'READY_FOR_LANDING';
  readonly predecessorAuthorityDigest: Digest;
  readonly preProviderAttachmentReceipt: ExecutionEffectDockerExclusiveAttachmentReceiptV1;
  readonly baselineRevalidationReceipt: ExecutionEffectDockerLifecycleCaptureReceiptV1;
  readonly providerStartAuthorityDigest: Digest;
  readonly authorizedAt: string;
  readonly providerStopped: ExecutionEffectDockerProviderStoppedReceiptV1;
  readonly postProviderAttachmentReceipt: ExecutionEffectDockerExclusiveAttachmentReceiptV1;
  readonly firstFinalCaptureReceipt: ExecutionEffectDockerLifecycleCaptureReceiptV1;
  readonly finalCaptureReceipt: ExecutionEffectDockerLifecycleCaptureReceiptV1;
  readonly quiescenceSeal: ExecutionEffectDockerQuiescenceSealV1;
  readonly finalManifest: ExecutionEffectManifest;
  readonly decision: Extract<ExecutionEffectContainmentDecision, { state: 'VERIFIED' }>;
  readonly landingAuthorityDigest: Digest;
  readonly authorityDigest: Digest;
}

export type ExecutionEffectDockerLifecycleAuthorityV1 =
  | ExecutionEffectDockerAllocatingLifecycleAuthorityV1
  | ExecutionEffectDockerPreparedLifecycleAuthorityV1
  | ExecutionEffectDockerProviderLifecycleAuthorityV1
  | ExecutionEffectDockerReadyLifecycleAuthorityV1;

type WithoutLifecycleGenerated<T> = T extends unknown
  ? Omit<T, 'version' | 'kind' | 'authorityDigest'>
  : never;

export type CreateExecutionEffectDockerLifecycleAuthorityV1Input =
  WithoutLifecycleGenerated<ExecutionEffectDockerLifecycleAuthorityV1>;

const LIFECYCLE_COMMON_INPUT_KEYS = Object.freeze([
  'platform', 'attempt', 'admissionReceiptDigest', 'custodyPolicyDigest', 'admittedAt',
  'writePolicy', 'nativeCapabilityDigest', 'workspacePlan', 'captureLimits',
  'preparationAuthorityDigest', 'imageObservation', 'dependencyAuthority',
  'absenceObservation', 'creationReceipt', 'presentObservation', 'populationReceipt',
  'baselineManifest', 'workspaceResource', 'workspaceSnapshot',
] as const);

const LIFECYCLE_ALLOCATION_INPUT_KEYS = Object.freeze([
  'platform', 'attempt', 'admissionReceiptDigest', 'custodyPolicyDigest', 'admittedAt',
  'writePolicy', 'nativeCapabilityDigest', 'workspacePlan', 'captureLimits',
  'preparationAuthorityDigest', 'state', 'predecessorAuthorityDigest',
] as const);

function snapshotAllocatingLifecycleAuthority(
  record: Record<string, unknown>,
): Omit<ExecutionEffectDockerAllocatingLifecycleAuthorityV1, 'authorityDigest'> | null {
  const attempt = snapshotAttempt(record.attempt);
  const writePolicy = parseExecutionEffectWritePolicy(record.writePolicy);
  const workspacePlan = parseWorkspacePlan(record.workspacePlan);
  const captureLimits = snapshotCaptureLimits(record.captureLimits);
  if (attempt === null || writePolicy === null || workspacePlan === null || captureLimits === null
    || record.state !== 'ALLOCATING' || record.predecessorAuthorityDigest !== null
    || (record.platform !== 'linux' && record.platform !== 'wsl2-linux')
    || !isDigest(record.admissionReceiptDigest) || !isDigest(record.custodyPolicyDigest)
    || !isTimestamp(record.admittedAt) || !isDigest(record.nativeCapabilityDigest)
    || !isDigest(record.preparationAuthorityDigest)) return null;
  const expectedPreparationAuthorityDigest = digest(
    'execution-effect-docker-preparation-authority-v1',
    Object.freeze({
      platform: record.platform,
      attempt,
      admissionReceiptDigest: record.admissionReceiptDigest,
      custodyPolicyDigest: record.custodyPolicyDigest,
      admittedAt: record.admittedAt,
      writePolicyDigest: writePolicy.digest,
      nativeCapabilityDigest: record.nativeCapabilityDigest,
      workspacePlanDigest: workspacePlan.planDigest,
      captureLimits,
    }),
  );
  if (record.preparationAuthorityDigest !== expectedPreparationAuthorityDigest) return null;
  return Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-lifecycle-authority' as const,
    state: 'ALLOCATING' as const,
    platform: record.platform,
    attempt,
    admissionReceiptDigest: record.admissionReceiptDigest,
    custodyPolicyDigest: record.custodyPolicyDigest,
    admittedAt: record.admittedAt,
    writePolicy,
    nativeCapabilityDigest: record.nativeCapabilityDigest,
    workspacePlan,
    captureLimits,
    preparationAuthorityDigest: record.preparationAuthorityDigest,
    predecessorAuthorityDigest: null,
  });
}

function allocatingLifecycleAuthorityDigest(
  authority: Omit<ExecutionEffectDockerAllocatingLifecycleAuthorityV1, 'authorityDigest'>,
): Digest {
  return digest('execution-effect-docker-allocating-lifecycle-authority-v1', Object.freeze({
    platform: authority.platform,
    attempt: authority.attempt,
    admissionReceiptDigest: authority.admissionReceiptDigest,
    custodyPolicyDigest: authority.custodyPolicyDigest,
    admittedAt: authority.admittedAt,
    writePolicyDigest: authority.writePolicy.digest,
    nativeCapabilityDigest: authority.nativeCapabilityDigest,
    workspacePlanDigest: authority.workspacePlan.planDigest,
    workspaceVolumeName: authority.workspacePlan.volumeName,
    dependencyVolumeName: authority.workspacePlan.dependencyPlan.volumeName,
    workspaceLabelsDigest: authority.workspacePlan.workspaceLabelsDigest,
    dependencyLabelsDigest: authority.workspacePlan.dependencyLabelsDigest,
    imageDigest: authority.workspacePlan.imageDigest,
    captureLimits: authority.captureLimits,
    preparationAuthorityDigest: authority.preparationAuthorityDigest,
  }));
}

export function executionEffectDockerWorkspaceFreshnessReceiptDigestV1(input: Readonly<{
  readonly resourceInstanceDigest: Digest;
  readonly volumeIdentityDigest: Digest;
  readonly absenceObservationDigest: Digest;
  readonly creationReceiptDigest: Digest;
  readonly verifiedPresentObservationDigest: Digest;
}>): Digest {
  const record = exactRecord(input, [
    'resourceInstanceDigest', 'volumeIdentityDigest', 'absenceObservationDigest', 'creationReceiptDigest',
    'verifiedPresentObservationDigest',
  ]);
  if (record === null || !isDigest(record.resourceInstanceDigest)
    || !isDigest(record.volumeIdentityDigest)
    || !isDigest(record.absenceObservationDigest) || !isDigest(record.creationReceiptDigest)
    || !isDigest(record.verifiedPresentObservationDigest)) {
    throw new TypeError('Invalid Docker workspace freshness receipt authority');
  }
  return digest('execution-effect-docker-workspace-freshness-receipt-v1', Object.freeze({
    resourceInstanceDigest: record.resourceInstanceDigest,
    volumeIdentityDigest: record.volumeIdentityDigest,
    absenceObservationDigest: record.absenceObservationDigest,
    creationReceiptDigest: record.creationReceiptDigest,
    verifiedPresentObservationDigest: record.verifiedPresentObservationDigest,
  }));
}

function snapshotDurableLifecycleCommon(
  record: Record<string, unknown>,
): ExecutionEffectDockerLifecycleAuthorityCommonV1 | null {
  const attempt = snapshotAttempt(record.attempt);
  const writePolicy = parseExecutionEffectWritePolicy(record.writePolicy);
  const workspacePlan = parseWorkspacePlan(record.workspacePlan);
  const captureLimits = snapshotCaptureLimits(record.captureLimits);
  const imageObservation = parseImageObservation(record.imageObservation);
  const dependencyAuthority = parseDependencyAuthorityReceipt(record.dependencyAuthority);
  const absenceObservation = parseExecutionEffectDockerVolumeObservationV1(record.absenceObservation);
  const creationReceipt = parseVolumeCreationReceipt(record.creationReceipt);
  const presentObservation = parseExecutionEffectDockerVolumeObservationV1(record.presentObservation);
  const populationReceipt = parsePopulationReceipt(record.populationReceipt);
  const baselineManifest = parseExecutionEffectManifest(record.baselineManifest);
  const workspaceResource = parseExecutionEffectWorkspaceResourceV1(record.workspaceResource);
  const workspaceSnapshot = parseExecutionEffectWorkspaceSnapshotSealV1(record.workspaceSnapshot);
  if (attempt === null || writePolicy === null || workspacePlan === null || captureLimits === null
    || imageObservation === null || dependencyAuthority === null
    || absenceObservation?.state !== 'ABSENT' || creationReceipt === null
    || presentObservation?.state !== 'PRESENT' || populationReceipt === null
    || baselineManifest === null || workspaceResource === null || workspaceSnapshot === null
    || (record.platform !== 'linux' && record.platform !== 'wsl2-linux')
    || !isDigest(record.admissionReceiptDigest) || !isDigest(record.custodyPolicyDigest)
    || !isTimestamp(record.admittedAt) || !isDigest(record.nativeCapabilityDigest)
    || !isDigest(record.preparationAuthorityDigest)) return null;
  const expectedPreparationDigest = digest('execution-effect-docker-preparation-authority-v1', {
    platform: record.platform,
    attempt,
    admissionReceiptDigest: record.admissionReceiptDigest,
    custodyPolicyDigest: record.custodyPolicyDigest,
    admittedAt: record.admittedAt,
    writePolicyDigest: writePolicy.digest,
    nativeCapabilityDigest: record.nativeCapabilityDigest,
    workspacePlanDigest: workspacePlan.planDigest,
    captureLimits,
  });
  const expectedDependencyAuthorityDigest = digest(
    'execution-effect-docker-dependency-preparation-authority-v1',
    {
      preparationAuthorityDigest: record.preparationAuthorityDigest,
      imageObservationReceiptDigest: imageObservation.receiptDigest,
      dependencyPlanDigest: workspacePlan.dependencyPlanDigest,
    },
  );
  const expectedPopulationAuthorityDigest = digest('execution-effect-docker-population-authority-v1', {
    preparationAuthorityDigest: record.preparationAuthorityDigest,
    imageObservationReceiptDigest: imageObservation.receiptDigest,
    dependencyAuthorityReceiptDigest: dependencyAuthority.receiptDigest,
    creationReceiptDigest: creationReceipt.receiptDigest,
    presentObservationDigest: presentObservation.observationDigest,
  });
  let freshnessReceiptDigest: Digest;
  try {
    freshnessReceiptDigest = executionEffectDockerWorkspaceFreshnessReceiptDigestV1({
      resourceInstanceDigest: workspacePlan.workspaceResourceInstanceDigest,
      volumeIdentityDigest: presentObservation.volumeIdentityDigest,
      absenceObservationDigest: absenceObservation.observationDigest,
      creationReceiptDigest: creationReceipt.receiptDigest,
      verifiedPresentObservationDigest: presentObservation.observationDigest,
    });
  } catch {
    return null;
  }
  if (record.preparationAuthorityDigest !== expectedPreparationDigest
    || imageObservation.authorityDigest !== expectedPreparationDigest
    || imageObservation.imageReference !== workspacePlan.imageReference
    || imageObservation.imageDigest !== workspacePlan.imageDigest
    || dependencyAuthority.authorityDigest !== expectedDependencyAuthorityDigest
    || dependencyAuthority.imageObservationReceiptDigest !== imageObservation.receiptDigest
    || dependencyAuthority.imageIdentityDigest !== imageObservation.imageIdentityDigest
    || dependencyAuthority.dependencyPlanDigest !== workspacePlan.dependencyPlanDigest
    || dependencyAuthority.labelsDigest !== workspacePlan.dependencyLabelsDigest
    || dependencyAuthority.resourceInstanceDigest
      !== workspacePlan.dependencyResourceInstanceDigest
    || dependencyAuthority.volumeName !== workspacePlan.dependencyPlan.volumeName
    || absenceObservation.authorityDigest !== expectedPreparationDigest
    || absenceObservation.volumeName !== workspacePlan.volumeName
    || absenceObservation.resourceInstanceDigest
      !== workspacePlan.workspaceResourceInstanceDigest
    || creationReceipt.authorityDigest !== expectedPreparationDigest
    || creationReceipt.absenceObservationDigest !== absenceObservation.observationDigest
    || creationReceipt.volumeName !== workspacePlan.volumeName
    || creationReceipt.resourceInstanceDigest !== workspacePlan.workspaceResourceInstanceDigest
    || creationReceipt.labelsDigest !== workspacePlan.workspaceLabelsDigest
    || creationReceipt.mountPlanDigest !== workspacePlan.mountPlanDigest
    || presentObservation.authorityDigest !== expectedPreparationDigest
    || presentObservation.volumeName !== workspacePlan.volumeName
    || presentObservation.resourceInstanceDigest !== workspacePlan.workspaceResourceInstanceDigest
    || presentObservation.labelsDigest !== workspacePlan.workspaceLabelsDigest
    || presentObservation.mountPlanDigest !== workspacePlan.mountPlanDigest
    || presentObservation.volumeIdentityDigest !== creationReceipt.volumeIdentityDigest
    || presentObservation.daemonCreatedAt !== creationReceipt.daemonCreatedAt
    || populationReceipt.authorityDigest !== expectedPopulationAuthorityDigest
    || populationReceipt.volumeName !== workspacePlan.volumeName
    || populationReceipt.volumeIdentityDigest !== presentObservation.volumeIdentityDigest
    || populationReceipt.inventoryDigest !== workspacePlan.inventoryDigest
    || populationReceipt.inventoryAdmissionReceiptDigest
      !== workspacePlan.inventoryAdmissionReceiptDigest
    || populationReceipt.dependencyPlanDigest !== workspacePlan.dependencyPlanDigest
    || populationReceipt.dependencyAuthorityReceiptDigest !== dependencyAuthority.receiptDigest
    || populationReceipt.rejectedPathCount !== 0
    || populationReceipt.rejectedPathsDigest !== workspacePlan.inventoryRejectedPathsDigest
    || baselineManifest.phase !== 'baseline' || !sameAttempt(baselineManifest.attempt, attempt)
    || baselineManifest.policy.digest !== writePolicy.digest
    || baselineManifest.captureAuthority.platform !== record.platform
    || workspaceResource.volumeName !== workspacePlan.volumeName
    || workspaceResource.resourceInstanceDigest
      !== workspacePlan.workspaceResourceInstanceDigest
    || workspaceResource.imageDigest !== workspacePlan.imageDigest
    || workspaceResource.labelsDigest !== workspacePlan.workspaceLabelsDigest
    || workspaceResource.mountPlanDigest !== workspacePlan.mountPlanDigest
    || workspaceResource.volumeIdentityDigest !== presentObservation.volumeIdentityDigest
    || workspaceResource.absenceObservationDigest !== absenceObservation.observationDigest
    || workspaceResource.creationReceiptDigest !== creationReceipt.receiptDigest
    || workspaceResource.verifiedPresentObservationDigest !== presentObservation.observationDigest
    || workspaceResource.freshnessReceiptDigest !== freshnessReceiptDigest
    || workspaceResource.snapshotInventoryDigest !== workspacePlan.inventoryDigest
    || workspaceResource.populationReceiptDigest !== populationReceipt.receiptDigest
    || workspaceResource.baselineManifestDigest !== baselineManifest.digest
    || !sameCanonical(workspaceSnapshot.workspaceResource, workspaceResource)
    || !sameCanonical(workspaceSnapshot.dependencyResource,
      createExecutionEffectDependencyResourceV1({
        attempt,
        admissionReceiptDigest: record.admissionReceiptDigest,
        custodyPolicyDigest: record.custodyPolicyDigest,
        imageIdentityDigest: dependencyAuthority.imageIdentityDigest,
        labelsDigest: dependencyAuthority.labelsDigest,
        resourceInstanceDigest: dependencyAuthority.resourceInstanceDigest,
        mountPlanDigest: workspacePlan.dependencyPlanDigest,
        populationReceiptDigest: dependencyAuthority.populationReceiptDigest,
        volumeName: dependencyAuthority.volumeName,
        volumeIdentityDigest: dependencyAuthority.volumeIdentityDigest,
        readyAt: dependencyAuthority.completedAt,
      }))
    || !sameAttempt(workspaceSnapshot.attempt, attempt)
    || workspaceSnapshot.admissionReceiptDigest !== record.admissionReceiptDigest
    || workspaceSnapshot.custodyPolicyDigest !== record.custodyPolicyDigest
    || workspaceSnapshot.writePolicyDigest !== writePolicy.digest
    || workspaceSnapshot.nativeCapabilityDigest !== record.nativeCapabilityDigest
    || workspaceSnapshot.platform !== record.platform
    || workspaceSnapshot.workspaceIdentityDigest
      !== digest('execution-effect-workspace-identity-v1', baselineManifest.workspaceIdentity)
    || !sameCanonical(workspaceSnapshot.workspaceIdentity, baselineManifest.workspaceIdentity)
    || !timestampAtOrAfter(imageObservation.observedAt, record.admittedAt as string)
    || !timestampAtOrAfter(dependencyAuthority.startedAt, imageObservation.observedAt)
    || !timestampAtOrAfter(absenceObservation.observedAt, dependencyAuthority.completedAt)
    || !timestampAtOrAfter(creationReceipt.createRequestedAt, absenceObservation.observedAt)
    || !timestampAtOrAfter(creationReceipt.createCompletedAt,
      creationReceipt.createRequestedAt)
    || !timestampAtOrAfter(presentObservation.observedAt,
      creationReceipt.createCompletedAt)
    || !timestampAtOrAfter(populationReceipt.completedAt, presentObservation.observedAt)
    || !timestampAtOrAfter(workspaceSnapshot.sealedAt, populationReceipt.completedAt)) return null;
  return Object.freeze({
    version: 1,
    kind: 'execution-effect-docker-lifecycle-authority',
    platform: record.platform,
    attempt,
    admissionReceiptDigest: record.admissionReceiptDigest,
    custodyPolicyDigest: record.custodyPolicyDigest,
    admittedAt: record.admittedAt,
    writePolicy,
    nativeCapabilityDigest: record.nativeCapabilityDigest,
    workspacePlan,
    captureLimits,
    preparationAuthorityDigest: record.preparationAuthorityDigest,
    imageObservation,
    dependencyAuthority,
    absenceObservation,
    creationReceipt,
    presentObservation,
    populationReceipt,
    baselineManifest,
    workspaceResource,
    workspaceSnapshot,
  }) as ExecutionEffectDockerLifecycleAuthorityCommonV1;
}

function preparedLifecycleAuthorityDigest(
  common: ExecutionEffectDockerLifecycleAuthorityCommonV1,
): Digest {
  return digest('execution-effect-docker-prepared-lifecycle-authority-v1', {
    predecessorAuthorityDigest: allocatingLifecycleAuthorityDigest(Object.freeze({
      version: 1,
      kind: 'execution-effect-docker-lifecycle-authority',
      state: 'ALLOCATING',
      platform: common.platform,
      attempt: common.attempt,
      admissionReceiptDigest: common.admissionReceiptDigest,
      custodyPolicyDigest: common.custodyPolicyDigest,
      admittedAt: common.admittedAt,
      writePolicy: common.writePolicy,
      nativeCapabilityDigest: common.nativeCapabilityDigest,
      workspacePlan: common.workspacePlan,
      captureLimits: common.captureLimits,
      preparationAuthorityDigest: common.preparationAuthorityDigest,
      predecessorAuthorityDigest: null,
    })),
    preparationAuthorityDigest: common.preparationAuthorityDigest,
    imageObservationReceiptDigest: common.imageObservation.receiptDigest,
    dependencyAuthorityReceiptDigest: common.dependencyAuthority.receiptDigest,
    absenceObservationDigest: common.absenceObservation.observationDigest,
    creationReceiptDigest: common.creationReceipt.receiptDigest,
    presentObservationDigest: common.presentObservation.observationDigest,
    populationReceiptDigest: common.populationReceipt.receiptDigest,
    baselineManifestDigest: common.baselineManifest.digest,
    workspaceResourceDigest: common.workspaceResource.resourceDigest,
    workspaceSnapshotSealDigest: common.workspaceSnapshot.sealDigest,
  });
}

export function createExecutionEffectDockerLifecycleAuthorityV1(
  input: CreateExecutionEffectDockerLifecycleAuthorityV1Input,
): ExecutionEffectDockerLifecycleAuthorityV1 {
  const state = Reflect.get(input as object, 'state');
  if (state === 'ALLOCATING') {
    const allocatingRecord = exactRecord(input, LIFECYCLE_ALLOCATION_INPUT_KEYS);
    const allocating = allocatingRecord
      ? snapshotAllocatingLifecycleAuthority(allocatingRecord) : null;
    if (!allocating) throw new TypeError('Invalid Docker ALLOCATING lifecycle authority');
    return Object.freeze({
      ...allocating,
      authorityDigest: allocatingLifecycleAuthorityDigest(allocating),
    });
  }
  const extraKeys = state === 'PREPARED'
    ? ['state', 'predecessorAuthorityDigest']
    : state === 'PROVIDER_START_AUTHORIZED'
      ? [
        'state', 'predecessorAuthorityDigest', 'preProviderAttachmentReceipt',
        'baselineRevalidationReceipt', 'providerStartAuthorityDigest', 'authorizedAt',
      ]
      : [
        'state', 'predecessorAuthorityDigest', 'preProviderAttachmentReceipt',
        'baselineRevalidationReceipt', 'providerStartAuthorityDigest', 'authorizedAt',
        'providerStopped', 'postProviderAttachmentReceipt', 'firstFinalCaptureReceipt',
        'finalCaptureReceipt', 'quiescenceSeal', 'finalManifest', 'decision',
        'landingAuthorityDigest',
      ];
  const record = exactRecord(input, [...LIFECYCLE_COMMON_INPUT_KEYS, ...extraKeys]);
  const common = record ? snapshotDurableLifecycleCommon(record) : null;
  if (record === null || common === null) {
    throw new TypeError('Invalid Docker lifecycle authority');
  }
  const preparedDigest = preparedLifecycleAuthorityDigest(common);
  const allocatingDigest = allocatingLifecycleAuthorityDigest(Object.freeze({
    version: 1,
    kind: 'execution-effect-docker-lifecycle-authority',
    state: 'ALLOCATING',
    platform: common.platform,
    attempt: common.attempt,
    admissionReceiptDigest: common.admissionReceiptDigest,
    custodyPolicyDigest: common.custodyPolicyDigest,
    admittedAt: common.admittedAt,
    writePolicy: common.writePolicy,
    nativeCapabilityDigest: common.nativeCapabilityDigest,
    workspacePlan: common.workspacePlan,
    captureLimits: common.captureLimits,
    preparationAuthorityDigest: common.preparationAuthorityDigest,
    predecessorAuthorityDigest: null,
  }));
  if (state === 'PREPARED') {
    if (record.predecessorAuthorityDigest !== allocatingDigest) {
      throw new TypeError('Invalid Docker PREPARED lifecycle predecessor');
    }
    return Object.freeze({
      ...common,
      state: 'PREPARED' as const,
      predecessorAuthorityDigest: allocatingDigest,
      authorityDigest: preparedDigest,
    });
  }
  const preProviderAttachmentReceipt = parseExclusiveAttachmentReceipt(
    record.preProviderAttachmentReceipt,
  );
  const baselineRevalidationReceipt = parseCaptureReceipt(record.baselineRevalidationReceipt);
  if (!preProviderAttachmentReceipt || preProviderAttachmentReceipt.phase !== 'PRE_PROVIDER_START'
    || !baselineRevalidationReceipt
    || baselineRevalidationReceipt.operation !== 'BASELINE_REVALIDATION'
    || baselineRevalidationReceipt.phase !== 'baseline'
    || (state === 'PROVIDER_START_AUTHORIZED'
      && record.predecessorAuthorityDigest !== preparedDigest)
    || preProviderAttachmentReceipt.workspaceVolumeName !== common.workspacePlan.volumeName
    || preProviderAttachmentReceipt.workspaceVolumeIdentityDigest
      !== common.presentObservation.volumeIdentityDigest
    || preProviderAttachmentReceipt.dependencyVolumeName
      !== common.dependencyAuthority.volumeName
    || preProviderAttachmentReceipt.dependencyVolumeIdentityDigest
      !== common.dependencyAuthority.volumeIdentityDigest
    || baselineRevalidationReceipt.volumeName !== common.workspacePlan.volumeName
    || baselineRevalidationReceipt.volumeIdentityDigest
      !== common.presentObservation.volumeIdentityDigest
    || baselineRevalidationReceipt.workspaceIdentity.filesystemId
      !== common.presentObservation.volumeIdentityDigest
    || baselineRevalidationReceipt.manifestStateDigest
      !== executionEffectDockerManifestStateDigestV1(common.baselineManifest)
    || !isTimestamp(record.authorizedAt)) {
    throw new TypeError('Invalid Docker provider lifecycle authority');
  }
  const providerDigest = digest('execution-effect-docker-provider-start-authority-v1', {
    predecessorAuthorityDigest: preparedDigest,
    preparationAuthorityDigest: common.preparationAuthorityDigest,
    workspaceSnapshotSealDigest: common.workspaceSnapshot.sealDigest,
    dependencyAuthorityReceiptDigest: common.dependencyAuthority.receiptDigest,
    exclusiveAttachmentReceiptDigest: preProviderAttachmentReceipt.receiptDigest,
    baselineManifestDigest: common.baselineManifest.digest,
    baselineRevalidationReceiptDigest: baselineRevalidationReceipt.receiptDigest,
    authorizedAt: record.authorizedAt,
  });
  if (record.providerStartAuthorityDigest !== providerDigest
    || !timestampAtOrAfter(preProviderAttachmentReceipt.observedAt,
      common.workspaceSnapshot.sealedAt)
    || !timestampAtOrAfter(baselineRevalidationReceipt.startedAt,
      preProviderAttachmentReceipt.observedAt)
    || !timestampAtOrAfter(record.authorizedAt as string,
      baselineRevalidationReceipt.completedAt)) {
    throw new TypeError('Invalid Docker provider lifecycle digest chain');
  }
  if (state === 'PROVIDER_START_AUTHORIZED') {
    return Object.freeze({
      ...common,
      state: 'PROVIDER_START_AUTHORIZED' as const,
      predecessorAuthorityDigest: preparedDigest,
      preProviderAttachmentReceipt,
      baselineRevalidationReceipt,
      providerStartAuthorityDigest: providerDigest,
      authorizedAt: record.authorizedAt as string,
      authorityDigest: providerDigest,
    });
  }
  if (state !== 'READY_FOR_LANDING') {
    throw new TypeError('Invalid Docker lifecycle authority state');
  }
  const providerStopped = parseProviderStoppedReceipt(record.providerStopped);
  const postProviderAttachmentReceipt = parseExclusiveAttachmentReceipt(
    record.postProviderAttachmentReceipt,
  );
  const firstFinalCaptureReceipt = parseCaptureReceipt(record.firstFinalCaptureReceipt);
  const finalCaptureReceipt = parseCaptureReceipt(record.finalCaptureReceipt);
  const quiescenceSeal = parseQuiescenceSeal(record.quiescenceSeal);
  const finalManifest = parseExecutionEffectManifest(record.finalManifest);
  const evaluated = finalManifest ? evaluateExecutionEffectContainment({
    baseline: Object.freeze({ ok: true as const, manifest: common.baselineManifest }),
    final: Object.freeze({ ok: true as const, manifest: finalManifest }),
  }) : null;
  const decision = evaluated?.state === 'VERIFIED' && sameCanonical(evaluated, record.decision)
    ? evaluated : null;
  if (!providerStopped || !postProviderAttachmentReceipt
    || postProviderAttachmentReceipt.phase !== 'POST_PROVIDER_STOP'
    || !firstFinalCaptureReceipt
    || firstFinalCaptureReceipt.operation !== 'FINAL_QUIESCENCE_FIRST'
    || !finalCaptureReceipt || finalCaptureReceipt.operation !== 'FINAL_QUIESCENCE_SECOND'
    || !quiescenceSeal || !finalManifest || !decision
    || record.predecessorAuthorityDigest !== providerDigest
    || providerStopped.providerStartAuthorityDigest !== providerDigest
    || postProviderAttachmentReceipt.workspaceVolumeIdentityDigest
      !== common.presentObservation.volumeIdentityDigest
    || postProviderAttachmentReceipt.dependencyVolumeIdentityDigest
      !== common.dependencyAuthority.volumeIdentityDigest
    || firstFinalCaptureReceipt.volumeIdentityDigest
      !== common.presentObservation.volumeIdentityDigest
    || finalCaptureReceipt.volumeIdentityDigest !== common.presentObservation.volumeIdentityDigest
    || quiescenceSeal.attachmentReceiptDigest !== postProviderAttachmentReceipt.receiptDigest
    || quiescenceSeal.firstCaptureReceiptDigest !== firstFinalCaptureReceipt.receiptDigest
    || quiescenceSeal.secondCaptureReceiptDigest !== finalCaptureReceipt.receiptDigest
    || firstFinalCaptureReceipt.manifestStateDigest !== quiescenceSeal.manifestStateDigest
    || finalCaptureReceipt.manifestStateDigest !== quiescenceSeal.manifestStateDigest
    || quiescenceSeal.manifestStateDigest !== executionEffectDockerManifestStateDigestV1(finalManifest)
    || !timestampAtOrAfter(providerStopped.stoppedAt, record.authorizedAt as string)
    || !timestampAtOrAfter(postProviderAttachmentReceipt.observedAt, providerStopped.stoppedAt)
    || !timestampAtOrAfter(firstFinalCaptureReceipt.startedAt,
      postProviderAttachmentReceipt.observedAt)
    || !timestampAtOrAfter(finalCaptureReceipt.startedAt, firstFinalCaptureReceipt.completedAt)
    || !timestampAtOrAfter(quiescenceSeal.sealedAt, finalCaptureReceipt.completedAt)) {
    throw new TypeError('Invalid Docker ready lifecycle authority');
  }
  const landingDigest = digest('execution-effect-docker-landing-authority-v1', {
    predecessorAuthorityDigest: providerDigest,
    providerStartAuthorityDigest: providerDigest,
    providerStoppedReceiptDigest: providerStopped.receiptDigest,
    workspaceSnapshotSealDigest: common.workspaceSnapshot.sealDigest,
    baselineManifestDigest: common.baselineManifest.digest,
    finalManifestDigest: finalManifest.digest,
    decisionDigest: decision.decisionDigest,
    exclusiveAttachmentReceiptDigest: postProviderAttachmentReceipt.receiptDigest,
    firstCaptureReceiptDigest: firstFinalCaptureReceipt.receiptDigest,
    quiescenceSealDigest: quiescenceSeal.sealDigest,
    finalCaptureReceiptDigest: finalCaptureReceipt.receiptDigest,
  });
  if (record.landingAuthorityDigest !== landingDigest) {
    throw new TypeError('Invalid Docker landing lifecycle digest chain');
  }
  return Object.freeze({
    ...common,
    state: 'READY_FOR_LANDING' as const,
    predecessorAuthorityDigest: providerDigest,
    preProviderAttachmentReceipt,
    baselineRevalidationReceipt,
    providerStartAuthorityDigest: providerDigest,
    authorizedAt: record.authorizedAt as string,
    providerStopped,
    postProviderAttachmentReceipt,
    firstFinalCaptureReceipt,
    finalCaptureReceipt,
    quiescenceSeal,
    finalManifest,
    decision,
    landingAuthorityDigest: landingDigest,
    authorityDigest: landingDigest,
  });
}

export function parseExecutionEffectDockerLifecycleAuthorityV1(
  value: unknown,
): ExecutionEffectDockerLifecycleAuthorityV1 | null {
  const state = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Reflect.get(value, 'state') : null;
  const extraKeys = state === 'ALLOCATING'
    ? ['state', 'predecessorAuthorityDigest']
    : state === 'PREPARED'
    ? ['state', 'predecessorAuthorityDigest']
    : state === 'PROVIDER_START_AUTHORIZED'
      ? [
        'state', 'predecessorAuthorityDigest', 'preProviderAttachmentReceipt',
        'baselineRevalidationReceipt', 'providerStartAuthorityDigest', 'authorizedAt',
      ]
      : state === 'READY_FOR_LANDING'
        ? [
          'state', 'predecessorAuthorityDigest', 'preProviderAttachmentReceipt',
          'baselineRevalidationReceipt', 'providerStartAuthorityDigest', 'authorizedAt',
          'providerStopped', 'postProviderAttachmentReceipt', 'firstFinalCaptureReceipt',
          'finalCaptureReceipt', 'quiescenceSeal', 'finalManifest', 'decision',
          'landingAuthorityDigest',
        ] : [];
  const sourceKeys = state === 'ALLOCATING'
    ? LIFECYCLE_ALLOCATION_INPUT_KEYS
    : [...LIFECYCLE_COMMON_INPUT_KEYS, ...extraKeys];
  const record = exactRecord(value, ['version', 'kind', ...sourceKeys, 'authorityDigest']);
  if (record === null || record.version !== 1
    || record.kind !== 'execution-effect-docker-lifecycle-authority'
    || !isDigest(record.authorityDigest)) return null;
  const input = Object.fromEntries(
    sourceKeys.map(key => [key, record[key]]),
  ) as CreateExecutionEffectDockerLifecycleAuthorityV1Input;
  try {
    const recreated = createExecutionEffectDockerLifecycleAuthorityV1(input);
    return recreated.authorityDigest === record.authorityDigest
      && sameCanonical(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export function createExecutionEffectDockerAllocatingLifecycleAuthorityV1(
  input: PrepareExecutionEffectDockerWorkspaceV1Input,
): ExecutionEffectDockerAllocatingLifecycleAuthorityV1 {
  const base = snapshotPrepareInput(input);
  if (!base) throw new TypeError('Invalid Docker ALLOCATING input');
  return createExecutionEffectDockerLifecycleAuthorityV1({
    platform: base.platform,
    attempt: base.attempt,
    admissionReceiptDigest: base.admissionReceiptDigest,
    custodyPolicyDigest: base.custodyPolicyDigest,
    admittedAt: base.admittedAt,
    writePolicy: base.writePolicy,
    nativeCapabilityDigest: base.nativeCapabilityDigest,
    workspacePlan: base.workspacePlan,
    captureLimits: base.captureLimits,
    preparationAuthorityDigest: base.preparationAuthorityDigest,
    state: 'ALLOCATING',
    predecessorAuthorityDigest: null,
  }) as ExecutionEffectDockerAllocatingLifecycleAuthorityV1;
}

function lifecycleCommonInputFromPrepared(authority: PreparedAuthority) {
  return Object.freeze({
    platform: authority.platform,
    attempt: authority.attempt,
    admissionReceiptDigest: authority.admissionReceiptDigest,
    custodyPolicyDigest: authority.custodyPolicyDigest,
    admittedAt: authority.admittedAt,
    writePolicy: authority.writePolicy,
    nativeCapabilityDigest: authority.nativeCapabilityDigest,
    workspacePlan: authority.workspacePlan,
    captureLimits: authority.captureLimits,
    preparationAuthorityDigest: authority.preparationAuthorityDigest,
    imageObservation: authority.imageObservation,
    dependencyAuthority: authority.dependencyAuthority,
    absenceObservation: authority.absenceObservation,
    creationReceipt: authority.creationReceipt,
    presentObservation: authority.presentObservation,
    populationReceipt: authority.populationReceipt,
    baselineManifest: authority.baselineManifest,
    workspaceResource: authority.workspaceResource,
    workspaceSnapshot: authority.workspaceSnapshot,
  });
}

function allocatingLifecycleAuthorityFromPrepared(
  authority: PreparedAuthority,
): ExecutionEffectDockerAllocatingLifecycleAuthorityV1 {
  return createExecutionEffectDockerLifecycleAuthorityV1({
    platform: authority.platform,
    attempt: authority.attempt,
    admissionReceiptDigest: authority.admissionReceiptDigest,
    custodyPolicyDigest: authority.custodyPolicyDigest,
    admittedAt: authority.admittedAt,
    writePolicy: authority.writePolicy,
    nativeCapabilityDigest: authority.nativeCapabilityDigest,
    workspacePlan: authority.workspacePlan,
    captureLimits: authority.captureLimits,
    preparationAuthorityDigest: authority.preparationAuthorityDigest,
    state: 'ALLOCATING',
    predecessorAuthorityDigest: null,
  }) as ExecutionEffectDockerAllocatingLifecycleAuthorityV1;
}

const preparedAuthorities = new WeakMap<object, PreparedAuthority>();
const providerAuthorities = new WeakMap<object, ProviderAuthority>();
const landingAuthorities = new WeakMap<object, LandingAuthority>();
type AllocationBase = NonNullable<ReturnType<typeof snapshotPrepareInput>>;
interface AllocatingSessionAuthority {
  readonly base: AllocationBase;
  readonly lifecycleAuthority: ExecutionEffectDockerAllocatingLifecycleAuthorityV1;
}
interface DurableAllocatingSessionAuthority extends AllocatingSessionAuthority {
  readonly durableReceipt: ExecutionEffectDockerDurableAllocationReceiptV1;
}
const allocatingAuthorities = new WeakMap<object, AllocatingSessionAuthority>();
const durableAllocatingAuthorities = new WeakMap<object, DurableAllocatingSessionAuthority>();

function session(): object {
  return Object.freeze(Object.create(null) as object);
}

function snapshotPrepareInput(
  input: PrepareExecutionEffectDockerWorkspaceV1Input,
): Omit<PreparedAuthority,
  | 'absenceObservation' | 'creationReceipt' | 'presentObservation' | 'populationReceipt'
  | 'imageObservation' | 'dependencyAuthority' | 'baselineManifest' | 'workspaceResource'
  | 'workspaceSnapshot' | 'adapters'> | null {
  const record = exactRecord(input, [
    'platform', 'attempt', 'admissionReceiptDigest', 'custodyPolicyDigest', 'admittedAt',
    'filesWrite', 'nativeCapabilityDigest', 'workspacePlan', 'captureLimits',
  ]);
  const attempt = snapshotAttempt(record?.attempt);
  const workspacePlan = parseWorkspacePlan(record?.workspacePlan);
  const captureLimits = snapshotCaptureLimits(record?.captureLimits);
  const writePolicy = Array.isArray(record?.filesWrite)
    ? compileExecutionEffectWritePolicy(record.filesWrite as readonly string[]) : null;
  if (record === null || attempt === null || workspacePlan === null || captureLimits === null
    || (record.platform !== 'linux' && record.platform !== 'wsl')
    || !isDigest(record.admissionReceiptDigest) || !isDigest(record.custodyPolicyDigest)
    || !isTimestamp(record.admittedAt) || !isDigest(record.nativeCapabilityDigest)
    || writePolicy === null || !writePolicy.ok
    || !sameCanonical(record.filesWrite, writePolicy.policy.filesWrite)) return null;
  const platform = record.platform === 'linux' ? 'linux' : 'wsl2-linux';
  const authorityBody = Object.freeze({
    platform,
    attempt,
    admissionReceiptDigest: record.admissionReceiptDigest,
    custodyPolicyDigest: record.custodyPolicyDigest,
    admittedAt: record.admittedAt,
    writePolicyDigest: writePolicy.policy.digest,
    nativeCapabilityDigest: record.nativeCapabilityDigest,
    workspacePlanDigest: workspacePlan.planDigest,
    captureLimits,
  });
  return Object.freeze({
    platform,
    attempt,
    admissionReceiptDigest: record.admissionReceiptDigest,
    custodyPolicyDigest: record.custodyPolicyDigest,
    admittedAt: record.admittedAt,
    writePolicy: writePolicy.policy,
    nativeCapabilityDigest: record.nativeCapabilityDigest,
    workspacePlan,
    captureLimits,
    preparationAuthorityDigest: digest(
      'execution-effect-docker-preparation-authority-v1',
      authorityBody,
    ),
  });
}

export type AllocateExecutionEffectDockerWorkspaceV1Result =
  | Readonly<{
    readonly state: 'ALLOCATING';
    readonly lifecycleAuthority: ExecutionEffectDockerAllocatingLifecycleAuthorityV1;
    readonly session: AllocatedExecutionEffectDockerWorkspaceV1;
  }>
  | ExecutionEffectDockerLifecycleHoldV1;

/** Pure admission boundary: validates and freezes authority without invoking any adapter effect. */
export function allocateExecutionEffectDockerWorkspaceV1(
  input: PrepareExecutionEffectDockerWorkspaceV1Input,
): AllocateExecutionEffectDockerWorkspaceV1Result {
  const base = snapshotPrepareInput(input);
  if (!base) {
    let platform: unknown = null;
    try { platform = Reflect.get(input as object, 'platform'); } catch { platform = null; }
    return hold(platform === 'darwin' || platform === 'win32'
      ? 'UNSUPPORTED_PLATFORM' : 'INVALID_INPUT', { stage: 'allocation-input', platform });
  }
  const lifecycleAuthority = createExecutionEffectDockerAllocatingLifecycleAuthorityV1(input);
  const opaque = session() as AllocatedExecutionEffectDockerWorkspaceV1;
  allocatingAuthorities.set(opaque, Object.freeze({ base, lifecycleAuthority }));
  return Object.freeze({ state: 'ALLOCATING' as const, lifecycleAuthority, session: opaque });
}

function readDurableAllocationReceipt(
  authority: AllocatingSessionAuthority,
  port: ExecutionEffectDockerAllocationDurabilityPortV1,
): ExecutionEffectDockerDurableAllocationReceiptV1 | null {
  const readMethod = port !== null && typeof port === 'object' && !nodeTypes.isProxy(port)
    ? methodDescriptor(port, 'readVerifiedAllocatingLifecycleAuthority') : null;
  let value: unknown = null;
  if (authority && readMethod) {
    try {
      value = Reflect.apply(readMethod, port, [Object.freeze({
        semanticAuthorityDigest: authority.lifecycleAuthority.authorityDigest,
      })]);
    } catch {
      value = null;
    }
  }
  const publication = exactRecord(value, ['authority', 'artifact']);
  const rereadAuthority = parseExecutionEffectDockerLifecycleAuthorityV1(publication?.authority);
  const artifactValue = publication?.artifact;
  const record = exactRecord(value, [
    'authority', 'artifact',
  ]) ? exactRecord(artifactValue, [
    'state', 'artifactKey', 'artifactReceiptDigest', 'contentDigest', 'byteLength',
    'capturedAt', 'semanticAuthorityDigest', 'durableAuthorityDigest',
  ]) : null;
  if (!publication || rereadAuthority?.state !== 'ALLOCATING'
    || !sameCanonical(rereadAuthority, authority.lifecycleAuthority)
    || !record || record.state !== 'ALLOCATING'
    || typeof record.artifactKey !== 'string' || !STORE_ARTIFACT_KEY.test(record.artifactKey)
    || !isDigest(record.artifactReceiptDigest) || !isDigest(record.contentDigest)
    || !Number.isSafeInteger(record.byteLength) || (record.byteLength as number) <= 0
    || !isTimestamp(record.capturedAt) || !isDigest(record.semanticAuthorityDigest)
    || !isDigest(record.durableAuthorityDigest)
    || record.semanticAuthorityDigest !== authority.lifecycleAuthority.authorityDigest
    || !timestampAtOrAfter(record.capturedAt, authority.base.admittedAt)) {
    return null;
  }
  const durableReceipt = Object.freeze({
    state: 'ALLOCATING' as const,
    artifactKey: record.artifactKey,
    artifactReceiptDigest: record.artifactReceiptDigest,
    contentDigest: record.contentDigest,
    byteLength: record.byteLength as number,
    capturedAt: record.capturedAt,
    semanticAuthorityDigest: record.semanticAuthorityDigest,
    durableAuthorityDigest: record.durableAuthorityDigest,
  });
  return durableReceipt;
}

/** Converts a pure allocation into an effect-capable token only after Store durable reread proof. */
export function authorizeDurableExecutionEffectDockerAllocationV1(
  allocated: AllocatedExecutionEffectDockerWorkspaceV1,
  port: ExecutionEffectDockerAllocationDurabilityPortV1,
): DurablyAllocatedExecutionEffectDockerWorkspaceV1 | ExecutionEffectDockerLifecycleHoldV1 {
  const authority = allocated !== null && typeof allocated === 'object'
    ? allocatingAuthorities.get(allocated) : undefined;
  if (!authority) return hold('SESSION_INVALID', { stage: 'allocation-durable-reread' });
  const durableReceipt = readDurableAllocationReceipt(authority, port);
  if (!durableReceipt) {
    return hold('AUTHORITY_MISMATCH', { stage: 'allocation-durable-reread' });
  }
  const opaque = session() as DurablyAllocatedExecutionEffectDockerWorkspaceV1;
  durableAllocatingAuthorities.set(opaque, Object.freeze({ ...authority, durableReceipt }));
  return opaque;
}

function parseRawCapture(
  value: unknown,
  expected: Readonly<{
    readonly operation: ExecutionEffectDockerLifecycleCaptureOperationV1;
    readonly authorityDigest: Digest;
    readonly phase: 'baseline' | 'final';
    readonly volumeName: string;
    readonly volumeIdentityDigest: Digest;
  }>,
): ExecutionEffectDockerRawCaptureV1 | null {
  const record = exactRecord(value, [
    'workspaceIdentity', 'rootEntry', 'nativeCapture', 'startedAt', 'completedAt',
    'deadlineAt', 'receipt',
  ]);
  const workspaceIdentity = snapshotWorkspaceIdentity(record?.workspaceIdentity);
  const receipt = parseCaptureReceipt(record?.receipt);
  if (record === null || workspaceIdentity === null || receipt === null
    || receipt.operation !== expected.operation || receipt.authorityDigest !== expected.authorityDigest
    || receipt.phase !== expected.phase || receipt.volumeName !== expected.volumeName
    || receipt.volumeIdentityDigest !== expected.volumeIdentityDigest
    || !sameCanonical(receipt.workspaceIdentity, workspaceIdentity)
    || !isTimestamp(record.startedAt) || !isTimestamp(record.completedAt)
    || !isTimestamp(record.deadlineAt) || record.startedAt !== receipt.startedAt
    || record.completedAt !== receipt.completedAt || record.deadlineAt !== receipt.deadlineAt) return null;
  const root = exactRecord(record.rootEntry, [
    'schemaVersion', 'path', 'kind', 'mode', 'size', 'objectIdentityDigest', 'contentDigest',
  ]);
  const capture = exactRecord(record.nativeCapture, [
    'schemaVersion', 'kind', 'state', 'entries', 'entryCount', 'totalBytes', 'manifestDigest',
  ]);
  if (root === null || capture === null || root.objectIdentityDigest !== receipt.rootObjectIdentityDigest
    || capture.manifestDigest !== receipt.nativeManifestDigest
    || capture.entryCount !== receipt.entryCount || capture.totalBytes !== receipt.totalBytes) return null;
  return Object.freeze({
    workspaceIdentity,
    rootEntry: Object.freeze({ ...root }) as unknown as ExecutionEffectNativeCaptureEntryV1,
    nativeCapture: Object.freeze({ ...capture }) as unknown as ExecutionEffectNativeCaptureTreeV1,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    deadlineAt: record.deadlineAt,
    receipt,
  });
}

function manifestFromRaw(
  authority: Pick<PreparedAuthority,
    'platform' | 'attempt' | 'writePolicy' | 'captureLimits'>,
  phase: 'baseline' | 'final',
  capture: ExecutionEffectDockerRawCaptureV1,
): ExecutionEffectManifest | null {
  const result = createExecutionEffectManifestFromNativeCaptureV1({
    phase,
    attempt: authority.attempt,
    filesWrite: authority.writePolicy.filesWrite,
    platform: authority.platform,
    workspaceIdentity: capture.workspaceIdentity,
    rootEntry: capture.rootEntry,
    nativeCapture: capture.nativeCapture,
    startedAt: capture.startedAt,
    completedAt: capture.completedAt,
    deadlineAt: capture.deadlineAt,
    limits: authority.captureLimits,
  });
  return result.ok ? result.manifest : null;
}

function validExclusiveAttachmentReceipt(
  value: unknown,
  expected: Readonly<{
    readonly phase: ExecutionEffectDockerExclusiveAttachmentPhaseV1;
    readonly authorityDigest: Digest;
    readonly workspacePlan: ExecutionEffectDockerWorkspacePlanV1;
    readonly workspaceVolumeIdentityDigest: Digest;
    readonly dependencyVolumeIdentityDigest: Digest;
    readonly notBefore: string;
  }>,
): ExecutionEffectDockerExclusiveAttachmentReceiptV1 | null {
  const receipt = parseExclusiveAttachmentReceipt(value);
  return receipt
    && receipt.phase === expected.phase
    && receipt.authorityDigest === expected.authorityDigest
    && receipt.workspaceVolumeName === expected.workspacePlan.volumeName
    && receipt.workspaceVolumeIdentityDigest === expected.workspaceVolumeIdentityDigest
    && receipt.dependencyVolumeName === expected.workspacePlan.dependencyPlan.volumeName
    && receipt.dependencyVolumeIdentityDigest === expected.dependencyVolumeIdentityDigest
    && timestampAtOrAfter(receipt.observedAt, expected.notBefore)
    ? receipt : null;
}

export type PrepareExecutionEffectDockerWorkspaceV1Result =
  | Readonly<{
    readonly state: 'PREPARED';
    readonly preparationAuthorityDigest: Digest;
    readonly workspacePlan: ExecutionEffectDockerWorkspacePlanV1;
    readonly imageObservation: ExecutionEffectDockerImageObservationV1;
    readonly dependencyAuthority: ExecutionEffectDockerDependencyAuthorityReceiptV1;
    readonly volumeCreationReceipt: ExecutionEffectDockerVolumeCreationReceiptV1;
    readonly populationReceipt: ExecutionEffectDockerPopulationReceiptV1;
    readonly baselineManifest: ExecutionEffectManifest;
    readonly workspaceResource: ExecutionEffectWorkspaceResourceV1;
    readonly workspaceSnapshot: ExecutionEffectWorkspaceSnapshotSealV1;
    readonly lifecycleAuthority: ExecutionEffectDockerPreparedLifecycleAuthorityV1;
    readonly session: PreparedExecutionEffectDockerWorkspaceV1;
  }>
  | ExecutionEffectDockerLifecycleHoldV1;

export async function prepareAllocatedExecutionEffectDockerWorkspaceV1(
  allocation: DurablyAllocatedExecutionEffectDockerWorkspaceV1,
  adapter: ExecutionEffectDockerLifecycleAdapterV1,
  clock: ExecutionEffectDockerLifecycleClockV1,
): Promise<PrepareExecutionEffectDockerWorkspaceV1Result> {
  const allocationAuthority = allocation !== null && typeof allocation === 'object'
    ? durableAllocatingAuthorities.get(allocation) : undefined;
  if (!allocationAuthority) return hold('SESSION_INVALID', { stage: 'durable-allocation' });
  const base = allocationAuthority.base;
  const adapters = snapshotAdapters(adapter, clock);
  if (!adapters) return hold('ADAPTER_UNAVAILABLE', { stage: 'prepare' });
  const plan = base.workspacePlan;
  try {
    const imageRaw = await Reflect.apply(adapters.inspectImage, adapters.adapterThis, [
      Object.freeze({
        authorityDigest: base.preparationAuthorityDigest,
        imageReference: plan.imageReference,
        expectedImageDigest: plan.imageDigest,
        dependencyPlanDigest: plan.dependencyPlanDigest,
      }),
    ]);
    const imageObservation = parseImageObservation(imageRaw);
    if (!imageObservation || imageObservation.authorityDigest !== base.preparationAuthorityDigest
      || imageObservation.imageReference !== plan.imageReference
      || imageObservation.imageDigest !== plan.imageDigest
      || !timestampAtOrAfter(imageObservation.observedAt, base.admittedAt)) {
      return hold('AUTHORITY_MISMATCH', {
        stage: 'image-inspect', preparationAuthorityDigest: base.preparationAuthorityDigest,
      });
    }
    const dependencyAuthorityDigest = digest(
      'execution-effect-docker-dependency-preparation-authority-v1',
      {
        preparationAuthorityDigest: base.preparationAuthorityDigest,
        imageObservationReceiptDigest: imageObservation.receiptDigest,
        dependencyPlanDigest: plan.dependencyPlanDigest,
      },
    );
    const dependencyRaw = await Reflect.apply(
      adapters.prepareDependencies,
      adapters.adapterThis,
      [Object.freeze({
        authorityDigest: dependencyAuthorityDigest,
        imageReference: plan.imageReference,
        imageDigest: plan.imageDigest,
        imageIdentityDigest: imageObservation.imageIdentityDigest,
        imageObservationReceiptDigest: imageObservation.receiptDigest,
        labels: plan.dependencyLabels,
        labelsDigest: plan.dependencyLabelsDigest,
        resourceInstanceDigest: plan.dependencyResourceInstanceDigest,
        dependencyPlan: plan.dependencyPlan,
        dependencyPlanDigest: plan.dependencyPlanDigest,
      })],
    );
    const dependencyAuthority = parseDependencyAuthorityReceipt(dependencyRaw);
    if (!dependencyAuthority || dependencyAuthority.authorityDigest !== dependencyAuthorityDigest
      || dependencyAuthority.imageObservationReceiptDigest !== imageObservation.receiptDigest
      || dependencyAuthority.imageIdentityDigest !== imageObservation.imageIdentityDigest
      || dependencyAuthority.dependencyPlanDigest !== plan.dependencyPlanDigest
      || dependencyAuthority.labelsDigest !== plan.dependencyLabelsDigest
      || dependencyAuthority.resourceInstanceDigest !== plan.dependencyResourceInstanceDigest
      || dependencyAuthority.volumeName !== plan.dependencyPlan.volumeName
      || !timestampAtOrAfter(dependencyAuthority.startedAt, imageObservation.observedAt)) {
      return hold('DEPENDENCY_AUTHORITY_UNAVAILABLE', {
        stage: 'dependency-volume', authorityDigest: dependencyAuthorityDigest,
      });
    }
    const absentRaw = await Reflect.apply(adapters.inspectVolume, adapters.adapterThis, [
      Object.freeze({
        phase: 'EXPECT_ABSENT' as const,
        authorityDigest: base.preparationAuthorityDigest,
        plan,
        creationReceiptDigest: null,
      }),
    ]);
    const absenceObservation = parseExecutionEffectDockerVolumeObservationV1(absentRaw);
    if (!absenceObservation || absenceObservation.state !== 'ABSENT'
      || absenceObservation.authorityDigest !== base.preparationAuthorityDigest
      || absenceObservation.volumeName !== plan.volumeName
      || absenceObservation.resourceInstanceDigest !== plan.workspaceResourceInstanceDigest
      || !timestampAtOrAfter(absenceObservation.observedAt, dependencyAuthority.completedAt)) {
      return hold(
        absenceObservation?.state === 'PRESENT' ? 'VOLUME_NOT_ABSENT' : 'VOLUME_INSPECT_MISMATCH',
        { stage: 'absence', preparationAuthorityDigest: base.preparationAuthorityDigest },
      );
    }
    const creationRaw = await Reflect.apply(adapters.createVolume, adapters.adapterThis, [
      Object.freeze({
        authorityDigest: base.preparationAuthorityDigest,
        plan,
        absenceObservationDigest: absenceObservation.observationDigest,
      }),
    ]);
    const creationReceipt = parseVolumeCreationReceipt(creationRaw);
    if (!creationReceipt || creationReceipt.authorityDigest !== base.preparationAuthorityDigest
      || creationReceipt.absenceObservationDigest !== absenceObservation.observationDigest
      || creationReceipt.volumeName !== plan.volumeName
      || creationReceipt.resourceInstanceDigest !== plan.workspaceResourceInstanceDigest
      || creationReceipt.labelsDigest !== plan.workspaceLabelsDigest
      || creationReceipt.mountPlanDigest !== plan.mountPlanDigest
      || !timestampAtOrAfter(creationReceipt.createRequestedAt,
        absenceObservation.observedAt)) {
      return hold('VOLUME_CREATE_REJECTED', {
        stage: 'create', absenceObservationDigest: absenceObservation.observationDigest,
      });
    }
    const presentRaw = await Reflect.apply(adapters.inspectVolume, adapters.adapterThis, [
      Object.freeze({
        phase: 'VERIFY_CREATED' as const,
        authorityDigest: base.preparationAuthorityDigest,
        plan,
        creationReceiptDigest: creationReceipt.receiptDigest,
      }),
    ]);
    const presentObservation = parseExecutionEffectDockerVolumeObservationV1(presentRaw);
    if (!presentObservation || presentObservation.state !== 'PRESENT'
      || presentObservation.authorityDigest !== base.preparationAuthorityDigest
      || presentObservation.volumeName !== plan.volumeName
      || presentObservation.resourceInstanceDigest !== plan.workspaceResourceInstanceDigest
      || presentObservation.labelsDigest !== plan.workspaceLabelsDigest
      || presentObservation.mountPlanDigest !== plan.mountPlanDigest
      || presentObservation.volumeIdentityDigest !== creationReceipt.volumeIdentityDigest
      || presentObservation.daemonCreatedAt !== creationReceipt.daemonCreatedAt
      || !timestampAtOrAfter(creationReceipt.createCompletedAt,
        creationReceipt.createRequestedAt)
      || !timestampAtOrAfter(presentObservation.observedAt,
        creationReceipt.createCompletedAt)) {
      return hold('VOLUME_INSPECT_MISMATCH', {
        stage: 'post-create', creationReceiptDigest: creationReceipt.receiptDigest,
      });
    }
    const populationAuthorityDigest = digest('execution-effect-docker-population-authority-v1', {
      preparationAuthorityDigest: base.preparationAuthorityDigest,
      imageObservationReceiptDigest: imageObservation.receiptDigest,
      dependencyAuthorityReceiptDigest: dependencyAuthority.receiptDigest,
      creationReceiptDigest: creationReceipt.receiptDigest,
      presentObservationDigest: presentObservation.observationDigest,
    });
    const populationRaw = await Reflect.apply(adapters.populateWorkspace, adapters.adapterThis, [
      Object.freeze({
        platform: base.platform,
        authorityDigest: populationAuthorityDigest,
        plan,
        attempt: base.attempt,
        admissionReceiptDigest: base.admissionReceiptDigest,
        custodyPolicyDigest: base.custodyPolicyDigest,
        writePolicy: base.writePolicy,
        volumeIdentityDigest: presentObservation.volumeIdentityDigest,
        dependencyAuthorityReceiptDigest: dependencyAuthority.receiptDigest,
        captureLimits: base.captureLimits,
      }),
    ]);
    const populationRecord = exactRecord(populationRaw, ['populationReceipt', 'capture']);
    const populationReceipt = parsePopulationReceipt(populationRecord?.populationReceipt);
    const rawCapture = parseRawCapture(populationRecord?.capture, {
      operation: 'POPULATION_BASELINE',
      authorityDigest: populationAuthorityDigest,
      phase: 'baseline',
      volumeName: plan.volumeName,
      volumeIdentityDigest: presentObservation.volumeIdentityDigest,
    });
    if (!populationRecord || !populationReceipt || !rawCapture
      || populationReceipt.authorityDigest !== populationAuthorityDigest
      || populationReceipt.volumeName !== plan.volumeName
      || populationReceipt.volumeIdentityDigest !== presentObservation.volumeIdentityDigest
      || populationReceipt.inventoryDigest !== plan.inventoryDigest
      || populationReceipt.inventoryAdmissionReceiptDigest !== plan.inventoryAdmissionReceiptDigest
      || populationReceipt.dependencyPlanDigest !== plan.dependencyPlanDigest
      || populationReceipt.dependencyAuthorityReceiptDigest !== dependencyAuthority.receiptDigest
      || populationReceipt.rejectedPathCount !== 0
      || populationReceipt.rejectedPathsDigest !== plan.inventoryRejectedPathsDigest
      || populationReceipt.captureReceiptDigest !== rawCapture.receipt.receiptDigest
      || populationReceipt.populatedPathCount !== plan.inventoryPathCount
      || populationReceipt.manifestEntryCount > base.captureLimits.maxEntries
      || populationReceipt.manifestTotalBytes > base.captureLimits.maxTotalBytes
      || populationReceipt.completedAt !== rawCapture.completedAt
      || !timestampAtOrAfter(rawCapture.startedAt, presentObservation.observedAt)) {
      return hold('POPULATION_HOLD', {
        stage: 'population', authorityDigest: populationAuthorityDigest,
      });
    }
    const baselineManifest = manifestFromRaw(base, 'baseline', rawCapture);
    if (!baselineManifest || baselineManifest.policy.digest !== base.writePolicy.digest
      || rawCapture.receipt.manifestStateDigest
        !== executionEffectDockerManifestStateDigestV1(baselineManifest)) {
      return hold('CAPTURE_HOLD', {
        stage: 'baseline-manifest', captureReceiptDigest: rawCapture.receipt.receiptDigest,
      });
    }
    const workspaceResource = createExecutionEffectWorkspaceResourceV1({
      volumeName: plan.volumeName,
      imageDigest: plan.imageDigest,
      labelsDigest: plan.workspaceLabelsDigest,
      mountPlanDigest: plan.mountPlanDigest,
      resourceInstanceDigest: plan.workspaceResourceInstanceDigest,
      volumeIdentityDigest: presentObservation.volumeIdentityDigest,
      absenceObservationDigest: absenceObservation.observationDigest,
      creationReceiptDigest: creationReceipt.receiptDigest,
      verifiedPresentObservationDigest: presentObservation.observationDigest,
      freshnessReceiptDigest: executionEffectDockerWorkspaceFreshnessReceiptDigestV1({
        resourceInstanceDigest: plan.workspaceResourceInstanceDigest,
        volumeIdentityDigest: presentObservation.volumeIdentityDigest,
        absenceObservationDigest: absenceObservation.observationDigest,
        creationReceiptDigest: creationReceipt.receiptDigest,
        verifiedPresentObservationDigest: presentObservation.observationDigest,
      }),
      snapshotInventoryDigest: plan.inventoryDigest,
      populationReceiptDigest: populationReceipt.receiptDigest,
      baselineManifestDigest: baselineManifest.digest as Digest,
    });
    const dependencyResource = createExecutionEffectDependencyResourceV1({
      attempt: base.attempt,
      admissionReceiptDigest: base.admissionReceiptDigest,
      custodyPolicyDigest: base.custodyPolicyDigest,
      imageIdentityDigest: dependencyAuthority.imageIdentityDigest,
      labelsDigest: dependencyAuthority.labelsDigest,
      resourceInstanceDigest: dependencyAuthority.resourceInstanceDigest,
      mountPlanDigest: plan.dependencyPlanDigest,
      populationReceiptDigest: dependencyAuthority.populationReceiptDigest,
      volumeName: dependencyAuthority.volumeName,
      volumeIdentityDigest: dependencyAuthority.volumeIdentityDigest,
      readyAt: dependencyAuthority.completedAt,
    });
    const sealedAt = readClock(adapters, rawCapture.completedAt);
    if (!sealedAt) return hold('CLOCK_INVALID', { stage: 'seal' });
    const workspaceSnapshot = createExecutionEffectWorkspaceSnapshotSealV1({
      attempt: base.attempt,
      admissionReceiptDigest: base.admissionReceiptDigest,
      custodyPolicyDigest: base.custodyPolicyDigest,
      writePolicyDigest: base.writePolicy.digest as Digest,
      workspaceIdentity: baselineManifest.workspaceIdentity,
      workspaceResource,
      dependencyResource,
      nativeCapabilityDigest: base.nativeCapabilityDigest,
      platform: base.platform,
      sealedAt,
    });
    const authority: PreparedAuthority = Object.freeze({
      ...base,
      imageObservation,
      dependencyAuthority,
      absenceObservation,
      creationReceipt,
      presentObservation,
      populationReceipt,
      baselineManifest,
      workspaceResource,
      workspaceSnapshot,
      adapters,
    });
    const lifecycleAuthority = createExecutionEffectDockerLifecycleAuthorityV1({
      ...lifecycleCommonInputFromPrepared(authority),
      state: 'PREPARED',
      predecessorAuthorityDigest: allocatingLifecycleAuthorityFromPrepared(authority).authorityDigest,
    }) as ExecutionEffectDockerPreparedLifecycleAuthorityV1;
    const opaque = session() as PreparedExecutionEffectDockerWorkspaceV1;
    preparedAuthorities.set(opaque, authority);
    return Object.freeze({
      state: 'PREPARED' as const,
      preparationAuthorityDigest: base.preparationAuthorityDigest,
      workspacePlan: plan,
      imageObservation,
      dependencyAuthority,
      volumeCreationReceipt: creationReceipt,
      populationReceipt,
      baselineManifest,
      workspaceResource,
      workspaceSnapshot,
      lifecycleAuthority,
      session: opaque,
    });
  } catch (error) {
    return hold('ADAPTER_UNAVAILABLE', {
      stage: 'prepare-call', preparationAuthorityDigest: base.preparationAuthorityDigest,
    });
  }
}

export type AuthorizeExecutionEffectDockerProviderStartV1Result =
  | Readonly<{
    readonly state: 'PROVIDER_START_AUTHORIZED';
    readonly providerStartAuthorityDigest: Digest;
    readonly exclusiveAttachmentReceipt: ExecutionEffectDockerExclusiveAttachmentReceiptV1;
    readonly baselineRevalidationReceipt: ExecutionEffectDockerLifecycleCaptureReceiptV1;
    readonly authorizedAt: string;
    readonly workspacePlan: ExecutionEffectDockerWorkspacePlanV1;
    readonly dependencyAuthority: ExecutionEffectDockerDependencyAuthorityReceiptV1;
    readonly workspaceSnapshot: ExecutionEffectWorkspaceSnapshotSealV1;
    readonly lifecycleAuthority: ExecutionEffectDockerProviderLifecycleAuthorityV1;
    readonly session: AuthorizedExecutionEffectDockerProviderV1;
  }>
  | ExecutionEffectDockerLifecycleHoldV1;

export async function authorizeExecutionEffectDockerProviderStartV1(
  prepared: PreparedExecutionEffectDockerWorkspaceV1,
): Promise<AuthorizeExecutionEffectDockerProviderStartV1Result> {
  if (prepared === null || typeof prepared !== 'object' || nodeTypes.isProxy(prepared)) {
    return hold('SESSION_INVALID', { stage: 'provider-start' });
  }
  const authority = preparedAuthorities.get(prepared);
  if (!authority) return hold('SESSION_INVALID', { stage: 'provider-start' });
  preparedAuthorities.delete(prepared);
  const attachmentAuthorityDigest = digest('execution-effect-docker-pre-provider-attachment-authority-v1', {
    preparationAuthorityDigest: authority.preparationAuthorityDigest,
    workspaceSnapshotSealDigest: authority.workspaceSnapshot.sealDigest,
    presentObservationDigest: authority.presentObservation.observationDigest,
    dependencyAuthorityReceiptDigest: authority.dependencyAuthority.receiptDigest,
  });
  try {
    const attachmentRaw = await Reflect.apply(
      authority.adapters.verifyExclusiveAttachments,
      authority.adapters.adapterThis,
      [Object.freeze({
        phase: 'PRE_PROVIDER_START' as const,
        authorityDigest: attachmentAuthorityDigest,
        workspaceVolumeName: authority.workspacePlan.volumeName,
        workspaceVolumeIdentityDigest: authority.presentObservation.volumeIdentityDigest,
        dependencyVolumeName: authority.workspacePlan.dependencyPlan.volumeName,
        dependencyVolumeIdentityDigest: authority.dependencyAuthority.volumeIdentityDigest,
        workspacePlan: authority.workspacePlan,
        dependencyAuthority: authority.dependencyAuthority,
        expectedAttachedContainerIdentityDigests: Object.freeze([]) as readonly [],
      })],
    );
    const preProviderAttachmentReceipt = validExclusiveAttachmentReceipt(attachmentRaw, {
      phase: 'PRE_PROVIDER_START',
      authorityDigest: attachmentAuthorityDigest,
      workspacePlan: authority.workspacePlan,
      workspaceVolumeIdentityDigest: authority.presentObservation.volumeIdentityDigest,
      dependencyVolumeIdentityDigest: authority.dependencyAuthority.volumeIdentityDigest,
      notBefore: authority.workspaceSnapshot.sealedAt,
    });
    if (!preProviderAttachmentReceipt) {
      return hold('ATTACHMENT_HOLD', {
        stage: 'pre-provider-attachment', authorityDigest: attachmentAuthorityDigest,
      });
    }
    const captureAuthorityDigest = digest(
      'execution-effect-docker-baseline-revalidation-authority-v1',
      {
        preparationAuthorityDigest: authority.preparationAuthorityDigest,
        workspaceSnapshotSealDigest: authority.workspaceSnapshot.sealDigest,
        baselineManifestDigest: authority.baselineManifest.digest,
        presentObservationDigest: authority.presentObservation.observationDigest,
        exclusiveAttachmentReceiptDigest: preProviderAttachmentReceipt.receiptDigest,
      },
    );
    const raw = await Reflect.apply(
      authority.adapters.captureWorkspace,
      authority.adapters.adapterThis,
      [Object.freeze({
        platform: authority.platform,
        operation: 'BASELINE_REVALIDATION' as const,
        authorityDigest: captureAuthorityDigest,
        plan: authority.workspacePlan,
        attempt: authority.attempt,
        admissionReceiptDigest: authority.admissionReceiptDigest,
        custodyPolicyDigest: authority.custodyPolicyDigest,
        writePolicy: authority.writePolicy,
        workspaceSnapshot: authority.workspaceSnapshot,
        expectedWorkspaceStateDigest: executionEffectDockerManifestStateDigestV1(
          authority.baselineManifest,
        ),
        captureLimits: authority.captureLimits,
      })],
    );
    const captured = parseRawCapture(raw, {
      operation: 'BASELINE_REVALIDATION',
      authorityDigest: captureAuthorityDigest,
      phase: 'baseline',
      volumeName: authority.workspacePlan.volumeName,
      volumeIdentityDigest: authority.presentObservation.volumeIdentityDigest,
    });
    const manifest = captured ? manifestFromRaw(authority, 'baseline', captured) : null;
    const observedStateDigest = manifest
      ? executionEffectDockerManifestStateDigestV1(manifest) : null;
    const expectedStateDigest = executionEffectDockerManifestStateDigestV1(
      authority.baselineManifest,
    );
    const timestampValid = captured
      ? timestampAtOrAfter(captured.startedAt, preProviderAttachmentReceipt.observedAt) : false;
    if (!captured || !manifest
      || observedStateDigest !== expectedStateDigest
      || captured.receipt.manifestStateDigest !== observedStateDigest
      || !timestampValid) {
      return hold('CAPTURE_HOLD', {
        stage: 'baseline-revalidation', authorityDigest: captureAuthorityDigest,
      });
    }
    const authorizedAt = readClock(authority.adapters, captured.completedAt);
    if (!authorizedAt) return hold('CLOCK_INVALID', { stage: 'provider-start' });
    const preparedLifecycleAuthority = createExecutionEffectDockerLifecycleAuthorityV1({
      ...lifecycleCommonInputFromPrepared(authority),
      state: 'PREPARED',
      predecessorAuthorityDigest: allocatingLifecycleAuthorityFromPrepared(authority).authorityDigest,
    }) as ExecutionEffectDockerPreparedLifecycleAuthorityV1;
    const providerStartAuthorityDigest = digest(
      'execution-effect-docker-provider-start-authority-v1',
      {
        predecessorAuthorityDigest: preparedLifecycleAuthority.authorityDigest,
        preparationAuthorityDigest: authority.preparationAuthorityDigest,
        workspaceSnapshotSealDigest: authority.workspaceSnapshot.sealDigest,
        dependencyAuthorityReceiptDigest: authority.dependencyAuthority.receiptDigest,
        exclusiveAttachmentReceiptDigest: preProviderAttachmentReceipt.receiptDigest,
        baselineManifestDigest: authority.baselineManifest.digest,
        baselineRevalidationReceiptDigest: captured.receipt.receiptDigest,
        authorizedAt,
      },
    );
    const providerAuthority: ProviderAuthority = Object.freeze({
      ...authority,
      preProviderAttachmentReceipt,
      baselineRevalidationReceipt: captured.receipt,
      providerStartAuthorityDigest,
      authorizedAt,
    });
    const lifecycleAuthority = createExecutionEffectDockerLifecycleAuthorityV1({
      ...lifecycleCommonInputFromPrepared(providerAuthority),
      state: 'PROVIDER_START_AUTHORIZED',
      predecessorAuthorityDigest: preparedLifecycleAuthority.authorityDigest,
      preProviderAttachmentReceipt,
      baselineRevalidationReceipt: captured.receipt,
      providerStartAuthorityDigest,
      authorizedAt,
    }) as ExecutionEffectDockerProviderLifecycleAuthorityV1;
    const opaque = session() as AuthorizedExecutionEffectDockerProviderV1;
    providerAuthorities.set(opaque, providerAuthority);
    return Object.freeze({
      state: 'PROVIDER_START_AUTHORIZED' as const,
      providerStartAuthorityDigest,
      exclusiveAttachmentReceipt: preProviderAttachmentReceipt,
      baselineRevalidationReceipt: captured.receipt,
      authorizedAt,
      workspacePlan: authority.workspacePlan,
      dependencyAuthority: authority.dependencyAuthority,
      workspaceSnapshot: authority.workspaceSnapshot,
      lifecycleAuthority,
      session: opaque,
    });
  } catch {
    return hold('ADAPTER_UNAVAILABLE', {
      stage: 'provider-start-revalidation-call', authorityDigest: attachmentAuthorityDigest,
    });
  }
}

export interface ExecutionEffectDockerProviderStoppedReceiptV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-provider-stopped-receipt';
  readonly state: 'STOPPED';
  readonly providerStartAuthorityDigest: Digest;
  readonly containerName: string;
  readonly containerIdentityDigest: Digest;
  readonly exitCode: number;
  readonly exitObservationReceiptDigest: Digest;
  readonly stoppedAt: string;
  readonly receiptDigest: Digest;
}

export function createExecutionEffectDockerProviderStoppedReceiptV1(input: Omit<
  ExecutionEffectDockerProviderStoppedReceiptV1,
  'version' | 'kind' | 'state' | 'receiptDigest'
>): ExecutionEffectDockerProviderStoppedReceiptV1 {
  const record = exactRecord(input, [
    'providerStartAuthorityDigest', 'containerName', 'containerIdentityDigest', 'exitCode',
    'exitObservationReceiptDigest', 'stoppedAt',
  ]);
  if (record === null || !isDigest(record.providerStartAuthorityDigest)
    || typeof record.containerName !== 'string' || !CONTAINER_NAME.test(record.containerName)
    || !isDigest(record.containerIdentityDigest) || !Number.isSafeInteger(record.exitCode)
    || (record.exitCode as number) < 0 || (record.exitCode as number) > 255
    || !isDigest(record.exitObservationReceiptDigest) || !isTimestamp(record.stoppedAt)) {
    throw new TypeError('Invalid Docker provider stopped receipt');
  }
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-provider-stopped-receipt' as const,
    state: 'STOPPED' as const,
    providerStartAuthorityDigest: record.providerStartAuthorityDigest,
    containerName: record.containerName,
    containerIdentityDigest: record.containerIdentityDigest,
    exitCode: record.exitCode as number,
    exitObservationReceiptDigest: record.exitObservationReceiptDigest,
    stoppedAt: record.stoppedAt,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest('execution-effect-docker-provider-stopped-receipt-v1', body),
  }) as ExecutionEffectDockerProviderStoppedReceiptV1;
}

function parseProviderStoppedReceipt(
  value: unknown,
): ExecutionEffectDockerProviderStoppedReceiptV1 | null {
  const record = exactRecord(value, [
    'version', 'kind', 'state', 'providerStartAuthorityDigest', 'containerName',
    'containerIdentityDigest', 'exitCode', 'exitObservationReceiptDigest', 'stoppedAt',
    'receiptDigest',
  ]);
  if (record === null || record.version !== 1
    || record.kind !== 'execution-effect-docker-provider-stopped-receipt'
    || record.state !== 'STOPPED' || !isDigest(record.receiptDigest)) return null;
  try {
    const recreated = createExecutionEffectDockerProviderStoppedReceiptV1({
      providerStartAuthorityDigest: record.providerStartAuthorityDigest as Digest,
      containerName: record.containerName as string,
      containerIdentityDigest: record.containerIdentityDigest as Digest,
      exitCode: record.exitCode as number,
      exitObservationReceiptDigest: record.exitObservationReceiptDigest as Digest,
      stoppedAt: record.stoppedAt as string,
    });
    return sameCanonical(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export type CaptureExecutionEffectDockerFinalV1Result =
  | Readonly<{
    readonly state: 'READY_FOR_LANDING';
    readonly landingAuthorityDigest: Digest;
    readonly baselineManifest: ExecutionEffectManifest;
    readonly finalManifest: ExecutionEffectManifest;
    readonly decision: Extract<ExecutionEffectContainmentDecision, { state: 'VERIFIED' }>;
    readonly exclusiveAttachmentReceipt: ExecutionEffectDockerExclusiveAttachmentReceiptV1;
    readonly quiescenceSeal: ExecutionEffectDockerQuiescenceSealV1;
    readonly finalCaptureReceipt: ExecutionEffectDockerLifecycleCaptureReceiptV1;
    readonly workspacePlan: ExecutionEffectDockerWorkspacePlanV1;
    readonly dependencyAuthority: ExecutionEffectDockerDependencyAuthorityReceiptV1;
    readonly workspaceSnapshot: ExecutionEffectWorkspaceSnapshotSealV1;
    readonly lifecycleAuthority: ExecutionEffectDockerReadyLifecycleAuthorityV1;
    readonly session: CapturedExecutionEffectDockerLandingV1;
  }>
  | ExecutionEffectDockerLifecycleHoldV1;

export async function captureExecutionEffectDockerFinalV1(
  provider: AuthorizedExecutionEffectDockerProviderV1,
  stoppedValue: ExecutionEffectDockerProviderStoppedReceiptV1,
): Promise<CaptureExecutionEffectDockerFinalV1Result> {
  if (provider === null || typeof provider !== 'object' || nodeTypes.isProxy(provider)) {
    return hold('SESSION_INVALID', { stage: 'final' });
  }
  const authority = providerAuthorities.get(provider);
  if (!authority) return hold('SESSION_INVALID', { stage: 'final' });
  providerAuthorities.delete(provider);
  const stopped = parseProviderStoppedReceipt(stoppedValue);
  if (!stopped || stopped.providerStartAuthorityDigest !== authority.providerStartAuthorityDigest
    || !timestampAtOrAfter(stopped.stoppedAt, authority.authorizedAt)) {
    return hold('AUTHORITY_MISMATCH', {
      stage: 'provider-stopped', providerStartAuthorityDigest: authority.providerStartAuthorityDigest,
    });
  }
  const attachmentAuthorityDigest = digest('execution-effect-docker-post-provider-attachment-authority-v1', {
    providerStartAuthorityDigest: authority.providerStartAuthorityDigest,
    providerStoppedReceiptDigest: stopped.receiptDigest,
    workspaceSnapshotSealDigest: authority.workspaceSnapshot.sealDigest,
    dependencyAuthorityReceiptDigest: authority.dependencyAuthority.receiptDigest,
  });
  try {
    const attachmentRaw = await Reflect.apply(
      authority.adapters.verifyExclusiveAttachments,
      authority.adapters.adapterThis,
      [Object.freeze({
        phase: 'POST_PROVIDER_STOP' as const,
        authorityDigest: attachmentAuthorityDigest,
        workspaceVolumeName: authority.workspacePlan.volumeName,
        workspaceVolumeIdentityDigest: authority.presentObservation.volumeIdentityDigest,
        dependencyVolumeName: authority.workspacePlan.dependencyPlan.volumeName,
        dependencyVolumeIdentityDigest: authority.dependencyAuthority.volumeIdentityDigest,
        workspacePlan: authority.workspacePlan,
        dependencyAuthority: authority.dependencyAuthority,
        expectedAttachedContainerIdentityDigests: Object.freeze([]) as readonly [],
      })],
    );
    const postProviderAttachmentReceipt = validExclusiveAttachmentReceipt(attachmentRaw, {
      phase: 'POST_PROVIDER_STOP',
      authorityDigest: attachmentAuthorityDigest,
      workspacePlan: authority.workspacePlan,
      workspaceVolumeIdentityDigest: authority.presentObservation.volumeIdentityDigest,
      dependencyVolumeIdentityDigest: authority.dependencyAuthority.volumeIdentityDigest,
      notBefore: stopped.stoppedAt,
    });
    if (!postProviderAttachmentReceipt) {
      return hold('ATTACHMENT_HOLD', {
        stage: 'post-provider-attachment', authorityDigest: attachmentAuthorityDigest,
      });
    }
    const firstCaptureAuthorityDigest = digest(
      'execution-effect-docker-final-quiescence-first-authority-v1',
      {
        providerStartAuthorityDigest: authority.providerStartAuthorityDigest,
        providerStoppedReceiptDigest: stopped.receiptDigest,
        workspaceSnapshotSealDigest: authority.workspaceSnapshot.sealDigest,
        exclusiveAttachmentReceiptDigest: postProviderAttachmentReceipt.receiptDigest,
      },
    );
    const firstRaw = await Reflect.apply(
      authority.adapters.captureWorkspace,
      authority.adapters.adapterThis,
      [Object.freeze({
        platform: authority.platform,
        operation: 'FINAL_QUIESCENCE_FIRST' as const,
        authorityDigest: firstCaptureAuthorityDigest,
        plan: authority.workspacePlan,
        attempt: authority.attempt,
        admissionReceiptDigest: authority.admissionReceiptDigest,
        custodyPolicyDigest: authority.custodyPolicyDigest,
        writePolicy: authority.writePolicy,
        workspaceSnapshot: authority.workspaceSnapshot,
        expectedWorkspaceStateDigest: null,
        captureLimits: authority.captureLimits,
      })],
    );
    const firstCaptured = parseRawCapture(firstRaw, {
      operation: 'FINAL_QUIESCENCE_FIRST',
      authorityDigest: firstCaptureAuthorityDigest,
      phase: 'final',
      volumeName: authority.workspacePlan.volumeName,
      volumeIdentityDigest: authority.presentObservation.volumeIdentityDigest,
    });
    const firstManifest = firstCaptured ? manifestFromRaw(authority, 'final', firstCaptured) : null;
    if (!firstCaptured || !firstManifest
      || firstCaptured.receipt.manifestStateDigest
        !== executionEffectDockerManifestStateDigestV1(firstManifest)
      || !timestampAtOrAfter(firstCaptured.startedAt, postProviderAttachmentReceipt.observedAt)) {
      return hold('CAPTURE_HOLD', {
        stage: 'final-quiescence-first', authorityDigest: firstCaptureAuthorityDigest,
      });
    }
    const firstManifestStateDigest = executionEffectDockerManifestStateDigestV1(firstManifest);
    const secondCaptureAuthorityDigest = digest(
      'execution-effect-docker-final-quiescence-second-authority-v1',
      {
        firstCaptureAuthorityDigest,
        firstCaptureReceiptDigest: firstCaptured.receipt.receiptDigest,
        firstManifestStateDigest,
      },
    );
    const secondRaw = await Reflect.apply(
      authority.adapters.captureWorkspace,
      authority.adapters.adapterThis,
      [Object.freeze({
        platform: authority.platform,
        operation: 'FINAL_QUIESCENCE_SECOND' as const,
        authorityDigest: secondCaptureAuthorityDigest,
        plan: authority.workspacePlan,
        attempt: authority.attempt,
        admissionReceiptDigest: authority.admissionReceiptDigest,
        custodyPolicyDigest: authority.custodyPolicyDigest,
        writePolicy: authority.writePolicy,
        workspaceSnapshot: authority.workspaceSnapshot,
        expectedWorkspaceStateDigest: firstManifestStateDigest,
        captureLimits: authority.captureLimits,
      })],
    );
    const secondCaptured = parseRawCapture(secondRaw, {
      operation: 'FINAL_QUIESCENCE_SECOND',
      authorityDigest: secondCaptureAuthorityDigest,
      phase: 'final',
      volumeName: authority.workspacePlan.volumeName,
      volumeIdentityDigest: authority.presentObservation.volumeIdentityDigest,
    });
    const finalManifest = secondCaptured ? manifestFromRaw(authority, 'final', secondCaptured) : null;
    const finalManifestStateDigest = finalManifest
      ? executionEffectDockerManifestStateDigestV1(finalManifest) : null;
    if (!secondCaptured || !finalManifest || finalManifestStateDigest !== firstManifestStateDigest
      || secondCaptured.receipt.manifestStateDigest !== finalManifestStateDigest
      || !timestampAtOrAfter(secondCaptured.startedAt, firstCaptured.completedAt)) {
      return hold('QUIESCENCE_HOLD', {
        stage: 'final-quiescence-second', authorityDigest: secondCaptureAuthorityDigest,
      });
    }
    const quiescenceSealedAt = readClock(authority.adapters, secondCaptured.completedAt);
    if (!quiescenceSealedAt) return hold('CLOCK_INVALID', { stage: 'final-quiescence-seal' });
    const quiescenceSeal = createExecutionEffectDockerQuiescenceSealV1({
      authorityDigest: secondCaptureAuthorityDigest,
      attachmentReceiptDigest: postProviderAttachmentReceipt.receiptDigest,
      firstCaptureReceiptDigest: firstCaptured.receipt.receiptDigest,
      secondCaptureReceiptDigest: secondCaptured.receipt.receiptDigest,
      firstManifestStateDigest,
      secondManifestStateDigest: finalManifestStateDigest,
      sealedAt: quiescenceSealedAt,
    });
    const decision = evaluateExecutionEffectContainment({
      baseline: Object.freeze({ ok: true as const, manifest: authority.baselineManifest }),
      final: Object.freeze({ ok: true as const, manifest: finalManifest }),
    });
    if (decision.state !== 'VERIFIED') {
      return hold('CONTAINMENT_HOLD', {
        stage: 'containment', decisionDigest: decision.decisionDigest,
      }, decision);
    }
    const preparedLifecycleAuthority = createExecutionEffectDockerLifecycleAuthorityV1({
      ...lifecycleCommonInputFromPrepared(authority),
      state: 'PREPARED',
      predecessorAuthorityDigest: allocatingLifecycleAuthorityFromPrepared(authority).authorityDigest,
    }) as ExecutionEffectDockerPreparedLifecycleAuthorityV1;
    const providerLifecycleAuthority = createExecutionEffectDockerLifecycleAuthorityV1({
      ...lifecycleCommonInputFromPrepared(authority),
      state: 'PROVIDER_START_AUTHORIZED',
      predecessorAuthorityDigest: preparedLifecycleAuthority.authorityDigest,
      preProviderAttachmentReceipt: authority.preProviderAttachmentReceipt,
      baselineRevalidationReceipt: authority.baselineRevalidationReceipt,
      providerStartAuthorityDigest: authority.providerStartAuthorityDigest,
      authorizedAt: authority.authorizedAt,
    }) as ExecutionEffectDockerProviderLifecycleAuthorityV1;
    const landingAuthorityDigest = digest('execution-effect-docker-landing-authority-v1', {
      predecessorAuthorityDigest: providerLifecycleAuthority.authorityDigest,
      providerStartAuthorityDigest: authority.providerStartAuthorityDigest,
      providerStoppedReceiptDigest: stopped.receiptDigest,
      workspaceSnapshotSealDigest: authority.workspaceSnapshot.sealDigest,
      baselineManifestDigest: authority.baselineManifest.digest,
      finalManifestDigest: finalManifest.digest,
      decisionDigest: decision.decisionDigest,
      exclusiveAttachmentReceiptDigest: postProviderAttachmentReceipt.receiptDigest,
      firstCaptureReceiptDigest: firstCaptured.receipt.receiptDigest,
      quiescenceSealDigest: quiescenceSeal.sealDigest,
      finalCaptureReceiptDigest: secondCaptured.receipt.receiptDigest,
    });
    const landingAuthority: LandingAuthority = Object.freeze({
      ...authority,
      providerStopped: stopped,
      postProviderAttachmentReceipt,
      quiescenceSeal,
      firstFinalCaptureReceipt: firstCaptured.receipt,
      finalCaptureReceipt: secondCaptured.receipt,
      finalManifest,
      decision,
      landingAuthorityDigest,
    });
    const lifecycleAuthority = createExecutionEffectDockerLifecycleAuthorityV1({
      ...lifecycleCommonInputFromPrepared(landingAuthority),
      state: 'READY_FOR_LANDING',
      predecessorAuthorityDigest: providerLifecycleAuthority.authorityDigest,
      preProviderAttachmentReceipt: authority.preProviderAttachmentReceipt,
      baselineRevalidationReceipt: authority.baselineRevalidationReceipt,
      providerStartAuthorityDigest: authority.providerStartAuthorityDigest,
      authorizedAt: authority.authorizedAt,
      providerStopped: stopped,
      postProviderAttachmentReceipt,
      firstFinalCaptureReceipt: firstCaptured.receipt,
      finalCaptureReceipt: secondCaptured.receipt,
      quiescenceSeal,
      finalManifest,
      decision,
      landingAuthorityDigest,
    }) as ExecutionEffectDockerReadyLifecycleAuthorityV1;
    const opaque = session() as CapturedExecutionEffectDockerLandingV1;
    landingAuthorities.set(opaque, landingAuthority);
    return Object.freeze({
      state: 'READY_FOR_LANDING' as const,
      landingAuthorityDigest,
      baselineManifest: authority.baselineManifest,
      finalManifest,
      decision,
      exclusiveAttachmentReceipt: postProviderAttachmentReceipt,
      quiescenceSeal,
      finalCaptureReceipt: secondCaptured.receipt,
      workspacePlan: authority.workspacePlan,
      dependencyAuthority: authority.dependencyAuthority,
      workspaceSnapshot: authority.workspaceSnapshot,
      lifecycleAuthority,
      session: opaque,
    });
  } catch (error) {
    return hold('ADAPTER_UNAVAILABLE', {
      stage: 'final-quiescence-call', authorityDigest: attachmentAuthorityDigest,
    });
  }
}

export type RehydrateExecutionEffectDockerLifecycleV1Result =
  | Readonly<{
    readonly state: 'REHYDRATED';
    readonly phase: 'ALLOCATING';
    readonly disposition: 'RESUME_SAFE';
    readonly lifecycleAuthority: ExecutionEffectDockerAllocatingLifecycleAuthorityV1;
    readonly workspaceObservation: ExecutionEffectDockerVolumeObservationV1;
    readonly dependencyObservation: ExecutionEffectDockerVolumeObservationV1;
    readonly session: DurablyAllocatedExecutionEffectDockerWorkspaceV1;
  }>
  | Readonly<{
    readonly state: 'REHYDRATED';
    readonly phase: 'ALLOCATING';
    readonly disposition: 'COMPENSATE_REQUIRED';
    readonly lifecycleAuthority: ExecutionEffectDockerAllocatingLifecycleAuthorityV1;
    readonly workspaceObservation: ExecutionEffectDockerVolumeObservationV1;
    readonly dependencyObservation: ExecutionEffectDockerVolumeObservationV1;
  }>
  | Readonly<{
    readonly state: 'REHYDRATED';
    readonly phase: 'PREPARED';
    readonly lifecycleAuthority: ExecutionEffectDockerPreparedLifecycleAuthorityV1;
    readonly session: PreparedExecutionEffectDockerWorkspaceV1;
  }>
  | Readonly<{
    readonly state: 'REHYDRATED';
    readonly phase: 'PROVIDER_START_AUTHORIZED';
    readonly lifecycleAuthority: ExecutionEffectDockerProviderLifecycleAuthorityV1;
    readonly session: AuthorizedExecutionEffectDockerProviderV1;
  }>
  | Readonly<{
    readonly state: 'REHYDRATED';
    readonly phase: 'READY_FOR_LANDING';
    readonly lifecycleAuthority: ExecutionEffectDockerReadyLifecycleAuthorityV1;
    readonly session: CapturedExecutionEffectDockerLandingV1;
  }>
  | ExecutionEffectDockerLifecycleHoldV1;

/**
 * Rebuild an opaque process-local session only after durable authority and fresh daemon
 * observations agree. The adapter and clock remain runtime capabilities and are never serialized.
 */
export async function rehydrateExecutionEffectDockerLifecycleV1(input: Readonly<{
  readonly authority: ExecutionEffectDockerLifecycleAuthorityV1;
  readonly adapter: ExecutionEffectDockerLifecycleAdapterV1;
  readonly clock: ExecutionEffectDockerLifecycleClockV1;
  readonly durabilityPort?: ExecutionEffectDockerAllocationDurabilityPortV1;
}>): Promise<RehydrateExecutionEffectDockerLifecycleV1Result> {
  const record = exactRecord(input, ['authority', 'adapter', 'clock', 'durabilityPort'])
    ?? exactRecord(input, ['authority', 'adapter', 'clock']);
  const authority = parseExecutionEffectDockerLifecycleAuthorityV1(record?.authority);
  if (!authority) return hold('INVALID_INPUT', { stage: 'rehydrate-input' });
  if (authority.state === 'ALLOCATING') {
    let inspectAllocation: ((...args: never[]) => unknown) | null = null;
    let nowIso: ((...args: never[]) => unknown) | null = null;
    try {
      inspectAllocation = record && typeof record.adapter === 'object' && record.adapter !== null
        ? methodDescriptor(record.adapter as object, 'inspectAllocationResources') : null;
      nowIso = record && typeof record.clock === 'object' && record.clock !== null
        ? methodDescriptor(record.clock as object, 'nowIso') : null;
    } catch {
      inspectAllocation = null;
      nowIso = null;
    }
    if (!inspectAllocation || !nowIso) {
      return hold('ADAPTER_UNAVAILABLE', {
        stage: 'rehydrate-allocation', authorityDigest: authority.authorityDigest,
      });
    }
    const observationAuthorityDigest = digest(
      'execution-effect-docker-allocation-rehydration-observation-authority-v1',
      { lifecycleAuthorityDigest: authority.authorityDigest },
    );
    try {
      const raw = await Reflect.apply(inspectAllocation, record!.adapter, [Object.freeze({
        authorityDigest: observationAuthorityDigest,
        workspacePlan: authority.workspacePlan,
      })]);
      const observations = exactRecord(raw, ['workspace', 'dependency']);
      const workspace = parseExecutionEffectDockerVolumeObservationV1(observations?.workspace);
      const dependency = parseExecutionEffectDockerVolumeObservationV1(observations?.dependency);
      const validObservation = (
        observation: ExecutionEffectDockerVolumeObservationV1 | null,
        expected: Readonly<{
          volumeName: string;
          resourceInstanceDigest: Digest;
          labelsDigest: Digest;
          mountPlanDigest: Digest;
        }>,
      ): observation is ExecutionEffectDockerVolumeObservationV1 => Boolean(observation
        && observation.authorityDigest === observationAuthorityDigest
        && observation.volumeName === expected.volumeName
        && observation.resourceInstanceDigest === expected.resourceInstanceDigest
        && timestampAtOrAfter(observation.observedAt, authority.admittedAt)
        && (observation.state === 'ABSENT'
          || (observation.labelsDigest === expected.labelsDigest
            && observation.mountPlanDigest === expected.mountPlanDigest)));
      if (!validObservation(workspace, {
        volumeName: authority.workspacePlan.volumeName,
        resourceInstanceDigest: authority.workspacePlan.workspaceResourceInstanceDigest,
        labelsDigest: authority.workspacePlan.workspaceLabelsDigest,
        mountPlanDigest: authority.workspacePlan.mountPlanDigest,
      }) || !validObservation(dependency, {
        volumeName: authority.workspacePlan.dependencyPlan.volumeName,
        resourceInstanceDigest: authority.workspacePlan.dependencyResourceInstanceDigest,
        labelsDigest: authority.workspacePlan.dependencyLabelsDigest,
        mountPlanDigest: authority.workspacePlan.dependencyPlanDigest,
      })) {
        return hold('AUTHORITY_MISMATCH', {
          stage: 'rehydrate-allocation-resource', authorityDigest: authority.authorityDigest,
        });
      }
      const latest = [workspace.observedAt, dependency.observedAt].sort(compare).at(-1)!;
      const clockValue = Reflect.apply(nowIso, record!.clock, []);
      if (!isTimestamp(clockValue) || !timestampAtOrAfter(clockValue, latest)) {
        return hold('CLOCK_INVALID', { stage: 'rehydrate-allocation-resource' });
      }
      if (workspace.state !== 'ABSENT' || dependency.state !== 'ABSENT') {
        return Object.freeze({
          state: 'REHYDRATED' as const,
          phase: 'ALLOCATING' as const,
          disposition: 'COMPENSATE_REQUIRED' as const,
          lifecycleAuthority: authority,
          workspaceObservation: workspace,
          dependencyObservation: dependency,
        });
      }
      const base = Object.freeze({
        platform: authority.platform,
        attempt: authority.attempt,
        admissionReceiptDigest: authority.admissionReceiptDigest,
        custodyPolicyDigest: authority.custodyPolicyDigest,
        admittedAt: authority.admittedAt,
        writePolicy: authority.writePolicy,
        nativeCapabilityDigest: authority.nativeCapabilityDigest,
        workspacePlan: authority.workspacePlan,
        captureLimits: authority.captureLimits,
        preparationAuthorityDigest: authority.preparationAuthorityDigest,
      });
      const allocating = Object.freeze({ base, lifecycleAuthority: authority });
      const durableReceipt = readDurableAllocationReceipt(
        allocating,
        record?.durabilityPort as ExecutionEffectDockerAllocationDurabilityPortV1,
      );
      if (!durableReceipt) {
        return hold('AUTHORITY_MISMATCH', {
          stage: 'rehydrate-allocation-durable-reread', authorityDigest: authority.authorityDigest,
        });
      }
      const opaque = session() as DurablyAllocatedExecutionEffectDockerWorkspaceV1;
      durableAllocatingAuthorities.set(opaque, Object.freeze({ ...allocating, durableReceipt }));
      return Object.freeze({
        state: 'REHYDRATED' as const,
        phase: 'ALLOCATING' as const,
        disposition: 'RESUME_SAFE' as const,
        lifecycleAuthority: authority,
        workspaceObservation: workspace,
        dependencyObservation: dependency,
        session: opaque,
      });
    } catch {
      return hold('ADAPTER_UNAVAILABLE', {
        stage: 'rehydrate-allocation-call', authorityDigest: authority.authorityDigest,
      });
    }
  }
  const adapters = record
    ? snapshotAdapters(
      record.adapter as ExecutionEffectDockerLifecycleAdapterV1,
      record.clock as ExecutionEffectDockerLifecycleClockV1,
    ) : null;
  let inspectDependency: ((...args: never[]) => unknown) | null = null;
  try {
    inspectDependency = record && typeof record.adapter === 'object' && record.adapter !== null
      ? methodDescriptor(record.adapter as object, 'inspectDependencyVolume') : null;
  } catch {
    inspectDependency = null;
  }
  if (!adapters || !inspectDependency) {
    return hold('ADAPTER_UNAVAILABLE', {
      stage: 'rehydrate-input', authorityDigest: authority?.authorityDigest ?? null,
    });
  }
  const observedAfter = authority.state === 'PREPARED'
    ? authority.workspaceSnapshot.sealedAt
    : authority.state === 'PROVIDER_START_AUTHORIZED'
      ? authority.authorizedAt : authority.quiescenceSeal.sealedAt;
  const observationAuthorityDigest = digest(
    'execution-effect-docker-rehydration-observation-authority-v1',
    { lifecycleAuthorityDigest: authority.authorityDigest, observedAfter },
  );
  try {
    const [imageRaw, workspaceRaw, dependencyRaw] = await Promise.all([
      Reflect.apply(adapters.inspectImage, adapters.adapterThis, [Object.freeze({
        authorityDigest: observationAuthorityDigest,
        imageReference: authority.workspacePlan.imageReference,
        expectedImageDigest: authority.workspacePlan.imageDigest,
        dependencyPlanDigest: authority.workspacePlan.dependencyPlanDigest,
      })]),
      Reflect.apply(adapters.inspectVolume, adapters.adapterThis, [Object.freeze({
        phase: 'VERIFY_CREATED' as const,
        authorityDigest: observationAuthorityDigest,
        plan: authority.workspacePlan,
        creationReceiptDigest: authority.creationReceipt.receiptDigest,
      })]),
      Reflect.apply(inspectDependency, adapters.adapterThis, [Object.freeze({
        authorityDigest: observationAuthorityDigest,
        workspacePlan: authority.workspacePlan,
        dependencyAuthority: authority.dependencyAuthority,
      })]),
    ]);
    const image = parseImageObservation(imageRaw);
    const workspace = parseExecutionEffectDockerVolumeObservationV1(workspaceRaw);
    const dependency = parseExecutionEffectDockerVolumeObservationV1(dependencyRaw);
    if (!image || image.authorityDigest !== observationAuthorityDigest
      || image.imageReference !== authority.imageObservation.imageReference
      || image.imageDigest !== authority.imageObservation.imageDigest
      || image.imageIdentityDigest !== authority.imageObservation.imageIdentityDigest
      || !workspace || workspace.state !== 'PRESENT'
      || workspace.authorityDigest !== observationAuthorityDigest
      || workspace.volumeName !== authority.workspacePlan.volumeName
      || workspace.labelsDigest !== authority.workspacePlan.workspaceLabelsDigest
      || workspace.resourceInstanceDigest
        !== authority.workspacePlan.workspaceResourceInstanceDigest
      || workspace.mountPlanDigest !== authority.workspacePlan.mountPlanDigest
      || workspace.volumeIdentityDigest !== authority.presentObservation.volumeIdentityDigest
      || workspace.daemonCreatedAt !== authority.presentObservation.daemonCreatedAt
      || !dependency || dependency.state !== 'PRESENT'
      || dependency.authorityDigest !== observationAuthorityDigest
      || dependency.volumeName !== authority.dependencyAuthority.volumeName
      || dependency.labelsDigest !== authority.dependencyAuthority.labelsDigest
      || dependency.resourceInstanceDigest
        !== authority.dependencyAuthority.resourceInstanceDigest
      || dependency.mountPlanDigest !== authority.workspacePlan.dependencyPlanDigest
      || dependency.volumeIdentityDigest !== authority.dependencyAuthority.volumeIdentityDigest
      || !timestampAtOrAfter(image.observedAt, observedAfter)
      || !timestampAtOrAfter(workspace.observedAt, observedAfter)
      || !timestampAtOrAfter(dependency.observedAt, observedAfter)) {
      return hold('AUTHORITY_MISMATCH', {
        stage: 'rehydrate-live-resource', authorityDigest: authority.authorityDigest,
      });
    }
    const latestObservation = [image.observedAt, workspace.observedAt, dependency.observedAt]
      .sort(compare).at(-1) ?? observedAfter;
    if (!readClock(adapters, latestObservation)) {
      return hold('CLOCK_INVALID', { stage: 'rehydrate-live-resource' });
    }
    const prepared: PreparedAuthority = Object.freeze({
      platform: authority.platform,
      attempt: authority.attempt,
      admissionReceiptDigest: authority.admissionReceiptDigest,
      custodyPolicyDigest: authority.custodyPolicyDigest,
      admittedAt: authority.admittedAt,
      writePolicy: authority.writePolicy,
      nativeCapabilityDigest: authority.nativeCapabilityDigest,
      workspacePlan: authority.workspacePlan,
      captureLimits: authority.captureLimits,
      preparationAuthorityDigest: authority.preparationAuthorityDigest,
      imageObservation: authority.imageObservation,
      dependencyAuthority: authority.dependencyAuthority,
      absenceObservation: authority.absenceObservation,
      creationReceipt: authority.creationReceipt,
      presentObservation: authority.presentObservation,
      populationReceipt: authority.populationReceipt,
      baselineManifest: authority.baselineManifest,
      workspaceResource: authority.workspaceResource,
      workspaceSnapshot: authority.workspaceSnapshot,
      adapters,
    });
    if (authority.state === 'PREPARED') {
      const captureRaw = await Reflect.apply(adapters.captureWorkspace, adapters.adapterThis, [
        Object.freeze({
          platform: authority.platform,
          operation: 'BASELINE_REVALIDATION' as const,
          authorityDigest: observationAuthorityDigest,
          plan: authority.workspacePlan,
          attempt: authority.attempt,
          admissionReceiptDigest: authority.admissionReceiptDigest,
          custodyPolicyDigest: authority.custodyPolicyDigest,
          writePolicy: authority.writePolicy,
          workspaceSnapshot: authority.workspaceSnapshot,
          expectedWorkspaceStateDigest: executionEffectDockerManifestStateDigestV1(
            authority.baselineManifest,
          ),
          captureLimits: authority.captureLimits,
        }),
      ]);
      const captured = parseRawCapture(captureRaw, {
        operation: 'BASELINE_REVALIDATION',
        authorityDigest: observationAuthorityDigest,
        phase: 'baseline',
        volumeName: authority.workspacePlan.volumeName,
        volumeIdentityDigest: authority.presentObservation.volumeIdentityDigest,
      });
      const manifest = captured ? manifestFromRaw(prepared, 'baseline', captured) : null;
      if (!manifest || captured?.receipt.manifestStateDigest
        !== executionEffectDockerManifestStateDigestV1(manifest)
        || executionEffectDockerManifestStateDigestV1(manifest)
          !== executionEffectDockerManifestStateDigestV1(authority.baselineManifest)) {
        return hold('AUTHORITY_MISMATCH', {
          stage: 'rehydrate-baseline', authorityDigest: authority.authorityDigest,
        });
      }
      const opaque = session() as PreparedExecutionEffectDockerWorkspaceV1;
      preparedAuthorities.set(opaque, prepared);
      return Object.freeze({
        state: 'REHYDRATED' as const,
        phase: 'PREPARED' as const,
        lifecycleAuthority: authority,
        session: opaque,
      });
    }
    const provider: ProviderAuthority = Object.freeze({
      ...prepared,
      preProviderAttachmentReceipt: authority.preProviderAttachmentReceipt,
      baselineRevalidationReceipt: authority.baselineRevalidationReceipt,
      providerStartAuthorityDigest: authority.providerStartAuthorityDigest,
      authorizedAt: authority.authorizedAt,
    });
    if (authority.state === 'PROVIDER_START_AUTHORIZED') {
      const opaque = session() as AuthorizedExecutionEffectDockerProviderV1;
      providerAuthorities.set(opaque, provider);
      return Object.freeze({
        state: 'REHYDRATED' as const,
        phase: 'PROVIDER_START_AUTHORIZED' as const,
        lifecycleAuthority: authority,
        session: opaque,
      });
    }
    const captureRaw = await Reflect.apply(adapters.captureWorkspace, adapters.adapterThis, [
      Object.freeze({
        platform: authority.platform,
        operation: 'FINAL_QUIESCENCE_SECOND' as const,
        authorityDigest: observationAuthorityDigest,
        plan: authority.workspacePlan,
        attempt: authority.attempt,
        admissionReceiptDigest: authority.admissionReceiptDigest,
        custodyPolicyDigest: authority.custodyPolicyDigest,
        writePolicy: authority.writePolicy,
        workspaceSnapshot: authority.workspaceSnapshot,
        expectedWorkspaceStateDigest: executionEffectDockerManifestStateDigestV1(
          authority.finalManifest,
        ),
        captureLimits: authority.captureLimits,
      }),
    ]);
    const captured = parseRawCapture(captureRaw, {
      operation: 'FINAL_QUIESCENCE_SECOND',
      authorityDigest: observationAuthorityDigest,
      phase: 'final',
      volumeName: authority.workspacePlan.volumeName,
      volumeIdentityDigest: authority.presentObservation.volumeIdentityDigest,
    });
    const manifest = captured ? manifestFromRaw(provider, 'final', captured) : null;
    if (!manifest || captured?.receipt.manifestStateDigest
      !== executionEffectDockerManifestStateDigestV1(manifest)
      || executionEffectDockerManifestStateDigestV1(manifest)
        !== executionEffectDockerManifestStateDigestV1(authority.finalManifest)) {
      return hold('AUTHORITY_MISMATCH', {
        stage: 'rehydrate-final', authorityDigest: authority.authorityDigest,
      });
    }
    const landing: LandingAuthority = Object.freeze({
      ...provider,
      providerStopped: authority.providerStopped,
      postProviderAttachmentReceipt: authority.postProviderAttachmentReceipt,
      firstFinalCaptureReceipt: authority.firstFinalCaptureReceipt,
      finalCaptureReceipt: authority.finalCaptureReceipt,
      quiescenceSeal: authority.quiescenceSeal,
      finalManifest: authority.finalManifest,
      decision: authority.decision,
      landingAuthorityDigest: authority.landingAuthorityDigest,
    });
    const opaque = session() as CapturedExecutionEffectDockerLandingV1;
    landingAuthorities.set(opaque, landing);
    return Object.freeze({
      state: 'REHYDRATED' as const,
      phase: 'READY_FOR_LANDING' as const,
      lifecycleAuthority: authority,
      session: opaque,
    });
  } catch {
    return hold('ADAPTER_UNAVAILABLE', {
      stage: 'rehydrate-live-call', authorityDigest: authority.authorityDigest,
    });
  }
}

export type ExecutionEffectDockerReleasedResourceKindV1 =
  | 'provider-container'
  | 'workspace-volume'
  | 'dependency-volume';

function validReleasedResourceName(
  kind: ExecutionEffectDockerReleasedResourceKindV1,
  name: string,
): boolean {
  if (kind === 'provider-container') return CONTAINER_NAME.test(name);
  if (kind === 'workspace-volume') return WORKSPACE_VOLUME_NAME.test(name);
  return DEPENDENCY_VOLUME_NAME.test(name);
}

export interface ExecutionEffectDockerResourceDeletionReceiptV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-resource-deletion-receipt';
  readonly state: 'DELETED';
  readonly resourceKind: ExecutionEffectDockerReleasedResourceKindV1;
  readonly resourceName: string;
  readonly resourceIdentityDigest: Digest;
  /** Release binds the committed landing receipt; compensation binds its lifecycle authority. */
  readonly cleanupAuthorityDigest: Digest;
  readonly deleteIntentDigest: Digest;
  readonly deletedAt: string;
  readonly receiptDigest: Digest;
}

export function createExecutionEffectDockerResourceDeletionReceiptV1(input: Omit<
  ExecutionEffectDockerResourceDeletionReceiptV1,
  'version' | 'kind' | 'state' | 'receiptDigest'
>): ExecutionEffectDockerResourceDeletionReceiptV1 {
  const record = exactRecord(input, [
    'resourceKind', 'resourceName', 'resourceIdentityDigest', 'cleanupAuthorityDigest',
    'deleteIntentDigest', 'deletedAt',
  ]);
  const kind = record?.resourceKind;
  const name = record?.resourceName;
  if (record === null || (kind !== 'provider-container' && kind !== 'workspace-volume'
      && kind !== 'dependency-volume')
    || typeof name !== 'string' || !validReleasedResourceName(kind, name)
    || !isDigest(record.resourceIdentityDigest) || !isDigest(record.cleanupAuthorityDigest)
    || !isDigest(record.deleteIntentDigest)
    || !isTimestamp(record.deletedAt)) throw new TypeError('Invalid Docker deletion receipt');
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-resource-deletion-receipt' as const,
    state: 'DELETED' as const,
    resourceKind: kind,
    resourceName: name,
    resourceIdentityDigest: record.resourceIdentityDigest,
    cleanupAuthorityDigest: record.cleanupAuthorityDigest,
    deleteIntentDigest: record.deleteIntentDigest,
    deletedAt: record.deletedAt,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest('execution-effect-docker-resource-deletion-receipt-v1', body),
  }) as ExecutionEffectDockerResourceDeletionReceiptV1;
}

export function parseExecutionEffectDockerResourceDeletionReceiptV1(
  value: unknown,
): ExecutionEffectDockerResourceDeletionReceiptV1 | null {
  const record = exactRecord(value, [
    'version', 'kind', 'state', 'resourceKind', 'resourceName', 'resourceIdentityDigest',
    'cleanupAuthorityDigest', 'deleteIntentDigest', 'deletedAt', 'receiptDigest',
  ]);
  if (record === null || record.version !== 1
    || record.kind !== 'execution-effect-docker-resource-deletion-receipt'
    || record.state !== 'DELETED' || !isDigest(record.receiptDigest)) return null;
  try {
    const recreated = createExecutionEffectDockerResourceDeletionReceiptV1({
      resourceKind: record.resourceKind as ExecutionEffectDockerReleasedResourceKindV1,
      resourceName: record.resourceName as string,
      resourceIdentityDigest: record.resourceIdentityDigest as Digest,
      cleanupAuthorityDigest: record.cleanupAuthorityDigest as Digest,
      deleteIntentDigest: record.deleteIntentDigest as Digest,
      deletedAt: record.deletedAt as string,
    });
    return sameCanonical(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export interface ExecutionEffectDockerResourceAbsenceReceiptV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-resource-absence-receipt';
  readonly state: 'ABSENT_AFTER_DELETE';
  readonly resourceKind: ExecutionEffectDockerReleasedResourceKindV1;
  readonly resourceName: string;
  readonly resourceIdentityDigest: Digest;
  readonly deleteIntentDigest: Digest;
  readonly deletionReceiptDigest: Digest;
  readonly observedAt: string;
  readonly receiptDigest: Digest;
}

export function createExecutionEffectDockerResourceAbsenceReceiptV1(input: Omit<
  ExecutionEffectDockerResourceAbsenceReceiptV1,
  'version' | 'kind' | 'state' | 'receiptDigest'
>): ExecutionEffectDockerResourceAbsenceReceiptV1 {
  const record = exactRecord(input, [
    'resourceKind', 'resourceName', 'resourceIdentityDigest', 'deleteIntentDigest',
    'deletionReceiptDigest', 'observedAt',
  ]);
  const kind = record?.resourceKind;
  const name = record?.resourceName;
  if (record === null || (kind !== 'provider-container' && kind !== 'workspace-volume'
      && kind !== 'dependency-volume')
    || typeof name !== 'string' || !validReleasedResourceName(kind, name)
    || !isDigest(record.resourceIdentityDigest) || !isDigest(record.deleteIntentDigest)
    || !isDigest(record.deletionReceiptDigest)
    || !isTimestamp(record.observedAt)) throw new TypeError('Invalid Docker absence receipt');
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-resource-absence-receipt' as const,
    state: 'ABSENT_AFTER_DELETE' as const,
    resourceKind: kind,
    resourceName: name,
    resourceIdentityDigest: record.resourceIdentityDigest,
    deleteIntentDigest: record.deleteIntentDigest,
    deletionReceiptDigest: record.deletionReceiptDigest,
    observedAt: record.observedAt,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest('execution-effect-docker-resource-absence-receipt-v1', body),
  }) as ExecutionEffectDockerResourceAbsenceReceiptV1;
}

export function parseExecutionEffectDockerResourceAbsenceReceiptV1(
  value: unknown,
): ExecutionEffectDockerResourceAbsenceReceiptV1 | null {
  const record = exactRecord(value, [
    'version', 'kind', 'state', 'resourceKind', 'resourceName', 'resourceIdentityDigest',
    'deleteIntentDigest', 'deletionReceiptDigest', 'observedAt', 'receiptDigest',
  ]);
  if (record === null || record.version !== 1
    || record.kind !== 'execution-effect-docker-resource-absence-receipt'
    || record.state !== 'ABSENT_AFTER_DELETE' || !isDigest(record.receiptDigest)) return null;
  try {
    const recreated = createExecutionEffectDockerResourceAbsenceReceiptV1({
      resourceKind: record.resourceKind as ExecutionEffectDockerReleasedResourceKindV1,
      resourceName: record.resourceName as string,
      resourceIdentityDigest: record.resourceIdentityDigest as Digest,
      deleteIntentDigest: record.deleteIntentDigest as Digest,
      deletionReceiptDigest: record.deletionReceiptDigest as Digest,
      observedAt: record.observedAt as string,
    });
    return sameCanonical(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export interface ExecutionEffectDockerReconciledAbsenceReceiptV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-reconciled-absence-receipt';
  readonly state: 'RECONCILED_ABSENCE';
  readonly resourceKind: ExecutionEffectDockerReleasedResourceKindV1;
  readonly resourceName: string;
  readonly resourceIdentityDigest: Digest | null;
  readonly cleanupAuthorityDigest: Digest;
  readonly deleteIntentDigest: Digest;
  readonly observedAt: string;
  readonly receiptDigest: Digest;
}

export function createExecutionEffectDockerReconciledAbsenceReceiptV1(input: Omit<
  ExecutionEffectDockerReconciledAbsenceReceiptV1,
  'version' | 'kind' | 'state' | 'receiptDigest'
>): ExecutionEffectDockerReconciledAbsenceReceiptV1 {
  const record = exactRecord(input, [
    'resourceKind', 'resourceName', 'resourceIdentityDigest', 'cleanupAuthorityDigest',
    'deleteIntentDigest', 'observedAt',
  ]);
  const kind = record?.resourceKind;
  const name = record?.resourceName;
  if (!record || (kind !== 'provider-container' && kind !== 'workspace-volume'
      && kind !== 'dependency-volume') || typeof name !== 'string'
    || !validReleasedResourceName(kind, name)
    || (record.resourceIdentityDigest !== null && !isDigest(record.resourceIdentityDigest))
    || !isDigest(record.cleanupAuthorityDigest) || !isDigest(record.deleteIntentDigest)
    || !isTimestamp(record.observedAt)) {
    throw new TypeError('Invalid Docker reconciled absence receipt');
  }
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-reconciled-absence-receipt' as const,
    state: 'RECONCILED_ABSENCE' as const,
    resourceKind: kind,
    resourceName: name,
    resourceIdentityDigest: record.resourceIdentityDigest,
    cleanupAuthorityDigest: record.cleanupAuthorityDigest,
    deleteIntentDigest: record.deleteIntentDigest,
    observedAt: record.observedAt,
  });
  return Object.freeze({
    ...body,
    receiptDigest: digest('execution-effect-docker-reconciled-absence-receipt-v1', body),
  });
}

export function parseExecutionEffectDockerReconciledAbsenceReceiptV1(
  value: unknown,
): ExecutionEffectDockerReconciledAbsenceReceiptV1 | null {
  const record = exactRecord(value, [
    'version', 'kind', 'state', 'resourceKind', 'resourceName', 'resourceIdentityDigest',
    'cleanupAuthorityDigest', 'deleteIntentDigest', 'observedAt', 'receiptDigest',
  ]);
  if (!record || record.version !== 1
    || record.kind !== 'execution-effect-docker-reconciled-absence-receipt'
    || record.state !== 'RECONCILED_ABSENCE' || !isDigest(record.receiptDigest)) return null;
  try {
    const recreated = createExecutionEffectDockerReconciledAbsenceReceiptV1({
      resourceKind: record.resourceKind as ExecutionEffectDockerReleasedResourceKindV1,
      resourceName: record.resourceName as string,
      resourceIdentityDigest: record.resourceIdentityDigest as Digest | null,
      cleanupAuthorityDigest: record.cleanupAuthorityDigest as Digest,
      deleteIntentDigest: record.deleteIntentDigest as Digest,
      observedAt: record.observedAt as string,
    });
    return sameCanonical(recreated, value) ? recreated : null;
  } catch {
    return null;
  }
}

export interface ReleaseExecutionEffectDockerWorkspaceV1Input {
  readonly landingReceipt: ExecutionEffectLandingReceiptV1;
  readonly committedAt: string;
  readonly providerContainerOutcome: ExecutionEffectDockerResourceReleaseOutcomeV1;
  readonly workspaceVolumeOutcome: ExecutionEffectDockerResourceReleaseOutcomeV1;
  readonly dependencyVolumeOutcome: ExecutionEffectDockerResourceReleaseOutcomeV1;
  readonly releasedAt: string;
}

export type ExecutionEffectDockerResourceReleaseOutcomeV1 =
  | Readonly<{
    readonly disposition: 'EXECUTED_DELETION';
    readonly deletion: ExecutionEffectDockerResourceDeletionReceiptV1;
    readonly absence: ExecutionEffectDockerResourceAbsenceReceiptV1;
  }>
  | Readonly<{
    readonly disposition: 'RECONCILED_ABSENCE';
    readonly absence: ExecutionEffectDockerReconciledAbsenceReceiptV1;
  }>;

export interface ExecutionEffectDockerDependencyVolumeReleaseV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-dependency-volume-release-projection';
  readonly state: 'PROJECTED_FROM_WORKSPACE_RELEASE';
  readonly workspaceReleaseReceiptDigest: Digest;
  readonly volumeName: string;
  readonly volumeNameDigest: Digest;
  readonly volumeIdentityDigest: Digest;
  readonly dependencyPlanDigest: Digest;
  readonly dependencyAuthorityReceiptDigest: Digest;
  readonly creationReceiptDigest: Digest;
  readonly verifiedInspectDigest: Digest;
  readonly populationReceiptDigest: Digest;
  readonly dependencyTreeDigest: Digest;
  readonly releaseDisposition: 'EXECUTED_DELETION' | 'RECONCILED_ABSENCE';
  readonly deletionReceiptDigest: Digest | null;
  readonly absenceEvidenceDigest: Digest;
  readonly releasedAt: string;
  readonly projectionDigest: Digest;
}

export function createExecutionEffectDockerDependencyVolumeReleaseV1(input: Readonly<{
  readonly dependencyAuthority: ExecutionEffectDockerDependencyAuthorityReceiptV1;
  readonly dependencyPlanDigest: Digest;
  readonly dependencyResource: ExecutionEffectDependencyResourceV1;
  readonly workspaceRelease: ExecutionEffectWorkspaceReleaseV1;
}>): ExecutionEffectDockerDependencyVolumeReleaseV1 {
  const record = exactRecord(input, [
    'dependencyAuthority', 'dependencyPlanDigest', 'dependencyResource', 'workspaceRelease',
  ]);
  const authority = parseDependencyAuthorityReceipt(record?.dependencyAuthority);
  if (record === null || authority === null || authority.dependencyPlanDigest !== record.dependencyPlanDigest
    || !isDigest(record.dependencyPlanDigest)) {
    throw new TypeError('Invalid Docker dependency volume release');
  }
  const workspaceRelease = parseExecutionEffectWorkspaceReleaseV1(record.workspaceRelease);
  const dependencyResource = parseExecutionEffectDependencyResourceV1(record.dependencyResource);
  if (workspaceRelease === null || dependencyResource === null
    || dependencyResource.resourceDigest !== workspaceRelease.dependencyResourceDigest
    || dependencyResource.imageIdentityDigest !== authority.imageIdentityDigest
    || dependencyResource.labelsDigest !== authority.labelsDigest
    || dependencyResource.populationReceiptDigest !== authority.populationReceiptDigest
    || dependencyResource.mountPlanDigest !== record.dependencyPlanDigest
    || dependencyResource.volumeName !== authority.volumeName
    || dependencyResource.volumeIdentityDigest !== authority.volumeIdentityDigest
    || workspaceRelease.dependencyVolume.volumeName !== authority.volumeName
    || workspaceRelease.dependencyVolume.volumeIdentityDigest !== authority.volumeIdentityDigest) {
    throw new TypeError('Invalid Docker dependency volume release authority');
  }
  const body = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-docker-dependency-volume-release-projection' as const,
    state: 'PROJECTED_FROM_WORKSPACE_RELEASE' as const,
    workspaceReleaseReceiptDigest: workspaceRelease.receiptDigest,
    volumeName: authority.volumeName,
    volumeNameDigest: workspaceRelease.dependencyVolume.volumeNameDigest,
    volumeIdentityDigest: authority.volumeIdentityDigest,
    dependencyPlanDigest: record.dependencyPlanDigest,
    dependencyAuthorityReceiptDigest: authority.receiptDigest,
    creationReceiptDigest: authority.creationReceiptDigest,
    verifiedInspectDigest: authority.verifiedInspectDigest,
    populationReceiptDigest: authority.populationReceiptDigest,
    dependencyTreeDigest: authority.dependencyTreeDigest,
    releaseDisposition: workspaceRelease.dependencyVolume.disposition,
    deletionReceiptDigest: workspaceRelease.dependencyVolume.deletionReceiptDigest,
    absenceEvidenceDigest: workspaceRelease.dependencyVolume.absenceEvidenceDigest,
    releasedAt: workspaceRelease.releasedAt,
  });
  return Object.freeze({
    ...body,
    projectionDigest: digest('execution-effect-docker-dependency-volume-release-projection-v1', body),
  }) as ExecutionEffectDockerDependencyVolumeReleaseV1;
}

export type ReleaseExecutionEffectDockerWorkspaceV1Result =
  | Readonly<{
    readonly state: 'RELEASED';
    readonly workspaceRelease: ExecutionEffectWorkspaceReleaseV1;
    readonly dependencyVolumeRelease: ExecutionEffectDockerDependencyVolumeReleaseV1;
    readonly releaseAuthorityDigest: Digest;
  }>
  | ExecutionEffectDockerLifecycleHoldV1;

/**
 * Projects release evidence from the durable READY_FOR_LANDING authority. This is the
 * restart-safe form of release: it has no process-local session custody and performs no
 * effect. All inputs are immutable Store evidence and the output is byte-deterministic.
 */
export function projectExecutionEffectDockerWorkspaceReleaseV1(
  lifecycleAuthority: ExecutionEffectDockerReadyLifecycleAuthorityV1,
  input: ReleaseExecutionEffectDockerWorkspaceV1Input,
): ReleaseExecutionEffectDockerWorkspaceV1Result {
  const authority = parseExecutionEffectDockerLifecycleAuthorityV1(lifecycleAuthority);
  if (authority?.state !== 'READY_FOR_LANDING') {
    return hold('RELEASE_EVIDENCE_INVALID', { stage: 'durable-ready-authority' });
  }
  return projectExecutionEffectDockerWorkspaceReleaseFromAuthorityV1(authority, input);
}

function parseReleaseOutcome(
  value: unknown,
  expected: Readonly<{
    readonly kind: ExecutionEffectDockerReleasedResourceKindV1;
    readonly name: string;
    readonly identityDigest: Digest;
    readonly cleanupAuthorityDigest: Digest;
    readonly committedAt: string;
  }>,
): ExecutionEffectDockerResourceReleaseOutcomeV1 | null {
  const executed = exactRecord(value, ['disposition', 'deletion', 'absence']);
  if (executed?.disposition === 'EXECUTED_DELETION') {
    const deletion = parseExecutionEffectDockerResourceDeletionReceiptV1(executed.deletion);
    const absence = parseExecutionEffectDockerResourceAbsenceReceiptV1(executed.absence);
    return deletion && absence
      && deletion.resourceKind === expected.kind && absence.resourceKind === expected.kind
      && deletion.resourceName === expected.name && absence.resourceName === expected.name
      && deletion.resourceIdentityDigest === expected.identityDigest
      && absence.resourceIdentityDigest === expected.identityDigest
      && deletion.cleanupAuthorityDigest === expected.cleanupAuthorityDigest
      && absence.deleteIntentDigest === deletion.deleteIntentDigest
      && absence.deletionReceiptDigest === deletion.receiptDigest
      && timestampAtOrAfter(deletion.deletedAt, expected.committedAt)
      && timestampAtOrAfter(absence.observedAt, deletion.deletedAt)
      ? Object.freeze({ disposition: 'EXECUTED_DELETION' as const, deletion, absence }) : null;
  }
  const reconciled = exactRecord(value, ['disposition', 'absence']);
  if (reconciled?.disposition !== 'RECONCILED_ABSENCE') return null;
  const absence = parseExecutionEffectDockerReconciledAbsenceReceiptV1(reconciled.absence);
  return absence && absence.resourceKind === expected.kind
    && absence.resourceName === expected.name
    && absence.resourceIdentityDigest === expected.identityDigest
    && absence.cleanupAuthorityDigest === expected.cleanupAuthorityDigest
    && timestampAtOrAfter(absence.observedAt, expected.committedAt)
    ? Object.freeze({ disposition: 'RECONCILED_ABSENCE' as const, absence }) : null;
}

export function releaseExecutionEffectDockerWorkspaceV1(
  landing: CapturedExecutionEffectDockerLandingV1,
  input: ReleaseExecutionEffectDockerWorkspaceV1Input,
): ReleaseExecutionEffectDockerWorkspaceV1Result {
  if (landing === null || typeof landing !== 'object' || nodeTypes.isProxy(landing)) {
    return hold('SESSION_INVALID', { stage: 'release' });
  }
  const authority = landingAuthorities.get(landing);
  if (!authority) return hold('SESSION_INVALID', { stage: 'release' });
  const preparedLifecycleAuthority = createExecutionEffectDockerLifecycleAuthorityV1({
    ...lifecycleCommonInputFromPrepared(authority),
    state: 'PREPARED',
    predecessorAuthorityDigest: allocatingLifecycleAuthorityFromPrepared(authority).authorityDigest,
  }) as ExecutionEffectDockerPreparedLifecycleAuthorityV1;
  const providerLifecycleAuthority = createExecutionEffectDockerLifecycleAuthorityV1({
    ...lifecycleCommonInputFromPrepared(authority),
    state: 'PROVIDER_START_AUTHORIZED',
    predecessorAuthorityDigest: preparedLifecycleAuthority.authorityDigest,
    preProviderAttachmentReceipt: authority.preProviderAttachmentReceipt,
    baselineRevalidationReceipt: authority.baselineRevalidationReceipt,
    providerStartAuthorityDigest: authority.providerStartAuthorityDigest,
    authorizedAt: authority.authorizedAt,
  }) as ExecutionEffectDockerProviderLifecycleAuthorityV1;
  const readyLifecycleAuthority = createExecutionEffectDockerLifecycleAuthorityV1({
    ...lifecycleCommonInputFromPrepared(authority),
    state: 'READY_FOR_LANDING',
    predecessorAuthorityDigest: providerLifecycleAuthority.authorityDigest,
    preProviderAttachmentReceipt: authority.preProviderAttachmentReceipt,
    baselineRevalidationReceipt: authority.baselineRevalidationReceipt,
    providerStartAuthorityDigest: authority.providerStartAuthorityDigest,
    authorizedAt: authority.authorizedAt,
    providerStopped: authority.providerStopped,
    postProviderAttachmentReceipt: authority.postProviderAttachmentReceipt,
    firstFinalCaptureReceipt: authority.firstFinalCaptureReceipt,
    finalCaptureReceipt: authority.finalCaptureReceipt,
    quiescenceSeal: authority.quiescenceSeal,
    finalManifest: authority.finalManifest,
    decision: authority.decision,
    landingAuthorityDigest: authority.landingAuthorityDigest,
  }) as ExecutionEffectDockerReadyLifecycleAuthorityV1;
  const result = projectExecutionEffectDockerWorkspaceReleaseFromAuthorityV1(
    readyLifecycleAuthority, input,
  );
  if (result.state === 'RELEASED') landingAuthorities.delete(landing);
  return result;
}

function projectExecutionEffectDockerWorkspaceReleaseFromAuthorityV1(
  authority: ExecutionEffectDockerReadyLifecycleAuthorityV1,
  input: ReleaseExecutionEffectDockerWorkspaceV1Input,
): ReleaseExecutionEffectDockerWorkspaceV1Result {
  const record = exactRecord(input, [
    'landingReceipt', 'committedAt', 'providerContainerOutcome',
    'workspaceVolumeOutcome', 'dependencyVolumeOutcome', 'releasedAt',
  ]);
  if (record === null || !isTimestamp(record.committedAt) || !isTimestamp(record.releasedAt)) {
    return hold('RELEASE_EVIDENCE_INVALID', { stage: 'release-input' });
  }
  const receipt = parseExecutionEffectLandingReceiptV1(record.landingReceipt);
  if (!receipt || !sameAttempt(receipt.transaction, authority.attempt)
    || receipt.transaction.attemptDigest !== authority.workspaceSnapshot.attemptDigest
    || receipt.transaction.baselineManifestDigest !== authority.baselineManifest.digest
    || receipt.transaction.finalManifestDigest !== authority.finalManifest.digest
    || receipt.transaction.containmentDecisionDigest !== authority.decision.decisionDigest
    || (authority.decision.effects.length === 0) !== (receipt.state === 'COMMITTED_NO_CHANGE')
    || !timestampAtOrAfter(record.committedAt, authority.finalCaptureReceipt.completedAt)
    || !timestampAtOrAfter(record.committedAt, authority.quiescenceSeal.sealedAt)) {
    return hold('LANDING_NOT_COMMITTED', {
      stage: 'landing-receipt', landingAuthorityDigest: authority.landingAuthorityDigest,
    });
  }
  const committedAt = record.committedAt as string;
  const containerOutcome = parseReleaseOutcome(record.providerContainerOutcome, {
    kind: 'provider-container',
    name: authority.providerStopped.containerName,
    identityDigest: authority.providerStopped.containerIdentityDigest,
    cleanupAuthorityDigest: receipt.receiptDigest,
    committedAt,
  });
  const volumeOutcome = parseReleaseOutcome(record.workspaceVolumeOutcome, {
    kind: 'workspace-volume',
    name: authority.workspacePlan.volumeName,
    identityDigest: authority.presentObservation.volumeIdentityDigest,
    cleanupAuthorityDigest: receipt.receiptDigest,
    committedAt,
  });
  const dependencyOutcome = parseReleaseOutcome(record.dependencyVolumeOutcome, {
    kind: 'dependency-volume',
    name: authority.dependencyAuthority.volumeName,
    identityDigest: authority.dependencyAuthority.volumeIdentityDigest,
    cleanupAuthorityDigest: receipt.receiptDigest,
    committedAt,
  });
  if (!containerOutcome || !volumeOutcome || !dependencyOutcome
    || !timestampAtOrAfter(record.releasedAt as string, containerOutcome.absence.observedAt)
    || !timestampAtOrAfter(record.releasedAt as string, volumeOutcome.absence.observedAt)
    || !timestampAtOrAfter(record.releasedAt as string, dependencyOutcome.absence.observedAt)) {
    return hold('RELEASE_EVIDENCE_INVALID', {
      stage: 'deletion-absence', landingReceiptDigest: receipt.receiptDigest,
    });
  }
  try {
    const workspaceRelease = createExecutionEffectWorkspaceReleaseV1({
      attempt: authority.attempt,
      admissionReceiptDigest: authority.admissionReceiptDigest,
      custodyPolicyDigest: authority.custodyPolicyDigest,
      workspaceSnapshotSealDigest: authority.workspaceSnapshot.sealDigest,
      workspaceResource: authority.workspaceResource,
      dependencyResource: authority.workspaceSnapshot.dependencyResource,
      transactionDigest: receipt.transaction.transactionDigest,
      committedJournalDigest: receipt.committedJournalDigest,
      providerContainer: Object.freeze({
        containerName: authority.providerStopped.containerName,
        disposition: containerOutcome.disposition,
        deletionReceiptDigest: containerOutcome.disposition === 'EXECUTED_DELETION'
          ? containerOutcome.deletion.receiptDigest : null,
        absenceEvidenceDigest: containerOutcome.absence.receiptDigest,
      }),
      workspaceVolume: Object.freeze({
        volumeName: authority.workspacePlan.volumeName,
        disposition: volumeOutcome.disposition,
        deletionReceiptDigest: volumeOutcome.disposition === 'EXECUTED_DELETION'
          ? volumeOutcome.deletion.receiptDigest : null,
        absenceEvidenceDigest: volumeOutcome.absence.receiptDigest,
      }),
      dependencyVolume: Object.freeze({
        volumeName: authority.dependencyAuthority.volumeName,
        volumeIdentityDigest: authority.dependencyAuthority.volumeIdentityDigest,
        disposition: dependencyOutcome.disposition,
        deletionReceiptDigest: dependencyOutcome.disposition === 'EXECUTED_DELETION'
          ? dependencyOutcome.deletion.receiptDigest : null,
        absenceEvidenceDigest: dependencyOutcome.absence.receiptDigest,
      }),
      releasedAt: record.releasedAt as string,
    });
    const dependencyVolumeRelease = createExecutionEffectDockerDependencyVolumeReleaseV1({
      dependencyAuthority: authority.dependencyAuthority,
      dependencyPlanDigest: authority.workspacePlan.dependencyPlanDigest,
      dependencyResource: authority.workspaceSnapshot.dependencyResource,
      workspaceRelease,
    });
    return Object.freeze({
      state: 'RELEASED' as const,
      workspaceRelease,
      dependencyVolumeRelease,
      releaseAuthorityDigest: digest('execution-effect-docker-release-authority-v1', {
        landingAuthorityDigest: authority.landingAuthorityDigest,
        landingReceiptDigest: receipt.receiptDigest,
        workspaceReleaseReceiptDigest: workspaceRelease.receiptDigest,
      }),
    });
  } catch {
    return hold('RELEASE_EVIDENCE_INVALID', {
      stage: 'workspace-release', landingReceiptDigest: receipt.receiptDigest,
    });
  }
}
