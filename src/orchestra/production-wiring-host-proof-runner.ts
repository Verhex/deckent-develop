import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import {
  PRODUCTION_WIRING_DOCKER_RUNNER_ADAPTER_ID,
  parseProductionWiringHostProofProgram,
  validateProductionWiringHostProofAdapterAdmission,
  type ProductionWiringHostProofPlatform,
  type ProductionWiringHostProofProbe,
  type ProductionWiringHostProofProgramV1,
  type ProductionWiringHostProofTarget,
  type ProductionWiringHostProofVerifierAsset,
} from '../core/production-wiring-host-proof.js';
import { killProcessGroupWithEscalation } from '../core/process-tree-termination.js';
import { canonicalProjectRoot } from '../core/task-result-settlement.js';

export { PRODUCTION_WIRING_DOCKER_RUNNER_ADAPTER_ID } from '../core/production-wiring-host-proof.js';
export const PRODUCTION_WIRING_HOST_PROOF_OUTCOME_VERSION = 1 as const;

const COMMAND_OUTPUT_CEILING = 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;
const CLEANUP_TIMEOUT_MS = 30_000;
const MAX_ASSET_BYTES = 16 * 1024 * 1024;
const MAX_STRUCTURED_OUTPUT_BYTES = 1024 * 1024;


export interface ProductionWiringHostProofAttemptBindingV1 {
  readonly projectRootSha256: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly generation: number;
  readonly acceptedResultChainDigest: `sha256:${string}`;
  readonly effectLandingReceiptDigest: `sha256:${string}`;
  readonly effectLandingChainDigest: `sha256:${string}`;
}

export interface ProductionWiringHostProofCommandInput {
  readonly executable: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly stdoutCeiling: number;
  readonly stderrCeiling: number;
  readonly signal?: AbortSignal;
}

export interface ProductionWiringHostProofCommandResult {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
  readonly error: boolean;
  readonly overflow: boolean;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
}

export type ProductionWiringHostProofCommandRunner = (
  input: ProductionWiringHostProofCommandInput,
) => Promise<ProductionWiringHostProofCommandResult>;

export interface ProductionWiringHostProofTargetObservationV1 {
  readonly probeId: string;
  readonly observationGroupId: string;
  readonly target: ProductionWiringHostProofTarget;
  readonly evidenceRef: string;
}

export interface ProductionWiringHostProofGroupReceiptV1 {
  readonly observationGroupId: string;
  readonly schemaId: string;
  readonly containerName: string;
  readonly imageId: `sha256:${string}`;
  readonly harnessPath: string;
  readonly verifierAssets: readonly Readonly<{
    readonly path: string;
    readonly sha256: `sha256:${string}`;
    readonly byteLength: number;
    readonly role: ProductionWiringHostProofVerifierAsset['role'];
  }>[];
  readonly dockerArgvDigest: `sha256:${string}`;
  readonly exitCode: 0;
  readonly stdoutSha256: `sha256:${string}`;
  readonly stdoutByteLength: number;
  readonly stderrSha256: `sha256:${string}`;
  readonly stderrByteLength: number;
  readonly structuredOutcomeDigest: `sha256:${string}`;
  readonly cleanupAbsenceDigest: `sha256:${string}`;
  readonly groupReceiptDigest: `sha256:${string}`;
}

export interface ProductionWiringHostProofRunReceiptV1 {
  readonly version: typeof PRODUCTION_WIRING_HOST_PROOF_OUTCOME_VERSION;
  readonly kind: 'production-wiring-host-proof-run-v1';
  readonly state: 'observed';
  readonly runnerAdapterId: typeof PRODUCTION_WIRING_DOCKER_RUNNER_ADAPTER_ID;
  readonly platform: ProductionWiringHostProofPlatform;
  readonly programDigest: string;
  readonly attemptBinding: ProductionWiringHostProofAttemptBindingV1;
  readonly taskWriteScopeDigest: `sha256:${string}`;
  readonly groupReceipts: readonly ProductionWiringHostProofGroupReceiptV1[];
  readonly targetObservations: readonly ProductionWiringHostProofTargetObservationV1[];
  readonly proofRunDigest: `sha256:${string}`;
  readonly observedAt: string;
}

export type ProductionWiringHostProofRunDecision =
  | Readonly<{ readonly state: 'observed'; readonly receipt: ProductionWiringHostProofRunReceiptV1 }>
  | Readonly<{ readonly state: 'hold'; readonly reasonCode: string }>;

function isDigest(value: unknown): value is `sha256:${string}` {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

/** Strict parser for the hash-only durable runner evidence embedded by settlement. */
export function parseProductionWiringHostProofRunReceipt(
  value: unknown,
): ProductionWiringHostProofRunReceiptV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, [
    'version', 'kind', 'state', 'runnerAdapterId', 'platform', 'programDigest',
    'attemptBinding', 'taskWriteScopeDigest', 'groupReceipts', 'targetObservations',
    'proofRunDigest', 'observedAt',
  ])
    || record.version !== 1 || record.kind !== 'production-wiring-host-proof-run-v1'
    || record.state !== 'observed'
    || record.runnerAdapterId !== PRODUCTION_WIRING_DOCKER_RUNNER_ADAPTER_ID
    || !['linux', 'wsl2-linux', 'darwin', 'win32'].includes(String(record.platform))
    || typeof record.programDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(record.programDigest)
    || !record.attemptBinding || typeof record.attemptBinding !== 'object'
    || Array.isArray(record.attemptBinding)
    || !isDigest(record.taskWriteScopeDigest)
    || !Array.isArray(record.groupReceipts) || record.groupReceipts.length === 0
    || !Array.isArray(record.targetObservations) || record.targetObservations.length === 0
    || !isDigest(record.proofRunDigest) || !isTimestamp(record.observedAt)) return null;
  const attempt = record.attemptBinding as Record<string, unknown>;
  if (!exactKeys(attempt, [
    'projectRootSha256', 'projectId', 'taskId', 'attemptId', 'generation',
    'acceptedResultChainDigest', 'effectLandingReceiptDigest', 'effectLandingChainDigest',
  ])
    || typeof attempt.projectRootSha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(attempt.projectRootSha256)
    || ![attempt.projectId, attempt.taskId, attempt.attemptId]
      .every(item => typeof item === 'string' && item.length > 0
        && Buffer.byteLength(item, 'utf8') <= 256)
    || !Number.isSafeInteger(attempt.generation) || Number(attempt.generation) < 1
    || !isDigest(attempt.acceptedResultChainDigest)
    || !isDigest(attempt.effectLandingReceiptDigest)
    || !isDigest(attempt.effectLandingChainDigest)) return null;
  const groupIds = new Set<string>();
  const groupDigests = new Map<string, string>();
  for (const candidate of record.groupReceipts) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const group = candidate as Record<string, unknown>;
    if (!exactKeys(group, [
      'observationGroupId', 'schemaId', 'containerName', 'imageId', 'harnessPath',
      'verifierAssets', 'dockerArgvDigest', 'exitCode', 'stdoutSha256',
      'stdoutByteLength', 'stderrSha256', 'stderrByteLength', 'structuredOutcomeDigest',
      'cleanupAbsenceDigest', 'groupReceiptDigest',
    ])
      || typeof group.observationGroupId !== 'string' || group.observationGroupId.length === 0
      || groupIds.has(group.observationGroupId)
      || typeof group.schemaId !== 'string' || group.schemaId.length === 0
      || typeof group.containerName !== 'string' || group.containerName.length === 0
      || !isDigest(group.imageId) || typeof group.harnessPath !== 'string'
      || !Array.isArray(group.verifierAssets) || group.verifierAssets.length === 0
      || !isDigest(group.dockerArgvDigest) || group.exitCode !== 0
      || !isDigest(group.stdoutSha256) || !Number.isSafeInteger(group.stdoutByteLength)
      || Number(group.stdoutByteLength) < 1
      || !isDigest(group.stderrSha256) || !Number.isSafeInteger(group.stderrByteLength)
      || Number(group.stderrByteLength) < 0
      || !isDigest(group.structuredOutcomeDigest) || !isDigest(group.cleanupAbsenceDigest)
      || !isDigest(group.groupReceiptDigest)) return null;
    const body = { ...group };
    delete body.groupReceiptDigest;
    if (sha256Json(body) !== group.groupReceiptDigest) return null;
    for (const assetValue of group.verifierAssets) {
      if (!assetValue || typeof assetValue !== 'object' || Array.isArray(assetValue)) return null;
      const asset = assetValue as Record<string, unknown>;
      if (!exactKeys(asset, ['path', 'sha256', 'byteLength', 'role'])
        || typeof asset.path !== 'string' || !isDigest(asset.sha256)
        || !Number.isSafeInteger(asset.byteLength) || Number(asset.byteLength) < 1
        || (asset.role !== 'trusted-harness' && asset.role !== 'config-authority')) return null;
    }
    groupIds.add(group.observationGroupId);
    groupDigests.set(group.observationGroupId, group.groupReceiptDigest);
  }
  const probeIds = new Set<string>();
  const targetKeys = new Set<string>();
  for (const candidate of record.targetObservations) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const observation = candidate as Record<string, unknown>;
    const target = observation.target;
    if (!exactKeys(observation, [
      'probeId', 'observationGroupId', 'target', 'evidenceRef',
    ])
      || typeof observation.probeId !== 'string' || probeIds.has(observation.probeId)
      || typeof observation.observationGroupId !== 'string'
      || !groupIds.has(observation.observationGroupId)
      || !target || typeof target !== 'object' || Array.isArray(target)
      || !exactKeys(target as Record<string, unknown>, ['kind', 'targetId'])
      || !['producer', 'canonical-consumer', 'affected-ingress', 'enablement-authority', 'proof-target']
        .includes(String((target as Record<string, unknown>).kind))
      || typeof (target as Record<string, unknown>).targetId !== 'string'
      || typeof observation.evidenceRef !== 'string') return null;
    const key = targetKey(target as ProductionWiringHostProofTarget);
    if (targetKeys.has(key)
      || observation.evidenceRef !== `host-proof:${groupDigests.get(observation.observationGroupId)}:${observation.probeId}`) return null;
    probeIds.add(observation.probeId);
    targetKeys.add(key);
  }
  const body = { ...record };
  delete body.proofRunDigest;
  delete body.observedAt;
  if (sha256Json(body) !== record.proofRunDigest) return null;
  try {
    const canonical = canonicalJson(record);
    const parsed = JSON.parse(canonical) as ProductionWiringHostProofRunReceiptV1;
    return Object.freeze(parsed);
  } catch {
    return null;
  }
}

export interface ProductionWiringHostProofRunnerOptions {
  readonly projectRoot: string;
  readonly image: string;
  readonly platform?: NodeJS.Platform;
  readonly isWsl2?: boolean;
  readonly dockerExecutable?: string;
  readonly commandRunner?: ProductionWiringHostProofCommandRunner;
  readonly now?: () => string;
}

interface AssetSnapshot {
  readonly path: string;
  readonly absolutePath: string;
  readonly sha256: `sha256:${string}`;
  readonly byteLength: number;
  readonly role: ProductionWiringHostProofVerifierAsset['role'];
  readonly device: bigint;
  readonly inode: bigint;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Bytes(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function sha256Json(value: unknown): `sha256:${string}` {
  return sha256Bytes(Buffer.from(canonicalJson(value), 'utf8'));
}

export function productionWiringHostProofTaskWriteScopeDigest(scope: Readonly<{
  readonly directories: readonly string[];
  readonly filesWrite: readonly string[];
}>): `sha256:${string}` {
  return sha256Json({
    directories: [...scope.directories].sort(),
    filesWrite: [...scope.filesWrite].sort(),
  });
}

function emptyCommandResult(overrides: Partial<ProductionWiringHostProofCommandResult> = {}):
ProductionWiringHostProofCommandResult {
  return Object.freeze({
    status: null,
    signal: null,
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
    error: true,
    overflow: false,
    timedOut: false,
    cancelled: false,
    ...overrides,
  });
}

/**
 * Host command boundary used by the Docker proof adapter.  It never inherits
 * process.env, never invokes a shell, and always terminates the whole process
 * tree on timeout/cancellation before reporting a terminal observation.
 */
export function runProductionWiringHostProofCommand(
  input: ProductionWiringHostProofCommandInput,
): Promise<ProductionWiringHostProofCommandResult> {
  if (!isAbsolute(input.executable)
    || input.args.length > 512
    || input.args.some(arg => typeof arg !== 'string' || arg.includes('\0')
      || Buffer.byteLength(arg, 'utf8') > 64 * 1024)
    || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1 || input.timeoutMs > 3_600_000
    || !Number.isSafeInteger(input.stdoutCeiling) || input.stdoutCeiling < 0
    || input.stdoutCeiling > 64 * 1024 * 1024
    || !Number.isSafeInteger(input.stderrCeiling) || input.stderrCeiling < 0
    || input.stderrCeiling > 64 * 1024 * 1024) {
    return Promise.resolve(emptyCommandResult());
  }
  if (input.signal?.aborted) {
    return Promise.resolve(emptyCommandResult({ cancelled: true }));
  }
  return new Promise(resolveCommand => {
    let child: ChildProcess;
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let error = false;
    let overflow = false;
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    let terminating = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let terminalFallback: ReturnType<typeof setTimeout> | undefined;
    const finish = (status: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (terminalFallback) clearTimeout(terminalFallback);
      input.signal?.removeEventListener('abort', abort);
      resolveCommand(Object.freeze({
        status,
        signal,
        stdout,
        stderr,
        error,
        overflow,
        timedOut,
        cancelled,
      }));
    };
    const terminate = (): void => {
      error = true;
      if (terminating) return;
      terminating = true;
      killProcessGroupWithEscalation(child, 'SIGTERM', process.platform);
      terminalFallback ??= setTimeout(() => finish(null, null), 5_000);
      terminalFallback.unref?.();
    };
    const abort = (): void => {
      cancelled = true;
      terminate();
    };
    const append = (
      current: Buffer<ArrayBufferLike>, chunk: unknown, ceiling: number,
    ): Buffer<ArrayBufferLike> => {
      const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      const remaining = Math.max(0, ceiling - current.byteLength);
      if (incoming.byteLength > remaining) {
        overflow = true;
        terminate();
      }
      return remaining === 0
        ? current : Buffer.concat([current, incoming.subarray(0, remaining)]);
    };
    try {
      child = nodeSpawn(input.executable, [...input.args], {
        shell: false,
        detached: process.platform !== 'win32',
        windowsHide: true,
        env: Object.freeze({}),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      resolveCommand(emptyCommandResult());
      return;
    }
    child.stdout?.on('data', chunk => { stdout = append(stdout, chunk, input.stdoutCeiling); });
    child.stderr?.on('data', chunk => { stderr = append(stderr, chunk, input.stderrCeiling); });
    child.once('error', () => { error = true; });
    child.once('close', (status, signal) => finish(status, signal));
    input.signal?.addEventListener('abort', abort, { once: true });
    if (input.signal?.aborted) abort();
    timeout = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      terminate();
    }, input.timeoutMs);
    timeout.unref?.();
    if (settled) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  });
}

function supportedPlatform(platform: NodeJS.Platform, isWsl2: boolean):
ProductionWiringHostProofPlatform | null {
  if (platform === 'linux') return isWsl2 ? 'wsl2-linux' : 'linux';
  if (platform === 'darwin' || platform === 'win32') return platform;
  return null;
}

function defaultDockerExecutable(platform: NodeJS.Platform): string | null {
  const candidates = platform === 'win32'
    ? ['C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe']
    : ['/usr/bin/docker', '/usr/local/bin/docker', '/opt/homebrew/bin/docker'];
  return candidates.find(candidate => {
    try { return statSync(candidate).isFile(); } catch { return false; }
  }) ?? null;
}

function isInsideRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function readAssetSnapshot(
  root: string,
  asset: ProductionWiringHostProofVerifierAsset,
): AssetSnapshot | null {
  if (typeof fsConstants.O_NOFOLLOW !== 'number' || fsConstants.O_NOFOLLOW === 0) return null;
  const absolutePath = resolve(root, asset.path);
  if (!isInsideRoot(root, absolutePath)) return null;
  const segments = asset.path.split('/');
  let cursor = root;
  try {
    for (let index = 0; index < segments.length - 1; index += 1) {
      cursor = resolve(cursor, segments[index]!);
      const entry = lstatSync(cursor);
      if (!entry.isDirectory() || entry.isSymbolicLink()) return null;
    }
    const pathEntry = lstatSync(absolutePath);
    if (!pathEntry.isFile() || pathEntry.isSymbolicLink() || pathEntry.nlink !== 1) return null;
    if (realpathSync(absolutePath) !== absolutePath) return null;
  } catch {
    return null;
  }
  let descriptor: number | undefined;
  try {
    descriptor = openSync(absolutePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const entry = fstatSync(descriptor, { bigint: true });
    if (!entry.isFile() || entry.nlink !== 1n || entry.size < 1n
      || entry.size > BigInt(MAX_ASSET_BYTES)) return null;
    const bytes = readFileSync(descriptor);
    const digest = sha256Bytes(bytes);
    if (digest !== asset.sha256 || BigInt(bytes.byteLength) !== entry.size) return null;
    return Object.freeze({
      path: asset.path,
      absolutePath,
      sha256: digest,
      byteLength: bytes.byteLength,
      role: asset.role,
      device: entry.dev,
      inode: entry.ino,
    });
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function sameAssetSnapshot(left: AssetSnapshot, right: AssetSnapshot | null): boolean {
  return right !== null && left.path === right.path && left.sha256 === right.sha256
    && left.byteLength === right.byteLength && left.device === right.device
    && left.inode === right.inode;
}

function commandSucceeded(result: ProductionWiringHostProofCommandResult): boolean {
  return result.status === 0 && result.signal === null && !result.error && !result.overflow
    && !result.timedOut && !result.cancelled;
}

function parseJson(bytes: Uint8Array): unknown | null {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_STRUCTURED_OUTPUT_BYTES) return null;
  try {
    const value = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
    return canonicalJson(value) === Buffer.from(bytes).toString('utf8').trim() ? value : null;
  } catch {
    return null;
  }
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record);
  return actual.length === keys.length && keys.every(key => actual.includes(key));
}

function targetKey(target: ProductionWiringHostProofTarget): string {
  return `${target.kind}:${target.targetId}`;
}

function parseStructuredOutcome(
  bytes: Uint8Array,
  groupId: string,
  schemaId: string,
  targets: readonly ProductionWiringHostProofTarget[],
): Readonly<{ readonly digest: `sha256:${string}` }> | null {
  const value = parseJson(bytes);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const expectedTargets = targets.map(targetKey).sort();
  if (!exactKeys(record, [
    'version', 'kind', 'schemaId', 'observationGroupId', 'outcome', 'targetKeys',
  ])
    || record.version !== 1
    || record.kind !== 'deckent-production-wiring-host-proof-outcome'
    || record.schemaId !== schemaId
    || record.observationGroupId !== groupId
    || record.outcome !== 'observed'
    || !Array.isArray(record.targetKeys)
    || record.targetKeys.some(key => typeof key !== 'string')
    || canonicalJson([...record.targetKeys].sort()) !== canonicalJson(expectedTargets)) return null;
  return Object.freeze({ digest: sha256Json(record) });
}

function parseImageId(bytes: Uint8Array): `sha256:${string}` | null {
  const id = Buffer.from(bytes).toString('utf8').trim();
  return /^sha256:[a-f0-9]{64}$/u.test(id) ? id as `sha256:${string}` : null;
}

function exactDockerAbsence(result: ProductionWiringHostProofCommandResult): boolean {
  if (result.error || result.overflow || result.timedOut || result.cancelled || result.signal !== null
    || result.status !== 1 || result.stdout.byteLength !== 0) return false;
  const stderr = Buffer.from(result.stderr).toString('utf8');
  return /No such (object|container)/u.test(stderr);
}

function groupProbes(probes: readonly ProductionWiringHostProofProbe[]):
ReadonlyMap<string, readonly ProductionWiringHostProofProbe[]> {
  const groups = new Map<string, ProductionWiringHostProofProbe[]>();
  for (const probe of probes) {
    const current = groups.get(probe.observationGroupId) ?? [];
    current.push(probe);
    groups.set(probe.observationGroupId, current);
  }
  return groups;
}

function safeContainerName(input: unknown): string {
  return `deckent-pw-${sha256Json(input).slice('sha256:'.length, 'sha256:'.length + 40)}`;
}

async function inspectAbsent(
  docker: string,
  name: string,
  runner: ProductionWiringHostProofCommandRunner,
  signal?: AbortSignal,
): Promise<ProductionWiringHostProofCommandResult> {
  return runner({
    executable: docker,
    args: ['container', 'inspect', name],
    timeoutMs: COMMAND_TIMEOUT_MS,
    stdoutCeiling: COMMAND_OUTPUT_CEILING,
    stderrCeiling: COMMAND_OUTPUT_CEILING,
    signal,
  });
}

async function removeAndProveAbsent(
  docker: string,
  name: string,
  runner: ProductionWiringHostProofCommandRunner,
): Promise<`sha256:${string}` | null> {
  const removed = await runner({
    executable: docker,
    args: ['container', 'rm', '--force', name],
    timeoutMs: CLEANUP_TIMEOUT_MS,
    stdoutCeiling: COMMAND_OUTPUT_CEILING,
    stderrCeiling: COMMAND_OUTPUT_CEILING,
  });
  if (!commandSucceeded(removed) && !exactDockerAbsence(removed)) return null;
  const absent = await inspectAbsent(docker, name, runner);
  if (!exactDockerAbsence(absent)) return null;
  return sha256Json({
    containerName: name,
    removeStatus: removed.status,
    removeStdoutSha256: sha256Bytes(removed.stdout),
    removeStderrSha256: sha256Bytes(removed.stderr),
    inspectStatus: absent.status,
    inspectStdoutSha256: sha256Bytes(absent.stdout),
    inspectStderrSha256: sha256Bytes(absent.stderr),
    state: 'ABSENT',
  });
}

/**
 * Execute the immutable host-proof program in one hardened Docker container
 * per observation group.  The returned receipt contains hashes and counts,
 * never raw stdout/stderr or ambient environment values.
 */
export async function runProductionWiringHostProof(input: Readonly<{
  readonly program: ProductionWiringHostProofProgramV1;
  readonly attemptBinding: ProductionWiringHostProofAttemptBindingV1;
  readonly taskWriteScope: Readonly<{
    readonly directories: readonly string[];
    readonly filesWrite: readonly string[];
  }>;
  readonly signal?: AbortSignal;
}>, options: ProductionWiringHostProofRunnerOptions): Promise<ProductionWiringHostProofRunDecision> {
  const canonicalProgram = parseProductionWiringHostProofProgram(input.program);
  if (!canonicalProgram || canonicalProgram.executionClass !== 'read-only-idempotent') {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'host-proof-program-invalid' });
  }
  const nodePlatform = options.platform ?? process.platform;
  const matrixPlatform = supportedPlatform(nodePlatform, options.isWsl2 ?? (
    nodePlatform === 'linux'
    && (process.env.WSL_DISTRO_NAME !== undefined || process.env.WSL_INTEROP !== undefined)
  ));
  if (!matrixPlatform) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'platform-unsupported' });
  }
  const platformPlan = canonicalProgram.platforms.find(row => row.platform === matrixPlatform);
  if (!platformPlan || platformPlan.state === 'unsupported') {
    return Object.freeze({
      state: 'hold' as const,
      reasonCode: platformPlan?.state === 'unsupported'
        ? `platform-${platformPlan.reasonCode}` : 'platform-plan-unavailable',
    });
  }
  if (platformPlan.runnerAdapterId !== PRODUCTION_WIRING_DOCKER_RUNNER_ADAPTER_ID) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'runner-adapter-unavailable' });
  }
  if (canonicalProgram.network !== 'forbidden') {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'network-policy-adapter-unavailable' });
  }
  const adapterAdmission = validateProductionWiringHostProofAdapterAdmission(canonicalProgram);
  if (adapterAdmission.state === 'hold') {
    return Object.freeze({ state: 'hold' as const, reasonCode: adapterAdmission.reasonCode });
  }
  let root: string;
  try {
    root = realpathSync(options.projectRoot);
    if (!statSync(root).isDirectory() || root.includes(',') || root.includes('\n')
      || root.includes('\r')) throw new Error('unsafe-docker-mount-source');
  } catch {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'project-root-unavailable' });
  }
  const rootDigest = createHash('sha256').update(canonicalProjectRoot(root)).digest('hex');
  if (rootDigest !== input.attemptBinding.projectRootSha256) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'project-root-authority-mismatch' });
  }
  const docker = options.dockerExecutable ?? defaultDockerExecutable(nodePlatform);
  if (!docker || !isAbsolute(docker)) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'docker-cli-unavailable' });
  }
  const runner = options.commandRunner ?? runProductionWiringHostProofCommand;
  const imageInspect = await runner({
    executable: docker,
    args: ['image', 'inspect', '--format', '{{.Id}}', options.image],
    timeoutMs: COMMAND_TIMEOUT_MS,
    stdoutCeiling: COMMAND_OUTPUT_CEILING,
    stderrCeiling: COMMAND_OUTPUT_CEILING,
    signal: input.signal,
  });
  const imageId = commandSucceeded(imageInspect) ? parseImageId(imageInspect.stdout) : null;
  if (!imageId) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'image-authority-unavailable' });
  }

  const declaredAssetByPath = new Map(canonicalProgram.verifierAssets.map(asset => [asset.path, asset]));
  const initialAssets = new Map<string, AssetSnapshot>();
  const writePaths = [...input.taskWriteScope.filesWrite, ...input.taskWriteScope.directories]
    .map(path => path.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/$/u, ''));
  if (writePaths.some(path => path.length === 0 || path === '..' || path.startsWith('../')
    || path.includes('/../') || isAbsolute(path))) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'task-write-scope-invalid' });
  }
  for (const asset of canonicalProgram.verifierAssets) {
    if (writePaths.some(writePath => {
      const prefix = writePath.endsWith('/**') ? writePath.slice(0, -3) : writePath;
      return asset.path === prefix || asset.path.startsWith(`${prefix}/`);
    })) {
      return Object.freeze({ state: 'hold' as const, reasonCode: 'verifier-asset-write-scope-overlap' });
    }
    const snapshot = readAssetSnapshot(root, asset);
    if (!snapshot) {
      return Object.freeze({ state: 'hold' as const, reasonCode: 'verifier-asset-invalid' });
    }
    initialAssets.set(asset.path, snapshot);
  }

  const groupReceipts: ProductionWiringHostProofGroupReceiptV1[] = [];
  const targetObservations: ProductionWiringHostProofTargetObservationV1[] = [];
  for (const [groupId, probes] of groupProbes(platformPlan.probes)) {
    const representative = probes[0]!;
    const harness = initialAssets.get(representative.harnessPath);
    if (!harness || harness.role !== 'trusted-harness'
      || probes.some(probe => probe.harnessPath !== representative.harnessPath
        || canonicalJson(probe.verifierAssetPaths) !== canonicalJson(representative.verifierAssetPaths)
        || canonicalJson(probe.args) !== canonicalJson(representative.args)
        || probe.cwd !== representative.cwd
        || probe.timeoutMs !== representative.timeoutMs
        || probe.outputLimitBytes !== representative.outputLimitBytes
        || canonicalJson(probe.expectation) !== canonicalJson(representative.expectation))) {
      return Object.freeze({ state: 'hold' as const, reasonCode: 'observation-group-invalid' });
    }
    const groupAssets = representative.verifierAssetPaths.map(path => initialAssets.get(path));
    if (groupAssets.some(asset => !asset)) {
      return Object.freeze({ state: 'hold' as const, reasonCode: 'verifier-asset-unbound' });
    }
    const cwd = resolve(root, representative.cwd);
    try {
      if (!isInsideRoot(root, cwd) || realpathSync(cwd) !== cwd || !statSync(cwd).isDirectory()) {
        throw new Error('cwd');
      }
    } catch {
      return Object.freeze({ state: 'hold' as const, reasonCode: 'verifier-cwd-invalid' });
    }
    const containerName = safeContainerName({
      attempt: input.attemptBinding,
      programDigest: canonicalProgram.programDigest,
      observationGroupId: groupId,
    });
    const before = await inspectAbsent(docker, containerName, runner, input.signal);
    if (!exactDockerAbsence(before)) {
      return Object.freeze({ state: 'hold' as const, reasonCode: 'proof-container-not-absent' });
    }
    const containerCwd = representative.cwd === '.'
      ? '/workspace' : `/workspace/${representative.cwd}`;
    const containerHarness = `/workspace/${representative.harnessPath}`;
    const dockerArgs = [
      'run', '--name', containerName, '--pull', 'never',
      '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--pids-limit', '64',
      '--memory', '256m', '--memory-swap', '256m', '--user', '65534:65534',
      '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=64m',
      '--env', 'HOME=/tmp',
      '--mount', `type=bind,src=${root},dst=/workspace,readonly`,
      '--workdir', containerCwd,
      '--entrypoint', containerHarness,
      '--label', `io.deckent.task-id=${input.attemptBinding.taskId}`,
      '--label', `io.deckent.attempt-id=${input.attemptBinding.attemptId}`,
      '--label', `io.deckent.host-proof-program=${canonicalProgram.programDigest}`,
      '--label', `io.deckent.host-proof-group=${sha256Json(groupId)}`,
      imageId,
      ...representative.args,
    ] as const;
    const executed = await runner({
      executable: docker,
      args: dockerArgs,
      timeoutMs: representative.timeoutMs,
      stdoutCeiling: representative.outputLimitBytes,
      stderrCeiling: representative.outputLimitBytes,
      signal: input.signal,
    });
    const cleanupAbsenceDigest = await removeAndProveAbsent(docker, containerName, runner);
    if (!cleanupAbsenceDigest) {
      return Object.freeze({ state: 'hold' as const, reasonCode: 'proof-container-release-unconfirmed' });
    }
    if (executed.cancelled || input.signal?.aborted) {
      return Object.freeze({ state: 'hold' as const, reasonCode: 'host-proof-cancelled' });
    }
    if (executed.timedOut) {
      return Object.freeze({ state: 'hold' as const, reasonCode: 'host-proof-timeout' });
    }
    if (!commandSucceeded(executed)) {
      return Object.freeze({
        state: 'hold' as const,
        reasonCode: executed.overflow ? 'host-proof-output-overflow' : 'host-proof-process-failed',
      });
    }
    const structured = parseStructuredOutcome(
      executed.stdout,
      groupId,
      representative.expectation.schemaId,
      probes.map(probe => probe.target),
    );
    if (!structured) {
      return Object.freeze({ state: 'hold' as const, reasonCode: 'host-proof-outcome-invalid' });
    }
    for (const asset of groupAssets as AssetSnapshot[]) {
      const declared = declaredAssetByPath.get(asset.path)!;
      if (!sameAssetSnapshot(asset, readAssetSnapshot(root, declared))) {
        return Object.freeze({ state: 'hold' as const, reasonCode: 'verifier-asset-changed' });
      }
    }
    const receiptBody = Object.freeze({
      observationGroupId: groupId,
      schemaId: representative.expectation.schemaId,
      containerName,
      imageId,
      harnessPath: representative.harnessPath,
      verifierAssets: Object.freeze((groupAssets as AssetSnapshot[]).map(asset => Object.freeze({
        path: asset.path,
        sha256: asset.sha256,
        byteLength: asset.byteLength,
        role: asset.role,
      }))),
      dockerArgvDigest: sha256Json({ executable: docker, args: dockerArgs }),
      exitCode: 0 as const,
      stdoutSha256: sha256Bytes(executed.stdout),
      stdoutByteLength: executed.stdout.byteLength,
      stderrSha256: sha256Bytes(executed.stderr),
      stderrByteLength: executed.stderr.byteLength,
      structuredOutcomeDigest: structured.digest,
      cleanupAbsenceDigest,
    });
    const groupReceipt = Object.freeze({
      ...receiptBody,
      groupReceiptDigest: sha256Json(receiptBody),
    });
    groupReceipts.push(groupReceipt);
    for (const probe of probes) {
      targetObservations.push(Object.freeze({
        probeId: probe.probeId,
        observationGroupId: groupId,
        target: probe.target,
        evidenceRef: `host-proof:${groupReceipt.groupReceiptDigest}:${probe.probeId}`,
      }));
    }
  }
  for (const asset of initialAssets.values()) {
    const declared = declaredAssetByPath.get(asset.path)!;
    if (!sameAssetSnapshot(asset, readAssetSnapshot(root, declared))) {
      return Object.freeze({ state: 'hold' as const, reasonCode: 'verifier-asset-changed' });
    }
  }
  const body = Object.freeze({
    version: PRODUCTION_WIRING_HOST_PROOF_OUTCOME_VERSION,
    kind: 'production-wiring-host-proof-run-v1' as const,
    state: 'observed' as const,
    runnerAdapterId: PRODUCTION_WIRING_DOCKER_RUNNER_ADAPTER_ID,
    platform: matrixPlatform,
    programDigest: canonicalProgram.programDigest,
    attemptBinding: input.attemptBinding,
    taskWriteScopeDigest: productionWiringHostProofTaskWriteScopeDigest(input.taskWriteScope),
    groupReceipts: Object.freeze(groupReceipts),
    targetObservations: Object.freeze(targetObservations),
  });
  const receipt: ProductionWiringHostProofRunReceiptV1 = Object.freeze({
    ...body,
    proofRunDigest: sha256Json(body),
    observedAt: (options.now ?? (() => new Date().toISOString()))(),
  });
  return Object.freeze({ state: 'observed' as const, receipt });
}
