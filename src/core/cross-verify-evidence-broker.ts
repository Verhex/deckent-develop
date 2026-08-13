import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  win32,
} from 'node:path';

import { createJsonFileFirstWriterWins, createRawFileFirstWriterWins } from './approval-file-cas.js';
import { canonicalJson } from './audit-writer.js';
import {
  assertTaskResultSettlementRef,
  readTaskResultSettlementActiveClaim,
  readTaskResultSettlementClosure,
  taskResultSettlementActiveClaimDigest,
  taskResultSettlementAttemptPath,
  taskResultSettlementDurableClaimFence,
  type TaskResultSettlementRefV1,
} from './task-result-settlement.js';

export const CROSS_VERIFY_EVIDENCE_BROKER_VERSION = 1 as const;
export const CROSS_VERIFY_EVIDENCE_MAX_FILES = 256;
export const CROSS_VERIFY_EVIDENCE_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const CROSS_VERIFY_EVIDENCE_MAX_TOTAL_BYTES = 16 * 1024 * 1024;
export const CROSS_VERIFY_EVIDENCE_MAX_RELATIVE_PATH_BYTES = 1_024;
export const CROSS_VERIFY_EVIDENCE_MAX_RECEIPT_BYTES = 1024 * 1024;
export const CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES = 12_000;

const BROKER_DIRECTORY = 'cross-verify-evidence';
const BLOBS_DIRECTORY = 'blobs';
// Host-decoded plain-text snapshots, one file per evidence entry, keyed by the
// entry's bare `contentSha256`. The sandboxed verifier reads these with a bare
// `cat` — no base64, no interpreter — so adjudication never depends on which
// interpreters (python3/node/jq) happen to exist in a provider's container image.
// The `blobs/` envelopes + `manifest.json` remain the content-addressed integrity
// record; a decoded file's name asserts the sha256 the verifier can re-check.
const DECODED_DIRECTORY = 'decoded';

/**
 * Content-address (CAS) re-verification of a host-decoded evidence artifact: read
 * it back symlink-safe (O_NOFOLLOW on every path segment, via
 * {@link readPinnedBoundedFile}) and size-bounded, then require its actual bytes
 * to hash to the manifest `contentSha256` and match the recorded byte length. A
 * tamper, a truncation, a symlink swap, or a first-writer conflict all fail
 * closed with a typed error, so a corrupt decoded snapshot is never mounted to
 * the verifier. Both the winner and the existing-file/replay paths call this.
 */
function verifyDecodedEvidenceArtifact(
  decodedDirectory: string,
  contentSha256: string,
  byteLength: number,
  maxBytes: number,
): void {
  const readBack = readPinnedBoundedFile(decodedDirectory, contentSha256, maxBytes, false);
  if (!readBack
    || readBack.byteLength !== byteLength
    || sha256(readBack) !== contentSha256) {
    throw new CrossVerifyEvidenceBrokerError(
      'UNSAFE_FILESYSTEM_ENTRY',
      `Host-decoded evidence artifact failed content-address verification: ${contentSha256}`,
    );
  }
}
const CLAIM_RECEIPT_FILE = 'claim.json';
const EVIDENCE_RECEIPT_FILE = 'manifest.json';
const VERDICT_RECEIPT_FILE = 'verdict.json';
const SHA256 = /^[a-f0-9]{64}$/u;
const FORBIDDEN_WINDOWS_CHARACTERS = /[<>:"|?*]/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const WINDOWS_RESERVED_BASENAME =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;

export type CrossVerifyEvidenceBrokerErrorCode =
  | 'UNSUPPORTED_PLATFORM'
  | 'INVALID_RELATIVE_PATH'
  | 'INVALID_INPUT'
  | 'AUTHORITY_MISMATCH'
  | 'EVIDENCE_LIMIT_EXCEEDED'
  | 'UNSAFE_FILESYSTEM_ENTRY'
  | 'SOURCE_CHANGED'
  | 'IMMUTABLE_CONFLICT'
  | 'CORRUPT_RECEIPT'
  | 'PUBLICATION_FAILED';

export class CrossVerifyEvidenceBrokerError extends Error {
  constructor(
    readonly code: CrossVerifyEvidenceBrokerErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CrossVerifyEvidenceBrokerError';
  }
}

export interface CrossVerifyEvidenceBrokerPlatformCapabilities {
  readonly nodePlatform: string;
  readonly procSelfFdAvailable: boolean;
  readonly oNoFollow: number | undefined;
  readonly oDirectory: number | undefined;
}

export interface CrossVerifyEvidenceLimitsV1 {
  readonly maxFiles: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
}

export interface CrossVerifyEvidenceClaimV1 extends TaskResultSettlementRefV1 {
  readonly brokerVersion: typeof CROSS_VERIFY_EVIDENCE_BROKER_VERSION;
  readonly kind: 'cross-verify-evidence-claim';
  readonly state: 'claimed';
  readonly fenceTokenHash: string;
  readonly claimedAt: string;
  readonly relativePaths: readonly string[];
  readonly limits: CrossVerifyEvidenceLimitsV1;
}

export interface CrossVerifyEvidenceClaimEnvelopeV1 {
  readonly claimSha256: string;
  readonly claim: CrossVerifyEvidenceClaimV1;
}

export interface CrossVerifyEvidenceBlobReceiptV1
  extends TaskResultSettlementRefV1 {
  readonly brokerVersion: typeof CROSS_VERIFY_EVIDENCE_BROKER_VERSION;
  readonly kind: 'cross-verify-evidence-blob';
  readonly state: 'captured';
  readonly claimSha256: string;
  readonly relativePath: string;
  readonly contentEncoding: 'base64';
  readonly contentSha256: string;
  readonly byteLength: number;
  readonly contentBase64: string;
}

export interface CrossVerifyEvidenceBlobReceiptEnvelopeV1 {
  readonly blobReceiptSha256: string;
  readonly receipt: CrossVerifyEvidenceBlobReceiptV1;
}

export interface CrossVerifyEvidenceManifestEntryV1 {
  readonly relativePath: string;
  readonly contentSha256: string;
  readonly byteLength: number;
  readonly blobReceiptSha256: string;
}

export interface CrossVerifyEvidenceManifestV1
  extends TaskResultSettlementRefV1 {
  readonly brokerVersion: typeof CROSS_VERIFY_EVIDENCE_BROKER_VERSION;
  readonly kind: 'cross-verify-evidence-manifest';
  readonly state: 'captured';
  readonly fenceTokenHash: string;
  readonly claimSha256: string;
  readonly totalByteLength: number;
  readonly entries: readonly CrossVerifyEvidenceManifestEntryV1[];
}

export interface CrossVerifyEvidenceReceiptEnvelopeV1 {
  readonly manifestSha256: string;
  readonly manifest: CrossVerifyEvidenceManifestV1;
}

export type CrossVerifyEffectiveVerdict =
  | 'CONFIRMED'
  | 'REFUTED'
  | 'UNCLEAR';

export type CrossVerifyHostDisposition = 'allow' | 'no-go' | 'hold';

export interface CrossVerifyVerdictReceiptV1
  extends TaskResultSettlementRefV1 {
  readonly brokerVersion: typeof CROSS_VERIFY_EVIDENCE_BROKER_VERSION;
  readonly kind: 'cross-verify-verdict-receipt';
  readonly state: 'host-adjudicated';
  readonly assurance: 'typed-host-adjudicated';
  readonly fenceTokenHash: string;
  readonly claimSha256: string;
  readonly evidenceManifestSha256: string;
  readonly effectiveVerdict: CrossVerifyEffectiveVerdict;
  readonly disposition: CrossVerifyHostDisposition;
  readonly adjudicationReceiptSha256: string;
  readonly outputSha256: string;
  readonly outputByteLength: number;
}

export interface CrossVerifyVerdictReceiptEnvelopeV1 {
  readonly verdictReceiptSha256: string;
  readonly receipt: CrossVerifyVerdictReceiptV1;
}

export interface ClaimCrossVerifyEvidenceSnapshotInput {
  readonly projectRoot: string;
  readonly settlementRef: TaskResultSettlementRefV1;
  readonly fenceTokenHash: string;
  readonly relativePaths: readonly string[];
  readonly limits?: Partial<CrossVerifyEvidenceLimitsV1>;
}

export interface CaptureCrossVerifyEvidenceSnapshotInput {
  readonly projectRoot: string;
  readonly settlementRef: TaskResultSettlementRefV1;
  readonly claim: CrossVerifyEvidenceClaimEnvelopeV1;
}

export interface WriteCrossVerifyVerdictReceiptInput {
  readonly projectRoot: string;
  readonly settlementRef: TaskResultSettlementRefV1;
  readonly claimSha256: string;
  readonly evidenceManifestSha256: string;
  readonly effectiveVerdict: CrossVerifyEffectiveVerdict;
  readonly disposition: CrossVerifyHostDisposition;
  readonly adjudicationReceiptSha256: string;
  readonly outputSha256: string;
  readonly outputByteLength: number;
}

interface AuthorityDirectories {
  readonly brokerDirectory: string;
  readonly blobsDirectory: string | null;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length
    && Object.keys(value).every(key => keys.includes(key));
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function assertDigest(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new CrossVerifyEvidenceBrokerError(
      'INVALID_INPUT',
      `${field} must be a lowercase SHA-256 digest`,
    );
  }
}

function assertReceiptDigest(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      `${field} is not a lowercase SHA-256 digest`,
    );
  }
}

function assertInside(root: string, candidate: string, message: string): void {
  const rel = relative(root, candidate);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return;
  throw new CrossVerifyEvidenceBrokerError(
    'UNSAFE_FILESYSTEM_ENTRY',
    message,
  );
}

function sameSettlementRef(
  value: Readonly<TaskResultSettlementRefV1>,
  ref: Readonly<TaskResultSettlementRefV1>,
): boolean {
  return value.schemaVersion === ref.schemaVersion
    && value.taskId === ref.taskId
    && value.backend === ref.backend
    && value.projectRootSha256 === ref.projectRootSha256
    && value.attemptId === ref.attemptId;
}

function assertRecordSettlementRef(
  record: Record<string, unknown>,
  ref: TaskResultSettlementRefV1,
): void {
  if (
    record.schemaVersion !== ref.schemaVersion
    || record.taskId !== ref.taskId
    || record.backend !== ref.backend
    || record.projectRootSha256 !== ref.projectRootSha256
    || record.attemptId !== ref.attemptId
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence receipt does not match its settlement attempt',
    );
  }
}

/**
 * Exact platform capability gate for the pinned-fd adapter.
 *
 * Linux and WSL expose the required `/proc/self/fd` traversal plus true
 * `O_NOFOLLOW`/`O_DIRECTORY` flags. Other platforms fail with a typed error;
 * they must receive a native adapter rather than silently using path-based I/O.
 */
export function assertCrossVerifyEvidenceBrokerPlatformSupport(
  capabilities: CrossVerifyEvidenceBrokerPlatformCapabilities,
): void {
  if (
    capabilities.nodePlatform !== 'linux'
    || !capabilities.procSelfFdAvailable
    || typeof capabilities.oNoFollow !== 'number'
    || capabilities.oNoFollow === 0
    || typeof capabilities.oDirectory !== 'number'
    || capabilities.oDirectory === 0
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'UNSUPPORTED_PLATFORM',
      `Pinned cross-verify evidence reads are unsupported on ${capabilities.nodePlatform}`,
    );
  }
}

function assertHostPlatformSupport(): void {
  assertCrossVerifyEvidenceBrokerPlatformSupport({
    nodePlatform: process.platform,
    procSelfFdAvailable: existsSync('/proc/self/fd'),
    oNoFollow: fsConstants.O_NOFOLLOW,
    oDirectory: fsConstants.O_DIRECTORY,
  });
}

/**
 * Validate one byte-exact, portable project-relative evidence path.
 *
 * The function never normalizes an unsafe alias. Callers must provide the
 * canonical slash-separated spelling that is persisted into the manifest.
 */
export function assertCrossVerifyEvidenceRelativePath(value: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || Buffer.byteLength(value, 'utf8') > CROSS_VERIFY_EVIDENCE_MAX_RELATIVE_PATH_BYTES
    || value.normalize('NFC') !== value
    || value.includes('\\')
    || CONTROL_CHARACTERS.test(value)
    || posix.isAbsolute(value)
    || win32.isAbsolute(value)
    || posix.normalize(value) !== value
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'INVALID_RELATIVE_PATH',
      `Cross-verify evidence path is not an exact portable relative path: ${String(value)}`,
    );
  }
  const segments = value.split('/');
  if (
    segments.some(segment =>
      segment.length === 0
      || segment === '.'
      || segment === '..'
      || Buffer.byteLength(segment, 'utf8') > 255
      || FORBIDDEN_WINDOWS_CHARACTERS.test(segment)
      || WINDOWS_RESERVED_BASENAME.test(segment)
      || segment.endsWith('.')
      || segment.endsWith(' '))
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'INVALID_RELATIVE_PATH',
      `Cross-verify evidence path contains an unsafe segment: ${value}`,
    );
  }
  return value;
}

function normalizeLimits(
  value: Partial<CrossVerifyEvidenceLimitsV1> | undefined,
): CrossVerifyEvidenceLimitsV1 {
  const limits = {
    maxFiles: value?.maxFiles ?? CROSS_VERIFY_EVIDENCE_MAX_FILES,
    maxFileBytes: value?.maxFileBytes ?? CROSS_VERIFY_EVIDENCE_MAX_FILE_BYTES,
    maxTotalBytes: value?.maxTotalBytes ?? CROSS_VERIFY_EVIDENCE_MAX_TOTAL_BYTES,
  };
  const ceilings: Readonly<Record<keyof CrossVerifyEvidenceLimitsV1, number>> = {
    maxFiles: CROSS_VERIFY_EVIDENCE_MAX_FILES,
    maxFileBytes: CROSS_VERIFY_EVIDENCE_MAX_FILE_BYTES,
    maxTotalBytes: CROSS_VERIFY_EVIDENCE_MAX_TOTAL_BYTES,
  };
  for (const field of ['maxFiles', 'maxFileBytes', 'maxTotalBytes'] as const) {
    if (
      !Number.isSafeInteger(limits[field])
      || limits[field] <= 0
      || limits[field] > ceilings[field]
    ) {
      throw new CrossVerifyEvidenceBrokerError(
        'INVALID_INPUT',
        `Cross-verify evidence ${field} must be a positive safe integer no greater than ${ceilings[field]}`,
      );
    }
  }
  return Object.freeze(limits);
}

function normalizeRelativePaths(
  values: readonly string[],
  maxFiles: number,
): readonly string[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > maxFiles) {
    throw new CrossVerifyEvidenceBrokerError(
      'EVIDENCE_LIMIT_EXCEEDED',
      `Cross-verify evidence must contain between 1 and ${maxFiles} paths`,
    );
  }
  const paths = values.map(assertCrossVerifyEvidenceRelativePath);
  const exact = new Set<string>();
  const portable = new Set<string>();
  for (const path of paths) {
    const portableKey = path.toLocaleLowerCase('en-US');
    if (exact.has(path) || portable.has(portableKey)) {
      throw new CrossVerifyEvidenceBrokerError(
        'INVALID_RELATIVE_PATH',
        `Cross-verify evidence contains a duplicate or case-ambiguous path: ${path}`,
      );
    }
    exact.add(path);
    portable.add(portableKey);
  }
  return Object.freeze([...paths].sort(compareCodeUnits));
}

function canonicalProjectRoot(projectRoot: string): string {
  try {
    return realpathSync.native(projectRoot);
  } catch (error) {
    throw new CrossVerifyEvidenceBrokerError(
      'AUTHORITY_MISMATCH',
      `Cross-verify project root is not canonical: ${projectRoot}`,
      { cause: error },
    );
  }
}

function assertSettlementAuthority(
  projectRoot: string,
  ref: TaskResultSettlementRefV1,
): void {
  try {
    assertTaskResultSettlementRef(projectRoot, ref.taskId, ref);
  } catch (error) {
    throw new CrossVerifyEvidenceBrokerError(
      'AUTHORITY_MISMATCH',
      'Cross-verify evidence settlement authority does not match the project/task',
      { cause: error },
    );
  }
}

function assertCurrentFence(
  ref: TaskResultSettlementRefV1,
  expectedFenceTokenHash: string,
): string {
  assertDigest(expectedFenceTokenHash, 'fenceTokenHash');
  try {
    const active = readTaskResultSettlementActiveClaim(ref);
    if (
      !active
      || !sameSettlementRef(active, ref)
      || taskResultSettlementActiveClaimDigest(ref) !== expectedFenceTokenHash
    ) {
      throw new Error('active settlement fence mismatch');
    }
    return active.claimedAt;
  } catch (error) {
    throw new CrossVerifyEvidenceBrokerError(
      'AUTHORITY_MISMATCH',
      'Cross-verify evidence operation has no matching active settlement fence',
      { cause: error },
    );
  }
}

// The host verdict receipt is the FINAL cross-verify artifact — the coordinator
// has already closed the settlement (retiring the active claim) by the time the
// runner persists it. It therefore binds to the DURABLE claim fence (active while
// live, immutable closed tail afterwards) rather than requiring an active claim
// that closure has legitimately retired. The claim record is never rewritten on
// closure, so its fence digest is unchanged; a wrong fence still fails closed.
// The host verdict receipt is the FINAL cross-verify artifact and may publish
// ONLY after the settlement is terminally closed. A merely-active/durable claim
// fence is not sufficient: an open (still-executing) settlement must fail closed
// so a verdict can never be minted mid-flight. The canonical closure reader is
// the single source of truth; a durable idempotent replay still sees it closed.
function assertClosedSettlement(ref: TaskResultSettlementRefV1): void {
  if (!readTaskResultSettlementClosure(ref)) {
    throw new CrossVerifyEvidenceBrokerError(
      'AUTHORITY_MISMATCH',
      'Cross-verify verdict receipt requires a terminally closed settlement',
    );
  }
}

function assertDurableFence(
  ref: TaskResultSettlementRefV1,
  expectedFenceTokenHash: string,
): string {
  assertDigest(expectedFenceTokenHash, 'fenceTokenHash');
  const durable = taskResultSettlementDurableClaimFence(ref);
  if (!durable || durable.fenceTokenHash !== expectedFenceTokenHash) {
    throw new CrossVerifyEvidenceBrokerError(
      'AUTHORITY_MISMATCH',
      'Cross-verify verdict receipt has no matching durable settlement fence',
    );
  }
  return durable.claimedAt;
}

function assertPrivateDirectory(path: string, expectedParent: string): string {
  let entry: ReturnType<typeof lstatSync>;
  try {
    entry = lstatSync(path);
  } catch (error) {
    throw new CrossVerifyEvidenceBrokerError(
      'UNSAFE_FILESYSTEM_ENTRY',
      `Cross-verify authority directory is unavailable: ${path}`,
      { cause: error },
    );
  }
  if (
    !entry.isDirectory()
    || entry.isSymbolicLink()
    || (process.platform !== 'win32' && (entry.mode & 0o077) !== 0)
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'UNSAFE_FILESYSTEM_ENTRY',
      `Cross-verify authority directory is not a private regular directory: ${path}`,
    );
  }
  let canonical: string;
  try {
    canonical = realpathSync.native(path);
  } catch (error) {
    throw new CrossVerifyEvidenceBrokerError(
      'UNSAFE_FILESYSTEM_ENTRY',
      `Cross-verify authority directory cannot be canonicalized: ${path}`,
      { cause: error },
    );
  }
  if (dirname(canonical) !== expectedParent) {
    throw new CrossVerifyEvidenceBrokerError(
      'UNSAFE_FILESYSTEM_ENTRY',
      `Cross-verify authority directory escaped its pinned parent: ${path}`,
    );
  }
  return canonical;
}

function createPrivateDirectory(path: string, expectedParent: string): string {
  let created = false;
  try {
    mkdirSync(path, { recursive: false, mode: 0o700 });
    created = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw new CrossVerifyEvidenceBrokerError(
        'PUBLICATION_FAILED',
        `Cross-verify authority directory could not be created: ${path}`,
        { cause: error },
      );
    }
  }
  const canonical = assertPrivateDirectory(path, expectedParent);
  if (created) {
    let directoryFd: number | undefined;
    let parentFd: number | undefined;
    try {
      directoryFd = openSync(
        canonical,
        fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
      );
      fsyncSync(directoryFd);
      parentFd = openSync(
        expectedParent,
        fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
      );
      fsyncSync(parentFd);
    } catch (error) {
      throw new CrossVerifyEvidenceBrokerError(
        'PUBLICATION_FAILED',
        `Cross-verify authority directory could not be durably published: ${path}`,
        { cause: error },
      );
    } finally {
      if (parentFd !== undefined) {
        try {
          closeSync(parentFd);
        } catch {
          // Preserve the durability failure, if any.
        }
      }
      if (directoryFd !== undefined) {
        try {
          closeSync(directoryFd);
        } catch {
          // Preserve the durability failure, if any.
        }
      }
    }
  }
  return canonical;
}

function resolveAuthorityDirectories(
  projectRoot: string,
  ref: TaskResultSettlementRefV1,
  options: { readonly createBroker: boolean; readonly createBlobs: boolean },
): AuthorityDirectories {
  assertHostPlatformSupport();
  assertSettlementAuthority(projectRoot, ref);
  const attemptDirectory = dirname(taskResultSettlementAttemptPath(ref));
  let canonicalAttempt: string;
  try {
    const attemptEntry = lstatSync(attemptDirectory);
    if (!attemptEntry.isDirectory() || attemptEntry.isSymbolicLink()) {
      throw new Error('attempt authority is not a directory');
    }
    canonicalAttempt = realpathSync.native(attemptDirectory);
  } catch (error) {
    throw new CrossVerifyEvidenceBrokerError(
      'UNSAFE_FILESYSTEM_ENTRY',
      `Cross-verify settlement attempt directory is unsafe: ${attemptDirectory}`,
      { cause: error },
    );
  }
  const project = canonicalProjectRoot(projectRoot);
  const rel = relative(project, canonicalAttempt);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new CrossVerifyEvidenceBrokerError(
      'AUTHORITY_MISMATCH',
      'Cross-verify host authority must remain outside the worker-mounted project',
    );
  }

  const brokerPath = join(canonicalAttempt, BROKER_DIRECTORY);
  const brokerDirectory = options.createBroker
    ? createPrivateDirectory(brokerPath, canonicalAttempt)
    : assertPrivateDirectory(brokerPath, canonicalAttempt);
  if (!options.createBlobs) {
    return { brokerDirectory, blobsDirectory: null };
  }
  const blobsPath = join(brokerDirectory, BLOBS_DIRECTORY);
  return {
    brokerDirectory,
    blobsDirectory: createPrivateDirectory(blobsPath, brokerDirectory),
  };
}

function readPinnedBoundedFile(
  rootDirectory: string,
  relativePath: string,
  maxBytes: number,
  allowMissing: boolean,
): Buffer | null {
  assertHostPlatformSupport();
  const safeRelativePath = assertCrossVerifyEvidenceRelativePath(relativePath);
  let rootFd: number | undefined;
  let fileFd: number | undefined;
  try {
    rootFd = openSync(
      rootDirectory,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    );
    const rootStat = fstatSync(rootFd, { bigint: true });
    if (!rootStat.isDirectory()) {
      throw new CrossVerifyEvidenceBrokerError(
        'UNSAFE_FILESYSTEM_ENTRY',
        `Pinned cross-verify root is not a directory: ${rootDirectory}`,
      );
    }
    const stableRoot = `/proc/self/fd/${rootFd}`;
    let parent = stableRoot;
    const segments = safeRelativePath.split('/');
    for (const segment of segments.slice(0, -1)) {
      parent = join(parent, segment);
      const entry = lstatSync(parent);
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new CrossVerifyEvidenceBrokerError(
          'UNSAFE_FILESYSTEM_ENTRY',
          `Cross-verify evidence path crosses a symlink or non-directory: ${safeRelativePath}`,
        );
      }
    }
    fileFd = openSync(
      join(stableRoot, safeRelativePath),
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const before = fstatSync(fileFd, { bigint: true });
    if (
      !before.isFile()
      || before.nlink !== 1n
      || before.size < 0n
      || before.size > BigInt(maxBytes)
    ) {
      throw new CrossVerifyEvidenceBrokerError(
        before.size > BigInt(maxBytes)
          ? 'EVIDENCE_LIMIT_EXCEEDED'
          : 'UNSAFE_FILESYSTEM_ENTRY',
        `Cross-verify evidence file is unsafe or exceeds ${maxBytes} bytes: ${safeRelativePath}`,
      );
    }
    const canonicalRoot = realpathSync.native(stableRoot);
    const canonicalFile = realpathSync.native(`/proc/self/fd/${fileFd}`);
    assertInside(
      canonicalRoot,
      canonicalFile,
      `Cross-verify evidence file escaped the pinned project root: ${safeRelativePath}`,
    );

    const buffer = Buffer.allocUnsafe(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const count = readSync(
        fileFd,
        buffer,
        offset,
        buffer.byteLength - offset,
        null,
      );
      if (count === 0) break;
      offset += count;
    }
    const after = fstatSync(fileFd, { bigint: true });
    if (
      offset > maxBytes
      || BigInt(offset) !== before.size
      || after.dev !== before.dev
      || after.ino !== before.ino
      || after.nlink !== before.nlink
      || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs
      || after.ctimeNs !== before.ctimeNs
    ) {
      throw new CrossVerifyEvidenceBrokerError(
        'SOURCE_CHANGED',
        `Cross-verify evidence changed during its pinned read: ${safeRelativePath}`,
      );
    }
    return Buffer.from(buffer.subarray(0, offset));
  } catch (error) {
    if (error instanceof CrossVerifyEvidenceBrokerError) throw error;
    if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new CrossVerifyEvidenceBrokerError(
      'UNSAFE_FILESYSTEM_ENTRY',
      `Cross-verify evidence could not be read safely: ${safeRelativePath}`,
      { cause: error },
    );
  } finally {
    if (fileFd !== undefined) {
      try {
        closeSync(fileFd);
      } catch {
        // Preserve the authoritative read failure, if any.
      }
    }
    if (rootFd !== undefined) {
      try {
        closeSync(rootFd);
      } catch {
        // Preserve the authoritative read failure, if any.
      }
    }
  }
}

function decodeJson(bytes: Buffer, relativePath: string): unknown {
  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      `Cross-verify receipt is not canonical UTF-8 JSON: ${relativePath}`,
      { cause: error },
    );
  }
}

function readReceipt<T>(
  rootDirectory: string,
  relativePath: string,
  maxBytes: number,
  allowMissing: boolean,
  parse: (value: unknown) => T,
): T | null {
  const bytes = readPinnedBoundedFile(
    rootDirectory,
    relativePath,
    maxBytes,
    allowMissing,
  );
  return bytes === null ? null : parse(decodeJson(bytes, relativePath));
}

function publishReceipt<T>(
  rootDirectory: string,
  relativePath: string,
  value: T,
  maxBytes: number,
  parse: (candidate: unknown) => T,
): T {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new CrossVerifyEvidenceBrokerError(
      'EVIDENCE_LIMIT_EXCEEDED',
      `Cross-verify receipt exceeds its ${maxBytes}-byte ceiling: ${relativePath}`,
    );
  }
  const existing = readReceipt(
    rootDirectory,
    relativePath,
    maxBytes,
    true,
    parse,
  );
  if (existing !== null) {
    if (canonicalJson(existing) !== canonicalJson(value)) {
      throw new CrossVerifyEvidenceBrokerError(
        'IMMUTABLE_CONFLICT',
        `Cross-verify receipt conflicts with its first writer: ${relativePath}`,
      );
    }
    return existing;
  }
  try {
    createJsonFileFirstWriterWins(join(rootDirectory, relativePath), value);
  } catch (error) {
    throw new CrossVerifyEvidenceBrokerError(
      'PUBLICATION_FAILED',
      `Cross-verify receipt could not be durably published: ${relativePath}`,
      { cause: error },
    );
  }
  const persisted = readReceipt(
    rootDirectory,
    relativePath,
    maxBytes,
    false,
    parse,
  );
  if (persisted === null || canonicalJson(persisted) !== canonicalJson(value)) {
    throw new CrossVerifyEvidenceBrokerError(
      'IMMUTABLE_CONFLICT',
      `Cross-verify receipt lost its first-writer publication race: ${relativePath}`,
    );
  }
  return persisted;
}

const SETTLEMENT_REF_KEYS = [
  'schemaVersion',
  'taskId',
  'backend',
  'projectRootSha256',
  'attemptId',
] as const;

function parseClaimEnvelope(
  value: unknown,
  ref: TaskResultSettlementRefV1,
): CrossVerifyEvidenceClaimEnvelopeV1 {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ['claimSha256', 'claim'])
    || !isRecord(value.claim)
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence claim envelope has an invalid exact schema',
    );
  }
  const claim = value.claim;
  const claimKeys = [
    ...SETTLEMENT_REF_KEYS,
    'brokerVersion',
    'kind',
    'state',
    'fenceTokenHash',
    'claimedAt',
    'relativePaths',
    'limits',
  ];
  if (
    !hasExactKeys(claim, claimKeys)
    || claim.brokerVersion !== CROSS_VERIFY_EVIDENCE_BROKER_VERSION
    || claim.kind !== 'cross-verify-evidence-claim'
    || claim.state !== 'claimed'
    || typeof claim.claimedAt !== 'string'
    || !Number.isFinite(Date.parse(claim.claimedAt))
    || !isRecord(claim.limits)
    || !hasExactKeys(claim.limits, ['maxFiles', 'maxFileBytes', 'maxTotalBytes'])
    || !Array.isArray(claim.relativePaths)
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence claim has an invalid exact schema',
    );
  }
  assertRecordSettlementRef(claim, ref);
  assertReceiptDigest(claim.fenceTokenHash, 'claim.fenceTokenHash');
  const limits = normalizeLimits(
    claim.limits as unknown as CrossVerifyEvidenceLimitsV1,
  );
  const paths = normalizeRelativePaths(
    claim.relativePaths as unknown as readonly string[],
    limits.maxFiles,
  );
  if (canonicalJson(paths) !== canonicalJson(claim.relativePaths)) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence claim paths are not deterministically ordered',
    );
  }
  assertReceiptDigest(value.claimSha256, 'claimSha256');
  if (value.claimSha256 !== sha256(canonicalJson(claim))) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence claim digest does not match its canonical payload',
    );
  }
  return deepFreeze(value as unknown as CrossVerifyEvidenceClaimEnvelopeV1);
}

function strictBase64(value: string): Buffer | null {
  if (
    value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)
  ) {
    return null;
  }
  const decoded = Buffer.from(value, 'base64');
  return decoded.toString('base64') === value ? decoded : null;
}

function parseBlobEnvelope(
  value: unknown,
  ref: TaskResultSettlementRefV1,
  expected?: CrossVerifyEvidenceManifestEntryV1 & { readonly claimSha256: string },
): CrossVerifyEvidenceBlobReceiptEnvelopeV1 {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ['blobReceiptSha256', 'receipt'])
    || !isRecord(value.receipt)
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence blob envelope has an invalid exact schema',
    );
  }
  const receipt = value.receipt;
  const receiptKeys = [
    ...SETTLEMENT_REF_KEYS,
    'brokerVersion',
    'kind',
    'state',
    'claimSha256',
    'relativePath',
    'contentEncoding',
    'contentSha256',
    'byteLength',
    'contentBase64',
  ];
  if (
    !hasExactKeys(receipt, receiptKeys)
    || receipt.brokerVersion !== CROSS_VERIFY_EVIDENCE_BROKER_VERSION
    || receipt.kind !== 'cross-verify-evidence-blob'
    || receipt.state !== 'captured'
    || receipt.contentEncoding !== 'base64'
    || typeof receipt.relativePath !== 'string'
    || typeof receipt.contentBase64 !== 'string'
    || !Number.isSafeInteger(receipt.byteLength)
    || (receipt.byteLength as number) < 0
    || (receipt.byteLength as number) > CROSS_VERIFY_EVIDENCE_MAX_FILE_BYTES
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence blob receipt has an invalid exact schema',
    );
  }
  assertRecordSettlementRef(receipt, ref);
  const relativePath = assertCrossVerifyEvidenceRelativePath(receipt.relativePath);
  assertReceiptDigest(receipt.claimSha256, 'blob.claimSha256');
  assertReceiptDigest(receipt.contentSha256, 'blob.contentSha256');
  assertReceiptDigest(value.blobReceiptSha256, 'blobReceiptSha256');
  const decoded = strictBase64(receipt.contentBase64);
  if (
    decoded === null
    || decoded.byteLength !== receipt.byteLength
    || sha256(decoded) !== receipt.contentSha256
    || value.blobReceiptSha256 !== sha256(canonicalJson(receipt))
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence blob content or digest is corrupt',
    );
  }
  if (
    expected
    && (
      relativePath !== expected.relativePath
      || receipt.claimSha256 !== expected.claimSha256
      || receipt.contentSha256 !== expected.contentSha256
      || receipt.byteLength !== expected.byteLength
      || value.blobReceiptSha256 !== expected.blobReceiptSha256
    )
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      `Cross-verify evidence blob does not match manifest entry ${relativePath}`,
    );
  }
  return deepFreeze(value as unknown as CrossVerifyEvidenceBlobReceiptEnvelopeV1);
}

function parseManifestEnvelope(
  value: unknown,
  ref: TaskResultSettlementRefV1,
  claim: CrossVerifyEvidenceClaimEnvelopeV1,
): CrossVerifyEvidenceReceiptEnvelopeV1 {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ['manifestSha256', 'manifest'])
    || !isRecord(value.manifest)
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence manifest envelope has an invalid exact schema',
    );
  }
  const manifest = value.manifest;
  const manifestKeys = [
    ...SETTLEMENT_REF_KEYS,
    'brokerVersion',
    'kind',
    'state',
    'fenceTokenHash',
    'claimSha256',
    'totalByteLength',
    'entries',
  ];
  if (
    !hasExactKeys(manifest, manifestKeys)
    || manifest.brokerVersion !== CROSS_VERIFY_EVIDENCE_BROKER_VERSION
    || manifest.kind !== 'cross-verify-evidence-manifest'
    || manifest.state !== 'captured'
    || !Number.isSafeInteger(manifest.totalByteLength)
    || (manifest.totalByteLength as number) < 0
    || !Array.isArray(manifest.entries)
    || manifest.entries.length !== claim.claim.relativePaths.length
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence manifest has an invalid exact schema',
    );
  }
  assertRecordSettlementRef(manifest, ref);
  assertReceiptDigest(manifest.fenceTokenHash, 'manifest.fenceTokenHash');
  assertReceiptDigest(manifest.claimSha256, 'manifest.claimSha256');
  if (
    manifest.claimSha256 !== claim.claimSha256
    || manifest.fenceTokenHash !== claim.claim.fenceTokenHash
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence manifest is not bound to its immutable claim',
    );
  }
  let totalByteLength = 0;
  const entries = manifest.entries.map((candidate, index) => {
    if (
      !isRecord(candidate)
      || !hasExactKeys(candidate, [
        'relativePath',
        'contentSha256',
        'byteLength',
        'blobReceiptSha256',
      ])
      || typeof candidate.relativePath !== 'string'
      || !Number.isSafeInteger(candidate.byteLength)
      || (candidate.byteLength as number) < 0
      || (candidate.byteLength as number) > claim.claim.limits.maxFileBytes
    ) {
      throw new CrossVerifyEvidenceBrokerError(
        'CORRUPT_RECEIPT',
        `Cross-verify evidence manifest entry ${index} is invalid`,
      );
    }
    assertReceiptDigest(candidate.contentSha256, `entries[${index}].contentSha256`);
    assertReceiptDigest(
      candidate.blobReceiptSha256,
      `entries[${index}].blobReceiptSha256`,
    );
    const relativePath = assertCrossVerifyEvidenceRelativePath(candidate.relativePath);
    if (relativePath !== claim.claim.relativePaths[index]) {
      throw new CrossVerifyEvidenceBrokerError(
        'CORRUPT_RECEIPT',
        'Cross-verify evidence manifest paths do not match their deterministic claim order',
      );
    }
    totalByteLength += candidate.byteLength as number;
    return candidate as unknown as CrossVerifyEvidenceManifestEntryV1;
  });
  if (
    totalByteLength !== manifest.totalByteLength
    || totalByteLength > claim.claim.limits.maxTotalBytes
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence manifest aggregate byte count is invalid',
    );
  }
  assertReceiptDigest(value.manifestSha256, 'manifestSha256');
  if (value.manifestSha256 !== sha256(canonicalJson(manifest))) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence manifest digest does not match its canonical payload',
    );
  }
  void entries;
  return deepFreeze(value as unknown as CrossVerifyEvidenceReceiptEnvelopeV1);
}

function dispositionForVerdict(
  verdict: CrossVerifyEffectiveVerdict,
): CrossVerifyHostDisposition {
  switch (verdict) {
    case 'CONFIRMED':
      return 'allow';
    case 'REFUTED':
      return 'no-go';
    case 'UNCLEAR':
      return 'hold';
  }
}

function parseVerdictEnvelope(
  value: unknown,
  ref: TaskResultSettlementRefV1,
  claim: CrossVerifyEvidenceClaimEnvelopeV1,
  evidence: CrossVerifyEvidenceReceiptEnvelopeV1,
): CrossVerifyVerdictReceiptEnvelopeV1 {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ['verdictReceiptSha256', 'receipt'])
    || !isRecord(value.receipt)
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify verdict envelope has an invalid exact schema',
    );
  }
  const receipt = value.receipt;
  const receiptKeys = [
    ...SETTLEMENT_REF_KEYS,
    'brokerVersion',
    'kind',
    'state',
    'assurance',
    'fenceTokenHash',
    'claimSha256',
    'evidenceManifestSha256',
    'effectiveVerdict',
    'disposition',
    'adjudicationReceiptSha256',
    'outputSha256',
    'outputByteLength',
  ];
  if (
    !hasExactKeys(receipt, receiptKeys)
    || receipt.brokerVersion !== CROSS_VERIFY_EVIDENCE_BROKER_VERSION
    || receipt.kind !== 'cross-verify-verdict-receipt'
    || receipt.state !== 'host-adjudicated'
    || receipt.assurance !== 'typed-host-adjudicated'
    || !['CONFIRMED', 'REFUTED', 'UNCLEAR'].includes(
      String(receipt.effectiveVerdict),
    )
    || !['allow', 'no-go', 'hold'].includes(String(receipt.disposition))
    || !Number.isSafeInteger(receipt.outputByteLength)
    || (receipt.outputByteLength as number) < 0
    || (receipt.outputByteLength as number) > CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify verdict receipt has an invalid exact schema',
    );
  }
  assertRecordSettlementRef(receipt, ref);
  for (const field of [
    'fenceTokenHash',
    'claimSha256',
    'evidenceManifestSha256',
    'adjudicationReceiptSha256',
    'outputSha256',
  ] as const) {
    assertReceiptDigest(receipt[field], `verdict.${field}`);
  }
  const effectiveVerdict = receipt.effectiveVerdict as CrossVerifyEffectiveVerdict;
  if (
    receipt.fenceTokenHash !== claim.claim.fenceTokenHash
    || receipt.claimSha256 !== claim.claimSha256
    || receipt.evidenceManifestSha256 !== evidence.manifestSha256
    || receipt.disposition !== dispositionForVerdict(effectiveVerdict)
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify verdict receipt is not bound to its host-adjudicated evidence chain',
    );
  }
  assertReceiptDigest(value.verdictReceiptSha256, 'verdictReceiptSha256');
  if (value.verdictReceiptSha256 !== sha256(canonicalJson(receipt))) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify verdict receipt digest does not match its canonical payload',
    );
  }
  return deepFreeze(value as unknown as CrossVerifyVerdictReceiptEnvelopeV1);
}

export function crossVerifyEvidenceBrokerDirectory(
  ref: TaskResultSettlementRefV1,
): string {
  return join(dirname(taskResultSettlementAttemptPath(ref)), BROKER_DIRECTORY);
}

export function crossVerifyEvidenceClaimReceiptPath(
  ref: TaskResultSettlementRefV1,
): string {
  return join(crossVerifyEvidenceBrokerDirectory(ref), CLAIM_RECEIPT_FILE);
}

export function crossVerifyEvidenceReceiptPath(
  ref: TaskResultSettlementRefV1,
): string {
  return join(crossVerifyEvidenceBrokerDirectory(ref), EVIDENCE_RECEIPT_FILE);
}

export function crossVerifyEvidenceBlobReceiptPath(
  ref: TaskResultSettlementRefV1,
  blobReceiptSha256: string,
): string {
  assertDigest(blobReceiptSha256, 'blobReceiptSha256');
  return join(
    crossVerifyEvidenceBrokerDirectory(ref),
    BLOBS_DIRECTORY,
    `${blobReceiptSha256}.json`,
  );
}

export function crossVerifyVerdictReceiptPath(
  ref: TaskResultSettlementRefV1,
): string {
  return join(crossVerifyEvidenceBrokerDirectory(ref), VERDICT_RECEIPT_FILE);
}

export function crossVerifyEvidenceClaimRef(
  envelope: CrossVerifyEvidenceClaimEnvelopeV1,
): string {
  assertDigest(envelope.claimSha256, 'claimSha256');
  return `cross-verify-evidence-claim:sha256:${envelope.claimSha256}`;
}

export function crossVerifyEvidenceReceiptRef(
  envelope: CrossVerifyEvidenceReceiptEnvelopeV1,
): string {
  assertDigest(envelope.manifestSha256, 'manifestSha256');
  return `cross-verify-evidence-manifest:sha256:${envelope.manifestSha256}`;
}

export function crossVerifyVerdictReceiptRef(
  envelope: CrossVerifyVerdictReceiptEnvelopeV1,
): string {
  assertDigest(envelope.verdictReceiptSha256, 'verdictReceiptSha256');
  return `cross-verify-verdict:sha256:${envelope.verdictReceiptSha256}`;
}

export function readCrossVerifyEvidenceClaimReceipt(
  projectRoot: string,
  ref: TaskResultSettlementRefV1,
): CrossVerifyEvidenceClaimEnvelopeV1 {
  const authority = resolveAuthorityDirectories(projectRoot, ref, {
    createBroker: false,
    createBlobs: false,
  });
  const claim = readReceipt(
    authority.brokerDirectory,
    CLAIM_RECEIPT_FILE,
    CROSS_VERIFY_EVIDENCE_MAX_RECEIPT_BYTES,
    false,
    value => parseClaimEnvelope(value, ref),
  );
  if (claim === null) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence claim receipt is absent',
    );
  }
  return claim;
}

export function claimCrossVerifyEvidenceSnapshotAtomic(
  input: ClaimCrossVerifyEvidenceSnapshotInput,
): CrossVerifyEvidenceClaimEnvelopeV1 {
  assertSettlementAuthority(input.projectRoot, input.settlementRef);
  const claimedAt = assertCurrentFence(
    input.settlementRef,
    input.fenceTokenHash,
  );
  const limits = normalizeLimits(input.limits);
  const relativePaths = normalizeRelativePaths(
    input.relativePaths,
    limits.maxFiles,
  );
  const claim: CrossVerifyEvidenceClaimV1 = {
    ...input.settlementRef,
    brokerVersion: CROSS_VERIFY_EVIDENCE_BROKER_VERSION,
    kind: 'cross-verify-evidence-claim',
    state: 'claimed',
    fenceTokenHash: input.fenceTokenHash,
    claimedAt,
    relativePaths,
    limits,
  };
  const envelope: CrossVerifyEvidenceClaimEnvelopeV1 = {
    claimSha256: sha256(canonicalJson(claim)),
    claim,
  };
  const authority = resolveAuthorityDirectories(
    input.projectRoot,
    input.settlementRef,
    { createBroker: true, createBlobs: false },
  );
  const persisted = publishReceipt(
    authority.brokerDirectory,
    CLAIM_RECEIPT_FILE,
    envelope,
    CROSS_VERIFY_EVIDENCE_MAX_RECEIPT_BYTES,
    value => parseClaimEnvelope(value, input.settlementRef),
  );
  assertCurrentFence(input.settlementRef, persisted.claim.fenceTokenHash);
  return persisted;
}

function readBlobForEntry(
  authority: AuthorityDirectories,
  ref: TaskResultSettlementRefV1,
  claimSha256: string,
  entry: CrossVerifyEvidenceManifestEntryV1,
): CrossVerifyEvidenceBlobReceiptEnvelopeV1 {
  const maxBytes =
    Math.ceil(CROSS_VERIFY_EVIDENCE_MAX_FILE_BYTES * 4 / 3)
    + CROSS_VERIFY_EVIDENCE_MAX_RECEIPT_BYTES;
  const relativePath = `${BLOBS_DIRECTORY}/${entry.blobReceiptSha256}.json`;
  const receipt = readReceipt(
    authority.brokerDirectory,
    relativePath,
    maxBytes,
    false,
    value => parseBlobEnvelope(value, ref, { ...entry, claimSha256 }),
  );
  if (receipt === null) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      `Cross-verify evidence blob receipt is absent: ${entry.relativePath}`,
    );
  }
  return receipt;
}

export function readCrossVerifyEvidenceReceipt(
  projectRoot: string,
  ref: TaskResultSettlementRefV1,
): CrossVerifyEvidenceReceiptEnvelopeV1 {
  const authority = resolveAuthorityDirectories(projectRoot, ref, {
    createBroker: false,
    createBlobs: false,
  });
  const claim = readReceipt(
    authority.brokerDirectory,
    CLAIM_RECEIPT_FILE,
    CROSS_VERIFY_EVIDENCE_MAX_RECEIPT_BYTES,
    false,
    value => parseClaimEnvelope(value, ref),
  );
  if (claim === null) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence manifest has no immutable claim',
    );
  }
  const evidence = readReceipt(
    authority.brokerDirectory,
    EVIDENCE_RECEIPT_FILE,
    CROSS_VERIFY_EVIDENCE_MAX_RECEIPT_BYTES,
    false,
    value => parseManifestEnvelope(value, ref, claim),
  );
  if (evidence === null) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify evidence manifest receipt is absent',
    );
  }
  for (const entry of evidence.manifest.entries) {
    readBlobForEntry(authority, ref, claim.claimSha256, entry);
  }
  return evidence;
}

export function captureCrossVerifyEvidenceSnapshotAtomic(
  input: CaptureCrossVerifyEvidenceSnapshotInput,
): CrossVerifyEvidenceReceiptEnvelopeV1 {
  const authority = resolveAuthorityDirectories(
    input.projectRoot,
    input.settlementRef,
    { createBroker: false, createBlobs: true },
  );
  const durableClaim = readCrossVerifyEvidenceClaimReceipt(
    input.projectRoot,
    input.settlementRef,
  );
  if (canonicalJson(durableClaim) !== canonicalJson(input.claim)) {
    throw new CrossVerifyEvidenceBrokerError(
      'AUTHORITY_MISMATCH',
      'Cross-verify evidence capture does not match the durable first-writer claim',
    );
  }
  assertCurrentFence(
    input.settlementRef,
    durableClaim.claim.fenceTokenHash,
  );
  const existing = readReceipt(
    authority.brokerDirectory,
    EVIDENCE_RECEIPT_FILE,
    CROSS_VERIFY_EVIDENCE_MAX_RECEIPT_BYTES,
    true,
    value => parseManifestEnvelope(value, input.settlementRef, durableClaim),
  );
  const decodedDirectory = createPrivateDirectory(
    join(authority.brokerDirectory, DECODED_DIRECTORY),
    authority.brokerDirectory,
  );
  if (existing !== null) {
    for (const entry of existing.manifest.entries) {
      readBlobForEntry(
        authority,
        input.settlementRef,
        durableClaim.claimSha256,
        entry,
      );
      // Replay path: re-verify the reused host-decoded artifact against the
      // manifest content-address before it can be mounted to the verifier.
      verifyDecodedEvidenceArtifact(
        decodedDirectory,
        entry.contentSha256,
        entry.byteLength,
        durableClaim.claim.limits.maxFileBytes,
      );
    }
    return existing;
  }

  const entries: CrossVerifyEvidenceManifestEntryV1[] = [];
  let totalByteLength = 0;
  for (const relativePath of durableClaim.claim.relativePaths) {
    assertCurrentFence(
      input.settlementRef,
      durableClaim.claim.fenceTokenHash,
    );
    const content = readPinnedBoundedFile(
      canonicalProjectRoot(input.projectRoot),
      relativePath,
      durableClaim.claim.limits.maxFileBytes,
      false,
    );
    if (content === null) {
      throw new CrossVerifyEvidenceBrokerError(
        'UNSAFE_FILESYSTEM_ENTRY',
        `Cross-verify evidence source is absent: ${relativePath}`,
      );
    }
    totalByteLength += content.byteLength;
    if (totalByteLength > durableClaim.claim.limits.maxTotalBytes) {
      throw new CrossVerifyEvidenceBrokerError(
        'EVIDENCE_LIMIT_EXCEEDED',
        `Cross-verify evidence exceeds its ${durableClaim.claim.limits.maxTotalBytes}-byte aggregate ceiling`,
      );
    }
    const receipt: CrossVerifyEvidenceBlobReceiptV1 = {
      ...input.settlementRef,
      brokerVersion: CROSS_VERIFY_EVIDENCE_BROKER_VERSION,
      kind: 'cross-verify-evidence-blob',
      state: 'captured',
      claimSha256: durableClaim.claimSha256,
      relativePath,
      contentEncoding: 'base64',
      contentSha256: sha256(content),
      byteLength: content.byteLength,
      contentBase64: content.toString('base64'),
    };
    const blobEnvelope: CrossVerifyEvidenceBlobReceiptEnvelopeV1 = {
      blobReceiptSha256: sha256(canonicalJson(receipt)),
      receipt,
    };
    const entry: CrossVerifyEvidenceManifestEntryV1 = {
      relativePath,
      contentSha256: receipt.contentSha256,
      byteLength: receipt.byteLength,
      blobReceiptSha256: blobEnvelope.blobReceiptSha256,
    };
    const maxBlobReceiptBytes =
      Math.ceil(durableClaim.claim.limits.maxFileBytes * 4 / 3)
      + CROSS_VERIFY_EVIDENCE_MAX_RECEIPT_BYTES;
    publishReceipt(
      authority.brokerDirectory,
      `${BLOBS_DIRECTORY}/${blobEnvelope.blobReceiptSha256}.json`,
      blobEnvelope,
      maxBlobReceiptBytes,
      value => parseBlobEnvelope(value, input.settlementRef, {
        ...entry,
        claimSha256: durableClaim.claimSha256,
      }),
    );
    // Host-decoded plain snapshot, keyed by bare contentSha256 (flat, so no
    // nested-directory publication and no path-injection surface). First-writer-
    // wins: a pre-existing name is the same content-addressed bytes, so a false
    // return is a benign idempotent re-capture, never a conflict.
    createRawFileFirstWriterWins(join(decodedDirectory, receipt.contentSha256), content);
    // Winner AND existing-file both traverse here: re-verify the decoded artifact
    // against its content-address before it can be mounted to the verifier.
    verifyDecodedEvidenceArtifact(
      decodedDirectory,
      receipt.contentSha256,
      receipt.byteLength,
      durableClaim.claim.limits.maxFileBytes,
    );
    entries.push(Object.freeze(entry));
  }

  assertCurrentFence(
    input.settlementRef,
    durableClaim.claim.fenceTokenHash,
  );
  const manifest: CrossVerifyEvidenceManifestV1 = {
    ...input.settlementRef,
    brokerVersion: CROSS_VERIFY_EVIDENCE_BROKER_VERSION,
    kind: 'cross-verify-evidence-manifest',
    state: 'captured',
    fenceTokenHash: durableClaim.claim.fenceTokenHash,
    claimSha256: durableClaim.claimSha256,
    totalByteLength,
    entries: Object.freeze(entries),
  };
  const envelope: CrossVerifyEvidenceReceiptEnvelopeV1 = {
    manifestSha256: sha256(canonicalJson(manifest)),
    manifest,
  };
  publishReceipt(
    authority.brokerDirectory,
    EVIDENCE_RECEIPT_FILE,
    envelope,
    CROSS_VERIFY_EVIDENCE_MAX_RECEIPT_BYTES,
    value => parseManifestEnvelope(
      value,
      input.settlementRef,
      durableClaim,
    ),
  );
  assertCurrentFence(
    input.settlementRef,
    durableClaim.claim.fenceTokenHash,
  );
  return readCrossVerifyEvidenceReceipt(
    input.projectRoot,
    input.settlementRef,
  );
}

export function readCrossVerifyVerdictReceipt(
  projectRoot: string,
  ref: TaskResultSettlementRefV1,
): CrossVerifyVerdictReceiptEnvelopeV1 {
  const authority = resolveAuthorityDirectories(projectRoot, ref, {
    createBroker: false,
    createBlobs: false,
  });
  const claim = readCrossVerifyEvidenceClaimReceipt(projectRoot, ref);
  const evidence = readCrossVerifyEvidenceReceipt(projectRoot, ref);
  const verdict = readReceipt(
    authority.brokerDirectory,
    VERDICT_RECEIPT_FILE,
    CROSS_VERIFY_EVIDENCE_MAX_RECEIPT_BYTES,
    false,
    value => parseVerdictEnvelope(value, ref, claim, evidence),
  );
  if (verdict === null) {
    throw new CrossVerifyEvidenceBrokerError(
      'CORRUPT_RECEIPT',
      'Cross-verify verdict receipt is absent',
    );
  }
  return verdict;
}

export function writeCrossVerifyVerdictReceiptAtomic(
  input: WriteCrossVerifyVerdictReceiptInput,
): CrossVerifyVerdictReceiptEnvelopeV1 {
  assertDigest(input.claimSha256, 'claimSha256');
  assertDigest(input.evidenceManifestSha256, 'evidenceManifestSha256');
  assertDigest(input.adjudicationReceiptSha256, 'adjudicationReceiptSha256');
  assertDigest(input.outputSha256, 'outputSha256');
  if (
    !Number.isSafeInteger(input.outputByteLength)
    || input.outputByteLength < 0
    || input.outputByteLength > CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'INVALID_INPUT',
      `Cross-verify raw output byte length must be between 0 and ${CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES}`,
    );
  }
  if (input.disposition !== dispositionForVerdict(input.effectiveVerdict)) {
    throw new CrossVerifyEvidenceBrokerError(
      'INVALID_INPUT',
      'Cross-verify host disposition does not match the effective verdict',
    );
  }
  const claim = readCrossVerifyEvidenceClaimReceipt(
    input.projectRoot,
    input.settlementRef,
  );
  const evidence = readCrossVerifyEvidenceReceipt(
    input.projectRoot,
    input.settlementRef,
  );
  if (
    input.claimSha256 !== claim.claimSha256
    || input.evidenceManifestSha256 !== evidence.manifestSha256
  ) {
    throw new CrossVerifyEvidenceBrokerError(
      'AUTHORITY_MISMATCH',
      'Cross-verify verdict input does not match the durable evidence chain',
    );
  }
  assertClosedSettlement(input.settlementRef);
  assertDurableFence(
    input.settlementRef,
    claim.claim.fenceTokenHash,
  );
  const receipt: CrossVerifyVerdictReceiptV1 = {
    ...input.settlementRef,
    brokerVersion: CROSS_VERIFY_EVIDENCE_BROKER_VERSION,
    kind: 'cross-verify-verdict-receipt',
    state: 'host-adjudicated',
    assurance: 'typed-host-adjudicated',
    fenceTokenHash: claim.claim.fenceTokenHash,
    claimSha256: claim.claimSha256,
    evidenceManifestSha256: evidence.manifestSha256,
    effectiveVerdict: input.effectiveVerdict,
    disposition: input.disposition,
    adjudicationReceiptSha256: input.adjudicationReceiptSha256,
    outputSha256: input.outputSha256,
    outputByteLength: input.outputByteLength,
  };
  const envelope: CrossVerifyVerdictReceiptEnvelopeV1 = {
    verdictReceiptSha256: sha256(canonicalJson(receipt)),
    receipt,
  };
  const authority = resolveAuthorityDirectories(
    input.projectRoot,
    input.settlementRef,
    { createBroker: false, createBlobs: false },
  );
  const persisted = publishReceipt(
    authority.brokerDirectory,
    VERDICT_RECEIPT_FILE,
    envelope,
    CROSS_VERIFY_EVIDENCE_MAX_RECEIPT_BYTES,
    value => parseVerdictEnvelope(
      value,
      input.settlementRef,
      claim,
      evidence,
    ),
  );
  // Post-publication re-check: the fence must still resolve to the same durable
  // claim identity after the write (anti-race). Durable, not active — the verdict
  // receipt is written after settlement closure retires the active claim.
  assertDurableFence(
    input.settlementRef,
    claim.claim.fenceTokenHash,
  );
  return persisted;
}
