import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  unlinkSync,
} from 'node:fs';
import { isAbsolute, join, normalize, posix } from 'node:path';
import { spawn } from 'node:child_process';
import { types as nodeTypes } from 'node:util';

import {
  loadExecAuthorityNative,
  type ExecAuthorityNativeEffectEntry,
  type ExecAuthorityNativeEffectFacade,
  type ExecAuthorityNativeEffectHandle,
  type ExecAuthorityNativeCustodyFacade,
  type ExecAuthorityNativeCustodyHandle,
  type ExecAuthorityNativeIdentity,
  type ExecAuthorityNativeState,
} from '../core/exec-authority-native.js';
import {
  createExecutionEffectStagedSourceSealV1,
  executionEffectWorkspaceAuthorityDigestV1,
  executionEffectLandingOperationDigestV1,
  parseExecutionEffectLandingTransactionRefV1,
  parseExecutionEffectWorkspaceSnapshotSealV1,
  parseStagedSource,
  type ExecutionEffectLandingTransactionRefV1,
  type ExecutionEffectPersistenceDigest,
  type ExecutionEffectWorkspaceSnapshotSealV1,
} from '../core/execution-effect-persistence-contract.js';
import type {
  ExecutionEffectCaptureLimits,
  ExecutionEffectAttemptIdentity,
  ExecutionEffectManifest,
  ExecutionEffectManifestCaptureResult,
  ExecutionEffectManifestEntry,
  ExecutionEffectNativeCaptureEntryV1,
  ExecutionEffectNativeCaptureTreeV1,
} from '../core/execution-effect-containment.js';
import {
  createExecutionEffectManifestFromNativeCaptureV1,
} from '../core/execution-effect-containment.js';
import { compileExecutionEffectWritePolicy } from '../core/execution-write-scope-policy.js';
import {
  parseTaskAttemptCustodyAdmissionV2,
  type Sha256Digest,
  type TaskAttemptCustodyAdmissionV2,
  type TaskAttemptCustodyArtifactReceiptV2,
  type TaskAttemptCustodyIdentityV2,
  type TaskAttemptCustodyPolicyV2,
  type TaskAttemptCustodyRootProof,
  type TaskAttemptCustodyVerifiedArtifact,
} from '../core/task-attempt-custody-store.js';
import {
  EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS,
  EXECUTION_EFFECT_LANDING_HARD_MAX_PLAN_ENVELOPE_BYTES,
  createExecutionEffectLandingEntryStateV1,
  createExecutionEffectLandingFinalVerificationReceiptV1,
  createExecutionEffectLandingNativeCapabilityV1,
  createExecutionEffectLandingNativeMutationReceiptV1,
  createExecutionEffectLandingStagedChunkV1,
  createExecutionEffectLandingStagedSourceV1,
  type ExecutionEffectLandingEntryStateV1,
  type ExecutionEffectLandingFinalVerificationReceiptV1,
  type ExecutionEffectLandingNativeAdapterV1,
  type ExecutionEffectLandingNativeMutationReceiptV1,
  type ExecutionEffectLandingNativeReconcileResultV1,
  type ExecutionEffectLandingOperationV1,
  type ExecutionEffectLandingPathStateV1,
  type ExecutionEffectLandingStagedSourceV1,
} from './execution-effect-landing-coordinator.js';

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const DOCKER_IMAGE = /^[a-z0-9][a-z0-9./_-]*(?::[A-Za-z0-9_.-]+)?@sha256:[0-9a-f]{64}$/u;
const SAFE_RESOURCE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const MAX_SOURCE_BYTES = 17_179_869_184;
const MAX_NATIVE_CHUNK_BYTES = 64 * 1024 * 1024;
const MAX_DOCKER_CAPTURE_BYTES = 16 * 1024 * 1024;
const HELPER_MOUNT_TARGET = '/workspace' as const;
const ADAPTER_ID = 'execution-effect-native-linux-v1' as const;
export const EXECUTION_EFFECT_DOCKER_NATIVE_SNAPSHOT_DIRECTORY = '/run/deckent-native-snapshot';
const EXECUTION_EFFECT_DOCKER_NATIVE_SNAPSHOT_TMPFS_SIZE = '2m';

const objectEntries = Object.entries;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;

/**
 * One canonical Docker argument contract for the verified executable native
 * snapshot. Both workspace capture and landing source-read helpers use it.
 */
export function executionEffectDockerNativeSnapshotTmpfs(
  uid?: number,
  gid?: number,
): string {
  if ((uid === undefined) !== (gid === undefined)
    || (uid !== undefined && (!Number.isSafeInteger(uid) || uid < 0))
    || (gid !== undefined && (!Number.isSafeInteger(gid) || gid < 0))) {
    throw new TypeError('Invalid execution-effect Docker native snapshot owner');
  }
  const ownership = uid === undefined || gid === undefined ? '' : `,uid=${uid},gid=${gid}`;
  return `${EXECUTION_EFFECT_DOCKER_NATIVE_SNAPSHOT_DIRECTORY}:rw,exec,nosuid,nodev,size=${EXECUTION_EFFECT_DOCKER_NATIVE_SNAPSHOT_TMPFS_SIZE},mode=0700${ownership}`;
}

export function buildExecutionEffectDockerNativeSnapshotArgs(
  uid?: number,
  gid?: number,
): readonly string[] {
  return objectFreeze([
    '-e', `TMPDIR=${EXECUTION_EFFECT_DOCKER_NATIVE_SNAPSHOT_DIRECTORY}`,
    '--tmpfs', executionEffectDockerNativeSnapshotTmpfs(uid, gid),
  ]);
}

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
    .update(domain, 'utf8').update('\0', 'utf8').update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function rawDigest(bytes: Uint8Array): ExecutionEffectPersistenceDigest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function exactDataObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
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

function exactMethod(value: unknown, key: string): ((...args: never[]) => unknown) | null {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')
    || nodeTypes.isProxy(value)) return null;
  const descriptor = objectGetOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor && typeof descriptor.value === 'function'
    ? descriptor.value as (...args: never[]) => unknown
    : null;
}

function isDigest(value: unknown): value is ExecutionEffectPersistenceDigest {
  return typeof value === 'string' && DIGEST.test(value);
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function safeRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')
    || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/u.test(value)
    || value.normalize('NFC') !== value || Buffer.byteLength(value, 'utf8') > 16 * 1024) return false;
  if (value === '.') return true;
  return posix.normalize(value) === value && value !== '..' && !value.startsWith('../')
    && value.split('/').every(component => component.length > 0
      && Buffer.byteLength(component, 'utf8') <= 255);
}

function canonicalAbsolutePath(value: unknown): value is string {
  return typeof value === 'string' && isAbsolute(value) && value.includes('\0') === false
    && value.normalize('NFC') === value && normalize(value) === value;
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function safeDataTree(
  value: unknown,
  depth = 0,
  budget: { remaining: number } = { remaining: 2_000_000 },
): boolean {
  if (depth > 128 || budget.remaining-- <= 0) return false;
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
  return Object.values(descriptors).every(descriptor => 'value' in descriptor
    && descriptor.enumerable === true
    && safeDataTree(descriptor.value, depth + 1, budget));
}

function nativeCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || nodeTypes.isProxy(error)) return null;
  const descriptor = objectGetOwnPropertyDescriptor(error, 'code');
  return descriptor && 'value' in descriptor && typeof descriptor.value === 'string'
    ? descriptor.value : null;
}

export type ExecutionEffectNativeAdapterHoldCode =
  | 'INVALID_INPUT'
  | 'PLATFORM_UNSUPPORTED'
  | 'NATIVE_UNAVAILABLE'
  | 'NATIVE_CONTRACT_MISMATCH'
  | 'AUTHORITY_MISMATCH'
  | 'ROOT_IDENTITY_MISMATCH'
  | 'DOCKER_SOURCE_UNAVAILABLE'
  | 'DOCKER_RECEIPT_MISMATCH'
  | 'SOURCE_CHANGED'
  | 'STORE_ARTIFACT_MISMATCH'
  | 'NATIVE_EFFECT_UNCERTAIN'
  | 'CLEANUP_UNCONFIRMED';

export class ExecutionEffectNativeAdapterHold extends Error {
  readonly state = 'HOLD' as const;
  constructor(
    readonly code: ExecutionEffectNativeAdapterHoldCode,
    readonly evidenceDigest: ExecutionEffectPersistenceDigest,
  ) {
    super(`EXECUTION_EFFECT_NATIVE_ADAPTER_HOLD:${code}`);
    this.name = 'ExecutionEffectNativeAdapterHold';
    objectFreeze(this);
  }
}

function fail(
  code: ExecutionEffectNativeAdapterHoldCode,
  evidence: unknown,
): never {
  throw new ExecutionEffectNativeAdapterHold(
    code,
    digest('execution-effect-native-adapter-hold-v1', { code, evidence }),
  );
}

export interface ExecutionEffectDockerWorkspaceRuntimeV1 {
  readonly version: 1;
  readonly state: 'SEALED';
  readonly workspaceOwnerUid: number;
  readonly workspaceOwnerGid: number;
  readonly imageReference: string;
  readonly imageDigest: ExecutionEffectPersistenceDigest;
  readonly volumeName: string;
  readonly volumeNameDigest: ExecutionEffectPersistenceDigest;
  readonly volumeIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly mountTarget: typeof HELPER_MOUNT_TARGET;
  readonly mountIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceResourceDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceSnapshotSealDigest: ExecutionEffectPersistenceDigest;
  readonly manifestDigest: ExecutionEffectPersistenceDigest;
}

export interface ExecutionEffectNativeAdapterLimitsV1 {
  readonly maxStagedChunkBytes: number;
  readonly maxOperations: typeof EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS;
  readonly maxPlanEnvelopeBytes: typeof EXECUTION_EFFECT_LANDING_HARD_MAX_PLAN_ENVELOPE_BYTES;
  readonly sourceReadTimeoutMs: number;
  readonly dockerTimeoutMs: number;
  readonly dockerReceiptMaxBytes: number;
}

export interface ExecutionEffectNativeAdapterClockV1 {
  nowIso(): string;
  nowUnixMs(): number;
}

export interface ExecutionEffectStagedContentStoreV1 {
  readonly root: TaskAttemptCustodyRootProof;
  publishHostArtifact(input: Readonly<{
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly artifactClass: 'execution-effect-staged-content';
    readonly artifactKey: string;
    readonly capturedAt: string;
    readonly bytes: Uint8Array;
  }>): TaskAttemptCustodyArtifactReceiptV2;
  readVerifiedArtifact(input: Readonly<{
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly artifactClass: 'execution-effect-staged-content';
    readonly artifactKey: string;
    readonly receiptDigest: Sha256Digest;
  }>): TaskAttemptCustodyVerifiedArtifact | null;
}

export interface ExecutionEffectDockerSourceReceiptV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-source-receipt';
  readonly state: 'VERIFIED';
  readonly helperScriptDigest: ExecutionEffectPersistenceDigest;
  readonly imageReference: string;
  readonly imageDigest: ExecutionEffectPersistenceDigest;
  readonly volumeName: string;
  readonly volumeIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly mountTarget: typeof HELPER_MOUNT_TARGET;
  readonly mountIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceResourceDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceSnapshotSealDigest: ExecutionEffectPersistenceDigest;
  readonly manifestDigest: ExecutionEffectPersistenceDigest;
  readonly attemptDigest: ExecutionEffectPersistenceDigest;
  readonly admissionReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly custodyPolicyDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly landingIntentDigest: ExecutionEffectPersistenceDigest;
  readonly path: string;
  readonly mode: number;
  readonly byteLength: number;
  readonly contentDigest: ExecutionEffectPersistenceDigest;
  readonly sourceObjectIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly chunkCount: number;
  readonly invocationDigest: ExecutionEffectPersistenceDigest;
  readonly receiptDigest: ExecutionEffectPersistenceDigest;
}

type DockerReceiptBody = Omit<ExecutionEffectDockerSourceReceiptV1, 'receiptDigest'>;

export function createExecutionEffectDockerSourceReceiptV1(
  input: DockerReceiptBody,
): ExecutionEffectDockerSourceReceiptV1 {
  if (!exactDataObject(input, [
    'version', 'kind', 'state', 'helperScriptDigest', 'imageReference', 'imageDigest',
    'volumeName', 'volumeIdentityDigest', 'mountTarget', 'mountIdentityDigest',
    'workspaceResourceDigest', 'workspaceSnapshotSealDigest', 'manifestDigest',
    'attemptDigest', 'admissionReceiptDigest', 'custodyPolicyDigest',
    'workspaceIdentityDigest', 'landingIntentDigest', 'path', 'mode', 'byteLength',
    'contentDigest', 'sourceObjectIdentityDigest', 'chunkCount', 'invocationDigest',
  ]) || input.version !== 1 || input.kind !== 'execution-effect-docker-source-receipt'
    || input.state !== 'VERIFIED' || !DOCKER_IMAGE.test(input.imageReference)
    || !SAFE_RESOURCE.test(input.volumeName) || input.mountTarget !== HELPER_MOUNT_TARGET
    || !safeRelativePath(input.path) || !Number.isSafeInteger(input.mode)
    || input.mode < 0 || input.mode > 0o777 || !Number.isSafeInteger(input.byteLength)
    || input.byteLength < 0 || input.byteLength > MAX_SOURCE_BYTES
    || !Number.isSafeInteger(input.chunkCount) || input.chunkCount < 1
    || ![
      input.helperScriptDigest, input.imageDigest, input.volumeIdentityDigest,
      input.mountIdentityDigest, input.workspaceResourceDigest,
      input.workspaceSnapshotSealDigest, input.manifestDigest, input.attemptDigest,
      input.admissionReceiptDigest, input.custodyPolicyDigest,
      input.workspaceIdentityDigest, input.landingIntentDigest, input.contentDigest,
      input.sourceObjectIdentityDigest, input.invocationDigest,
    ].every(isDigest)) fail('DOCKER_RECEIPT_MISMATCH', 'shape');
  const body = objectFreeze({ ...input });
  return objectFreeze({
    ...body,
    receiptDigest: digest('execution-effect-docker-source-receipt-v1', body),
  });
}

function parseDockerReceipt(value: unknown): ExecutionEffectDockerSourceReceiptV1 | null {
  if (!exactDataObject(value, [
    'version', 'kind', 'state', 'helperScriptDigest', 'imageReference', 'imageDigest',
    'volumeName', 'volumeIdentityDigest', 'mountTarget', 'mountIdentityDigest',
    'workspaceResourceDigest', 'workspaceSnapshotSealDigest', 'manifestDigest',
    'attemptDigest', 'admissionReceiptDigest', 'custodyPolicyDigest',
    'workspaceIdentityDigest', 'landingIntentDigest', 'path', 'mode', 'byteLength',
    'contentDigest', 'sourceObjectIdentityDigest', 'chunkCount', 'invocationDigest',
    'receiptDigest',
  ]) || !isDigest(value.receiptDigest)) return null;
  const { receiptDigest, ...body } = value;
  try {
    const recreated = createExecutionEffectDockerSourceReceiptV1(body as unknown as DockerReceiptBody);
    return recreated.receiptDigest === receiptDigest && sameJson(recreated, value)
      ? recreated : null;
  } catch {
    return null;
  }
}

export interface ExecutionEffectDockerSourceInvocationV1 extends Omit<
  DockerReceiptBody,
  'sourceObjectIdentityDigest' | 'chunkCount'
> {
  readonly workspaceOwnerUid: number;
  readonly workspaceOwnerGid: number;
  readonly destinationFd: number;
  readonly deadlineUnixMs: number;
  readonly maxChunkBytes: number;
  readonly timeoutMs: number;
  readonly receiptMaxBytes: number;
}

export interface ExecutionEffectDockerSourceExecutorV1 {
  execute(input: ExecutionEffectDockerSourceInvocationV1): Promise<unknown>;
}

/* The helper emits source bytes only on fd 1 and a small authority receipt only
 * on fd 2. It closes every native handle before publishing the receipt. */
const DOCKER_SOURCE_HELPER = String.raw`
import { createHash } from 'node:crypto';
import { writeSync } from 'node:fs';
import { loadExecAuthorityNative } from '/app/dist/core/exec-authority-native.js';
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value !== null && typeof value === 'object'
    ? '{' + Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key,entry]) => JSON.stringify(key) + ':' + canonical(entry)).join(',') + '}'
    : JSON.stringify(value);
const domainDigest = (domain, value) => 'sha256:' + createHash('sha256')
  .update(domain, 'utf8').update('\0', 'utf8').update(canonical(value), 'utf8').digest('hex');
const authority = JSON.parse(Buffer.from(process.argv[1], 'base64url').toString('utf8'));
const native = loadExecAuthorityNative();
if (!native.available || !native.effect || native.effect.available === false) throw new Error('native unavailable');
let root; let source;
try {
  root = native.effect.openRoot('WORKSPACE', authority.mountTarget);
  source = native.effect.beginSourceRead(root.handle, {
    deadlineUnixMs: authority.deadlineUnixMs,
    expectedContentDigest: authority.contentDigest,
    expectedMode: authority.mode,
    expectedSize: authority.byteLength,
    maxChunkBytes: authority.maxChunkBytes,
    path: authority.path,
  });
  let chunkCount = 0;
  for (;;) {
    const chunk = native.effect.nextSourceChunk(source.handle, 'ACTIVE');
    writeSync(1, chunk.bytes);
    chunkCount += 1;
    if (chunk.observedBytes === authority.byteLength) break;
  }
  const verified = native.effect.finishSourceRead(source.handle);
  native.effect.closeHandle(source.handle); source = undefined;
  native.effect.closeHandle(root.handle); root = undefined;
  const body = {
    version: 1, kind: 'execution-effect-docker-source-receipt', state: 'VERIFIED',
    helperScriptDigest: authority.helperScriptDigest,
    imageReference: authority.imageReference, imageDigest: authority.imageDigest,
    volumeName: authority.volumeName, volumeIdentityDigest: authority.volumeIdentityDigest,
    mountTarget: authority.mountTarget, mountIdentityDigest: authority.mountIdentityDigest,
    workspaceResourceDigest: authority.workspaceResourceDigest,
    workspaceSnapshotSealDigest: authority.workspaceSnapshotSealDigest,
    manifestDigest: authority.manifestDigest, attemptDigest: authority.attemptDigest,
    admissionReceiptDigest: authority.admissionReceiptDigest,
    custodyPolicyDigest: authority.custodyPolicyDigest,
    workspaceIdentityDigest: authority.workspaceIdentityDigest,
    landingIntentDigest: authority.landingIntentDigest,
    path: authority.path, mode: authority.mode, byteLength: verified.observedBytes,
    contentDigest: verified.contentDigest,
    sourceObjectIdentityDigest: verified.sourceObjectIdentityDigest,
    chunkCount, invocationDigest: authority.invocationDigest,
  };
  writeSync(2, Buffer.from(JSON.stringify({ ...body,
    receiptDigest: domainDigest('execution-effect-docker-source-receipt-v1', body) }), 'utf8'));
} finally {
  if (source) native.effect.closeHandle(source.handle);
  if (root) native.effect.closeHandle(root.handle);
}
`;

export const EXECUTION_EFFECT_DOCKER_SOURCE_HELPER_DIGEST = rawDigest(
  Buffer.from(DOCKER_SOURCE_HELPER, 'utf8'),
);

function defaultDockerExecutor(): ExecutionEffectDockerSourceExecutorV1 {
  return objectFreeze({
    execute(input: ExecutionEffectDockerSourceInvocationV1): Promise<unknown> {
      const authority = { ...input } as Record<string, unknown>;
      delete authority.destinationFd;
      delete authority.timeoutMs;
      delete authority.receiptMaxBytes;
      delete authority.workspaceOwnerUid;
      delete authority.workspaceOwnerGid;
      const encoded = Buffer.from(JSON.stringify(authority), 'utf8').toString('base64url');
      const containerName = `deckent-effect-read-${input.invocationDigest.slice(7, 39)}`;
      return new Promise((resolve, reject) => {
        const child = spawn('docker', [
          'run', '--rm', '--name', containerName,
          '--network', 'none', '--read-only', '--cap-drop', 'ALL',
          '--security-opt', 'no-new-privileges',
          '--user', `${input.workspaceOwnerUid}:${input.workspaceOwnerGid}`,
          ...buildExecutionEffectDockerNativeSnapshotArgs(
            input.workspaceOwnerUid,
            input.workspaceOwnerGid,
          ),
          '--mount', `type=volume,src=${input.volumeName},dst=${input.mountTarget},readonly`,
          input.imageReference, 'node', '--input-type=module', '-e', DOCKER_SOURCE_HELPER,
          encoded,
        ], {
          stdio: ['ignore', input.destinationFd, 'pipe'],
          windowsHide: true,
        });
        const stderr: Buffer[] = [];
        let stderrBytes = 0;
        let overflow = false;
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) child.kill('SIGKILL');
        }, input.timeoutMs);
        child.stderr?.on('data', (chunk: Buffer) => {
          stderrBytes += chunk.byteLength;
          if (stderrBytes > input.receiptMaxBytes) {
            overflow = true;
            child.kill('SIGKILL');
            return;
          }
          stderr.push(Buffer.from(chunk));
        });
        child.once('error', error => {
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
        child.once('close', (code, signal) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (overflow || signal !== null || code !== 0 || stderrBytes === 0) {
            reject(new ExecutionEffectNativeAdapterHold(
              'DOCKER_SOURCE_UNAVAILABLE',
              digest('execution-effect-docker-process-hold-v1', {
                overflow, signal, code, stderrBytes,
              }),
            ));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(stderr).toString('utf8')));
          } catch {
            reject(new ExecutionEffectNativeAdapterHold(
              'DOCKER_RECEIPT_MISMATCH',
              digest('execution-effect-docker-process-hold-v1', 'invalid-json'),
            ));
          }
        });
      });
    },
  });
}

export interface ExecutionEffectDockerWorkspaceCaptureReceiptV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-docker-workspace-capture-receipt';
  readonly state: 'VERIFIED';
  readonly helperScriptDigest: ExecutionEffectPersistenceDigest;
  readonly imageReference: string;
  readonly imageDigest: ExecutionEffectPersistenceDigest;
  readonly volumeName: string;
  readonly volumeIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly mountTarget: typeof HELPER_MOUNT_TARGET;
  readonly mountIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceResourceDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceSnapshotSealDigest: ExecutionEffectPersistenceDigest;
  readonly runtimeManifestDigest: ExecutionEffectPersistenceDigest;
  readonly phase: 'baseline' | 'final';
  readonly attemptDigest: ExecutionEffectPersistenceDigest;
  readonly admissionReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly custodyPolicyDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceRootIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly filesWriteDigest: ExecutionEffectPersistenceDigest;
  readonly limitsDigest: ExecutionEffectPersistenceDigest;
  readonly startedAt: string;
  readonly deadlineAt: string;
  readonly payloadDigest: ExecutionEffectPersistenceDigest;
  readonly payloadByteLength: number;
  readonly nativeManifestDigest: ExecutionEffectPersistenceDigest;
  readonly rootObjectIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly entryCount: number;
  readonly totalBytes: number;
  readonly invocationDigest: ExecutionEffectPersistenceDigest;
  readonly receiptDigest: ExecutionEffectPersistenceDigest;
}

type DockerWorkspaceCaptureReceiptBody = Omit<
  ExecutionEffectDockerWorkspaceCaptureReceiptV1,
  'receiptDigest'
>;

export function createExecutionEffectDockerWorkspaceCaptureReceiptV1(
  input: DockerWorkspaceCaptureReceiptBody,
): ExecutionEffectDockerWorkspaceCaptureReceiptV1 {
  if (!exactDataObject(input, [
    'version', 'kind', 'state', 'helperScriptDigest', 'imageReference', 'imageDigest',
    'volumeName', 'volumeIdentityDigest', 'mountTarget', 'mountIdentityDigest',
    'workspaceResourceDigest', 'workspaceSnapshotSealDigest', 'runtimeManifestDigest',
    'phase', 'attemptDigest', 'admissionReceiptDigest', 'custodyPolicyDigest',
    'workspaceIdentityDigest', 'workspaceRootIdentityDigest', 'filesWriteDigest',
    'limitsDigest', 'startedAt', 'deadlineAt', 'payloadDigest', 'payloadByteLength',
    'nativeManifestDigest', 'rootObjectIdentityDigest', 'entryCount', 'totalBytes',
    'invocationDigest',
  ]) || input.version !== 1
    || input.kind !== 'execution-effect-docker-workspace-capture-receipt'
    || input.state !== 'VERIFIED' || (input.phase !== 'baseline' && input.phase !== 'final')
    || !DOCKER_IMAGE.test(input.imageReference) || !SAFE_RESOURCE.test(input.volumeName)
    || input.mountTarget !== HELPER_MOUNT_TARGET || !validTimestamp(input.startedAt)
    || !validTimestamp(input.deadlineAt) || Date.parse(input.deadlineAt) < Date.parse(input.startedAt)
    || !Number.isSafeInteger(input.payloadByteLength) || input.payloadByteLength < 1
    || input.payloadByteLength > MAX_DOCKER_CAPTURE_BYTES
    || !Number.isSafeInteger(input.entryCount) || input.entryCount < 0
    || input.entryCount > 1_000_000 || !Number.isSafeInteger(input.totalBytes)
    || input.totalBytes < 0
    || ![
      input.helperScriptDigest, input.imageDigest, input.volumeIdentityDigest,
      input.mountIdentityDigest, input.workspaceResourceDigest,
      input.workspaceSnapshotSealDigest, input.runtimeManifestDigest, input.attemptDigest,
      input.admissionReceiptDigest, input.custodyPolicyDigest, input.workspaceIdentityDigest,
      input.workspaceRootIdentityDigest, input.filesWriteDigest, input.limitsDigest,
      input.payloadDigest, input.nativeManifestDigest, input.rootObjectIdentityDigest,
      input.invocationDigest,
    ].every(isDigest)) fail('DOCKER_RECEIPT_MISMATCH', 'capture-receipt-shape');
  const body = objectFreeze({ ...input });
  return objectFreeze({
    ...body,
    receiptDigest: digest('execution-effect-docker-workspace-capture-receipt-v1', body),
  });
}

function parseDockerWorkspaceCaptureReceipt(
  value: unknown,
): ExecutionEffectDockerWorkspaceCaptureReceiptV1 | null {
  if (!exactDataObject(value, [
    'version', 'kind', 'state', 'helperScriptDigest', 'imageReference', 'imageDigest',
    'volumeName', 'volumeIdentityDigest', 'mountTarget', 'mountIdentityDigest',
    'workspaceResourceDigest', 'workspaceSnapshotSealDigest', 'runtimeManifestDigest',
    'phase', 'attemptDigest', 'admissionReceiptDigest', 'custodyPolicyDigest',
    'workspaceIdentityDigest', 'workspaceRootIdentityDigest', 'filesWriteDigest',
    'limitsDigest', 'startedAt', 'deadlineAt', 'payloadDigest', 'payloadByteLength',
    'nativeManifestDigest', 'rootObjectIdentityDigest', 'entryCount', 'totalBytes',
    'invocationDigest', 'receiptDigest',
  ]) || !isDigest(value.receiptDigest)) return null;
  const { receiptDigest, ...body } = value;
  try {
    const recreated = createExecutionEffectDockerWorkspaceCaptureReceiptV1(
      body as unknown as DockerWorkspaceCaptureReceiptBody,
    );
    return recreated.receiptDigest === receiptDigest && sameJson(recreated, value)
      ? recreated : null;
  } catch {
    return null;
  }
}

interface DockerWorkspaceCaptureInvocationBodyV1 {
  readonly version: 1;
  readonly helperScriptDigest: ExecutionEffectPersistenceDigest;
  readonly imageReference: string;
  readonly imageDigest: ExecutionEffectPersistenceDigest;
  readonly volumeName: string;
  readonly volumeIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly mountTarget: typeof HELPER_MOUNT_TARGET;
  readonly mountIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceResourceDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceSnapshotSealDigest: ExecutionEffectPersistenceDigest;
  readonly runtimeManifestDigest: ExecutionEffectPersistenceDigest;
  readonly phase: 'baseline' | 'final';
  readonly attemptDigest: ExecutionEffectPersistenceDigest;
  readonly admissionReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly custodyPolicyDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceRootIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly filesWriteDigest: ExecutionEffectPersistenceDigest;
  readonly limitsDigest: ExecutionEffectPersistenceDigest;
  readonly startedAt: string;
  readonly deadlineAt: string;
  readonly deadlineUnixMs: number;
  readonly limits: ExecutionEffectCaptureLimits;
  readonly invocationDigest: ExecutionEffectPersistenceDigest;
}

export interface ExecutionEffectDockerWorkspaceCaptureInvocationV1
  extends DockerWorkspaceCaptureInvocationBodyV1 {
  readonly timeoutMs: number;
  readonly outputMaxBytes: typeof MAX_DOCKER_CAPTURE_BYTES;
  readonly receiptMaxBytes: number;
}

export interface ExecutionEffectDockerWorkspaceCaptureExecutorResultV1 {
  readonly payloadBytes: Uint8Array;
  readonly receipt: unknown;
}

export interface ExecutionEffectDockerWorkspaceCaptureExecutorV1 {
  execute(
    input: ExecutionEffectDockerWorkspaceCaptureInvocationV1,
  ): Promise<ExecutionEffectDockerWorkspaceCaptureExecutorResultV1>;
}

const DOCKER_WORKSPACE_CAPTURE_HELPER = String.raw`
import { createHash } from 'node:crypto';
import { writeSync } from 'node:fs';
import { loadExecAuthorityNative } from '/app/dist/core/exec-authority-native.js';
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value !== null && typeof value === 'object'
    ? '{' + Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key,entry]) => JSON.stringify(key) + ':' + canonical(entry)).join(',') + '}'
    : JSON.stringify(value);
const domainDigest = (domain, value) => 'sha256:' + createHash('sha256')
  .update(domain, 'utf8').update('\0', 'utf8').update(canonical(value), 'utf8').digest('hex');
const rawDigest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const authority = JSON.parse(Buffer.from(process.argv[1], 'base64url').toString('utf8'));
const native = loadExecAuthorityNative();
if (!native.available || !native.effect || native.effect.available === false) throw new Error('native unavailable');
let root;
try {
  root = native.effect.openRoot('WORKSPACE', authority.mountTarget);
  if (root.identityDigest !== authority.workspaceRootIdentityDigest) throw new Error('workspace identity mismatch');
  const rootInspection = native.effect.inspectEntry(root.handle, '.');
  const nativeCapture = native.effect.captureTree(root.handle, {
    ...authority.limits,
    deadlineUnixMs: authority.deadlineUnixMs,
  }, 'ACTIVE');
  native.effect.closeHandle(root.handle); root = undefined;
  const payload = Buffer.from(canonical({ rootEntry: rootInspection.entry, nativeCapture }), 'utf8');
  const body = {
    version: 1, kind: 'execution-effect-docker-workspace-capture-receipt', state: 'VERIFIED',
    helperScriptDigest: authority.helperScriptDigest,
    imageReference: authority.imageReference, imageDigest: authority.imageDigest,
    volumeName: authority.volumeName, volumeIdentityDigest: authority.volumeIdentityDigest,
    mountTarget: authority.mountTarget, mountIdentityDigest: authority.mountIdentityDigest,
    workspaceResourceDigest: authority.workspaceResourceDigest,
    workspaceSnapshotSealDigest: authority.workspaceSnapshotSealDigest,
    runtimeManifestDigest: authority.runtimeManifestDigest, phase: authority.phase,
    attemptDigest: authority.attemptDigest,
    admissionReceiptDigest: authority.admissionReceiptDigest,
    custodyPolicyDigest: authority.custodyPolicyDigest,
    workspaceIdentityDigest: authority.workspaceIdentityDigest,
    workspaceRootIdentityDigest: authority.workspaceRootIdentityDigest,
    filesWriteDigest: authority.filesWriteDigest, limitsDigest: authority.limitsDigest,
    startedAt: authority.startedAt, deadlineAt: authority.deadlineAt,
    payloadDigest: rawDigest(payload), payloadByteLength: payload.byteLength,
    nativeManifestDigest: nativeCapture.manifestDigest,
    rootObjectIdentityDigest: rootInspection.entry.objectIdentityDigest,
    entryCount: nativeCapture.entryCount, totalBytes: nativeCapture.totalBytes,
    invocationDigest: authority.invocationDigest,
  };
  writeSync(1, payload);
  writeSync(2, Buffer.from(canonical({ ...body,
    receiptDigest: domainDigest('execution-effect-docker-workspace-capture-receipt-v1', body) }), 'utf8'));
} finally {
  if (root) native.effect.closeHandle(root.handle);
}
`;

export const EXECUTION_EFFECT_DOCKER_WORKSPACE_CAPTURE_HELPER_DIGEST = rawDigest(
  Buffer.from(DOCKER_WORKSPACE_CAPTURE_HELPER, 'utf8'),
);

function defaultDockerWorkspaceCaptureExecutor(): ExecutionEffectDockerWorkspaceCaptureExecutorV1 {
  return objectFreeze({
    execute(input: ExecutionEffectDockerWorkspaceCaptureInvocationV1): Promise<ExecutionEffectDockerWorkspaceCaptureExecutorResultV1> {
      const authority = { ...input } as Record<string, unknown>;
      delete authority.timeoutMs;
      delete authority.outputMaxBytes;
      delete authority.receiptMaxBytes;
      const encoded = Buffer.from(canonicalJson(authority), 'utf8').toString('base64url');
      const containerName = `deckent-effect-capture-${input.invocationDigest.slice(7, 39)}`;
      return new Promise((resolve, reject) => {
        const child = spawn('docker', [
          'run', '--rm', '--name', containerName,
          '--network', 'none', '--read-only', '--cap-drop', 'ALL',
          '--security-opt', 'no-new-privileges',
          '--mount', `type=volume,src=${input.volumeName},dst=${input.mountTarget},readonly`,
          input.imageReference, 'node', '--input-type=module', '-e',
          DOCKER_WORKSPACE_CAPTURE_HELPER, encoded,
        ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let overflow: 'payload' | 'receipt' | null = null;
        let settled = false;
        const timer = setTimeout(() => { if (!settled) child.kill('SIGKILL'); }, input.timeoutMs);
        child.stdout?.on('data', (chunk: Buffer) => {
          stdoutBytes += chunk.byteLength;
          if (stdoutBytes > input.outputMaxBytes) {
            overflow = 'payload'; child.kill('SIGKILL'); return;
          }
          stdout.push(Buffer.from(chunk));
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          stderrBytes += chunk.byteLength;
          if (stderrBytes > input.receiptMaxBytes) {
            overflow = 'receipt'; child.kill('SIGKILL'); return;
          }
          stderr.push(Buffer.from(chunk));
        });
        child.once('error', error => {
          settled = true; clearTimeout(timer); reject(error);
        });
        child.once('close', (code, signal) => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          if (overflow !== null || signal !== null || code !== 0
            || stdoutBytes === 0 || stderrBytes === 0) {
            reject(new ExecutionEffectNativeAdapterHold(
              'DOCKER_SOURCE_UNAVAILABLE',
              digest('execution-effect-docker-capture-process-hold-v1', {
                overflow, signal, code, stdoutBytes, stderrBytes,
              }),
            ));
            return;
          }
          try {
            resolve(objectFreeze({
              payloadBytes: Buffer.concat(stdout),
              receipt: JSON.parse(Buffer.concat(stderr).toString('utf8')),
            }));
          } catch {
            reject(new ExecutionEffectNativeAdapterHold(
              'DOCKER_RECEIPT_MISMATCH',
              digest('execution-effect-docker-capture-process-hold-v1', 'invalid-json'),
            ));
          }
        });
      });
    },
  });
}

export interface ExecutionEffectDockerWorkspaceCaptureInputV1 {
  readonly platform: 'linux' | 'wsl' | 'darwin' | 'win32';
  readonly phase: 'baseline' | 'final';
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly filesWrite: readonly string[];
  readonly workspaceSnapshot: ExecutionEffectWorkspaceSnapshotSealV1;
  readonly workspaceRuntime: ExecutionEffectDockerWorkspaceRuntimeV1;
  readonly clock: ExecutionEffectNativeAdapterClockV1;
  readonly limits: ExecutionEffectCaptureLimits;
  readonly timeoutMs: number;
  readonly receiptMaxBytes: number;
}

export interface ExecutionEffectDockerWorkspaceCaptureDependenciesV1 {
  readonly docker: ExecutionEffectDockerWorkspaceCaptureExecutorV1;
}

export type ExecutionEffectDockerWorkspaceCaptureResultV1 =
  | Readonly<{
    readonly state: 'VERIFIED';
    readonly manifest: ExecutionEffectManifest;
    readonly dockerReceipt: ExecutionEffectDockerWorkspaceCaptureReceiptV1;
  }>
  | Readonly<{
    readonly state: 'HOLD';
    readonly code: ExecutionEffectNativeAdapterHoldCode;
    readonly evidenceDigest: ExecutionEffectPersistenceDigest;
  }>;

export interface ExecutionEffectNativeAdapterFactoryInputV1 {
  readonly platform: 'linux' | 'wsl' | 'darwin' | 'win32';
  readonly canonicalProjectRoot: string;
  readonly hostPrivateStagingRoot: string;
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admission: TaskAttemptCustodyAdmissionV2;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly workspaceSnapshot: ExecutionEffectWorkspaceSnapshotSealV1;
  readonly workspaceRuntime: ExecutionEffectDockerWorkspaceRuntimeV1;
  readonly sourceAuthorities: readonly ExecutionEffectNativeSourceAuthorityV1[];
  readonly store: ExecutionEffectStagedContentStoreV1;
  readonly clock: ExecutionEffectNativeAdapterClockV1;
  readonly limits: ExecutionEffectNativeAdapterLimitsV1;
}

export interface ExecutionEffectNativeSourceAuthorityV1 {
  readonly path: string;
  readonly entry: Extract<ExecutionEffectManifestEntry, { kind: 'regular-file' }>;
  readonly landingIntentDigest: ExecutionEffectPersistenceDigest;
}

export interface ExecutionEffectNativeAdapterDependenciesV1 {
  readonly loadNative: () => ExecAuthorityNativeState;
  readonly docker: ExecutionEffectDockerSourceExecutorV1;
}

export type ExecutionEffectNativeAdapterFactoryResultV1 =
  | Readonly<{
    readonly state: 'READY';
    readonly adapter: ExecutionEffectLandingNativeAdapterV1;
  }>
  | Readonly<{
    readonly state: 'HOLD';
    readonly code: ExecutionEffectNativeAdapterHoldCode;
    readonly evidenceDigest: ExecutionEffectPersistenceDigest;
  }>;

interface AdapterAuthority {
  readonly platform: 'linux' | 'wsl';
  readonly canonicalProjectRoot: string;
  readonly hostPrivateStagingRoot: string;
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admission: TaskAttemptCustodyAdmissionV2;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly workspaceSnapshot: ExecutionEffectWorkspaceSnapshotSealV1;
  readonly workspaceRuntime: ExecutionEffectDockerWorkspaceRuntimeV1;
  readonly sourceAuthorities: readonly ExecutionEffectNativeSourceAuthorityV1[];
  readonly store: ExecutionEffectStagedContentStoreV1;
  readonly clock: ExecutionEffectNativeAdapterClockV1;
  readonly limits: ExecutionEffectNativeAdapterLimitsV1;
  readonly native: ExecAuthorityNativeEffectFacade;
  readonly docker: ExecutionEffectDockerSourceExecutorV1;
  readonly projectRootIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly stagingRootCallIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly stagingRootIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly nativeContractDigest: ExecutionEffectPersistenceDigest;
  readonly rootSeparationEvidenceDigest: ExecutionEffectPersistenceDigest;
}

function exactAttempt(value: unknown): ExecutionEffectAttemptIdentity | null {
  if (!exactDataObject(value, ['projectId', 'taskId', 'attemptId', 'generation'])
    || typeof value.projectId !== 'string' || typeof value.taskId !== 'string'
    || typeof value.attemptId !== 'string' || !Number.isSafeInteger(value.generation)
    || (value.generation as number) < 1) return null;
  return objectFreeze({
    projectId: value.projectId,
    taskId: value.taskId,
    attemptId: value.attemptId,
    generation: value.generation as number,
  });
}

function sameAttemptIdentity(
  attempt: ExecutionEffectAttemptIdentity,
  identity: Readonly<{
    readonly projectId: string;
    readonly taskId: string;
    readonly attemptId: string;
    readonly generation: number;
  }>,
): boolean {
  return attempt.projectId === identity.projectId && attempt.taskId === identity.taskId
    && attempt.attemptId === identity.attemptId && attempt.generation === identity.generation;
}

function runtimeSnapshot(
  value: unknown,
  workspace: ExecutionEffectWorkspaceSnapshotSealV1,
): ExecutionEffectDockerWorkspaceRuntimeV1 | null {
  if (!exactDataObject(value, [
    'version', 'state', 'workspaceOwnerUid', 'workspaceOwnerGid',
    'imageReference', 'imageDigest', 'volumeName', 'volumeNameDigest',
    'volumeIdentityDigest', 'mountTarget', 'mountIdentityDigest', 'workspaceResourceDigest',
    'workspaceSnapshotSealDigest', 'manifestDigest',
  ]) || value.version !== 1 || value.state !== 'SEALED'
    || !Number.isSafeInteger(value.workspaceOwnerUid)
    || (value.workspaceOwnerUid as number) < 0
    || (value.workspaceOwnerUid as number) >= 0xffffffff
    || !Number.isSafeInteger(value.workspaceOwnerGid)
    || (value.workspaceOwnerGid as number) < 0
    || (value.workspaceOwnerGid as number) >= 0xffffffff
    || typeof value.imageReference !== 'string' || !DOCKER_IMAGE.test(value.imageReference)
    || typeof value.volumeName !== 'string' || !SAFE_RESOURCE.test(value.volumeName)
    || value.mountTarget !== HELPER_MOUNT_TARGET
    || ![
      value.imageDigest, value.volumeNameDigest, value.volumeIdentityDigest,
      value.mountIdentityDigest, value.workspaceResourceDigest,
      value.workspaceSnapshotSealDigest, value.manifestDigest,
    ].every(isDigest)) return null;
  const imageHex = (value.imageDigest as string).slice(7);
  if (!(value.imageReference as string).endsWith(`@sha256:${imageHex}`)
    || value.imageDigest !== workspace.workspaceResource.imageDigest
    || value.volumeName !== workspace.workspaceResource.volumeName
    || value.volumeNameDigest !== workspace.workspaceResource.volumeNameDigest
    || value.workspaceResourceDigest !== workspace.workspaceResource.resourceDigest
    || value.workspaceSnapshotSealDigest !== workspace.sealDigest) return null;
  return objectFreeze({
    version: 1,
    state: 'SEALED',
    workspaceOwnerUid: value.workspaceOwnerUid as number,
    workspaceOwnerGid: value.workspaceOwnerGid as number,
    imageReference: value.imageReference,
    imageDigest: value.imageDigest as ExecutionEffectPersistenceDigest,
    volumeName: value.volumeName,
    volumeNameDigest: value.volumeNameDigest as ExecutionEffectPersistenceDigest,
    volumeIdentityDigest: value.volumeIdentityDigest as ExecutionEffectPersistenceDigest,
    mountTarget: HELPER_MOUNT_TARGET,
    mountIdentityDigest: value.mountIdentityDigest as ExecutionEffectPersistenceDigest,
    workspaceResourceDigest: value.workspaceResourceDigest as ExecutionEffectPersistenceDigest,
    workspaceSnapshotSealDigest: value.workspaceSnapshotSealDigest as ExecutionEffectPersistenceDigest,
    manifestDigest: value.manifestDigest as ExecutionEffectPersistenceDigest,
  });
}

function limitsSnapshot(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): ExecutionEffectNativeAdapterLimitsV1 | null {
  if (!exactDataObject(value, [
    'maxStagedChunkBytes', 'maxOperations', 'maxPlanEnvelopeBytes',
    'sourceReadTimeoutMs', 'dockerTimeoutMs', 'dockerReceiptMaxBytes',
  ]) || value.maxOperations !== EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS
    || value.maxPlanEnvelopeBytes !== EXECUTION_EFFECT_LANDING_HARD_MAX_PLAN_ENVELOPE_BYTES
    || !Number.isSafeInteger(value.maxStagedChunkBytes)
    || (value.maxStagedChunkBytes as number) <= 0
    || (value.maxStagedChunkBytes as number) > MAX_NATIVE_CHUNK_BYTES
    || !Number.isSafeInteger(value.sourceReadTimeoutMs)
    || (value.sourceReadTimeoutMs as number) < 1 || (value.sourceReadTimeoutMs as number) > 3_600_000
    || !Number.isSafeInteger(value.dockerTimeoutMs)
    || (value.dockerTimeoutMs as number) < 1 || (value.dockerTimeoutMs as number) > 3_600_000
    || !Number.isSafeInteger(value.dockerReceiptMaxBytes)
    || (value.dockerReceiptMaxBytes as number) < 1_024
    || (value.dockerReceiptMaxBytes as number) > 1_048_576) return null;
  const storeLimit = policy.artifactLimits['execution-effect-staged-content'];
  if (!storeLimit || storeLimit.minBytes !== 0 || storeLimit.requireSingleLink !== true
    || storeLimit.maxBytes !== value.maxStagedChunkBytes) return null;
  return objectFreeze({
    maxStagedChunkBytes: value.maxStagedChunkBytes as number,
    maxOperations: EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS,
    maxPlanEnvelopeBytes: EXECUTION_EFFECT_LANDING_HARD_MAX_PLAN_ENVELOPE_BYTES,
    sourceReadTimeoutMs: value.sourceReadTimeoutMs as number,
    dockerTimeoutMs: value.dockerTimeoutMs as number,
    dockerReceiptMaxBytes: value.dockerReceiptMaxBytes as number,
  });
}

function sourceAuthoritiesSnapshot(
  value: unknown,
): readonly ExecutionEffectNativeSourceAuthorityV1[] | null {
  if (!Array.isArray(value) || nodeTypes.isProxy(value)
    || value.length > EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS) return null;
  const sources: ExecutionEffectNativeSourceAuthorityV1[] = [];
  const paths = new Set<string>();
  for (const raw of value) {
    if (!exactDataObject(raw, ['path', 'entry', 'landingIntentDigest'])
      || !safeRelativePath(raw.path) || raw.path === '.' || !isDigest(raw.landingIntentDigest)
      || !exactDataObject(raw.entry, ['path', 'kind', 'mode', 'size', 'contentDigest'])
      || raw.entry.kind !== 'regular-file' || raw.entry.path !== raw.path
      || !Number.isSafeInteger(raw.entry.mode) || (raw.entry.mode as number) < 0
      || (raw.entry.mode as number) > 0o777 || !Number.isSafeInteger(raw.entry.size)
      || (raw.entry.size as number) < 0 || (raw.entry.size as number) > MAX_SOURCE_BYTES
      || !isDigest(raw.entry.contentDigest) || paths.has(raw.path)) return null;
    sources.push(objectFreeze({
      path: raw.path,
      entry: objectFreeze({
        path: raw.path,
        kind: 'regular-file' as const,
        mode: raw.entry.mode as number,
        size: raw.entry.size as number,
        contentDigest: raw.entry.contentDigest,
      }),
      landingIntentDigest: raw.landingIntentDigest,
    }));
    paths.add(raw.path);
  }
  return objectFreeze(sources.sort((left, right) => compareCodePoint(left.path, right.path)));
}

function closeNative(
  native: ExecAuthorityNativeEffectFacade,
  handle: ExecAuthorityNativeEffectHandle | null,
): void {
  if (handle === null) return;
  try {
    native.closeHandle(handle);
  } catch (error) {
    fail('CLEANUP_UNCONFIRMED', { code: nativeCode(error) });
  }
}

function probeRootIdentity(
  native: ExecAuthorityNativeEffectFacade,
  kind: 'PROJECT' | 'WORKSPACE' | 'STAGING',
  path: string,
): ExecutionEffectPersistenceDigest {
  let handle: ExecAuthorityNativeEffectHandle | null = null;
  try {
    const opened = native.openRoot(kind, path);
    handle = opened.handle;
    if (!isDigest(opened.identityDigest)) fail('NATIVE_CONTRACT_MISMATCH', { kind });
    return opened.identityDigest as ExecutionEffectPersistenceDigest;
  } catch (error) {
    if (error instanceof ExecutionEffectNativeAdapterHold) throw error;
    fail('ROOT_IDENTITY_MISMATCH', { kind, code: nativeCode(error) });
  } finally {
    closeNative(native, handle);
  }
}

function proveRootSeparation(
  custody: ExecAuthorityNativeCustodyFacade,
  stagingRoot: string,
  canonicalProjectRoot: string,
): ExecutionEffectPersistenceDigest {
  let handle: ExecAuthorityNativeCustodyHandle | null = null;
  try {
    const opened = custody.invoke('open-root', {
      path: stagingRoot,
      disposition: 'OPEN_EXISTING',
      privacyPolicy: 'OWNER_PRIVATE',
    });
    handle = opened.handle;
    const proof = custody.invoke('prove-root-separation', {
      custodyRoot: handle,
      canonicalProjectRoot,
    });
    if (proof.state !== 'CONFIRMED') fail('ROOT_IDENTITY_MISMATCH', 'root-separation');
    const stableIdentity = (identity: ExecAuthorityNativeIdentity) => objectFreeze({
      schemaVersion: identity.schemaVersion,
      kind: identity.kind,
      platform: identity.platform,
      objectType: identity.objectType,
      mntId: identity.mntId,
      dev: identity.dev,
      ino: identity.ino,
      fsMagic: identity.fsMagic,
      mode: identity.mode,
      ownerUid: identity.ownerUid,
      volumeId: identity.volumeId,
      fileId: identity.fileId,
      reparseTag: identity.reparseTag,
      ownerSid: identity.ownerSid,
      daclPresent: identity.daclPresent,
      daclProtected: identity.daclProtected,
      daclEntryCount: identity.daclEntryCount,
      daclOwnerAllowMask: identity.daclOwnerAllowMask,
      daclCanonicalHash: identity.daclCanonicalHash,
      volumeRemote: identity.volumeRemote,
      volumeCapabilities: objectFreeze([...identity.volumeCapabilities]),
      featureEvidenceBits: identity.featureEvidenceBits,
    });
    // Directory size and link count are observation-local metadata: creating
    // staged artifacts legitimately changes them.  The native proof above
    // still compares the complete before/after identity during every call;
    // only the restart-stable authority digest excludes those volatile fields.
    return digest('execution-effect-root-separation-authority-v2', {
      custodyIdentity: stableIdentity(proof.custodyIdentity),
      projectIdentity: stableIdentity(proof.projectIdentity),
      featureEvidenceBits: proof.featureEvidenceBits,
    });
  } catch (error) {
    if (error instanceof ExecutionEffectNativeAdapterHold) throw error;
    fail('ROOT_IDENTITY_MISMATCH', { phase: 'root-separation', code: nativeCode(error) });
  } finally {
    if (handle !== null) {
      try {
        custody.closeHandle(handle);
      } catch (error) {
        fail('CLEANUP_UNCONFIRMED', { phase: 'root-separation-close', code: nativeCode(error) });
      }
    }
  }
  fail('ROOT_IDENTITY_MISMATCH', 'root-separation-unreachable');
}

function inheritedMethod(
  value: unknown,
  key: string,
): ((...args: unknown[]) => unknown) | null {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')
    || nodeTypes.isProxy(value)) return null;
  let cursor: object | null = value;
  for (let depth = 0; cursor !== null && depth < 16; depth += 1) {
    if (nodeTypes.isProxy(cursor)) return null;
    const descriptor = objectGetOwnPropertyDescriptor(cursor, key);
    if (descriptor) {
      return 'value' in descriptor && typeof descriptor.value === 'function'
        ? (...args: unknown[]) => Reflect.apply(descriptor.value as (...items: unknown[]) => unknown, value, args)
        : null;
    }
    cursor = objectGetPrototypeOf(cursor) as object | null;
  }
  return null;
}

function snapshotClock(value: unknown): ExecutionEffectNativeAdapterClockV1 | null {
  if (!exactDataObject(value, ['nowIso', 'nowUnixMs'])) return null;
  const nowIso = exactMethod(value, 'nowIso');
  const nowUnixMs = exactMethod(value, 'nowUnixMs');
  if (!nowIso || !nowUnixMs) return null;
  return objectFreeze({
    nowIso(): string {
      const result = Reflect.apply(nowIso, undefined, []) as unknown;
      if (typeof result !== 'string' || !Number.isFinite(Date.parse(result))
        || new Date(Date.parse(result)).toISOString() !== result) fail('AUTHORITY_MISMATCH', 'clock-iso');
      return result;
    },
    nowUnixMs(): number {
      const result = Reflect.apply(nowUnixMs, undefined, []) as unknown;
      if (!Number.isSafeInteger(result) || (result as number) < 0) {
        fail('AUTHORITY_MISMATCH', 'clock-unix');
      }
      return result as number;
    },
  });
}

function snapshotStore(value: unknown): ExecutionEffectStagedContentStoreV1 | null {
  if (value === null || typeof value !== 'object' || nodeTypes.isProxy(value)) return null;
  const rootDescriptor = objectGetOwnPropertyDescriptor(value, 'root');
  const publish = inheritedMethod(value, 'publishHostArtifact');
  const read = inheritedMethod(value, 'readVerifiedArtifact');
  if (!rootDescriptor || !('value' in rootDescriptor) || !publish || !read
    || rootDescriptor.value === null || typeof rootDescriptor.value !== 'object') return null;
  const root = dataClone(rootDescriptor.value) as TaskAttemptCustodyRootProof | null;
  if (!root) return null;
  return objectFreeze({
    root,
    publishHostArtifact: (input: Parameters<ExecutionEffectStagedContentStoreV1['publishHostArtifact']>[0]) =>
      publish(input) as TaskAttemptCustodyArtifactReceiptV2,
    readVerifiedArtifact: (input: Parameters<ExecutionEffectStagedContentStoreV1['readVerifiedArtifact']>[0]) =>
      read(input) as TaskAttemptCustodyVerifiedArtifact | null,
  });
}

function snapshotDockerExecutor(value: unknown): ExecutionEffectDockerSourceExecutorV1 | null {
  if (!exactDataObject(value, ['execute'])) return null;
  const execute = exactMethod(value, 'execute');
  return execute ? objectFreeze({
    execute: async (input: ExecutionEffectDockerSourceInvocationV1) =>
      await Promise.resolve(Reflect.apply(execute, undefined, [input])),
  }) : null;
}

function snapshotDependencies(
  value: ExecutionEffectNativeAdapterDependenciesV1 | undefined,
): ExecutionEffectNativeAdapterDependenciesV1 | null {
  if (value === undefined) {
    return objectFreeze({ loadNative: loadExecAuthorityNative, docker: defaultDockerExecutor() });
  }
  if (!exactDataObject(value, ['loadNative', 'docker'])) return null;
  const load = exactMethod(value, 'loadNative');
  const docker = snapshotDockerExecutor(value.docker);
  return load && docker ? objectFreeze({
    loadNative: () => Reflect.apply(load, undefined, []) as ExecAuthorityNativeState,
    docker,
  }) : null;
}

function snapshotFactoryAuthority(
  input: ExecutionEffectNativeAdapterFactoryInputV1,
  dependencies: ExecutionEffectNativeAdapterDependenciesV1 | undefined,
): AdapterAuthority {
  if (!exactDataObject(input, [
    'platform', 'canonicalProjectRoot', 'hostPrivateStagingRoot', 'attempt', 'identity',
    'admission', 'policy', 'workspaceSnapshot', 'workspaceRuntime', 'sourceAuthorities',
    'store', 'clock', 'limits',
  ])) fail('INVALID_INPUT', 'factory-shape');
  if (input.platform === 'darwin' || input.platform === 'win32') {
    fail('PLATFORM_UNSUPPORTED', { platform: input.platform });
  }
  if (input.platform !== 'linux' && input.platform !== 'wsl') fail('INVALID_INPUT', 'platform');
  if (!canonicalAbsolutePath(input.canonicalProjectRoot)
    || !canonicalAbsolutePath(input.hostPrivateStagingRoot)
    || input.canonicalProjectRoot === input.hostPrivateStagingRoot
    || input.hostPrivateStagingRoot.startsWith(`${input.canonicalProjectRoot}/`)) {
    fail('INVALID_INPUT', 'root-paths');
  }
  const attempt = exactAttempt(input.attempt);
  const policy = dataClone(input.policy) as TaskAttemptCustodyPolicyV2 | null;
  const workspace = parseExecutionEffectWorkspaceSnapshotSealV1(input.workspaceSnapshot);
  let admission: TaskAttemptCustodyAdmissionV2 | null = null;
  try {
    if (policy) admission = parseTaskAttemptCustodyAdmissionV2(input.admission, policy);
  } catch {
    fail('AUTHORITY_MISMATCH', 'admission-parse');
  }
  const runtime = workspace ? runtimeSnapshot(input.workspaceRuntime, workspace) : null;
  const sourceAuthorities = sourceAuthoritiesSnapshot(input.sourceAuthorities);
  const limits = policy ? limitsSnapshot(input.limits, policy) : null;
  const clock = snapshotClock(input.clock);
  const store = snapshotStore(input.store);
  const deps = snapshotDependencies(dependencies);
  if (!attempt || !policy || !workspace || !admission || !runtime || !sourceAuthorities
    || !limits || !clock || !store || !deps) {
    fail('INVALID_INPUT', 'authority-snapshot');
  }
  if (!sameAttemptIdentity(attempt, input.identity)
    || !sameAttemptIdentity(attempt, admission.identity)
    || !sameAttemptIdentity(attempt, workspace.attempt)
    || !sameJson(input.identity, admission.identity)
    || workspace.attemptDigest !== digest('execution-effect-attempt-v1', attempt)
    || admission.receiptDigest !== workspace.admissionReceiptDigest
    || policy.policyDigest !== workspace.custodyPolicyDigest) {
    fail('AUTHORITY_MISMATCH', 'attempt-admission-workspace');
  }
  if (sourceAuthorities.some(source => Math.max(
    1,
    Math.ceil(source.entry.size / limits.maxStagedChunkBytes),
  ) > limits.maxOperations)) {
    fail('INVALID_INPUT', 'source-chunk-count');
  }
  const expectedProjectRootSha256 = createHash('sha256')
    .update(input.canonicalProjectRoot, 'utf8').digest('hex');
  if (input.identity.projectRootSha256 !== expectedProjectRootSha256
    || store.root.projectId !== attempt.projectId
    || store.root.canonicalProjectRootSha256 !== expectedProjectRootSha256
    || store.root.rootId !== admission.custodyRootId
    || store.root.volumeId !== admission.custodyVolumeId
    || store.root.directoryId !== admission.custodyDirectoryId
    || store.root.capabilityEvidenceDigest !== admission.custodyCapabilityEvidenceDigest) {
    fail('AUTHORITY_MISMATCH', 'store-root');
  }
  let nativeState: ExecAuthorityNativeState;
  try {
    nativeState = deps.loadNative();
  } catch (error) {
    fail('NATIVE_UNAVAILABLE', { code: nativeCode(error) });
  }
  if (!nativeState.available || nativeState.manifest.platform !== 'linux'
    || !nativeState.manifest.features.includes('execution-effect-linux-v1')
    || 'available' in nativeState.effect) {
    fail(nativeState.available ? 'NATIVE_CONTRACT_MISMATCH' : 'NATIVE_UNAVAILABLE',
      nativeState.available ? 'effect-feature' : nativeState.reason);
  }
  const nativeContractDigest = digest('execution-effect-native-contract-v1', {
    abiName: nativeState.manifest.abiName,
    abiVersion: nativeState.manifest.abiVersion,
    handleAbi: nativeState.manifest.handleAbi,
    effectContract: nativeState.manifest.effectContract,
    feature: 'execution-effect-linux-v1',
    packageName: nativeState.manifest.packageName,
    packageVersion: nativeState.manifest.packageVersion,
    platform: nativeState.manifest.platform,
    arch: nativeState.manifest.arch,
    exportSet: nativeState.manifest.exportSet,
    workspaceNativeCapabilityDigest: workspace.nativeCapabilityDigest,
  });
  const projectRootIdentityDigest = probeRootIdentity(
    nativeState.effect,
    'PROJECT',
    input.canonicalProjectRoot,
  );
  const stagingIdentity = probeRootIdentity(
    nativeState.effect,
    'STAGING',
    input.hostPrivateStagingRoot,
  );
  const stagingReadIdentity = probeRootIdentity(
    nativeState.effect,
    'WORKSPACE',
    input.hostPrivateStagingRoot,
  );
  if (stagingIdentity !== stagingReadIdentity || stagingIdentity === projectRootIdentityDigest) {
    fail('ROOT_IDENTITY_MISMATCH', 'staging-alias');
  }
  const rootSeparationEvidenceDigest = proveRootSeparation(
    nativeState.custody,
    input.hostPrivateStagingRoot,
    input.canonicalProjectRoot,
  );
  const stagingRootIdentityDigest = digest('execution-effect-store-staging-root-v1', {
    artifactClass: 'execution-effect-staged-content',
    custodyRootId: admission.custodyRootId,
    custodyVolumeId: admission.custodyVolumeId,
    custodyDirectoryId: admission.custodyDirectoryId,
    custodyCapabilityEvidenceDigest: admission.custodyCapabilityEvidenceDigest,
    policyDigest: policy.policyDigest,
    rootSeparationEvidenceDigest,
  });
  return objectFreeze({
    platform: input.platform,
    canonicalProjectRoot: input.canonicalProjectRoot,
    hostPrivateStagingRoot: input.hostPrivateStagingRoot,
    attempt,
    identity: objectFreeze({ ...input.identity }),
    admission,
    policy,
    workspaceSnapshot: workspace,
    workspaceRuntime: runtime,
    sourceAuthorities,
    store,
    clock,
    limits,
    native: nativeState.effect,
    docker: deps.docker,
    projectRootIdentityDigest,
    stagingRootCallIdentityDigest: stagingIdentity,
    stagingRootIdentityDigest,
    nativeContractDigest,
    rootSeparationEvidenceDigest,
  });
}

function withPinnedRoot<TResult>(
  authority: AdapterAuthority,
  kind: 'PROJECT' | 'WORKSPACE' | 'STAGING',
  path: string,
  expectedIdentity: ExecutionEffectPersistenceDigest,
  action: (handle: ExecAuthorityNativeEffectHandle) => TResult,
): TResult {
  let handle: ExecAuthorityNativeEffectHandle | null = null;
  try {
    const opened = authority.native.openRoot(kind, path);
    handle = opened.handle;
    if (opened.identityDigest !== expectedIdentity) {
      fail('ROOT_IDENTITY_MISMATCH', { kind, observed: opened.identityDigest });
    }
    return action(handle);
  } catch (error) {
    if (error instanceof ExecutionEffectNativeAdapterHold) throw error;
    fail('NATIVE_EFFECT_UNCERTAIN', { kind, code: nativeCode(error) });
  } finally {
    closeNative(authority.native, handle);
  }
}

function inspectNativeEntry(
  authority: AdapterAuthority,
  root: ExecAuthorityNativeEffectHandle,
  path: string,
): ExecutionEffectLandingEntryStateV1 {
  let observed: ExecAuthorityNativeEffectEntry;
  try {
    observed = authority.native.inspectEntry(root, path).entry;
  } catch (error) {
    if (nativeCode(error) === 'ENOENT') {
      return createExecutionEffectLandingEntryStateV1({ entry: null });
    }
    fail('NATIVE_EFFECT_UNCERTAIN', { operation: 'inspect-entry', code: nativeCode(error) });
  }
  const mode = Number.parseInt(observed.mode, 8);
  if (!Number.isSafeInteger(mode) || mode < 0 || mode > 0o777
    || observed.path !== path || !isDigest(observed.objectIdentityDigest)) {
    fail('NATIVE_CONTRACT_MISMATCH', 'entry-shape');
  }
  let entry: ExecutionEffectManifestEntry;
  if (observed.kind === 'REGULAR_FILE') {
    const size = Number(observed.size);
    if (!Number.isSafeInteger(size) || size < 0 || !isDigest(observed.contentDigest)) {
      fail('NATIVE_CONTRACT_MISMATCH', 'file-entry');
    }
    entry = objectFreeze({
      path,
      kind: 'regular-file' as const,
      mode,
      size,
      contentDigest: observed.contentDigest,
    });
  } else {
    entry = objectFreeze({ path, kind: 'directory' as const, mode });
  }
  return createExecutionEffectLandingEntryStateV1({
    entry,
    objectIdentityDigest: observed.objectIdentityDigest,
    linkCount: entry.kind === 'regular-file' ? 1 : null,
  });
}

function validatedTimestamp(clock: ExecutionEffectNativeAdapterClockV1): string {
  return clock.nowIso();
}

function sourceInvocationBody(
  authority: AdapterAuthority,
  path: string,
  entry: Extract<ExecutionEffectManifestEntry, { kind: 'regular-file' }>,
  landingIntentDigest: ExecutionEffectPersistenceDigest,
  deadlineUnixMs: number,
): Omit<DockerReceiptBody, 'sourceObjectIdentityDigest' | 'chunkCount'> & Readonly<{
  readonly workspaceOwnerUid: number;
  readonly workspaceOwnerGid: number;
  readonly deadlineUnixMs: number;
  readonly maxChunkBytes: number;
}> {
  const base = {
    version: 1 as const,
    kind: 'execution-effect-docker-source-receipt' as const,
    state: 'VERIFIED' as const,
    helperScriptDigest: EXECUTION_EFFECT_DOCKER_SOURCE_HELPER_DIGEST,
    imageReference: authority.workspaceRuntime.imageReference,
    imageDigest: authority.workspaceRuntime.imageDigest,
    volumeName: authority.workspaceRuntime.volumeName,
    volumeIdentityDigest: authority.workspaceRuntime.volumeIdentityDigest,
    mountTarget: authority.workspaceRuntime.mountTarget,
    mountIdentityDigest: authority.workspaceRuntime.mountIdentityDigest,
    workspaceResourceDigest: authority.workspaceRuntime.workspaceResourceDigest,
    workspaceSnapshotSealDigest: authority.workspaceRuntime.workspaceSnapshotSealDigest,
    manifestDigest: authority.workspaceRuntime.manifestDigest,
    attemptDigest: authority.workspaceSnapshot.attemptDigest,
    admissionReceiptDigest: authority.admission.receiptDigest,
    custodyPolicyDigest: authority.policy.policyDigest,
    workspaceIdentityDigest: executionEffectWorkspaceAuthorityDigestV1(
      authority.workspaceSnapshot.workspaceIdentity,
    ),
    landingIntentDigest,
    path,
    mode: entry.mode,
    byteLength: entry.size,
    contentDigest: entry.contentDigest as ExecutionEffectPersistenceDigest,
  };
  const invocationDigest = digest('execution-effect-docker-source-invocation-v1', {
    ...base,
    workspaceOwnerUid: authority.workspaceRuntime.workspaceOwnerUid,
    workspaceOwnerGid: authority.workspaceRuntime.workspaceOwnerGid,
    deadlineUnixMs,
    maxChunkBytes: authority.limits.maxStagedChunkBytes,
  });
  return objectFreeze({
    ...base,
    invocationDigest,
    workspaceOwnerUid: authority.workspaceRuntime.workspaceOwnerUid,
    workspaceOwnerGid: authority.workspaceRuntime.workspaceOwnerGid,
    deadlineUnixMs,
    maxChunkBytes: authority.limits.maxStagedChunkBytes,
  }) as Omit<DockerReceiptBody, 'sourceObjectIdentityDigest' | 'chunkCount'> & Readonly<{
    readonly workspaceOwnerUid: number;
    readonly workspaceOwnerGid: number;
    readonly deadlineUnixMs: number;
    readonly maxChunkBytes: number;
  }>;
}

function artifactKey(
  authority: AdapterAuthority,
  invocationDigest: ExecutionEffectPersistenceDigest,
  index: number,
): string {
  return `ees-${authority.workspaceSnapshot.attemptDigest.slice(7, 23)}-${invocationDigest.slice(7, 39)}-${index.toString(36)}`;
}

function sameIdentity(
  left: TaskAttemptCustodyIdentityV2,
  right: TaskAttemptCustodyIdentityV2,
): boolean {
  return sameJson(left, right);
}

function verifiedStoreChunk(
  authority: AdapterAuthority,
  key: string,
  receiptDigest: ExecutionEffectPersistenceDigest,
  expectedBytes?: Uint8Array,
): TaskAttemptCustodyVerifiedArtifact {
  let verified: TaskAttemptCustodyVerifiedArtifact | null;
  try {
    verified = authority.store.readVerifiedArtifact({
      identity: authority.identity,
      policy: authority.policy,
      artifactClass: 'execution-effect-staged-content',
      artifactKey: key,
      receiptDigest: receiptDigest as Sha256Digest,
    });
  } catch (error) {
    fail('STORE_ARTIFACT_MISMATCH', { key, code: nativeCode(error) });
  }
  if (verified === null || verified.receipt.artifactClass !== 'execution-effect-staged-content'
    || verified.receipt.captureMode !== 'host-authority-publication'
    || verified.receipt.artifactKey !== key
    || verified.receipt.receiptDigest !== receiptDigest
    || verified.receipt.admissionReceiptDigest !== authority.admission.receiptDigest
    || verified.receipt.policyDigest !== authority.policy.policyDigest
    || !sameIdentity(verified.receipt.identity, authority.identity)
    || verified.receipt.artifact.byteLength !== verified.bytes.byteLength
    || verified.receipt.artifact.sha256 !== rawDigest(verified.bytes)
    || (expectedBytes !== undefined
      && !Buffer.from(verified.bytes).equals(Buffer.from(expectedBytes)))) {
    fail('STORE_ARTIFACT_MISMATCH', { key, receiptDigest });
  }
  return verified;
}

function publishStoreChunk(
  authority: AdapterAuthority,
  invocationDigest: ExecutionEffectPersistenceDigest,
  index: number,
  bytes: Uint8Array,
): Readonly<{
  readonly artifactKey: string;
  readonly artifactReceiptDigest: ExecutionEffectPersistenceDigest;
  readonly contentDigest: ExecutionEffectPersistenceDigest;
  readonly byteLength: number;
}> {
  const key = artifactKey(authority, invocationDigest, index);
  let receipt: TaskAttemptCustodyArtifactReceiptV2;
  try {
    receipt = authority.store.publishHostArtifact({
      identity: authority.identity,
      policy: authority.policy,
      admissionReceiptDigest: authority.admission.receiptDigest,
      artifactClass: 'execution-effect-staged-content',
      artifactKey: key,
      capturedAt: validatedTimestamp(authority.clock),
      bytes,
    });
  } catch (error) {
    fail('STORE_ARTIFACT_MISMATCH', { key, code: nativeCode(error) });
  }
  if (receipt.artifactClass !== 'execution-effect-staged-content'
    || receipt.captureMode !== 'host-authority-publication'
    || receipt.artifactKey !== key || !isDigest(receipt.receiptDigest)
    || receipt.admissionReceiptDigest !== authority.admission.receiptDigest
    || receipt.policyDigest !== authority.policy.policyDigest
    || receipt.artifact.byteLength !== bytes.byteLength
    || receipt.artifact.sha256 !== rawDigest(bytes)
    || !sameIdentity(receipt.identity, authority.identity)) {
    fail('STORE_ARTIFACT_MISMATCH', { key, phase: 'publication' });
  }
  verifiedStoreChunk(authority, key, receipt.receiptDigest, bytes);
  return objectFreeze({
    artifactKey: key,
    artifactReceiptDigest: receipt.receiptDigest,
    contentDigest: rawDigest(bytes),
    byteLength: bytes.byteLength,
  });
}

function validateDockerReceipt(
  value: unknown,
  invocation: ExecutionEffectDockerSourceInvocationV1,
): ExecutionEffectDockerSourceReceiptV1 {
  const receipt = parseDockerReceipt(value);
  if (!receipt) fail('DOCKER_RECEIPT_MISMATCH', 'parse');
  const expected = { ...invocation } as Record<string, unknown>;
  delete expected.destinationFd;
  delete expected.deadlineUnixMs;
  delete expected.maxChunkBytes;
  delete expected.timeoutMs;
  delete expected.receiptMaxBytes;
  delete expected.workspaceOwnerUid;
  delete expected.workspaceOwnerGid;
  const actual = { ...receipt } as Record<string, unknown>;
  delete actual.sourceObjectIdentityDigest;
  delete actual.chunkCount;
  delete actual.receiptDigest;
  if (!sameJson(actual, expected)) fail('DOCKER_RECEIPT_MISMATCH', 'authority');
  return receipt;
}

function safeIngressName(): string {
  return `.deckent-effect-ingress-${randomBytes(24).toString('hex')}`;
}

function fileIdentity(value: ReturnType<typeof fstatSync>): Readonly<{
  readonly dev: string;
  readonly ino: string;
}> {
  return objectFreeze({ dev: String(value.dev), ino: String(value.ino) });
}

function cleanupIngress(
  path: string,
  expected: Readonly<{ readonly dev: string; readonly ino: string }> | null,
): void {
  if (expected === null) return;
  let observed: ReturnType<typeof lstatSync>;
  try {
    observed = lstatSync(path);
  } catch (error) {
    fail('CLEANUP_UNCONFIRMED', { phase: 'lstat', code: nativeCode(error) });
  }
  if (!observed.isFile() || observed.isSymbolicLink() || observed.nlink !== 1
    || String(observed.dev) !== expected.dev || String(observed.ino) !== expected.ino) {
    fail('CLEANUP_UNCONFIRMED', { phase: 'identity' });
  }
  try {
    unlinkSync(path);
  } catch (error) {
    fail('CLEANUP_UNCONFIRMED', { phase: 'unlink', code: nativeCode(error) });
  }
}

function captureIngressToStore(
  authority: AdapterAuthority,
  ingressName: string,
  entry: Extract<ExecutionEffectManifestEntry, { kind: 'regular-file' }>,
  invocationDigest: ExecutionEffectPersistenceDigest,
): readonly ReturnType<typeof publishStoreChunk>[] {
  return withPinnedRoot(
    authority,
    'WORKSPACE',
    authority.hostPrivateStagingRoot,
    authority.stagingRootCallIdentityDigest,
    root => {
      let source: ExecAuthorityNativeEffectHandle | null = null;
      const chunks: ReturnType<typeof publishStoreChunk>[] = [];
      let observedBytes = 0;
      let chunkCount = 0;
      try {
        const opened = authority.native.beginSourceRead(root, {
          deadlineUnixMs: authority.clock.nowUnixMs() + authority.limits.sourceReadTimeoutMs,
          expectedContentDigest: entry.contentDigest,
          expectedMode: 0o600,
          expectedSize: entry.size,
          maxChunkBytes: authority.limits.maxStagedChunkBytes,
          path: ingressName,
        });
        source = opened.handle;
        for (;;) {
          const chunk = authority.native.nextSourceChunk(source, 'ACTIVE');
          if (chunk.index !== chunkCount || chunk.byteOffset !== observedBytes
            || chunk.byteLength !== chunk.bytes.byteLength
            || chunk.byteLength > authority.limits.maxStagedChunkBytes
            || chunk.contentDigest !== rawDigest(chunk.bytes)) {
            fail('SOURCE_CHANGED', { phase: 'host-ingress-chunk', index: chunkCount });
          }
          chunks.push(publishStoreChunk(authority, invocationDigest, chunkCount, chunk.bytes));
          observedBytes += chunk.byteLength;
          chunkCount += 1;
          if (observedBytes === entry.size) break;
          if (observedBytes > entry.size) fail('SOURCE_CHANGED', 'host-ingress-overflow');
        }
        const verified = authority.native.finishSourceRead(source);
        if (verified.observedBytes !== entry.size || verified.contentDigest !== entry.contentDigest
          || verified.chunkCount !== chunkCount || !isDigest(verified.sourceObjectIdentityDigest)) {
          fail('SOURCE_CHANGED', 'host-ingress-final');
        }
        closeNative(authority.native, source);
        source = null;
        return objectFreeze(chunks);
      } catch (error) {
        if (error instanceof ExecutionEffectNativeAdapterHold) throw error;
        fail('SOURCE_CHANGED', { phase: 'host-ingress-read', code: nativeCode(error) });
      } finally {
        closeNative(authority.native, source);
      }
    },
  );
}

function stageRequestSnapshot(
  authority: AdapterAuthority,
  input: Readonly<{
    readonly path: string;
    readonly entry: ExecutionEffectManifestEntry;
    readonly workspaceIdentityDigest: string;
    readonly landingIntentDigest: string;
  }>,
): Readonly<{
  readonly path: string;
  readonly entry: Extract<ExecutionEffectManifestEntry, { kind: 'regular-file' }>;
  readonly workspaceIdentityDigest: ExecutionEffectPersistenceDigest;
  readonly landingIntentDigest: ExecutionEffectPersistenceDigest;
  readonly requestDigest: ExecutionEffectPersistenceDigest;
}> {
  if (!exactDataObject(input, [
    'path', 'entry', 'workspaceIdentityDigest', 'landingIntentDigest',
  ]) || !safeRelativePath(input.path) || input.path === '.'
    || !isDigest(input.workspaceIdentityDigest) || !isDigest(input.landingIntentDigest)
    || input.workspaceIdentityDigest !== executionEffectWorkspaceAuthorityDigestV1(
      authority.workspaceSnapshot.workspaceIdentity,
    )) {
    fail('AUTHORITY_MISMATCH', 'stage-source-input');
  }
  if (!exactDataObject(input.entry, ['path', 'kind', 'mode', 'size', 'contentDigest'])
    || input.entry.kind !== 'regular-file' || input.entry.path !== input.path
    || !Number.isSafeInteger(input.entry.mode) || input.entry.mode < 0 || input.entry.mode > 0o777
    || !Number.isSafeInteger(input.entry.size) || input.entry.size < 0
    || input.entry.size > MAX_SOURCE_BYTES || !isDigest(input.entry.contentDigest)) {
    fail('AUTHORITY_MISMATCH', 'stage-source-entry');
  }
  const entry = objectFreeze({
    path: input.entry.path,
    kind: 'regular-file' as const,
    mode: input.entry.mode,
    size: input.entry.size,
    contentDigest: input.entry.contentDigest,
  });
  const body = objectFreeze({
    path: input.path,
    entry,
    workspaceIdentityDigest: input.workspaceIdentityDigest,
    landingIntentDigest: input.landingIntentDigest,
  });
  const request = objectFreeze({
    ...body,
    workspaceIdentityDigest: body.workspaceIdentityDigest as ExecutionEffectPersistenceDigest,
    landingIntentDigest: body.landingIntentDigest as ExecutionEffectPersistenceDigest,
    requestDigest: digest('execution-effect-native-stage-request-v1', body),
  });
  if (!authority.sourceAuthorities.some(source => source.path === request.path
    && source.landingIntentDigest === request.landingIntentDigest
    && sameJson(source.entry, request.entry))) {
    fail('AUTHORITY_MISMATCH', 'source-not-admitted');
  }
  return request;
}

async function captureStageSource(
  authority: AdapterAuthority,
  input: Readonly<{
    readonly path: string;
    readonly entry: ExecutionEffectManifestEntry;
    readonly workspaceIdentityDigest: string;
    readonly landingIntentDigest: string;
  }>,
): Promise<ExecutionEffectLandingStagedSourceV1> {
  const request = stageRequestSnapshot(authority, input);
  const entry = request.entry;
  const now = authority.clock.nowUnixMs();
  const deadlineUnixMs = now + authority.limits.sourceReadTimeoutMs;
  if (!Number.isSafeInteger(deadlineUnixMs)) fail('AUTHORITY_MISMATCH', 'source-deadline');
  const source = sourceInvocationBody(
    authority,
    request.path,
    entry,
    request.landingIntentDigest,
    deadlineUnixMs,
  );
  const ingressName = safeIngressName();
  const ingressPath = join(authority.hostPrivateStagingRoot, ingressName);
  let fd = -1;
  let ingressIdentity: Readonly<{ readonly dev: string; readonly ino: string }> | null = null;
  let receipt: ExecutionEffectDockerSourceReceiptV1;
  let chunks: readonly ReturnType<typeof publishStoreChunk>[];
  try {
    fd = openSync(
      ingressPath,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_RDWR | fsConstants.O_NOFOLLOW,
      0o600,
    );
    const before = fstatSync(fd);
    ingressIdentity = fileIdentity(before);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size !== 0) {
      fail('ROOT_IDENTITY_MISMATCH', 'ingress-create');
    }
    const invocation = objectFreeze({
      ...source,
      destinationFd: fd,
      timeoutMs: authority.limits.dockerTimeoutMs,
      receiptMaxBytes: authority.limits.dockerReceiptMaxBytes,
    });
    let rawReceipt: unknown;
    try {
      rawReceipt = await authority.docker.execute(invocation);
    } catch (error) {
      if (error instanceof ExecutionEffectNativeAdapterHold) throw error;
      fail('DOCKER_SOURCE_UNAVAILABLE', { code: nativeCode(error) });
    }
    receipt = validateDockerReceipt(rawReceipt, invocation);
    const after = fstatSync(fd);
    if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1
      || after.size !== entry.size || fileIdentity(after).dev !== ingressIdentity.dev
      || fileIdentity(after).ino !== ingressIdentity.ino) {
      fail('SOURCE_CHANGED', 'docker-ingress-identity');
    }
    closeSync(fd);
    fd = -1;
    chunks = captureIngressToStore(authority, ingressName, entry, source.invocationDigest);
  } catch (error) {
    if (error instanceof ExecutionEffectNativeAdapterHold) throw error;
    fail('SOURCE_CHANGED', { phase: 'stage-source', code: nativeCode(error) });
  } finally {
    if (fd >= 0) {
      try {
        closeSync(fd);
      } catch (error) {
        fail('CLEANUP_UNCONFIRMED', { phase: 'close-ingress', code: nativeCode(error) });
      }
    }
    cleanupIngress(ingressPath, ingressIdentity);
  }
  if (receipt.byteLength !== entry.size || receipt.contentDigest !== entry.contentDigest
    || receipt.path !== entry.path || receipt.mode !== entry.mode
    || !isDigest(receipt.sourceObjectIdentityDigest) || receipt.chunkCount < 1) {
    fail('DOCKER_RECEIPT_MISMATCH', 'source-result');
  }
  const seal = createExecutionEffectStagedSourceSealV1({
    path: entry.path,
    byteLength: entry.size,
    contentDigest: entry.contentDigest as ExecutionEffectPersistenceDigest,
    workspaceIdentityDigest: executionEffectWorkspaceAuthorityDigestV1(
      authority.workspaceSnapshot.workspaceIdentity,
    ),
    attemptDigest: authority.workspaceSnapshot.attemptDigest,
    admissionReceiptDigest: authority.admission.receiptDigest,
    custodyPolicyDigest: authority.policy.policyDigest,
    landingIntentDigest: request.landingIntentDigest,
    chunks,
  });
  const landingChunks = seal.chunks.map(chunk => createExecutionEffectLandingStagedChunkV1({
    index: chunk.index,
    byteOffset: chunk.byteOffset,
    byteLength: chunk.byteLength,
    artifactKey: chunk.artifactKey,
    contentDigest: chunk.contentDigest,
    artifactReceiptDigest: chunk.artifactReceiptDigest,
  }));
  const staged = createExecutionEffectLandingStagedSourceV1({
    path: seal.path,
    byteLength: seal.byteLength,
    contentDigest: seal.contentDigest,
    workspaceIdentityDigest: seal.workspaceIdentityDigest,
    attemptDigest: seal.attemptDigest,
    admissionReceiptDigest: seal.admissionReceiptDigest,
    custodyPolicyDigest: seal.custodyPolicyDigest,
    landingIntentDigest: seal.landingIntentDigest,
    chunks: objectFreeze(landingChunks),
  });
  if (staged.stageAuthorityDigest !== seal.stageAuthorityDigest) {
    fail('STORE_ARTIFACT_MISMATCH', 'stage-authority-drift');
  }
  return staged;
}

function sourceSeal(
  authority: AdapterAuthority,
  source: ExecutionEffectLandingStagedSourceV1,
): ReturnType<typeof createExecutionEffectStagedSourceSealV1> | null {
  try {
    const seal = createExecutionEffectStagedSourceSealV1({
      path: source.path,
      byteLength: source.byteLength,
      contentDigest: source.contentDigest as ExecutionEffectPersistenceDigest,
      workspaceIdentityDigest: source.workspaceIdentityDigest as ExecutionEffectPersistenceDigest,
      attemptDigest: source.attemptDigest as ExecutionEffectPersistenceDigest,
      admissionReceiptDigest: source.admissionReceiptDigest as ExecutionEffectPersistenceDigest,
      custodyPolicyDigest: source.custodyPolicyDigest as ExecutionEffectPersistenceDigest,
      landingIntentDigest: source.landingIntentDigest as ExecutionEffectPersistenceDigest,
      chunks: source.chunks.map(chunk => ({
        byteLength: chunk.byteLength,
        artifactKey: chunk.artifactKey,
        artifactReceiptDigest: chunk.artifactReceiptDigest as ExecutionEffectPersistenceDigest,
        contentDigest: chunk.contentDigest as ExecutionEffectPersistenceDigest,
      })),
    });
    if (seal.stageAuthorityDigest !== source.stageAuthorityDigest
      || seal.workspaceIdentityDigest !== executionEffectWorkspaceAuthorityDigestV1(
        authority.workspaceSnapshot.workspaceIdentity,
      )
      || seal.attemptDigest !== authority.workspaceSnapshot.attemptDigest
      || seal.admissionReceiptDigest !== authority.admission.receiptDigest
      || seal.custodyPolicyDigest !== authority.policy.policyDigest) return null;
    return parseStagedSource(seal);
  } catch {
    return null;
  }
}

function verifyStagedSource(
  authority: AdapterAuthority,
  source: ExecutionEffectLandingStagedSourceV1,
): boolean {
  const seal = sourceSeal(authority, source);
  if (!seal || seal.chunks.length > EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS) return false;
  const whole = createHash('sha256');
  let observed = 0;
  try {
    for (const chunk of seal.chunks) {
      if (chunk.byteLength > authority.limits.maxStagedChunkBytes) return false;
      const verified = verifiedStoreChunk(
        authority,
        chunk.artifactKey,
        chunk.artifactReceiptDigest,
      );
      if (verified.bytes.byteLength !== chunk.byteLength
        || rawDigest(verified.bytes) !== chunk.contentDigest) return false;
      whole.update(verified.bytes);
      observed += verified.bytes.byteLength;
      if (!Number.isSafeInteger(observed) || observed > seal.byteLength) return false;
    }
  } catch {
    return false;
  }
  return observed === seal.byteLength && `sha256:${whole.digest('hex')}` === seal.contentDigest;
}

function deepFreezeData(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const entry of value) deepFreezeData(entry);
    return objectFreeze(value);
  }
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreezeData(entry);
    return objectFreeze(value);
  }
  return value;
}

function dataClone<T>(value: T): T | null {
  if (!safeDataTree(value)) return null;
  try {
    return deepFreezeData(JSON.parse(canonicalJson(value))) as T;
  } catch {
    return null;
  }
}

function operationSnapshot(
  authority: AdapterAuthority,
  value: ExecutionEffectLandingOperationV1,
): ExecutionEffectLandingOperationV1 | null {
  const operation = dataClone(value);
  if (!operation || !exactDataObject(operation, [
    'version', 'index', 'kind', 'path', 'effectDigests', 'derivedParent', 'stagedSource',
    'entryPreimages', 'entryPostimages', 'parentAuthorities', 'operationDigest',
  ]) || operation.version !== 1 || !Number.isSafeInteger(operation.index)
    || operation.index < 0 || operation.index >= authority.limits.maxOperations
    || !safeRelativePath(operation.path) || operation.path === '.'
    || !isDigest(operation.operationDigest) || !Array.isArray(operation.effectDigests)
    || !Array.isArray(operation.entryPreimages) || operation.entryPreimages.length !== 1
    || !Array.isArray(operation.entryPostimages) || operation.entryPostimages.length !== 1
    || !Array.isArray(operation.parentAuthorities) || operation.parentAuthorities.length !== 1
    || operation.entryPreimages[0]?.path !== operation.path
    || operation.entryPostimages[0]?.path !== operation.path) return null;
  if (operation.stagedSource !== null && sourceSeal(authority, operation.stagedSource) === null) {
    return null;
  }
  let recomputed: string;
  try {
    recomputed = executionEffectLandingOperationDigestV1({
      version: operation.version,
      index: operation.index,
      kind: operation.kind,
      path: operation.path,
      effectDigests: operation.effectDigests,
      derivedParent: operation.derivedParent,
      stagedSource: operation.stagedSource === null ? null : {
        stageAuthorityDigest: operation.stagedSource.stageAuthorityDigest,
      },
      entryPreimages: operation.entryPreimages,
      entryPostimages: operation.entryPostimages,
      parentAuthorities: operation.parentAuthorities,
    });
  } catch {
    return null;
  }
  return recomputed === operation.operationDigest ? operation : null;
}

function digestBytes(value: string | null): Buffer {
  if (value === null) return Buffer.alloc(32);
  if (!isDigest(value)) fail('AUTHORITY_MISMATCH', 'binary-digest');
  return Buffer.from(value.slice(7), 'hex');
}

function entryKind(
  state: { readonly state: 'ABSENT' } | { readonly state: 'PRESENT'; readonly entry: ExecutionEffectManifestEntry },
): 0 | 1 | 2 {
  if (state.state === 'ABSENT') return 0;
  return state.entry.kind === 'directory' ? 1 : 2;
}

function entryMode(
  state: { readonly state: 'ABSENT' } | { readonly state: 'PRESENT'; readonly entry: ExecutionEffectManifestEntry },
): number {
  return state.state === 'ABSENT' ? 0 : state.entry.mode;
}

function entrySize(
  state: { readonly state: 'ABSENT' } | { readonly state: 'PRESENT'; readonly entry: ExecutionEffectManifestEntry },
): number {
  return state.state === 'PRESENT' && state.entry.kind === 'regular-file' ? state.entry.size : 0;
}

function entryContentDigest(
  state: { readonly state: 'ABSENT' } | { readonly state: 'PRESENT'; readonly entry: ExecutionEffectManifestEntry },
): string | null {
  return state.state === 'PRESENT' && state.entry.kind === 'regular-file'
    ? state.entry.contentDigest : null;
}

function parentIdentityDigest(
  operation: ExecutionEffectLandingOperationV1,
  dependencies: readonly ExecutionEffectLandingNativeMutationReceiptV1[],
): ExecutionEffectPersistenceDigest {
  const parent = operation.parentAuthorities[0]!;
  if (parent.source === 'PREPARED_PREIMAGE') {
    if (parent.entry.state !== 'PRESENT') fail('AUTHORITY_MISMATCH', 'parent-preimage');
    return parent.entry.objectIdentityDigest as ExecutionEffectPersistenceDigest;
  }
  const dependency = dependencies[parent.operationIndex];
  if (!dependency || dependency.operationDigest !== parent.operationDigest
    || dependencies.filter(receipt => receipt.operationDigest === parent.operationDigest).length !== 1) {
    fail('AUTHORITY_MISMATCH', 'parent-dependency');
  }
  const state = dependency.entryPostimages.find(post => post.path === parent.path)?.entry;
  if (!state || state.state !== 'PRESENT' || state.entry.kind !== 'directory') {
    fail('AUTHORITY_MISMATCH', 'parent-postimage');
  }
  return state.objectIdentityDigest as ExecutionEffectPersistenceDigest;
}

function operationEnvelope(
  operation: ExecutionEffectLandingOperationV1,
  dependencies: readonly ExecutionEffectLandingNativeMutationReceiptV1[],
): Uint8Array {
  const pre = operation.entryPreimages[0]!.entry;
  const post = operation.entryPostimages[0]!.entry;
  const path = Buffer.from(operation.path, 'utf8');
  if (path.byteLength === 0 || path.byteLength > 16 * 1024) {
    fail('AUTHORITY_MISMATCH', 'operation-path');
  }
  const result = Buffer.alloc(200 + path.byteLength);
  result.write('DEE2', 0, 'ascii');
  result[4] = 1;
  result[5] = ({ ADD_DIRECTORY: 1, ADD: 2, REPLACE: 3, DELETE: 4, MODE: 5 } as const)[operation.kind];
  result[6] = entryKind(pre);
  result[7] = entryKind(post);
  result.writeUInt32BE(entryMode(pre), 8);
  result.writeUInt32BE(entryMode(post), 12);
  result.writeUInt32BE(path.byteLength, 16);
  result.writeUInt32BE(0, 20);
  result.writeBigUInt64BE(BigInt(entrySize(pre)), 24);
  result.writeBigUInt64BE(BigInt(entrySize(post)), 32);
  digestBytes(operation.operationDigest).copy(result, 40);
  digestBytes(parentIdentityDigest(operation, dependencies)).copy(result, 72);
  digestBytes(pre.state === 'PRESENT' ? pre.objectIdentityDigest : null).copy(result, 104);
  digestBytes(entryContentDigest(pre)).copy(result, 136);
  digestBytes(entryContentDigest(post)).copy(result, 168);
  path.copy(result, 200);
  return result;
}

function planEnvelope(
  operations: readonly ExecutionEffectLandingOperationV1[],
  dependenciesByIndex: readonly (readonly ExecutionEffectLandingNativeMutationReceiptV1[])[],
  maxBytes: number,
): Uint8Array {
  if (operations.length === 0 || operations.length > EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS
    || dependenciesByIndex.length !== operations.length) fail('AUTHORITY_MISMATCH', 'plan-cardinality');
  const envelopes = operations.map((operation, index) =>
    operationEnvelope(operation, dependenciesByIndex[index]!));
  const total = 12 + envelopes.reduce((sum, envelope) => sum + 4 + envelope.byteLength, 0);
  if (!Number.isSafeInteger(total) || total > maxBytes) fail('AUTHORITY_MISMATCH', 'plan-size');
  const result = Buffer.alloc(total);
  result.write('DEP2', 0, 'ascii');
  result.writeUInt32BE(1, 4);
  result.writeUInt32BE(envelopes.length, 8);
  let offset = 12;
  for (const envelope of envelopes) {
    result.writeUInt32BE(envelope.byteLength, offset);
    offset += 4;
    Buffer.from(envelope).copy(result, offset);
    offset += envelope.byteLength;
  }
  return result;
}

function dependencySnapshot(
  values: readonly ExecutionEffectLandingNativeMutationReceiptV1[],
): readonly ExecutionEffectLandingNativeMutationReceiptV1[] | null {
  const cloned = dataClone(values);
  if (!cloned || !Array.isArray(cloned) || cloned.length > EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS
    || new Set(cloned.map(item => item.receiptDigest)).size !== cloned.length
    || cloned.some(item => !isDigest(item.receiptDigest) || !isDigest(item.operationDigest))) return null;
  return cloned;
}

function withNativeStage<TResult>(
  authority: AdapterAuthority,
  source: ExecutionEffectLandingStagedSourceV1 | null,
  action: (
    handle: ExecAuthorityNativeEffectHandle | null,
    nativeStagingObjectIdentityDigest: ExecutionEffectPersistenceDigest | null,
  ) => TResult,
): TResult {
  if (source === null) return action(null, null);
  const seal = sourceSeal(authority, source);
  if (!seal || !verifyStagedSource(authority, source)) {
    fail('STORE_ARTIFACT_MISMATCH', 'stage-reverify');
  }
  return withPinnedRoot(
    authority,
    'STAGING',
    authority.hostPrivateStagingRoot,
    authority.stagingRootCallIdentityDigest,
    stagingRoot => {
      let stage: ExecAuthorityNativeEffectHandle | null = null;
      try {
        const opened = authority.native.beginStage(stagingRoot, seal.byteLength, seal.contentDigest);
        stage = opened.handle;
        if (!isDigest(opened.nativeStagingObjectIdentityDigest)) {
          fail('NATIVE_CONTRACT_MISMATCH', 'stage-open');
        }
        let observed = 0;
        for (const chunk of seal.chunks) {
          const verified = verifiedStoreChunk(
            authority,
            chunk.artifactKey,
            chunk.artifactReceiptDigest,
          );
          const appended = authority.native.appendStage(stage, verified.bytes);
          observed += verified.bytes.byteLength;
          if (appended.observedBytes !== observed) fail('NATIVE_CONTRACT_MISMATCH', 'stage-append');
        }
        const sealed = authority.native.sealStage(stage);
        if (sealed.contentDigest !== seal.contentDigest
          || sealed.nativeStagingObjectIdentityDigest !== opened.nativeStagingObjectIdentityDigest) {
          fail('NATIVE_CONTRACT_MISMATCH', 'stage-seal');
        }
        return action(
          stage,
          sealed.nativeStagingObjectIdentityDigest as ExecutionEffectPersistenceDigest,
        );
      } catch (error) {
        if (error instanceof ExecutionEffectNativeAdapterHold) throw error;
        fail('NATIVE_EFFECT_UNCERTAIN', { phase: 'rematerialize', code: nativeCode(error) });
      } finally {
        closeNative(authority.native, stage);
      }
    },
  );
}

function postimages(
  authority: AdapterAuthority,
  root: ExecAuthorityNativeEffectHandle,
  operation: ExecutionEffectLandingOperationV1,
): readonly ExecutionEffectLandingPathStateV1[] {
  return objectFreeze(operation.entryPostimages.map(expected => objectFreeze({
    path: expected.path,
    entry: inspectNativeEntry(authority, root, expected.path),
  })));
}

function validateNativePostimageDigest(
  value: string | null,
  observed: readonly ExecutionEffectLandingPathStateV1[],
): boolean {
  if (observed.length !== 1) return false;
  const entry = observed[0]!.entry;
  return entry.state === 'ABSENT'
    ? value === 'ABSENT'
    : value === entry.objectIdentityDigest;
}

function nativeMutationReceipt(
  authority: AdapterAuthority,
  operation: ExecutionEffectLandingOperationV1,
  dependencies: readonly ExecutionEffectLandingNativeMutationReceiptV1[],
  reconcile: boolean,
): ExecutionEffectLandingNativeMutationReceiptV1 | { readonly state: 'NOT_APPLIED' } {
  const envelope = operationEnvelope(operation, dependencies);
  return withNativeStage(authority, operation.stagedSource, (stage, stageIdentity) =>
    withPinnedRoot(
      authority,
      'PROJECT',
      authority.canonicalProjectRoot,
      authority.projectRootIdentityDigest,
      projectRoot => {
        let mutation;
        try {
          mutation = reconcile
            ? authority.native.reconcileOperation(projectRoot, envelope, stage)
            : authority.native.applyOperation(projectRoot, envelope, stage);
        } catch (error) {
          if (reconcile && nativeCode(error) === 'E_EXEC_AUTH_EFFECT_RECONCILE_AMBIGUOUS') {
            fail('NATIVE_EFFECT_UNCERTAIN', {
              phase: 'reconcile-ambiguous', operationDigest: operation.operationDigest,
            });
          }
          fail('NATIVE_EFFECT_UNCERTAIN', {
            phase: reconcile ? 'reconcile' : 'apply', code: nativeCode(error),
          });
        }
        if (mutation.operationDigest !== operation.operationDigest
          || !isDigest(mutation.durabilityEvidenceDigest)) {
          fail('NATIVE_CONTRACT_MISMATCH', 'mutation-receipt');
        }
        if (mutation.state === 'NOT_APPLIED') {
          if (!reconcile || mutation.postimageDigest !== null) {
            fail('NATIVE_CONTRACT_MISMATCH', 'not-applied');
          }
          return objectFreeze({ state: 'NOT_APPLIED' as const });
        }
        const observed = postimages(authority, projectRoot, operation);
        if (!validateNativePostimageDigest(mutation.postimageDigest, observed)) {
          fail('NATIVE_CONTRACT_MISMATCH', 'native-postimage');
        }
        const durabilityEvidenceDigest = digest('execution-effect-native-mutation-evidence-v1', {
          operationDigest: operation.operationDigest,
          operationEnvelopeDigest: rawDigest(envelope),
          dependencyReceiptDigests: dependencies.map(item => item.receiptDigest),
          nativeDurabilityEvidenceDigest: mutation.durabilityEvidenceDigest,
          nativePostimageDigest: mutation.postimageDigest,
          nativeStagingObjectIdentityDigest: stageIdentity,
          stagedSourceAuthorityDigest: operation.stagedSource?.stageAuthorityDigest ?? null,
        });
        return createExecutionEffectLandingNativeMutationReceiptV1({
          operation,
          entryPostimages: observed,
          durabilityEvidenceDigest,
        });
      },
    ));
}

function applyOperation(
  authority: AdapterAuthority,
  input: Readonly<{
    readonly operation: ExecutionEffectLandingOperationV1;
    readonly dependencyReceipts: readonly ExecutionEffectLandingNativeMutationReceiptV1[];
  }>,
): ExecutionEffectLandingNativeMutationReceiptV1 {
  if (!exactDataObject(input, ['operation', 'dependencyReceipts'])) {
    fail('AUTHORITY_MISMATCH', 'apply-input');
  }
  const operation = operationSnapshot(authority, input.operation);
  const dependencies = dependencySnapshot(input.dependencyReceipts);
  if (!operation || !dependencies) fail('AUTHORITY_MISMATCH', 'apply-authority');
  const result = nativeMutationReceipt(authority, operation, dependencies, false);
  if (result.state === 'NOT_APPLIED') fail('NATIVE_CONTRACT_MISMATCH', 'apply-not-applied');
  return result;
}

function reconcileOperation(
  authority: AdapterAuthority,
  input: Readonly<{
    readonly operation: ExecutionEffectLandingOperationV1;
    readonly dependencyReceipts: readonly ExecutionEffectLandingNativeMutationReceiptV1[];
  }>,
): ExecutionEffectLandingNativeReconcileResultV1 {
  if (!exactDataObject(input, ['operation', 'dependencyReceipts'])) {
    fail('AUTHORITY_MISMATCH', 'reconcile-input');
  }
  const operation = operationSnapshot(authority, input.operation);
  const dependencies = dependencySnapshot(input.dependencyReceipts);
  if (!operation || !dependencies) fail('AUTHORITY_MISMATCH', 'reconcile-authority');
  try {
    const result = nativeMutationReceipt(authority, operation, dependencies, true);
    return result.state === 'NOT_APPLIED'
      ? result
      : objectFreeze({ state: 'APPLIED' as const, receipt: result });
  } catch (error) {
    if (error instanceof ExecutionEffectNativeAdapterHold
      && error.code === 'NATIVE_EFFECT_UNCERTAIN') {
      return objectFreeze({ state: 'AMBIGUOUS' as const, evidenceDigest: error.evidenceDigest });
    }
    throw error;
  }
}

function verifyTransactionPostimages(
  authority: AdapterAuthority,
  input: Readonly<{
    readonly transaction: ExecutionEffectLandingTransactionRefV1;
    readonly operations: readonly ExecutionEffectLandingOperationV1[];
    readonly operationReceipts: readonly ExecutionEffectLandingNativeMutationReceiptV1[];
  }>,
): ExecutionEffectLandingFinalVerificationReceiptV1 {
  if (!exactDataObject(input, ['transaction', 'operations', 'operationReceipts'])
    || !Array.isArray(input.operations) || !Array.isArray(input.operationReceipts)
    || input.operations.length === 0 || input.operations.length !== input.operationReceipts.length
    || input.operations.length > authority.limits.maxOperations) {
    fail('AUTHORITY_MISMATCH', 'final-input');
  }
  const transaction = parseExecutionEffectLandingTransactionRefV1(input.transaction);
  const operations = input.operations.map(operation => operationSnapshot(authority, operation));
  const receipts = dependencySnapshot(input.operationReceipts);
  if (!transaction || operations.some(operation => operation === null) || !receipts
    || receipts.some((receipt, index) => receipt.operationDigest !== operations[index]!.operationDigest)) {
    fail('AUTHORITY_MISMATCH', 'final-authority');
  }
  const concrete = operations as ExecutionEffectLandingOperationV1[];
  const dependencies = concrete.map((_operation, index) => objectFreeze(receipts.slice(0, index)));
  const envelope = planEnvelope(concrete, dependencies, authority.limits.maxPlanEnvelopeBytes);
  return withPinnedRoot(
    authority,
    'PROJECT',
    authority.canonicalProjectRoot,
    authority.projectRootIdentityDigest,
    projectRoot => {
      let native;
      try {
        native = authority.native.verifyPostimages(projectRoot, envelope);
      } catch (error) {
        fail('NATIVE_EFFECT_UNCERTAIN', { phase: 'verify-postimages', code: nativeCode(error) });
      }
      if (native.verifiedCount !== concrete.length || native.planDigest !== rawDigest(envelope)
        || !isDigest(native.postimageSetDigest)) {
        fail('NATIVE_CONTRACT_MISMATCH', 'final-native-receipt');
      }
      const durabilityEvidenceDigest = digest('execution-effect-native-final-evidence-v1', {
        transactionDigest: transaction.transactionDigest,
        transactionPlanDigest: transaction.planDigest,
        nativePlanEnvelopeDigest: native.planDigest,
        nativePostimageSetDigest: native.postimageSetDigest,
        operationReceiptDigests: receipts.map(receipt => receipt.receiptDigest),
        projectRootIdentityDigest: authority.projectRootIdentityDigest,
      });
      return createExecutionEffectLandingFinalVerificationReceiptV1({
        transaction,
        operations: concrete,
        operationReceipts: receipts,
        durabilityEvidenceDigest,
      });
    },
  );
}

interface DockerWorkspaceCaptureAuthority {
  readonly platform: 'linux' | 'wsl';
  readonly phase: 'baseline' | 'final';
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly filesWrite: readonly string[];
  readonly filesWriteDigest: ExecutionEffectPersistenceDigest;
  readonly workspaceSnapshot: ExecutionEffectWorkspaceSnapshotSealV1;
  readonly workspaceRuntime: ExecutionEffectDockerWorkspaceRuntimeV1;
  readonly clock: ExecutionEffectNativeAdapterClockV1;
  readonly limits: ExecutionEffectCaptureLimits;
  readonly timeoutMs: number;
  readonly receiptMaxBytes: number;
  readonly docker: ExecutionEffectDockerWorkspaceCaptureExecutorV1;
}

function captureLimitsSnapshot(value: unknown): ExecutionEffectCaptureLimits | null {
  if (!exactDataObject(value, [
    'maxEntries', 'maxFileBytes', 'maxTotalBytes', 'maxDepth', 'maxPathBytes',
    'maxNameBytes', 'maxManifestBytes',
  ])) return null;
  const fields = [
    value.maxEntries, value.maxFileBytes, value.maxTotalBytes, value.maxDepth,
    value.maxPathBytes, value.maxNameBytes, value.maxManifestBytes,
  ];
  if (!fields.every(item => Number.isSafeInteger(item) && (item as number) > 0)
    || (value.maxEntries as number) > 1_000_000
    || (value.maxFileBytes as number) > MAX_SOURCE_BYTES
    || (value.maxTotalBytes as number) > 256 * 1024 * 1024 * 1024
    || (value.maxDepth as number) > 256 || (value.maxPathBytes as number) > 16 * 1024
    || (value.maxNameBytes as number) > 255
    || (value.maxManifestBytes as number) > MAX_DOCKER_CAPTURE_BYTES
    || (value.maxFileBytes as number) > (value.maxTotalBytes as number)
    || (value.maxNameBytes as number) > (value.maxPathBytes as number)) return null;
  return objectFreeze({
    maxEntries: value.maxEntries as number,
    maxFileBytes: value.maxFileBytes as number,
    maxTotalBytes: value.maxTotalBytes as number,
    maxDepth: value.maxDepth as number,
    maxPathBytes: value.maxPathBytes as number,
    maxNameBytes: value.maxNameBytes as number,
    maxManifestBytes: value.maxManifestBytes as number,
  });
}

function snapshotDockerWorkspaceCaptureExecutor(
  value: unknown,
): ExecutionEffectDockerWorkspaceCaptureExecutorV1 | null {
  if (!exactDataObject(value, ['execute'])) return null;
  const execute = exactMethod(value, 'execute');
  return execute ? objectFreeze({
    execute: async (input: ExecutionEffectDockerWorkspaceCaptureInvocationV1) =>
      await Promise.resolve(Reflect.apply(execute, undefined, [input])) as ExecutionEffectDockerWorkspaceCaptureExecutorResultV1,
  }) : null;
}

function snapshotDockerWorkspaceCaptureAuthority(
  input: ExecutionEffectDockerWorkspaceCaptureInputV1,
  dependencies: ExecutionEffectDockerWorkspaceCaptureDependenciesV1 | undefined,
): DockerWorkspaceCaptureAuthority {
  if (!exactDataObject(input, [
    'platform', 'phase', 'attempt', 'filesWrite', 'workspaceSnapshot',
    'workspaceRuntime', 'clock', 'limits', 'timeoutMs', 'receiptMaxBytes',
  ])) fail('INVALID_INPUT', 'capture-input-shape');
  if (input.platform === 'darwin' || input.platform === 'win32') {
    fail('PLATFORM_UNSUPPORTED', { platform: input.platform, phase: input.phase });
  }
  if ((input.platform !== 'linux' && input.platform !== 'wsl')
    || (input.phase !== 'baseline' && input.phase !== 'final')) {
    fail('INVALID_INPUT', 'capture-platform-phase');
  }
  const attempt = exactAttempt(input.attempt);
  const workspaceSnapshot = parseExecutionEffectWorkspaceSnapshotSealV1(input.workspaceSnapshot);
  const workspaceRuntime = workspaceSnapshot
    ? runtimeSnapshot(input.workspaceRuntime, workspaceSnapshot) : null;
  const clock = snapshotClock(input.clock);
  const limits = captureLimitsSnapshot(input.limits);
  const filesWrite = dataClone(input.filesWrite);
  const docker = dependencies === undefined
    ? defaultDockerWorkspaceCaptureExecutor()
    : exactDataObject(dependencies, ['docker'])
      ? snapshotDockerWorkspaceCaptureExecutor(dependencies.docker) : null;
  if (!attempt || !workspaceSnapshot || !workspaceRuntime || !clock || !limits
    || !Array.isArray(filesWrite) || !docker
    || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1
    || input.timeoutMs > 3_600_000 || !Number.isSafeInteger(input.receiptMaxBytes)
    || input.receiptMaxBytes < 1_024 || input.receiptMaxBytes > 1_048_576) {
    fail('INVALID_INPUT', 'capture-authority-snapshot');
  }
  const compiled = compileExecutionEffectWritePolicy(filesWrite as readonly string[]);
  if (!compiled.ok || compiled.policy.digest !== workspaceSnapshot.writePolicyDigest
    || !sameAttemptIdentity(attempt, workspaceSnapshot.attempt)
    || workspaceSnapshot.platform !== (input.platform === 'linux' ? 'linux' : 'wsl2-linux')) {
    fail('AUTHORITY_MISMATCH', 'capture-attempt-policy-platform');
  }
  return objectFreeze({
    platform: input.platform,
    phase: input.phase,
    attempt,
    filesWrite: compiled.policy.filesWrite,
    filesWriteDigest: compiled.policy.digest as ExecutionEffectPersistenceDigest,
    workspaceSnapshot,
    workspaceRuntime,
    clock,
    limits,
    timeoutMs: input.timeoutMs,
    receiptMaxBytes: input.receiptMaxBytes,
    docker,
  });
}

function captureInvocationBody(
  authority: DockerWorkspaceCaptureAuthority,
  startedAt: string,
  deadlineAt: string,
  deadlineUnixMs: number,
): DockerWorkspaceCaptureInvocationBodyV1 {
  const withoutDigest = objectFreeze({
    version: 1 as const,
    helperScriptDigest: EXECUTION_EFFECT_DOCKER_WORKSPACE_CAPTURE_HELPER_DIGEST,
    imageReference: authority.workspaceRuntime.imageReference,
    imageDigest: authority.workspaceRuntime.imageDigest,
    volumeName: authority.workspaceRuntime.volumeName,
    volumeIdentityDigest: authority.workspaceRuntime.volumeIdentityDigest,
    mountTarget: authority.workspaceRuntime.mountTarget,
    mountIdentityDigest: authority.workspaceRuntime.mountIdentityDigest,
    workspaceResourceDigest: authority.workspaceRuntime.workspaceResourceDigest,
    workspaceSnapshotSealDigest: authority.workspaceRuntime.workspaceSnapshotSealDigest,
    runtimeManifestDigest: authority.workspaceRuntime.manifestDigest,
    phase: authority.phase,
    attemptDigest: authority.workspaceSnapshot.attemptDigest,
    admissionReceiptDigest: authority.workspaceSnapshot.admissionReceiptDigest,
    custodyPolicyDigest: authority.workspaceSnapshot.custodyPolicyDigest,
    workspaceIdentityDigest: authority.workspaceSnapshot.workspaceIdentityDigest,
    workspaceRootIdentityDigest: authority.workspaceSnapshot.workspaceIdentity.rootHandleEvidenceDigest as ExecutionEffectPersistenceDigest,
    filesWriteDigest: authority.filesWriteDigest,
    limitsDigest: digest('execution-effect-docker-capture-limits-v1', authority.limits),
    startedAt,
    deadlineAt,
    deadlineUnixMs,
    limits: authority.limits,
  });
  return objectFreeze({
    ...withoutDigest,
    invocationDigest: digest('execution-effect-docker-workspace-capture-invocation-v1', withoutDigest),
  });
}

function validateDockerWorkspaceCaptureReceipt(
  value: unknown,
  invocation: DockerWorkspaceCaptureInvocationBodyV1,
  payloadBytes: Uint8Array,
  rootEntry: ExecutionEffectNativeCaptureEntryV1,
  nativeCapture: ExecutionEffectNativeCaptureTreeV1,
): ExecutionEffectDockerWorkspaceCaptureReceiptV1 {
  const receipt = parseDockerWorkspaceCaptureReceipt(value);
  if (!receipt) fail('DOCKER_RECEIPT_MISMATCH', 'capture-receipt-parse');
  const expected = {
    ...invocation,
    kind: 'execution-effect-docker-workspace-capture-receipt',
    state: 'VERIFIED',
  } as Record<string, unknown>;
  delete expected.deadlineUnixMs;
  delete expected.limits;
  const actual = { ...receipt } as Record<string, unknown>;
  for (const key of [
    'payloadDigest', 'payloadByteLength', 'nativeManifestDigest',
    'rootObjectIdentityDigest', 'entryCount', 'totalBytes', 'receiptDigest',
  ]) delete actual[key];
  if (!sameJson(actual, expected)
    || receipt.payloadDigest !== rawDigest(payloadBytes)
    || receipt.payloadByteLength !== payloadBytes.byteLength
    || receipt.nativeManifestDigest !== nativeCapture.manifestDigest
    || receipt.rootObjectIdentityDigest !== rootEntry.objectIdentityDigest
    || receipt.entryCount !== nativeCapture.entryCount
    || receipt.totalBytes !== nativeCapture.totalBytes) {
    fail('DOCKER_RECEIPT_MISMATCH', 'capture-receipt-authority');
  }
  return receipt;
}

export async function captureExecutionEffectDockerWorkspaceManifestV1(
  input: ExecutionEffectDockerWorkspaceCaptureInputV1,
  dependencies?: ExecutionEffectDockerWorkspaceCaptureDependenciesV1,
): Promise<ExecutionEffectDockerWorkspaceCaptureResultV1> {
  try {
    const authority = snapshotDockerWorkspaceCaptureAuthority(input, dependencies);
    const startedAt = authority.clock.nowIso();
    const startedUnixMs = authority.clock.nowUnixMs();
    if (Date.parse(startedAt) !== startedUnixMs) fail('AUTHORITY_MISMATCH', 'capture-clock-start');
    const deadlineUnixMs = startedUnixMs + authority.timeoutMs;
    if (!Number.isSafeInteger(deadlineUnixMs)) fail('AUTHORITY_MISMATCH', 'capture-deadline');
    const deadlineAt = new Date(deadlineUnixMs).toISOString();
    const invocationBody = captureInvocationBody(authority, startedAt, deadlineAt, deadlineUnixMs);
    const invocation = objectFreeze({
      ...invocationBody,
      timeoutMs: authority.timeoutMs,
      outputMaxBytes: MAX_DOCKER_CAPTURE_BYTES,
      receiptMaxBytes: authority.receiptMaxBytes,
    });
    let rawResult: ExecutionEffectDockerWorkspaceCaptureExecutorResultV1;
    try {
      rawResult = await authority.docker.execute(invocation);
    } catch (error) {
      if (error instanceof ExecutionEffectNativeAdapterHold) throw error;
      fail('DOCKER_SOURCE_UNAVAILABLE', { phase: 'capture', code: nativeCode(error) });
    }
    if (!exactDataObject(rawResult, ['payloadBytes', 'receipt'])
      || nodeTypes.isProxy(rawResult.payloadBytes)
      || !(rawResult.payloadBytes instanceof Uint8Array)
      || rawResult.payloadBytes.byteLength < 1
      || rawResult.payloadBytes.byteLength > MAX_DOCKER_CAPTURE_BYTES
      || rawResult.payloadBytes.byteLength > authority.limits.maxManifestBytes) {
      fail('DOCKER_RECEIPT_MISMATCH', 'capture-result-shape');
    }
    const payloadBytes = Buffer.from(rawResult.payloadBytes);
    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(payloadBytes.toString('utf8'));
    } catch {
      fail('DOCKER_RECEIPT_MISMATCH', 'capture-payload-json');
    }
    if (!Buffer.from(canonicalJson(rawPayload), 'utf8').equals(payloadBytes)
      || !exactDataObject(rawPayload, ['rootEntry', 'nativeCapture'])) {
      fail('DOCKER_RECEIPT_MISMATCH', 'capture-payload-canonical');
    }
    const rootEntry = dataClone(rawPayload.rootEntry) as ExecutionEffectNativeCaptureEntryV1 | null;
    const nativeCapture = dataClone(rawPayload.nativeCapture) as ExecutionEffectNativeCaptureTreeV1 | null;
    if (!rootEntry || !nativeCapture) fail('DOCKER_RECEIPT_MISMATCH', 'capture-payload-data');
    const dockerReceipt = validateDockerWorkspaceCaptureReceipt(
      rawResult.receipt,
      invocationBody,
      payloadBytes,
      rootEntry,
      nativeCapture,
    );
    const completedAt = authority.clock.nowIso();
    const completedUnixMs = authority.clock.nowUnixMs();
    if (Date.parse(completedAt) !== completedUnixMs || completedUnixMs < startedUnixMs
      || completedUnixMs > deadlineUnixMs) fail('AUTHORITY_MISMATCH', 'capture-clock-complete');
    const captured: ExecutionEffectManifestCaptureResult =
      createExecutionEffectManifestFromNativeCaptureV1({
        phase: authority.phase,
        attempt: authority.attempt,
        filesWrite: authority.filesWrite,
        platform: authority.platform === 'linux' ? 'linux' : 'wsl2-linux',
        workspaceIdentity: authority.workspaceSnapshot.workspaceIdentity,
        rootEntry,
        nativeCapture,
        startedAt,
        completedAt,
        deadlineAt,
        limits: authority.limits,
      });
    if (!captured.ok) fail('NATIVE_CONTRACT_MISMATCH', { holds: captured.holds });
    const expectedManifestDigest = authority.phase === 'baseline'
      ? authority.workspaceSnapshot.workspaceResource.baselineManifestDigest
      : authority.workspaceRuntime.manifestDigest;
    if (captured.manifest.digest !== expectedManifestDigest) {
      fail('AUTHORITY_MISMATCH', {
        phase: authority.phase,
        expectedManifestDigest,
        observedManifestDigest: captured.manifest.digest,
      });
    }
    return objectFreeze({ state: 'VERIFIED' as const, manifest: captured.manifest, dockerReceipt });
  } catch (error) {
    if (error instanceof ExecutionEffectNativeAdapterHold) {
      return objectFreeze({
        state: 'HOLD' as const,
        code: error.code,
        evidenceDigest: error.evidenceDigest,
      });
    }
    return objectFreeze({
      state: 'HOLD' as const,
      code: 'INVALID_INPUT' as const,
      evidenceDigest: digest('execution-effect-native-adapter-hold-v1', {
        code: 'INVALID_INPUT', evidence: 'unclassified-capture-failure',
      }),
    });
  }
}

export async function createExecutionEffectLandingNativeAdapterV1(
  input: ExecutionEffectNativeAdapterFactoryInputV1,
  dependencies?: ExecutionEffectNativeAdapterDependenciesV1,
): Promise<ExecutionEffectNativeAdapterFactoryResultV1> {
  try {
    const authority = snapshotFactoryAuthority(input, dependencies);
    const capability = createExecutionEffectLandingNativeCapabilityV1({
      adapterId: ADAPTER_ID,
      platform: authority.platform,
      projectRootIdentityDigest: authority.projectRootIdentityDigest,
      workspaceIdentityDigest: executionEffectWorkspaceAuthorityDigestV1(
        authority.workspaceSnapshot.workspaceIdentity,
      ),
      attemptDigest: authority.workspaceSnapshot.attemptDigest,
      admissionReceiptDigest: authority.admission.receiptDigest,
      custodyPolicyDigest: authority.policy.policyDigest,
      nativeContractDigest: authority.nativeContractDigest,
      stagingRootIdentityDigest: authority.stagingRootIdentityDigest,
      maxStagedChunkBytes: authority.limits.maxStagedChunkBytes,
      maxOperations: authority.limits.maxOperations,
      maxPlanEnvelopeBytes: authority.limits.maxPlanEnvelopeBytes,
    });
    const adapter: ExecutionEffectLandingNativeAdapterV1 = objectFreeze({
      capability,
      inspectProjectEntry(path: string): ExecutionEffectLandingEntryStateV1 {
        if (!safeRelativePath(path)) fail('AUTHORITY_MISMATCH', 'inspect-path');
        return withPinnedRoot(
          authority,
          'PROJECT',
          authority.canonicalProjectRoot,
          authority.projectRootIdentityDigest,
          root => inspectNativeEntry(authority, root, path),
        );
      },
      stageSource: async (
        stageInput: Parameters<ExecutionEffectLandingNativeAdapterV1['stageSource']>[0],
      ) => await captureStageSource(authority, stageInput),
      verifyStagedSource: (
        source: Parameters<ExecutionEffectLandingNativeAdapterV1['verifyStagedSource']>[0],
      ) => verifyStagedSource(authority, source),
      applyOperation: (
        operationInput: Parameters<ExecutionEffectLandingNativeAdapterV1['applyOperation']>[0],
      ) => applyOperation(authority, operationInput),
      reconcileOperation: (
        operationInput: Parameters<ExecutionEffectLandingNativeAdapterV1['reconcileOperation']>[0],
      ) => reconcileOperation(authority, operationInput),
      verifyTransactionPostimages: (
        verifyInput: Parameters<ExecutionEffectLandingNativeAdapterV1['verifyTransactionPostimages']>[0],
      ) => verifyTransactionPostimages(authority, verifyInput),
    });
    return objectFreeze({ state: 'READY' as const, adapter });
  } catch (error) {
    if (error instanceof ExecutionEffectNativeAdapterHold) {
      return objectFreeze({
        state: 'HOLD' as const,
        code: error.code,
        evidenceDigest: error.evidenceDigest,
      });
    }
    const evidenceDigest = digest('execution-effect-native-adapter-hold-v1', {
      code: 'INVALID_INPUT',
      evidence: 'unclassified-factory-failure',
    });
    return objectFreeze({ state: 'HOLD' as const, code: 'INVALID_INPUT', evidenceDigest });
  }
}
