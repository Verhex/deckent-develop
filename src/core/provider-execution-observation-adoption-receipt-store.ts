/**
 * Immutable, content-addressed authority for provider-observation adoption
 * receipts.  The store deliberately has no index or "latest" operation: an
 * exact receipt id and authenticated scope are required for every read.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  inspectProviderExecutionObservationAdoption,
  type ProviderExecutionObservationAdoptionBounds,
  type ProviderExecutionObservationAdoptionClock,
  type ProviderExecutionObservationAdoptionIds,
  type ProviderExecutionObservationAdoptionPlan,
  verifyProviderExecutionObservationAdoption,
} from './provider-execution-observation-adoption.js';

export const PROVIDER_EXECUTION_OBSERVATION_ADOPTION_RECEIPT_SCHEMA
  = 'deckent.provider-observation-adoption-receipt' as const;
export const PROVIDER_EXECUTION_OBSERVATION_ADOPTION_RECEIPT_VERSION = 1 as const;
export const PROVIDER_EXECUTION_OBSERVATION_ADOPTION_RECEIPT_MAX_DISCOVERY = 10_000;

const DOMAIN = 'deckent:provider-observation-adoption-receipt:v1\0';
const SCOPE_DOMAIN = 'deckent:provider-observation-adoption-scope:v1\0';
const HEX = /^[a-f0-9]{64}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const BASE32 = /^[a-z2-7]{52}$/u;
const FINAL_NAME = /^[a-f0-9]{64}\.json$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const STORE_COMPONENTS = ['.deckent', 'provider-observation-adoption', 'receipts', 'v1'] as const;

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

export type ProviderExecutionObservationAdoptionReceiptStoreErrorCode =
  | 'INVALID_SCOPE'
  | 'INVALID_PATH'
  | 'PATH_ESCAPE'
  | 'UNSAFE_LINK'
  | 'PERMISSION_DENIED'
  | 'UNSUPPORTED_FILESYSTEM'
  | 'INPUT_CHANGED'
  | 'SCHEMA_MISMATCH'
  | 'ROW_LIMIT_EXCEEDED'
  | 'LINEAGE_MISMATCH'
  | 'PLAN_MISMATCH'
  | 'INVALID_RECEIPT'
  | 'UNSUPPORTED_RECEIPT_VERSION'
  | 'RECEIPT_COLLISION'
  | 'RECEIPT_NOT_FOUND'
  | 'DISCOVERY_LIMIT_EXCEEDED'
  | 'DURABILITY_UNCONFIRMED';

export class ProviderExecutionObservationAdoptionReceiptStoreError extends Error {
  constructor(
    readonly code: ProviderExecutionObservationAdoptionReceiptStoreErrorCode,
    readonly role?: 'source' | 'target' | 'receipt',
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'ProviderExecutionObservationAdoptionReceiptStoreError';
  }
}

export interface ProviderExecutionObservationAdoptionReceiptScope {
  readonly environmentKey: string;
  readonly tenantKey: string;
}

export interface ProviderExecutionObservationAdoptionReceiptFileBinding {
  readonly projectRelativePath: string;
  readonly schemaVersion: 1;
  readonly byteLength: number;
  readonly contentDigest: string;
  readonly lineageDigest: string;
  readonly rowCount: number;
}

export interface ProviderExecutionObservationAdoptionReceiptTargetBinding {
  readonly projectRelativePath: string;
  readonly schemaVersion: 2;
  readonly byteLength: number;
  readonly contentDigest: string;
  readonly legacyLineageDigest: string;
  readonly legacyRowCount: number;
  readonly runOwnedRowCount: number;
  readonly totalRowCount: number;
}

export interface ProviderExecutionObservationAdoptionDurableReceipt {
  readonly schema: typeof PROVIDER_EXECUTION_OBSERVATION_ADOPTION_RECEIPT_SCHEMA;
  readonly version: typeof PROVIDER_EXECUTION_OBSERVATION_ADOPTION_RECEIPT_VERSION;
  readonly receiptId: string;
  readonly scope: ProviderExecutionObservationAdoptionReceiptScope;
  readonly source: ProviderExecutionObservationAdoptionReceiptFileBinding;
  readonly target: ProviderExecutionObservationAdoptionReceiptTargetBinding;
  readonly planDigest: string;
  readonly verifiedAt: string;
  readonly databaseMutation: 'none';
}

export interface ProviderExecutionObservationAdoptionReceiptStoreContext {
  readonly projectRoot: string;
  /** Authenticated, canonical deployment identifier; never persisted raw. */
  readonly environmentId: string;
  /** Authenticated, canonical tenant identifier; never persisted raw. */
  readonly tenantId: string;
}

export interface PublishProviderExecutionObservationAdoptionReceiptInput
  extends ProviderExecutionObservationAdoptionReceiptStoreContext {
  readonly plan: ProviderExecutionObservationAdoptionPlan;
  readonly clock: ProviderExecutionObservationAdoptionClock;
  readonly ids: ProviderExecutionObservationAdoptionIds;
  readonly bounds?: ProviderExecutionObservationAdoptionBounds;
}

export interface PublishProviderExecutionObservationAdoptionReceiptResult {
  readonly state: 'created' | 'existing-identical';
  readonly receipt: ProviderExecutionObservationAdoptionDurableReceipt;
  readonly projectRelativeReceiptPath: string;
}

export interface ReadProviderExecutionObservationAdoptionReceiptInput
  extends ProviderExecutionObservationAdoptionReceiptStoreContext {
  readonly receiptId: string;
  /** If supplied, require the current files to reproduce every receipt binding. */
  readonly fresh?: boolean;
  readonly expectedPlanDigest?: string;
  readonly bounds?: ProviderExecutionObservationAdoptionBounds;
}

function isArray(value: Json): value is readonly Json[] {
  return Array.isArray(value);
}

/** RFC-8785-compatible for the JSON value subset accepted by this schema. */
function canonical(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(',')}}`;
}

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function digestEqual(left: string, right: string): boolean {
  return HEX.test(left) && HEX.test(right)
    && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function base32(bytes: Buffer): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let accumulator = 0;
  let output = '';
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += alphabet[(accumulator >>> bits) & 31]!;
    }
  }
  if (bits !== 0) output += alphabet[(accumulator << (5 - bits)) & 31]!;
  return output;
}

function scopeIdentifier(kind: 'environment' | 'tenant', value: string): string {
  if (value.length === 0 || value !== value.normalize('NFC') || CONTROL.test(value)) {
    throw new ProviderExecutionObservationAdoptionReceiptStoreError('INVALID_SCOPE');
  }
  return base32(createHash('sha256').update(`${SCOPE_DOMAIN}${kind}\0${value}`).digest());
}

export function deriveProviderExecutionObservationAdoptionReceiptScope(input: {
  readonly environmentId: string;
  readonly tenantId: string;
}): ProviderExecutionObservationAdoptionReceiptScope {
  return Object.freeze({
    environmentKey: scopeIdentifier('environment', input.environmentId),
    tenantKey: scopeIdentifier('tenant', input.tenantId),
  });
}

function keys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index]);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function boundedCount(value: unknown): value is number {
  return safeInteger(value) && Number(value) <= 1_000_000;
}

function validRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.normalize('NFC')
    || value.startsWith('/') || value.includes('\\') || CONTROL.test(value)
    || /^[A-Za-z]:/u.test(value) || value.includes('://')) return false;
  const components = value.split('/');
  return components.every((component) => component !== '' && component !== '.' && component !== '..'
    && !component.includes(':') && !WINDOWS_RESERVED.test(component)
    && !component.endsWith('.') && !component.endsWith(' '));
}

function validIso(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function validateShape(value: unknown): asserts value is ProviderExecutionObservationAdoptionDurableReceipt {
  if (!record(value)) throw invalidReceipt();
  if (!Object.prototype.hasOwnProperty.call(value, 'version')
    || typeof value['version'] !== 'number' || !Number.isSafeInteger(value['version'])) {
    throw invalidReceipt();
  }
  if (value['version'] !== PROVIDER_EXECUTION_OBSERVATION_ADOPTION_RECEIPT_VERSION) {
    throw new ProviderExecutionObservationAdoptionReceiptStoreError('UNSUPPORTED_RECEIPT_VERSION', 'receipt');
  }
  if (!keys(value, ['schema', 'version', 'receiptId', 'scope', 'source', 'target', 'planDigest', 'verifiedAt', 'databaseMutation'])
    || value['schema'] !== PROVIDER_EXECUTION_OBSERVATION_ADOPTION_RECEIPT_SCHEMA
    || typeof value['receiptId'] !== 'string' || !SHA256.test(value['receiptId'])
    || typeof value['planDigest'] !== 'string' || !SHA256.test(value['planDigest'])
    || !validIso(value['verifiedAt']) || value['databaseMutation'] !== 'none') throw invalidReceipt();
  const scope = value['scope'];
  const source = value['source'];
  const target = value['target'];
  if (!record(scope) || !keys(scope, ['environmentKey', 'tenantKey'])
    || typeof scope['environmentKey'] !== 'string' || !BASE32.test(scope['environmentKey'])
    || typeof scope['tenantKey'] !== 'string' || !BASE32.test(scope['tenantKey'])) throw invalidReceipt();
  if (!record(source) || !keys(source, ['projectRelativePath', 'schemaVersion', 'byteLength', 'contentDigest', 'lineageDigest', 'rowCount'])
    || !validRelativePath(source['projectRelativePath']) || source['schemaVersion'] !== 1
    || !safeInteger(source['byteLength']) || typeof source['contentDigest'] !== 'string' || !SHA256.test(source['contentDigest'])
    || typeof source['lineageDigest'] !== 'string' || !SHA256.test(source['lineageDigest'])
    || !boundedCount(source['rowCount'])) throw invalidReceipt();
  if (!record(target) || !keys(target, ['projectRelativePath', 'schemaVersion', 'byteLength', 'contentDigest', 'legacyLineageDigest', 'legacyRowCount', 'runOwnedRowCount', 'totalRowCount'])
    || !validRelativePath(target['projectRelativePath']) || target['schemaVersion'] !== 2
    || !safeInteger(target['byteLength']) || typeof target['contentDigest'] !== 'string' || !SHA256.test(target['contentDigest'])
    || typeof target['legacyLineageDigest'] !== 'string' || !SHA256.test(target['legacyLineageDigest'])
    || !boundedCount(target['legacyRowCount']) || !boundedCount(target['runOwnedRowCount'])
    || !boundedCount(target['totalRowCount'])) throw invalidReceipt();
  if (source['projectRelativePath'] === target['projectRelativePath']
    || source['rowCount'] !== target['legacyRowCount']
    || source['lineageDigest'] !== target['legacyLineageDigest']
    || target['legacyRowCount'] + target['runOwnedRowCount'] !== target['totalRowCount']
    || target['totalRowCount'] > 1_000_000) throw invalidReceipt();
}

function invalidReceipt(cause?: unknown): ProviderExecutionObservationAdoptionReceiptStoreError {
  return new ProviderExecutionObservationAdoptionReceiptStoreError(
    'INVALID_RECEIPT', 'receipt', cause === undefined ? undefined : { cause },
  );
}

function receiptBody(receipt: Omit<ProviderExecutionObservationAdoptionDurableReceipt, 'receiptId'>): Json {
  return receipt as unknown as Json;
}

export function providerExecutionObservationAdoptionDurableReceiptId(
  receipt: Omit<ProviderExecutionObservationAdoptionDurableReceipt, 'receiptId'>,
): string {
  return `sha256:${sha256(`${DOMAIN}${canonical(receiptBody(receipt))}`)}`;
}

export function serializeProviderExecutionObservationAdoptionReceipt(
  receipt: ProviderExecutionObservationAdoptionDurableReceipt,
): Buffer {
  validateShape(receipt);
  const { receiptId, ...body } = receipt;
  if (providerExecutionObservationAdoptionDurableReceiptId(body) !== receiptId) throw invalidReceipt();
  return Buffer.from(canonical(receipt as unknown as Json), 'utf8');
}

export function parseProviderExecutionObservationAdoptionReceipt(
  bytes: Buffer | string,
): ProviderExecutionObservationAdoptionDurableReceipt {
  const buffer = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes;
  if (buffer.length === 0 || buffer.length > 64 * 1024 || buffer[0] === 0xef
    || !Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer)) throw invalidReceipt();
  let parsed: unknown;
  try { parsed = JSON.parse(buffer.toString('utf8')); } catch (error) { throw invalidReceipt(error); }
  validateShape(parsed);
  if (canonical(parsed as unknown as Json) !== buffer.toString('utf8')) throw invalidReceipt();
  const { receiptId, ...body } = parsed;
  if (providerExecutionObservationAdoptionDurableReceiptId(body) !== receiptId) throw invalidReceipt();
  return deepFreeze(parsed);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function relativePath(root: string, absolute: string, role: 'source' | 'target'): string {
  const value = relative(root, resolve(absolute)).split(sep).join('/');
  if (!validRelativePath(value)) {
    throw new ProviderExecutionObservationAdoptionReceiptStoreError('PATH_ESCAPE', role);
  }
  return value;
}

interface FileProof { readonly bytes: number; readonly digest: string; readonly dev: bigint; readonly ino: bigint }

function proveProjectFile(root: string, projectRelativePath: string, role: 'source' | 'target'): FileProof {
  if (!validRelativePath(projectRelativePath)) throw new ProviderExecutionObservationAdoptionReceiptStoreError('INVALID_PATH', role);
  let cursor = root;
  const components = projectRelativePath.split('/');
  for (let index = 0; index < components.length - 1; index += 1) {
    cursor = join(cursor, components[index]!);
    const entry = lstatSync(cursor);
    if (entry.isSymbolicLink()) throw new ProviderExecutionObservationAdoptionReceiptStoreError('UNSAFE_LINK', role);
    if (!entry.isDirectory()) throw new ProviderExecutionObservationAdoptionReceiptStoreError('INVALID_PATH', role);
  }
  const path = join(root, ...components);
  let fd: number;
  try { fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new ProviderExecutionObservationAdoptionReceiptStoreError(
      code === 'ELOOP' ? 'UNSAFE_LINK' : 'INVALID_PATH', role, { cause: error },
    );
  }
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new ProviderExecutionObservationAdoptionReceiptStoreError('INVALID_PATH', role);
    }
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < Number(before.size)) {
      const count = readSync(fd, buffer, 0, Math.min(buffer.length, Number(before.size) - position), position);
      if (count === 0) throw new ProviderExecutionObservationAdoptionReceiptStoreError('INPUT_CHANGED', role);
      hash.update(buffer.subarray(0, count));
      position += count;
    }
    const after = fstatSync(fd, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      throw new ProviderExecutionObservationAdoptionReceiptStoreError('INPUT_CHANGED', role);
    }
    return { bytes: Number(before.size), digest: hash.digest('hex'), dev: before.dev, ino: before.ino };
  } finally { closeSync(fd); }
}

function trustedRoot(projectRoot: string): string {
  if (!isAbsolute(projectRoot)) throw new ProviderExecutionObservationAdoptionReceiptStoreError('INVALID_PATH');
  const root = realpathSync(projectRoot);
  if (!statSync(root).isDirectory()) throw new ProviderExecutionObservationAdoptionReceiptStoreError('INVALID_PATH');
  return root;
}

function privateDirectory(path: string, create: boolean): void {
  try {
    if (create) mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  let entry;
  try { entry = lstatSync(path, { bigint: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ProviderExecutionObservationAdoptionReceiptStoreError('RECEIPT_NOT_FOUND', 'receipt');
    }
    throw error;
  }
  if (entry.isSymbolicLink()) throw new ProviderExecutionObservationAdoptionReceiptStoreError('UNSAFE_LINK', 'receipt');
  if (!entry.isDirectory()) throw new ProviderExecutionObservationAdoptionReceiptStoreError('INVALID_PATH', 'receipt');
  if ((entry.mode & 0o077n) !== 0n || (typeof process.getuid === 'function' && entry.uid !== BigInt(process.getuid()))) {
    throw new ProviderExecutionObservationAdoptionReceiptStoreError('PERMISSION_DENIED', 'receipt');
  }
}

/**
 * `.deckent/` is the shared project control directory, not the private receipt
 * store itself. Existing repositories intentionally expose it as 0755 so the
 * project toolchain can traverse/read public control-plane projections. Keep
 * that boundary owner-controlled and non-writable by group/other, while the
 * receipt subtree below it remains strictly 0700.
 */
function projectControlDirectory(root: string, create: boolean): string {
  const path = join(root, STORE_COMPONENTS[0]);
  try {
    if (create) mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  let entry;
  try { entry = lstatSync(path, { bigint: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ProviderExecutionObservationAdoptionReceiptStoreError('RECEIPT_NOT_FOUND', 'receipt');
    }
    throw error;
  }
  if (entry.isSymbolicLink()) throw new ProviderExecutionObservationAdoptionReceiptStoreError('UNSAFE_LINK', 'receipt');
  if (!entry.isDirectory()) throw new ProviderExecutionObservationAdoptionReceiptStoreError('INVALID_PATH', 'receipt');
  if ((process.platform !== 'win32' && (entry.mode & 0o022n) !== 0n)
    || (typeof process.getuid === 'function' && entry.uid !== BigInt(process.getuid()))) {
    throw new ProviderExecutionObservationAdoptionReceiptStoreError('PERMISSION_DENIED', 'receipt');
  }
  return path;
}

function storeDirectory(root: string, scope: ProviderExecutionObservationAdoptionReceiptScope, create: boolean): string {
  let cursor = projectControlDirectory(root, create);
  for (const component of [...STORE_COMPONENTS.slice(1), scope.environmentKey, scope.tenantKey]) {
    cursor = join(cursor, component);
    privateDirectory(cursor, create);
  }
  return cursor;
}

function fsyncDirectory(path: string): void {
  if (process.platform === 'win32') return;
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function writeComplete(fd: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(fd, bytes, offset, bytes.length - offset, null);
    if (written === 0) throw new ProviderExecutionObservationAdoptionReceiptStoreError('DURABILITY_UNCONFIRMED', 'receipt');
    offset += written;
  }
}

function readFinal(path: string, expectedId: string): {
  readonly receipt: ProviderExecutionObservationAdoptionDurableReceipt;
  readonly bytes: Buffer;
  readonly dev: bigint;
  readonly ino: bigint;
} {
  let fd: number;
  try { fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ProviderExecutionObservationAdoptionReceiptStoreError('RECEIPT_NOT_FOUND', 'receipt');
    }
    throw new ProviderExecutionObservationAdoptionReceiptStoreError('INVALID_RECEIPT', 'receipt', { cause: error });
  }
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size > 64n * 1024n || (before.mode & 0o077n) !== 0n
      || (typeof process.getuid === 'function' && before.uid !== BigInt(process.getuid()))) throw invalidReceipt();
    const bytes = Buffer.alloc(Number(before.size));
    let position = 0;
    while (position < bytes.length) {
      const count = readSync(fd, bytes, position, bytes.length - position, position);
      if (count === 0) throw invalidReceipt();
      position += count;
    }
    const after = fstatSync(fd, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw invalidReceipt();
    const receipt = parseProviderExecutionObservationAdoptionReceipt(bytes);
    if (receipt.receiptId !== expectedId) throw invalidReceipt();
    return { receipt, bytes, dev: before.dev, ino: before.ino };
  } finally { closeSync(fd); }
}

function normalizeDigest(value: string): string {
  return SHA256.test(value) ? value : `sha256:${value}`;
}

function buildReceipt(input: PublishProviderExecutionObservationAdoptionReceiptInput): ProviderExecutionObservationAdoptionDurableReceipt {
  const root = trustedRoot(input.projectRoot);
  const sourcePath = relativePath(root, input.plan.paths.v1PreimagePath, 'source');
  const targetPath = relativePath(root, input.plan.paths.currentDatabasePath, 'target');
  const sourceProof = proveProjectFile(root, sourcePath, 'source');
  const targetProof = proveProjectFile(root, targetPath, 'target');
  if (sourceProof.dev === targetProof.dev && sourceProof.ino === targetProof.ino) {
    throw new ProviderExecutionObservationAdoptionReceiptStoreError('INVALID_PATH');
  }
  const verified = verifyProviderExecutionObservationAdoption({
    plan: input.plan, clock: input.clock, ids: input.ids, bounds: input.bounds,
  });
  const afterSource = proveProjectFile(root, sourcePath, 'source');
  const afterTarget = proveProjectFile(root, targetPath, 'target');
  if (sourceProof.dev !== afterSource.dev || sourceProof.ino !== afterSource.ino
    || targetProof.dev !== afterTarget.dev || targetProof.ino !== afterTarget.ino
    || sourceProof.bytes !== afterSource.bytes || !digestEqual(sourceProof.digest, afterSource.digest)
    || targetProof.bytes !== afterTarget.bytes || !digestEqual(targetProof.digest, afterTarget.digest)
    || !digestEqual(verified.sourceDatabaseDigest, afterSource.digest)
    || !digestEqual(verified.targetDatabaseDigest, afterTarget.digest)) {
    throw new ProviderExecutionObservationAdoptionReceiptStoreError('INPUT_CHANGED');
  }
  const runOwnedRowCount = verified.extraRunOwnedRows.length;
  const body = {
    schema: PROVIDER_EXECUTION_OBSERVATION_ADOPTION_RECEIPT_SCHEMA,
    version: PROVIDER_EXECUTION_OBSERVATION_ADOPTION_RECEIPT_VERSION,
    scope: deriveProviderExecutionObservationAdoptionReceiptScope(input),
    source: {
      projectRelativePath: sourcePath, schemaVersion: 1 as const, byteLength: afterSource.bytes,
      contentDigest: `sha256:${afterSource.digest}`, lineageDigest: `sha256:${verified.sourceRowLineageDigest}`,
      rowCount: verified.adoptedLegacyRowCount,
    },
    target: {
      projectRelativePath: targetPath, schemaVersion: 2 as const, byteLength: afterTarget.bytes,
      contentDigest: `sha256:${afterTarget.digest}`,
      legacyLineageDigest: `sha256:${verified.adoptedLegacyRowLineageDigest}`,
      legacyRowCount: verified.adoptedLegacyRowCount, runOwnedRowCount,
      totalRowCount: verified.adoptedLegacyRowCount + runOwnedRowCount,
    },
    planDigest: normalizeDigest(verified.planDigest), verifiedAt: verified.verifiedAt,
    databaseMutation: 'none' as const,
  } satisfies Omit<ProviderExecutionObservationAdoptionDurableReceipt, 'receiptId'>;
  return deepFreeze({ ...body, receiptId: providerExecutionObservationAdoptionDurableReceiptId(body) });
}

export function publishProviderExecutionObservationAdoptionReceipt(
  input: PublishProviderExecutionObservationAdoptionReceiptInput,
): PublishProviderExecutionObservationAdoptionReceiptResult {
  const receipt = buildReceipt(input);
  const intended = serializeProviderExecutionObservationAdoptionReceipt(receipt);
  const root = trustedRoot(input.projectRoot);
  const directory = storeDirectory(root, receipt.scope, true);
  const hexId = receipt.receiptId.slice('sha256:'.length);
  const finalPath = join(directory, `${hexId}.json`);
  const temporaryPath = join(directory, `.receipt-${randomBytes(16).toString('hex')}.tmp`);
  let published = false;
  let temporaryIdentity: { readonly dev: bigint; readonly ino: bigint } | undefined;
  try {
    const fd = openSync(temporaryPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
    try {
      writeComplete(fd, intended);
      fsyncSync(fd);
      const entry = fstatSync(fd, { bigint: true });
      if (!entry.isFile() || entry.size !== BigInt(intended.length) || (entry.mode & 0o077n) !== 0n
        || (typeof process.getuid === 'function' && entry.uid !== BigInt(process.getuid()))) {
        throw new ProviderExecutionObservationAdoptionReceiptStoreError('DURABILITY_UNCONFIRMED', 'receipt');
      }
      temporaryIdentity = { dev: entry.dev, ino: entry.ino };
    } finally { closeSync(fd); }
    try { linkSync(temporaryPath, finalPath); published = true; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw new ProviderExecutionObservationAdoptionReceiptStoreError('UNSUPPORTED_FILESYSTEM', 'receipt', { cause: error });
      }
    }
    // The temporary inode was flushed before publication; now make the new
    // directory entry durable before trusting a read through its final name.
    fsyncDirectory(directory);
    let observed: ReturnType<typeof readFinal>;
    try { observed = readFinal(finalPath, receipt.receiptId); }
    catch (error) {
      if (!published && error instanceof ProviderExecutionObservationAdoptionReceiptStoreError) {
        throw new ProviderExecutionObservationAdoptionReceiptStoreError('RECEIPT_COLLISION', 'receipt');
      }
      throw error;
    }
    // A successful link must expose the exact inode that was flushed. Without
    // this binding, a same-process race could replace either pathname between
    // the no-replace publication and the validating read.
    if (published && temporaryIdentity !== undefined
      && (observed.dev !== temporaryIdentity.dev || observed.ino !== temporaryIdentity.ino)) {
      throw new ProviderExecutionObservationAdoptionReceiptStoreError('RECEIPT_COLLISION', 'receipt');
    }
    if (!observed.bytes.equals(intended)) {
      throw new ProviderExecutionObservationAdoptionReceiptStoreError('RECEIPT_COLLISION', 'receipt');
    }
    return Object.freeze({
      state: published ? 'created' : 'existing-identical', receipt: observed.receipt,
      projectRelativeReceiptPath: relative(root, finalPath).split(sep).join('/'),
    });
  } finally {
    // Never unlink an entry substituted at the temporary name after creation.
    // Leaving an ambiguous temporary artifact is safer than deleting bytes we
    // did not create; the final authority is never removed here.
    try {
      const entry = lstatSync(temporaryPath, { bigint: true });
      if (temporaryIdentity !== undefined && entry.isFile()
        && entry.dev === temporaryIdentity.dev && entry.ino === temporaryIdentity.ino) {
        unlinkSync(temporaryPath);
      }
    } catch { /* best-effort cleanup only */ }
  }
}

function verifyFresh(root: string, receipt: ProviderExecutionObservationAdoptionDurableReceipt,
  bounds?: ProviderExecutionObservationAdoptionBounds): void {
  const source = proveProjectFile(root, receipt.source.projectRelativePath, 'source');
  const target = proveProjectFile(root, receipt.target.projectRelativePath, 'target');
  if ((source.dev === target.dev && source.ino === target.ino)
    || source.bytes !== receipt.source.byteLength || target.bytes !== receipt.target.byteLength
    || `sha256:${source.digest}` !== receipt.source.contentDigest
    || `sha256:${target.digest}` !== receipt.target.contentDigest) {
    throw new ProviderExecutionObservationAdoptionReceiptStoreError('INPUT_CHANGED');
  }
  const inspection = inspectProviderExecutionObservationAdoption({
    v1PreimagePath: join(root, ...receipt.source.projectRelativePath.split('/')),
    currentDatabasePath: join(root, ...receipt.target.projectRelativePath.split('/')),
  }, bounds);
  if (`sha256:${inspection.sourceDatabaseDigest}` !== receipt.source.contentDigest
    || `sha256:${inspection.targetDatabaseDigest}` !== receipt.target.contentDigest
    || `sha256:${inspection.sourceRowLineageDigest}` !== receipt.source.lineageDigest
    || `sha256:${inspection.adoptedLegacyRowLineageDigest}` !== receipt.target.legacyLineageDigest
    || inspection.sourceRowCount !== receipt.source.rowCount
    || inspection.adoptedLegacyRowCount !== receipt.target.legacyRowCount
    || inspection.extraRunOwnedRows.length !== receipt.target.runOwnedRowCount) {
    throw new ProviderExecutionObservationAdoptionReceiptStoreError('LINEAGE_MISMATCH');
  }
}

export function readProviderExecutionObservationAdoptionReceipt(
  input: ReadProviderExecutionObservationAdoptionReceiptInput,
): ProviderExecutionObservationAdoptionDurableReceipt {
  if (!SHA256.test(input.receiptId)) throw invalidReceipt();
  const root = trustedRoot(input.projectRoot);
  const scope = deriveProviderExecutionObservationAdoptionReceiptScope(input);
  const directory = storeDirectory(root, scope, false);
  const hexId = input.receiptId.slice('sha256:'.length);
  const observed = readFinal(join(directory, `${hexId}.json`), input.receiptId).receipt;
  if (observed.scope.environmentKey !== scope.environmentKey || observed.scope.tenantKey !== scope.tenantKey) throw invalidReceipt();
  if (input.expectedPlanDigest !== undefined && normalizeDigest(input.expectedPlanDigest) !== observed.planDigest) {
    throw new ProviderExecutionObservationAdoptionReceiptStoreError('PLAN_MISMATCH');
  }
  if (input.fresh === true) verifyFresh(root, observed, input.bounds);
  return observed;
}

/** Bounded inventory for diagnostics only; entries are independently parsed and verified. */
export function discoverProviderExecutionObservationAdoptionReceipts(
  input: ProviderExecutionObservationAdoptionReceiptStoreContext & { readonly maxEntries?: number },
): readonly ProviderExecutionObservationAdoptionDurableReceipt[] {
  const maximum = input.maxEntries ?? PROVIDER_EXECUTION_OBSERVATION_ADOPTION_RECEIPT_MAX_DISCOVERY;
  if (!Number.isSafeInteger(maximum) || maximum < 1
    || maximum > PROVIDER_EXECUTION_OBSERVATION_ADOPTION_RECEIPT_MAX_DISCOVERY) {
    throw new ProviderExecutionObservationAdoptionReceiptStoreError('DISCOVERY_LIMIT_EXCEEDED');
  }
  const root = trustedRoot(input.projectRoot);
  const scope = deriveProviderExecutionObservationAdoptionReceiptScope(input);
  const directory = storeDirectory(root, scope, false);
  const names = readdirSync(directory);
  if (names.length > maximum) throw new ProviderExecutionObservationAdoptionReceiptStoreError('DISCOVERY_LIMIT_EXCEEDED');
  const receipts: ProviderExecutionObservationAdoptionDurableReceipt[] = [];
  for (const name of names.sort()) {
    if (!FINAL_NAME.test(name)) continue;
    const id = `sha256:${name.slice(0, 64)}`;
    const receipt = readFinal(join(directory, name), id).receipt;
    if (receipt.scope.environmentKey !== scope.environmentKey || receipt.scope.tenantKey !== scope.tenantKey) throw invalidReceipt();
    receipts.push(receipt);
  }
  return Object.freeze(receipts);
}

/** Small OO facade over the canonical functions; it retains no mutable authority. */
export class ProviderExecutionObservationAdoptionReceiptStore {
  constructor(private readonly context: ProviderExecutionObservationAdoptionReceiptStoreContext) {}

  publish(input: Omit<PublishProviderExecutionObservationAdoptionReceiptInput, keyof ProviderExecutionObservationAdoptionReceiptStoreContext>): PublishProviderExecutionObservationAdoptionReceiptResult {
    return publishProviderExecutionObservationAdoptionReceipt({ ...input, ...this.context });
  }

  read(input: Omit<ReadProviderExecutionObservationAdoptionReceiptInput, keyof ProviderExecutionObservationAdoptionReceiptStoreContext>): ProviderExecutionObservationAdoptionDurableReceipt {
    return readProviderExecutionObservationAdoptionReceipt({ ...input, ...this.context });
  }

  discover(maxEntries?: number): readonly ProviderExecutionObservationAdoptionDurableReceipt[] {
    return discoverProviderExecutionObservationAdoptionReceipts({ ...this.context, maxEntries });
  }
}
